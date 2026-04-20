"""
Cliente LinkedIn para el módulo Inmobiliaria.

Usa el actor bebity/linkedin-profile-scraper via Apify para buscar
perfiles por cargo + país y detectar compradores potenciales de terrenos.

Coste estimado: ~$0.50-1.00 por 100 perfiles con la cuenta de $29/mes.
"""
import httpx
from app.core.config import settings

APIFY_BASE = "https://api.apify.com/v2/acts"

# Cargos de alta decisión o ingresos elevados — compradores potenciales
HIGH_VALUE_TITLES = [
    "ceo", "owner", "founder", "co-founder", "president",
    "managing director", "general manager", "cfo", "coo",
    "director", "vice president", "partner", "propietario",
    "dueño", "socio", "gerente general", "médico", "doctor",
    "abogado", "arquitecto", "ingeniero", "empresario",
    "inversionista", "investor",
]

# Títulos de intermediarios — siempre excluidos
EXCLUDE_TITLES = [
    "realtor", "agent", "broker", "corredor", "agente inmobiliario",
    "real estate agent", "realty",
]


class LinkedInClient:

    async def _run_actor(self, actor_id: str, run_input: dict) -> list[dict]:
        url = f"{APIFY_BASE}/{actor_id}/run-sync-get-dataset-items"
        params = {"token": settings.APIFY_API_KEY}
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, json=run_input, params=params)
            resp.raise_for_status()
            return resp.json()

    def _es_valido(self, perfil: dict) -> bool:
        """Filtra intermediarios y perfiles sin info relevante."""
        titulo = (perfil.get("headline") or perfil.get("title") or "").lower()
        # Excluir realtors/brokers
        if any(ex in titulo for ex in EXCLUDE_TITLES):
            return False
        return True

    def normalizar(self, raw: dict) -> dict:
        """Convierte raw de Apify a dict de prospecto."""
        nombre = raw.get("fullName") or raw.get("name") or ""
        titulo = raw.get("headline") or raw.get("title") or ""
        ubicacion = raw.get("location") or raw.get("addressWithCountry") or ""
        url = raw.get("linkedInUrl") or raw.get("profileUrl") or ""
        empresa = ""
        industria = ""
        # Extraer empresa actual de la experiencia
        exp = raw.get("experiences") or raw.get("positions") or []
        if isinstance(exp, list) and exp:
            primer_empleo = exp[0] if isinstance(exp[0], dict) else {}
            empresa = primer_empleo.get("companyName") or primer_empleo.get("company") or ""
            industria = primer_empleo.get("industry") or ""

        # País desde ubicación
        pais = ""
        ciudad = ""
        if ubicacion:
            partes = [p.strip() for p in ubicacion.split(",")]
            if len(partes) >= 2:
                ciudad = partes[0]
                pais = partes[-1]
            else:
                pais = ubicacion

        return {
            "contact_name": nombre,
            "contact_title": titulo,
            "company_name": empresa or f"Lead LinkedIn — {titulo}",
            "industry": industria,
            "city": ciudad,
            "country": pais,
            "linkedin_url": url,
            "source": "apify_linkedin",
            "notes": f"Perfil LinkedIn scrapeado. Cargo: {titulo}. Ubicación: {ubicacion}.",
        }

    async def buscar_por_query(self, query: str, max_results: int = 25) -> list[dict]:
        """
        Busca perfiles LinkedIn por texto (cargo + país).
        Usa bebity/linkedin-profile-scraper con búsqueda por keyword.
        """
        # Usamos Google Search para encontrar perfiles LinkedIn (bebity no disponible)
        raw = await self._run_actor("apify~google-search-scraper", {
            "queries": [f"site:linkedin.com/in {query}"],
            "maxPagesPerQuery": 1,
            "resultsPerPage": min(max_results, 10),
            "countryCode": "us",
            "languageCode": "en",
        })
        # Google results: {title, description, url}
        perfiles = []
        for r in raw:
            url = r.get("url", "")
            if "linkedin.com/in/" not in url:
                continue
            title = r.get("title", "")
            desc = r.get("description", "")
            nombre = title.split(" - ")[0].strip() if " - " in title else title.split(" |")[0].strip()
            perfiles.append({
                "nombre": nombre,
                "linkedin_url": url,
                "source": "apify_linkedin",
                "notes": desc[:300] if desc else f"Perfil encontrado vía búsqueda: {query}",
            })
        return perfiles

    async def buscar_multiples(self, queries: list[str], max_por_query: int = 20) -> list[dict]:
        """Corre múltiples queries y devuelve todos los perfiles únicos (por linkedin_url)."""
        import asyncio
        import random

        todos = []
        vistos: set[str] = set()

        for i, q in enumerate(queries):
            if i > 0:
                await asyncio.sleep(random.uniform(5, 15))  # anti-ban
            try:
                perfiles = await self.buscar_por_query(q, max_results=max_por_query)
                for p in perfiles:
                    key = p.get("linkedin_url") or p.get("contact_name", "")
                    if key and key not in vistos:
                        vistos.add(key)
                        todos.append(p)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"LinkedIn query '{q}' falló: {e}")
                continue

        return todos
