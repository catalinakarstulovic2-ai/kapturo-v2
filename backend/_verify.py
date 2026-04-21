import sys
sys.path.insert(0, '.')
from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient, INTENT_KEYWORDS_GENERICAS, EXCLUSION_KEYWORDS_UNIVERSALES

c = SocialCommentsClient(intent_keywords=['terreno', 'florida'])

casos = [
    ('quiero comprar un terreno', True),
    ('soy realtor tengo clientes', False),
    ('me gusta este video', False),
    ('tengo interés en florida', True),
    ('cuánto es el precio', True),
    ('soy agente inmobiliario', False),
]

ok = 0
for texto, esperado in casos:
    resultado = c.tiene_intencion(texto)
    status = 'OK' if resultado == esperado else 'FAIL'
    if status == 'OK':
        ok += 1
    print(f'{status}: "{texto}" → {resultado} (esperado {esperado})')

print(f'\n{ok}/{len(casos)} tests pasaron')
print(f'GENERICAS: {len(INTENT_KEYWORDS_GENERICAS)} keywords')
print(f'EXCLUSIONES: {len(EXCLUSION_KEYWORDS_UNIVERSALES)} keywords')
print(f'NICHO: {c._intent_keywords}')
