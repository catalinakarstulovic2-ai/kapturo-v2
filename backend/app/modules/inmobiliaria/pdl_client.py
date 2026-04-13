"""
People Data Labs client para búsqueda de compradores inmobiliarios.
Plan gratuito: 1.000 requests/mes.
Docs: https://docs.peopledatalabs.com/docs/person-search-api
"""
import os
import httpx
from typing import Any

PDL_BASE_URL = "https://api.peopledatalabs.com/v5"

# Países LATAM con alta emigración a USA
LATAM_COUNTRIES = [
    "mexico", "colombia", "argentina", "venezuela", "peru",
    "chile", "ecuador", "cuba", "dominican republic", "guatemala",
    "honduras", "bolivia", "el salvador", "paraguay", "uruguay",
    "costa rica", "panama", "brazil",
]

# Industrias con liquidez
LIQUID_INDUSTRIES = [
    "technology", "financial services", "real estate", "construction",
    "oil and energy", "mining and metals", "healthcare", "pharmaceuticals",
    "banking", "investment management", "venture capital",
    "private equity", "insurance",
]

# Niveles de decisión
DECISION_LEVELS = ["c_suite", "owner", "founder", "director", "vp", "partner"]


class PDLClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
        }

    async def buscar_latam(self, max_results: int = 50) -> list[dict[str, Any]]:
        """Busca ejecutivos LATAM con capital (potenciales compradores)."""
        results = []
        for country in LATAM_COUNTRIES[:8]:  # top 8 países para no agotar el free tier
            try:
                batch = await self._search(
                    must=[
                        {"field": "location_country", "value": country},
                        {"field": "job_title_levels", "value": DECISION_LEVELS},
                    ],
                    size=min(max_results // 8, 10),
                )
                for item in batch:
                    item["_pdl_segment"] = "latam"
                results.extend(batch)
            except Exception:
                continue
        return results[:max_results]

    async def buscar_usa_hispanos(self, max_results: int = 50) -> list[dict[str, Any]]:
        """Busca hispanos en USA con perfil de comprador."""
        results = []
        for industry in LIQUID_INDUSTRIES[:6]:
            try:
                batch = await self._search(
                    must=[
                        {"field": "location_country", "value": "united states"},
                        {"field": "job_company_industry", "value": industry},
                        {"field": "job_title_levels", "value": DECISION_LEVELS},
                    ],
                    # Filtramos apellidos hispanos comunes como proxy de origen
                    size=min(max_results // 6, 10),
                )
                for item in batch:
                    item["_pdl_segment"] = "usa"
                results.extend(batch)
            except Exception:
                continue
        return results[:max_results]

    async def _search(
        self,
        must: list[dict],
        size: int = 10,
    ) -> list[dict[str, Any]]:
        """Llama al endpoint /person/search de PDL."""
        payload = {
            "query": {
                "bool": {
                    "must": [
                        self._build_clause(clause) for clause in must
                    ]
                }
            },
            "size": size,
            "pretty": False,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{PDL_BASE_URL}/person/search",
                headers=self.headers,
                json=payload,
            )
            if response.status_code == 402:
                raise Exception("PDL: créditos agotados")
            if response.status_code == 401:
                raise Exception("PDL: API key inválida")
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])

    @staticmethod
    def _build_clause(clause: dict) -> dict:
        field = clause["field"]
        value = clause["value"]
        if isinstance(value, list):
            return {"terms": {field: value}}
        return {"term": {field: value}}
