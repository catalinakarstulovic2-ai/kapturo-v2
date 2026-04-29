"""
Endpoints de auto-gestión del tenant.

Permiten que el admin de una empresa (no superadmin) vea y configure
su propia cuenta: módulos activos, claves API, info de empresa.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import require_admin
from app.models.user import User
from app.models.tenant import Tenant, TenantModule

router = APIRouter(prefix="/tenant", tags=["tenant"])

# Claves API que cada tenant puede configurar
API_KEY_FIELDS = [
    "apollo_api_key",
    "apify_api_key",
    "whatsapp_token",
    "whatsapp_phone_number_id",
    "whatsapp_verify_token",
]


class ApiKeysRequest(BaseModel):
    apollo_api_key: Optional[str] = None
    apify_api_key: Optional[str] = None
    whatsapp_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None


class ActualizarEmpresaRequest(BaseModel):
    name: Optional[str] = None


class AgentConfigRequest(BaseModel):
    agent_name: Optional[str] = None
    product: Optional[str] = None
    target: Optional[str] = None
    value_prop: Optional[str] = None
    extra_context: Optional[str] = None
    tone: Optional[str] = None          # "informal" | "professional" | "formal"
    ideal_industry: Optional[str] = None
    ideal_role: Optional[str] = None
    ideal_size: Optional[str] = None    # "small" | "medium" | "large" | "any"
    module: Optional[str] = None
    meeting_type: Optional[str] = None  # "video" | "in_person" | "phone" | "prospect_chooses"
    onboarding_completed: Optional[bool] = None


class LicitacionesProfileRequest(BaseModel):
    """Perfil de empresa para el módulo de licitaciones."""
    # Identidad legal
    rut_empresa: Optional[str] = None
    razon_social: Optional[str] = None
    inscrito_chile_proveedores: Optional[bool] = None
    # Datos de contacto / legales (necesarios para documentos formales)
    nombre_contacto: Optional[str] = None     # representante legal / firmante
    cargo_contacto: Optional[str] = None      # cargo del firmante
    telefono: Optional[str] = None
    correo: Optional[str] = None              # correo de contacto / empresa
    sitio_web: Optional[str] = None
    direccion: Optional[str] = None
    # Actividad
    rubros: Optional[list[str]] = None
    regiones: Optional[list[str]] = None
    descripcion: Optional[str] = None
    experiencia_anos: Optional[int] = None
    proyectos_anteriores: Optional[str] = None
    certificaciones: Optional[str] = None
    diferenciadores: Optional[str] = None
    # Capacidades (para generar documentos técnicos realistas)
    equipo_tecnico: Optional[str] = None       # quiénes ejecutan, cuántas personas, roles
    metodologia_trabajo: Optional[str] = None  # forma de trabajo estándar
    monto_max_proyecto_uf: Optional[float] = None  # capacidad máxima — scorer penaliza si licitación excede
    # Alertas
    email_alertas: Optional[str] = None
    frecuencia_alertas: Optional[str] = None  # "diaria" | "semanal" | "nunca"
    nuevas_pendientes: Optional[int] = None


def _mask(value: str | None) -> str:
    """Devuelve los últimos 4 caracteres enmascarados para mostrar en UI."""
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return "••••" + value[-4:]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me")
def obtener_mi_tenant(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Devuelve la info del tenant del usuario autenticado:
    nombre, plan, módulos activos y estado de claves API (enmascaradas).
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    modulos = (
        db.query(TenantModule)
        .filter(TenantModule.tenant_id == tenant.id, TenantModule.is_active == True)
        .all()
    )

    keys = tenant.api_keys or {}

    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "plan": tenant.plan.name if tenant.plan else None,
        "modulos_activos": [m.module for m in modulos],
        "api_keys_estado": {
            field: {
                "configurado": bool(keys.get(field)),
                "preview": _mask(keys.get(field)),
            }
            for field in API_KEY_FIELDS
        },
    }


@router.get("/me/modules")
def obtener_mis_modulos(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Lista los módulos activos del tenant con su fecha de activación."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    modulos = (
        db.query(TenantModule)
        .filter(TenantModule.tenant_id == current_user.tenant_id)
        .all()
    )

    return {
        "modulos": [
            {
                "id": m.id,
                "module": m.module,
                "is_active": m.is_active,
                "activated_at": m.activated_at,
            }
            for m in modulos
        ]
    }


@router.put("/me/api-keys")
def guardar_api_keys(
    data: ApiKeysRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Guarda o actualiza las claves API del tenant.
    Solo actualiza los campos que se envíen (los nulos se ignoran).
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    keys = dict(tenant.api_keys or {})

    nuevas = data.model_dump(exclude_none=True)
    keys.update(nuevas)

    tenant.api_keys = keys
    db.commit()

    return {
        "mensaje": "Claves actualizadas",
        "actualizadas": list(nuevas.keys()),
        "api_keys_estado": {
            field: {
                "configurado": bool(keys.get(field)),
                "preview": _mask(keys.get(field)),
            }
            for field in API_KEY_FIELDS
        },
    }


@router.put("/me")
def actualizar_mi_empresa(
    data: ActualizarEmpresaRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Actualiza el nombre de la empresa del tenant."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if data.name:
        tenant.name = data.name

    db.commit()
    return {"id": tenant.id, "name": tenant.name}


@router.get("/me/agent-config")
def obtener_agent_config(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Devuelve la configuración del agente IA del tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    return {
        "agent_name": tenant.agent_name,
        "onboarding_completed": tenant.onboarding_completed,
        "config": tenant.agent_config or {},
    }


@router.put("/me/agent-config")
def guardar_agent_config(
    data: AgentConfigRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Guarda la configuración del agente IA del tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    if data.agent_name:
        tenant.agent_name = data.agent_name

    config = dict(tenant.agent_config or {})
    campos = ["product", "target", "value_prop", "extra_context", "tone",
              "ideal_industry", "ideal_role", "ideal_size", "module", "meeting_type"]
    for campo in campos:
        valor = getattr(data, campo)
        if valor is not None:
            config[campo] = valor

    tenant.agent_config = config

    if data.onboarding_completed is not None:
        tenant.onboarding_completed = data.onboarding_completed

    db.commit()

    return {
        "mensaje": "Configuración guardada",
        "agent_name": tenant.agent_name,
        "onboarding_completed": tenant.onboarding_completed,
        "config": tenant.agent_config,
    }


# ── Perfil de empresa para Licitaciones ───────────────────────────────────────

@router.get("/me/licitaciones-profile")
def obtener_licitaciones_profile(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Devuelve el perfil de empresa configurado para el módulo de licitaciones."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant")
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
        TenantModule.is_active == True,
    ).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Módulo licitaciones no activo")
    config = dict(mod.niche_config or {})
    # Devolver metadatos de documentos sin el base64 (puede ser muy pesado)
    if "documentos" in config:
        config["documentos"] = {
            k: {kk: vv for kk, vv in v.items() if kk != "base64"}
            for k, v in config["documentos"].items()
            if isinstance(v, dict)
        }
    return config


@router.put("/me/licitaciones-profile")
def guardar_licitaciones_profile(
    data: LicitacionesProfileRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Guarda el perfil de empresa para el módulo de licitaciones."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant")
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
        TenantModule.is_active == True,
    ).first()
    if not mod:
        raise HTTPException(status_code=404, detail="Módulo licitaciones no activo")

    from sqlalchemy.orm.attributes import flag_modified
    profile = dict(mod.niche_config or {})
    update = data.model_dump(exclude_unset=True)

    # Validar campos críticos si se están enviando
    if "rut_empresa" in update and update["rut_empresa"]:
        rut = update["rut_empresa"].replace(".", "").replace("-", "")
        if len(rut) < 7:
            raise HTTPException(status_code=422, detail="RUT empresa inválido")
    if "rubros" in update and update["rubros"] is not None:
        if not isinstance(update["rubros"], list):
            raise HTTPException(status_code=422, detail="Rubros debe ser una lista")
    if "regiones" in update and update["regiones"] is not None:
        if not isinstance(update["regiones"], list):
            raise HTTPException(status_code=422, detail="Regiones debe ser una lista")

    profile.update(update)
    mod.niche_config = profile
    flag_modified(mod, "niche_config")
    db.commit()
    return mod.niche_config
