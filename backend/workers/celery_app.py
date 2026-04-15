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
    → Todos los días a las 02:00 (hora Chile / UTC-3)
    → Barre los últimos 45 días de licitaciones "publicadas" y
      los últimos 14 días de "cerradas", guarda en licitaciones_cache.
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
    ],
)

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
        # ── Sincronización nocturna de licitaciones ──────────────────────
        # Se corre a las 02:00 AM hora Chile (UTC-3 = 05:00 UTC)
        "sync-licitaciones-cache-diario": {
            "task": "workers.tasks.adjudicadas_sync.sync_licitaciones_cache",
            "schedule": crontab(hour=5, minute=0),   # 05:00 UTC = 02:00 Santiago
            "options": {"expires": 3600},             # no se re-encola si tarda > 1h
        },
    },
)
