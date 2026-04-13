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
from pydantic import BaseModel

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.core.config import settings
from app.models.user import User
from app.models.message import Message, Conversation
from app.models.tenant import Tenant
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


# ── Envío directo desde inbox ──────────────────────────────────────────────────

class DirectMessageBody(BaseModel):
    body: str


@router.post("/conversations/{conversation_id}/send-direct")
async def send_direct_message(
    conversation_id: str,
    payload: DirectMessageBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Envía un mensaje de texto directamente desde el inbox sin flujo de aprobación IA.
    El mensaje se crea y se envía por WhatsApp en el mismo request.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    servicio = MessageService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.send_direct_message(
        conversation_id=conversation_id,
        body=payload.body.strip(),
    )

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

    Ruteamos por tenant según el phone_number_id que Meta incluye en cada change.
    Si ningún tenant tiene ese número configurado, descartamos silenciosamente.
    """
    whatsapp_service = WhatsAppService()
    mensajes = whatsapp_service.parse_webhook(payload)

    # Extraer phone_number_id del primer change del payload para routing
    def _extract_phone_number_id(raw: dict) -> str | None:
        try:
            return raw["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
        except (KeyError, IndexError, TypeError):
            return None

    raw_phone_id = _extract_phone_number_id(payload)

    # Buscar tenant por su whatsapp_phone_number_id en api_keys
    tenant_id: str | None = None
    if raw_phone_id:
        tenants = db.query(Tenant).all()
        for t in tenants:
            keys = t.api_keys or {}
            if keys.get("whatsapp_phone_number_id") == raw_phone_id:
                tenant_id = t.id
                break

    # Fallback: si coincide con la variable global de entorno
    if not tenant_id and raw_phone_id and raw_phone_id == settings.WHATSAPP_PHONE_NUMBER_ID:
        first_tenant = db.query(Tenant).first()
        if first_tenant:
            tenant_id = first_tenant.id

    if not tenant_id:
        # Webhook de Meta para un número no registrado — ignorar
        return {"status": "ok", "mensajes_procesados": 0}

    procesados = 0
    for msg in mensajes:
        servicio = MessageService(db=db, tenant_id=tenant_id)
        resultado = await servicio.handle_incoming(
            from_number=msg["from_number"],
            body=msg["body"],
            external_id=msg["message_id"],
        )
        if resultado.get("processed"):
            procesados += 1

    return {"status": "ok", "mensajes_procesados": procesados}
