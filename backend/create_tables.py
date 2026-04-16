"""Script para crear todas las tablas en la base de datos."""
import sys
sys.path.insert(0, ".")

from app.core.database import Base, engine
from app.models import *  # importa todos los modelos
from sqlalchemy import text

# ── Migrar enums de PostgreSQL (ADD VALUE IF NOT EXISTS es idempotente) ────────
ENUM_MIGRATIONS = [
    ("moduletype", "adjudicadas"),
    ("moduletype", "licitaciones"),
    ("moduletype", "prospector"),
    ("moduletype", "inmobiliaria"),
    ("moduletype", "licitador"),
    ("moduletype", "kapturo_ventas"),
]

print("Migrando enums...")
with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
    for enum_name, value in ENUM_MIGRATIONS:
        try:
            conn.execute(text(
                f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'"
            ))
            print(f"  OK: {enum_name}.{value}")
        except Exception as e:
            print(f"  SKIP: {enum_name}.{value}: {e}")
print("Enums OK.")

print("Creando tablas...")
Base.metadata.create_all(bind=engine)
print("Tablas creadas exitosamente.")
