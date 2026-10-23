# app/api/v1/endpoints/tariffs.py
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.models import models
from app.api import deps
from app.core import security

router = APIRouter()

# --- FUNCIONES AUXILIARES DE AUDITORÍA ISO 27001 ---
def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def log_tariff_event(
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
class ChargerSimple(BaseModel):
    id: int
    serial_number: str
    power_kw: Optional[float] = 0.0
    status: Optional[str] = "disponible"

    class Config:
        from_attributes = True

class TariffResponse(BaseModel):
    id: int
    name: str
    price_kwh: float
    connection_fee: float
    is_active: bool
    chargers: List[ChargerSimple] = []

    class Config:
        from_attributes = True

class TariffCreateUpdate(BaseModel):
    name: str
    price_kwh: float
    connection_fee: float = 0.0
    is_active: Optional[bool] = True
    charger_ids: List[int] = []
    admin_password: Optional[str] = None  # Contraseña real del admin para autorizar cambios (ISO 27001)

class TariffAuditLogResponse(BaseModel):
    id: int
    actor_email: Optional[str] = ""
    action: str
    target: Optional[str] = ""
    ip_address: Optional[str] = ""
    status: str
    details: Optional[str] = ""
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- RUTAS DE PRODUCCIÓN ---
@router.get("/", response_model=List[TariffResponse])
def get_tariffs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene todas las tarifas y los cargadores activos asociados a cada una."""
    tariffs = db.query(models.Tariff).order_by(models.Tariff.is_active.desc(), models.Tariff.id.asc()).all()
    for t in tariffs:
        t.chargers = [c for c in t.chargers if c.is_active]
    return tariffs

@router.get("/audit-logs", response_model=List[TariffAuditLogResponse])
def get_tariff_audit_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_active_user)
):
    """Obtiene el historial inmutable de modificaciones de precios y tarifas (ISO 27001)."""
    try:
        return (
            db.query(models.SecurityAuditLog)
            .filter(models.SecurityAuditLog.action.like("TARIFF_%"))
            .order_by(models.SecurityAuditLog.id.desc())
            .limit(100)
            .all()
        )
    except Exception:
        return []

@router.post("/", response_model=TariffResponse)
def create_tariff(
    tariff_in: TariffCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Crea una nueva tarifa validando credenciales administrativas y registrando auditoría."""
    client_ip = get_client_ip(request)

    if not tariff_in.admin_password or not security.verify_password(tariff_in.admin_password, current_user.hashed_password):
        log_tariff_event(
            db, current_user, "TARIFF_AUTH_FAILED", tariff_in.name, client_ip,
            "Intento fallido de crear tarifa: contraseña de autorización incorrecta", "WARNING"
        )
        raise HTTPException(status_code=403, detail="Contraseña de autorización incorrecta.")

    clean_name = tariff_in.name.strip()
    if db.query(models.Tariff).filter(models.Tariff.name.ilike(clean_name)).first():
        raise HTTPException(status_code=400, detail="Ya existe una tarifa con este nombre.")
        
    new_tariff = models.Tariff(
        name=clean_name,
        price_kwh=tariff_in.price_kwh,
        connection_fee=tariff_in.connection_fee,
        is_active=True
    )
    db.add(new_tariff)
    db.commit()
    db.refresh(new_tariff)
    
    assigned_serials = []
    if tariff_in.charger_ids:
        chargers_to_assign = db.query(models.Charger).filter(models.Charger.id.in_(tariff_in.charger_ids)).all()
        for ch in chargers_to_assign:
            ch.tariff_id = new_tariff.id
            assigned_serials.append(ch.serial_number)
        db.commit()
        db.refresh(new_tariff)

    estaciones_txt = f" | Estaciones: {', '.join(assigned_serials)}" if assigned_serials else " | Sin estaciones asignadas"
    log_tariff_event(
        db, current_user, "TARIFF_CREATED", new_tariff.name, client_ip,
        f"Nueva tarifa creada: {int(tariff_in.price_kwh):,} Gs/kWh | Conexión: {int(tariff_in.connection_fee):,} Gs{estaciones_txt}".replace(",", ".")
    )
        
    return new_tariff

@router.put("/{tariff_id}", response_model=TariffResponse)
def update_tariff(
    tariff_id: int,
    tariff_in: TariffCreateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Actualiza precios, estado o cargadores de una tarifa y registra el antes/después en auditoría."""
    client_ip = get_client_ip(request)

    if not tariff_in.admin_password or not security.verify_password(tariff_in.admin_password, current_user.hashed_password):
        log_tariff_event(
            db, current_user, "TARIFF_AUTH_FAILED", tariff_in.name, client_ip,
            f"Intento fallido de editar tarifa #{tariff_id}: contraseña incorrecta", "WARNING"
        )
        raise HTTPException(status_code=403, detail="Contraseña de autorización incorrecta.")

    tariff = db.query(models.Tariff).filter(models.Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada.")
        
    clean_name = tariff_in.name.strip()
    if tariff.name.lower() != clean_name.lower():
        if db.query(models.Tariff).filter(models.Tariff.name.ilike(clean_name)).first():
            raise HTTPException(status_code=400, detail="El nombre ya está en uso por otra tarifa.")

    old_price = float(tariff.price_kwh or 0)
    old_fee = float(tariff.connection_fee or 0)
    old_active = bool(tariff.is_active)
    new_price = float(tariff_in.price_kwh or 0)
    new_fee = float(tariff_in.connection_fee or 0)
    new_active = tariff_in.is_active if tariff_in.is_active is not None else tariff.is_active

    cambios = []
    if old_price != new_price:
        cambios.append(f"Precio kWh: {int(old_price):,} ₲ → {int(new_price):,} ₲".replace(",", "."))
    if old_fee != new_fee:
        cambios.append(f"Conexión: {int(old_fee):,} ₲ → {int(new_fee):,} ₲".replace(",", "."))
    if old_active != new_active:
        cambios.append("Estado: " + ("Reactivada" if new_active else "Desactivada"))

    tariff.name = clean_name
    tariff.price_kwh = new_price
    tariff.connection_fee = new_fee
    tariff.is_active = new_active
    
    # 1. Desasignar de los cargadores anteriores
    db.query(models.Charger).filter(models.Charger.tariff_id == tariff_id).update(
        {"tariff_id": None}, synchronize_session=False
    )
    
    # 2. Asignar a los nuevos cargadores seleccionados (si la tarifa sigue activa)
    assigned_serials = []
    if tariff.is_active and tariff_in.charger_ids:
        chargers_to_assign = db.query(models.Charger).filter(models.Charger.id.in_(tariff_in.charger_ids)).all()
        for ch in chargers_to_assign:
            ch.tariff_id = tariff.id
            assigned_serials.append(ch.serial_number)

    cambios.append(f"Estaciones ({len(assigned_serials)}): {', '.join(assigned_serials) if assigned_serials else 'Ninguna'}")
        
    db.commit()
    db.refresh(tariff)

    log_tariff_event(
        db, current_user, "TARIFF_UPDATED", tariff.name, client_ip,
        " | ".join(cambios)
    )
    return tariff

@router.delete("/{tariff_id}")
def delete_tariff(
    tariff_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.RoleChecker(["superadmin", "admin", "Super Admin"]))
):
    """Desactiva lógicamente una tarifa y libera sus cargadores registrando el evento."""
    tariff = db.query(models.Tariff).filter(models.Tariff.id == tariff_id).first()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada.")
    
    tariff.is_active = False
    db.query(models.Charger).filter(models.Charger.tariff_id == tariff_id).update(
        {"tariff_id": None}, synchronize_session=False
    )
    db.commit()

    log_tariff_event(
        db, current_user, "TARIFF_DEACTIVATED", tariff.name, get_client_ip(request),
        f"Tarifa '{tariff.name}' desactivada y estaciones desvinculadas", "WARNING"
    )
    return {"detail": "Tarifa desactivada correctamente."}