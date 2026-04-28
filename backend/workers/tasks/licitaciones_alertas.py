"""
Tarea diaria: enviar alertas de nuevas licitaciones a cada tenant.

Qué hace:
  1. Busca todos los TenantModule con módulo "licitaciones" activo
  2. Para cada uno que tenga email_alertas y rubros configurados:
     - Busca en Mercado Público licitaciones publicadas en las últimas 24h
       usando sus rubros como keyword
     - Si encuentra resultados, envía email con tabla de licitaciones
     - Guarda nuevas_pendientes en niche_config para badge in-app
  3. Corre todos los días a las 08:00 AM Santiago (11:00 UTC)
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from workers.celery_app import app as celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.tasks.licitaciones_alertas.enviar_alertas_licitaciones",
                 bind=True, max_retries=2, default_retry_delay=300)
def enviar_alertas_licitaciones(self):
    """Celery task que llama al endpoint de alertas de licitaciones."""
    try:
        asyncio.run(_run_alertas())
    except Exception as exc:
        logger.error(f"Error en alertas licitaciones: {exc}")
        raise self.retry(exc=exc)


async def _run_alertas():
    import unicodedata as _ud
    from app.core.database import SessionLocal
    from app.models.tenant import TenantModule
    from app.models.prospect import Prospect, ProspectStatus
    from app.services.email_service import EmailService
    from app.modules.licitaciones.client import MercadoPublicoClient
    from sqlalchemy.orm.attributes import flag_modified

    def _norm_kw(s: str) -> str:
        return _ud.normalize('NFD', (s or "").lower()).encode('ascii', 'ignore').decode()

    def _fit_rapido(nombre: str, descripcion: str, rubros: list, regiones: list, region_item: str) -> int:
        txt = _norm_kw(nombre + " " + descripcion)
        matches = sum(1 for r in rubros if _norm_kw(r) in txt)
        score_rubro = 0 if matches == 0 else (50 if matches == 1 else 70)
        region_ok = not regiones or not region_item or any(r.lower() in region_item.lower() for r in regiones)
        return min(score_rubro + (10 if region_ok else 0), 80)

    db = SessionLocal()
    try:
        modulos = (
            db.query(TenantModule)
            .filter(
                TenantModule.module.in_(["licitaciones", "licitador"]),
                TenantModule.is_active == True,
            )
            .all()
        )

        email_service = EmailService()
        client = MercadoPublicoClient()

        ahora = datetime.now(timezone.utc)
        enviados = 0

        for mod in modulos:
            cfg = mod.niche_config or {}
            email_alertas = cfg.get("email_alertas", "").strip()
            rubros = cfg.get("rubros") or []
            regiones = cfg.get("regiones") or []
            razon_social = cfg.get("razon_social") or "Tu empresa"

            if not rubros:
                continue

            try:
                keyword = rubros[0] if len(rubros) == 1 else ", ".join(rubros[:3])
                fecha_ayer_api = (ahora - timedelta(days=1)).strftime("%d%m%Y")
                region_param = regiones[0] if len(regiones) == 1 else None

                resp = await client.buscar_licitaciones(
                    fecha=fecha_ayer_api,
                    estado="publicada",
                    region=region_param,
                )
                listado_raw = resp.get("Listado", [])

                # Filtrar por keyword en nombre/descripción
                kw_norm = _norm_kw(keyword)
                palabras_kw = [p for p in kw_norm.split() if len(p) > 2]
                items_filtrados = []
                for it in listado_raw:
                    txt = _norm_kw((it.get("Nombre") or "") + " " + (it.get("Descripcion") or ""))
                    if not palabras_kw or any(p in txt for p in palabras_kw):
                        items_filtrados.append(it)

                # ── Guardar en BD (sin duplicados) ────────────────────────
                guardadas = 0
                for it in items_filtrados:
                    codigo = it.get("CodigoExterno") or ""
                    if not codigo:
                        continue
                    existe = db.query(Prospect).filter(
                        Prospect.tenant_id == mod.tenant_id,
                        Prospect.licitacion_codigo == codigo,
                    ).first()
                    if existe:
                        continue

                    nombre = it.get("Nombre") or "Sin nombre"
                    organismo = it.get("NombreOrganismo") or it.get("CodigoOrganismo") or ""
                    monto = float(it.get("MontoEstimado") or 0)
                    fecha_cierre = (it.get("FechaCierre") or "")[:10]
                    region_item = it.get("RegionUnidad") or it.get("NombreRegion") or ""
                    descripcion = it.get("Descripcion") or ""

                    fit = _fit_rapido(nombre, descripcion, rubros, regiones, region_item)

                    prospect = Prospect(
                        tenant_id=mod.tenant_id,
                        source_module="licitaciones",
                        company_name=organismo,
                        licitacion_nombre=nombre,
                        licitacion_codigo=codigo,
                        licitacion_organismo=organismo,
                        licitacion_monto=monto,
                        licitacion_fecha_cierre=fecha_cierre,
                        score=fit,
                        score_reason="Evaluación automática por rubros — analiza para ver detalle completo",
                        is_qualified=False,
                        status=ProspectStatus.new,
                        notes="Auto-guardada desde alerta diaria",
                    )
                    db.add(prospect)
                    guardadas += 1

                db.flush()

                cfg["nuevas_pendientes"] = len(items_filtrados)
                cfg["last_alerta_enviada"] = ahora.isoformat()
                mod.niche_config = dict(cfg)
                flag_modified(mod, "niche_config")

                logger.info(f"Tenant {mod.tenant_id}: {len(items_filtrados)} encontradas, {guardadas} nuevas guardadas")

                # ── Email (solo si hay email configurado) ─────────────────
                if email_alertas and items_filtrados:
                    licitaciones_email = [
                        {
                            "nombre": i.get("Nombre") or "Sin nombre",
                            "codigo": i.get("CodigoExterno") or "",
                            "organismo": i.get("NombreOrganismo") or i.get("CodigoOrganismo") or "",
                            "monto_estimado": float(i.get("MontoEstimado") or 0),
                            "fecha_cierre": (i.get("FechaCierre") or "")[:10],
                            "score": 0,
                        }
                        for i in items_filtrados[:10]
                    ]
                    await email_service.send_licitaciones_alert(
                        to=email_alertas,
                        razon_social=razon_social,
                        licitaciones=licitaciones_email,
                    )
                    enviados += 1

            except Exception as e:
                logger.error(f"Error procesando tenant {mod.tenant_id}: {e}")

        db.commit()
        logger.info(f"Alertas licitaciones: {len(modulos)} tenants procesados, {enviados} emails enviados")

    finally:
        db.close()
