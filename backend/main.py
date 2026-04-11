import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, admin, tenant, dashboard
from app.api.v1.modules import licitaciones
from app.api.v1.modules import prospector
from app.api.v1 import pipeline, agents, messages

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
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"status": "Kapturo API funcionando"}
