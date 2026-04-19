"""
Celery app — worker de tareas asíncronas y periódicas de Kapturo.

Cómo correr:
  # Worker (procesa tareas)
  cd backend
  celery -A workers.celery_app worker --loglevel=info

  # Beat (planificador — lanza las tareas periódicas)
  cd backend
  celery -A workers.celery_app beat --loglevel=info

  # En producción, ambos en un solo comando:
  celery -A workers.celery_app worker --beat --loglevel=info

Tareas registradas:
  - workers.tasks.adjudicadas_sync.sync_licitaciones_cache
    → Todos los días a las 02:00 AM Santiago (UTC-3 = 05:00 UTC)
    → Barre los últimos 45 días de licitaciones "publicadas" y
      los últimos 14 días de "cerradas", guarda en licitaciones_cache.

  - workers.tasks.social_comments_sync.sync_social_comments
    → 2 veces por día (mañana y noche), cada vez corre un BATCH distinto.
    → Con 21 fuentes y BATCH_SIZE=6 → 4 batches → cobertura total cada 2 días.
    → Horarios elegidos para capturar a latinoamericanos activos en IG/FB:
        Batch 0 (lunes/miércoles/viernes): 09:00 Santiago — LATAM recién despierta
        Batch 1 (martes/jueves/sábado):    09:00 Santiago
        Batch 2 (lunes/miércoles/viernes): 21:00 Santiago — noche LATAM, pico de engagement
        Batch 3 (martes/jueves/sábado):    21:00 Santiago
    → Anti-ban: delays aleatorios 3-10s entre actores dentro de cada batch.
    → Apify usa proxies residenciales rotados por actor.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

app = Celery(
    "kapturo",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "workers.tasks.adjudicadas_sync",
        "workers.tasks.social_comments_sync",
        "workers.tasks.licitaciones_alertas",
    ],
)

# Alias para compatibilidad con imports que usen celery_app
celery_app = app

app.conf.update(
    # Serialización
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone (Chile Standard = UTC-3, no DST)
    timezone="America/Santiago",
    enable_utc=True,

    # Retry policy
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    # Beat schedule
    beat_schedule={
        # ── Licitaciones ─────────────────────────────────────────────────
        # 02:00 AM Santiago (UTC-3 = 05:00 UTC)
        "sync-licitaciones-cache-diario": {
            "task": "workers.tasks.adjudicadas_sync.sync_licitaciones_cache",
            "schedule": crontab(hour=5, minute=0),
            "options": {"expires": 3600},
        },

        # 08:00 AM Santiago (UTC-3 = 11:00 UTC) — alertas email a tenants
        "alertas-licitaciones-diario": {
            "task": "workers.tasks.licitaciones_alertas.enviar_alertas_licitaciones",
            "schedule": crontab(hour=11, minute=0),
            "options": {"expires": 3600},
        },

        # ── Social comments — mañana (batch par) ─────────────────────────
        # 09:00 Santiago (UTC-3 = 12:00 UTC)
        # batch_index=None → rota automáticamente por día del año (par)
        # Lunes a Sábado — domingo libres para dejar descansar los proxies
        "sync-social-comments-manana": {
            "task": "workers.tasks.social_comments_sync.sync_social_comments",
            "schedule": crontab(hour=12, minute=0, day_of_week="1-6"),  # 12 UTC = 09:00 Santiago
            "kwargs": {"batch_index": None},
            "options": {"expires": 3600},
        },

        # ── Social comments — noche (batch impar) ────────────────────────
        # 21:00 Santiago (UTC-3 = 00:00 UTC siguiente día)
        # batch_index forzado a par+1 pasando el día+1 en modulo
        # Lunes a Sábado
        "sync-social-comments-noche": {
            "task": "workers.tasks.social_comments_sync.sync_social_comments",
            "schedule": crontab(hour=0, minute=0, day_of_week="2-7"),  # 00:00 UTC = 21:00 Santiago anterior
            "kwargs": {"batch_index": None, "offset": 1},
            "options": {"expires": 3600},
        },
    },
)
