import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as PgEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class PlanName(str, enum.Enum):
    starter = "starter"
    growth = "growth"
    enterprise = "enterprise"


class ModuleType(str, enum.Enum):
    licitaciones = "licitaciones"
    inmobiliaria = "inmobiliaria"
    kapturo_ventas = "kapturo_ventas"


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[PlanName] = mapped_column(PgEnum(PlanName), nullable=False)
    max_prospects: Mapped[int] = mapped_column(default=500)
    max_messages_per_month: Mapped[int] = mapped_column(default=1000)
    max_users: Mapped[int] = mapped_column(default=3)
    price_usd: Mapped[float] = mapped_column(default=0.0)

    tenants: Mapped[list["Tenant"]] = relationship(back_populates="plan")


class Tenant(Base):
    """Cada cliente de Kapturo tiene su propio tenant (espacio aislado)."""
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("subscription_plans.id"), nullable=True)
    api_keys: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    plan: Mapped["SubscriptionPlan"] = relationship(back_populates="tenants")
    users: Mapped[list["User"]] = relationship(back_populates="tenant")
    modules: Mapped[list["TenantModule"]] = relationship(back_populates="tenant")


class TenantModule(Base):
    """Registra qué módulos tiene activados cada tenant."""
    __tablename__ = "tenant_modules"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    module: Mapped[ModuleType] = mapped_column(PgEnum(ModuleType), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[str] = mapped_column(String, nullable=True)  # JSON con configuración del módulo
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    tenant: Mapped["Tenant"] = relationship(back_populates="modules")
