import { useState, useEffect } from 'react';
import { 
  Receipt, Search, Download, Calendar, BatteryCharging, 
  Clock, Zap, Leaf, CheckCircle2, AlertCircle, X, Loader2, ArrowUpRight
} from 'lucide-react';
import api from '../api/axios';

export default function Historial() {
  const [transactions, setTransactions] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [selectedCharger, setSelectedCharger] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Detalle (Estilo VoltBras)
  const [selectedTx, setSelectedTx] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      let url = '/api/v1/transactions/?';
      if (selectedCharger) url += `charger_id=${selectedCharger}&`;
      if (selectedMonth) url += `month=${selectedMonth}&`;

      const [txRes, chRes] = await Promise.all([
        api.get(url, { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/chargers/', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setTransactions(txRes.data);
      setChargers(chRes.data);
    } catch (error) {
      console.error("Error al cargar historial:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCharger, selectedMonth]);

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return "00:00:00";
    const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
    const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const secs = (sec % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const filteredTxs = transactions.filter(tx => 
    tx.id.toString().includes(searchTerm) ||
    tx.charger_serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.user_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {/* CABECERA Y FILTROS */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-sipar-orange" /> Historial de Recargas & Liquidación ANDE
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitorea sesiones de carga, franjas horarias y costos de energía en tiempo real.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedCharger} 
            onChange={(e) => setSelectedCharger(e.target.value)}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white text-xs font-bold px-3 py-2.5 rounded-xl outline-none shadow-sm"
          >
            <option value="">Todos los Cargadores</option>
            {chargers.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.serial_number}</option>
            ))}
          </select>

          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white text-xs font-bold px-3 py-2.5 rounded-xl outline-none shadow-sm"
          />
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-sipar-orange" /> Sesiones Registradas ({filteredTxs.length})
          </h2>
          <div className="flex items-center gap-4">
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar ID, estación o usuario..." 
                className="bg-transparent border-none text-sm text-white focus:outline-none placeholder-gray-500 w-56"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                <th className="p-4 pl-6">ID & Horario</th>
                <th className="p-4">Estación / Conector</th>
                <th className="p-4">Usuario</th>
                <th className="p-4">Energía & Duración</th>
                <th className="p-4">Costo ANDE</th>
                <th className="p-4">Total Cobrado</th>
                <th className="p-4 text-right pr-6">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {filteredTxs.length > 0 ? (
                filteredTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="p-4 pl-6">
                      <p className="font-bold text-sipar-dark dark:text-white">#{tx.id}</p>
                      <p className="text-[11px] text-gray-400">
                        {tx.start_time ? new Date(tx.start_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-sipar-dark dark:text-white">{tx.charger_serial}</p>
                      <p className="text-[11px] text-gray-400">Conector #{tx.connector_id}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-gray-700 dark:text-gray-300">{tx.user_name}</p>
                      <p className="text-[11px] text-gray-400">{tx.user_email}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-sipar-orange">{tx.kwh_delivered} kWh</p>
                      <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatSeconds(tx.duration_seconds)}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-blue-600 dark:text-blue-400">{tx.ande_energy_cost_pyg.toLocaleString('es-PY')} ₲</p>
                      <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">{tx.time_band_label}</span>
                    </td>
                    <td className="p-4 font-bold text-green-600 dark:text-green-400">
                      {tx.total_amount_pyg.toLocaleString('es-PY')} ₲
                    </td>
                    <td className="p-4 text-right pr-6">
                      <button 
                        onClick={() => { setSelectedTx(tx); setIsModalOpen(true); }}
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white rounded-lg text-xs font-bold hover:bg-sipar-orange hover:text-white dark:hover:bg-sipar-orange transition shadow-sm"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-400 dark:text-gray-500">No se encontraron recargas en este período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL DETALLE DE RECARGA (ESTILO VOLTBRAS) ================= */}
      {isModalOpen && selectedTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[24px] w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] max-h-[92vh] transition-colors">
            
            {/* Cabecera del Modal */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-sipar-dark text-white">
              <div className="flex items-center gap-3">
                <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full text-xs font-bold">
                  {selectedTx.status.toUpperCase()}
                </span>
                <div>
                  <h2 className="text-base font-bold">Recarga / #{selectedTx.id}</h2>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    ⏱️ {formatSeconds(selectedTx.duration_seconds)} &nbsp;•&nbsp; ⚡ {selectedTx.kwh_delivered} kWh &nbsp;•&nbsp; ₲ {selectedTx.total_amount_pyg.toLocaleString('es-PY')}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition bg-gray-800 p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>

            {/* Contenido Desplazable */}
            <div className="p-6 overflow-y-auto hide-scroll space-y-6">
              
              {/* Tarjetas Superiores: Horarios y Estación */}
              <div className="grid grid-cols-3 gap-4">
                
                {/* Inicio & Conclusión */}
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Franja Horaria</p>
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <p className="text-[10px] text-gray-400">INICIO</p>
                        <p className="text-xs font-bold text-sipar-dark dark:text-white">
                          {selectedTx.start_time ? new Date(selectedTx.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">CONCLUSIÓN</p>
                        <p className="text-xs font-bold text-sipar-dark dark:text-white">
                          {selectedTx.end_time ? new Date(selectedTx.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'En curso'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex justify-between text-[11px]">
                    <span className="text-gray-500">Tiempo de Carga:</span>
                    <span className="font-bold text-sipar-dark dark:text-white">{formatSeconds(selectedTx.duration_seconds)}</span>
                  </div>
                </div>

                {/* Estación y Conector */}
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Estación y Conector</p>
                  <p className="text-xs font-bold text-sipar-dark dark:text-white">{selectedTx.charger_serial} ({selectedTx.charger_power_kw} kW)</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{selectedTx.charger_address}</p>
                  <p className="text-[11px] font-semibold text-sipar-orange mt-2">Conector: #{selectedTx.connector_id} (CCS 2)</p>
                </div>

                {/* Usuario y Método */}
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Usuario</p>
                  <p className="text-xs font-bold text-sipar-dark dark:text-white">{selectedTx.user_name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{selectedTx.user_email}</p>
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mt-2">Método desbloqueo: {selectedTx.unlock_method}</p>
                </div>

              </div>

              {/* Bloque Financiero y Liquidación ANDE */}
              <div className="bg-white dark:bg-sipar-dark p-5 rounded-2xl border border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Detalle de Pago & Costo ANDE (Liquidación)</h3>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500">Coste Total Cliente:</span>
                      <span className="font-bold text-green-600 dark:text-green-400">{selectedTx.total_amount_pyg.toLocaleString('es-PY')} ₲</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500">Tarifa de Venta / kWh:</span>
                      <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.tariff_price_kwh.toLocaleString('es-PY')} ₲</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500">Energía Consumida:</span>
                      <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.kwh_delivered} kWh</span>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-800 dark:text-blue-300 font-semibold text-xs">Franja ANDE aplicada:</span>
                      <span className="font-bold text-blue-700 dark:text-blue-400 text-xs">{selectedTx.time_band_label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-800 dark:text-blue-300 font-semibold text-xs">Tarifa ANDE (Ref):</span>
                      <span className="font-bold text-blue-700 dark:text-blue-400 text-xs">{selectedTx.ande_applied_rate.toLocaleString('es-PY')} ₲/kWh</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                      <span className="text-blue-900 dark:text-blue-200 font-bold text-xs">Costo de Energía (ANDÉ):</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">{selectedTx.ande_energy_cost_pyg.toLocaleString('es-PY')} ₲</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tarjetas de Datos Técnicos */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Consumo Total</p>
                  <p className="text-base font-bold text-sipar-dark dark:text-white mt-1">{selectedTx.kwh_delivered} kWh</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Potencia Media</p>
                  <p className="text-base font-bold text-sipar-dark dark:text-white mt-1">{selectedTx.avg_power_kw} kW</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Potencia Máxima</p>
                  <p className="text-base font-bold text-sipar-orange mt-1">{selectedTx.max_power_kw} kW</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">CO2 Evitado</p>
                  <p className="text-base font-bold text-green-600 dark:text-green-400 mt-1">{selectedTx.co2_saved_kg} kg</p>
                </div>
              </div>

              {/* Gráfico de Consumo (Simulado / Telemetría OCPP) */}
              <div className="bg-white dark:bg-sipar-dark p-5 rounded-2xl border border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Curva de Carga & Telemetría</h3>
                <div className="h-36 w-full bg-gray-50 dark:bg-gray-900/50 rounded-xl flex items-end justify-between px-4 pb-2 border border-gray-100 dark:border-gray-800">
                  {selectedTx.telemetry_log && selectedTx.telemetry_log.length > 0 ? (
                    selectedTx.telemetry_log.map((pt, i) => (
                      <div key={i} className="flex flex-col items-center flex-1 h-full justify-end group relative">
                        <div 
                          className="w-3 bg-sipar-orange rounded-t transition-all hover:bg-orange-500"
                          style={{ height: `${Math.max(15, Math.min(100, (pt.kw / Math.max(...selectedTx.telemetry_log.map(p => p.kw || 1), 1)) * 100))}%` }}
                        ></div>
                        <span className="text-[9px] text-gray-400 mt-1 truncate max-w-[40px]">{pt.time}</span>
                      </div>
                    ))
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Sin registros de telemetría para esta sesión.</div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}