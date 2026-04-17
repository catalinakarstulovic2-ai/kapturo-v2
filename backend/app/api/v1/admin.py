"""
Endpoints del Super Admin.

Solo accesibles por usuarios con role = super_admin (Catalina).
Permiten gestionar tenants, usuarios, planes y ver métricas globales.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.database import get_db
from app.core.middleware import require_super_admin
from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole
from app.models.tenant import Tenant, SubscriptionPlan, TenantModule, PlanName, ModuleType
from app.models.prospect import Prospect
from app.models.message import Message
from app.services.pipeline_service import PipelineService

router = APIRouter(prefix="/admin", tags=["super-admin"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CrearTenantRequest(BaseModel):
    company_name: str
    slug: Optional[str] = None
    plan_id: Optional[str] = None
    modules: list[str] = []


class ActualizarTenantRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    plan_id: Optional[str] = None


class CrearUserRequest(BaseModel):
    tenant_id: str
    email: EmailStr
    full_name: str
    password: str
    role: str = "admin"


class ActualizarUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class CrearPlanRequest(BaseModel):
    name: PlanName
    max_prospects: int = 500
    max_messages_per_month: int = 1000
    max_users: int = 3
    price_usd: float = 0.0


class ActualizarPlanRequest(BaseModel):
    max_prospects: Optional[int] = None
    max_messages_per_month: Optional[int] = None
    max_users: Optional[int] = None
    price_usd: Optional[float] = None


class AsignarModuloRequest(BaseModel):
    module: str  # str para no depender del enum Python en producción
    config: Optional[str] = None  # JSON string con config específica del módulo

VALID_MODULES = {'licitador', 'licitaciones', 'prospector', 'inmobiliaria', 'adjudicadas', 'kapturo_ventas'}


# ── Tenants ────────────────────────────────────────────────────────────────────

@router.get("/tenants")
def listar_tenants(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Lista todos los tenants con info de plan, cantidad de usuarios y prospectos."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()

    resultado = []
    for t in tenants:
        num_usuarios = db.query(User).filter(User.tenant_id == t.id).count()
        num_prospectos = db.query(Prospect).filter(Prospect.tenant_id == t.id).count()
        modulos = [m.module for m in t.modules if m.is_active]

        resultado.append({
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "is_active": t.is_active,
            "plan": t.plan.name if t.plan else None,
            "plan_id": t.plan_id,
            "num_usuarios": num_usuarios,
            "num_prospectos": num_prospectos,
            "modulos_activos": modulos,
            "created_at": t.created_at,
        })

    return {"total": len(resultado), "tenants": resultado}


@router.post("/tenants", status_code=201)
def crear_tenant(
    data: CrearTenantRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Crea un tenant manualmente (sin pasar por signup)."""
    from slugify import slugify as _slug

    slug = data.slug or _slug(data.company_name)
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        raise HTTPException(status_code=400, detail="Ya existe un tenant con ese slug")

    tenant = Tenant(name=data.company_name, slug=slug, plan_id=data.plan_id)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    # Crear etapas de pipeline por defecto
    servicio = PipelineService(db=db, tenant_id=tenant.id)
    servicio.crear_etapas_default(tenant_id=tenant.id)

    # Asignar módulos si se indicaron
    import uuid as _uuid, json as _json
    from sqlalchemy import text as sqla_text
    for mod_str in data.modules:
        mod_str = mod_str.strip().lower()
        if mod_str not in VALID_MODULES:
            continue
        default_cfg = DEFAULT_NICHE_CONFIGS.get(mod_str)
        db.execute(
            sqla_text(
                "INSERT INTO tenant_modules (id, tenant_id, module, is_active, niche_config, activated_at) "
                "VALUES (:id, :tid, CAST(:mod AS moduletype), true, :cfg::jsonb, now())"
            ),
            {
                "id": str(_uuid.uuid4()),
                "tid": tenant.id,
                "mod": mod_str,
                "cfg": _json.dumps(default_cfg) if default_cfg else "{}",
            }
        )
    if data.modules:
        db.commit()

    return {"id": tenant.id, "name": tenant.name, "slug": tenant.slug}


@router.get("/tenants/{tenant_id}")
def obtener_tenant(
    tenant_id: str,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Devuelve detalle completo de un tenant: usuarios, módulos y plan."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    usuarios = db.query(User).filter(User.tenant_id == tenant_id).all()
    modulos = db.query(TenantModule).filter(TenantModule.tenant_id == tenant_id).all()
    total_prospectos = db.query(Prospect).filter(Prospect.tenant_id == tenant_id).count()

    # ── Costos estimados por módulo ──────────────────────────────────
    modulo_tipos = [m.module.value for m in modulos if m.is_active]
    apis_info = []

    if "prospector" in modulo_tipos:
        # Google Maps: ~$0.017 por búsqueda Places (estimamos 2 búsquedas por prospecto encontrado)
        maps_cost = round(total_prospectos * 0.017 * 2, 2)
        # Hunter.io: gratis hasta 25 búsquedas/mes, luego $49/mes
        hunter_cost = 0 if total_prospectos <= 25 else 49.0
        # Claude: ~$0.003 por prospecto calificado (Haiku)
        claude_cost = round(total_prospectos * 0.003, 2)
        apis_info += [
            {"api": "Google Maps Places", "uso": "Encontrar empresas por rubro y ciudad", "costo_usd": maps_cost, "modelo": f"{total_prospectos * 2} requests"},
            {"api": "Hunter.io",          "uso": "Enriquecer emails y contactos",         "costo_usd": hunter_cost, "modelo": "Free hasta 25 búsquedas/mes, luego $49"},
            {"api": "Claude (Anthropic)", "uso": "Calificar y puntuar cada prospecto",     "costo_usd": claude_cost, "modelo": f"{total_prospectos} calificaciones"},
        ]

    if "licitador" in modulo_tipos:
        # Mercado Público API: gratis
        # Claude: scoring de licitaciones
        licit_prosp = db.query(Prospect).filter(
            Prospect.tenant_id == tenant_id,
            Prospect.source == "licitacion"
        ).count() if total_prospectos > 0 else 0
        claude_licit = round(licit_prosp * 0.003, 2)
        apis_info += [
            {"api": "Mercado Público API", "uso": "Buscar licitaciones públicas activas", "costo_usd": 0.0, "modelo": "Gratis"},
            {"api": "Claude (Anthropic)",   "uso": "Calificar relevancia de licitaciones", "costo_usd": claude_licit, "modelo": f"{licit_prosp} calificaciones"},
        ]

    costo_total = round(sum(a["costo_usd"] for a in apis_info), 2)

    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "is_active": tenant.is_active,
        "plan": {"id": tenant.plan.id, "name": tenant.plan.name, "price_usd": tenant.plan.price_usd} if tenant.plan else None,
        "created_at": tenant.created_at,
        "total_prospectos": total_prospectos,
        "usuarios": [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active} for u in usuarios],
        "modulos": [{"id": m.id, "module": m.module, "is_active": m.is_active, "activated_at": m.activated_at, "niche_config": m.niche_config} for m in modulos],
        "apis": apis_info,
        "costo_estimado_usd": costo_total,
    }


@router.put("/tenants/{tenant_id}")
def actualizar_tenant(
    tenant_id: str,
    data: ActualizarTenantRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Actualiza nombre, estado activo o plan de un tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if data.name is not None:
        tenant.name = data.name
    if data.is_active is not None:
        tenant.is_active = data.is_active
    if data.plan_id is not None:
        if not db.query(SubscriptionPlan).filter(SubscriptionPlan.id == data.plan_id).first():
            raise HTTPException(status_code=404, detail="Plan no encontrado")
        tenant.plan_id = data.plan_id

    db.commit()
    db.refresh(tenant)
    return {"id": tenant.id, "name": tenant.name, "is_active": tenant.is_active, "plan_id": tenant.plan_id}


@router.delete("/tenants/{tenant_id}", status_code=204)
def eliminar_tenant(
    tenant_id: str,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Elimina un tenant y todos sus datos (irreversible)."""
    from app.models.message import Message
    from app.models.pipeline import PipelineStage
    from app.models.prospect import Prospect
    from app.models.user import User as UserModel
    from app.models.tenant import TenantModule

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    # Borrar en orden para respetar FK constraints
    db.query(Message).filter(Message.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(PipelineStage).filter(PipelineStage.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(Prospect).filter(Prospect.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(TenantModule).filter(TenantModule.tenant_id == tenant_id).delete(synchronize_session=False)
    db.query(UserModel).filter(UserModel.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(tenant)
    db.commit()
    return None


# ── Rubros Adjudicadas por tenant (super admin) ───────────────────────────────

class RubrosAdjudicadasRequest(BaseModel):
    rubros: list[str]


@router.get("/tenants/{tenant_id}/adjudicadas-rubros")
def get_rubros_tenant(
    tenant_id: str,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Obtiene los rubros habilitados del módulo adjudicadas de un tenant."""
    from app.modules.licitaciones.client import MercadoPublicoClient
    from sqlalchemy import text as sqla_text
    row = db.execute(
        sqla_text("SELECT id, niche_config FROM tenant_modules WHERE tenant_id = :tid AND module::text = 'adjudicadas' AND is_active = true"),
        {"tid": tenant_id}
    ).fetchone()
    todos = MercadoPublicoClient().obtener_catalogo()["rubros"]
    if not row:
        return {"todos": todos, "habilitados": todos, "personalizado": False}
    import json as _json
    niche = row[1] if isinstance(row[1], dict) else (_json.loads(row[1]) if row[1] else {})
    rubros = niche.get("rubros_habilitados")
    return {
        "todos": todos,
        "habilitados": rubros if rubros is not None else todos,
        "personalizado": rubros is not None,
    }


@router.put("/tenants/{tenant_id}/adjudicadas-rubros")
def set_rubros_tenant(
    tenant_id: str,
    body: RubrosAdjudicadasRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Guarda los rubros habilitados del módulo adjudicadas de un tenant."""
    from sqlalchemy import text as sqla_text
    import json as _json
    row = db.execute(
        sqla_text("SELECT id, niche_config FROM tenant_modules WHERE tenant_id = :tid AND module::text = 'adjudicadas' AND is_active = true"),
        {"tid": tenant_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Módulo adjudicadas no activo para este tenant")
    niche = row[1] if isinstance(row[1], dict) else (_json.loads(row[1]) if row[1] else {})
    niche["rubros_habilitados"] = body.rubros
    db.execute(
        sqla_text("UPDATE tenant_modules SET niche_config = :cfg WHERE id = :id"),
        {"cfg": _json.dumps(niche), "id": row[0]}
    )
    db.commit()
    return {"ok": True, "rubros_guardados": len(body.rubros)}


# ── Módulos por tenant ─────────────────────────────────────────────────────────

# ── Configs por defecto según módulo ─────────────────────────────────────────
# Cuando se activa un módulo por primera vez, se pre-carga con esta config.
# Cada nuevo cliente puede editarla desde el modal en Super Admin.
DEFAULT_NICHE_CONFIGS: dict[str, dict] = {
    "inmobiliaria": {
        "nicho": "terrenos en Florida para latinoamericanos",
        "empresa": "Uperland",
        "producto": "terrenos urbanizados de 1,000 m2 en Inverness, Florida desde USD $14,990, con financiamiento directo sin banco, sin necesidad de ser residente ni tener licencia USA",
        "comprador_ideal": "latinoamericano con capital propio o capacidad de ahorro, que busca dolarizar su patrimonio o hacer su primera inversión en EE.UU.",
        "paises_objetivo": ["chile","argentina","mexico","peru","colombia","venezuela","ecuador","uruguay","panama","costa rica","estados unidos","eeuu","usa","espana","miami","florida"],
        "tipos_lead": ["comprador_directo","potencial_referido","agente_latam"],
        "hashtags_instagram": ["invertirenusa","terrenosflorida","propiedadesenusa","comprarenusa","bienesraicesusa","floridarealestate","inversionesflorida","terrenoenusa","dolarizatusahorros","patrimonioenusa","realtorchile","realtorlatino","FirstLandUSA"],
        "cuentas_instagram": ["terrenoenflorida","uperland.us","realtordeflorida","enidizquierdorealtor","realtorannelice"],
        "paginas_facebook": [],
        "grupos_facebook": [
            "https://www.facebook.com/groups/invertirenusadesdechile",
            "https://www.facebook.com/groups/inversioninmobiliariainternacional",
            "https://www.facebook.com/groups/bienesraicesusalatam"
        ],
        "videos_youtube": [],
        "competidores": ["terrenoenflorida","firstlandusa","inversionenflorida"],
    },
}


@router.post("/tenants/{tenant_id}/modules", status_code=201)
def asignar_modulo(
    tenant_id: str,
    data: AsignarModuloRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activa un módulo para un tenant específico."""
    module_str = data.module.strip().lower()
    if module_str not in VALID_MODULES:
        raise HTTPException(status_code=422, detail=f"Módulo '{module_str}' no válido. Opciones: {sorted(VALID_MODULES)}")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    from sqlalchemy import text as sqla_text

    # Buscar si ya existe usando SQL para evitar validación de enum
    existente_row = db.execute(
        sqla_text("SELECT id, is_active, niche_config FROM tenant_modules WHERE tenant_id = :tid AND module::text = :mod"),
        {"tid": tenant_id, "mod": module_str}
    ).fetchone()

    if existente_row:
        # Reactivar — si niche_config estaba vacío, inyectar el default
        update_sql = "UPDATE tenant_modules SET is_active = true"
        params: dict = {"id": existente_row[0]}
        existing_config = existente_row[2]  # niche_config column
        if not existing_config and module_str in DEFAULT_NICHE_CONFIGS:
            import json as _json
            update_sql += ", niche_config = :cfg::jsonb"
            params["cfg"] = _json.dumps(DEFAULT_NICHE_CONFIGS[module_str])
        update_sql += " WHERE id = :id"
        db.execute(sqla_text(update_sql), params)
    else:
        import uuid as _uuid, json as _json
        default_cfg = DEFAULT_NICHE_CONFIGS.get(module_str)
        db.execute(
            sqla_text(
                "INSERT INTO tenant_modules (id, tenant_id, module, is_active, niche_config, activated_at) "
                "VALUES (:id, :tid, CAST(:mod AS moduletype), true, :cfg::jsonb, now())"
            ),
            {
                "id": str(_uuid.uuid4()),
                "tid": tenant_id,
                "mod": module_str,
                "cfg": _json.dumps(default_cfg) if default_cfg else "{}",
            }
        )

    db.commit()
    return {"tenant_id": tenant_id, "module": module_str, "is_active": True}


@router.put("/tenants/{tenant_id}/modules/{module_id}")
def actualizar_modulo(
    tenant_id: str,
    module_id: str,
    is_active: bool,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Activa o desactiva un módulo de un tenant."""
    modulo = db.query(TenantModule).filter(
        TenantModule.id == module_id,
        TenantModule.tenant_id == tenant_id,
    ).first()
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")

    modulo.is_active = is_active
    db.commit()
    return {"module_id": module_id, "is_active": is_active}


@router.patch("/tenants/{tenant_id}/modules/{module_id}/config")
def actualizar_niche_config(
    tenant_id: str,
    module_id: str,
    body: dict,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    modulo = db.query(TenantModule).filter(
        TenantModule.id == module_id,
        TenantModule.tenant_id == tenant_id,
    ).first()
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")

    from sqlalchemy.orm.attributes import flag_modified
    modulo.niche_config = body
    flag_modified(modulo, "niche_config")
    db.commit()
    db.refresh(modulo)
    return {"ok": True, "niche_config": modulo.niche_config}


# ── Usuarios ──────────────────────────────────────────────────────────────────

@router.get("/users")
def listar_usuarios(
    tenant_id: Optional[str] = None,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Lista todos los usuarios. Opcionalmente filtra por tenant."""
    query = db.query(User)
    if tenant_id:
        query = query.filter(User.tenant_id == tenant_id)
    usuarios = query.order_by(User.created_at.desc()).all()

    return {
        "total": len(usuarios),
        "usuarios": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "tenant_id": u.tenant_id,
                "tenant_name": u.tenant.name if u.tenant else None,
                "created_at": u.created_at,
                "last_login": u.last_login,
            }
            for u in usuarios
        ],
    }


@router.post("/users", status_code=201)
def crear_usuario(
    data: CrearUserRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Crea un usuario en un tenant existente."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    tenant = db.query(Tenant).filter(Tenant.id == data.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    try:
        role = UserRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {[r.value for r in UserRole]}")

    user = User(
        tenant_id=data.tenant_id,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role}


@router.put("/users/{user_id}")
def actualizar_usuario(
    user_id: str,
    data: ActualizarUserRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Cambia el rol o estado activo de un usuario."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role is not None:
        try:
            user.role = UserRole(data.role)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {[r.value for r in UserRole]}")

    db.commit()
    return {"id": user.id, "email": user.email, "role": user.role, "is_active": user.is_active}


# ── Planes ────────────────────────────────────────────────────────────────────

@router.get("/plans")
def listar_planes(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Lista todos los planes de suscripción con cuántos tenants los usan."""
    planes = db.query(SubscriptionPlan).all()
    return {
        "planes": [
            {
                "id": p.id,
                "name": p.name,
                "max_prospects": p.max_prospects,
                "max_messages_per_month": p.max_messages_per_month,
                "max_users": p.max_users,
                "price_usd": p.price_usd,
                "num_tenants": db.query(Tenant).filter(Tenant.plan_id == p.id).count(),
            }
            for p in planes
        ]
    }


@router.post("/plans", status_code=201)
def crear_plan(
    data: CrearPlanRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Crea un nuevo plan de suscripción."""
    plan = SubscriptionPlan(
        name=data.name,
        max_prospects=data.max_prospects,
        max_messages_per_month=data.max_messages_per_month,
        max_users=data.max_users,
        price_usd=data.price_usd,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "name": plan.name, "price_usd": plan.price_usd}


@router.put("/plans/{plan_id}")
def actualizar_plan(
    plan_id: str,
    data: ActualizarPlanRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Actualiza los límites o precio de un plan."""
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    if data.max_prospects is not None:
        plan.max_prospects = data.max_prospects
    if data.max_messages_per_month is not None:
        plan.max_messages_per_month = data.max_messages_per_month
    if data.max_users is not None:
        plan.max_users = data.max_users
    if data.price_usd is not None:
        plan.price_usd = data.price_usd

    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "name": plan.name, "price_usd": plan.price_usd}

# ── Impersonación ──────────────────────────────────────────────────

@router.post("/impersonate/{user_id}")
def impersonar_usuario(
    user_id: str,
    super_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Super admin toma el contexto de otro usuario.
    Devuelve un token temporal para ese usuario + sus datos.
    El frontend guarda el token original para poder volver.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if target.role == UserRole.super_admin:
        raise HTTPException(status_code=400, detail="No puedes impersonar a otro super_admin")

    token = create_access_token({
        "sub": str(target.id),
        "tenant_id": str(target.tenant_id) if target.tenant_id else None,
        "role": target.role.value if hasattr(target.role, "value") else str(target.role),
    })

    # Cargar módulos del tenant
    modulos = []
    if target.tenant_id:
        modulos = db.query(TenantModule).filter(
            TenantModule.tenant_id == target.tenant_id,
            TenantModule.is_active == True
        ).all()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": target.id,
            "email": target.email,
            "full_name": target.full_name,
            "role": target.role.value,
            "tenant_id": target.tenant_id,
            "modules": [{"tipo": m.module.value, "is_active": m.is_active} for m in modulos],
        },
    }

# ── Stats globales ────────────────────────────────────────────────────────────

@router.get("/stats")
def stats_globales(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Métricas globales de la plataforma para el superadmin."""
    total_tenants = db.query(Tenant).count()
    tenants_activos = db.query(Tenant).filter(Tenant.is_active == True).count()
    total_usuarios = db.query(User).filter(User.role != UserRole.super_admin).count()
    total_prospectos = db.query(Prospect).count()
    total_mensajes = db.query(Message).count()

    # Prospectos por tenant (top 10)
    prospectos_por_tenant = (
        db.query(Tenant.name, func.count(Prospect.id).label("total"))
        .outerjoin(Prospect, Prospect.tenant_id == Tenant.id)
        .group_by(Tenant.id, Tenant.name)
        .order_by(func.count(Prospect.id).desc())
        .limit(10)
        .all()
    )

    return {
        "totales": {
            "tenants": total_tenants,
            "tenants_activos": tenants_activos,
            "usuarios": total_usuarios,
            "prospectos": total_prospectos,
            "mensajes": total_mensajes,
        },
        "prospectos_por_tenant": [
            {"tenant": row[0], "prospectos": row[1]} for row in prospectos_por_tenant
        ],
    }
