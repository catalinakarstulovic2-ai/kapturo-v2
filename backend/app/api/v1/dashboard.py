"""
Endpoints del Dashboard — métricas reales de la cuenta.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User
from app.models.prospect import Prospect
from app.models.pipeline import PipelineStage, PipelineCard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def obtener_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve métricas reales del tenant para el dashboard principal.
    """
    tid = current_user.tenant_id

    # Super admin sin tenant → devuelve zeros (ver su panel en /superadmin)
    if tid is None:
        return {
            "total_prospectos": 0, "calificados": 0, "en_pipeline": 0,
            "esta_semana": 0, "alarmas_pendientes": 0, "alarmas_lista": [],
            "pipeline_por_etapa": [], "top_prospectos": [],
        }

    ahora = datetime.now(timezone.utc)
    hace_7_dias = ahora - timedelta(days=7)
    manana = ahora + timedelta(days=1)

    # ── Prospectos ────────────────────────────────────────────────────────────
    base_q = db.query(Prospect).filter(
        Prospect.tenant_id == tid,
        Prospect.excluido == False,
    )

    total_prospectos = base_q.count()

    calificados = base_q.filter(Prospect.score >= 60).count()

    en_pipeline = base_q.filter(Prospect.in_pipeline == True).count()

    esta_semana = base_q.filter(Prospect.created_at >= hace_7_dias).count()

    # Alarmas: vencidas o que vencen hoy (alarma_fecha <= mañana y >= hace 30 días)
    alarmas_pendientes = base_q.filter(
        Prospect.alarma_fecha != None,
        Prospect.alarma_fecha <= manana,
        Prospect.alarma_fecha >= ahora - timedelta(days=30),
    ).order_by(Prospect.alarma_fecha.asc()).all()

    alarmas_lista = [
        {
            "id": p.id,
            "company_name": p.company_name,
            "alarma_fecha": p.alarma_fecha.isoformat() if p.alarma_fecha else None,
            "alarma_motivo": p.alarma_motivo,
            "score": p.score,
            "vencida": p.alarma_fecha < ahora if p.alarma_fecha else False,
        }
        for p in alarmas_pendientes[:6]
    ]

    # Top prospectos aún no en pipeline, ordenados por score
    top_prospectos = (
        base_q.filter(Prospect.in_pipeline == False, Prospect.score >= 50)
        .order_by(Prospect.score.desc())
        .limit(5)
        .all()
    )

    top_lista = [
        {
            "id": p.id,
            "company_name": p.company_name,
            "contact_name": p.contact_name,
            "city": p.city,
            "score": p.score,
            "web_status": p.web_status,
            "source_module": p.source_module,
            "phone": p.phone,
            "email": p.email,
        }
        for p in top_prospectos
    ]

    # ── Pipeline ──────────────────────────────────────────────────────────────
    etapas = (
        db.query(PipelineStage)
        .filter(PipelineStage.tenant_id == tid)
        .order_by(PipelineStage.order)
        .all()
    )

    pipeline_por_etapa = []
    total_cards = 0
    for etapa in etapas:
        count = (
            db.query(PipelineCard)
            .filter(
                PipelineCard.stage_id == etapa.id,
                PipelineCard.tenant_id == tid,
            )
            .count()
        )
        pipeline_por_etapa.append({
            "id": etapa.id,
            "name": etapa.name,
            "color": etapa.color,
            "count": count,
            "is_won": etapa.is_won,
            "is_lost": etapa.is_lost,
        })
        total_cards += count

    return {
        "total_prospectos": total_prospectos,
        "calificados": calificados,
        "en_pipeline": total_cards,
        "esta_semana": esta_semana,
        "alarmas_pendientes": len(alarmas_lista),
        "alarmas_lista": alarmas_lista,
        "pipeline_por_etapa": pipeline_por_etapa,
        "top_prospectos": top_lista,
    }
