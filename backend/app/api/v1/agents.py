"""
Endpoints de los Agentes IA.

Los agentes son bots que trabajan en segundo plano:
- Qualifier: califica prospectos sin score
- Writer: redacta mensajes personalizados
- Followup: genera seguimientos automáticos
- Cleaner: descarta prospectos viejos o de baja calidad

Todos los mensajes generados por IA requieren aprobación humana antes de enviarse.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.models.message import Message, MessageStatus
from app.agents.qualifier_agent import QualifierAgent
from app.agents.writer_agent import WriterAgent
from app.agents.followup_agent import FollowupAgent
from app.agents.cleaner_agent import CleanerAgent

router = APIRouter(prefix="/agents", tags=["agents"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CalificarRequest(BaseModel):
    modulo: Optional[str] = None     # Filtrar por módulo origen
    limit: int = 50                  # Máximo de prospectos a calificar


class RedactarRequest(BaseModel):
    prospect_id: str
    canal: str = "whatsapp"          # "whatsapp" o "email"
    producto: Optional[str] = None   # Qué vende el cliente
    empresa: Optional[str] = None    # Nombre de la empresa del cliente


class SeguimientoRequest(BaseModel):
    horas_sin_respuesta: int = 24    # Umbral para generar seguimiento


class LimpiarRequest(BaseModel):
    dias_antiguedad: int = 180       # Días para considerar un prospecto como viejo


# ── Endpoints de agentes ──────────────────────────────────────────────────────

@router.post("/calificar")
async def calificar_prospectos(
    data: CalificarRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Califica prospectos sin score usando Claude Haiku.
    Útil cuando se importaron prospectos sin pasar por el scorer.
    Requiere rol admin.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    agente = QualifierAgent(db=db, tenant_id=current_user.tenant_id)
    return await agente.run(modulo=data.modulo, limit=data.limit)


@router.post("/redactar")
async def redactar_mensaje(
    data: RedactarRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Redacta un mensaje personalizado para un prospecto usando Claude Sonnet.
    El mensaje se crea con status 'pending_approval' y debe ser aprobado antes de enviar.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    contexto_cliente = {
        "producto": data.producto or "",
        "empresa": data.empresa or "",
    }

    agente = WriterAgent(db=db, tenant_id=current_user.tenant_id)
    return await agente.run(
        prospect_id=data.prospect_id,
        canal=data.canal,
        contexto_cliente=contexto_cliente,
    )


@router.post("/seguimiento")
async def generar_seguimiento(
    data: SeguimientoRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Detecta prospectos sin respuesta y genera mensajes de seguimiento.
    Los mensajes quedan pendientes de aprobación.
    Requiere rol admin.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    agente = FollowupAgent(db=db, tenant_id=current_user.tenant_id)
    return await agente.run(horas_sin_respuesta=data.horas_sin_respuesta)


@router.post("/limpiar")
async def limpiar_prospectos(
    data: LimpiarRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Marca como descartados los prospectos antiguos o de baja calidad.
    No elimina datos, solo cambia el status.
    Requiere rol admin.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    agente = CleanerAgent(db=db, tenant_id=current_user.tenant_id)
    return await agente.run(dias_antiguedad=data.dias_antiguedad)


# ── Endpoints de mensajes ─────────────────────────────────────────────────────

@router.post("/mensajes/{message_id}/aprobar")
def aprobar_mensaje(
    message_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Aprueba un mensaje generado por IA.
    Una vez aprobado, puede ser enviado al prospecto.
    Requiere rol admin.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    mensaje = (
        db.query(Message)
        .filter(
            Message.id == message_id,
            Message.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not mensaje:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")

    if mensaje.status != MessageStatus.pending_approval:
        raise HTTPException(
            status_code=400,
            detail=f"El mensaje no está pendiente de aprobación (estado actual: {mensaje.status})"
        )

    mensaje.status = MessageStatus.approved
    mensaje.approved_by = current_user.id
    db.commit()

    return {
        "message_id": message_id,
        "status": "approved",
        "aprobado_por": current_user.full_name,
    }


@router.post("/mensajes/{message_id}/rechazar")
def rechazar_mensaje(
    message_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Rechaza un mensaje generado por IA y lo devuelve a borrador.
    El usuario puede editarlo o pedir que se regenere.
    Requiere rol admin.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    mensaje = (
        db.query(Message)
        .filter(
            Message.id == message_id,
            Message.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not mensaje:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")

    mensaje.status = MessageStatus.draft
    db.commit()

    return {
        "message_id": message_id,
        "status": "draft",
        "mensaje": "El mensaje fue rechazado y volvió a estado borrador",
    }


@router.get("/mensajes/pendientes")
def listar_mensajes_pendientes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lista todos los mensajes generados por IA que esperan aprobación.
    El usuario revisa y aprueba o rechaza cada uno antes de enviar.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    mensajes = (
        db.query(Message)
        .filter(
            Message.tenant_id == current_user.tenant_id,
            Message.status == MessageStatus.pending_approval,
        )
        .order_by(Message.created_at.desc())
        .all()
    )

    return {
        "total": len(mensajes),
        "mensajes": [
            {
                "id": m.id,
                "body": m.body,
                "channel": m.channel,
                "conversation_id": m.conversation_id,
                "generated_by_ai": m.generated_by_ai,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in mensajes
        ],
    }
