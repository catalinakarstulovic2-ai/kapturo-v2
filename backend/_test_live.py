"""
Prueba en vivo del módulo Inmobiliaria:
1. Login con admin.inmo@kapturo.com
2. GET /diagnostico → verifica niche_config + prueba Apify TikTok
3. POST /test-guardar → verifica que la BD puede guardar prospectos
"""
import httpx
import json

BASE = "http://localhost:8000/api/v1"

def run():
    client = httpx.Client(timeout=300)

    # ── 1. Login ────────────────────────────────────────────────────────────
    print("─" * 60)
    print("1. LOGIN")
    r = client.post(f"{BASE}/auth/login", json={"email": "admin.inmo@kapturo.com", "password": "Kapturo123!"})
    if r.status_code != 200:
        print(f"   ❌ Login falló: {r.status_code} {r.text}")
        return
    token = r.json().get("access_token")
    print(f"   ✅ Login OK — token: {token[:25]}...")
    headers = {"Authorization": f"Bearer {token}"}

    # ── 2. Test guardar prospecto (BD) ─────────────────────────────────────
    print("\n─" * 60)
    print("2. TEST GUARDAR (verifica BD)")
    r = client.post(f"{BASE}/inmobiliaria/test-guardar", headers=headers)
    data = r.json()
    if data.get("ok"):
        print(f"   ✅ BD OK — prospecto guardado con id: {data.get('id')}")
    else:
        print(f"   ❌ BD FALLÓ: {data.get('error')}")

    # ── 3. Diagnóstico Apify ────────────────────────────────────────────────
    print("\n─" * 60)
    print("3. DIAGNÓSTICO APIFY (puede tardar ~60s, está llamando a TikTok real)")
    print("   Espera...")
    r = client.get(f"{BASE}/inmobiliaria/diagnostico", headers=headers)
    data = r.json()

    print(f"\n   niche_config keys: {data.get('niche_config_keys')}")
    print(f"   Hashtags IG:       {data.get('total_hashtags_ig')}")
    print(f"   Cuentas IG:        {data.get('total_cuentas_ig')}")
    print(f"   Hashtags TikTok:   {data.get('hashtags_tiktok')}")
    print(f"   Cuentas TikTok:    {data.get('cuentas_tiktok')}")
    print(f"   Competidores IG:   {data.get('competidores_ig')}")

    if "test_tiktok_error" in data:
        print(f"\n   ❌ TikTok FALLÓ: {data['test_tiktok_error']}")
    else:
        count = data.get("test_tiktok_count", 0)
        fuente = data.get("test_tiktok_fuente", "")
        print(f"\n   ✅ TikTok OK — fuente: {fuente} → {count} comentarios")
        muestra = data.get("test_tiktok_muestra", [])
        for i, m in enumerate(muestra, 1):
            print(f"      #{i}: @{m.get('autor_username')} — \"{m.get('texto', '')[:80]}\"")

    if "test_ig_error" in data:
        print(f"\n   ❌ Instagram FALLÓ: {data['test_ig_error']}")
    elif "test_ig_count" in data:
        print(f"\n   ✅ Instagram OK — fuente: {data.get('test_ig_fuente')} → {data['test_ig_count']} comentarios")

    print("\n" + "═" * 60)
    print("RESULTADO FINAL:")
    bd_ok = "ok" in str(client.post(f"{BASE}/inmobiliaria/test-guardar", headers=headers).json())
    tiktok_ok = "test_tiktok_error" not in data
    ig_ok = "test_ig_error" not in data
    print(f"  Base de datos:  {'✅' if bd_ok else '❌'}")
    print(f"  Apify TikTok:   {'✅' if tiktok_ok else '❌'}")
    print(f"  Apify Instagram:{'✅' if ig_ok else '❌'}")
    if bd_ok and tiktok_ok and ig_ok:
        print("\n  🟢 TODO OK — el módulo puede buscar y guardar leads")
    elif bd_ok and (tiktok_ok or ig_ok):
        print("\n  🟡 PARCIAL — BD OK, al menos una fuente Apify funciona")
    else:
        print("\n  🔴 FALLO — revisar configuración")

run()
