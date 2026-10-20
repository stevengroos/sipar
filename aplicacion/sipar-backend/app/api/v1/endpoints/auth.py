from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import models
from app.core import security
from app.core.config import settings
from app.schemas.token import Token
from app.schemas.user import UserCreate

router = APIRouter()

def get_session_Duration_minutes(db: Session) -> int:
    """Lee la configuración global y devuelve los minutos de duración del token JWT."""
    sys_config = db.query(models.SystemConfig).first()
    if not sys_config or not sys_config.security_session:
        return settings.ACCESS_TOKEN_EXPIRE_MINUTES
    
    opcion = sys_config.security_session.lower()
    if "15" in opcion:
        return 15
    elif "30" in opcion:
        return 30
    elif "1 hora" in opcion or "60" in opcion:
        return 60
    return settings.ACCESS_TOKEN_EXPIRE_MINUTES

@router.post("/login", response_model=Token)
def login_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    """Autentica un usuario usando su email (username) y contraseña, devuelve un Token JWT."""
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    
    # Obtenemos la expiración dinámica desde la pantalla de Configuración
    expire_minutes = get_session_Duration_minutes(db)
    access_token_expires = timedelta(minutes=expire_minutes)
    
    access_token = security.create_access_token(
        subject=user.id, role=user.role, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register")
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """Crea un usuario nuevo con la contraseña encriptada y validada según la política activa."""
    user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    # Validamos política de contraseñas si está activa en Configuración
    sys_config = db.query(models.SystemConfig).first()
    if sys_config and sys_config.security_password != "No exigir rotación":
        if len(user_in.password) < 8:
            raise HTTPException(
                status_code=400, 
                detail="Por política de seguridad ISO 27001, la contraseña debe tener al menos 8 caracteres."
            )
    
    new_user = models.User(
        email=user_in.email,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        company_id=user_in.company_id,
        role=user_in.role,
        hashed_password=security.get_password_hash(user_in.password)
    )
    db.add(new_user)
    db.commit()
    return {"message": f"Usuario {user_in.email} creado con éxito."}