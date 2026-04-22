"""
Helper para registrar actividad de usuarios.
Uso:
    from app.services.activity_service import log_activity
    log_activity(db, user, "busqueda_normal", resource_name="construcción")
"""
import uuid
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog
from app.models.user import User


def log_activity(
    db: Session,
    user: User,
    action: str,
    resource_id: str = None,
    resource_name: str = None,
):
    """Registra una acción de usuario. No lanza excepción si falla."""
    try:
        entry = ActivityLog(
            id=str(uuid.uuid4()),
            user_id=str(user.id),
            tenant_id=str(user.tenant_id) if user.tenant_id else None,
            action=action,
            resource_id=resource_id,
            resource_name=resource_name,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
