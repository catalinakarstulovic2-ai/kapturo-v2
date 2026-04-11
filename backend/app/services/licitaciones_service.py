"""
Servicio de Licitaciones.

Dos flujos principales:
  buscar_preview()      → muestra resultados en tabla (no guarda)
  guardar_licitacion()  → guarda una licitación específica como Prospect
  buscar_y_guardar()    → flujo batch para workers
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.modules.licitaciones.client import MercadoPublicoClient
from app.modules.licitaciones.normalizer import (
    LicitacionNormalizada,
    normalizar_respuesta_api,
    normalizar_para_preview,
)
from app.modules.licitaciones.scorer import LicitacionesScorer
from app.models.prospect import Prospect, ProspectStatus
from app.models.pipeline import PipelineStage, PipelineCard
from app.models.tenant import Tenant
from app.core.config import settings


import unicodedata

def _norm(s: str) -> str:
    """Normaliza texto: minúsculas + sin tildes para comparación robusta."""
    return unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()


def _fechas_desde_rango(fecha_desde: str | None, fecha_hasta: str | None, max_dias: int = 7) -> list[str]:
    """
    Convierte un rango YYYY-MM-DD → lista de fechas DDMMYYYY para la API.
    Limitado a max_dias días. Sin rango → ayer por defecto.
    """
    try:
        if fecha_desde:
            d_ini = datetime.strptime(fecha_desde, "%Y-%m-%d")
        else:
            d_ini = datetime.now() - timedelta(days=1)

        if fecha_hasta:
            d_fin = datetime.strptime(fecha_hasta, "%Y-%m-%d")
        else:
            d_fin = d_ini

        # Asegurarse de no pedir fechas futuras (la API rechaza hoy y futuro)
        ayer = datetime.now() - timedelta(days=1)
        d_fin = min(d_fin, ayer)
        d_ini = min(d_ini, d_fin)

        dias = (d_fin - d_ini).days + 1
        dias = min(dias, max_dias)

        return [
            (d_ini + timedelta(days=i)).strftime("%d%m%Y")
            for i in range(dias)
        ]
    except Exception:
        return [(datetime.now() - timedelta(days=1)).strftime("%d%m%Y")]


class LicitacionesService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.mp_client = MercadoPublicoClient()
        self.scorer = LicitacionesScorer()

    def _get_tenant_keys(self) -> dict:
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        return tenant.api_keys or {} if tenant else {}

    # ─── PREVIEW — busca y muestra, no guarda ────────────────────────────

    async def buscar_preview(self, tipo: str, filtros: dict = None, pagina: int = 1) -> dict:
        """
        Busca licitaciones y retorna para la tabla del frontend. No guarda nada.

        Filtros del frontend que se pasan:
          - fecha_desde / fecha_hasta (YYYY-MM-DD): rango de fechas (max 30 días)
          - region: código numérico de región
          - tipo_licitacion: "LE", "LP", etc. — filtro client-side
          - keyword: texto libre — filtra en nombre de la licitación
          - comprador: texto libre — filtra en nombre del organismo
          - proveedor: texto libre — filtra en nombre del adjudicado (solo licitador_b)
        """
        filtros = filtros or {}

        # Extraer filtros client-side (no van a la API)
        tipo_licitacion = filtros.pop("tipo_licitacion", None)
        keyword         = (filtros.pop("keyword", "") or "").strip().lower()
        comprador_txt   = (filtros.pop("comprador", "") or "").strip().lower()
        proveedor_txt   = (filtros.pop("proveedor", "") or "").strip().lower()
        fecha_desde     = filtros.pop("fecha_desde", None)
        fecha_hasta     = filtros.pop("fecha_hasta", None)
        region          = filtros.get("region")

        fechas = list(reversed(_fechas_desde_rango(fecha_desde, fecha_hasta, max_dias=30)))  # más reciente primero
        estado = "adjudicada" if tipo == "licitador_b" else "publicada"

        # ── Paso 1: Obtener listas para cada fecha en paralelo ─────────────
        async def fetch_lista(fecha: str) -> list[dict]:
            try:
                resp = await self.mp_client.buscar_licitaciones(
                    fecha=fecha, estado=estado, region=region, pagina=pagina
                )
                return resp.get("Listado", [])
            except Exception:
                return []

        listas = await asyncio.gather(*[fetch_lista(f) for f in fechas])

        # Merge y deduplicar por CodigoExterno
        codigos_vistos: set[str] = set()
        codigos_ordenados: list[str] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in codigos_vistos:
                    codigos_vistos.add(cod)
                    codigos_ordenados.append(cod)

        # Limitar a 100 items para el preview (más recientes primero)
        codigos_preview = codigos_ordenados[:100]

        # ── Paso 2: Obtener detalle de cada item en paralelo ───────────────
        sem = asyncio.Semaphore(10)

        async def fetch_detalle(cod: str) -> dict | None:
            async with sem:
                try:
                    return await self.mp_client.obtener_detalle(cod)
                except Exception:
                    return None

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_preview])
        detalles_ok = [d for d in detalles if d]

        # ── Paso 3: Normalizar ─────────────────────────────────────────────
        items = normalizar_para_preview({"Listado": detalles_ok}, tipo)

        # ── Paso 4: Filtros client-side ────────────────────────────────────
        if tipo_licitacion:
            items = [i for i in items if i.get("tipo") == tipo_licitacion]

        total_disponible = len(items)  # total sin filtro de rubro

        # Calcular conteo por cada rubro del catálogo
        catalogo_rubros = self.mp_client.obtener_catalogo()["rubros"]
        rubros_counts: dict[str, int] = {}
        for rubro in catalogo_rubros:
            r_norm = _norm(rubro)
            palabras = [p for p in r_norm.split() if len(p) > 2]
            count = 0
            for it in items:
                txt = _norm(
                    (it.get("nombre") or "") + " " +
                    (it.get("descripcion") or "") + " " +
                    (it.get("categoria") or "")
                )
                if any(p in txt for p in palabras) or r_norm in txt:
                    count += 1
            if count > 0:
                rubros_counts[rubro] = count

        if keyword:
            # Soporte multi-keyword separado por comas (ej: "salud,educación")
            rubros = [r.strip() for r in keyword.split(",") if r.strip()]
            def _texto(i) -> str:
                return _norm(
                    (i.get("nombre") or "") + " " +
                    (i.get("descripcion") or "") + " " +
                    (i.get("categoria") or "")
                )
            def _match(i) -> bool:
                txt = _texto(i)
                for rubro in rubros:
                    r_norm = _norm(rubro)
                    # Buscar cada palabra del rubro (ignorar palabras <=2 chars)
                    palabras = [p for p in r_norm.split() if len(p) > 2]
                    if any(p in txt for p in palabras) or r_norm in txt:
                        return True
                return False
            items = [i for i in items if _match(i)]

        if comprador_txt:
            items = [i for i in items if comprador_txt in i.get("organismo", "").lower()]

        if proveedor_txt and tipo == "licitador_b":
            items = [
                i for i in items
                if proveedor_txt in i.get("adjudicado_nombre", "").lower()
            ]

        # ── Paso 5: Cruzar con prospectos ya guardados ─────────────────────
        for item in items:
            rut = item.get("adjudicado_rut") if tipo == "licitador_b" else item.get("organismo_rut")
            if rut:
                existing = (
                    self.db.query(Prospect)
                    .filter(
                        Prospect.tenant_id == self.tenant_id,
                        Prospect.rut == rut,
                        Prospect.source_module == tipo,
                    )
                    .first()
                )
                if existing:
                    item["prospect_id"] = existing.id
                    item["email"] = existing.email
                    item["phone"] = existing.phone
                    item["website"] = existing.website
                    item["address"] = existing.address
                    item["contact_name"] = existing.contact_name
                    item["enrichment_source"] = existing.enrichment_source
                    item["score"] = existing.score
                    item["score_reason"] = existing.score_reason

        return {"total": len(items), "total_disponible": total_disponible, "rubros_counts": rubros_counts, "pagina": pagina, "items": items}

    # ─── GUARDAR INDIVIDUAL ───────────────────────────────────────────────

    async def guardar_licitacion(self, tipo: str, codigo: str, contexto_cliente: dict, calificar: bool = True) -> dict:
        """Obtiene el detalle y guarda una licitación específica como Prospect."""
        detalle = await self.mp_client.obtener_detalle(codigo)
        if not detalle:
            raise ValueError(f"No se encontró la licitación {codigo}")

        norm = LicitacionNormalizada(detalle, tipo)
        p_dict = norm.a_prospect_dict()

        rut = norm.adjudicado_rut if tipo == "licitador_b" else norm.organismo_rut
        if rut:
            existing = (
                self.db.query(Prospect)
                .filter(Prospect.tenant_id == self.tenant_id, Prospect.rut == rut, Prospect.source_module == tipo)
                .first()
            )
            if existing:
                return {"status": "duplicate", "prospect_id": existing.id}

        score, score_reason = 0.0, ""
        if calificar:
            score, score_reason = await self.scorer.calificar_prospecto(p_dict, contexto_cliente)

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

        if score >= 60:
            await self._agregar_al_pipeline(prospect.id)

        self.db.commit()

        # Auto-enriquecer después de guardar
        enriquecimiento = {}
        try:
            enriquecimiento = await self.enriquecer_prospecto(prospect.id)
        except Exception:
            pass

        self.db.refresh(prospect)

        return {
            "status": "saved",
            "prospect_id": prospect.id,
            "score": score,
            "score_reason": score_reason,
            "email": prospect.email,
            "phone": prospect.phone,
            "website": prospect.website,
            "address": prospect.address,
            "contact_name": prospect.contact_name,
            "enrichment_source": prospect.enrichment_source,
        }

    # ─── ENRIQUECIMIENTO ──────────────────────────────────────────────────

    # ─── ENRIQUECIMIENTO PREVIEW (sin guardar) ─────────────────────────────

    async def buscar_contacto_preview(self, company_name: str) -> dict:
        """
        Busca datos de contacto de una empresa vía Google Maps
        SIN guardar nada en la BD. Solo para mostrar en la tabla.
        """
        import httpx as _httpx
        keys = self._get_tenant_keys()
        gmaps_key = keys.get("google_maps") or settings.GOOGLE_MAPS_API_KEY
        if not gmaps_key or not company_name:
            return {"found": False}
        try:
            query = f"{company_name} Chile"
            async with _httpx.AsyncClient(timeout=15) as client:
                fp = await client.get(
                    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                    params={"input": query, "inputtype": "textquery",
                            "fields": "place_id,name", "key": gmaps_key},
                )
                fp.raise_for_status()
                candidates = fp.json().get("candidates", [])
                if not candidates:
                    return {"found": False}
                place_id = candidates[0]["place_id"]
                pd = await client.get(
                    "https://maps.googleapis.com/maps/api/place/details/json",
                    params={"place_id": place_id,
                            "fields": "name,formatted_phone_number,website,formatted_address",
                            "key": gmaps_key},
                )
                pd.raise_for_status()
                result = pd.json().get("result", {})
                return {
                    "found": bool(result.get("formatted_phone_number") or result.get("website")),
                    "phone":   result.get("formatted_phone_number"),
                    "website": result.get("website"),
                    "address": result.get("formatted_address"),
                    "source":  "Google Maps",
                }
        except Exception:
            return {"found": False}

    # ─── ENRIQUECIMIENTO PERSISTIDO ────────────────────────────────────────

    async def enriquecer_prospecto(self, prospect_id: str) -> dict:
        """Busca datos de contacto via Apollo (org → people); fallback a SII público."""
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.id == prospect_id, Prospect.tenant_id == self.tenant_id)
            .first()
        )
        if not prospect:
            raise ValueError("Prospecto no encontrado")

        keys = self._get_tenant_keys()
        apollo_key = keys.get("apollo") or settings.APOLLO_API_KEY
        enriched = {}

        # ── 1) Google Places API ──────────────────────────────────────────────
        if not enriched and prospect.company_name:
            try:
                import httpx as _httpx
                import logging as _log
                _logger = _log.getLogger(__name__)
                gmaps_key = keys.get("google_maps") or settings.GOOGLE_MAPS_API_KEY
                if gmaps_key:
                    query = f"{prospect.company_name} Chile"
                    async with _httpx.AsyncClient(timeout=15) as client:
                        fp = await client.get(
                            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                            params={
                                "input": query,
                                "inputtype": "textquery",
                                "fields": "place_id,name",
                                "key": gmaps_key,
                            },
                        )
                        fp.raise_for_status()
                        fp_data = fp.json()
                        _logger.info(f"[GMaps] status={fp_data.get('status')} query={query}")
                        candidates = fp_data.get("candidates", [])
                        if candidates:
                            place_id = candidates[0]["place_id"]
                            pd = await client.get(
                                "https://maps.googleapis.com/maps/api/place/details/json",
                                params={
                                    "place_id": place_id,
                                    "fields": "name,formatted_phone_number,website,formatted_address",
                                    "key": gmaps_key,
                                },
                            )
                            pd.raise_for_status()
                            result = pd.json().get("result", {})
                            _logger.info(f"[GMaps] place={result.get('name')} phone={result.get('formatted_phone_number')} web={result.get('website')}")
                            if not prospect.phone and result.get("formatted_phone_number"):
                                enriched["phone"] = result["formatted_phone_number"]
                            if not prospect.website and result.get("website"):
                                enriched["website"] = result["website"]
                            if not prospect.address and result.get("formatted_address"):
                                enriched["address"] = result["formatted_address"]
                            if enriched:
                                enriched["enrichment_source"] = "Google Maps"
                        else:
                            _logger.info(f"[GMaps] sin candidatos para: {query}")
            except Exception as e:
                import logging as _log
                _log.getLogger(__name__).warning(f"[GMaps] error: {e}")

        # --- Fuente 2: Apollo búsqueda por organización ---
        if not enriched and prospect.company_name:
            try:
                apollo_key = keys.get("apollo") or settings.APOLLO_API_KEY
                if apollo_key:
                    from app.modules.prospector.apollo_client import ApolloClient
                    apollo = ApolloClient(api_key=apollo_key)
                    resultado = await apollo.search_organization(prospect.company_name)
                    orgs = resultado.get("organizations", [])
                    if orgs:
                        org = orgs[0]
                        if not prospect.website and org.get("website_url"):
                            enriched["website"] = org["website_url"]
                        if not prospect.phone and org.get("phone"):
                            enriched["phone"] = org["phone"]
                        if enriched:
                            enriched["enrichment_source"] = "Apollo"
            except Exception:
                pass

        # --- Fuente 3: SII por RUT (dirección + actividad) ---
        if not enriched and prospect.rut:
            try:
                sii_data = await self._consultar_sii(prospect.rut)
                if sii_data.get("domicilio") and not prospect.address:
                    enriched["address"] = sii_data["domicilio"]
                if sii_data.get("ciudad") and not prospect.city:
                    enriched["city"] = sii_data["ciudad"]
                if sii_data.get("razon_social") and not prospect.company_name:
                    enriched["company_name"] = sii_data["razon_social"]
                if enriched:
                    enriched["enrichment_source"] = "SII"
            except Exception:
                pass

        if enriched:
            for campo, valor in enriched.items():
                if valor:
                    setattr(prospect, campo, valor)
            self.db.commit()
            return {
                "status": "enriched",
                "source": enriched.get("enrichment_source"),
                "campos": [k for k in enriched if k != "enrichment_source"],
            }

        return {"status": "no_data", "prospect_id": prospect_id}

    async def _consultar_sii(self, rut: str) -> dict:
        """Consulta datos públicos en SII por RUT: domicilio, razón social, giro y comuna."""
        import httpx
        import re
        rut_limpio = re.sub(r"[.\-\s]", "", rut).strip().upper()
        if not rut_limpio or len(rut_limpio) < 2:
            return {}
        cuerpo, dv = rut_limpio[:-1], rut_limpio[-1]
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://zeus.sii.cl/cvc_cgi/stc/getstc",
                    data={"RUT": cuerpo, "DV": dv},
                )
                if resp.status_code == 200:
                    match = re.search(r"DOMICILIO[:\s]+([^\n<]+)", resp.text, re.IGNORECASE)
                    nombre_match = re.search(r"NOMBRE[:\s]+([^\n<]+)", resp.text, re.IGNORECASE)
                    actividad_match = re.search(r"ACTIVIDAD[:\s]+([^\n<]+)", resp.text, re.IGNORECASE)
                    ciudad_match = re.search(r"CIUDAD[:\s]+([^\n<]+)", resp.text, re.IGNORECASE)
                    result = {}
                    if match:
                        result["domicilio"] = match.group(1).strip()
                    if nombre_match:
                        result["razon_social"] = nombre_match.group(1).strip()
                    if actividad_match:
                        result["actividad"] = actividad_match.group(1).strip()
                    if ciudad_match:
                        result["ciudad"] = ciudad_match.group(1).strip()
                    return result
        except Exception:
            pass
        return {}

    # ─── BATCH ────────────────────────────────────────────────────────────

    async def buscar_y_guardar(self, tipo: str, contexto_cliente: dict, filtros: dict = None, calificar: bool = True) -> dict:
        """Flujo batch para workers o búsquedas masivas programadas."""
        filtros = filtros or {}
        fecha = (filtros.pop("fecha", None)
                 or (datetime.now() - timedelta(days=1)).strftime("%d%m%Y"))
        region = filtros.get("region")
        estado = "adjudicada" if tipo == "licitador_b" else "publicada"

        respuesta = await self.mp_client.buscar_licitaciones(
            fecha=fecha, estado=estado, region=region
        )
        codigos = [item.get("CodigoExterno") for item in respuesta.get("Listado", [])[:20] if item.get("CodigoExterno")]
        detalles = []
        for codigo in codigos:
            try:
                detalle = await self.mp_client.obtener_detalle(codigo)
                if detalle:
                    detalles.append(detalle)
            except Exception:
                continue

        prospectos_normalizados = normalizar_respuesta_api({"Listado": detalles}, tipo)
        guardados = duplicados = errores = 0

        for p_dict in prospectos_normalizados:
            try:
                if p_dict.get("rut"):
                    existente = (
                        self.db.query(Prospect)
                        .filter(Prospect.tenant_id == self.tenant_id, Prospect.rut == p_dict["rut"], Prospect.source_module == tipo)
                        .first()
                    )
                    if existente:
                        duplicados += 1
                        continue

                score, score_reason = 0.0, ""
                if calificar:
                    score, score_reason = await self.scorer.calificar_prospecto(p_dict, contexto_cliente)

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

                if score >= 60:
                    await self._agregar_al_pipeline(prospect.id)

                guardados += 1
            except Exception:
                errores += 1
                continue

        self.db.commit()
        return {"total_encontrados": len(prospectos_normalizados), "guardados": guardados, "duplicados": duplicados, "errores": errores}

    # ─── PIPELINE ─────────────────────────────────────────────────────────

    async def _agregar_al_pipeline(self, prospect_id: str):
        primera_etapa = (
            self.db.query(PipelineStage)
            .filter(PipelineStage.tenant_id == self.tenant_id)
            .order_by(PipelineStage.order)
            .first()
        )
        if primera_etapa:
            self.db.add(PipelineCard(tenant_id=self.tenant_id, prospect_id=prospect_id, stage_id=primera_etapa.id))

    # ─── PROSPECTOS GUARDADOS ─────────────────────────────────────────────

    async def obtener_prospectos(self, modulo: str = None, solo_calificados: bool = False, score_minimo: float = 0, pagina: int = 1, por_pagina: int = 50) -> dict:
        query = self.db.query(Prospect).filter(Prospect.tenant_id == self.tenant_id)
        if modulo:
            query = query.filter(Prospect.source_module == modulo)
        if solo_calificados:
            query = query.filter(Prospect.is_qualified == True)
        if score_minimo > 0:
            query = query.filter(Prospect.score >= score_minimo)

        total = query.count()
        prospectos = query.order_by(Prospect.score.desc()).offset((pagina - 1) * por_pagina).limit(por_pagina).all()
        return {"total": total, "pagina": pagina, "por_pagina": por_pagina, "prospectos": [self._serializar(p) for p in prospectos]}

    def _serializar(self, p: Prospect) -> dict:
        return {
            "id": p.id,
            "company_name": p.company_name,
            "rut": p.rut,
            "contact_name": p.contact_name,
            "email": p.email,
            "phone": p.phone,
            "website": p.website,
            "address": p.address,
            "city": p.city,
            "enrichment_source": p.enrichment_source,
            "score": p.score,
            "score_reason": p.score_reason,
            "is_qualified": p.is_qualified,
            "status": p.status,
            "source_module": p.source_module,
            "licitacion_codigo": p.licitacion_codigo,
            "licitacion_nombre": p.licitacion_nombre,
            "licitacion_monto": p.licitacion_monto,
            "licitacion_monto_adjudicado": p.licitacion_monto_adjudicado,
            "licitacion_organismo": p.licitacion_organismo,
            "licitacion_categoria": p.licitacion_categoria,
            "licitacion_region": p.licitacion_region,
            "licitacion_estado": p.licitacion_estado,
            "licitacion_fecha_adjudicacion": p.licitacion_fecha_adjudicacion,
            "licitacion_fecha_cierre": p.licitacion_fecha_cierre,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }

    async def buscar_y_guardar(
        self,
        tipo: str,                  # "licitador_a" o "licitador_b"
        contexto_cliente: dict,     # qué busca el cliente
        filtros: dict = None,       # región, categoría, monto mín/máx
        calificar: bool = True,     # si False, guarda sin score
    ) -> dict:
        """
        Flujo completo:
        1. Llama a Mercado Público según el tipo
        2. Normaliza los datos
        3. Califica con Claude (opcional)
        4. Guarda los prospectos nuevos en la BD
        5. Devuelve resumen
        """
        filtros = filtros or {}

        # 1. Buscar en Mercado Público
        if tipo == "licitador_b":
            respuesta = await self.mp_client.buscar_adjudicadas(**filtros)
        else:
            respuesta = await self.mp_client.buscar_licitaciones_abiertas(**filtros)

        # Para licitador_b: el listado solo trae campos básicos.
        # Hay que pedir el detalle de cada licitación para obtener el adjudicado.
        if tipo == "licitador_b":
            codigos = [item["CodigoExterno"] for item in respuesta.get("Listado", [])[:20]]
            detallados = []
            for codigo in codigos:
                try:
                    detalle = await self.mp_client.obtener_detalle(codigo)
                    if detalle:
                        detallados.append(detalle)
                except Exception:
                    continue
            respuesta["Listado"] = detallados

        # 2. Normalizar
        prospectos_normalizados = normalizar_respuesta_api(respuesta, tipo)

        guardados = 0
        duplicados = 0
        errores = 0

        for p_dict in prospectos_normalizados:
            try:
                # Evitar duplicados por RUT + tenant
                if p_dict.get("rut"):
                    existente = (
                        self.db.query(Prospect)
                        .filter(
                            Prospect.tenant_id == self.tenant_id,
                            Prospect.rut == p_dict["rut"],
                            Prospect.source_module == tipo,
                        )
                        .first()
                    )
                    if existente:
                        duplicados += 1
                        continue

                # 3. Calificar con Claude
                score = 0.0
                score_reason = ""
                if calificar:
                    score, score_reason = await self.scorer.calificar_prospecto(p_dict, contexto_cliente)

                # Limpiar el contexto antes de guardar (es solo para el scorer)
                context = p_dict.pop("_context", {})

                # 4. Crear el Prospect en la BD
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

                # 5. Si el score es bueno (>= 60), lo ponemos en el pipeline
                if score >= 60:
                    await self._agregar_al_pipeline(prospect.id)

                guardados += 1

            except Exception as e:
                errores += 1
                continue

        self.db.commit()

        return {
            "total_encontrados": len(prospectos_normalizados),
            "guardados": guardados,
            "duplicados": duplicados,
            "errores": errores,
            "calificados": guardados if calificar else 0,
        }

    async def _agregar_al_pipeline(self, prospect_id: str):
        """Agrega el prospecto a la primera etapa del pipeline del tenant."""
        primera_etapa = (
            self.db.query(PipelineStage)
            .filter(PipelineStage.tenant_id == self.tenant_id)
            .order_by(PipelineStage.order)
            .first()
        )
        if primera_etapa:
            card = PipelineCard(
                tenant_id=self.tenant_id,
                prospect_id=prospect_id,
                stage_id=primera_etapa.id,
            )
            self.db.add(card)

    async def obtener_prospectos(
        self,
        modulo: str = None,
        solo_calificados: bool = False,
        score_minimo: float = 0,
        pagina: int = 1,
        por_pagina: int = 50,
    ) -> dict:
        """Lista los prospectos guardados con filtros y paginación."""
        query = self.db.query(Prospect).filter(Prospect.tenant_id == self.tenant_id)

        if modulo:
            query = query.filter(Prospect.source_module == modulo)
        if solo_calificados:
            query = query.filter(Prospect.is_qualified == True)
        if score_minimo > 0:
            query = query.filter(Prospect.score >= score_minimo)

        total = query.count()
        prospectos = query.order_by(Prospect.score.desc()).offset((pagina - 1) * por_pagina).limit(por_pagina).all()

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "prospectos": [self._serializar(p) for p in prospectos],
        }

    def _serializar(self, p: Prospect) -> dict:
        return {
            "id": p.id,
            "company_name": p.company_name,
            "rut": p.rut,
            "contact_name": p.contact_name,
            "email": p.email,
            "phone": p.phone,
            "city": p.city,
            "score": p.score,
            "score_reason": p.score_reason,
            "is_qualified": p.is_qualified,
            "status": p.status,
            "source_module": p.source_module,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
