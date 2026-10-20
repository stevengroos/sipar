from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.models import models
from app.schemas.token import TokenPayload

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Desencripta el token JWT y devuelve el usuario real de la base de datos."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = str(payload.get("sub"))
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=user_id, role=payload.get("role"))
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.id == int(token_data.sub)).first()
    if user is None:
        raise credentials_exception
    return user

def get_current_active_user(current_user: models.User = Depends(get_current_user)):
    """Asegura que el usuario no esté desactivado."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user

def RoleChecker(allowed_roles: list):
    """Verifica si el rol del usuario coincide con los roles permitidos (insensible a mayúsculas/espacios)."""
    normalized_allowed = [r.lower().replace(" ", "") for r in allowed_roles]
    
    def role_checker(current_user: models.User = Depends(get_current_active_user)):
        user_role_norm = (current_user.role or "").lower().replace(" ", "")
        # El superadmin siempre tiene acceso total
        if user_role_norm == "superadmin" or user_role_norm in normalized_allowed:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="No tienes permisos suficientes para realizar esta acción"
        )
    return role_checker

def PermissionChecker(permission_key: str):
    """Verifica en la tabla de Roles si el rol del usuario tiene activado un permiso específico (ej. 'cargadores_editar')."""
    def permission_checker(
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_active_user)
    ):
        user_role_norm = (current_user.role or "").lower().replace(" ", "")
        if user_role_norm in ["superadmin", "admin"]:
            return current_user
            
        role_db = db.query(models.Role).filter(models.Role.name == current_user.role).first()
        if role_db and isinstance(role_db.permissions, dict):
            if role_db.permissions.get(permission_key) is True:
                return current_user
                
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tu rol ({current_user.role}) no tiene el permiso requerido: {permission_key}"
        )
    return permission_checker