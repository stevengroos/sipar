from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime # <-- ¡Esta es la línea que falta!

class LocationSchema(BaseModel):
    lat: float
    lng: float
    address: str

class ChargerBase(BaseModel):
    serial_number: str
    status: str = "disponible"
    power_kw: float
    location: LocationSchema
    company_id: int

class ChargerCreate(ChargerBase):
    pass

# NUEVO ESQUEMA
class ConnectorResponse(BaseModel):
    id: int
    connector_id: int
    status: str
    type: str
    
    class Config:
        from_attributes = True

class ChargerResponse(ChargerBase):
    id: int
    is_active: bool
    vendor: Optional[str] = None
    model: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    connectors: List[ConnectorResponse] = [] # ¡Agregamos la lista de mangueras!

    class Config:
        from_attributes = True # Permite leer directamente desde los modelos de SQLAlchemy