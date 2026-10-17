from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
import logging
from datetime import datetime, timezone
import time  # <-- IMPORTACIÓN PARA GENERAR ID DE TRANSACCIÓN

from ocpp.routing import on
from ocpp.v16 import ChargePoint as cp
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus  # <-- IMPORTACIÓN PARA AUTORIZAR LA CARGA
from ocpp.v16 import call_result, call

from app.db.session import SessionLocal # Usamos SessionLocal para conexiones seguras en segundo plano
from app.models import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocpp")

router = APIRouter()

# DICCIONARIO GLOBAL: Aquí guardamos los cargadores que están vivos/conectados
conexiones_activas = {}

class FastAPIWebsocketAdapter:
    def __init__(self, websocket: WebSocket):
        self._ws = websocket
    async def recv(self):
        return await self._ws.receive_text()
    async def send(self, message):
        await self._ws.send_text(message)

# MANEJADOR OCPP
class ChargePointHandler(cp):
    
    # 1. ARRANQUE: Atrapamos el Fabricante y Modelo real
    @on('BootNotification')
    async def on_boot_notification(self, charge_point_vendor: str, charge_point_model: str, **kwargs):
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
        
        if cargador:
            # ¡MAGIA! Guardamos los datos reales del hardware en PostgreSQL
            cargador.vendor = charge_point_vendor
            cargador.model = charge_point_model
            cargador.last_heartbeat = datetime.now(timezone.utc)
            db.commit()
            db.close()
            
            return call_result.BootNotification(
                current_time=datetime.now(timezone.utc).isoformat(),
                interval=60, # Le pedimos que lata cada 60 segundos
                status=RegistrationStatus.accepted
            )
        db.close()
        return call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=60, status=RegistrationStatus.rejected
        )
        
    # 2. NUEVO EVENTO: El latido del corazón (Heartbeat)
    @on('Heartbeat')
    async def on_heartbeat(self, **kwargs):
        logger.info(f"💓 [{self.id}] Latido recibido.")
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
        if cargador:
            cargador.last_heartbeat = datetime.now(timezone.utc)
            db.commit()
        db.close()
        
        return call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on('StatusNotification')
    async def on_status_notification(self, connector_id: int, error_code: str, status: str, **kwargs):
        logger.info(f"[{self.id}] El conector {connector_id} cambió su estado a: {status}")
        
        db_status = "disponible"
        if status in ["Preparing", "Charging", "SuspendedEV", "SuspendedEVSE"]:
            db_status = "en_uso"
        elif status in ["Faulted", "Unavailable"]:
            db_status = "fuera_de_linea"
            
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
        
        if cargador and connector_id > 0: # El 0 es la máquina entera, >0 son las mangueras físicas
            # Buscamos si la manguera ya existe en la DB
            conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
            
            if not conector_db:
                # ¡SI NO EXISTE, LA CREAMOS AUTOMÁTICAMENTE!
                conector_db = models.Connector(
                    charger_id=cargador.id, 
                    connector_id=connector_id, 
                    status=db_status,
                    type=f"Manguera {connector_id}"
                )
                db.add(conector_db)
            else:
                conector_db.status = db_status
                
            db.commit()
        db.close()
        
        return call_result.StatusNotification()

    # ==============================================================
    # 3. NUEVOS EVENTOS: Autorización de inicio y fin de carga
    # ==============================================================
    
    @on('StartTransaction')
    async def on_start_transaction(self, connector_id: int, id_tag: str, meter_start: int, timestamp: str, **kwargs):
        logger.info(f"[{self.id}] Solicitud de inicio en conector {connector_id} con Tag: {id_tag}")
        
        # Generamos un ID de transacción numérico usando el tiempo actual (requerido por OCPP)
        transaction_id = int(time.time())
        
        return call_result.StartTransaction(
            transaction_id=transaction_id,
            id_tag_info={
                "status": AuthorizationStatus.accepted
            }
        )

    @on('StopTransaction')
    async def on_stop_transaction(self, meter_stop: int, timestamp: str, transaction_id: int, **kwargs):
        logger.info(f"[{self.id}] Finalizando transacción {transaction_id}. Consumo: {meter_stop}")
        
        return call_result.StopTransaction(
            id_tag_info={
                "status": AuthorizationStatus.accepted
            }
        )

# RUTA WEBSOCKET (Conexión física)
@router.websocket("/{charge_point_id}")
async def ocpp_endpoint(websocket: WebSocket, charge_point_id: str):
    # Validamos y aceptamos el subprotocolo OCPP si el cargador lo envía
    subprotocol = websocket.headers.get("sec-websocket-protocol")
    if subprotocol:
        await websocket.accept(subprotocol=subprotocol)
    else:
        await websocket.accept()
    
    adapter = FastAPIWebsocketAdapter(websocket)
    cp_handler = ChargePointHandler(charge_point_id, adapter)
    
    # Guardamos el cargador en el diccionario de conexiones activas
    conexiones_activas[charge_point_id] = cp_handler
    logger.info(f"🟢 Cargador {charge_point_id} conectado. Total en línea: {len(conexiones_activas)}")
    
    try:
        await cp_handler.start()
    except WebSocketDisconnect:
        logger.warning(f"🔴 Cargador {charge_point_id} desconectado físicamente.")
        
        # --- CÓDIGO AÑADIDO: Avisar a la base de datos de la desconexión ---
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == charge_point_id).first()
        
        if cargador:
            # Buscamos todos los conectores de este cargador y los apagamos
            conectores = db.query(models.Connector).filter_by(charger_id=cargador.id).all()
            for conector in conectores:
                conector.status = "fuera_de_linea"
            
            db.commit()
        db.close()
        # ------------------------------------------------------------------
        
    finally:
        if charge_point_id in conexiones_activas:
            del conexiones_activas[charge_point_id]
            
# ==============================================================
# NUEVAS RUTAS API REST (Para que las consuma el Frontend React)
# ==============================================================

@router.post("/{charge_point_id}/reset")
async def comando_reset(charge_point_id: str, tipo: str = "Soft"):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    
    request = call.Reset(type=tipo)
    response = await cargador.call(request)
    return {"mensaje": f"Comando Reset enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/start")
async def comando_iniciar_carga(charge_point_id: str, tag: str = "APP-SIPAR", connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    
    # Aquí inyectamos el connector_id que envía React
    request = call.RemoteStartTransaction(id_tag=tag, connector_id=connector_id)
    response = await cargador.call(request)
    return {"mensaje": "Comando Inicio enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/stop")
async def comando_parar_carga(charge_point_id: str, transaction_id: int = 1, connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    
    # Truco para el simulador: usamos el connector_id en lugar de la transacción
    request = call.RemoteStopTransaction(transaction_id=connector_id)
    response = await cargador.call(request)
    return {"mensaje": "Comando Parada enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/unlock")
async def comando_desbloquear(charge_point_id: str, connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    
    request = call.UnlockConnector(connector_id=connector_id)
    response = await cargador.call(request)
    return {"respuesta_hardware": response.status}