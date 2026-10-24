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
PY_TZ = timezone(timedelta(hours=-3))

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

class SystemNotificationItem(BaseModel):
    id: str
    category: str       # 'hardware' | 'fraud' | 'daily'
    severity: str       # 'danger' | 'warning' | 'info' | 'success'
    title: str
    message: str
    link: str
    timestamp: Optional[datetime] = None


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

    score = 0
    score += round((mfa_rate / 100.0) * 35)
    pwd_ratio = (compliant_pwd_count / total_active) if total_active > 0 else 1.0
    score += round(pwd_ratio * 25)
    if config.security_2fa:
        score += 10
    if "15" in (config.security_session or "") or "30" in (config.security_session or ""):
        score += 8
    if "no exigir" not in (config.security_password or "").lower():
        score += 7
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


# =========================================================================
# 4. CENTRO DE NOTIFICACIONES EN VIVO CONECTADO A CONFIGURACIÓN (CAMPANITA)
# =========================================================================
@router.get("/notifications", response_model=List[SystemNotificationItem])
def get_active_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """
    Genera el feed de notificaciones en tiempo real para la campanita del Layout
    respetando los 3 interruptores configurados en SystemConfig:
    - notif_hardware: Fallas OCPP (PE/CP), estaciones en falla o desconectadas.
    - notif_fraud: Reclamos/disputas pendientes en Finanzas y alertas de seguridad ISO 27001.
    - notif_daily: Resumen diario consolidado de energía kWh, facturación y liquidación ANDE.
    """
    config = get_or_create_config(db)
    now_utc = datetime.now(timezone.utc)
    notifications: List[SystemNotificationItem] = []

    # 1. ALERTAS CRÍTICAS DE HARDWARE (OCPP)
    if config.notif_hardware:
        chargers = db.query(models.Charger).filter(models.Charger.is_active == True).all()
        for ch in chargers:
            if ch.status == "falla" or (ch.last_error_code and ch.last_error_code != "NoError"):
                notifications.append(SystemNotificationItem(
                    id=f"hw-fault-{ch.id}-{ch.last_error_code}",
                    category="hardware",
                    severity="danger",
                    title=f"Falla OCPP en Estación {ch.serial_number}",
                    message=f"Diagnóstico activo: {ch.last_error_code or 'Error técnico reportado'}.",
                    link="/admin/cargadores",
                    timestamp=ch.last_heartbeat or now_utc
                ))
            elif ch.status == "fuera_de_linea":
                notifications.append(SystemNotificationItem(
                    id=f"hw-offline-{ch.id}",
                    category="hardware",
                    severity="warning",
                    title=f"Estación Fuera de Línea: {ch.serial_number}",
                    message=f"El cargador ({ch.power_kw} kW) no tiene conexión WebSocket activa.",
                    link="/admin/cargadores",
                    timestamp=ch.last_heartbeat or now_utc
                ))

        # Últimas sesiones abortadas por falla eléctrica o de comunicación (últimas 24h)
        since_24h = now_utc - timedelta(hours=24)
        fault_txs = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.start_time >= since_24h,
                models.Transaction.error_code != None,
                models.Transaction.error_code != "NoError"
            )
            .order_by(models.Transaction.id.desc())
            .limit(5)
            .all()
        )
        for ftx in fault_txs:
            serial = ftx.charger.serial_number if ftx.charger else f"ID #{ftx.charger_id}"
            notifications.append(SystemNotificationItem(
                id=f"tx-fault-{ftx.id}",
                category="hardware",
                severity="danger",
                title=f"Corte por Protección en #{ftx.id} ({serial})",
                message=f"{ftx.error_code} • Motivo: {ftx.stop_reason or 'ProtectionTrip'}",
                link="/admin/historial",
                timestamp=ftx.end_time or ftx.start_time or now_utc
            ))

    # 2. ALERTAS DE FRAUDE, RECLAMOS FINANCIEROS Y SEGURIDAD ISO 27001
    if config.notif_fraud:
        pending_disputes = (
            db.query(models.Transaction)
            .filter(models.Transaction.dispute_status == "pending")
            .order_by(models.Transaction.id.desc())
            .limit(10)
            .all()
        )
        for dtx in pending_disputes:
            user_name = f"{dtx.user.first_name or ''} {dtx.user.last_name or ''}".strip() if dtx.user else "Cliente App"
            notifications.append(SystemNotificationItem(
                id=f"dispute-pending-{dtx.id}",
                category="fraud",
                severity="danger",
                title=f"Reclamo / Reversión Pendiente (#TRX-{dtx.id})",
                message=f"{user_name} solicita revisión por {int(dtx.total_amount_pyg or 0):,} ₲: \"{dtx.dispute_reason or 'Sin detalle'}\"".replace(",", "."),
                link="/admin/finanzas",
                timestamp=dtx.dispute_created_at or dtx.start_time or now_utc
            ))

        # Eventos de seguridad WARNING / DANGER en las últimas 24h (bloqueos, contraseñas fallidas, etc.)
        since_24h = now_utc - timedelta(hours=24)
        sec_alerts = (
            db.query(models.SecurityAuditLog)
            .filter(
                models.SecurityAuditLog.created_at >= since_24h,
                models.SecurityAuditLog.status.in_(["WARNING", "DANGER"])
            )
            .order_by(models.SecurityAuditLog.id.desc())
            .limit(6)
            .all()
        )
        for salert in sec_alerts:
            notifications.append(SystemNotificationItem(
                id=f"sec-alert-{salert.id}",
                category="fraud",
                severity="danger" if salert.status == "DANGER" else "warning",
                title=f"Alerta Seguridad ISO 27001: {salert.action}",
                message=f"{salert.details or ''} (Actor: {salert.actor_email})",
                link="/admin/configuracion",
                timestamp=salert.created_at or now_utc
            ))

    # 3. RESUMEN DIARIO DE OPERACIONES Y LIQUIDACIÓN ANDE
    if config.notif_daily:
        now_py = now_utc.astimezone(PY_TZ)
        start_of_day_py = now_py.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_day_utc = start_of_day_py.astimezone(timezone.utc)

        today_txs = (
            db.query(models.Transaction)
            .filter(models.Transaction.start_time >= start_of_day_utc)
            .all()
        )
        total_kwh = sum(float(t.kwh_delivered or 0.0) for t in today_txs)
        total_rev = sum(float(t.total_amount_pyg or 0.0) for t in today_txs)
        total_ande = sum(float(t.ande_energy_cost_pyg or 0.0) for t in today_txs)
        net_margin = total_rev - total_ande

        notifications.insert(0, SystemNotificationItem(
            id=f"daily-summary-{now_py.strftime('%Y-%m-%d')}",
            category="daily",
            severity="info",
            title=f"Resumen Operativo del Día ({now_py.strftime('%d/%m/%Y')})",
            message=(
                f"{len(today_txs)} sesiones hoy • {total_kwh:.2f} kWh entregados • "
                f"Cobrado: {int(total_rev):,} ₲ • ANDE: {int(total_ande):,} ₲ • "
                f"Margen Neto: {int(net_margin):,} ₲"
            ).replace(",", "."),
            link="/admin/historial",
            timestamp=now_utc
        ))

    return notifications