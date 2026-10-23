# app/api/v1/endpoints/users.py
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.schemas.user import UserResponse
from app.api import deps
from app.core import security
from app.api.v1.endpoints.auth import validate_iso27001_password, log_security_event, get_client_ip

router = APIRouter()

class UserCreateUpdate(BaseModel):
    first_name: str
    last_name: str
    email: str
    role: str
    password: Optional[str] = None
    must_change_password: Optional[bool] = False
    is_active: Optional[bool] = True

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    actor_email: Optional[str] = ""
    action: str
    target: Optional[str] = ""
    ip_address: Optional[str] = ""
    status: str
    details: Optional[str] = ""
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# 1. OBTENER USUARIOS (ACTIVOS Y SUSPENDIDOS)
# ==========================================
@router.get("/", response_model=List[UserResponse])
def get_users(
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Obtiene la lista de usuarios junto con su estado de cumplimiento ISO 27001."""
    query = db.query(models.User)
    if not include_inactive:
        query = query.filter(models.User.is_active == True)
    return query.order_by(models.User.id.desc()).all()

# ==========================================
# 2. HISTORIAL DE AUDITORÍA ISO 27001
# ==========================================
@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_security_audit_logs(
    limit: int = Query(150, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Devuelve la bitácora inmutable de eventos de seguridad (Control ISO 27001 A.8.15)."""
    return db.query(models.SecurityAuditLog).order_by(models.SecurityAuditLog.id.desc()).limit(limit).all()

# ==========================================
# 3. CREAR USUARIO CON POLÍTICA ISO 27001
# ==========================================
@router.post("/", response_model=UserResponse)
def create_user(
    user_in: UserCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "Super Admin"]))
):
    """Crea un nuevo usuario interno validando complejidad de contraseña."""
    if db.query(models.User).filter(models.User.email == user_in.email.strip()).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado.")
        
    if not user_in.password:
        raise HTTPException(status_code=400, detail="La contraseña inicial es obligatoria.")

    validate_iso27001_password(user_in.password)

    new_user = models.User(
        first_name=user_in.first_name.strip(),
        last_name=user_in.last_name.strip(),
        email=user_in.email.strip(),
        role=user_in.role,
        is_active=True,
        company_id=1,
        hashed_password=security.get_password_hash(user_in.password),
        password_changed_at=datetime.now(timezone.utc),
        must_change_password=bool(user_in.must_change_password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_security_event(
        db, "USER_CREATED", current_user.email, new_user.email, get_client_ip(request),
        "SUCCESS", f"Usuario creado con rol '{new_user.role}'", current_user.id
    )
    return new_user

# ==========================================
# 4. EDITAR USUARIO / ROL / CONTRASEÑA
# ==========================================
@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "Super Admin"]))
):
    """Actualiza datos, rol, estado o fuerza reseteo de contraseña cumpliendo ISO 27001."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        
    if user.email != user_in.email.strip():
        if db.query(models.User).filter(models.User.email == user_in.email.strip()).first():
            raise HTTPException(status_code=400, detail="El correo ya está en uso por otra cuenta.")
            
    cambios = []
    if user.role != user_in.role:
        cambios.append(f"rol ({user.role} -> {user_in.role})")
    if user_in.is_active is not None and user.is_active != user_in.is_active:
        if current_user.id == user_id and not user_in.is_active:
            raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta.")
        user.is_active = user_in.is_active
        cambios.append("estado (" + ("Reactivado" if user.is_active else "Suspendido") + ")")

    user.first_name = user_in.first_name.strip()
    user.last_name = user_in.last_name.strip()
    user.email = user_in.email.strip()
    user.role = user_in.role
    if user_in.must_change_password is not None:
        user.must_change_password = user_in.must_change_password
    
    if user_in.password and user_in.password.strip() != "":
        validate_iso27001_password(user_in.password)
        user.hashed_password = security.get_password_hash(user_in.password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.failed_login_attempts = 0
        user.locked_until = None
        cambios.append("reseteo administrativo de contraseña")
        
    db.commit()
    db.refresh(user)

    detalle = ", ".join(cambios) if cambios else "actualización de datos generales"
    log_security_event(
        db, "USER_UPDATED", current_user.email, user.email, get_client_ip(request),
        "SUCCESS", f"Modificación de cuenta: {detalle}", current_user.id
    )
    return user

# ==========================================
# 5. DESBLOQUEAR CUENTA (LOCKOUT RESET)
# ==========================================
@router.post("/{user_id}/unlock", response_model=UserResponse)
def unlock_user_account(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Desbloquea manualmente una cuenta bloqueada por intentos fallidos o suspendida."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.is_active = True
    db.commit()
    db.refresh(user)

    log_security_event(
        db, "ACCOUNT_UNLOCKED", current_user.email, user.email, get_client_ip(request),
        "SUCCESS", "Desbloqueo manual y reactivación de cuenta por administrador", current_user.id
    )
    return user

# ==========================================
# 6. RESETEAR MFA / 2FA DE EMERGENCIA
# ==========================================
@router.post("/{user_id}/reset-mfa", response_model=UserResponse)
def admin_reset_user_mfa(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "Super Admin"]))
):
    """Permite al SuperAdmin revocar el 2FA de un usuario en caso de pérdida de dispositivo."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    user.mfa_enabled = False
    user.mfa_secret = None
    db.commit()
    db.refresh(user)

    log_security_event(
        db, "MFA_ADMIN_RESET", current_user.email, user.email, get_client_ip(request),
        "WARNING", "Revocación administrativa de 2FA por cambio/extravío de dispositivo", current_user.id
    )
    return user

# ==========================================
# 7. SUSPENDER USUARIO (Borrado Lógico)
# ==========================================
@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "Super Admin"]))
):
    """Realiza un borrado lógico (is_active = False) del usuario."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes suspender tu propia cuenta.")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    user.is_active = False
    db.commit()

    log_security_event(
        db, "USER_SUSPENDED", current_user.email, user.email, get_client_ip(request),
        "DANGER", "Cuenta suspendida y acceso revocado", current_user.id
    )
    return {"detail": "Cuenta suspendida exitosamente."}