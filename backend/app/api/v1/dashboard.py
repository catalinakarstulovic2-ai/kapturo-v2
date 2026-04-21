"""
Endpoints del Dashboard — métricas reales de la cuenta.
"""
from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User
from app.models.prospect import Prospect
from app.models.pipeline import PipelineStage, PipelineCard
from app.models.message import Conversation, Message, MessageDirection
from app.models.licitacion_cache import LicitacionCache

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.post("/alertas-licitacion/{codigo}/leer")
def marcar_alerta_leida(
    codigo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca una alerta de cambio de estado como leída."""
    row = db.query(LicitacionCache).filter_by(codigo=codigo).first()
    if row:
        row.alerta_leida = True
        db.commit()
    return {"ok": True}


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
            "monto_pipeline": 0, "monto_ganado_mes": 0,
            "tasa_conversion": 0, "dias_promedio_pipeline": 0,
            "conversaciones_sin_responder": 0, "prospectos_sin_contactar": 0,
            "licitaciones_proximas": [],
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

    # ── Métricas de negocio ───────────────────────────────────────────────────

    # Monto total en pipeline (suma licitacion_monto de prospectos activos en pipeline)
    monto_pipeline = (
        db.query(func.sum(Prospect.licitacion_monto))
        .filter(
            Prospect.tenant_id == tid,
            Prospect.excluido == False,
            Prospect.in_pipeline == True,
        )
        .scalar()
    ) or 0

    # Monto ganado este mes (prospects en etapas "won" cuyas cards se movieron este mes)
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    won_stage_ids = [e["id"] for e in pipeline_por_etapa if e["is_won"]]
    monto_ganado_mes = 0
    if won_stage_ids:
        monto_ganado_mes = (
            db.query(func.sum(Prospect.licitacion_monto_adjudicado))
            .join(PipelineCard, PipelineCard.prospect_id == Prospect.id)
            .filter(
                Prospect.tenant_id == tid,
                Prospect.excluido == False,
                PipelineCard.stage_id.in_(won_stage_ids),
                PipelineCard.updated_at >= inicio_mes,
            )
            .scalar()
        ) or 0

    # Tasa de conversión: ganados totales / total prospectos
    total_ganados = sum(e["count"] for e in pipeline_por_etapa if e["is_won"])
    tasa_conversion = round((total_ganados / total_prospectos * 100), 1) if total_prospectos > 0 else 0.0

    # Días promedio en pipeline (cards en etapas activas, no won/lost)
    active_stage_ids = [e["id"] for e in pipeline_por_etapa if not e["is_won"] and not e["is_lost"]]
    dias_promedio_pipeline = 0
    if active_stage_ids:
        cards_activas = (
            db.query(PipelineCard)
            .filter(
                PipelineCard.tenant_id == tid,
                PipelineCard.stage_id.in_(active_stage_ids),
            )
            .all()
        )
        if cards_activas:
            dias = [(ahora - c.created_at).days for c in cards_activas if c.created_at]
            dias_promedio_pipeline = round(sum(dias) / len(dias)) if dias else 0

    # ── Métricas de actividad ─────────────────────────────────────────────────

    # Conversaciones sin responder: abiertas cuyo último mensaje fue inbound
    latest_dir_subq = (
        db.query(Message.direction)
        .filter(
            Message.conversation_id == Conversation.id,
            Message.tenant_id == tid,
        )
        .order_by(Message.created_at.desc())
        .limit(1)
        .correlate(Conversation)
        .scalar_subquery()
    )
    conversaciones_sin_responder = (
        db.query(func.count(Conversation.id))
        .filter(
            Conversation.tenant_id == tid,
            Conversation.is_open == True,
            latest_dir_subq == MessageDirection.inbound,
        )
        .scalar()
    ) or 0

    # Prospectos sin contactar: no en pipeline y sin ninguna conversación iniciada
    prospectos_sin_contactar = (
        base_q
        .filter(
            Prospect.in_pipeline == False,
            ~Prospect.id.in_(
                db.query(Conversation.prospect_id)
                .filter(Conversation.tenant_id == tid)
                .distinct()
            ),
        )
        .count()
    )

    # ── Alertas de cambio de estado en licitaciones ─────────────────────────
    alertas_rows = (
        db.query(LicitacionCache)
        .filter(
            LicitacionCache.alerta_nueva == True,
            LicitacionCache.alerta_leida == False,
        )
        .order_by(LicitacionCache.updated_at.desc())
        .limit(10)
        .all()
    )
    alertas_licitacion = [
        {
            "codigo":           r.codigo,
            "nombre":           r.nombre,
            "organismo":        r.organismo,
            "estado_anterior":  r.estado_anterior,
            "estado":           r.estado,
            "updated_at":       r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in alertas_rows
    ]

    # ── Licitaciones próximas a cerrar (caché global, sin filtro tenant) ──────
    hoy_str       = date.today().isoformat()
    en_7_dias_str = (date.today() + timedelta(days=7)).strftime("%Y-%m-%dT23:59:59")

    licitaciones_proximas_rows = (
        db.query(LicitacionCache)
        .filter(
            LicitacionCache.estado == "publicada",
            LicitacionCache.fecha_cierre >= hoy_str,
            LicitacionCache.fecha_cierre <= en_7_dias_str,
        )
        .order_by(LicitacionCache.fecha_cierre.asc())
        .limit(6)
        .all()
    )
    licitaciones_proximas = [
        {
            "codigo":         r.codigo,
            "nombre":         r.nombre,
            "organismo":      r.organismo,
            "fecha_cierre":   r.fecha_cierre,
            "monto_estimado": r.monto_estimado,
        }
        for r in licitaciones_proximas_rows
    ]

    return {
        "total_prospectos":           total_prospectos,
        "calificados":                calificados,
        "en_pipeline":                total_cards,
        "esta_semana":                esta_semana,
        "alarmas_pendientes":         len(alarmas_lista),
        "alarmas_lista":              alarmas_lista,
        "pipeline_por_etapa":         pipeline_por_etapa,
        "top_prospectos":             top_lista,
        # Métricas de negocio
        "monto_pipeline":             monto_pipeline,
        "monto_ganado_mes":           monto_ganado_mes,
        "tasa_conversion":            tasa_conversion,
        "dias_promedio_pipeline":     dias_promedio_pipeline,
        # Métricas de actividad
        "conversaciones_sin_responder": conversaciones_sin_responder,
        "prospectos_sin_contactar":   prospectos_sin_contactar,
        # Licitaciones próximas
        "licitaciones_proximas":      licitaciones_proximas,
        # Alertas de cambio de estado
        "alertas_licitacion":         alertas_licitacion,
    }
