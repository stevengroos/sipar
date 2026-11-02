# app/api/v1/endpoints/users.py
from typing import List, Optional, Any
from datetime import datetime, timezone
import base64
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.schemas.user import UserResponse
from app.api import deps
from app.core import security
from app.core.config import settings
from app.api.v1.endpoints.auth import validate_iso27001_password, log_security_event, get_client_ip

router = APIRouter()

# =====================================================================
# MOTOR DE CIFRADO EN REPOSO PARA PII (RUC / RAZÓN SOCIAL - ISO 27001 A.8.24)
# =====================================================================
def _cipher_stream(data: bytes, secret: str) -> bytes:
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    out = bytearray(len(data))
    for i, b in enumerate(data):
        out[i] = b ^ key[i % len(key)]
    return bytes(out)

def encrypt_pii(plain_text: Optional[str]) -> str:
    if not plain_text:
        return ""
    clean = plain_text.strip()
    if not clean:
        return ""
    raw = clean.encode("utf-8")
    encrypted = _cipher_stream(raw, settings.SECRET_KEY)
    return "enc:" + base64.urlsafe_b64encode(encrypted).decode("ascii")

def decrypt_pii(stored_text: Optional[str]) -> str:
    if not stored_text:
        return ""
    if not stored_text.startswith("enc:"):
        return stored_text
    try:
        b64_part = stored_text[4:]
        encrypted = base64.urlsafe_b64decode(b64_part.encode("ascii"))
        return _cipher_stream(encrypted, settings.SECRET_KEY).decode("utf-8")
    except Exception:
        return ""

def ensure_profile_and_faq_schema(db: Session):
    """Asegura que las columnas de perfil y la tabla faq_items existan en PostgreSQL."""
    try:
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_ruc VARCHAR(255)"))
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_name VARCHAR(255)"))
        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicles JSON DEFAULT '[]'"))
        db.commit()
        models.FaqItem.__table__.create(bind=db.get_bind(), checkfirst=True)
        if db.query(models.FaqItem).count() == 0:
             iniciales = [
                models.FaqItem(
                    question="¿Cómo inicio una carga en una estación SIPAR?",
                    answer="1. Conecta la manguera a tu vehículo eléctrico.\n2. En el mapa de la app, selecciona la estación y la manguera.\n3. Verifica tu saldo en Wallet y presiona 'Iniciar Carga'.",
                    category="Operación OCPP",
                    order_index=1,
                    is_active=True
                ),
                models.FaqItem(
                    question="¿Qué significa la alerta GroundFailure o EVCommunicationError?",
                    answer="Por seguridad eléctrica OCPP 1.6J, si el cargador detecta variación en la puesta a tierra (PE) o desconexión del piloto de control (CP), detiene el suministro automáticamente sin cobrarte recargos.",
                    category="Seguridad Eléctrica",
                    order_index=2,
                    is_active=True
                ),
                models.FaqItem(
                    question="¿Cómo solicito una reversión o reclamo de saldo?",
                    answer="Desde la sección Actividad puedes abrir el detalle de tu recarga (#TRX) o comunicarte con soporte para que administración acredite el reembolso auditado en tu Wallet.",
                    category="Pagos y Wallet",
                    order_index=3,
                    is_active=True
                ),
            ]
        db.add_all(iniciales)
        db.commit()
    except Exception:
        db.rollback()

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

class SelfProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    billing_ruc: Optional[str] = None
    billing_name: Optional[str] = None
    vehicles: Optional[List[Any]] = None

class FaqCreateUpdate(BaseModel):
    question: str
    answer: str
    category: Optional[str] = "General"
    order_index: Optional[int] = 1
    is_active: Optional[bool] = True

class FaqResponse(BaseModel):
    id: int
    question: str
    answer: str
    category: str
    order_index: int
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# 0. ENDPOINTS DEL PROPIO CONDUCTOR (/me) Y FAQS
# ==========================================
@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Retorna el perfil del usuario descifrando RUC y Razón Social en memoria."""
    ensure_profile_and_faq_schema(db)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "first_name": current_user.first_name or "",
        "last_name": current_user.last_name or "",
        "role": current_user.role,
        "is_active": current_user.is_active,
        "mfa_enabled": bool(current_user.mfa_enabled),
        "billing_ruc": decrypt_pii(getattr(current_user, "billing_ruc", "")),
        "billing_name": decrypt_pii(getattr(current_user, "billing_name", "")),
        "vehicles": getattr(current_user, "vehicles", []) or []
    }

@router.put("/me")
def update_my_profile(
    profile_in: SelfProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Actualiza perfil, RUC cifrado (ISO 27001 A.8.24) y garaje de vehículos en BD."""
    ensure_profile_and_faq_schema(db)
    fn = profile_in.first_name.strip()
    ln = profile_in.last_name.strip()
    if not fn or not ln:
        raise HTTPException(status_code=400, detail="Nombre y apellido son obligatorios.")

    current_user.first_name = fn
    current_user.last_name = ln

    if profile_in.billing_ruc is not None:
        current_user.billing_ruc = encrypt_pii(profile_in.billing_ruc)
    if profile_in.billing_name is not None:
        current_user.billing_name = encrypt_pii(profile_in.billing_name)
    if profile_in.vehicles is not None:
        current_user.vehicles = profile_in.vehicles

    db.commit()
    db.refresh(current_user)

    log_security_event(
        db, "USER_SELF_UPDATED", current_user.email, current_user.email, get_client_ip(request),
        "SUCCESS", f"Perfil/Garaje/RUC cifrado actualizado en BD ({fn} {ln})", current_user.id
    )
    return get_my_profile(db=db, current_user=current_user)

@router.get("/me/audit-logs", response_model=List[AuditLogResponse])
def get_my_security_audit_logs(
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Devuelve al usuario su propia bitácora de seguridad (Control ISO 27001 A.8.15)."""
    return (
        db.query(models.SecurityAuditLog)
        .filter(
            (models.SecurityAuditLog.user_id == current_user.id) |
            (models.SecurityAuditLog.target == current_user.email)
        )
        .order_by(models.SecurityAuditLog.id.desc())
        .limit(limit)
        .all()
    )

@router.get("/faqs", response_model=List[FaqResponse])
def get_faqs(
    all_items: bool = Query(False, description="True para ver también las inactivas en el Admin Web"),
    db: Session = Depends(get_db)
):
    """Obtiene la lista de Preguntas Frecuentes para la App Móvil o el Panel Web."""
    ensure_profile_and_faq_schema(db)
    q = db.query(models.FaqItem)
    if not all_items:
        q = q.filter(models.FaqItem.is_active == True)
    return q.order_by(models.FaqItem.order_index.asc(), models.FaqItem.id.asc()).all()

@router.post("/faqs", response_model=FaqResponse)
def create_faq(
    faq_in: FaqCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    ensure_profile_and_faq_schema(db)
    item = models.FaqItem(
        question=faq_in.question.strip(),
        answer=faq_in.answer.strip(),
        category=(faq_in.category or "General").strip(),
        order_index=faq_in.order_index or 1,
        is_active=True if faq_in.is_active is None else faq_in.is_active
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_security_event(db, "FAQ_CREATED", current_user.email, f"FAQ #{item.id}", get_client_ip(request), "SUCCESS", item.question, current_user.id)
    return item

@router.put("/faqs/{faq_id}", response_model=FaqResponse)
def update_faq(
    faq_id: int,
    faq_in: FaqCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    ensure_profile_and_faq_schema(db)
    item = db.query(models.FaqItem).filter(models.FaqItem.id == faq_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pregunta frecuente no encontrada.")
    item.question = faq_in.question.strip()
    item.answer = faq_in.answer.strip()
    item.category = (faq_in.category or "General").strip()
    item.order_index = faq_in.order_index or 1
    if faq_in.is_active is not None:
        item.is_active = faq_in.is_active
    db.commit()
    db.refresh(item)
    log_security_event(db, "FAQ_UPDATED", current_user.email, f"FAQ #{item.id}", get_client_ip(request), "SUCCESS", item.question, current_user.id)
    return item

@router.delete("/faqs/{faq_id}")
def delete_faq(
    faq_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    ensure_profile_and_faq_schema(db)
    item = db.query(models.FaqItem).filter(models.FaqItem.id == faq_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pregunta frecuente no encontrada.")
    db.delete(item)
    db.commit()
    log_security_event(db, "FAQ_DELETED", current_user.email, f"FAQ #{faq_id}", get_client_ip(request), "WARNING", f"Eliminada: {item.question}", current_user.id)
    return {"detail": "Pregunta eliminada correctamente."}


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