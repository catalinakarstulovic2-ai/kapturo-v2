import httpx, asyncio, os, json, time

APIFY_KEY = open("/Users/catalinakarstulovic/Desktop/KAPTURO/backend/.env").read()
APIFY_KEY = [l for l in APIFY_KEY.splitlines() if l.startswith("APIFY_API_KEY")][0].split("=",1)[1].strip()

async def test():
    async with httpx.AsyncClient(timeout=90) as client:
        # 1. Lanzar run
        print("Lanzando run TikTok (1 post, sin comentarios)...")
        r = await client.post(
            f"https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token={APIFY_KEY}",
            json={"hashtags": ["invertirenusa"], "resultsPerPage": 1, "maxResultsPerQuery": 1, "scrapeComments": False}
        )
        data = r.json().get("data", {})
        run_id = data.get("id")
        status = data.get("status")
        print(f"Run ID: {run_id}  Status inicial: {status}")

        if not run_id or run_id == "ERROR":
            print("ERROR al lanzar run:", r.text[:300])
            return

        # 2. Esperar que termine
        for i in range(30):
            await asyncio.sleep(5)
            r2 = await client.get(f"https://api.apify.com/v2/actor-runs/{run_id}?token={APIFY_KEY}")
            status = r2.json().get("data", {}).get("status")
            print(f"  [{i*5}s] Status: {status}")
            if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                break

        print(f"\nStatus final: {status}")

        if status == "SUCCEEDED":
            # 3. Ver resultados
            dataset_id = r2.json().get("data", {}).get("defaultDatasetId")
            r3 = await client.get(f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_KEY}&limit=2")
            items = r3.json()
            print(f"Items obtenidos: {len(items)}")
            if items:
                item = items[0]
                print(f"  Autor: @{item.get('authorMeta', {}).get('name', '?')}")
                print(f"  Video: {item.get('webVideoUrl', '?')[:60]}")
                print(f"  Likes: {item.get('diggCount', '?')}")
                print("\n✅ APIFY FUNCIONA CORRECTAMENTE")
        else:
            print(f"❌ Run terminó con status: {status}")
            print(r2.json().get("data", {}).get("statusMessage", ""))

asyncio.run(test())
