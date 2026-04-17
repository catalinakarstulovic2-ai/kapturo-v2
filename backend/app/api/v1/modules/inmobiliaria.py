"""
Endpoints REST del módulo Inmobiliaria.

POST /api/v1/inmobiliaria/buscar          → lanza búsqueda en background (Celery)
GET  /api/v1/inmobiliaria/buscar/{job_id} → estado del job
GET  /api/v1/inmobiliaria/prospectos      → lista leads del módulo con filtros
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.services.prospector_service import ProspectorService

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
    try:
        from workers.tasks.social_comments_sync import sync_social_comments
        task = sync_social_comments.delay(tenant_id=str(current_user.tenant_id))
        return {
            "ok": True,
            "job_id": task.id,
            "mensaje": "Búsqueda iniciada. Consulta /buscar/{job_id} para el estado.",
        }
    except Exception:
        # Fallback síncrono si Celery/Redis no está disponible (dev local sin worker)
        from app.services.inmobiliaria_service import InmobiliariaService
        try:
            service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
            resultado = await service.buscar_comentarios_sociales()
            return {"ok": True, "job_id": None, "resultado": resultado}
        except Exception as e2:
            raise HTTPException(status_code=500, detail=str(e2))


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
