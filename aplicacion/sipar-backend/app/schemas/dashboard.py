from pydantic import BaseModel
from typing import Any, List

class KpisResponse(BaseModel):
    recaudacion_mes: float
    energia_entregada_kwh: float
    co2_ahorrado_kg: float
    usuarios_activos: int

class ChargerMapResponse(BaseModel):
    id: int
    serial_number: str
    status: str
    power_kw: float
    location: Any  # Usamos Any para evitar bloqueos si la DB lo manda como texto

    class Config:
        from_attributes = True  # ¡ESTO ES VITAL PARA LEER DESDE SQLALCHEMY!

class RecentTransactionResponse(BaseModel):
    id: int
    user_name: str
    kwh: float
    amount_pyg: float

class TopDriverResponse(BaseModel):
    user_name: str
    total_kwh: float
    co2_saved_kg: float