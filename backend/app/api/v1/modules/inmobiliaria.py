"""
Endpoints REST del módulo Inmobiliaria.

POST /api/v1/inmobiliaria/buscar          → lanza búsqueda en background (Celery)
GET  /api/v1/inmobiliaria/buscar/{job_id} → estado del job
GET  /api/v1/inmobiliaria/prospectos      → lista leads del módulo con filtros
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.services.prospector_service import ProspectorService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])


@router.post("/buscar")
async def buscar_prospectos(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Lanza búsqueda en background vía Celery.
    Retorna inmediatamente con job_id para hacer polling.
    Cada run procesa un batch rotado de fuentes (anti-ban).
    """
    import asyncio
    from app.models.tenant import TenantModule
    from app.core.database import SessionLocal
    from sqlalchemy.orm.attributes import flag_modified
    from datetime import datetime, timezone

    tenant_id = str(current_user.tenant_id)

    # Marcar búsqueda en curso en BD
    def _set_buscando(en_curso: bool):
        _db = SessionLocal()
        try:
            mod = _db.query(TenantModule).filter(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module == "inmobiliaria",
            ).first()
            if mod:
                cfg = dict(mod.config or {})
                cfg["buscando"] = en_curso
                cfg["buscando_desde"] = datetime.now(timezone.utc).isoformat() if en_curso else None
                mod.config = cfg
                flag_modified(mod, "config")
                _db.commit()
        finally:
            _db.close()

    # Siempre usar asyncio — no hay worker de Celery en Railway
    from app.services.inmobiliaria_service import InmobiliariaService

    _set_buscando(True)

    async def _run_background():
        bg_db = SessionLocal()
        try:
            service = InmobiliariaService(db=bg_db, tenant_id=tenant_id)
            await service.buscar_comentarios_sociales()
        except Exception as e:
            logger.error(f"Búsqueda social background falló (tenant {tenant_id}): {e}")
        finally:
            bg_db.close()
            _set_buscando(False)

    asyncio.create_task(_run_background())
    return {"ok": True, "job_id": None, "resultado": None, "mensaje": "Búsqueda iniciada en background."}


@router.get("/buscar/estado")
async def estado_busqueda_general(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Devuelve si hay una búsqueda en curso para este tenant."""
    from app.models.tenant import TenantModule
    from datetime import datetime, timezone, timedelta
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == str(current_user.tenant_id),
        TenantModule.module == "inmobiliaria",
    ).first()
    if not mod:
        return {"buscando": False}
    cfg = mod.config or {}
    buscando = cfg.get("buscando", False)
    # Auto-expirar si lleva más de 10 minutos (por si falló sin limpiar)
    if buscando and cfg.get("buscando_desde"):
        try:
            desde = datetime.fromisoformat(cfg["buscando_desde"])
            if datetime.now(timezone.utc) - desde > timedelta(minutes=10):
                buscando = False
        except Exception:
            buscando = False
    return {"buscando": buscando}


@router.get("/buscar/{job_id}")
async def estado_busqueda(
    job_id: str,
    current_user=Depends(require_admin),
):
    """
    Consulta el estado de un job de búsqueda.
    Estados posibles: PENDING | STARTED | SUCCESS | FAILURE
    """
    try:
        from celery.result import AsyncResult
        from workers.celery_app import app as celery_app
        result = AsyncResult(job_id, app=celery_app)
        estado = result.state
        if estado == "SUCCESS":
            return {"ok": True, "estado": "SUCCESS", "resultado": result.result}
        elif estado == "FAILURE":
            return {"ok": False, "estado": "FAILURE", "error": str(result.result)}
        else:
            return {"ok": True, "estado": estado, "resultado": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prospectos")
async def listar_prospectos(
    solo_calificados: bool = False,
    score_minimo: float = 0,
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    return await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )


@router.post("/buscar-empresas")
async def buscar_empresas(
    ubicacion: str = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Busca empresas del nicho via Google Maps + Hunter.io + Claude.
    No usa Celery — Google Maps es rápido, responde directo.
    """
    from app.services.inmobiliaria_service import InmobiliariaService
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.ejecutar_busqueda(ubicacion=ubicacion)
        return {"ok": True, "resultado": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/buscar-linkedin")
async def buscar_linkedin(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Busca perfiles LinkedIn según las queries configuradas en niche_config.
    Califica cada perfil con Claude y guarda los que superen el umbral.
    """
    from app.services.inmobiliaria_service import InmobiliariaService
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.buscar_linkedin_leads()
        return {"ok": True, "resultado": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/descartados")
async def listar_descartados(
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lista los prospectos descartados del módulo inmobiliaria."""
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    return await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_excluidos=True,
        pagina=pagina,
        por_pagina=por_pagina,
    )
