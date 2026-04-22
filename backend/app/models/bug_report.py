"""
Reportes de problemas enviados por usuarios.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class BugReport(Base):
    __tablename__ = "bug_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=True)
    user_name: Mapped[str] = mapped_column(String(200), nullable=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    screenshot_base64: Mapped[str] = mapped_column(Text, nullable=True)  # base64 de la imagen
    screenshot_mime: Mapped[str] = mapped_column(String(50), nullable=True)  # image/png, image/jpeg
    pagina: Mapped[str] = mapped_column(String(300), nullable=True)  # URL desde donde se reportó
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
