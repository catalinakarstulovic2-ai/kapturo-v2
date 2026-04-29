"""
Servicio de Licitaciones.

Dos flujos principales:
  buscar_preview()      → muestra resultados en tabla (no guarda)
  guardar_licitacion()  → guarda una licitación específica como Prospect
  buscar_y_guardar()    → flujo batch para workers
"""
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
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
    return unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode()


# Aliases de región para normalizar distintas formas que devuelve la API de MP
_REGION_ALIASES: dict[str, list[str]] = {
    "metropolitana de santiago": ["region metropolitana", "metropolitana", "rm", "santiago"],
    "valparaiso":                ["v region", "valpo"],
    "biobio":                    ["viii region", "bio-bio", "bio bio", "concepcion"],
    "la araucania":              ["ix region", "araucania", "temuco"],
    "maule":                     ["vii region"],
    "los lagos":                 ["x region", "puerto montt"],
    "coquimbo":                  ["iv region"],
    "o'higgins":                 ["vi region", "ohiggins", "rancagua"],
    "nuble":                     ["xvi region"],
    "antofagasta":               ["ii region"],
    "tarapaca":                  ["i region", "iquique"],
    "atacama":                   ["iii region", "copiapo"],
    "los rios":                  ["xiv region", "valdivia"],
    "aysen":                     ["xi region", "aysen del general carlos ibanez"],
    "magallanes":                ["xii region", "punta arenas"],
    "arica y parinacota":        ["xv region", "arica"],
}

def _region_coincide(region_perfil: str, region_licit: str) -> bool:
    """Compara región del perfil con región de la licitación tolerando distintas formas."""
    rp = _norm(region_perfil)
    rl = _norm(region_licit)
    if rp in rl or rl in rp:
        return True
    # Buscar por aliases
    for canonical, aliases in _REGION_ALIASES.items():
        grupo = [canonical] + aliases
        rp_en_grupo = any(a in rp or rp in a for a in grupo)
        rl_en_grupo = any(a in rl or rl in a for a in grupo)
        if rp_en_grupo and rl_en_grupo:
            return True
    return False


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


def _calcular_fit_rapido(nombre_licit: str, categoria_licit: str, rubros_perfil: list[str], regiones_perfil: list[str], region_licit: str) -> dict:
    """
    Calcula un score de fit rápido (0-100) sin llamar a Claude.
    Compara los rubros del perfil (categorías UNSPSC de ChileCompra) contra
    la categoría real de la licitación y su nombre.
    """
    # Texto completo a buscar: nombre + categoría completa (ruta jerárquica)
    txt = _norm((nombre_licit or '') + ' ' + (categoria_licit or ''))
    match_rubros = 0
    rubro_match = ''

    sin_rubros_perfil = not rubros_perfil

    for rubro in rubros_perfil:
        r_norm = _norm(rubro)
        # Intentar match exacto primero (el rubro completo está en la categoría)
        if r_norm in txt:
            match_rubros += 1
            if not rubro_match:
                rubro_match = rubro
            continue
        # Si no, buscar coincidencia parcial: basta con que aparezca alguna
        # palabra clave del rubro (las significativas, > 4 chars)
        palabras = [p for p in r_norm.split() if len(p) > 4]
        if palabras and any(p in txt for p in palabras):
            match_rubros += 1
            if not rubro_match:
                rubro_match = rubro

    if sin_rubros_perfil:
        score_rubro = 50
    elif match_rubros == 0:
        score_rubro = 0
    elif match_rubros == 1:
        score_rubro = 55
    else:
        score_rubro = 75

    # Bonus por región (usando comparación tolerante a distintas formas)
    score_region = 0
    if regiones_perfil and region_licit:
        if any(_region_coincide(r, region_licit) for r in regiones_perfil):
            score_region = 20
    elif not regiones_perfil:
        score_region = 20

    fit = min(100, score_rubro + score_region)
    motivo = (
        "Perfil sin rubros configurados — configura tu Perfil IA para ver fit real" if sin_rubros_perfil
        else f"Categoría calza: {rubro_match}" if match_rubros > 0
        else "Sin coincidencia de categoría con tu perfil"
    )
    return {'fit_score': fit, 'fit_motivo': motivo, 'fit_rubro_match': match_rubros > 0}


class LicitacionesService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.mp_client = MercadoPublicoClient()
        self.scorer = LicitacionesScorer()

    def _get_tenant_keys(self) -> dict:
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        return tenant.api_keys or {} if tenant else {}

    def _get_perfil_contexto(self) -> dict:
        """Lee el perfil de empresa desde la BD para usarlo como contexto del scorer."""
        from app.models.tenant import TenantModule
        mod = self.db.query(TenantModule).filter(
            TenantModule.tenant_id == self.tenant_id,
            TenantModule.module.in_(["licitaciones", "licitador"]),
        ).first()
        if not mod or not mod.niche_config:
            return {}
        cfg = mod.niche_config
        rubros = cfg.get("rubros") or []
        regiones = cfg.get("regiones") or []
        return {
            "producto": cfg.get("descripcion") or "",
            "descripcion": cfg.get("descripcion") or "",
            "sector": ", ".join(rubros),
            "rubro": rubros[0] if rubros else "",
            "todos_rubros": rubros,
            "experiencia": str(cfg.get("experiencia_anos") or ""),
            "region_cliente": ", ".join(regiones),
            "todas_regiones": regiones,
            "razon_social": cfg.get("razon_social") or "",
            "certificaciones": cfg.get("certificaciones") or "",
            "diferenciadores": cfg.get("diferenciadores") or "",
            "monto_max_proyecto_uf": cfg.get("monto_max_proyecto_uf") or "",
        }

    # ─── PREVIEW — busca y muestra, no guarda ────────────────────────────

    async def buscar_preview(self, tipo: str, filtros: dict = None, pagina: int = 1,
                              rubros_perfil: list = None, regiones_perfil: list = None) -> dict:
        """
        Busca licitaciones y retorna para la tabla del frontend. No guarda nada.

        Paginado: 50 items por página. Fase 1 carga todos los códigos (rápido),
        Fase 2 carga detalles solo para la página solicitada (~50 llamadas).

        Filtros del frontend:
          - fecha_desde / fecha_hasta (YYYY-MM-DD): rango de fechas (max 180 días)
          - region: código numérico de región
          - tipo_licitacion: "LE", "LP", etc. — filtro sobre CodigoExterno
          - keyword: texto libre — pre-filtra sobre Nombre+Descripcion del listado
          - comprador: texto libre — filtra post-detalle en nombre del organismo
          - proveedor: texto libre — filtra post-detalle en nombre del adjudicado
        """
        import re
        POR_PAGINA = 50
        filtros = filtros or {}

        # Extraer filtros
        tipo_licitacion = filtros.pop("tipo_licitacion", None)
        keyword         = (filtros.pop("keyword", "") or "").strip().lower()
        comprador_txt   = (filtros.pop("comprador", "") or "").strip().lower()
        proveedor_txt   = (filtros.pop("proveedor", "") or "").strip().lower()
        fecha_desde     = filtros.pop("fecha_desde", None)
        fecha_hasta     = filtros.pop("fecha_hasta", None)
        region          = filtros.pop("region", None)

        fechas = list(reversed(_fechas_desde_rango(fecha_desde, fecha_hasta, max_dias=180)))
        estado = "adjudicada" if tipo == "licitador_b" else "publicada"

        # ── Fase 1: Obtener TODOS los items del listado (sin detalle) ──────
        list_sem = asyncio.Semaphore(20)  # máx 20 fechas en paralelo para no saturar la API

        async def fetch_lista(fecha: str) -> list[dict]:
            async with list_sem:
                todos = []
                pag = 1
                while True:
                    try:
                        resp = await self.mp_client.buscar_licitaciones(
                            fecha=fecha, estado=estado, region=region, pagina=pag
                        )
                        listado = resp.get("Listado", [])
                        if not listado:
                            break
                        todos.extend(listado)
                        if len(listado) < 10:
                            break
                        pag += 1
                        if pag > 10:
                            break
                    except Exception:
                        break
                return todos

        listas = await asyncio.gather(*[fetch_lista(f) for f in fechas])

        # Merge y deduplicar, conservando el objeto completo del listado
        codigos_vistos: set[str] = set()
        items_listado: list[dict] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in codigos_vistos:
                    codigos_vistos.add(cod)
                    items_listado.append(item)

        # ── Pre-filtros sobre datos del listado (sin cargar detalle) ───────

        # Filtro por tipo (se extrae del CodigoExterno: "xxxxxx-LP24" → "LP")
        if tipo_licitacion:
            def _tipo_cod(cod: str) -> str:
                m = re.search(r'-([A-Z][A-Z0-9]+)\d{2}$', cod or "")
                return m.group(1) if m else ""
            items_listado = [
                i for i in items_listado
                if _tipo_cod(i.get("CodigoExterno", "")) == tipo_licitacion
            ]

        # Filtro por keyword o, si no hay keyword, por rubros del perfil del tenant
        # Ambos usan matching parcial: basta con que aparezca UNA palabra clave
        terminos_busqueda: list[str] = []
        if keyword:
            terminos_busqueda = [r.strip() for r in keyword.split(",") if r.strip()]
        elif rubros_perfil:
            # Sin keyword explícito → pre-filtrar por los rubros configurados en el perfil
            terminos_busqueda = list(rubros_perfil)

        if terminos_busqueda:
            def _txt_listado(i: dict) -> str:
                return _norm((i.get("Nombre") or "") + " " + (i.get("Descripcion") or ""))
            def _match_listado(i: dict) -> bool:
                txt = _txt_listado(i)
                for termino in terminos_busqueda:
                    t_norm = _norm(termino)
                    palabras = [p for p in t_norm.split() if len(p) > 4]
                    if not palabras:
                        if t_norm in txt:
                            return True
                        continue
                    # Basta con que aparezca UNA palabra clave del término
                    if t_norm in txt or any(p in txt for p in palabras):
                        return True
                return False
            items_listado = [i for i in items_listado if _match_listado(i)]

        # ── Rubros counts desde listado (rápido, cubre todas las páginas) ──
        catalogo_rubros = self.mp_client.obtener_catalogo()["rubros"]
        rubros_counts: dict[str, int] = {}
        for rubro in catalogo_rubros:
            r_norm = _norm(rubro)
            palabras = [p for p in r_norm.split() if len(p) > 2]
            count = 0
            for it in items_listado:
                txt = _norm((it.get("Nombre") or "") + " " + (it.get("Descripcion") or ""))
                if any(p in txt for p in palabras) or r_norm in txt:
                    count += 1
            if count > 0:
                rubros_counts[rubro] = count

        # ── Paginación ─────────────────────────────────────────────────────
        total_disponible = len(items_listado)
        total_paginas = max(1, (total_disponible + POR_PAGINA - 1) // POR_PAGINA)
        pagina = max(1, min(pagina, total_paginas))

        inicio = (pagina - 1) * POR_PAGINA
        items_pagina = items_listado[inicio:inicio + POR_PAGINA]
        codigos_pagina = [i.get("CodigoExterno") for i in items_pagina]
        # Fallback: si el detalle falla usamos los datos mínimos del listado
        listado_por_codigo = {i.get("CodigoExterno"): i for i in items_pagina}

        # ── Fase 2: Detalle solo para los ~50 items de la página actual ────
        sem = asyncio.Semaphore(5)  # max 5 paralelos — la API de MP es sensible a concurrencia alta

        async def fetch_detalle(cod: str) -> dict | None:
            async with sem:
                for intento in range(3):  # hasta 3 intentos con backoff
                    try:
                        return await self.mp_client.obtener_detalle(cod)
                    except Exception:
                        if intento < 2:
                            await asyncio.sleep(0.8 * (intento + 1))  # 0.8s, 1.6s
                            continue
                # Fallback: datos mínimos del listado para no perder el item
                return listado_por_codigo.get(cod)

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_pagina])
        detalles_ok = [d for d in detalles if d]

        # ── Normalizar ─────────────────────────────────────────────────────
        items = normalizar_para_preview({"Listado": detalles_ok}, tipo)

        # ── Filtros post-detalle (requieren datos completos) ────────────────
        if comprador_txt:
            items = [i for i in items if _norm(comprador_txt) in _norm(i.get("organismo", ""))]

        if proveedor_txt and tipo == "licitador_b":
            items = [
                i for i in items
                if _norm(proveedor_txt) in _norm(i.get("adjudicado_nombre", ""))
            ]

        # ── Cruzar con prospectos ya guardados ─────────────────────────────
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

        # ── Fit score rápido basado en rubros del perfil ───────────────────
        for item in items:
            if not item.get("prospect_id"):  # solo para las no guardadas aún
                fit_data = _calcular_fit_rapido(
                    item.get('nombre', ''),
                    item.get('categoria', ''),
                    rubros_perfil or [],
                    regiones_perfil or [],
                    item.get('region', ''),
                )
                item.update(fit_data)

        return {
            "total": total_disponible,
            "total_paginas": total_paginas,
            "total_disponible": total_disponible,
            "pagina": pagina,
            "licitaciones": items,
            "rubros_counts": rubros_counts,
        }

    # ─── GUARDAR INDIVIDUAL ───────────────────────────────────────────────

    async def guardar_licitacion(self, tipo: str, codigo: str, contexto_cliente: dict, calificar: bool = True) -> dict:
        """Obtiene el detalle y guarda una licitación específica como Prospect."""
        detalle = await self.mp_client.obtener_detalle(codigo)
        if not detalle:
            raise ValueError(f"No se encontró la licitación {codigo}")

        norm = LicitacionNormalizada(detalle, tipo)
        p_dict = norm.a_prospect_dict()

        # Detectar duplicado por código de licitación (clave única real)
        licitacion_codigo = p_dict.get("licitacion_codigo") or codigo
        if licitacion_codigo:
            existing = (
                self.db.query(Prospect)
                .filter(
                    Prospect.tenant_id == self.tenant_id,
                    Prospect.licitacion_codigo == licitacion_codigo,
                    Prospect.source_module == tipo,
                )
                .first()
            )
            if existing:
                return {"status": "duplicate", "prospect_id": existing.id}

        score, score_reason = 0.0, ""
        if calificar:
            # Si el frontend no mandó contexto, leerlo desde el perfil en BD
            if not any(contexto_cliente.values()) if contexto_cliente else True:
                contexto_cliente = self._get_perfil_contexto()
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
        except Exception as e:
            logger.warning(f"Auto-enriquecimiento falló para prospect {prospect.id}: {e}")

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
            except Exception as e:
                logger.warning(f"Enriquecimiento Apollo falló: {e}")

        # --- Fuente 3: Hunter.io — busca emails por dominio de la web ---
        if prospect.website and not enriched.get("email") and not prospect.email:
            try:
                hunter_key = keys.get("hunter") or settings.HUNTER_API_KEY
                if hunter_key:
                    import httpx as _hx
                    import re as _re
                    # Extraer dominio limpio de la URL
                    domain = _re.sub(r"https?://(www\.)?|/.*", "", prospect.website or "").strip()
                    if domain:
                        async with _hx.AsyncClient(timeout=15) as _hc:
                            hr = await _hc.get(
                                "https://api.hunter.io/v2/domain-search",
                                params={"domain": domain, "limit": 5, "api_key": hunter_key},
                            )
                            if hr.status_code == 200:
                                hdata = hr.json().get("data", {})
                                emails = hdata.get("emails", [])
                                # Tomar el primer email con mejor confianza
                                emails_sorted = sorted(emails, key=lambda e: e.get("confidence", 0), reverse=True)
                                if emails_sorted:
                                    top = emails_sorted[0]
                                    email_val = top.get("value")
                                    nombre = f"{top.get('first_name','')} {top.get('last_name','')}".strip()
                                    if email_val:
                                        enriched["email"] = email_val
                                        if nombre and not prospect.contact_name:
                                            enriched["contact_name"] = nombre
                                        enriched["enrichment_source"] = "Hunter"
            except Exception as e:
                logger.warning(f"Enriquecimiento Hunter (dominio) falló: {e}")

        # --- Fuente 4: Hunter por nombre empresa (si no hay web aún) ---
        if not enriched.get("email") and not prospect.email and prospect.company_name:
            try:
                hunter_key = keys.get("hunter") or settings.HUNTER_API_KEY
                if hunter_key:
                    import httpx as _hx
                    async with _hx.AsyncClient(timeout=15) as _hc:
                        hr2 = await _hc.get(
                            "https://api.hunter.io/v2/domain-search",
                            params={"company": prospect.company_name, "limit": 3, "api_key": hunter_key},
                        )
                        if hr2.status_code == 200:
                            hdata2 = hr2.json().get("data", {})
                            # Si encontró el dominio, guardar también la web
                            if hdata2.get("domain") and not prospect.website:
                                enriched["website"] = f"https://{hdata2['domain']}"
                            emails2 = sorted(hdata2.get("emails", []),
                                           key=lambda e: e.get("confidence", 0), reverse=True)
                            if emails2:
                                top2 = emails2[0]
                                email_val2 = top2.get("value")
                                nombre2 = f"{top2.get('first_name','')} {top2.get('last_name','')}".strip()
                                if email_val2:
                                    enriched["email"] = email_val2
                                    if nombre2 and not prospect.contact_name:
                                        enriched["contact_name"] = nombre2
                                    enriched["enrichment_source"] = "Hunter"
            except Exception as e:
                logger.warning(f"Enriquecimiento Hunter (empresa) falló: {e}")

        # ── Paso 5: RES API → socios/dueños → contact_name ───────────────────
        if prospect.rut and not prospect.contact_name and not enriched.get("contact_name"):
            try:
                res_data = await self._consultar_res(prospect.rut)
                if res_data.get("contact_name"):
                    enriched["contact_name"] = res_data["contact_name"]
                    enriched.setdefault("enrichment_source", "RES")
                if res_data.get("address") and not prospect.address and not enriched.get("address"):
                    enriched["address"] = res_data["address"]
            except Exception as e:
                logger.warning(f"Consulta RES API falló: {e}")

        # ── Paso 6: Apollo enrich_person → cargo del contacto ─────────────────
        email_enrich   = enriched.get("email") or prospect.email
        linkedin_enrich = prospect.linkedin_url
        if (email_enrich or linkedin_enrich) and not prospect.contact_title and not enriched.get("contact_title"):
            try:
                apollo_key_ep = keys.get("apollo") or settings.APOLLO_API_KEY
                if apollo_key_ep:
                    from app.modules.prospector.apollo_client import ApolloClient
                    apollo_ep = ApolloClient(api_key=apollo_key_ep)
                    person_data = await apollo_ep.enrich_person(
                        linkedin_url=linkedin_enrich,
                        email=email_enrich,
                    )
                    person = person_data.get("person") or {}
                    if person.get("title"):
                        enriched["contact_title"] = person["title"]
                        enriched["enrichment_source"] = "Apollo"
                    if not enriched.get("contact_name") and not prospect.contact_name:
                        fn = f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()
                        if fn:
                            enriched["contact_name"] = fn
                    phones = person.get("phone_numbers") or []
                    if phones and not prospect.phone and not enriched.get("phone"):
                        enriched["phone"] = phones[0].get("sanitized_number", "")
            except Exception as e:
                logger.warning(f"Enriquecimiento Apollo (persona) falló: {e}")

        # ── Paso 7: Historial Mercado Público → licitaciones_ganadas_count ─────
        if prospect.rut:
            try:
                count = await self._contar_historial_mp(prospect.rut)
                if count > 0:
                    enriched["licitaciones_ganadas_count"] = count
            except Exception as e:
                logger.warning(f"Historial Mercado Público falló: {e}")

        if enriched:
            for campo, valor in enriched.items():
                if valor is not None:
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
        except Exception as e:
            logger.warning(f"Scraping web SII falló: {e}")
        return {}

    async def _consultar_res(self, rut: str) -> dict:
        """
        Consulta el Registro de Empresas y Sociedades (Ministerio Economía) por RUT.
        Devuelve socios/representantes → útil para llenar contact_name sin Apollo.

        API: https://apis.registrodeempresas.economy.cl/empresa/{rut_sin_dv}
        """
        import httpx
        import re
        rut_limpio = re.sub(r"[.\-\s]", "", rut or "").strip().upper()
        if not rut_limpio or len(rut_limpio) < 2:
            return {}
        rut_numero = rut_limpio[:-1]  # sin dígito verificador
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://apis.registrodeempresas.economy.cl/empresa/{rut_numero}",
                    headers={"Accept": "application/json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    socios = (
                        data.get("socios")
                        or data.get("representantes")
                        or data.get("representantesLegales")
                        or []
                    )
                    result = {}
                    if socios:
                        primer_socio = socios[0]
                        nombre = (
                            primer_socio.get("nombre")
                            or primer_socio.get("name")
                            or primer_socio.get("nombreCompleto")
                            or ""
                        ).strip()
                        if nombre:
                            result["contact_name"] = nombre
                    domicilio = (
                        data.get("domicilio")
                        or data.get("direccion")
                        or data.get("domicilioComercial")
                        or ""
                    )
                    if domicilio:
                        result["address"] = domicilio
                    return result
        except Exception as e:
            logger.warning(f"Consulta RES API (empresa) falló: {e}")
        return {}

    async def _contar_historial_mp(self, rut: str) -> int:
        """
        Cuenta cuántas licitaciones adjudicadas tiene este RUT en nuestra BD.
        Es un lower bound: solo cuenta lo que Kapturo ha indexado.
        Útil para el scorer: si ganó 10+ licitaciones, es un proveedor habitual del Estado.
        """
        rut_norm = (rut or "").strip()
        if not rut_norm:
            return 0
        return (
            self.db.query(Prospect)
            .filter(
                Prospect.rut == rut_norm,
                Prospect.source_module == "licitador_b",
            )
            .count()
        )

    # ─── BATCH ────────────────────────────────────────────────────────────
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
            # 'licitaciones' es alias de 'licitador_a'
            modulo_filtro = 'licitador_a' if modulo == 'licitaciones' else modulo
            query = query.filter(Prospect.source_module == modulo_filtro)
        if solo_calificados:
            query = query.filter(Prospect.is_qualified == True)
        if score_minimo > 0:
            query = query.filter(Prospect.score >= score_minimo)

        total = query.count()
        prospectos = query.order_by(Prospect.created_at.desc()).offset((pagina - 1) * por_pagina).limit(por_pagina).all()

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "items": [self._serializar(p) for p in prospectos],
        }

    def _serializar(self, p: Prospect) -> dict:
        return {
            "id": p.id,
            "company_name": p.company_name,
            "rut": p.rut,
            "contact_name": p.contact_name,
            "contact_title": p.contact_title,
            "email": p.email,
            "phone": p.phone,
            "website": p.website,
            "address": p.address,
            "city": p.city,
            "enrichment_source": p.enrichment_source,
            "licitaciones_ganadas_count": p.licitaciones_ganadas_count or 0,
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
            "postulacion_estado": p.postulacion_estado,
            "notes": p.notes,
            "documentos_ia": self._parse_documentos_ia(p.notes_history),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }

    def _parse_documentos_ia(self, notes_history_raw) -> list:
        """Parsea notes_history y retorna solo los registros con source='ia'."""
        if not notes_history_raw:
            return []
        try:
            import json
            items = json.loads(notes_history_raw) if isinstance(notes_history_raw, str) else notes_history_raw
            return [i for i in items if isinstance(i, dict) and i.get('source') == 'ia']
        except Exception:
            return []
