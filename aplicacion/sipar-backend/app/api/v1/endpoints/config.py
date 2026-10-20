from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

class ConfigData(BaseModel):
    security_2fa: bool = False
    security_session: str = "30 minutos (Recomendado)"
    security_password: str = "Exigir rotación cada 90 días"
    notif_hardware: bool = True
    notif_fraud: bool = True
    notif_daily: Optional[bool] = False
    pref_dark_mode: bool = False
    pref_language: str = "Español (Latinoamérica)"

    class Config:
        from_attributes = True

def get_or_create_config(db: Session) -> models.SystemConfig:
    """Obtiene la fila única de configuración o la crea si la tabla está vacía."""
    config = db.query(models.SystemConfig).first()
    if not config:
        config = models.SystemConfig(
            security_2fa=False,
            security_session="30 minutos (Recomendado)",
            security_password="Exigir rotación cada 90 días",
            notif_hardware=True,
            notif_fraud=True,
            notif_daily=False,
            pref_dark_mode=False,
            pref_language="Español (Latinoamérica)"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.get("/", response_model=ConfigData)
def get_system_config(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la configuración global del sistema."""
    return get_or_create_config(db)

@router.put("/", response_model=ConfigData)
def update_system_config(
    config_in: ConfigData,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza la configuración global del sistema (Solo Admin/Superadmin)."""
    config = get_or_create_config(db)
        
    config.security_2fa = config_in.security_2fa
    config.security_session = config_in.security_session
    config.security_password = config_in.security_password
    config.notif_hardware = config_in.notif_hardware
    config.notif_fraud = config_in.notif_fraud
    if config_in.notif_daily is not None:
        config.notif_daily = config_in.notif_daily
    config.pref_dark_mode = config_in.pref_dark_mode
    config.pref_language = config_in.pref_language
    
    db.commit()
    db.refresh(config)
    return config