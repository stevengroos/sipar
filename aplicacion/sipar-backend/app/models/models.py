# app/models/models.py
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, DateTime, JSON, Numeric, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(150), unique=True, index=True, nullable=False)
    first_name = Column(String(50))
    last_name = Column(String(50))
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="operador")
    is_active = Column(Boolean, default=True)

    # --- CAMPOS DE SEGURIDAD ISO 27001 & MFA ---
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(64), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(64), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), server_default=func.now())
    must_change_password = Column(Boolean, default=False)
    
    company = relationship("Company")

class Charger(Base):
    __tablename__ = "chargers"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(50), unique=True, index=True, nullable=False)
    status = Column(String(20), default="disponible") # disponible, en_uso, fuera_de_linea
    power_kw = Column(Float, nullable=False)
    location = Column(JSON) 
    is_active = Column(Boolean, default=True)
    tariff_id = Column(Integer, ForeignKey("tariffs.id"), nullable=True)
    last_error_code = Column(String(100), default="NoError")
    
    # Campos dinámicos de hardware
    vendor = Column(String, nullable=True)
    model = Column(String, nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)

    # --- NUEVOS CAMPOS: COSTO DE ENERGÍA ANDE (Liquidación Propietario) ---
    ande_tension_type = Column(String(20), default="baja") # 'baja' o 'media'
    ande_cost_off_peak = Column(Float, default=0.0)        # Gs/kWh Fuera de Punta (o tarifa plana en Baja Tensión)
    ande_cost_peak = Column(Float, default=0.0)            # Gs/kWh Punta de Carga (ej. 18 a 21 hs)
    ande_peak_start = Column(String(10), default="18:00")  # Inicio horario punta
    ande_peak_end = Column(String(10), default="21:00")    # Fin horario punta
    ande_peak_days = Column(JSON, default=[1, 2, 3, 4, 5, 6]) # Días (1=Lun ... 6=Sáb, 0=Dom)

    connectors = relationship("Connector", back_populates="charger", cascade="all, delete-orphan")
    company = relationship("Company")
    tariff = relationship("Tariff", back_populates="chargers")

class Connector(Base):
    __tablename__ = "connectors"
    id = Column(Integer, primary_key=True, index=True)
    charger_id = Column(Integer, ForeignKey("chargers.id", ondelete="CASCADE"))
    connector_id = Column(Integer, nullable=False)
    status = Column(String, default="disponible")
    type = Column(String, default="Desconocido")
    error_code = Column(String(100), default="NoError")
    
    charger = relationship("Charger", back_populates="connectors")

class Transaction(Base):
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    charger_id = Column(Integer, ForeignKey("chargers.id", ondelete="SET NULL"), nullable=True)
    stop_reason = Column(String(100), default="Local")
    error_code = Column(String(100), default="NoError")
    
    # --- Identificación OCPP y Estado ---
    connector_id = Column(Integer, default=1)
    id_tag = Column(String(100), default="APP-SIPAR")
    unlock_method = Column(String(50), default="App") # 'App', 'RFID', 'Admin'
    status = Column(String(30), default="en_curso")   # 'en_curso', 'concluida'

    # --- Tiempos y Franja Horaria ---
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, default=0)     # Tiempo total acumulado de carga
    idle_seconds = Column(Integer, default=0)         # Tiempo de inactividad

    # --- Medidor y Potencia ---
    meter_start = Column(Integer, default=0)          # Wh iniciales
    meter_stop = Column(Integer, default=0)           # Wh finales
    kwh_delivered = Column(Float, default=0.0)        # Energía consumida (kWh)
    avg_power_kw = Column(Float, default=0.0)         # Potencia media (kW)
    max_power_kw = Column(Float, default=0.0)         # Potencia máxima (kW)
    co2_saved_kg = Column(Float, default=0.0)         # CO2 evitado (kg)

    # --- Facturación Cliente (SIPAR) ---
    tariff_price_kwh = Column(Float, default=0.0)     # Precio de venta por kWh aplicado
    unlock_fee_pyg = Column(Float, default=0.0)       # Tarifa de desbloqueo fija
    total_amount_pyg = Column(Float, default=0.0)     # Coste total cobrado al cliente (PYG)
    payment_method = Column(String(50), default="Cartera Digital")

    # --- Liquidación Propietario (Costo de Energía ANDE) ---
    ande_applied_rate = Column(Float, default=0.0)    # Tarifa ANDE ponderada aplicada (Gs/kWh)
    ande_energy_cost_pyg = Column(Float, default=0.0) # "Costo de Energía" total a reembolsar al propietario (PYG)
    time_band_label = Column(String(50), default="Fuera de Punta") # 'Fuera de Punta', 'Punta de Carga', 'Mixto'

    # --- Telemetría para Gráfico de Consumo ---
    telemetry_log = Column(JSON, default=[])          # Lista de puntos [{time, kwh, kw, soc}]
    
    user = relationship("User")
    charger = relationship("Charger")
    
    # --- Gestión de Reclamos, Disputas y Reversiones (App Móvil & Finanzas) ---
    dispute_status = Column(String(30), default="none") # 'none', 'pending', 'refunded', 'rejected'
    dispute_reason = Column(String, nullable=True)
    dispute_created_at = Column(DateTime(timezone=True), nullable=True)
    refund_amount_pyg = Column(Float, default=0.0)
    dispute_resolution_note = Column(String, nullable=True)
    dispute_resolved_at = Column(DateTime(timezone=True), nullable=True)
    dispute_resolved_by = Column(String(150), nullable=True)
    
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
    
class Tariff(Base):
    __tablename__ = "tariffs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    price_kwh = Column(Numeric, nullable=False)
    connection_fee = Column(Numeric, default=0)
    is_active = Column(Boolean, default=True)

    chargers = relationship("Charger", back_populates="tariff")
    
class StoreCategory(Base):
    __tablename__ = "store_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, index=True, nullable=False)
    category = Column(String(80), default="Accesorios EV")
    description = Column(String, nullable=True, default="")
    price = Column(Numeric, nullable=False)
    stock = Column(Integer, default=0)
    image_url = Column(String, nullable=True)
    show_in_app = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)

    stock_movements = relationship("StockHistory", back_populates="product")
    
class StockHistory(Base):
    __tablename__ = "stock_history"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    movement_type = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="stock_movements")
    user = relationship("User")
    
    
class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(150), nullable=True)
    action = Column(String(100), nullable=False)
    target = Column(String(150), nullable=True)
    ip_address = Column(String(64), nullable=True)
    status = Column(String(30), default="SUCCESS") # SUCCESS, WARNING, DANGER
    details = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())