# app/api/v1/endpoints/roles.py
from typing import List, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def log_role_event(
    db: Session,
    user: models.User,
    action: str,
    target: str,
    ip_address: str,
    details: str,
    status: str = "SUCCESS"
):
    try:
        actor_label = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
        log_entry = models.SecurityAuditLog(
            user_id=user.id,
            actor_email=f"{actor_label} ({user.email})",
            action=action,
            target=target,
            ip_address=ip_address,
            status=status,
            details=details
        )
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()

class RoleCreate(BaseModel):
    name: str
    permissions: Any

class RoleResponse(RoleCreate):
    id: int
    class Config:
        from_attributes = True

def seed_default_roles(db: Session):
    """Crea los roles base automáticamente si la tabla está vacía con la matriz de 7 módulos."""
    roles = db.query(models.Role).order_by(models.Role.id.asc()).all()
    if not roles:
        default_roles = [
            models.Role(
                name="Super Admin",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": True,
                    "historial_ver": True, "historial_editar": True,
                    "usuarios_ver": True, "usuarios_editar": True,
                    "finanzas_ver": True, "finanzas_editar": True,
                    "tarifas_ver": True, "tarifas_editar": True,
                    "tienda_ver": True, "tienda_editar": True,
                    "admin_ver": True, "admin_editar": True,
                }
            ),
            models.Role(
                name="Operador Técnico",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": True,
                    "historial_ver": True, "historial_editar": False,
                    "usuarios_ver": True, "usuarios_editar": False,
                    "finanzas_ver": False, "finanzas_editar": False,
                    "tarifas_ver": True, "tarifas_editar": False,
                    "tienda_ver": True, "tienda_editar": True,
                    "admin_ver": False, "admin_editar": False,
                }
            ),
            models.Role(
                name="Auditor Financiero",
                permissions={
                    "cargadores_ver": True, "cargadores_editar": False,
                    "historial_ver": True, "historial_editar": False,
                    "usuarios_ver": False, "usuarios_editar": False,
                    "finanzas_ver": True, "finanzas_editar": True,
                    "tarifas_ver": True, "tarifas_editar": False,
                    "tienda_ver": False, "tienda_editar": False,
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Crea un nuevo rol con sus permisos específicos y registra auditoría."""
    client_ip = get_client_ip(request)
    clean_name = role_in.name.strip()

    exists = db.query(models.Role).filter(models.Role.name.ilike(clean_name)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ya existe un rol con este nombre.")
    
    new_role = models.Role(name=clean_name, permissions=role_in.permissions)
    db.add(new_role)
    db.commit()
    db.refresh(new_role)

    log_role_event(
        db, current_user, "ROLE_CREATED", clean_name, client_ip,
        f"Nuevo rol corporativo creado: '{clean_name}'"
    )
    return new_role

@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int, 
    role_in: RoleCreate, 
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza un rol existente y sus permisos registrando los cambios."""
    client_ip = get_client_ip(request)
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    
    if "super admin" in role.name.lower():
        raise HTTPException(status_code=400, detail="El rol Super Admin tiene acceso total y no puede ser modificado.")
    
    clean_name = role_in.name.strip()
    if role.name.lower() != clean_name.lower():
        exists = db.query(models.Role).filter(models.Role.name.ilike(clean_name)).first()
        if exists:
            raise HTTPException(status_code=400, detail="El nombre del rol ya está en uso.")
            
    old_name = role.name
    role.name = clean_name
    role.permissions = role_in.permissions
    db.commit()
    db.refresh(role)

    log_role_event(
        db, current_user, "ROLE_UPDATED", role.name, client_ip,
        f"Matriz RBAC actualizada para el rol '{old_name}' → '{role.name}'"
    )
    return role

@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Elimina un rol corporativo personalizado."""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")

    if "super admin" in role.name.lower():
        raise HTTPException(status_code=400, detail="El rol Super Admin del sistema no puede ser eliminado.")

    role_name = role.name
    db.delete(role)
    db.commit()

    log_role_event(
        db, current_user, "ROLE_DELETED", role_name, get_client_ip(request),
        f"Rol corporativo '{role_name}' eliminado del sistema", "WARNING"
    )
    return {"detail": f"Rol '{role_name}' eliminado correctamente."}