"""
Endpoints de cron jobs para tareas programadas.

Diseñado para ser llamado por Railway Cron (o cualquier scheduler externo)
con un header de autenticación simple usando CRON_SECRET.

Endpoints:
  POST /cron/alarmas            — envía notificaciones de prospectos con alarma vencida
  POST /cron/sync-licitaciones  — precarga licitaciones_cache para los 6 estados
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.prospect import Prospect
from app.models.tenant import Tenant
from app.models.user import User
from app.services.email_service import EmailService
from app.services.whatsapp_service import WhatsAppService
from app.models.licitacion_cache import LicitacionCache
from app.modules.licitaciones.client import MercadoPublicoClient
from app.modules.licitaciones.normalizer import LicitacionNormalizada

router = APIRouter(prefix="/cron", tags=["cron"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _verify_cron(x_cron_secret: Optional[str] = Header(default=None)):
    """
    Valida el header X-Cron-Secret.
    Si CRON_SECRET no está configurado en .env, permite la llamada sin restricción
    (útil en desarrollo). En producción deberías siempre configurarlo.
    """
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Cron secret inválido")


@router.post("/alarmas")
async def run_alarmas(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Revisa todos los prospectos con alarma vencida (alarma_fecha <= ahora) y:
      1. Envía un email al usuario admin del tenant (si tiene email configurado)
      2. Limpia alarma_fecha para que no se re-envíe en el siguiente ciclo

    Llamar cada hora desde Railway Cron:
      Path: POST /api/v1/cron/alarmas
      Header: X-Cron-Secret: <tu_cron_secret>

    Returns: {"enviados": N, "errores": [...]}
    """
    ahora = datetime.now(timezone.utc)

    prospectos = (
        db.query(Prospect)
        .filter(
            Prospect.alarma_fecha != None,
            Prospect.alarma_fecha <= ahora,
            Prospect.excluido == False,
        )
        .all()
    )

    email_service = EmailService()
    enviados = 0
    errores = []

    for prospecto in prospectos:
        try:
            # Obtener el tenant y su admin para saber a quién notificar
            tenant = db.query(Tenant).filter(Tenant.id == prospecto.tenant_id).first()
            if not tenant:
                continue

            # Buscar el admin del tenant (primer usuario con rol admin o el primero disponible)
            admin_user = (
                db.query(User)
                .filter(
                    User.tenant_id == prospecto.tenant_id,
                    User.is_active == True,
                )
                .order_by(User.created_at.asc())
                .first()
            )

            nombre_prospecto = (
                prospecto.contact_name or prospecto.company_name or f"Prospecto {prospecto.id[:6]}"
            )

            # ── Notificar por email ─────────────────────────────────────────────
            if admin_user and admin_user.email:
                try:
                    await email_service.send_alarm_notification(
                        to=admin_user.email,
                        prospect_name=nombre_prospecto,
                        alarm_reason=prospecto.alarma_motivo or "",
                        prospect_id=prospecto.id,
                    )
                except Exception as e:
                    errores.append({"prospect_id": prospecto.id, "tipo": "email", "error": str(e)})

            # ── Notificar por WhatsApp (si el admin tiene WA configurado) ────────
            tenant_keys = tenant.api_keys or {}
            wa_token = tenant_keys.get("whatsapp_token")
            wa_phone_id = tenant_keys.get("whatsapp_phone_number_id")
            admin_phone = tenant_keys.get("admin_whatsapp")  # número personal del admin en el tenant

            if wa_token and wa_phone_id and admin_phone:
                try:
                    wa = WhatsAppService(token=wa_token, phone_number_id=wa_phone_id)
                    motivo = prospecto.alarma_motivo or "Sin motivo registrado"
                    await wa.send_text(
                        to=admin_phone,
                        body=(
                            f"🔔 *Alarma Kapturo*\n\n"
                            f"Tienes un recordatorio para hoy:\n"
                            f"*{nombre_prospecto}*\n"
                            f"_{motivo}_\n\n"
                            f"Entra a app.kapturo.cl para ver el detalle."
                        ),
                    )
                except Exception as e:
                    errores.append({"prospect_id": prospecto.id, "tipo": "whatsapp", "error": str(e)})

            # ── Limpiar la alarma para no reenviar ──────────────────────────────
            prospecto.alarma_fecha = None
            prospecto.alarma_motivo = None
            enviados += 1

        except Exception as e:
            errores.append({"prospect_id": prospecto.id, "tipo": "general", "error": str(e)})

    db.commit()

    return {
        "status": "ok",
        "revisados": len(prospectos),
        "enviados": enviados,
        "errores": errores,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Configuración de días a sincronizar por estado
# ──────────────────────────────────────────────────────────────────────────────
_DIAS_POR_ESTADO = {
    "publicada":   45,   # tab principal — necesita más historial
    "cerrada":     14,
    "adjudicada":  14,
    "desierta":    14,
    "revocada":    14,
    "suspendida":  14,
}


async def _sync_estado(
    estado: str,
    dias: int,
    db: Session,
    semaforo: asyncio.Semaphore,
) -> dict:
    """
    Descarga todas las licitaciones de un estado para los últimos `dias` días
    y las upsertea en licitaciones_cache.

    Flujo:
      1. Para cada fecha → buscar_licitaciones (Phase 1, listado)
      2. Para cada licitación del listado → obtener_detalle (Phase 2, detalle completo)
      3. Upsert en licitaciones_cache usando LicitacionNormalizada
    """
    client = MercadoPublicoClient()
    hoy = datetime.now(timezone.utc).date()
    nuevas = 0
    actualizadas = 0
    errores = 0

    codigos_procesados: set[str] = set()

    for offset in range(dias):
        fecha = hoy - timedelta(days=offset + 1)  # API solo acepta fechas pasadas
        fecha_str = fecha.strftime("%d%m%Y")

        try:
            pagina = 1
            while True:
                try:
                    resp = await client.buscar_licitaciones(
                        fecha=fecha_str,
                        estado=estado,
                        pagina=pagina,
                    )
                except Exception:
                    break

                listado = resp.get("Listado") or []
                if not listado:
                    break

                # Fetch detalle en paralelo (máx 5 simultáneos)
                async def _fetch_detalle(item: dict) -> Optional[dict]:
                    codigo = item.get("CodigoExterno", "")
                    if not codigo or codigo in codigos_procesados:
                        return None
                    async with semaforo:
                        try:
                            detalle = await client.obtener_detalle(codigo)
                            return detalle
                        except Exception:
                            return None

                detalles = await asyncio.gather(*[_fetch_detalle(it) for it in listado])

                for detalle in detalles:
                    if not detalle:
                        continue
                    codigo = detalle.get("CodigoExterno", "")
                    if not codigo or codigo in codigos_procesados:
                        continue
                    codigos_procesados.add(codigo)

                    try:
                        norm = LicitacionNormalizada(detalle, "licitador_a")

                        # Ofertantes (si el detalle los trae)
                        ofertantes_raw = detalle.get("Oferentes") or detalle.get("Ofertantes") or []
                        ofertantes_count = len(ofertantes_raw) if isinstance(ofertantes_raw, list) else 0
                        import json
                        ofertantes_json = json.dumps(ofertantes_raw, ensure_ascii=False) if ofertantes_raw else None

                        existing = db.query(LicitacionCache).filter(
                            LicitacionCache.codigo == codigo
                        ).first()

                        if existing:
                            existing.estado              = norm.estado or estado
                            existing.nombre              = norm.nombre
                            existing.organismo           = norm.organismo_nombre
                            existing.region              = norm.region
                            existing.monto_estimado      = norm.monto
                            existing.fecha_publicacion   = norm.fecha_publicacion or None
                            existing.fecha_cierre        = norm.fecha_cierre or None
                            existing.fecha_adjudicacion  = norm.fecha_adjudicacion or None
                            existing.ofertantes_json     = ofertantes_json
                            existing.ofertantes_count    = ofertantes_count
                            existing.raw_data            = json.dumps(detalle, ensure_ascii=False)
                            existing.updated_at          = datetime.now(timezone.utc)
                            actualizadas += 1
                        else:
                            nueva = LicitacionCache(
                                codigo             = codigo,
                                estado             = norm.estado or estado,
                                nombre             = norm.nombre,
                                organismo          = norm.organismo_nombre,
                                region             = norm.region,
                                monto_estimado     = norm.monto,
                                fecha_publicacion  = norm.fecha_publicacion or None,
                                fecha_cierre       = norm.fecha_cierre or None,
                                fecha_adjudicacion = norm.fecha_adjudicacion or None,
                                ofertantes_json    = ofertantes_json,
                                ofertantes_count   = ofertantes_count,
                                raw_data           = json.dumps(detalle, ensure_ascii=False),
                                updated_at         = datetime.now(timezone.utc),
                            )
                            db.add(nueva)
                            nuevas += 1

                    except Exception:
                        errores += 1

                # Commit por fecha para no perder progreso
                try:
                    db.commit()
                except Exception:
                    db.rollback()

                # Si la API devolvió menos de 1000, ya no hay más páginas
                if len(listado) < 1000:
                    break
                pagina += 1

        except Exception:
            errores += 1
            continue

    return {"nuevas": nuevas, "actualizadas": actualizadas, "errores": errores}


@router.post("/sync-licitaciones")
async def sync_licitaciones(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Precarga licitaciones_cache para los 6 estados de Mercado Público.

    Correr nightly desde Railway Cron (ej. 2am Chile = 05:00 UTC):
      Path:   POST /api/v1/cron/sync-licitaciones
      Header: X-Cron-Secret: <tu_cron_secret>
      Cron:   0 5 * * *

    Después de esto las tabs de AdjudicadasPage leen del cache y no
    necesitan llamar a la API externa en tiempo real.
    """
    inicio = datetime.now(timezone.utc)
    semaforo = asyncio.Semaphore(5)  # máx 5 requests de detalle en paralelo

    resultados = {}
    for estado, dias in _DIAS_POR_ESTADO.items():
        resultados[estado] = await _sync_estado(estado, dias, db, semaforo)

    duracion_seg = (datetime.now(timezone.utc) - inicio).total_seconds()
    total_nuevas      = sum(v["nuevas"] for v in resultados.values())
    total_actualizadas = sum(v["actualizadas"] for v in resultados.values())

    return {
        "status": "ok",
        "duracion_segundos": round(duracion_seg, 1),
        "total_nuevas": total_nuevas,
        "total_actualizadas": total_actualizadas,
        "por_estado": resultados,
    }


@router.post("/alertas-cierre")
async def alertas_cierre(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Revisa todas las postulaciones con fecha_cierre en los próximos 1, 2 o 3 días
    y envía un email de alerta al admin del tenant.

    Correr diariamente desde Railway Cron (ej. 9am Chile = 12:00 UTC):
      Path:   POST /api/v1/cron/alertas-cierre
      Header: X-Cron-Secret: <tu_cron_secret>
      Cron:   0 12 * * *

    Returns: {"enviados": N, "errores": [...]}
    """
    from dateutil import parser as dateparser

    hoy = datetime.now(timezone.utc).date()
    limite = hoy + timedelta(days=3)

    # Traer todas las postulaciones activas con fecha_cierre
    postulaciones = (
        db.query(Prospect)
        .filter(
            Prospect.source_module == "licitador_a",
            Prospect.licitacion_fecha_cierre != None,
            Prospect.postulacion_estado.notin_(["ganada", "perdida"]),
            Prospect.excluido == False,
        )
        .all()
    )

    email_service = EmailService()
    enviados = 0
    errores = []

    for p in postulaciones:
        try:
            # Parsear la fecha de cierre (puede venir en varios formatos)
            try:
                fecha_cierre = dateparser.parse(p.licitacion_fecha_cierre)
                if fecha_cierre is None:
                    continue
                fecha_cierre = fecha_cierre.date()
            except Exception:
                continue

            dias_restantes = (fecha_cierre - hoy).days
            if dias_restantes < 0 or dias_restantes > 3:
                continue

            # Buscar admin del tenant
            admin = (
                db.query(User)
                .filter(User.tenant_id == p.tenant_id, User.is_active == True)
                .order_by(User.created_at.asc())
                .first()
            )
            if not admin or not admin.email:
                continue

            nombre = p.licitacion_nombre or p.licitacion_codigo or p.id[:8]
            organismo = p.licitacion_organismo or ""
            codigo = p.licitacion_codigo or ""
            estado_txt = (p.postulacion_estado or "sin estado").replace("_", " ").title()

            if dias_restantes == 0:
                urgencia = "🚨 ¡Cierra HOY!"
                color = "#dc2626"
            elif dias_restantes == 1:
                urgencia = "⚠️ Cierra mañana"
                color = "#ea580c"
            else:
                urgencia = f"⏰ Cierra en {dias_restantes} días"
                color = "#d97706"

            html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
              <div style="background: #4f46e5; padding: 24px; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">📋 Alerta de licitación — Kapturo</h1>
              </div>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
                <div style="background: {color}18; border-left: 4px solid {color}; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
                  <strong style="color: {color}; font-size: 16px;">{urgencia}</strong>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280; font-size: 13px; width: 130px;">Licitación</td>
                    <td style="padding: 10px 0; font-size: 13px; font-weight: 600;">{nombre}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Organismo</td>
                    <td style="padding: 10px 0; font-size: 13px;">{organismo}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Código</td>
                    <td style="padding: 10px 0; font-size: 13px; font-family: monospace;">{codigo}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Fecha cierre</td>
                    <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: {color};">{fecha_cierre.strftime("%d/%m/%Y")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Estado</td>
                    <td style="padding: 10px 0; font-size: 13px;">{estado_txt}</td>
                  </tr>
                </table>
                <a href="https://app.kapturo.cl/licitaciones?tab=postulaciones"
                   style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px;
                          border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Ver mis postulaciones →
                </a>
                <p style="color: #9ca3af; font-size: 11px; margin-top: 24px;">
                  Kapturo · Licitaciones Chile · <a href="https://app.kapturo.cl" style="color: #9ca3af;">app.kapturo.cl</a>
                </p>
              </div>
            </div>
            """

            await email_service.send(
                to=admin.email,
                subject=f"{urgencia} — {nombre[:60]}",
                html=html,
            )
            enviados += 1

        except Exception as e:
            errores.append({"prospect_id": p.id, "error": str(e)})

    return {
        "status": "ok",
        "revisadas": len(postulaciones),
        "alertas_enviadas": enviados,
        "errores": errores,
    }


@router.post("/sync-inmobiliaria")
async def sync_inmobiliaria(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Ejecuta búsqueda de leads sociales para todos los tenants con módulo inmobiliaria activo.
    Usar desde Railway Cron 2x por día (mañana y noche Chile):
      09:00 Santiago = 12:00 UTC
      21:00 Santiago = 00:00 UTC
    """
    from app.models.tenant import TenantModule
    from app.services.inmobiliaria_service import InmobiliariaService
    import math
    from datetime import date

    BATCH_SIZE = 6
    modulos = db.query(TenantModule).filter(
        TenantModule.module == "inmobiliaria",
        TenantModule.is_active == True,
    ).all()

    resultados = {}
    for modulo in modulos:
        try:
            cfg = modulo.niche_config or {}
            todas_fuentes = []
            for h in cfg.get("hashtags_instagram", []):
                todas_fuentes.append(("hashtag", h))
            for c in cfg.get("cuentas_instagram", []):
                todas_fuentes.append(("cuenta", c))
            for g in cfg.get("grupos_facebook", []):
                todas_fuentes.append(("fb_grupo", g))
            for p in cfg.get("paginas_facebook", []):
                todas_fuentes.append(("fb_pagina", p))
            for v in cfg.get("videos_youtube", []):
                todas_fuentes.append(("youtube", v))
            for h in cfg.get("hashtags_tiktok", []):
                todas_fuentes.append(("tiktok_hashtag", h))
            for c in cfg.get("cuentas_tiktok", []):
                todas_fuentes.append(("tiktok_cuenta", c))
            for c in cfg.get("competidores_instagram", []):
                todas_fuentes.append(("ig_seguidores", c))

            n_batches = math.ceil(len(todas_fuentes) / BATCH_SIZE) or 1
            idx = date.today().timetuple().tm_yday % n_batches
            fuentes_hoy = todas_fuentes[idx * BATCH_SIZE:(idx + 1) * BATCH_SIZE]

            service = InmobiliariaService(db=db, tenant_id=str(modulo.tenant_id))
            resultado = await service.buscar_fuentes(fuentes_hoy)
            resultados[str(modulo.tenant_id)] = resultado
        except Exception as e:
            resultados[str(modulo.tenant_id)] = {"error": str(e)}

    return {"status": "ok", "tenants": len(modulos), "resultados": resultados}


# ── Alertas diarias de licitaciones ───────────────────────────────────────────

@router.post("/alertas-licitaciones")
async def run_alertas_licitaciones(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron),
):
    """
    Envía alertas diarias de nuevas licitaciones relevantes a todos los tenants
    con módulo licitaciones activo, email_alertas configurado y rubros definidos.

    Para cada tenant:
      1. Busca licitaciones en Mercado Público publicadas en las últimas 24h
         usando los rubros del perfil como keywords
      2. Si encuentra resultados, envía email al email_alertas
      3. Guarda `nuevas_pendientes` en niche_config para badge in-app
      4. Registra `last_alerta_enviada` timestamp

    Llamar cada día a las 8:00 desde Railway Cron:
      Path: POST /api/v1/cron/alertas-licitaciones
      Header: X-Cron-Secret: <tu_cron_secret>
    """
    from app.models.tenant import TenantModule
    from sqlalchemy.orm.attributes import flag_modified

    modulos = (
        db.query(TenantModule)
        .filter(
            TenantModule.module == "licitaciones",
            TenantModule.is_active == True,
        )
        .all()
    )

    email_service = EmailService()
    client = MercadoPublicoClient()
    enviados = 0
    sin_email = 0
    errores = []

    ahora = datetime.now(timezone.utc)
    ayer = (ahora - timedelta(days=1)).strftime("%Y-%m-%d")
    hoy = ahora.strftime("%Y-%m-%d")

    for mod in modulos:
        cfg = mod.niche_config or {}
        email_alertas = cfg.get("email_alertas", "").strip()
        rubros = cfg.get("rubros") or []
        razon_social = cfg.get("razon_social") or "Tu empresa"

        if not email_alertas or not rubros:
            sin_email += 1
            continue

        try:
            # Buscar licitaciones en las últimas 24h usando primer rubro como keyword
            keyword = rubros[0] if len(rubros) == 1 else ", ".join(rubros[:3])
            filtros = {
                "fecha_desde": ayer,
                "fecha_hasta": hoy,
                "keyword": keyword,
            }
            region = cfg.get("regiones", [])
            if len(region) == 1:
                filtros["region"] = region[0]

            resultado = await asyncio.to_thread(
                client.buscar_licitaciones,
                tipo="licitador_b",
                filtros=filtros,
                pagina=1,
            )

            items = resultado.get("items", [])
            if not items:
                # Igual actualizamos nuevas_pendientes a 0
                cfg["nuevas_pendientes"] = 0
                mod.niche_config = dict(cfg)
                flag_modified(mod, "niche_config")
                continue

            # Preparar lista para email (datos básicos)
            licitaciones_email = []
            for item in items[:10]:
                licitaciones_email.append({
                    "nombre": item.get("nombre") or item.get("licitacion_nombre") or "Sin nombre",
                    "codigo": item.get("codigo") or "",
                    "organismo": item.get("organismo") or item.get("comprador") or "",
                    "monto_estimado": item.get("monto_estimado") or 0,
                    "fecha_cierre": item.get("fecha_cierre") or "",
                    "score": item.get("score") or 0,
                })

            # Enviar email
            await email_service.send_licitaciones_alert(
                to=email_alertas,
                razon_social=razon_social,
                licitaciones=licitaciones_email,
            )
            enviados += 1

            # Guardar metadatos en niche_config para badge in-app
            cfg["nuevas_pendientes"] = len(items)
            cfg["last_alerta_enviada"] = ahora.isoformat()
            mod.niche_config = dict(cfg)
            flag_modified(mod, "niche_config")

        except Exception as e:
            errores.append({"tenant_id": str(mod.tenant_id), "error": str(e)})

    db.commit()

    return {
        "status": "ok",
        "tenants_procesados": len(modulos),
        "emails_enviados": enviados,
        "sin_email_o_rubros": sin_email,
        "errores": errores,
    }
