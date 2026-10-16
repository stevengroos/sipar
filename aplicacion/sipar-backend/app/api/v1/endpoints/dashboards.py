from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

# Importamos la conexión a BD, los modelos y TODOS los esquemas
from app.db.session import get_db
from app.models import models
from app.schemas.dashboard import (
    KpisResponse, 
    ChargerMapResponse, 
    RecentTransactionResponse, 
    TopDriverResponse
)

router = APIRouter()

@router.get("/kpis", response_model=KpisResponse)
def get_dashboard_kpis(db: Session = Depends(get_db)):
    """Retorna los indicadores principales sumando los datos reales."""
    usuarios_activos = db.query(models.User).filter(models.User.is_active == True).count()
    recaudacion = db.query(func.sum(models.Transaction.total_amount_pyg)).scalar() or 0.0
    energia = db.query(func.sum(models.Transaction.kwh_delivered)).scalar() or 0.0
    co2_ahorrado = energia * 0.4

    return KpisResponse(
        recaudacion_mes=recaudacion,
        energia_entregada_kwh=energia,
        co2_ahorrado_kg=co2_ahorrado,
        usuarios_activos=usuarios_activos
    )

@router.get("/map-chargers", response_model=List[ChargerMapResponse])
def get_map_chargers(db: Session = Depends(get_db)):
    """Retorna la lista de cargadores con sus coordenadas para el mapa."""
    chargers = db.query(models.Charger).filter(models.Charger.is_active == True).all()
    return chargers

@router.get("/recent-transactions", response_model=List[RecentTransactionResponse])
def get_recent_transactions(db: Session = Depends(get_db)):
    """Retorna las últimas 5 transacciones de carga."""
    txs = db.query(models.Transaction).order_by(models.Transaction.start_time.desc()).limit(5).all()
    
    result = []
    for tx in txs:
        user_name = f"{tx.user.first_name} {tx.user.last_name}" if tx.user else "Usuario Invitado"
        result.append({
            "id": tx.id,
            "user_name": user_name,
            "kwh": tx.kwh_delivered,
            "amount_pyg": tx.total_amount_pyg
        })
    return result

@router.get("/top-drivers", response_model=List[TopDriverResponse])
def get_top_drivers(db: Session = Depends(get_db)):
    """Retorna los 5 usuarios que más energía han consumido."""
    top_users = db.query(
        models.Transaction.user_id,
        func.sum(models.Transaction.kwh_delivered).label("total_kwh")
    ).group_by(models.Transaction.user_id).order_by(func.sum(models.Transaction.kwh_delivered).desc()).limit(5).all()

    result = []
    for row in top_users:
        if row.user_id:
            user = db.query(models.User).filter(models.User.id == row.user_id).first()
            user_name = f"{user.first_name} {user.last_name}" if user else "Desconocido"
            result.append({
                "user_name": user_name,
                "total_kwh": row.total_kwh,
                "co2_saved_kg": row.total_kwh * 0.4 
            })
    return result