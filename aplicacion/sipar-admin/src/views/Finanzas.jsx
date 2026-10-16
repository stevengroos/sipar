import { useState } from 'react';
import { 
  Wallet, Landmark, ArrowLeftRight, ArrowUpRight, AlertCircle, 
  Receipt, Search, Download, BatteryCharging, CreditCard, 
  CheckCircle2, ShieldAlert, FileWarning, Ban, CornerDownLeft, X 
} from 'lucide-react';

export default function Finanzas() {
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      {/* KPIs Financieros */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* KPI 1 */}
        <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 mb-1">Fondos de Usuarios (Pasivo)</p>
            <p className="text-[26px] font-bold text-sipar-dark tracking-tight">18.540.000 ₲</p>
            <p className="text-[11px] text-gray-500 font-semibold mt-2">Saldo total en billeteras</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex justify-center items-center text-blue-500 border border-blue-100">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
        
        {/* KPI 2 */}
        <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 mb-1">Liquidación Pasarela (Mes)</p>
            <p className="text-[26px] font-bold text-sipar-dark tracking-tight">45.200.000 ₲</p>
            <p className="text-[11px] text-green-500 font-bold mt-2 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Pagado a SIPAR
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 rounded-xl flex justify-center items-center text-green-500 border border-green-100">
            <Landmark className="w-6 h-6" />
          </div>
        </div>
        
        {/* KPI 3 */}
        <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-red-200 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 mb-1">Reembolsos / Disputas</p>
            <p className="text-[26px] font-bold text-sipar-dark tracking-tight">1 Pendiente</p>
            <p className="text-[11px] text-red-500 font-bold mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Requiere atención
            </p>
          </div>
          <div className="w-12 h-12 bg-red-50 rounded-xl flex justify-center items-center text-red-500 border border-red-100">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Libro Mayor / Transacciones */}
      <div className="w-full bg-white rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-sipar-orange" /> Conciliación & Libro Mayor
          </h2>
          <div className="flex items-center gap-4">
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar transacción..." className="bg-transparent border-none text-sm text-white focus:outline-none placeholder-gray-500 w-48" />
            </div>
            <button className="bg-white text-sipar-dark hover:bg-gray-100 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>
        
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 tracking-wider">Transacción & Fecha</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 tracking-wider">Usuario</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 tracking-wider">Tipo & Medio</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 tracking-wider">Estado</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 tracking-wider text-right">Monto (₲) / Acción</th>
              </tr>
            </thead>
            <tbody>
              
              {/* TRX 1: Disputa Pendiente */}
              <tr className="border-b border-gray-50 hover:bg-red-50/30 transition bg-red-50/20">
                <td className="px-6 py-4">
                  <p className="font-bold text-[13px] text-sipar-dark">#TRX-98237</p>
                  <p className="text-[11px] text-gray-500 mt-1">Hoy, 10:15 AM</p>
                </td>
                <td className="px-6 py-4 text-[13px] font-semibold text-sipar-dark">Juan Pérez</td>
                <td className="px-6 py-4">
                  <p className="text-[13px] text-gray-600 font-bold">Consumo de Energía</p>
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <BatteryCharging className="w-3 h-3" /> SIPAR Conmebol
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Disputa / Queja
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="font-bold text-sipar-dark mb-2">- 85.000</p>
                  <button onClick={() => setIsDisputeModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 shadow-sm transition">
                    <ShieldAlert className="w-3.5 h-3.5" /> Gestionar
                  </button>
                </td>
              </tr>

              {/* TRX 2: Ingreso Normal */}
              <tr className="border-b border-gray-50 hover:bg-gray-50 transition">
                <td className="px-6 py-4">
                  <p className="font-bold text-[13px] text-sipar-dark">#TRX-98236</p>
                  <p className="text-[11px] text-gray-500 mt-1">Ayer, 18:30 PM</p>
                </td>
                <td className="px-6 py-4 text-[13px] font-semibold text-sipar-dark">María González</td>
                <td className="px-6 py-4">
                  <p className="text-[13px] text-gray-600 font-bold">Recarga Billetera</p>
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Bancard - Visa **4092
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Aprobado
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="font-bold text-green-600 mb-2">+ 150.000</p>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50 transition">
                    Recibo
                  </button>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: GESTIÓN DE DISPUTAS */}
      {isDisputeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white rounded-[20px] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out] border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-sipar-dark flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-500" /> Revisión de Disputa / Queja
                </h2>
                <p className="text-[11px] text-gray-500 font-mono mt-1">Transacción #TRX-98237</p>
              </div>
              <button onClick={() => setIsDisputeModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
                <p className="text-sm text-red-800 font-semibold mb-1">Motivo reportado por el cliente (Juan Pérez):</p>
                <p className="text-sm text-red-600 italic">"El cargador cortó la carga a los 5 minutos por un fallo eléctrico, pero me descontó 85.000 Gs de mi billetera."</p>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Datos del Cobro</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between border-b border-gray-50 pb-1"><span className="text-gray-500">Monto Deducido:</span> <span className="font-bold text-sipar-dark">85.000 ₲</span></li>
                    <li className="flex justify-between border-b border-gray-50 pb-1"><span className="text-gray-500">Energía Cobrada:</span> <span className="font-bold text-sipar-dark">34.0 kWh</span></li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Auditoría del Cargador (OCPP)</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between border-b border-gray-50 pb-1"><span className="text-gray-500">Duración Sesión:</span> <span className="font-bold text-sipar-dark">00:05:22</span></li>
                    <li className="flex justify-between border-b border-gray-50 pb-1"><span className="text-gray-500">Energía Real Entregada:</span> <span className="font-bold text-red-600">4.2 kWh</span></li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsDisputeModalOpen(false)} className="flex-1 py-3 bg-white border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 shadow-sm transition flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" /> Rechazar Queja
                </button>
                <button onClick={() => setIsDisputeModalOpen(false)} className="flex-1 py-3 bg-gradient-to-br from-green-500 to-green-600 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(34,197,94,0.3)] hover:opacity-90 transition flex items-center justify-center gap-2">
                  <CornerDownLeft className="w-4 h-4" /> Aprobar Reembolso Parcial (74.500 ₲)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}