from app.core.database import SessionLocal
from app.models.tenant import Tenant, TenantModule
from app.models.user import User

db = SessionLocal()
u = db.query(User).filter(User.email == 'admin.inmo@kapturo.com').first()
tm = db.query(TenantModule).filter(TenantModule.tenant_id == u.tenant_id, TenantModule.module == 'inmobiliaria').first()
cfg = (tm.niche_config or {}) if tm else {}
db.close()

print("=== FUENTES CONFIGURADAS ===")
print(f"Hashtags TikTok:     {len(cfg.get('hashtags_tiktok', []))} → {cfg.get('hashtags_tiktok', [])}")
print(f"Cuentas TikTok:      {len(cfg.get('cuentas_tiktok', []))} → {cfg.get('cuentas_tiktok', [])}")
print(f"Hashtags IG:         {len(cfg.get('hashtags_instagram', []))} → {cfg.get('hashtags_instagram', [])}")
print(f"Cuentas IG:          {len(cfg.get('cuentas_instagram', []))} → {cfg.get('cuentas_instagram', [])}")
print(f"Competidores IG:     {len(cfg.get('competidores_instagram', []))} → {cfg.get('competidores_instagram', [])}")
print(f"Videos YouTube:      {len(cfg.get('videos_youtube', []))}")
print(f"Grupos Facebook:     {len(cfg.get('grupos_facebook', []))}")
print(f"Páginas Facebook:    {len(cfg.get('paginas_facebook', []))}")

print()
print("=== ESTIMADO DE ACTOR RUNS POR BÚSQUEDA ===")
ht = len(cfg.get('hashtags_tiktok', []))
ct = len(cfg.get('cuentas_tiktok', []))
hig = len(cfg.get('hashtags_instagram', []))
cig = len(cfg.get('cuentas_instagram', []))
coig = len(cfg.get('competidores_instagram', []))
yt = len(cfg.get('videos_youtube', []))
gfb = len(cfg.get('grupos_facebook', []))
pfb = len(cfg.get('paginas_facebook', []))

total = ht + ct + hig + cig + coig + yt + gfb + pfb
print(f"  TikTok hashtags:     {ht} runs × 2 posts × 20 comments = ~{ht*2*20} comentarios")
print(f"  TikTok cuentas:      {ct} runs × 2 posts × 20 comments = ~{ct*2*20} comentarios")
print(f"  IG hashtags:         {hig} runs × 20 posts = ~{hig*20} posts")
print(f"  IG cuentas:          {cig} runs × 12 posts = ~{cig*12} posts")
print(f"  IG competidores:     {coig} runs × 200 seguidores = ~{coig*200} perfiles")
print(f"  YouTube:             {yt} runs × 200 comentarios = ~{yt*200} comentarios")
print(f"  Facebook grupos:     {gfb} runs × 30 posts × 50 comments = ~{gfb*30*50}")
print(f"  Facebook páginas:    {pfb} runs × 15 posts × 100 comments = ~{pfb*15*100}")
print(f"\n  TOTAL ACTOR RUNS:    {total}")
