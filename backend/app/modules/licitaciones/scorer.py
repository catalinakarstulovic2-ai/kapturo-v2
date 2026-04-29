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
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )

        message = await anyio.to_thread.run_sync(_llamar_claude)
        return self._parse_score(message.content[0].text)

    def _prompt_licitador_b(self, prospect: dict, cliente: dict) -> str:
        monto = prospect.get("licitacion_monto_adjudicado") or prospect.get("licitacion_monto") or 0
        descripcion_licit = prospect.get('licitacion_descripcion') or prospect.get('descripcion') or ''
        return f"""Eres un experto en ventas B2B en Chile. Evalúa qué tan buen prospecto de venta es esta empresa.

VENDEDOR (quien ofrece su producto/servicio):
- Qué vende: {cliente.get('producto', 'No especificado')}
- Sectores objetivo: {cliente.get('sector') or cliente.get('rubro', 'No especificado')}
- Descripción completa: {cliente.get('descripcion') or cliente.get('producto', 'No especificado')}

PROSPECTO (empresa que ganó una licitación pública):
- Empresa: {prospect.get('company_name', '')}
- RUT: {prospect.get('rut', '')}
- Región: {prospect.get('licitacion_region', '')}
- Licitación ganada: {prospect.get('licitacion_nombre', '')}
- Descripción licitación: {descripcion_licit[:300] if descripcion_licit else 'No disponible'}
- Categoría UNSPSC: {prospect.get('licitacion_categoria', 'No disponible')}
- Monto adjudicado: ${monto:,.0f} CLP
- Organismo comprador: {prospect.get('licitacion_organismo', '')}

CRITERIOS:
1. ¿Ganar esta licitación implica que el prospecto necesitará el producto/servicio del vendedor?
2. ¿El monto adjudicado indica capacidad de inversión suficiente?
3. ¿La categoría y descripción de la licitación son relevantes para lo que vende el cliente?

Responde SOLO en este formato JSON (sin texto adicional):
{{"score": <0-100>, "razon": "<2-3 oraciones explicando el score>"}}"""

    def _prompt_licitador_a(self, prospect: dict, cliente: dict) -> str:
        monto = prospect.get("licitacion_monto") or 0
        rubros = cliente.get('sector') or cliente.get('rubro') or 'No especificado'
        descripcion_empresa = cliente.get('producto') or 'No especificado'
        descripcion_licit = prospect.get('licitacion_descripcion') or prospect.get('descripcion') or ''
        return f"""Eres un experto en licitaciones públicas de Chile. Evalúa qué tan viable es que esta empresa gane esta licitación.

EMPRESA (quien quiere ganar):
- Nombre: {cliente.get('razon_social', 'No especificado')}
- Qué ofrece: {descripcion_empresa}
- Categorías en que opera: {rubros}
- Años de experiencia: {cliente.get('experiencia', 'No especificado')}
- Regiones donde opera: {cliente.get('region_cliente', 'Todas')}
- Certificaciones/diferenciadores: {cliente.get('certificaciones') or cliente.get('diferenciadores') or 'No especificado'}

LICITACIÓN:
- Nombre: {prospect.get('licitacion_nombre', '')}
- Descripción: {descripcion_licit[:400] if descripcion_licit else 'No disponible'}
- Categoría UNSPSC: {prospect.get('licitacion_categoria', 'No disponible')}
- Organismo comprador: {prospect.get('licitacion_organismo', '')}
- Monto estimado: ${monto:,.0f} CLP
- Región: {prospect.get('licitacion_region', '')}
- Fecha cierre: {prospect.get('licitacion_fecha_cierre', '')}

CRITERIOS DE EVALUACIÓN:
1. ¿La categoría UNSPSC y descripción de la licitación corresponden al rubro de la empresa?
2. ¿El monto estimado es coherente con el tamaño y capacidad de la empresa?
3. ¿La región de la licitación es operable para la empresa?
4. ¿Tiene la empresa los requisitos evidentes (experiencia, certificaciones) que se infieren del nombre/descripción?

Responde SOLO en este formato JSON (sin texto adicional):
{{"score": <0-100>, "razon": "<2-3 oraciones explicando el score>"}}"""

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
