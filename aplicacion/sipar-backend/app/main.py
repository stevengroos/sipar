from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.endpoints import dashboards, auth, chargers, users, ws_ocpp, config, roles, tariffs, store

# ==========================================
# 1. IMPORTACIONES DE BASE DE DATOS
# ==========================================
from app.db.session import engine
from app.db.base_class import Base
from app.models import models 

# ==========================================
# 2. CREACIÓN DE TABLAS EN SUPABASE
# ==========================================
Base.metadata.create_all(bind=engine)

def get_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Motor Backend para gestión de red de carga de VE (ISO 27001)"
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # RUTAS
    application.include_router(dashboards.router, prefix="/api/v1/dashboards", tags=["Dashboards"])
    application.include_router(auth.router, prefix="/api/v1/auth", tags=["Autenticación"])
    application.include_router(chargers.router, prefix="/api/v1/chargers", tags=["Cargadores"])
    application.include_router(users.router, prefix="/api/v1/users", tags=["Usuarios"])
    application.include_router(ws_ocpp.router, prefix="/api/v1/ocpp", tags=["OCPP WebSocket"])
    application.include_router(config.router, prefix="/api/v1/config", tags=["Configuración del Sistema"])
    application.include_router(roles.router, prefix="/api/v1/roles", tags=["Roles y Permisos"])
    application.include_router(tariffs.router, prefix="/api/v1/tariffs", tags=["Tarifas y Cargadores"])
    application.include_router(store.router, prefix="/api/v1/store", tags=["Tienda de Cargadores"])

    return application

app = get_application()

@app.get("/")
def health_check():
    return {"status": "ok", "system": settings.PROJECT_NAME}