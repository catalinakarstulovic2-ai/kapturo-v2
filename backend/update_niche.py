import sys
sys.path.insert(0, '/Users/catalinakarstulovic/Desktop/KAPTURO/backend')
from app.core.database import SessionLocal
from app.models.tenant import TenantModule
from sqlalchemy.orm.attributes import flag_modified
import json

db = SessionLocal()
m = db.query(TenantModule).filter(
    TenantModule.tenant_id == '5e321d98-dbc2-4c43-80ce-4df37c8aca74',
    TenantModule.module == 'inmobiliaria',
).first()

m.niche_config = {
    "nicho": "terrenos en Florida para latinoamericanos",
    "empresa": "Uperland",
    "producto": "terrenos urbanizados de 1,000 m2 en Inverness, Florida desde USD $14,990 — financiables hasta 12 cuotas via Stripe, sin licencia USA, accesible desde cualquier pais de Latinoamerica",
    "comprador_ideal": "latinoamericano con capital propio o capacidad de pago en cuotas que quiere invertir en terreno en Florida como primera propiedad en USA — no necesita residencia americana ni licencia",
    "paises_objetivo": [
        "chile", "argentina", "mexico", "peru", "colombia",
        "venezuela", "ecuador", "uruguay", "panama", "costa rica",
        "estados unidos", "eeuu", "usa", "espana", "miami", "florida"
    ],
    "tipos_lead": ["comprador_directo", "potencial_referido", "agente_latam"],
    # ── Meta Ad Library ────────────────────────────────────────────────────
    "ad_library_keywords": [
        "terrenos en florida",
        "invertir en usa",
        "land for sale florida",
        "terrenos estados unidos",
        "inversión inmobiliaria usa",
        "comprar terreno florida",
        "terreno inverness florida",
        "bienes raices usa latam",
        "propiedad en florida desde",
    ],
    "ad_library_country": "US",
    # ── Instagram ─────────────────────────────────────────────────────────
    "hashtags_instagram": [
        "invertirenusa",
        "terrenosflorida",
        "propiedadesenusa",
        "comprarenusa",
        "bienesraicesusa",
        "floridarealestate",
        "inversionesflorida",
        "terrenoenusa",
        "dolarizatusahorros",
        "patrimonioenusa",
        "realtorchile",
        "realtorlatino",
        "FirstLandUSA"
    ],
    "cuentas_instagram": [
        "terrenoenflorida",
        "uperland.us",
        "realtordeflorida",
        "enidizquierdorealtor",
        "realtorannelice"
    ],
    # ── Intent keywords específicas del nicho (Leo / terrenos Florida) ───
    # Estas se combinan con INTENT_KEYWORDS_GENERICAS del código.
    # Un cliente de deptos en Santiago tendría sus propias keywords aquí.
    "intent_keywords": [
        "terreno", "lote", "parcela", "florida", "inverness",
        "terreno en usa", "terreno en estados unidos",
        "invertir en usa", "invertir en florida",
        "comprar en usa", "propiedad en florida",
        "lote en florida", "sin licencia", "sin ser residente",
        "tierra en usa", "land florida", "land usa",
        "cuánto cuesta el terreno", "precio del terreno",
    ],
    # ── TikTok ────────────────────────────────────────────────────────────
    "hashtags_tiktok": [
        "invertirenusa",
        "terrenosflorida",
        "propiedadesenusa",
        "comprarenusa",
        "terrenoenusa",
        "floridarealestate",
        "bienesraicesusa",
        "dolarizatusahorros",
    ],
    "cuentas_tiktok": [
        "leosotorealtor",
        "terrenoenflorida",
    ],
    # ── Facebook ──────────────────────────────────────────────────────────
    "paginas_facebook": [],
    "grupos_facebook": [
        "https://www.facebook.com/groups/invertirenusadesdechile",
        "https://www.facebook.com/groups/inversioninmobiliariainternacional",
        "https://www.facebook.com/groups/bienesraicesusalatam"
    ],
    # ── YouTube ───────────────────────────────────────────────────────────
    "videos_youtube": [],
    # ── Competidores (seguidores IG) ──────────────────────────────────────
    "competidores_instagram": ["terrenoenflorida", "firstlandusa", "inversionenflorida"],
    "posts_anuncios_meta": [],
    "competidores": ["terrenoenflorida", "firstlandusa", "inversionenflorida"],
    # ── LinkedIn (búsqueda activa de perfiles con capacidad de compra) ────────────
    # OJO: el scraper agrega 'site:linkedin.com/in' automáticamente.
    # Buscar COMPRADORES LATAM con capital — NO realtors ni brokers de Florida.
    "linkedin_queries": [
        'CEO OR founder Chile "inversión" OR "patrimonio" OR "inversiones"',
        'dueño OR propietario Chile "USA" OR "Florida" OR "internacional"',
        'CEO OR gerente Colombia "inversión" OR "estados unidos" OR "USA"',
        'founder OR director Mexico "inversión" OR "real estate" OR "USA"',
        'empresario Venezuela OR Argentina Miami OR Florida OR "inversión internacional"',
        'médico OR doctor Chile OR Colombia OR México "inversión" OR "patrimonio"',
        'abogado OR arquitecto Chile OR Colombia "inversión" OR "bienes raices"',
        '"family office" OR "wealth management" "Latin America" OR LATAM',
        'investor OR inversionista "Latin America" OR LATAM "real estate" OR property',
        'president OR "managing director" Peru OR Ecuador OR Panama "inversión"',
    ],
}

flag_modified(m, 'niche_config')
db.commit()
print("OK — niche_config guardado")
print(json.dumps(m.niche_config, ensure_ascii=False, indent=2))
db.close()
