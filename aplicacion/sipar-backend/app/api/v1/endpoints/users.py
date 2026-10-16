from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.schemas.user import UserResponse
from app.api import deps

# Si ya tienes una función para encriptar contraseñas en tu proyecto, 
# impórtala aquí. Por ejemplo:
# from app.core.security import get_password_hash

router = APIRouter()

# Esquema para recibir los datos desde React
class UserCreateUpdate(BaseModel):
    first_name: str
    last_name: str
    email: str
    role: str
    password: Optional[str] = None  # Es opcional para cuando solo editamos el nombre/rol

# ==========================================
# 1. OBTENER USUARIOS
# ==========================================
@router.get("/", response_model=List[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin"]))
):
    """Obtiene la lista de todos los usuarios registrados activos."""
    # Filtramos para que solo traiga los que is_active == True
    return db.query(models.User).filter(models.User.is_active == True).order_by(models.User.id.desc()).all()

# ==========================================
# 2. CREAR USUARIO
# ==========================================
@router.post("/", response_model=UserResponse)
def create_user(
    user_in: UserCreateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin"])) # Solo SuperAdmin crea
):
    """Crea un nuevo usuario interno en el sistema."""
    if db.query(models.User).filter(models.User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado.")
        
    new_user = models.User(
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        email=user_in.email,
        role=user_in.role,
        is_active=True,
        # ¡CORRECCIÓN! Agregamos el company_id por defecto para evitar el IntegrityError de Postgres
        company_id=1, 
        hashed_password=user_in.password 
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# ==========================================
# 3. EDITAR USUARIO
# ==========================================
@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserCreateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin"]))
):
    """Actualiza los datos o contraseña de un usuario."""
    user = db.query(models.User).filter(models.User.id == user_id, models.User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        
    # Verificar que el nuevo correo no pertenezca a otra persona
    if user.email != user_in.email:
        if db.query(models.User).filter(models.User.email == user_in.email).first():
            raise HTTPException(status_code=400, detail="El correo ya está en uso por otra cuenta.")
            
    user.first_name = user_in.first_name
    user.last_name = user_in.last_name
    user.email = user_in.email
    user.role = user_in.role
    
    # Solo actualizamos la contraseña si el admin escribió una nueva
    if user_in.password and user_in.password.strip() != "":
        user.hashed_password = user_in.password # Encriptar aquí también
        
    db.commit()
    db.refresh(user)
    return user

# ==========================================
# 4. SUSPENDER USUARIO (Borrado Lógico)
# ==========================================
@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin"]))
):
    """Realiza un borrado lógico (is_active = False) del usuario."""
    # Seguridad de oro: Evitar que el admin activo se borre a sí mismo
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes suspender tu propia cuenta.")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    user.is_active = False
    db.commit()
    return {"detail": "Cuenta suspendida exitosamente."}