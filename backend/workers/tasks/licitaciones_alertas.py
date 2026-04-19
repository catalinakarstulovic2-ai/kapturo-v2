"""
Tarea diaria: enviar alertas de nuevas licitaciones a cada tenant.

Qué hace:
  1. Busca todos los TenantModule con módulo "licitaciones" activo
  2. Para cada uno que tenga email_alertas y rubros configurados:
     - Busca en Mercado Público licitaciones publicadas en las últimas 24h
       usando sus rubros como keyword
     - Si encuentra resultados, envía email con tabla de licitaciones
     - Guarda nuevas_pendientes en niche_config para badge in-app
  3. Corre todos los días a las 08:00 AM Santiago (11:00 UTC)
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from workers.celery_app import app as celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.tasks.licitaciones_alertas.enviar_alertas_licitaciones",
                 bind=True, max_retries=2, default_retry_delay=300)
def enviar_alertas_licitaciones(self):
    """Celery task que llama al endpoint de alertas de licitaciones."""
    try:
        asyncio.run(_run_alertas())
    except Exception as exc:
        logger.error(f"Error en alertas licitaciones: {exc}")
        raise self.retry(exc=exc)


async def _run_alertas():
    from app.core.database import SessionLocal
    from app.models.tenant import TenantModule
    from app.services.email_service import EmailService
    from app.modules.licitaciones.client import MercadoPublicoClient
    from sqlalchemy.orm.attributes import flag_modified

    db = SessionLocal()
    try:
        modulos = (
            db.query(TenantModule)
            .filter(
                TenantModule.module == "licitaciones",
                TenantModule.is_active == True,
            )
            .all()
        )

        email_service = EmailService()
        client = MercadoPublicoClient()

        ahora = datetime.now(timezone.utc)
        ayer = (ahora - timedelta(days=1)).strftime("%Y-%m-%d")
        hoy = ahora.strftime("%Y-%m-%d")

        enviados = 0
        for mod in modulos:
            cfg = mod.niche_config or {}
            email_alertas = cfg.get("email_alertas", "").strip()
            rubros = cfg.get("rubros") or []
            razon_social = cfg.get("razon_social") or "Tu empresa"

            if not email_alertas or not rubros:
                continue

            try:
                keyword = rubros[0] if len(rubros) == 1 else ", ".join(rubros[:3])
                filtros = {"fecha_desde": ayer, "fecha_hasta": hoy, "keyword": keyword}
                regiones = cfg.get("regiones", [])
                if len(regiones) == 1:
                    filtros["region"] = regiones[0]

                resultado = await asyncio.to_thread(
                    client.buscar_licitaciones,
                    tipo="licitador_b",
                    filtros=filtros,
                    pagina=1,
                )
                items = resultado.get("items", [])

                cfg["nuevas_pendientes"] = len(items)
                cfg["last_alerta_enviada"] = ahora.isoformat()
                mod.niche_config = dict(cfg)
                flag_modified(mod, "niche_config")

                if not items:
                    continue

                licitaciones_email = [
                    {
                        "nombre": i.get("nombre") or i.get("licitacion_nombre") or "Sin nombre",
                        "codigo": i.get("codigo") or "",
                        "organismo": i.get("organismo") or i.get("comprador") or "",
                        "monto_estimado": i.get("monto_estimado") or 0,
                        "score": i.get("score") or 0,
                    }
                    for i in items[:10]
                ]

                await email_service.send_licitaciones_alert(
                    to=email_alertas,
                    razon_social=razon_social,
                    licitaciones=licitaciones_email,
                )
                enviados += 1
                logger.info(f"Alerta licitaciones enviada a {email_alertas} ({len(items)} items)")

            except Exception as e:
                logger.error(f"Error procesando tenant {mod.tenant_id}: {e}")

        db.commit()
        logger.info(f"Alertas licitaciones: {len(modulos)} tenants, {enviados} emails enviados")

    finally:
        db.close()
