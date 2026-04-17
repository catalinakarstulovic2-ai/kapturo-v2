# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (full stack)
```bash
./start.sh          # Mata puertos 8000/5173/5174 y arranca backend + frontend
```

### Frontend (`/frontend`)
```bash
npm run dev         # Vite dev server en puerto 5173
npm run build       # TypeScript check + bundle Vite
npm run preview     # Preview del build de producción
```

### Backend (`/backend`)
```bash
uvicorn main:app --reload --port 8000   # Dev con hot-reload
python create_tables.py                  # Crear tablas (solo primera vez o en producción)
```

### Database migrations
Las migraciones se aplican automáticamente al arrancar (`ALTER TABLE ... IF NOT EXISTS`) en el hook `startup` de FastAPI en `main.py`. Para cambios estructurales nuevos, agregar sentencias SQL seguras ahí.

## Architecture

### Monorepo structure
- `frontend/` — React 18 + Vite + TypeScript + Zustand + TanStack Query + Tailwind
- `backend/` — FastAPI + SQLAlchemy 2 + PostgreSQL + Celery + Redis
- `workers/` — Tareas Celery de background (sync de licitaciones, comentarios sociales)

### Backend layout (`backend/app/`)

| Carpeta | Propósito |
|---|---|
| `core/` | Config, DB session, seguridad JWT, middleware |
| `models/` | ORM SQLAlchemy (entidad central: `Prospect` con 100+ columnas) |
| `api/v1/` | Routers FastAPI; subrutas en `api/v1/modules/` |
| `modules/` | Clientes de APIs externas + normalizadores + scorers por módulo |
| `agents/` | Agentes Claude (qualifier, writer, followup, cleaner) |
| `services/` | Lógica de negocio pesada (los archivos más grandes son `licitaciones_service.py` y `adjudicadas_service.py`) |
| `workers/tasks/` | Tareas Celery asíncronas |

### Frontend layout (`frontend/src/`)

| Carpeta | Propósito |
|---|---|
| `pages/` | Una carpeta por módulo (auth, dashboard, prospects, pipeline, modules, agents, settings…) |
| `components/` | UI reutilizable y layouts |
| `store/` | Zustand stores (`authStore`, `adjudicadasStore`, `notesStore`) |
| `api/client.ts` | Instancia Axios con interceptor JWT y handler 401 → logout |
| `types/` | Interfaces TypeScript compartidas |

### Multi-tenancy
Todo recurso (prospect, user, configuración) está scoped a `tenant_id`. Los módulos activos del tenant se leen en `authStore` y controlan qué rutas son visibles.

### Módulos de negocio
Cada módulo es autocontenido con su cliente de API externa, normalizador y scorer:
- **licitaciones** — Tenders de Mercado Público Chile
- **adjudicadas** — Tenders adjudicados ganados
- **prospector** — Prospección B2B (Apollo, Hunter, Google Maps, Apify)
- **inmobiliaria** — Módulo inmobiliario (redes sociales + scoring)

### AI agents
`backend/app/agents/base_agent.py` define la estructura base. Los agentes usan el SDK de Anthropic para calificar prospectos, generar emails, gestionar seguimientos y limpiar datos. Los endpoints están en `api/v1/agents.py`.

### Authentication flow
JWT de 7 días. El interceptor de Axios inyecta el token automáticamente. Soporte de impersonación para super-admin (usa `user_id`, no email). Al cargar la app, siempre se llama `/auth/me` para obtener módulos frescos del tenant.

### Dev proxy
En desarrollo, el frontend proxea `/api/*` al backend en `localhost:8000` via `vite.config.ts`.

## Key environment variables
Ver `backend/.env.example` para la lista completa. Las principales:
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY` — JWT signing key
- `ANTHROPIC_API_KEY` — Claude agents
- `APOLLO_API_KEY`, `APIFY_API_TOKEN` — Prospección
- `RESEND_API_KEY`, `META_WHATSAPP_TOKEN` — Mensajería
