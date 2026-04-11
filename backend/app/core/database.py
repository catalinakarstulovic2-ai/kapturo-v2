from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependencia de FastAPI: abre y cierra la sesión de BD por cada request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
