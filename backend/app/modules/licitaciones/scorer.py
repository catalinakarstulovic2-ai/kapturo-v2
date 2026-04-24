"""
Scorer del módulo Licitaciones.

Usa Claude Haiku para calificar cada prospecto con un score 0-100
y una razón clara de por qué le dio ese puntaje.

Claude Haiku: rápido y barato → ideal para procesar en volumen.
Claude Sonnet: más inteligente → lo usamos para redactar mensajes.
"""
import json
import anyio
import anthropic
from app.core.config import settings


class LicitacionesScorer:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def calificar_prospecto(self, prospect_dict: dict, contexto_cliente: dict) -> tuple[float, str]:
        """
        Califica un prospecto y devuelve (score, razón).

        prospect_dict: datos del prospecto (campos licitacion_* directos)
        contexto_cliente: qué busca el cliente (su nicho, producto, etc.)
        """
        if prospect_dict.get("source_module") == "licitador_b":
            prompt = self._prompt_licitador_b(prospect_dict, contexto_cliente)
        else:
            prompt = self._prompt_licitador_a(prospect_dict, contexto_cliente)

        # anthropic.create() es síncrono — lo corremos en thread para no bloquear async
        def _llamar_claude():
            return self.client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

        message = await anyio.to_thread.run_sync(_llamar_claude)
        return self._parse_score(message.content[0].text)

    def _prompt_licitador_b(self, prospect: dict, cliente: dict) -> str:
        monto = prospect.get("licitacion_monto_adjudicado") or prospect.get("licitacion_monto") or 0
        return f"""Eres un experto en ventas B2B. Califica qué tan buen prospecto es esta empresa.

CLIENTE (quien vende):
- Producto/servicio: {cliente.get('producto', 'No especificado')}
- Sector objetivo: {cliente.get('sector', 'No especificado')}

PROSPECTO (empresa que ganó una licitación pública):
- Empresa: {prospect.get('company_name', '')}
- RUT: {prospect.get('rut', '')}
- Región: {prospect.get('licitacion_region', '')}
- Licitación ganada: {prospect.get('licitacion_nombre', '')}
- Monto adjudicado: ${monto:,.0f} CLP
- Organismo comprador: {prospect.get('licitacion_organismo', '')}
- Rubro/Categoría: {prospect.get('licitacion_categoria', '')}

CRITERIOS:
1. ¿El monto adjudicado sugiere capacidad de compra para el producto del cliente?
2. ¿La categoría de la licitación es relevante para el producto del cliente?
3. ¿Ganar esta licitación implica que necesitarán el producto/servicio?

Responde SOLO en este formato JSON:
{{"score": <0-100>, "razon": "<1-2 oraciones>"}}"""

    def _prompt_licitador_a(self, prospect: dict, cliente: dict) -> str:
        monto = prospect.get("licitacion_monto") or 0
        return f"""Eres un experto en licitaciones públicas Chile. Califica qué tan viable es ganar esta licitación.

CLIENTE (quien quiere ganar licitaciones):
- Rubro: {cliente.get('rubro', 'No especificado')}
- Experiencia: {cliente.get('experiencia', 'No especificado')}
- Región donde opera: {cliente.get('region', 'No especificado')}

LICITACIÓN DISPONIBLE:
- Nombre: {prospect.get('licitacion_nombre', '')}
- Monto estimado: ${monto:,.0f} CLP
- Fecha cierre: {prospect.get('licitacion_fecha_cierre', '')}
- Región: {prospect.get('licitacion_region', '')}
- Categoría: {prospect.get('licitacion_categoria', '')}
- Organismo: {prospect.get('licitacion_organismo', '')}

CRITERIOS:
1. ¿La categoría coincide con el rubro del cliente?
2. ¿El monto es razonable para el tamaño del cliente?
3. ¿La región es operacionalmente viable?

Responde SOLO en este formato JSON:
{{"score": <0-100>, "razon": "<1-2 oraciones>"}}"""

    def _parse_score(self, response_text: str) -> tuple[float, str]:
        """Extrae el score y la razón del texto que devuelve Claude."""
        try:
            # Buscar el JSON en la respuesta
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            json_str = response_text[start:end]
            data = json.loads(json_str)
            score = float(data.get("score", 50))
            razon = data.get("razon", "Sin razón")
            return min(100, max(0, score)), razon
        except Exception:
            return 50.0, "No se pudo calificar automáticamente"
