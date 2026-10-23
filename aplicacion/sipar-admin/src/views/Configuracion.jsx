import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Shield, Bell, Users, Plus, Monitor, Moon, 
  UserCog, Save, X, CheckCircle, AlertCircle, Loader2,
  ShieldCheck, KeyRound, History, Download, Search, Filter,
  ChevronDown, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle,
  CheckCircle2, Lock, Sliders, Activity, Trash2, FileCheck2
} from 'lucide-react';
import api from '../api/axios';

const RBAC_MODULES = [
  { key: 'cargadores', label: 'Red de Cargadores & OCPP' },
  { key: 'historial', label: 'Historial de Recargas & ANDE' },
  { key: 'usuarios', label: 'Usuarios & Identidades' },
  { key: 'finanzas', label: 'Finanzas, Conciliación & Reversiones' },
  { key: 'tarifas', label: 'Tarifas & Parámetros Comerciales' },
  { key: 'tienda', label: 'Tienda de Accesorios & Stock' },
  { key: 'admin', label: 'Configuración Global & Auditoría' }
];

export default function Configuracion() {
  const [activeTab, setActiveTab] = useState('politicas'); // 'politicas' | 'auditoria'
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Datos del Servidor
  const [config, setConfig] = useState(null);
  const [rolesList, setRolesList] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Filtros y Paginación de la Auditoría General (20, 50, 100)
  const [auditSearch, setAuditSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'SUCCESS' | 'WARNING' | 'DANGER'
  const [isSeverityMenuOpen, setIsSeverityMenuOpen] = useState(false);
  const severityMenuRef = useRef(null);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(20);

  // Estado del formulario para Crear o Editar Rol (7 módulos)
  const [roleForm, setRoleForm] = useState({
    id: null,
    name: '',
    cargadores_ver: false, cargadores_editar: false,
    historial_ver: false, historial_editar: false,
    usuarios_ver: false, usuarios_editar: false,
    finanzas_ver: false, finanzas_editar: false,
    tarifas_ver: false, tarifas_editar: false,
    tienda_ver: false, tienda_editar: false,
    admin_ver: false, admin_editar: false,
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (severityMenuRef.current && !severityMenuRef.current.contains(e.target)) {
        setIsSeverityMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const fetchInitialData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [configRes, rolesRes, compRes, logsRes] = await Promise.all([
        api.get('/api/v1/config/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/roles/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/config/compliance-report', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/config/audit-logs?limit=1000', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setConfig(configRes.data);
      setRolesList(rolesRes.data);
      setCompliance(compRes.data);
      setAuditLogs(logsRes.data);

      const isDark = Boolean(configRes.data.pref_dark_mode);
      localStorage.setItem('sipar_dark_mode', String(isDark));
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error("Error al cargar configuración:", error);
      showNotification('error', 'Error al sincronizar la configuración del servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch, moduleFilter, severityFilter, auditPageSize]);

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
      window.dispatchEvent(new CustomEvent('sipar_config_updated', { detail: res.data }));
      showNotification('success', 'Política actualizada y registrada en auditoría ISO 27001.');
      // Refrescar métricas de cumplimiento y bitácora
      fetchInitialData();
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

  // --- FUNCIONES PARA EL MODAL DE ROLES (RBAC) ---
  const openNewRoleModal = () => {
    setRoleForm({
      id: null,
      name: '',
      cargadores_ver: false, cargadores_editar: false,
      historial_ver: false, historial_editar: false,
      usuarios_ver: false, usuarios_editar: false,
      finanzas_ver: false, finanzas_editar: false,
      tarifas_ver: false, tarifas_editar: false,
      tienda_ver: false, tienda_editar: false,
      admin_ver: false, admin_editar: false,
    });
    setIsRoleModalOpen(true);
  };

  const handleEditRole = (rol) => {
    const p = rol.permissions || {};
    setRoleForm({
      id: rol.id,
      name: rol.name,
      cargadores_ver: Boolean(p.cargadores_ver), cargadores_editar: Boolean(p.cargadores_editar),
      historial_ver: Boolean(p.historial_ver), historial_editar: Boolean(p.historial_editar),
      usuarios_ver: Boolean(p.usuarios_ver), usuarios_editar: Boolean(p.usuarios_editar),
      finanzas_ver: Boolean(p.finanzas_ver), finanzas_editar: Boolean(p.finanzas_editar),
      tarifas_ver: Boolean(p.tarifas_ver), tarifas_editar: Boolean(p.tarifas_editar),
      tienda_ver: Boolean(p.tienda_ver), tienda_editar: Boolean(p.tienda_editar),
      admin_ver: Boolean(p.admin_ver), admin_editar: Boolean(p.admin_editar),
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
          historial_ver: roleForm.historial_ver, historial_editar: roleForm.historial_editar,
          usuarios_ver: roleForm.usuarios_ver, usuarios_editar: roleForm.usuarios_editar,
          finanzas_ver: roleForm.finanzas_ver, finanzas_editar: roleForm.finanzas_editar,
          tarifas_ver: roleForm.tarifas_ver, tarifas_editar: roleForm.tarifas_editar,
          tienda_ver: roleForm.tienda_ver, tienda_editar: roleForm.tienda_editar,
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

  const handleDeleteRole = async (rol) => {
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/roles/${rol.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `Rol "${rol.name}" eliminado.`);
      fetchInitialData();
    } catch (error) {
      showNotification('error', error.response?.data?.detail || 'No se pudo eliminar el rol.');
    }
  };

  // Opciones de severidad con íconos Lucide React
  const severityOptions = [
    { id: 'all', label: 'Todos los Niveles', icon: Filter, color: 'text-gray-400' },
    { id: 'SUCCESS', label: 'Operación Exitosa (Info)', icon: CheckCircle2, color: 'text-green-500' },
    { id: 'WARNING', label: 'Advertencia / Alerta', icon: AlertTriangle, color: 'text-amber-500' },
    { id: 'DANGER', label: 'Crítico / Bloqueo Seguridad', icon: AlertCircle, color: 'text-red-500' }
  ];
  const currentSeverity = severityOptions.find(s => s.id === severityFilter) || severityOptions[0];
  const CurrentSeverityIcon = currentSeverity.icon;

  // Filtrado y Paginación de la Auditoría General
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
      if (severityFilter !== 'all' && log.status !== severityFilter) return false;
      if (auditSearch) {
        const lower = auditSearch.toLowerCase();
        const matchActor = (log.actor_email || '').toLowerCase().includes(lower);
        const matchAction = (log.action || '').toLowerCase().includes(lower);
        const matchTarget = (log.target || '').toLowerCase().includes(lower);
        const matchDetails = (log.details || '').toLowerCase().includes(lower);
        const matchIp = (log.ip_address || '').toLowerCase().includes(lower);
        if (!matchActor && !matchAction && !matchTarget && !matchDetails && !matchIp) return false;
      }
      return true;
    });
  }, [auditLogs, moduleFilter, severityFilter, auditSearch]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const safeAuditPage = Math.min(auditPage, totalAuditPages);
  const auditStartIndex = (safeAuditPage - 1) * auditPageSize;
  const auditEndIndex = auditStartIndex + auditPageSize;
  const paginatedAuditLogs = filteredAuditLogs.slice(auditStartIndex, auditEndIndex);

  const exportGeneralAuditCSV = () => {
    if (filteredAuditLogs.length === 0) return;
    const headers = ["ID Evento", "Fecha y Hora", "Modulo", "Accion ISO 27001", "Nivel", "Responsable / Actor", "Objetivo", "Direccion IP", "Detalle de Auditoria"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredAuditLogs.map(log => [
      log.id,
      log.created_at ? new Date(log.created_at).toLocaleString('es-PY') : 'N/A',
      log.module,
      log.action,
      log.status,
      log.actor_email,
      log.target,
      log.ip_address,
      log.details
    ].map(escapeCsv).join(','));

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Auditoria_General_ISO27001_SIPAR.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative space-y-6">
      
      {/* NOTIFICACIÓN TOAST */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl animate-[slideDown_0.3s_ease-out] border ${
          notification.type === 'success' ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Gobernanza ISO 27001' : 'Aviso del Sistema'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ================= CABECERA Y SELECTOR DE PESTAÑAS ================= */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sipar-orange" /> Gobernanza, Configuración & Auditoría General (ISO 27001)
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Políticas de seguridad activas, matriz de permisos por rol (RBAC) y bitácora centralizada de todos los módulos.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-sipar-dark p-1.5 rounded-xl border border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('politicas')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'politicas'
                ? 'bg-sipar-orange text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-sipar-dark dark:hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" /> Políticas & Roles RBAC
          </button>
          <button
            onClick={() => setActiveTab('auditoria')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'auditoria'
                ? 'bg-sipar-orange text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-sipar-dark dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" /> Auditoría General & Reportes ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* ================= 4 TARJETAS DE REPORTE DE CUMPLIMIENTO ISO 27001 ================= */}
      {compliance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Score Cumplimiento ISO 27001</p>
              <p className={`text-2xl font-extrabold mt-1 ${
                compliance.compliance_score >= 80 ? 'text-green-600 dark:text-green-400' : 'text-sipar-orange'
              }`}>
                {compliance.compliance_score}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Controles A.5.15, A.8.5 y A.8.15
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-sipar-orange flex items-center justify-center shrink-0">
              <FileCheck2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Cobertura 2FA (TOTP)</p>
              <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">
                {compliance.mfa_adoption_rate}% <span className="text-xs font-normal text-gray-400">({compliance.mfa_enabled_users}/{compliance.total_active_users})</span>
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
                {config.security_2fa ? 'Exigido globalmente' : 'Modo opcional activo'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Salud de Contraseñas</p>
              <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">
                {compliance.passwords_compliant_users}/{compliance.total_active_users} <span className="text-xs font-normal text-gray-400">vigentes</span>
              </p>
              <p className="text-xs text-amber-500 font-semibold mt-1">
                {compliance.passwords_expired_users} requieren rotación
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Eventos Auditados (Total)</p>
              <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">
                {compliance.total_audit_events}
              </p>
              <p className={`text-xs font-semibold mt-1 ${compliance.security_alerts_24h > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {compliance.security_alerts_24h} alertas en últimas 24h
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'politicas' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* ================= COLUMNA IZQUIERDA ================= */}
          <div className="flex flex-col gap-8">
            
            <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-sipar-orange" />
                  <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Seguridad Global (ISO 27001)</h2>
                </div>
                <span className="text-[10px] font-mono bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded font-bold">
                  Control A.8.5
                </span>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Autenticación de Dos Factores (2FA) Obligatoria</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      Redirige automáticamente a "Mi Perfil & MFA" al iniciar sesión si el usuario aún no vinculó su Authenticator.
                    </p>
                  </div>
                  <label className="cursor-pointer relative inline-block w-10 h-5 shrink-0 ml-4">
                    <input type="checkbox" className="peer sr-only" checked={Boolean(config.security_2fa)} onChange={(e) => handleConfigChange('security_2fa', e.target.checked)} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                  </label>
                </div>

                <div className="mb-5">
                  <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Expiración de Sesión Inactiva (Auto-Logout & JWT)</label>
                  <select value={config.security_session} onChange={(e) => handleConfigChange('security_session', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-sipar-dark dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white dark:bg-gray-900">
                    <option>15 minutos (Estricto)</option>
                    <option>30 minutos (Recomendado)</option>
                    <option>1 Hora</option>
                  </select>
                </div>

                <div className="mb-2">
                  <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Política de Rotación de Contraseñas</label>
                  <select value={config.security_password} onChange={(e) => handleConfigChange('security_password', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-sipar-dark dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white dark:bg-gray-900">
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
                <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Notificaciones y Alertas Operativas</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Alertas Críticas de Hardware (OCPP)</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Avisos inmediatos ante fallas de puesta a tierra (PE), error CP o desconexión.</p>
                  </div>
                  <label className="cursor-pointer relative inline-block w-10 h-5 shrink-0 ml-4">
                    <input type="checkbox" className="peer sr-only" checked={Boolean(config.notif_hardware)} onChange={(e) => handleConfigChange('notif_hardware', e.target.checked)} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Alertas de Fraude, Reclamos o Reversiones</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Notificar cuando un conductor abra una disputa o se ejecute un reembolso.</p>
                  </div>
                  <label className="cursor-pointer relative inline-block w-10 h-5 shrink-0 ml-4">
                    <input type="checkbox" className="peer sr-only" checked={Boolean(config.notif_fraud)} onChange={(e) => handleConfigChange('notif_fraud', e.target.checked)} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Resumen Diario de Liquidación ANDE</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Consolidado automático de kWh entregados y margen neto al cierre del día.</p>
                  </div>
                  <label className="cursor-pointer relative inline-block w-10 h-5 shrink-0 ml-4">
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
                  <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white">Roles y Perfiles de Acceso (RBAC)</h2>
                </div>
                <button onClick={openNewRoleModal} className="text-sipar-orange text-xs font-bold hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Crear Rol Nuevo
                </button>
              </div>
              
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {rolesList.map(rol => {
                  const isSuper = rol.name.toLowerCase().includes('super');
                  const activePermsCount = rol.permissions ? Object.values(rol.permissions).filter(Boolean).length : 0;
                  return (
                    <div key={rol.id} className="p-5 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                      <div>
                        <p className="font-bold text-[13px] text-sipar-dark dark:text-white">{rol.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {isSuper ? 'Acceso irrestricto a todos los módulos.' : `${activePermsCount} permisos habilitados en matriz RBAC.`}
                        </p>
                      </div>
                      {isSuper ? (
                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2.5 py-1 rounded-md text-[10px] font-bold border border-purple-200 dark:border-purple-800">
                          Acceso Ilimitado
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleEditRole(rol)} 
                            className="text-sipar-dark dark:text-gray-200 hover:text-sipar-orange bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition"
                          >
                            Configurar Permisos
                          </button>
                          <button
                            onClick={() => handleDeleteRole(rol)}
                            className="p-1.5 text-gray-400 hover:text-red-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition"
                            title="Eliminar Rol"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex justify-center items-center">
                      <Moon className="w-4 h-4 text-sipar-dark dark:text-white" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-sipar-dark dark:text-white">Modo Oscuro</p>
                      <p className="text-[11px] text-gray-400">Sincronizado en todas las vistas del panel</p>
                    </div>
                  </div>
                  <label className="cursor-pointer relative inline-block w-10 h-5">
                    <input type="checkbox" className="peer sr-only" checked={Boolean(config.pref_dark_mode)} onChange={(e) => handleConfigChange('pref_dark_mode', e.target.checked)} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-sipar-orange transition-colors"></div>
                    <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-sipar-dark dark:text-white mb-2">Idioma del Panel</label>
                  <select value={config.pref_language} onChange={(e) => handleConfigChange('pref_language', e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-sipar-dark dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white dark:bg-gray-900">
                    <option>Español (Latinoamérica)</option>
                    <option>English (US)</option>
                    <option>Português (Brasil)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        /* ================= PESTAÑA 2: AUDITORÍA GENERAL UNIFICADA & REPORTES ISO 27001 ================= */
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
          <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sipar-orange" /> Bitácora General de Auditoría ISO/IEC 27001 ({filteredAuditLogs.length})
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Trazabilidad unificada de Autenticación, Usuarios, Tarifas, Finanzas, Tienda y Configuración.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por Módulo */}
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none cursor-pointer"
              >
                <option value="all">Todos los Módulos</option>
                <option value="Autenticación & Accesos">Autenticación & Accesos</option>
                <option value="Usuarios & RBAC">Usuarios & RBAC</option>
                <option value="Tarifas & Precios">Tarifas & Precios</option>
                <option value="Finanzas & Reversiones">Finanzas & Reversiones</option>
                <option value="Tienda & Stock">Tienda & Stock</option>
                <option value="Configuración Global">Configuración Global</option>
              </select>

              {/* Dropdown de Severidad con Lucide Icons */}
              <div className="relative" ref={severityMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSeverityMenuOpen(!isSeverityMenuOpen)}
                  className="bg-gray-800 border border-gray-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 hover:border-sipar-orange transition"
                >
                  <CurrentSeverityIcon className={`w-3.5 h-3.5 ${currentSeverity.color}`} />
                  <span>{currentSeverity.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {isSeverityMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#161B26] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl py-2 z-50">
                    {severityOptions.map(opt => {
                      const IconComp = opt.icon;
                      const isSelected = severityFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => { setSeverityFilter(opt.id); setIsSeverityMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2.5 transition ${
                            isSelected
                              ? 'bg-orange-50 dark:bg-orange-950/40 text-sipar-orange'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                          }`}
                        >
                          <IconComp className={`w-4 h-4 shrink-0 ${opt.color}`} />
                          <span className="flex-1 truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selector de filas (20, 50, 100) */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                <span className="text-xs text-gray-400">Mostrar:</span>
                <select
                  value={auditPageSize}
                  onChange={(e) => setAuditPageSize(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
                >
                  <option value={20} className="bg-gray-900">20</option>
                  <option value={50} className="bg-gray-900">50</option>
                  <option value={100} className="bg-gray-900">100</option>
                </select>
              </div>

              {/* Buscador */}
              <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar actor, IP o detalle..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="bg-transparent border-none text-xs text-white focus:outline-none placeholder-gray-500 w-44"
                />
              </div>

              <button
                onClick={exportGeneralAuditCSV}
                disabled={filteredAuditLogs.length === 0}
                className="bg-sipar-orange hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" /> Exportar CSV
              </button>
            </div>
          </div>

          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                  <th className="p-4 pl-6">Fecha & Hora</th>
                  <th className="p-4">Módulo</th>
                  <th className="p-4">Evento ISO 27001</th>
                  <th className="p-4">Actor / Responsable</th>
                  <th className="p-4">Objetivo & IP</th>
                  <th className="p-4 pr-6">Detalle Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {paginatedAuditLogs.length > 0 ? (
                  paginatedAuditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                      <td className="p-4 pl-6 font-mono text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'medium' }) : 'N/A'}
                      </td>
                      <td className="p-4 font-bold text-sipar-dark dark:text-gray-200 whitespace-nowrap">
                        {log.module}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                          log.status === 'SUCCESS'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : log.status === 'WARNING'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-sipar-dark dark:text-white">
                        {log.actor_email}
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{log.target}</p>
                        <p className="text-[10px] font-mono text-gray-400">IP: {log.ip_address}</p>
                      </td>
                      <td className="p-4 pr-6 text-gray-600 dark:text-gray-300 max-w-md">
                        {log.details}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400">
                      No se encontraron eventos de auditoría con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Controles de Paginación de Auditoría */}
          {filteredAuditLogs.length > 0 && (
            <div className="px-6 py-4 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Mostrando <strong className="text-sipar-dark dark:text-white">{auditStartIndex + 1}</strong> a{' '}
                <strong className="text-sipar-dark dark:text-white">{Math.min(auditEndIndex, filteredAuditLogs.length)}</strong> de{' '}
                <strong className="text-sipar-dark dark:text-white">{filteredAuditLogs.length}</strong> eventos auditados
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                  disabled={safeAuditPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                <span className="px-3 font-bold text-sipar-dark dark:text-white">
                  Página {safeAuditPage} de {totalAuditPages}
                </span>
                <button
                  onClick={() => setAuditPage(p => Math.min(totalAuditPages, p + 1))}
                  disabled={safeAuditPage === totalAuditPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
                >
                  Siguiente <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: MATRIZ COMPLETA DE ROLES Y PERMISOS (RBAC) ================= */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out] border border-gray-200 dark:border-gray-800 max-h-[90vh]">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <UserCog className="w-5 h-5 text-sipar-orange" /> {roleForm.id ? 'Editar Matriz RBAC del Rol' : 'Crear Nuevo Rol RBAC'}
              </h2>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 overflow-y-auto hide-scroll space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Nombre del Perfil / Rol
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Auditor Financiero / Supervisor Técnico"
                  value={roleForm.name} 
                  onChange={(e) => setRoleForm({...roleForm, name: e.target.value})} 
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-sipar-dark dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white dark:bg-gray-900" 
                />
              </div>
              
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
                  Matriz de Módulos y Privilegios (ISO 27001 A.5.15)
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                  {RBAC_MODULES.map(mod => {
                    const verKey = `${mod.key}_ver`;
                    const editKey = `${mod.key}_editar`;
                    return (
                      <div key={mod.key} className="flex items-center justify-between p-3 bg-white dark:bg-sipar-dark hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        <p className="text-xs font-bold text-sipar-dark dark:text-white">{mod.label}</p>
                        <div className="flex gap-5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(roleForm[verKey])}
                              onChange={(e) => setRoleForm({...roleForm, [verKey]: e.target.checked})}
                              className="w-3.5 h-3.5 text-sipar-orange rounded accent-sipar-orange"
                            />
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Lectura</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(roleForm[editKey])}
                              onChange={(e) => setRoleForm({
                                ...roleForm,
                                [editKey]: e.target.checked,
                                [verKey]: e.target.checked ? true : roleForm[verKey]
                              })}
                              className="w-3.5 h-3.5 text-sipar-orange rounded accent-sipar-orange"
                            />
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Escritura</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsRoleModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-sipar-orange hover:bg-orange-600 text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {roleForm.id ? 'Guardar Cambios' : 'Crear Rol'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}