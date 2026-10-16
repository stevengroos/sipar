from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

class RoleCreate(BaseModel):
    name: str
    permissions: Any

class RoleResponse(RoleCreate):
    id: int
    class Config:
        from_attributes = True

@router.get("/", response_model=List[RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    """Obtiene la lista de todos los roles."""
    return db.query(models.Role).all()

@router.post("/", response_model=RoleResponse)
def create_role(role_in: RoleCreate, db: Session = Depends(get_db)):
    """Crea un nuevo rol con sus permisos específicos."""
    exists = db.query(models.Role).filter(models.Role.name == role_in.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ya existe un rol con este nombre.")
    
    new_role = models.Role(name=role_in.name, permissions=role_in.permissions)
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role

@router.put("/{role_id}", response_model=RoleResponse)
def update_role(role_id: int, role_in: RoleCreate, db: Session = Depends(get_db)):
    """Actualiza un rol existente y sus permisos."""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    
    # Verificar que el nuevo nombre no lo tenga otro rol
    if role.name != role_in.name:
        exists = db.query(models.Role).filter(models.Role.name == role_in.name).first()
        if exists:
            raise HTTPException(status_code=400, detail="El nombre del rol ya está en uso.")
            
    role.name = role_in.name
    role.permissions = role_in.permissions
    db.commit()
    db.refresh(role)
    return role