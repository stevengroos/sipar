import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  HardHat, LayoutDashboard, Zap, Users, Wallet, 
  SlidersHorizontal, ShoppingBag, Settings, LogOut, Bell 
} from 'lucide-react';

import Dashboard from './views/Dashboard'; 
import Login from './views/Login'; // <-- IMPORTAMOS EL LOGIN
import Chargers from './views/Chargers'; // <-- Nueva importación
import Usuarios from './views/Usuarios';
import Finanzas from './views/Finanzas';
import Tarifas from './views/Tarifas';
import Tienda from './views/Tienda';
import Configuracion from './views/Configuracion';

// ==========================================
// COMPONENTE: GUARDIA DE SEGURIDAD (RUTAS PROTEGIDAS)
// ==========================================
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('sipar_token');
  if (!token) {
    // Si no hay token, lo mandamos al login inmediatamente
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

  // Función para cerrar sesión
  const handleLogout = () => {
    localStorage.removeItem('sipar_token'); // Borramos el token
    navigate('/login'); // Redirigimos al login
  };

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA]">
      {/* SIDEBAR */}
      <aside className="w-64 bg-sipar-dark text-white flex flex-col h-full shadow-2xl z-20 flex-shrink-0">
        <div className="h-20 flex items-center px-6 border-b border-gray-700/50">
          <HardHat className="text-sipar-orange w-6 h-6 mr-3" />
          <span className="text-2xl font-bold tracking-tight">SIPAR<span className="text-sipar-orange">.</span></span>
          <span className="ml-2 text-[10px] bg-gray-700 px-2 py-0.5 rounded text-gray-300 font-bold tracking-wider mt-1">ADMIN</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1 hide-scroll">
          <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Principal</p>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard en Vivo" />
          <NavItem to="/admin/cargadores" icon={Zap} label="Red de Cargadores" />
          <NavItem to="/admin/usuarios" icon={Users} label="Usuarios & Flota" />
          <NavItem to="/admin/finanzas" icon={Wallet} label="Finanzas & Billeteras" />

          <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">Administración</p>
          <NavItem to="/admin/parametros" icon={SlidersHorizontal} label="Tarifas & Parámetros" />
          <NavItem to="/admin/tienda" icon={ShoppingBag} label="Tienda Accesorios" />
          <NavItem to="/admin/configuracion" icon={Settings} label="Configuración" />
        </nav>

        <div className="p-4 border-t border-gray-700/50">
          {/* BOTÓN DE CERRAR SESIÓN ACTIVADO */}
          <div 
            onClick={handleLogout}
            className="flex items-center gap-3 bg-gray-800 p-3 rounded-xl cursor-pointer hover:bg-gray-700 transition"
          >
            <div className="w-10 h-10 bg-sipar-orange rounded-full flex justify-center items-center text-white font-bold">SG</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white leading-tight">Steven Groos</p>
              <p className="text-xs text-gray-400">Super Admin</p>
            </div>
            <LogOut className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-sipar-dark capitalize">
              {location.pathname.split('/').pop().replace('-', ' ')}
            </h1>
            <div className="flex items-center gap-2 bg-green-50 text-green-600 px-3 py-1 rounded-full text-[11px] font-bold border border-green-100">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Sistema en línea
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="bg-gray-50 rounded-full p-2.5 text-gray-500 hover:text-sipar-orange cursor-pointer transition relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
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
        {/* Raíz redirige al login por defecto */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* RUTA PÚBLICA DE LOGIN */}
        <Route path="/login" element={<Login />} />
        
        {/* RUTAS PROTEGIDAS (Envueltas en ProtectedRoute) */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cargadores" element={<Chargers />} />
          {/* Reemplaza la línea vieja por esta: */}
          <Route path="usuarios" element={<Usuarios />} />          
          <Route path="finanzas" element={<Finanzas />} />
          {/* Reemplaza la ruta de relleno por esta: */}
          <Route path="parametros" element={<Tarifas />} />          
          <Route path="tienda" element={<Tienda />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>

        {/* Cualquier ruta que no exista, manda al login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}