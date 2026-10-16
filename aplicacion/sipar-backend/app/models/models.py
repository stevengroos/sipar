# app/models/models.py
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, DateTime, JSON, Numeric, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Company(Base):
    __tablename__ = "companies" # Forzamos el plural correcto en inglés
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)

class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(150), unique=True, index=True, nullable=False)
    first_name = Column(String(50))
    last_name = Column(String(50))
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="operador") # <-- NUEVA COLUMNA DE ROLES
    is_active = Column(Boolean, default=True)
    
    company = relationship("Company")

class Charger(Base):
    __tablename__ = "chargers" # <-- AGREGA ESTA LÍNEA
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(50), unique=True, index=True, nullable=False)
    status = Column(String(20), default="disponible") # disponible, en_uso, fuera_de_linea
    power_kw = Column(Float, nullable=False)
    location = Column(JSON) 
    is_active = Column(Boolean, default=True) # <-- ESTA ES LA ÚNICA LÍNEA NUEVA
    tariff_id = Column(Integer, ForeignKey("tariffs.id"), nullable=True)
    # Nuevos campos dinámicos de hardware
    vendor = Column(String, nullable=True)
    model = Column(String, nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    connectors = relationship("Connector", back_populates="charger", cascade="all, delete-orphan")
    
    company = relationship("Company")
    tariff = relationship("Tariff", back_populates="chargers")
# NUEVA CLASE PARA LAS MANGUERAS
class Connector(Base):
    __tablename__ = "connectors"
    
    id = Column(Integer, primary_key=True, index=True)
    charger_id = Column(Integer, ForeignKey("chargers.id", ondelete="CASCADE"))
    connector_id = Column(Integer, nullable=False) # Ej: 1, 2, 3
    status = Column(String, default="disponible")
    type = Column(String, default="Desconocido") # Ej: CCS2, CHAdeMO
    
    charger = relationship("Charger", back_populates="connectors")

class Transaction(Base):
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    charger_id = Column(Integer, ForeignKey("chargers.id", ondelete="SET NULL"), nullable=True)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)
    kwh_delivered = Column(Float, default=0.0)
    total_amount_pyg = Column(Float, default=0.0)
    
    user = relationship("User")
    charger = relationship("Charger")
    
class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    security_2fa = Column(Boolean, default=True)
    security_session = Column(String, default="30 minutos (Recomendado)")
    security_password = Column(String, default="Exigir rotación cada 90 días")
    notif_hardware = Column(Boolean, default=True)
    notif_fraud = Column(Boolean, default=True)
    notif_daily = Column(Boolean, default=False)
    pref_dark_mode = Column(Boolean, default=False)
    pref_language = Column(String, default="Español (Latinoamérica)")
    
class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    permissions = Column(JSON, default={})
    
    
# 2. NUEVA CLASE TARIFA
class Tariff(Base):
    __tablename__ = "tariffs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    price_kwh = Column(Numeric, nullable=False)
    connection_fee = Column(Numeric, default=0)
    is_active = Column(Boolean, default=True)

    # Relación inversa: Una tarifa puede tener múltiples cargadores
    chargers = relationship("Charger", back_populates="tariff")
    
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, index=True, nullable=False)
    price = Column(Numeric, nullable=False)
    stock = Column(Integer, default=0)
    image_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    stock_movements = relationship("StockHistory", back_populates="product")

class StockHistory(Base):
    __tablename__ = "stock_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    movement_type = Column(String, nullable=False) # 'ingreso' o 'salida'
    quantity = Column(Integer, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="stock_movements")
    user = relationship("User") # Relación al usuario que hizo el ajuste