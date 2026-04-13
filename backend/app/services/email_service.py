"""
Email Service — envío de correos transaccionales vía Resend.

Usa httpx directamente (ya instalado) para llamar a la API de Resend.
No requiere paquete adicional.

Uso:
    svc = EmailService()
    await svc.send(
        to="usuario@empresa.cl",
        subject="Alarma de seguimiento",
        html="<p>Tienes un prospecto con alarma hoy.</p>",
    )
"""
import httpx
from app.core.config import settings

RESEND_API_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "Kapturo <notificaciones@kapturo.cl>"


class EmailService:
    def __init__(self):
        self.api_key = settings.RESEND_API_KEY

    async def send(self, to: str, subject: str, html: str) -> dict:
        """
        Envía un email transaccional.

        :param to: Dirección destino, ej. "cliente@empresa.cl"
        :param subject: Asunto del correo
        :param html: Cuerpo en HTML
        :returns: Respuesta de la API de Resend {"id": "..."}
        :raises httpx.HTTPStatusError: Si Resend devuelve error
        """
        if not self.api_key:
            raise ValueError("RESEND_API_KEY no configurada en .env")

        payload = {
            "from": FROM_ADDRESS,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(RESEND_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()

    async def send_alarm_notification(
        self,
        to: str,
        prospect_name: str,
        alarm_reason: str,
        prospect_id: str,
    ) -> dict:
        """
        Plantilla específica para notificaciones de alarma de prospectos.
        """
        html = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">🔔 Alarma de seguimiento — Kapturo</h2>
            <p>Tienes un recordatorio para hoy:</p>
            <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <strong>{prospect_name}</strong><br>
                <span style="color: #555;">{alarm_reason or "Sin motivo registrado"}</span>
            </div>
            <a href="https://app.kapturo.cl/prospectos/{prospect_id}"
               style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px;
                      border-radius: 6px; text-decoration: none; font-weight: bold;">
                Ver prospecto
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
                Kapturo · Plataforma de prospección B2B
            </p>
        </div>
        """
        return await self.send(
            to=to,
            subject=f"🔔 Alarma: {prospect_name} — Kapturo",
            html=html,
        )
