"""
Servicio del módulo Prospector.

Orquesta la búsqueda de prospectos desde Google Maps (directo), Apollo.io y Apify,
los normaliza, califica y guarda en la BD evitando duplicados.
"""
import json
import anthropic
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.modules.prospector.apollo_client import ApolloClient
from app.modules.prospector.apify_client import ApifyClient
from app.modules.prospector.normalizer import normalizar_apollo, normalizar_apify, normalizar_gmaps
from app.modules.prospector.scorer import ProspectorScorer
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.models.pipeline import PipelineStage, PipelineCard
from app.models.tenant import Tenant
from app.core.config import settings


class ProspectorService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        # Leer claves del tenant (fallback a .env si no tiene)
        keys = self._get_tenant_keys()
        self.apollo = ApolloClient(api_key=keys.get("apollo_api_key"))
        self.apify = ApifyClient(api_key=keys.get("apify_api_key"))
        self.scorer = ProspectorScorer()

    def _get_tenant_keys(self) -> dict:
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        return tenant.api_keys or {} if tenant else {}

    async def buscar_apollo(
        self,
        filtros: dict,
        contexto_cliente: dict,
        calificar: bool = True,
    ) -> dict:
        """
        Busca prospectos en Apollo.io, los normaliza, califica y guarda.

        filtros: titles, locations, keywords, industry (ver ApolloClient)
        contexto_cliente: producto, nicho, industria del cliente
        calificar: si True, llama a Claude para dar score

        Devuelve resumen con totales.
        """
        respuesta = await self.apollo.search_people(filtros)
        personas = respuesta.get("people", []) or []

        guardados = 0
        duplicados = 0
        errores = 0

        for person in personas:
            try:
                p_dict = normalizar_apollo(person)
                guardado = await self._guardar_prospecto(p_dict, calificar, contexto_cliente)
                if guardado:
                    guardados += 1
                else:
                    duplicados += 1
            except Exception:
                errores += 1

        self.db.commit()

        return {
            "fuente": "apollo",
            "total_encontrados": len(personas),
            "guardados": guardados,
            "duplicados": duplicados,
            "errores": errores,
        }

    async def buscar_apify_social(
        self,
        keywords: list,
        location: str,
        contexto_cliente: dict,
        calificar: bool = True,
    ) -> dict:
        """
        Scrapes Facebook Groups con Apify, normaliza, califica y guarda.
        """
        items = await self.apify.scrape_facebook_groups(keywords=keywords, location=location)

        guardados = 0
        duplicados = 0
        errores = 0

        for item in items:
            try:
                p_dict = normalizar_apify(item, "facebook")
                guardado = await self._guardar_prospecto(p_dict, calificar, contexto_cliente)
                if guardado:
                    guardados += 1
                else:
                    duplicados += 1
            except Exception:
                errores += 1

        self.db.commit()

        return {
            "fuente": "apify_social",
            "total_encontrados": len(items),
            "guardados": guardados,
            "duplicados": duplicados,
            "errores": errores,
        }

    async def buscar_apify_maps(
        self,
        query: str,
        location: str,
        contexto_cliente: dict,
        calificar: bool = True,
    ) -> dict:
        """
        Scrapes Google Maps con Apify, normaliza, califica y guarda.
        """
        items = await self.apify.scrape_google_maps(query=query, location=location)

        guardados = 0
        duplicados = 0
        errores = 0

        for item in items:
            try:
                p_dict = normalizar_apify(item, "maps")
                guardado = await self._guardar_prospecto(p_dict, calificar, contexto_cliente)
                if guardado:
                    guardados += 1
                else:
                    duplicados += 1
            except Exception:
                errores += 1

        self.db.commit()

        return {
            "fuente": "apify_maps",
            "total_encontrados": len(items),
            "guardados": guardados,
            "duplicados": duplicados,
            "errores": errores,
        }

    async def _guardar_prospecto(
        self,
        p_dict: dict,
        calificar: bool,
        contexto_cliente: dict,
    ) -> bool:
        """
        Guarda un prospecto en la BD evitando duplicados.

        Deduplicación:
          - Si tiene linkedin_url, busca por linkedin_url + tenant_id
          - Si tiene email, busca por email + tenant_id

        Si score >= 60, lo agrega a la primera etapa del pipeline.

        Devuelve True si fue guardado, False si era duplicado.
        """
        # Deduplicación por LinkedIn
        linkedin_url = p_dict.get("linkedin_url")
        if linkedin_url:
            existente = (
                self.db.query(Prospect)
                .filter(
                    Prospect.tenant_id == self.tenant_id,
                    Prospect.linkedin_url == linkedin_url,
                )
                .first()
            )
            if existente:
                return False

        # Deduplicación por email
        email = p_dict.get("email")
        if email:
            existente = (
                self.db.query(Prospect)
                .filter(
                    Prospect.tenant_id == self.tenant_id,
                    Prospect.email == email,
                )
                .first()
            )
            if existente:
                return False

        # Calificar con Claude
        score = 0.0
        score_reason = ""
        if calificar:
            score, score_reason = await self.scorer.calificar_prospecto(p_dict, contexto_cliente)

        # Crear el Prospect
        prospect = Prospect(
            tenant_id=self.tenant_id,
            score=score,
            score_reason=score_reason,
            is_qualified=score >= 60,
            status=ProspectStatus.qualified if score >= 60 else ProspectStatus.new,
            **p_dict,
        )
        self.db.add(prospect)
        self.db.flush()

        # Si califica bien, poner en pipeline
        if score >= 60:
            primera_etapa = (
                self.db.query(PipelineStage)
                .filter(PipelineStage.tenant_id == self.tenant_id)
                .order_by(PipelineStage.order)
                .first()
            )
            if primera_etapa:
                card = PipelineCard(
                    tenant_id=self.tenant_id,
                    prospect_id=prospect.id,
                    stage_id=primera_etapa.id,
                )
                self.db.add(card)

        return True

    # ── Google Maps Directo ───────────────────────────────────────────────────

    async def buscar_google_maps_directo(
        self,
        query: str,
        location: str,
        contexto_cliente: dict,
        max_results: int = 40,
    ) -> dict:
        """
        Busca negocios en Google Maps usando la API de Places directamente.
        Detecta web_status, calcula score determinístico y guarda los nuevos.
        No usa Apify (que está roto). Solo requiere GOOGLE_MAPS_API_KEY.
        """
        from app.modules.prospector.gmaps_client import GoogleMapsProspectorClient
        client = GoogleMapsProspectorClient()
        items = await client.buscar_negocios(query, location, max_results=max_results)

        guardados = 0
        duplicados = 0
        errores = 0

        for item in items:
            try:
                p_dict = normalizar_gmaps(item)
                score = self._score_maps(item)
                p_dict["score"] = score
                p_dict["score_reason"] = self._razon_score_maps(item)

                # Dedup: primero por teléfono, luego por nombre+ciudad
                phone = p_dict.get("phone", "")
                if phone:
                    existente = (
                        self.db.query(Prospect)
                        .filter(
                            Prospect.tenant_id == self.tenant_id,
                            Prospect.phone == phone,
                        )
                        .first()
                    )
                    if existente:
                        duplicados += 1
                        continue
                else:
                    nombre = p_dict.get("company_name", "")
                    ciudad = p_dict.get("city", "")
                    if nombre and ciudad:
                        existente = (
                            self.db.query(Prospect)
                            .filter(
                                Prospect.tenant_id == self.tenant_id,
                                Prospect.company_name == nombre,
                                Prospect.city == ciudad,
                            )
                            .first()
                        )
                        if existente:
                            duplicados += 1
                            continue

                prospect = Prospect(
                    tenant_id=self.tenant_id,
                    is_qualified=score >= 60,
                    status=ProspectStatus.qualified if score >= 60 else ProspectStatus.new,
                    **p_dict,
                )
                self.db.add(prospect)
                guardados += 1

            except Exception:
                errores += 1

        self.db.commit()

        return {
            "fuente": "google_maps",
            "total_encontrados": len(items),
            "guardados": guardados,
            "duplicados": duplicados,
            "errores": errores,
        }

    def _score_maps(self, item: dict) -> float:
        """Score determinístico para resultados de Google Maps (sin Claude)."""
        web_status = item.get("web_status", "tiene_web")
        phone = item.get("phone", "")
        base = {"sin_web": 70, "solo_redes": 50, "tiene_web": 20}.get(web_status, 20)
        if phone:
            base += 15
        return float(min(100, base))

    def _razon_score_maps(self, item: dict) -> str:
        """Razón legible del score para resultados de Google Maps."""
        ws = item.get("web_status", "tiene_web")
        phone = item.get("phone", "")
        parts = {
            "sin_web": "No tiene sitio web — lead caliente para servicios digitales",
            "solo_redes": "Solo tiene redes sociales, sin web propia",
            "tiene_web": "Ya tiene sitio web propio",
        }
        razon = parts.get(ws, "")
        if phone:
            razon += ". Tiene teléfono de contacto"
        return razon

    # ── CRUD sobre prospectos existentes ─────────────────────────────────────

    def actualizar_notas(self, prospect_id: str, nuevas_notas: str) -> bool:
        """Actualiza las notas de un prospecto y guarda el historial."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            return False

        # Mover notas anteriores al historial (si cambiaron)
        history = json.loads(prospect.notes_history or "[]")
        if prospect.notes and prospect.notes.strip() != nuevas_notas.strip():
            history.append({
                "text": prospect.notes,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            history = history[-20:]  # Máximo 20 entradas

        prospect.notes = nuevas_notas
        prospect.notes_history = json.dumps(history)
        prospect.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return True

    def set_alarma(self, prospect_id: str, fecha: str, motivo: str) -> bool:
        """Establece o actualiza la alarma de seguimiento de un prospecto."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            return False
        prospect.alarma_fecha = (
            datetime.fromisoformat(fecha).replace(tzinfo=timezone.utc) if fecha else None
        )
        prospect.alarma_motivo = motivo or None
        self.db.commit()
        return True

    def excluir_prospecto(self, prospect_id: str) -> bool:
        """Marca un prospecto como excluido — no volverá a aparecer en búsquedas."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            return False
        prospect.excluido = True
        prospect.excluido_at = datetime.now(timezone.utc)
        prospect.status = ProspectStatus.disqualified
        self.db.commit()
        return True

    def restaurar_prospecto(self, prospect_id: str) -> bool:
        """Restaura un prospecto excluido — vuelve a aparecer en la lista."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            return False
        prospect.excluido = False
        prospect.excluido_at = None
        prospect.status = ProspectStatus.qualified if prospect.is_qualified else ProspectStatus.new
        self.db.commit()
        return True

    def llevar_a_pipeline(self, prospect_id: str) -> bool:
        """Agrega el prospecto a la primera etapa del pipeline del tenant."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            return False

        # Evitar duplicados en pipeline
        existing = (
            self.db.query(PipelineCard)
            .filter(
                PipelineCard.tenant_id == self.tenant_id,
                PipelineCard.prospect_id == prospect_id,
            )
            .first()
        )
        if existing:
            return True  # Ya está

        primera_etapa = (
            self.db.query(PipelineStage)
            .filter(PipelineStage.tenant_id == self.tenant_id)
            .order_by(PipelineStage.order)
            .first()
        )
        if not primera_etapa:
            return False

        card = PipelineCard(
            tenant_id=self.tenant_id,
            prospect_id=prospect_id,
            stage_id=primera_etapa.id,
        )
        self.db.add(card)
        prospect.status = ProspectStatus.qualified
        self.db.commit()
        return True

    async def generar_mensaje_ia(
        self,
        prospect_id: str,
        nicho: str,
        producto: str,
        notas: str,
    ) -> str:
        """
        Genera un mensaje de primer contacto por WhatsApp usando Claude Haiku.
        Lee el estado web, rubro y notas del prospecto para personalizarlo.
        """
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.tenant_id == self.tenant_id, Prospect.id == prospect_id)
            .first()
        )
        if not prospect:
            raise ValueError("Prospecto no encontrado")

        web_labels = {
            "sin_web": "no tiene sitio web propio",
            "solo_redes": "solo tiene redes sociales (sin web propia)",
            "tiene_web": "tiene sitio web propio",
        }
        web_info = web_labels.get(prospect.web_status or "tiene_web", "")
        notas_finales = notas or prospect.notes or "Sin notas adicionales"

        prompt = f"""Eres un experto en ventas en LATAM. Genera un mensaje de primer contacto por WhatsApp para este prospecto.

QUIÉN ERES:
- Vendes: {producto or "servicio digital"}
- Tu nicho: {nicho or "servicios para empresas"}

EL PROSPECTO:
- Empresa: {prospect.company_name}
- Rubro: {prospect.industry or "empresa local"}
- Ciudad: {prospect.city or ""}
- Estado web: {web_info}
- Tiene teléfono: {"Sí" if prospect.phone else "No"}
- Notas del vendedor: {notas_finales}

REGLAS DEL MENSAJE:
1. Máximo 3 líneas cortas (WhatsApp)
2. Personalizado con el nombre de la empresa
3. Si no tiene web: menciona esto sutilmente como oportunidad
4. Si solo tiene redes: menciona que podrías llevarlos más allá
5. Tono cálido, directo y humano — no robótico ni corporativo
6. Termina con una pregunta o CTA concreto
7. En español latinoamericano (tú, no usted)
8. Máximo 1-2 emojis

Devuelve SOLO el mensaje de WhatsApp, sin explicaciones."""

        ai_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = ai_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()

    # ── Listado y serialización ───────────────────────────────────────────────

    async def obtener_prospectos(
        self,
        modulo: str = None,
        solo_calificados: bool = False,
        score_minimo: float = 0,
        incluir_excluidos: bool = False,
        solo_excluidos: bool = False,
        pagina: int = 1,
        por_pagina: int = 50,
    ) -> dict:
        """Lista los prospectos del tenant con filtros y paginación."""
        query = self.db.query(Prospect).filter(Prospect.tenant_id == self.tenant_id)

        if modulo:
            query = query.filter(Prospect.source_module == modulo)
        if solo_calificados:
            query = query.filter(Prospect.is_qualified == True)
        if score_minimo > 0:
            query = query.filter(Prospect.score >= score_minimo)
        if solo_excluidos:
            query = query.filter(Prospect.excluido == True)
        elif not incluir_excluidos:
            query = query.filter(
                (Prospect.excluido == False) | (Prospect.excluido.is_(None))
            )

        total = query.count()
        prospectos = (
            query.order_by(Prospect.score.desc())
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
            .all()
        )

        # IDs que ya están en el pipeline (para marcar "in_pipeline")
        pipeline_ids = {
            c.prospect_id
            for c in self.db.query(PipelineCard.prospect_id)
            .filter(PipelineCard.tenant_id == self.tenant_id)
            .all()
        }

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "prospectos": [self._serializar(p, pipeline_ids) for p in prospectos],
        }

    def _serializar(self, p: Prospect, pipeline_ids: set = None) -> dict:
        return {
            "id": p.id,
            "company_name": p.company_name,
            "contact_name": p.contact_name,
            "contact_title": p.contact_title,
            "email": p.email,
            "phone": p.phone,
            "address": p.address,
            "website": p.website,
            "linkedin_url": p.linkedin_url,
            "city": p.city,
            "country": p.country,
            "industry": p.industry,
            "score": p.score,
            "score_reason": p.score_reason,
            "is_qualified": p.is_qualified,
            "status": p.status,
            "source": p.source,
            "source_module": p.source_module,
            "web_status": p.web_status,
            "source_url": p.source_url,
            "notes": p.notes,
            "notes_history": json.loads(p.notes_history or "[]"),
            "excluido": p.excluido or False,
            "alarma_fecha": p.alarma_fecha.isoformat() if p.alarma_fecha else None,
            "alarma_motivo": p.alarma_motivo,
            "in_pipeline": p.id in (pipeline_ids or set()),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
