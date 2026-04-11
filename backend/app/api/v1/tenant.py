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
