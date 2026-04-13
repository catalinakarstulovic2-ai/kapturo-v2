"""
Endpoints REST del módulo Inmobiliaria.

POST /api/v1/inmobiliaria/buscar   → lanza búsqueda completa (6 fuentes)
GET  /api/v1/inmobiliaria/prospectos → lista prospectos del módulo con filtros
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.middleware import get_current_user
from app.services.inmobiliaria_service import InmobiliariaService
from app.services.prospector_service import ProspectorService

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])


class BusquedaParams(BaseModel):
    max_apollo_latam: int = 100
    max_apollo_usa: int = 100
    max_facebook: int = 50
    max_reddit: int = 100
    max_instagram: int = 100
    max_tiktok: int = 50


@router.post("/buscar")
async def buscar_prospectos(
    params: BusquedaParams,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Lanza la búsqueda completa de prospectos inmobiliarios para Leo.

    Ejecuta 6 fuentes en paralelo (Apollo LATAM, Apollo USA, Facebook,
    Reddit, Instagram, TikTok), normaliza, califica y guarda.

    Devuelve resumen con totales por fuente.
    """
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.ejecutar_busqueda(
            max_apollo_latam=params.max_apollo_latam,
            max_apollo_usa=params.max_apollo_usa,
            max_facebook=params.max_facebook,
            max_reddit=params.max_reddit,
            max_instagram=params.max_instagram,
            max_tiktok=params.max_tiktok,
        )
        return {"ok": True, "resultado": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prospectos")
async def listar_prospectos(
    solo_calificados: bool = False,
    score_minimo: float = 0,
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Lista los prospectos del módulo inmobiliaria con filtros y paginación.
    Reutiliza el servicio de prospector filtrando por source_module=inmobiliaria.
    """
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    return await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )


@router.get("/descartados")
async def listar_descartados(
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lista los prospectos descartados del módulo inmobiliaria."""
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    return await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_excluidos=True,
        pagina=pagina,
        por_pagina=por_pagina,
    )
