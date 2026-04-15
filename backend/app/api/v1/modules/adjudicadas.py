"""
Endpoints del módulo Adjudicadas.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.middleware import get_current_user
from app.models.user import User
from app.models.tenant import TenantModule, ModuleType
from app.services.adjudicadas_service import AdjudicadasService
from app.modules.licitaciones.client import MercadoPublicoClient

router = APIRouter(prefix="/modules/adjudicadas", tags=["adjudicadas"])


class MoverEtapaRequest(BaseModel):
    etapa_id: str


class GuardarContactoBody(BaseModel):
    contact_name: Optional[str] = None
    email:        Optional[str] = None
    phone:        Optional[str] = None
    whatsapp:     Optional[str] = None


@router.get("/catalogos")
async def catalogos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    catalogo = MercadoPublicoClient().obtener_catalogo()
    # Filtrar rubros según configuración del tenant
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas,
    ).first()
    rubros_habilitados = ((tm.niche_config or {}).get("rubros_habilitados") if tm else None)
    if rubros_habilitados:
        catalogo["rubros"] = [r for r in catalogo["rubros"] if r in rubros_habilitados]
    return catalogo


@router.get("/rubros-config")
async def get_rubros_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve los rubros habilitados para este tenant (vacío = todos)."""
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas,
    ).first()
    rubros_habilitados = ((tm.niche_config or {}).get("rubros_habilitados") if tm else None)
    todos = MercadoPublicoClient().obtener_catalogo()["rubros"]
    return {
        "todos": todos,
        "habilitados": rubros_habilitados if rubros_habilitados is not None else todos,
        "personalizado": rubros_habilitados is not None,
    }


class RubrosConfigRequest(BaseModel):
    rubros: list[str]
    resetear: bool = False  # True = volver a mostrar todos


@router.put("/rubros-config")
async def save_rubros_config(
    body: RubrosConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Guarda los rubros habilitados para este tenant."""
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas,
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Módulo adjudicadas no activado")
    config = tm.niche_config or {}
    if body.resetear:
        config.pop("rubros_habilitados", None)
    else:
        config["rubros_habilitados"] = body.rubros
    tm.niche_config = config
    db.commit()
    return {"ok": True, "rubros_guardados": len(body.rubros) if not body.resetear else None}


@router.get("/preview")
async def preview(
    pestana: str = Query("adjudicadas", description="adjudicadas | por_adjudicarse"),
    region: Optional[str] = Query(None),
    periodo: int = Query(30, description="Días hacia atrás: 7, 30, 90, 180"),
    monto_minimo: float = Query(0),
    keyword: Optional[str] = Query(None),
    pagina: int = Query(1, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    filtros = {
        "region": region,
        "periodo": periodo,
        "monto_minimo": monto_minimo,
        "keyword": keyword,
    }
    if pestana == "por_adjudicarse":
        result = svc.get_por_adjudicarse_cached(filtros, pagina)
        if result["total"] == 0:
            live = await svc.buscar_por_adjudicarse_live(filtros, pagina)
            live["_cache_empty"] = True
            return live
        return result

    if pestana in ("cerrada", "desierta", "revocada", "suspendida"):
        return await svc.buscar_por_estado_live(pestana, filtros, pagina)

    return await svc.buscar_adjudicadas(filtros, pagina)


@router.post("/guardar/{codigo}")
async def guardar(
    codigo: str,
    body: GuardarContactoBody = GuardarContactoBody(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    contacto = {
        "contact_name": body.contact_name,
        "email":        body.email,
        "phone":        body.phone,
        "whatsapp":     body.whatsapp,
    }
    prospect = await svc.guardar(codigo, contacto=contacto)
    return {"ok": True, "prospect_id": prospect.id}


@router.get("/contacto")
async def buscar_contacto(
    nombre: str = Query(..., description="Nombre de la empresa adjudicada"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Busca datos de contacto de la empresa en Apollo.io"""
    svc = AdjudicadasService(db, current_user.tenant_id)
    return await svc.buscar_contacto(nombre)


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


@router.post("/etapas/reset")
async def reset_etapas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reinicia las etapas del pipeline a los valores por defecto."""
    svc = AdjudicadasService(db, current_user.tenant_id)
    svc.reset_etapas()
    return {"ok": True}


@router.post("/sync-cache")
async def sync_cache_ahora(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sincronización rápida del caché de 'por adjudicarse' (últimos 7 días). Sin Celery."""
    from datetime import datetime as dt, timedelta
    from app.models.licitacion_cache import LicitacionCache
    import asyncio

    client = AdjudicadasService(db, current_user.tenant_id).client
    ayer = dt.now() - timedelta(days=1)
    fechas = [(ayer - timedelta(days=i)).strftime("%d%m%Y") for i in range(7)]

    sem = asyncio.Semaphore(8)

    async def fetch_dia(fecha: str):
        async with sem:
            try:
                resp = await client.buscar_licitaciones(estado="publicada", fecha=fecha)
                return resp.get("Listado", [])
            except Exception:
                return []

    listas = await asyncio.gather(*[fetch_dia(f) for f in fechas])

    vistos: set = set()
    todos: list = []
    for lista in listas:
        for item in lista:
            cod = item.get("CodigoExterno")
            if cod and cod not in vistos:
                vistos.add(cod)
                todos.append(item)

    guardadas = 0
    for item in todos:
        try:
            cod = item.get("CodigoExterno", "")
            if not cod:
                continue
            nombre = item.get("Nombre", "")
            fecha_cierre_raw = item.get("FechaCierre") or item.get("FechaActoAperturaTecnica") or ""
            fecha_cierre = fecha_cierre_raw[:10] if fecha_cierre_raw else None
            organismo = (
                item.get("Nombre_Organismo")
                or item.get("NombreOrganismo")
                or item.get("CodigoOrganismo")
                or ""
            )

            existing = db.query(LicitacionCache).filter(LicitacionCache.codigo == cod).first()
            if existing:
                existing.nombre = nombre
                existing.estado = "publicada"
                if fecha_cierre:
                    existing.fecha_cierre = fecha_cierre
                existing.organismo = organismo
                existing.updated_at = dt.utcnow()
            else:
                entry = LicitacionCache(
                    codigo=cod,
                    nombre=nombre,
                    estado="publicada",
                    fecha_cierre=fecha_cierre,
                    organismo=organismo,
                )
                db.add(entry)
            guardadas += 1
        except Exception:
            continue

    db.commit()
    return {"ok": True, "guardadas": guardadas}


@router.post("/agente/correr")
async def correr_agente(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = AdjudicadasService(db, current_user.tenant_id)
    return await svc.correr_agente()


class ConfigRequest(BaseModel):
    contexto_vendedor: str


class PropuestaRequest(BaseModel):
    prospect_id: str
    formato: str  # "whatsapp" | "email" | "presupuesto"


@router.get("/config")
async def get_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas
    ).first()
    config = (tm.niche_config or {}) if tm else {}
    return {"contexto_vendedor": config.get("contexto_vendedor", "")}


@router.post("/config")
async def save_config(
    body: ConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Módulo no activado")
    config = tm.niche_config or {}
    config["contexto_vendedor"] = body.contexto_vendedor
    tm.niche_config = config
    db.commit()
    return {"ok": True}


@router.post("/propuesta")
async def generar_propuesta(
    body: PropuestaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tm = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module == ModuleType.adjudicadas
    ).first()
    contexto_juan = ((tm.niche_config or {}).get("contexto_vendedor", "")) if tm else ""
    if not contexto_juan:
        raise HTTPException(status_code=400, detail="Configura primero qué ofreces en Ajustes del módulo")

    svc = AdjudicadasService(db, current_user.tenant_id)
    return await svc.generar_propuesta(
        prospect_id=body.prospect_id,
        formato=body.formato,
        contexto_juan=contexto_juan,
    )
