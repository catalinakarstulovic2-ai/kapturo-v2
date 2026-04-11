"""
Agente Limpiador.

Marca como descartados los prospectos antiguos o de baja calidad.
No borra datos, solo cambia el status para mantener la BD ordenada.
"""
from datetime import datetime, timezone, timedelta
from app.agents.base_agent import BaseAgent
from app.models.prospect import Prospect, ProspectStatus


class CleanerAgent(BaseAgent):
    async def run(self, dias_antiguedad: int = 180) -> dict:
        """
        Limpia prospectos de baja calidad o muy antiguos.

        Marca como descartados:
        1. Prospectos con más de N días de antigüedad (data_date)
        2. Prospectos con score < 20 que nunca fueron contactados (status = new)

        dias_antiguedad: días después de los cuales un prospecto se considera viejo

        Devuelve {"limpiados": N}
        """
        fecha_limite = datetime.now(timezone.utc) - timedelta(days=dias_antiguedad)
        limpiados = 0

        # Grupo 1: Prospectos muy antiguos
        prospectos_viejos = (
            self.db.query(Prospect)
            .filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.status != ProspectStatus.disqualified,
                Prospect.data_date != None,
                Prospect.data_date < fecha_limite,
            )
            .all()
        )

        for prospect in prospectos_viejos:
            prospect.status = ProspectStatus.disqualified
            prospect.updated_at = datetime.now(timezone.utc)
            limpiados += 1

        # Grupo 2: Prospectos con score muy bajo que nunca fueron contactados
        prospectos_bajos = (
            self.db.query(Prospect)
            .filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.status == ProspectStatus.new,
                Prospect.score < 20,
                Prospect.score > 0,   # Solo los que sí fueron calificados (score 0 = sin calificar)
            )
            .all()
        )

        for prospect in prospectos_bajos:
            prospect.status = ProspectStatus.disqualified
            prospect.updated_at = datetime.now(timezone.utc)
            limpiados += 1

        self.db.commit()

        return {"limpiados": limpiados}
