import asyncio, sys, json
sys.path.insert(0,'.')
from app.core.config import settings
import httpx

async def test_apollo():
    print("=== APOLLO ===")
    url = "https://api.apollo.io/v1/mixed_companies/search"
    payload = {
        "q_organization_name": "AQUANEXUS LIMITADA",
        "organization_locations": ["Chile"],
        "per_page": 1
    }
    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": settings.APOLLO_API_KEY
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(url, json=payload, headers=headers)
        print("Status:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            orgs = data.get("organizations", [])
            print("Orgs encontradas:", len(orgs))
            if orgs:
                o = orgs[0]
                print("Nombre:", o.get("name"))
                print("Phone:", o.get("phone"))
                print("Website:", o.get("website_url"))
                print("LinkedIn:", o.get("linkedin_url"))
        else:
            print("Error:", r.text[:300])

async def test_apify():
    print("\n=== APIFY ===")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            "https://api.apify.com/v2/user/me",
            headers={"Authorization": f"Bearer {settings.APIFY_API_KEY}"}
        )
        print("Status:", r.status_code)
        print("Response:", r.text[:200])

async def main():
    await test_apollo()
    await test_apify()

asyncio.run(main())
