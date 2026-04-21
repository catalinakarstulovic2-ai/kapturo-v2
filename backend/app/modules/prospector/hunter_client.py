"""
Hunter.io client para enriquecimiento de prospectos.

A partir del dominio de una empresa busca emails del equipo con nombre,
cargo y confianza. Plan gratuito: 25 búsquedas/mes, plan básico: 500/mes.

Endpoints usados:
  - /domain-search   → lista de emails del dominio
  - /email-finder    → email de una persona específica (nombre + dominio)
"""
import httpx
from app.core.config import settings

HUNTER_BASE = "https://api.hunter.io/v2"


def _extract_domain(website: str) -> str | None:
    """Extrae el dominio limpio de una URL."""
    if not website:
        return None
    url = website.lower().strip()
    # Quitar protocolo
    for prefix in ("https://", "http://"):
        if url.startswith(prefix):
            url = url[len(prefix):]
    # Quitar www.
    if url.startswith("www."):
        url = url[4:]
    # Quitar path
    domain = url.split("/")[0].split("?")[0].split("#")[0]
    # Validación básica
    if "." not in domain or len(domain) < 4:
        return None
    # Excluir redes sociales (no son dominios corporativos)
    social = ["instagram.com", "facebook.com", "twitter.com", "tiktok.com",
              "linkedin.com", "youtube.com", "t.me", "wa.me", "pinterest.com"]
    if any(s in domain for s in social):
        return None
    return domain


class HunterClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.HUNTER_API_KEY

    async def buscar_emails_dominio(
        self,
        domain: str,
        limit: int = 3,
    ) -> list[dict]:
        """
        Busca los emails del equipo de un dominio.

        Devuelve lista de dicts con:
          - email: str
          - first_name, last_name: str
          - position: str  (cargo)
          - confidence: int (0-100)
          - linkedin: str

        Solo retorna emails con confidence >= 70.
        """
        if not self.api_key or not domain:
            return []

        params = {
            "domain": domain,
            "limit": min(limit, 10),
            "api_key": self.api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{HUNTER_BASE}/domain-search", params=params)
                if r.status_code == 429:
                    return []   # rate limit
                if r.status_code == 402:
                    return []   # quota agotada
                if r.status_code != 200:
                    return []
                data = r.json().get("data", {})
                emails = data.get("emails", [])
                # Filtrar por confianza mínima
                return [
                    {
                        "email": e.get("value", ""),
                        "first_name": e.get("first_name", ""),
                        "last_name": e.get("last_name", ""),
                        "position": e.get("position", ""),
                        "confidence": e.get("confidence", 0),
                        "linkedin": e.get("linkedin", ""),
                    }
                    for e in emails
                    if e.get("value") and (e.get("confidence") or 0) >= 70
                ][:limit]
        except Exception:
            return []

    async def email_finder(self, first_name: str, last_name: str, domain: str) -> dict | None:
        """
        Busca el email de una persona específica dado nombre + dominio.
        Endpoint: /email-finder
        """
        if not self.api_key or not domain or not first_name:
            return None
        params = {
            "domain": domain,
            "first_name": first_name,
            "last_name": last_name or "",
            "api_key": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{HUNTER_BASE}/email-finder", params=params)
                if r.status_code != 200:
                    return None
                data = r.json().get("data", {})
                email = data.get("email")
                confidence = data.get("score", 0)
                if email and confidence >= 50:
                    return {
                        "email": email,
                        "confidence": confidence,
                    }
                return None
        except Exception:
            return None

    async def enriquecer_linkedin_lead(self, contact_name: str, company_name: str, website: str | None) -> dict:
        """
        Enriquece un lead de LinkedIn buscando su email con Hunter.io.
        Estrategia:
          1. Si tiene website → extract domain → email-finder con nombre
          2. Si no → domain-search por nombre de empresa (intenta .com)
        """
        result = {"email": "", "enriched": False}
        if not contact_name:
            return result

        parts = contact_name.strip().split()
        first_name = parts[0] if parts else ""
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

        # Intentar con website
        domain = _extract_domain(website) if website else None

        # Fallback: adivinar dominio desde company_name
        if not domain and company_name:
            slug = company_name.lower().strip()
            # Limpiar caracteres comunes
            for char in [" ", ",", ".", "s.a.", "ltda", "spa", "inc", "corp", "llc"]:
                slug = slug.replace(char, "")
            domain = f"{slug}.com"

        if not domain:
            return result

        found = await self.email_finder(first_name, last_name, domain)
        if found:
            result["email"] = found["email"]
            result["confidence"] = found["confidence"]
            result["enriched"] = True
        return result

    async def enriquecer_prospecto(self, website: str) -> dict:
        """
        Helper: dado un website extrae el mejor contacto disponible.

        Devuelve dict con:
          - email: str
          - contact_name: str
          - contact_title: str
          - linkedin_url: str
          - enriched: bool (True si encontró algo)
        """
        domain = _extract_domain(website)
        if not domain:
            return {"email": "", "contact_name": "", "contact_title": "",
                    "linkedin_url": "", "enriched": False}

        contactos = await self.buscar_emails_dominio(domain, limit=3)

        if not contactos:
            return {"email": "", "contact_name": "", "contact_title": "",
                    "linkedin_url": "", "enriched": False}

        # Priorizar cargos de decisión
        PRIORITY_TITLES = ["ceo", "owner", "founder", "director", "gerente", "manager",
                           "presidente", "socio", "partner", "chief"]
        best = contactos[0]
        for c in contactos:
            pos = (c.get("position") or "").lower()
            if any(t in pos for t in PRIORITY_TITLES):
                best = c
                break

        nombre = " ".join(filter(None, [best.get("first_name"), best.get("last_name")])).strip()
        return {
            "email": best.get("email", ""),
            "contact_name": nombre,
            "contact_title": best.get("position", ""),
            "linkedin_url": best.get("linkedin", ""),
            "enriched": True,
        }
