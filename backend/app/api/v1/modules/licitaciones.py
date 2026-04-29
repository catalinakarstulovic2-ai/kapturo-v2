"""
Endpoints del módulo Licitaciones.
"""
import logging
import base64
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
import asyncio
import uuid
import json

from app.core.database import get_db, SessionLocal
from app.core.config import settings
from app.core.middleware import get_current_user, require_admin
from app.models.user import User
from app.models.tenant import TenantModule
from app.services.licitaciones_service import LicitacionesService
from app.modules.licitaciones.client import MercadoPublicoClient
from app.agents.licitaciones_agent import LicitacionesAgent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/modules/licitaciones", tags=["licitaciones"])

# ── Job store en memoria para análisis en background ─────────────────────────
# { job_id: { "status": "pending|done|error", "result": {...}, "error": str, "created_at": float } }
_analysis_jobs: dict = {}
_JOB_TTL_SECONDS = 3600  # limpiar jobs con más de 1 hora

def _cleanup_old_jobs():
    import time
    cutoff = time.time() - _JOB_TTL_SECONDS
    expired = [jid for jid, j in _analysis_jobs.items() if j.get("created_at", 0) < cutoff]
    for jid in expired:
        del _analysis_jobs[jid]


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
    tipo_doc: Optional[str] = None   # ej: "propuesta_tecnica" — si se envía, guarda en historial de docs IA
    label_doc: Optional[str] = None  # ej: "Propuesta Técnica Completa"


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


# ── Completitud del perfil ────────────────────────────────────────────────────

@router.get("/perfil/completitud")
async def perfil_completitud(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calcula qué tan completo está el perfil de empresa para poder buscar."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()

    cfg = (mod.niche_config or {}) if mod else {}

    CAMPOS = [
        ("razon_social",              "Razón social de tu empresa",    20, bool(cfg.get("razon_social"))),
        ("descripcion",               "Descripción de lo que haces",   25, bool(cfg.get("descripcion"))),
        ("rubros",                    "Al menos 1 rubro de trabajo",   25, bool(cfg.get("rubros"))),
        ("regiones",                  "Al menos 1 región donde operas",15, bool(cfg.get("regiones"))),
        ("inscrito_chile_proveedores","Estado en ChileProveedores",    15, cfg.get("inscrito_chile_proveedores") is not None),
    ]

    score = sum(peso for _, _, peso, ok in CAMPOS if ok)
    faltantes = [
        {"campo": campo, "label": label, "peso": peso}
        for campo, label, peso, ok in CAMPOS if not ok
    ]

    return {
        "score": score,
        "perfil_completo": score >= 80,
        "bloqueado": score < 80,
        "campos_faltantes": faltantes,
    }


# ── Sugerir rubros desde descripción libre ────────────────────────────────────

class SugerirRubrosRequest(BaseModel):
    descripcion: str


@router.post("/sugerir-rubros")
async def sugerir_rubros(
    data: SugerirRubrosRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Recibe la descripción de la empresa en texto libre y devuelve los rubros
    de Mercado Público que mejor corresponden, usando Claude Haiku.
    """
    catalogo = MercadoPublicoClient().obtener_catalogo()
    rubros_disponibles = catalogo.get("rubros", [])
    rubros_str = ", ".join(rubros_disponibles)

    prompt = f"""Eres un experto en licitaciones públicas chilenas de Mercado Público.

El usuario describió su empresa así: "{data.descripcion}"

Lista de rubros disponibles en el sistema (usa EXACTAMENTE estos nombres, sin inventar nuevos):
{rubros_str}

Selecciona los 1 a 4 rubros que mejor correspondan al giro de esta empresa.
Si la descripción menciona ciberseguridad, software, informática o tecnología → incluye "Tecnología" y/o "Informática" y/o "Software" según corresponda.
Si no hay suficiente información, devuelve al menos 1 rubro probable.

Responde SOLO con un JSON válido:
{{"rubros": ["rubro1", "rubro2"]}}

Solo el JSON, sin texto adicional."""

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id or "")
    try:
        raw = await asyncio.to_thread(
            agent._call_claude, prompt, "claude-haiku-4-5-20251001", 200
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1][4:] if parts[1].startswith("json") else parts[1]
        result = json.loads(cleaned.strip())
        rubros_lower = {r.lower(): r for r in rubros_disponibles}
        rubros_validos = [
            rubros_lower[r.lower()]
            for r in (result.get("rubros") or [])
            if r.lower() in rubros_lower
        ]
        return {"rubros": rubros_validos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sugerir rubros: {str(e)}")


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
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "busqueda_normal", resource_name=keyword or tipo)
    except Exception:
        pass

    # Obtener rubros y regiones del perfil del tenant para fit score
    rubros_perfil: list = []
    regiones_perfil: list = []
    try:
        from app.models.tenant import TenantModule
        mod = db.query(TenantModule).filter(
            TenantModule.tenant_id == current_user.tenant_id,
            TenantModule.module.in_(["licitaciones", "licitador"])
        ).first()
        if mod and mod.niche_config:
            rubros_perfil = mod.niche_config.get('rubros') or []
            regiones_perfil = mod.niche_config.get('regiones') or []
    except Exception:
        pass

    try:
        servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
        return await asyncio.wait_for(
            servicio.buscar_preview(tipo=tipo, filtros=filtros, pagina=pagina,
                                    rubros_perfil=rubros_perfil, regiones_perfil=regiones_perfil),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail="La búsqueda tardó demasiado. Intenta con un rango de fechas más corto o agrega un filtro de región.",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al buscar en Mercado Público: {str(e)}")


# ── Guardar licitación seleccionada ──────────────────────────────────────────

@router.post("/guardar")
async def guardar_licitacion(
    data: GuardarRequest,
    current_user: User = Depends(get_current_user),
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

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "guardar_licitacion", resource_id=data.codigo)
    except Exception:
        pass

    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    try:
        return await servicio.guardar_licitacion(
            tipo=data.tipo,
            codigo=data.codigo,
            contexto_cliente=contexto,
            calificar=data.calificar,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        import traceback
        logger.error("Error al guardar licitación %s: %s\n%s", data.codigo, e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(e)}")

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


@router.get("/prospectos/{prospect_id}")
async def obtener_prospecto(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve un prospecto individual por ID."""
    from app.models.prospect import Prospect as ProspectModel
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    p = db.query(ProspectModel).filter(
        ProspectModel.id == prospect_id,
        ProspectModel.tenant_id == current_user.tenant_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    servicio = LicitacionesService(db=db, tenant_id=current_user.tenant_id)
    return servicio._serializar(p)


# ── Datos de postulación ──────────────────────────────────────────────────────

class DatosPostulacionRequest(BaseModel):
    datos: dict


@router.post("/prospectos/{prospect_id}/datos-postulacion")
async def guardar_datos_postulacion(
    prospect_id: str,
    data: DatosPostulacionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Guarda datos adicionales específicos para preparar la postulación (paso 3 del flujo)."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    from app.models.prospect import Prospect as ProspectModel
    prospect = db.query(ProspectModel).filter(
        ProspectModel.id == prospect_id,
        ProspectModel.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")

    existentes = prospect.datos_postulacion or {}
    existentes.update(data.datos)
    prospect.datos_postulacion = existentes
    db.commit()

    return {"prospect_id": prospect_id, "datos_postulacion": prospect.datos_postulacion}


class AsistentePerfilRequest(BaseModel):
    campo: str
    rubros: list[str] = []
    regiones: list[str] = []
    descripcion_actual: Optional[str] = None
    diferenciadores_actuales: Optional[str] = None
    proyectos: Optional[str] = None
    certificaciones: Optional[str] = None
    rubros_disponibles: list[str] = []


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

    elif data.campo in ("proyectos", "proyectos_anteriores"):
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

    elif data.campo == "sugerir_rubros":
        rubros_lista = "\n".join(f"- {r}" for r in data.rubros_disponibles[:80]) if data.rubros_disponibles else ""
        prompt = f"""Analiza la descripción de esta empresa y sugiere los rubros más relevantes de la lista disponible.

Descripción: {data.descripcion_actual or "No especificada"}
Diferenciadores: {data.diferenciadores_actuales or "No especificados"}
Proyectos anteriores: {data.proyectos or "No especificados"}

Rubros disponibles:
{rubros_lista}

Responde SOLO con una lista de rubros separados por coma, exactamente como aparecen en la lista.
Máximo 8 rubros. Sin explicaciones."""

    elif data.campo == "resumen_perfil":
        prompt = f"""Genera un resumen ejecutivo breve del perfil de empresa para licitaciones públicas.

Empresa: {data.descripcion_actual or "Sin descripción"}
Rubros: {rubros_str}
Regiones: {regiones_str}
Proyectos anteriores: {data.proyectos or "No especificados"}
Certificaciones: {data.certificaciones or "Ninguna"}
Diferenciadores: {data.diferenciadores_actuales or "No especificados"}

El resumen debe:
- Tener máximo 3 oraciones
- Destacar fortalezas concretas
- Sonar profesional y directo
- Estar en tercera persona

Responde SOLO con el resumen, sin títulos ni explicaciones."""

    else:
        raise HTTPException(status_code=422, detail=f"campo inválido: {data.campo}")

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id or "")
    max_tokens = 600 if data.campo == "resumen_perfil" else 400
    try:
        texto = await asyncio.to_thread(
            agent._call_claude, prompt, "claude-haiku-4-5-20251001", max_tokens
        )
        texto = texto.strip()
        if data.campo == "sugerir_rubros":
            rubros = [r.strip().lower() for r in texto.split(",") if r.strip()]
            return {"texto": texto, "rubros": rubros}
        return {"texto": texto}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar: {str(e)}")


# ── Stats del módulo ─────────────────────────────────────────────────────────

@router.get("/stats")
async def licitaciones_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Contadores del módulo — evita cargar 200 prospectos en el frontend."""
    from app.models.prospect import Prospect
    from datetime import datetime, timedelta
    import re

    prospectos = db.query(
        Prospect.score,
        Prospect.licitacion_fecha_cierre,
        Prospect.postulacion_estado,
        Prospect.documentos_ia,
    ).filter(
        Prospect.tenant_id == current_user.tenant_id,
        Prospect.source_module.in_(["licitaciones", "licitador"]),
    ).all()

    ahora = datetime.now()
    proximos = 0
    for p in prospectos:
        if p.licitacion_fecha_cierre:
            try:
                m = re.search(r'(\d{2})/(\d{2})/(\d{4})', p.licitacion_fecha_cierre)
                if m:
                    fecha = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                    dias = (fecha - ahora).days
                    if 0 <= dias <= 7:
                        proximos += 1
            except Exception:
                pass

    estados_activos = {"postulada", "evaluando", "ganada"}

    return {
        "guardadas": len(prospectos),
        "analizadas": sum(1 for p in prospectos if (p.score or 0) > 0),
        "con_documentos": sum(1 for p in prospectos if p.documentos_ia),
        "postuladas": sum(1 for p in prospectos if p.postulacion_estado in estados_activos),
        "proximas_a_cerrar": proximos,
    }


# ── Documentos del perfil (CV empresa, certificados PDF, etc.) ────────────────

TIPOS_DOCUMENTOS_VALIDOS = {"cv_empresa", "certificaciones_pdf", "declaracion_jurada", "otros"}

@router.post("/documentos/{tipo}")
async def subir_documento_perfil(
    tipo: str,
    archivo: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sube un documento PDF al perfil de empresa (guardado en niche_config)."""
    if tipo not in TIPOS_DOCUMENTOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Tipo inválido. Válidos: {TIPOS_DOCUMENTOS_VALIDOS}")
    content = await archivo.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 3 MB")
    b64 = base64.b64encode(content).decode("utf-8")
    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo licitaciones no encontrado")
    from sqlalchemy.orm.attributes import flag_modified
    config = dict(modulo.niche_config or {})
    docs = dict(config.get("documentos", {}))
    docs[tipo] = {
        "nombre": archivo.filename,
        "mime": archivo.content_type or "application/octet-stream",
        "size": len(content),
        "base64": b64,
        "subido_at": datetime.now(timezone.utc).isoformat(),
    }
    config["documentos"] = docs
    modulo.niche_config = config
    flag_modified(modulo, "niche_config")
    db.commit()
    return {"ok": True, "nombre": archivo.filename, "size": len(content), "tipo": tipo}


@router.get("/documentos/{tipo}/download")
def descargar_documento_perfil(
    tipo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve el documento como base64 para descarga en el frontend."""
    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    docs = (modulo.niche_config or {}).get("documentos", {})
    doc = docs.get(tipo)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"nombre": doc["nombre"], "mime": doc["mime"], "base64": doc["base64"]}


@router.delete("/documentos/{tipo}")
def eliminar_documento_perfil(
    tipo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina un documento del perfil."""
    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()
    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    from sqlalchemy.orm.attributes import flag_modified
    config = dict(modulo.niche_config or {})
    docs = dict(config.get("documentos", {}))
    if tipo in docs:
        del docs[tipo]
        config["documentos"] = docs
        modulo.niche_config = config
        flag_modified(modulo, "niche_config")
        db.commit()
    return {"ok": True}



@router.post("/analizar-empresa-pdf")
async def analizar_empresa_pdf(
    archivo: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Recibe un PDF de la empresa (brochure, presentación, carpeta de servicios, etc.)
    y usa Claude para extraer automáticamente los campos del perfil.
    Devuelve los campos sugeridos para que el usuario los apruebe.
    """
    content = await archivo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 5 MB")

    # Extraer texto del PDF usando base64 + Claude vision o texto plano
    import base64 as _b64
    b64 = _b64.b64encode(content).decode("utf-8")

    import anthropic as _anthropic
    import json as _json

    prompt = """Analiza este documento PDF de una empresa y extrae la información relevante para completar su perfil de proveedor de licitaciones públicas chilenas.

Extrae y devuelve un JSON con estos campos (deja en null si no encuentras el dato):
{
  "razon_social": "Nombre legal de la empresa",
  "rut_empresa": "RUT si aparece",
  "descripcion": "Descripción de 60-100 palabras de qué hace la empresa",
  "rubros": ["lista", "de", "rubros", "del", "catálogo"],
  "regiones": ["lista de regiones de Chile donde opera"],
  "experiencia_anos": null,
  "proyectos_anteriores": "3 proyectos reales o representativos encontrados en el documento",
  "certificaciones": "certificaciones o acreditaciones mencionadas",
  "diferenciadores": "3-4 diferenciadores competitivos",
  "nombre_contacto": "nombre del representante o contacto principal",
  "cargo_contacto": "cargo",
  "correo": "email si aparece",
  "telefono": "teléfono si aparece",
  "sitio_web": "sitio web si aparece",
  "direccion": "dirección si aparece"
}

Para el campo "rubros", usa solo términos de esta lista: asesoría, auditoría, consultoría, contabilidad, gestión, legal, recursos humanos, administración, finanzas, marketing, comunicaciones, arquitectura, construcción, ingeniería, instalaciones eléctricas, obras civiles, pavimentación, sanitaria, topografía, diseño, proyectos, infraestructura, capacitación, educación, formación, equipamiento, insumos, maquinaria, mobiliario, vehículos, vestuario, materiales, herramientas, suministros, imprenta, señalética, agua, energía renovable, medioambiente, residuos, sustentabilidad, eficiencia energética, solar, reciclaje, enfermería, equipos médicos, farmacia, laboratorio, medicina, psicología, salud, dental, kinesiología, nutrición, alimentación, aseo, catering, logística, mantención, seguridad, transporte, vigilancia, jardinería, lavandería, casino, limpieza, ciberseguridad, informática, inteligencia artificial, software, soporte técnico, tecnología, telecomunicaciones, desarrollo web, aplicaciones, cloud, datos, redes, sistemas, automatización, erp, crm.

Responde SOLO con el JSON, sin explicaciones."""

    try:
        client = _anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        def _call():
            return client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=1500,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": archivo.content_type or "application/pdf",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }],
            )

        respuesta = await asyncio.to_thread(_call)
        texto = respuesta.content[0].text.strip()
        if texto.startswith("```"):
            texto = texto.split("```")[1]
            if texto.startswith("json"):
                texto = texto[4:]
        campos = _json.loads(texto.strip())
        return {"campos": campos, "nombre_archivo": archivo.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar el PDF: {str(e)}")


class BusquedaIARequest(BaseModel):
    consulta: str  # "quiero limpiar hospitales en Santiago"
    pagina: int = 1
    tipo: str = "licitador_a"  # licitador_a = abiertas (para ganar), licitador_b = adjudicadas


class PropuestaRequest(BaseModel):
    tipo_documento: Optional[str] = None       # propuesta_tecnica | oferta_economica | carta_organismo | carta_seguimiento
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

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "cambiar_estado", resource_id=prospect_id, resource_name=data.estado)
    except Exception:
        pass

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

    import json as _json
    from datetime import datetime as _dt

    # Si viene con metadatos de documento IA, append a notes_history
    tipo_doc = getattr(data, 'tipo_doc', None)
    label_doc = getattr(data, 'label_doc', None)
    if tipo_doc:
        # Cargar historial actual
        try:
            historial = _json.loads(prospect.notes_history or '[]')
        except Exception:
            historial = []
        # Agregar nuevo doc (reemplaza si ya existe el mismo tipo)
        historial = [h for h in historial if not (isinstance(h, dict) and h.get('tipo') == tipo_doc)]
        historial.append({
            'source': 'ia',
            'tipo': tipo_doc,
            'label': label_doc or tipo_doc,
            'texto': data.notes,
            'created_at': _dt.utcnow().isoformat(),
        })
        prospect.notes_history = _json.dumps(historial, ensure_ascii=False)
    else:
        # notas manuales — comportamiento original
        prospect.notes = data.notes

    db.commit()

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "agregar_nota", resource_id=prospect_id)
    except Exception:
        pass

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

    import time
    _cleanup_old_jobs()
    job_id = str(uuid.uuid4())
    _analysis_jobs[job_id] = {"status": "pending", "created_at": time.time()}
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

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "busqueda_ia", resource_name=data.consulta[:100] if data.consulta else None)
    except Exception:
        pass

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
            "advertencia": filtros_ia.get("advertencia"),
            "sugerencia": filtros_ia.get("sugerencia"),
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

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "analizar_bases", resource_id=prospect_id)
    except Exception:
        pass

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

    try:
        from app.services.activity_service import log_activity
        log_activity(db, current_user, "generar_propuesta_tecnica", resource_id=prospect_id)
    except Exception:
        pass

    # Mapa de tipos del wizard → tipos del agente
    TIPO_MAP = {
        # Sobre 2 – Técnico
        "propuesta_tecnica":  "propuesta_tecnica",   # análisis completo con bases reales
        "metodologia":        "metodologia",
        "cv_empresa":         "curriculum",
        "cv_equipo":          "cv_equipo",
        "carta_gantt":        "carta_gantt",
        # Sobre 3 – Económico
        "oferta_economica":   "detalle_costos",
        # Comunicaciones
        "carta_presentacion": "carta_presentacion",
        "carta_seguimiento":  "carta_seguimiento",
        # legado
        "carta_organismo":    "carta_presentacion",
    }

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id)
    tipo_backend = TIPO_MAP.get(data.tipo_documento or "", "propuesta_tecnica")
    try:
        if tipo_backend == "propuesta_tecnica":
            propuesta_texto = await agent.generar_propuesta(
                prospect_id,
                instrucciones_extra=data.instrucciones_extra,
            )
        else:
            propuesta_texto = await agent.generar_documento(
                prospect_id,
                tipo_documento=tipo_backend,
                instrucciones_extra=data.instrucciones_extra,
            )
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


# ── Generar documento específico ─────────────────────────────────────────────

class GenerarDocumentoRequest(BaseModel):
    tipo_documento: str   # metodologia | curriculum | declaracion | cv_equipo | detalle_costos | carta_presentacion


@router.post("/generar-documento/{prospect_id}")
async def generar_documento(
    prospect_id: str,
    data: GenerarDocumentoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Genera un documento específico para la postulación:
    metodologia, curriculum, declaracion, cv_equipo, detalle_costos, carta_presentacion.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    TIPOS_VALIDOS = ["metodologia", "curriculum", "declaracion", "cv_equipo", "detalle_costos", "carta_presentacion"]
    if data.tipo_documento not in TIPOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"tipo_documento inválido. Válidos: {TIPOS_VALIDOS}")

    agent = LicitacionesAgent(db=db, tenant_id=current_user.tenant_id)
    try:
        texto = await agent.generar_documento(prospect_id, data.tipo_documento)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar documento: {str(e)}")

    return {"texto": texto, "tipo": data.tipo_documento}


# ── Archivos de contexto para IA ──────────────────────────────────────────────

@router.get("/archivos-contexto")
async def listar_archivos_contexto(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista los archivos de contexto subidos por el tenant para alimentar la IA."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()

    if not modulo or not modulo.niche_config:
        return {"archivos": []}

    archivos = modulo.niche_config.get("archivos_contexto") or []
    # Devolver sin el texto completo para ahorrar payload
    return {"archivos": [
        {"nombre": a["nombre"], "tamaño_chars": len(a.get("texto", "")), "fecha": a.get("fecha", "")}
        for a in archivos
    ]}


@router.post("/archivos-contexto")
async def subir_archivo_contexto(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: bytes = None,
    nombre: str = None,
    texto: str = None,
):
    """
    Guarda texto extraído de un archivo para usar como contexto en generación de propuestas.
    El frontend extrae el texto y lo envía directamente (como JSON).
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")
    raise HTTPException(status_code=422, detail="Usa el endpoint JSON /archivos-contexto/texto")


class ArchivoTextoRequest(BaseModel):
    nombre: str
    texto: str   # texto ya extraído del archivo (máx 15000 chars)


@router.post("/archivos-contexto/texto")
async def guardar_texto_contexto(
    data: ArchivoTextoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Guarda el texto de un documento como contexto para la IA.
    El frontend extrae el texto del PDF/txt/docx y lo envía aquí.
    Se almacena en niche_config.archivos_contexto del módulo licitaciones.
    """
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    if not data.nombre.strip() or not data.texto.strip():
        raise HTTPException(status_code=422, detail="nombre y texto son requeridos")

    texto_truncado = data.texto.strip()[:15000]

    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()

    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo licitaciones no configurado")

    niche = dict(modulo.niche_config or {})
    archivos = list(niche.get("archivos_contexto") or [])

    # Reemplazar si ya existe con el mismo nombre
    archivos = [a for a in archivos if a["nombre"] != data.nombre]
    archivos.append({
        "nombre": data.nombre,
        "texto": texto_truncado,
        "fecha": datetime.utcnow().strftime("%Y-%m-%d"),
    })

    # Máximo 10 archivos
    if len(archivos) > 10:
        archivos = archivos[-10:]

    niche["archivos_contexto"] = archivos
    modulo.niche_config = niche
    db.add(modulo)
    db.commit()

    return {"ok": True, "nombre": data.nombre, "tamaño_chars": len(texto_truncado)}


@router.delete("/archivos-contexto/{nombre_archivo}")
async def eliminar_archivo_contexto(
    nombre_archivo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina un archivo de contexto del módulo licitaciones."""
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="Usuario sin tenant asignado")

    modulo = db.query(TenantModule).filter(
        TenantModule.tenant_id == current_user.tenant_id,
        TenantModule.module.in_(["licitaciones", "licitador"]),
    ).first()

    if not modulo:
        raise HTTPException(status_code=404, detail="Módulo no encontrado")

    niche = dict(modulo.niche_config or {})
    before = len(niche.get("archivos_contexto") or [])
    niche["archivos_contexto"] = [
        a for a in (niche.get("archivos_contexto") or []) if a["nombre"] != nombre_archivo
    ]
    modulo.niche_config = niche
    db.add(modulo)
    db.commit()

    if len(niche["archivos_contexto"]) == before:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    return {"ok": True}


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


