"""
Agente de Licitaciones.

Provee tres capacidades:
1. busqueda_ia(consulta)           → extrae filtros con Claude Haiku y ejecuta búsqueda en MP.
2. generar_propuesta(prospect_id)  → redacta propuesta técnica con Claude Sonnet.
3. analizar_bases(prospect_id)     → descarga PDFs de bases, analiza requisitos vs empresa,
                                     genera score detallado + propuesta adaptada a las bases reales.
"""
import io
import json
import asyncio
import httpx
from pypdf import PdfReader
from app.agents.base_agent import BaseAgent
from app.models.prospect import Prospect
from app.models.tenant import TenantModule
from app.modules.licitaciones.client import MercadoPublicoClient


class LicitacionesAgent(BaseAgent):
    """Agente IA para el módulo de licitaciones."""

    async def run(self, **kwargs) -> dict:
        accion = kwargs.get("accion")
        if accion == "busqueda_ia":
            return await self.busqueda_ia(kwargs["consulta"], kwargs.get("catalogo", {}))
        if accion == "propuesta":
            return await self.generar_propuesta(kwargs["prospect_id"])
        if accion == "analizar_bases":
            return await self.analizar_bases(kwargs["prospect_id"])
        return {"error": "accion no reconocida"}

    # ─────────────────────────────────────────────────────────────────────────
    # Helpers internos
    # ─────────────────────────────────────────────────────────────────────────

    def _get_perfil_empresa(self) -> dict:
        """Carga el niche_config del módulo licitaciones del tenant."""
        modulo = (
            self.db.query(TenantModule)
            .filter(
                TenantModule.tenant_id == self.tenant_id,
                TenantModule.module.in_(["licitaciones", "licitador"]),
            )
            .first()
        )
        return modulo.niche_config if modulo and modulo.niche_config else {}

    def _get_prospect(self, prospect_id: str) -> Prospect:
        prospect = (
            self.db.query(Prospect)
            .filter(Prospect.id == prospect_id, Prospect.tenant_id == self.tenant_id)
            .first()
        )
        if not prospect:
            raise ValueError("Licitación no encontrada")
        return prospect

    async def _descargar_texto_pdf(self, url: str, max_chars: int = 25000) -> str:
        """Descarga un PDF desde una URL y extrae su texto."""
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                pdf = PdfReader(io.BytesIO(resp.content))
                texto = "\n".join(
                    page.extract_text() or "" for page in pdf.pages
                )
                return texto[:max_chars].strip()
        except Exception as e:
            return f"[No se pudo leer el documento: {e}]"

    def _extraer_secciones_clave(self, texto_completo: str) -> dict:
        """
        Usa Claude Haiku (rápido y barato) para destilar el texto completo de las bases
        en secciones estructuradas. Esto permite que Sonnet reciba información precisa
        en lugar de texto crudo truncado.
        """
        prompt = f"""Analiza este texto de bases técnicas/administrativas de una licitación pública chilena.
Extrae SOLO la información más relevante para preparar una propuesta ganadora.

TEXTO:
{texto_completo[:22000]}

Responde SOLO con JSON válido:
{{
  "descripcion_servicio": "Qué servicio o producto se requiere exactamente (máx 150 palabras)",
  "criterios_evaluacion": "Criterios de evaluación con ponderación o puntaje. Ej: Oferta técnica 60%, Precio 40%, Experiencia 20pts. Si no aparece escribe 'No especificado'",
  "requisitos_minimos": "Requisitos obligatorios excluyentes: experiencia mínima en años, certificaciones requeridas, garantías, documentos habilitantes (máx 150 palabras)",
  "plazo_ejecucion": "Duración o plazo del contrato si se menciona",
  "condiciones_especiales": "Restricciones importantes: inhabilidades, exclusiones, condiciones que afectan la postulación (máx 100 palabras)"
}}

Solo el JSON, sin texto adicional."""

        raw = self._call_claude(prompt, model="claude-3-5-haiku-20241022", max_tokens=700)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1][4:] if parts[1].startswith("json") else parts[1]
        try:
            return json.loads(cleaned.strip())
        except Exception:
            return {"descripcion_servicio": texto_completo[:300]}

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Búsqueda con lenguaje natural
    # ─────────────────────────────────────────────────────────────────────────

    async def busqueda_ia(self, consulta: str, catalogo: dict) -> dict:
        regiones = catalogo.get("regiones", [])
        rubros = catalogo.get("rubros", [])
        perfil = self._get_perfil_empresa()

        regiones_str = ", ".join(
            f'{r["nombre"]} (código {r["codigo"]})' for r in regiones
        ) if regiones else "todas las regiones de Chile"
        rubros_str = ", ".join(rubros) if rubros else "construcción, tecnología, salud, aseo, transporte, consultoría"

        # Contexto del perfil de la empresa
        rubros_empresa = ", ".join(perfil.get("rubros") or []) if perfil else ""
        razon_social = perfil.get("razon_social") or "" if perfil else ""
        descripcion_empresa = perfil.get("descripcion") or "" if perfil else ""
        perfil_ctx = ""
        if rubros_empresa or descripcion_empresa:
            rubros_line = f"- Rubros en los que opera: {rubros_empresa}" if rubros_empresa else "- Rubros: no especificados aún"
            desc_line = f"- Descripción: {descripcion_empresa[:300]}" if descripcion_empresa else "- Descripción: no especificada"
            perfil_ctx = f"""

CONTEXTO DE LA EMPRESA DEL USUARIO:
- Razón social: {razon_social or 'no especificada'}
{rubros_line}
{desc_line}

EVALÚA si la búsqueda del usuario tiene sentido para esta empresa.
Si la búsqueda está FUERA del giro de la empresa (por rubro O por descripción), incluye una advertencia clara y una sugerencia de búsqueda más acorde al perfil.
Si no hay suficiente información del perfil para evaluar, pon null en advertencia."""

        prompt = f"""Eres un asistente experto en licitaciones públicas chilenas de Mercado Público.
El usuario describió lo que busca en lenguaje natural. Extrae los filtros de búsqueda.{perfil_ctx}

CONSULTA DEL USUARIO: "{consulta}"

REGIONES VÁLIDAS: {regiones_str}
RUBROS DISPONIBLES: {rubros_str}

Responde SOLO con un JSON válido:
{{
  "keyword": "palabras clave MUY ESPECÍFICAS del objeto licitado (ej: 'plaza pública', 'ciberseguridad firewall', 'digitalización documentos'). Máx 3-4 palabras, NO uses palabras genéricas como 'construcción', 'servicio', 'contratación'. Usa el sustantivo principal de lo que se compra/contrata.",
  "region": "código numérico o null",
  "tipo_licitacion": null,
  "fecha_periodo_dias": 30,
  "resumen": "frase corta de lo que entendiste (máx 15 palabras)",
  "advertencia": "Si el perfil de la empresa tiene descripción o rubros Y la búsqueda no encaja con ese giro, escribe aquí una advertencia clara. Si no hay perfil o sí encaja, pon null.",
  "sugerencia": "Si pusiste advertencia, escribe aquí una búsqueda alternativa más acorde al perfil de la empresa (solo las keywords, sin comillas). Si no hay advertencia, pon null."
}}

Solo el JSON, sin texto adicional."""

        raw = self._call_claude(prompt, model="claude-3-5-haiku-20241022", max_tokens=400)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1][4:] if parts[1].startswith("json") else parts[1]
        return json.loads(cleaned.strip())

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Generar propuesta técnica (versión básica, sin bases reales)
    # ─────────────────────────────────────────────────────────────────────────

    async def generar_propuesta(self, prospect_id: str, instrucciones_extra: str = "") -> str:
        prospect = self._get_prospect(prospect_id)
        perfil = self._get_perfil_empresa()
        return self._redactar_propuesta(prospect, perfil, secciones={}, instrucciones_extra=instrucciones_extra)

    # ─────────────────────────────────────────────────────────────────────────
    # 2b. Generar documento específico (metodología, currículum, etc.)
    # ─────────────────────────────────────────────────────────────────────────

    async def generar_documento(self, prospect_id: str, tipo_documento: str, instrucciones_extra: str = "") -> str:
        """
        Genera un documento específico para la postulación usando Claude.

        tipos soportados:
          - metodologia       → Metodología de trabajo
          - curriculum        → Currículum empresa + proyectos similares
          - declaracion       → Declaración jurada simple (no condenas/conflictos)
          - cv_equipo         → CV sintético del equipo profesional
          - detalle_costos    → Tabla de costos / itemizado sugerido
          - carta_presentacion → Carta formal de presentación al organismo
          - carta_seguimiento → Carta de seguimiento post-postulación
        """
        prospect = self._get_prospect(prospect_id)
        perfil = self._get_perfil_empresa()
        return await asyncio.to_thread(self._generar_doc_sync, prospect, perfil, tipo_documento, instrucciones_extra)

    def _generar_doc_sync(self, prospect: Prospect, perfil: dict, tipo: str, instrucciones_extra: str = "") -> str:
        empresa_nombre  = perfil.get("razon_social") or "nuestra empresa"
        rubros          = ", ".join(perfil.get("rubros") or []) or "servicios generales"
        regiones        = ", ".join(perfil.get("regiones") or []) or "todo Chile"
        descripcion     = perfil.get("descripcion") or "empresa de servicios"
        experiencia     = perfil.get("experiencia_anos") or 0
        proyectos       = perfil.get("proyectos_anteriores") or ""
        certificaciones = perfil.get("certificaciones") or "ninguna"
        diferenciadores = perfil.get("diferenciadores") or ""

        # Contexto archivos subidos por el usuario
        archivos_contexto = perfil.get("archivos_contexto") or []
        ctx_archivos = ""
        if archivos_contexto:
            textos = [f"[{a['nombre']}]\n{a['texto'][:1500]}" for a in archivos_contexto[:3]]
            ctx_archivos = "\n\nDOCUMENTOS DE CONTEXTO SUBIDOS POR LA EMPRESA:\n" + "\n\n".join(textos)

        licitacion = (
            f"Nombre: {prospect.licitacion_nombre or prospect.company_name or 'Sin nombre'}\n"
            f"Organismo: {prospect.licitacion_organismo or 'N/A'}\n"
            f"Categoría: {prospect.licitacion_categoria or 'N/A'}\n"
            f"Región: {prospect.licitacion_region or 'N/A'}"
        )

        prompts = {
            "metodologia": f"""Eres experto en licitaciones públicas chilenas. Redacta una METODOLOGÍA DE TRABAJO profesional en Markdown.

LICITACIÓN:
{licitacion}

EMPRESA:
- Nombre: {empresa_nombre}
- Rubros: {rubros}
- Descripción: {descripcion}
- Experiencia: {experiencia} años
{ctx_archivos}

La metodología debe tener:
## Enfoque metodológico
## Etapas de trabajo (con fases y actividades concretas)
## Control de calidad
## Gestión de riesgos
## Comunicación con el organismo

Usa lenguaje técnico apropiado al rubro. Completa todas las secciones sin cortarte. Solo el documento, sin explicaciones.""",

            "curriculum": f"""Redacta el CURRÍCULUM EMPRESA en Markdown, listo para adjuntar a una licitación.

LICITACIÓN:
{licitacion}

EMPRESA:
- Nombre: {empresa_nombre}
- Rubros: {rubros}
- Regiones: {regiones}
- Descripción: {descripcion}
- Años de experiencia: {experiencia}
- Proyectos anteriores: {proyectos or 'no especificados'}
- Certificaciones: {certificaciones}
- Diferenciadores: {diferenciadores}
{ctx_archivos}

El currículum debe incluir:
## Quiénes somos
## Áreas de especialización
## Proyectos relevantes (tabla o lista)
## Certificaciones y acreditaciones
## Por qué elegirnos

Solo el documento final, sin comentarios.""",

            "declaracion": f"""Redacta una DECLARACIÓN JURADA SIMPLE para licitaciones públicas chilenas en Markdown.

Empresa declarante: {empresa_nombre}

La declaración debe indicar:
1. Que la empresa no tiene condenas penales
2. Que no existe conflicto de interés con el organismo licitante
3. Que la información entregada es veraz
4. Firma del representante legal

Formato formal, lenguaje legal estándar chileno. Deja espacios en blanco para: RUT empresa, RUT representante legal, nombre representante, fecha y firma.
Solo el documento, sin explicaciones.""",

            "cv_equipo": f"""Redacta un CV SINTÉTICO DEL EQUIPO en Markdown para postular a esta licitación.

LICITACIÓN:
{licitacion}

EMPRESA:
- Rubros: {rubros}
- Descripción: {descripcion}
{ctx_archivos}

Genera perfiles realistas para 3-4 personas clave según el rubro de la licitación.
Formato por persona:
### [Cargo]
- Formación: ...
- Experiencia: ...
- Rol en este proyecto: ...

Deja espacio para nombre real. No inventes RUTs ni datos específicos.""",

            "detalle_costos": f"""Genera una TABLA DE COSTOS ITEMIZADA en Markdown para esta licitación.

LICITACIÓN:
{licitacion}
Monto estimado: {'${:,.0f} CLP'.format(prospect.licitacion_monto) if prospect.licitacion_monto else 'No especificado'}

EMPRESA: {empresa_nombre} — Rubros: {rubros}
{ctx_archivos}

Crea una tabla con ítems realistas según el rubro:
| Ítem | Descripción | Cantidad | Precio Unit. | Total |

Incluye al menos 5-8 ítems relevantes al servicio/producto solicitado.
Al final: subtotal, IVA (19%), total.
Nota al pie indicando que los valores son referenciales.
Solo la tabla y notas, sin explicaciones.""",

            "carta_presentacion": f"""Redacta una CARTA FORMAL DE PRESENTACIÓN en Markdown dirigida al organismo licitante.

LICITACIÓN:
{licitacion}

EMPRESA:
- Nombre: {empresa_nombre}
- Rubros: {rubros}
- Descripción: {descripcion}
- Experiencia: {experiencia} años
- Diferenciadores: {diferenciadores}
{ctx_archivos}

Formato carta formal chilena:
- Encabezado con lugar y fecha (deja espacio)
- Dirigida a: [Nombre Director/Jefe Unidad], [Organismo]
- Cuerpo: presentación, interés en la licitación, fortalezas, cierre formal
- Firma y datos de contacto (placeholders)

Tono profesional y persuasivo. Completa la carta sin cortarte.""",

            "carta_seguimiento": f"""Redacta una CARTA DE SEGUIMIENTO POST-POSTULACIÓN en Markdown.

LICITACIÓN:
{licitacion}

EMPRESA:
- Nombre: {empresa_nombre}
- Rubros: {rubros}
- Descripción: {descripcion}
- Experiencia: {experiencia} años
- Diferenciadores: {diferenciadores}
{ctx_archivos}

Objetivo: reforzar la oferta ya presentada ante el evaluador, recordar fortalezas clave, ofrecer disponibilidad para responder consultas.

Formato carta formal chilena:
- Encabezado con lugar y fecha (deja espacio)
- Dirigida a: [Nombre evaluador], [Organismo]
- Párrafo 1: referencia a la postulación enviada (número licitación)
- Párrafo 2: recordar 2-3 diferenciadores clave
- Párrafo 3: disponibilidad y contacto
- Cierre formal y firma

Tono cercano pero profesional. Completa la carta sin cortarte.""",

            "carta_gantt": f"""Genera un PLAN DE TRABAJO con Carta Gantt en Markdown para esta licitación.

LICITACIÓN:
{licitacion}
{ctx_archivos}

EMPRESA: {empresa_nombre} — Rubros: {rubros}

Primero, analiza el tipo de servicio/producto de la licitación e infiere una duración razonable del contrato.

Luego genera:

## Plan de Trabajo

### Supuestos del plan
Breve descripción de los supuestos de duración y fases.

### Carta Gantt

| N° | Actividad | Semana 1 | Semana 2 | Semana 3 | Semana 4 | Semana 5 | Semana 6 | Semana 7 | Semana 8 | Responsable |
|---|---|---|---|---|---|---|---|---|---|---|
(usa ✓ o ███ para marcar las semanas de cada actividad, deja vacío las que no aplican)

Incluye al menos 8-10 actividades realistas: inicio, diagnóstico, ejecución por fases, entrega, cierre.

### Hitos clave
Lista de los hitos con fechas relativas (Semana X).

Solo el documento, sin explicaciones.""",
        }

        prompt = prompts.get(tipo)
        if not prompt:
            raise ValueError(f"Tipo de documento '{tipo}' no soportado")

        if instrucciones_extra:
            prompt += f"\n\nINSTRUCCIONES ADICIONALES DEL USUARIO: {instrucciones_extra}"

        prompt += "\n\nIMPORTANTE: No uses emojis en ninguna parte del documento. Usa solo texto y markdown estándar (##, -, *, tablas)."

        return self._call_claude(prompt, model="claude-3-5-sonnet-20241022", max_tokens=4000)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Analizar bases técnicas + score + propuesta calibrada
    # ─────────────────────────────────────────────────────────────────────────

    async def analizar_bases(self, prospect_id: str) -> dict:
        """
        Flujo completo:
        1. Obtiene documentos de la licitación desde MP API
        2. Descarga los PDFs de bases técnicas y administrativas
        3. Claude analiza: requisitos de las bases vs perfil empresa
        4. Devuelve score detallado, checklist de requisitos y propuesta adaptada

        Retorna:
        {
          score: int (0-100),
          nivel: "alto" | "medio" | "bajo",
          resumen: str,
          requisitos: [{item, cumple, observacion}],
          alertas: [str],
          propuesta: str (markdown),
          documentos_analizados: [str],
          tiene_documentos: bool,
        }
        """
        prospect = self._get_prospect(prospect_id)
        perfil = self._get_perfil_empresa()

        # 1. Obtener lista de documentos desde MP
        codigo = prospect.licitacion_codigo
        documentos = []
        texto_bases = ""
        documentos_analizados = []

        if codigo:
            try:
                mp_client = MercadoPublicoClient()
                documentos = await mp_client.obtener_documentos(codigo)
            except Exception:
                documentos = []

        # 2. Descargar y extraer texto de los documentos más relevantes
        # Prioridad: Bases Técnicas > Bases Administrativas > otros
        def prioridad_doc(d: dict) -> int:
            nombre = (d.get("nombre", "") + d.get("tipo", "")).lower()
            if "técnica" in nombre or "tecnica" in nombre:
                return 0
            if "administrativa" in nombre:
                return 1
            if "base" in nombre:
                return 2
            return 3

        docs_ordenados = sorted(documentos, key=prioridad_doc)[:5]  # máximo 5 docs

        for doc in docs_ordenados:
            url = doc.get("url", "")
            if not url:
                continue
            texto = await self._descargar_texto_pdf(url, max_chars=25000)
            if texto and not texto.startswith("[No se pudo"):
                texto_bases += f"\n\n--- {doc['nombre']} ---\n{texto}"
                documentos_analizados.append(doc["nombre"])

        tiene_documentos = bool(texto_bases.strip())

        # 3. Haiku extrae secciones estructuradas (rápido y barato)
        secciones: dict = {}
        if tiene_documentos:
            secciones = await asyncio.to_thread(self._extraer_secciones_clave, texto_bases)

        # 4. Sonnet analiza fit empresa vs licitación con secciones estructuradas
        analisis = await asyncio.to_thread(self._analizar_con_claude, prospect, perfil, secciones, tiene_documentos)

        # 5. Sonnet redacta propuesta calibrada a los criterios reales de evaluación
        propuesta = await asyncio.to_thread(self._redactar_propuesta, prospect, perfil, secciones)

        return {
            **analisis,
            "propuesta": propuesta,
            "documentos_analizados": documentos_analizados,
            "tiene_documentos": tiene_documentos,
        }

    def _analizar_con_claude(self, prospect: Prospect, perfil: dict, secciones: dict, tiene_bases: bool) -> dict:
        """Claude analiza el fit entre la licitación y la empresa usando secciones estructuradas."""
        empresa_nombre   = perfil.get("razon_social") or "nuestra empresa"
        rubros_empresa   = ", ".join(perfil.get("rubros") or []) or "no especificados"
        regiones_empresa = ", ".join(perfil.get("regiones") or []) or "todo Chile"
        descripcion      = perfil.get("descripcion") or "empresa de servicios"
        experiencia      = perfil.get("experiencia_anos") or 0
        certificaciones  = perfil.get("certificaciones") or "ninguna"
        diferenciadores  = perfil.get("diferenciadores") or "No especificados"
        inscrita_cp      = perfil.get("inscrito_chile_proveedores", False)

        licitacion_info = (
            f"Nombre: {prospect.licitacion_nombre or prospect.company_name or 'Sin nombre'}\n"
            f"Organismo: {prospect.licitacion_organismo or 'N/A'}\n"
            f"Categoría: {prospect.licitacion_categoria or 'N/A'}\n"
            f"Región: {prospect.licitacion_region or 'N/A'}\n"
            f"Monto: {'${:,.0f} CLP'.format(prospect.licitacion_monto) if prospect.licitacion_monto else 'No especificado'}\n"
            f"Cierre: {prospect.licitacion_fecha_cierre or 'N/A'}"
        )

        if tiene_bases and secciones:
            contexto_bases = f"""
INFORMACIÓN ESTRUCTURADA DE LAS BASES:
- Descripción del servicio: {secciones.get('descripcion_servicio', 'N/A')}
- Criterios de evaluación: {secciones.get('criterios_evaluacion', 'No especificado')}
- Requisitos mínimos obligatorios: {secciones.get('requisitos_minimos', 'N/A')}
- Plazo de ejecución: {secciones.get('plazo_ejecucion', 'N/A')}
- Condiciones especiales: {secciones.get('condiciones_especiales', 'N/A')}"""
        else:
            contexto_bases = "\nNo se pudieron obtener las bases técnicas. Analiza basándote en el rubro y tipo de licitación."

        prompt = f"""Eres un experto en licitaciones públicas chilenas. Analiza si esta empresa puede ganar esta licitación.

LICITACIÓN:
{licitacion_info}
{contexto_bases}

PERFIL DE LA EMPRESA:
- Nombre: {empresa_nombre}
- Rubros: {rubros_empresa}
- Regiones: {regiones_empresa}
- Descripción: {descripcion}
- Años de experiencia: {experiencia}
- Certificaciones: {certificaciones}
- Diferenciadores: {diferenciadores}
- Inscrita en ChileProveedores: {'Sí' if inscrita_cp else 'No'}

INSTRUCCIÓN CLAVE: Si los criterios de evaluación tienen ponderaciones (ej: Técnico 60%, Precio 40%),
el score debe reflejar principalmente qué tan bien cumple la empresa los criterios técnicos con mayor peso.
Si hay requisitos mínimos excluyentes que la empresa NO cumple, el score no puede superar 40.

Responde SOLO con JSON válido:
{{
  "score": <número 0-100>,
  "nivel": "<alto|medio|bajo>",
  "resumen": "<2 frases: nivel de fit Y los 2 factores más determinantes>",
  "requisitos": [
    {{"item": "<requisito o criterio de evaluación>", "cumple": <true|false|null>, "observacion": "<cómo lo cumple o qué falta>"}}
  ],
  "alertas": ["<alerta crítica que puede descalificar o hacer perder puntos>"]
}}

- score 80-100: cumple criterios técnicos + requisitos mínimos, muy competitiva
- score 50-79: brechas manejables, puede competir con buena propuesta
- score 0-49: brecha importante en requisitos excluyentes o criterios de alto peso
- requisitos: 5-8 items, priorizando los criterios de evaluación reales si los hay
- cumple: true/false/null (null = no determinable sin más info)
- alertas: máximo 3, ordenadas por criticidad

Solo el JSON."""

        raw = self._call_claude(prompt, model="claude-3-5-sonnet-20241022", max_tokens=1000)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1][4:] if parts[1].startswith("json") else parts[1]

        try:
            return json.loads(cleaned.strip())
        except Exception:
            return {
                "score": 50,
                "nivel": "medio",
                "resumen": "No se pudo analizar automáticamente.",
                "requisitos": [],
                "alertas": [],
            }

    def _redactar_propuesta(self, prospect: Prospect, perfil: dict, secciones: dict, instrucciones_extra: str = "") -> str:
        """Genera propuesta técnica calibrada a los criterios reales de evaluación."""
        empresa_nombre   = perfil.get("razon_social") or "nuestra empresa"
        rubros_empresa   = ", ".join(perfil.get("rubros") or []) or "no especificados"
        regiones_empresa = ", ".join(perfil.get("regiones") or []) or "todo Chile"
        descripcion      = perfil.get("descripcion") or "empresa de servicios"
        experiencia      = perfil.get("experiencia_anos") or 0
        proyectos        = perfil.get("proyectos_anteriores") or "No especificados"
        certificaciones  = perfil.get("certificaciones") or "ninguna especificada"
        diferenciadores  = perfil.get("diferenciadores") or "No especificados"

        # Incluir archivos de contexto subidos por el usuario
        archivos_contexto = perfil.get("archivos_contexto") or []
        ctx_archivos = ""
        if archivos_contexto:
            textos = [f"[{a['nombre']}]\n{a['texto'][:2000]}" for a in archivos_contexto[:3]]
            ctx_archivos = "\n\nDOCUMENTOS DE CONTEXTO DE LA EMPRESA (usa estos para enriquecer la propuesta):\n" + "\n\n".join(textos)

        licitacion_info = (
            f"Nombre: {prospect.licitacion_nombre or prospect.company_name or 'Sin nombre'}\n"
            f"Código: {prospect.licitacion_codigo or 'N/A'}\n"
            f"Organismo: {prospect.licitacion_organismo or 'N/A'}\n"
            f"Categoría: {prospect.licitacion_categoria or 'N/A'}\n"
            f"Región: {prospect.licitacion_region or 'N/A'}\n"
            f"Cierre: {prospect.licitacion_fecha_cierre or 'N/A'}"
        )

        criterios = secciones.get('criterios_evaluacion', '') if secciones else ''
        if secciones:
            contexto_bases = f"""
INFORMACIÓN DE LAS BASES:
- Servicio requerido: {secciones.get('descripcion_servicio', 'N/A')}
- Criterios de evaluación: {criterios or 'No especificado'}
- Requisitos mínimos: {secciones.get('requisitos_minimos', 'N/A')}
- Plazo: {secciones.get('plazo_ejecucion', 'N/A')}
- Condiciones especiales: {secciones.get('condiciones_especiales', 'N/A')}"""
        else:
            contexto_bases = "\nNo hay bases técnicas disponibles. Redacta propuesta profesional basada en el rubro."

        instruccion_criterios = (
            f"CRÍTICO: Los criterios de evaluación son '{criterios}'. "
            "Estructura CADA sección de la propuesta para maximizar el puntaje en esos criterios. "
            "Menciona explícitamente cómo la empresa cumple cada uno."
        ) if criterios and criterios != 'No especificado' else \
            "No se conocen los criterios de evaluación. Redacta una propuesta técnica completa y persuasiva."

        prompt = f"""Eres un experto en licitaciones públicas chilenas con 15 años redactando propuestas técnicas ganadoras.

LICITACIÓN:
{licitacion_info}
{contexto_bases}

EMPRESA POSTULANTE:
- Razón social: {empresa_nombre}
- Rubros: {rubros_empresa}
- Regiones: {regiones_empresa}
- Descripción: {descripcion}
- Años de experiencia: {experiencia}
- Proyectos anteriores: {proyectos}
- Certificaciones: {certificaciones}
- Diferenciadores clave: {diferenciadores}
{ctx_archivos}

{instruccion_criterios}

Redacta la propuesta técnica completa en Markdown:

## 1. Carta de Presentación
## 2. Entendimiento de los Requerimientos
## 3. Propuesta Técnica y Metodología
## 4. Equipo de Trabajo
## 5. Experiencia Relevante
## 6. Cronograma de Ejecución
## 7. Propuesta de Valor y Diferenciadores

Reglas:
- Lenguaje profesional, directo y persuasivo
- 1-2 párrafos por sección (CONCISO, no extenso)
- Si hay criterios de evaluación: cada sección menciona cómo contribuye al puntaje
- Destacar los diferenciadores en sección 7
- NO inventar datos concretos (RUTs, contratos específicos, montos exactos)
- IMPORTANTE: completa TODAS las secciones hasta el final, no te cortes"""

        if instrucciones_extra:
            prompt += f"\n\nINSTRUCCIONES ADICIONALES DEL USUARIO: {instrucciones_extra}"

        prompt += "\n\nIMPORTANTE: No uses emojis en ninguna parte del documento. Usa solo texto y markdown estándar (##, -, *, tablas)."

        return self._call_claude(prompt, model="claude-3-5-sonnet-20241022", max_tokens=6000)
