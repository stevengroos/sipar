# app/api/v1/endpoints/transactions.py
from typing import List, Optional, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps
from app.core import security

router = APIRouter()

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def log_financial_event(
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


class TransactionDetailResponse(BaseModel):
    id: int
    status: str
    connector_id: int
    id_tag: str
    unlock_method: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: int
    idle_seconds: int
    meter_start: int
    meter_stop: int
    kwh_delivered: float
    avg_power_kw: float
    max_power_kw: float
    co2_saved_kg: float
    tariff_price_kwh: float
    unlock_fee_pyg: float
    total_amount_pyg: float
    payment_method: str
    ande_applied_rate: float
    ande_energy_cost_pyg: float
    time_band_label: str
    telemetry_log: Any = []
    # Datos enriquecidos de Estación y Usuario
    charger_id: Optional[int] = None
    charger_serial: str
    charger_power_kw: float
    charger_address: str
    charger_tension: str
    user_name: str
    user_email: str
    stop_reason: Optional[str] = "Local"
    error_code: Optional[str] = "NoError"
    # Campos Financieros de Reclamos y Reversiones
    dispute_status: Optional[str] = "none" # 'none' | 'pending' | 'refunded' | 'rejected'
    dispute_reason: Optional[str] = None
    dispute_created_at: Optional[datetime] = None
    refund_amount_pyg: Optional[float] = 0.0
    dispute_resolution_note: Optional[str] = None
    dispute_resolved_at: Optional[datetime] = None
    dispute_resolved_by: Optional[str] = None

class DisputeCreateInput(BaseModel):
    reason: str
    requested_refund_pyg: Optional[float] = None

class DisputeResolveInput(BaseModel):
    resolution: str  # 'refund_full' | 'refund_partial' | 'reject'
    refund_amount_pyg: Optional[float] = 0.0
    resolution_note: str
    admin_password: str


@router.get("/", response_model=List[TransactionDetailResponse])
def get_transactions(
    charger_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None, description="Formato YYYY-MM, ej: 2026-10"),
    dispute_status: Optional[str] = Query(None, description="Filtro opcional: pending, refunded, rejected, none"),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene el historial detallado de todas las recargas, costos ANDE y estado de disputas/reembolsos."""
    query = db.query(models.Transaction)

    if charger_id:
        query = query.filter(models.Transaction.charger_id == charger_id)

    if month and "-" in month:
        try:
            year_num, month_num = map(int, month.split("-"))
            query = query.filter(
                extract("year", models.Transaction.start_time) == year_num,
                extract("month", models.Transaction.start_time) == month_num
            )
        except ValueError:
            pass

    if dispute_status:
        query = query.filter(models.Transaction.dispute_status == dispute_status)

    txs = query.order_by(models.Transaction.id.desc()).limit(limit).all()
    resultado = []

    for tx in txs:
        charger = tx.charger
        user = tx.user

        address = "Estación SIPAR"
        if charger and charger.location:
            if isinstance(charger.location, dict):
                address = charger.location.get("address", "Estación SIPAR")

        user_full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() if user else "Cliente SIPAR App"

        resultado.append(TransactionDetailResponse(
            id=tx.id,
            status=tx.status or "concluida",
            connector_id=tx.connector_id or 1,
            id_tag=tx.id_tag or "APP-SIPAR",
            unlock_method=tx.unlock_method or "App",
            start_time=tx.start_time,
            end_time=tx.end_time,
            duration_seconds=tx.duration_seconds or 0,
            idle_seconds=tx.idle_seconds or 0,
            meter_start=tx.meter_start or 0,
            meter_stop=tx.meter_stop or 0,
            kwh_delivered=round(float(tx.kwh_delivered or 0.0), 2),
            avg_power_kw=round(float(tx.avg_power_kw or 0.0), 3),
            max_power_kw=round(float(tx.max_power_kw or 0.0), 3),
            co2_saved_kg=round(float(tx.co2_saved_kg or 0.0), 2),
            tariff_price_kwh=round(float(tx.tariff_price_kwh or 2500.0), 0),
            unlock_fee_pyg=round(float(tx.unlock_fee_pyg or 0.0), 0),
            total_amount_pyg=round(float(tx.total_amount_pyg or 0.0), 0),
            payment_method=tx.payment_method or "Cartera Digital",
            ande_applied_rate=round(float(tx.ande_applied_rate or 0.0), 0),
            ande_energy_cost_pyg=round(float(tx.ande_energy_cost_pyg or 0.0), 0),
            time_band_label=tx.time_band_label or "Fuera de Punta",
            telemetry_log=tx.telemetry_log if isinstance(tx.telemetry_log, list) else [],
            charger_id=charger.id if charger else None,
            charger_serial=charger.serial_number if charger else "Desconocido",
            charger_power_kw=float(charger.power_kw) if charger else 0.0,
            charger_address=address,
            charger_tension=charger.ande_tension_type if charger and charger.ande_tension_type else "baja",
            user_name=user_full_name or "Usuario App",
            stop_reason=getattr(tx, "stop_reason", "Local") or "Local",
            error_code=getattr(tx, "error_code", "NoError") or "NoError",
            user_email=user.email if user else "cliente@sipar.com",
            dispute_status=getattr(tx, "dispute_status", "none") or "none",
            dispute_reason=getattr(tx, "dispute_reason", None),
            dispute_created_at=getattr(tx, "dispute_created_at", None),
            refund_amount_pyg=round(float(getattr(tx, "refund_amount_pyg", 0.0) or 0.0), 0),
            dispute_resolution_note=getattr(tx, "dispute_resolution_note", None),
            dispute_resolved_at=getattr(tx, "dispute_resolved_at", None),
            dispute_resolved_by=getattr(tx, "dispute_resolved_by", None)
        ))

    return resultado


# =========================================================================
# 2. ABRIR RECLAMO / SOLICITUD DE REVERSIÓN (DESDE APP MÓVIL O SOPORTE ADMIN)
# =========================================================================
@router.post("/{tx_id}/dispute")
def open_transaction_dispute(
    tx_id: int,
    dispute_in: DisputeCreateInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """
    Permite que un usuario desde la App Móvil o un operador desde el panel
    registre un reclamo o solicitud de reversión sobre una transacción.
    """
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada.")

    if not dispute_in.reason or len(dispute_in.reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Debes detallar el motivo del reclamo o solicitud de reversión.")

    tx.dispute_status = "pending"
    tx.dispute_reason = dispute_in.reason.strip()
    tx.dispute_created_at = datetime.now(timezone.utc)
    db.commit()

    log_financial_event(
        db, current_user, "FINANCE_DISPUTE_OPENED", f"TRX #{tx.id}", get_client_ip(request),
        f"Reclamo abierto en TRX #{tx.id} ({int(tx.total_amount_pyg or 0):,} Gs): {tx.dispute_reason}".replace(",", "."),
        "WARNING"
    )
    return {"message": f"Reclamo registrado exitosamente para la transacción #{tx.id}."}


# =========================================================================
# 3. RESOLVER RECLAMO / EJECUTAR REVERSIÓN CON AUTORIZACIÓN ISO 27001
# =========================================================================
@router.post("/{tx_id}/resolve-dispute")
def resolve_transaction_dispute(
    tx_id: int,
    resolve_in: DisputeResolveInput,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """
    Autoriza una reversión total, reembolso parcial o rechazo de reclamo
    verificando la contraseña del administrador y registrando en auditoría ISO 27001.
    """
    client_ip = get_client_ip(request)
    if not resolve_in.admin_password or not security.verify_password(resolve_in.admin_password, current_user.hashed_password):
        log_financial_event(
            db, current_user, "FINANCE_AUTH_FAILED", f"TRX #{tx_id}", client_ip,
            "Intento fallido de autorizar reembolso/reversión: contraseña incorrecta", "DANGER"
        )
        raise HTTPException(status_code=403, detail="Contraseña de autorización incorrecta.")

    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada.")

    original_total = float(tx.total_amount_pyg or 0.0)
    actor_name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email

    if resolve_in.resolution == "refund_full":
        refund_val = original_total
        tx.dispute_status = "refunded"
        action_label = "FINANCE_REFUND_FULL"
        detail_msg = f"Reversión TOTAL aprobada: {int(refund_val):,} ₲ devueltos | Nota: {resolve_in.resolution_note}".replace(",", ".")
    elif resolve_in.resolution == "refund_partial":
        refund_val = float(resolve_in.refund_amount_pyg or 0.0)
        if refund_val <= 0 or (original_total > 0 and refund_val > original_total):
            raise HTTPException(status_code=400, detail="El monto de reembolso parcial debe ser mayor a 0 y no superar el total cobrado.")
        tx.dispute_status = "refunded"
        action_label = "FINANCE_REFUND_PARTIAL"
        detail_msg = f"Reembolso PARCIAL aprobado: {int(refund_val):,} ₲ de {int(original_total):,} ₲ | Nota: {resolve_in.resolution_note}".replace(",", ".")
    elif resolve_in.resolution == "reject":
        refund_val = 0.0
        tx.dispute_status = "rejected"
        action_label = "FINANCE_DISPUTE_REJECTED"
        detail_msg = f"Reclamo rechazado sin reembolso | Justificación: {resolve_in.resolution_note}"
    else:
        raise HTTPException(status_code=400, detail="Tipo de resolución inválido.")

    if not tx.dispute_reason:
        tx.dispute_reason = "Reversión administrativa directa"
        tx.dispute_created_at = datetime.now(timezone.utc)

    tx.refund_amount_pyg = refund_val
    tx.dispute_resolution_note = resolve_in.resolution_note.strip()
    tx.dispute_resolved_at = datetime.now(timezone.utc)
    tx.dispute_resolved_by = f"{actor_name} ({current_user.email})"
    db.commit()

    log_financial_event(db, current_user, action_label, f"TRX #{tx.id}", client_ip, detail_msg, "SUCCESS")
    return {"message": "Resolución financiera aplicada y auditada correctamente."}