"""
Tarea nocturna: sincronizar licitaciones de Mercado Público a la BD local.

Qué hace:
  1. Fetches licitaciones "Publicada" de los últimos 45 días
     → Captura fecha_cierre, organismo, monto_estimado
     → Estas son las que "están por cerrarse" (aún en período de ofertas)

  2. Fetches licitaciones "Cerrada" de los últimos 14 días
     → Obtiene el detalle completo con la lista de ofertantes
     → Estas son las que ya recibieron ofertas y están siendo evaluadas

  3. Upsert en licitaciones_cache (insert o update por codigo)

  4. Para licitaciones "Publicada" que ya pasaron su fecha_cierre,
     actualiza estado a "cerrada" (consulta la API para confirmar).

Por qué 45 días para publicadas:
  Las licitaciones grandes tienen períodos de 30-60 días.
  Con 45 días de ventana capturamos la mayoría sin sobrecargar la API.

Por qué 14 días para cerradas:
  Una vez cerrada, la adjudicación suele demorar 5-15 días hábiles.
  14 días nos da buena cobertura de "cerradas recientes con ofertantes".

Optimización de llamadas API:
  Mercado Público devuelve hasta 1000 items por página/fecha.
  Solo pedimos el detalle completo (con ofertantes) de las cerradas,
  no de las publicadas (muy caro en tiempo).
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone, date

from workers.celery_app import app as celery_app

logger = logging.getLogger(__name__)

# ── Parámetros de barrido ────────────────────────────────────────────────────
DIAS_PUBLICADAS = 45   # Cuántos días hacia atrás buscar publicadas
DIAS_CERRADAS   = 14   # Cuántos días hacia atrás buscar cerradas
MAX_CONCURRENT  = 8    # Semáforo para llamadas paralelas al detalle


# ── Helpers ──────────────────────────────────────────────────────────────────

def _fechas_rango(dias: int) -> list[str]:
    """Devuelve lista de fechas en formato DDMMYYYY desde hoy hasta hace N días."""
    hoy = date.today()
    return [
        (hoy - timedelta(days=i)).strftime("%d%m%Y")
        for i in range(1, dias + 1)
    ]


def _fmt_fecha(valor: str) -> str:
    if not valor:
        return ""
    return str(valor)[:10]


# ── Lógica principal ─────────────────────────────────────────────────────────

async def _sync_async():
    """Función async principal, llamada desde la tarea Celery."""
    from app.core.database import SessionLocal
    from app.models.licitacion_cache import LicitacionCache
    from app.modules.licitaciones.client import MercadoPublicoClient

    client = MercadoPublicoClient()
    db = SessionLocal()

    insertadas = 0
    actualizadas = 0
    errores = 0

    try:
        # ── 1. Barrido de PUBLICADAS (sin detalle, solo lista) ────────────
        logger.info("Iniciando barrido de PUBLICADAS (%d días)…", DIAS_PUBLICADAS)
        fechas_pub = _fechas_rango(DIAS_PUBLICADAS)

        sem = asyncio.Semaphore(MAX_CONCURRENT)

        async def fetch_lista(fecha: str, estado: str) -> list[dict]:
            async with sem:
                try:
                    resp = await client.buscar_licitaciones(estado=estado, fecha=fecha)
                    return resp.get("Listado", [])
                except Exception as e:
                    logger.warning("Error lista %s %s: %s", estado, fecha, e)
                    return []

        # Fetch publicadas en paralelo
        listas_pub = await asyncio.gather(*[fetch_lista(f, "publicada") for f in fechas_pub])

        # Deduplicar
        pub_vistos: set[str] = set()
        pub_todos: list[dict] = []
        for lista in listas_pub:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in pub_vistos:
                    pub_vistos.add(cod)
                    pub_todos.append(item)

        logger.info("Publicadas únicas encontradas: %d", len(pub_todos))

        # Upsert publicadas (solo datos del listado, sin detalle)
        for item in pub_todos:
            codigo = item.get("CodigoExterno", "")
            if not codigo:
                continue

            # Extraer fecha_cierre del listado (si viene)
            fecha_cierre = _fmt_fecha(
                item.get("FechaCierre") or item.get("Fechas", {}).get("FechaCierre", "")
            )
            fecha_pub = _fmt_fecha(
                item.get("FechaPublicacion") or ""
            )
            nombre = item.get("Nombre", "")
            # Estado: lista viene con CodigoEstado numérico
            estado_map = {5: "publicada", 6: "cerrada", 7: "desierta",
                          8: "adjudicada", 15: "revocada", 16: "suspendida"}
            estado_cod = item.get("CodigoEstado", 5)
            estado = item.get("Estado") or estado_map.get(estado_cod, "publicada")

            existente = db.query(LicitacionCache).filter_by(codigo=codigo).first()
            if existente:
                # Solo actualizar estado si cambió
                if existente.estado != estado.lower():
                    estado_anterior = existente.estado
                    existente.estado_anterior = estado_anterior
                    existente.estado = estado.lower()
                    existente.updated_at = datetime.now(timezone.utc)
                    actualizadas += 1
                    # Alerta: cerrada → adjudicada o desierta
                    if estado_anterior == "cerrada" and estado.lower() in ("adjudicada", "desierta", "revocada"):
                        existente.alerta_nueva = True
                        existente.alerta_leida = False
                        logger.info("🔔 ALERTA: %s pasó de cerrada → %s", codigo, estado.lower())
            else:
                nueva = LicitacionCache(
                    codigo=codigo,
                    estado=estado.lower(),
                    nombre=nombre,
                    fecha_publicacion=fecha_pub,
                    fecha_cierre=fecha_cierre,
                    raw_data=json.dumps(item, ensure_ascii=False),
                )
                db.add(nueva)
                insertadas += 1

        db.commit()
        logger.info("Publicadas: +%d insertadas, ~%d actualizadas", insertadas, actualizadas)

        # ── 2. Barrido de CERRADAS (con detalle + ofertantes) ─────────────
        logger.info("Iniciando barrido de CERRADAS (%d días)…", DIAS_CERRADAS)
        fechas_cer = _fechas_rango(DIAS_CERRADAS)

        listas_cer = await asyncio.gather(*[fetch_lista(f, "cerrada") for f in fechas_cer])

        cer_vistos: set[str] = set()
        cer_todos: list[dict] = []
        for lista in listas_cer:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in cer_vistos:
                    cer_vistos.add(cod)
                    cer_todos.append(item)

        logger.info("Cerradas únicas: %d — obteniendo detalles…", len(cer_todos))

        # Detalle completo para extraer ofertantes
        async def fetch_detalle(codigo: str) -> dict | None:
            async with sem:
                try:
                    return await client.obtener_detalle(codigo)
                except Exception as e:
                    logger.warning("Error detalle %s: %s", codigo, e)
                    return None

        codigos_cer = [i["CodigoExterno"] for i in cer_todos if i.get("CodigoExterno")]
        detalles = await asyncio.gather(*[fetch_detalle(c) for c in codigos_cer])

        for detalle in detalles:
            if not detalle:
                continue
            codigo = detalle.get("CodigoExterno", "")
            if not codigo:
                continue

            # Extraer ofertantes de Ofertas.Listado
            ofertas_raw = detalle.get("Ofertas", {}).get("Listado") or []
            ofertantes = []
            for oferta in ofertas_raw:
                rut    = oferta.get("RutProveedor", "")
                nombre = oferta.get("NombreProveedor", "")
                monto  = oferta.get("MontoTotal") or oferta.get("Monto") or 0
                if rut or nombre:
                    ofertantes.append({"rut": rut, "nombre": nombre, "monto_oferta": monto})

            # Fechas del detalle
            fechas  = detalle.get("Fechas") or {}
            f_cierre = _fmt_fecha(fechas.get("FechaCierre") or detalle.get("FechaCierre", ""))
            f_pub    = _fmt_fecha(fechas.get("FechaPublicacion") or detalle.get("FechaPublicacion", ""))
            f_adj    = _fmt_fecha(fechas.get("FechaAdjudicacion") or detalle.get("FechaAdjudicacion", ""))

            # Organismo y región del detalle
            comprador = detalle.get("Comprador") or {}
            organismo = comprador.get("NombreOrganismo", "")
            region    = comprador.get("RegionUnidad", "")

            # Monto estimado
            monto_est = None
            try:
                m = detalle.get("MontoEstimado")
                if m:
                    if isinstance(m, (int, float)):
                        monto_est = float(m)
                    else:
                        s = str(m).strip()
                        if ',' in s:
                            s = s.replace('.', '').replace(',', '.')
                        elif s.count('.') == 1:
                            pass  # decimal anglosajón: "460000000.0"
                        else:
                            s = s.replace('.', '')
                        monto_est = float(s) if s else None
            except Exception:
                pass

            existente = db.query(LicitacionCache).filter_by(codigo=codigo).first()
            if existente:
                existente.estado             = "cerrada"
                existente.organismo          = organismo or existente.organismo
                existente.region             = region    or existente.region
                existente.monto_estimado     = monto_est or existente.monto_estimado
                existente.fecha_cierre       = f_cierre  or existente.fecha_cierre
                existente.fecha_publicacion  = f_pub     or existente.fecha_publicacion
                existente.fecha_adjudicacion = f_adj     or existente.fecha_adjudicacion
                existente.ofertantes_json    = json.dumps(ofertantes, ensure_ascii=False)
                existente.ofertantes_count   = len(ofertantes)
                existente.raw_data           = json.dumps(detalle, ensure_ascii=False)
                existente.updated_at         = datetime.now(timezone.utc)
                actualizadas += 1
            else:
                nueva = LicitacionCache(
                    codigo=codigo,
                    estado="cerrada",
                    nombre=detalle.get("Nombre", ""),
                    organismo=organismo,
                    region=region,
                    monto_estimado=monto_est,
                    fecha_publicacion=f_pub,
                    fecha_cierre=f_cierre,
                    fecha_adjudicacion=f_adj,
                    ofertantes_json=json.dumps(ofertantes, ensure_ascii=False),
                    ofertantes_count=len(ofertantes),
                    raw_data=json.dumps(detalle, ensure_ascii=False),
                )
                db.add(nueva)
                insertadas += 1

        db.commit()
        logger.info("Cerradas: procesadas %d", len([d for d in detalles if d]))

        # ── 3. Barrido de ADJUDICADAS (con detalle completo, 14 días) ─────────
        logger.info("Iniciando barrido de ADJUDICADAS (%d días)…", DIAS_CERRADAS)

        listas_adj = await asyncio.gather(*[fetch_lista(f, "adjudicada") for f in fechas_cer])

        adj_vistos: set[str] = set()
        adj_todos: list[dict] = []
        for lista in listas_adj:
            for item in lista:
                cod = item.get("CodigoExterno")
                if cod and cod not in adj_vistos:
                    adj_vistos.add(cod)
                    adj_todos.append(item)

        logger.info("Adjudicadas únicas: %d — obteniendo detalles…", len(adj_todos))

        from app.modules.licitaciones.normalizer import LicitacionNormalizada

        codigos_adj = [i["CodigoExterno"] for i in adj_todos if i.get("CodigoExterno")]
        detalles_adj = await asyncio.gather(*[fetch_detalle(c) for c in codigos_adj])

        for detalle in detalles_adj:
            if not detalle:
                continue
            codigo = detalle.get("CodigoExterno", "")
            if not codigo:
                continue
            try:
                n = LicitacionNormalizada(detalle, tipo_busqueda="licitador_b")
                # Guardar winner con flag es_adjudicado para distinguirlo de ofertantes
                winner = [{
                    "rut":          n.adjudicado_rut or "",
                    "nombre":       n.adjudicado_nombre or "",
                    "monto_oferta": n.monto_adjudicado or 0,
                    "es_adjudicado": True,
                }]
                fechas_det  = detalle.get("Fechas") or {}
                f_cierre = _fmt_fecha(fechas_det.get("FechaCierre") or detalle.get("FechaCierre", ""))
                f_pub    = _fmt_fecha(fechas_det.get("FechaPublicacion") or detalle.get("FechaPublicacion", ""))
                f_adj    = n.fecha_adjudicacion or ""

                existente = db.query(LicitacionCache).filter_by(codigo=codigo).first()
                if existente:
                    if existente.estado != "adjudicada":
                        existente.estado_anterior = existente.estado
                        existente.estado = "adjudicada"
                        if existente.estado_anterior == "cerrada":
                            existente.alerta_nueva = True
                            existente.alerta_leida = False
                            logger.info("🔔 ALERTA: %s pasó de cerrada → adjudicada", codigo)
                    existente.organismo          = n.organismo_nombre or existente.organismo
                    existente.region             = n.region or existente.region
                    existente.monto_estimado     = n.monto_adjudicado or existente.monto_estimado
                    existente.fecha_cierre       = f_cierre or existente.fecha_cierre
                    existente.fecha_publicacion  = f_pub or existente.fecha_publicacion
                    existente.fecha_adjudicacion = f_adj or existente.fecha_adjudicacion
                    existente.ofertantes_json    = json.dumps(winner, ensure_ascii=False)
                    existente.ofertantes_count   = 1
                    existente.raw_data           = json.dumps(detalle, ensure_ascii=False)
                    existente.updated_at         = datetime.now(timezone.utc)
                    actualizadas += 1
                else:
                    nueva = LicitacionCache(
                        codigo=codigo,
                        estado="adjudicada",
                        nombre=n.nombre or detalle.get("Nombre", ""),
                        organismo=n.organismo_nombre,
                        region=n.region,
                        monto_estimado=n.monto_adjudicado,
                        fecha_publicacion=f_pub,
                        fecha_cierre=f_cierre,
                        fecha_adjudicacion=f_adj,
                        ofertantes_json=json.dumps(winner, ensure_ascii=False),
                        ofertantes_count=1,
                        raw_data=json.dumps(detalle, ensure_ascii=False),
                    )
                    db.add(nueva)
                    insertadas += 1
            except Exception as e:
                logger.warning("Error normalizando adjudicada %s: %s", codigo, e)
                errores += 1
                continue

        db.commit()
        logger.info(
            "Sync completo: +%d insertadas, ~%d actualizadas, %d errores",
            insertadas, actualizadas, errores,
        )
        return {
            "insertadas": insertadas,
            "actualizadas": actualizadas,
            "errores": errores,
            "publicadas_procesadas": len(pub_todos),
            "cerradas_procesadas": len([d for d in detalles if d]),
            "adjudicadas_procesadas": len([d for d in detalles_adj if d]),
        }

    except Exception as e:
        db.rollback()
        logger.error("Error crítico en sync: %s", e, exc_info=True)
        raise
    finally:
        db.close()


# ── Tarea Celery ─────────────────────────────────────────────────────────────

@celery_app.task(
    name="workers.tasks.adjudicadas_sync.sync_licitaciones_cache",
    bind=True,
    max_retries=2,
    default_retry_delay=300,  # 5 min entre reintentos
    soft_time_limit=1800,     # 30 min máximo
    time_limit=2100,
)
def sync_licitaciones_cache(self):
    """
    Tarea periódica: sincroniza la caché de licitaciones desde Mercado Público.
    Corre a las 02:00 AM hora Chile (configurado en celery_app.py).

    También puede lanzarse manualmente desde Django admin o la CLI:
        from workers.tasks.adjudicadas_sync import sync_licitaciones_cache
        sync_licitaciones_cache.delay()
    """
    try:
        resultado = asyncio.run(_sync_async())
        logger.info("Tarea completada: %s", resultado)
        return resultado
    except Exception as exc:
        logger.error("Fallo en sync_licitaciones_cache: %s", exc)
        raise self.retry(exc=exc)


# ── Lanzador manual (para pruebas) ───────────────────────────────────────────

if __name__ == "__main__":
    """
    Prueba directa: python -m workers.tasks.adjudicadas_sync
    No requiere Celery corriendo.
    """
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    logging.basicConfig(level=logging.INFO)
    resultado = asyncio.run(_sync_async())
    print("Resultado:", resultado)
