"""
Agente de Seguimiento.

Detecta prospectos que llevan tiempo sin respuesta y genera
mensajes de seguimiento automáticos para aprobación del usuario.
"""
from datetime import datetime, timezone, timedelta
from app.agents.base_agent import BaseAgent
from app.agents.writer_agent import WriterAgent
from app.models.pipeline import PipelineCard, PipelineStage
from app.models.prospect import Prospect, ProspectStatus


class FollowupAgent(BaseAgent):
    async def run(self, horas_sin_respuesta: int = 24) -> dict:
        """
        Busca prospectos que llevan N horas sin respuesta en el pipeline
        y genera mensajes de seguimiento pendientes de aprobación.

        horas_sin_respuesta: umbral de tiempo para considerar seguimiento necesario

        Devuelve {"seguimientos_generados": N}
        """
        # Fecha límite: tarjetas con next_action_at vencido
        fecha_limite = datetime.now(timezone.utc) - timedelta(hours=horas_sin_respuesta)

        # Buscar tarjetas del pipeline donde:
        # - next_action_at ya venció (o es None pero la tarjeta tiene días)
        # - El prospecto fue contactado pero no respondió
        tarjetas = (
            self.db.query(PipelineCard)
            .join(Prospect, PipelineCard.prospect_id == Prospect.id)
            .join(PipelineStage, PipelineCard.stage_id == PipelineStage.id)
            .filter(
                PipelineCard.tenant_id == self.tenant_id,
                Prospect.status == ProspectStatus.contacted,
                PipelineStage.is_won == False,
                PipelineStage.is_lost == False,
            )
            .filter(
                (PipelineCard.next_action_at != None) &
                (PipelineCard.next_action_at < datetime.now(timezone.utc))
                |
                (PipelineCard.next_action_at == None) &
                (PipelineCard.created_at < fecha_limite)
            )
            .all()
        )

        seguimientos_generados = 0
        writer = WriterAgent(db=self.db, tenant_id=self.tenant_id)

        for tarjeta in tarjetas:
            try:
                resultado = await writer.run(
                    prospect_id=tarjeta.prospect_id,
                    canal="whatsapp",
                    # No pasar contexto_cliente — el WriterAgent usa el config del tenant directamente
                )
                if "message_id" in resultado:
                    seguimientos_generados += 1
            except Exception:
                continue

        return {"seguimientos_generados": seguimientos_generados}
