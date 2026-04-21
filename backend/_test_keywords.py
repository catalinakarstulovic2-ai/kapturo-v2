from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient, INTENT_KEYWORDS_GENERICAS, EXCLUSION_KEYWORDS_UNIVERSALES

client = SocialCommentsClient(intent_keywords=["terreno", "florida", "lote en usa"])

tests = [
    (True,  "quiero comprar un terreno en florida, cuál es el precio?", "comprador real con keyword nicho"),
    (True,  "me interesa saber cuotas y formas de pago",                "keyword genérica"),
    (True,  "buscando lote en usa para invertir",                       "keyword nicho"),
    (False, "soy realtor, llámame para asesoría",                      "excluir realtor"),
    (False, "sígueme en mi canal para más contenido",                   "excluir content creator"),
    (False, "dolarizar ahorros con inversión en propiedades",           "dolarizar = excluir (asesor)"),
]

client2 = SocialCommentsClient()
tests_genericos = [
    (True,  "quiero comprar, cuánto cuesta?",  "genérico sin nicho"),
    (False, "terreno en florida",              "sin keywords nicho → no matchea"),
]

errores = 0
for esperado, texto, desc in tests:
    resultado = client.tiene_intencion(texto)
    estado = "✅" if resultado == esperado else "❌"
    if resultado != esperado:
        errores += 1
    print(f"{estado} [{desc}] → {resultado}")

print()
for esperado, texto, desc in tests_genericos:
    resultado = client2.tiene_intencion(texto)
    estado = "✅" if resultado == esperado else "❌"
    if resultado != esperado:
        errores += 1
    print(f"{estado} [genérico] [{desc}] → {resultado}")

print()
print(f"GENERICAS: {len(INTENT_KEYWORDS_GENERICAS)} | EXCLUSIONES: {len(EXCLUSION_KEYWORDS_UNIVERSALES)}")
print(f"{'✅ TODOS OK' if errores == 0 else f'❌ {errores} FALLARON'}")
