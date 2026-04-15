"""
Worker del módulo Adjudicadas.
Corre cada 24 horas a las 3am.
"""
import asyncio
from app.core.database import SessionLocal
from app.models.tenant import TenantModule, ModuleType
from app.services.adjudicadas_service import AdjudicadasService


async def correr_para_todos_los_tenants():
    db = SessionLocal()
    try:
        tenants = db.query(TenantModule).filter(
            TenantModule.module == ModuleType.adjudicadas,
            TenantModule.is_active == True
        ).all()

        for tm in tenants:
            try:
                svc = AdjudicadasService(db, tm.tenant_id)
                resultado = await svc.correr_agente()
                print(f"Tenant {tm.tenant_id}: {resultado['guardadas']} licitaciones guardadas")
            except Exception as e:
                print(f"Error en tenant {tm.tenant_id}: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(correr_para_todos_los_tenants())
