"""
Collector del módulo Inmobiliaria.

Lanza en paralelo las 6 fuentes de búsqueda y devuelve una lista cruda unificada:
  - Apollo LATAM  (personas en países LATAM con capital y cargo de decisión)
  - Apollo USA    (hispanos en USA con perfil financiero)
  - Facebook Groups (grupos de inversión en Florida)
  - Reddit        (posts en subreddits de real estate / finanzas personales)
  - Instagram     (comentadores en cuentas de real estate FL)
  - TikTok        (comentadores en videos de terrenos/inversión USA)

Cada item devuelto incluye el campo "_raw_source" para que el normalizer
sepa de dónde viene y cómo procesarlo.
"""
import asyncio
from app.modules.prospector.apollo_client import ApolloClient
from app.modules.prospector.apify_client import ApifyClient


# Países LATAM con mayor emigración hacia USA y capacidad inversora
LATAM_COUNTRIES = [
    "Mexico", "Colombia", "Argentina", "Venezuela", "Chile",
    "Peru", "Ecuador", "Brazil", "Dominican Republic", "Cuba",
    "Guatemala", "Costa Rica", "Panama", "Uruguay", "Bolivia",
]

# Industrias con liquidez para comprar terrenos ~$90k USD
TARGET_INDUSTRIES = [
    "Technology", "Financial Services", "Construction", "Real Estate",
    "Healthcare", "Oil & Energy", "Mining & Metals", "Manufacturing",
    "Retail", "Wholesale",
]

# Cargos con poder de decisión y capital
DECISION_TITLES = [
    "CEO", "Owner", "Founder", "Co-Founder", "President",
    "Managing Director", "General Manager", "CFO", "COO",
    "Director", "Vice President", "Partner",
]

# Cuentas de Instagram de real estate en Florida para scraping de comentarios
INSTAGRAM_RE_ACCOUNTS = [
    "floridarealestate",
    "miamirealestate",
    "orlandorealestate",
    "tampabayhomes",
    "floridainvestments",
]

# Subreddits relevantes para compradores de terrenos
REDDIT_SUBREDDITS = [
    "realestateinvesting",
    "personalfinance",
    "florida",
    "RealEstate",
]

REDDIT_KEYWORDS = ["buy land florida", "invest florida", "florida land", "terrenos florida"]

# Keywords de TikTok
TIKTOK_KEYWORDS = ["terrenosflorida", "invertirusa", "comprartierra", "floridarealestate"]

# Facebook Groups keywords
FACEBOOK_KEYWORDS = [
    "inversión en Florida",
    "terrenos USA",
    "real estate florida latinos",
    "comprar tierra USA",
    "inversores inmobiliarios florida",
]


class InmobiliariaCollector:
    def __init__(self, apollo_api_key: str = None, apify_api_key: str = None):
        self.apollo = ApolloClient(api_key=apollo_api_key)
        self.apify = ApifyClient(api_key=apify_api_key)

    async def recolectar(
        self,
        max_apollo_latam: int = 100,
        max_apollo_usa: int = 100,
        max_facebook: int = 50,
        max_reddit: int = 100,
        max_instagram: int = 100,
        max_tiktok: int = 50,
    ) -> list[dict]:
        """
        Lanza las 6 búsquedas en paralelo y devuelve lista cruda unificada.

        Cada item tiene el campo _raw_source con el origen:
          apollo_latam | apollo_usa | facebook | reddit | instagram | tiktok
        """
        results = await asyncio.gather(
            self._buscar_apollo_latam(max_apollo_latam),
            self._buscar_apollo_usa(max_apollo_usa),
            self._buscar_facebook(max_facebook),
            self._buscar_reddit(max_reddit),
            self._buscar_instagram(max_instagram),
            self._buscar_tiktok(max_tiktok),
            return_exceptions=True,
        )

        raw_prospects = []
        sources = ["apollo_latam", "apollo_usa", "facebook", "reddit", "instagram", "tiktok"]

        for source, result in zip(sources, results):
            if isinstance(result, Exception):
                # Si una fuente falla, las otras siguen — no bloqueamos todo
                continue
            for item in result:
                item["_raw_source"] = source
                raw_prospects.append(item)

        return raw_prospects

    # ── Apollo LATAM ──────────────────────────────────────────────────────────

    async def _buscar_apollo_latam(self, max_results: int) -> list:
        """
        Busca personas en LATAM con cargo de decisión e industria con liquidez.
        Excluye agentes y corredores inmobiliarios.
        """
        filtros = {
            "person_titles": DECISION_TITLES,
            "person_locations": LATAM_COUNTRIES,
            "organization_industry_tag_ids": [],  # Apollo usa IDs, filtro por q_keywords
            "q_keywords": "investor OR entrepreneur OR business owner",
            "per_page": min(max_results, 100),
            "page": 1,
        }
        respuesta = await self.apollo.search_people(filtros)
        return respuesta.get("people", []) or []

    # ── Apollo USA ────────────────────────────────────────────────────────────

    async def _buscar_apollo_usa(self, max_results: int) -> list:
        """
        Busca personas en USA con perfil financiero y nombres hispanos.
        Foco en Florida, Texas, California, Nueva York — mayor concentración latina.
        """
        filtros = {
            "person_titles": DECISION_TITLES,
            "person_locations": ["Florida", "Texas", "California", "New York", "New Jersey"],
            "q_keywords": "latino OR hispanic OR latin america investor entrepreneur",
            "per_page": min(max_results, 100),
            "page": 1,
        }
        respuesta = await self.apollo.search_people(filtros)
        return respuesta.get("people", []) or []

    # ── Apify: Facebook ───────────────────────────────────────────────────────

    async def _buscar_facebook(self, max_results: int) -> list:
        return await self.apify.scrape_facebook_groups(
            keywords=FACEBOOK_KEYWORDS,
            location="Florida",
        )

    # ── Apify: Reddit ─────────────────────────────────────────────────────────

    async def _buscar_reddit(self, max_results: int) -> list:
        return await self.apify.scrape_reddit(
            subreddits=REDDIT_SUBREDDITS,
            keywords=REDDIT_KEYWORDS,
            max_results=max_results,
        )

    # ── Apify: Instagram ──────────────────────────────────────────────────────

    async def _buscar_instagram(self, max_results: int) -> list:
        return await self.apify.scrape_instagram_comments(
            usernames=INSTAGRAM_RE_ACCOUNTS,
            max_comments=max_results,
        )

    # ── Apify: TikTok ─────────────────────────────────────────────────────────

    async def _buscar_tiktok(self, max_results: int) -> list:
        return await self.apify.scrape_tiktok(
            keywords=TIKTOK_KEYWORDS,
            max_results=max_results,
        )
