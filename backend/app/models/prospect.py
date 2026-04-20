import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Boolean, DateTime, ForeignKey, Text, Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class ProspectSource(str, enum.Enum):
    mercado_publico = "mercado_publico"
    apollo = "apollo"
    apify_social = "apify_social"
    apify_maps = "apify_maps"
    google_maps = "google_maps"
    apify_linkedin = "apify_linkedin"
    manual = "manual"


class ProspectStatus(str, enum.Enum):
    new = "new"
    qualified = "qualified"
    disqualified = "disqualified"
    contacted = "contacted"
    responded = "responded"
    converted = "converted"


class Prospect(Base):
    """Un prospecto es cualquier persona o empresa que podría convertirse en cliente."""
    __tablename__ = "prospects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    # Datos de la empresa
    company_name: Mapped[str] = mapped_column(String(300), nullable=True)
    rut: Mapped[str] = mapped_column(String(20), nullable=True)   # Para módulo licitaciones (Chile)
    industry: Mapped[str] = mapped_column(String(200), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    website: Mapped[str] = mapped_column(String(500), nullable=True)

    # Datos del contacto
    contact_name: Mapped[str] = mapped_column(String(200), nullable=True)
    contact_title: Mapped[str] = mapped_column(String(200), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    whatsapp: Mapped[str] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str] = mapped_column(String(500), nullable=True)
    address: Mapped[str] = mapped_column(String(500), nullable=True)
    enrichment_source: Mapped[str] = mapped_column(String(100), nullable=True)  # "Apollo","SII","Google","manual"

    # Contexto de licitación — solo para prospectos del módulo licitaciones
    licitacion_codigo: Mapped[str] = mapped_column(String(100), nullable=True)
    licitacion_nombre: Mapped[str] = mapped_column(String(500), nullable=True)
    licitacion_monto: Mapped[float] = mapped_column(Float, nullable=True)
    licitacion_monto_adjudicado: Mapped[float] = mapped_column(Float, nullable=True)
    licitacion_organismo: Mapped[str] = mapped_column(String(300), nullable=True)
    licitacion_categoria: Mapped[str] = mapped_column(String(300), nullable=True)
    licitacion_region: Mapped[str] = mapped_column(String(200), nullable=True)
    licitacion_estado: Mapped[str] = mapped_column(String(100), nullable=True)
    licitacion_fecha_adjudicacion: Mapped[str] = mapped_column(String(50), nullable=True)
    licitacion_fecha_cierre: Mapped[str] = mapped_column(String(50), nullable=True)

    # Estado web y señal de origen (módulo prospector)
    web_status: Mapped[str] = mapped_column(String(50), nullable=True)    # "sin_web" | "solo_redes" | "tiene_web"
    source_url: Mapped[str] = mapped_column(String(1000), nullable=True)  # URL de origen (Google Maps, etc.)
    signal_text: Mapped[str] = mapped_column(Text, nullable=True)         # Señal exacta detectada

    # Estado de postulación (solo módulo licitaciones)
    # Valores: en_preparacion | postulada | evaluando | ganada | perdida
    postulacion_estado: Mapped[str] = mapped_column(String(50), nullable=True)

    # Notas manuales del usuario
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    notes_history: Mapped[str] = mapped_column(Text, nullable=True)       # JSON list de {text, created_at}

    # Exclusión
    excluido: Mapped[bool] = mapped_column(Boolean, default=False)
    excluido_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Alarma de seguimiento
    alarma_fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    alarma_motivo: Mapped[str] = mapped_column(String(500), nullable=True)

    # Historial de licitaciones (enriquecimiento)
    licitaciones_ganadas_count: Mapped[int] = mapped_column(default=0, nullable=True)

    # Pipeline
    in_pipeline: Mapped[bool] = mapped_column(Boolean, default=False)

    # Calificación IA
    score: Mapped[float] = mapped_column(Float, default=0.0)        # 0 a 100
    score_reason: Mapped[str] = mapped_column(Text, nullable=True)  # Por qué le dio ese score
    is_qualified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    source: Mapped[ProspectSource] = mapped_column(PgEnum(ProspectSource))
    source_module: Mapped[str] = mapped_column(String(100), nullable=True)  # "licitaciones", "inmobiliaria", etc.
    raw_data: Mapped[str] = mapped_column(Text, nullable=True)  # JSON con datos originales
    status: Mapped[ProspectStatus] = mapped_column(PgEnum(ProspectStatus), default=ProspectStatus.new)
    data_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)  # Fecha del dato original
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
