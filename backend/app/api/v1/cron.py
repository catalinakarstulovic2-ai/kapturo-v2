"""
Endpoints de cron jobs para tareas programadas.

Diseñado para ser llamado por Railway Cron (o cualquier scheduler externo)
con un header de autenticación simple usando CRON_SECRET.

Endpoints:
  POST /cron/alarmas  — envía notificaciones de prospectos con alarma vencida
"""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.prospect import Prospect
from app.models.tenant import Tenant
from app.models.user import User
from app.services.email_service import EmailService
from app.services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/cron", tags=["cron"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _verify_cron(x_cron_secret: Optional[str] = Header(default=None)):
    """
    Valida el header X-Cron-Secret.
    Si CRON_SECRET no está configurado en .env, permite la llamada sin restricción
    (útil en desarrollo). En producción deberías siempre configurarlo.
    """
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Cron secret inválido")


@router.post("/alarmas")
async def run_alarmas(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Revisa todos los prospectos con alarma vencida (alarma_fecha <= ahora) y:
      1. Envía un email al usuario admin del tenant (si tiene email configurado)
      2. Limpia alarma_fecha para que no se re-envíe en el siguiente ciclo

    Llamar cada hora desde Railway Cron:
      Path: POST /api/v1/cron/alarmas
      Header: X-Cron-Secret: <tu_cron_secret>

    Returns: {"enviados": N, "errores": [...]}
    """
    ahora = datetime.now(timezone.utc)

    prospectos = (
        db.query(Prospect)
        .filter(
            Prospect.alarma_fecha != None,
            Prospect.alarma_fecha <= ahora,
            Prospect.excluido == False,
        )
        .all()
    )

    email_service = EmailService()
    enviados = 0
    errores = []

    for prospecto in prospectos:
        try:
            # Obtener el tenant y su admin para saber a quién notificar
            tenant = db.query(Tenant).filter(Tenant.id == prospecto.tenant_id).first()
            if not tenant:
                continue

            # Buscar el admin del tenant (primer usuario con rol admin o el primero disponible)
            admin_user = (
                db.query(User)
                .filter(
                    User.tenant_id == prospecto.tenant_id,
                    User.is_active == True,
                )
                .order_by(User.created_at.asc())
                .first()
            )

            nombre_prospecto = (
                prospecto.contact_name or prospecto.company_name or f"Prospecto {prospecto.id[:6]}"
            )

            # ── Notificar por email ─────────────────────────────────────────────
            if admin_user and admin_user.email:
                try:
                    await email_service.send_alarm_notification(
                        to=admin_user.email,
                        prospect_name=nombre_prospecto,
                        alarm_reason=prospecto.alarma_motivo or "",
                        prospect_id=prospecto.id,
                    )
                except Exception as e:
                    errores.append({"prospect_id": prospecto.id, "tipo": "email", "error": str(e)})

            # ── Notificar por WhatsApp (si el admin tiene WA configurado) ────────
            tenant_keys = tenant.api_keys or {}
            wa_token = tenant_keys.get("whatsapp_token")
            wa_phone_id = tenant_keys.get("whatsapp_phone_number_id")
            admin_phone = tenant_keys.get("admin_whatsapp")  # número personal del admin en el tenant

            if wa_token and wa_phone_id and admin_phone:
                try:
                    wa = WhatsAppService(token=wa_token, phone_number_id=wa_phone_id)
                    motivo = prospecto.alarma_motivo or "Sin motivo registrado"
                    await wa.send_text(
                        to=admin_phone,
                        body=(
                            f"🔔 *Alarma Kapturo*\n\n"
                            f"Tienes un recordatorio para hoy:\n"
                            f"*{nombre_prospecto}*\n"
                            f"_{motivo}_\n\n"
                            f"Entra a app.kapturo.cl para ver el detalle."
                        ),
                    )
                except Exception as e:
                    errores.append({"prospect_id": prospecto.id, "tipo": "whatsapp", "error": str(e)})

            # ── Limpiar la alarma para no reenviar ──────────────────────────────
            prospecto.alarma_fecha = None
            prospecto.alarma_motivo = None
            enviados += 1

        except Exception as e:
            errores.append({"prospect_id": prospecto.id, "tipo": "general", "error": str(e)})

    db.commit()

    return {
        "status": "ok",
        "revisados": len(prospectos),
        "enviados": enviados,
        "errores": errores,
    }
