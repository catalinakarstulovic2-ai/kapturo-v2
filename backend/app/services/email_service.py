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
FROM_ADDRESS = "Kapturo <onboarding@resend.dev>"


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
        return await self.send(to=to, subject=f"🔔 Alarma: {prospect_name}", html=html)

    async def send_licitaciones_alert(
        self,
        to: str,
        razon_social: str,
        licitaciones: list[dict],
    ) -> dict:
        """
        Alerta diaria de nuevas licitaciones relevantes para la empresa.
        `licitaciones`: lista de dicts con keys: nombre, codigo, organismo, monto_estimado, fecha_cierre, score
        """
        filas_html = ""
        for l in licitaciones[:10]:  # máximo 10 en el email
            score = l.get("score", 0)
            color_score = "#16a34a" if score >= 70 else "#d97706" if score >= 50 else "#6b7280"
            monto = f"${l['monto_estimado']:,.0f}" if l.get("monto_estimado") else "—"
            filas_html += f"""
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 12px 8px;">
                <a href="https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion={l.get('codigo','')}"
                   style="color: #4f46e5; text-decoration: none; font-weight: 500; font-size: 13px;">
                  {l.get('nombre', 'Sin nombre')[:80]}
                </a>
                <br>
                <span style="color: #9ca3af; font-size: 11px;">{l.get('organismo', '')} · {l.get('codigo', '')}</span>
              </td>
              <td style="padding: 12px 8px; text-align: right; white-space: nowrap; font-size: 12px; color: #374151;">{monto}</td>
              <td style="padding: 12px 8px; text-align: center; white-space: nowrap;">
                <span style="background: {color_score}22; color: {color_score}; font-weight: 700; font-size: 12px;
                             padding: 2px 8px; border-radius: 20px;">{score}%</span>
              </td>
            </tr>"""

        total = len(licitaciones)
        plural = "licitación relevante" if total == 1 else "licitaciones relevantes"
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">⚡ Nuevas licitaciones para ti</h1>
            <p style="color: #c7d2fe; margin: 6px 0 0; font-size: 14px;">
              Encontramos <strong style="color: white;">{total} {plural}</strong> hoy para <strong style="color: white;">{razon_social}</strong>
            </p>
          </div>

          <!-- Tabla -->
          <div style="padding: 24px 32px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb;">
                  <th style="text-align: left; padding: 8px; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Licitación</th>
                  <th style="text-align: right; padding: 8px; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Monto est.</th>
                  <th style="text-align: center; padding: 8px; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Fit IA</th>
                </tr>
              </thead>
              <tbody>
                {filas_html}
              </tbody>
            </table>
          </div>

          <!-- CTA -->
          <div style="padding: 0 32px 28px; text-align: center;">
            <a href="https://app.kapturo.cl/licitaciones"
               style="display: inline-block; background: #4f46e5; color: white; padding: 12px 28px;
                      border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Ver todas en Kapturo →
            </a>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 32px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">
              Kapturo · Alerta automática de licitaciones Mercado Público ·
              <a href="https://app.kapturo.cl/licitaciones" style="color: #6b7280;">Gestionar alertas</a>
            </p>
          </div>
        </div>
        """
        return await self.send(
            to=to,
            subject=f"⚡ {total} nueva{'s' if total > 1 else ''} licitación{'es' if total > 1 else ''} para {razon_social}",
            html=html,
        )

