"""
Endpoints para reportes de problemas (bug reports).
Cualquier usuario autenticado puede crear un reporte.
Solo super-admin puede listarlos (en admin.py).
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import base64
import logging

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.bug_report import BugReport
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bug-reports", tags=["bug-reports"])


@router.post("", status_code=201)
async def crear_bug_report(
    descripcion: str = Form(...),
    pagina: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cualquier usuario autenticado puede enviar un reporte de problema.
    La imagen (si viene) se guarda como base64 en la BD.
    """
    screenshot_b64 = None
    screenshot_mime = None

    if screenshot and screenshot.filename:
        content = await screenshot.read()
        # Limitar a 5 MB
        if len(content) <= 5 * 1024 * 1024:
            screenshot_b64 = base64.b64encode(content).decode("utf-8")
            screenshot_mime = screenshot.content_type or "image/png"

    report = BugReport(
        id=str(uuid.uuid4()),
        user_id=str(current_user.id),
        user_email=current_user.email,
        user_name=current_user.full_name,
        tenant_id=str(current_user.tenant_id) if current_user.tenant_id else None,
        descripcion=descripcion,
        screenshot_base64=screenshot_b64,
        screenshot_mime=screenshot_mime,
        pagina=pagina,
    )
    db.add(report)

    # También registrar como actividad
    from app.models.activity_log import ActivityLog
    log = ActivityLog(
        id=str(uuid.uuid4()),
        user_id=str(current_user.id),
        tenant_id=str(current_user.tenant_id) if current_user.tenant_id else None,
        action="reportar_problema",
        resource_name=descripcion[:100] if descripcion else None,
    )
    db.add(log)
    db.commit()

    # Notificar al super admin por email
    if settings.RESEND_API_KEY and settings.SUPER_ADMIN_EMAIL:
        try:
            pagina_html = f"<br><strong>Página:</strong> {pagina}" if pagina else ""
            html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #7c3aed;">🐛 Nuevo reporte de problema — Kapturo</h2>
                <div style="background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 16px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Descripción:</strong></p>
                    <p style="margin: 0; color: #333;">{descripcion}</p>
                </div>
                <p style="color: #555; font-size: 14px;">
                    <strong>Reportado por:</strong> {current_user.full_name or current_user.email} ({current_user.email}){pagina_html}
                </p>
                <a href="https://app.kapturo.cl/superadmin"
                   style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px;
                          border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 8px;">
                    Ver reportes en SuperAdmin
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">Kapturo · Plataforma de prospección B2B</p>
            </div>
            """
            svc = EmailService()
            import asyncio
            asyncio.create_task(svc.send(
                to=settings.SUPER_ADMIN_EMAIL,
                subject=f"🐛 Nuevo reporte de problema de {current_user.email}",
                html=html,
            ))
        except Exception as e:
            logger.warning(f"No se pudo enviar email de bug report: {e}")

    return {"ok": True, "id": report.id}
