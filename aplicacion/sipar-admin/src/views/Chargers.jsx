import { useState, useEffect, useMemo } from 'react';
import { 
  Zap, Plus, MapPin, Loader2, X, AlertCircle, 
  BatteryCharging, RotateCw, Unlock, Power, Eye, Search, PlusCircle,
  Play, Square, Map, Info, CheckCircle, Edit, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, Clock, Download, FileSpreadsheet, Home
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import api from '../api/axios';

const mapContainerStyle = { width: '100%', height: '220px', borderRadius: '12px' };
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
  const [usersList, setUsersList] = useState([]); // <--- NUEVO: Para seleccionar el propietario residencial
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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
    is_private: false, owner_user_id: '', // <--- NUEVOS CAMPOS: Cargador Privado / Residencial
    ande_tension_type: 'baja', ande_cost_off_peak: '', ande_cost_peak: '', ande_peak_start: '18:00', ande_peak_end: '21:00'
  });

  const fetchChargers = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [chargersRes, usersRes] = await Promise.all([
        api.get('/api/v1/chargers/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/users/', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      setChargers(chargersRes.data);
      setUsersList(usersRes.data);
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

  useEffect(() => {
    setChargerPage(1);
  }, [searchTerm, chargerPageSize]);

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
        is_private: formData.is_private, // <--- NUEVO
        owner_user_id: formData.is_private && formData.owner_user_id ? parseInt(formData.owner_user_id) : null, // <--- NUEVO
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
      fetchChargers();
    } catch (err) {
      setError(err.response?.data?.detail || "Error al procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (charger) => {
    let lat = '', lng = '', address = '';
    if (charger.location) {
      let parsed = charger.location;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(e){} }
      lat = parsed.lat || '';
      lng = parsed.lng || '';
      address = parsed.address || '';
    }

    setFormData({
      id: charger.id,
      serial_number: charger.serial_number,
      power_kw: charger.power_kw,
      address, lat, lng,
      is_private: Boolean(charger.is_private), // <--- NUEVO
      owner_user_id: charger.owner_user_id || '', // <--- NUEVO
      ande_tension_type: charger.ande_tension_type || 'baja',
      ande_cost_off_peak: charger.ande_cost_off_peak ?? '',
      ande_cost_peak: charger.ande_cost_peak ?? '',
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
      fetchChargers();
    } catch (err) {
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
      if (commandType === 'SoftReset') endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/reset?tipo=Soft`;
      else if (commandType === 'HardReset') endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/reset?tipo=Hard`;
      else if (commandType === 'Unlock') endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/unlock?connector_id=${activeConnector}`;
      else if (commandType === 'StartCharge') endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/start?tag=ADMIN-OVERRIDE&connector_id=${activeConnector}`;
      else if (commandType === 'StopCharge') endpoint = `/api/v1/ocpp/${selectedCharger.serial_number}/stop?transaction_id=1&connector_id=${activeConnector}`;

      const response = await api.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `El cargador respondió: "${response.data.respuesta_hardware || 'Comando aceptado'}"`);
      setTimeout(() => fetchChargers(), 800);
    } catch (error) {
      showNotification('error', error.response?.data?.detail || 'El cargador no está conectado.');
    } finally {
      setIsCommandSending('');
    }
  };

  const filteredChargers = useMemo(() => {
    if (!searchTerm) return chargers;
    const lowerTerm = searchTerm.toLowerCase();
    return chargers.filter(c => 
      c.serial_number.toLowerCase().includes(lowerTerm) ||
      (c.location && typeof c.location === 'object' && c.location.address && c.location.address.toLowerCase().includes(lowerTerm))
    );
  }, [chargers, searchTerm]);

  const totalChargerPages = Math.max(1, Math.ceil(filteredChargers.length / chargerPageSize));
  const safeChargerPage = Math.min(chargerPage, totalChargerPages);
  const paginatedChargers = filteredChargers.slice((safeChargerPage - 1) * chargerPageSize, safeChargerPage * chargerPageSize);

  const filteredHistoryTxs = useMemo(() => {
    if (!historySearch) return chargerTransactions;
    const lower = historySearch.toLowerCase();
    return chargerTransactions.filter(tx =>
      tx.id.toString().includes(lower) || tx.user_name.toLowerCase().includes(lower)
    );
  }, [chargerTransactions, historySearch]);

  const historySummary = useMemo(() => {
    let kwh = 0, revenue = 0, andeCost = 0, durationSec = 0;
    filteredHistoryTxs.forEach(tx => {
      kwh += Number(tx.kwh_delivered || 0);
      revenue += Number(tx.total_amount_pyg || 0);
      andeCost += Number(tx.ande_energy_cost_pyg || 0);
      durationSec += Number(tx.duration_seconds || 0);
    });
    return { count: filteredHistoryTxs.length, kwh: Number(kwh.toFixed(2)), revenue: Math.round(revenue), andeCost: Math.round(andeCost), netMargin: Math.round(revenue - andeCost), durationSec };
  }, [filteredHistoryTxs]);

  const exportChargerHistoryToCSV = () => {
    if (!historyCharger || filteredHistoryTxs.length === 0) return;
    const headers = ["ID Transaccion", "Estado", "Estacion", "Potencia (kW)", "Usuario", "Energia (kWh)", "Total Cobrado (Gs)"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = filteredHistoryTxs.map(tx => [tx.id, tx.status, tx.charger_serial, tx.charger_power_kw, tx.user_name, tx.kwh_delivered, tx.total_amount_pyg].map(escapeCsv).join(','));
    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Historial_${historyCharger.serial_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 text-sipar-orange animate-spin" /></div>;

  const activeConnectorData = selectedCharger?.connectors?.find(c => c.connector_id === activeConnector);
  const displayStatus = selectedCharger?.status === 'fuera_de_linea' ? 'fuera_de_linea' : (activeConnectorData ? activeConnectorData.status : selectedCharger?.status);
  const activeErrorCode = activeConnectorData?.error_code && activeConnectorData.error_code !== 'NoError' ? activeConnectorData.error_code : (selectedCharger?.last_error_code || 'NoError');

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border ${notification.type === 'success' ? 'bg-white border-green-200 text-green-700' : 'bg-white border-red-200 text-red-700'}`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
          <div><p className="font-bold text-sm">{notification.message}</p></div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-sipar-orange" /> Red de Cargadores
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestiona la infraestructura de carga pública y residenciales privados.</p>
        </div>
        <button 
          onClick={() => { 
            setIsEditMode(false); 
            setFormData({
              id: null, serial_number: '', power_kw: '', address: '', lat: '', lng: '',
              is_private: false, owner_user_id: '',
              ande_tension_type: 'baja', ande_cost_off_peak: '', ande_cost_peak: '', ande_peak_start: '18:00', ande_peak_end: '21:00'
            }); 
            setIsModalOpen(true); 
          }} 
          className="flex items-center gap-2 bg-sipar-orange text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition shadow-sm"
        >
          <PlusCircle className="w-4 h-4" /> Nuevo Cargador
        </button>
      </div>

      <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-sipar-orange" /> Inventario de Estaciones ({filteredChargers.length})
          </h2>
          <div className="flex items-center gap-3">
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar ID o ubicación..." 
                className="bg-transparent border-none text-sm text-white focus:outline-none w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="p-4 pl-6">ID / Serie</th>
                <th className="p-4">Tipo & Propietario</th>
                <th className="p-4">Potencia</th>
                <th className="p-4">Ubicación</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {paginatedChargers.map((charger) => {
                const address = charger.location?.address || 'Sin dirección';
                return (
                  <tr key={charger.id} className="hover:bg-gray-50/50 transition">
                    <td className="p-4 pl-6 font-bold text-sipar-dark dark:text-white">
                      {charger.serial_number}
                    </td>
                    <td className="p-4">
                      {charger.is_private ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1 w-max">
                          <Home className="w-3 h-3" /> Residencial Privado
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 w-max">
                          Público / Red SIPAR
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-gray-700 dark:text-gray-300">{charger.power_kw} kW</td>
                    <td className="p-4 text-gray-600 dark:text-gray-400 text-xs max-w-[200px] truncate">{address}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${charger.status === 'disponible' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {charger.status}
                      </span>
                    </td>
                    <td className="p-4 text-right pr-6 flex justify-end gap-2">
                      <button onClick={() => openChargerHistoryModal(charger)} className="px-2.5 py-1.5 bg-orange-50 border border-orange-200 text-sipar-orange rounded-lg text-xs font-bold hover:bg-sipar-orange hover:text-white transition flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Historial
                      </button>
                      <button onClick={() => openDetails(charger)} className="p-1.5 bg-white dark:bg-gray-800 border rounded-lg text-gray-500 hover:text-white">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleEditClick(charger)} className="p-1.5 bg-white dark:bg-gray-800 border rounded-lg text-gray-500 hover:text-blue-600">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setChargerToDelete(charger); setIsDeleteModalOpen(true); }} className="p-1.5 bg-white dark:bg-gray-800 border rounded-lg text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-[24px] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-800">
              <h3 className="font-bold text-lg text-sipar-dark dark:text-white">
                {isEditMode ? 'Editar Equipo' : 'Registrar Equipo'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <div className="overflow-y-auto max-h-[85vh]">
              <form onSubmit={handleSubmitCharger} className="p-6 space-y-4">
                {error && <div className="bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID del Cargador</label>
                    <input type="text" required value={formData.serial_number} onChange={e => setFormData({...formData, serial_number: e.target.value})} className="w-full border rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-900 text-sipar-dark dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Potencia (kW)</label>
                    <input type="number" step="0.1" required value={formData.power_kw} onChange={e => setFormData({...formData, power_kw: e.target.value})} className="w-full border rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-900 text-sipar-dark dark:text-white" />
                  </div>
                </div>

                {/* --- NUEVO: CONFIGURACIÓN DE CARGADOR PRIVADO / RESIDENCIAL --- */}
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.is_private} 
                      onChange={e => setFormData({...formData, is_private: e.target.checked})}
                      className="w-4 h-4 text-sipar-orange rounded accent-sipar-orange" 
                    />
                    <div>
                      <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                        <Home className="w-3.5 h-3.5" /> Cargador Residencial / Privado
                      </span>
                      <p className="text-[11px] text-gray-500">Oculto en el mapa público. Solo visible para su propietario y administradores.</p>
                    </div>
                  </label>

                  {formData.is_private && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Propietario del Cargador (Usuario)</label>
                      <select 
                        value={formData.owner_user_id} 
                        onChange={e => setFormData({...formData, owner_user_id: e.target.value})}
                        className="w-full border rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 text-sipar-dark dark:text-white font-bold"
                      >
                        <option value="">Selecciona el usuario propietario...</option>
                        {usersList.map(u => (
                          <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Dirección</label>
                  <input type="text" required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-900 text-sipar-dark dark:text-white" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ubicación GPS (Clic en el mapa)</label>
                  <div className="border rounded-xl overflow-hidden">
                    {isMapLoaded && (
                      <GoogleMap mapContainerStyle={mapContainerStyle} center={formData.lat ? { lat: Number(formData.lat), lng: Number(formData.lng) } : defaultCenter} zoom={13} onClick={handleMapClick}>
                        {formData.lat && <MarkerF position={{ lat: Number(formData.lat), lng: Number(formData.lng) }} />}
                      </GoogleMap>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-xs font-bold text-sipar-orange uppercase mb-3">Parámetros de Costo ANDE</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 mb-1">Tipo de Tensión</label>
                      <select value={formData.ande_tension_type} onChange={e => setFormData({...formData, ande_tension_type: e.target.value})} className="w-full border rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 text-sipar-dark dark:text-white">
                        <option value="baja">Baja Tensión</option>
                        <option value="media">Media Tensión</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 mb-1">Costo de Energía (₲/kWh)</label>
                      <input type="number" value={formData.ande_cost_off_peak} onChange={e => setFormData({...formData, ande_cost_off_peak: e.target.value})} className="w-full border rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 text-sipar-dark dark:text-white" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-bold text-gray-600">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-sipar-orange text-white rounded-xl text-xs font-bold">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL POR CARGADOR */}
      {isHistoryModalOpen && historyCharger && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 max-h-[92vh]">
            <div className="px-6 py-5 border-b border-gray-800 flex justify-between items-center bg-sipar-dark text-white">
              <h2 className="text-lg font-bold">Historial de Recargas — {historyCharger.serial_number}</h2>
              <div className="flex items-center gap-3">
                <button onClick={exportChargerHistoryToCSV} className="bg-sipar-orange text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
                <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Sesiones</p>
                  <p className="text-lg font-extrabold text-sipar-dark dark:text-white mt-1">{historySummary.count}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Energía</p>
                  <p className="text-lg font-extrabold text-sipar-orange mt-1">{historySummary.kwh} kWh</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Costo ANDE</p>
                  <p className="text-lg font-extrabold text-blue-500 mt-1">{historySummary.andeCost.toLocaleString('es-PY')} ₲</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Total Cobrado</p>
                  <p className="text-lg font-extrabold text-green-500 mt-1">{historySummary.revenue.toLocaleString('es-PY')} ₲</p>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Energía</th>
                      <th className="p-3">Cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedHistoryTxs.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="p-3 font-bold">#{tx.id}</td>
                        <td className="p-3">{new Date(tx.start_time).toLocaleString('es-PY')}</td>
                        <td className="p-3">{tx.user_name}</td>
                        <td className="p-3 font-bold text-sipar-orange">{tx.kwh_delivered} kWh</td>
                        <td className="p-3 font-bold text-green-600">{Number(tx.total_amount_pyg).toLocaleString('es-PY')} ₲</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALLES OCPP */}
      {isDetailsOpen && selectedCharger && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-5 border-b flex justify-between items-center bg-sipar-dark text-white">
              <h2 className="text-lg font-bold">Control OCPP — {selectedCharger.serial_number}</h2>
              <button onClick={() => setIsDetailsOpen(false)}><X className="w-6 h-6 text-gray-400 hover:text-white" /></button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Estado Físico</h3>
                <p className="text-sm font-bold">Estado: <span className="text-green-500">{displayStatus}</span></p>
                <p className="text-sm font-bold mt-1">Error: <span className="text-red-500">{activeErrorCode}</span></p>
              </div>
              <div className="col-span-2 space-y-3">
                <h3 className="text-xs font-bold text-sipar-orange uppercase mb-3">Comandos Remotos</h3>
                <button onClick={() => sendRemoteCommand('StartCharge')} className="w-full py-2.5 bg-green-50 text-green-700 font-bold rounded-xl border border-green-200 text-xs">Forzar Inicio de Carga</button>
                <button onClick={() => sendRemoteCommand('StopCharge')} className="w-full py-2.5 bg-red-50 text-red-600 font-bold rounded-xl border border-red-200 text-xs">Forzar Fin de Carga</button>
                <button onClick={() => sendRemoteCommand('SoftReset')} className="w-full py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl border text-xs">Soft Reset (Reiniciar Software)</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}