"""
Cadena de enriquecimiento de contacto para leads sin email ni teléfono.

Orden (más barato → más caro):
  1. Hunter.io  — email-finder por nombre + dominio empresa
  2. Apollo.io  — enrich_person por linkedin_url
  3. Google Maps — buscar empresa, extraer teléfono

Si algún paso encuentra email o teléfono → se detiene y retorna.
Si todo falla → retorna dict vacío (lead no apto para Kanban).
"""
import logging
from app.modules.prospector.hunter_client import HunterClient, _extract_domain
from app.modules.prospector.apollo_client import ApolloClient
from app.modules.prospector.gmaps_client import GoogleMapsProspectorClient

logger = logging.getLogger(__name__)


async def enriquecer_cadena(
    contact_name: str = "",
    company_name: str = "",
    website: str = "",
    linkedin_url: str = "",
    city: str = "",
    country: str = "",
) -> dict:
    """
    Intenta obtener email o teléfono de un lead en cascada.

    Retorna dict con:
      - email: str | None
      - phone: str | None
      - enrichment_source: str  ("hunter" | "apollo" | "google_maps" | "")
      - found: bool
    """
    result = {"email": None, "phone": None, "enrichment_source": "", "found": False}

    # ── 1. Hunter.io ──────────────────────────────────────────────────────────
    try:
        hunter = HunterClient()
        if hunter.api_key:
            hunter_result = await hunter.enriquecer_linkedin_lead(
                contact_name=contact_name,
                company_name=company_name,
                website=website,
            )
            if hunter_result.get("enriched") and hunter_result.get("email"):
                result["email"] = hunter_result["email"]
                result["enrichment_source"] = "hunter"
                result["found"] = True
                logger.info(f"[Enrichment] Hunter encontró email para {contact_name}")
                return result
    except Exception as e:
        logger.warning(f"[Enrichment] Hunter falló para {contact_name}: {e}")

    # ── 2. Apollo.io ──────────────────────────────────────────────────────────
    try:
        apollo = ApolloClient()
        if apollo.api_key and linkedin_url:
            apollo_data = await apollo.enrich_person(linkedin_url=linkedin_url)
            person = apollo_data.get("person") or apollo_data.get("contact") or {}
            email = person.get("email")
            phone = (
                person.get("phone_numbers", [{}])[0].get("raw_number")
                if person.get("phone_numbers")
                else None
            )
            if email or phone:
                result["email"] = email
                result["phone"] = phone
                result["enrichment_source"] = "apollo"
                result["found"] = True
                logger.info(f"[Enrichment] Apollo encontró contacto para {contact_name}")
                return result
    except Exception as e:
        logger.warning(f"[Enrichment] Apollo falló para {contact_name}: {e}")

    # ── 3. Google Maps ────────────────────────────────────────────────────────
    try:
        gmaps = GoogleMapsProspectorClient()
        if gmaps.api_key and company_name:
            location = city or country or ""
            negocios = await gmaps.buscar_negocios(
                query=company_name,
                location=location,
                max_results=1,
            )
            if negocios:
                phone = negocios[0].get("phone")
                if phone:
                    result["phone"] = phone
                    result["enrichment_source"] = "google_maps"
                    result["found"] = True
                    logger.info(f"[Enrichment] Google Maps encontró teléfono para {company_name}")
                    return result
    except Exception as e:
        logger.warning(f"[Enrichment] Google Maps falló para {company_name}: {e}")

    logger.info(f"[Enrichment] Sin contacto encontrado para {contact_name} / {company_name}")
    return result
