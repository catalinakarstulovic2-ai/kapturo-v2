"""
Scorer del módulo Inmobiliaria.

Califica prospectos específicamente para Leo:
venta de terrenos en Florida ~$90k USD a compradores LATAM y hispanos en USA.

Usa Claude Haiku con criterios fijos de puntuación.
Umbral de calificación: score >= 65 → pasa al pipeline y al redactor.
"""
import json
import anthropic
from app.core.config import settings

SCORE_THRESHOLD = 65

# Títulos de intermediarios inmobiliarios — penalización fuerte
AGENT_TITLES = [
    "agent", "realtor", "broker", "corredor", "agente inmobiliario",
    "bróker", "broker inmobiliario", "real estate agent", "realty",
]

# Países LATAM con alta emigración y capacidad inversora hacia USA
LATAM_HIGH_VALUE = [
    "mexico", "colombia", "argentina", "venezuela", "chile",
    "peru", "ecuador", "brazil", "brasil", "dominican republic",
    "república dominicana", "cuba", "panama", "panamá", "uruguay",
]

# Industrias con liquidez para $90k USD
LIQUID_INDUSTRIES = [
    "technology", "financial", "finance", "construction", "real estate",
    "healthcare", "oil", "energy", "mining", "manufacturing",
    "retail", "wholesale", "software", "banking", "investment",
]

# Cargos con poder de decisión y capital propio
DECISION_TITLES = [
    "ceo", "owner", "founder", "co-founder", "president",
    "managing director", "general manager", "cfo", "coo",
    "director", "vice president", "partner", "propietario",
    "dueño", "socio", "gerente general",
]


class InmobiliariaScorer:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def calificar(self, prospect: dict) -> tuple[float, str]:
        """
        Califica un prospecto para Leo (terrenos Florida ~$90k USD).

        Primero aplica penalizaciones duras (agentes/corredores).
        Luego llama a Claude Haiku con los criterios de puntuación específicos.

        Devuelve (score: float 0-100, razon: str)
        """
        title_lower = (prospect.get("contact_title") or "").lower()
        for agent_word in AGENT_TITLES:
            if agent_word in title_lower:
                return 5.0, f"Descartado: '{prospect.get('contact_title')}' es intermediario inmobiliario, no comprador directo."

        prompt = self._construir_prompt(prospect)
        message = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return self._parse_score(message.content[0].text)

    def _construir_prompt(self, p: dict) -> str:
        return f"""Eres un asesor de ventas inmobiliarias. Califica este prospecto para Leo, quien vende terrenos en Florida, USA, a ~$90,000 USD.

El comprador ideal: tiene capital propio, toma decisiones sin intermediarios, viene de LATAM o es hispano en USA, y busca invertir o emigrar.

PROSPECTO:
- Nombre: {p.get('contact_name', '')}
- Cargo: {p.get('contact_title', '')}
- Empresa: {p.get('company_name', '')}
- Industria: {p.get('industry', '')}
- País: {p.get('country', '')}
- Ciudad: {p.get('city', '')}
- Email verificado: {'Sí' if p.get('email') else 'No'}
- LinkedIn disponible: {'Sí' if p.get('linkedin_url') else 'No'}
- Texto/contexto: {p.get('raw_text', '')[:300] if p.get('raw_text') else 'No disponible'}

TABLA DE PUNTUACIÓN (suma los puntos que apliquen):
+30 → Cargo de decisión: CEO, Owner, Founder, Director, Gerente General, Socio
+20 → Industria con liquidez: Tech, Finance, Construction, Healthcare, Oil, Mining
+15 → País LATAM con alta emigración a USA (México, Colombia, Argentina, Venezuela, Chile, Perú, etc.)
+25 → Texto menciona explícitamente inversión, compra de propiedad, emigrar a USA, o interés en Florida
+10 → Email verificado disponible
-80 → Es agente, corredor o broker inmobiliario (intermediario, no comprador)

Devuelve SOLO este JSON:
{{"score": <número 0-100>, "razon": "<1-2 oraciones explicando el score>"}}"""

    def _parse_score(self, text: str) -> tuple[float, str]:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            data = json.loads(text[start:end])
            score = float(data.get("score", 50))
            razon = data.get("razon", "Sin razón")
            return min(100.0, max(0.0, score)), razon
        except Exception:
            return 50.0, "No se pudo calificar automáticamente"
