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

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User
from app.models.bug_report import BugReport

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

    return {"ok": True, "id": report.id}
