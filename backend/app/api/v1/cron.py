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
