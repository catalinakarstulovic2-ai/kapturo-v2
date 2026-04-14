"""
Endpoints del módulo Adjudicadas.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User
from app.services.adjudicadas_service import AdjudicadasService
from app.modules.licitaciones.client import MercadoPublicoClient

router = APIRouter(prefix="/modules/adjudicadas", tags=["adjudicadas"])


class MoverEtapaRequest(BaseModel):
    etapa_id: str


@router.get("/catalogos")
async def catalogos(current_user: User = Depends(get_current_user)):
    return MercadoPublicoClient().obtener_catalogo()


@router.get("/preview")
async def preview(
    pestana: str = Query("adjudicadas", description="adjudicadas | por_adjudicarse"),
    region: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    monto_minimo: float = Query(0),
    keyword: Optional[str] = Query(None),
    pagina: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    filtros = {
        "region": region,
        "fecha_hasta": fecha_hasta,
        "monto_minimo": monto_minimo,
        "keyword": keyword,
    }
    if pestana == "por_adjudicarse":
        return await svc.buscar_por_adjudicarse(filtros, pagina)
    return await svc.buscar_adjudicadas(filtros, pagina)


@router.post("/guardar/{codigo}")
async def guardar(
    codigo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    prospect = await svc.guardar(codigo)
    return {"ok": True, "prospect_id": prospect.id}


@router.get("/pipeline")
async def get_pipeline(
    rut: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    return svc.get_pipeline(rut_filtro=rut)


@router.get("/etapas")
async def get_etapas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    return svc.get_etapas()


@router.patch("/cards/{card_id}/etapa")
async def mover_etapa(
    card_id: str,
    body: MoverEtapaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    svc.mover_etapa(card_id, body.etapa_id)
    return {"ok": True}


@router.post("/agente/correr")
async def correr_agente(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    return await svc.correr_agente()
