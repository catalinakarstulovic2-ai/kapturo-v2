"""
Agente Redactor.

Usa Claude Sonnet para redactar mensajes personalizados para prospectos.
Los mensajes se crean con status "pending_approval" para que el usuario
los revise antes de enviarlos.
"""
import uuid
from app.agents.base_agent import BaseAgent
from app.models.prospect import Prospect
from app.models.message import Message, Conversation, MessageStatus, MessageChannel, MessageDirection
from sqlalchemy import and_


class WriterAgent(BaseAgent):
    async def run(
        self,
        prospect_id: str,
        canal: str = "whatsapp",
        contexto_cliente: dict = None,
    ) -> dict:
        """
        Redacta un mensaje personalizado para un prospecto.

        prospect_id: ID del prospecto a contactar
        canal: "whatsapp" o "email"
        contexto_cliente: dict con producto, empresa, nicho del cliente

        Devuelve {"message_id": str, "body": str, "status": "pending_approval"}
        """
        contexto_cliente = contexto_cliente or {}

        # Buscar el prospecto
        prospect = (
            self.db.query(Prospect)
            .filter(
                Prospect.id == prospect_id,
                Prospect.tenant_id == self.tenant_id,
            )
            .first()
        )
        if not prospect:
            return {"error": "Prospecto no encontrado"}

        # Determinar el canal
        channel = MessageChannel.whatsapp if canal == "whatsapp" else MessageChannel.email

        # Generar el mensaje con Claude Sonnet
        cuerpo = self._redactar_mensaje(prospect, canal, contexto_cliente)

        # Buscar o crear conversación
        conversation = (
            self.db.query(Conversation)
            .filter(
                and_(
                    Conversation.prospect_id == prospect_id,
                    Conversation.tenant_id == self.tenant_id,
                    Conversation.channel == channel,
                    Conversation.is_open == True,
                )
            )
            .first()
        )

        if not conversation:
            conversation = Conversation(
                tenant_id=self.tenant_id,
                prospect_id=prospect_id,
                channel=channel,
            )
            self.db.add(conversation)
            self.db.flush()

        # Crear el mensaje con aprobación pendiente
        message = Message(
            tenant_id=self.tenant_id,
            conversation_id=conversation.id,
            direction=MessageDirection.outbound,
            channel=channel,
            status=MessageStatus.pending_approval,
            body=cuerpo,
            generated_by_ai=True,
        )
        self.db.add(message)
        self.db.commit()

        return {
            "message_id": message.id,
            "body": cuerpo,
            "status": "pending_approval",
            "prospect": prospect.company_name or prospect.contact_name,
        }

    def _redactar_mensaje(self, prospect: Prospect, canal: str, contexto: dict) -> str:
        """Llama a Claude Sonnet para redactar el mensaje personalizado."""
        detalle_prospecto = self._extraer_detalle(prospect)

        if canal == "whatsapp":
            instrucciones_formato = "Máximo 3 párrafos cortos. Tono informal y directo. Sin saludos formales. Empieza directo al punto."
        else:
            instrucciones_formato = "Máximo 4 párrafos. Tono profesional pero cercano. Incluir asunto sugerido al inicio entre [ASUNTO: ...]."

        prompt = f"""Redacta un mensaje de prospección B2B en español informal para {canal}.

SOBRE QUIÉN ENVÍA:
- Empresa: {contexto.get('empresa', 'nuestra empresa')}
- Producto/servicio: {contexto.get('producto', 'nuestro producto')}

SOBRE EL PROSPECTO (destinatario):
{detalle_prospecto}

INSTRUCCIONES:
- Escribe en español informal (tú, no usted)
- {instrucciones_formato}
- Menciona un detalle específico del prospecto para que se vea personalizado
- Termina con una pregunta o llamado a acción claro
- NO uses clichés como "espero que estés bien" o "me permito contactarte"
- NO uses emojis excesivos
- El objetivo es generar interés y conseguir una respuesta

Solo escribe el mensaje, sin explicaciones adicionales."""

        return self._call_claude(
            prompt,
            model="claude-sonnet-4-6",
            max_tokens=600,
        )

    def _extraer_detalle(self, prospect: Prospect) -> str:
        """Construye un resumen del prospecto para el prompt."""
        detalles = []
        if prospect.contact_name:
            detalles.append(f"- Nombre: {prospect.contact_name}")
        if prospect.contact_title:
            detalles.append(f"- Cargo: {prospect.contact_title}")
        if prospect.company_name:
            detalles.append(f"- Empresa: {prospect.company_name}")
        if prospect.industry:
            detalles.append(f"- Industria: {prospect.industry}")
        if prospect.city:
            detalles.append(f"- Ciudad: {prospect.city}")
        if prospect.score_reason:
            detalles.append(f"- Por qué es un buen prospecto: {prospect.score_reason}")

        return "\n".join(detalles) if detalles else "Sin datos adicionales"
