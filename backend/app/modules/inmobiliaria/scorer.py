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
                return 5.0, f"Descartado: '{prospect.get('contact_title')}' es intermediario, no comprador directo.", "descartado", "descartar"

        import asyncio
        prompt = self._construir_prompt(prospect, config)
        message = await asyncio.to_thread(
            self.client.messages.create,
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
            return f"""Eres un experto en ventas digitales. Califica este lead captado de redes sociales para {empresa}, que vende: {producto}.

El comprador ideal: {comprador_ideal}. Países de mayor interés: {paises_str}.

IMPORTANTE: Solo nos interesan compradores directos — personas que quieren comprar para sí mismas.
Descarta inmediatamente: agentes inmobiliarios, realtors, corredores, brokers, o cualquier persona que trabaje en bienes raíces.

LEAD SOCIAL:
- Usuario: {p.get('contact_name', '')}
- Comentario original: "{texto_comentario[:400]}"
- Fuente: {p.get('company_name', '')}
- Perfil: {p.get('website', '')}

TABLA DE PUNTUACIÓN (suma los puntos que apliquen):
+50 → Pregunta directamente precio, cómo comprar, cómo invertir, cuotas, financiamiento, contacto
+35 → Expresa interés claro: "me interesa", "quiero más info", "quiero un terreno", "busco en florida"
+20 → Menciona Florida, USA, terreno, lote, inversión en EE.UU., dolarizar
+15 → País objetivo: {paises_str}
-100 → Es agente, realtor, corredor, broker o trabaja en bienes raíces → score 0, descartar
-30 → Comentario es spam, emoji suelto, o seguimiento de cuenta sin intención de compra

ACCIÓN RECOMENDADA — elige UNA:
- "contactar_hoy": score >= 70, comprador con intención directa
- "nutrir_contenido": score 40-69, interesado pero no listo aún
- "descartar": agente inmobiliario, spam, o sin señales reales

Devuelve SOLO este JSON (sin texto extra):
{{"score": <número 0-100>, "razon": "<1-2 oraciones>", "tipo_lead": "comprador_directo", "accion_recomendada": "<accion>"}}"""

        return f"""Eres un experto en ventas. Califica este perfil profesional como potencial comprador de terrenos en Florida para {empresa}.

El producto: {producto}
El comprador ideal: {comprador_ideal}

IMPORTANTE: Solo nos interesan compradores directos con capacidad económica real.
Descarta inmediatamente: agentes inmobiliarios, realtors, corredores, brokers, o cualquier persona que trabaje en bienes raíces.

PERFIL:
- Nombre: {p.get('contact_name', '')}
- Cargo: {p.get('contact_title', '')}
- Empresa: {p.get('company_name', '')}
- Industria: {p.get('industry', '')}
- País: {p.get('country', '')}
- Ciudad: {p.get('city', '')}
- LinkedIn: {'Disponible' if p.get('linkedin_url') else 'No'}
- Email: {'Verificado' if p.get('email') else 'No disponible'}

TABLA DE PUNTUACIÓN (suma los puntos que apliquen):
+35 → Cargo de alta decisión o dueño: CEO, founder, co-founder, owner, president, propietario, dueño, socio
+25 → Cargo profesional con ingresos altos: médico, abogado, arquitecto, ingeniero senior, director, gerente general
+20 → Industria con liquidez: {industrias_str}
+15 → País objetivo: {paises_str}
+10 → LinkedIn disponible (puede contactarse directamente)
+10 → Email verificado
-100 → Es agente, realtor, corredor, broker o trabaja en bienes raíces → score 0, descartar

ACCIÓN RECOMENDADA:
- "contactar_hoy": score >= 65, perfil sólido con capacidad clara
- "nutrir_contenido": score 40-64, perfil prometedor pero sin suficiente señal
- "descartar": agente inmobiliario o sin capacidad aparente

Devuelve SOLO este JSON:
{{"score": <número 0-100>, "razon": "<1-2 oraciones>", "tipo_lead": "perfil_capacidad", "accion_recomendada": "<accion>"}}"""

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
