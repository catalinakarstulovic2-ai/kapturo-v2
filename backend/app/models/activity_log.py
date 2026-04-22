"""
Registro de actividad de usuarios por módulo.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # login | busqueda_normal | busqueda_ia | guardar_licitacion | analizar_bases
    # generar_propuesta_tecnica | generar_oferta_economica | generar_carta_organismo
    # descargar_txt | descargar_pdf | descargar_csv | cambiar_estado | agregar_nota
    # perfil_incompleto | perfil_completo | reportar_problema
    resource_id: Mapped[str] = mapped_column(String(200), nullable=True)
    resource_name: Mapped[str] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
