from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from slugify import slugify

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.core.middleware import get_current_user
from app.services.pipeline_service import PipelineService

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas (qué datos entran y salen) ──────────────────────────────────────

class SignupRequest(BaseModel):
    company_name: str
    full_name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str | None
    role: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=201)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    """Registra una nueva empresa y su primer usuario (Admin)."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Este email ya está registrado")

    # Crear el tenant (empresa)
    slug = slugify(data.company_name)
    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    if existing:
        slug = f"{slug}-{str(hash(data.email))[:6]}"

    tenant = Tenant(name=data.company_name, slug=slug)
    db.add(tenant)
    db.flush()  # Para obtener el ID antes del commit

    # Crear el usuario Admin
    user = User(
        tenant_id=tenant.id,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Crear etapas de pipeline por defecto para el nuevo tenant
    PipelineService(db=db, tenant_id=tenant.id).crear_etapas_default(tenant_id=tenant.id)

    token = create_access_token({"sub": user.id, "tenant_id": tenant.id, "role": user.role})
    return TokenResponse(access_token=token, user_id=user.id, tenant_id=tenant.id, role=user.role)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Inicia sesión y devuelve un token JWT."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": user.id, "tenant_id": user.tenant_id, "role": user.role})
    return TokenResponse(access_token=token, user_id=user.id, tenant_id=user.tenant_id, role=user.role)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
    }
