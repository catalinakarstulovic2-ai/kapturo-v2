"""
Google Maps cliente directo para el módulo Prospector.

Usa Google Places API (textsearch + place details) para buscar negocios
por rubro y ciudad. Detecta si tienen web propia, solo redes sociales, o nada.

Esto permite identificar leads calientes (sin web) para agencias digitales,
o cualquier negocio local como prospecto de servicios B2B.
"""
import httpx
import asyncio
from app.core.config import settings

GMAPS_BASE = "https://maps.googleapis.com/maps/api"

# Si el "sitio web" del negocio es una red social → web_status = "solo_redes"
SOCIAL_DOMAINS = [
    "instagram.com", "facebook.com", "twitter.com", "tiktok.com",
    "t.me", "wa.me", "youtube.com", "pinterest.com", "linkedin.com",
]


class GoogleMapsProspectorClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.GOOGLE_MAPS_API_KEY

    def _detect_web_status(self, website: str | None) -> str:
        """
        Clasifica el estado web del negocio:
          - "sin_web":    sin sitio web → lead caliente (agencias web, marketing)
          - "solo_redes": solo redes sociales como web → lead normal
          - "tiene_web":  sitio web propio → descartar si buscamos clientes web
        """
        if not website:
            return "sin_web"
        lowered = website.lower()
        if any(d in lowered for d in SOCIAL_DOMAINS):
            return "solo_redes"
        return "tiene_web"

    async def buscar_negocios(
        self, query: str, location: str, max_results: int = 40
    ) -> list[dict]:
        """
        Busca negocios por rubro y ciudad usando Google Places Text Search.
        Para cada resultado obtiene teléfono y web via Place Details.

        Devuelve lista de dicts con: name, address, city, phone, website,
        web_status, category, rating, maps_url, place_id.
        """
        text_query = f"{query} {location}"
        url = f"{GMAPS_BASE}/place/textsearch/json"
        results: list[dict] = []
        next_page_token = None

        async with httpx.AsyncClient(timeout=30) as client:
            while len(results) < max_results:
                params: dict = {
                    "query": text_query,
                    "language": "es",
                    "key": self.api_key,
                }
                if next_page_token:
                    params["pagetoken"] = next_page_token

                r = await client.get(url, params=params)
                r.raise_for_status()
                data = r.json()
                places = data.get("results", [])

                for place in places:
                    place_id = place.get("place_id")
                    details: dict = {}
                    if place_id:
                        try:
                            details = await self._get_details(client, place_id)
                        except Exception:
                            pass

                    website = details.get("website", "")
                    web_status = self._detect_web_status(website)
                    address = (
                        details.get("formatted_address")
                        or place.get("formatted_address", "")
                    )
                    city = self._extract_city(address)
                    category = ""
                    types = place.get("types") or []
                    if types:
                        # Filtrar tipos genéricos de Google
                        skip = {"establishment", "point_of_interest", "food", "store"}
                        useful = [t for t in types if t not in skip]
                        category = useful[0] if useful else types[0]
                        category = category.replace("_", " ").title()

                    results.append({
                        "name": place.get("name", ""),
                        "address": address,
                        "city": city,
                        "phone": details.get("phone", ""),
                        "website": website,
                        "maps_url": details.get("maps_url", ""),
                        "web_status": web_status,
                        "category": category,
                        "rating": place.get("rating"),
                        "place_id": place_id,
                    })

                    if len(results) >= max_results:
                        break

                next_page_token = data.get("next_page_token")
                if not next_page_token:
                    break
                # Google requiere ~2s entre llamadas con pagetoken
                await asyncio.sleep(2)

        return results

    async def _get_details(
        self, client: httpx.AsyncClient, place_id: str
    ) -> dict:
        """Obtiene teléfono, web, dirección completa y URL de Maps para un lugar."""
        url = f"{GMAPS_BASE}/place/details/json"
        params = {
            "place_id": place_id,
            "fields": "formatted_phone_number,website,formatted_address,url",
            "key": self.api_key,
            "language": "es",
        }
        r = await client.get(url, params=params)
        result = r.json().get("result", {})
        return {
            "phone": result.get("formatted_phone_number", ""),
            "website": result.get("website", ""),
            "formatted_address": result.get("formatted_address", ""),
            "maps_url": result.get("url", ""),
        }

    def _extract_city(self, address: str) -> str:
        """Extrae la ciudad de una dirección estilo 'Calle X, Ciudad, País'."""
        if not address:
            return ""
        parts = [p.strip() for p in address.split(",")]
        # Google devuelve "nombre, calle, ciudad, región, país"
        # La ciudad suele estar en las posiciones intermedias
        if len(parts) >= 3:
            return parts[-2]
        if len(parts) == 2:
            return parts[0]
        return parts[0] if parts else ""
