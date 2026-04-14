import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, admin, tenant, dashboard
from app.api.v1.modules import licitaciones
from app.api.v1.modules import prospector
from app.api.v1.modules import inmobiliaria
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
    ]
    try:
        with engine.begin() as conn:
            for sql in migrations:
                conn.execute(text(sql))
        print("✅ Migraciones aplicadas correctamente")
    except Exception as e:
        print(f"⚠️  Error en migraciones: {e}")


@app.get("/")
def root():
    return {"status": "Kapturo API funcionando"}

@app.get("/health")
def health():
    return {"status": "ok"}
