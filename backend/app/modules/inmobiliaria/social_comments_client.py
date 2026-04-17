import httpx
import os
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)
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

EXCLUSION_KEYWORDS = [
    # Spam puro
    "follow me", "sígueme", "check my profile", "check my bio",
    "link in bio", "visit my page", "visit my website", "wholesale",
    # Agentes y realtors — NO son compradores, los descartamos
    "soy agente", "soy corredor", "soy realtor", "soy broker",
    "agente inmobiliario", "corredor inmobiliario", "broker inmobiliario",
    "tengo cartera", "mis clientes buscan", "para mis clientes",
    "para un cliente", "tengo clientes", "mi cartera de clientes",
    "trabajo en bienes", "trabajo en real estate", "work in real estate",
    "i am a realtor", "i'm a realtor", "i am an agent", "real estate agent",
    "comisión", "comision", "ganar comision", "ganar comisión",
]


class SocialCommentsClient:

    async def _run_actor(self, actor_id: str, run_input: dict) -> list[dict]:
        url = f"{APIFY_BASE}/{actor_id}/run-sync-get-dataset-items"
        params = {"token": settings.APIFY_API_KEY, "timeout": 280, "memory": 1024}
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(url, json=run_input, params=params)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Apify {actor_id}: {len(data)} items")
                return data
        except Exception as e:
            logger.warning(f"Apify {actor_id} falló: {e}")
            return []

    def tiene_intencion(self, texto: str) -> bool:
        t = texto.lower()
        # Spam y agentes/realtors → descartar
        if any(ex in t for ex in EXCLUSION_KEYWORDS):
            return False
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
            logger.info(f"Instagram {username}: sin posts, omitiendo")
            return []
        comentarios = await self._run_actor("apify~instagram-comment-scraper", {
            "directUrls": post_urls[:6],
            "resultsLimit": 100,
        })
        return [self.normalizar(r, f"ig_{username}") for r in comentarios
                if (r.get("text") or r.get("comment") or "").strip()]

    async def facebook_pagina(self, url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-posts-scraper", {
            "startUrls": [{"url": url}],
            "maxPosts": 15,
            "maxPostComments": 100,
        })
        return [self.normalizar(r, "facebook_pagina") for r in raw
                if (r.get("text") or r.get("comment") or "").strip()]

    async def facebook_anuncio(self, post_url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-posts-scraper", {
            "startUrls": [{"url": post_url}],
            "maxPosts": 1,
            "maxPostComments": 200,
        })
        return [self.normalizar(r, "meta_anuncio") for r in raw
                if (r.get("text") or r.get("comment") or "").strip()]

    async def facebook_grupo(self, url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-groups-scraper", {
            "startUrls": [{"url": url}],
            "maxPosts": 30,
            "maxPostComments": 50,
        })
        return [self.normalizar(r, "facebook_grupo") for r in raw
                if (r.get("text") or r.get("comment") or "").strip()]

    async def hashtag_instagram(self, hashtag: str) -> list[dict]:
        posts = await self._run_actor("apify~instagram-hashtag-scraper", {
            "hashtags": [hashtag],
            "resultsLimit": 10,
        })
        post_urls = [p.get("url") or p.get("postUrl") for p in posts if p.get("url") or p.get("postUrl")]
        if not post_urls:
            return []
        comentarios = await self._run_actor("apify~instagram-comment-scraper", {
            "directUrls": post_urls[:8],
            "resultsLimit": 100,
        })
        return [self.normalizar(r, f"hashtag_{hashtag}") for r in comentarios
                if (r.get("text") or r.get("comment") or "").strip()]

    async def youtube(self, video_url: str) -> list[dict]:
        raw = await self._run_actor("apify~youtube-comment-scraper", {
            "videoUrls": [video_url],
            "maxComments": 200,
        })
        return [self.normalizar(r, "youtube") for r in raw
                if (r.get("textDisplay") or r.get("text") or "").strip()]

    # ── TikTok ────────────────────────────────────────────────────────────────

    def normalizar_tiktok(self, raw: dict, fuente: str) -> dict:
        author = raw.get("authorMeta") or {}
        username = author.get("name") or raw.get("uniqueId", "")
        return {
            "fuente": fuente,
            "autor_username": username,
            "autor_nombre": author.get("nickName") or author.get("name", ""),
            "texto": raw.get("text", ""),
            "post_url": raw.get("webVideoUrl") or raw.get("videoUrl", ""),
            "autor_url": f"https://www.tiktok.com/@{username}" if username else "",
        }

    async def tiktok_hashtag(self, hashtag: str) -> list[dict]:
        videos = await self._run_actor("clockworks~free-tiktok-scraper", {
            "hashtags": [hashtag],
            "maxResultsPerQuery": 10,
        })
        video_urls = [v.get("webVideoUrl") or v.get("videoUrl") for v in videos
                      if v.get("webVideoUrl") or v.get("videoUrl")]
        if not video_urls:
            logger.info(f"TikTok hashtag #{hashtag}: sin videos")
            return []
        comentarios = await self._run_actor("apify~tiktok-comment-scraper", {
            "postURLs": video_urls[:8],
            "commentsPerPost": 100,
        })
        return [self.normalizar_tiktok(r, f"tiktok_hashtag_{hashtag}") for r in comentarios
                if (r.get("text") or "").strip()]

    async def tiktok_cuenta(self, username: str) -> list[dict]:
        videos = await self._run_actor("clockworks~free-tiktok-scraper", {
            "profiles": [username],
            "maxResultsPerQuery": 10,
        })
        video_urls = [v.get("webVideoUrl") or v.get("videoUrl") for v in videos
                      if v.get("webVideoUrl") or v.get("videoUrl")]
        if not video_urls:
            logger.info(f"TikTok cuenta @{username}: sin videos")
            return []
        comentarios = await self._run_actor("apify~tiktok-comment-scraper", {
            "postURLs": video_urls[:8],
            "commentsPerPost": 100,
        })
        return [self.normalizar_tiktok(r, f"tiktok_cuenta_{username}") for r in comentarios
                if (r.get("text") or "").strip()]

    # ── Instagram seguidores de competidores ──────────────────────────────────

    def normalizar_seguidor(self, raw: dict, fuente: str) -> dict:
        username = raw.get("username", "")
        return {
            "fuente": fuente,
            "autor_username": username,
            "autor_nombre": raw.get("fullName", ""),
            "texto": raw.get("biography", ""),  # bio como señal de intención
            "post_url": "",
            "autor_url": raw.get("profileUrl") or (f"https://www.instagram.com/{username}/" if username else ""),
        }

    async def instagram_seguidores(self, username: str) -> list[dict]:
        raw = await self._run_actor("apify~instagram-followers-scraper", {
            "username": [username],
            "resultsLimit": 200,
        })
        return [self.normalizar_seguidor(r, f"ig_seguidores_{username}") for r in raw
                if r.get("username")]
