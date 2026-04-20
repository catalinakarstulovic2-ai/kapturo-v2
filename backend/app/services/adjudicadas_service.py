"""
Servicio del módulo Adjudicadas.
Independiente del módulo Licitaciones — no modificar ese módulo.
"""
import re
import asyncio
from sqlalchemy.orm import Session
from app.modules.licitaciones.client import MercadoPublicoClient
from app.modules.licitaciones.normalizer import LicitacionNormalizada
from app.models.prospect import Prospect
from app.models.pipeline import PipelineStage, PipelineCard

# Mapeo de código de región → palabras clave para filtrar resultados
REGION_CODE_TO_KEYWORDS: dict[str, list[str]] = {
    "1":  ["tarapacá", "tarapaca"],
    "2":  ["antofagasta"],
    "3":  ["atacama"],
    "4":  ["coquimbo"],
    "5":  ["valparaíso", "valparaiso"],
    "6":  ["o'higgins", "ohiggins", "libertador"],
    "7":  ["maule"],
    "8":  ["biobío", "biobio"],
    "9":  ["araucanía", "araucania"],
    "10": ["los lagos"],
    "11": ["aysén", "aysen"],
    "12": ["magallanes"],
    "13": ["metropolitana", "santiago"],
    "14": ["los ríos", "los rios"],
    "15": ["arica", "parinacota"],
    "16": ["ñuble", "nuble"],
}

ETAPAS_DEFAULT = [
    {"name": "Sin contactar",       "color": "#6B7280", "order": 0, "is_won": False, "is_lost": False},
    {"name": "Contactado",          "color": "#3B82F6", "order": 1, "is_won": False, "is_lost": False},
    {"name": "Presupuesto enviado",  "color": "#F59E0B", "order": 2, "is_won": False, "is_lost": False},
    {"name": "En conversación",      "color": "#8B5CF6", "order": 3, "is_won": False, "is_lost": False},
    {"name": "Cierre",              "color": "#10B981", "order": 4, "is_won": True,  "is_lost": False},
    {"name": "No interesado",        "color": "#EF4444", "order": 5, "is_won": False, "is_lost": True},
]


class AdjudicadasService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.client = MercadoPublicoClient()

    # ── Etapas ───────────────────────────────────────────────────────────────

    def get_etapas(self):
        """Devuelve etapas del pipeline de adjudicadas. Las crea si no existen."""
        etapas = self.db.query(PipelineStage).filter(
            PipelineStage.tenant_id == self.tenant_id,
            PipelineStage.pipeline_type == "adjudicadas"
        ).order_by(PipelineStage.order).all()

        if not etapas:
            etapas = self._crear_etapas_default()

        return etapas

    def _crear_etapas_default(self):
        etapas = []
        for e in ETAPAS_DEFAULT:
            etapa = PipelineStage(
                tenant_id=self.tenant_id,
                pipeline_type="adjudicadas",
                **e
            )
            self.db.add(etapa)
            etapas.append(etapa)
        self.db.commit()
        return etapas

    def reset_etapas(self):
        """Reinicia las etapas a los valores por defecto.
        Mueve todas las tarjetas existentes a la primera etapa nueva."""
        etapas_viejas = self.db.query(PipelineStage).filter(
            PipelineStage.tenant_id == self.tenant_id,
            PipelineStage.pipeline_type == "adjudicadas"
        ).all()
        old_ids = [e.id for e in etapas_viejas]

        # Crear nuevas etapas primero
        nuevas: list[PipelineStage] = []
        for e in ETAPAS_DEFAULT:
            etapa = PipelineStage(
                tenant_id=self.tenant_id,
                pipeline_type="adjudicadas",
                **e
            )
            self.db.add(etapa)
            nuevas.append(etapa)
        self.db.flush()  # get IDs

        # Mover todas las cards a la primera etapa nueva
        if old_ids:
            self.db.query(PipelineCard).filter(
                PipelineCard.stage_id.in_(old_ids),
                PipelineCard.tenant_id == self.tenant_id
            ).update({"stage_id": nuevas[0].id}, synchronize_session=False)
            # Borrar etapas viejas
            for etapa in etapas_viejas:
                self.db.delete(etapa)

        self.db.commit()
        return nuevas

    # ── Búsqueda ─────────────────────────────────────────────────────────────

    def _fechas_rango(self, periodo_dias: int) -> list[str]:
        """Genera lista de fechas DDMMYYYY desde hace N días hasta ayer."""
        from datetime import datetime as dt, timedelta
        ayer = dt.now() - timedelta(days=1)
        return [
            (ayer - timedelta(days=i)).strftime("%d%m%Y")
            for i in range(min(periodo_dias, 180))
        ]

    async def buscar_adjudicadas(self, filtros: dict, pagina: int = 1):
        """Pestaña 1: filtra por keyword en listado, luego carga detalles de la página."""
        POR_PAGINA = 50
        periodo  = int(filtros.get("periodo") or 30)
        region   = filtros.get("region")
        fechas   = self._fechas_rango(periodo)
        keyword_raw = (filtros.get("keyword") or "").lower().strip()
        keywords = [k.strip() for k in keyword_raw.split(",") if k.strip()]

        # Fase 1: recolectar todos los items del listado (tienen CodigoExterno + Nombre)
        sem = asyncio.Semaphore(10)
        async def fetch_dia(fecha: str) -> list[dict]:
            async with sem:
                try:
                    resp = await self.client.buscar_adjudicadas(fecha=fecha, region=region)
                    return resp.get("Listado", [])
                except Exception:
                    return []

        listas = await asyncio.gather(*[fetch_dia(f) for f in fechas])

        # Deduplicar por código
        vistos: set = set()
        todos: list[dict] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in vistos:
                    vistos.add(cod)
                    todos.append(item)

        # Filtrar por keyword sobre Nombre del listado (sin necesitar detalle)
        if keywords:
            todos = [
                item for item in todos
                if any(kw in (item.get("Nombre") or "").lower() for kw in keywords)
            ]

        total = len(todos)
        inicio = (pagina - 1) * POR_PAGINA
        items_pagina = todos[inicio:inicio + POR_PAGINA]
        codigos_pagina = [i["CodigoExterno"] for i in items_pagina]

        # Fase 2: cargar detalles solo para la página actual
        sem2 = asyncio.Semaphore(20)
        async def fetch_detalle(codigo: str):
            async with sem2:
                try:
                    return await self.client.obtener_detalle(codigo)
                except Exception:
                    return None

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_pagina])
        detalles_ok = [d for d in detalles if d is not None]

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": POR_PAGINA,
            "resultados": self._normalizar_lista(detalles_ok, filtros),
        }

    async def buscar_por_adjudicarse(self, filtros: dict, pagina: int = 1):
        """
        Pestaña 2: licitaciones cerradas con cuadro de ofertas.
        Filtra por keyword en listado antes de cargar detalles.
        """
        POR_PAGINA = 50
        periodo  = int(filtros.get("periodo") or 30)
        region   = filtros.get("region")
        fechas   = self._fechas_rango(periodo)
        keyword_raw = (filtros.get("keyword") or "").lower().strip()
        keywords = [k.strip() for k in keyword_raw.split(",") if k.strip()]

        sem = asyncio.Semaphore(10)
        async def fetch_dia(fecha: str) -> list[dict]:
            async with sem:
                try:
                    resp = await self.client.buscar_licitaciones(estado="cerrada", fecha=fecha, region=region)
                    return resp.get("Listado", [])
                except Exception:
                    return []

        listas = await asyncio.gather(*[fetch_dia(f) for f in fechas])

        vistos: set = set()
        todos: list[dict] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in vistos:
                    vistos.add(cod)
                    todos.append(item)

        if keywords:
            todos = [
                item for item in todos
                if any(kw in (item.get("Nombre") or "").lower() for kw in keywords)
            ]

        total = len(todos)
        inicio = (pagina - 1) * POR_PAGINA
        codigos_pagina = [i["CodigoExterno"] for i in todos[inicio:inicio + POR_PAGINA]]

        sem2 = asyncio.Semaphore(20)
        async def fetch_detalle(codigo: str):
            async with sem2:
                try:
                    return await self.client.obtener_detalle(codigo)
                except Exception:
                    return None

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_pagina])

        con_ofertas = [
            d for d in detalles
            if d is not None and d.get("Ofertas", {}).get("Listado")
        ]

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": POR_PAGINA,
            "resultados": self._normalizar_lista(con_ofertas, filtros),
        }

    def _normalizar_lista(self, items: list, filtros: dict) -> list:
        monto_minimo = float(filtros.get("monto_minimo") or 0)
        region_code  = (filtros.get("region") or "").strip()
        region_keys  = REGION_CODE_TO_KEYWORDS.get(region_code, [])
        resultado = []
        for item in items:
            try:
                n = LicitacionNormalizada(item, tipo_busqueda="licitador_b")
                monto = n.monto_adjudicado or 0
                if monto < monto_minimo:
                    continue
                # Post-filtro de región sobre el texto devuelto por la API
                if region_keys:
                    reg_text = (n.region or "").lower()
                    if not any(kw in reg_text for kw in region_keys):
                        continue
                resultado.append({
                    "codigo":              n.codigo,
                    "nombre":              n.nombre,
                    "organismo":           n.organismo_nombre,
                    "region":              n.region,
                    "fecha_adjudicacion":  n.fecha_adjudicacion,
                    "rut_adjudicado":      n.adjudicado_rut,
                    "nombre_adjudicado":   n.adjudicado_nombre,
                    "monto_adjudicado":    monto,
                    "poliza_seriedad":     round(monto * 0.01, 0),
                    "poliza_cumplimiento": round(monto * 0.05, 0),
                })
            except Exception:
                continue
        return resultado

    # ── Por adjudicarse — desde caché ────────────────────────────────────────

    def get_por_adjudicarse_cached(self, filtros: dict, pagina: int = 1) -> dict:
        """
        Pestaña 'Por adjudicarse': lee desde licitaciones_cache (pre-cargado por Celery).
        - estado='publicada' → aún en plazo (cerrando próximamente)
        - Ordenado por fecha_cierre ASC (las que cierran antes, primero)
        """
        import json
        from datetime import date
        from app.models.licitacion_cache import LicitacionCache

        POR_PAGINA = 50
        hoy = str(date.today())

        q = self.db.query(LicitacionCache).filter(
            LicitacionCache.estado == "publicada",
            LicitacionCache.fecha_cierre >= hoy,
        )

        # Filtro keyword (coma-separado)
        keyword_raw = (filtros.get("keyword") or "").strip()
        for kw in [k.strip() for k in keyword_raw.split(",") if k.strip()]:
            q = q.filter(LicitacionCache.nombre.ilike(f"%{kw}%"))

        # Filtro región — busca por palabras clave del nombre de región
        region = filtros.get("region")
        if region:
            from sqlalchemy import or_
            region_keys = REGION_CODE_TO_KEYWORDS.get(region.strip(), [])
            if region_keys:
                q = q.filter(or_(*[LicitacionCache.region.ilike(f"%{kw}%") for kw in region_keys]))


        # Filtro monto mínimo
        monto_min = float(filtros.get("monto_minimo") or 0)
        if monto_min:
            q = q.filter(LicitacionCache.monto_estimado >= monto_min)

        total = q.count()
        items = (
            q.order_by(LicitacionCache.fecha_cierre.asc())
             .offset((pagina - 1) * POR_PAGINA)
             .limit(POR_PAGINA)
             .all()
        )

        resultados = []
        for item in items:
            ofertantes = []
            if item.ofertantes_json:
                try:
                    ofertantes = json.loads(item.ofertantes_json)
                except Exception:
                    pass

            resultados.append({
                "codigo":           item.codigo,
                "nombre":           item.nombre,
                "organismo":        item.organismo,
                "region":           item.region,
                "fecha_cierre":     item.fecha_cierre,
                "monto_estimado":   item.monto_estimado,
                "ofertantes":       ofertantes,
                "ofertantes_count": item.ofertantes_count or len(ofertantes),
            })

        return {
            "total":      total,
            "pagina":     pagina,
            "por_pagina": POR_PAGINA,
            "resultados": resultados,
        }

    async def buscar_por_adjudicarse_live(self, filtros: dict, pagina: int = 1) -> dict:
        """
        Fallback live para 'Por adjudicarse' cuando el caché está vacío.
        Busca licitaciones PUBLICADAS (aún en plazo) en los últimos N días.

        Fase 1: recolecta todos los códigos del listado (rápido).
        Fase 2: carga detalles completos solo para la página actual.
        Esto garantiza que organismo, región, monto y fechas estén completos.
        """
        from datetime import datetime as dt, timedelta, date as date_t

        POR_PAGINA  = 50
        periodo     = min(int(filtros.get("periodo") or 30), 60)
        region      = filtros.get("region")
        keyword_raw = (filtros.get("keyword") or "").lower().strip()
        keywords    = [k.strip() for k in keyword_raw.split(",") if k.strip()]
        monto_min   = float(filtros.get("monto_minimo") or 0)

        hoy = dt.now()
        fechas = [(hoy - timedelta(days=i)).strftime("%d%m%Y") for i in range(1, periodo + 1)]

        # ── Fase 1: recolectar lista de ítems (rápido, sin detalle) ─────
        sem = asyncio.Semaphore(8)

        async def fetch_dia(fecha: str) -> list[dict]:
            async with sem:
                try:
                    resp = await self.client.buscar_licitaciones(estado="publicada", fecha=fecha, region=region)
                    return resp.get("Listado", [])
                except Exception:
                    return []

        listas = await asyncio.gather(*[fetch_dia(f) for f in fechas])

        vistos: set = set()
        todos: list[dict] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in vistos:
                    vistos.add(cod)
                    todos.append(item)

        # Filtro keyword sobre Nombre del listado (ligero)
        if keywords:
            todos = [i for i in todos if any(kw in (i.get("Nombre") or "").lower() for kw in keywords)]

        total  = len(todos)
        inicio = (pagina - 1) * POR_PAGINA
        codigos_pagina = [i["CodigoExterno"] for i in todos[inicio:inicio + POR_PAGINA]]

        # ── Fase 2: cargar detalles completos para la página actual ──────
        sem2 = asyncio.Semaphore(5)

        async def fetch_detalle(codigo: str):
            async with sem2:
                for intento in range(3):
                    try:
                        return await self.client.obtener_detalle(codigo)
                    except Exception:
                        if intento < 2:
                            await asyncio.sleep(0.8 * (intento + 1))
                            continue
                return None

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_pagina])
        detalles_ok = [d for d in detalles if d is not None]

        # Normalizar con LicitacionNormalizada para extraer todos los campos
        region_keys = REGION_CODE_TO_KEYWORDS.get((region or "").strip(), [])
        hoy_str = date_t.today().isoformat()
        resultados_pagina = []

        for det in detalles_ok:
            try:
                n = LicitacionNormalizada(det, tipo_busqueda="licitador_a")
                # Solo las que aún no han cerrado
                if n.fecha_cierre and n.fecha_cierre < hoy_str:
                    continue
                # Post-filtro región sobre texto real devuelto por la API
                if region_keys:
                    reg_text = (n.region or "").lower()
                    if not any(kw in reg_text for kw in region_keys):
                        continue
                monto = n.monto or 0
                if monto_min and monto < monto_min:
                    continue
                resultados_pagina.append({
                    "codigo":                      n.codigo,
                    "nombre":                      n.nombre,
                    "organismo":                   n.organismo_nombre,
                    "organismo_rut":               n.organismo_rut,
                    "region":                      n.region,
                    "fecha_cierre":                n.fecha_cierre,
                    "fecha_estimada_adjudicacion": n.fecha_estimada_adjudicacion,
                    "fecha_publicacion":           n.fecha_publicacion,
                    "monto_estimado":              monto if monto else None,
                    "ofertantes":                  [],
                    "ofertantes_count":            0,
                })
            except Exception:
                continue

        return {
            "total":      total,
            "pagina":     pagina,
            "por_pagina": POR_PAGINA,
            "resultados": resultados_pagina,
        }

    # ── Guardar al pipeline ──────────────────────────────────────────────────

    async def buscar_por_estado_live(self, estado: str, filtros: dict, pagina: int = 1) -> dict:
        """
        Búsqueda live para cualquier estado de licitación.
        Usado para: cerrada, desierta, revocada, suspendida.

        Fase 1: recolecta todos los códigos del listado (rápido).
        Fase 2: carga detalles completos solo para la página actual (~50 llamadas).
        Esto garantiza que organismo, región, monto y fechas estén completos.
        """
        from datetime import datetime as dt, timedelta

        POR_PAGINA  = 50
        periodo     = min(int(filtros.get("periodo") or 30), 180)
        region      = filtros.get("region")
        keyword_raw = (filtros.get("keyword") or "").lower().strip()
        keywords    = [k.strip() for k in keyword_raw.split(",") if k.strip()]
        monto_min   = float(filtros.get("monto_minimo") or 0)

        hoy   = dt.now()
        fechas = [(hoy - timedelta(days=i)).strftime("%d%m%Y") for i in range(1, periodo + 1)]

        # ── Fase 1: recolectar lista de ítems (sin detalle) ──────────────
        sem = asyncio.Semaphore(10)

        async def fetch_dia(fecha: str) -> list[dict]:
            async with sem:
                try:
                    resp = await self.client.buscar_licitaciones(estado=estado, fecha=fecha, region=region)
                    return resp.get("Listado", [])
                except Exception:
                    return []

        listas = await asyncio.gather(*[fetch_dia(f) for f in fechas])

        vistos: set = set()
        todos: list[dict] = []
        for lista in listas:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in vistos:
                    vistos.add(cod)
                    todos.append(item)

        # Filtro keyword sobre Nombre del listado (ligero, sin cargar detalle)
        if keywords:
            todos = [i for i in todos if any(kw in (i.get("Nombre") or "").lower() for kw in keywords)]

        total  = len(todos)
        inicio = (pagina - 1) * POR_PAGINA
        codigos_pagina = [i["CodigoExterno"] for i in todos[inicio:inicio + POR_PAGINA]]

        # ── Fase 2: cargar detalles completos para la página actual ──────
        sem2 = asyncio.Semaphore(5)

        async def fetch_detalle(codigo: str):
            async with sem2:
                for intento in range(3):
                    try:
                        return await self.client.obtener_detalle(codigo)
                    except Exception:
                        if intento < 2:
                            await asyncio.sleep(0.8 * (intento + 1))
                            continue
                return None

        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_pagina])
        detalles_ok = [d for d in detalles if d is not None]

        # Normalizar con LicitacionNormalizada para extraer organismo, región,
        # monto, fecha_estimada_adjudicacion, etc.
        region_keys = REGION_CODE_TO_KEYWORDS.get((region or "").strip(), [])
        resultados_pagina = []
        for det in detalles_ok:
            try:
                n = LicitacionNormalizada(det, tipo_busqueda="licitador_a")
                # Post-filtro región sobre texto real devuelto por la API
                if region_keys:
                    reg_text = (n.region or "").lower()
                    if not any(kw in reg_text for kw in region_keys):
                        continue
                monto = n.monto or 0
                if monto_min and monto < monto_min:
                    continue
                resultados_pagina.append({
                    "codigo":                       n.codigo,
                    "nombre":                       n.nombre,
                    "organismo":                    n.organismo_nombre,
                    "organismo_rut":                n.organismo_rut,
                    "region":                       n.region,
                    "fecha_cierre":                 n.fecha_cierre,
                    "fecha_estimada_adjudicacion":  n.fecha_estimada_adjudicacion,
                    "fecha_publicacion":            n.fecha_publicacion,
                    "monto_estimado":               monto if monto else None,
                    "ofertantes":                   [],
                    "ofertantes_count":             0,
                })
            except Exception:
                continue

        return {
            "total":      total,
            "pagina":     pagina,
            "por_pagina": POR_PAGINA,
            "resultados": resultados_pagina,
        }

    async def guardar(self, codigo: str, contacto: dict | None = None):
        """Guarda una licitación y la agrega a la primera etapa del pipeline."""
        existente = self.db.query(Prospect).filter(
            Prospect.tenant_id == self.tenant_id,
            Prospect.licitacion_codigo == codigo,
            Prospect.source_module == "adjudicadas"
        ).first()
        if existente:
            # Si ya existe pero ahora tenemos datos de contacto, los actualizamos
            if contacto:
                for field in ('contact_name', 'email', 'phone', 'whatsapp'):
                    val = (contacto or {}).get(field)
                    if val and not getattr(existente, field, None):
                        setattr(existente, field, val)
                self.db.commit()
            return existente

        detalle = await self.client.obtener_detalle(codigo)
        n = LicitacionNormalizada(detalle, tipo_busqueda="licitador_b")

        from app.models.prospect import ProspectSource
        prospect = Prospect(
            tenant_id=self.tenant_id,
            source=ProspectSource.mercado_publico,
            source_module="adjudicadas",
            licitacion_codigo=n.codigo,
            licitacion_nombre=n.nombre,
            licitacion_organismo=n.organismo_nombre,
            licitacion_region=n.region,
            licitacion_monto_adjudicado=n.monto_adjudicado,
            licitacion_fecha_adjudicacion=n.fecha_adjudicacion,
            company_name=n.adjudicado_nombre,
            rut=n.adjudicado_rut,
            in_pipeline=True,
            contact_name=(contacto or {}).get('contact_name'),
            email=(contacto or {}).get('email'),
            phone=(contacto or {}).get('phone'),
            whatsapp=(contacto or {}).get('whatsapp'),
        )
        self.db.add(prospect)
        self.db.flush()

        primera_etapa = self.get_etapas()[0]
        card = PipelineCard(
            tenant_id=self.tenant_id,
            prospect_id=prospect.id,
            stage_id=primera_etapa.id
        )
        self.db.add(card)
        self.db.commit()
        return prospect
    # ── Scraping de web corporativa ─────────────────────────────────────────

    _EMAIL_RE = re.compile(
        r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'
    )
    _PHONE_RE = re.compile(
        r'(?<![\d\+])(\+?56[\s\-]?)?(?:9\d{8}|[2-8]\d{7,8})(?![\d])'
    )
    _BAD_EMAIL_DOMAINS = {
        'example.com', 'sentry.io', 'w3.org', 'schema.org', 'cloudflare.com',
        'googleapis.com', 'doubleclick.net', 'facebook.com', 'google.com',
        'twitter.com', 'instagram.com', 'whatsapp.com', 'apple.com',
        'microsoft.com', 'amazon.com', 'jquery.com', 'bootstrapcdn.com',
    }
    _SOCIAL_DOMAINS = [
        'instagram.com', 'facebook.com', 'twitter.com', 'tiktok.com',
        't.me', 'wa.me', 'youtube.com', 'linkedin.com',
    ]

    async def _scrape_website(self, url: str) -> dict:
        """Scrape sitio web corporativo para extraer emails y teléfonos."""
        import httpx
        emails: set = set()
        phones: set = set()
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
        }
        base = url.rstrip('/')
        paths = ['', '/contacto', '/contactanos', '/contact', '/nosotros', '/about']

        async def _fetch(client: httpx.AsyncClient, target: str):
            try:
                r = await asyncio.wait_for(client.get(target), timeout=6)
                if r.status_code == 200 and 'html' in r.headers.get('content-type', ''):
                    return r.text
            except Exception:
                pass
            return ''

        try:
            async with httpx.AsyncClient(
                timeout=10, follow_redirects=True, headers=headers, verify=False
            ) as client:
                htmls = await asyncio.gather(*[_fetch(client, base + p) for p in paths])
        except Exception:
            htmls = []

        for html in htmls:
            if not html:
                continue
            for e in self._EMAIL_RE.findall(html):
                e_low = e.lower()
                if not any(d in e_low for d in self._BAD_EMAIL_DOMAINS) and len(e) < 80:
                    emails.add(e_low)
            for p in self._PHONE_RE.findall(html):
                clean = re.sub(r'[\s\-]', '', p)
                if 8 <= len(clean) <= 13:
                    phones.add(clean)

        contactos = [
            {"nombre": "", "cargo": "", "email": e, "telefono": "", "linkedin": ""}
            for e in list(emails)[:6]
        ]
        return {"contactos": contactos, "phones_extra": list(phones)[:3]}

    # ── Contacto de empresa ───────────────────────────────────────────────────

    async def buscar_contacto(self, nombre_empresa: str) -> dict:
        """
        1. Busca la empresa en Google Maps → obtiene website, teléfono, dirección.
        2. Si tiene web propia (no red social), la scrapea buscando emails y teléfonos.
        """
        try:
            from app.modules.prospector.gmaps_client import GoogleMapsProspectorClient
            client = GoogleMapsProspectorClient()

            resultados = await client.buscar_negocios(nombre_empresa, "Chile", max_results=1)
            if not resultados:
                return {"ok": False, "contactos": [], "error": "No se encontró información de la empresa"}

            r = resultados[0]
            website  = r.get("website", "")
            telefono = r.get("phone", "")
            contactos: list = []

            # Scrapear web corporativa si no es red social
            is_social = any(d in (website or "").lower() for d in self._SOCIAL_DOMAINS)
            if website and not is_social:
                try:
                    scraped = await asyncio.wait_for(self._scrape_website(website), timeout=20)
                    contactos = scraped.get("contactos", [])
                    # Si Google Maps no tenía teléfono pero scraping encontró uno, usarlo
                    if not telefono:
                        extras = scraped.get("phones_extra", [])
                        if extras:
                            telefono = extras[0]
                except asyncio.TimeoutError:
                    pass

            return {
                "ok":      True,
                "empresa": r.get("name", nombre_empresa),
                "website":  website,
                "telefono": telefono,
                "direccion": r.get("address", ""),
                "maps_url":  r.get("maps_url", ""),
                "contactos": contactos,
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "contactos": []}
    # ── Pipeline agrupado por RUT ────────────────────────────────────────────

    def get_pipeline(self, rut_filtro: str = None):
        """Retorna pipeline agrupado por etapa (Kanban)."""
        etapas = self.get_etapas()

        query = self.db.query(Prospect, PipelineCard, PipelineStage).join(
            PipelineCard, PipelineCard.prospect_id == Prospect.id
        ).join(
            PipelineStage, PipelineStage.id == PipelineCard.stage_id
        ).filter(
            Prospect.tenant_id == self.tenant_id,
            Prospect.source_module == "adjudicadas",
            PipelineStage.pipeline_type == "adjudicadas"
        )

        if rut_filtro:
            query = query.filter(
                (Prospect.rut.ilike(f"%{rut_filtro}%")) |
                (Prospect.company_name.ilike(f"%{rut_filtro}%"))
            )

        rows = query.all()

        # Agrupar cards por etapa
        cards_por_etapa: dict = {e.id: [] for e in etapas}
        for prospect, card, etapa in rows:
            monto = prospect.licitacion_monto_adjudicado or 0
            cards_por_etapa.setdefault(etapa.id, []).append({
                "card_id":             str(card.id),
                "prospect_id":         str(prospect.id),
                "empresa":             prospect.company_name,
                "rut":                 prospect.rut,
                "codigo":              prospect.licitacion_codigo,
                "nombre":              prospect.licitacion_nombre,
                "licitacion_nombre":   prospect.licitacion_nombre,
                "organismo":           prospect.licitacion_organismo,
                "region":              prospect.licitacion_region,
                "monto_adjudicado":    monto,
                "poliza_seriedad":     round(monto * 0.01, 0),
                "poliza_cumplimiento": round(monto * 0.05, 0),
                "fecha_adjudicacion":  str(prospect.licitacion_fecha_adjudicacion or ""),
                "contact_name":        prospect.contact_name,
                "email":               prospect.email,
                "phone":               prospect.phone,
                "whatsapp":            prospect.whatsapp,
                "tiene_contacto":      bool(prospect.email or prospect.phone or prospect.whatsapp),
            })

        return [
            {
                "etapa_id":     str(e.id),
                "etapa_nombre": e.name,
                "etapa_color":  e.color,
                "cards":        cards_por_etapa.get(e.id, []),
            }
            for e in etapas
        ]

    # ── Mover etapa ──────────────────────────────────────────────────────────

    def mover_etapa(self, card_id: str, nueva_etapa_id: str):
        card = self.db.query(PipelineCard).filter(
            PipelineCard.id == card_id,
            PipelineCard.tenant_id == self.tenant_id
        ).first()
        if not card:
            raise ValueError("Card no encontrada")
        card.stage_id = nueva_etapa_id
        self.db.commit()
        return card

    # ── Agente automático ────────────────────────────────────────────────────

    async def correr_agente(self):
        """Corre búsqueda automática. Diseñado para ejecutarse cada 24h a las 3am."""
        adjudicadas = await self.buscar_adjudicadas({})
        por_adjudicarse = await self.buscar_por_adjudicarse({})

        guardadas = 0
        for item in adjudicadas + por_adjudicarse:
            try:
                await self.guardar(item["codigo"])
                guardadas += 1
            except Exception:
                continue

        return {"guardadas": guardadas}

    # ── Generar propuesta con IA ─────────────────────────────────────────────

    async def generar_propuesta(self, prospect_id: str, formato: str, contexto_juan: str) -> dict:
        """Genera propuesta personalizada con Claude Sonnet."""
        import anthropic
        from app.models.prospect import Prospect

        prospect = self.db.query(Prospect).filter(
            Prospect.id == prospect_id,
            Prospect.tenant_id == self.tenant_id
        ).first()
        if not prospect:
            raise ValueError("Prospecto no encontrado")

        monto = prospect.licitacion_monto_adjudicado or 0
        poliza_seriedad     = round(monto * 0.01, 0)
        poliza_cumplimiento = round(monto * 0.05, 0)

        formatos = {
            "whatsapp":    "mensaje corto y directo para WhatsApp (máximo 3 párrafos, tono cercano y profesional)",
            "email":       "email profesional con asunto y cuerpo formal",
            "presupuesto": "propuesta comercial estructurada con introducción, servicios ofrecidos, montos y cierre",
        }

        contacto = ""
        if prospect.contact_name:
            contacto = f"Contacto conocido: {prospect.contact_name}"
            if prospect.email: contacto += f" · {prospect.email}"
            if prospect.phone: contacto += f" · {prospect.phone}"

        prompt = f"""Eres un asistente comercial experto en ventas B2B en Chile.

Contexto del vendedor:
{contexto_juan}

Datos del lead:
- Empresa adjudicada: {prospect.company_name}
- RUT: {prospect.rut}
- Proyecto ganado: {prospect.licitacion_nombre}
- Organismo mandante: {prospect.licitacion_organismo}
- Monto adjudicado: ${monto:,.0f} CLP
- Póliza de seriedad (1%): ${poliza_seriedad:,.0f} CLP
- Póliza de cumplimiento (5%): ${poliza_cumplimiento:,.0f} CLP
{f'- {contacto}' if contacto else ''}

Genera un {formatos.get(formato, 'mensaje')} para contactar a esta empresa.
Personaliza con los datos reales del proyecto y los montos de las pólizas.
No inventes información que no tienes."""

        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        return {
            "propuesta": message.content[0].text,
            "formato":   formato,
            "empresa":   prospect.company_name,
            "proyecto":  prospect.licitacion_nombre,
        }
