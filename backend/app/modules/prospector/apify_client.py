"""
Apify client para scraping social.

Apify es una plataforma de web scraping que tiene actores (bots) prehechos
para extraer datos de Facebook, Google Maps, LinkedIn, etc.
"""
import httpx
from app.core.config import settings

APIFY_BASE_URL = "https://api.apify.com/v2"


class ApifyClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.APIFY_API_KEY

    async def run_actor(self, actor_id: str, run_input: dict) -> str:
        """
        Lanza un actor de Apify y devuelve el run_id para consultar resultados.

        actor_id: identificador del actor, ej: "apify/facebook-groups-scraper"
        run_input: configuración del actor
        """
        url = f"{APIFY_BASE_URL}/acts/{actor_id}/runs"
        params = {"token": self.api_key}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, params=params, json=run_input)
            response.raise_for_status()
            data = response.json()
            return data["data"]["id"]

    async def get_run_results(self, run_id: str, actor_id: str) -> list:
        """
        Obtiene los resultados de un actor ya ejecutado.

        Devuelve lista de items scrapeados.
        """
        url = f"{APIFY_BASE_URL}/acts/{actor_id}/runs/{run_id}/dataset/items"
        params = {"token": self.api_key}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    async def scrape_facebook_groups(self, keywords: list, location: str = None) -> list:
        """
        Scrapes Facebook Groups usando el actor oficial de Apify.

        keywords: lista de términos a buscar, ej: ["inversores inmobiliarios", "real estate"]
        location: ubicación opcional para filtrar
        """
        actor_id = "apify/facebook-groups-scraper"

        run_input = {
            "searchTerms": keywords,
            "maxPosts": 50,
        }
        if location:
            run_input["location"] = location

        run_id = await self.run_actor(actor_id, run_input)
        return await self.get_run_results(run_id, actor_id)

    async def scrape_google_maps(self, query: str, location: str = None, max_results: int = 50) -> list:
        """
        Scrapes Google Maps usando el actor compass/crawler-google-places.

        query: qué buscar, ej: "constructoras en Santiago"
        location: ciudad o dirección para centrar la búsqueda
        """
        actor_id = "compass/crawler-google-places"

        search_string = query
        if location:
            search_string = f"{query} {location}"

        run_input = {
            "searchStringsArray": [search_string],
            "maxCrawledPlacesPerSearch": max_results,
            "language": "es",
        }

        run_id = await self.run_actor(actor_id, run_input)
        return await self.get_run_results(run_id, actor_id)
