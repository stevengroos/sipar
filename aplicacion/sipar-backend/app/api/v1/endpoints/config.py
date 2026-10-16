from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

# Definimos el esquema de Pydantic directamente aquí para mantenerlo simple
class ConfigData(BaseModel):
    security_2fa: bool
    security_session: str
    security_password: str
    notif_hardware: bool
    notif_fraud: bool
    notif_daily: bool
    pref_dark_mode: bool
    pref_language: str

    class Config:
        from_attributes = True

@router.get("/", response_model=ConfigData)
def get_system_config(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la configuración global del sistema."""
    config = db.query(models.SystemConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return config

@router.put("/", response_model=ConfigData)
def update_system_config(
    config_in: ConfigData,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Actualiza la configuración global del sistema (Solo Admin/Superadmin)."""
    config = db.query(models.SystemConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
        
    # Actualizamos los valores
    config.security_2fa = config_in.security_2fa
    config.security_session = config_in.security_session
    config.security_password = config_in.security_password
    config.notif_hardware = config_in.notif_hardware
    config.notif_fraud = config_in.notif_fraud
    config.notif_daily = config_in.notif_daily
    config.pref_dark_mode = config_in.pref_dark_mode
    config.pref_language = config_in.pref_language
    
    db.commit()
    db.refresh(config)
    return config