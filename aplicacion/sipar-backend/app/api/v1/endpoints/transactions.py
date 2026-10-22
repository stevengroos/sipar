# app/api/v1/endpoints/transactions.py
from typing import List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps

router = APIRouter()

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

@router.get("/", response_model=List[TransactionDetailResponse])
def get_transactions(
    charger_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None, description="Formato YYYY-MM, ej: 2026-10"),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene el historial detallado de todas las recargas y costos ANDE."""
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

    txs = query.order_by(models.Transaction.id.desc()).limit(limit).all()
    # ... el resto de tu función queda exactamente igual ...
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
            user_email=user.email if user else "cliente@sipar.com"
        ))

    return resultado