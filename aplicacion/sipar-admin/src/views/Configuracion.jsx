import { useState, useEffect } from 'react';
import { 
  Shield, Bell, Users, Plus, Monitor, Moon, 
  UserCog, Save, X, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import api from '../api/axios';

export default function Configuracion() {
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Estados Globales
  const [config, setConfig] = useState(null);
  const [rolesList, setRolesList] = useState([]);

  // Estado del formulario para Crear o Editar Rol
  const [roleForm, setRoleForm] = useState({
    id: null,
    name: '', cargadores_ver: false, cargadores_editar: false,
    usuarios_ver: false, usuarios_editar: false, finanzas_ver: false, finanzas_editar: false,
    admin_ver: false, admin_editar: false,
  });

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const fetchInitialData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [configRes, rolesRes] = await Promise.all([
        api.get('/api/v1/config/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/roles/', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setConfig(configRes.data);
      setRolesList(rolesRes.data);

      const isDark = Boolean(configRes.data.pref_dark_mode);
      localStorage.setItem('sipar_dark_mode', String(isDark));
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

    } catch (error) {
      console.error("Error al cargar datos:", error);
      showNotification('error', 'Error al cargar datos del servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleConfigChange = async (key, value) => {
    const previousConfig = { ...config };
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig); 
    
    if (key === 'pref_dark_mode') {
      localStorage.setItem('sipar_dark_mode', String(value));
      if (value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.put('/api/v1/config/', newConfig, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setConfig(res.data);
      // Notificamos a AdminLayout (en App.jsx) para actualizar sesión/tema en vivo
      window.dispatchEvent(new CustomEvent('sipar_config_updated', { detail: res.data }));
      showNotification('success', 'Configuración actualizada correctamente.');
    } catch (error) {
      showNotification('error', error.response?.data?.detail || 'No se pudo guardar la configuración.');
      setConfig(previousConfig); 
      if (key === 'pref_dark_mode') {
        localStorage.setItem('sipar_dark_mode', String(previousConfig.pref_dark_mode));
        if (previousConfig.pref_dark_mode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    }
  };

  // --- FUNCIONES PARA EL MODAL DE ROLES ---

  const openNewRoleModal = () => {
    setRoleForm({
      id: null,
      name: '', cargadores_ver: false, cargadores_editar: false,
      usuarios_ver: false, usuarios_editar: false, finanzas_ver: false, finanzas_editar: false,
      admin_ver: false, admin_editar: false,
    });
    setIsRoleModalOpen(true);
  };

  const handleEditRole = (rol) => {
    setRoleForm({
      id: rol.id,
      name: rol.name,
      cargadores_ver: rol.permissions?.cargadores_ver || false,
      cargadores_editar: rol.permissions?.cargadores_editar || false,
      usuarios_ver: rol.permissions?.usuarios_ver || false,
      usuarios_editar: rol.permissions?.usuarios_editar || false,
      finanzas_ver: rol.permissions?.finanzas_ver || false,
      finanzas_editar: rol.permissions?.finanzas_editar || false,
      admin_ver: rol.permissions?.admin_ver || false,
      admin_editar: rol.permissions?.admin_editar || false,
    });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      showNotification('error', 'Por favor ingresa un nombre para el rol.');
      return;
    }

    setIsSaving(true);
    
    try {
      const token = localStorage.getItem('sipar_token');
      const payload = {
        name: roleForm.name.trim(),
        permissions: {
          cargadores_ver: roleForm.cargadores_ver, cargadores_editar: roleForm.cargadores_editar,
          usuarios_ver: roleForm.usuarios_ver, usuarios_editar: roleForm.usuarios_editar,
          finanzas_ver: roleForm.finanzas_ver, finanzas_editar: roleForm.finanzas_editar,
          admin_ver: roleForm.admin_ver, admin_editar: roleForm.admin_editar,
        }
      };

      if (roleForm.id) {
        await api.put(`/api/v1/roles/${roleForm.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `El rol "${roleForm.name}" ha sido actualizado.`);
      } else {
        await api.post('/api/v1/roles/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `El rol "${roleForm.name}" ha sido creado.`);
      }
      
      setIsRoleModalOpen(false);
      fetchInitialData(); 
    } catch (error) {
      showNotification('error', error.response?.data?.detail || 'Error al guardar el rol.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl animate-[slideDown_0.3s_ease-out] border ${
          notification.type === 'success' ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8 items-start">
        
        {/* ================= COLUMNA IZQUIERDA ================= */}
        <div className="flex flex-col gap-8">
          
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50">
              <Shield className="w-5 h-5 text-sipar-orange" />
              <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Seguridad Global (ISO 27001)</h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Autenticación de Dos Factores (2FA)</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Obligar al equipo interno a usar Authenticator.</p>
                </div>
                <label className="cursor-pointer relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config.security_2fa)} onChange={(e) => handleConfigChange('security_2fa', e.target.checked)} />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
              <div className="mb-5">
                <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Expiración de Sesión Inactiva</label>
                <select value={config.security_session} onChange={(e) => handleConfigChange('security_session', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-sipar-orange transition appearance-none bg-white dark:bg-sipar-dark">
                  <option>15 minutos (Estricto)</option>
                  <option>30 minutos (Recomendado)</option>
                  <option>1 Hora</option>
                </select>
              </div>
              <div className="mb-2">
                <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Política de Contraseñas</label>
                <select value={config.security_password} onChange={(e) => handleConfigChange('security_password', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-sipar-orange transition appearance-none bg-white dark:bg-sipar-dark">
                  <option>Exigir rotación cada 90 días</option>
                  <option>Exigir rotación cada 180 días</option>
                  <option>No exigir rotación</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50">
              <Bell className="w-5 h-5 text-sipar-orange" />
              <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Notificaciones del Sistema</h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Alertas Críticas de Hardware</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Emails instantáneos si un cargador se desconecta.</p>
                </div>
                <label className="cursor-pointer relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config.notif_hardware)} onChange={(e) => handleConfigChange('notif_hardware', e.target.checked)} />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Alertas de Fraude o Disputas</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Notificar al área financiera sobre reembolsos.</p>
                </div>
                <label className="cursor-pointer relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config.notif_fraud)} onChange={(e) => handleConfigChange('notif_fraud', e.target.checked)} />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Resumen Diario de Operaciones</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Reporte automático de energía y recaudación al cierre del día.</p>
                </div>
                <label className="cursor-pointer relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config.notif_daily)} onChange={(e) => handleConfigChange('notif_daily', e.target.checked)} />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUMNA DERECHA ================= */}
        <div className="flex flex-col gap-8">
          
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sipar-orange" />
                <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Roles y Perfiles de Acceso</h2>
              </div>
              <button onClick={openNewRoleModal} className="text-sipar-orange text-[12px] font-bold hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Crear Rol Nuevo
              </button>
            </div>
            
            <div className="p-0">
              {rolesList.map(rol => (
                <div key={rol.id} className="p-5 border-b border-gray-50 dark:border-gray-800 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <div>
                    <p className="font-bold text-[13px] text-sipar-dark dark:text-white">{rol.name}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {rol.name === 'Super Admin' ? 'Acceso total al sistema.' : 'Permisos personalizados.'}
                    </p>
                  </div>
                  {rol.name === 'Super Admin' ? (
                    <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2.5 py-1 rounded-md text-[10px] font-bold border border-purple-200 dark:border-purple-800">Acceso Ilimitado</span>
                  ) : (
                    <button 
                      onClick={() => handleEditRole(rol)} 
                      className="text-gray-400 hover:text-sipar-orange bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition"
                    >
                      Ver Permisos
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50">
              <Monitor className="w-5 h-5 text-sipar-orange" />
              <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Preferencias de Interfaz</h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex justify-center items-center"><Moon className="w-4 h-4 text-sipar-dark dark:text-white" /></div>
                  <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Modo Oscuro</p>
                </div>
                <label className="cursor-pointer relative inline-block w-10 h-5">
                  <input type="checkbox" className="peer sr-only" checked={Boolean(config.pref_dark_mode)} onChange={(e) => handleConfigChange('pref_dark_mode', e.target.checked)} />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                </label>
              </div>
              <div>
                <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Idioma del Panel</label>
                <select value={config.pref_language} onChange={(e) => handleConfigChange('pref_language', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-sipar-orange transition appearance-none bg-white dark:bg-sipar-dark">
                  <option>Español (Latinoamérica)</option>
                  <option>English (US)</option>
                  <option>Português (Brasil)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODAL: CREAR/EDITAR ROL (RBAC) ================= */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out] border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <UserCog className="w-5 h-5 text-sipar-orange" /> {roleForm.id ? 'Editar Permisos del Rol' : 'Crear Rol Nuevo'}
              </h2>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveRole}>
                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nombre del Rol</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Supervisor de Operaciones"
                    value={roleForm.name} 
                    onChange={(e) => setRoleForm({...roleForm, name: e.target.value})} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-sipar-dark dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white dark:bg-sipar-dark" 
                  />
                </div>
                
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Módulos y Permisos</h3>
                
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-6">
                  
                  <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-sipar-dark hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <p className="text-sm font-bold text-sipar-dark dark:text-white">Red de Cargadores</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.cargadores_ver} onChange={(e) => setRoleForm({...roleForm, cargadores_ver: e.target.checked})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ver</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.cargadores_editar} onChange={(e) => setRoleForm({...roleForm, cargadores_editar: e.target.checked, cargadores_ver: e.target.checked ? true : roleForm.cargadores_ver})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Editar</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-sipar-dark hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <p className="text-sm font-bold text-sipar-dark dark:text-white">Usuarios & Flota</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.usuarios_ver} onChange={(e) => setRoleForm({...roleForm, usuarios_ver: e.target.checked})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ver</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.usuarios_editar} onChange={(e) => setRoleForm({...roleForm, usuarios_editar: e.target.checked, usuarios_ver: e.target.checked ? true : roleForm.usuarios_ver})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Editar</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-sipar-dark hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <p className="text-sm font-bold text-sipar-dark dark:text-white">Finanzas & Conciliación</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.finanzas_ver} onChange={(e) => setRoleForm({...roleForm, finanzas_ver: e.target.checked})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ver</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.finanzas_editar} onChange={(e) => setRoleForm({...roleForm, finanzas_editar: e.target.checked, finanzas_ver: e.target.checked ? true : roleForm.finanzas_ver})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Editar</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-sipar-dark hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <p className="text-sm font-bold text-sipar-dark dark:text-white">Configuración (Admin)</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.admin_ver} onChange={(e) => setRoleForm({...roleForm, admin_ver: e.target.checked})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ver</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={roleForm.admin_editar} onChange={(e) => setRoleForm({...roleForm, admin_editar: e.target.checked, admin_ver: e.target.checked ? true : roleForm.admin_ver})} className="w-3.5 h-3.5 text-sipar-orange rounded focus:ring-sipar-orange accent-sipar-orange" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Editar</span>
                      </label>
                    </div>
                  </div>
                  
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsRoleModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition">Cancelar</button>
                  <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-sipar-dark dark:bg-black text-white font-bold rounded-xl shadow-md hover:bg-gray-800 dark:hover:bg-gray-900 transition flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {roleForm.id ? 'Guardar Cambios' : 'Crear Rol'}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}