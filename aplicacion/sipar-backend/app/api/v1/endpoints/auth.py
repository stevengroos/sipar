# app/api/v1/endpoints/auth.py
import hmac
import hashlib
import struct
import base64
import secrets
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models import models
from app.core import security
from app.core.config import settings
from app.schemas.user import UserCreate, UserResponse
from app.api import deps

router = APIRouter()

# =====================================================================
# MOTOR NATIVO TOTP (RFC 6238) Y POLÍTICAS ISO 27001 (SIN LIBRERÍAS EXTERNAS)
# =====================================================================
def generate_totp_secret() -> str:
    """Genera una clave secreta Base32 de 160 bits compatible con Google Authenticator."""
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").rstrip("=")

def _get_totp_token(secret: str, intervals_no: int) -> str:
    padded = secret.upper().replace(" ", "")
    missing_padding = len(padded) % 8
    if missing_padding:
        padded += "=" * (8 - missing_padding)
    key = base64.b32decode(padded, casefold=True)
    msg = struct.pack(">Q", intervals_no)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[19] & 15
    token = (struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000
    return f"{token:06d}"

def verify_totp_code(secret: str, code: str) -> bool:
    """Verifica el código TOTP de 6 dígitos con una ventana de tolerancia de ±30 segundos."""
    if not secret or not code:
        return False
    clean_code = str(code).strip().replace(" ", "")
    if not clean_code.isdigit() or len(clean_code) != 6:
        return False
    current_interval = int(datetime.now(timezone.utc).timestamp()) // 30
    for offset in (-1, 0, 1):
        if hmac.compare_digest(_get_totp_token(secret, current_interval + offset), clean_code):
            return True
    return False

def validate_iso27001_password(password: str):
    """Valida complejidad de contraseña según controles ISO 27001."""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="ISO 27001: La contraseña debe tener al menos 8 caracteres.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="ISO 27001: Debe incluir al menos una letra mayúscula.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="ISO 27001: Debe incluir al menos una letra minúscula.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="ISO 27001: Debe incluir al menos un número.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=/\\[\]]", password):
        raise HTTPException(status_code=400, detail="ISO 27001: Debe incluir al menos un carácter especial (ej. !@#$%).")

def log_security_event(
    db: Session,
    action: str,
    actor_email: str,
    target: str = None,
    ip_address: str = None,
    status: str = "SUCCESS",
    details: str = None,
    user_id: int = None
):
    """Registra un evento inmutable en la tabla de auditoría ISO 27001."""
    log_entry = models.SecurityAuditLog(
        user_id=user_id,
        actor_email=actor_email,
        action=action,
        target=target,
        ip_address=ip_address or "Desconocida",
        status=status,
        details=details
    )
    db.add(log_entry)
    db.commit()

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def get_session_Duration_minutes(db: Session) -> int:
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


# =====================================================================
# ESQUEMAS DE PERFIL Y MFA
# =====================================================================
class MFACodeInput(BaseModel):
    code: str

class MFADisableInput(BaseModel):
    password: str

class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str

class ProfileUpdateInput(BaseModel):
    first_name: str
    last_name: str


# =====================================================================
# ENDPOINTS DE AUTENTICACIÓN Y MI PERFIL
# =====================================================================
@router.post("/login")
def login_access_token(
    request: Request,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
    otp_code: Optional[str] = Form(None)
):
    """
    Autentica un usuario aplicando controles ISO 27001:
    1. Bloqueo de cuenta tras 5 intentos fallidos (15 minutos).
    2. Verificación de estado activo/suspendido.
    3. Verificación de Segundo Factor TOTP (2FA) si el usuario lo tiene habilitado.
    4. Registro de IP, fecha de último acceso y auditoría de seguridad.
    """
    client_ip = get_client_ip(request)
    now_utc = datetime.now(timezone.utc)
    user = db.query(models.User).filter(models.User.email == form_data.username.strip()).first()

    if not user:
        log_security_event(db, "LOGIN_FAILED", form_data.username, "Sistema Auth", client_ip, "WARNING", "Intento de login con correo inexistente")
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos.")

    # 1. Verificar si la cuenta está suspendida
    if not user.is_active:
        log_security_event(db, "LOGIN_BLOCKED", user.email, user.email, client_ip, "DANGER", "Intento de acceso en cuenta suspendida", user.id)
        raise HTTPException(status_code=403, detail="Esta cuenta ha sido suspendida por el administrador.")

    # 2. Verificar bloqueo temporal por fuerza bruta (ISO 27001 A.8.5)
    if user.locked_until and user.locked_until > now_utc:
        remaining_mins = max(1, int((user.locked_until - now_utc).total_seconds() // 60) + 1)
        log_security_event(db, "LOGIN_LOCKED", user.email, user.email, client_ip, "DANGER", f"Cuenta bloqueada temporalmente ({remaining_mins} min restantes)", user.id)
        raise HTTPException(
            status_code=423,
            detail=f"Cuenta bloqueada por múltiples intentos fallidos (ISO 27001). Intente nuevamente en {remaining_mins} minutos."
        )

    # 3. Verificar contraseña
    if not security.verify_password(form_data.password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.locked_until = now_utc + timedelta(minutes=15)
            db.commit()
            log_security_event(db, "ACCOUNT_LOCKED", user.email, user.email, client_ip, "DANGER", "Cuenta bloqueada por 15 min tras 5 intentos fallidos", user.id)
            raise HTTPException(
                status_code=423,
                detail="Ha superado los 5 intentos fallidos. Su cuenta fue bloqueada preventivamente por 15 minutos."
            )
        db.commit()
        intentos_restantes = 5 - user.failed_login_attempts
        log_security_event(db, "LOGIN_FAILED", user.email, user.email, client_ip, "WARNING", f"Contraseña incorrecta ({intentos_restantes} intentos restantes)", user.id)
        raise HTTPException(status_code=400, detail=f"Email o contraseña incorrectos. ({intentos_restantes} intentos restantes)")

    # 4. Verificar MFA / 2FA si está activo en la cuenta
    if user.mfa_enabled and user.mfa_secret:
        if not otp_code:
            # Le indicamos al Frontend que las credenciales son válidas pero falta el segundo factor
            return {
                "mfa_required": True,
                "detail": "Ingrese el código de 6 dígitos de su aplicación autenticadora."
            }
        if not verify_totp_code(user.mfa_secret, otp_code):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            db.commit()
            log_security_event(db, "MFA_FAILED", user.email, user.email, client_ip, "WARNING", "Código 2FA TOTP inválido", user.id)
            raise HTTPException(status_code=400, detail="Código de verificación 2FA incorrecto o expirado.")

    # 5. Login exitoso: Reiniciar contadores de fallo y registrar auditoría
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now_utc
    user.last_login_ip = client_ip
    db.commit()

    expire_minutes = get_session_Duration_minutes(db)
    access_token_expires = timedelta(minutes=expire_minutes)
    access_token = security.create_access_token(
        subject=user.id, role=user.role, expires_delta=access_token_expires
    )

    log_security_event(
        db, "LOGIN_SUCCESS", user.email, "Panel Admin", client_ip, "SUCCESS",
        f"Inicio de sesión exitoso {'con 2FA' if user.mfa_enabled else 'sin 2FA'}", user.id
    )
    
    # 5. Evaluar Políticas Globales de Configuración ISO 27001 (Rotación de Claves y 2FA Obligatorio)
    sys_config = db.query(models.SystemConfig).first()
    force_pwd_change = bool(user.must_change_password)
    force_mfa_setup = False

    if sys_config:
        # Si la política global exige rotación cada 90 o 180 días, verificamos la antigüedad de la clave
        pwd_policy = (sys_config.security_password or "").lower()
        max_days = 90 if "90" in pwd_policy else (180 if "180" in pwd_policy else None)
        if max_days and user.password_changed_at:
            pwd_dt = user.password_changed_at
            if pwd_dt.tzinfo is None:
                pwd_dt = pwd_dt.replace(tzinfo=timezone.utc)
            if (now_utc - pwd_dt).days > max_days:
                force_pwd_change = True
                user.must_change_password = True

        # Si el 2FA global está activado y el usuario aún no vinculó su Authenticator, lo llevamos a Mi Perfil
        if sys_config.security_2fa and not user.mfa_enabled:
            force_mfa_setup = True

    # 6. Login exitoso: Reiniciar contadores de fallo y registrar auditoría
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now_utc
    user.last_login_ip = client_ip
    db.commit()

    expire_minutes = get_session_Duration_minutes(db)
    access_token_expires = timedelta(minutes=expire_minutes)
    access_token = security.create_access_token(
        subject=user.id, role=user.role, expires_delta=access_token_expires
    )

    log_security_event(
        db, "LOGIN_SUCCESS", user.email, "Panel Admin", client_ip, "SUCCESS",
        f"Inicio de sesión exitoso {'con 2FA' if user.mfa_enabled else 'sin 2FA'}", user.id
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "mfa_required": False,
        "must_change_password": force_pwd_change or force_mfa_setup,
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "mfa_enabled": bool(user.mfa_enabled)
        }
    }

@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: models.User = Depends(deps.get_current_active_user)):
    """Devuelve toda la información de seguridad y perfil del usuario autenticado."""
    return current_user

@router.put("/me", response_model=UserResponse)
def update_my_profile(
    profile_in: ProfileUpdateInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Actualiza nombre y apellido del usuario actual."""
    current_user.first_name = profile_in.first_name.strip()
    current_user.last_name = profile_in.last_name.strip()
    db.commit()
    db.refresh(current_user)
    log_security_event(db, "PROFILE_UPDATED", current_user.email, current_user.email, get_client_ip(request), "SUCCESS", "Datos de perfil actualizados", current_user.id)
    return current_user

@router.post("/mfa/setup")
def setup_mfa(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Genera una semilla TOTP y la URI otpauth:// para escanear el código QR desde Mi Perfil."""
    secret = generate_totp_secret()
    current_user.mfa_secret = secret
    db.commit()

    issuer = "SIPAR Admin"
    label = quote(f"{issuer}:{current_user.email}")
    otpauth_uri = f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"

    return {
        "secret": secret,
        "otpauth_uri": otpauth_uri,
        "email": current_user.email
    }

@router.post("/mfa/enable")
def enable_mfa(
    data: MFACodeInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Verifica el código de 6 dígitos y activa formalmente el 2FA en la cuenta."""
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Primero debes iniciar la vinculación de 2FA.")
    if not verify_totp_code(current_user.mfa_secret, data.code):
        raise HTTPException(status_code=400, detail="El código ingresado es incorrecto. Verifica la hora de tu teléfono.")

    current_user.mfa_enabled = True
    db.commit()
    log_security_event(db, "MFA_ENABLED", current_user.email, current_user.email, get_client_ip(request), "SUCCESS", "Autenticación de dos factores (2FA TOTP) activada", current_user.id)
    return {"message": "Autenticación de dos factores (2FA) activada exitosamente."}

@router.post("/mfa/disable")
def disable_mfa(
    data: MFADisableInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Desactiva el 2FA validando la contraseña actual del usuario."""
    if not security.verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta. No se pudo desactivar el 2FA.")

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.commit()
    log_security_event(db, "MFA_DISABLED", current_user.email, current_user.email, get_client_ip(request), "WARNING", "Autenticación 2FA desactivada por el usuario", current_user.id)
    return {"message": "Autenticación 2FA desactivada."}

@router.post("/change-password")
def change_my_password(
    data: PasswordChangeInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Cambia la contraseña validando la anterior y exigiendo complejidad ISO 27001."""
    if not security.verify_password(data.current_password, current_user.hashed_password):
        log_security_event(db, "PASSWORD_CHANGE_FAILED", current_user.email, current_user.email, get_client_ip(request), "WARNING", "Intento de cambio de clave con contraseña actual errónea", current_user.id)
        raise HTTPException(status_code=400, detail="La contraseña actual ingresada es incorrecta.")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="ISO 27001: La nueva contraseña debe ser diferente a la actual.")

    validate_iso27001_password(data.new_password)

    current_user.hashed_password = security.get_password_hash(data.new_password)
    current_user.password_changed_at = datetime.now(timezone.utc)
    current_user.must_change_password = False
    db.commit()

    log_security_event(db, "PASSWORD_CHANGED", current_user.email, current_user.email, get_client_ip(request), "SUCCESS", "Rotación de contraseña completada exitosamente", current_user.id)
    return {"message": "Contraseña actualizada conforme a la política ISO 27001."}

@router.post("/register")
def create_user(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    validate_iso27001_password(user_in.password)
    
    new_user = models.User(
        email=user_in.email,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        company_id=user_in.company_id,
        role=user_in.role,
        hashed_password=security.get_password_hash(user_in.password),
        password_changed_at=datetime.now(timezone.utc)
    )
    db.add(new_user)
    db.commit()
    log_security_event(db, "USER_REGISTERED", user_in.email, user_in.email, get_client_ip(request), "SUCCESS", f"Registro inicial con rol {user_in.role}", new_user.id)
    return {"message": f"Usuario {user_in.email} creado con éxito."}