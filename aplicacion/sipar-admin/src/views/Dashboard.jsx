import { useState, useEffect } from 'react';
import { 
  TrendingUp, Banknote, Zap, BatteryCharging, Activity, Users, MapPin, 
  Trophy, User, Leaf, Loader2, AlertTriangle, X, CheckCircle, AlertCircle, 
  RotateCw, Unlock, Power, Play, Square, Info 
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

export default function Dashboard() {
  const { isLoaded: isMapLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [data, setData] = useState({ kpis: null, chargers: [], transactions: [], topDrivers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  // Detectar si el Modo Oscuro está activo para cambiar también el estilo del mapa
  const [isDarkMode, setIsDarkMode] = useState(() => 
    document.documentElement.classList.contains('dark') || localStorage.getItem('sipar_dark_mode') === 'true'
  );

  // Estados para el Modal de Diagnóstico
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
        api.get('/api/v1/dashboards/kpis', { signal }),
        api.get('/api/v1/dashboards/map-chargers', { signal }),
        api.get('/api/v1/dashboards/recent-transactions', { signal }),
        api.get('/api/v1/dashboards/top-drivers', { signal })
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
  }, []);

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

  const getCustomMarkerIcon = (serial, status) => {
    const dotColor = status === 'disponible' ? '#22c55e' : status === 'en_uso' ? '#3b82f6' : '#ef4444';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40">
        <rect x="2" y="2" width="96" height="26" rx="6" fill="#1E232D" stroke="#FF9E00" stroke-width="2"/>
        <circle cx="16" cy="15" r="4" fill="${dotColor}" />
        <text x="26" y="19" font-family="sans-serif" font-size="12" font-weight="bold" fill="white">${serial}</text>
        <polygon points="45,28 55,28 50,36" fill="#FF9E00"/>
      </svg>
    `;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: window.google ? new window.google.maps.Size(100, 40) : null,
      anchor: window.google ? new window.google.maps.Point(50, 40) : null
    };
  };

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

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">

      {/* ================= NOTIFICACIÓN TOAST (Flotante) ================= */}
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

      {/* ================= TARJETAS KPI ================= */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Recaudación (Mes)</p>
            <p className="text-[26px] font-bold text-sipar-dark dark:text-white tracking-tight">
              {data.kpis.recaudacion_mes.toLocaleString('es-PY')} ₲
            </p>
            <p className="text-[11px] text-green-500 font-bold mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Transacciones reales</p>
          </div>
          <div className="w-12 h-12 bg-green-50/50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-500 border border-green-50 dark:border-green-800/40">
            <Banknote className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Energía Entregada</p>
            <p className="text-[26px] font-bold text-sipar-dark dark:text-white tracking-tight">
              {data.kpis.energia_entregada_kwh.toLocaleString('es-PY')} kWh
            </p>
            <p className="text-[11px] text-sipar-orange font-bold mt-2 flex items-center gap-1"><Zap className="w-3 h-3" /> Operación en vivo</p>
          </div>
          <div className="w-12 h-12 bg-orange-50/50 dark:bg-orange-900/20 rounded-xl flex justify-center items-center text-sipar-orange border border-orange-50 dark:border-orange-800/40">
            <BatteryCharging className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Impacto Ecológico</p>
            <p className="text-[26px] font-bold text-green-600 dark:text-green-400 tracking-tight">
              {data.kpis.co2_ahorrado_kg.toLocaleString('es-PY')} Kg
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-2">De CO2 ahorrado (Mes)</p>
          </div>
          <div className="w-12 h-12 bg-green-50/50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-600 dark:text-green-400 border border-green-50 dark:border-green-800/40">
            <Leaf className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Usuarios Registrados</p>
            <p className="text-[26px] font-bold text-sipar-dark dark:text-white tracking-tight">
              {data.kpis.usuarios_activos}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-2">En la base de datos</p>
          </div>
          <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-xl flex justify-center items-center text-gray-500 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ================= MAPA DE GOOGLE ================= */}
        <div className="col-span-2 bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col h-[650px] transition-colors">
          <div className="px-7 py-5 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex justify-between items-center z-10 transition-colors">
            <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sipar-orange" /> Mapa de Red en Vivo
            </h2>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"><div className="w-2 h-2 rounded-full bg-green-500"></div> Disponible</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"><div className="w-2 h-2 rounded-full bg-blue-500"></div> En Uso</span>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"><div className="w-2 h-2 rounded-full bg-red-500"></div> Fuera de Línea</span>
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
                {data.chargers.map(charger => {
                  const locationData = parseLocation(charger.location);
                  if (!locationData) return null;

                  return (
                    <MarkerF
                      key={`marker-${charger.id}`}
                      position={{ lat: locationData.lat, lng: locationData.lng }}
                      onClick={() => setSelectedMarker({ ...charger, parsedLocation: locationData })}
                      icon={getCustomMarkerIcon(charger.serial_number, charger.status)}
                    />
                  );
                })}

                {/* VENTANA EMERGENTE AL HACER CLIC */}
                {selectedMarker && !isDetailsOpen && selectedMarker.parsedLocation && (
                  <InfoWindowF
                    position={{ lat: selectedMarker.parsedLocation.lat, lng: selectedMarker.parsedLocation.lng }}
                    onCloseClick={() => setSelectedMarker(null)}
                    options={{ pixelOffset: new window.google.maps.Size(0, -45) }}
                  >
                    <div className="p-2 min-w-[220px]">
                      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
                        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-sipar-dark">
                          <Zap className="w-5 h-5 text-sipar-orange" />
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-sipar-dark leading-tight">
                            {selectedMarker.parsedLocation.address}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {selectedMarker.serial_number} • {selectedMarker.power_kw} kW
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-500 font-semibold">Estado de Red:</span>
                          <span className={`font-bold flex items-center gap-1 ${
                              selectedMarker.status === 'disponible' ? 'text-green-600' : 
                              selectedMarker.status === 'en_uso' ? 'text-blue-600' : 'text-red-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              selectedMarker.status === 'disponible' ? 'bg-green-500' : 
                              selectedMarker.status === 'en_uso' ? 'bg-blue-500' : 'bg-red-500'
                            }`}></div>
                            {selectedMarker.status === 'disponible' ? 'Disponible' : selectedMarker.status === 'en_uso' ? 'Cargando' : 'Desconectado'}
                          </span>
                        </div>
                        <button 
                          onClick={() => openDetails(selectedMarker)}
                          className="mt-2 w-full bg-sipar-dark text-white text-[11px] font-bold py-2 rounded-md hover:bg-gray-800 transition"
                        >
                          Ver Diagnóstico
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
            
            <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-sipar-dark/90 backdrop-blur border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-md shadow-sm text-[10px] font-bold text-gray-500 dark:text-gray-300 z-10 transition-colors">
               Cargadores recibidos: {data.chargers.length}
            </div>
          </div>
        </div>

        {/* ================= COLUMNA DERECHA ================= */}
        <div className="flex flex-col gap-6 h-[650px]">
          
          {/* Top Conductores */}
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex flex-col flex-1 min-h-0 transition-colors">
            <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex justify-between items-center flex-shrink-0 rounded-t-[20px] transition-colors">
              <h2 className="text-[14px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" /> Top Conductores
              </h2>
            </div>
            <div className="px-6 py-4 flex-1 overflow-y-auto hide-scroll">
              {data.topDrivers.length > 0 ? data.topDrivers.map((driver, index) => (
                <div key={index} className="flex justify-between items-center mb-4 pb-4 border-b border-gray-50 dark:border-gray-800 relative">
                  <div className={`absolute -left-3 -top-3 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                    index === 0 
                      ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                  }`}>
                    #{index + 1}
                  </div>
                  <div className="flex items-center gap-3 ml-2">
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400"><User className="w-4 h-4" /></div>
                    <div>
                      <p className="font-bold text-[12px] text-sipar-dark dark:text-white">{driver.user_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sipar-orange text-[13px]">{driver.total_kwh} kWh</p>
                    <p className="text-[9px] text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1 justify-end"><Leaf className="w-3 h-3" /> {driver.co2_saved_kg} Kg CO2</p>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">Sin datos registrados</p>
              )}
            </div>
          </div>

          {/* Transacciones Recientes */}
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex flex-col flex-1 min-h-0 transition-colors">
            <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-white dark:bg-sipar-dark flex justify-between items-center flex-shrink-0 rounded-t-[20px] transition-colors">
              <h2 className="text-[14px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-sipar-orange" /> Últimas Recargas
              </h2>
            </div>
            <div className="px-6 py-4 flex-1 overflow-y-auto hide-scroll">
              {data.transactions.length > 0 ? data.transactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center mb-4 pb-4 border-b border-gray-50 dark:border-gray-800">
                  <div>
                    <p className="font-bold text-[12px] text-sipar-dark dark:text-white">{tx.user_name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Recarga #{tx.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-500 dark:text-green-400 text-[13px]">+ {tx.amount_pyg.toLocaleString('es-PY')} ₲</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{tx.kwh} kWh</p>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">Sin transacciones recientes</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ================= MODAL DE DETALLES (DIAGNÓSTICO) ================= */}
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
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                  selectedMarker.status === 'disponible' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  selectedMarker.status === 'en_uso' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                  'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    selectedMarker.status === 'disponible' ? 'bg-green-400' :
                    selectedMarker.status === 'en_uso' ? 'bg-blue-400' : 'bg-red-400'
                  }`}></div> 
                  {selectedMarker.status === 'disponible' ? 'En línea' : selectedMarker.status === 'en_uso' ? 'En Uso' : 'Desconectado'}
                </span>
                <button onClick={() => setIsDetailsOpen(false)} className="text-gray-400 hover:text-white transition"><X className="w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="p-6">
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
                      <span className="font-bold text-sipar-dark dark:text-white">{selectedMarker.vendor || 'Desconocido'}</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Modelo:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">
                        {selectedMarker.model ? `${selectedMarker.model} (${selectedMarker.power_kw}kW)` : 'Desconocido'}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-2">
                      <span className="text-gray-500 dark:text-gray-400">Protocolo:</span> 
                      <span className="font-bold text-sipar-dark dark:text-white">OCPP 1.6J</span>
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
                      title="Fuerza el inicio de la entrega de energía sin necesidad de validación del cliente."
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
                      title="Corta el suministro eléctrico de la sesión actual de forma instantánea."
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
                      title="Retrae el pin electromecánico para liberar el cable si el cliente no puede desconectarlo."
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
                      title="Reinicia el software y el sistema operativo interno del cargador de manera controlada."
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
                      title="Corta el suministro de energía principal y arranca la máquina desde cero. Úsalo como último recurso."
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