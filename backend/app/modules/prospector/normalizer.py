"""
Normalizador del módulo Prospector.

Convierte los datos crudos de Apollo, Apify y Google Maps al formato estándar
de Prospect que usa Kapturo. Esto nos permite tratar todos los
prospectos igual, sin importar de dónde vienen.
"""
import json
from app.models.prospect import ProspectSource


def normalizar_apollo(person: dict) -> dict:
    """
    Convierte una persona de Apollo al formato Prospect de Kapturo.

    Apollo devuelve campos como: first_name, last_name, title,
    organization, email, phone_numbers, linkedin_url, city, country, etc.
    """
    # Nombre completo del contacto
    first_name = person.get("first_name", "") or ""
    last_name = person.get("last_name", "") or ""
    contact_name = f"{first_name} {last_name}".strip()

    # Datos de la organización
    org = person.get("organization") or {}
    company_name = org.get("name") or person.get("organization_name", "")

    # Teléfono (Apollo devuelve lista de teléfonos)
    phone = ""
    phone_numbers = person.get("phone_numbers", []) or []
    if phone_numbers:
        phone = phone_numbers[0].get("sanitized_number", "") or ""

    # Email
    email = person.get("email", "") or ""

    # LinkedIn
    linkedin_url = person.get("linkedin_url", "") or ""

    # Ubicación
    city = person.get("city", "") or ""
    country = person.get("country", "") or ""

    # Industria
    industry = ""
    if org:
        industry = org.get("industry", "") or ""

    return {
        "company_name": company_name,
        "contact_name": contact_name,
        "contact_title": person.get("title", "") or "",
        "email": email,
        "phone": phone,
        "linkedin_url": linkedin_url,
        "city": city,
        "country": country,
        "industry": industry,
        "source": ProspectSource.apollo,
        "source_module": "prospector",
        "raw_data": json.dumps(person),
    }


def normalizar_apify(item: dict, source_type: str) -> dict:
    """
    Convierte un item de Apify al formato Prospect de Kapturo.

    source_type: "facebook" o "maps"
    Los campos varían según el actor usado.
    """
    if source_type == "facebook":
        return _normalizar_facebook(item)
    else:
        return _normalizar_maps(item)


def normalizar_gmaps(item: dict) -> dict:
    """
    Convierte un item del Google Maps Prospector (directo via Places API)
    al formato Prospect de Kapturo.

    Campos esperados: name, address, city, phone, website, web_status,
    category, rating, maps_url, place_id.
    """
    return {
        "company_name": item.get("name", ""),
        "contact_name": "",
        "contact_title": "",
        "email": "",
        "phone": item.get("phone", ""),
        "address": item.get("address", ""),
        "website": item.get("website", ""),
        "city": item.get("city", ""),
        "country": "",
        "industry": item.get("category", ""),
        "web_status": item.get("web_status", "sin_web"),
        "source_url": item.get("maps_url", ""),
        "source": ProspectSource.google_maps,
        "source_module": "prospector",
        "raw_data": json.dumps(item),
    }


def _normalizar_facebook(item: dict) -> dict:
    """
    Normaliza un item del Facebook Groups Scraper de Apify.

    Campos típicos: groupName, description, memberCount, url, etc.
    """
    # En grupos de Facebook los contactos son los administradores o publicantes
    name = item.get("authorName", "") or item.get("groupName", "") or ""
    description = item.get("text", "") or item.get("description", "") or ""

    return {
        "company_name": item.get("groupName", "") or name,
        "contact_name": item.get("authorName", "") or "",
        "contact_title": "",
        "email": "",
        "phone": item.get("phone", "") or "",
        "linkedin_url": "",
        "city": item.get("city", "") or "",
        "country": item.get("country", "") or "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "prospector",
        "raw_data": json.dumps(item),
    }


def _normalizar_maps(item: dict) -> dict:
    """
    Normaliza un item del Google Maps Places Scraper de Apify.

    Campos típicos: title, address, phone, website, categoryName,
    city, countryCode, etc.
    """
    # Google Maps devuelve el nombre del negocio como "title"
    company_name = item.get("title", "") or item.get("name", "") or ""

    # Dirección
    address = item.get("address", "") or ""
    city = item.get("city", "") or ""
    country = item.get("countryCode", "") or item.get("country", "") or ""

    # Si no tiene city separado, intentar extraer de address
    if not city and address:
        parts = address.split(",")
        if len(parts) >= 2:
            city = parts[-2].strip()

    return {
        "company_name": company_name,
        "contact_name": "",
        "contact_title": "",
        "email": item.get("email", "") or "",
        "phone": item.get("phone", "") or item.get("phoneUnformatted", "") or "",
        "linkedin_url": "",
        "city": city,
        "country": country,
        "industry": item.get("categoryName", "") or item.get("category", "") or "",
        "source": ProspectSource.apify_maps,
        "source_module": "prospector",
        "raw_data": json.dumps(item),
    }
