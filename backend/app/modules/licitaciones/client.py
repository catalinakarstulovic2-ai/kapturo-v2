"""
Cliente para la API de Mercado Público Chile.
Documentación: https://apis.mercadopublico.cl

Endpoints que usamos:
- GET /licitaciones?ticket=&fecha=&estado=&region=&pagina=  → listar
- GET /licitaciones?ticket=&codigo={codigo}                 → detalle de una

Notas críticas de la API:
- `fecha`:  formato DDMMYYYY, debe ser fecha PASADA (no hoy ni futuro)
- `estado`: string en español — "Adjudicada", "Publicada", "Cerrada", etc.
            NO usar códigos numéricos (devuelven error 500).
- `tipo`:   NO existe como filtro. Aparece en la respuesta pero no se puede filtrar.
- `region`: código numérico de región, ej "13" para RM.
"""
import httpx
from datetime import datetime, timedelta
from typing import Optional
from app.core.config import settings

MERCADO_PUBLICO_BASE = "https://api.mercadopublico.cl/servicios/v1/publico"

# Mapeo de alias internos a los strings que acepta la API
_ESTADOS_API = {
    "adjudicada":  "Adjudicada",
    "publicada":   "Publicada",
    "cerrada":     "Cerrada",
    "desierta":    "Desierta",
    "revocada":    "Revocada",
    "suspendida":  "Suspendida",
    "todas":       "Todos",
}


class MercadoPublicoClient:
    def __init__(self):
        self.api_key = settings.MERCADO_PUBLICO_API_KEY
        self.base_url = MERCADO_PUBLICO_BASE

    async def buscar_licitaciones(
        self,
        fecha: Optional[str] = None,        # DDMMYYYY — ayer por defecto
        estado: str = "adjudicada",          # alias interno o string directo
        region: Optional[str] = None,        # código numérico, ej "13"
        pagina: int = 1,
    ) -> dict:
        """
        Busca licitaciones en Mercado Público.

        - fecha: DDMMYYYY. Debe ser una fecha pasada. Por defecto: ayer.
        - estado: "adjudicada" (Módulo B) | "publicada" (Módulo A) | otros.
        - region: código de región chilena ("1"–"16").
        """
        if not fecha:
            fecha = (datetime.now() - timedelta(days=1)).strftime("%d%m%Y")

        estado_api = _ESTADOS_API.get(estado.lower(), estado)

        params: dict = {
            "ticket": self.api_key,
            "pagina":  pagina,
            "fecha":   fecha,
            "estado":  estado_api,
        }
        if region:
            params["region"] = region

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(f"{self.base_url}/licitaciones", params=params)
            response.raise_for_status()
            data = response.json()

        # La API devuelve errores en el body incluso con HTTP 200/500
        if "Codigo" in data:
            raise ValueError(
                f"Mercado Público {data['Codigo']}: {data.get('Mensaje', 'Error desconocido')}"
            )

        return data

    async def obtener_detalle(self, codigo: str) -> dict:
        """
        Obtiene el detalle completo de una licitación (organismo, adjudicado, monto, fechas).

        Usa el mismo endpoint pero con el parámetro ?codigo= en lugar de path param.
        Devuelve el item directamente (no el wrapper con Listado).
        """
        params = {"ticket": self.api_key, "codigo": codigo}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(f"{self.base_url}/licitaciones", params=params)
            response.raise_for_status()
            data = response.json()

        if "Codigo" in data:
            raise ValueError(
                f"Detalle {codigo} error {data['Codigo']}: {data.get('Mensaje', '')}"
            )

        listado = data.get("Listado", [])
        if not listado:
            raise ValueError(f"Licitación {codigo} no encontrada")

        return listado[0]   # item directo, listo para LicitacionNormalizada

    async def buscar_licitaciones_abiertas(self, **kwargs) -> dict:
        """Módulo A: licitaciones que se pueden ganar."""
        return await self.buscar_licitaciones(estado="publicada", **kwargs)

    async def buscar_adjudicadas(self, **kwargs) -> dict:
        """Módulo B: licitaciones ya adjudicadas (hay un ganador)."""
        return await self.buscar_licitaciones(estado="adjudicada", **kwargs)

    async def obtener_documentos(self, codigo: str) -> list[dict]:
        """
        Obtiene la lista de documentos adjuntos de una licitación.
        Devuelve: [{nombre, descripcion, url, tipo, fecha}]

        Los documentos incluyen: Bases Técnicas, Bases Administrativas,
        Formularios, Anexos, etc. — todos son descargables como PDF.
        """
        detalle = await self.obtener_detalle(codigo)
        docs_raw = detalle.get("Documentos", {})
        listado = docs_raw.get("Listado", []) if isinstance(docs_raw, dict) else []

        documentos = []
        for doc in listado:
            url = doc.get("Url", "")
            if not url:
                continue
            documentos.append({
                "nombre": doc.get("Nombre", ""),
                "descripcion": doc.get("Descripcion", ""),
                "url": url,
                "tipo": doc.get("Tipo", ""),
                "fecha": doc.get("FechaCreacion", "")[:10] if doc.get("FechaCreacion") else "",
            })

        return documentos

    def obtener_catalogo(self) -> dict:
        """
        Catálogos fijos de Mercado Público Chile.
        Regiones y tipos son fijos por ley. Rubros son los de ChileCompra.
        """
        return {
            "regiones": [
                {"codigo": "13", "nombre": "Metropolitana de Santiago"},
                {"codigo": "5",  "nombre": "Valparaíso"},
                {"codigo": "8",  "nombre": "Biobío"},
                {"codigo": "9",  "nombre": "La Araucanía"},
                {"codigo": "7",  "nombre": "Maule"},
                {"codigo": "10", "nombre": "Los Lagos"},
                {"codigo": "4",  "nombre": "Coquimbo"},
                {"codigo": "6",  "nombre": "O'Higgins"},
                {"codigo": "16", "nombre": "Ñuble"},
                {"codigo": "2",  "nombre": "Antofagasta"},
                {"codigo": "1",  "nombre": "Tarapacá"},
                {"codigo": "3",  "nombre": "Atacama"},
                {"codigo": "14", "nombre": "Los Ríos"},
                {"codigo": "11", "nombre": "Aysén"},
                {"codigo": "12", "nombre": "Magallanes"},
                {"codigo": "15", "nombre": "Arica y Parinacota"},
            ],
            "tipos": [
                {"codigo": "L1", "nombre": "Licitación Menor Cuantía (L1)"},
                {"codigo": "LE", "nombre": "Licitación Pública ≤ 1.000 UTM (LE)"},
                {"codigo": "LP", "nombre": "Licitación Pública ≤ 2.000 UTM (LP)"},
                {"codigo": "LQ", "nombre": "Licitación Pública ≤ 5.000 UTM (LQ)"},
                {"codigo": "LR", "nombre": "Licitación Pública > 5.000 UTM (LR)"},
                {"codigo": "LS", "nombre": "Gran Compra (LS)"},
                {"codigo": "B2", "nombre": "Trato Directo (B2)"},
                {"codigo": "CO", "nombre": "Convenio Marco (CO)"},
                {"codigo": "O",  "nombre": "Orden de Compra (O)"},
            ],
            "estados": [
                {"codigo": "publicada",   "label": "Publicada (activa)",    "api_codigo": 5},
                {"codigo": "cerrada",     "label": "Cerrada",               "api_codigo": 6},
                {"codigo": "desierta",    "label": "Desierta",              "api_codigo": 7},
                {"codigo": "adjudicada",  "label": "Adjudicada",            "api_codigo": 8},
                {"codigo": "revocada",    "label": "Revocada",              "api_codigo": 15},
                {"codigo": "suspendida",  "label": "Suspendida",            "api_codigo": 16},
            ],
            "rubros": sorted([
                # Categorías reales del sistema UNSPSC de ChileCompra
                # (primer nivel de la ruta Categoría que devuelve la API de Mercado Público)
                "Servicios de construcción y mantenimiento",
                "Servicios profesionales, administrativos y consultorías de gestión empresarial",
                "Equipamiento y suministros médicos",
                "Tecnologías de información y telecomunicaciones",
                "Alimentos, bebidas y tabaco",
                "Combustibles, energía y productos relacionados",
                "Equipos y maquinaria industrial",
                "Vehículos y medios de transporte",
                "Servicios de educación y formación profesional",
                "Servicios de limpieza, aseo y mantenimiento de espacios",
                "Servicios de seguridad y vigilancia",
                "Materiales y productos de construcción",
                "Mobiliario y equipamiento de oficina",
                "Servicios de salud y bienestar social",
                "Servicios de transporte y logística",
                "Vestuario, uniformes y calzado",
                "Servicios de comunicaciones, publicidad y marketing",
                "Equipos eléctricos, electrónicos e instrumentos",
                "Productos farmacéuticos y químicos",
                "Servicios de laboratorio y análisis",
                "Servicios de medio ambiente y gestión de residuos",
                "Artículos para estructuras, obras y construcciones",
                "Servicios de ingeniería y arquitectura",
                "Servicios agrícolas, ganaderos y forestales",
                "Minería y extracción de recursos naturales",
                "Servicios financieros, contables y de seguros",
                "Servicios jurídicos y legales",
                "Recursos humanos y servicios de personal",
                "Servicios de impresión, edición y artes gráficas",
                "Servicios deportivos, recreativos y culturales",
                "Servicios veterinarios y de animales",
                "Servicios hoteleros, gastronómicos y turismo",
                "Equipos y suministros de oficina e informática",
                "Servicios de investigación y desarrollo",
            ]),
        }
