import { useState, useEffect, useMemo } from 'react';
import { 
  Zap, Plus, MapPin, Loader2, X, AlertCircle, 
  BatteryCharging, RotateCw, Unlock, Power, Eye, Search, PlusCircle,
  Play, Square, Map, Info, CheckCircle, Edit, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, Clock, Download, FileSpreadsheet
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import api from '../api/axios';

const mapContainerStyle = { width: '100%', height: '250px', borderRadius: '12px' };
const defaultCenter = { lat: -25.270, lng: -57.520 };

const OCPP_ERROR_LABELS = {
  NoError: "Sin fallos reportados (Operación Normal)",
  ConnectorLockFailure: "Fallo en bloqueo electromecánico del conector",
  EVCommunicationError: "Mala conexión con el vehículo / Carga abortada (0 Wh)",
  GroundFailure: "Fallo de puesta a tierra / Tensión inestable",
  HighTemperature: "Alerta de alta temperatura interna",
  InternalError: "Error interno del hardware del cargador",
  OverCurrentFailure: "Protección por sobrecorriente activada",
  OverVoltage: "Sobretensión en la línea de alimentación",
  PowerMeterFailure: "Error en medidor de energía",
  PowerSwitchFailure: "Fallo en contactor / relé de potencia",
  UnderVoltage: "Baja tensión / Falla de tierra en red eléctrica",
  WeakSignal: "Señal de comunicación débil"
};

const getReadableError = (code) => {
  if (!code || code === 'NoError') return 'Sin fallos reportados (NoError)';
  if (OCPP_ERROR_LABELS[code]) return OCPP_ERROR_LABELS[code];
  const baseKey = Object.keys(OCPP_ERROR_LABELS).find(k => code.startsWith(k));
  return baseKey ? `${OCPP_ERROR_LABELS[baseKey]} — ${code}` : code;
};

export default function Chargers() {
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Paginación de la tabla de Cargadores (20 por defecto, seleccionable 20, 50, 100)
  const [chargerPage, setChargerPage] = useState(1);
  const [chargerPageSize, setChargerPageSize] = useState(20);

  const { isLoaded: isMapLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chargerToDelete, setChargerToDelete] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCommandSending, setIsCommandSending] = useState('');
  
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });
  const [activeConnector, setActiveConnector] = useState(1);

  // ================= ESTADOS DEL MODAL DE HISTORIAL POR CARGADOR =================
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyCharger, setHistoryCharger] = useState(null);
  const [chargerTransactions, setChargerTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);
  
  const [formData, setFormData] = useState({
    id: null, serial_number: '', power_kw: '', address: '', lat: '', lng: '',
    ande_tension_type: 'baja', ande_cost_off_peak: '', ande_cost_peak: '', ande_peak_start: '18:00', ande_peak_end: '21:00'
  });

  const fetchChargers = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const response = await api.get('/api/v1/chargers/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChargers(response.data);
    } catch (error) {
      console.error("Error al cargar equipos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChargers();
    const interval = setInterval(() => {
      if(!isModalOpen) fetchChargers(); 
    }, 5000);
    return () => clearInterval(interval);
  }, [isModalOpen]);

  useEffect(() => {
    if (selectedCharger) {
      const updatedCharger = chargers.find(c => c.id === selectedCharger.id);
      if (updatedCharger) setSelectedCharger(updatedCharger);
    }
  }, [chargers]);

  // Reiniciar paginación de cargadores al buscar o cambiar cantidad por página
  useEffect(() => {
    setChargerPage(1);
  }, [searchTerm, chargerPageSize]);

  // Cargar historial cuando se abre el modal de un cargador o se cambia el filtro de mes
  const fetchChargerHistory = async (chargerId, monthFilter = '') => {
    if (!chargerId) return;
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('sipar_token');
      let url = `/api/v1/transactions/?charger_id=${chargerId}&limit=2000`;
      if (monthFilter) url += `&month=${monthFilter}`;
      const res = await api.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setChargerTransactions(res.data);
    } catch (err) {
      console.error("Error cargando historial del cargador:", err);
      showNotification('error', 'No se pudo cargar el historial del cargador.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isHistoryModalOpen && historyCharger) {
      fetchChargerHistory(historyCharger.id, historyMonth);
    }
  }, [isHistoryModalOpen, historyCharger, historyMonth]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historyMonth, historyPageSize]);

  const openChargerHistoryModal = (charger) => {
    setHistoryCharger(charger);
    setHistoryMonth('');
    setHistorySearch('');
    setHistoryPage(1);
    setIsHistoryModalOpen(true);
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return "00:00:00";
    const total = Math.floor(sec);
    const hrs = Math.floor(total / 3600).toString().padStart(2, '0');
    const mins = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const handleMapClick = (e) => {
    setFormData({ ...formData, lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const handleSubmitCharger = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!formData.lat || !formData.lng) {
      setError("Por favor, selecciona una ubicación en el mapa haciendo clic.");
      setIsSubmitting(false);
      return;
    }

    try {
      const token = localStorage.getItem('sipar_token');
      const existingCharger = chargers.find(c => c.id === formData.id);
      const payload = {
        serial_number: formData.serial_number,
        power_kw: parseFloat(formData.power_kw),
        status: isEditMode && existingCharger ? existingCharger.status : "fuera_de_linea",
        company_id: 1,
        location: { lat: parseFloat(formData.lat), lng: parseFloat(formData.lng), address: formData.address },
        ande_tension_type: formData.ande_tension_type,
        ande_cost_off_peak: parseFloat(formData.ande_cost_off_peak) || 0,
        ande_cost_peak: parseFloat(formData.ande_cost_peak) || parseFloat(formData.ande_cost_off_peak) || 0,
        ande_peak_start: formData.ande_peak_start,
        ande_peak_end: formData.ande_peak_end
      };

      if (isEditMode) {
        await api.put(`/api/v1/chargers/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Equipo actualizado exitosamente.');
      } else {
        await api.post('/api/v1/chargers/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Equipo registrado exitosamente en la red.');
      }
      
      setIsModalOpen(false);
      setFormData({ 
        id: null, serial_number: '', power_kw: '', address: '', lat: '', lng: '',
        ande_tension_type: 'baja', ande_cost_off_peak: '', ande_cost_peak: '', ande_peak_start: '18:00', ande_peak_end: '21:00'
      });
      fetchChargers();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (charger) => {
    let lat = '', lng = '', address = '';
    if (charger.location) {
      let parsed = charger.location;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch(e){}
      }
      lat = parsed.lat || '';
      lng = parsed.lng || '';
      address = parsed.address || '';
    }

    setFormData({
      id: charger.id,
      serial_number: charger.serial_number,
      power_kw: charger.power_kw,
      address: address,
      lat: lat,
      lng: lng,
      ande_tension_type: charger.ande_tension_type || 'baja',
      ande_cost_off_peak: charger.ande_cost_off_peak !== null && charger.ande_cost_off_peak !== undefined ? charger.ande_cost_off_peak : '',
      ande_cost_peak: charger.ande_cost_peak !== null && charger.ande_cost_peak !== undefined ? charger.ande_cost_peak : '',
      ande_peak_start: charger.ande_peak_start || '18:00',
      ande_peak_end: charger.ande_peak_end || '21:00'
    });
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!chargerToDelete) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/chargers/${chargerToDelete.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', 'Equipo eliminado de la red exitosamente.');
      setIsDeleteModalOpen(false);
      setChargerToDelete(null);
      fetchChargers();
    } catch (err) {
      console.error(err);
      showNotification('error', err.response?.data?.detail || 'No tienes permiso para eliminar equipos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDetails = (charger) => {
    setSelectedCharger(charger);
    setActiveConnector(1);
    setIsDetailsOpen(true);
  };

  const sendRemoteCommand = async (commandType) => {
    if (!selectedCharger) return;
    setIsCommandSending(commandType);
    
    try {
      const token = localStorage.getItem('sipar_token');
      let endpoint = '';
      
      if (commandType === 'SoftReset') {
        endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/reset?tipo=Soft`;
      } else if (commandType === 'HardReset') {
        endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/reset?tipo=Hard`;
      } else if (commandType === 'Unlock') {
        endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/unlock?connector_id=${activeConnector}`;
      } else if (commandType === 'StartCharge') {
        endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/start?tag=ADMIN-OVERRIDE&connector_id=${activeConnector}`;
      } else if (commandType === 'StopCharge') {
        endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/stop?transaction_id=1&connector_id=${activeConnector}`;
      }

      const response = await api.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `El cargador respondió: "${response.data.respuesta_hardware || 'Comando aceptado'}"`);
      setTimeout(() => fetchChargers(), 800);
    } catch (error) {
      showNotification('error', error.response?.data?.detail || 'El cargador no está conectado o rechazó la solicitud.');
    } finally {
      setIsCommandSending('');
    }
  };

  // Filtrado y Paginación de Cargadores
  const filteredChargers = useMemo(() => {
    if (!searchTerm) return chargers;
    const lowerTerm = searchTerm.toLowerCase();
    return chargers.filter(c => 
      c.serial_number.toLowerCase().includes(lowerTerm) ||
      (c.location && typeof c.location === 'object' && c.location.address && c.location.address.toLowerCase().includes(lowerTerm)) ||
      (c.location && typeof c.location === 'string' && c.location.toLowerCase().includes(lowerTerm))
    );
  }, [chargers, searchTerm]);

  const totalChargerPages = Math.max(1, Math.ceil(filteredChargers.length / chargerPageSize));
  const safeChargerPage = Math.min(chargerPage, totalChargerPages);
  const chargerStartIndex = (safeChargerPage - 1) * chargerPageSize;
  const chargerEndIndex = chargerStartIndex + chargerPageSize;
  const paginatedChargers = filteredChargers.slice(chargerStartIndex, chargerEndIndex);

  // Filtrado, Métricas y Paginación del Historial del Cargador Seleccionado
  const filteredHistoryTxs = useMemo(() => {
    if (!historySearch) return chargerTransactions;
    const lower = historySearch.toLowerCase();
    return chargerTransactions.filter(tx =>
      tx.id.toString().includes(lower) ||
      tx.user_name.toLowerCase().includes(lower) ||
      (tx.error_code && tx.error_code.toLowerCase().includes(lower))
    );
  }, [chargerTransactions, historySearch]);

  const historySummary = useMemo(() => {
    let kwh = 0;
    let revenue = 0;
    let andeCost = 0;
    let durationSec = 0;

    filteredHistoryTxs.forEach(tx => {
      kwh += Number(tx.kwh_delivered || 0);
      revenue += Number(tx.total_amount_pyg || 0);
      andeCost += Number(tx.ande_energy_cost_pyg || 0);
      durationSec += Number(tx.duration_seconds || 0);
    });

    return {
      count: filteredHistoryTxs.length,
      kwh: Number(kwh.toFixed(2)),
      revenue: Math.round(revenue),
      andeCost: Math.round(andeCost),
      netMargin: Math.round(revenue - andeCost),
      durationSec
    };
  }, [filteredHistoryTxs]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistoryTxs.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const historyStartIndex = (safeHistoryPage - 1) * historyPageSize;
  const historyEndIndex = historyStartIndex + historyPageSize;
  const paginatedHistoryTxs = filteredHistoryTxs.slice(historyStartIndex, historyEndIndex);

  // Exportar CSV de todas las cargas filtradas de este cargador
  const exportChargerHistoryToCSV = () => {
    if (!historyCharger || filteredHistoryTxs.length === 0) return;

    const headers = [
      "ID Transaccion",
      "Estado",
      "Estacion (Serie)",
      "Potencia (kW)",
      "Conector",
      "Usuario",
      "Email Usuario",
      "Metodo Desbloqueo",
      "Fecha/Hora Inicio",
      "Fecha/Hora Fin",
      "Duracion (HH:MM:SS)",
      "Inactividad (HH:MM:SS)",
      "Energia (kWh)",
      "Potencia Media (kW)",
      "Potencia Maxima (kW)",
      "CO2 Evitado (kg)",
      "Tarifa Venta (Gs/kWh)",
      "Total Cobrado Cliente (Gs)",
      "Franja Horaria ANDE",
      "Tarifa ANDE Aplicada (Gs/kWh)",
      "Costo Energia ANDE (Gs)",
      "Margen Neto SIPAR (Gs)",
      "Codigo Error OCPP",
      "Motivo Cierre"
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredHistoryTxs.map(tx => {
      const rev = Number(tx.total_amount_pyg || 0);
      const ande = Number(tx.ande_energy_cost_pyg || 0);
      const co2 = Number(tx.co2_saved_kg || 0) > 0 ? Number(tx.co2_saved_kg) : Number((Number(tx.kwh_delivered || 0) * 1.052).toFixed(2));
      return [
        tx.id,
        tx.status,
        tx.charger_serial,
        tx.charger_power_kw,
        `#${tx.connector_id}`,
        tx.user_name,
        tx.user_email,
        tx.unlock_method,
        tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY') : 'N/A',
        tx.end_time ? new Date(tx.end_time).toLocaleString('es-PY') : 'En curso',
        formatSeconds(tx.duration_seconds),
        formatSeconds(tx.idle_seconds),
        Number(tx.kwh_delivered || 0).toFixed(2),
        Number(tx.avg_power_kw || 0).toFixed(3),
        Number(tx.max_power_kw || 0).toFixed(3),
        co2.toFixed(2),
        Math.round(Number(tx.tariff_price_kwh || 0)),
        Math.round(rev),
        tx.time_band_label,
        Math.round(Number(tx.ande_applied_rate || 0)),
        Math.round(ande),
        Math.round(rev - ande),
        tx.error_code || 'NoError',
        tx.stop_reason || 'Local'
      ].map(escapeCsv).join(',');
    });

    const summaryRow = [
      "TOTALES ESTACION",
      `${historySummary.count} sesiones`,
      historyCharger.serial_number,
      historyCharger.power_kw,
      "",
      "",
      "",
      "",
      historyMonth || "Historico Completo",
      "",
      formatSeconds(historySummary.durationSec),
      "",
      historySummary.kwh.toFixed(2),
      "",
      "",
      "",
      "",
      historySummary.revenue,
      "",
      "",
      historySummary.andeCost,
      historySummary.netMargin,
      "",
      ""
    ].map(escapeCsv).join(',');

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows, summaryRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Historial_${historyCharger.serial_number}_${historyMonth || 'Completo'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  const activeConnectorData = selectedCharger?.connectors?.find(c => c.connector_id === activeConnector);
  const displayStatus = selectedCharger?.status === 'fuera_de_linea' 
    ? 'fuera_de_linea' 
    : (activeConnectorData ? activeConnectorData.status : selectedCharger?.status);
  const activeErrorCode = activeConnectorData?.error_code && activeConnectorData.error_code !== 'NoError'
    ? activeConnectorData.error_code
    : (selectedCharger?.last_error_code || 'NoError');

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {/* NOTIFICACIÓN TOAST */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl animate-[slideDown_0.3s_ease-out] border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error en la operación'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* CABECERA */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-sipar-orange" /> Red de Cargadores
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestiona la infraestructura de carga, estado operativo e historial individual por estación.</p>
        </div>
        <button 
          onClick={() => { 
            setIsEditMode(false); 
            setFormData({
              id: null, serial_number: '', power_kw: '', address: '', lat: '', lng: '',
              ande_tension_type: 'baja', ande_cost_off_peak: '', ande_cost_peak: '', ande_peak_start: '18:00', ande_peak_end: '21:00'
            }); 
            setIsModalOpen(true); 
          }} 
          className="flex items-center gap-2 bg-sipar-orange text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition shadow-sm"
        >
          <PlusCircle className="w-4 h-4" /> Nuevo Cargador
        </button>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-sipar-orange" /> Inventario de Estaciones ({filteredChargers.length})
          </h2>
          <div className="flex items-center gap-3">
            {/* Selector de paginado (20, 50, 100) */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
              <span className="text-xs text-gray-400 font-medium">Mostrar:</span>
              <select
                value={chargerPageSize}
                onChange={(e) => setChargerPageSize(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value={20} className="bg-gray-900 text-white">20</option>
                <option value={50} className="bg-gray-900 text-white">50</option>
                <option value={100} className="bg-gray-900 text-white">100</option>
              </select>
            </div>

            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar ID o ubicación..." 
                className="bg-transparent border-none text-sm text-white focus:outline-none placeholder-gray-500 w-48"
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
                <th className="p-4 pl-6">ID / Serie</th>
                <th className="p-4">Potencia</th>
                <th className="p-4">Ubicación</th>
                <th className="p-4">Estado Operativo</th>
                <th className="p-4 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {paginatedChargers.length > 0 ? (
                paginatedChargers.map((charger) => {
                  let displayAddress = 'Sin dirección';
                  if (charger.location) {
                    if (typeof charger.location === 'string') {
                      try { displayAddress = JSON.parse(charger.location).address; } catch(e){}
                    } else if (charger.location.address) {
                      displayAddress = charger.location.address;
                    }
                  }

                  const hasError = charger.last_error_code && charger.last_error_code !== 'NoError';

                  return (
                    <tr key={charger.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                      <td className="p-4 pl-6">
                        <p className="font-bold text-sipar-dark dark:text-white">{charger.serial_number}</p>
                        <p className="text-[11px] text-gray-400">ID: {charger.id}</p>
                      </td>
                      <td className="p-4 font-bold text-gray-700 dark:text-gray-300">{charger.power_kw} kW</td>
                      <td className="p-4">
                        <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5 text-[13px] max-w-[250px] truncate" title={displayAddress}>
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {displayAddress}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 ${
                              charger.status === 'disponible' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                              charger.status === 'conectado' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                              charger.status === 'en_uso' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                              charger.status === 'falla' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800' :
                              'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                charger.status === 'disponible' ? 'bg-green-500' :
                                charger.status === 'conectado' ? 'bg-amber-500' :
                                charger.status === 'en_uso' ? 'bg-blue-500' :
                                charger.status === 'falla' ? 'bg-orange-500' : 'bg-red-500'
                            }`}></div> 
                            {charger.status === 'disponible' ? 'Disponible' : 
                             charger.status === 'conectado' ? 'Auto Conectado (Sin corriente)' :
                             charger.status === 'en_uso' ? 'Cargando (Pasando corriente)' : 
                             charger.status === 'falla' ? `Falla: ${charger.last_error_code || 'Error'}` : 'Fuera de Línea'}
                          </span>
                          {hasError && charger.status !== 'falla' && (
                            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Última alerta: {charger.last_error_code}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right pr-6 flex justify-end gap-2">
                        {/* NUEVO BOTÓN: HISTORIAL DE CARGAS Y EXPORTACIÓN CSV DE ESTE CARGADOR */}
                        <button 
                          onClick={() => openChargerHistoryModal(charger)} 
                          className="px-2.5 py-1.5 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/60 text-sipar-orange rounded-lg hover:bg-sipar-orange hover:text-white shadow-sm transition flex items-center gap-1.5 text-xs font-bold" 
                          title="Ver Historial de Cargas y Exportar CSV"
                        >
                          <Clock className="w-3.5 h-3.5" /> Historial
                        </button>
                        <button onClick={() => openDetails(charger)} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-dark dark:hover:text-white shadow-sm transition" title="Ver Diagnóstico OCPP">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEditClick(charger)} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm transition" title="Editar Equipo">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setChargerToDelete(charger); setIsDeleteModalOpen(true); }} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 shadow-sm transition" title="Eliminar Equipo">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-400 dark:text-gray-500">No se encontraron cargadores con ese filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA: CONTROLES DE PAGINACIÓN DE CARGADORES */}
        {filteredChargers.length > 0 && (
          <div className="px-6 py-4 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <span>
                Mostrando <strong className="text-sipar-dark dark:text-white">{chargerStartIndex + 1}</strong> a{' '}
                <strong className="text-sipar-dark dark:text-white">{Math.min(chargerEndIndex, filteredChargers.length)}</strong> de{' '}
                <strong className="text-sipar-dark dark:text-white">{filteredChargers.length}</strong> cargadores
              </span>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <div className="flex items-center gap-1.5">
                <span>Filas por página:</span>
                <select
                  value={chargerPageSize}
                  onChange={(e) => setChargerPageSize(Number(e.target.value))}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setChargerPage(prev => Math.max(1, prev - 1))}
                disabled={safeChargerPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>

              {Array.from({ length: totalChargerPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalChargerPages || Math.abs(page - safeChargerPage) <= 1)
                .reduce((acc, page, idx, arr) => {
                  if (idx > 0 && page - arr[idx - 1] > 1) acc.push('...');
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setChargerPage(item)}
                      className={`w-8 h-8 rounded-lg font-bold transition ${
                        safeChargerPage === item
                          ? 'bg-sipar-orange text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                onClick={() => setChargerPage(prev => Math.min(totalChargerPages, prev + 1))}
                disabled={safeChargerPage === totalChargerPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: HISTORIAL DE CARGAS Y EXPORTACIÓN CSV POR CARGADOR ================= */}
      {isHistoryModalOpen && historyCharger && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] max-h-[92vh]">
            
            {/* Cabecera del Modal de Historial del Cargador */}
            <div className="px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4 bg-sipar-dark text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-gray-800 p-2.5 rounded-xl border border-gray-700">
                  <FileSpreadsheet className="w-5 h-5 text-sipar-orange" />
                </div>
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    Historial de Recargas — {historyCharger.serial_number}
                    <span className="text-xs bg-gray-800 text-sipar-orange px-2.5 py-0.5 rounded-full font-mono">
                      {historyCharger.power_kw} kW
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Auditoría individual de sesiones, consumo y liquidación ANDE de esta estación.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white text-xs font-bold px-3 py-2 rounded-xl outline-none"
                />
                <button
                  onClick={exportChargerHistoryToCSV}
                  disabled={filteredHistoryTxs.length === 0}
                  className="bg-sipar-orange hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition"
                >
                  <Download className="w-4 h-4" /> Exportar CSV ({filteredHistoryTxs.length})
                </button>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-gray-400 hover:text-white transition bg-gray-800 p-2 rounded-full border border-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenido del Modal */}
            <div className="p-6 overflow-y-auto hide-scroll space-y-5 bg-gray-50/50 dark:bg-[#0F131A]">
              
              {/* Tarjetas de Resumen Rápido del Cargador */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-sipar-dark p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Sesiones & Tiempo</p>
                  <p className="text-lg font-extrabold text-sipar-dark dark:text-white mt-1">{historySummary.count} cargas</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">⏱ {formatSeconds(historySummary.durationSec)}</p>
                </div>
                <div className="bg-white dark:bg-sipar-dark p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Energía Suministrada</p>
                  <p className="text-lg font-extrabold text-sipar-orange mt-1">{historySummary.kwh.toLocaleString('es-PY', { minimumFractionDigits: 2 })} kWh</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Tensión: {(historyCharger.ande_tension_type || 'baja').toUpperCase()}</p>
                </div>
                <div className="bg-white dark:bg-sipar-dark p-4 rounded-xl border border-blue-200 dark:border-blue-900/50">
                  <p className="text-[10px] font-bold text-blue-500 uppercase">Costo Energía ANDE</p>
                  <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-1">{historySummary.andeCost.toLocaleString('es-PY')} ₲</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">A liquidar al propietario</p>
                </div>
                <div className="bg-white dark:bg-sipar-dark p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Total Cobrado (Bruto)</p>
                  <p className="text-lg font-extrabold text-green-600 dark:text-green-400 mt-1">{historySummary.revenue.toLocaleString('es-PY')} ₲</p>
                  <p className="text-[11px] text-emerald-500 font-bold mt-0.5">Margen: {historySummary.netMargin.toLocaleString('es-PY')} ₲</p>
                </div>
              </div>

              {/* Barra de Búsqueda y Selector de Paginación del Modal */}
              <div className="bg-white dark:bg-sipar-dark rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por ID, usuario o código de error..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="bg-transparent border-none text-xs text-sipar-dark dark:text-white focus:outline-none w-56"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Mostrar:</span>
                    <select
                      value={historyPageSize}
                      onChange={(e) => setHistoryPageSize(Number(e.target.value))}
                      className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white font-bold rounded-lg px-2.5 py-1 outline-none cursor-pointer"
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {/* Tabla Paginada de Recargas del Cargador */}
                {historyLoading ? (
                  <div className="p-12 flex justify-center items-center">
                    <Loader2 className="w-8 h-8 text-sipar-orange animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                          <th className="p-3.5 pl-5">ID & Estado</th>
                          <th className="p-3.5">Inicio / Conclusión</th>
                          <th className="p-3.5">Usuario</th>
                          <th className="p-3.5">Energía & Duración</th>
                          <th className="p-3.5">Costo ANDE</th>
                          <th className="p-3.5">Total Cobrado</th>
                          <th className="p-3.5 pr-5">Diagnóstico OCPP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {paginatedHistoryTxs.length > 0 ? (
                          paginatedHistoryTxs.map((tx) => {
                            const hasErr = tx.error_code && tx.error_code !== 'NoError';
                            return (
                              <tr key={tx.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition">
                                <td className="p-3.5 pl-5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-sipar-dark dark:text-white">#{tx.id}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      tx.status === 'concluida'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    }`}>
                                      {tx.status === 'concluida' ? 'Concluida' : 'En Curso'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-0.5">Conector #{tx.connector_id}</p>
                                </td>
                                <td className="p-3.5">
                                  <p className="font-semibold text-sipar-dark dark:text-gray-200">
                                    {tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                                  </p>
                                  <p className="text-[10px] text-gray-400">
                                    Fin: {tx.end_time ? new Date(tx.end_time).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : 'En curso'}
                                  </p>
                                </td>
                                <td className="p-3.5">
                                  <p className="font-bold text-gray-700 dark:text-gray-300">{tx.user_name}</p>
                                  <p className="text-[10px] text-gray-400">{tx.unlock_method}</p>
                                </td>
                                <td className="p-3.5">
                                  <p className="font-bold text-sipar-orange">{tx.kwh_delivered} kWh</p>
                                  <p className="text-[10px] text-gray-400">⏱ {formatSeconds(tx.duration_seconds)}</p>
                                </td>
                                <td className="p-3.5">
                                  <p className="font-bold text-blue-600 dark:text-blue-400">{tx.ande_energy_cost_pyg.toLocaleString('es-PY')} ₲</p>
                                  <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">
                                    {tx.time_band_label}
                                  </span>
                                </td>
                                <td className="p-3.5 font-bold text-green-600 dark:text-green-400">
                                  {tx.total_amount_pyg.toLocaleString('es-PY')} ₲
                                </td>
                                <td className="p-3.5 pr-5">
                                  {hasErr ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> {tx.error_code}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-green-600 dark:text-green-400 font-semibold">
                                      NoError ({tx.stop_reason || 'Local'})
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="p-8 text-center text-gray-400">
                              No hay recargas registradas para este cargador con los filtros actuales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Controles de Paginación del Modal de Historial */}
                {filteredHistoryTxs.length > 0 && (
                  <div className="px-5 py-3.5 bg-gray-50/70 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      Mostrando <strong className="text-sipar-dark dark:text-white">{historyStartIndex + 1}</strong> a{' '}
                      <strong className="text-sipar-dark dark:text-white">{Math.min(historyEndIndex, filteredHistoryTxs.length)}</strong> de{' '}
                      <strong className="text-sipar-dark dark:text-white">{filteredHistoryTxs.length}</strong> recargas
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                        disabled={safeHistoryPage === 1}
                        className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                      </button>
                      <span className="px-2.5 font-bold text-sipar-dark dark:text-white">
                        Página {safeHistoryPage} de {totalHistoryPages}
                      </span>
                      <button
                        onClick={() => setHistoryPage(prev => Math.min(totalHistoryPages, prev + 1))}
                        disabled={safeHistoryPage === totalHistoryPages}
                        className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
                      >
                        Siguiente <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out]">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Eliminar Cargador?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Estás a punto de borrar el equipo <span className="font-bold text-sipar-dark dark:text-white">{chargerToDelete?.serial_number}</span> de la red. Esta acción desactivará sus transacciones futuras.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {setIsDeleteModalOpen(false); setChargerToDelete(null);}} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition text-sm">Cancelar</button>
              <button onClick={handleDeleteConfirm} disabled={isSubmitting} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm shadow-sm">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-[24px] w-full max-w-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out] max-h-[95vh] flex flex-col border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
              <h3 className="font-bold text-lg text-sipar-dark dark:text-white flex items-center gap-2">
                {isEditMode ? <Edit className="w-5 h-5 text-sipar-orange" /> : <Plus className="w-5 h-5 text-sipar-orange" />} 
                {isEditMode ? 'Editar Equipo' : 'Registrar Equipo'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm border border-gray-100 dark:border-gray-700"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="overflow-y-auto hide-scroll">
              <form onSubmit={handleSubmitCharger} className="p-6">
                {error && (
                  <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 text-sm text-red-700 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" /> {error}
                  </div>
                )}
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">ID del Cargador</label>
                      <input type="text" required placeholder="Ej. SPEV001" className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sipar-orange/20 outline-none transition" value={formData.serial_number} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">Potencia (kW)</label>
                      <input type="number" step="0.1" required placeholder="Ej. 7.4" className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sipar-orange/20 outline-none transition" value={formData.power_kw} onChange={(e) => setFormData({...formData, power_kw: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">Dirección / Referencia</label>
                    <input type="text" required placeholder="Ej. Shopping Paseo La Galería - Estacionamiento Nivel 2" className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-sipar-orange/20 outline-none transition" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                  </div>
                  <div>
                    <div className="flex justify-between items-end mb-1">
                      <label className="block text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">

<Map className="w-3.5 h-3.5" />
Ubicación GPS
                      </label>
                      <span className="text-[10px] text-gray-400 font-medium">Haz clic en el mapa para marcar el punto</span>
                    </div>
                    <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden relative">
                      {isMapLoaded ? (
                        <GoogleMap 
                          mapContainerStyle={mapContainerStyle} 
                          center={formData.lat && formData.lng ? { lat: Number(formData.lat), lng: Number(formData.lng) } : defaultCenter} 
                          zoom={13} 
                          onClick={handleMapClick} 
                          options={{ disableDefaultUI: false, streetViewControl: false, mapTypeControl: false }}
                        >
                          {formData.lat && formData.lng && ( <MarkerF position={{ lat: Number(formData.lat), lng: Number(formData.lng) }} icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png' }} /> )}
                        </GoogleMap>
                      ) : (
                        <div className="h-[250px] w-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /></div>
                      )}
                    </div>
                  </div>

                  {/* CONFIGURACIÓN DE COSTO ANDE (LIQUIDACIÓN PROPIETARIO) */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-xs font-bold text-sipar-orange uppercase tracking-wide mb-3">Parámetros de Costo ANDE (Liquidación Propietario)</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">Tipo de Tensión</label>
                        <select 
                          value={formData.ande_tension_type} 
                          onChange={(e) => setFormData({...formData, ande_tension_type: e.target.value})}
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3 py-2 text-sm outline-none"
                        >
                          <option value="baja">Baja Tensión (Tarifa Plana)</option>
                          <option value="media">Media Tensión (Variable por Hora)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                          {formData.ande_tension_type === 'media' ? 'Costo Fuera de Punta (₲/kWh)' : 'Costo de Energía ANDE (₲/kWh)'}
                        </label>
                        <input type="number" step="1" placeholder="Ej. 650" value={formData.ande_cost_off_peak} onChange={(e) => setFormData({...formData, ande_cost_off_peak: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3 py-2 text-sm outline-none" />
                      </div>
                    </div>

                    {formData.ande_tension_type === 'media' && (
                      <div className="grid grid-cols-3 gap-3 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">Costo en Punta (₲/kWh)</label>
                          <input type="number" step="1" placeholder="Ej. 1100" value={formData.ande_cost_peak} onChange={(e) => setFormData({...formData, ande_cost_peak: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">Hora Inicio Punta</label>
                          <input type="time" value={formData.ande_peak_start} onChange={(e) => setFormData({...formData, ande_peak_start: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">Hora Fin Punta</label>
                          <input type="time" value={formData.ande_peak_end} onChange={(e) => setFormData({...formData, ande_peak_end: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg px-2 py-1.5 text-xs outline-none" />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-sipar-orange hover:bg-orange-600 transition flex items-center gap-2 shadow-sm disabled:opacity-70">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Guardar Equipo')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALLES (OCPP) */}
      {isDetailsOpen && selectedCharger && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out]">
            
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-sipar-dark text-white">
              <div className="flex items-center gap-3">
                <div className="bg-gray-800 p-2 rounded-lg">
                  <BatteryCharging className="w-5 h-5 text-sipar-orange" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Estación SIPAR</h2>
                  <p className="text-xs text-gray-400 font-mono">ID: {selectedCharger.serial_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setIsDetailsOpen(false); openChargerHistoryModal(selectedCharger); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-sipar-orange border border-gray-700 flex items-center gap-1.5 transition"
                >
                  <Clock className="w-3.5 h-3.5" /> Ver Historial & CSV
                </button>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                  selectedCharger.status === 'disponible' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  selectedCharger.status === 'conectado' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  selectedCharger.status === 'en_uso' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                  selectedCharger.status === 'falla' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    selectedCharger.status === 'disponible' ? 'bg-green-400' :
                    selectedCharger.status === 'conectado' ? 'bg-amber-400' :
                    selectedCharger.status === 'en_uso' ? 'bg-blue-400' : 
                    selectedCharger.status === 'falla' ? 'bg-orange-400' : 'bg-red-400'
                  }`}></div> 
                  {selectedCharger.status === 'disponible' ? 'En línea (Libre)' : 
                   selectedCharger.status === 'conectado' ? 'Auto Conectado (0 A)' :
                   selectedCharger.status === 'en_uso' ? 'Cargando (Con corriente)' : 
                   selectedCharger.status === 'falla' ? 'Falla Detectada' : 'Desconectado'}
                </span>
                <button onClick={() => setIsDetailsOpen(false)} className="text-gray-400 hover:text-white transition"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="p-6">
              {/* BANNER DE ALERTA SI HAY UNA FALLA DE TIERRA O MALA CONEXIÓN */}
              {activeErrorCode !== 'NoError' && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-800/70 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="font-extrabold text-sm">Diagnóstico de Falla OCPP: {getReadableError(activeErrorCode)}</p>
                      <p className="text-[11px] opacity-85 mt-0.5">
                        El cargador reportó una anomalía eléctrica (ej. baja tensión / falla de tierra) o interrupción de comunicación con el vehículo.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SELECTOR MANGUERAS */}
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
                <span className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">Controlando:</span>
                
                {selectedCharger.connectors && selectedCharger.connectors.length > 0 ? (
                  selectedCharger.connectors.map(con => {
                    const connectorRealStatus = selectedCharger.status === 'fuera_de_linea' ? 'fuera_de_linea' : con.status;
                    return (
                      <button 
                        key={con.id}
                        onClick={() => setActiveConnector(con.connector_id)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                          activeConnector === con.connector_id 
                            ? 'bg-sipar-orange text-white shadow-md' 
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          connectorRealStatus === 'en_uso' ? 'bg-blue-500' : 
                          connectorRealStatus === 'conectado' ? 'bg-amber-500' :
                          connectorRealStatus === 'falla' ? 'bg-orange-500' :
                          connectorRealStatus === 'fuera_de_linea' ? 'bg-red-500' : 
                          'bg-green-500'
                        }`}></div>
                        Manguera {con.connector_id}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-sm text-gray-400 italic bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                    Esperando a que el cargador reporte sus mangueras...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-8">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    Máquina Física
                  </h3>
                  <ul className="space-y-3 text-sm">
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Estado Manguera {activeConnector}:</span> 
                      <span className={`font-bold ${
                        displayStatus === 'disponible' ? 'text-green-600 dark:text-green-400' : 
                        displayStatus === 'conectado' ? 'text-amber-500 dark:text-amber-400' :
                        displayStatus === 'en_uso' ? 'text-blue-600 dark:text-blue-400' : 
                        displayStatus === 'falla' ? 'text-orange-500 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {displayStatus === 'disponible' ? 'Disponible (Libre)' : 
                         displayStatus === 'conectado' ? 'Vehículo Conectado (0 A)' :
                         displayStatus === 'en_uso' ? 'Pasando Corriente (Cargando)' : 
                         displayStatus === 'falla' ? 'En Falla Técnica' : 'Fuera de Línea'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Código Error OCPP:</span> 
                      <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                        activeErrorCode !== 'NoError'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                      }`}>
                        {activeErrorCode}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Fabricante:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">{selectedCharger.vendor || 'Desconocido'}</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Modelo:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">
                        {selectedCharger.model ? `${selectedCharger.model} (${selectedCharger.power_kw}kW)` : 'Desconocido'}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Protocolo:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">OCPP 1.6J</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Último Heartbeat:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">
                        {selectedCharger.last_heartbeat 
                          ? new Date(selectedCharger.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : 'Sin conexión'}
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-sipar-orange uppercase tracking-wider mb-4">Sesión Manguera {activeConnector}</h3>
                  <div className="grid gap-3">
                    <button onClick={() => sendRemoteCommand('StartCharge')} disabled={isCommandSending !== ''} title="Fuerza inicio de energía." className="group w-full flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded-xl text-green-700 dark:text-green-400 font-semibold text-sm transition disabled:opacity-50">
                      <span className="flex items-center gap-2">{isCommandSending === 'StartCharge' ? <Loader2 className="w-4 h-4 text-green-500 animate-spin" /> : <Play className="w-4 h-4" />} Forzar Inicio</span>
                      <Info className="w-4 h-4 text-green-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                    <button onClick={() => sendRemoteCommand('StopCharge')} disabled={isCommandSending !== ''} title="Corta el suministro eléctrico." className="group w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 font-semibold text-sm transition disabled:opacity-50">
                      <span className="flex items-center gap-2">{isCommandSending === 'StopCharge' ? <Loader2 className="w-4 h-4 text-red-500 animate-spin" /> : <Square className="w-4 h-4" />} Forzar Fin de Carga</span>
                      <Info className="w-4 h-4 text-red-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                    <button onClick={() => sendRemoteCommand('Unlock')} disabled={isCommandSending !== ''} title="Retrae pin electromecánico." className="group w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl text-sipar-dark dark:text-white font-semibold text-sm transition disabled:opacity-50">
                      <span className="flex items-center gap-2">{isCommandSending === 'Unlock' ? <Loader2 className="w-4 h-4 text-sipar-orange animate-spin" /> : <Unlock className="w-4 h-4 text-gray-500 dark:text-gray-400" />} Desbloquear Manguera</span>
                      <Info className="w-4 h-4 text-gray-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Reinicio General (OCPP)</h3>
                  <div className="grid gap-3">
                    <button onClick={() => sendRemoteCommand('SoftReset')} disabled={isCommandSending !== ''} title="Reinicia el software." className="group w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl text-sipar-dark dark:text-white font-semibold text-sm transition disabled:opacity-50">
                      <span className="flex items-center gap-2">{isCommandSending === 'SoftReset' ? <Loader2 className="w-4 h-4 text-sipar-orange animate-spin" /> : <RotateCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />} Soft Reset (Software)</span>
                      <Info className="w-4 h-4 text-gray-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                    <button onClick={() => sendRemoteCommand('HardReset')} disabled={isCommandSending !== ''} title="Corta el suministro de energía." className="group w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 font-semibold text-sm transition disabled:opacity-50 mt-10">
                      <span className="flex items-center gap-2">{isCommandSending === 'HardReset' ? <Loader2 className="w-4 h-4 text-red-500 animate-spin" /> : <Power className="w-4 h-4" />} Hard Reset (Eléctrico)</span>
                      <Info className="w-4 h-4 text-red-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}