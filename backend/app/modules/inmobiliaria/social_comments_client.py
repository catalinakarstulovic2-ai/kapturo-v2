import httpx
import os
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)
APIFY_BASE = "https://api.apify.com/v2/acts"

# ── Keywords GENÉRICAS universales — aplican a CUALQUIER nicho ────────────────
# Solo señales de intención de compra que NO dependen del producto.
# Las keywords específicas del nicho (ej: "florida", "departamento", "terreno")
# van en niche_config["intent_keywords"] de cada tenant en la BD.
INTENT_KEYWORDS_GENERICAS = [
    # Intención de compra directa
    "quiero comprar", "quiero invertir", "me interesa comprar",
    "como compro", "como invierto", "tienen disponible",
    # Precio / financiamiento
    "cuanto cuesta", "cuanto vale", "precio", "costo", "desde $",
    "financiamiento", "financiado", "cuotas", "plan de pago",
    # Contacto / seguimiento
    "mas info", "informacion", "info", "whatsapp", "contacto",
    "me pueden contactar", "me escriben", "dm", "inbox",
    # Inglés
    "how much", "interested", "price", "contact",
    "i want to buy", "interested in buying", "payment plan", "how to buy",
    # Primera propiedad (universal)
    "primera propiedad", "primera inversion",
]

# ── Exclusiones UNIVERSALES — spam + intermediarios ────────────────────────────
# Estas aplican a TODOS los nichos. Los intermediarios NO son compradores directos.
EXCLUSION_KEYWORDS_UNIVERSALES = [
    # Spam
    "follow me", "check my profile", "check my bio",
    "link in bio", "visit my page", "visit my website", "wholesale",
    # Intermediarios — realtors, corredores, brokers
    "soy agente", "soy corredor", "soy realtor", "soy broker",
    "agente inmobiliario", "corredor inmobiliario", "broker inmobiliario",
    "tengo cartera", "mis clientes buscan", "para mis clientes",
    "tengo clientes", "mi cartera de clientes",
    "trabajo en bienes", "trabajo en real estate", "work in real estate",
    "i am a realtor", "i am an agent", "real estate agent",
    # Creadores de contenido / asesores — educan pero no compran
    "mis seguidores", "en mi canal", "sigan mi cuenta",
    "les comparto", "les dejo el link",
]

class SocialCommentsClient:

    def __init__(self, intent_keywords: list = None):
        # Keywords específicas del nicho del tenant (de niche_config["intent_keywords"])
        # Se combinan con INTENT_KEYWORDS_GENERICAS en tiene_intencion()
        self._intent_keywords = intent_keywords or []

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

    def tiene_intencion(self, texto: str, extra_keywords: list = None) -> bool:
        t = texto.lower()
        # Spam y agentes/realtors → descartar
        if any(ex in t for ex in EXCLUSION_KEYWORDS_UNIVERSALES):
            return False
        # Intención de compra / inversión: genéricas + keywords del tenant + extra opcionales
        todas = INTENT_KEYWORDS_GENERICAS + self._intent_keywords + (extra_keywords or [])
        return any(kw in t for kw in todas)

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
        # Scrapeamos posts de la cuenta y extraemos latestComments de cada post
        # (evitamos el comment-scraper que falla con 404 en muchos posts)
        posts = await self._run_actor("apify~instagram-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "posts",
            "resultsLimit": 8,  # reducido de 12 → menos agresivo anti-ban
        })
        resultado = []
        for post in posts:
            post_url = post.get("url") or post.get("postUrl", "")
            owner = post.get("ownerUsername", "")
            for c in (post.get("latestComments") or []):
                texto = c.get("text") or ""
                if texto.strip():
                    resultado.append({
                        "fuente": f"ig_{username}",
                        "autor_username": c.get("ownerUsername", ""),
                        "autor_nombre": c.get("ownerFullName", ""),
                        "texto": texto,
                        "post_url": post_url,
                        "autor_url": f"https://www.instagram.com/{c.get('ownerUsername', '')}/",
                    })
        logger.info(f"Instagram cuenta {username}: {len(posts)} posts → {len(resultado)} comentarios")
        return resultado

    async def facebook_pagina(self, url: str) -> list[dict]:
        raw = await self._run_actor("apify~facebook-posts-scraper", {
            "startUrls": [{"url": url}],
            "maxPosts": 8,            # reducido de 15 → anti-ban
            "maxPostComments": 40,   # reducido de 100 → anti-ban
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
        # Usamos latestComments de cada post directamente — el comment-scraper
        # separado falla con 404 en la mayoría de posts (privados o Reels)
        posts = await self._run_actor("apify~instagram-hashtag-scraper", {
            "hashtags": [hashtag],
            "resultsLimit": 10,  # reducido de 20 → menos agresivo anti-ban
        })
        resultado = []
        for post in posts:
            post_url = post.get("url") or post.get("postUrl", "")
            for c in (post.get("latestComments") or []):
                texto = c.get("text") or ""
                if texto.strip():
                    resultado.append({
                        "fuente": f"hashtag_{hashtag}",
                        "autor_username": c.get("ownerUsername", ""),
                        "autor_nombre": c.get("ownerFullName", ""),
                        "texto": texto,
                        "post_url": post_url,
                        "autor_url": f"https://www.instagram.com/{c.get('ownerUsername', '')}/",
                    })
        logger.info(f"Instagram hashtag #{hashtag}: {len(posts)} posts → {len(resultado)} comentarios")
        return resultado

    async def youtube(self, video_url: str) -> list[dict]:
        raw = await self._run_actor("apify~youtube-comment-scraper", {
            "videoUrls": [video_url],
            "maxComments": 100,  # reducido de 200 → anti-ban
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

    async def _fetch_comments_dataset(self, url: str, post_url: str, fuente: str) -> list[dict]:
        """Fetch comentarios reales desde commentsDatasetUrl de un post TikTok."""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(f"{url}?token={settings.APIFY_API_KEY}&limit=30")
                if resp.status_code != 200:
                    return []
                comments = resp.json()
                resultado = []
                for c in comments:
                    texto = c.get("text") or c.get("commentText") or ""
                    if not texto.strip():
                        continue
                    username = c.get("uniqueId") or c.get("authorUsername") or c.get("username") or ""
                    nombre = c.get("nickName") or c.get("authorName") or username
                    resultado.append({
                        "fuente": fuente,
                        "autor_username": username,
                        "autor_nombre": nombre,
                        "texto": texto,
                        "post_url": post_url,
                        "autor_url": f"https://www.tiktok.com/@{username}" if username else "",
                    })
                return resultado
        except Exception as e:
            logger.warning(f"Error fetching comments dataset {url}: {e}")
            return []

    async def tiktok_hashtag(self, hashtag: str) -> list[dict]:
        # 2 posts por hashtag (antes 5) — reduce costo Apify ~60%
        posts = await self._run_actor("clockworks~tiktok-scraper", {
            "hashtags": [hashtag],
            "resultsPerPage": 2,
            "maxResultsPerQuery": 2,
            "commentsPerPost": 20,
            "scrapeComments": True,
        })
        resultado = []
        for post in posts:
            post_url = post.get("webVideoUrl") or post.get("videoUrl", "")
            dataset_url = post.get("commentsDatasetUrl") or post.get("commentDatasetUrl")
            # Solo fetch comentarios si el post tiene al menos 5 comentarios
            comment_count = post.get("commentCount") or 0
            if dataset_url and comment_count >= 5:
                comentarios = await self._fetch_comments_dataset(dataset_url, post_url, f"tiktok_hashtag_{hashtag}")
                resultado.extend(comentarios)
        logger.info(f"TikTok hashtag #{hashtag}: {len(posts)} posts → {len(resultado)} comentarios reales")
        return resultado

    async def tiktok_cuenta(self, username: str) -> list[dict]:
        posts = await self._run_actor("clockworks~tiktok-scraper", {
            "profiles": [username],
            "resultsPerPage": 2,
            "maxResultsPerQuery": 2,
            "commentsPerPost": 20,
            "scrapeComments": True,
        })
        resultado = []
        for post in posts:
            post_url = post.get("webVideoUrl") or post.get("videoUrl", "")
            dataset_url = post.get("commentsDatasetUrl") or post.get("commentDatasetUrl")
            comment_count = post.get("commentCount") or 0
            if dataset_url and comment_count >= 5:
                comentarios = await self._fetch_comments_dataset(dataset_url, post_url, f"tiktok_cuenta_{username}")
                resultado.extend(comentarios)
        logger.info(f"TikTok cuenta @{username}: {len(posts)} posts → {len(resultado)} comentarios reales")
        return resultado

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

    # ── Meta Ad Library ───────────────────────────────────────────────────────

    async def meta_ad_library(self, keywords: list[str], country: str = "US", max_ads: int = 30) -> list[str]:
        """
        Busca anuncios en la Meta Ad Library.
        Actor: apify~facebook-ads-scraper (el disponible en plan STARTER)
        """
        # apify~facebook-ads-scraper requiere plan de pago - deshabilitado
        logger.info("Meta Ad Library deshabilitado (actor no disponible en plan STARTER)")
        return []
        actor_id = "apify~facebook-ads-scraper"
        ad_urls: list[str] = []
        for keyword in keywords:
            try:
                raw = await self._run_actor(actor_id, {
                    "searchTerms": [keyword],
                    "country": country,
                    "adType": "all",
                    "publisherPlatforms": ["facebook", "instagram"],
                    "maxResults": max_ads,
                })
                for ad in raw:
                    # El actor devuelve snapshotUrl o links dentro del anuncio
                    # Intentamos extraer la URL del post original del anuncio
                    link = (
                        ad.get("adArchiveUrl") or
                        ad.get("adSnapshotUrl") or
                        ad.get("snapshot", {}).get("link_url") or
                        ad.get("snapshot", {}).get("page_profile_uri") or
                        ""
                    )
                    # Si tiene ID de anuncio, construimos URL directa de FB
                    ad_id = ad.get("adArchiveId") or ad.get("id") or ""
                    page_id = ad.get("pageId") or ad.get("page_id") or ""
                    if ad_id and page_id:
                        fb_url = f"https://www.facebook.com/ads/archive/render_ad/?id={ad_id}&access_token="
                        # Preferir el link directo del post si existe
                        post_url = ad.get("snapshot", {}).get("link_url") or link
                        if post_url and "facebook.com" in post_url:
                            ad_urls.append(post_url)
                    elif link and ("facebook.com" in link or "instagram.com" in link):
                        ad_urls.append(link)
                logger.info(f"Meta Ad Library keyword '{keyword}': {len(raw)} anuncios")
            except Exception as e:
                logger.warning(f"Meta Ad Library keyword '{keyword}' falló: {e}")
                continue
        # Deduplicar
        vistos = set()
        urls_unicas = [u for u in ad_urls if u not in vistos and not vistos.add(u)]
        logger.info(f"Meta Ad Library total: {len(urls_unicas)} URLs únicas de anuncios")
        return urls_unicas

    async def perfil_instagram_publico(self, username: str) -> dict | None:
        """
        Intenta obtener datos del perfil Instagram. Retorna None si es privado.
        """
        try:
            raw = await self._run_actor("apify~instagram-scraper", {
                "directUrls": [f"https://www.instagram.com/{username}/"],
                "resultsType": "details",
                "resultsLimit": 1,
            })
            if not raw:
                return None
            perfil = raw[0]
            # Si es privado, no hay posts ni datos útiles
            if perfil.get("private") or perfil.get("isPrivate"):
                return None
            return {
                "nombre": perfil.get("fullName") or perfil.get("username", ""),
                "bio": perfil.get("biography", ""),
                "seguidores": perfil.get("followersCount", 0),
                "url": f"https://www.instagram.com/{username}/",
                "website": perfil.get("externalUrl") or "",
                "privado": False,
            }
        except Exception as e:
            logger.warning(f"perfil_instagram_publico @{username}: {e}")
            return None

    async def buscar_linkedin_por_nombre(self, nombre: str, pais: str = "") -> dict | None:
        """
        Busca un perfil LinkedIn por nombre completo vía Google (site:linkedin.com).
        Actor: apify~google-search-scraper (disponible en plan STARTER)
        """
        try:
            query = f'site:linkedin.com/in "{nombre}" {pais}'.strip()
            raw = await self._run_actor("apify~google-search-scraper", {
                "queries": [query],
                "resultsPerPage": 5,
                "maxPagesPerQuery": 1,
            })
            if not raw:
                return None
            nombre_lower = nombre.lower()
            palabras = [p for p in nombre_lower.split() if len(p) > 3]
            for item in raw:
                url = item.get("url") or item.get("link") or ""
                title = (item.get("title") or "").lower()
                if "linkedin.com/in/" not in url:
                    continue
                if not palabras or any(p in title for p in palabras):
                    return {
                        "nombre": item.get("title", "").split(" - ")[0].strip(),
                        "titulo": item.get("description", "")[:100],
                        "linkedin_url": url,
                        "ubicacion": "",
                        "empresa": "",
                    }
            return None
        except Exception as e:
            logger.warning(f"LinkedIn por nombre '{nombre}': {e}")
            return None
