"""
Endpoints de mensajes y conversaciones.

Agrupa todo lo relacionado con:
  - Enviar mensajes aprobados por WhatsApp
  - Ver conversaciones y mensajes del inbox
  - Webhook de Meta para recibir mensajes entrantes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.core.config import settings
from app.models.user import User
from app.models.message import Message, Conversation
from app.services.whatsapp_service import WhatsAppService
from app.services.message_service import MessageService

router = APIRouter(prefix="/messages", tags=["messages"])


# ── Enviar mensaje ─────────────────────────────────────────────────────────────

@router.post("/send/{message_id}")
async def send_message(
    message_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Envía un mensaje aprobado al prospecto por WhatsApp.
    Solo admins pueden disparar el envío.
    El mensaje debe estar en status 'approved' — si no, devuelve error 400.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = MessageService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.send_approved_message(message_id=message_id)


# ── Conversaciones ─────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    prospect_id: Optional[str] = None,
    channel: Optional[str] = None,
    pagina: int = 1,
    por_pagina: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lista las conversaciones del tenant con paginación.
    Opcionalmente filtra por prospect_id o canal (whatsapp/email).
    Incluye preview del último mensaje.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    query = db.query(Conversation).filter(
        Conversation.tenant_id == current_user.tenant_id
    )

    if prospect_id:
        query = query.filter(Conversation.prospect_id == prospect_id)
    if channel:
        query = query.filter(Conversation.channel == channel)

    query = query.order_by(Conversation.last_message_at.desc().nullslast())

    total = query.count()
    offset = (pagina - 1) * por_pagina
    conversaciones = query.offset(offset).limit(por_pagina).all()

    resultado = []
    for conv in conversaciones:
        # Último mensaje de la conversación
        ultimo_mensaje = (
            db.query(Message)
            .filter(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .first()
        )

        # Datos del prospecto
        prospecto = (
            db.query(Prospect)
            .filter(Prospect.id == conv.prospect_id)
            .first()
        )

        resultado.append({
            "id": conv.id,
            "prospect_id": conv.prospect_id,
            "prospect_name": prospecto.company_name if prospecto else None,
            "prospect_contact": prospecto.contact_name if prospecto else None,
            "prospect_phone": prospecto.whatsapp or prospecto.phone if prospecto else None,
            "channel": conv.channel,
            "is_open": conv.is_open,
            "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "last_message_preview": ultimo_mensaje.body[:100] if ultimo_mensaje else None,
            "last_message_direction": ultimo_mensaje.direction if ultimo_mensaje else None,
        })

    return {
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "conversaciones": resultado,
    }


@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve todos los mensajes de una conversación, ordenados por fecha.
    Verifica que la conversación pertenezca al tenant del usuario.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    # Verificar que la conversación es de este tenant
    conversacion = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not conversacion:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    mensajes = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    return {
        "conversation_id": conversation_id,
        "mensajes": [
            {
                "id": m.id,
                "body": m.body,
                "direction": m.direction,
                "status": m.status,
                "channel": m.channel,
                "generated_by_ai": m.generated_by_ai,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in mensajes
        ],
    }


# ── Webhook de Meta ────────────────────────────────────────────────────────────

@router.get("/webhook")
def verify_webhook(
    hub_mode: Optional[str] = Query(default=None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(default=None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(default=None, alias="hub.challenge"),
):
    """
    Verificación del webhook de Meta.

    Cuando configuras el webhook en Meta Business, Meta hace un GET a esta URL
    con estos 3 parámetros. Si el verify_token coincide con el nuestro,
    devolvemos el challenge como texto plano — eso le confirma a Meta que el endpoint es válido.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return PlainTextResponse(content=hub_challenge or "")

    raise HTTPException(status_code=403, detail="Verify token inválido")


@router.post("/webhook")
async def receive_webhook(
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Recibe mensajes entrantes de WhatsApp desde Meta.

    Este endpoint NO requiere autenticación — Meta lo llama directamente.
    Parsea el payload y crea registros en la BD para cada mensaje recibido.

    En producción, se debería rutear por tenant según el phone_number_id.
    Por ahora usamos "webhook" como tenant_id de placeholder.
    """
    whatsapp_service = WhatsAppService()
    mensajes = whatsapp_service.parse_webhook(payload)

    procesados = 0
    for msg in mensajes:
        # En producción: determinar tenant_id a partir del phone_number_id del webhook
        # Por ahora usamos un tenant_id placeholder
        servicio = MessageService(db=db, tenant_id="webhook")
        resultado = await servicio.handle_incoming(
            from_number=msg["from_number"],
            body=msg["body"],
            external_id=msg["message_id"],
        )
        if resultado.get("processed"):
            procesados += 1

    return {"status": "ok", "mensajes_procesados": procesados}
