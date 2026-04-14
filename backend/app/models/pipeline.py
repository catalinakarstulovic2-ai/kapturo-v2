import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class PipelineStage(Base):
    """Etapas del pipeline — cada tenant puede definir las suyas."""
    __tablename__ = "pipeline_stages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)   # "Nuevo", "Contactado", etc.
    color: Mapped[str] = mapped_column(String(20), default="#6366f1") # Color del badge en la UI
    order: Mapped[int] = mapped_column(Integer, default=0)            # Posición en el tablero
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)      # Etapa de cierre ganado
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False)     # Etapa de cierre perdido
    auto_move_score_below: Mapped[float] = mapped_column(Float, nullable=True)  # Mover auto si score < X
    pipeline_type: Mapped[str] = mapped_column(String(50), default="general", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    cards: Mapped[list["PipelineCard"]] = relationship(back_populates="stage")


class PipelineCard(Base):
    """Cada lead en el pipeline — una tarjeta en el tablero Kanban."""
    __tablename__ = "pipeline_cards"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    prospect_id: Mapped[str] = mapped_column(ForeignKey("prospects.id"), nullable=False)
    stage_id: Mapped[str] = mapped_column(ForeignKey("pipeline_stages.id"), nullable=False)
    assigned_to: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    next_action_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    stage: Mapped["PipelineStage"] = relationship(back_populates="cards")
