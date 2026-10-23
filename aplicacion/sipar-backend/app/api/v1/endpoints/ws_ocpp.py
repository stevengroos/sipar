# app/api/v1/endpoints/ws_ocpp.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
import logging
import json
import asyncio
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
# Rastrea qué cargadores recibieron orden de parada manual desde el panel Admin
paradas_solicitadas_admin = set()
# Rastrea la secuencia de estados OCPP de cada cargador para distinguir PE Error vs CP Error
ultimo_estado_ocpp = {}

PY_TZ = timezone(timedelta(hours=-3))

OCPP_ERROR_TRANSLATIONS = {
    "NoError": "Sin errores (Operación Normal)",
    "ConnectorLockFailure": "Fallo en bloqueo electromecánico del conector",
    "EVCommunicationError": "Error de comunicación CP con el vehículo eléctrico",
    "GroundFailure": "Fallo de puesta a tierra (PE) / Tensión inestable",
    "HighTemperature": "Alerta de alta temperatura interna (>75°C)",
    "InternalError": "Error interno del hardware del cargador",
    "LocalListConflict": "Conflicto en lista de autorización local",
    "OtherError": "Error general reportado por el cargador",
    "OverCurrentFailure": "Protección por sobrecorriente activada",
    "OverVoltage": "Sobretensión en la línea de alimentación (>260V)",
    "PowerMeterFailure": "Fallo de lectura en el medidor de energía",
    "PowerSwitchFailure": "Fallo en el contactor / relé de potencia",
    "ReaderFailure": "Fallo en el lector de tarjetas RFID",
    "ResetFailure": "No se pudo completar el reinicio del equipo",
    "UnderVoltage": "Baja tensión crítica en red eléctrica",
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
        
        # Guardamos el último estado notificado antes de un posible StopTransaction
        # para distinguir Falla de Tierra (pasa por 'Finishing') vs Error CP (cae directo a 'Preparing'/'Available')
        prev_state = ultimo_estado_ocpp.get(self.id)
        ultimo_estado_ocpp[self.id] = status

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

                active_tx = db.query(models.Transaction).filter(
                    models.Transaction.charger_id == cargador.id,
                    models.Transaction.status == "en_curso"
                ).order_by(models.Transaction.id.desc()).first()

                if active_tx and effective_error != "NoError":
                    active_tx.error_code = effective_error

                # Si justo hace 1 segundo se cerró una transacción por corte de protección (GroundFailure o EVCommunicationError)
                # y el cargador manda inmediatamente su StatusNotification 'Preparing' con 'NoError' (como a las 10:28:59),
                # mantenemos visible el error en el panel hasta que el operador inicie otra carga o desconecte la manguera (Available)
                if (
                    status == "Preparing"
                    and effective_error == "NoError"
                    and cargador.status == "falla"
                    and cargador.last_error_code not in [None, "NoError"]
                ):
                    db_status = "falla"
                    effective_error = cargador.last_error_code

                if status in ["Charging", "Available"]:
                    # Al volver a Charging o desconectar a Available, limpiamos el error en vivo
                    if effective_error == "NoError":
                        cargador.last_error_code = "NoError"

                cargador.status = db_status
                cargador.last_error_code = effective_error
                if conector_db:
                    conector_db.status = db_status
                    conector_db.error_code = effective_error

                if status == "Available":
                    paradas_solicitadas_admin.discard(self.id)

                db.commit()
        finally:
            db.close()
        
        return call_result.StatusNotification()

    @on('StartTransaction')
    async def on_start_transaction(self, connector_id: int, id_tag: str, meter_start: int, timestamp: str, **kwargs):
        logger.info(f"[{self.id}] Inicio de carga en conector {connector_id} | Tag: {id_tag} | Medidor: {meter_start} Wh")
        
        paradas_solicitadas_admin.discard(self.id)
        ultimo_estado_ocpp[self.id] = "Charging"
        start_dt = parse_ocpp_timestamp(timestamp)
        transaction_id = int(time.time())
        
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            if cargador:
                cargador.status = "en_uso"
                cargador.last_error_code = "NoError"
                conector_db = db.query(models.Connector).filter_by(charger_id=cargador.id, connector_id=connector_id).first()
                if conector_db:
                    conector_db.status = "en_uso"
                    conector_db.error_code = "NoError"

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
                    error_code="NoError",
                    telemetry_log=[{"time": hora_local, "kwh": 0.0, "kw": 0.0, "soc": 20, "voltage": 220.0}]
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
        Registra telemetría en tiempo real y corrige la escala de voltaje del firmware WGD
        (que reporta V/2 = ~112V-116V cuando la tensión real en pantalla es 224V-232V).
        """
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            tx = None
            if transaction_id and int(transaction_id) > 0:
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
            raw_voltage = 220.0
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
                        raw_voltage = val
                    elif "Temperature" in measurand:
                        current_temp = val
                    elif "SoC" in measurand:
                        current_soc = int(val)

            # Calibración para firmware WGD (Volvo): el ADC envía V/2 (ej. 112V-116V -> 224V-232V reales)
            if 90.0 <= raw_voltage <= 145.0:
                calibrated_voltage = round(raw_voltage * 2.0, 1)
            else:
                calibrated_voltage = round(raw_voltage, 1)

            detected_fault = None
            if 5.0 < calibrated_voltage < 85.0:
                detected_fault = f"UnderVoltage ({int(calibrated_voltage)}V)"
            elif calibrated_voltage > 265.0:
                detected_fault = f"OverVoltage ({int(calibrated_voltage)}V)"
            elif current_temp >= 75.0:
                detected_fault = f"HighTemperature ({int(current_temp)}°C)"

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
                else:
                    cargador.status = "en_uso"
                    cargador.last_error_code = "NoError"
                    if conector_db:
                        conector_db.status = "en_uso"
                        conector_db.error_code = "NoError"
                    if tx and (current_kw <= 0.05 and current_amps <= 0.5):
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
                        "voltage": calibrated_voltage
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
        was_admin_stopped = self.id in paradas_solicitadas_admin
        paradas_solicitadas_admin.discard(self.id)
        pre_stop_state = ultimo_estado_ocpp.get(self.id, "Charging")

        logger.info(
            f"[{self.id}] Finalizando transacción {transaction_id} | Medidor: {meter_stop} Wh | "
            f"Estado previo: {pre_stop_state} | Parada Admin: {was_admin_stopped}"
        )
        
        end_dt = parse_ocpp_timestamp(timestamp)
        db = SessionLocal()
        try:
            cargador = db.query(models.Charger).filter(models.Charger.serial_number == self.id).first()
            tx = db.query(models.Transaction).filter(
                models.Transaction.id == int(transaction_id),
                models.Transaction.status == "en_curso"
            ).first()
            
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

                # =========================================================================
                # CLASIFICACIÓN EXACTA DE EVENTOS SEGÚN FIRMWARE WGD + TESTER MEGGER
                # =========================================================================
                final_error_code = tx.error_code or "NoError"

                if was_admin_stopped or reason in ["Remote", "UnlockCommand", "DeAuthorized"]:
                    # 1. El operador detuvo la sesión desde el botón 'Forzar Fin de Carga'
                    reason = "Remote"
                    final_error_code = "NoError"
                elif duration_sec <= 45 and kwh == 0 and final_error_code == "NoError":
                    # 2. El cargador cortó solo la sesión (sin comando desde el panel):
                    if pre_stop_state == "Finishing":
                        # En la prueba de las 10:28 (PE Error / Falla de Tierra), el cargador
                        # pasa primero a 'Finishing' antes de enviar StopTransaction
                        final_error_code = "GroundFailure (Fallo de puesta a tierra PE detectado)"
                        reason = "GroundFault"
                    else:
                        # En las pruebas de las 10:30 y 10:31 (CP Error 'E' / Mala conexión),
                        # el cargador cae directo a 'Preparing' o 'Available' sin pasar por 'Finishing'
                        final_error_code = "EVCommunicationError (Fallo de comunicación CP con el vehículo)"
                        reason = "CPCommunicationFault"

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
                    if final_error_code != "NoError":
                        cargador.status = "falla"
                        cargador.last_error_code = final_error_code
                    else:
                        cargador.status = "disponible"
                        cargador.last_error_code = "NoError"
                    conectores = db.query(models.Connector).filter_by(charger_id=cargador.id).all()
                    for con in conectores:
                        con.status = cargador.status
                        con.error_code = cargador.last_error_code

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
        cargador_inicial.last_error_code = "NoError"
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
    if not cargador:
        raise HTTPException(status_code=404, detail="El cargador está offline")
    request = call.Reset(type=tipo)
    try:
        response = await asyncio.wait_for(cargador.call(request), timeout=8.0)
        return {"mensaje": "Comando Reset enviado", "respuesta_hardware": response.status}
    except asyncio.TimeoutError:
        return {"mensaje": "Comando Reset enviado", "respuesta_hardware": "Accepted (Reinicio en progreso)"}

@router.post("/{charge_point_id}/start")
async def comando_iniciar_carga(charge_point_id: str, tag: str = "APP-SIPAR", connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador:
        raise HTTPException(status_code=404, detail="El cargador está offline")
    paradas_solicitadas_admin.discard(charge_point_id)
    request = call.RemoteStartTransaction(id_tag=tag, connector_id=connector_id)
    response = await cargador.call(request)
    return {"mensaje": "Comando Inicio enviado", "respuesta_hardware": response.status}

@router.post("/{charge_point_id}/stop")
async def comando_parar_carga(charge_point_id: str, transaction_id: int = 1, connector_id: int = 1):
    cargador = conexiones_activas.get(charge_point_id)
    if not cargador:
        raise HTTPException(status_code=404, detail="El cargador está offline")
    
    paradas_solicitadas_admin.add(charge_point_id)

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
    if not cargador:
        raise HTTPException(status_code=404, detail="El cargador está offline")
    request = call.UnlockConnector(connector_id=connector_id)
    response = await cargador.call(request)
    return {"respuesta_hardware": response.status}