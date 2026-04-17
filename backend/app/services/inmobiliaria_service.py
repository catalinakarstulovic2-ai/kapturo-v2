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
        prospect = Prospect(
            tenant_id=self.tenant_id,
            **{k: v for k, v in p_dict.items() if k != "tenant_id"},
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
        client = SocialCommentsClient()
        todos = []

        for i, (tipo, valor) in enumerate(fuentes):
            # Para cron: delay aleatorio 3-10s anti-ban
            # Para manual (pocos fuentes): delay mínimo 1s
            if i > 0:
                delay = random.uniform(1, 3) if len(fuentes) <= 10 else random.uniform(3, 10)
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
            p_dict = {
                "contact_name": c["autor_nombre"] or c["autor_username"],
                "company_name": f"Lead social — {c['fuente']}",
                "website": c["autor_url"],
                "notes": c["texto"],
                "source": ProspectSource.apify_social,
                "source_url": c["post_url"],
                "source_module": "inmobiliaria",
                "tenant_id": self.tenant_id,
            }

            if not await self._es_nuevo(p_dict):
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
        Busca perfiles LinkedIn usando las queries definidas en niche_config.
        Cada perfil se califica con Claude y se guarda como prospecto.
        """
        from app.modules.inmobiliaria.linkedin_client import LinkedInClient
        from app.models.tenant import TenantModule

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()

        if not modulo or not modulo.niche_config:
            return {"error": "Módulo inmobiliaria sin configuración"}

        cfg = modulo.niche_config
        queries = cfg.get("linkedin_queries") or []
        if not queries:
            return {"error": "No hay linkedin_queries en la configuración del módulo"}

        client = LinkedInClient()
        perfiles = await client.buscar_multiples(queries, max_por_query=20)

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
        for h in cfg.get("hashtags_instagram", []):
            todas_fuentes.append(("hashtag", h))
        for c in cfg.get("cuentas_instagram", []):
            todas_fuentes.append(("cuenta", c))
        for g in cfg.get("grupos_facebook", []):
            todas_fuentes.append(("fb_grupo", g))
        for p in cfg.get("paginas_facebook", []):
            todas_fuentes.append(("fb_pagina", p))
        for v in cfg.get("videos_youtube", []):
            todas_fuentes.append(("youtube", v))
        for h in cfg.get("hashtags_tiktok", []):
            todas_fuentes.append(("tiktok_hashtag", h))
        for c in cfg.get("cuentas_tiktok", []):
            todas_fuentes.append(("tiktok_cuenta", c))
        for c in cfg.get("competidores_instagram", []):
            todas_fuentes.append(("ig_seguidores", c))
        return await self.buscar_fuentes(todas_fuentes)

    async def buscar_fuentes_rapido(self) -> dict:
        """
        Búsqueda manual rápida: corre las mejores fuentes EN PARALELO.
        TikTok hashtags + cuentas TikTok → resultados en ~60s en vez de 30+ min.
        """
        from app.models.tenant import TenantModule
        from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient

        modulo = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module == "inmobiliaria",
            TenantModule.is_active == True,
        ).first()
        if not modulo or not modulo.niche_config:
            return {"error": "Modulo inmobiliaria sin configuracion"}

        cfg = modulo.niche_config
        client = SocialCommentsClient()

        # Las mejores fuentes: top 4 TikTok hashtags + top 2 cuentas TikTok
        hashtags_tt = cfg.get("hashtags_tiktok", [])[:4]
        cuentas_tt = cfg.get("cuentas_tiktok", [])[:2]

        tareas = []
        etiquetas = []
        for h in hashtags_tt:
            tareas.append(client.tiktok_hashtag(h))
            etiquetas.append(f"tiktok_hashtag:{h}")
        for c in cuentas_tt:
            tareas.append(client.tiktok_cuenta(c))
            etiquetas.append(f"tiktok_cuenta:{c}")

        resultados = await asyncio.gather(*tareas, return_exceptions=True)

        todos = []
        for etiqueta, res in zip(etiquetas, resultados):
            if isinstance(res, Exception):
                logger.warning(f"Fuente {etiqueta} falló: {res}")
            else:
                logger.info(f"Fuente {etiqueta} → {len(res)} items")
                todos.extend(res)

        logger.info(f"buscar_fuentes_rapido: {len(todos)} items totales de {len(tareas)} fuentes paralelas")

        guardados = calificados = duplicados = 0
        for c in todos:
            p_dict = {
                "contact_name": c["autor_nombre"] or c["autor_username"],
                "company_name": f"Lead social — {c['fuente']}",
                "website": c["autor_url"],
                "notes": c["texto"],
                "source": ProspectSource.apify_social,
                "source_url": c["post_url"],
                "source_module": "inmobiliaria",
                "tenant_id": self.tenant_id,
            }
            if not await self._es_nuevo(p_dict):
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
            try:
                await self._guardar(p_dict)
                self.db.commit()
                guardados += 1
                if score >= 65:
                    calificados += 1
            except Exception as guardar_err:
                logger.error(f"Error guardando prospecto {p_dict.get('contact_name')}: {guardar_err}", exc_info=True)
                self.db.rollback()

        resultado = {"fuentes": len(tareas), "total_encontrados": len(todos), "guardados": guardados, "calificados": calificados, "duplicados": duplicados}
        logger.info(f"buscar_fuentes_rapido finalizado: {resultado}")
        return resultado