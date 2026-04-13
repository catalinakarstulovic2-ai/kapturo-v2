"""
Normalizador del módulo Inmobiliaria.

Convierte los items crudos de cada fuente al formato estándar de Prospect.
El campo _raw_source (puesto por el collector) indica qué normalizador usar.
"""
import json
from app.modules.prospector.normalizer import normalizar_apollo
from app.models.prospect import ProspectSource


def normalizar(item: dict) -> dict:
    """
    Punto de entrada único. Detecta la fuente y normaliza.
    """
    source = item.get("_raw_source", "")

    if source in ("apollo_latam", "apollo_usa"):
        p = normalizar_apollo(item)
        p["source_module"] = "inmobiliaria"
        p["fuente_inmobiliaria"] = source
        return p

    if source == "facebook":
        return _normalizar_facebook(item)

    if source == "reddit":
        return _normalizar_reddit(item)

    if source == "instagram":
        return _normalizar_instagram(item)

    if source == "tiktok":
        return _normalizar_tiktok(item)

    # Fallback genérico
    return {
        "company_name": item.get("title", "") or item.get("name", "") or "",
        "contact_name": item.get("authorName", "") or item.get("username", "") or "",
        "contact_title": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "city": "",
        "country": "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "inmobiliaria",
        "fuente_inmobiliaria": source,
        "raw_data": json.dumps(item),
    }


def _normalizar_facebook(item: dict) -> dict:
    return {
        "company_name": item.get("groupName", "") or item.get("authorName", "") or "",
        "contact_name": item.get("authorName", "") or "",
        "contact_title": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "city": item.get("city", "") or "",
        "country": item.get("country", "") or "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "inmobiliaria",
        "fuente_inmobiliaria": "facebook",
        # El texto del post se guarda para que el scorer detecte intención
        "raw_text": item.get("text", "") or item.get("description", "") or "",
        "raw_data": json.dumps(item),
    }


def _normalizar_reddit(item: dict) -> dict:
    author = item.get("author", "") or item.get("username", "") or ""
    text = item.get("body", "") or item.get("selftext", "") or item.get("title", "") or ""

    return {
        "company_name": "",
        "contact_name": author,
        "contact_title": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "city": "",
        "country": "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "inmobiliaria",
        "fuente_inmobiliaria": "reddit",
        "source_url": item.get("url", "") or item.get("permalink", "") or "",
        "raw_text": text[:500],
        "raw_data": json.dumps(item),
    }


def _normalizar_instagram(item: dict) -> dict:
    return {
        "company_name": "",
        "contact_name": item.get("ownerUsername", "") or item.get("username", "") or "",
        "contact_title": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "city": "",
        "country": "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "inmobiliaria",
        "fuente_inmobiliaria": "instagram",
        "source_url": item.get("url", "") or "",
        "raw_text": item.get("text", "") or item.get("caption", "") or "",
        "raw_data": json.dumps(item),
    }


def _normalizar_tiktok(item: dict) -> dict:
    return {
        "company_name": "",
        "contact_name": item.get("authorMeta", {}).get("name", "") or item.get("author", "") or "",
        "contact_title": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "city": "",
        "country": "",
        "industry": "social_media",
        "source": ProspectSource.apify_social,
        "source_module": "inmobiliaria",
        "fuente_inmobiliaria": "tiktok",
        "source_url": item.get("webVideoUrl", "") or "",
        "raw_text": item.get("text", "") or item.get("description", "") or "",
        "raw_data": json.dumps(item),
    }
