"""
WhatsApp Service — integración con Meta Cloud API.

Este servicio es el puente entre Kapturo y WhatsApp Business.
Se encarga de:
  - Enviar mensajes de texto y plantillas a prospectos
  - Parsear los webhooks entrantes de Meta
  - Marcar mensajes como leídos
"""
import httpx
from fastapi import HTTPException
from app.core.config import settings

BASE_URL = "https://graph.facebook.com/v20.0"


class WhatsAppService:
    def __init__(self, token: str = None, phone_number_id: str = None):
        self.token = token or settings.WHATSAPP_TOKEN
        self.phone_number_id = phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID

    async def send_text(self, to: str, body: str) -> dict:
        """
        Envía un mensaje de texto simple a un número de WhatsApp.

        :param to: Número de teléfono del destinatario (formato internacional, ej. 56912345678)
        :param body: Texto del mensaje
        :returns: Respuesta JSON de Meta
        :raises HTTPException: Si el token o el phone_number_id no están configurados
        """
        if not self.token or not self.phone_number_id:
            raise HTTPException(
                status_code=400,
                detail="WhatsApp no configurado: falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env"
            )

        url = f"{BASE_URL}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()

    async def send_template(
        self,
        to: str,
        template_name: str,
        language: str = "es",
        components: list = None,
    ) -> dict:
        """
        Envía un mensaje usando una plantilla aprobada por Meta.

        :param to: Número de teléfono destinatario
        :param template_name: Nombre de la plantilla creada en Meta Business
        :param language: Código de idioma (por defecto "es" para español)
        :param components: Variables de la plantilla (header, body, buttons)
        :returns: Respuesta JSON de Meta
        """
        if not self.token or not self.phone_number_id:
            raise HTTPException(
                status_code=400,
                detail="WhatsApp no configurado: falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env"
            )

        url = f"{BASE_URL}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": components or [],
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()

    def parse_webhook(self, payload: dict) -> list[dict]:
        """
        Transforma el payload de webhook de Meta en una lista de mensajes normalizados.

        Meta envía una estructura muy anidada. Este método la aplana a algo útil:
        [{from_number, body, message_id, timestamp, type}]

        :param payload: Dict con el JSON del webhook de Meta
        :returns: Lista de dicts con los mensajes. Lista vacía si solo es un status update.
        """
        messages = []
        try:
            entries = payload.get("entry", [])
            for entry in entries:
                changes = entry.get("changes", [])
                for change in changes:
                    value = change.get("value", {})
                    raw_messages = value.get("messages", [])
                    for msg in raw_messages:
                        msg_type = msg.get("type", "text")
                        # Extraemos el cuerpo dependiendo del tipo
                        if msg_type == "text":
                            body = msg.get("text", {}).get("body", "")
                        else:
                            # Para audio, imagen, etc., dejamos el tipo como referencia
                            body = f"[{msg_type}]"

                        messages.append({
                            "from_number": msg.get("from"),
                            "body": body,
                            "message_id": msg.get("id"),
                            "timestamp": msg.get("timestamp"),
                            "type": msg_type,
                        })
        except Exception:
            # Si la estructura no es la esperada, devolvemos lista vacía
            return []

        return messages

    async def mark_as_read(self, message_id: str) -> dict:
        """
        Marca un mensaje entrante como leído (doble check azul en WhatsApp).

        :param message_id: ID del mensaje de WhatsApp a marcar
        :returns: Respuesta JSON de Meta
        """
        if not self.token or not self.phone_number_id:
            raise HTTPException(
                status_code=400,
                detail="WhatsApp no configurado: falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env"
            )

        url = f"{BASE_URL}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
