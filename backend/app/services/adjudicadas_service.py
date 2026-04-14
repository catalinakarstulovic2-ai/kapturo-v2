"""
Servicio del módulo Adjudicadas.
Independiente del módulo Licitaciones — no modificar ese módulo.
"""
import asyncio
from sqlalchemy.orm import Session
from app.modules.licitaciones.client import MercadoPublicoClient
from app.modules.licitaciones.normalizer import LicitacionNormalizada
from app.models.prospect import Prospect
from app.models.pipeline import PipelineStage, PipelineCard

ETAPAS_DEFAULT = [
    {"name": "Sin contactar", "color": "#6B7280", "order": 0, "is_won": False, "is_lost": False},
    {"name": "Contactado",    "color": "#3B82F6", "order": 1, "is_won": False, "is_lost": False},
    {"name": "Reunión",       "color": "#8B5CF6", "order": 2, "is_won": False, "is_lost": False},
    {"name": "Propuesta",     "color": "#F59E0B", "order": 3, "is_won": False, "is_lost": False},
    {"name": "Ganado",        "color": "#10B981", "order": 4, "is_won": True,  "is_lost": False},
    {"name": "Perdido",       "color": "#EF4444", "order": 5, "is_won": False, "is_lost": True},
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

    # ── Búsqueda ─────────────────────────────────────────────────────────────

    async def buscar_adjudicadas(self, filtros: dict, pagina: int = 1):
        """Pestaña 1: licitaciones ya adjudicadas."""
        data = await self.client.buscar_adjudicadas(
            fecha=filtros.get("fecha_hasta"),
            region=filtros.get("region"),
            pagina=pagina
        )
        return self._normalizar_lista(data.get("Listado", []), filtros)

    async def buscar_por_adjudicarse(self, filtros: dict, pagina: int = 1):
        """
        Pestaña 2: licitaciones con cuadro de ofertas (próximas a adjudicarse).
        Busca cerradas y verifica en paralelo cuáles tienen ofertas.
        """
        data = await self.client.buscar_licitaciones(
            estado="cerrada",
            fecha=filtros.get("fecha_hasta"),
            region=filtros.get("region"),
            pagina=pagina
        )
        codigos = [item["CodigoExterno"] for item in data.get("Listado", [])]

        detalles = await asyncio.gather(
            *[self.client.obtener_detalle(c) for c in codigos],
            return_exceptions=True
        )

        con_ofertas = [
            d for d in detalles
            if not isinstance(d, Exception)
            and d.get("Ofertas", {}).get("Listado")
        ]

        return self._normalizar_lista(con_ofertas, filtros)

    def _normalizar_lista(self, items: list, filtros: dict) -> list:
        monto_minimo = filtros.get("monto_minimo", 0)
        keyword = (filtros.get("keyword") or "").lower()
        resultado = []
        for item in items:
            try:
                n = LicitacionNormalizada(item, tipo_busqueda="licitador_b")
                monto = n.monto_adjudicado or 0
                if monto < monto_minimo:
                    continue
                if keyword and keyword not in (n.nombre or "").lower():
                    continue
                resultado.append({
                    "codigo":              n.codigo,
                    "nombre":              n.nombre,
                    "organismo":           n.organismo,
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

    # ── Guardar al pipeline ──────────────────────────────────────────────────

    async def guardar(self, codigo: str):
        """Guarda una licitación y la agrega a la primera etapa del pipeline."""
        existente = self.db.query(Prospect).filter(
            Prospect.tenant_id == self.tenant_id,
            Prospect.licitacion_codigo == codigo,
            Prospect.source_module == "adjudicadas"
        ).first()
        if existente:
            return existente

        detalle = await self.client.obtener_detalle(codigo)
        n = LicitacionNormalizada(detalle, tipo_busqueda="licitador_b")

        prospect = Prospect(
            tenant_id=self.tenant_id,
            source_module="adjudicadas",
            licitacion_codigo=n.codigo,
            licitacion_nombre=n.nombre,
            licitacion_organismo=n.organismo,
            licitacion_region=n.region,
            licitacion_monto_adjudicado=n.monto_adjudicado,
            licitacion_fecha_adjudicacion=n.fecha_adjudicacion,
            company_name=n.adjudicado_nombre,
            rut=n.adjudicado_rut,
            in_pipeline=True
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

    # ── Pipeline agrupado por RUT ────────────────────────────────────────────

    def get_pipeline(self, rut_filtro: str = None):
        """Retorna pipeline agrupado por RUT adjudicado."""
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
            query = query.filter(Prospect.rut.ilike(f"%{rut_filtro}%"))

        rows = query.all()

        empresas: dict = {}
        for prospect, card, etapa in rows:
            rut = prospect.rut or "sin-rut"
            if rut not in empresas:
                empresas[rut] = {
                    "rut": rut,
                    "nombre": prospect.company_name,
                    "proyectos": []
                }
            monto = prospect.licitacion_monto_adjudicado or 0
            empresas[rut]["proyectos"].append({
                "card_id":             card.id,
                "licitacion_codigo":   prospect.licitacion_codigo,
                "licitacion_nombre":   prospect.licitacion_nombre,
                "monto_adjudicado":    monto,
                "poliza_seriedad":     round(monto * 0.01, 0),
                "poliza_cumplimiento": round(monto * 0.05, 0),
                "etapa_id":            etapa.id,
                "etapa_nombre":        etapa.name,
                "etapa_color":         etapa.color,
            })

        return list(empresas.values())

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
