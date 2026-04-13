"""
Script de setup de usuarios de prueba — Kapturo
Todos los usuarios usan la misma contraseña: Kapturo123!

Esquema:
  super@kapturo.com          → super_admin  (sin tenant, ve todo)
  admin.inmo@kapturo.com     → admin        (Inmobiliaria Test — Prospección nicho inmobiliaria)
  agente.inmo@kapturo.com    → member       (Inmobiliaria Test)
  admin.licit@kapturo.com    → admin        (prueba1 licitaciones — módulo Licitador)
  vendedor.licit@kapturo.com → member       (prueba1 licitaciones)
"""
import bcrypt, sys, uuid
sys.path.insert(0, '.')
from app.core.database import SessionLocal
from app.models.user import User
from app.models.tenant import Tenant, TenantModule, ModuleType
from datetime import datetime, timezone

db = SessionLocal()
PWD = 'Kapturo123!'
pwd_hash = bcrypt.hashpw(PWD.encode(), bcrypt.gensalt()).decode()

TENANT_INMO  = '7aaa90bc-7235-4eae-a845-b926161af22c'  # Inmobiliaria Test
TENANT_LICIT = '5e73e588-7481-40cd-bb20-35659bebb88e'  # prueba1 licitaciones

def upsert_user(email, full_name, role, tenant_id):
    u = db.query(User).filter(User.email == email).first()
    if u:
        u.hashed_password = pwd_hash
        u.full_name = full_name
        u.role = role
        u.tenant_id = tenant_id
        u.is_active = True
        print(f"  [~] Actualizado: {email}")
    else:
        db.add(User(
            id=str(uuid.uuid4()),
            email=email,
            full_name=full_name,
            hashed_password=pwd_hash,
            role=role,
            tenant_id=tenant_id,
            is_active=True,
            created_at=datetime.now(timezone.utc)
        ))
        print(f"  [+] Creado:     {email}")

def upsert_module(tenant_id, module, niche_config=None):
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == tenant_id,
        TenantModule.module == module
    ).first()
    if mod:
        if niche_config: mod.niche_config = niche_config
        mod.is_active = True
    else:
        db.add(TenantModule(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            module=module,
            is_active=True,
            niche_config=niche_config or {}
        ))

print("\n── Módulos ─────────────────────────────────────────────")
upsert_module(TENANT_INMO,  ModuleType.prospector, {"niche": "inmobiliaria", "pais": "US"})
print("  [OK] Inmobiliaria Test → prospector (niche: inmobiliaria)")
upsert_module(TENANT_LICIT, ModuleType.licitador)
print("  [OK] prueba1 licitaciones → licitador")

print("\n── Usuarios ────────────────────────────────────────────")
upsert_user('super@kapturo.com',          'Super Admin',            'super_admin', None)
upsert_user('admin.inmo@kapturo.com',     'Admin Inmobiliaria',     'admin',       TENANT_INMO)
upsert_user('agente.inmo@kapturo.com',    'Agente Inmobiliaria',    'member',      TENANT_INMO)
upsert_user('admin.licit@kapturo.com',    'Admin Licitaciones',     'admin',       TENANT_LICIT)
upsert_user('vendedor.licit@kapturo.com', 'Vendedor Licitaciones',  'member',      TENANT_LICIT)

db.commit()
db.close()

print(f"""
╔══════════════════════════════════════════════════════════════╗
║         ACCESOS LOCALES — contraseña: {PWD}        ║
╠══════════════════════════════╦══════════════╦════════════════╣
║ EMAIL                        ║ ROL          ║ MÓDULO         ║
╠══════════════════════════════╬══════════════╬════════════════╣
║ super@kapturo.com            ║ super_admin  ║ Todo           ║
║ admin.inmo@kapturo.com       ║ admin        ║ Prospección    ║
║ agente.inmo@kapturo.com      ║ member       ║ Prospección    ║
║ admin.licit@kapturo.com      ║ admin        ║ Licitaciones   ║
║ vendedor.licit@kapturo.com   ║ member       ║ Licitaciones   ║
╚══════════════════════════════╩══════════════╩════════════════╝
  URL: http://localhost:5173
""")
