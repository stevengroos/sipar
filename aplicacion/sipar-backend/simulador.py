import asyncio
import websockets
from ocpp.routing import on
from ocpp.v16 import ChargePoint as cp
from ocpp.v16 import call, call_result
from ocpp.v16.enums import RegistrationStatus

ID_DEL_CARGADOR = "CHG-ASU-01" 

class MiCargadorVirtual(cp):
    async def rutinas_de_inicio(self):
        # 1. Enviar BootNotification
        print(f"🔌 [{self.id}] Encendiéndose...")
        req_boot = call.BootNotification(charge_point_model="Optima 7kW", charge_point_vendor="Voltbras")
        res_boot = await self.call(req_boot)
        
        if res_boot.status == RegistrationStatus.accepted:
            print("✅ SIPAR me aceptó.")
            
            # 2. Informar que la MANGUERA 1 está "Disponible"
            print("📡 Enviando estado: Manguera 1 Disponible...")
            await self.call(call.StatusNotification(connector_id=1, error_code="NoError", status="Available"))
            
            # 3. Informar que la MANGUERA 2 está "Disponible"
            print("📡 Enviando estado: Manguera 2 Disponible...")
            await self.call(call.StatusNotification(connector_id=2, error_code="NoError", status="Available"))
        else:
            print("❌ SIPAR me rechazó.")

    # NUEVO: Rutina infinita para reportar que el cargador sigue vivo
    async def latido_corazon(self):
        while True:
            await asyncio.sleep(60) # Envía latido cada 60 segundos
            print("💓 Enviando Heartbeat a SIPAR...")
            await self.call(call.Heartbeat())

    # --- ESCUCHADORES DE COMANDOS DESDE LA NUBE (SIPAR) ---
    
    @on('Reset')
    async def al_recibir_reset(self, type: str, **kwargs):
        print(f"⚠️ COMANDO RECIBIDO: Reiniciando máquina (Tipo: {type})...")
        return call_result.Reset(status="Accepted")

    @on('UnlockConnector')
    async def al_recibir_desbloqueo(self, connector_id: int, **kwargs):
        print(f"🔓 COMANDO RECIBIDO: Retrayendo seguro físico de Manguera {connector_id}...")
        return call_result.UnlockConnector(status="Unlocked")

    @on('RemoteStartTransaction')
    async def al_recibir_inicio_carga(self, id_tag: str, **kwargs):
        # OCPP 1.6 permite enviar a qué manguera va dirigida la orden
        connector_id = kwargs.get('connector_id', 1) 
        print(f"⚡ COMANDO RECIBIDO: Iniciando flujo de energía en Manguera {connector_id} (ID: {id_tag})")
        
        # Simulamos que ESA manguera pasa a estado "Cargando"
        asyncio.create_task(self.notificar_carga(connector_id))
        return call_result.RemoteStartTransaction(status="Accepted")
        
    @on('RemoteStopTransaction')
    async def al_recibir_fin_carga(self, transaction_id: int, **kwargs):
        print(f"🛑 COMANDO RECIBIDO: Cortando energía (Transacción {transaction_id})")
        
        # MAGIA: Ahora usamos el transaction_id en lugar del 1 fijo
        asyncio.create_task(self.notificar_disponible(transaction_id))
        return call_result.RemoteStopTransaction(status="Accepted")

    # Funciones de utilidad para simular los cambios de estado (Actualizadas para recibir connector_id)
    async def notificar_carga(self, connector_id: int):
        await asyncio.sleep(1)
        print(f"🔋 Notificando a SIPAR: Manguera {connector_id} = Charging")
        req = call.StatusNotification(connector_id=connector_id, error_code="NoError", status="Charging")
        await self.call(req)

    async def notificar_disponible(self, connector_id: int):
        await asyncio.sleep(1)
        print(f"🟢 Notificando a SIPAR: Manguera {connector_id} = Available")
        req = call.StatusNotification(connector_id=connector_id, error_code="NoError", status="Available")
        await self.call(req)

async def main():
    url_sipar = f"ws://localhost:8000/api/v1/ocpp/{ID_DEL_CARGADOR}"
    async with websockets.connect(url_sipar, subprotocols=['ocpp1.6']) as ws:
        cargador = MiCargadorVirtual(ID_DEL_CARGADOR, ws)
        # Añadimos el latido del corazón para que se ejecute en paralelo
        await asyncio.gather(
            cargador.start(),
            cargador.rutinas_de_inicio(),
            cargador.latido_corazon() 
        )

if __name__ == '__main__':
    asyncio.run(main())