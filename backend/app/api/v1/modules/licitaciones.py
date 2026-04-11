"""
Endpoints del módulo Licitaciones.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.services.licitaciones_service import LicitacionesService
from app.modules.licitaciones.client import MercadoPublicoClient

router = APIRouter(prefix="/modules/licitaciones", tags=["licitaciones"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class GuardarRequest(BaseModel):
    tipo: str                           # "licitador_a" | "licitador_b"
    codigo: str                         # CodigoExterno de la licitación
    calificar: bool = True
    # Contexto del cliente para que Claude calce el score
    producto: Optional[str] = None
    sector: Optional[str] = None
    rubro: Optional[str] = None
    experiencia: Optional[str] = None
    region_cliente: Optional[str] = None


# ── Catálogos ─────────────────────────────────────────────────────────────────

@router.get("/catalogos")
async def obtener_catalogos(current_user: User = Depends(get_current_user)):
    """
    Devuelve los catálogos fijos de Mercado Público:
    regiones, tipos de licitación, estados y rubros.
    Todo viene como listas de opciones para los selects del frontend.
    """
    client = MercadoPublicoClient()
    return client.obtener_catalogo()


# ── Preview — buscar sin guardar ──────────────────────────────────────────────

@router.get("/preview")
async def preview_licitaciones(
    tipo: str = Query("licitador_b", description="licitador_a | licitador_b"),
    region: Optional[str] = Query(None),
    tipo_licitacion: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    keyword: Optional[str] = Query(None, description="Texto libre para filtrar por nombre/categoría"),
    comprador: Optional[str] = Query(None, description="Filtrar por nombre del organismo comprador"),
    proveedor: Optional[str] = Query(None, description="Filtrar por nombre del proveedor adjudicado"),
    pagina: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Busca licitaciones en Mercado Público y devuelve los resultados
    para mostrar en la tabla. NO guarda nada en la base de datos.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    filtros: dict = {}
    if region:
        filtros["region"] = region
    if tipo_licitacion:
        filtros["tipo_licitacion"] = tipo_licitacion
    if fecha_desde:
        filtros["fecha_desde"] = fecha_desde
    if fecha_hasta:
        filtros["fecha_hasta"] = fecha_hasta
    if keyword:
        filtros["keyword"] = keyword
    if comprador:
        filtros["comprador"] = comprador
    if proveedor:
        filtros["proveedor"] = proveedor

    try:
        servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
        return await servicio.buscar_preview(tipo=tipo, filtros=filtros, pagina=pagina)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar en Mercado Público: {str(e)}")


# ── Guardar licitación seleccionada ──────────────────────────────────────────

@router.post("/guardar")
async def guardar_licitacion(
    data: GuardarRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Guarda una licitación específica como Prospect en la BD.
    Verifica duplicados y opcionalmente califica con Claude.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    contexto = {
        "producto": data.producto or "",
        "sector": data.sector or "",
        "rubro": data.rubro or "",
        "experiencia": data.experiencia or "",
        "region": data.region_cliente or "",
    }

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.guardar_licitacion(
        tipo=data.tipo,
        codigo=data.codigo,
        contexto_cliente=contexto,
        calificar=data.calificar,
    )

# ── Contacto preview (sin guardar) ───────────────────────────────────────────

@router.get("/preview-contacto")
async def preview_contacto(
    nombre: str = Query(..., description="Nombre de la empresa"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Busca datos de contacto de una empresa por nombre vía Google Maps
    sin guardar nada. Útil para mostrar contacto en la tabla antes de guardar.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.buscar_contacto_preview(nombre)

# ── Enriquecer prospecto ──────────────────────────────────────────────────────

@router.post("/enriquecer/{prospect_id}")
async def enriquecer_prospecto(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Busca datos de contacto para un prospecto ya guardado.
    Primero intenta Apollo; si no, consulta SII público.
    Marca el origen del dato (enrichment_source).
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    try:
        return await servicio.enriquecer_prospecto(prospect_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Prospectos guardados ──────────────────────────────────────────────────────

@router.get("/prospectos")
async def listar_prospectos(
    modulo: Optional[str] = None,
    solo_calificados: bool = False,
    score_minimo: float = 0,
    pagina: int = 1,
    por_pagina: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista los prospectos guardados de este módulo con filtros y paginación."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.obtener_prospectos(
        modulo=modulo,
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )


# ── Búsqueda batch (legado) ───────────────────────────────────────────────────

@router.post("/buscar")
async def buscar_y_guardar(
    data: dict,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Busca y guarda todo (flujo batch). Usar /preview + /guardar para flujo interactivo."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    tipo = data.get("tipo", "licitador_b")
    filtros = {k: v for k, v in data.items() if k in ("region", "tipo_licitacion", "fecha_desde", "fecha_hasta") and v}
    contexto = {"producto": data.get("producto", ""), "sector": data.get("sector", ""), "rubro": data.get("rubro", "")}

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.buscar_y_guardar(tipo=tipo, contexto_cliente=contexto, filtros=filtros, calificar=data.get("calificar", True))


# ── Schemas ──────────────────────────────────────────────────────────────────

class BuscarRequest(BaseModel):
    tipo: str = "licitador_b"          # "licitador_a" o "licitador_b"
    calificar: bool = True              # Usar Claude para calificar
    # Filtros opcionales
    region: Optional[str] = None
    categoria: Optional[str] = None
    # Contexto del cliente (para que Claude entienda qué busca)
    producto: Optional[str] = None     # Ej: "arriendo de maquinaria"
    sector: Optional[str] = None       # Ej: "construcción"
    rubro: Optional[str] = None        # Para Licitador A
    experiencia: Optional[str] = None  # Para Licitador A


class ProspectosQuery(BaseModel):
    modulo: Optional[str] = None
    solo_calificados: bool = False
    score_minimo: float = 0
    pagina: int = 1
    por_pagina: int = 50


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/buscar")
async def buscar_licitaciones(
    data: BuscarRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Lanza una búsqueda en Mercado Público y guarda los prospectos.

    - tipo = "licitador_b" → busca empresas que ganaron licitaciones
    - tipo = "licitador_a" → busca licitaciones abiertas para ganar
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)

    filtros = {}
    if data.region:
        filtros["region"] = data.region
    if data.categoria:
        filtros["categoria"] = data.categoria

    contexto_cliente = {
        "producto": data.producto or "",
        "sector": data.sector or "",
        "rubro": data.rubro or "",
        "experiencia": data.experiencia or "",
    }

    resultado = await servicio.buscar_y_guardar(
        tipo=data.tipo,
        contexto_cliente=contexto_cliente,
        filtros=filtros,
        calificar=data.calificar,
    )
    return resultado


@router.get("/prospectos")
async def listar_prospectos(
    modulo: Optional[str] = None,
    solo_calificados: bool = False,
    score_minimo: float = 0,
    pagina: int = 1,
    por_pagina: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista los prospectos del tenant con filtros opcionales."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.obtener_prospectos(
        modulo=modulo,
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )
