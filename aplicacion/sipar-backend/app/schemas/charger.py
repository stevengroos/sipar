# app/schemas/charger.py
from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel

class LocationSchema(BaseModel):
    lat: float
    lng: float
    address: Optional[str] = "Sin dirección"

class ConnectorResponse(BaseModel):
    id: int
    connector_id: int
    status: str
    type: Optional[str] = "Desconocido"

    class Config:
        from_attributes = True

class ChargerCreate(BaseModel):
    serial_number: str
    status: Optional[str] = "fuera_de_linea"
    power_kw: float
    location: LocationSchema
    company_id: Optional[int] = 1
    # Parámetros ANDE configurables por cargador
    ande_tension_type: Optional[str] = "baja"
    ande_cost_off_peak: Optional[float] = 0.0
    ande_cost_peak: Optional[float] = 0.0
    ande_peak_start: Optional[str] = "18:00"
    ande_peak_end: Optional[str] = "21:00"
    ande_peak_days: Optional[List[int]] = [1, 2, 3, 4, 5, 6]

class ChargerResponse(BaseModel):
    id: int
    serial_number: str
    status: str
    power_kw: float
    location: Any
    company_id: int
    is_active: bool
    tariff_id: Optional[int] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    ande_tension_type: Optional[str] = "baja"
    ande_cost_off_peak: Optional[float] = 0.0
    ande_cost_peak: Optional[float] = 0.0
    ande_peak_start: Optional[str] = "18:00"
    ande_peak_end: Optional[str] = "21:00"
    ande_peak_days: Optional[List[int]] = [1, 2, 3, 4, 5, 6]
    connectors: List[ConnectorResponse] = []

    class Config:
        from_attributes = True