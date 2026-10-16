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

@router.post("/login", response_model=Token)
def login_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    """Autentica un usuario usando su email (username) y contraseña, devuelve un Token JWT."""
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    # Comparamos la contraseña en texto plano contra el hash de la BD
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user.id, role=user.role, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register")
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """Crea un usuario nuevo con la contraseña encriptada."""
    user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    new_user = models.User(
        email=user_in.email,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        company_id=user_in.company_id,
        role=user_in.role,
        hashed_password=security.get_password_hash(user_in.password) # <- Magia criptográfica aquí
    )
    db.add(new_user)
    db.commit()
    return {"message": f"Usuario {user_in.email} creado con éxito."}