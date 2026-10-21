# app/api/v1/endpoints/ws_ocpp.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
import logging
import json
from datetime import datetime, timezone, timedelta
import time

from ocpp.routing import on
from ocpp.v16 import ChargePoint as cp
from ocpp.v16.enums import RegistrationStatus, AuthorizationStatus
from ocpp.v16 import call_result, call

from app.db.session import SessionLocal
from app.models import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocpp")

router = APIRouter()

conexiones_activas = {}
PY_TZ = timezone(timedelta(hours=-3))

# Diccionario de errores estándar OCPP 1.6 traducidos para el operador
OCPP_ERROR_TRANSLATIONS = {
    "NoError": "Sin errores (Operación Normal)",
    "ConnectorLockFailure": "Fallo en bloqueo electromecánico del conector",
    "EVCommunicationError": "Error de comunicación con el vehículo eléctrico",
    "GroundFailure": "Fallo de puesta a tierra detectado",
    "HighTemperature": "Alerta de alta temperatura interna",
    "InternalError": "Error interno del hardware del cargador",
    "LocalListConflict": "Conflicto en lista de autorización local",
    "OtherError": "Error general reportado por el cargador",
    "OverCurrentFailure": "Protección por sobrecorriente activada",
    "OverVoltage": "Sobretensión en la línea de alimentación",
    "PowerMeterFailure": "Fallo de lectura en el medidor de energía",
    "PowerSwitchFailure": "Fallo en el contactor / relé de potencia",
    "ReaderFailure": "Fallo en el lector de tarjetas RFID",
    "ResetFailure": "No se pudo completar el reinicio del equipo",
    "UnderVoltage": "Baja tensión en la red eléctrica (Subtensión)",
    "WeakSignal": "Señal de red Wi-Fi / 4G débil"
}

def parse_ocpp_timestamp(ts_str: str) -> datetime:
    if not ts_str:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)

def calcular_costo_ande(cargador: models.Charger, start_dt: datetime, end_dt: datetime, kwh: float):
    off_peak_rate = float(cargador.ande_cost_off_peak or 0.0)
    peak_rate = float(cargador.ande_cost_peak or off_peak_rate)
    tension = (cargador.ande_tension_type or "baja").lower()

    if tension == "baja" or peak_rate == off_peak_rate or kwh <= 0:
        return round(off_peak_rate, 2), round(kwh * off_peak_rate, 0), "Tarifa Plana (BT)"

    try:
        sh, sm = map(int, (cargador.ande_peak_start or "18:00").split(":"))
        eh, em = map(int, (cargador.ande_peak_end or "21:00").split(":"))
        peak_start_min = sh * 60 + sm
        peak_end_min = eh * 60 + em
    except Exception:
        peak_start_min, peak_end_min = 18 * 60, 21 * 60

    raw_days = cargador.ande_peak_days if isinstance(cargador.ande_peak_days, list) else [1, 2, 3, 4, 5, 6]
    py_weekdays = {(d - 1) if d > 0 else 6 for d in raw_days}

    start_local = start_dt.astimezone(PY_TZ)
    end_local = end_dt.astimezone(PY_TZ)
    total_seconds = max(1, int((end_local - start_local).total_seconds()))

    step = max(1, total_seconds // 120)
    peak_steps = 0
    total_steps = 0
    curr = start_local

    while curr <= end_local:
        total_steps += 1
        if curr.weekday() in py_weekdays:
            curr_min = curr.hour * 60 + curr.minute
            if peak_start_min <= curr_min < peak_end_min:
                peak_steps += 1
        curr += timedelta(seconds=step)

    peak_ratio = peak_steps / max(1, total_steps)
    effective_rate = (peak_ratio * peak_rate) + ((1.0 - peak_ratio) * off_peak_rate)
    total_ande_cost = kwh * effective_rate

    if peak_ratio >= 0.85:
        band_label = "Punta de Carga"
    elif peak_ratio <= 0.15:
        band_label = "Fuera de Punta"
    else:
        band_label = f"Mixto ({int(peak_ratio * 100)}% Punta)"

    return round(effective_rate, 2), round(total_ande_cost, 0), band_label


class FastAPIWebsocketAdapter:
    """
    Adaptador WebSocket con Sanitizador de Tipos OCPP.
    Corrige el bug de firmwares chinos que envían meterStop, meterStart,
    transactionId o connectorId como strings ("0", "12") en lugar de integers.
    """
    def __init__(self, websocket: WebSocket):
        self._ws = websocket

    async def recv(self):
        raw_msg = await self._ws.receive_text()
        try:
            parsed = json.loads(raw_msg)
            # Los mensajes CALL en OCPP tienen estructura: [2, "uniqueId", "Action", {payload}]
            if isinstance(parsed, list) and len(parsed) >= 4 and parsed[0] == 2 and isinstance(parsed[3], dict):
                payload = parsed[3]
                int_fields = ["connectorId", "transactionId", "meterStart", "meterStop", "reservationId"]
                modified = False
                for field in int_fields:
                    if field in payload and isinstance(payload[field], str):
                        try:
                            # Convertimos "0" o "12.0" a entero puro
                            payload[field] = int(float(payload[field]))
                            modified = True
                        except ValueError:
                            pass
                if modified:
                    raw_msg = json.dumps(parsed)
        except Exception as e:
            logger.warning(f"No se pudo sanitizar trama OCPP: {e}")
        return raw_msg

    async def send(self, message):
        await self._ws.send_text(message)


class ChargePointHandler(cp):
    
    @on('BootNotification')
    async def on_boot_notification(self, charge_point_vendor: str, charge_point_model: str, **kwargs):
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
        
        if cargador:
            cargador.vendor = charge_point_vendor
            cargador.model = charge_point_model
            cargador.status = "disponible"
            cargador.last_error_code = "NoError"
            cargador.last_heartbeat = datetime.now(timezone.utc)
            db.commit()
            db.close()
            
            return call_result.BootNotification(
                current_time=datetime.now(timezone.utc).isoformat(),
                interval=60,
                status=RegistrationStatus.accepted
            )
        db.close()
        return call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=60,
            status=RegistrationStatus.rejected
        )
        
    @on('Heartbeat')
    async def on_heartbeat(self, **kwargs):
        logger.info(f"💓 [{self.id}] Latido recibido.")
        db = SessionLocal()
        cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
        if cargador:
            cargador.last_heartbeat = datetime.now(timezone.utc)
            if cargador.status == "fuera_de_linea":
                cargador.status = "disponible"
            db.commit()
        db.close()
        
        return call_result.Heartbeat(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on('StatusNotification')
    async def on_status_notification(self, connector_id: int, error_code: str, status: str, **kwargs):
        logger.info(f"[{self.id}] Conector {connector_id} -> Estado OCPP: {status} | ErrorCode: {error_code}")
        
        # 1. DIFERENCIACIÓN CLARA DE ESTADOS:
        # - disponible: Libre para usar
        # - conectado: Auto enchufado, pero SIN pasar corriente (Preparing, SuspendedEV, SuspendedEVSE, Finishing)
        # - en_uso: Pasando corriente activamente (Charging)
        # - falla: Error eléctrico/físico reportado (Faulted o error_code != NoError)
        # - fuera_de_linea: No disponible (Unavailable)
        if error_code and error_code != "NoError":
            db_status = "falla"
        elif status == "Charging":
            db_status = "en_uso"
        elif status in ["Preparing", "SuspendedEV", "SuspendedEVSE", "Finishing", "Reserved"]:
            db_status = "conectado"
        elif status == "Faulted":
            db_status = "falla"
        elif status == "Unavailable":
            db_status = "fuera_de_linea"
        else:
            db_status = "disponible"
            
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            if cargador:
                cargador.last_heartbeat = datetime.now(timezone.utc)
                cargador.status = db_status
                cargador.last_error_code = error_code or "NoError"

                if connector_id > 0:
                    conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                    if not conector_db:
                        conector_db = models.Connector(
                            charger_id=cargador.id, 
                            connector_id=connector_id, 
                            status=db_status,
                            error_code=error_code or "NoError",
                            type="CCS 2 / Tipo 2"
                        )
                        db.add(conector_db)
                    else:
                        conector_db.status = db_status
                        conector_db.error_code = error_code or "NoError"

                # IMPORTANTE: Si el conector vuelve a "Available" (disponible) y había una transacción
                # que quedó 'en_curso', la cerramos preventivamente para que nunca quede colgada.
                if status == "Available":
                    stuck_txs = db.query(models.Transaction).filter(
                        models.Transaction.charger_id == cargador.id,
                        models.Transaction.status == "en_curso"
                    ).all()
                    now_utc = datetime.now(timezone.utc)
                    for stx in stuck_txs:
                        start_dt = stx.start_time or (now_utc - timedelta(minutes=1))
                        if start_dt.tzinfo is None:
                            start_dt = start_dt.replace(tzinfo=timezone.utc)
                        dur = max(1, int((now_utc - start_dt).total_seconds()))
                        kwh = float(stx.kwh_delivered or 0.0)
                        hours = dur / 3600.0
                        avg_kw = round(kwh / hours, 3) if hours > 0 and kwh > 0 else 0.0
                        price_kwh = float(stx.tariff_price_kwh or 2500.0)
                        unlock_fee = float(stx.unlock_fee_pyg or 0.0)
                        ande_rate, ande_cost, band_label = calcular_costo_ande(cargador, start_dt, now_utc, kwh)

                        stx.end_time = now_utc
                        stx.duration_seconds = dur
                        stx.avg_power_kw = avg_kw
                        stx.co2_saved_kg = round(kwh * 1.05, 2)
                        stx.total_amount_pyg = round((kwh * price_kwh) + unlock_fee, 0)
                        stx.ande_applied_rate = ande_rate
                        stx.ande_energy_cost_pyg = ande_cost
                        stx.time_band_label = band_label
                        stx.status = "concluida"
                        stx.stop_reason = "EVDisconnected"

                db.commit()
        finally:
            db.close()
        
        return call_result.StatusNotification()

    @on('StartTransaction')
    async def on_start_transaction(self, connector_id: int, id_tag: str, meter_start: int, timestamp: str, **kwargs):
        logger.info(f"[{self.id}] Inicio de carga en conector {connector_id} | Tag: {id_tag} | Medidor: {meter_start} Wh")
        
        start_dt = parse_ocpp_timestamp(timestamp)
        transaction_id = int(time.time())
        
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            if cargador:
                cargador.status = "en_uso"
                conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                if conector_db:
                    conector_db.status = "en_uso"

                price_kwh = 2500.0
                unlock_fee = 0.0
                if cargador.tariff:
                    price_kwh = float(cargador.tariff.price_kwh or 2500.0)
                    unlock_fee = float(cargador.tariff.connection_fee or 0.0)
                else:
                    default_tariff = db.query(models.Tariff).filter(models.Tariff.is_active == True).first()
                    if default_tariff:
                        price_kwh = float(default_tariff.price_kwh or 2500.0)
                        unlock_fee = float(default_tariff.connection_fee or 0.0)

                user = db.query(models.User).filter(models.User.email == id_tag).first()
                if not user:
                    user = db.query(models.User).order_by(models.User.id.asc()).first()

                unlock_method = "Panel Admin" if "ADMIN" in (id_tag or "").upper() else ("App" if "APP" in (id_tag or "").upper() else f"Tag ({id_tag})")

                hora_local = start_dt.astimezone(PY_TZ).strftime("%I:%M %p")
                nueva_tx = models.Transaction(
                    company_id=cargador.company_id,
                    user_id=user.id if user else None,
                    charger_id=cargador.id,
                    connector_id=connector_id,
                    id_tag=id_tag,
                    unlock_method=unlock_method,
                    status="en_curso",
                    start_time=start_dt,
                    meter_start=int(meter_start),
                    meter_stop=int(meter_start),
                    tariff_price_kwh=price_kwh,
                    unlock_fee_pyg=unlock_fee,
                    error_code=cargador.last_error_code or "NoError",
                    telemetry_log=[{"time": hora_local, "kwh": 0.0, "kw": 0.0, "soc": 20}]
                )
                db.add(nueva_tx)
                db.commit()
                db.refresh(nueva_tx)
                transaction_id = nueva_tx.id
        except Exception as e:
            logger.error(f"Error guardando StartTransaction: {e}")
        finally:
            db.close()
        
        return call_result.StartTransaction(
            transaction_id=transaction_id,
            id_tag_info={"status": AuthorizationStatus.accepted}
        )

    @on('MeterValues')
    async def on_meter_values(self, connector_id: int, meter_value: list, transaction_id: int = None, **kwargs):
        """
        Lee las métricas en vivo. Si detecta corriente > 0A o potencia > 0.1kW, marca 'en_uso' (Cargando).
        Si la corriente y potencia caen a 0 durante la sesión, acumula tiempo de inactividad (idle_seconds)
        y muestra que está 'conectado' sin pasar corriente.
        """
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            tx = None
            if transaction_id:
                tx = db.query(models.Transaction).filter(models.Transaction.id == int(transaction_id)).first()
            if not tx and cargador:
                tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

            if tx:
                current_kwh = float(tx.kwh_delivered or 0.0)
                current_kw = 0.0
                current_amps = 0.0
                current_soc = 50

                for mv in meter_value:
                    for sv in mv.get("sampled_value", mv.get("sampledValue", [])):
                        measurand = sv.get("measurand", "Energy.Active.Import.Register")
                        unit = sv.get("unit", "Wh")
                        try:
                            val = float(sv.get("value", 0))
                        except ValueError:
                            continue

                        if "Energy.Active.Import" in measurand:
                            val_wh = val * 1000.0 if unit == "kWh" else val
                            if val_wh >= (tx.meter_start or 0):
                                current_kwh = round((val_wh - (tx.meter_start or 0)) / 1000.0, 3)
                                tx.meter_stop = int(val_wh)
                        elif "Power.Active.Import" in measurand:
                            current_kw = round(val / 1000.0 if unit == "W" else val, 3)
                            if current_kw > (tx.max_power_kw or 0):
                                tx.max_power_kw = current_kw
                        elif "Current.Export" in measurand or "Current.Import" in measurand:
                            current_amps = val
                        elif "SoC" in measurand:
                            current_soc = int(val)

                # Si el cargador reporta Amperios pero 0 W, estimamos kW o validamos paso de corriente
                is_flowing_current = (current_kw > 0.05) or (current_amps > 0.5)

                if cargador:
                    conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                    if is_flowing_current:
                        cargador.status = "en_uso"
                        if conector_db:
                            conector_db.status = "en_uso"
                    else:
                        # Está enchufado con sesión abierta pero NO está pasando corriente
                        cargador.status = "conectado"
                        if conector_db:
                            conector_db.status = "conectado"
                        tx.idle_seconds = (tx.idle_seconds or 0) + 15

                tx.kwh_delivered = current_kwh
                now_local = datetime.now(PY_TZ).strftime("%I:%M %p")
                log_actual = list(tx.telemetry_log) if isinstance(tx.telemetry_log, list) else []
                if len(log_actual) < 60:
                    log_actual.append({
                        "time": now_local,
                        "kwh": round(current_kwh, 2),
                        "kw": round(current_kw, 2),
                        "soc": current_soc
                    })
                    tx.telemetry_log = log_actual
                db.commit()
        except Exception as e:
            logger.error(f"Error procesando MeterValues: {e}")
        finally:
            db.close()

        return call_result.MeterValues()

    @on('StopTransaction')
    async def on_stop_transaction(self, meter_stop: int, timestamp: str, transaction_id: int, **kwargs):
        reason = kwargs.get("reason", "Local")
        logger.info(f"[{self.id}] Finalizando transacción {transaction_id} | Medidor final: {meter_stop} Wh | Motivo: {reason}")
        
        end_dt = parse_ocpp_timestamp(timestamp)
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            tx = db.query(models.Transaction).filter(models.Transaction.id == int(transaction_id)).first()
            
            if not tx and cargador:
                tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

            if tx:
                start_dt = tx.start_time if tx.start_time else (end_dt - timedelta(minutes=1))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
                if end_dt <= start_dt:
                    end_dt = datetime.now(timezone.utc)

                duration_sec = max(1, int((end_dt - start_dt).total_seconds()))
                wh_consumed = max(0, int(meter_stop) - (tx.meter_start or 0))
                kwh = round(wh_consumed / 1000.0, 3)

                if kwh == 0 and (tx.kwh_delivered or 0) > 0:
                    kwh = float(tx.kwh_delivered)

                hours = duration_sec / 3600.0
                avg_kw = round(kwh / hours, 3) if hours > 0 and kwh > 0 else 0.0
                max_kw = round(max(tx.max_power_kw or 0.0, avg_kw), 3)
                if cargador and max_kw > cargador.power_kw:
                    max_kw = float(cargador.power_kw)

                co2_kg = round(kwh * 1.05, 2)
                price_kwh = float(tx.tariff_price_kwh or 2500.0)
                unlock_fee = float(tx.unlock_fee_pyg or 0.0)
                total_pyg = round((kwh * price_kwh) + unlock_fee, 0)

                ande_rate, ande_cost, band_label = (0.0, 0.0, "Fuera de Punta")
                if cargador:
                    ande_rate, ande_cost, band_label = calcular_costo_ande(cargador, start_dt, end_dt, kwh)

                tx.end_time = end_dt
                tx.duration_seconds = duration_sec
                tx.meter_stop = int(meter_stop)
                tx.kwh_delivered = kwh
                tx.avg_power_kw = avg_kw
                tx.max_power_kw = max_kw
                tx.co2_saved_kg = co2_kg
                tx.total_amount_pyg = total_pyg
                tx.ande_applied_rate = ande_rate
                tx.ande_energy_cost_pyg = ande_cost
                tx.time_band_label = band_label
                tx.stop_reason = reason
                tx.status = "concluida"

            if cargador:
                cargador.status = "disponible"
                conectores = db.query(models.Connector).filter_by(charger_id=cargador.id).all()
                for con in conectores:
                    con.status = "disponible"

            db.commit()
        except Exception as e:
            logger.error(f"Error guardando StopTransaction: {e}")
        finally:
            db.close()
        
        return call_result.StopTransaction(
            id_tag_info={"status": AuthorizationStatus.accepted}
        )


@router.websocket("/{charge_point_id}")
async def ocpp_endpoint(websocket: WebSocket, charge_point_id: str):
    charge_point_id = charge_point_id.strip()

    subprotocol = websocket.headers.get("sec-websocket-protocol")
    if subprotocol:
        chosen_subprotocol = subprotocol.split(",")[0].strip()
        await websocket.accept(subprotocol=chosen_subprotocol)
    else:
        await websocket.accept()
    
    db = SessionLocal()
    cargador_inicial = db.query(models.Charger).filter(
        models.Charger.serial_number.ilike(charge_point_id)
    ).first()
    
    if cargador_inicial:
        charge_point_id = cargador_inicial.serial_number
        cargador_inicial.status = "disponible"
        cargador_inicial.last_heartbeat = datetime.now(timezone.utc)
        db.commit()
    db.close()

    adapter = FastAPIWebsocketAdapter(websocket)
    cp_handler = ChargePointHandler(charge_point_id, adapter)
    
    conexiones_activas[charge_point_id] = cp_handler
    logger.info(f"🟢 Cargador {charge_point_id} conectado. Total en línea: {len(conexiones_activas)}")
    
    try:
        await cp_handler.start()
    except Exception as e:
        logger.warning(f"🔴 Cargador {charge_point_id} desconectado físicamente ({type(e).__name__}).")
    finally:
        if conexiones_activas.get(charge_point_id) is cp_handler:
            del conexiones_activas[charge_point_id]
            
            db = SessionLocal()
            try:
                cargador = db.query(models.Charger).filter(models.Charger.serial_number == charge_point_id).first()
                if cargador:
                    cargador.status = "fuera_de_linea"
                    conectores = db.query(models.Connector).filter_by(charger_id=cargador.id).all()
                    for conector in conectores:
                        conector.status = "fuera_de_linea"
                    db.commit()
            finally:
                db.close()

@router.post("/{charge_point_id}/reset")
async def comando_reset(charge_point_id: str, tipo: str = "Soft"):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    request = call.Reset(type=tipo)
    response = await cargador.call(request)
    return {"mensaje": "Comando Reset enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/start")
async def comando_iniciar_carga(charge_point_id: str, tag: str = "APP-SIPAR", connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    request = call.RemoteStartTransaction(id_tag=tag, connector_id=connector_id)
    response = await cargador.call(request)
    return {"mensaje": "Comando Inicio enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/stop")
async def comando_parar_carga(charge_point_id: str, transaction_id: int = 1, connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    
    real_tx_id = transaction_id
    db = SessionLocal()
    try:
        ch_db = db.query(models.Charger).filter(models.Charger.serial_number == charge_point_id).first()
        if ch_db:
            active_tx = db.query(models.Transaction).filter(
                models.Transaction.charger_id == ch_db.id,
                models.Transaction.status == "en_curso"
            ).order_by(models.Transaction.id.desc()).first()
            if active_tx:
                real_tx_id = active_tx.id
    finally:
        db.close()

    request = call.RemoteStopTransaction(transaction_id=real_tx_id)
    response = await cargador.call(request)
    return {"mensaje": "Comando Parada enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/unlock")
async def comando_desbloquear(charge_point_id: str, connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador: raise HTTPException(status_code=404, detail="El cargador está offline")
    request = call.UnlockConnector(connector_id=connector_id)
    response = await cargador.call(request)
    return {"respuesta_hardware": response.status}