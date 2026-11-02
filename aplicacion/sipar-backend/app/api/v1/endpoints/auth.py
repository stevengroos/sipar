# app/api/v1/endpoints/auth.py
import hmac
import hashlib
import struct
import base64
import secrets
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

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
    """Valida complejidad de contraseña según controles ISO 27001 A.8.5."""
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

def get_default_company_id(db: Session) -> int:
    company = db.query(models.Company).order_by(models.Company.id.asc()).first()
    if not company:
        company = models.Company(name="SIPAR Paraguay", is_active=True)
        db.add(company)
        db.commit()
        db.refresh(company)
    return company.id

def build_auth_response(db: Session, user: models.User, force_pwd_change: bool = False, force_mfa_setup: bool = False):
    expire_minutes = get_session_Duration_minutes(db)
    access_token_expires = timedelta(minutes=expire_minutes)
    access_token = security.create_access_token(
        subject=user.id, role=user.role, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "mfa_required": False,
        "must_change_password": force_pwd_change or force_mfa_setup,
        "session_minutes": expire_minutes,
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "role": user.role,
            "mfa_enabled": bool(user.mfa_enabled)
        }
    }


# =====================================================================
# ESQUEMAS DE PERFIL, MFA Y ONBOARDING MÓVIL
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

class MobileOnboardingInput(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    otp_code: Optional[str] = None

class GoogleAuthInput(BaseModel):
    id_token: Optional[str] = None
    access_token: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""


# =====================================================================
# 1. LOGIN TRADICIONAL + 2FA TOTP (WEB & APP MÓVIL)
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
    4. Evaluación de rotación de contraseñas y registro en bitácora de auditoría.
    """
    client_ip = get_client_ip(request)
    now_utc = datetime.now(timezone.utc)
    email_clean = form_data.username.strip().lower()
    user = db.query(models.User).filter(models.User.email.ilike(email_clean)).first()

    if not user:
        log_security_event(db, "LOGIN_FAILED", email_clean, "Sistema Auth", client_ip, "WARNING", "Intento de login con correo inexistente")
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos.")

    if not user.is_active:
        log_security_event(db, "LOGIN_BLOCKED", user.email, user.email, client_ip, "DANGER", "Intento de acceso en cuenta suspendida", user.id)
        raise HTTPException(status_code=403, detail="Esta cuenta ha sido suspendida por el administrador.")

    if user.locked_until:
        locked_dt = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
        if locked_dt > now_utc:
            remaining_mins = max(1, int((locked_dt - now_utc).total_seconds() // 60) + 1)
            log_security_event(db, "LOGIN_LOCKED", user.email, user.email, client_ip, "DANGER", f"Cuenta bloqueada temporalmente ({remaining_mins} min restantes)", user.id)
            raise HTTPException(
                status_code=423,
                detail=f"Cuenta bloqueada por múltiples intentos fallidos (ISO 27001). Intente nuevamente en {remaining_mins} minutos."
            )

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

    if user.mfa_enabled and user.mfa_secret:
        if not otp_code:
            return {
                "mfa_required": True,
                "detail": "Ingrese el código de 6 dígitos de su aplicación autenticadora."
            }
        if not verify_totp_code(user.mfa_secret, otp_code):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            db.commit()
            log_security_event(db, "MFA_FAILED", user.email, user.email, client_ip, "WARNING", "Código 2FA TOTP inválido", user.id)
            raise HTTPException(status_code=400, detail="Código de verificación 2FA incorrecto o expirado.")

    sys_config = db.query(models.SystemConfig).first()
    force_pwd_change = bool(user.must_change_password)
    force_mfa_setup = False

    if sys_config:
        pwd_policy = (sys_config.security_password or "").lower()
        max_days = 90 if "90" in pwd_policy else (180 if "180" in pwd_policy else None)
        if max_days and user.password_changed_at:
            pwd_dt = user.password_changed_at
            if pwd_dt.tzinfo is None:
                pwd_dt = pwd_dt.replace(tzinfo=timezone.utc)
            if (now_utc - pwd_dt).days > max_days:
                force_pwd_change = True
                user.must_change_password = True

        if sys_config.security_2fa and not user.mfa_enabled:
            force_mfa_setup = True

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now_utc
    user.last_login_ip = client_ip
    db.commit()

    log_security_event(
        db, "LOGIN_SUCCESS", user.email, "Acceso SIPAR", client_ip, "SUCCESS",
        f"Inicio de sesión exitoso {'con 2FA' if user.mfa_enabled else 'estándar'}", user.id
    )

    return build_auth_response(db, user, force_pwd_change, force_mfa_setup)


# =====================================================================
# 2. ONBOARDING MÓVIL POR EMAIL (REGISTRO + AUTO-LOGIN ISO 27001)
# =====================================================================
@router.post("/mobile/onboarding")
def mobile_driver_onboarding(
    data: MobileOnboardingInput,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Registra un nuevo conductor desde la App Móvil aplicando la política de contraseñas
    ISO 27001 y devuelve inmediatamente su token JWT para iniciar sesión sin fricción.
    """
    client_ip = get_client_ip(request)
    now_utc = datetime.now(timezone.utc)
    email_clean = data.email.strip().lower()

    existing = db.query(models.User).filter(models.User.email.ilike(email_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este correo electrónico ya está registrado en SIPAR.")

    validate_iso27001_password(data.password)

    new_user = models.User(
        email=email_clean,
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        company_id=get_default_company_id(db),
        role="conductor",
        is_active=True,
        hashed_password=security.get_password_hash(data.password),
        password_changed_at=now_utc,
        last_login_at=now_utc,
        last_login_ip=client_ip,
        must_change_password=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_security_event(
        db, "MOBILE_ONBOARDING", new_user.email, "App Móvil SIPAR", client_ip, "SUCCESS",
        "Onboarding móvil completado por correo electrónico con clave verificada ISO 27001", new_user.id
    )

    return build_auth_response(db, new_user)


# =====================================================================
# 3. LOGIN / ONBOARDING DIRECTO CON GOOGLE (OAUTH 2.0 / OIDC)
# =====================================================================
@router.post("/google")
def login_or_register_with_google(
    data: GoogleAuthInput,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Verifica criptográficamente el token de Google contra oauth2.googleapis.com.
    Si el usuario no existe, ejecuta el Onboarding automático creando su cuenta;
    si ya existe, inicia su sesión y audita el evento bajo ISO 27001.
    """
    client_ip = get_client_ip(request)
    now_utc = datetime.now(timezone.utc)
    google_payload = None

    if data.id_token:
        verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={quote(data.id_token)}"
        try:
            with urllib.request.urlopen(verify_url, timeout=8) as response:
                google_payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=401, detail="No se pudo verificar el id_token de Google.")
    elif data.access_token:
        req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {data.access_token}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as response:
                google_payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=401, detail="No se pudo verificar el access_token de Google.")
    else:
        raise HTTPException(status_code=400, detail="Se requiere un token válido de Google.")

    email = (google_payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="La cuenta de Google no proporcionó un correo verificado.")

    given_name = google_payload.get("given_name") or data.first_name or email.split("@")[0]
    family_name = google_payload.get("family_name") or data.last_name or ""

    user = db.query(models.User).filter(models.User.email.ilike(email)).first()
    is_new_user = False

    if not user:
        is_new_user = True
        random_strong_pwd = f"Ggl!{secrets.token_urlsafe(16)}9aA#"
        user = models.User(
            email=email,
            first_name=given_name.strip(),
            last_name=family_name.strip(),
            company_id=get_default_company_id(db),
            role="conductor",
            is_active=True,
            hashed_password=security.get_password_hash(random_strong_pwd),
            password_changed_at=now_utc,
            last_login_at=now_utc,
            last_login_ip=client_ip,
            must_change_password=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.is_active:
            log_security_event(db, "LOGIN_BLOCKED", user.email, "App Móvil Google", client_ip, "DANGER", "Intento de acceso Google en cuenta suspendida", user.id)
            raise HTTPException(status_code=403, detail="Esta cuenta ha sido suspendida por el administrador.")
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = now_utc
        user.last_login_ip = client_ip
        db.commit()

    log_security_event(
        db,
        "GOOGLE_ONBOARDING" if is_new_user else "LOGIN_GOOGLE_SSO",
        user.email,
        "App Móvil SIPAR",
        client_ip,
        "SUCCESS",
        "Registro automático con Google OAuth 2.0" if is_new_user else "Inicio de sesión federado con Google OAuth 2.0",
        user.id
    )

    return build_auth_response(db, user)


# =====================================================================
# 4. RENOVACIÓN DE SESIÓN CON FACE ID / BIOMETRÍA (ISO 27001 A.8.5)
# =====================================================================
@router.post("/biometric-session")
def refresh_biometric_session(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """
    Valida el token resguardado en el llavero seguro del dispositivo tras superar
    Face ID / Touch ID / Huella, emite un JWT fresco y audita el acceso biométrico.
    """
    client_ip = get_client_ip(request)
    current_user.last_login_at = datetime.now(timezone.utc)
    current_user.last_login_ip = client_ip
    db.commit()

    log_security_event(
        db, "LOGIN_BIOMETRIC_FACEID", current_user.email, "App Móvil SIPAR", client_ip,
        "SUCCESS", "Desbloqueo y renovación de sesión mediante Face ID / Biometría del dispositivo", current_user.id
    )

    return build_auth_response(db, current_user)


# =====================================================================
# 5. MI PERFIL, MFA Y GESTIÓN DE CONTRASEÑAS
# =====================================================================
@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: models.User = Depends(deps.get_current_active_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
def update_my_profile(
    profile_in: ProfileUpdateInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
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
    secret = generate_totp_secret()
    current_user.mfa_secret = secret
    db.commit()

    issuer = "SIPAR"
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