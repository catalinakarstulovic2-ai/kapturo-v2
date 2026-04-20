"""
Script de setup de usuarios de prueba — Kapturo
Contraseña de todos: Kapturo123!

════════════════════════════════════════════════════
 MÓDULOS DEL SISTEMA
════════════════════════════════════════════════════
 adjudicadas   → "Mercado Público" en sidebar
                 Empresas que ganaron licitaciones
                 (para venderles seguros 1%/5%)

 licitaciones  → "Licitaciones" en sidebar
                 Buscar licitaciones abiertas
                 para postularse

 inmobiliaria  → "Inmobiliaria" en sidebar
                 Buscar compradores de terrenos
                 vía redes sociales (Apify/TikTok)

════════════════════════════════════════════════════
 TENANTS DE PRUEBA
════════════════════════════════════════════════════
 "Demo Mercado Público"
   módulos: adjudicadas + licitaciones
   admin.mp@kapturo.com      → admin
   vendedor.mp@kapturo.com   → member

 "Demo Inmobiliaria"
   módulos: inmobiliaria
   admin.inmo@kapturo.com    → admin
   agente.inmo@kapturo.com   → member

 Super Admin (sin tenant, ve todo):
   super@kapturo.com         → super_admin
════════════════════════════════════════════════════
"""
import bcrypt, sys, uuid
sys.path.insert(0, '.')
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.models.tenant import Tenant, TenantModule, ModuleType
from app.services.pipeline_service import PipelineService
from datetime import datetime, timezone

db = SessionLocal()
PWD = 'Kapturo123!'
pwd_hash = bcrypt.hashpw(PWD.encode(), bcrypt.gensalt()).decode()


def upsert_tenant(name, slug):
    t = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not t:
        t = Tenant(id=str(uuid.uuid4()), name=name, slug=slug)
        db.add(t)
        db.flush()
        PipelineService(db=db, tenant_id=t.id).crear_etapas_default(tenant_id=t.id)
        print(f"  [+] Tenant creado: {name}")
    else:
        print(f"  [~] Tenant ya existe: {name}")
    return t


def upsert_user(email, full_name, role, tenant_id):
    u = db.query(User).filter(User.email == email).first()
    if u:
        u.hashed_password = pwd_hash
        u.full_name = full_name
        u.role = role
        u.tenant_id = tenant_id
        u.is_active = True
        print(f"    [~] Actualizado: {email}")
    else:
        db.add(User(
            id=str(uuid.uuid4()),
            email=email,
            full_name=full_name,
            hashed_password=pwd_hash,
            role=role,
            tenant_id=tenant_id,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        ))
        print(f"    [+] Creado: {email}")


def upsert_module(tenant_id, module: ModuleType, niche_config=None):
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == tenant_id,
        TenantModule.module == module,
    ).first()
    if mod:
        mod.is_active = True
        if niche_config:
            mod.niche_config = niche_config
        print(f"    [~] Módulo activado: {module.value}")
    else:
        db.add(TenantModule(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            module=module,
            is_active=True,
            niche_config=niche_config or {},
            activated_at=datetime.now(timezone.utc),
        ))
        print(f"    [+] Módulo creado: {module.value}")


# ── Super Admin ────────────────────────────────────────────
print("\n── Super Admin ──")
upsert_user('super@kapturo.com', 'Super Admin', UserRole.super_admin, None)

# ── Demo Mercado Público (solo adjudicadas) ────────────────
print("\n── Demo Mercado Público ──")
t_mp = upsert_tenant('Demo Mercado Público', 'demo-mercado-publico')
upsert_user('admin.mp@kapturo.com',    'Admin MP',    UserRole.admin,  t_mp.id)
upsert_user('vendedor.mp@kapturo.com', 'Vendedor MP', UserRole.member, t_mp.id)
upsert_module(t_mp.id, ModuleType.adjudicadas)

# ── Demo Licitaciones (solo licitaciones) ─────────────────
print("\n── Demo Licitaciones ──")
t_licit = upsert_tenant('Demo Licitaciones', 'demo-licitaciones')
upsert_user('admin.licit@kapturo.com',    'Admin Licitaciones',    UserRole.admin,  t_licit.id)
upsert_user('vendedor.licit@kapturo.com', 'Vendedor Licitaciones', UserRole.member, t_licit.id)
upsert_module(t_licit.id, ModuleType.licitaciones)

# ── Demo Inmobiliaria (solo inmobiliaria) ──────────────────
print("\n── Demo Inmobiliaria ──")
t_inmo = upsert_tenant('Demo Inmobiliaria', 'demo-inmobiliaria')
upsert_user('admin.inmo@kapturo.com',  'Admin Inmobiliaria',  UserRole.admin,  t_inmo.id)
upsert_user('agente.inmo@kapturo.com', 'Agente Inmobiliaria', UserRole.member, t_inmo.id)
upsert_module(t_inmo.id, ModuleType.inmobiliaria)

db.commit()
db.close()

print(f"""
╔═══════════════════════════════════════════════════════════════╗
║          ACCESOS LOCALES — contraseña: {PWD}         ║
╠═══════════════════════════════╦═════════════╦═════════════════╣
║ EMAIL                         ║ ROL         ║ MÓDULO          ║
╠═══════════════════════════════╬═════════════╬═════════════════╣
║ super@kapturo.com             ║ super_admin ║ Todo            ║
╠═══════════════════════════════╬═════════════╬═════════════════╣
║ admin.mp@kapturo.com          ║ admin       ║ Mercado Público ║
║ vendedor.mp@kapturo.com       ║ member      ║ (adjudicadas)   ║
╠═══════════════════════════════╬═════════════╬═════════════════╣
║ admin.licit@kapturo.com       ║ admin       ║ Licitaciones    ║
║ vendedor.licit@kapturo.com    ║ member      ║ (licitaciones)  ║
╠═══════════════════════════════╬═════════════╬═════════════════╣
║ admin.inmo@kapturo.com        ║ admin       ║ Inmobiliaria    ║
║ agente.inmo@kapturo.com       ║ member      ║ (inmobiliaria)  ║
╚═══════════════════════════════╩═════════════╩═════════════════╝
  URL: http://localhost:5173
""")
