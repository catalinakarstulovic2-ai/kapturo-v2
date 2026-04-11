import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class MessageChannel(str, enum.Enum):
    whatsapp = "whatsapp"
    email = "email"


class MessageDirection(str, enum.Enum):
    outbound = "outbound"  # Nosotros enviamos
    inbound = "inbound"    # El prospecto responde


class MessageStatus(str, enum.Enum):
    draft = "draft"           # Redactado por IA, esperando aprobación
    pending_approval = "pending_approval"
    approved = "approved"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    failed = "failed"


class Conversation(Base):
    """Hilo de conversación con un prospecto (todos los mensajes juntos)."""
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    prospect_id: Mapped[str] = mapped_column(ForeignKey("prospects.id"), nullable=False)
    channel: Mapped[MessageChannel] = mapped_column(PgEnum(MessageChannel))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    messages: Mapped[list["Message"]] = relationship(back_populates="conversation")


class Message(Base):
    """Mensaje individual dentro de una conversación."""
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), nullable=False)
    direction: Mapped[MessageDirection] = mapped_column(PgEnum(MessageDirection))
    channel: Mapped[MessageChannel] = mapped_column(PgEnum(MessageChannel))
    status: Mapped[MessageStatus] = mapped_column(PgEnum(MessageStatus), default=MessageStatus.draft)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    external_id: Mapped[str] = mapped_column(String(200), nullable=True)  # ID de WhatsApp/Email
    generated_by_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
