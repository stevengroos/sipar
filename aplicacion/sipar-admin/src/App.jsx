import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  HardHat, LayoutDashboard, Zap, Users, Wallet, 
  SlidersHorizontal, ShoppingBag, Settings, LogOut, Bell, Clock, ShieldCheck 
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
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('sipar_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

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

  // 1. Cargar configuración global (Modo Oscuro, Tiempo de Sesión y Perfil Actual)
  const syncSystemConfig = useCallback(async () => {
    if (localStorage.getItem('sipar_dark_mode') === 'true') {
      document.documentElement.classList.add('dark');
    }

    try {
      const token = localStorage.getItem('sipar_token');
      if (!token) return;

      const [configRes, meRes] = await Promise.allSettled([
        api.get('/api/v1/config/', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (configRes.status === 'fulfilled') {
        const isDark = Boolean(configRes.value.data.pref_dark_mode);
        localStorage.setItem('sipar_dark_mode', String(isDark));
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        setSessionMinutes(parseSessionMinutes(configRes.value.data.security_session));
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
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  }, [handleLogout]);

  useEffect(() => {
    syncSystemConfig();
    const handleConfigEvent = (e) => {
      if (e.detail) {
        setSessionMinutes(parseSessionMinutes(e.detail.security_session));
      } else {
        syncSystemConfig();
      }
    };
    window.addEventListener('sipar_config_updated', handleConfigEvent);
    return () => window.removeEventListener('sipar_config_updated', handleConfigEvent);
  }, [syncSystemConfig, location.pathname]);

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

  // Iniciales y nombre dinámicos para el bloque inferior del Sidebar
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
        <header className="h-20 bg-white dark:bg-sipar-dark shadow-sm border-b border-transparent dark:border-gray-800 flex items-center justify-between px-8 z-10 flex-shrink-0 transition-colors">
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
            <div className="bg-gray-50 dark:bg-gray-800 rounded-full p-2.5 text-gray-500 dark:text-gray-300 hover:text-sipar-orange cursor-pointer transition relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-sipar-dark"></span>
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