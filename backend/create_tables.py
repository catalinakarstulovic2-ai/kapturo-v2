"""Script para crear todas las tablas en la base de datos."""
import sys
sys.path.insert(0, ".")

from app.core.database import Base, engine
from app.models import *  # importa todos los modelos

print("Creando tablas...")
Base.metadata.create_all(bind=engine)
print("Tablas creadas exitosamente.")
