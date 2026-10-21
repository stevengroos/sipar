import { useState, useEffect, useMemo } from 'react';
import { 
  Zap, Plus, MapPin, Loader2, Activity, X, AlertCircle, 
  BatteryCharging, RotateCw, Unlock, Power, Eye, Search, PlusCircle,
  Play, Square, Map, Info, CheckCircle, Edit, Trash2, AlertTriangle
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import api from '../api/axios';

const mapContainerStyle = { width: '100%', height: '250px', borderRadius: '12px' };
const defaultCenter = { lat: -25.270, lng: -57.520 };

export default function Chargers() {
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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

  const filteredChargers = useMemo(() => {
    if (!searchTerm) return chargers;
    const lowerTerm = searchTerm.toLowerCase();
    return chargers.filter(c => 
      c.serial_number.toLowerCase().includes(lowerTerm) ||
      (c.location && typeof c.location === 'object' && c.location.address && c.location.address.toLowerCase().includes(lowerTerm)) ||
      (c.location && typeof c.location === 'string' && c.location.toLowerCase().includes(lowerTerm))
    );
  }, [chargers, searchTerm]);

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestiona la infraestructura de carga y su estado operativo.</p>
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
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-sipar-orange" /> Inventario de Estaciones
          </h2>
          <div className="flex items-center gap-4">
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

        <div className="p-0 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                <th className="p-4 pl-6">ID / Serie</th>
                <th className="p-4">Potencia</th>
                <th className="p-4">Ubicación</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {filteredChargers.length > 0 ? (
                filteredChargers.map((charger) => {
                  let displayAddress = 'Sin dirección';
                  if (charger.location) {
                    if (typeof charger.location === 'string') {
                      try { displayAddress = JSON.parse(charger.location).address; } catch(e){}
                    } else if (charger.location.address) {
                      displayAddress = charger.location.address;
                    }
                  }

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
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 ${
                            charger.status === 'disponible' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            charger.status === 'en_uso' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                              charger.status === 'disponible' ? 'bg-green-500' :
                              charger.status === 'en_uso' ? 'bg-blue-500' : 'bg-red-500'
                          }`}></div> 
                          {charger.status === 'disponible' ? 'Disponible' : charger.status === 'en_uso' ? 'En Uso' : 'Fuera de Línea'}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-6 flex justify-end gap-2">
                        <button onClick={() => openDetails(charger)} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-dark dark:hover:text-white shadow-sm transition" title="Ver Diagnóstico">
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
      </div>

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

                  {/* CONFIGURACIÓN DE COSTO ANDE (LIQUIDACIÓN PROPIETARIO) - DENTRO DEL FORMULARIO */}
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
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                  selectedCharger.status === 'disponible' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  selectedCharger.status === 'en_uso' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    selectedCharger.status === 'disponible' ? 'bg-green-400' :
                    selectedCharger.status === 'en_uso' ? 'bg-blue-400' : 'bg-red-400'
                  }`}></div> 
                  {selectedCharger.status === 'disponible' ? 'En línea' : selectedCharger.status === 'en_uso' ? 'En Uso' : 'Desconectado'}
                </span>
                <button onClick={() => setIsDetailsOpen(false)} className="text-gray-400 hover:text-white transition"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="p-6">
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
                        displayStatus === 'en_uso' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {displayStatus === 'disponible' ? 'Disponible' : 
                         displayStatus === 'en_uso' ? 'Cargando Vehículo' : 'Fuera de Línea'}
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