"""
Apify client para scraping social.

Apify es una plataforma de web scraping que tiene actores (bots) prehechos
para extraer datos de Facebook, Google Maps, LinkedIn, etc.
"""
import asyncio
import httpx
from app.core.config import settings

APIFY_BASE_URL = "https://api.apify.com/v2"
POLL_INTERVAL = 10   # segundos entre cada consulta de estado
POLL_TIMEOUT  = 900  # máximo 15 minutos esperando un actor


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

    async def wait_for_run(self, run_id: str) -> str:
        """
        Espera a que un run de Apify termine (SUCCEEDED o FAILED).

        Los actores de Apify son asíncronos: se lanzan y tardan minutos en terminar.
        Sin este polling, get_run_results devuelve lista vacía porque el actor
        todavía está corriendo cuando se consultan los datos.

        Devuelve el status final: "SUCCEEDED", "FAILED", "ABORTED", etc.
        """
        url = f"{APIFY_BASE_URL}/actor-runs/{run_id}"
        params = {"token": self.api_key}
        elapsed = 0

        async with httpx.AsyncClient(timeout=30) as client:
            while elapsed < POLL_TIMEOUT:
                response = await client.get(url, params=params)
                response.raise_for_status()
                status = response.json()["data"]["status"]

                if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                    return status

                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL

        return "TIMED-OUT"

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

    async def _run_and_wait(self, actor_id: str, run_input: dict) -> list:
        """
        Helper interno: lanza el actor, espera a que termine y devuelve resultados.
        Si falla o se agota el tiempo, devuelve lista vacía.
        """
        run_id = await self.run_actor(actor_id, run_input)
        status = await self.wait_for_run(run_id)
        if status != "SUCCEEDED":
            return []
        return await self.get_run_results(run_id, actor_id)

    # ── Métodos de scraping ───────────────────────────────────────────────────

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

        return await self._run_and_wait(actor_id, run_input)

    async def scrape_google_maps(self, query: str, location: str = None, max_results: int = 50) -> list:
        """
        Scrapes Google Maps usando el actor compass/crawler-google-places.

        query: qué buscar, ej: "constructoras en Santiago"
        location: ciudad o dirección para centrar la búsqueda
        """
        actor_id = "compass/crawler-google-places"

        search_string = f"{query} {location}" if location else query

        run_input = {
            "searchStringsArray": [search_string],
            "maxCrawledPlacesPerSearch": max_results,
            "language": "es",
        }

        return await self._run_and_wait(actor_id, run_input)

    async def scrape_reddit(self, subreddits: list, keywords: list, max_results: int = 100) -> list:
        """
        Scrapes posts y comentarios de Reddit.

        subreddits: ej: ["realestateinvesting", "personalfinance", "florida"]
        keywords: ej: ["buy land florida", "invest florida"]
        max_results: límite de items por subreddit
        """
        actor_id = "trudax/reddit-scraper"

        run_input = {
            "startUrls": [
                {"url": f"https://www.reddit.com/r/{sub}/search/?q={'+'.join(keywords)}&sort=new"}
                for sub in subreddits
            ],
            "maxItems": max_results,
            "proxy": {"useApifyProxy": True},
        }

        return await self._run_and_wait(actor_id, run_input)

    async def scrape_instagram_comments(self, usernames: list, max_comments: int = 100) -> list:
        """
        Scrapes comentarios de posts de cuentas de Instagram.

        usernames: cuentas de real estate en Florida, ej: ["floridarealestate", "investflorida"]
        max_comments: límite de comentarios por cuenta
        """
        actor_id = "apify/instagram-comment-scraper"

        run_input = {
            "directUrls": [f"https://www.instagram.com/{u}/" for u in usernames],
            "resultsLimit": max_comments,
        }

        return await self._run_and_wait(actor_id, run_input)

    async def scrape_tiktok(self, keywords: list, max_results: int = 50) -> list:
        """
        Scrapes videos y comentarios de TikTok por keyword.

        keywords: ej: ["terrenos florida", "invertir usa", "comprar tierra florida"]
        max_results: límite de items por keyword
        """
        actor_id = "clockworks/tiktok-scraper"

        run_input = {
            "hashtags": keywords,
            "resultsPerPage": max_results,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
        }

        return await self._run_and_wait(actor_id, run_input)
