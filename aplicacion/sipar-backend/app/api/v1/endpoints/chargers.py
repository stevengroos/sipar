from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import models
from app.schemas.charger import ChargerCreate, ChargerResponse
from app.api import deps
from app.api.v1.endpoints.ws_ocpp import conexiones_activas  # <-- Importamos los cargadores conectados en vivo

router = APIRouter()

@router.get("/", response_model=List[ChargerResponse])
def get_chargers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la lista de todos los cargadores activos y sincroniza su estado real en vivo."""
    cargadores = db.query(models.Charger).filter(models.Charger.is_active == True).order_by(models.Charger.id.desc()).all()
    
    hubo_cambios = False
    for c in cargadores:
        esta_conectado = c.serial_number in conexiones_activas
        
        # 1. Si NO está conectado al WebSocket pero la DB dice que está disponible/en_uso -> Lo apagamos
        if not esta_conectado and c.status != "fuera_de_linea":
            c.status = "fuera_de_linea"
            for con in c.connectors:
                if con.status != "fuera_de_linea":
                    con.status = "fuera_de_linea"
            hubo_cambios = True
            
        # 2. Si SÍ está conectado al WebSocket pero la DB decía fuera_de_linea -> Lo ponemos disponible
        elif esta_conectado and c.status == "fuera_de_linea":
            c.status = "disponible"
            hubo_cambios = True

    if hubo_cambios:
        db.commit()
        
    return cargadores

@router.post("/", response_model=ChargerResponse)
def create_charger(
    charger_in: ChargerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"])) 
):
    """Crea un nuevo cargador en la red."""
    exists = db.query(models.Charger).filter(models.Charger.serial_number == charger_in.serial_number).first()
    if exists:
        raise HTTPException(status_code=400, detail="El número de serie ya está registrado.")
    
    # Verificamos si ya está conectado por WebSocket; si no, nace como "fuera_de_linea"
    estado_inicial = "disponible" if charger_in.serial_number in conexiones_activas else "fuera_de_linea"
    
    new_charger = models.Charger(
        serial_number=charger_in.serial_number,
        status=estado_inicial,
        power_kw=charger_in.power_kw,
        location=charger_in.location.model_dump(),
        company_id=charger_in.company_id
    )
    db.add(new_charger)
    db.commit()
    db.refresh(new_charger)
    return new_charger

# ==========================================
# Ruta para EDITAR un cargador
# ==========================================
@router.put("/{charger_id}", response_model=ChargerResponse)
def update_charger(
    charger_id: int,
    charger_in: ChargerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza la información de un cargador existente."""
    charger = db.query(models.Charger).filter(models.Charger.id == charger_id, models.Charger.is_active == True).first()
    if not charger:
        raise HTTPException(status_code=404, detail="Cargador no encontrado.")
        
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
# Ruta para ELIMINAR (Borrado lógico)
# ==========================================
@router.delete("/{charger_id}")
def delete_charger(
    charger_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "Super Admin"]))
):
    """Realiza un borrado lógico (is_active = False) del cargador."""
    charger = db.query(models.Charger).filter(models.Charger.id == charger_id).first()
    if not charger:
        raise HTTPException(status_code=404, detail="Cargador no encontrado.")
    
    charger.is_active = False
    db.commit()
    return {"detail": "Cargador eliminado correctamente de la red."}