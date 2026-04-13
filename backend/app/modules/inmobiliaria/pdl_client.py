"""
People Data Labs client para búsqueda de compradores inmobiliarios.
Plan gratuito: 1.000 requests/mes.
Nota: PDL no soporta nested bool ni minimum_should_match.
Usamos queries simples por país/industria (~8 requests por búsqueda completa).
"""
import asyncio
import httpx
from typing import Any

PDL_BASE_URL = "https://api.peopledatalabs.com/v5"

# Top 6 países LATAM con mayor capital y emigración a USA
LATAM_COUNTRIES = ["mexico", "colombia", "argentina", "venezuela", "chile", "peru"]

# Top 4 industrias con capital para comprar ~$90k
LIQUID_INDUSTRIES = ["technology", "financial services", "oil and energy", "construction"]

# Niveles de decisión (campo: job_title_levels, plural)
DECISION_LEVELS = ["c_suite", "owner", "founder", "director"]


class PDLClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
        }

    async def buscar_latam(self, max_results: int = 60, countries: list = None) -> list[dict[str, Any]]:
        """Requests por país, filtrando por nivel de decisión."""
        paises = [c.lower() for c in (countries or LATAM_COUNTRIES)]
        per_country = max(2, max_results // len(paises))
        tasks = [
            self._search_one(
                must=[
                    {"term": {"location_country": country}},
                    {"terms": {"job_title_levels": DECISION_LEVELS}},
                ],
                size=min(per_country, 10),
                segment="latam",
            )
            for country in paises
        ]
        results_nested = await asyncio.gather(*tasks, return_exceptions=True)
        results = []
        for r in results_nested:
            if not isinstance(r, Exception):
                results.extend(r)
        return results[:max_results]

    async def buscar_usa_hispanos(self, max_results: int = 40, industries: list = None) -> list[dict[str, Any]]:
        """Requests por industria, ejecutivos en USA."""
        industrias = [i.lower() for i in (industries or LIQUID_INDUSTRIES)]
        per_industry = max(3, max_results // len(industrias))
        tasks = [
            self._search_one(
                must=[
                    {"term": {"location_country": "united states"}},
                    {"term": {"industry": industry}},
                    {"terms": {"job_title_levels": DECISION_LEVELS}},
                ],
                size=min(per_industry, 10),
                segment="usa",
            )
            for industry in industrias
        ]
        results_nested = await asyncio.gather(*tasks, return_exceptions=True)
        results = []
        for r in results_nested:
            if not isinstance(r, Exception):
                results.extend(r)
        return results[:max_results]

    async def _search_one(
        self,
        must: list[dict],
        size: int,
        segment: str,
    ) -> list[dict[str, Any]]:
        query = {"bool": {"must": must}}
        items = await self._search(query, size)
        for item in items:
            item["_pdl_segment"] = segment
        return items

    async def _search(self, query: dict, size: int) -> list[dict[str, Any]]:
        payload = {"query": query, "size": size, "pretty": False}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{PDL_BASE_URL}/person/search",
                headers=self.headers,
                json=payload,
            )
            if response.status_code == 429:
                raise Exception("PDL: rate limit, intenta en unos minutos")
            if response.status_code == 402:
                raise Exception("PDL: créditos mensuales agotados")
            if response.status_code == 401:
                raise Exception("PDL: API key inválida")
            if response.status_code == 400:
                raise Exception(f"PDL query inválida: {response.text[:100]}")
            response.raise_for_status()
            return response.json().get("data", [])
