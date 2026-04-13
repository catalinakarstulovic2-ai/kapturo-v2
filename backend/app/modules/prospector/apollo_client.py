"""
Apollo.io REST API client.

Apollo.io es una base de datos de contactos B2B con más de 275 millones de personas.
Usamos su API para buscar prospectos por cargo, industria y ubicación.
"""
import httpx
from app.core.config import settings

APOLLO_BASE_URL = "https://api.apollo.io/v1"


class ApolloClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.APOLLO_API_KEY
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self.api_key,
        }

    async def search_people(self, filters: dict) -> dict:
        """
        Busca personas en Apollo según filtros.

        filters puede incluir:
          - q_keywords: str
          - person_titles: list[str]
          - organization_industry_tag_ids: list
          - person_locations: list[str]
          - page: int
          - per_page: int
        """
        payload = {
            "per_page": filters.get("per_page", 25),
            "page": filters.get("page", 1),
        }

        if filters.get("q_keywords"):
            payload["q_keywords"] = filters["q_keywords"]
        if filters.get("person_titles"):
            payload["person_titles"] = filters["person_titles"]
        if filters.get("organization_industry_tag_ids"):
            payload["organization_industry_tag_ids"] = filters["organization_industry_tag_ids"]
        if filters.get("person_locations"):
            payload["person_locations"] = filters["person_locations"]

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{APOLLO_BASE_URL}/people/search",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def enrich_person(self, linkedin_url: str = None, email: str = None) -> dict:
        """
        Enriquece datos de una persona usando su LinkedIn URL o email.
        Devuelve datos detallados del contacto.
        """
        payload = {}

        if linkedin_url:
            payload["linkedin_url"] = linkedin_url
        if email:
            payload["email"] = email

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{APOLLO_BASE_URL}/people/match",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def search_organization(self, name: str, locations: list = None) -> dict:
        """
        Busca una organización en Apollo por nombre.
        Útil para obtener website, teléfono y dominio de una empresa.

        Retorna: {"organizations": [...]} donde cada org tiene
          website_url, phone, primary_domain, name, etc.

        locations: lista de países/ciudades para filtrar. Por defecto ["Chile"].
        """
        payload = {
            "q_organization_name": name,
            "organization_locations": locations or ["Chile"],
            "per_page": 1,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{APOLLO_BASE_URL}/mixed_companies/search",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
