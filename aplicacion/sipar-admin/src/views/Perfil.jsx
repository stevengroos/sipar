import { useState, useEffect } from 'react';
import { 
  User, ShieldCheck, KeyRound, Lock, Smartphone, CheckCircle2, 
  AlertTriangle, Loader2, Save, Copy, Check, Eye, EyeOff, Clock, Globe
} from 'lucide-react';
import api from '../api/axios';

export default function Perfil() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Perfil
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Estados de Vinculación MFA (2FA)
  const [mfaSetupData, setMfaSetupData] = useState(null); // { secret, otpauth_uri }
  const [otpCode, setOtpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableMfaModal, setShowDisableMfaModal] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Estados de Cambio de Contraseña ISO 27001
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const showToast = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4500);
  };

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(res.data);
      setFirstName(res.data.first_name || '');
      setLastName(res.data.last_name || '');
    } catch (err) {
      console.error("Error cargando perfil:", err);
      showToast('error', 'No se pudo cargar la información del perfil.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.put('/api/v1/auth/me', {
        first_name: firstName,
        last_name: lastName
      }, { headers: { Authorization: `Bearer ${token}` } });
      setProfile(res.data);
      showToast('success', 'Datos personales actualizados.');
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Error al actualizar el perfil.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.post('/api/v1/auth/mfa/setup', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMfaSetupData(res.data);
      setOtpCode('');
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Error al generar clave 2FA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmEnableMfa = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post('/api/v1/auth/mfa/enable', { code: otpCode }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMfaSetupData(null);
      setOtpCode('');
      showToast('success', '¡Autenticación 2FA activada y vinculada con éxito!');
      fetchProfile();
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Código inválido. Verifica tu aplicación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisableMfa = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post('/api/v1/auth/mfa/disable', { password: disablePassword }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowDisableMfaModal(false);
      setDisablePassword('');
      showToast('success', 'Autenticación 2FA desactivada.');
      fetchProfile();
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Contraseña incorrecta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reglas de validación ISO 27001 en vivo
  const passwordChecks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]]/.test(newPassword),
    match: newPassword.length > 0 && newPassword === confirmPassword
  };
  const isPasswordCompliant = Object.values(passwordChecks).every(Boolean);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!isPasswordCompliant) {
      showToast('error', 'La nueva contraseña no cumple todos los requisitos ISO 27001.');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      }, { headers: { Authorization: `Bearer ${token}` } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', 'Contraseña actualizada conforme a la norma ISO 27001.');
      fetchProfile();
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'No se pudo cambiar la contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copySecretToClipboard = () => {
    if (!mfaSetupData?.secret) return;
    navigator.clipboard.writeText(mfaSetupData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  // Cálculo de días desde el último cambio de contraseña (rotación 90 días ISO 27001)
  const passwordAgeDays = profile?.password_changed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(profile.password_changed_at).getTime()) / 86400000))
    : 0;
  const daysRemainingRotation = Math.max(0, 90 - passwordAgeDays);

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
              {notification.type === 'success' ? 'Seguridad Actualizada' : 'Aviso de Seguridad'}
            </p>
            <p className="text-xs mt-0.5">{notification.message}</p>
          </div>
        </div>
      )}

      {/* CABECERA */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sipar-orange" /> Mi Perfil & Seguridad ISO 27001
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestiona tu identidad corporativa, vinculación de Doble Factor (MFA/2FA) y rotación de credenciales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            profile?.mfa_enabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
          }`}>
            {profile?.mfa_enabled ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {profile?.mfa_enabled ? 'Cumplimiento ISO 27001: 2FA Activo' : 'Recomendado: Activar 2FA'}
          </span>
        </div>
      </div>

      {/* ALERTA SI DEBE CAMBIAR CONTRASEÑA OBLIGATORIAMENTE */}
      {profile?.must_change_password && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-800 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-extrabold">Cambio de Contraseña Requerido por Política ISO 27001</p>
              <p className="mt-0.5">El administrador solicitó que actualices tu contraseña temporal antes de continuar operando.</p>
            </div>
          </div>
        </div>
      )}

      {/* FILA DE TARJETAS DE ESTADO DE SEGURIDAD PERSONAL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Rol & Nivel de Acceso</p>
            <p className="text-lg font-extrabold text-sipar-dark dark:text-white capitalize mt-1">{profile?.role}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{profile?.email}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-sipar-orange flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Último Inicio de Sesión</p>
            <p className="text-sm font-bold text-sipar-dark dark:text-white mt-1">
              {profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sesión actual'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1 font-mono">
              <Globe className="w-3.5 h-3.5 text-gray-400" /> IP: {profile?.last_login_ip || 'Registrada'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark p-5 rounded-[20px] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase">Vigencia de Contraseña (90 días)</p>
            <p className="text-lg font-extrabold text-sipar-dark dark:text-white mt-1">
              {daysRemainingRotation} días restantes
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Cambiada hace {passwordAgeDays} {passwordAgeDays === 1 ? 'día' : 'días'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= COLUMNA IZQUIERDA (7 COLS): VINCULACIÓN MFA / 2FA ================= */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="bg-sipar-dark px-6 py-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sipar-orange" /> Autenticación Multifactor (MFA / 2FA)
              </h3>
              <span className="text-[10px] font-mono bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700">
                ISO 27001 A.8.5
              </span>
            </div>

            <div className="p-6">
              {profile?.mfa_enabled ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-800/60 flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-green-800 dark:text-green-300">
                        Doble Factor de Autenticación (TOTP) Vinculado y Activo
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-400 mt-1 leading-relaxed">
                        Tu cuenta está protegida con códigos dinámicos de 6 dígitos cada 30 segundos. Cada vez que inicies sesión se te solicitará el código de tu teléfono.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDisableMfaModal(true)}
                      className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    >
                      Desvincular / Desactivar 2FA
                    </button>
                  </div>
                </div>
              ) : !mfaSetupData ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    Protege tu cuenta administrativa contra accesos no autorizados vinculando una aplicación autenticadora como <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> o <strong>Authy</strong>.
                  </p>

                  <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
                    <p className="font-bold text-sipar-dark dark:text-white">¿Cómo funciona la vinculación?</p>
                    <p>1. Haz clic en <strong>Generar Código QR de Vinculación</strong>.</p>
                    <p>2. Abre la app autenticadora en tu celular y escanea el código QR.</p>
                    <p>3. Ingresa el código de 6 dígitos que aparece en tu celular para confirmar.</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartMfaSetup}
                    disabled={isSubmitting}
                    className="bg-sipar-orange hover:bg-orange-600 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-sm transition flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Smartphone className="w-4 h-4" /> Generar Código QR de Vinculación</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl border border-gray-200 dark:border-gray-800">
                    
                    {/* Código QR Generado */}
                    <div className="md:col-span-5 flex flex-col items-center">
                      <div className="bg-white p-3 rounded-2xl shadow-md border border-gray-200">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaSetupData.otpauth_uri)}`}
                          alt="Código QR 2FA SIPAR"
                          className="w-40 h-40 object-contain"
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 mt-2 font-medium text-center">
                        Escanea con Google Authenticator
                      </span>
                    </div>

                    {/* Semilla Manual y Confirmación */}
                    <div className="md:col-span-7 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-sipar-dark dark:text-white mb-1">
                          ¿No puedes escanear el QR? Ingresa esta clave manual:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 font-mono text-xs font-bold text-sipar-orange tracking-wider select-all">
                            {mfaSetupData.secret}
                          </code>
                          <button
                            type="button"
                            onClick={copySecretToClipboard}
                            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:text-sipar-orange transition"
                            title="Copiar clave secreta"
                          >
                            {copiedSecret ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <form onSubmit={handleConfirmEnableMfa} className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                          Ingresa el código de 6 dígitos generado por tu app:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            required
                            placeholder="000000"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                            className="w-36 text-center font-mono text-lg font-extrabold tracking-widest px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-sipar-orange"
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting || otpCode.length !== 6}
                            className="flex-1 bg-sipar-orange hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                          >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Activar 2FA</>}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Datos Personales */}
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-sipar-dark dark:text-white uppercase tracking-wider mb-4">
              Información Personal
            </h3>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-sipar-dark dark:bg-gray-800 hover:bg-gray-800 dark:hover:bg-gray-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" /> Guardar Datos
                </button>
              </div>
            </form>
          </div>

        </div>

        {/* ================= COLUMNA DERECHA (5 COLS): ROTACIÓN DE CONTRASEÑA ISO 27001 ================= */}
        <div className="lg:col-span-5 bg-white dark:bg-sipar-dark rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-sipar-dark dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-sipar-orange" /> Rotación de Contraseña
            </h3>
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="text-xs text-gray-400 hover:text-sipar-orange flex items-center gap-1"
            >
              {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPasswords ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Contraseña Actual</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-sipar-orange"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Nueva Contraseña</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-sipar-orange"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Confirmar Nueva Contraseña</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-sipar-orange"
              />
            </div>

            {/* Checklist interactivo de complejidad ISO 27001 */}
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
              <p className="font-bold text-gray-500 dark:text-gray-400 text-[11px] uppercase mb-2">
                Requisitos de Política ISO 27001:
              </p>
              {[
                { ok: passwordChecks.length, label: 'Mínimo 8 caracteres de longitud' },
                { ok: passwordChecks.upper, label: 'Al menos una letra mayúscula (A-Z)' },
                { ok: passwordChecks.lower, label: 'Al menos una letra minúscula (a-z)' },
                { ok: passwordChecks.number, label: 'Al menos un dígito numérico (0-9)' },
                { ok: passwordChecks.special, label: 'Al menos un símbolo especial (!@#$%...)' },
                { ok: passwordChecks.match, label: 'Las contraseñas coinciden' }
              ].map((item, idx) => (
                <div key={idx} className={`flex items-center gap-2 font-medium ${item.ok ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !isPasswordCompliant}
              className="w-full py-3 bg-sipar-orange hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4" /> Actualizar Contraseña</>}
            </button>
          </form>
        </div>

      </div>

      {/* MODAL PARA DESACTIVAR 2FA */}
      {showDisableMfaModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm p-6 border border-gray-200 dark:border-gray-800 shadow-2xl">
            <h3 className="text-base font-bold text-sipar-dark dark:text-white mb-2">Confirmar Desactivación de 2FA</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Por seguridad ISO 27001, ingresa tu contraseña actual para confirmar que deseas desactivar el segundo factor.
            </p>
            <form onSubmit={handleDisableMfa} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Tu contraseña actual"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowDisableMfaModal(false); setDisablePassword(''); }}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl"
                >
                  Desactivar 2FA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}