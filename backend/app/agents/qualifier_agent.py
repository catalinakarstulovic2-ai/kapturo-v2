"""
Agente Calificador.

Toma prospectos sin score y los califica usando Claude Haiku.
Útil para calificar en lote prospectos que se importaron sin pasar por el scorer.
"""
import json
from app.agents.base_agent import BaseAgent
from app.models.prospect import Prospect
from app.models.tenant import Tenant
from datetime import datetime, timezone


class QualifierAgent(BaseAgent):
    async def run(
        self,
        prospect_ids: list = None,
        modulo: str = None,
        limit: int = 50,
    ) -> dict:
        """
        Califica prospectos sin score (score == 0).

        prospect_ids: si se pasa, califica solo esos IDs específicos
        modulo: filtra por módulo origen (ej: "prospector", "licitaciones")
        limit: máximo de prospectos a calificar en una sola ejecución

        Devuelve {"calificados": N, "omitidos": M}
        """
        # Construir query base para prospectos sin calificar de este tenant
        query = (
            self.db.query(Prospect)
            .filter(
                Prospect.tenant_id == self.tenant_id,
                Prospect.score == 0.0,
            )
        )

        if prospect_ids:
            query = query.filter(Prospect.id.in_(prospect_ids))
        if modulo:
            query = query.filter(Prospect.source_module == modulo)

        prospectos = query.limit(limit).all()

        calificados = 0
        omitidos = 0

        for prospect in prospectos:
            try:
                score, razon = await self._calificar(prospect)
                prospect.score = score
                prospect.score_reason = razon
                prospect.is_qualified = score >= 60
                prospect.updated_at = datetime.now(timezone.utc)
                calificados += 1
            except Exception:
                omitidos += 1

        self.db.commit()

        return {"calificados": calificados, "omitidos": omitidos}

    def _obtener_contexto_tenant(self) -> dict:
        """Lee la configuración del agente del tenant actual."""
        tenant = self.db.query(Tenant).filter(Tenant.id == self.tenant_id).first()
        if tenant and tenant.agent_config:
            return tenant.agent_config
        return {}

    async def _calificar(self, prospect: Prospect) -> tuple[float, str]:
        """Genera un score para un prospecto usando Claude Haiku con contexto del tenant."""
        ctx = self._obtener_contexto_tenant()

        # Construir sección de cliente ideal si existe configuración
        cliente_ideal = ""
        if ctx:
            size_labels = {'small': 'Pequeña (1-10)', 'medium': 'Mediana (11-100)', 'large': 'Grande (100+)', 'any': 'Cualquiera'}
            cliente_ideal = f"""
CONTEXTO DEL NEGOCIO:
- Qué venden: {ctx.get('product', 'No especificado')}
- A quién le venden: {ctx.get('target', 'No especificado')}
- Propuesta de valor: {ctx.get('value_prop', 'No especificada')}
- Industria ideal del cliente: {ctx.get('ideal_industry', 'Cualquiera')}
- Cargo ideal del contacto: {ctx.get('ideal_role', 'Decisor de compra')}
- Tamaño de empresa ideal: {size_labels.get(ctx.get('ideal_size', 'any'), 'Cualquiera')}
{f"- Contexto adicional: {ctx.get('extra_context')}" if ctx.get('extra_context') else ''}

Califica qué tan probable es que este prospecto sea un buen cliente para este negocio.
Considera: coincidencia de industria, cargo de decisor, datos de contacto disponibles.
"""
        else:
            cliente_ideal = """
CRITERIOS GENERALES:
1. ¿Tiene cargo de decisor (CEO, Gerente, Director, Dueño)?
2. ¿Tiene información de contacto suficiente (email o teléfono)?
3. ¿La empresa parece tener capacidad económica?
"""

        prompt = f"""Eres un experto en ventas B2B. Califica este prospecto de 0 a 100.

PROSPECTO:
- Empresa: {prospect.company_name or 'No especificado'}
- Contacto: {prospect.contact_name or 'No especificado'}
- Cargo: {prospect.contact_title or 'No especificado'}
- Email: {'disponible' if prospect.email else 'no disponible'}
- Teléfono: {'disponible' if prospect.phone else 'no disponible'}
- Industria: {prospect.industry or 'No especificado'}
- País: {prospect.country or 'No especificado'}
- Fuente: {prospect.source or 'No especificado'}
{cliente_ideal}
Responde SOLO en este formato JSON:
{{"score": <número 0-100>, "razon": "<1-2 oraciones explicando el score>"}}"""

        response = self._call_claude(prompt, model="claude-haiku-4-5-20251001", max_tokens=300)

        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            data = json.loads(response[start:end])
            score = float(data.get("score", 50))
            razon = data.get("razon", "Calificado automáticamente")
            return min(100, max(0, score)), razon
        except Exception:
            return 50.0, "No se pudo calificar automáticamente"
