"""
Reemplaza el bloque de INTENT_KEYWORDS hardcodeadas por versión genérica universal.
Las keywords específicas del nicho se mueven al niche_config de cada tenant.
"""
import re

path = 'app/modules/inmobiliaria/social_comments_client.py'
content = open(path, 'r').read()

nuevo_bloque = """\
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

"""

idx_start = content.find('INTENT_KEYWORDS = [')
idx_end = content.find('\nclass SocialCommentsClient:')

if idx_start == -1 or idx_end == -1:
    print("ERROR: no se encontraron los marcadores en el archivo")
    exit(1)

content_nuevo = content[:idx_start] + nuevo_bloque + content[idx_end+1:]
open(path, 'w').write(content_nuevo)
print(f"OK — keywords reemplazadas ({content_nuevo.count(chr(10))} líneas)")
