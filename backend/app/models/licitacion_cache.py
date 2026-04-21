"""
Cache global de licitaciones de Mercado Público.

Por qué existe esta tabla:
  La API de Mercado Público solo permite filtrar por *fecha de publicación*,
  no por fecha de cierre ni por rubros. Hacer 30+ llamadas API en cada
  request del usuario es lento (~5-15 s) e impredecible.

  La solución correcta es:
  1. Un job nocturno (Celery Beat, 2:00 AM Chile) que barre los últimos
     45 días de licitaciones publicadas y las guarda aquí con su
     fecha_cierre, ofertantes, etc.
  2. El endpoint /por-adjudicarse consulta esta tabla → respuesta <50 ms.

Ciclo de vida de un registro:
  publicada  →  cerrada (fecha_cierre < hoy)  →  adjudicada  →  ignorado
  El job nocturno actualiza el campo `estado` de los registros existentes.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class LicitacionCache(Base):
    """Caché global de licitaciones de Mercado Público."""
    __tablename__ = "licitaciones_cache"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Identificación ───────────────────────────────────────────────────────
    codigo: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    estado: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # publicada | cerrada | adjudicada | desierta | revocada

    # ── Datos de la licitación ───────────────────────────────────────────────
    nombre: Mapped[str] = mapped_column(String(1000), nullable=True)
    organismo: Mapped[str] = mapped_column(String(500), nullable=True)
    region: Mapped[str] = mapped_column(String(200), nullable=True)
    monto_estimado: Mapped[float] = mapped_column(Float, nullable=True)

    # ── Fechas clave ─────────────────────────────────────────────────────────
    fecha_publicacion: Mapped[str] = mapped_column(String(20), nullable=True)
    fecha_cierre: Mapped[str] = mapped_column(String(20), nullable=True, index=True)
    # YYYY-MM-DD — campo clave para filtrar "cerrando pronto"

    fecha_adjudicacion: Mapped[str] = mapped_column(String(20), nullable=True)

    # ── Ofertantes (solo cuando estado = cerrada/adjudicada) ─────────────────
    # JSON: [{"rut": "76...", "nombre": "Empresa SPA", "monto_oferta": 5000000}, ...]
    ofertantes_json: Mapped[str] = mapped_column(Text, nullable=True)
    ofertantes_count: Mapped[int] = mapped_column(Integer, default=0)

    # ── Datos crudos ─────────────────────────────────────────────────────────
    raw_data: Mapped[str] = mapped_column(Text, nullable=True)  # JSON completo de la API

    # ── Alertas de cambio de estado ──────────────────────────────────────────
    estado_anterior: Mapped[str] = mapped_column(String(50), nullable=True)
    alerta_nueva: Mapped[bool] = mapped_column(default=False, nullable=True)
    alerta_leida: Mapped[bool] = mapped_column(default=False, nullable=True)

    # ── Control ──────────────────────────────────────────────────────────────
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
