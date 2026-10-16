from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import models
from app.schemas.charger import ChargerCreate, ChargerResponse
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[ChargerResponse])
def get_chargers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la lista de todos los cargadores activos (Requiere estar logueado)."""
    return db.query(models.Charger).filter(models.Charger.is_active == True).order_by(models.Charger.id.desc()).all()

@router.post("/", response_model=ChargerResponse)
def create_charger(
    charger_in: ChargerCreate,
    db: Session = Depends(get_db),
    # Protegemos la ruta: Solo SuperAdmin o Admin pueden crear
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"])) 
):
    """Crea un nuevo cargador en la red."""
    exists = db.query(models.Charger).filter(models.Charger.serial_number == charger_in.serial_number).first()
    if exists:
        raise HTTPException(status_code=400, detail="El número de serie ya está registrado.")
    
    new_charger = models.Charger(
        serial_number=charger_in.serial_number,
        status=charger_in.status,
        power_kw=charger_in.power_kw,
        location=charger_in.location.model_dump(), # Convertimos Pydantic a JSON para PostgreSQL
        company_id=charger_in.company_id
    )
    db.add(new_charger)
    db.commit()
    db.refresh(new_charger)
    return new_charger

# ==========================================
# ¡NUEVO! Ruta para EDITAR un cargador
# ==========================================
@router.put("/{charger_id}", response_model=ChargerResponse)
def update_charger(
    charger_id: int,
    charger_in: ChargerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Actualiza la información de un cargador existente."""
    charger = db.query(models.Charger).filter(models.Charger.id == charger_id, models.Charger.is_active == True).first()
    if not charger:
        raise HTTPException(status_code=404, detail="Cargador no encontrado.")
        
    # Verificar que el nuevo serial_number no esté usado por otro cargador
    if charger.serial_number != charger_in.serial_number:
        exists = db.query(models.Charger).filter(models.Charger.serial_number == charger_in.serial_number).first()
        if exists:
            raise HTTPException(status_code=400, detail="El nuevo número de serie ya está en uso.")

    charger.serial_number = charger_in.serial_number
    charger.power_kw = charger_in.power_kw
    charger.location = charger_in.location.model_dump()
    
    db.commit()
    db.refresh(charger)
    return charger

# ==========================================
# ¡NUEVO! Ruta para ELIMINAR (Borrado lógico)
# ==========================================
@router.delete("/{charger_id}")
def delete_charger(
    charger_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin"])) # Solo SuperAdmin puede borrar
):
    """Realiza un borrado lógico (is_active = False) del cargador."""
    charger = db.query(models.Charger).filter(models.Charger.id == charger_id).first()
    if not charger:
        raise HTTPException(status_code=404, detail="Cargador no encontrado.")
    
    # Hacemos un borrado lógico (desactivamos) en lugar de borrarlo físicamente 
    # para no romper el historial de transacciones financieras
    charger.is_active = False
    db.commit()
    return {"detail": "Cargador eliminado correctamente de la red."}