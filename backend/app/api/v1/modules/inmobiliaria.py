"""
Endpoints REST del módulo Inmobiliaria.

POST /api/v1/inmobiliaria/buscar          → lanza búsqueda en background (Celery)
GET  /api/v1/inmobiliaria/buscar/{job_id} → estado del job
GET  /api/v1/inmobiliaria/prospectos      → lista leads del módulo con filtros
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.middleware import get_current_user, require_admin
from app.services.prospector_service import ProspectorService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])


@router.post("/buscar")
async def buscar_prospectos(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Lanza búsqueda en background vía Celery.
    Retorna inmediatamente con job_id para hacer polling.
    Cada run procesa un batch rotado de fuentes (anti-ban).
    """
    import asyncio
    from app.models.tenant import TenantModule
    from app.core.database import SessionLocal
    from sqlalchemy.orm.attributes import flag_modified
    from datetime import datetime, timezone

    tenant_id = str(current_user.tenant_id)

    # Marcar búsqueda en curso en BD
    def _set_buscando(en_curso: bool):
        _db = SessionLocal()
        try:
            mod = _db.query(TenantModule).filter(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module == "inmobiliaria",
            ).first()
            if mod:
                cfg = dict(mod.config or {})
                cfg["buscando"] = en_curso
                cfg["buscando_desde"] = datetime.now(timezone.utc).isoformat() if en_curso else None
                mod.config = cfg
                flag_modified(mod, "config")
                _db.commit()
        finally:
            _db.close()

    # Siempre usar asyncio — no hay worker de Celery en Railway
    from app.services.inmobiliaria_service import InmobiliariaService

    _set_buscando(True)

    async def _run_background():
        bg_db = SessionLocal()
        try:
            service = InmobiliariaService(db=bg_db, tenant_id=tenant_id)
            # Solo TikTok — el único actor confiable en plan STARTER (<20s)
            resultados = await asyncio.gather(
                service.buscar_fuentes_rapido(),
                return_exceptions=True,
            )
            for r in resultados:
                if isinstance(r, Exception):
                    logger.warning(f"Un pipeline falló (tenant {tenant_id}): {r}")
                else:
                    logger.info(f"Pipeline terminado (tenant {tenant_id}): {r}")
        except Exception as e:
            logger.error(f"Búsqueda background falló (tenant {tenant_id}): {e}", exc_info=True)
        finally:
            bg_db.close()
            _set_buscando(False)

    asyncio.create_task(_run_background())
    return {"ok": True, "job_id": None, "resultado": None, "mensaje": "Búsqueda iniciada en background."}


@router.get("/buscar/estado")
async def estado_busqueda_general(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Devuelve si hay una búsqueda en curso para este tenant."""
    from app.models.tenant import TenantModule
    from datetime import datetime, timezone, timedelta
    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == str(current_user.tenant_id),
        TenantModule.module == "inmobiliaria",
    ).first()
    if not mod:
        return {"buscando": False}
    cfg = mod.config or {}
    buscando = cfg.get("buscando", False)
    # Auto-expirar si lleva más de 10 minutos (por si falló sin limpiar)
    if buscando and cfg.get("buscando_desde"):
        try:
            desde = datetime.fromisoformat(cfg["buscando_desde"])
            if datetime.now(timezone.utc) - desde > timedelta(minutes=10):
                buscando = False
        except Exception:
            buscando = False
    return {"buscando": buscando}


@router.get("/buscar/{job_id}")
async def estado_busqueda(
    job_id: str,
    current_user=Depends(require_admin),
):
    """
    Consulta el estado de un job de búsqueda.
    Estados posibles: PENDING | STARTED | SUCCESS | FAILURE
    """
    try:
        from celery.result import AsyncResult
        from workers.celery_app import app as celery_app
        result = AsyncResult(job_id, app=celery_app)
        estado = result.state
        if estado == "SUCCESS":
            return {"ok": True, "estado": "SUCCESS", "resultado": result.result}
        elif estado == "FAILURE":
            return {"ok": False, "estado": "FAILURE", "error": str(result.result)}
        else:
            return {"ok": True, "estado": estado, "resultado": None}
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
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    result = await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_calificados=solo_calificados,
        score_minimo=score_minimo,
        pagina=pagina,
        por_pagina=por_pagina,
    )
    for p in result.get("prospectos", []):
        p["fuente_inmobiliaria"] = p.get("signal_text") or ""
    return result


@router.post("/buscar-empresas")
async def buscar_empresas(
    ubicacion: str = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Busca empresas del nicho via Google Maps + Hunter.io + Claude.
    No usa Celery — Google Maps es rápido, responde directo.
    """
    from app.services.inmobiliaria_service import InmobiliariaService
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.ejecutar_busqueda(ubicacion=ubicacion)
        return {"ok": True, "resultado": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/buscar-linkedin")
async def buscar_linkedin(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Busca perfiles LinkedIn según las queries configuradas en niche_config.
    Califica cada perfil con Claude y guarda los que superen el umbral.
    """
    from app.services.inmobiliaria_service import InmobiliariaService
    try:
        service = InmobiliariaService(db=db, tenant_id=str(current_user.tenant_id))
        resultado = await service.buscar_linkedin_leads()
        return {"ok": True, "resultado": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diagnostico")
async def diagnostico_apify(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Prueba UNA llamada Apify (primer hashtag de Instagram del niche_config)
    y devuelve el resultado crudo — para debuggear sin guardar nada.
    """
    from app.models.tenant import TenantModule
    from app.modules.inmobiliaria.social_comments_client import SocialCommentsClient

    mod = db.query(TenantModule).filter(
        TenantModule.tenant_id == str(current_user.tenant_id),
        TenantModule.module == "inmobiliaria",
    ).first()
    if not mod:
        return {"error": "Módulo inmobiliaria no encontrado"}

    cfg = mod.niche_config or {}
    hashtags = cfg.get("hashtags_instagram", [])
    paginas = cfg.get("paginas_facebook", [])

    resultado = {
        "niche_config_keys": list(cfg.keys()),
        "total_hashtags_ig": len(hashtags),
        "total_cuentas_ig": len(cfg.get("cuentas_instagram", [])),
        "total_paginas_fb": len(paginas),
        "hashtags_tiktok": len(cfg.get("hashtags_tiktok", [])),
        "cuentas_tiktok": len(cfg.get("cuentas_tiktok", [])),
        "competidores_ig": len(cfg.get("competidores_instagram", [])),
    }

    client = SocialCommentsClient()

    # Test TikTok (fuente principal del botón manual)
    hashtags_tt = cfg.get("hashtags_tiktok", [])
    if hashtags_tt:
        try:
            items_tt = await client.tiktok_hashtag(hashtags_tt[0])
            resultado["test_tiktok_fuente"] = f"tiktok_hashtag:{hashtags_tt[0]}"
            resultado["test_tiktok_count"] = len(items_tt)
            resultado["test_tiktok_muestra"] = items_tt[:2] if items_tt else []
        except Exception as e:
            resultado["test_tiktok_error"] = str(e)
    else:
        resultado["test_tiktok_error"] = "Sin hashtags_tiktok configurados"

    # Test Instagram (referencia)
    if hashtags:
        try:
            items = await client.hashtag_instagram(hashtags[0])
            resultado["test_ig_fuente"] = f"hashtag_ig:{hashtags[0]}"
            resultado["test_ig_count"] = len(items)
        except Exception as e:
            resultado["test_ig_error"] = str(e)

    return resultado


@router.post("/test-guardar")
async def test_guardar_prospecto(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Prueba guardar UN prospecto de prueba y devuelve si tuvo éxito o el error exacto."""
    from app.models.prospect import Prospect, ProspectSource, ProspectStatus
    import uuid
    try:
        p = Prospect(
            id=str(uuid.uuid4()),
            tenant_id=str(current_user.tenant_id),
            contact_name="Test Lead TikTok",
            company_name="Lead social — tiktok_hashtag_invertirenusa",
            website="https://www.tiktok.com/@testuser",
            notes="Texto del comentario de prueba: quiero invertir en florida",
            source=ProspectSource.apify_social,
            source_url="https://www.tiktok.com/@testuser/video/123",
            score=75.0,
            score_reason="Test | tipo: comprador_directo | accion: contactar_hoy",
            is_qualified=True,
            status=ProspectStatus.new,
        )
        db.add(p)
        db.flush()
        db.commit()
        db.refresh(p)
        return {"ok": True, "id": p.id, "mensaje": "Prospecto guardado correctamente"}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e), "tipo": type(e).__name__}


@router.get("/descartados")
async def listar_descartados(
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lista los prospectos descartados del módulo inmobiliaria."""
    service = ProspectorService(db=db, tenant_id=str(current_user.tenant_id))
    result = await service.obtener_prospectos(
        modulo="inmobiliaria",
        solo_excluidos=True,
        pagina=pagina,
        por_pagina=por_pagina,
    )
    for p in result.get("prospectos", []):
        p["fuente_inmobiliaria"] = p.get("signal_text") or ""
    return result


# ── Email con IA ──────────────────────────────────────────────────────────────

@router.post("/prospectos/{prospect_id}/generar-email")
async def generar_email_prospecto(
    prospect_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Genera un borrador de email personalizado para el prospecto usando WriterAgent.
    Devuelve asunto + cuerpo listos para revisar antes de enviar.
    """
    from app.agents.writer_agent import WriterAgent
    from app.models.prospect import Prospect

    prospect = db.query(Prospect).filter(
        Prospect.id == prospect_id,
        Prospect.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    if not prospect.email:
        raise HTTPException(status_code=400, detail="Este prospecto no tiene email")

    agent = WriterAgent(db=db, tenant_id=str(current_user.tenant_id))
    resultado = await agent.run(
        prospect_id=prospect_id,
        canal="email",
    )
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])

    # Separar asunto del cuerpo (el agente pone [ASUNTO: ...] al inicio)
    cuerpo_completo = resultado["body"]
    asunto = ""
    cuerpo = cuerpo_completo
    if "[ASUNTO:" in cuerpo_completo:
        try:
            inicio = cuerpo_completo.index("[ASUNTO:") + 8
            fin = cuerpo_completo.index("]", inicio)
            asunto = cuerpo_completo[inicio:fin].strip()
            cuerpo = cuerpo_completo[fin + 1:].strip()
        except ValueError:
            pass

    return {
        "prospect_id": prospect_id,
        "prospect_email": prospect.email,
        "prospect_name": prospect.contact_name or prospect.company_name,
        "asunto": asunto or f"Oportunidad de inversión en Florida — {prospect.contact_name or 'te contacto'}",
        "cuerpo": cuerpo,
        "message_id": resultado.get("message_id"),
    }


@router.post("/prospectos/{prospect_id}/enviar-email")
async def enviar_email_prospecto(
    prospect_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Envía el email aprobado por el usuario al prospecto.
    Guarda el envío en el historial del prospecto.

    Body: { "asunto": str, "cuerpo": str }
    """
    import json
    from datetime import datetime, timezone
    from app.models.prospect import Prospect
    from app.services.email_service import EmailService

    prospect = db.query(Prospect).filter(
        Prospect.id == prospect_id,
        Prospect.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")
    if not prospect.email:
        raise HTTPException(status_code=400, detail="Este prospecto no tiene email")

    asunto = payload.get("asunto", "").strip()
    cuerpo = payload.get("cuerpo", "").strip()
    if not asunto or not cuerpo:
        raise HTTPException(status_code=400, detail="Asunto y cuerpo son obligatorios")

    # Convertir texto plano a HTML simple
    parrafos = ''.join(f'<p style="margin: 0 0 16px 0;">{linea}</p>' for linea in cuerpo.split('\n') if linea.strip())
    html = f"""
    <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; color: #1f2937; line-height: 1.7;">
        {parrafos}
    </div>
    """

    email_service = EmailService()
    try:
        await email_service.send(
            to=prospect.email,
            subject=asunto,
            html=html,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar email: {str(e)}")

    # Guardar en historial del prospecto
    ahora = datetime.now(timezone.utc).isoformat()
    entrada = {"text": f"📧 Email enviado: '{asunto}'", "created_at": ahora}
    historial = []
    if prospect.notes_history:
        try:
            historial = json.loads(prospect.notes_history)
        except Exception:
            historial = []
    historial.append(entrada)
    prospect.notes_history = json.dumps(historial, ensure_ascii=False)
    db.commit()

    return {"ok": True, "enviado_a": prospect.email, "asunto": asunto}


@router.post("/prospectos/{prospect_id}/enriquecer")
async def enriquecer_prospecto(
    prospect_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """
    Enriquece un lead de LinkedIn buscando su email con Hunter.io.
    Actualiza el prospecto en BD si encuentra email.
    """
    from app.modules.prospector.hunter_client import HunterClient
    from app.models.tenant import Tenant

    prospect = db.query(Prospect).filter(
        Prospect.id == prospect_id,
        Prospect.tenant_id == current_user.tenant_id,
    ).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    keys = tenant.api_keys or {} if tenant else {}
    hunter = HunterClient(api_key=keys.get("hunter_api_key") or None)

    contact_name = prospect.contact_name or prospect.company_name or ""
    result = await hunter.enriquecer_linkedin_lead(
        contact_name=contact_name,
        company_name=prospect.company_name or "",
        website=prospect.website,
    )

    if result["enriched"]:
        prospect.email = result["email"]
        db.commit()
        db.refresh(prospect)
        return {"ok": True, "email": result["email"], "confidence": result.get("confidence")}
    else:
        return {"ok": False, "email": None, "mensaje": "No se encontró email con Hunter.io"}
