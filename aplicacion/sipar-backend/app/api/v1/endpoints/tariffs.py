from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

# --- ESQUEMAS PYDANTIC ---
class ChargerSimple(BaseModel):
    id: int
    serial_number: str
    class Config:
        from_attributes = True

class TariffResponse(BaseModel):
    id: int
    name: str
    price_kwh: float
    connection_fee: float
    is_active: bool
    chargers: List[ChargerSimple] = [] # Aquí devolveremos los cargadores asociados

    class Config:
        from_attributes = True

class TariffCreateUpdate(BaseModel):
    name: str
    price_kwh: float
    connection_fee: float
    # El usuario enviará una lista de IDs de cargadores para aplicarles esta tarifa
    charger_ids: List[int] = [] 

# --- RUTAS ---
@router.get("/", response_model=List[TariffResponse])
def get_tariffs(db: Session = Depends(get_db)):
    """Obtiene todas las tarifas y los cargadores asociados a ellas."""
    return db.query(models.Tariff).order_by(models.Tariff.id.desc()).all()

@router.post("/", response_model=TariffResponse)
def create_tariff(
    tariff_in: TariffCreateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Crea una nueva tarifa y la asigna a los cargadores seleccionados."""
    if db.query(models.Tariff).filter(models.Tariff.name == tariff_in.name).first():
        raise HTTPException(status_code=400, detail="Ya existe una tarifa con este nombre.")
        
    new_tariff = models.Tariff(
        name=tariff_in.name,
        price_kwh=tariff_in.price_kwh,
        connection_fee=tariff_in.connection_fee,
        is_active=True
    )
    db.add(new_tariff)
    db.commit()
    db.refresh(new_tariff)
    
    # Asignar a cargadores seleccionados
    if tariff_in.charger_ids:
        db.query(models.Charger).filter(models.Charger.id.in_(tariff_in.charger_ids)).update(
            {"tariff_id": new_tariff.id}, synchronize_session=False
        )
        db.commit()
        db.refresh(new_tariff)
        
    return new_tariff

@router.put("/{tariff_id}", response_model=TariffResponse)
def update_tariff(
    tariff_id: int,
    tariff_in: TariffCreateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Actualiza una tarifa y sus cargadores asignados."""
    tariff = db.query(models.Tariff).filter(models.Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada.")
        
    if tariff.name != tariff_in.name:
        if db.query(models.Tariff).filter(models.Tariff.name == tariff_in.name).first():
            raise HTTPException(status_code=400, detail="El nombre ya está en uso.")
            
    tariff.name = tariff_in.name
    tariff.price_kwh = tariff_in.price_kwh
    tariff.connection_fee = tariff_in.connection_fee
    
    # 1. Primero, desasignar esta tarifa de todos los cargadores que la tenían
    db.query(models.Charger).filter(models.Charger.tariff_id == tariff_id).update(
        {"tariff_id": None}, synchronize_session=False
    )
    
    # 2. Luego, asignarla solo a los nuevos IDs seleccionados
    if tariff_in.charger_ids:
        db.query(models.Charger).filter(models.Charger.id.in_(tariff_in.charger_ids)).update(
            {"tariff_id": tariff.id}, synchronize_session=False
        )
        
    db.commit()
    db.refresh(tariff)
    return tariff

@router.delete("/{tariff_id}")
def delete_tariff(
    tariff_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin"]))
):
    """Borrado lógico de la tarifa. (Aún si se desactiva, el registro histórico se mantiene)."""
    tariff = db.query(models.Tariff).filter(models.Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada.")
    
    tariff.is_active = False
    
    # Opcional: Podrías desvincular los cargadores para obligar a ponerles una tarifa nueva
    db.query(models.Charger).filter(models.Charger.tariff_id == tariff_id).update(
        {"tariff_id": None}, synchronize_session=False
    )
    
    db.commit()
    return {"detail": "Tarifa desactivada correctamente."}