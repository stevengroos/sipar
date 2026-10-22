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

# Diccionario de errores estándar OCPP 1.6 + Diagnósticos Eléctricos Inteligentes
OCPP_ERROR_TRANSLATIONS = {
    "NoError": "Sin errores (Operación Normal)",
    "ConnectorLockFailure": "Fallo en bloqueo electromecánico del conector",
    "EVCommunicationError": "Mala conexión con el vehículo / Carga abortada (0 Wh)",
    "GroundFailure": "Fallo de puesta a tierra / Tensión inestable",
    "HighTemperature": "Alerta de alta temperatura interna",
    "InternalError": "Error interno del hardware del cargador",
    "LocalListConflict": "Conflicto en lista de autorización local",
    "OtherError": "Error general reportado por el cargador",
    "OverCurrentFailure": "Protección por sobrecorriente activada",
    "OverVoltage": "Sobretensión en la línea de alimentación (>255V)",
    "PowerMeterFailure": "Fallo de lectura en el medidor de energía",
    "PowerSwitchFailure": "Fallo en el contactor / relé de potencia",
    "ReaderFailure": "Fallo en el lector de tarjetas RFID",
    "ResetFailure": "No se pudo completar el reinicio del equipo",
    "UnderVoltage": "Fallo de Tierra / Baja Tensión crítica en línea (<185V)",
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
    def __init__(self, websocket: WebSocket):
        self._ws = websocket

    async def recv(self):
        raw_msg = await self._ws.receive_text()
        try:
            parsed = json.loads(raw_msg)
            if isinstance(parsed, list) and len(parsed) >= 4 and parsed[0] == 2 and isinstance(parsed[3], dict):
                payload = parsed[3]
                int_fields = ["connectorId", "transactionId", "meterStart", "meterStop", "reservationId"]
                modified = False
                for field in int_fields:
                    if field in payload and isinstance(payload[field], str):
                        try:
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
        vendor_error = kwargs.get("vendor_error_code") or kwargs.get("info") or ""
        logger.info(f"[{self.id}] Conector {connector_id} -> Estado OCPP: {status} | ErrorCode: {error_code} | Info: {vendor_error}")
        
        effective_error = error_code or "NoError"
        if effective_error == "NoError" and vendor_error and vendor_error not in ["0", "NoError", "None"]:
            effective_error = f"OtherError ({vendor_error})"

        if effective_error != "NoError" or status == "Faulted":
            db_status = "falla"
            if effective_error == "NoError":
                effective_error = "OtherError"
        elif status == "Charging":
            db_status = "en_uso"
        elif status in ["Preparing", "SuspendedEV", "SuspendedEVSE", "Finishing", "Reserved"]:
            db_status = "conectado"
        elif status == "Unavailable":
            db_status = "fuera_de_linea"
        else:
            db_status = "disponible"
            
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            if cargador:
                cargador.last_heartbeat = datetime.now(timezone.utc)
                conector_db = None
                if connector_id > 0:
                    conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                    if not conector_db:
                        conector_db = models.Connector(
                            charger_id=cargador.id, 
                            connector_id=connector_id, 
                            status=db_status,
                            error_code=effective_error,
                            type="CCS 2 / Tipo 2"
                        )
                        db.add(conector_db)

                # Si hay una transacción en curso y el cargador cae de repente a Preparing/SuspendedEV,
                # conservamos cualquier error eléctrico detectado previamente en MeterValues
                active_tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

                if active_tx and effective_error != "NoError":
                    active_tx.error_code = effective_error

                # Si ya habíamos detectado una falla eléctrica (ej. 130V) durante la sesión activa,
                # no dejamos que un "NoError" genérico del firmware borre la alerta hasta que vuelva a Available
                if effective_error == "NoError" and cargador.last_error_code not in [None, "NoError"] and status != "Available":
                    effective_error = cargador.last_error_code
                    db_status = "falla"

                cargador.status = db_status
                cargador.last_error_code = effective_error
                if conector_db:
                    conector_db.status = db_status
                    conector_db.error_code = effective_error

                if status == "Available":
                    cargador.last_error_code = "NoError"
                    if conector_db:
                        conector_db.error_code = "NoError"
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
                        if kwh == 0 and dur < 60 and (not stx.error_code or stx.error_code == "NoError"):
                            stx.error_code = "EVCommunicationError"

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
                # Al iniciar pide paso de energía, pero empieza en 'conectado' hasta que MeterValues confirme corriente > 0
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
                    error_code=cargador.last_error_code if cargador.last_error_code not in [None, "NoError"] else "NoError",
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
        Analiza en tiempo real:
        1. Paso real de corriente (A / W) -> diferencia entre 'en_uso' y 'conectado'.
        2. Anomalías eléctricas (Voltaje < 185V como los 130V de falla de tierra, o > 255V, o Temp > 75°C)
           para disparar alertas de falla aunque el firmware envíe errorCode='NoError'.
        """
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            tx = None
            if transaction_id:
                tx = db.query(models.Transaction).filter(
                    models.Transaction.id == int(transaction_id),
                    models.Transaction.status == "en_curso"
                ).first()
            if not tx and cargador:
                tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

            current_kwh = float(tx.kwh_delivered or 0.0) if tx else 0.0
            current_kw = 0.0
            current_amps = 0.0
            current_voltage = 220.0
            current_temp = 25.0
            current_soc = 50

            for mv in meter_value:
                for sv in mv.get("sampled_value", mv.get("sampledValue", [])):
                    measurand = sv.get("measurand", "Energy.Active.Import.Register")
                    unit = sv.get("unit", "Wh")
                    try:
                        val = float(sv.get("value", 0))
                    except ValueError:
                        continue

                    if "Energy.Active.Import" in measurand and tx:
                        val_wh = val * 1000.0 if unit == "kWh" else val
                        if val_wh >= (tx.meter_start or 0):
                            current_kwh = round((val_wh - (tx.meter_start or 0)) / 1000.0, 3)
                            tx.meter_stop = int(val_wh)
                    elif "Power.Active.Import" in measurand:
                        current_kw = round(val / 1000.0 if unit == "W" else val, 3)
                        if tx and current_kw > (tx.max_power_kw or 0):
                            tx.max_power_kw = current_kw
                    elif "Current.Export" in measurand or "Current.Import" in measurand:
                        current_amps = val
                    elif "Voltage" in measurand:
                        current_voltage = val
                    elif "Temperature" in measurand:
                        current_temp = val
                    elif "SoC" in measurand:
                        current_soc = int(val)

            # --- DETECTOR INTELIGENTE DE FALLAS ELÉCTRICAS Y DE TIERRA ---
            detected_fault = None
            if 10.0 < current_voltage < 185.0:
                detected_fault = f"GroundFailure (Tensión anormal: {int(current_voltage)}V)"
                logger.warning(f"⚠️ [{self.id}] Falla de tierra / Subtensión detectada en MeterValues: {current_voltage}V")
            elif current_voltage > 258.0:
                detected_fault = f"OverVoltage ({int(current_voltage)}V)"
                logger.warning(f"⚠️ [{self.id}] Sobretensión detectada: {current_voltage}V")
            elif current_temp >= 75.0:
                detected_fault = f"HighTemperature ({int(current_temp)}°C)"
                logger.warning(f"⚠️ [{self.id}] Alta temperatura detectada: {current_temp}°C")

            is_flowing_current = (current_kw > 0.05) or (current_amps > 0.5)

            if cargador:
                conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                if detected_fault:
                    cargador.status = "falla"
                    cargador.last_error_code = detected_fault
                    if conector_db:
                        conector_db.status = "falla"
                        conector_db.error_code = detected_fault
                    if tx:
                        tx.error_code = detected_fault
                elif is_flowing_current:
                    cargador.status = "en_uso"
                    cargador.last_error_code = "NoError"
                    if conector_db:
                        conector_db.status = "en_uso"
                        conector_db.error_code = "NoError"
                else:
                    cargador.status = "conectado"
                    if conector_db:
                        conector_db.status = "conectado"
                    if tx:
                        tx.idle_seconds = (tx.idle_seconds or 0) + 15

            if tx:
                tx.kwh_delivered = current_kwh
                now_local = datetime.now(PY_TZ).strftime("%I:%M %p")
                log_actual = list(tx.telemetry_log) if isinstance(tx.telemetry_log, list) else []
                if len(log_actual) < 60:
                    log_actual.append({
                        "time": now_local,
                        "kwh": round(current_kwh, 2),
                        "kw": round(current_kw, 2),
                        "soc": current_soc,
                        "voltage": round(current_voltage, 1)
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
            # Buscamos primero si la transacción indicada sigue en_curso
            tx = db.query(models.Transaction).filter(
                models.Transaction.id == int(transaction_id),
                models.Transaction.status == "en_curso"
            ).first()
            
            # Si el firmware mandó un transactionId viejo/desfasado (ej. mandó 35 cuando la activa era la 37),
            # cerramos la transacción realmente activa en_curso de este cargador
            if not tx and cargador:
                tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

            if tx:
                start_dt = tx.start_time if tx.start_time else (end_dt - timedelta(seconds=15))
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

                # --- DETECTOR DE MALA CONEXIÓN / CARGA ABORTADA ---
                # Si la sesión entregó 0 kWh (0 Wh) y se cortó sola o rápido, o tenía falla en el cargador,
                # registramos el error para que el operador lo vea en el Historial y en el Cargador
                final_error_code = tx.error_code or "NoError"
                if final_error_code == "NoError" and cargador and cargador.last_error_code not in [None, "NoError"]:
                    final_error_code = cargador.last_error_code

                if kwh == 0:
                    if final_error_code == "NoError":
                        final_error_code = "EVCommunicationError (Mala conexión / 0 Wh entregados)"
                    if reason == "Local":
                        reason = "AbortedZeroEnergy"
                    if cargador:
                        cargador.last_error_code = final_error_code

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
                tx.error_code = final_error_code
                tx.status = "concluida"

            if cargador:
                # Si la carga se cortó por una falla eléctrica o de conexión, dejamos visible el estado 'falla'
                if cargador.last_error_code not in [None, "NoError"]:
                    cargador.status = "falla"
                else:
                    cargador.status = "disponible"
                conectores = db.query(models.Connector).filter_by(charger_id=cargador.id).all()
                for con in conectores:
                    con.status = cargador.status
                    con.error_code = cargador.last_error_code or "NoError"

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