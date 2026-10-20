import { useState, useEffect } from 'react';
import { 
  Sliders, PlusCircle, Star, Edit, History, 
  ArrowRight, CheckCircle, Lock, Save, X, 
  Loader2, AlertTriangle, Zap, Trash2
} from 'lucide-react';
import api from '../api/axios';

export default function Tarifas() {
  const [tariffs, setTariffs] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState(null);
  
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const [formData, setFormData] = useState({
    id: null, name: '', price_kwh: '', connection_fee: '0', charger_ids: []
  });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [tariffsRes, chargersRes] = await Promise.all([
        api.get('/api/v1/tariffs/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/chargers/', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setTariffs(tariffsRes.data);
      setChargers(chargersRes.data);
    } catch (error) {
      console.error("Error cargando datos:", error);
      showNotification('error', 'Error al cargar las tarifas y cargadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const openCreateModal = () => {
    setFormData({ id: null, name: '', price_kwh: '', connection_fee: '0', charger_ids: [] });
    setIsModalOpen(true);
  };

  const openEditModal = (tariff) => {
    const assignedChargerIds = tariff.chargers ? tariff.chargers.map(c => c.id) : [];
    
    setFormData({
      id: tariff.id,
      name: tariff.name,
      price_kwh: tariff.price_kwh,
      connection_fee: tariff.connection_fee,
      charger_ids: assignedChargerIds
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('sipar_token');
      const payload = {
        name: formData.name,
        price_kwh: parseFloat(formData.price_kwh),
        connection_fee: parseFloat(formData.connection_fee),
        charger_ids: formData.charger_ids
      };

      if (formData.id) {
        await api.put(`/api/v1/tariffs/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Tarifa actualizada correctamente.');
      } else {
        await api.post('/api/v1/tariffs/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', 'Nueva tarifa creada y asignada.');
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
      showNotification('success', 'Tarifa desactivada correctamente.');
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'Error al eliminar la tarifa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {/* ================= NOTIFICACIÓN TOAST ================= */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl animate-[slideDown_0.3s_ease-out] border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error en la operación'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        
        {/* ================= TABLA DE TARIFAS ================= */}
        <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
          <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sipar-orange" /> Gestión de Tarifas
              </h2>
              <p className="text-gray-400 text-[11px] mt-1">Configura múltiples perfiles de cobro y asígnalos a distintas estaciones.</p>
            </div>
            <button onClick={openCreateModal} className="bg-sipar-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg transition">
              <PlusCircle className="w-4 h-4" /> Nueva Tarifa
            </button>
          </div>
          
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Nombre del Perfil</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Precio x Energía</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Costo Fijo (Conexión)</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {tariffs.map(tariff => (
                  <tr key={tariff.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition ${!tariff.is_active && 'opacity-60'}`}>
                    <td className="px-6 py-4">
                      <p className="font-bold text-[13px] text-sipar-dark dark:text-white flex items-center gap-1.5">
                        <Star className={`w-3.5 h-3.5 ${tariff.id === 1 ? 'text-sipar-orange' : 'text-gray-400'}`} /> {tariff.name}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                        Aplicada a {tariff.chargers?.length || 0} estación(es)
                      </p>
                    </td>
                    <td className="px-6 py-4 text-[13px] font-bold text-sipar-dark dark:text-white">{Number(tariff.price_kwh).toLocaleString('es-PY')} ₲ / kWh</td>
                    <td className="px-6 py-4 text-[13px] font-semibold text-gray-600 dark:text-gray-300">{Number(tariff.connection_fee).toLocaleString('es-PY')} ₲</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 ${
                        tariff.is_active 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}>
                        {tariff.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button onClick={() => openEditModal(tariff)} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-orange shadow-sm transition" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setSelectedTariff(tariff); setIsDeleteModalOpen(true); }} className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 shadow-sm transition" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {tariffs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-sm text-gray-400">No hay tarifas registradas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ================= HISTORIAL DE AUDITORÍA ================= */}
        <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-sipar-orange" /> Log de Auditoría de Precios
            </h3>
            <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded text-[10px] font-bold border border-gray-300 dark:border-gray-600">ISO 27001 Compliant</span>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white dark:bg-sipar-dark border-b border-gray-100 dark:border-gray-800">
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fecha & Hora</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Usuario Responsable</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Dirección IP</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">Detalle de la Modificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                  <td className="px-6 py-4 text-[12px] font-bold text-sipar-dark dark:text-white">15 Sep 2026, 09:30 AM</td>
                  <td className="px-6 py-4">
                    <p className="text-[12px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 bg-sipar-orange text-white rounded-full flex justify-center items-center text-[8px] font-bold">SG</span> Steven Groos
                    </p>
                  </td>
                  <td className="px-6 py-4 text-[11px] font-mono text-gray-500 dark:text-gray-400">190.128.45.12 (PY)</td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-[12px] text-gray-600 dark:text-gray-300 font-semibold">
                      Tarifa Base: <span className="line-through text-gray-400">2.300 ₲</span> 
                      <ArrowRight className="w-3 h-3 inline text-sipar-orange mx-1" /> 
                      <span className="text-sipar-dark dark:text-white font-bold">2.500 ₲</span>
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ================= MODAL: NUEVA / EDITAR TARIFA ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[24px] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 max-h-[90vh] transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sipar-orange" /> {formData.id ? 'Editar Tarifa' : 'Configuración de Tarifa'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto hide-scroll">
              <form onSubmit={handleSubmit}>
                <div className="mb-5">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nombre del Perfil de Venta</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Ej. Tarifa Premium Nocturna" className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Precio / kWh</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 font-bold">₲</span>
                      </div>
                      <input type="number" required min="0" step="0.01" value={formData.price_kwh} onChange={(e) => setFormData({...formData, price_kwh: e.target.value})} className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Costo Conexión Fija</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 font-bold">₲</span>
                      </div>
                      <input type="number" min="0" step="0.01" value={formData.connection_fee} onChange={(e) => setFormData({...formData, connection_fee: e.target.value})} className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                    </div>
                  </div>
                </div>

                {/* === SECCIÓN DE ASIGNACIÓN DE CARGADORES === */}
                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center justify-between">
                    <span>Estaciones Asignadas</span>
                    <span className="text-sipar-orange">{formData.charger_ids.length} seleccionadas</span>
                  </label>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-[160px] overflow-y-auto bg-gray-50/50 dark:bg-gray-900/40 p-2">
                    {chargers.filter(c => c.status !== 'eliminado' && c.is_active).map(charger => {
                      const isAssignedToThis = formData.charger_ids.includes(charger.id);
                      const belongsToOther = charger.tariff_id && charger.tariff_id !== formData.id;
                      
                      return (
                        <label key={charger.id} className={`flex items-center justify-between p-3 rounded-lg mb-1 cursor-pointer transition border ${
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
                              <p className="text-[13px] font-bold text-sipar-dark dark:text-white flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-gray-400" /> {charger.serial_number}
                              </p>
                              {belongsToOther && !isAssignedToThis && (
                                <p className="text-[10px] text-gray-400 mt-0.5">Actualmente en otra tarifa</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">{charger.power_kw}kW</span>
                        </label>
                      );
                    })}
                    {chargers.length === 0 && (
                      <p className="text-xs text-center text-gray-400 p-4">No hay cargadores registrados en la red.</p>
                    )}
                  </div>
                </div>

                <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl p-4">
                  <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> PIN de Autorización (Simulado)
                  </label>
                  <input type="password" placeholder="Ingrese su PIN administrativo" className="w-full px-4 py-2.5 border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition" />
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-sipar-orange text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,158,0,0.3)] hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {formData.id ? 'Guardar Cambios' : 'Crear Tarifa'}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] transition-colors">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Desactivar Tarifa?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Estás a punto de desactivar la tarifa <span className="font-bold text-sipar-dark dark:text-white">{selectedTariff?.name}</span>. Los cargadores asociados quedarán sin tarifa hasta que les asignes una nueva.
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