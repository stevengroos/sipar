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

def seed_default_roles(db: Session):
    """Crea los roles base automáticamente si la tabla está vacía."""
    roles = db.query(models.Role).order_by(models.Role.id.asc()).all()
    if not roles:
        default_roles = [
            models.Role(
                name="Super Admin",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": True,
                    "usuarios_ver": True, "usuarios_editar": True,
                    "finanzas_ver": True, "finanzas_editar": True,
                    "admin_ver": True, "admin_editar": True,
                }
            ),
            models.Role(
                name="Operador Técnico",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": True,
                    "usuarios_ver": True, "usuarios_editar": False,
                    "finanzas_ver": False, "finanzas_editar": False,
                    "admin_ver": False, "admin_editar": False,
                }
            ),
            models.Role(
                name="Auditor Financiero",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": False,
                    "usuarios_ver": False, "usuarios_editar": False,
                    "finanzas_ver": True, "finanzas_editar": True,
                    "admin_ver": False, "admin_editar": False,
                }
            )
        ]
        db.add_all(default_roles)
        db.commit()
        roles = db.query(models.Role).order_by(models.Role.id.asc()).all()
    return roles

@router.get("/", response_model=List[RoleResponse])
def get_roles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la lista de todos los roles (y los inicializa si está vacía)."""
    return seed_default_roles(db)

@router.post("/", response_model=RoleResponse)
def create_role(
    role_in: RoleCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
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
def update_role(
    role_id: int, 
    role_in: RoleCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza un rol existente y sus permisos."""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    
    # Protegemos el rol Super Admin para que no sea bloqueado por error
    if role.name.lower().replace(" ", "") == "superadmin":
        raise HTTPException(status_code=400, detail="El rol Super Admin tiene acceso total y no puede ser modificado.")
    
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