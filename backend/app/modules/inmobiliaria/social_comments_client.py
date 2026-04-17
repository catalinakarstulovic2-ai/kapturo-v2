import httpx
import os
from app.core.config import settings

APIFY_BASE = "https://api.apify.com/v2/acts"

INTENT_KEYWORDS = [
    # Intención de compra directa
    "quiero comprar", "quiero invertir", "me interesa comprar",
    "cómo compro", "como compro", "cómo invierto", "como invierto",
    "quiero un terreno", "busco terreno", "busco lote", "busco parcela",
    "tienen terrenos", "tienen disponible", "quiero información",
    # Precio / financiamiento — señales calientes para Leo
    "cuánto cuesta", "cuanto cuesta", "cuánto vale", "cuanto vale",
    "cuánto es", "cuanto es", "precio", "costo", "desde $", "$14",
    "financiamiento", "financiado", "cuotas", "plan de pago",
    "sin licencia", "sin ser residente",
    # Contacto / seguimiento
    "más info", "mas info", "información", "info", "whatsapp", "contacto",
    "me pueden contactar", "cómo los contacto", "como los contacto",
    "me escriben", "me llaman", "dm", "inbox",
    # Mercado Florida / LATAM específico
    "florida", "inverness", "terreno en usa", "terreno en estados unidos",
    "invertir en usa", "invertir en florida", "comprar en usa",
    "propiedad en florida", "lote en florida", "tierra en florida",
    # Dolarización y patrimonio — perfil chileno/argentino (nuevos hashtags v2)
    "dolarizar", "dolarizacion", "patrimonio en usa", "patrimonio fuera",
    "sacar dinero de", "invertir fuera", "fuga de capitales",
    "primera propiedad", "primera inversión", "primera inversion",
    # Agentes LATAM buscando oportunidad de negocio (potencial referido)
    "cómo puedo vender", "como puedo vender", "quiero ser agente",
    "quiero vender terrenos", "programa de referidos", "sin licencia americana",
    "puedo ganar comisión", "puedo ganar comision",
    # Inglés (compradores de USA, residentes hispanos)
    "how much", "interested", "price", "contact", "where can i",
    "i want to buy", "looking for land", "interested in buying",
    "payment plan", "how to buy", "can i invest", "how do i buy",
]

# Exclusiones: spam puro — pero NO excluir agentes porque son potencial_referido
EXCLUSION_KEYWORDS = [
    "follow me", "sígueme", "check my profile", "check my bio",
    "link in bio", "visit my page", "visit my website",
    "para mis clientes", "para un cliente", "tengo clientes",
    "trabajo en bienes", "trabajo en real estate", "work in real estate",
    "mi cartera de clientes", "wholesale",
]

# Palabras que identifican a un agente LATAM (potencial referido — NO descartar)
AGENT_KEYWORDS = [
    "soy agente", "soy corredor", "soy realtor", "soy broker",
    "agente inmobiliario", "corredor inmobiliario", "broker inmobiliario",
    "tengo cartera", "mis clientes buscan", "comisión", "comision",
]


class SocialCommentsClient:

    async def _run_actor(self, actor_id: str, run_input: dict) -> list[dict]:
        url = f"{APIFY_BASE}/{actor_id}/run-sync-get-dataset-items"
        params = {"token": settings.APIFY_API_KEY}
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(url, json=run_input, params=params)
            resp.raise_for_status()
            return resp.json()

    def tiene_intencion(self, texto: str) -> bool:
        t = texto.lower()
        # Spam puro → descartar
        if any(ex in t for ex in EXCLUSION_KEYWORDS):
            return False
        # Agentes LATAM → dejar pasar (son potencial_referido)
        if any(kw in t for kw in AGENT_KEYWORDS):
            return True
        # Intención de compra / inversión
        return any(kw in t for kw in INTENT_KEYWORDS)

    def normalizar(self, raw: dict, fuente: str) -> dict:
        return {
            "fuente": fuente,
            "autor_username": raw.get("ownerUsername") or raw.get("profileName") or raw.get("authorName", ""),
            "autor_nombre": raw.get("ownerFullName") or raw.get("authorDisplayName", ""),
            "texto": raw.get("text") or raw.get("comment") or raw.get("textDisplay", ""),
            "post_url": raw.get("postUrl") or raw.get("url", ""),
            "autor_url": raw.get("ownerProfileUrl") or raw.get("profileUrl", ""),
        }

    async def instagram(self, username: str) -> list[dict]:
        # Scrapeamos los últimos posts de la cuenta y luego sus comentarios
        posts = await self._run_actor("apify~instagram-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "posts",
            "resultsLimit": 8,
        })
        post_urls = [p.get("url") or p.get("postUrl") for p in posts if p.get("url") or p.get("postUrl")]
        if not post_urls:
            # Fallback: intentar directamente con el scraper de comentarios
            raw = await self._run_actor("apify~instagram-comment-scraper", {
                "directUrls": [f"https://www.instagram.com/{username}/"],
                "resultsLimit": 50,
            })
            return [self.normalizar(r, f"ig_{username}") for r in raw if self.tiene_intencion(
                r.get("text") or r.get("comment") or ""
            )]
        comentarios = await self._run_actor("apify~instagram-comment-scraper", {
            "directUrls": post_urls[:6],
            "resultsLimit": 100,
        })
        return [self.normalizar(r, f"ig_{username}") for r in comentarios if self.tiene_intencion(
            r.get("text") or r.get("comment") or ""
        )]

    async def facebook_pagina(self, url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-posts-scraper", {
            "startUrls": [{"url": url}],
            "maxPosts": 15,
            "maxPostComments": 100,
        })
        return [self.normalizar(r, "facebook_pagina") for r in raw if self.tiene_intencion(
            r.get("text") or r.get("comment") or ""
        )]

    async def facebook_anuncio(self, post_url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-posts-scraper", {
            "startUrls": [{"url": post_url}],
            "maxPosts": 1,
            "maxPostComments": 200,
        })
        return [self.normalizar(r, "meta_anuncio") for r in raw if self.tiene_intencion(
            r.get("text") or r.get("comment") or ""
        )]

    async def facebook_grupo(self, url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-groups-scraper", {
            "startUrls": [{"url": url}],
            "maxPosts": 30,
            "maxPostComments": 50,
        })
        return [self.normalizar(r, "facebook_grupo") for r in raw if self.tiene_intencion(
            r.get("text") or r.get("comment") or ""
        )]

    async def hashtag_instagram(self, hashtag: str) -> list[dict]:
        # Paso 1: obtener posts del hashtag
        posts = await self._run_actor("apify~instagram-hashtag-scraper", {
            "hashtags": [hashtag],
            "resultsLimit": 10,
        })
        # Paso 2: scrapear comentarios de cada post
        post_urls = [p.get("url") or p.get("postUrl") for p in posts if p.get("url") or p.get("postUrl")]
        if not post_urls:
            return []
        comentarios = await self._run_actor("apify~instagram-comment-scraper", {
            "directUrls": post_urls[:8],  # max 8 posts por hashtag
            "resultsLimit": 100,
        })
        return [self.normalizar(r, f"hashtag_{hashtag}") for r in comentarios if self.tiene_intencion(
            r.get("text") or r.get("comment") or ""
        )]

    async def youtube(self, video_url: str) -> list[dict]:
        raw = await self._run_actor("apify~youtube-comment-scraper", {
            "videoUrls": [video_url],
            "maxComments": 200,
        })
        return [self.normalizar(r, "youtube") for r in raw if self.tiene_intencion(
            r.get("textDisplay") or r.get("text") or ""
        )]
