"""
Servicio del módulo Inmobiliaria - Stack sin costo.

Pipeline:
  1. Google Maps  -> busca empresas del nicho (agencias, constructoras, etc.)
  2. Hunter.io    -> enriquece con email y contacto del equipo
  3. Claude Haiku -> califica según contexto del tenant (agent_config)

No requiere PDL ni Apify. Solo GOOGLE_MAPS_API_KEY + HUNTER_API_KEY + ANTHROPIC_API_KEY.
"""
import asyncio
from sqlalchemy.orm import Session
from app.modules.prospector.gmaps_client import GoogleMapsProspectorClient
from app.modules.prospector.hunter_client import HunterClient
from app.modules.prospector.normalizer import normalizar_gmaps
from app.modules.inmobiliaria.scorer import InmobiliariaScorer, SCORE_THRESHOLD
from app.models.prospect import Prospect, ProspectStatus
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
                except Exception:
                    pass

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
        score, razon = await self.scorer.calificar(p_dict, config=self.agent_config)

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
