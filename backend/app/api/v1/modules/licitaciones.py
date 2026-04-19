"""
Endpoints del módulo Licitaciones.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import asyncio
import uuid

from app.core.database import get_db, SessionLocal
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.services.licitaciones_service import LicitacionesService
from app.modules.licitaciones.client import MercadoPublicoClient
from app.agents.licitaciones_agent import LicitacionesAgent

router = APIRouter(prefix="/modules/licitaciones", tags=["licitaciones"])

# ── Job store en memoria para análisis en background ─────────────────────────
# { job_id: { "status": "pending|done|error", "result": {...}, "error": str } }
_analysis_jobs: dict = {}


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


class NotasRequest(BaseModel):
    notes: Optional[str] = None


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




class AsistentePerfilRequest(BaseModel):
    campo: str  # "descripcion" | "proyectos" | "diferenciadores"
    rubros: list[str] = []
    regiones: list[str] = []
    descripcion_actual: Optional[str] = None
    diferenciadores_actuales: Optional[str] = None


@router.post("/asistente-perfil")
async def asistente_perfil(
    data: AsistentePerfilRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Genera con Claude Haiku un borrador para los campos difíciles del perfil empresa:
    descripcion, proyectos_anteriores o diferenciadores.
    Rápido y barato — el usuario lo revisa y ajusta.
    """
    rubros_str = ", ".join(data.rubros) if data.rubros else "servicios generales"
    regiones_str = ", ".join(data.regiones) if data.regiones else "Chile"

    if data.campo == "descripcion":
        prompt = f"""Redacta una descripción profesional de empresa para el perfil de un proveedor de licitaciones públicas chilenas.

Rubros: {rubros_str}
Regiones de operación: {regiones_str}
{f"Diferenciadores mencionados: {data.diferenciadores_actuales}" if data.diferenciadores_actuales else ""}

La descripción debe:
- Tener entre 60-100 palabras
- Mencionar el rubro principal, la experiencia y las regiones
- Sonar profesional pero natural, en primera persona plural ("Somos...", "Contamos con...")
- Incluir un diferenciador si se proporcionó
- Estar lista para ser usada tal cual en una propuesta técnica

Responde SOLO con el texto de la descripción, sin comillas ni explicaciones."""

    elif data.campo == "proyectos":
        prompt = f"""Genera 3 ejemplos de proyectos anteriores ficticios pero realistas para una empresa que trabaja en: {rubros_str}
Regiones: {regiones_str}

Formato requerido (una línea por proyecto):
- [Tipo de servicio] para [Tipo de organismo] ([Año]) — [resultado o alcance breve]

Ejemplos del formato correcto:
- Aseo y mantención para Hospital Regional de Biobío (2023) — contrato de 12 meses, 15 personas
- Suministro de insumos para Municipalidad de Santiago (2022) — $45M adjudicado

Genera exactamente 3 líneas. Sin encabezados. Sin explicaciones. Solo los 3 proyectos."""

    elif data.campo == "diferenciadores":
        prompt = f"""Sugiere 3-4 diferenciadores competitivos concretos para una empresa proveedora de licitaciones públicas en: {rubros_str}
{f"Descripción actual: {data.descripcion_actual}" if data.descripcion_actual else ""}

Los diferenciadores deben:
- Ser específicos y verificables (no genéricos como "calidad" o "compromiso")
- Relevantes para organismos públicos (municipios, hospitales, ministerios)
- Cortos: máx 12 palabras cada uno

Formato: una línea por diferenciador, empezando con verbo o sustantivo.
Sin numeración. Sin explicaciones. Solo las líneas."""

    else:
        raise HTTPException(status_code=422, detail="campo inválido")

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id or "")
    try:
        texto = await asyncio.to_thread(
            agent._call_claude, prompt, "claude-haiku-4-5-20251001", 400
        )
        return {"texto": texto.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar: {str(e)}")


# ── Búsqueda con IA (lenguaje natural) ───────────────────────────────────────

class BusquedaIARequest(BaseModel):
    consulta: str  # "quiero limpiar hospitales en Santiago"
    pagina: int = 1
    tipo: str = "licitador_a"  # licitador_a = abiertas (para ganar), licitador_b = adjudicadas


class PropuestaRequest(BaseModel):
    instrucciones_extra: Optional[str] = None  # instrucciones adicionales del usuario


class EstadoPostulacionRequest(BaseModel):
    estado: str  # en_preparacion | postulada | evaluando | ganada | perdida | None


# ── Actualizar estado de postulación ─────────────────────────────────────────

ESTADOS_VALIDOS = {"en_preparacion", "postulada", "evaluando", "ganada", "perdida"}

@router.patch("/prospectos/{prospect_id}/estado")
async def actualizar_estado_postulacion(
    prospect_id: str,
    data: EstadoPostulacionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualiza el estado de postulación de una licitación guardada."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    if data.estado and data.estado not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Estado inválido. Válidos: {ESTADOS_VALIDOS}")

    from app.models.prospect import Prospect as ProspectModel
    prospect = db.query(ProspectModel).filter(
        ProspectModel.id == prospect_id,
        ProspectModel.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    prospect.postulacion_estado = data.estado or None
    db.commit()
    return {"prospect_id": prospect_id, "postulacion_estado": prospect.postulacion_estado}


@router.patch("/prospectos/{prospect_id}/notas")
async def actualizar_notas(
    prospect_id: str,
    data: NotasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Guarda notas libres en una postulación."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    from app.models.prospect import Prospect as ProspectModel
    prospect = db.query(ProspectModel).filter(
        ProspectModel.id == prospect_id,
        ProspectModel.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    prospect.notes = data.notes
    db.commit()
    return {"prospect_id": prospect_id, "notes": prospect.notes}


@router.delete("/prospectos/{prospect_id}")
async def eliminar_postulacion(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina una postulación guardada."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    from app.models.prospect import Prospect as ProspectModel
    prospect = db.query(ProspectModel).filter(
        ProspectModel.id == prospect_id,
        ProspectModel.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    db.delete(prospect)
    db.commit()
    return {"ok": True, "prospect_id": prospect_id}


# ── Análisis en background con polling ───────────────────────────────────────

async def _run_analysis_job(job_id: str, prospect_id: str, tenant_id: str):
    """Corre el análisis en background y guarda resultado en _analysis_jobs."""
    try:
        db = SessionLocal()
        agent = LicitacionesAgent(db=db, tenant_id=tenant_id)
        result = await asyncio.wait_for(agent.analizar_bases(prospect_id), timeout=120.0)
        _analysis_jobs[job_id] = {"status": "done", "result": result}
        db.close()
    except asyncio.TimeoutError:
        _analysis_jobs[job_id] = {"status": "error", "error": "El análisis tardó demasiado. Intenta de nuevo."}
    except Exception as e:
        _analysis_jobs[job_id] = {"status": "error", "error": str(e)}


@router.post("/analizar/{prospect_id}/start")
async def iniciar_analisis(
    prospect_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inicia análisis en background. Devuelve job_id para hacer polling."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    job_id = str(uuid.uuid4())
    _analysis_jobs[job_id] = {"status": "pending"}
    background_tasks.add_task(_run_analysis_job, job_id, prospect_id, current_user.tenant_id)
    return {"job_id": job_id, "status": "pending"}


@router.get("/analizar/job/{job_id}")
async def estado_analisis(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Consulta el estado de un job de análisis. Hacer polling cada 3s."""
    job = _analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job


@router.post("/busqueda-ia")
async def busqueda_ia(
    data: BusquedaIARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Recibe una consulta en lenguaje natural, extrae filtros con Claude Haiku
    y ejecuta la búsqueda en Mercado Público.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    catalogo = MercadoPublicoClient().obtener_catalogo()
    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id)

    try:
        filtros_ia = await agent.busqueda_ia(data.consulta, catalogo)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al interpretar la consulta: {str(e)}")

    # Construir filtros para la búsqueda
    from datetime import datetime, timedelta
    filtros: dict = {}
    if filtros_ia.get("keyword"):
        filtros["keyword"] = filtros_ia["keyword"]
    if filtros_ia.get("region"):
        filtros["region"] = str(filtros_ia["region"])
    dias = int(filtros_ia.get("fecha_periodo_dias") or 30)
    filtros["fecha_desde"] = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d")

    try:
        servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
        resultado = await servicio.buscar_preview(tipo=data.tipo, filtros=filtros, pagina=data.pagina)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar: {str(e)}")

    return {
        "filtros_extraidos": {
            "keyword": filtros_ia.get("keyword"),
            "region": filtros_ia.get("region"),
            "resumen": filtros_ia.get("resumen", ""),
        },
        "resultado": resultado,
    }


@router.post("/analizar/{prospect_id}")
async def analizar_bases(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analiza las bases técnicas de una licitación guardada.
    1. Descarga PDFs de bases desde Mercado Público.
    2. Claude Sonnet compara requisitos vs perfil de empresa.
    3. Devuelve: score, checklist de requisitos, alertas y propuesta adaptada.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id)
    try:
        return await asyncio.wait_for(agent.analizar_bases(prospect_id), timeout=90.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="El análisis tardó demasiado. Intenta de nuevo.")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar bases: {str(e)}")


@router.post("/propuesta/{prospect_id}")
async def generar_propuesta(    prospect_id: str,
    data: PropuestaRequest = PropuestaRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Genera una propuesta técnica para una licitación guardada usando Claude Sonnet.
    Usa el perfil de empresa (niche_config) + datos del prospecto.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id)
    try:
        propuesta_texto = await agent.generar_propuesta(prospect_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar propuesta: {str(e)}")

    # Recuperar el prospect para devolver metadata
    from app.models.prospect import Prospect as ProspectModel
    prospect = db.query(ProspectModel).filter(ProspectModel.id == prospect_id).first()

    return {
        "prospect_id": prospect_id,
        "licitacion_nombre": prospect.licitacion_nombre if prospect else None,
        "licitacion_codigo": prospect.licitacion_codigo if prospect else None,
        "organismo": prospect.licitacion_organismo if prospect else None,
        "propuesta": propuesta_texto,
    }


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


