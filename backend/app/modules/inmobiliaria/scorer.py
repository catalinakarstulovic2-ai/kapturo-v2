"""
Scorer del módulo Inmobiliaria.

Califica prospectos según el contexto del tenant (agent_config).
Si no hay config, usa valores genéricos de alta calidad.

Usa Claude Haiku con criterios dinámicos de puntuación.
Umbral por defecto: score >= 65.
"""
import json
import anthropic
from app.core.config import settings

SCORE_THRESHOLD = 65

# Títulos de intermediarios — siempre penalizados (no son compradores)
AGENT_TITLES = [
    "agent", "realtor", "broker", "corredor", "agente inmobiliario",
    "bróker", "broker inmobiliario", "real estate agent", "realty",
]

# Fallbacks genéricos si el tenant no tiene agent_config
_DEFAULT_PAISES = [
    "mexico", "colombia", "argentina", "venezuela", "chile",
    "peru", "ecuador", "brazil", "brasil", "dominican republic",
    "república dominicana", "cuba", "panama", "panamá", "uruguay",
]
_DEFAULT_INDUSTRIAS = [
    "technology", "financial", "finance", "construction", "real estate",
    "healthcare", "oil", "energy", "mining", "manufacturing",
    "retail", "wholesale", "software", "banking", "investment",
]
_DEFAULT_CARGOS = [
    "ceo", "owner", "founder", "co-founder", "president",
    "managing director", "general manager", "cfo", "coo",
    "director", "vice president", "partner", "propietario",
    "dueño", "socio", "gerente general",
]


class InmobiliariaScorer:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def calificar(self, prospect: dict, config: dict = None) -> tuple[float, str]:
        """
        Califica un prospecto según el contexto del tenant.

        config: agent_config del tenant. Campos relevantes:
          - producto:          qué vende el cliente (ej: "terrenos en Florida $90k")
          - empresa:           nombre del negocio
          - comprador_ideal:   descripción del comprador ideal
          - paises_objetivo:   list[str] de países de interés
          - industrias_objetivo: list[str]
          - cargos_objetivo:   list[str]
          - score_minimo:      umbral de calificación (default 65)

        Devuelve (score: float 0-100, razon: str)
        """
        config = config or {}

        title_lower = (prospect.get("contact_title") or "").lower()
        for agent_word in AGENT_TITLES:
            if agent_word in title_lower:
                return 5.0, f"Descartado: '{prospect.get('contact_title')}' es intermediario, no comprador directo."

        prompt = self._construir_prompt(prospect, config)
        message = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return self._parse_score(message.content[0].text)

    def _construir_prompt(self, p: dict, config: dict) -> str:
        producto       = config.get("producto") or "producto de alto valor"
        empresa        = config.get("empresa") or "nuestro cliente"
        comprador_ideal = config.get("comprador_ideal") or "persona con capital propio y poder de decisión"
        paises         = config.get("paises_objetivo") or _DEFAULT_PAISES
        industrias     = config.get("industrias_objetivo") or _DEFAULT_INDUSTRIAS
        cargos         = config.get("cargos_objetivo") or _DEFAULT_CARGOS

        paises_str     = ", ".join(paises[:8]) if isinstance(paises, list) else str(paises)
        industrias_str = ", ".join(industrias[:6]) if isinstance(industrias, list) else str(industrias)
        cargos_str     = ", ".join(cargos[:8]) if isinstance(cargos, list) else str(cargos)

        return f"""Eres un experto en ventas. Califica este prospecto para {empresa}, que vende: {producto}.

El comprador ideal: {comprador_ideal}.

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
+30 → Cargo de decisión: {cargos_str}
+20 → Industria con liquidez: {industrias_str}
+15 → País objetivo: {paises_str}
+25 → Texto menciona explícitamente el problema o interés que resuelve el producto
+10 → Email verificado disponible
-80 → Es agente, corredor o broker (intermediario, no cliente final)

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
