"""
Endpoints del Pipeline CRM.

El pipeline es el tablero Kanban donde gestionamos el avance
de cada prospecto desde el primer contacto hasta el cierre.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.services.pipeline_service import PipelineService

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CrearEtapaRequest(BaseModel):
    nombre: str
    color: str = "#6366f1"
    order: int = 0


class ActualizarEtapaRequest(BaseModel):
    nombre: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_won: Optional[bool] = None
    is_lost: Optional[bool] = None


class MoverTarjetaRequest(BaseModel):
    stage_id: str   # ID de la etapa destino


class AgregarTarjetaRequest(BaseModel):
    prospect_id: str
    stage_id: Optional[str] = None  # Si no se envía, usa la primera etapa


class ActualizarTarjetaRequest(BaseModel):
    notes: Optional[str] = None
    next_action_at: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def obtener_pipeline(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve el pipeline completo: todas las etapas con sus tarjetas.
    Este es el endpoint principal del tablero Kanban.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.obtener_pipeline(tenant_id=current_user.tenant_id)


@router.post("/etapas")
def crear_etapa(
    data: CrearEtapaRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Crea una nueva etapa personalizada en el pipeline."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.crear_etapa(
        tenant_id=current_user.tenant_id,
        nombre=data.nombre,
        color=data.color,
        order=data.order,
    )


@router.put("/etapas/{stage_id}")
def actualizar_etapa(
    stage_id: str,
    data: ActualizarEtapaRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Actualiza el nombre, color u orden de una etapa."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.actualizar_etapa(
        stage_id=stage_id,
        tenant_id=current_user.tenant_id,
        name=data.nombre,
        color=data.color,
        order=data.order,
        is_won=data.is_won,
        is_lost=data.is_lost,
    )


@router.delete("/etapas/{stage_id}")
def eliminar_etapa(
    stage_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Elimina una etapa del pipeline.
    Solo funciona si la etapa no tiene tarjetas activas.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    servicio.eliminar_etapa(stage_id=stage_id, tenant_id=current_user.tenant_id)
    return {"mensaje": "Etapa eliminada exitosamente"}


@router.put("/tarjetas/{card_id}/mover")
def mover_tarjeta(
    card_id: str,
    data: MoverTarjetaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mueve una tarjeta a una etapa diferente del pipeline.
    Esto es lo que ocurre cuando arrastras una tarjeta en el Kanban.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.mover_tarjeta(
        card_id=card_id,
        nueva_etapa_id=data.stage_id,
        tenant_id=current_user.tenant_id,
    )


@router.post("/tarjetas")
def agregar_tarjeta(
    data: AgregarTarjetaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Agrega un prospecto al pipeline manualmente."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.agregar_tarjeta(
        tenant_id=current_user.tenant_id,
        prospect_id=data.prospect_id,
        stage_id=data.stage_id,
    )


@router.put("/tarjetas/{card_id}")
def actualizar_tarjeta(
    card_id: str,
    data: ActualizarTarjetaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualiza notas y alarma de una tarjeta."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.actualizar_tarjeta(
        card_id=card_id,
        tenant_id=current_user.tenant_id,
        notes=data.notes,
        next_action_at=data.next_action_at,
    )


@router.delete("/tarjetas/{card_id}")
def eliminar_tarjeta(
    card_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Elimina una tarjeta del pipeline (el prospecto no se borra)."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    servicio.eliminar_tarjeta(card_id=card_id, tenant_id=current_user.tenant_id)
    return {"mensaje": "Lead removido del pipeline"}


@router.post("/inicializar")
def inicializar_pipeline(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crea las etapas por defecto para el tenant.
    Llamar en el primer login del usuario.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = PipelineService(db=db, tenant_id=current_user.tenant_id)
    return servicio.crear_etapas_default(tenant_id=current_user.tenant_id)
