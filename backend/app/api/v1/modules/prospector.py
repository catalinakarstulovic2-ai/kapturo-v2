"""
Endpoints del módulo Prospector.

Permite buscar prospectos desde Google Maps (directo), Apollo.io y Apify.
También expone operaciones sobre prospectos existentes: notas, alarmas,
exclusión, llevar al pipeline y generar mensajes con IA.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.services.prospector_service import ProspectorService

router = APIRouter(prefix="/modules/prospector", tags=["prospector"])


# ── Schemas de request ────────────────────────────────────────────────────────

class BuscarMapsDirectoRequest(BaseModel):
    query: str                               # Qué buscar, ej: "restaurantes"
    location: str                            # Ciudad/zona, ej: "Santiago"
    max_results: int = 40
    producto: Optional[str] = None
    nicho: Optional[str] = None


class BuscarApolloRequest(BaseModel):
    titles: List[str]
    locations: List[str]
    keywords: Optional[str] = None
    industry: Optional[str] = None
    calificar: bool = True
    producto: Optional[str] = None
    nicho: Optional[str] = None


class BuscarSocialRequest(BaseModel):
    keywords: List[str]
    location: Optional[str] = None
    calificar: bool = True
    producto: Optional[str] = None
    nicho: Optional[str] = None


class BuscarMapsRequest(BaseModel):
    query: str
    location: str
    calificar: bool = True
    producto: Optional[str] = None
    nicho: Optional[str] = None


class ActualizarNotasRequest(BaseModel):
    notas: str


class SetAlarmaRequest(BaseModel):
    fecha: str         # YYYY-MM-DD
    motivo: Optional[str] = ""


class GenerarMensajeRequest(BaseModel):
    nicho: Optional[str] = ""
    producto: Optional[str] = ""
    notas: Optional[str] = ""


# ── Búsqueda ─────────────────────────────────────────────────────────────────

@router.post("/maps-directo")
async def buscar_maps_directo(
    data: BuscarMapsDirectoRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Busca negocios en Google Maps usando la API de Places directamente.
    Detecta web_status (sin_web / solo_redes / tiene_web) y calcula score.
    No requiere Apify. Solo Google Maps API key.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    contexto_cliente = {
        "producto": data.producto or "",
        "nicho": data.nicho or "",
    }
    return await servicio.buscar_google_maps_directo(
        query=data.query,
        location=data.location,
        contexto_cliente=contexto_cliente,
        max_results=data.max_results,
    )


@router.post("/apollo")
async def buscar_apollo(
    data: BuscarApolloRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Busca prospectos en Apollo.io (requiere plan Pro en Apollo)."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    filtros = {"person_titles": data.titles, "person_locations": data.locations}
    if data.keywords:
        filtros["q_keywords"] = data.keywords

    return await servicio.buscar_apollo(
        filtros=filtros,
        contexto_cliente={"producto": data.producto or "", "nicho": data.nicho or ""},
        calificar=data.calificar,
    )


@router.post("/social")
async def buscar_social(
    data: BuscarSocialRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Scrapes Facebook Groups con Apify (requiere clave Apify válida)."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.buscar_apify_social(
        keywords=data.keywords,
        location=data.location,
        contexto_cliente={"producto": data.producto or "", "nicho": data.nicho or ""},
        calificar=data.calificar,
    )


@router.post("/maps")
async def buscar_maps_apify(
    data: BuscarMapsRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Scrapes Google Maps con Apify (requiere clave Apify válida). Usar /maps-directo en su lugar."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.buscar_apify_maps(
        query=data.query,
        location=data.location,
        contexto_cliente={"producto": data.producto or "", "nicho": data.nicho or ""},
        calificar=data.calificar,
    )


# ── Listado ───────────────────────────────────────────────────────────────────

@router.get("/prospectos")
async def listar_prospectos(
    modulo: Optional[str] = None,
    solo_calificados: bool = False,
    score_minimo: float = 0,
    incluir_excluidos: bool = False,
    pagina: int = 1,
    por_pagina: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista los prospectos del tenant con filtros opcionales."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.obtener_prospectos(
        modulo=modulo,
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        incluir_excluidos=incluir_excluidos,
        pagina=pagina,
        por_pagina=por_pagina,
    )


# ── Operaciones sobre un prospecto ───────────────────────────────────────────

@router.put("/prospectos/{prospect_id}/notas")
async def actualizar_notas(
    prospect_id: str,
    data: ActualizarNotasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualiza las notas manuales del prospecto y guarda historial."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    ok = servicio.actualizar_notas(prospect_id, data.notas)
    if not ok:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    return {"ok": True}


@router.put("/prospectos/{prospect_id}/alarma")
async def set_alarma(
    prospect_id: str,
    data: SetAlarmaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Establece o actualiza la alarma de seguimiento."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    ok = servicio.set_alarma(prospect_id, data.fecha, data.motivo or "")
    if not ok:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    return {"ok": True}


@router.post("/prospectos/{prospect_id}/excluir")
async def excluir_prospecto(
    prospect_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Marca el prospecto como excluido — no vuelve a aparecer en búsquedas."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    ok = servicio.excluir_prospecto(prospect_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    return {"ok": True}


@router.post("/prospectos/{prospect_id}/restaurar")
async def restaurar_prospecto(
    prospect_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Restaura un prospecto descartado — vuelve a aparecer en la lista."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    ok = servicio.restaurar_prospecto(prospect_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    return {"ok": True}


@router.post("/prospectos/{prospect_id}/pipeline")
async def llevar_pipeline(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Agrega el prospecto a la primera etapa del pipeline del tenant."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    ok = servicio.llevar_a_pipeline(prospect_id)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="No se pudo llevar al pipeline. ¿El pipeline tiene etapas?",
        )
    return {"ok": True}


@router.post("/prospectos/{prospect_id}/generar-mensaje")
async def generar_mensaje(
    prospect_id: str,
    data: GenerarMensajeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera un mensaje de primer contacto por WhatsApp usando Claude Haiku."""
    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    try:
        mensaje = await servicio.generar_mensaje_ia(
            prospect_id=prospect_id,
            nicho=data.nicho or "",
            producto=data.producto or "",
            notas=data.notas or "",
        )
        return {"mensaje": mensaje}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar mensaje: {str(e)}")



# ── Schemas de request ────────────────────────────────────────────────────────

class BuscarApolloRequest(BaseModel):
    titles: List[str]                          # Cargos a buscar, ej: ["CEO", "Gerente de Compras"]
    locations: List[str]                       # Ubicaciones, ej: ["Santiago, Chile"]
    keywords: Optional[str] = None            # Palabras clave adicionales
    industry: Optional[str] = None            # Industria/sector
    calificar: bool = True                    # Calificar con Claude
    producto: Optional[str] = None           # Qué vende el cliente
    nicho: Optional[str] = None             # Nicho del cliente, ej: "inmobiliaria"


class BuscarSocialRequest(BaseModel):
    keywords: List[str]                       # Términos de búsqueda en grupos de Facebook
    location: Optional[str] = None           # Ubicación para filtrar
    calificar: bool = True
    producto: Optional[str] = None
    nicho: Optional[str] = None


class BuscarMapsRequest(BaseModel):
    query: str                               # Qué buscar, ej: "constructoras"
    location: str                            # Ciudad/zona, ej: "Santiago"
    calificar: bool = True
    producto: Optional[str] = None
    nicho: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/apollo")
async def buscar_apollo(
    data: BuscarApolloRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Busca prospectos en Apollo.io por cargo, ubicación e industria.
    Apollo tiene más de 275 millones de contactos B2B.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)

    filtros = {
        "person_titles": data.titles,
        "person_locations": data.locations,
    }
    if data.keywords:
        filtros["q_keywords"] = data.keywords

    contexto_cliente = {
        "producto": data.producto or "",
        "nicho": data.nicho or "",
    }

    return await servicio.buscar_apollo(
        filtros=filtros,
        contexto_cliente=contexto_cliente,
        calificar=data.calificar,
    )


@router.post("/social")
async def buscar_social(
    data: BuscarSocialRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scrapes grupos de Facebook con Apify para encontrar prospectos.
    Útil para nichos donde la audiencia está en grupos de Facebook.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)

    contexto_cliente = {
        "producto": data.producto or "",
        "nicho": data.nicho or "",
    }

    return await servicio.buscar_apify_social(
        keywords=data.keywords,
        location=data.location,
        contexto_cliente=contexto_cliente,
        calificar=data.calificar,
    )


@router.post("/maps")
async def buscar_maps(
    data: BuscarMapsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scrapes Google Maps con Apify para encontrar negocios locales.
    Ideal para prospectar empresas por categoría y ubicación.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)

    contexto_cliente = {
        "producto": data.producto or "",
        "nicho": data.nicho or "",
    }

    return await servicio.buscar_apify_maps(
        query=data.query,
        location=data.location,
        contexto_cliente=contexto_cliente,
        calificar=data.calificar,
    )


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

    servicio = ProspectorService(db=db, tenant_id=current_user.tenant_id)
    return await servicio.obtener_prospectos(
        modulo=modulo,
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )
