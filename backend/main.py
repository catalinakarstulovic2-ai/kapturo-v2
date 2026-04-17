import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, admin, tenant, dashboard
from app.api.v1.modules import licitaciones
from app.api.v1.modules import prospector
from app.api.v1.modules import inmobiliaria
from app.api.v1.modules import adjudicadas
from app.api.v1 import pipeline, agents, messages, cron

app = FastAPI(
    title="Kapturo API",
    description="Plataforma de prospección B2B multi-tenant",
    version="0.1.0",
)

# Permitir que el frontend (React) hable con el backend
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "production":
    # En producción acepta cualquier origen *.up.railway.app + el dominio configurado
    allowed_origins = ["*"]
else:
    allowed_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]
    if FRONTEND_URL:
        allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=ENVIRONMENT != "production",  # credentials no funciona con allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar los routers (grupos de endpoints)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(tenant.router, prefix="/api/v1")
app.include_router(licitaciones.router, prefix="/api/v1")
app.include_router(prospector.router, prefix="/api/v1")
app.include_router(inmobiliaria.router, prefix="/api/v1")
app.include_router(adjudicadas.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(cron.router, prefix="/api/v1")


@app.on_event("startup")
def run_migrations():
    """Aplica migraciones de columnas faltantes de forma segura al arrancar."""
    from app.core.database import engine
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS licitaciones_ganadas_count INTEGER DEFAULT 0",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS alarma_fecha TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS alarma_motivo VARCHAR",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS excluido BOOLEAN DEFAULT FALSE",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS excluido_at TIMESTAMP",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS in_pipeline BOOLEAN DEFAULT FALSE",
        "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS notes_history JSONB DEFAULT '[]'",
        "ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS niche_config JSONB DEFAULT '{}'",
        "ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'",
        "ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP",
        # Agregar valores faltantes al enum moduletype
        "ALTER TYPE moduletype ADD VALUE IF NOT EXISTS 'inmobiliaria'",
        "ALTER TYPE moduletype ADD VALUE IF NOT EXISTS 'licitaciones'",
        "ALTER TYPE moduletype ADD VALUE IF NOT EXISTS 'adjudicadas'",
        # Columnas nuevas
        "ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS pipeline_type VARCHAR(50) NOT NULL DEFAULT 'general'",
    ]
    try:
        with engine.begin() as conn:
            for sql in migrations:
                conn.execute(text(sql))
        print("✅ Migraciones aplicadas correctamente")
    except Exception as e:
        print(f"⚠️  Error en migraciones: {e}")

    # Inyectar niche_config por defecto en módulos que tienen config vacía
    try:
        import json as _json
        from app.api.v1.admin import DEFAULT_NICHE_CONFIGS
        with engine.begin() as conn:
            for mod_name, cfg in DEFAULT_NICHE_CONFIGS.items():
                conn.execute(
                    text(
                        "UPDATE tenant_modules SET niche_config = :cfg::jsonb "
                        "WHERE module::text = :mod "
                        "AND (niche_config IS NULL OR niche_config::text = '{}' OR niche_config::text = 'null')"
                    ),
                    {"cfg": _json.dumps(cfg), "mod": mod_name},
                )
        print("✅ niche_config por defecto inyectado en módulos vacíos")
    except Exception as e:
        print(f"⚠️  Error inyectando niche_config: {e}")


@app.get("/")
def root():
    return {"status": "Kapturo API funcionando"}

@app.get("/health")
def health():
    return {"status": "ok"}
