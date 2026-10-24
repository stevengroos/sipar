import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  HardHat, LayoutDashboard, Zap, Users, Wallet, 
  SlidersHorizontal, ShoppingBag, Settings, LogOut, Bell, Clock, ShieldCheck,
  AlertTriangle, AlertCircle, BarChart3, CheckCheck, ExternalLink, X, ShieldAlert
} from 'lucide-react';
import api from './api/axios';

import Dashboard from './views/Dashboard'; 
import Login from './views/Login';
import Chargers from './views/Chargers';
import Usuarios from './views/Usuarios';
import Finanzas from './views/Finanzas';
import Tarifas from './views/Tarifas';
import Tienda from './views/Tienda';
import Configuracion from './views/Configuracion';
import Historial from './views/Historial';
import Perfil from './views/Perfil';

// ==========================================
// COMPONENTE: GUARDIA DE SEGURIDAD (RUTAS PROTEGIDAS)
// ==========================================
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('sipar_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// ==========================================
// COMPONENTE: LAYOUT ADMINISTRATIVO
// ==========================================
function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [systemConfig, setSystemConfig] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('sipar_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Estados del Centro de Notificaciones (Campanita)
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'hardware' | 'fraud' | 'daily'
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem('sipar_read_notifs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const notifMenuRef = useRef(null);

  // Cerrar dropdown de notificaciones al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Función para cerrar sesión limpiando credenciales
  const handleLogout = useCallback(() => {
    localStorage.removeItem('sipar_token');
    localStorage.removeItem('sipar_user');
    navigate('/login');
  }, [navigate]);

  // Convierte el texto de configuración en minutos reales
  const parseSessionMinutes = (sessionStr) => {
    if (!sessionStr) return 30;
    const lower = sessionStr.toLowerCase();
    if (lower.includes('15')) return 15;
    if (lower.includes('30')) return 30;
    if (lower.includes('1 hora') || lower.includes('60')) return 60;
    return 30;
  };

  // Cargar notificaciones activas según los switches de Configuración
  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      if (!token) return;
      const res = await api.get('/api/v1/config/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Error obteniendo notificaciones:", err);
    }
  }, []);

  // 1. Cargar configuración global (Modo Oscuro, Tiempo de Sesión, Perfil y Notificaciones)
  const syncSystemConfig = useCallback(async () => {
    if (localStorage.getItem('sipar_dark_mode') === 'true') {
      document.documentElement.classList.add('dark');
    }

    try {
      const token = localStorage.getItem('sipar_token');
      if (!token) return;

      const [configRes, meRes, notifRes] = await Promise.allSettled([
        api.get('/api/v1/config/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/config/notifications', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (configRes.status === 'fulfilled') {
        const cfg = configRes.value.data;
        setSystemConfig(cfg);
        const isDark = Boolean(cfg.pref_dark_mode);
        localStorage.setItem('sipar_dark_mode', String(isDark));
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        setSessionMinutes(parseSessionMinutes(cfg.security_session));
      } else if (configRes.reason?.response?.status === 401) {
        handleLogout();
        return;
      }

      if (meRes.status === 'fulfilled') {
        setCurrentUser(meRes.value.data);
        localStorage.setItem('sipar_user', JSON.stringify(meRes.value.data));
      } else if (meRes.reason?.response?.status === 401) {
        handleLogout();
      }

      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value.data || []);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  }, [handleLogout]);

  useEffect(() => {
    syncSystemConfig();
    const interval = setInterval(fetchNotifications, 10000);

    const handleConfigEvent = (e) => {
      if (e.detail) {
        setSystemConfig(e.detail);
        setSessionMinutes(parseSessionMinutes(e.detail.security_session));
      }
      syncSystemConfig();
    };
    window.addEventListener('sipar_config_updated', handleConfigEvent);
    return () => {
      clearInterval(interval);
      window.removeEventListener('sipar_config_updated', handleConfigEvent);
    };
  }, [syncSystemConfig, fetchNotifications, location.pathname]);

  // 2. Vigilante de inactividad en tiempo real (ISO 27001)
  useEffect(() => {
    let inactivityTimer;
    const timeoutMs = sessionMinutes * 60 * 1000;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        handleLogout();
      }, timeoutMs);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [sessionMinutes, handleLogout]);

  const markNotifAsRead = (id) => {
    if (!readNotifIds.includes(id)) {
      const updated = [...readNotifIds, id];
      setReadNotifIds(updated);
      localStorage.setItem('sipar_read_notifs', JSON.stringify(updated));
    }
  };

  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    const merged = Array.from(new Set([...readNotifIds, ...allIds]));
    setReadNotifIds(merged);
    localStorage.setItem('sipar_read_notifs', JSON.stringify(merged));
  };

  const unreadCount = notifications.filter(n => !readNotifIds.includes(n.id)).length;
  const visibleNotifications = notifications.filter(n => notifFilter === 'all' || n.category === notifFilter);

  const NavItem = ({ to, icon: Icon, label }) => {
    const isActive = location.pathname.includes(to);
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg font-medium transition ${
          isActive 
            ? 'bg-sipar-orange text-white font-semibold' 
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        <Icon className="w-5 h-5" /> {label}
      </Link>
    );
  };

  const displayFullName = currentUser?.first_name
    ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim()
    : 'Steven Groos';
  const displayInitials = displayFullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase())
    .join('') || 'SG';
  const displayRole = currentUser?.role || 'Super Admin';

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA] dark:bg-[#0B0F17] transition-colors">
      {/* SIDEBAR */}
      <aside className="w-64 bg-sipar-dark text-white flex flex-col h-full shadow-2xl z-20 flex-shrink-0 border-r border-transparent dark:border-gray-800">
        <div className="h-20 flex items-center px-6 border-b border-gray-700/50">
          <HardHat className="text-sipar-orange w-6 h-6 mr-3" />
          <span className="text-2xl font-bold tracking-tight">SIPAR<span className="text-sipar-orange">.</span></span>
          <span className="ml-2 text-[10px] bg-gray-700 px-2 py-0.5 rounded text-gray-300 font-bold tracking-wider mt-1">ADMIN</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1 hide-scroll">
          <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Principal</p>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard en Vivo" />
          <NavItem to="/admin/cargadores" icon={Zap} label="Red de Cargadores" />
          <NavItem to="/admin/historial" icon={Clock} label="Historial & ANDE" />
          <NavItem to="/admin/usuarios" icon={Users} label="Usuarios & Flota" />
          <NavItem to="/admin/finanzas" icon={Wallet} label="Finanzas & Billeteras" />

          <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">Administración</p>
          <NavItem to="/admin/parametros" icon={SlidersHorizontal} label="Tarifas & Parámetros" />
          <NavItem to="/admin/tienda" icon={ShoppingBag} label="Tienda Accesorios" />
          <NavItem to="/admin/configuracion" icon={Settings} label="Configuración" />
          <NavItem to="/admin/perfil" icon={ShieldCheck} label="Mi Perfil & MFA" />
        </nav>

        <div className="p-4 border-t border-gray-700/50">
          <div className="flex items-center gap-3 bg-gray-800 p-3 rounded-xl hover:bg-gray-700/80 transition">
            <Link
              to="/admin/perfil"
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              title="Ir a Mi Perfil & Seguridad MFA"
            >
              <div className="w-10 h-10 bg-sipar-orange rounded-full flex justify-center items-center text-white font-bold shrink-0 relative">
                {displayInitials}
                {currentUser?.mfa_enabled && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-gray-800 rounded-full"
                    title="2FA Activo"
                  ></span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">{displayFullName}</p>
                <p className="text-xs text-gray-400 capitalize truncate">{displayRole}</p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700 transition"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-20 bg-white dark:bg-sipar-dark shadow-sm border-b border-transparent dark:border-gray-800 flex items-center justify-between px-8 z-30 flex-shrink-0 transition-colors">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-sipar-dark dark:text-white capitalize">
              {location.pathname.split('/').pop().replace('-', ' ')}
            </h1>
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-[11px] font-bold border border-green-100 dark:border-green-800/40">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Sistema en línea
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/admin/perfil"
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-sipar-orange border border-gray-200 dark:border-gray-700 transition"
            >
              <ShieldCheck className="w-4 h-4 text-sipar-orange" />
              {currentUser?.mfa_enabled ? '2FA Protegido' : 'Configurar 2FA'}
            </Link>

            {/* ================= CAMPANITA DE NOTIFICACIONES CONECTADA A CONFIGURACIÓN ================= */}
            <div className="relative" ref={notifMenuRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen(prev => !prev)}
                className={`rounded-full p-2.5 transition relative border ${
                  isNotifOpen
                    ? 'bg-orange-50 dark:bg-orange-950/40 text-sipar-orange border-orange-200 dark:border-orange-800'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:text-sipar-orange border-gray-200 dark:border-gray-700'
                }`}
                title="Centro de Notificaciones Operativas"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-white dark:border-sipar-dark animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-[#141923] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-50 animate-[fadeIn_0.15s_ease-out]">
                  
                  {/* Cabecera del panel de notificaciones */}
                  <div className="px-5 py-4 bg-sipar-dark text-white flex items-center justify-between border-b border-gray-800">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Bell className="w-4 h-4 text-sipar-orange" /> Centro de Alertas SIPAR
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {unreadCount > 0 ? `${unreadCount} alerta(s) sin leer` : 'Todo al día'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          className="text-[11px] font-bold text-sipar-orange hover:underline flex items-center gap-1"
                          title="Marcar todas como leídas"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Leídas
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsNotifOpen(false)}
                        className="text-gray-400 hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Filtros rápidos por categoría */}
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1.5 overflow-x-auto hide-scroll">
                    {[
                      { id: 'all', label: `Todas (${notifications.length})` },
                      { id: 'hardware', label: 'Hardware OCPP', enabled: systemConfig?.notif_hardware },
                      { id: 'fraud', label: 'Disputas & Seguridad', enabled: systemConfig?.notif_fraud },
                      { id: 'daily', label: 'Resumen Diario', enabled: systemConfig?.notif_daily }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNotifFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition flex items-center gap-1 ${
                          notifFilter === tab.id
                            ? 'bg-sipar-orange text-white shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-sipar-orange'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.id !== 'all' && tab.enabled === false && (
                          <span className="text-[9px] opacity-60">(OFF)</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Lista de Notificaciones */}
                  <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/80 hide-scroll">
                    {visibleNotifications.length > 0 ? (
                      visibleNotifications.map(item => {
                        const isUnread = !readNotifIds.includes(item.id);
                        const IconComp = item.category === 'hardware'
                          ? Zap
                          : item.category === 'fraud'
                          ? ShieldAlert
                          : BarChart3;

                        const iconColor = item.severity === 'danger'
                          ? 'bg-red-50 dark:bg-red-950/40 text-red-500 border-red-200 dark:border-red-800/60'
                          : item.severity === 'warning'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-500 border-amber-200 dark:border-amber-800/60'
                          : 'bg-blue-50 dark:bg-blue-950/40 text-blue-500 border-blue-200 dark:border-blue-800/60';

                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              markNotifAsRead(item.id);
                              setIsNotifOpen(false);
                              navigate(item.link);
                            }}
                            className={`p-4 flex items-start gap-3.5 cursor-pointer transition ${
                              isUnread
                                ? 'bg-orange-50/30 dark:bg-orange-950/15 hover:bg-orange-50/60 dark:hover:bg-orange-950/25'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/40 opacity-80'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
                              <IconComp className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-extrabold text-sipar-dark dark:text-white truncate">
                                  {item.title}
                                </p>
                                {isUnread && (
                                  <span className="w-2 h-2 rounded-full bg-sipar-orange shrink-0"></span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                                {item.message}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] font-mono text-gray-400">
                                  {item.timestamp
                                    ? new Date(item.timestamp).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
                                    : 'En vivo'}
                                </span>
                                <span className="text-[10px] font-bold text-sipar-orange flex items-center gap-0.5">
                                  Ver módulo <ExternalLink className="w-2.5 h-2.5" />
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center">
                        <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-xs font-bold text-sipar-dark dark:text-white">
                          No hay alertas activas en esta vista
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Puedes activar o desactivar canales desde Configuración.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Pie del menú desplegable con estado de los switches de Configuración */}
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span>Canales activos:</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${systemConfig?.notif_hardware ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-400'}`}>
                        HW
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${systemConfig?.notif_fraud ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-400'}`}>
                        Fraude
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${systemConfig?.notif_daily ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-200 dark:bg-gray-800 text-gray-400'}`}>
                        Diario
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        navigate('/admin/configuracion');
                      }}
                      className="font-bold text-sipar-orange hover:underline flex items-center gap-1"
                    >
                      <Settings className="w-3.5 h-3.5" /> Configurar
                    </button>
                  </div>

                </div>
              )}
            </div>

          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 hide-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ==========================================
// COMPONENTE: RUTAS PRINCIPALES
// ==========================================
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cargadores" element={<Chargers />} />
          <Route path="historial" element={<Historial />} />
          <Route path="usuarios" element={<Usuarios />} />          
          <Route path="finanzas" element={<Finanzas />} />
          <Route path="parametros" element={<Tarifas />} />          
          <Route path="tienda" element={<Tienda />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="perfil" element={<Perfil />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}