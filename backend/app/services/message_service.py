"""
Message Service — ciclo de vida completo de los mensajes.

Gestiona todo lo que ocurre con un mensaje en Kapturo:
  - Enviar mensajes aprobados por WhatsApp
  - Listar mensajes pendientes de aprobación
  - Obtener o crear conversaciones
  - Procesar mensajes entrantes del webhook
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.message import Message, Conversation, MessageStatus, MessageChannel, MessageDirection
from app.models.prospect import Prospect
from app.models.tenant import Tenant
from app.services.whatsapp_service import WhatsAppService


class MessageService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        # Leer claves del tenant (fallback a .env si no tiene)
        keys = self._get_tenant_keys()
        self.whatsapp = WhatsAppService(
            token=keys.get("whatsapp_token"),
            phone_number_id=keys.get("whatsapp_phone_number_id"),
        )

    def _get_tenant_keys(self) -> dict:
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        return tenant.api_keys or {} if tenant else {}

    async def send_approved_message(self, message_id: str) -> dict:
        """
        Envía un mensaje que ya fue aprobado por un admin.

        Flujo:
        1. Verifica que el mensaje existe, es del tenant correcto y tiene status "approved"
        2. Obtiene la conversación → el prospecto → su número de WhatsApp
        3. Llama a WhatsAppService.send_text()
        4. Actualiza el status del mensaje a "sent" y guarda sent_at

        :param message_id: UUID del mensaje a enviar
        :returns: {"sent": True, "message_id": message_id}
        :raises HTTPException: Si el mensaje no existe, no está aprobado o el prospecto no tiene teléfono
        """
        # 1. Buscar el mensaje
        mensaje = (
            self.db.query(Message)
            .filter(
                Message.id == message_id,
                Message.tenant_id == self.tenant_id,
            )
            .first()
        )
        if not mensaje:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")

        if mensaje.status != MessageStatus.approved:
            raise HTTPException(
                status_code=400,
                detail=f"El mensaje no está aprobado (estado actual: {mensaje.status})"
            )

        # 2. Obtener conversación y prospecto
        conversacion = (
            self.db.query(Conversation)
            .filter(Conversation.id == mensaje.conversation_id)
            .first()
        )
        if not conversacion:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")

        prospecto = (
            self.db.query(Prospect)
            .filter(
                Prospect.id == conversacion.prospect_id,
                Prospect.tenant_id == self.tenant_id,
            )
            .first()
        )
        if not prospecto:
            raise HTTPException(status_code=404, detail="Prospecto no encontrado")

        # Usar whatsapp primero, si no hay usar phone
        telefono = prospecto.whatsapp or prospecto.phone
        if not telefono:
            raise HTTPException(
                status_code=400,
                detail="El prospecto no tiene número de WhatsApp ni teléfono registrado"
            )

        # 3. Enviar por WhatsApp
        await self.whatsapp.send_text(to=telefono, body=mensaje.body)

        # 4. Actualizar status del mensaje
        mensaje.status = MessageStatus.sent
        mensaje.sent_at = datetime.now(timezone.utc)
        self.db.commit()

        return {"sent": True, "message_id": message_id}

    def get_pending_messages(self) -> list:
        """
        Lista todos los mensajes pendientes de aprobación del tenant.

        Hace un JOIN con conversación y prospecto para incluir contexto.

        :returns: Lista de dicts con {id, body, channel, generated_by_ai, created_at,
                  prospect_name, prospect_phone}
        """
        mensajes = (
            self.db.query(Message, Conversation, Prospect)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .join(Prospect, Conversation.prospect_id == Prospect.id)
            .filter(
                Message.tenant_id == self.tenant_id,
                Message.status == MessageStatus.pending_approval,
            )
            .order_by(Message.created_at.desc())
            .all()
        )

        resultado = []
        for mensaje, conversacion, prospecto in mensajes:
            resultado.append({
                "id": mensaje.id,
                "body": mensaje.body,
                "channel": mensaje.channel,
                "generated_by_ai": mensaje.generated_by_ai,
                "created_at": mensaje.created_at.isoformat() if mensaje.created_at else None,
                "prospect_name": prospecto.contact_name or prospecto.company_name or "Sin nombre",
                "prospect_phone": prospecto.whatsapp or prospecto.phone or "",
            })

        return resultado

    def get_conversation(self, prospect_id: str, channel: str = "whatsapp") -> Conversation:
        """
        Obtiene la conversación activa para un prospecto+canal, o la crea si no existe.

        :param prospect_id: UUID del prospecto
        :param channel: Canal de comunicación ("whatsapp" o "email")
        :returns: Objeto Conversation
        """
        canal_enum = MessageChannel(channel)

        conversacion = (
            self.db.query(Conversation)
            .filter(
                Conversation.tenant_id == self.tenant_id,
                Conversation.prospect_id == prospect_id,
                Conversation.channel == canal_enum,
                Conversation.is_open == True,
            )
            .first()
        )

        if not conversacion:
            conversacion = Conversation(
                tenant_id=self.tenant_id,
                prospect_id=prospect_id,
                channel=canal_enum,
                is_open=True,
            )
            self.db.add(conversacion)
            self.db.commit()
            self.db.refresh(conversacion)

        return conversacion

    async def handle_incoming(
        self,
        from_number: str,
        body: str,
        external_id: str,
    ) -> dict:
        """
        Procesa un mensaje entrante del webhook de WhatsApp.

        Flujo:
        1. Busca el prospecto por su número de WhatsApp o teléfono
        2. Obtiene o crea la conversación
        3. Crea un registro de mensaje (direction=inbound, status=delivered)
        4. Actualiza last_message_at de la conversación

        :param from_number: Número que envió el mensaje (viene de Meta)
        :param body: Texto del mensaje
        :param external_id: ID del mensaje en WhatsApp (para evitar duplicados)
        :returns: {"processed": True}
        """
        # 1. Buscar prospecto por whatsapp o phone
        prospecto = (
            self.db.query(Prospect)
            .filter(
                Prospect.tenant_id == self.tenant_id,
                # Buscamos en whatsapp o phone
            )
            .filter(
                (Prospect.whatsapp == from_number) | (Prospect.phone == from_number)
            )
            .first()
        )

        if not prospecto:
            # Prospecto desconocido — igualmente guardamos la conversación
            # Esto puede pasar si alguien escribe sin haber sido ingresado al sistema
            return {"processed": False, "reason": "Prospecto no encontrado"}

        # 2. Obtener o crear conversación
        conversacion = self.get_conversation(
            prospect_id=prospecto.id,
            channel="whatsapp",
        )

        # 3. Crear el mensaje entrante
        mensaje = Message(
            tenant_id=self.tenant_id,
            conversation_id=conversacion.id,
            direction=MessageDirection.inbound,
            channel=MessageChannel.whatsapp,
            status=MessageStatus.delivered,
            body=body,
            external_id=external_id,
            generated_by_ai=False,
        )
        self.db.add(mensaje)

        # 4. Actualizar last_message_at
        conversacion.last_message_at = datetime.now(timezone.utc)
        self.db.commit()

        return {"processed": True}
