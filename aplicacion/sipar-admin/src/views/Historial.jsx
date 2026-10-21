import { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, Search, Clock, Zap, AlertTriangle, CheckCircle2, 
  X, Loader2, Wallet, Leaf, Gauge, BatteryCharging, ChevronRight, 
  ChevronDown, ChevronUp, QrCode, FileText, LayoutGrid
} from 'lucide-react';
import api from '../api/axios';

const OCPP_ERROR_LABELS = {
  NoError: "Sin fallos reportados (NoError)",
  ConnectorLockFailure: "Fallo en bloqueo del conector",
  EVCommunicationError: "Error de comunicación con el vehículo",
  GroundFailure: "Fallo de puesta a tierra",
  HighTemperature: "Temperatura interna elevada",
  InternalError: "Error interno del cargador",
  OverCurrentFailure: "Sobrecorriente detectada",
  OverVoltage: "Sobretensión en línea",
  PowerMeterFailure: "Error en medidor de energía",
  PowerSwitchFailure: "Fallo en contactor de potencia",
  UnderVoltage: "Subtensión en red eléctrica",
  WeakSignal: "Señal de comunicación débil"
};

export default function Historial() {
  const [transactions, setTransactions] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedCharger, setSelectedCharger] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedTx, setSelectedTx] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'registros'
  const [showMorePayment, setShowMorePayment] = useState(true);

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
      if (selectedTx) {
        const updated = txRes.data.find(t => t.id === selectedTx.id);
        if (updated) setSelectedTx(updated);
      }
    } catch (error) {
      console.error("Error al cargar historial:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedCharger, selectedMonth]);

  // Formato HH:MM:SS
  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return "00:00:00";
    const total = Math.floor(sec);
    const hrs = Math.floor(total / 3600).toString().padStart(2, '0');
    const mins = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // Formato de moneda estilo "PYG 39.096,00"
  const formatPYG = (val) => {
    const num = Number(val || 0);
    return `PYG ${num.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Fecha larga: "29 de septiembre de 2026"
  const formatLongDate = (isoStr) => {
    if (!isoStr) return "En curso";
    return new Date(isoStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Hora en formato "07:24 PM"
  const formatTimeAMPM = (isoStr) => {
    if (!isoStr) return "--:--";
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Fecha y hora combinada para tarjetas de pago: "29 de Septiembre de 2026 las 08:05 PM"
  const formatPaymentDateTime = (isoStr) => {
    if (!isoStr) return "Pendiente de cierre";
    return `${formatLongDate(isoStr)} las ${formatTimeAMPM(isoStr)}`;
  };

  // Tiempo relativo: "hace 2 horas"
  const formatRelativeTime = (isoStr) => {
    if (!isoStr) return "en progreso";
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffMins = Math.max(1, Math.floor(diffMs / 60000));
    if (diffMins < 60) return `hace ${diffMins} min`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `hace ${diffHrs} ${diffHrs === 1 ? 'hora' : 'horas'}`;
    const diffDays = Math.floor(diffHrs / 24);
    return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
  };

  // Generador de UUID visual determinístico basado en el ID de la recarga (como VoltBras)
  const formatSessionUuid = (tx) => {
    const hexId = Number(tx?.id || 1).toString(16).padStart(8, '0');
    const chargerHex = Number(tx?.charger_id || 1).toString(16).padStart(4, '0');
    return `${hexId}-${chargerHex}-41d8-8e0d-1fd6cc63ceb7`;
  };

  const formatPaymentUuid = (tx) => {
    const hexId = Number((tx?.id || 1) * 97).toString(16).padStart(8, '0');
    return `${hexId}-736f-4acb-a404-df0a82a5e146`;
  };

  // Normalización de puntos para el Gráfico SVG (nunca se sale del contenedor)
  const chartData = useMemo(() => {
    if (!selectedTx) return { points: [], maxKwh: 22, maxKw: 60 };
    const rawLog = Array.isArray(selectedTx.telemetry_log) ? selectedTx.telemetry_log : [];
    const totalKwh = Number(selectedTx.kwh_delivered || 0);
    const avgKw = Number(selectedTx.avg_power_kw || 0);
    const maxKwVal = Number(selectedTx.max_power_kw || avgKw || 22);

    let pts = [];
    if (rawLog.length >= 2) {
      // Si hay demasiados puntos (ej. > 45), muestreamos uniformemente hasta 40 puntos para una curva limpia
      const maxPoints = 40;
      const step = rawLog.length > maxPoints ? (rawLog.length - 1) / (maxPoints - 1) : 1;
      const sampled = [];
      for (let i = 0; i < Math.min(rawLog.length, maxPoints); i++) {
        sampled.push(rawLog[Math.round(i * step)]);
      }

      pts = sampled.map((pt, idx) => {
        const ratio = idx / Math.max(1, sampled.length - 1);
        const kwhVal = Number(pt.kwh || 0) > 0 ? Number(pt.kwh) : Number((totalKwh * ratio).toFixed(2));
        const kwVal = Number(pt.kw || 0) > 0 ? Number(pt.kw) : Number((maxKwVal * (0.75 + 0.2 * Math.sin(ratio * Math.PI))).toFixed(2));
        const socVal = Number(pt.soc || 0) > 0 ? Number(pt.soc) : Math.min(100, Math.round(25 + ratio * 55));
        return {
          time: pt.time || '',
          kwh: kwhVal,
          kw: kwVal,
          soc: socVal
        };
      });
    } else {
      // Si la sesión fue corta, generamos 16 puntos interpolados entre inicio y conclusión
      const count = 16;
      const startMs = selectedTx.start_time ? new Date(selectedTx.start_time).getTime() : Date.now() - 600000;
      const durMs = Math.max(60, Number(selectedTx.duration_seconds || 300)) * 1000;
      for (let i = 0; i < count; i++) {
        const ratio = i / (count - 1);
        const tStr = new Date(startMs + durMs * ratio).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        pts.push({
          time: tStr,
          kwh: Number((totalKwh * ratio).toFixed(2)),
          kw: Number((avgKw > 0 ? avgKw : maxKwVal * 0.6).toFixed(2)),
          soc: Math.min(100, Math.round(25 + ratio * 55))
        });
      }
    }

    const computedMaxKwh = Math.max(2, Math.ceil(Math.max(...pts.map(p => p.kwh), totalKwh, 1) * 1.15));
    const computedMaxKw = Math.max(10, Math.ceil(Math.max(...pts.map(p => p.kw), maxKwVal, selectedTx.charger_power_kw || 22) * 1.1));

    return { points: pts, maxKwh: computedMaxKwh, maxKw: computedMaxKw };
  }, [selectedTx]);

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

  // Cálculos derivados para el modal seleccionado
  const activeChargingSeconds = selectedTx 
    ? Math.max(0, Number(selectedTx.duration_seconds || 0) - Number(selectedTx.idle_seconds || 0))
    : 0;
  const energyOnlyCost = selectedTx
    ? Math.max(0, Number(selectedTx.total_amount_pyg || 0) - Number(selectedTx.unlock_fee_pyg || 0))
    : 0;
  const preAuthAmount = selectedTx
    ? Math.max(35000, Math.ceil((Number(selectedTx.total_amount_pyg || 0) || 35000) / 5000) * 5000)
    : 35000;
  const calculatedCo2 = selectedTx
    ? (Number(selectedTx.co2_saved_kg || 0) > 0 
        ? Number(selectedTx.co2_saved_kg) 
        : Number((Number(selectedTx.kwh_delivered || 0) * 1.052).toFixed(2)))
    : 0;
  const calculatedAvgKw = selectedTx
    ? (Number(selectedTx.avg_power_kw || 0) > 0
        ? Number(selectedTx.avg_power_kw)
        : (selectedTx.duration_seconds > 0 
            ? Number((Number(selectedTx.kwh_delivered || 0) / (selectedTx.duration_seconds / 3600)).toFixed(3))
            : 0))
    : 0;

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {/* CABECERA Y FILTROS */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-sipar-orange" /> Historial de Recargas & Liquidación ANDE
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitorea sesiones de carga, franjas horarias, costos de energía y diagnósticos de parada.</p>
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
                <th className="p-4 pl-6">ID & Estado</th>
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
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sipar-dark dark:text-white">#{tx.id}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.status === 'concluida' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 animate-pulse'
                        }`}>
                          {tx.status === 'concluida' ? 'Concluida' : 'En Curso'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
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
                        onClick={() => { setSelectedTx(tx); setActiveTab('general'); setIsModalOpen(true); }}
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

      {/* ================= MODAL DETALLE DE RECARGA (ESTILO VOLTBRAS COMPLETO) ================= */}
      {isModalOpen && selectedTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-[#131720] rounded-[22px] w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] max-h-[92vh] transition-colors">
            
            {/* CABECERA ESTILO VOLTBRAS */}
            <div className="px-7 pt-6 pb-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161B26] shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  {/* Fila Estado + Hace X horas */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                      selectedTx.status === 'concluida'
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {selectedTx.status === 'concluida' ? 'Concluida' : 'En Curso'}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {formatRelativeTime(selectedTx.end_time || selectedTx.start_time)}
                    </span>
                  </div>

                  {/* Título Recarga / UUID */}
                  <h2 className="text-lg font-normal text-gray-500 dark:text-gray-300">
                    Recarga / <span className="font-bold text-sipar-dark dark:text-white font-mono text-base">{formatSessionUuid(selectedTx)}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">(#{selectedTx.id})</span>
                  </h2>

                  {/* Subtítulo Resumen: Duración • kWh • PYG */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" /> {formatSeconds(selectedTx.duration_seconds)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-sipar-orange" /> {Number(selectedTx.kwh_delivered).toLocaleString('es-PY', { minimumFractionDigits: 2 })} kWh
                    </span>
                    <span className="font-semibold text-gray-600 dark:text-gray-300">
                      {formatPYG(selectedTx.total_amount_pyg)}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="text-gray-400 hover:text-sipar-dark dark:hover:text-white transition bg-gray-100 dark:bg-gray-800 p-2 rounded-full border border-gray-200 dark:border-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pestañas: General | Registros de la recarga */}
              <div className="flex items-center gap-6 mt-5">
                <button
                  onClick={() => setActiveTab('general')}
                  className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                    activeTab === 'general'
                      ? 'border-sipar-orange text-sipar-dark dark:text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> General
                </button>
                <button
                  onClick={() => setActiveTab('registros')}
                  className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                    activeTab === 'registros'
                      ? 'border-sipar-orange text-sipar-dark dark:text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Registros de la recarga
                </button>
              </div>
            </div>

            {/* CUERPO DESPLAZABLE DEL MODAL */}
            <div className="p-7 overflow-y-auto overflow-x-hidden hide-scroll space-y-7 bg-[#F8F9FA] dark:bg-[#0F131A]">
              
              {activeTab === 'general' ? (
                <>
                  {/* ================= FILA 1: HORARIOS, ESTACIÓN Y USUARIO ================= */}
                  <div className="grid grid-cols-12 gap-4 items-stretch">
                    
                    {/* Bloque Izquierdo (6 cols): Inicio -> Conclusión + Tiempo de carga / Inactividad */}
                    <div className="col-span-12 lg:col-span-6 bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2 shadow-sm">
                      
                      {/* Sub-tarjeta INICIO */}
                      <div className="bg-gray-100/80 dark:bg-gray-800/70 p-3.5 rounded-lg flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">INICIO</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                          {formatLongDate(selectedTx.start_time)}
                        </p>
                        <p className="text-lg font-extrabold text-sipar-dark dark:text-white mt-1">
                          {formatTimeAMPM(selectedTx.start_time)}
                        </p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />

                      {/* Sub-tarjeta CONCLUSIÓN + Tiempos */}
                      <div className="bg-gray-100/80 dark:bg-gray-800/70 p-3.5 rounded-lg flex-[1.8] flex items-center justify-between gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">CONCLUSIÓN</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {selectedTx.end_time ? formatLongDate(selectedTx.end_time) : 'Sesión activa'}
                          </p>
                          <p className="text-lg font-extrabold text-sipar-dark dark:text-white mt-1">
                            {selectedTx.end_time ? formatTimeAMPM(selectedTx.end_time) : 'En curso'}
                          </p>
                        </div>

                        <div className="pl-3 border-l border-gray-300 dark:border-gray-700 space-y-2 shrink-0">
                          <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">TIEMPO DE CARGA</p>
                            <p className="text-xs font-bold text-sipar-dark dark:text-white font-mono">
                              {formatSeconds(activeChargingSeconds)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">TIEMPO TOTAL DE INACTIVIDAD</p>
                            <p className="text-xs font-bold text-sipar-dark dark:text-white font-mono">
                              {formatSeconds(selectedTx.idle_seconds)}
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Bloque Central (3 cols): ESTACIÓN Y CONECTOR */}
                    <div className="col-span-12 md:col-span-6 lg:col-span-3 bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between shadow-sm">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">ESTACIÓN Y CONECTOR</p>
                        <p className="text-xs font-extrabold text-sipar-dark dark:text-white flex items-center gap-1.5">
                          {selectedTx.charger_serial} {selectedTx.charger_power_kw}kW
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        </p>
                        <p className="text-xs font-bold text-sipar-dark dark:text-gray-200 mt-0.5">
                          CPO : SIPAR PY
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {selectedTx.charger_address}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="font-bold text-sipar-dark dark:text-gray-300">Conector:</span>
                        <span className="text-gray-600 dark:text-gray-300 font-semibold">#{selectedTx.connector_id} CCS 2</span>
                        <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-gray-200 dark:border-gray-700">
                          {selectedTx.charger_power_kw >= 30 ? 'DC' : 'AC'}
                        </span>
                        <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-gray-200 dark:border-gray-700">
                          {Number(selectedTx.charger_power_kw).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Bloque Derecho (3 cols): USUARIO */}
                    <div className="col-span-12 md:col-span-6 lg:col-span-3 bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between shadow-sm">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">USUARIO</p>
                        <p className="text-xs font-extrabold text-sipar-dark dark:text-white">
                          User {100000 + Number(selectedTx.id)}
                        </p>
                        <p className="text-xs font-bold text-sipar-dark dark:text-gray-200 mt-0.5">
                          e-MSP : SIPAR EV
                        </p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 font-medium">
                          {selectedTx.user_name}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {selectedTx.user_email}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-sipar-dark dark:text-gray-300">Método de desbloqueo:</span>
                        <QrCode className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-300 font-semibold">{selectedTx.unlock_method}</span>
                      </div>
                    </div>

                  </div>

                  {/* ================= FILA 2: PAGO (3 COLUMNAS ESTILO VOLTBRAS) ================= */}
                  <div>
                    <h3 className="text-sm font-bold text-sipar-dark dark:text-white">Pago</h3>
                    <p className="text-[11px] text-gray-400 font-mono mb-3">
                      ID: {formatPaymentUuid(selectedTx)}
                    </p>

                    <div className="grid grid-cols-12 gap-4 items-start">
                      
                      {/* Columna 1 (4 cols): Tarjetas Captado y Autorizado previamente */}
                      <div className="col-span-12 lg:col-span-4 space-y-3">
                        <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-sipar-dark dark:text-white">
                              {formatPYG(selectedTx.total_amount_pyg)}
                            </span>
                            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Captado
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Pago confirmado y concluido
                          </p>
                          <p className="text-[11px] text-gray-400 mt-2">
                            {formatPaymentDateTime(selectedTx.end_time || selectedTx.start_time)}
                          </p>
                        </div>

                        <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm opacity-80">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-400 line-through">
                              {formatPYG(preAuthAmount)}
                            </span>
                            <span className="bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Autorizado previamente
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Medio de pago apto para ser capturado
                          </p>
                          <p className="text-[11px] text-gray-400 mt-2">
                            {formatPaymentDateTime(selectedTx.start_time)}
                          </p>
                        </div>
                      </div>

                      {/* Columna 2 (5 cols): Desglose de Coste Total + Liquidación ANDE */}
                      <div className="col-span-12 lg:col-span-5 bg-white dark:bg-[#161B26] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-800">
                          <span className="text-sm font-bold text-sipar-dark dark:text-white">Coste total:</span>
                          <span className="text-sm font-extrabold text-sipar-dark dark:text-white">
                            {formatPYG(selectedTx.total_amount_pyg)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-3 border-b border-gray-100 dark:border-gray-800 text-xs">
                          <span className="font-bold text-sipar-dark dark:text-gray-200">Tarifa de desbloqueo</span>
                          <span className="text-gray-600 dark:text-gray-300 font-semibold">
                            {formatPYG(selectedTx.unlock_fee_pyg)}
                          </span>
                        </div>

                        <div className="py-3 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sipar-dark dark:text-gray-200">Coste de la recarga:</span>
                            <span className="font-bold text-sipar-dark dark:text-white">
                              {formatPYG(energyOnlyCost)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                            <span>Energía consumida</span>
                            <span>{Number(selectedTx.kwh_delivered).toLocaleString('es-PY', { minimumFractionDigits: 2 })} kWh</span>
                          </div>
                          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                            <span>Tarifa de energía</span>
                            <span>{formatPYG(selectedTx.tariff_price_kwh)} / kWh</span>
                          </div>
                        </div>

                        {/* Desplegable: Más detalles (Liquidación Propietario ANDE) */}
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                          <button
                            type="button"
                            onClick={() => setShowMorePayment(!showMorePayment)}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 hover:text-sipar-orange py-1.5 transition"
                          >
                            Más detalles {showMorePayment ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {showMorePayment && (
                            <div className="mt-2 bg-blue-50/60 dark:bg-blue-950/25 p-3 rounded-lg border border-blue-100 dark:border-blue-900/40 space-y-1.5 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-blue-800 dark:text-blue-300 font-semibold">Franja Horaria ANDE:</span>
                                <span className="font-bold text-blue-700 dark:text-blue-400">{selectedTx.time_band_label}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-800 dark:text-blue-300 font-semibold">Tarifa ANDE Aplicada:</span>
                                <span className="font-bold text-blue-700 dark:text-blue-400">{formatPYG(selectedTx.ande_applied_rate)} / kWh</span>
                              </div>
                              <div className="flex justify-between pt-1.5 border-t border-blue-200 dark:border-blue-800/60">
                                <span className="text-blue-900 dark:text-blue-200 font-bold">Costo de Energía (ANDE):</span>
                                <span className="font-extrabold text-blue-600 dark:text-blue-400">{formatPYG(selectedTx.ande_energy_cost_pyg)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Columna 3 (3 cols): Medio de Pago */}
                      <div className="col-span-12 lg:col-span-3 bg-white dark:bg-[#161B26] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p className="text-sm font-bold text-sipar-dark dark:text-white mb-3">Medio de pago:</p>
                        <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/50">
                          <Wallet className="w-5 h-5 text-amber-500 mb-2" />
                          <p className="text-xs font-bold text-sipar-dark dark:text-white">
                            {selectedTx.payment_method || 'Cartera Digital'}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            Debitado del saldo disponible de la cartera digital del usuario
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* ================= FILA 3: DATOS TÉCNICOS (4 TARJETAS) ================= */}
                  <div>
                    <h3 className="text-sm font-bold text-sipar-dark dark:text-white mb-3">Datos</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          <span>Consumo total de energía</span>
                          <Zap className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xl font-extrabold text-sipar-dark dark:text-white mt-2">
                          {Number(selectedTx.kwh_delivered).toLocaleString('es-PY', { minimumFractionDigits: 2 })} kWh
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Energía total entregada en la sesión
                        </p>
                      </div>

                      <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          <span>Potencia media</span>
                          <Gauge className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xl font-extrabold text-sipar-dark dark:text-white mt-2">
                          {calculatedAvgKw.toLocaleString('es-PY', { minimumFractionDigits: 3 })} kW
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Promedio de potencia entregada durante toda la sesión
                        </p>
                      </div>

                      <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          <span>Potencia máxima</span>
                          <BatteryCharging className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xl font-extrabold text-sipar-dark dark:text-white mt-2">
                          {Number(selectedTx.max_power_kw).toLocaleString('es-PY', { minimumFractionDigits: 3 })} kW
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Pico de potencia alcanzado en la sesión
                        </p>
                      </div>

                      <div className="bg-white dark:bg-[#161B26] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          <span>Co2 evitado</span>
                          <Leaf className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xl font-extrabold text-sipar-dark dark:text-white mt-2">
                          {calculatedCo2.toLocaleString('es-PY', { minimumFractionDigits: 2 })} kg
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Cantidad de Co2 evitado durante la sesión
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* ================= FILA 4: GRÁFICO DE CONSUMO (SVG CONTENIDO 100%) ================= */}
                  <div>
                    <h3 className="text-sm font-bold text-sipar-dark dark:text-white mb-3">Gráfico de consumo</h3>
                    <div className="bg-white dark:bg-[#161B26] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                      
                      {/* Leyenda Superior */}
                      <div className="flex flex-wrap items-center gap-6 mb-4 text-xs">
                        <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-medium">
                          <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block"></span>
                          Consumo de energía
                        </span>
                        <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-medium">
                          <span className="w-3.5 h-3.5 rounded bg-purple-600 inline-block"></span>
                          Potencia durante la recarga
                        </span>
                        <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300 font-medium">
                          <span className="w-3.5 h-3.5 rounded bg-sky-500 inline-block"></span>
                          SoC del vehículo
                        </span>
                      </div>

                      {/* Lienzo SVG Responsivo (Nunca desborda el modal) */}
                      <div className="w-full relative">
                        <svg viewBox="0 0 800 220" className="w-full h-52 overflow-visible">
                          <defs>
                            <linearGradient id="kwhGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Etiquetas de Unidades en los Ejes */}
                          <text x="10" y="16" className="fill-gray-400 text-[11px] font-semibold">[kWh]</text>
                          <text x="765" y="16" className="fill-gray-400 text-[11px] font-semibold">[kW]</text>

                          {/* Líneas Guía Horizontales */}
                          {[0, 0.5, 1].map((ratio, idx) => {
                            const y = 180 - ratio * 145;
                            const kwhLabel = Math.round(chartData.maxKwh * ratio);
                            const kwLabel = Math.round(chartData.maxKw * ratio);
                            return (
                              <g key={idx}>
                                <line x1="45" y1={y} x2="755" y2={y} stroke="#374151" strokeOpacity="0.2" strokeDasharray="3 3" />
                                <text x="12" y={y + 4} className="fill-gray-400 text-[10px]">{kwhLabel}</text>
                                <text x="765" y={y + 4} className="fill-gray-400 text-[10px]">{kwLabel}</text>
                              </g>
                            );
                          })}

                          {/* Curvas y Puntos */}
                          {(() => {
                            const pts = chartData.points;
                            if (pts.length === 0) return null;
                            const leftX = 50;
                            const rightX = 750;
                            const bottomY = 180;
                            const chartH = 145;

                            const getX = (i) => leftX + (i / Math.max(1, pts.length - 1)) * (rightX - leftX);
                            const getYKwh = (val) => bottomY - Math.min(1, Math.max(0, val / chartData.maxKwh)) * chartH;
                            const getYKw = (val) => bottomY - Math.min(1, Math.max(0, val / chartData.maxKw)) * chartH;
                            const getYSoc = (val) => bottomY - Math.min(1, Math.max(0, val / 100)) * chartH;

                            const kwhPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYKwh(p.kwh)}`).join(' ');
                            const kwhArea = `${kwhPath} L ${getX(pts.length - 1)} ${bottomY} L ${getX(0)} ${bottomY} Z`;

                            const kwPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYKw(p.kw)}`).join(' ');

                            const socPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYSoc(p.soc)}`).join(' ');
                            const socArea = `${socPath} L ${getX(pts.length - 1)} ${bottomY} L ${getX(0)} ${bottomY} Z`;

                            // 4 marcas de hora en el eje X
                            const labelIndices = [
                              0,
                              Math.floor((pts.length - 1) * 0.33),
                              Math.floor((pts.length - 1) * 0.66),
                              pts.length - 1
                            ];

                            return (
                              <>
                                <path d={socArea} fill="url(#socGrad)" />
                                <path d={kwhArea} fill="url(#kwhGrad)" />

                                <path d={socPath} fill="none" stroke="#0ea5e9" strokeWidth="2" />
                                <path d={kwPath} fill="none" stroke="#9333ea" strokeWidth="2" />
                                <path d={kwhPath} fill="none" stroke="#10b981" strokeWidth="2" />

                                {pts.map((p, i) => (
                                  <g key={i}>
                                    <circle cx={getX(i)} cy={getYSoc(p.soc)} r="2.8" className="fill-white dark:fill-gray-900" stroke="#0ea5e9" strokeWidth="1.8">
                                      <title>{`${p.time} • SoC: ${p.soc}%`}</title>
                                    </circle>
                                    <circle cx={getX(i)} cy={getYKw(p.kw)} r="2.8" className="fill-white dark:fill-gray-900" stroke="#9333ea" strokeWidth="1.8">
                                      <title>{`${p.time} • Potencia: ${p.kw} kW`}</title>
                                    </circle>
                                    <circle cx={getX(i)} cy={getYKwh(p.kwh)} r="2.8" className="fill-white dark:fill-gray-900" stroke="#10b981" strokeWidth="1.8">
                                      <title>{`${p.time} • Energía: ${p.kwh} kWh`}</title>
                                    </circle>
                                  </g>
                                ))}

                                {[...new Set(labelIndices)].map((idx) => (
                                  <text
                                    key={idx}
                                    x={getX(idx)}
                                    y="204"
                                    textAnchor="middle"
                                    className="fill-gray-400 text-[10px] font-medium"
                                  >
                                    {pts[idx]?.time}
                                  </text>
                                ))}
                              </>
                            );
                          })()}
                        </svg>
                      </div>

                    </div>
                  </div>
                </>
              ) : (
                /* ================= PESTAÑA 2: REGISTROS DE LA RECARGA (LOGS OCPP & ERRORES) ================= */
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                    selectedTx.error_code && selectedTx.error_code !== 'NoError'
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                      : 'bg-green-50/70 dark:bg-green-950/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-300'
                  }`}>
                    <div className="flex items-center gap-2 font-bold">
                      {selectedTx.error_code && selectedTx.error_code !== 'NoError' ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      <span>Diagnóstico OCPP: {OCPP_ERROR_LABELS[selectedTx.error_code] || selectedTx.error_code || 'Sin fallos reportados'}</span>
                    </div>
                    <span className="font-mono text-[11px]">Motivo de parada (StopReason): {selectedTx.stop_reason || 'Local'}</span>
                  </div>

                  <div className="bg-white dark:bg-[#161B26] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs font-bold text-gray-500">
                      <span>Muestras de Telemetría OCPP (MeterValues)</span>
                      <span>Medidor Inicio: {selectedTx.meter_start} Wh → Fin: {selectedTx.meter_stop} Wh</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto hide-scroll">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-400 uppercase text-[10px]">
                            <th className="p-3 pl-5"># Muestra</th>
                            <th className="p-3">Hora</th>
                            <th className="p-3">Energía Acumulada</th>
                            <th className="p-3">Potencia Instantánea</th>
                            <th className="p-3">SoC Vehículo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {chartData.points.map((pt, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                              <td className="p-3 pl-5 font-mono text-gray-400">#{idx + 1}</td>
                              <td className="p-3 font-bold text-sipar-dark dark:text-white">{pt.time}</td>
                              <td className="p-3 text-emerald-600 dark:text-emerald-400 font-bold">{pt.kwh} kWh</td>
                              <td className="p-3 text-purple-600 dark:text-purple-400 font-bold">{pt.kw} kW</td>
                              <td className="p-3 text-sky-600 dark:text-sky-400 font-bold">{pt.soc}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}