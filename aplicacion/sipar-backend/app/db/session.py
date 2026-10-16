# app/db/session.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Configuración Enterprise: pool_pre_ping evita caídas si la BD se reinicia
engine = create_engine(
    settings.DATABASE_URL, 
    pool_pre_ping=True, 
    pool_size=20, 
    max_overflow=15
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Inyector de dependencias para FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() # Vital para evitar Fugas de Conexiones