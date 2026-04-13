"""
Migración: agrega columna licitaciones_ganadas_count a la tabla prospects.

Uso:
    cd backend
    python migrate_add_enrichment_fields.py
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.core.database import engine


def run():
    with engine.connect() as conn:
        # licitaciones_ganadas_count
        try:
            conn.execute(text(
                "ALTER TABLE prospects ADD COLUMN licitaciones_ganadas_count INTEGER DEFAULT 0"
            ))
            conn.commit()
            print("✅  Columna licitaciones_ganadas_count agregada")
        except Exception as e:
            print(f"⚠️   licitaciones_ganadas_count: {e}")

    print("Migración completada.")


if __name__ == "__main__":
    run()
