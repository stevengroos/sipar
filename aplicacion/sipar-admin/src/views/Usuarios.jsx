import { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, UserPlus, CheckCircle2, AlertTriangle, 
  Smartphone, Search, Loader2, X, Save, ShieldAlert, UserX,
  Lock, Unlock, KeyRound, History, Download, Globe, Clock, RotateCcw
} from 'lucide-react';
import api from '../api/axios';

export default function Usuarios() {
  const [internalUsers, setInternalUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeViewTab, setActiveViewTab] = useState('usuarios'); // 'usuarios' | 'auditoria'
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const [formData, setFormData] = useState({
    id: null,
    first_name: '',
    last_name: '',
    email: '',
    role: 'operador',
    password: '',
    must_change_password: true,
    is_active: true
  });

  // Conductores de la App
  const [appUsers] = useState([
    { id: 101, first_name: 'Juan', last_name: 'Pérez', email: 'juan@mail.com', balance: 150000 },
    { id: 102, first_name: 'María', last_name: 'González', email: 'maria@mail.com', balance: 45000 }
  ]);

  const fetchSecurityData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [usersRes, logsRes] = await Promise.all([
        api.get('/api/v1/users/?include_inactive=true', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/users/audit-logs?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setInternalUsers(usersRes.data);
      setAuditLogs(logsRes.data);
    } catch (error) {
      console.error("Error cargando datos de seguridad:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4500);
  };

  const openCreateModal = () => {
    setFormData({
      id: null, first_name: '', last_name: '', email: '', role: 'operador',
      password: '', must_change_password: true, is_active: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setFormData({
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      role: user.role || 'operador',
      password: '',
      must_change_password: Boolean(user.must_change_password),
      is_active: user.is_active !== false
    });
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        role: formData.role,
        password: formData.password,
        must_change_password: formData.must_change_password,
        is_active: formData.is_active
      };

      if (formData.id) {
        await api.put(`/api/v1/users/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `Acceso de ${formData.first_name} actualizado y auditado.`);
      } else {
        await api.post('/api/v1/users/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `Usuario creado conforme a la norma ISO 27001.`);
      }
      
      setIsModalOpen(false);
      fetchSecurityData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockUser = async (user) => {
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post(`/api/v1/users/${user.id}/unlock`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `Cuenta de ${user.email} desbloqueada y reactivada.`);
      fetchSecurityData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'No se pudo desbloquear la cuenta.');
    }
  };

  const handleResetUserMfa = async (user) => {
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post(`/api/v1/users/${user.id}/reset-mfa`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', `2FA de ${user.email} reseteado. Podrá vincular un nuevo teléfono.`);
      setIsModalOpen(false);
      fetchSecurityData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'No tienes permiso para resetear 2FA.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/users/${selectedUser.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', 'Cuenta suspendida y registrada en auditoría.');
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      fetchSecurityData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'No tienes permisos o intentas suspenderte a ti mismo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportAuditLogsCSV = () => {
    if (auditLogs.length === 0) return;
    const headers = ["ID Evento", "Fecha y Hora", "Actor / Usuario", "Accion ISO 27001", "Objetivo", "Direccion IP", "Nivel", "Detalle"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = auditLogs.map(log => [
      log.id,
      log.created_at ? new Date(log.created_at).toLocaleString('es-PY') : 'N/A',
      log.actor_email,
      log.action,
      log.target,
      log.ip_address,
      log.status,
      log.details
    ].map(escapeCsv).join(','));

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Auditoria_Seguridad_ISO27001_SIPAR.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // KPIs de Seguridad ISO 27001
  const securityStats = useMemo(() => {
    const activeUsers = internalUsers.filter(u => u.is_active);
    const mfaActiveCount = activeUsers.filter(u => u.mfa_enabled).length;
    const mfaRate = activeUsers.length > 0 ? Math.round((mfaActiveCount / activeUsers.length) * 100) : 0;
    const now = Date.now();
    const lockedOrSuspended = internalUsers.filter(u => !u.is_active || (u.locked_until && new Date(u.locked_until).getTime() > now)).length;
    const expiredPasswords = activeUsers.filter(u => {
      if (!u.password_changed_at) return false;
      const days = (now - new Date(u.password_changed_at).getTime()) / 86400000;
      return days > 90 || u.must_change_password;
    }).length;

    return {
      totalUsers: internalUsers.length,
      activeCount: activeUsers.length,
      mfaActiveCount,
      mfaRate,
      lockedOrSuspended,
      expiredPasswords
    };
  }, [internalUsers]);

  const filteredUsers = useMemo(() => {
    return internalUsers.filter(u =>
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [internalUsers, searchTerm]);

  if (loading) {
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
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Control ISO 27001 Aplicado' : 'Error en la operación'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* CABECERA Y SELECTOR DE VISTA */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sipar-orange" /> Gestión de Identidades & Accesos (ISO 27001)
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Control de acceso basado en roles (RBAC), monitoreo de 2FA, bloqueo antibruza bruta y bitácora de auditoría.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-sipar-dark p-1.5 rounded-xl border border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveViewTab('usuarios')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeViewTab === 'usuarios'
                ? 'bg-sipar-orange text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-sipar-dark dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Usuarios & Conductores
          </button>
          <button
            onClick={() => setActiveViewTab('auditoria')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeViewTab === 'auditoria'
                ? 'bg-sipar-orange text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-sipar-dark dark:hover:text-white'
            }`}
          >
            <History className="w-4 h-4" /> Bitácora ISO 27001 ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* KPIs DE CUMPLIMIENTO ISO 27001 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Adopción MFA / 2FA</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">{securityStats.mfaRate}%</p>
            <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
              {securityStats.mfaActiveCount} de {securityStats.activeCount} activos con 2FA
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Cuentas Bloqueadas / Susp.</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">{securityStats.lockedOrSuspended}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Protección anti-fuerza bruta</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Rotación Pendiente (&gt;90d)</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">{securityStats.expiredPasswords}</p>
            <p className="text-xs text-amber-500 font-semibold mt-1">Política de credenciales</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Eventos Auditados</p>
            <p className="text-2xl font-extrabold text-sipar-dark dark:text-white mt-1">{auditLogs.length}</p>
            <p className="text-xs text-blue-500 font-semibold mt-1">Control A.8.15 Activo</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center">
            <History className="w-6 h-6" />
          </div>
        </div>
      </div>

      {activeViewTab === 'usuarios' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ================= EQUIPO INTERNO (8 COLS) ================= */}
          <div className="lg:col-span-8 w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex flex-wrap justify-between items-center gap-3 bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sipar-orange" /> Equipo Interno & Administradores ({filteredUsers.length})
              </h2>
              <div className="flex items-center gap-3">
                <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-gray-200 dark:border-gray-700">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar usuario o rol..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none text-xs text-sipar-dark dark:text-white focus:outline-none w-40"
                  />
                </div>
                <button onClick={openCreateModal} className="bg-sipar-orange hover:bg-orange-600 text-white px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition shadow-sm">
                  <UserPlus className="w-3.5 h-3.5" /> Invitar Usuario
                </button>
              </div>
            </div>

            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white dark:bg-sipar-dark border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    <th className="px-5 py-3.5">Usuario / Correo</th>
                    <th className="px-5 py-3.5">Rol & Estado MFA</th>
                    <th className="px-5 py-3.5">Último Acceso & Clave</th>
                    <th className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-xs">
                  {filteredUsers.map(user => {
                    const isLocked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
                    const pwdDays = user.password_changed_at
                      ? Math.max(0, Math.floor((Date.now() - new Date(user.password_changed_at).getTime()) / 86400000))
                      : 0;

                    return (
                      <tr key={user.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition ${!user.is_active && 'opacity-60'}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-[13px] text-sipar-dark dark:text-white">
                              {user.first_name} {user.last_name}
                            </p>
                            {!user.is_active && (
                              <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[9px] font-bold px-2 py-0.5 rounded-full">
                                Suspendido
                              </span>
                            )}
                            {isLocked && (
                              <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Bloqueado (Fuerza Bruta)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
                        </td>

                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border mb-1.5 inline-block capitalize ${
                            user.role === 'superadmin'
                              ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800'
                              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                          }`}>
                            {user.role}
                          </span>
                          <br />
                          {user.mfa_enabled ? (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> 2FA TOTP Activo
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Sin 2FA vinculado
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-[11px] font-semibold text-sipar-dark dark:text-gray-200">
                            {user.last_login_at
                              ? new Date(user.last_login_at).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
                              : 'Sin ingresos'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            IP: {user.last_login_ip || 'N/A'} • Clave: {pwdDays}d
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {(isLocked || !user.is_active) && (
                              <button
                                onClick={() => handleUnlockUser(user)}
                                className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-md text-[11px] font-bold hover:bg-emerald-500 hover:text-white transition flex items-center gap-1"
                                title="Desbloquear / Reactivar Cuenta"
                              >
                                <Unlock className="w-3 h-3" /> Desbloquear
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(user)}
                              className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-md text-[11px] font-bold hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-orange shadow-sm transition"
                            >
                              Gestionar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================= CONDUCTORES APP MÓVIL (4 COLS) ================= */}
          <div className="lg:col-span-4 w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
            <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sipar-orange" /> Conductores App
              </h2>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Conductor</th>
                    <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider text-right">Billetera</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {appUsers.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                      <td className="px-5 py-4">
                        <p className="font-bold text-[13px] text-sipar-dark dark:text-white">{user.first_name} {user.last_name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[13px]">
                          {user.balance.toLocaleString('es-PY')} ₲
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        /* ================= VISTA DE BITÁCORA DE AUDITORÍA ISO 27001 ================= */
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sipar-orange" /> Bitácora de Auditoría de Seguridad (ISO/IEC 27001 A.8.15)
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Registro cronológico inmutable de inicios de sesión, bloqueos, cambios de privilegios y configuración de MFA.
              </p>
            </div>
            <button
              onClick={exportAuditLogsCSV}
              className="bg-sipar-orange hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Exportar Auditoría CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto hide-scroll">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400">
                  <th className="p-4 pl-6">Fecha & Hora</th>
                  <th className="p-4">Actor / Cuenta</th>
                  <th className="p-4">Evento ISO 27001</th>
                  <th className="p-4">Objetivo</th>
                  <th className="p-4">Dirección IP</th>
                  <th className="p-4 pr-6">Detalle del Evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="p-4 pl-6 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {log.created_at ? new Date(log.created_at).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'medium' }) : 'N/A'}
                    </td>
                    <td className="p-4 font-bold text-sipar-dark dark:text-white">{log.actor_email}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : log.status === 'WARNING'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300 font-semibold">{log.target}</td>
                    <td className="p-4 font-mono text-[11px] text-gray-500">{log.ip_address}</td>
                    <td className="p-4 pr-6 text-gray-600 dark:text-gray-300">{log.details}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400">Sin eventos registrados aún.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREAR / EDITAR USUARIO INTERNO ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.3s_ease-out] transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-sipar-orange" /> {formData.id ? 'Gestionar Identidad & Privilegios' : 'Invitar al Equipo (ISO 27001)'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmitUser} className="space-y-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Nombre</label>
                    <input type="text" required value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-sipar-dark dark:text-white font-bold bg-white dark:bg-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Apellido</label>
                    <input type="text" required value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-sipar-dark dark:text-white font-bold bg-white dark:bg-gray-900" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Correo Corporativo</label>
                    <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-sipar-dark dark:text-white font-bold bg-white dark:bg-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Rol RBAC</label>
                    <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-sipar-dark dark:text-white font-bold bg-white dark:bg-gray-900">
                      <option value="superadmin">Super Administrador</option>
                      <option value="admin">Administrador</option>
                      <option value="operador">Operador (Soporte)</option>
                    </select>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-xl p-4">
                  <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> {formData.id ? 'Forzar Reseteo de Contraseña (Opcional)' : 'Contraseña Inicial (Política ISO 27001)'}
                  </label>
                  <input
                    type="text"
                    required={!formData.id}
                    placeholder={formData.id ? "Dejar vacío para mantener la actual..." : "Mín. 8 caract., Mayús, Minús, Núm y Símbolo (Ej. Sipar2026!)"}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-3.5 py-2 border border-red-200 dark:border-red-800 rounded-lg text-xs text-sipar-dark dark:text-white bg-white dark:bg-gray-900"
                  />
                  <label className="flex items-center gap-2 mt-2.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.must_change_password}
                      onChange={e => setFormData({...formData, must_change_password: e.target.checked})}
                      className="rounded text-sipar-orange focus:ring-sipar-orange"
                    />
                    Exigir cambio de contraseña en el próximo inicio de sesión
                  </label>
                </div>

                {/* Si el usuario tiene 2FA activo, permitir al SuperAdmin resetearlo en caso de pérdida de celular */}
                {formData.id && selectedUser?.mfa_enabled && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-amber-800 dark:text-amber-300">2FA TOTP Vinculado</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">¿El usuario perdió o cambió su teléfono?</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetUserMfa(selectedUser)}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold rounded-lg hover:bg-amber-100 transition flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Resetear 2FA
                    </button>
                  </div>
                )}

                <div className="flex justify-between items-center gap-3 pt-2">
                  {formData.id && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="text-red-500 text-xs font-bold hover:underline flex items-center gap-1.5"
                    >
                      <UserX className="w-4 h-4" /> Suspender Cuenta
                    </button>
                  )}
                  <div className={`flex gap-3 ${!formData.id && 'w-full'}`}>
                    <button type="button" onClick={() => setIsModalOpen(false)} className={`py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs ${!formData.id ? 'flex-1' : 'px-5'}`}>Cancelar</button>
                    <button type="submit" disabled={isSubmitting} className={`py-2.5 bg-sipar-orange hover:bg-orange-600 text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center gap-2 disabled:opacity-70 ${!formData.id ? 'flex-1' : 'px-6'}`}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {formData.id ? 'Guardar Cambios' : 'Crear Usuario'}</>}
                    </button>
                  </div>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR SUSPENSIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <UserX className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Suspender Cuenta?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              El usuario perderá inmediatamente el acceso al panel administrativo. Su historial y registros de auditoría ISO 27001 se conservarán intactos.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm">Cancelar</button>
              <button onClick={handleDeleteConfirm} disabled={isSubmitting} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm shadow-sm">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, suspender'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}