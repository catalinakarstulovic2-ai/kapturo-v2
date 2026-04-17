import math
from workers.celery_app import app
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

# Cuántas fuentes correr por ejecución (rotación diaria)
# Con 18 fuentes y BATCH_SIZE=6 → 3 días para cubrir todo
BATCH_SIZE = 6


@app.task(
    bind=True,
    name="workers.tasks.social_comments_sync.sync_social_comments",
    max_retries=2,
    default_retry_delay=300,
    soft_time_limit=1800,
    time_limit=2100,
)
def sync_social_comments(self, tenant_id: str = None, batch_index: int = None, offset: int = 0):
    """
    batch_index: si se pasa (0,1,2...) fuerza un batch específico.
    Si no se pasa, rota automáticamente según el día del año + offset.
    offset: se suma al índice de rotación automática — permite que el run de
            mañana y el de noche del mismo día cubran BATCHES DISTINTOS.
            El beat lo llama con offset=0 (mañana) y offset=1 (noche).
    tenant_id: si se pasa solo corre para ese tenant (usado desde el botón manual).
    """
    import asyncio
    from datetime import date
    from app.core.database import SessionLocal
    from app.models.tenant import TenantModule
    from app.services.inmobiliaria_service import InmobiliariaService

    async def _run():
        db = SessionLocal()
        try:
            query = db.query(TenantModule).filter(
                TenantModule.module == "inmobiliaria",
                TenantModule.is_active == True,
            )
            if tenant_id:
                query = query.filter(TenantModule.tenant_id == tenant_id)
            modulos = query.all()

            logger.info(f"Social comments sync: {len(modulos)} tenant(s)")

            for modulo in modulos:
                try:
                    cfg = modulo.niche_config or {}
                    # Construir lista completa de fuentes
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

                    # Determinar qué batch correr hoy
                    idx = batch_index
                    if idx is None:
                        n_batches = math.ceil(len(todas_fuentes) / BATCH_SIZE) or 1
                        # offset diferencia el run de mañana (0) del de noche (1)
                        idx = (date.today().timetuple().tm_yday + offset) % n_batches

                    fuentes_hoy = todas_fuentes[idx * BATCH_SIZE : (idx + 1) * BATCH_SIZE]
                    logger.info(
                        f"Tenant {modulo.tenant_id}: batch {idx}, "
                        f"{len(fuentes_hoy)}/{len(todas_fuentes)} fuentes"
                    )

                    service = InmobiliariaService(db, str(modulo.tenant_id))
                    resultado = await service.buscar_fuentes(fuentes_hoy)
                    logger.info(f"Tenant {modulo.tenant_id}: {resultado}")
                except Exception as e:
                    logger.error(f"Error tenant {modulo.tenant_id}: {e}", exc_info=True)
                    continue
        finally:
            db.close()

    try:
        asyncio.run(_run())
    except Exception as exc:
        raise self.retry(exc=exc)
