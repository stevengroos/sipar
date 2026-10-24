# app/api/v1/endpoints/dashboards.py
from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from pydantic import BaseModel

from app.db.session import get_db
from app.models import models
from app.api.v1.endpoints.ws_ocpp import conexiones_activas

router = APIRouter()
PY_TZ = timezone(timedelta(hours=-3))


# --- ESQUEMAS ENRIQUECIDOS DEL DASHBOARD ---
class ConnectorSimple(BaseModel):
    id: int
    connector_id: int
    status: str
    type: Optional[str] = "CCS 2 / Tipo 2"
    error_code: Optional[str] = "NoError"

    class Config:
        from_attributes = True

class DashboardKpisResponse(BaseModel):
    recaudacion_mes: float          # Ingreso neto (descontando reembolsos)
    recaudacion_bruta: float        # Total facturado bruto
    costo_ande_total: float         # Liquidación ANDE propietarios
    margen_neto_sipar: float        # Ganancia neta libre
    reembolsos_total: float         # Total revertido a clientes
    disputas_pendientes: int        # Reclamos abiertos en Finanzas
    energia_entregada_kwh: float
    co2_ahorrado_kg: float
    usuarios_activos: int
    total_sesiones: int
    sesiones_con_alerta_ocpp: int
    estaciones_online: int
    estaciones_en_falla: int
    estaciones_total: int

class DashboardChargerMapResponse(BaseModel):
    id: int
    serial_number: str
    status: str
    power_kw: float
    location: Any
    vendor: Optional[str] = None
    model: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    last_error_code: Optional[str] = "NoError"
    ande_tension_type: Optional[str] = "baja"
    tariff_name: Optional[str] = "Tarifa Estándar"
    price_kwh: Optional[float] = 2500.0
    connectors: List[ConnectorSimple] = []

    class Config:
        from_attributes = True

class DashboardRecentTxResponse(BaseModel):
    id: int
    user_name: str
    charger_serial: str
    kwh: float
    amount_pyg: float
    ande_cost_pyg: float
    status: str
    error_code: Optional[str] = "NoError"
    dispute_status: Optional[str] = "none"
    start_time: Optional[datetime] = None

class DashboardTopDriverResponse(BaseModel):
    user_name: str
    user_email: Optional[str] = ""
    sessions_count: int = 0
    total_kwh: float
    total_spent_pyg: float = 0.0
    co2_saved_kg: float


def apply_period_filter(query, period: str):
    now_py = datetime.now(timezone.utc).astimezone(PY_TZ)
    if period == "today":
        start_today_py = now_py.replace(hour=0, minute=0, second=0, microsecond=0)
        return query.filter(models.Transaction.start_time >= start_today_py.astimezone(timezone.utc))
    elif period == "month":
        return query.filter(
            extract("year", models.Transaction.start_time) == now_py.year,
            extract("month", models.Transaction.start_time) == now_py.month
        )
    return query


@router.get("/kpis", response_model=DashboardKpisResponse)
def get_dashboard_kpis(
    period: str = Query("all", description="'today' | 'month' | 'all'"),
    db: Session = Depends(get_db)
):
    """Retorna los indicadores operativos, financieros (ANDE/Margen) y de salud de red."""
    usuarios_activos = db.query(models.User).filter(models.User.is_active == True).count()

    tx_query = apply_period_filter(db.query(models.Transaction), period)
    txs = tx_query.all()

    bruto = 0.0
    reembolsado = 0.0
    costo_ande = 0.0
    energia = 0.0
    co2 = 0.0
    alertas_ocpp = 0

    for tx in txs:
        billed = float(tx.total_amount_pyg or 0.0)
        ref = float(tx.refund_amount_pyg or 0.0) if getattr(tx, "dispute_status", "none") == "refunded" else 0.0
        kwh = float(tx.kwh_delivered or 0.0)
        tx_co2 = float(tx.co2_saved_kg or 0.0) if float(tx.co2_saved_kg or 0.0) > 0 else round(kwh * 1.05, 2)

        bruto += billed
        reembolsado += ref
        costo_ande += float(tx.ande_energy_cost_pyg or 0.0)
        energia += kwh
        co2 += tx_co2

        if tx.error_code and tx.error_code != "NoError":
            alertas_ocpp += 1

    neto_recaudado = max(0.0, bruto - reembolsado)
    margen_neto = neto_recaudado - costo_ande

    disputas_pendientes = (
        db.query(models.Transaction)
        .filter(models.Transaction.dispute_status == "pending")
        .count()
    )

    cargadores = db.query(models.Charger).filter(models.Charger.is_active == True).all()
    estaciones_total = len(cargadores)
    estaciones_online = len([c for c in cargadores if c.serial_number in conexiones_activas or c.status != "fuera_de_linea"])
    estaciones_en_falla = len([c for c in cargadores if c.status == "falla" or (c.last_error_code and c.last_error_code != "NoError")])

    return DashboardKpisResponse(
        recaudacion_mes=round(neto_recaudado, 0),
        recaudacion_bruta=round(bruto, 0),
        costo_ande_total=round(costo_ande, 0),
        margen_neto_sipar=round(margen_neto, 0),
        reembolsos_total=round(reembolsado, 0),
        disputas_pendientes=disputas_pendientes,
        energia_entregada_kwh=round(energia, 2),
        co2_ahorrado_kg=round(co2, 2),
        usuarios_activos=usuarios_activos,
        total_sesiones=len(txs),
        sesiones_con_alerta_ocpp=alertas_ocpp,
        estaciones_online=estaciones_online,
        estaciones_en_falla=estaciones_en_falla,
        estaciones_total=estaciones_total
    )


@router.get("/map-chargers", response_model=List[DashboardChargerMapResponse])
def get_map_chargers(db: Session = Depends(get_db)):
    """Retorna la lista de cargadores sincronizada en tiempo real con el motor WebSocket OCPP."""
    chargers = db.query(models.Charger).filter(models.Charger.is_active == True).order_by(models.Charger.id.asc()).all()
    
    hubo_cambios = False
    for c in chargers:
        esta_conectado = c.serial_number in conexiones_activas
        if not esta_conectado and c.status != "fuera_de_linea":
            c.status = "fuera_de_linea"
            for con in c.connectors:
                if con.status != "fuera_de_linea":
                    con.status = "fuera_de_linea"
            hubo_cambios = True
        elif esta_conectado and c.status == "fuera_de_linea":
            c.status = "disponible"
            hubo_cambios = True

    if hubo_cambios:
        db.commit()

    resultado = []
    for c in chargers:
        t_name = c.tariff.name if c.tariff else "Tarifa Base"
        t_price = float(c.tariff.price_kwh) if c.tariff and c.tariff.price_kwh is not None else 2500.0
        resultado.append(DashboardChargerMapResponse(
            id=c.id,
            serial_number=c.serial_number,
            status=c.status or "fuera_de_linea",
            power_kw=float(c.power_kw or 0.0),
            location=c.location,
            vendor=c.vendor,
            model=c.model,
            last_heartbeat=c.last_heartbeat,
            last_error_code=c.last_error_code or "NoError",
            ande_tension_type=c.ande_tension_type or "baja",
            tariff_name=t_name,
            price_kwh=t_price,
            connectors=c.connectors
        ))
    return resultado


@router.get("/recent-transactions", response_model=List[DashboardRecentTxResponse])
def get_recent_transactions(
    limit: int = Query(8, ge=1, le=30),
    db: Session = Depends(get_db)
):
    """Retorna las últimas transacciones incluyendo estación, estado OCPP y costo ANDE."""
    txs = db.query(models.Transaction).order_by(models.Transaction.id.desc()).limit(limit).all()
    
    result = []
    for tx in txs:
        user_name = f"{tx.user.first_name or ''} {tx.user.last_name or ''}".strip() if tx.user else "Cliente SIPAR"
        charger_serial = tx.charger.serial_number if tx.charger else "Estación SIPAR"
        billed = float(tx.total_amount_pyg or 0.0)
        refunded = float(tx.refund_amount_pyg or 0.0) if getattr(tx, "dispute_status", "none") == "refunded" else 0.0

        result.append(DashboardRecentTxResponse(
            id=tx.id,
            user_name=user_name or "Cliente SIPAR",
            charger_serial=charger_serial,
            kwh=round(float(tx.kwh_delivered or 0.0), 2),
            amount_pyg=round(max(0.0, billed - refunded), 0),
            ande_cost_pyg=round(float(tx.ande_energy_cost_pyg or 0.0), 0),
            status=tx.status or "concluida",
            error_code=getattr(tx, "error_code", "NoError") or "NoError",
            dispute_status=getattr(tx, "dispute_status", "none") or "none",
            start_time=tx.start_time
        ))
    return result


@router.get("/top-drivers", response_model=List[DashboardTopDriverResponse])
def get_top_drivers(
    period: str = Query("all", description="'today' | 'month' | 'all'"),
    db: Session = Depends(get_db)
):
    """Retorna el ranking de conductores con mayor consumo, sesiones y ahorro de CO2."""
    base_q = apply_period_filter(db.query(models.Transaction), period)
    top_rows = (
        base_q.with_entities(
            models.Transaction.user_id,
            func.count(models.Transaction.id).label("sessions_count"),
            func.sum(models.Transaction.kwh_delivered).label("total_kwh"),
            func.sum(models.Transaction.total_amount_pyg).label("total_spent")
        )
        .filter(models.Transaction.user_id != None)
        .group_by(models.Transaction.user_id)
        .order_by(func.sum(models.Transaction.kwh_delivered).desc(), func.count(models.Transaction.id).desc())
        .limit(5)
        .all()
    )

    result = []
    for row in top_rows:
        user = db.query(models.User).filter(models.User.id == row.user_id).first()
        if user:
            user_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
            kwh_val = round(float(row.total_kwh or 0.0), 2)
            result.append(DashboardTopDriverResponse(
                user_name=user_name,
                user_email=user.email,
                sessions_count=int(row.sessions_count or 0),
                total_kwh=kwh_val,
                total_spent_pyg=round(float(row.total_spent or 0.0), 0),
                co2_saved_kg=round(kwh_val * 1.05, 2)
            ))
    return result