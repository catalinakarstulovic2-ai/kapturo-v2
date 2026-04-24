"""
Scorer del módulo Prospector.

Usa Claude Haiku para calificar prospectos de Apollo y Apify.
Detecta si el prospecto es relevante para el nicho del cliente.
"""
import json
import anthropic
from app.core.config import settings

# Títulos que indican intermediarios en bienes raíces (no son compradores/inversores)
REAL_ESTATE_AGENT_TITLES = ["agent", "realtor", "broker", "corredor", "agente", "bróker"]


class ProspectorScorer:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def calificar_prospecto(self, prospect_dict: dict, contexto_cliente: dict) -> tuple[float, str]:
        """
        Califica un prospecto con Claude Haiku.

        prospect_dict: datos normalizados del prospecto
        contexto_cliente: nicho, producto, industria objetivo del cliente

        Devuelve (score: float 0-100, razon: str)
        """
        # Penalización especial para nicho inmobiliario
        nicho = contexto_cliente.get("nicho", "").lower()
        contact_title = (prospect_dict.get("contact_title") or "").lower()

        if nicho in ("real_estate", "inmobiliaria", "bienes raices", "bienes raíces"):
            for agent_word in REAL_ESTATE_AGENT_TITLES:
                if agent_word in contact_title:
                    return 15.0, f"Penalizado: el título '{contact_title}' indica intermediario (agente/corredor), no un comprador o inversor directo."

        prompt = self._construir_prompt(prospect_dict, contexto_cliente)

        message = self.client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )

        return self._parse_score(message.content[0].text)

    def _construir_prompt(self, prospect: dict, cliente: dict) -> str:
        return f"""Eres un experto en ventas B2B. Califica qué tan buen prospecto es esta persona/empresa para el cliente.

CLIENTE (quien vende):
- Producto/servicio: {cliente.get('producto', 'No especificado')}
- Nicho objetivo: {cliente.get('nicho', 'No especificado')}
- Industria objetivo: {cliente.get('industria', 'No especificado')}

PROSPECTO:
- Empresa: {prospect.get('company_name', '')}
- Nombre contacto: {prospect.get('contact_name', '')}
- Cargo/Título: {prospect.get('contact_title', '')}
- Industria: {prospect.get('industry', '')}
- Email disponible: {'Sí' if prospect.get('email') else 'No'}
- Teléfono disponible: {'Sí' if prospect.get('phone') else 'No'}
- LinkedIn disponible: {'Sí' if prospect.get('linkedin_url') else 'No'}
- Ciudad: {prospect.get('city', '')}
- País: {prospect.get('country', '')}

CRITERIOS DE CALIFICACIÓN:
1. ¿El cargo/título del prospecto coincide con el decisor que busca el cliente?
2. ¿El tamaño/industria de la empresa es relevante para lo que vende el cliente?
3. ¿Hay suficiente información de contacto para llegar a ellos?
4. Si el nicho es inmobiliario: ¿es inversor/comprador directo (NO agente ni corredor)?

Responde SOLO en este formato JSON:
{{"score": <número entre 0 y 100>, "razon": "<explicación en 1-2 oraciones>"}}"""

    def _parse_score(self, response_text: str) -> tuple[float, str]:
        """Extrae el score y la razón del texto que devuelve Claude."""
        try:
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            json_str = response_text[start:end]
            data = json.loads(json_str)
            score = float(data.get("score", 50))
            razon = data.get("razon", "Sin razón")
            return min(100, max(0, score)), razon
        except Exception:
            return 50.0, "No se pudo calificar automáticamente"
