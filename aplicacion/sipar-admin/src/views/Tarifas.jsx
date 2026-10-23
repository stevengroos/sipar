import { useState, useEffect, useMemo } from 'react';
import { 
  Sliders, PlusCircle, Star, Edit, History, 
  CheckCircle, Lock, Save, X, Loader2, AlertTriangle, 
  Zap, Trash2, CheckSquare, Square, Download, RotateCcw, Calculator
} from 'lucide-react';
import api from '../api/axios';

export default function Tarifas() {
  const [tariffs, setTariffs] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState(null);
  
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const [formData, setFormData] = useState({
    id: null,
    name: '',
    price_kwh: '',
    connection_fee: '0',
    is_active: true,
    charger_ids: [],
    admin_password: ''
  });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [tariffsRes, chargersRes, logsRes] = await Promise.all([
        api.get('/api/v1/tariffs/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/chargers/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/tariffs/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setTariffs(tariffsRes.data);
      setChargers(chargersRes.data);
      setAuditLogs(logsRes.data);
    } catch (error) {
      console.error("Error cargando datos de tarifas:", error);
      showNotification('error', 'Error al cargar las tarifas y estaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4500);
  };

  // KPIs Operativos de Tarifas y Cobertura de Red
  const tariffMetrics = useMemo(() => {
    const activeTariffs = tariffs.filter(t => t.is_active);
    const activeChargers = chargers.filter(c => c.is_active !== false);
    const assignedChargers = activeChargers.filter(c => c.tariff_id !== null && c.tariff_id !== undefined);
    const unassignedChargers = activeChargers.filter(c => !c.tariff_id);

    const avgPrice = activeTariffs.length > 0
      ? Math.round(activeTariffs.reduce((acc, t) => acc + Number(t.price_kwh || 0), 0) / activeTariffs.length)
      : 0;

    return {
      activeTariffsCount: activeTariffs.length,
      totalTariffsCount: tariffs.length,
      totalChargersCount: activeChargers.length,
      assignedCount: assignedChargers.length,
      unassignedChargers,
      avgPrice
    };
  }, [tariffs, chargers]);

  // Mapa rápido de ID de tarifa -> Nombre de tarifa para mostrar en el selector de cargadores
  const tariffNameMap = useMemo(() => {
    const map = {};
    tariffs.forEach(t => { map[t.id] = t.name; });
    return map;
  }, [tariffs]);

  const openCreateModal = () => {
    // Preseleccionamos automáticamente los cargadores que aún no tienen tarifa
    const unassignedIds = chargers.filter(c => c.is_active !== false && !c.tariff_id).map(c => c.id);
    setFormData({
      id: null,
      name: '',
      price_kwh: '',
      connection_fee: '0',
      is_active: true,
      charger_ids: unassignedIds,
      admin_password: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tariff) => {
    const assignedChargerIds = tariff.chargers ? tariff.chargers.map(c => c.id) : [];
    setFormData({
      id: tariff.id,
      name: tariff.name,
      price_kwh: tariff.price_kwh,
      connection_fee: tariff.connection_fee || '0',
      is_active: Boolean(tariff.is_active),
      charger_ids: assignedChargerIds,
      admin_password: ''
    });
    setIsModalOpen(true);
  };

  const handleChargerToggle = (chargerId) => {
    setFormData(prev => {
      const isSelected = prev.charger_ids.includes(chargerId);
      if (isSelected) {
        return { ...prev, charger_ids: prev.charger_ids.filter(id => id !== chargerId) };
      } else {
        return { ...prev, charger_ids: [...prev.charger_ids, chargerId] };
      }
    });
  };

  const handleSelectAllChargers = () => {
    const allActiveIds = chargers.filter(c => c.is_active !== false).map(c => c.id);
    if (formData.charger_ids.length === allActiveIds.length) {
      setFormData(prev => ({ ...prev, charger_ids: [] }));
    } else {
      setFormData(prev => ({ ...prev, charger_ids: allActiveIds }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.admin_password) {
      showNotification('error', 'Debes ingresar tu contraseña de administrador para autorizar el cambio.');
      return;
    }
    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('sipar_token');
      const payload = {
        name: formData.name,
        price_kwh: parseFloat(formData.price_kwh) || 0,
        connection_fee: parseFloat(formData.connection_fee) || 0,
        is_active: formData.is_active,
        charger_ids: formData.charger_ids,
        admin_password: formData.admin_password
      };

      if (formData.id) {
        await api.put(`/api/v1/tariffs/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Tarifa actualizada y registrada en auditoría ISO 27001.');
      } else {
        await api.post('/api/v1/tariffs/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Nueva tarifa creada y vinculada a las estaciones seleccionadas.');
      }
      
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al guardar la tarifa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTariff) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/tariffs/${selectedTariff.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', 'Tarifa desactivada y estaciones liberadas.');
      setIsDeleteModalOpen(false);
      setSelectedTariff(null);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'Error al desactivar la tarifa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportTariffAuditCSV = () => {
    if (auditLogs.length === 0) return;
    const headers = ["ID Evento", "Fecha y Hora", "Responsable", "Accion", "Perfil de Tarifa", "IP Origen", "Detalle de Modificacion"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = auditLogs.map(log => [
      log.id,
      log.created_at ? new Date(log.created_at).toLocaleString('es-PY') : 'N/A',
      log.actor_email,
      log.action,
      log.target,
      log.ip_address,
      log.details
    ].map(escapeCsv).join(','));

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Auditoria_Tarifas_ISO27001_SIPAR.csv`);
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

  // Simulador rápido de sesión de 20 kWh para el modal
  const simulated20kWhCost = (Number(formData.price_kwh || 0) * 20) + Number(formData.connection_fee || 0);

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative space-y-6">
      
      {/* ================= NOTIFICACIÓN TOAST ================= */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error de Autorización'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ================= KPIs DE COBERTURA TARIFARIA ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Perfiles de Tarifa Activos</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">
              {tariffMetrics.activeTariffsCount} <span className="text-xs font-normal text-gray-400">/ {tariffMetrics.totalTariffsCount} totales</span>
            </p>
            <p className="text-xs text-sipar-orange font-semibold mt-1">
              Promedio: {tariffMetrics.avgPrice.toLocaleString('es-PY')} ₲ / kWh
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-sipar-orange flex items-center justify-center">
            <Sliders className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Estaciones Vinculadas</p>
            <p className="text-2xl font-extrabold text-green-600 dark:text-green-400 mt-1">
              {tariffMetrics.assignedCount} <span className="text-xs font-normal text-gray-400">de {tariffMetrics.totalChargersCount} estaciones</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Facturación OCPP sincronizada en vivo
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500 flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className={`bg-white dark:bg-sipar-dark p-5 rounded-[20px] border flex items-center justify-between shadow-sm ${
          tariffMetrics.unassignedChargers.length > 0
            ? 'border-amber-300 dark:border-amber-800/70'
            : 'border-gray-100 dark:border-gray-800'
        }`}>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Estaciones Sin Tarifa Propia</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">
              {tariffMetrics.unassignedChargers.length}
            </p>
            <p className="text-xs text-amber-500 font-semibold mt-1 truncate max-w-[220px]">
              {tariffMetrics.unassignedChargers.length > 0
                ? `Pendientes: ${tariffMetrics.unassignedChargers.map(c => c.serial_number).join(', ')}`
                : '100% de la red cubierta'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ================= TABLA DE TARIFAS ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-sipar-orange" /> Gestión de Tarifas Comerciales (Cliente Final)
            </h2>
            <p className="text-gray-400 text-xs mt-1">
              Configura el precio de venta por kWh y el cargo fijo de desbloqueo aplicado automáticamente por OCPP al iniciar cada sesión.
            </p>
          </div>
          <button onClick={openCreateModal} className="bg-sipar-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition">
            <PlusCircle className="w-4 h-4" /> Nueva Tarifa
          </button>
        </div>
        
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">
                <th className="px-6 py-4">Nombre del Perfil</th>
                <th className="px-6 py-4">Precio Venta x kWh</th>
                <th className="px-6 py-4">Cargo Fijo (Desbloqueo)</th>
                <th className="px-6 py-4">Estaciones Vinculadas</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {tariffs.map((tariff, idx) => (
                <tr key={tariff.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition ${!tariff.is_active && 'opacity-60'}`}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-[13px] text-sipar-dark dark:text-white flex items-center gap-1.5">
                      <Star className={`w-3.5 h-3.5 ${idx === 0 && tariff.is_active ? 'text-sipar-orange fill-sipar-orange' : 'text-gray-400'}`} />
                      {tariff.name}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">ID Tarifa: #{tariff.id}</p>
                  </td>

                  <td className="px-6 py-4 text-[14px] font-extrabold text-sipar-orange">
                    {Number(tariff.price_kwh).toLocaleString('es-PY')} ₲ <span className="text-xs font-normal text-gray-400">/ kWh</span>
                  </td>

                  <td className="px-6 py-4 text-[13px] font-bold text-gray-700 dark:text-gray-300">
                    {Number(tariff.connection_fee).toLocaleString('es-PY')} ₲
                  </td>

                  <td className="px-6 py-4">
                    {tariff.chargers && tariff.chargers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {tariff.chargers.map(ch => (
                          <span
                            key={ch.id}
                            className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-sipar-dark dark:text-gray-200 border border-gray-200 dark:border-gray-700 flex items-center gap-1"
                          >
                            <Zap className="w-3 h-3 text-sipar-orange" /> {ch.serial_number}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Sin estaciones asignadas</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 ${
                      tariff.is_active 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {tariff.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(tariff)}
                        className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-orange shadow-sm transition flex items-center gap-1"
                        title="Editar Tarifa y Estaciones"
                      >
                        <Edit className="w-3.5 h-3.5" /> Editar
                      </button>
                      {tariff.is_active && (
                        <button
                          onClick={() => { setSelectedTariff(tariff); setIsDeleteModalOpen(true); }}
                          className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 shadow-sm transition"
                          title="Desactivar Tarifa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tariffs.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-sm text-gray-400">
                    No hay tarifas registradas. Crea una tarifa para comenzar a facturar en tus cargadores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= HISTORIAL DE AUDITORÍA DE PRECIOS REAL (ISO 27001) ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-sipar-orange" />
            <h3 className="text-[15px] font-bold text-sipar-dark dark:text-white">
              Bitácora de Auditoría de Precios & Tarifas ({auditLogs.length})
            </h3>
            <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-300 dark:border-gray-600">
              ISO 27001 A.8.15
            </span>
          </div>

          {auditLogs.length > 0 && (
            <button
              onClick={exportTariffAuditCSV}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-sipar-dark dark:text-white rounded-lg hover:border-sipar-orange flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-sipar-orange" /> Exportar Bitácora CSV
            </button>
          )}
        </div>

        <div className="p-0 overflow-x-auto max-h-80 overflow-y-auto hide-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white dark:bg-sipar-dark border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                <th className="px-6 py-3">Fecha & Hora</th>
                <th className="px-6 py-3">Administrador Responsable</th>
                <th className="px-6 py-3">Perfil Afectado</th>
                <th className="px-6 py-3">Dirección IP</th>
                <th className="px-6 py-3">Detalle de la Modificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-xs">
              {auditLogs.length > 0 ? (
                auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="px-6 py-3.5 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {log.created_at ? new Date(log.created_at).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-sipar-dark dark:text-white">
                      {log.actor_email}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      }`}>
                        {log.target}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {log.ip_address}
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-gray-600 dark:text-gray-300">
                      {log.details}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-xs text-gray-400">
                    Aún no se han registrado cambios de tarifas en la bitácora. Crea o edita una tarifa para registrar el primer evento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: NUEVA / EDITAR TARIFA ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[24px] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 max-h-[92vh] transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sipar-orange" /> {formData.id ? 'Editar Perfil de Tarifa' : 'Nuevo Perfil de Tarifa'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto hide-scroll">
              <form onSubmit={handleSubmit} className="space-y-5">
                
                <div className="grid grid-cols-12 gap-4 items-end">
                  <div className="col-span-12 sm:col-span-8">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Nombre del Perfil de Venta
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Ej. Tarifa Rápida DC / Tarifa Estándar AC"
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition"
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Estado del Perfil
                    </label>
                    <select
                      value={formData.is_active ? 'true' : 'false'}
                      onChange={(e) => setFormData({...formData, is_active: e.target.value === 'true'})}
                      className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none"
                    >
                      <option value="true">Activa</option>
                      <option value="false">Inactiva</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Precio de Venta / kWh (₲)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 font-bold">₲</span>
                      </div>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={formData.price_kwh}
                        onChange={(e) => setFormData({...formData, price_kwh: e.target.value})}
                        placeholder="Ej. 2500"
                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Cargo Fijo Desbloqueo (₲)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 font-bold">₲</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formData.connection_fee}
                        onChange={(e) => setFormData({...formData, connection_fee: e.target.value})}
                        placeholder="0"
                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Simulador en vivo de cobro */}
                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/25 border border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-xs">
                  <span className="text-blue-800 dark:text-blue-300 font-semibold flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-blue-500" /> Simulación de recarga promedio (20 kWh):
                  </span>
                  <span className="font-extrabold text-blue-700 dark:text-blue-400 text-sm">
                    {simulated20kWhCost.toLocaleString('es-PY')} ₲
                  </span>
                </div>

                {/* === SECCIÓN DE ASIGNACIÓN DE CARGADORES === */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Estaciones Asignadas ({formData.charger_ids.length} de {chargers.filter(c => c.is_active !== false).length})
                    </label>
                    <button
                      type="button"
                      onClick={handleSelectAllChargers}
                      className="text-xs font-bold text-sipar-orange hover:underline flex items-center gap-1"
                    >
                      {formData.charger_ids.length === chargers.filter(c => c.is_active !== false).length ? (
                        <><Square className="w-3.5 h-3.5" /> Desmarcar todas</>
                      ) : (
                        <><CheckSquare className="w-3.5 h-3.5" /> Seleccionar todas</>
                      )}
                    </button>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-[180px] overflow-y-auto bg-gray-50/50 dark:bg-gray-900/40 p-2 space-y-1">
                    {chargers.filter(c => c.is_active !== false).map(charger => {
                      const isAssignedToThis = formData.charger_ids.includes(charger.id);
                      const belongsToOther = charger.tariff_id && charger.tariff_id !== formData.id;
                      const otherTariffName = belongsToOther ? (tariffNameMap[charger.tariff_id] || `Tarifa #${charger.tariff_id}`) : null;
                      
                      return (
                        <label key={charger.id} className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition border ${
                          isAssignedToThis 
                            ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' 
                            : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}>
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={isAssignedToThis}
                              onChange={() => handleChargerToggle(charger.id)}
                              className="w-4 h-4 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" 
                            />
                            <div>
                              <p className="text-xs font-bold text-sipar-dark dark:text-white flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-sipar-orange" /> {charger.serial_number}
                              </p>
                              {belongsToOther && !isAssignedToThis && (
                                <p className="text-[10px] text-amber-500 font-semibold mt-0.5">
                                  Actualmente en: {otherTariffName} (Se moverá si la seleccionas)
                                </p>
                              )}
                              {!charger.tariff_id && !isAssignedToThis && (
                                <p className="text-[10px] text-gray-400 mt-0.5">Sin tarifa asignada</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono font-bold">
                            {charger.power_kw} kW
                          </span>
                        </label>
                      );
                    })}
                    {chargers.length === 0 && (
                      <p className="text-xs text-center text-gray-400 p-4">No hay cargadores registrados en la red.</p>
                    )}
                  </div>
                </div>

                {/* VERIFICACIÓN REAL DE CONTRASEÑA ADMINISTRATIVA (ISO 27001) */}
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl p-4">
                  <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Autorización Administrativa ISO 27001 (Requerido)
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.admin_password}
                    onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                    placeholder="Ingresa tu contraseña de administrador para confirmar"
                    className="w-full px-4 py-2 border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-400 transition"
                  />
                  <p className="text-[10px] text-red-500/80 dark:text-red-400/80 mt-1">
                    Este cambio quedará registrado con tu usuario, fecha e IP en la bitácora de auditoría.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition text-xs">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-sipar-orange text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,158,0,0.3)] hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70 text-xs">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {formData.id ? 'Autorizar y Guardar' : 'Autorizar y Crear Tarifa'}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR DESACTIVACIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] transition-colors">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Desactivar Tarifa?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Estás a punto de desactivar la tarifa <span className="font-bold text-sipar-dark dark:text-white">{selectedTariff?.name}</span>. Las estaciones asociadas quedarán libres para asignarles otro perfil.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {setIsDeleteModalOpen(false); setSelectedTariff(null);}} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition text-sm">Cancelar</button>
              <button onClick={handleDeleteConfirm} disabled={isSubmitting} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm shadow-sm">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}