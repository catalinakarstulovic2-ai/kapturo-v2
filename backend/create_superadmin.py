"""Crea o resetea el super admin en la base de datos de producción."""
import sys
sys.path.insert(0, ".")

from app.core.database import Base, engine, SessionLocal
from app.models import *  # importa todos los modelos
from app.models.user import User, UserRole
from app.core.security import hash_password

# Crear tablas si no existen
Base.metadata.create_all(bind=engine)
print("✅ Tablas verificadas")

db = SessionLocal()

EMAIL = "catalina.karstulovic2@gmail.com"
PASSWORD = "Kapturo123!"

user = db.query(User).filter(User.email == EMAIL).first()

if user:
    # Resetear contraseña y rol
    user.hashed_password = hash_password(PASSWORD)
    user.role = UserRole.super_admin
    user.is_active = True
    db.commit()
    print(f"✅ Usuario actualizado: {EMAIL} → role=super_admin")
else:
    # Crear desde cero (sin tenant)
    user = User(
        email=EMAIL,
        full_name="Catalina Karstulovic",
        hashed_password=hash_password(PASSWORD),
        role=UserRole.super_admin,
        is_active=True,
        tenant_id=None,
    )
    db.add(user)
    db.commit()
    print(f"✅ Super admin creado: {EMAIL}")

db.close()
print("Listo.")
