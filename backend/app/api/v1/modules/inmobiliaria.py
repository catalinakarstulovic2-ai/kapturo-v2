"""
Endpoints REST del módulo Inmobiliaria.

POST /api/v1/inmobiliaria/buscar   → lanza búsqueda con Google Maps + Hunter + Claude
GET  /api/v1/inmobiliaria/prospectos → lista prospectos del módulo con filtros
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.core.database import get_db
from app.core.middleware import get_current_user
from app.services.inmobiliaria_service import InmobiliariaService
from app.services.prospector_service import ProspectorService

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])


class BusquedaParams(BaseModel):
    ubicacion: Optional[str] = None          # ej: "Santiago, Chile"
    queries: Optional[List[str]] = None      # queries custom (o usa DEFAULT_QUERIES)
    max_por_query: int = 20                  # resultados Maps por query


@router.post("/buscar")
async def buscar_prospectos(
    params: BusquedaParams,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Lanza la búsqueda de prospectos inmobiliarios usando:
      1. Google Maps  → encuentra agencias/constructoras/inmobiliarias
      2. Hunter.io    → enriquece con email y contacto real
      3. Claude Haiku → califica según contexto del tenant

    Devuelve resumen con totales y detalle por query.
    """
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.ejecutar_busqueda(
            ubicacion=params.ubicacion,
            queries=params.queries,
            max_por_query=params.max_por_query,
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
