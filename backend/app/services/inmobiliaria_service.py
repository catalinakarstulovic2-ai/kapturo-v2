"""
Servicio del módulo Inmobiliaria.

Orquesta los 4 agentes en secuencia:
  1. Collector   → lanza 6 fuentes en paralelo, devuelve lista cruda
  2. Normalizer  → convierte todo al formato Prospect estándar
  3. Scorer      → califica con Claude Haiku (criterios de Leo)
  4. Writer      → genera mensaje si score >= 65, en pending_approval

Los prospectos calificados entran automáticamente al pipeline del tenant.
"""
from sqlalchemy.orm import Session
from app.modules.inmobiliaria.collector import InmobiliariaCollector
from app.modules.inmobiliaria.normalizer import normalizar
from app.modules.inmobiliaria.scorer import InmobiliariaScorer, SCORE_THRESHOLD
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.models.tenant import Tenant


class InmobiliariaService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        keys = self._get_keys()
        self.collector = InmobiliariaCollector(
            apollo_api_key=keys.get("apollo_api_key"),
            apify_api_key=keys.get("apify_api_key"),
        )
        self.scorer = InmobiliariaScorer()

    def _get_keys(self) -> dict:
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        return tenant.api_keys or {} if tenant else {}

    async def ejecutar_busqueda(
        self,
        max_apollo_latam: int = 100,
        max_apollo_usa: int = 100,
        max_facebook: int = 50,
        max_reddit: int = 100,
        max_instagram: int = 100,
        max_tiktok: int = 50,
    ) -> dict:
        """
        Ejecuta la búsqueda completa de prospectos inmobiliarios.

        Devuelve un resumen con conteos por fuente y totales.
        """
        # ── Agente 1: Recolector ──────────────────────────────────────────────
        raw_prospects = await self.collector.recolectar(
            max_apollo_latam=max_apollo_latam,
            max_apollo_usa=max_apollo_usa,
            max_facebook=max_facebook,
            max_reddit=max_reddit,
            max_instagram=max_instagram,
            max_tiktok=max_tiktok,
        )

        # ── Agente 2: Normalizador ────────────────────────────────────────────
        normalized = []
        for item in raw_prospects:
            try:
                normalized.append(normalizar(item))
            except Exception:
                continue

        # ── Agentes 3 y 4: Scorer + guardado en BD ────────────────────────────
        stats = {
            "apollo_latam": {"total": 0, "calificados": 0, "duplicados": 0},
            "apollo_usa":   {"total": 0, "calificados": 0, "duplicados": 0},
            "facebook":     {"total": 0, "calificados": 0, "duplicados": 0},
            "reddit":       {"total": 0, "calificados": 0, "duplicados": 0},
            "instagram":    {"total": 0, "calificados": 0, "duplicados": 0},
            "tiktok":       {"total": 0, "calificados": 0, "duplicados": 0},
        }

        for p_dict in normalized:
            fuente = p_dict.get("fuente_inmobiliaria", "unknown")
            if fuente not in stats:
                stats[fuente] = {"total": 0, "calificados": 0, "duplicados": 0}

            stats[fuente]["total"] += 1

            guardado = await self._procesar_prospecto(p_dict)
            if guardado is None:
                stats[fuente]["duplicados"] += 1
            elif guardado:
                stats[fuente]["calificados"] += 1

        self.db.commit()

        total_raw = sum(s["total"] for s in stats.values())
        total_calificados = sum(s["calificados"] for s in stats.values())
        total_duplicados = sum(s["duplicados"] for s in stats.values())

        return {
            "total_raw": total_raw,
            "total_calificados": total_calificados,
            "total_duplicados": total_duplicados,
            "total_guardados": total_raw - total_duplicados,
            "por_fuente": stats,
        }

    async def _procesar_prospecto(self, p_dict: dict):
        """
        Deduplica, califica y guarda un prospecto.

        Devuelve:
          None  → era duplicado, no se guardó
          True  → guardado y calificó (score >= umbral)
          False → guardado pero no calificó
        """
        # Deduplicación por LinkedIn
        if p_dict.get("linkedin_url"):
            existe = self.db.query(Prospect).filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.linkedin_url == p_dict["linkedin_url"],
            ).first()
            if existe:
                return None

        # Deduplicación por email
        if p_dict.get("email"):
            existe = self.db.query(Prospect).filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.email == p_dict["email"],
            ).first()
            if existe:
                return None

        # Deduplicación por nombre de contacto + fuente (para redes sociales)
        if not p_dict.get("linkedin_url") and not p_dict.get("email"):
            nombre = p_dict.get("contact_name", "").strip()
            fuente = p_dict.get("fuente_inmobiliaria", "")
            if nombre and fuente:
                existe = self.db.query(Prospect).filter(
                    Prospect.tenant_id == self.tenant_id,
                    Prospect.contact_name == nombre,
                    Prospect.source_module == "inmobiliaria",
                ).first()
                if existe:
                    return None

        # Agente 3: Scorer
        score, razon = await self.scorer.calificar(p_dict)

        # Campos que no van directo al modelo
        raw_text = p_dict.pop("raw_text", None)
        fuente_inmobiliaria = p_dict.pop("fuente_inmobiliaria", None)

        calificado = score >= SCORE_THRESHOLD

        prospect = Prospect(
            tenant_id=self.tenant_id,
            score=score,
            score_reason=razon,
            is_qualified=calificado,
            status=ProspectStatus.qualified if calificado else ProspectStatus.new,
            **p_dict,
        )
        self.db.add(prospect)
        self.db.flush()

        # No auto-agregar al pipeline: Leo revisa y decide manualmente quién entra.

        return calificado
