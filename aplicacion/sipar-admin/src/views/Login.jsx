import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, AlertCircle, Zap, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import api from '../api/axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      if (mfaStep && otpCode) {
        formData.append('otp_code', otpCode);
      }

      const response = await api.post('/api/v1/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // Si el servidor indica que la cuenta tiene 2FA activo, pasamos al paso de código TOTP
      if (response.data.mfa_required) {
        setMfaStep(true);
        setLoading(false);
        return;
      }

      const token = response.data.access_token;
      localStorage.setItem('sipar_token', token);
      if (response.data.user) {
        localStorage.setItem('sipar_user', JSON.stringify(response.data.user));
      }

      // Si el administrador marcó que debe cambiar contraseña al iniciar, lo llevamos a Mi Perfil
      if (response.data.must_change_password) {
        navigate('/admin/perfil');
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      if (detail) {
        setError(detail);
      } else {
        setError('Error conectando con el servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0F17] flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-sipar-orange">
          <Zap className="w-12 h-12" />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-sipar-dark dark:text-white">
          SIPAR Admin
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-sipar-orange" /> Acceso Protegido bajo Norma ISO/IEC 27001
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-sipar-dark py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-[20px] sm:px-10 border border-gray-100 dark:border-gray-800 transition-colors">
          <form className="space-y-6" onSubmit={handleLogin}>
            
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-md flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-3 shrink-0" />
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {!mfaStep ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Corporativo</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl focus:ring-sipar-orange focus:border-sipar-orange sm:text-sm transition-colors"
                      placeholder="admin@sipar.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contraseña</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl focus:ring-sipar-orange focus:border-sipar-orange sm:text-sm transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <div className="mb-4 p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/60 text-xs text-orange-800 dark:text-orange-300">
                  <p className="font-bold flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-sipar-orange" /> Verificación en Dos Pasos (2FA)
                  </p>
                  <p className="mt-1 opacity-90">
                    Ingresa el código de 6 dígitos generado por Google Authenticator o Authy para <strong>{email}</strong>.
                  </p>
                </div>

                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Código de Seguridad (6 dígitos)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="block w-full text-center tracking-[0.5em] font-mono text-2xl font-extrabold py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl focus:ring-2 focus:ring-sipar-orange outline-none"
                  placeholder="000000"
                />

                <button
                  type="button"
                  onClick={() => { setMfaStep(false); setOtpCode(''); setError(null); }}
                  className="mt-4 text-xs text-gray-500 hover:text-sipar-orange flex items-center gap-1 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
                </button>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-sipar-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sipar-orange transition-colors disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (mfaStep ? 'Verificar Código y Entrar' : 'Iniciar Sesión')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}