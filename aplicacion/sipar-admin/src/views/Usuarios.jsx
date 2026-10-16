import { useState, useEffect } from 'react';
import { 
  ShieldCheck, UserPlus, CheckCircle2, AlertTriangle, 
  Smartphone, Search, Loader2, X, Save, ShieldAlert, UserX
} from 'lucide-react';
import api from '../api/axios';

export default function Usuarios() {
  const [internalUsers, setInternalUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estados para los Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const [formData, setFormData] = useState({
    id: null, first_name: '', last_name: '', email: '', role: 'operador', password: ''
  });

  // Mock temporal de conductores de la App
  const [appUsers] = useState([
    { id: 101, first_name: 'Juan', last_name: 'Pérez', email: 'juan@mail.com', balance: 150000 },
    { id: 102, first_name: 'María', last_name: 'González', email: 'maria@mail.com', balance: 45000 }
  ]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const response = await api.get('/api/v1/users/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filtramos para mostrar solo al equipo interno (superadmin, admin, operador)
      const team = response.data.filter(u => ['superadmin', 'admin', 'operador'].includes(u.role));
      setInternalUsers(team);
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const openCreateModal = () => {
    setFormData({ id: null, first_name: '', last_name: '', email: '', role: 'operador', password: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setFormData({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      password: '' // Se deja vacío para no sobreescribir a menos que el admin escriba una nueva
    });
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
        password: formData.password
      };

      if (formData.id) {
        await api.put(`/api/v1/users/${formData.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `Usuario ${formData.first_name} actualizado.`);
      } else {
        await api.post('/api/v1/users/', payload, { headers: { Authorization: `Bearer ${token}` } });
        showNotification('success', `Usuario creado exitosamente.`);
      }
      
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al procesar la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/users/${selectedUser.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', 'Cuenta suspendida correctamente.');
      setIsDeleteModalOpen(false);
      fetchUsers();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'No tienes permisos o intentas borrarte a ti mismo.');
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
          notification.type === 'success' ? 'bg-white border-green-200 text-green-700' : 'bg-white border-red-200 text-red-700'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark">
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error en la operación'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8 items-start">
        
        {/* ================= EQUIPO INTERNO ================= */}
        <div className="w-full bg-white rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="text-[15px] font-bold text-sipar-dark flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sipar-orange" /> Equipo Interno (Admin)
            </h2>
            <button onClick={openCreateModal} className="bg-sipar-dark hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition shadow-sm">
              <UserPlus className="w-3.5 h-3.5" /> Invitar
            </button>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Usuario / Mail</th>
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Seguridad</th>
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {internalUsers.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[13px] text-sipar-dark">{user.first_name} {user.last_name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      {user.role === 'superadmin' ? (
                        <>
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-100 mb-1.5 inline-block capitalize">{user.role}</span><br/>
                          <span className="text-[10px] text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 2FA Activo</span>
                        </>
                      ) : (
                        <>
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 mb-1.5 inline-block capitalize">{user.role}</span><br/>
                          <span className="text-[10px] text-red-500 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Sin 2FA</span>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                       <button onClick={() => openEditModal(user)} className="px-2.5 py-1.5 bg-white border border-gray-200 text-sipar-dark rounded-md text-[11px] font-bold hover:bg-gray-50 hover:text-sipar-orange shadow-sm transition">
                          Gestionar
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ================= CONDUCTORES (APP MÓVIL) ================= */}
        <div className="w-full bg-white rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 overflow-hidden flex flex-col">
          <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
            <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-sipar-orange" /> App Conductores
            </h2>
            <div className="bg-gray-800 rounded-lg px-2 py-1.5 flex items-center gap-2 border border-gray-700">
              <Search className="w-3 h-3 text-gray-400" />
              <input type="text" placeholder="Buscar..." className="bg-transparent border-none text-[11px] text-white focus:outline-none placeholder-gray-500 w-24" />
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-500 tracking-wider">Conductor</th>
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-500 tracking-wider">Balance</th>
                  <th className="px-5 py-3 text-[10px] uppercase font-bold text-gray-500 tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {appUsers.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[13px] text-sipar-dark">{user.first_name} {user.last_name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-sipar-dark text-[13px]">
                        {user.balance.toLocaleString('es-PY')} ₲
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button className="px-2.5 py-1.5 bg-white border border-gray-200 text-sipar-dark rounded-md text-[11px] font-bold hover:bg-gray-50 hover:text-sipar-orange shadow-sm transition">
                        Ver Perfil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ================= MODAL: CREAR / EDITAR USUARIO INTERNO ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden border border-gray-200 animate-[slideUp_0.3s_ease-out]">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-sipar-dark flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-sipar-orange" /> {formData.id ? 'Gestionar Acceso' : 'Invitar al Equipo'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmitUser}>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Nombre</label>
                    <input type="text" required value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-sipar-dark font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Apellido</label>
                    <input type="text" required value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-sipar-dark font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white" />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Correo Corporativo</label>
                  <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-sipar-dark font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white" />
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Rol Asignado</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-sipar-dark font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition bg-white">
                    <option value="superadmin">Super Administrador</option>
                    <option value="admin">Administrador</option>
                    <option value="operador">Operador (Soporte Técnico)</option>
                  </select>
                </div>

                <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4">
                  <label className="block text-[11px] font-bold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> {formData.id ? 'Nueva Contraseña (Opcional)' : 'Contraseña Inicial (Obligatorio)'}</label>
                  <input type="text" required={!formData.id} placeholder={formData.id ? "Escribe para forzar reseteo..." : "Ej. Sipar2026!"} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2.5 border border-red-200 rounded-lg text-sm text-sipar-dark focus:outline-none focus:ring-2 focus:ring-red-400 transition bg-white" />
                  {formData.id && <p className="text-[10px] text-red-500 mt-1.5">Si se deja vacío, la contraseña del usuario no cambiará.</p>}
                </div>

                <div className="flex justify-between items-center gap-3">
                  {formData.id && (
                     <button type="button" onClick={() => { setSelectedUser(formData); setIsDeleteModalOpen(true); }} className="text-red-500 text-xs font-bold hover:underline flex items-center gap-1.5">
                       <UserX className="w-4 h-4" /> Suspender
                     </button>
                  )}
                  <div className={`flex gap-3 ${!formData.id && 'w-full'}`}>
                    <button type="button" onClick={() => setIsModalOpen(false)} className={`py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition ${!formData.id ? 'flex-1' : 'px-5'}`}>Cancelar</button>
                    <button type="submit" disabled={isSubmitting} className={`py-3 bg-sipar-dark text-white font-bold rounded-xl shadow-md hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-70 ${!formData.id ? 'flex-1' : 'px-6'}`}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> {formData.id ? 'Guardar Cambios' : 'Invitar Usuario'}</>}
                    </button>
                  </div>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 animate-[slideUp_0.2s_ease-out]">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <UserX className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark mb-2">¿Suspender Cuenta?</h3>
            <p className="text-sm text-gray-500 mb-6">
              El usuario perderá inmediatamente el acceso al panel administrativo. No se borrará su historial de auditoría.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {setIsDeleteModalOpen(false); setSelectedUser(null);}} className="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition text-sm">Cancelar</button>
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