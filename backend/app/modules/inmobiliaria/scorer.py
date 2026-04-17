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

    async def calificar(self, prospect: dict, config: dict = None) -> tuple[float, str, str, str]:
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
                return 5.0, f"Descartado: '{prospect.get('contact_title')}' es intermediario, no comprador directo.", "agente_latam", "invitar_programa_referidos"

        prompt = self._construir_prompt(prospect, config)
        message = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
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

        # Detectar si es lead social (comentario de redes) o empresa (Google Maps)
        es_lead_social = str(p.get("source", "")).lower() in ("apify_social", "apify social")
        texto_comentario = p.get("notes", "") or p.get("raw_text", "")

        if es_lead_social:
            return f"""Eres un experto en ventas digitales. Clasifica y califica este lead captado de redes sociales para {empresa}, que vende: {producto}.

El comprador ideal: {comprador_ideal}. Países de mayor interés: {paises_str}.

Contexto del negocio: {empresa} también tiene un programa de referidos donde agentes o corredores LATAM pueden vender terrenos en Florida a sus clientes SIN necesitar licencia USA. Este es un segundo tipo de lead valioso.

LEAD SOCIAL:
- Usuario: {p.get('contact_name', '')}
- Comentario original: "{texto_comentario[:400]}"
- Fuente: {p.get('company_name', '')}
- Perfil: {p.get('website', '')}

TABLA DE PUNTUACIÓN (suma los puntos que apliquen):
+50 → Pregunta directamente precio, cómo comprar, cómo invertir, cuotas, financiamiento, contacto
+35 → Expresa interés claro: "me interesa", "quiero más info", "quiero un terreno", "busco en florida"
+20 → Menciona Florida, USA, terreno, lote, inversión en EE.UU.
+15 → País objetivo: {paises_str}
-50 → Es agente/corredor/broker buscando comisión para sí mismo (NO es comprador final)
-30 → Comentario es spam, emoji suelto, o seguimiento de cuenta sin intención de compra

TIPO DE LEAD — elige UNO:
- "comprador_directo": persona que quiere comprar un terreno para sí mismo
- "potencial_referido": agente, corredor o realtor LATAM que podría unirse al programa de referidos de {empresa} para vender a sus clientes
- "agente_latam": corredor inmobiliario con cartera propia en LATAM (LinkedIn, portal, etc.) candidato al programa

ACCIÓN RECOMENDADA — elige UNA según score y tipo:
- "contactar_hoy": score >= 70, comprador con intención directa
- "nutrir_contenido": score 40-69, interesado pero no listo para comprar
- "invitar_programa_referidos": es agente/corredor LATAM → ofrecerle el programa sin licencia USA
- "descartar": sin señales reales de intención

Devuelve SOLO este JSON (sin texto extra):
{{"score": <número 0-100>, "razon": "<1-2 oraciones>", "tipo_lead": "<tipo>", "accion_recomendada": "<accion>"}}"""

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

    def _parse_score(self, text: str) -> tuple[float, str, str, str]:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            data = json.loads(text[start:end])
            score = float(data.get("score", 50))
            razon = data.get("razon", "Sin razón")
            tipo_lead = data.get("tipo_lead", "comprador_directo")
            accion = data.get("accion_recomendada", "nutrir_contenido")
            return min(100.0, max(0.0, score)), razon, tipo_lead, accion
        except Exception:
            return 50.0, "No se pudo calificar automáticamente", "comprador_directo", "nutrir_contenido"
