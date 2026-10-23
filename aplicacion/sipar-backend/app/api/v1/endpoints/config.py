# app/api/v1/endpoints/config.py
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Query
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

def log_config_event(
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


# --- ESQUEMAS PYDANTIC ---
class ConfigData(BaseModel):
    security_2fa: bool = False
    security_session: str = "30 minutos (Recomendado)"
    security_password: str = "Exigir rotación cada 90 días"
    notif_hardware: bool = True
    notif_fraud: bool = True
    notif_daily: Optional[bool] = False
    pref_dark_mode: bool = False
    pref_language: str = "Español (Latinoamérica)"

    class Config:
        from_attributes = True

class AuditLogItem(BaseModel):
    id: int
    user_id: Optional[int] = None
    actor_email: Optional[str] = ""
    action: str
    module: str
    target: Optional[str] = ""
    ip_address: Optional[str] = ""
    status: str
    details: Optional[str] = ""
    created_at: Optional[datetime] = None

class ComplianceReportResponse(BaseModel):
    compliance_score: int
    total_active_users: int
    mfa_enabled_users: int
    mfa_adoption_rate: int
    passwords_compliant_users: int
    passwords_expired_users: int
    locked_or_suspended_users: int
    total_chargers: int
    chargers_with_tariff: int
    total_audit_events: int
    security_alerts_24h: int
    pending_financial_disputes: int


def classify_audit_module(action: str) -> str:
    act = (action or "").upper()
    if act.startswith("LOGIN") or act.startswith("MFA") or act.startswith("PASSWORD") or act.startswith("ACCOUNT") or act.startswith("PROFILE"):
        return "Autenticación & Accesos"
    if act.startswith("USER"):
        return "Usuarios & RBAC"
    if act.startswith("TARIFF"):
        return "Tarifas & Precios"
    if act.startswith("FINANCE"):
        return "Finanzas & Reversiones"
    if act.startswith("STORE"):
        return "Tienda & Stock"
    if act.startswith("CONFIG") or act.startswith("ROLE"):
        return "Configuración Global"
    return "Sistema General"


def get_or_create_config(db: Session) -> models.SystemConfig:
    """Obtiene la fila única de configuración o la crea si la tabla está vacía."""
    config = db.query(models.SystemConfig).first()
    if not config:
        config = models.SystemConfig(
            security_2fa=False,
            security_session="30 minutos (Recomendado)",
            security_password="Exigir rotación cada 90 días",
            notif_hardware=True,
            notif_fraud=True,
            notif_daily=False,
            pref_dark_mode=False,
            pref_language="Español (Latinoamérica)"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


# =========================================================================
# 1. OBTENER Y ACTUALIZAR CONFIGURACIÓN CON AUDITORÍA ISO 27001
# =========================================================================
@router.get("/", response_model=ConfigData)
def get_system_config(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la configuración global del sistema."""
    return get_or_create_config(db)

@router.put("/", response_model=ConfigData)
def update_system_config(
    config_in: ConfigData,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza la configuración global del sistema y registra qué parámetro cambió en la bitácora."""
    config = get_or_create_config(db)
    cambios = []

    if bool(config.security_2fa) != bool(config_in.security_2fa):
        cambios.append(f"2FA Obligatorio: {'Activado' if config_in.security_2fa else 'Desactivado'}")
    if config.security_session != config_in.security_session:
        cambios.append(f"Sesión Inactiva: '{config.security_session}' → '{config_in.security_session}'")
    if config.security_password != config_in.security_password:
        cambios.append(f"Política Contraseñas: '{config.security_password}' → '{config_in.security_password}'")
    if bool(config.notif_hardware) != bool(config_in.notif_hardware):
        cambios.append(f"Alertas Hardware: {'ON' if config_in.notif_hardware else 'OFF'}")
    if bool(config.notif_fraud) != bool(config_in.notif_fraud):
        cambios.append(f"Alertas Fraude/Disputas: {'ON' if config_in.notif_fraud else 'OFF'}")
    if config_in.notif_daily is not None and bool(config.notif_daily) != bool(config_in.notif_daily):
        cambios.append(f"Resumen Diario: {'ON' if config_in.notif_daily else 'OFF'}")
    if bool(config.pref_dark_mode) != bool(config_in.pref_dark_mode):
        cambios.append(f"Modo Oscuro Global: {'Activado' if config_in.pref_dark_mode else 'Desactivado'}")
    if config.pref_language != config_in.pref_language:
        cambios.append(f"Idioma: '{config.pref_language}' → '{config_in.pref_language}'")

    config.security_2fa = config_in.security_2fa
    config.security_session = config_in.security_session
    config.security_password = config_in.security_password
    config.notif_hardware = config_in.notif_hardware
    config.notif_fraud = config_in.notif_fraud
    if config_in.notif_daily is not None:
        config.notif_daily = config_in.notif_daily
    config.pref_dark_mode = config_in.pref_dark_mode
    config.pref_language = config_in.pref_language
    
    db.commit()
    db.refresh(config)

    if cambios:
        log_config_event(
            db, current_user, "CONFIG_UPDATED", "Parámetros Globales", get_client_ip(request),
            " | ".join(cambios), "SUCCESS"
        )

    return config


# =========================================================================
# 2. REPORTE EJECUTIVO DE CUMPLIMIENTO ISO 27001 EN TIEMPO REAL
# =========================================================================
@router.get("/compliance-report", response_model=ComplianceReportResponse)
def get_iso27001_compliance_report(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Calcula las métricas de gobernanza y el porcentaje de cumplimiento ISO 27001 de toda la plataforma."""
    config = get_or_create_config(db)
    now_utc = datetime.now(timezone.utc)

    all_users = db.query(models.User).all()
    active_users = [u for u in all_users if u.is_active]
    total_active = len(active_users)
    mfa_users = len([u for u in active_users if u.mfa_enabled])
    mfa_rate = round((mfa_users / total_active) * 100) if total_active > 0 else 100

    # Evaluar vigencia de contraseñas según política activa (90 o 180 días)
    max_days = 90
    if "180" in (config.security_password or ""):
        max_days = 180
    elif "no exigir" in (config.security_password or "").lower():
        max_days = 9999

    expired_pwd_count = 0
    for u in active_users:
        if u.must_change_password:
            expired_pwd_count += 1
        elif u.password_changed_at and max_days < 9999:
            pwd_dt = u.password_changed_at
            if pwd_dt.tzinfo is None:
                pwd_dt = pwd_dt.replace(tzinfo=timezone.utc)
            age_days = (now_utc - pwd_dt).days
            if age_days > max_days:
                expired_pwd_count += 1

    compliant_pwd_count = max(0, total_active - expired_pwd_count)

    locked_or_suspended = len([
        u for u in all_users
        if not u.is_active or (u.locked_until and (u.locked_until.replace(tzinfo=timezone.utc) if u.locked_until.tzinfo is None else u.locked_until) > now_utc)
    ])

    active_chargers = db.query(models.Charger).filter(models.Charger.is_active == True).all()
    total_chargers = len(active_chargers)
    chargers_with_tariff = len([c for c in active_chargers if c.tariff_id is not None])

    total_audit = db.query(models.SecurityAuditLog).count()
    since_24h = now_utc - timedelta(hours=24)
    alerts_24h = (
        db.query(models.SecurityAuditLog)
        .filter(
            models.SecurityAuditLog.created_at >= since_24h,
            models.SecurityAuditLog.status.in_(["WARNING", "DANGER"])
        )
        .count()
    )

    pending_disputes = (
        db.query(models.Transaction)
        .filter(models.Transaction.dispute_status == "pending")
        .count()
    )

    # Cálculo ponderado del Score ISO 27001 (0 - 100)
    score = 0
    # 1. Adopción MFA (35 pts)
    score += round((mfa_rate / 100.0) * 35)
    # 2. Vigencia de contraseñas (25 pts)
    pwd_ratio = (compliant_pwd_count / total_active) if total_active > 0 else 1.0
    score += round(pwd_ratio * 25)
    # 3. Políticas globales activas (25 pts)
    if config.security_2fa:
        score += 10
    if "15" in (config.security_session or "") or "30" in (config.security_session or ""):
        score += 8
    if "no exigir" not in (config.security_password or "").lower():
        score += 7
    # 4. Trazabilidad y operación controlada (15 pts)
    if total_chargers == 0 or chargers_with_tariff == total_chargers:
        score += 8
    if pending_disputes == 0:
        score += 7

    return ComplianceReportResponse(
        compliance_score=min(100, score),
        total_active_users=total_active,
        mfa_enabled_users=mfa_users,
        mfa_adoption_rate=mfa_rate,
        passwords_compliant_users=compliant_pwd_count,
        passwords_expired_users=expired_pwd_count,
        locked_or_suspended_users=locked_or_suspended,
        total_chargers=total_chargers,
        chargers_with_tariff=chargers_with_tariff,
        total_audit_events=total_audit,
        security_alerts_24h=alerts_24h,
        pending_financial_disputes=pending_disputes
    )


# =========================================================================
# 3. BITÁCORA DE AUDITORÍA GENERAL UNIFICADA (TODOS LOS MÓDULOS)
# =========================================================================
@router.get("/audit-logs", response_model=List[AuditLogItem])
def get_general_audit_logs(
    limit: int = Query(500, ge=1, le=3000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene la bitácora centralizada de todos los módulos del sistema para auditorías ISO 27001."""
    logs = db.query(models.SecurityAuditLog).order_by(models.SecurityAuditLog.id.desc()).limit(limit).all()
    return [
        AuditLogItem(
            id=log.id,
            user_id=log.user_id,
            actor_email=log.actor_email or "Sistema",
            action=log.action,
            module=classify_audit_module(log.action),
            target=log.target or "",
            ip_address=log.ip_address or "0.0.0.0",
            status=log.status or "SUCCESS",
            details=log.details or "",
            created_at=log.created_at
        )
        for log in logs
    ]