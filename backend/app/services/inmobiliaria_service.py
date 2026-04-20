"""
Servicio del módulo Inmobiliaria - Stack sin costo.

Pipeline:
  1. Google Maps  -> busca empresas del nicho (agencias, constructoras, etc.)
  2. Hunter.io    -> enriquece con email y contacto del equipo
  3. Claude Haiku -> califica según contexto del tenant (agent_config)

No requiere PDL ni Apify. Solo GOOGLE_MAPS_API_KEY + HUNTER_API_KEY + ANTHROPIC_API_KEY.
"""
import asyncio
import logging
from sqlalchemy.orm import Session
from app.modules.prospector.gmaps_client import GoogleMapsProspectorClient

logger = logging.getLogger(__name__)
from app.modules.prospector.hunter_client import HunterClient
from app.modules.prospector.normalizer import normalizar_gmaps
from app.modules.inmobiliaria.scorer import InmobiliariaScorer, SCORE_THRESHOLD
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.models.tenant import Tenant
from app.core.config import settings


DEFAULT_QUERIES = [
    "agencias inmobiliarias",
    "constructoras",
    "desarrolladores inmobiliarios",
    "inmobiliarias",
    "corredores de propiedades",
]


class InmobiliariaService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        keys = tenant.api_keys or {} if tenant else {}
        self.agent_config: dict = dict(tenant.agent_config or {}) if tenant else {}
        self.maps = GoogleMapsProspectorClient(
            api_key=keys.get("google_maps_api_key") or settings.GOOGLE_MAPS_API_KEY
        )
        self.hunter = HunterClient(
            api_key=keys.get("hunter_api_key") or settings.HUNTER_API_KEY
        )
        self.scorer = InmobiliariaScorer()

    async def ejecutar_busqueda(
        self,
        ubicacion: str = None,
        queries: list = None,
        max_por_query: int = 20,
        **kwargs,
    ) -> dict:
        """
        Ejecuta búsqueda completa:
          1. Google Maps con múltiples queries del nicho
          2. Hunter.io para enriquecer con email y contacto
          3. Claude para calificar
        """
        ubicacion = ubicacion or self.agent_config.get("ubicacion") or "Chile"
        queries_to_run = queries or self.agent_config.get("queries_maps") or DEFAULT_QUERIES

        stats = {q: {"total": 0, "calificados": 0, "duplicados": 0, "enriquecidos": 0}
                 for q in queries_to_run}

        # Lanzar todas las búsquedas Maps en paralelo
        search_tasks = [
            self.maps.buscar_negocios(query=q, location=ubicacion, max_results=max_por_query)
            for q in queries_to_run
        ]
        results_per_query = await asyncio.gather(*search_tasks, return_exceptions=True)

        for query, items in zip(queries_to_run, results_per_query):
            if isinstance(items, Exception):
                continue
            for item in items:
                stats[query]["total"] += 1
                try:
                    resultado = await self._procesar_item(item)
                    if resultado is None:
                        stats[query]["duplicados"] += 1
                    else:
                        if resultado["calificado"]:
                            stats[query]["calificados"] += 1
                        if resultado["enriquecido"]:
                            stats[query]["enriquecidos"] += 1
                except Exception as e:
                    logger.warning(f"Error procesando item de Google Maps: {e}")

        self.db.commit()

        total_raw          = sum(s["total"]        for s in stats.values())
        total_calificados  = sum(s["calificados"]  for s in stats.values())
        total_duplicados   = sum(s["duplicados"]   for s in stats.values())
        total_enriquecidos = sum(s["enriquecidos"] for s in stats.values())

        return {
            "total_raw":          total_raw,
            "total_calificados":  total_calificados,
            "total_duplicados":   total_duplicados,
            "total_guardados":    total_raw - total_duplicados,
            "total_enriquecidos": total_enriquecidos,
            "por_fuente": {
                q: {
                    "total":       s["total"],
                    "calificados": s["calificados"],
                    "duplicados":  s["duplicados"],
                }
                for q, s in stats.items()
            },
        }

    async def _procesar_item(self, item: dict):
        """
        Normaliza → deduplica → enriquece con Hunter → califica con Claude → guarda.
        Retorna None si duplicado, dict con resultado si guardado.
        """
        p_dict = normalizar_gmaps(item)
        p_dict["source_module"] = "inmobiliaria"

        if not await self._es_nuevo(p_dict):
            return None

        # Enriquecer con Hunter.io si tiene website
        enriched = False
        website = item.get("website", "")
        if website and item.get("web_status") != "sin_web":
            enrich = await self.hunter.enriquecer_prospecto(website)
            if enrich["enriched"]:
                if enrich["email"]:
                    p_dict["email"] = enrich["email"]
                if enrich["contact_name"]:
                    p_dict["contact_name"] = enrich["contact_name"]
                if enrich["contact_title"]:
                    p_dict["contact_title"] = enrich["contact_title"]
                if enrich["linkedin_url"]:
                    p_dict["linkedin_url"] = enrich["linkedin_url"]
                enriched = True

        # Calificar con Claude
        score, razon, tipo_lead, accion = await self.scorer.calificar(p_dict, config=self.agent_config)

        prospect = Prospect(
            tenant_id=self.tenant_id,
            score=score,
            score_reason=razon,
            is_qualified=score >= SCORE_THRESHOLD,
            status=ProspectStatus.qualified if score >= SCORE_THRESHOLD else ProspectStatus.new,
            **p_dict,
        )
        self.db.add(prospect)
        self.db.flush()

        return {"calificado": score >= SCORE_THRESHOLD, "enriquecido": enriched}

    async def _guardar(self, p_dict: dict):
        """Guarda un prospecto ya procesado en la BD."""
        # Campos que no existen en el modelo Prospect — los descartamos
        CAMPOS_EXTRA = {"fuente_inmobiliaria"}
        prospect = Prospect(
            tenant_id=self.tenant_id,
            **{k: v for k, v in p_dict.items() if k != "tenant_id" and k not in CAMPOS_EXTRA},
        )
        self.db.add(prospect)
        self.db.flush()

    async def _es_nuevo(self, p_dict: dict) -> bool:
        """True si el prospecto NO existe aún en la BD del tenant."""
        phone = p_dict.get("phone", "")
        if phone:
            existe = self.db.query(Prospect).filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.phone == phone,
            ).first()
            if existe:
                return False

        # Deduplicación para leads sociales: por contact_name + source
        contact_name = p_dict.get("contact_name", "")
        source = p_dict.get("source")
        # source puede llegar como string o como enum — normalizamos a string
        source_val = source.value if isinstance(source, ProspectSource) else str(source or "")
        if contact_name and source_val == ProspectSource.apify_social.value:
            existe = self.db.query(Prospect).filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.contact_name == contact_name,
                Prospect.source == ProspectSource.apify_social,
            ).first()
            if existe:
                return False

        nombre = p_dict.get("company_name", "")
        ciudad = p_dict.get("city", "")
        if nombre and ciudad:
            existe = self.db.query(Prospect).filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.company_name == nombre,
                Prospect.city == ciudad,
            ).first()
            if existe:
                return False

        return True
    async def buscar_fuentes(self, fuentes: list[tuple]) -> dict:
        """
        Ejecuta el scraping solo sobre la lista de fuentes indicada.
        fuentes: lista de (tipo, valor) donde tipo es:
          'hashtag', 'cuenta', 'fb_grupo', 'fb_pagina', 'youtube'
        Incluye delays aleatorios entre actores para evitar ban.
        """
        import random
        from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient
        from app.models.tenant import TenantModule

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()

        if not modulo or not modulo.niche_config:
            return {"error": "Modulo inmobiliaria sin configuracion"}

        cfg = modulo.niche_config
        client = SocialCommentsClient(intent_keywords=cfg.get("intent_keywords", []))
        todos = []

        for i, (tipo, valor) in enumerate(fuentes):
            # Para cron: delay aleatorio 3-10s anti-ban
            # Para manual (pocos fuentes): delay mínimo 1s
            if i > 0:
                # Delays más conservadores: mínimo 5s manual, hasta 15s en cron
                delay = random.uniform(5, 8) if len(fuentes) <= 12 else random.uniform(8, 15)
                await asyncio.sleep(delay)
            try:
                antes = len(todos)
                if tipo == "hashtag":
                    todos.extend(await client.hashtag_instagram(valor))
                elif tipo == "cuenta":
                    todos.extend(await client.instagram(valor))
                elif tipo == "fb_grupo":
                    todos.extend(await client.facebook_grupo(valor))
                elif tipo == "fb_pagina":
                    todos.extend(await client.facebook_pagina(valor))
                elif tipo == "youtube":
                    todos.extend(await client.youtube(valor))
                elif tipo == "tiktok_hashtag":
                    todos.extend(await client.tiktok_hashtag(valor))
                elif tipo == "tiktok_cuenta":
                    todos.extend(await client.tiktok_cuenta(valor))
                elif tipo == "ig_seguidores":
                    todos.extend(await client.instagram_seguidores(valor))
                nuevos = len(todos) - antes
                logger.info(f"Fuente {tipo}:{valor} → {nuevos} items (total acumulado: {len(todos)})")
            except Exception as e:
                logger.warning(f"Fuente {tipo}:{valor} falló: {e}")
                continue

        guardados = calificados = duplicados = 0

        for c in todos:
            texto_comentario = c.get("texto", "") or ""
            autor_url = c.get("autor_url", "") or ""
            p_dict = {
                "contact_name": c["autor_nombre"] or c["autor_username"],
                "company_name": f"Lead social — {c['fuente']}",
                "website": autor_url,
                "notes": texto_comentario,
                "signal_text": texto_comentario,  # FIX: el comentario real, no el nombre de fuente
                "fuente_inmobiliaria": c["fuente"],  # fuente separada del texto
                "source": ProspectSource.apify_social,
                "source_url": c["post_url"],
                "source_module": "inmobiliaria",
                "tenant_id": self.tenant_id,
            }
            # Guardar URL de perfil social para contacto directo
            if autor_url and ("instagram.com" in autor_url or "tiktok.com" in autor_url):
                p_dict["linkedin_url"] = autor_url  # usamos este campo para el link de perfil social

            if not await self._es_nuevo(p_dict):
                duplicados += 1
                continue

            # Descartar comentarios ruido (muy cortos y sin contacto)
            texto = p_dict.get("notes", "") or ""
            if len(texto.strip()) < 10 and not p_dict.get("email") and not p_dict.get("linkedin_url"):
                duplicados += 1
                continue

            try:
                score, razon, tipo_lead, accion = await self.scorer.calificar(p_dict, config={
                    "producto": cfg.get("producto", ""),
                    "nicho": cfg.get("nicho", ""),
                    "empresa": cfg.get("empresa", ""),
                    "comprador_ideal": cfg.get("comprador_ideal", ""),
                    "paises_objetivo": cfg.get("paises_objetivo", []),
                })
            except Exception as scorer_err:
                logger.warning(f"Scorer falló para {p_dict.get('contact_name')}: {scorer_err}")
                score, razon, tipo_lead, accion = 50.0, "Score pendiente (error en calificación)", "sin_clasificar", "revisar"

            p_dict["score"] = score
            p_dict["score_reason"] = f"{razon} | tipo: {tipo_lead} | accion: {accion}"
            p_dict["is_qualified"] = score >= 65
            p_dict["status"] = ProspectStatus.qualified if score >= 65 else ProspectStatus.new

            try:
                await self._guardar(p_dict)
                self.db.commit()
                guardados += 1
                if score >= 65:
                    calificados += 1
            except Exception as guardar_err:
                logger.error(f"Error guardando prospecto {p_dict.get('contact_name')}: {guardar_err}", exc_info=True)
                self.db.rollback()

        resultado = {
            "fuentes_corridas": len(fuentes),
            "total_encontrados": len(todos),
            "guardados": guardados,
            "calificados": calificados,
            "duplicados": duplicados,
        }
        logger.info(f"buscar_fuentes finalizado: {resultado}")
        return resultado

    async def buscar_linkedin_leads(self) -> dict:
        """
        Busca perfiles LinkedIn usando flujo de 2 fases:
          1. Google Search -> URLs de LinkedIn
          2. curious_coder -> datos reales del perfil
        Las queries se toman de niche_config.linkedin_queries o se usan defaults de Florida.
        """
        from app.modules.inmobiliaria.linkedin_client import LinkedInClient, DEFAULT_QUERIES_FLORIDA
        from app.models.tenant import TenantModule

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()

        if not modulo or not modulo.niche_config:
            return {"error": "Modulo inmobiliaria sin configuracion"}

        cfg = modulo.niche_config
        queries = cfg.get("linkedin_queries") or DEFAULT_QUERIES_FLORIDA

        client = LinkedInClient()
        perfiles = await client.buscar_perfiles_florida(queries=queries, max_por_query=8)

        guardados = calificados = duplicados = 0
        for perfil in perfiles:
            perfil["source_module"] = "inmobiliaria"
            perfil["tenant_id"] = self.tenant_id

            if not await self._es_nuevo(perfil):
                duplicados += 1
                continue

            score, razon, tipo_lead, accion = await self.scorer.calificar(perfil, config=self.agent_config)

            prospect = Prospect(
                tenant_id=self.tenant_id,
                score=score,
                score_reason=f"{razon} | tipo: {tipo_lead} | accion: {accion}",
                is_qualified=score >= SCORE_THRESHOLD,
                status=ProspectStatus.qualified if score >= SCORE_THRESHOLD else ProspectStatus.new,
                **{k: v for k, v in perfil.items() if k not in ("tenant_id", "source_module")},
            )
            self.db.add(prospect)
            self.db.flush()
            guardados += 1
            if score >= SCORE_THRESHOLD:
                calificados += 1

        self.db.commit()
        return {
            "perfiles_encontrados": len(perfiles),
            "guardados": guardados,
            "calificados": calificados,
            "duplicados": duplicados,
        }

    async def buscar_comentarios_sociales(self) -> dict:
        """Wrapper legacy — corre TODAS las fuentes (para tests manuales)."""
        from app.models.tenant import TenantModule
        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()
        if not modulo or not modulo.niche_config:
            return {"error": "Modulo inmobiliaria sin configuracion"}
        cfg = modulo.niche_config
        todas_fuentes = []
        # Máximo 6 hashtags IG (los más relevantes) — evitar ban por volumen
        for h in cfg.get("hashtags_instagram", [])[:6]:
            todas_fuentes.append(("hashtag", h))
        for c in cfg.get("cuentas_instagram", []):
            todas_fuentes.append(("cuenta", c))
        for g in cfg.get("grupos_facebook", []):
            todas_fuentes.append(("fb_grupo", g))
        for p in cfg.get("paginas_facebook", []):
            todas_fuentes.append(("fb_pagina", p))
        for v in cfg.get("videos_youtube", []):
            todas_fuentes.append(("youtube", v))
        # Máximo 6 hashtags TikTok — evitar ban por volumen
        for h in cfg.get("hashtags_tiktok", [])[:6]:
            todas_fuentes.append(("tiktok_hashtag", h))
        for c in cfg.get("cuentas_tiktok", []):
            todas_fuentes.append(("tiktok_cuenta", c))
        # ⚠️ instagram_seguidores DESACTIVADO — viola ToS de IG → causa bans
        return await self.buscar_fuentes(todas_fuentes)

    async def buscar_con_biblioteca_anuncios(self) -> dict:
        """
        Pipeline completo para Leo (Uperland):
        1. Meta Ad Library → obtiene URLs de anuncios de competidores/nicho
        2. Scraping de comentarios de cada anuncio
        3. Por cada comentarista con intención:
           a. Intenta obtener perfil público de Instagram/TikTok
           b. Si privado → busca en LinkedIn por nombre
           c. Enriquece con Hunter.io si tiene website
        4. Califica con Claude y guarda
        Además corre las fuentes sociales normales (hashtags, cuentas).
        """
        from app.models.tenant import TenantModule
        from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()

        if not modulo or not modulo.niche_config:
            return {"error": "Módulo inmobiliaria sin configuración"}

        cfg = modulo.niche_config
        client = SocialCommentsClient(intent_keywords=cfg.get("intent_keywords", []))

        # ── 1. Meta Ad Library ───────────────────────────────────────────────
        keywords_ads = cfg.get("ad_library_keywords") or [
            "terrenos en florida", "invertir en usa", "land for sale florida",
            "terrenos estados unidos", "inversión inmobiliaria usa",
        ]
        country = cfg.get("ad_library_country") or "US"

        ad_urls = await client.meta_ad_library(keywords=keywords_ads, country=country, max_ads=30)
        logger.info(f"Ad Library: {len(ad_urls)} URLs de anuncios encontradas")

        # ── 2. Comentarios de cada anuncio ───────────────────────────────────
        todos_comentarios: list[dict] = []

        for ad_url in ad_urls[:20]:  # Límite para no gastar Apify en exceso
            try:
                comentarios = await client.facebook_anuncio(ad_url)
                # Filtrar solo los que tienen intención real
                con_intencion = [c for c in comentarios if client.tiene_intencion(c.get("texto", ""))]
                todos_comentarios.extend(con_intencion)
                logger.info(f"Anuncio {ad_url}: {len(comentarios)} comentarios → {len(con_intencion)} con intención")
            except Exception as e:
                logger.warning(f"Error scrapeando anuncio {ad_url}: {e}")
            await asyncio.sleep(1)

        # ── 3. Fuentes sociales normales (hashtags, cuentas, TikTok) ─────────
        todas_fuentes = []
        for h in cfg.get("hashtags_instagram", []):
            todas_fuentes.append(("hashtag", h))
        for c in cfg.get("cuentas_instagram", []):
            todas_fuentes.append(("cuenta", c))
        for h in cfg.get("hashtags_tiktok", [])[:3]:
            todas_fuentes.append(("tiktok_hashtag", h))
        for c in cfg.get("cuentas_tiktok", [])[:2]:
            todas_fuentes.append(("tiktok_cuenta", c))
        for g in cfg.get("grupos_facebook", []):
            todas_fuentes.append(("fb_grupo", g))
        for v in cfg.get("videos_youtube", []):
            todas_fuentes.append(("youtube", v))

        if todas_fuentes:
            resultado_fuentes = await self.buscar_fuentes(todas_fuentes)
            guardados_fuentes = resultado_fuentes.get("guardados", 0)
            calificados_fuentes = resultado_fuentes.get("calificados", 0)
        else:
            guardados_fuentes = calificados_fuentes = 0

        # ── 4. Procesar comentaristas de anuncios con enriquecimiento ─────────
        guardados = calificados = duplicados = 0
        config_scorer = {
            "producto": cfg.get("producto", ""),
            "nicho": cfg.get("nicho", ""),
            "empresa": cfg.get("empresa", ""),
            "comprador_ideal": cfg.get("comprador_ideal", ""),
            "paises_objetivo": cfg.get("paises_objetivo", []),
        }

        for c in todos_comentarios:
            username = c.get("autor_username", "")
            nombre = c.get("autor_nombre", "") or username

            texto_comentario = c.get("texto", "") or ""
            autor_url = c.get("autor_url", "") or ""
            p_dict = {
                "contact_name": nombre,
                "company_name": f"Lead anuncio — {c.get('fuente', 'meta_ads')}",
                "website": autor_url,
                "notes": texto_comentario,
                "signal_text": texto_comentario,  # FIX: el comentario real
                "fuente_inmobiliaria": c.get("fuente", "meta_ads"),
                "source": ProspectSource.apify_social,
                "source_url": c.get("post_url", ""),
                "source_module": "inmobiliaria",
                "tenant_id": self.tenant_id,
            }
            if autor_url and ("instagram.com" in autor_url or "tiktok.com" in autor_url):
                p_dict["linkedin_url"] = autor_url

            if not await self._es_nuevo(p_dict):
                duplicados += 1
                continue

            # Descartar comentarios ruido
            texto = p_dict.get("notes", "") or ""
            if len(texto.strip()) < 10 and not p_dict.get("email") and not p_dict.get("linkedin_url"):
                duplicados += 1
                continue

            # Intentar enriquecer el perfil del comentarista
            if username:
                perfil_ig = await client.perfil_instagram_publico(username)
                if perfil_ig:
                    # Perfil público → datos del perfil
                    p_dict["contact_name"] = perfil_ig.get("nombre") or nombre
                    p_dict["notes"] = f"{c.get('texto', '')} | Bio: {perfil_ig.get('bio', '')}".strip(" |")
                    website = perfil_ig.get("website", "")
                    if website:
                        p_dict["website"] = website
                        # Enriquecer con Hunter si tiene web
                        try:
                            enrich = await self.hunter.enriquecer_prospecto(website)
                            if enrich.get("enriched"):
                                if enrich.get("email"):
                                    p_dict["email"] = enrich["email"]
                                if enrich.get("contact_name"):
                                    p_dict["contact_name"] = enrich["contact_name"]
                                if enrich.get("linkedin_url"):
                                    p_dict["linkedin_url"] = enrich["linkedin_url"]
                        except Exception:
                            pass
                else:
                    # Perfil privado → buscar en LinkedIn por nombre
                    if nombre and nombre != username:
                        pais_target = (cfg.get("paises_objetivo") or [""])[0]
                        perfil_li = await client.buscar_linkedin_por_nombre(nombre, pais=pais_target)
                        if perfil_li:
                            p_dict["contact_name"] = perfil_li.get("nombre") or nombre
                            p_dict["contact_title"] = perfil_li.get("titulo", "")
                            p_dict["company_name"] = perfil_li.get("empresa") or p_dict["company_name"]
                            p_dict["linkedin_url"] = perfil_li.get("linkedin_url", "")
                            p_dict["city"] = perfil_li.get("ubicacion", "")

            # Calificar y guardar
            try:
                score, razon, tipo_lead, accion = await self.scorer.calificar(p_dict, config=config_scorer)
            except Exception as e:
                logger.warning(f"Scorer falló: {e}")
                score, razon, tipo_lead, accion = 50.0, "Score pendiente", "sin_clasificar", "revisar"

            p_dict["score"] = score
            p_dict["score_reason"] = f"{razon} | tipo: {tipo_lead} | accion: {accion}"
            p_dict["is_qualified"] = score >= 65
            p_dict["status"] = ProspectStatus.qualified if score >= 65 else ProspectStatus.new

            try:
                await self._guardar(p_dict)
                self.db.commit()
                guardados += 1
                if score >= 65:
                    calificados += 1
            except Exception as e:
                logger.error(f"Error guardando lead de anuncio: {e}", exc_info=True)
                self.db.rollback()

            await asyncio.sleep(0.5)  # Suave throttle para no saturar APIs

        resultado = {
            "ad_urls_encontradas": len(ad_urls),
            "comentarios_con_intencion": len(todos_comentarios),
            "guardados_anuncios": guardados,
            "calificados_anuncios": calificados,
            "duplicados_anuncios": duplicados,
            "guardados_fuentes_sociales": guardados_fuentes,
            "calificados_fuentes_sociales": calificados_fuentes,
            "total_guardados": guardados + guardados_fuentes,
            "total_calificados": calificados + calificados_fuentes,
        }
        logger.info(f"buscar_con_biblioteca_anuncios finalizado: {resultado}")
        return resultado

    async def buscar_fuentes_rapido(self) -> dict:
        """
        Busqueda rapida con LinkedIn de 2 fases:
          1. Google Search -> URLs de LinkedIn (perfiles de altos cargos en Florida)
          2. curious_coder -> nombre, cargo, empresa, ubicacion reales
          3. Claude califica cada perfil y guarda los calificados
        """
        from app.models.tenant import TenantModule
        from app.modules.inmobiliaria.linkedin_client import LinkedInClient, DEFAULT_QUERIES_FLORIDA

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()
        if not modulo or not modulo.niche_config:
            return {"error": "Modulo inmobiliaria sin configuracion"}

        cfg = modulo.niche_config
        queries = cfg.get("linkedin_queries") or DEFAULT_QUERIES_FLORIDA

        logger.info(f"buscar_fuentes_rapido: iniciando LinkedIn con {len(queries)} queries")
        client = LinkedInClient()
        perfiles = await client.buscar_perfiles_florida(queries=queries, max_por_query=8)
        logger.info(f"buscar_fuentes_rapido: {len(perfiles)} perfiles encontrados")

        guardados = calificados = duplicados = 0
        for perfil in perfiles:
            perfil["source_module"] = "inmobiliaria"
            perfil["tenant_id"] = self.tenant_id

            if not await self._es_nuevo(perfil):
                duplicados += 1
                continue

            try:
                score, razon, tipo_lead, accion = await self.scorer.calificar(perfil, config={
                    "producto": cfg.get("producto", "terrenos en Florida"),
                    "empresa": cfg.get("empresa", ""),
                    "comprador_ideal": cfg.get("comprador_ideal", "CEO, founder o inversor con capital para real estate en Florida"),
                    "paises_objetivo": cfg.get("paises_objetivo", ["mexico", "colombia", "venezuela", "argentina", "chile", "peru", "usa"]),
                    "industrias_objetivo": cfg.get("industrias_objetivo", ["technology", "finance", "construction", "real estate", "healthcare", "energy"]),
                    "cargos_objetivo": cfg.get("cargos_objetivo", ["ceo", "founder", "owner", "president", "managing partner", "director", "investor"]),
                })
            except Exception as scorer_err:
                logger.warning(f"Scorer fallo para {perfil.get('contact_name')}: {scorer_err}")
                score, razon, tipo_lead, accion = 50.0, "Score pendiente", "sin_clasificar", "revisar"

            perfil["score"] = score
            perfil["score_reason"] = f"{razon} | tipo: {tipo_lead} | accion: {accion}"
            perfil["is_qualified"] = score >= 65
            perfil["status"] = ProspectStatus.qualified if score >= 65 else ProspectStatus.new
            try:
                await self._guardar(perfil)
                self.db.commit()
                guardados += 1
                if score >= 65:
                    calificados += 1
            except Exception as guardar_err:
                logger.error(f"Error guardando {perfil.get('contact_name')}: {guardar_err}", exc_info=True)
                self.db.rollback()

        resultado = {
            "fuente": "linkedin_2fases",
            "queries_usadas": len(queries),
            "perfiles_encontrados": len(perfiles),
            "guardados": guardados,
            "calificados": calificados,
            "duplicados": duplicados,
        }
        logger.info(f"buscar_fuentes_rapido finalizado: {resultado}")
        return resultado