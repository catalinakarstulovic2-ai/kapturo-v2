"""
Micro-feedback por paso del flujo.
Registra la experiencia del usuario después de cada acción clave.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User

router = APIRouter(prefix="/feedback", tags=["feedback"])


class StepFeedbackRequest(BaseModel):
    paso: str                    # "perfil", "busqueda", "guardar", "analisis", "documentos"
    reaccion: str                # "facil", "dificil", "muchos_pasos", "confuso", "omitido"
    comentario: Optional[str] = None
    pagina: Optional[str] = None


@router.post("/step")
def registrar_step_feedback(
    data: StepFeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Guarda el micro-feedback de un paso del flujo."""
    from sqlalchemy import text
    try:
        db.execute(text("""
            INSERT INTO step_feedback (id, user_id, tenant_id, paso, reaccion, comentario, pagina, timestamp)
            VALUES (:id, :uid, :tid, :paso, :reaccion, :comentario, :pagina, :ts)
        """), {
            "id": str(uuid.uuid4()),
            "uid": current_user.id,
            "tid": current_user.tenant_id,
            "paso": data.paso,
            "reaccion": data.reaccion,
            "comentario": data.comentario,
            "pagina": data.pagina,
            "ts": datetime.now(timezone.utc),
        })
        db.commit()
    except Exception:
        pass  # silencioso — el feedback nunca debe bloquear el flujo
    return {"ok": True}


@router.get("/summary")
def resumen_feedback(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resumen de feedback por paso (solo admins)."""
    from sqlalchemy import text
    if current_user.role not in ("admin", "super_admin"):
        return {}
    try:
        rows = db.execute(text("""
            SELECT paso, reaccion, COUNT(*) as total
            FROM step_feedback
            GROUP BY paso, reaccion
            ORDER BY paso, total DESC
        """)).fetchall()
        result: dict = {}
        for paso, reaccion, total in rows:
            if paso not in result:
                result[paso] = {}
            result[paso][reaccion] = total
        return result
    except Exception:
        return {}
