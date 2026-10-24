import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, Banknote, Zap, BatteryCharging, Activity, Users, MapPin, 
  Trophy, User, Leaf, Loader2, AlertTriangle, X, CheckCircle, AlertCircle, 
  RotateCw, Unlock, Power, Play, Square, Info, Landmark, ShieldAlert, Clock, ExternalLink
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, InfoWindowF, MarkerF } from '@react-google-maps/api';
import api from '../api/axios';

const mapContainerStyle = { width: '100%', height: '100%' };
const center = { lat: -25.270, lng: -57.520 };

const lightMapStyles = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
];

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1e232d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1e232d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a99ad" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3444" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a202c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c465a" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f141c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] }
];

const OCPP_ERROR_LABELS = {
  NoError: "Sin fallos reportados (Operación Normal)",
  ConnectorLockFailure: "Fallo en bloqueo electromecánico del conector",
  EVCommunicationError: "Fallo de comunicación CP con el vehículo eléctrico",
  GroundFailure: "Fallo de puesta a tierra (PE) detectado",
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

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoaded: isMapLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [data, setData] = useState({ kpis: null, chargers: [], transactions: [], topDrivers: [] });
  const [period, setPeriod] = useState('all'); // 'today' | 'month' | 'all'
  const [mapFilter, setMapFilter] = useState('all'); // 'all' | 'disponible' | 'active' | 'falla' | 'offline'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  const [isDarkMode, setIsDarkMode] = useState(() => 
    document.documentElement.classList.contains('dark') || localStorage.getItem('sipar_dark_mode') === 'true'
  );

  // Estados para el Modal de Diagnóstico OCPP
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeConnector, setActiveConnector] = useState(1);
  const [isCommandSending, setIsCommandSending] = useState('');
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const fetchAllData = async (signal) => {
    try {
      const [kpisRes, mapRes, txRes, driversRes] = await Promise.all([
        api.get(`/api/v1/dashboards/kpis?period=${period}`, { signal }),
        api.get('/api/v1/dashboards/map-chargers', { signal }),
        api.get('/api/v1/dashboards/recent-transactions?limit=8', { signal }),
        api.get(`/api/v1/dashboards/top-drivers?period=${period}`, { signal })
      ]);

      setData({
        kpis: kpisRes.data,
        chargers: mapRes.data,
        transactions: txRes.data,
        topDrivers: driversRes.data
      });
      setError(null);
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error("Error cargando Dashboard:", err);
        setError("No se pudo conectar con el servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAllData(controller.signal);
    const interval = setInterval(() => { fetchAllData(controller.signal); }, 5000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [period]);

  // Mantener actualizado el marcador seleccionado cuando cambian los datos en vivo
  useEffect(() => {
    if (selectedMarker && data.chargers.length > 0) {
      const updated = data.chargers.find(c => c.id === selectedMarker.id);
      if (updated) {
        setSelectedMarker(prev => ({
          ...updated,
          parsedLocation: prev?.parsedLocation || parseLocation(updated.location)
        }));
      }
    }
  }, [data.chargers]);

  const parseLocation = (loc) => {
    if (!loc) return null;
    let parsed = loc;
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { break; }
    }
    const lat = Number(parsed?.lat);
    const lng = Number(parsed?.lng);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng, address: parsed?.address || 'Estación SIPAR' };
  };

  // Marcador SVG personalizado con soporte para los 5 estados (Disponible, Conectado, Cargando, Falla, Offline)
  const getCustomMarkerIcon = (serial, status, lastErrorCode) => {
    const hasFault = status === 'falla' || (lastErrorCode && lastErrorCode !== 'NoError');
    const dotColor = hasFault
      ? '#f97316' // Naranja alerta para Falla Técnica (PE / CP)
      : status === 'disponible'
      ? '#22c55e' // Verde
      : status === 'conectado'
      ? '#eab308' // Ámbar (Preparing)
      : status === 'en_uso'
      ? '#3b82f6' // Azul (Charging)
      : '#ef4444'; // Rojo (Offline)

    const strokeColor = hasFault ? '#ef4444' : '#FF9E00';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="110" height="40" viewBox="0 0 110 40">
        <rect x="2" y="2" width="106" height="26" rx="6" fill="#1E232D" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="15" cy="15" r="4.5" fill="${dotColor}" />
        <text x="25" y="19" font-family="sans-serif" font-size="11.5" font-weight="bold" fill="white">${serial}</text>
        <polygon points="50,28 60,28 55,36" fill="${strokeColor}"/>
      </svg>
    `;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: window.google ? new window.google.maps.Size(110, 40) : null,
      anchor: window.google ? new window.google.maps.Point(55, 40) : null
    };
  };

  const filteredMapChargers = useMemo(() => {
    return data.chargers.filter(ch => {
      const hasFault = ch.status === 'falla' || (ch.last_error_code && ch.last_error_code !== 'NoError');
      if (mapFilter === 'disponible') return ch.status === 'disponible' && !hasFault;
      if (mapFilter === 'active') return ch.status === 'en_uso' || ch.status === 'conectado';
      if (mapFilter === 'falla') return hasFault;
      if (mapFilter === 'offline') return ch.status === 'fuera_de_linea';
      return true;
    });
  }, [data.chargers, mapFilter]);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification({ show: false, type: '', message: '' });
    }, 4000);
  };

  const openDetails = (charger) => {
    setSelectedMarker(charger);
    setActiveConnector(1);
    setIsDetailsOpen(true);
  };

  const sendRemoteCommand = async (commandType) => {
    if (!selectedMarker) return;
    setIsCommandSending(commandType);
    
    try {
      const token = localStorage.getItem('sipar_token');
      let endpoint = '';
      
      if (commandType === 'SoftReset') {
        endpoint = `/api/v1/ocpp/${selectedMarker.serial_number}/reset?tipo=Soft`;
      } else if (commandType === 'HardReset') {
        endpoint = `/api/v1/ocpp/${selectedMarker.serial_number}/reset?tipo=Hard`;
      } else if (commandType === 'Unlock') {
        endpoint = `/api/v1/ocpp/${selectedMarker.serial_number}/unlock?connector_id=${activeConnector}`;
      } else if (commandType === 'StartCharge') {
        endpoint = `/api/v1/ocpp/${selectedMarker.serial_number}/start?tag=ADMIN-OVERRIDE&connector_id=${activeConnector}`;
      } else if (commandType === 'StopCharge') {
        endpoint = `/api/v1/ocpp/${selectedMarker.serial_number}/stop?transaction_id=1&connector_id=${activeConnector}`;
      }

      const response = await api.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `El cargador respondió: "${response.data.respuesta_hardware || 'Comando aceptado'}"`);
      setTimeout(() => fetchAllData(), 800);
    } catch (error) {
      console.error("Error enviando comando:", error);
      showNotification('error', error.response?.data?.detail || 'El cargador no está conectado o rechazó la solicitud.');
    } finally {
      setIsCommandSending('');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  if (error || !data.kpis) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center bg-white dark:bg-sipar-dark rounded-[20px] shadow-sm border border-red-100 dark:border-red-900/40 p-10 m-8 transition-colors">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-sipar-dark dark:text-white mb-2">Error de Conexión</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{error || "No se recibieron datos del servidor."}</p>
      </div>
    );
  }

  const activeConnectorData = selectedMarker?.connectors?.find(c => c.connector_id === activeConnector);
  const displayStatus = selectedMarker?.status === 'fuera_de_linea' 
    ? 'fuera_de_linea' 
    : (activeConnectorData ? activeConnectorData.status : selectedMarker?.status);
  const activeErrorCode = activeConnectorData?.error_code && activeConnectorData.error_code !== 'NoError'
    ? activeConnectorData.error_code
    : (selectedMarker?.last_error_code || 'NoError');

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative space-y-6">

      {/* ================= NOTIFICACIÓN TOAST ================= */}
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

      {/* ================= BARRA SUPERIOR: FILTRO DE PERÍODO Y ACCESOS RÁPIDOS ================= */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-sipar-orange" /> Centro de Control & Telemetría en Vivo
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Monitoreo OCPP 1.6J en tiempo real, liquidación ANDE y rendimiento financiero de la red SIPAR.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-sipar-dark p-1.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          {[
            { id: 'all', label: 'Histórico Total' },
            { id: 'month', label: 'Este Mes' },
            { id: 'today', label: 'Hoy' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                period === tab.id
                  ? 'bg-sipar-orange text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-sipar-dark dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================= 4 TARJETAS KPI ENRIQUECIDAS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Facturación Neta, Costo ANDE y Margen */}
        <div
          onClick={() => navigate('/admin/finanzas')}
          className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 hover:border-sipar-orange/50 cursor-pointer flex items-center justify-between transition"
        >
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              Facturación Neta ({period === 'today' ? 'Hoy' : period === 'month' ? 'Mes' : 'Total'})
            </p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {Number(data.kpis.recaudacion_mes || 0).toLocaleString('es-PY')} ₲
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
              <span className="text-emerald-500 font-bold">
                Margen: {Number(data.kpis.margen_neto_sipar || 0).toLocaleString('es-PY')} ₲
              </span>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <span className="text-blue-500 font-semibold">
                ANDE: {Number(data.kpis.costo_ande_total || 0).toLocaleString('es-PY')} ₲
              </span>
            </div>
          </div>
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-500 border border-green-100 dark:border-green-800/40 shrink-0">
            <Banknote className="w-6 h-6" />
          </div>
        </div>
        
        {/* KPI 2: Energía Entregada & Sesiones */}
        <div
          onClick={() => navigate('/admin/historial')}
          className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 hover:border-sipar-orange/50 cursor-pointer flex items-center justify-between transition"
        >
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Energía Suministrada</p>
            <p className="text-[24px] font-extrabold text-sipar-orange tracking-tight mt-1">
              {Number(data.kpis.energia_entregada_kwh || 0).toLocaleString('es-PY')} kWh
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sipar-orange" />
              <span>{data.kpis.total_sesiones || 0} sesiones</span>
              {data.kpis.sesiones_con_alerta_ocpp > 0 && (
                <span className="text-red-500 font-bold">
                  ({data.kpis.sesiones_con_alerta_ocpp} con alerta)
                </span>
              )}
            </p>
          </div>
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex justify-center items-center text-sipar-orange border border-orange-100 dark:border-orange-800/40 shrink-0">
            <BatteryCharging className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Estado Operativo de Estaciones & Alertas */}
        <div
          onClick={() => navigate('/admin/cargadores')}
          className={`bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border cursor-pointer flex items-center justify-between transition ${
            data.kpis.estaciones_en_falla > 0
              ? 'border-orange-300 dark:border-orange-800/80'
              : 'border-gray-100 dark:border-gray-800 hover:border-sipar-orange/50'
          }`}
        >
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Salud de Estaciones OCPP</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {data.kpis.estaciones_online} <span className="text-sm font-normal text-gray-400">/ {data.kpis.estaciones_total} en línea</span>
            </p>
            <p className={`text-[11px] font-bold mt-1.5 flex items-center gap-1 ${
              data.kpis.estaciones_en_falla > 0 ? 'text-orange-500' : 'text-green-500'
            }`}>
              {data.kpis.estaciones_en_falla > 0 ? (
                <><AlertTriangle className="w-3.5 h-3.5" /> {data.kpis.estaciones_en_falla} estación(es) con falla OCPP</>
              ) : (
                <><CheckCircle className="w-3.5 h-3.5" /> Sin fallas de tierra o CP activas</>
              )}
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex justify-center items-center text-blue-500 border border-blue-100 dark:border-blue-800/40 shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Impacto Ecológico & Usuarios */}
        <div
          onClick={() => navigate('/admin/usuarios')}
          className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 hover:border-sipar-orange/50 cursor-pointer flex items-center justify-between transition"
        >
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Impacto & Comunidad</p>
            <p className="text-[24px] font-extrabold text-green-600 dark:text-green-400 tracking-tight mt-1">
              {Number(data.kpis.co2_ahorrado_kg || 0).toLocaleString('es-PY')} kg <span className="text-xs font-bold">CO₂</span>
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-gray-400" /> {data.kpis.usuarios_activos} usuarios activos
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800/40 shrink-0">
            <Leaf className="w-6 h-6" />
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ================= MAPA DE GOOGLE EN VIVO ================= */}
        <div className="lg:col-span-2 bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col h-[650px] transition-colors">
          <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex flex-wrap justify-between items-center gap-3 z-10 transition-colors">
            <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sipar-orange" /> Mapa de Red en Vivo ({filteredMapChargers.length})
            </h2>

            {/* Píldoras de Filtro de Estado en el Mapa */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Todas', dot: null },
                { id: 'disponible', label: 'Disponible', dot: 'bg-green-500' },
                { id: 'active', label: 'Conectado / Cargando', dot: 'bg-blue-500' },
                { id: 'falla', label: 'En Falla', dot: 'bg-orange-500' },
                { id: 'offline', label: 'Offline', dot: 'bg-red-500' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setMapFilter(f.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition border ${
                    mapFilter === f.id
                      ? 'bg-sipar-dark dark:bg-white text-white dark:text-sipar-dark border-transparent'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-sipar-orange'
                  }`}
                >
                  {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`}></span>}
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="w-full flex-1 bg-gray-100 dark:bg-gray-900 relative">
            {isMapLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={12}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  styles: isDarkMode ? darkMapStyles : lightMapStyles
                }}
                onClick={() => setSelectedMarker(null)}
              >
                {filteredMapChargers.map(charger => {
                  const locationData = parseLocation(charger.location);
                  if (!locationData) return null;

                  return (
                    <MarkerF
                      key={`marker-${charger.id}`}
                      position={{ lat: locationData.lat, lng: locationData.lng }}
                      onClick={() => setSelectedMarker({ ...charger, parsedLocation: locationData })}
                      icon={getCustomMarkerIcon(charger.serial_number, charger.status, charger.last_error_code)}
                    />
                  );
                })}

                {/* VENTANA EMERGENTE AL HACER CLIC EN UN CARGADOR */}
                {selectedMarker && !isDetailsOpen && selectedMarker.parsedLocation && (
                  <InfoWindowF
                    position={{ lat: selectedMarker.parsedLocation.lat, lng: selectedMarker.parsedLocation.lng }}
                    onCloseClick={() => setSelectedMarker(null)}
                    options={{ pixelOffset: new window.google.maps.Size(0, -42) }}
                  >
                    <div className="p-2 min-w-[235px]">
                      <div className="flex items-center gap-3 mb-2.5 pb-2.5 border-b border-gray-100">
                        <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center text-sipar-orange shrink-0">
                          <Zap className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-gray-900 leading-tight">
                            {selectedMarker.parsedLocation.address}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {selectedMarker.serial_number} • {selectedMarker.power_kw} kW
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 font-semibold">Estado OCPP:</span>
                          <span className={`font-bold flex items-center gap-1 ${
                              selectedMarker.status === 'disponible' ? 'text-green-600' : 
                              selectedMarker.status === 'conectado' ? 'text-amber-600' :
                              selectedMarker.status === 'en_uso' ? 'text-blue-600' :
                              selectedMarker.status === 'falla' ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {selectedMarker.status === 'disponible' ? 'Disponible' :
                             selectedMarker.status === 'conectado' ? 'Auto Conectado' :
                             selectedMarker.status === 'en_uso' ? 'Cargando' :
                             selectedMarker.status === 'falla' ? 'En Falla Técnica' : 'Fuera de Línea'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 font-semibold">Tarifa Activa:</span>
                          <span className="font-bold text-gray-800">
                            {Number(selectedMarker.price_kwh || 2500).toLocaleString('es-PY')} ₲/kWh
                          </span>
                        </div>

                        {selectedMarker.last_error_code && selectedMarker.last_error_code !== 'NoError' && (
                          <div className="p-1.5 rounded bg-red-50 text-red-600 text-[10px] font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> {selectedMarker.last_error_code}
                          </div>
                        )}

                        <button 
                          onClick={() => openDetails(selectedMarker)}
                          className="mt-2 w-full bg-gray-900 text-white text-[11px] font-bold py-2 rounded-lg hover:bg-gray-800 transition"
                        >
                          Abrir Panel de Control OCPP
                        </button>
                      </div>
                    </div>
                  </InfoWindowF>
                )}
              </GoogleMap>
            ) : (
              <div className="w-full h-full flex justify-center items-center">
                <Loader2 className="w-8 h-8 text-sipar-orange animate-spin" />
              </div>
            )}
            
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-sipar-dark/95 backdrop-blur border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg shadow-sm text-[11px] font-bold text-gray-600 dark:text-gray-300 z-10 flex items-center gap-2">
               <span>Estaciones en mapa: {filteredMapChargers.length}</span>
            </div>
          </div>
        </div>

        {/* ================= COLUMNA DERECHA ================= */}
        <div className="flex flex-col gap-6 h-[650px]">
          
          {/* Top Conductores */}
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex flex-col flex-1 min-h-0 transition-colors">
            <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex justify-between items-center flex-shrink-0 rounded-t-[20px]">
              <h2 className="text-[14px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" /> Top Conductores
              </h2>
              <button
                onClick={() => navigate('/admin/usuarios')}
                className="text-[11px] font-bold text-sipar-orange hover:underline flex items-center gap-0.5"
              >
                Ver todos <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="px-6 py-3 flex-1 overflow-y-auto hide-scroll divide-y divide-gray-50 dark:divide-gray-800">
              {data.topDrivers.length > 0 ? data.topDrivers.map((driver, index) => (
                <div key={index} className="flex justify-between items-center py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold border shrink-0 ${
                      index === 0 
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[12px] text-sipar-dark dark:text-white truncate">{driver.user_name}</p>
                      <p className="text-[10px] text-gray-400">
                        {driver.sessions_count} recarga(s) • {Number(driver.total_spent_pyg || 0).toLocaleString('es-PY')} ₲
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-sipar-orange text-[13px]">{driver.total_kwh} kWh</p>
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1 justify-end">
                      <Leaf className="w-3 h-3" /> {driver.co2_saved_kg} kg CO₂
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">Sin consumos en este período</p>
              )}
            </div>
          </div>

          {/* Últimas Recargas y Estado OCPP */}
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex flex-col flex-1 min-h-0 transition-colors">
            <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex justify-between items-center flex-shrink-0 rounded-t-[20px]">
              <h2 className="text-[14px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-sipar-orange" /> Actividad Reciente OCPP
              </h2>
              <button
                onClick={() => navigate('/admin/historial')}
                className="text-[11px] font-bold text-sipar-orange hover:underline flex items-center gap-0.5"
              >
                Historial <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="px-6 py-3 flex-1 overflow-y-auto hide-scroll divide-y divide-gray-50 dark:divide-gray-800">
              {data.transactions.length > 0 ? data.transactions.map((tx) => {
                const hasFault = tx.error_code && tx.error_code !== 'NoError';
                return (
                  <div key={tx.id} className="flex justify-between items-center py-3">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[12px] text-sipar-dark dark:text-white truncate">{tx.user_name}</span>
                        <span className="text-[10px] font-mono text-gray-400">#{tx.id}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-sipar-orange shrink-0" />
                        <span>{tx.charger_serial}</span>
                        {hasFault && (
                          <span className="text-red-500 font-bold truncate max-w-[120px]" title={tx.error_code}>
                            • {tx.error_code.split(' ')[0]}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-green-600 dark:text-green-400 text-[12px]">
                        + {Number(tx.amount_pyg || 0).toLocaleString('es-PY')} ₲
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {tx.kwh} kWh • ANDE: {Number(tx.ande_cost_pyg || 0).toLocaleString('es-PY')} ₲
                      </p>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">Sin transacciones recientes</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ================= MODAL DE DETALLES Y CONTROL OCPP EN VIVO ================= */}
      {isDetailsOpen && selectedMarker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] transition-colors">
            
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-sipar-dark text-white">
              <div className="flex items-center gap-3">
                <div className="bg-gray-800 p-2 rounded-lg">
                  <BatteryCharging className="w-5 h-5 text-sipar-orange" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Estación SIPAR</h2>
                  <p className="text-xs text-gray-400 font-mono">ID: {selectedMarker.serial_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setIsDetailsOpen(false); navigate('/admin/historial'); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-sipar-orange border border-gray-700 flex items-center gap-1.5 transition"
                >
                  <Clock className="w-3.5 h-3.5" /> Ver Historial & ANDE
                </button>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                  selectedMarker.status === 'disponible' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  selectedMarker.status === 'conectado' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  selectedMarker.status === 'en_uso' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                  selectedMarker.status === 'falla' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    selectedMarker.status === 'disponible' ? 'bg-green-400' :
                    selectedMarker.status === 'conectado' ? 'bg-amber-400' :
                    selectedMarker.status === 'en_uso' ? 'bg-blue-400' :
                    selectedMarker.status === 'falla' ? 'bg-orange-400' : 'bg-red-400'
                  }`}></div> 
                  {selectedMarker.status === 'disponible' ? 'En línea (Libre)' :
                   selectedMarker.status === 'conectado' ? 'Auto Conectado' :
                   selectedMarker.status === 'en_uso' ? 'Cargando' :
                   selectedMarker.status === 'falla' ? 'Falla Detectada' : 'Desconectado'}
                </span>
                <button onClick={() => setIsDetailsOpen(false)} className="text-gray-400 hover:text-white transition"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="p-6">
              {activeErrorCode !== 'NoError' && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-800/70 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="font-extrabold text-sm">Diagnóstico de Falla OCPP: {getReadableError(activeErrorCode)}</p>
                      <p className="text-[11px] opacity-85 mt-0.5">
                        El cargador reportó una anomalía eléctrica (puesta a tierra PE) o interrupción de comunicación CP con el vehículo.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
                <span className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">Controlando:</span>
                
                {selectedMarker.connectors && selectedMarker.connectors.length > 0 ? (
                  selectedMarker.connectors.map(con => {
                    const connectorRealStatus = selectedMarker.status === 'fuera_de_linea' ? 'fuera_de_linea' : con.status;
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Máquina Física</h3>
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
                         displayStatus === 'conectado' ? 'Vehículo Conectado' :
                         displayStatus === 'en_uso' ? 'Cargando Vehículo' :
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
                      <span className="text-gray-500 dark:text-gray-400">Tarifa Asignada:</span> 
                      <span className="font-bold text-sipar-orange">
                        {Number(selectedMarker.price_kwh || 2500).toLocaleString('es-PY')} ₲/kWh
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Fabricante / Modelo:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">
                        {selectedMarker.vendor || 'WGD'} {selectedMarker.model ? `• ${selectedMarker.model}` : ''}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Último Heartbeat:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">
                        {selectedMarker.last_heartbeat 
                          ? new Date(selectedMarker.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : 'Sin conexión'}
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-sipar-orange uppercase tracking-wider mb-4">Sesión Manguera {activeConnector}</h3>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => sendRemoteCommand('StartCharge')}
                      disabled={isCommandSending !== ''}
                      className="group w-full flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded-xl text-green-700 dark:text-green-400 font-semibold text-sm transition disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        {isCommandSending === 'StartCharge' ? <Loader2 className="w-4 h-4 text-green-500 animate-spin" /> : <Play className="w-4 h-4" />} 
                        Forzar Inicio
                      </span>
                      <Info className="w-4 h-4 text-green-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>

                    <button 
                      onClick={() => sendRemoteCommand('StopCharge')}
                      disabled={isCommandSending !== ''}
                      className="group w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 font-semibold text-sm transition disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        {isCommandSending === 'StopCharge' ? <Loader2 className="w-4 h-4 text-red-500 animate-spin" /> : <Square className="w-4 h-4" />} 
                        Forzar Fin de Carga
                      </span>
                      <Info className="w-4 h-4 text-red-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                    
                    <button 
                      onClick={() => sendRemoteCommand('Unlock')}
                      disabled={isCommandSending !== ''}
                      className="group w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl text-sipar-dark dark:text-white font-semibold text-sm transition disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        {isCommandSending === 'Unlock' ? <Loader2 className="w-4 h-4 text-sipar-orange animate-spin" /> : <Unlock className="w-4 h-4 text-gray-500 dark:text-gray-400" />} 
                        Desbloquear Manguera
                      </span>
                      <Info className="w-4 h-4 text-gray-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Reinicio General (OCPP)</h3>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => sendRemoteCommand('SoftReset')} 
                      disabled={isCommandSending !== ''}
                      className="group w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl text-sipar-dark dark:text-white font-semibold text-sm transition disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        {isCommandSending === 'SoftReset' ? <Loader2 className="w-4 h-4 text-sipar-orange animate-spin" /> : <RotateCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />} 
                        Soft Reset (Software)
                      </span>
                      <Info className="w-4 h-4 text-gray-400 opacity-50 group-hover:opacity-100 transition" />
                    </button>

                    <button 
                      onClick={() => sendRemoteCommand('HardReset')}
                      disabled={isCommandSending !== ''}
                      className="group w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 font-semibold text-sm transition disabled:opacity-50 mt-10"
                    >
                      <span className="flex items-center gap-2">
                        {isCommandSending === 'HardReset' ? <Loader2 className="w-4 h-4 text-red-500 animate-spin" /> : <Power className="w-4 h-4" />} 
                        Hard Reset (Eléctrico)
                      </span>
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