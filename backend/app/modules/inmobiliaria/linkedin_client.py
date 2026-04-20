"""
Cliente LinkedIn para el modulo Inmobiliaria.

Pipeline de 2 fases:
  Fase 1 - apify~google-search-scraper:
    Busca site:linkedin.com/in con queries de altos cargos en Florida
    -> extrae URLs de perfiles LinkedIn reales

  Fase 2 - curious_coder~linkedin-profile-scraper:
    Enriquece cada URL con nombre, cargo, empresa, ubicacion reales

Resultado: perfiles verificados de altos cargos, sin comprar listas.
Costo estimado: ~$0.10-0.30 por busqueda con plan STARTER de Apify.
"""
import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2/acts"

# Intermediarios: descartados de forma temprana (scorer lo refina)
EXCLUDE_TITLES = [
    "realtor", "agent", "broker", "corredor", "agente inmobiliario",
    "real estate agent", "realty", "listing agent",
]

# Queries enfocadas en compradores LATAM con capital para invertir en USA
# OJO: el metodo buscar_urls_google() ya agrega 'site:linkedin.com/in' — no repetir
DEFAULT_QUERIES_FLORIDA = [
    # Empresarios de alto cargo en Chile
    'CEO OR founder Chile "inversión" OR "patrimonio" OR "inversiones"',
    'dueño OR propietario Chile "USA" OR "Florida" OR "international"',
    # Colombia + Mexico — mercado grande
    'CEO OR gerente Colombia "inversión" OR "estados unidos" OR "USA"',
    'founder OR director Mexico "inversión" OR "real estate" OR "USA"',
    # Venezuela + Argentina — alta propensión a diversificar fuera
    'empresario Venezuela OR Argentina Miami OR Florida OR "inversión internacional"',
    # Perfiles de alto ingreso en LATAM (médicos, abogados)
    'médico OR doctor Chile OR Colombia OR México "inversión" OR "patrimonio"',
    'abogado OR arquitecto Chile OR Colombia "inversión" OR "bienes raices"',
    # Family offices y gestores de patrimonio
    '"family office" OR "wealth management" "Latin America" OR LATAM',
    # Inversionistas activos
    'investor OR inversionista "Latin America" OR LATAM "real estate" OR property',
    # Líderes de empresa medianas en países clave
    'president OR "managing director" Peru OR Ecuador OR Panama "inversión"',
]


class LinkedInClient:

    async def _run_actor(self, actor_id: str, run_input: dict, timeout: int = 120) -> list[dict]:
        """Llama a un actor de Apify en modo sync y devuelve los items."""
        url = f"{APIFY_BASE}/{actor_id}/run-sync-get-dataset-items"
        params = {"token": settings.APIFY_API_KEY}
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=run_input, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

    # ─────────────────────────────────────────────
    # FASE 1: Google Search → URLs de LinkedIn
    # ─────────────────────────────────────────────
    async def buscar_urls_google(self, query: str, max_results: int = 10) -> list[str]:
        """Busca perfiles LinkedIn via Google Search. Devuelve URLs linkedin.com/in/..."""
        try:
            raw = await self._run_actor("apify~google-search-scraper", {
                "queries": f"site:linkedin.com/in {query}",
                "maxPagesPerQuery": 1,
                "resultsPerPage": min(max_results, 10),
                "countryCode": "us",
                "languageCode": "en",
            }, timeout=60)
        except Exception as e:
            logger.warning(f"Google Search fallo para query '{query}': {e}")
            return []

        urls = []
        for page in raw:
            # El actor devuelve items de página con organicResults anidados
            organic = page.get("organicResults") or []
            # Fallback: a veces el item mismo ES un resultado orgánico
            if not organic and "linkedin.com/in/" in (page.get("url") or ""):
                organic = [page]
            for item in organic:
                url = item.get("url") or item.get("link") or ""
                if "linkedin.com/in/" in url:
                    url = url.split("?")[0].rstrip("/") + "/"
                    if url not in urls:
                        urls.append(url)
        return urls

    # ─────────────────────────────────────────────
    # FASE 2: curious_coder → perfil completo
    # ─────────────────────────────────────────────
    async def enriquecer_perfiles(self, linkedin_urls: list[str]) -> list[dict]:
        """
        Enriquece URLs con curious_coder~linkedin-profile-scraper.
        Procesa en batches de 10 para no exceder timeout de Apify.
        """
        if not linkedin_urls:
            return []

        perfiles = []
        batch_size = 10

        for i in range(0, len(linkedin_urls), batch_size):
            batch = linkedin_urls[i:i + batch_size]
            try:
                raw = await self._run_actor(
                    "dev_fusion~Linkedin-Profile-Scraper",
                    {"profileUrls": batch},
                    timeout=180,
                )
                for item in raw:
                    p = self._normalizar_perfil(item)
                    if p:
                        perfiles.append(p)
            except Exception as e:
                logger.warning(f"curious_coder fallo en batch {i}: {e}")
                # Fallback: guardar solo URL sin datos enriquecidos
                for url in batch:
                    slug = url.split("/in/")[-1].strip("/")
                    perfiles.append({
                        "contact_name": slug.replace("-", " ").title(),
                        "contact_title": "",
                        "company_name": "Lead LinkedIn",
                        "linkedin_url": url,
                        "source": "apify_linkedin",
                        "signal_text": f"Perfil LinkedIn encontrado: {url}",
                        "notes": f"Perfil LinkedIn (sin enriquecer): {url}",
                    })
            if i + batch_size < len(linkedin_urls):
                await asyncio.sleep(3)  # anti-throttle

        return perfiles

    def _normalizar_perfil(self, raw: dict):
        """Convierte respuesta de dev_fusion~Linkedin-Profile-Scraper a dict de prospecto."""
        # dev_fusion devuelve: fullName, firstName, lastName, headline, jobTitle,
        # companyName, companyIndustry, linkedinUrl, jobLocation
        nombre = (raw.get("fullName") or
                  f"{raw.get('firstName','')} {raw.get('lastName','')}".strip() or
                  raw.get("name") or "").strip()

        # Cargo: preferir jobTitle (cargo actual) sobre headline (slogan personal)
        titulo = (raw.get("jobTitle") or raw.get("headline") or raw.get("title") or "").strip()

        empresa = (raw.get("companyName") or "").strip()
        industria = (raw.get("companyIndustry") or "").strip()

        # Ubicación: jobLocation o location string
        ubicacion_str = (raw.get("jobLocation") or raw.get("location") or "").strip()
        if isinstance(raw.get("location"), dict):
            ubicacion_str = raw["location"].get("linkedinText") or ""
        ciudad = ""
        pais = ""
        if ubicacion_str:
            partes = [p.strip() for p in ubicacion_str.split(",")]
            ciudad = partes[0] if partes else ""
            pais = partes[-1] if len(partes) >= 2 else ubicacion_str
        ubicacion = ubicacion_str

        url = (raw.get("linkedinUrl") or raw.get("linkedInUrl") or "").strip()
        if url and not url.endswith("/"):
            url += "/"

        # Email y teléfono — dev_fusion los incluye cuando están públicos
        email = (raw.get("email") or "").strip()
        phone = (raw.get("mobileNumber") or raw.get("phone") or "").strip()

        if not nombre and not url:
            return None

        # Filtro rapido de intermediarios (scorer hace el analisis fino)
        if titulo and any(ex in titulo.lower() for ex in EXCLUDE_TITLES):
            logger.debug(f"Descartado intermediario: {nombre} - {titulo}")
            return None

        resumen = f"Cargo: {titulo}. Empresa: {empresa}. Ubicacion: {ubicacion}."
        result = {
            "contact_name": nombre or "Perfil LinkedIn",
            "contact_title": titulo,
            "company_name": empresa or (f"Lead LinkedIn - {titulo}" if titulo else "Lead LinkedIn"),
            "industry": industria,
            "city": ciudad,
            "country": pais,
            "linkedin_url": url,
            "source": "apify_linkedin",
            "signal_text": resumen,
            "notes": resumen,
        }
        if email:
            result["email"] = email
        if phone:
            result["phone"] = phone
        return result

    # ─────────────────────────────────────────────
    # METODO PRINCIPAL: flujo completo 2 fases
    # ─────────────────────────────────────────────
    async def buscar_perfiles_florida(
        self,
        queries: list | None = None,
        max_por_query: int = 8,
    ) -> list[dict]:
        """
        Flujo completo:
          1. Google Search en paralelo para cada query → URLs de LinkedIn
          2. curious_coder enriquece todos los perfiles con datos reales

        queries: textos de busqueda (sin 'site:linkedin.com/in', se agrega automatico)
        max_por_query: max URLs a extraer por query de Google (max 10)
        """
        queries = queries or DEFAULT_QUERIES_FLORIDA

        # Fase 1: obtener URLs en paralelo
        logger.info(f"LinkedIn Fase 1: {len(queries)} queries en Google Search")
        tasks = [self.buscar_urls_google(q, max_results=max_por_query) for q in queries]
        resultados = await asyncio.gather(*tasks, return_exceptions=True)

        todas_urls: list[str] = []
        vistas: set[str] = set()
        for res in resultados:
            if isinstance(res, Exception):
                continue
            for url in res:
                if url not in vistas:
                    vistas.add(url)
                    todas_urls.append(url)

        logger.info(f"LinkedIn Fase 1 completa: {len(todas_urls)} URLs unicas")

        if not todas_urls:
            logger.warning("No se encontraron URLs de LinkedIn en Google Search")
            return []

        # Fase 2: enriquecer con curious_coder
        logger.info(f"LinkedIn Fase 2: enriqueciendo {len(todas_urls)} perfiles")
        perfiles = await self.enriquecer_perfiles(todas_urls)
        logger.info(f"LinkedIn Fase 2 completa: {len(perfiles)} perfiles listos")
        return perfiles
