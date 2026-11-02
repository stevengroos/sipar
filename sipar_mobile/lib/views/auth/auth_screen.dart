import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api_client.dart';
import '../../core/biometric_service.dart';
import '../../core/secure_storage_service.dart';
import '../../core/theme.dart';

class AuthScreen extends StatefulWidget {
  final VoidCallback onAuthenticated;
  const AuthScreen({super.key, required this.onAuthenticated});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isOnboarding =
      false; // false = Iniciar Sesión | true = Onboarding Crear Cuenta
  bool _mfaRequired = false;
  bool _obscurePassword = true;
  bool _loading = false;
  bool _canUseBiometrics = false;
  bool _hasSavedBiometricSession = false;
  String? _savedUserEmail;
  String? _errorMsg;

  // Controladores
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initBiometricState();
    _passCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _initBiometricState() async {
    final bioAvailable = await BiometricService.isBiometricAvailable();
    final bioEnabled = await SecureStorageService.isBiometricEnabled();
    final token = await SecureStorageService.getToken();
    final savedUser = await SecureStorageService.getUser();

    if (mounted) {
      setState(() {
        _canUseBiometrics = bioAvailable;
        _hasSavedBiometricSession =
            bioEnabled && token != null && token.isNotEmpty;
        _savedUserEmail = savedUser?['email']?.toString();
        if (_savedUserEmail != null && _emailCtrl.text.isEmpty) {
          _emailCtrl.text = _savedUserEmail!;
        }
      });
    }

    // Si el usuario tiene Face ID habilitado y sesión guardada, disparamos Face ID automáticamente
    if (bioAvailable && bioEnabled && token != null && token.isNotEmpty) {
      await _handleFaceIdLogin();
    }
  }

  // Validaciones de contraseña ISO 27001 en tiempo real para el Onboarding
  bool get _hasMinLength => _passCtrl.text.length >= 8;
  bool get _hasUppercase => RegExp(r'[A-Z]').hasMatch(_passCtrl.text);
  bool get _hasLowercase => RegExp(r'[a-z]').hasMatch(_passCtrl.text);
  bool get _hasDigit => RegExp(r'\d').hasMatch(_passCtrl.text);
  bool get _hasSpecial =>
      RegExp(r'[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\]]').hasMatch(_passCtrl.text);
  bool get _isPasswordIsoCompliant =>
      _hasMinLength &&
      _hasUppercase &&
      _hasLowercase &&
      _hasDigit &&
      _hasSpecial;

  // 1. DESBLOQUEO CON FACE ID / BIOMETRÍA
  Future<void> _handleFaceIdLogin() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    try {
      final authenticated = await BiometricService.authenticateWithFaceId();
      if (!authenticated) {
        setState(() => _loading = false);
        return;
      }

      // Renovamos el JWT en el backend y registramos LOGIN_BIOMETRIC_FACEID en auditoría ISO 27001
      final res = await ApiClient.dio.post('/api/v1/auth/biometric-session');
      await SecureStorageService.saveSession(
        token: res.data['access_token'],
        user: Map<String, dynamic>.from(res.data['user']),
      );
      widget.onAuthenticated();
    } on DioException {
      await SecureStorageService.clearSession(keepBiometricToken: false);
      setState(() {
        _hasSavedBiometricSession = false;
        _errorMsg =
            'Tu sesión segura expiró. Ingresa con tu contraseña para reactivar Face ID.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // 2. LOGIN POR EMAIL + 2FA O REGISTRO ONBOARDING POR EMAIL
  Future<void> _handleEmailSubmit() async {
    FocusScope.of(context).unfocus();
    final email = _emailCtrl.text.trim();
    final password = _passCtrl.text;

    if (email.isEmpty || !email.contains('@')) {
      setState(() => _errorMsg = 'Ingresa un correo electrónico válido.');
      return;
    }

    if (_isOnboarding) {
      if (_firstNameCtrl.text.trim().isEmpty ||
          _lastNameCtrl.text.trim().isEmpty) {
        setState(
          () => _errorMsg = 'Completa tu nombre y apellido para el Onboarding.',
        );
        return;
      }
      if (!_isPasswordIsoCompliant) {
        setState(
          () => _errorMsg =
              'La contraseña aún no cumple todos los requisitos ISO 27001.',
        );
        return;
      }
    }

    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    try {
      Map<String, dynamic> data;

      if (_isOnboarding) {
        final res = await ApiClient.dio.post(
          '/api/v1/auth/mobile/onboarding',
          data: {
            'first_name': _firstNameCtrl.text.trim(),
            'last_name': _lastNameCtrl.text.trim(),
            'email': email,
            'password': password,
          },
        );
        data = Map<String, dynamic>.from(res.data);
      } else {
        final formData = FormData.fromMap({
          'username': email,
          'password': password,
          if (_mfaRequired && _otpCtrl.text.trim().isNotEmpty)
            'otp_code': _otpCtrl.text.trim(),
        });
        final res = await ApiClient.dio.post(
          '/api/v1/auth/login',
          data: formData,
        );
        data = Map<String, dynamic>.from(res.data);

        if (data['mfa_required'] == true) {
          setState(() {
            _mfaRequired = true;
            _loading = false;
          });
          return;
        }
      }

      await SecureStorageService.saveSession(
        token: data['access_token'],
        user: Map<String, dynamic>.from(data['user']),
      );

      if (mounted) {
        await _promptEnableBiometricsIfNeeded();
        widget.onAuthenticated();
      }
    } on DioException catch (e) {
      setState(() {
        if (e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout ||
            e.type == DioExceptionType.connectionError) {
          _errorMsg =
              'No se pudo conectar con ${ApiClient.baseUrl}. Si estás en Render Free Tier, espera 30s mientras despierta el servidor.';
        } else {
          _errorMsg =
              e.response?.data?['detail']?.toString() ??
              'Error de autenticación. Verifica tus datos.';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // 3. CONTINUAR CON GOOGLE (OAUTH 2.0 / OIDC)
  // 3. CONTINUAR CON GOOGLE (OAUTH 2.0 / OIDC - API GoogleSignIn v7+)
  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    try {
      final googleSignIn = GoogleSignIn.instance;
      await googleSignIn.initialize();

      final account = await googleSignIn.authenticate(
        scopeHint: ['email', 'profile'],
      );

      final auth = account.authentication;
      final nameParts = (account.displayName ?? '').split(' ');
      final firstName = nameParts.isNotEmpty ? nameParts.first : 'Conductor';
      final lastName = nameParts.length > 1
          ? nameParts.sublist(1).join(' ')
          : '';

      final res = await ApiClient.dio.post(
        '/api/v1/auth/google',
        data: {
          'id_token': auth.idToken,
          'email': account.email,
          'first_name': firstName,
          'last_name': lastName,
        },
      );

      final data = Map<String, dynamic>.from(res.data);
      await SecureStorageService.saveSession(
        token: data['access_token'],
        user: Map<String, dynamic>.from(data['user']),
      );

      if (mounted) {
        await _promptEnableBiometricsIfNeeded();
        widget.onAuthenticated();
      }
    } on DioException catch (e) {
      setState(() {
        _errorMsg =
            e.response?.data?['detail']?.toString() ??
            'No se pudo validar la cuenta de Google en el servidor.';
      });
    } catch (_) {
      setState(() {
        _errorMsg =
            'Para usar Google Sign-In en iOS/Android/macOS, recuerda configurar tu GIDClientID / GoogleService-Info.plist en Google Cloud.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Preguntar al usuario si desea activar Face ID tras su primer login exitoso
  Future<void> _promptEnableBiometricsIfNeeded() async {
    final alreadyEnabled = await SecureStorageService.isBiometricEnabled();
    if (!_canUseBiometrics || alreadyEnabled || !mounted) return;

    final wantEnable = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: SiparColors.darkCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: SiparColors.darkBorder),
        ),
        title: Row(
          children: const [
            Icon(LucideIcons.scanFace, color: SiparColors.orange),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                '¿Activar Face ID / Biometría?',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const Text(
          '¿Deseas usar Face ID / Touch ID para ingresar rápidamente en tus próximas sesiones sin escribir tu contraseña? Tus credenciales se guardarán cifradas en el llavero seguro del dispositivo (ISO 27001).',
          style: TextStyle(fontSize: 13, color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Ahora no', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: SiparColors.orange,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(LucideIcons.shieldCheck, size: 16),
            label: const Text('Activar Face ID'),
          ),
        ],
      ),
    );

    if (wantEnable == true) {
      await SecureStorageService.setBiometricEnabled(true);
    }
  }

  Widget _buildPasswordRule(String label, bool met) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(
            met ? LucideIcons.circleCheck : LucideIcons.circle,
            size: 14,
            color: met ? SiparColors.green : Colors.grey.shade600,
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              color: met ? SiparColors.green : Colors.grey.shade400,
              fontWeight: met ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Container(
                padding: const EdgeInsets.all(26),
                decoration: BoxDecoration(
                  color: SiparColors.darkCard,
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(color: SiparColors.darkBorder),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // LOGO Y SELLO ISO 27001
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: SiparColors.orange.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            LucideIcons.zap,
                            color: SiparColors.orange,
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Text(
                          'SIPAR',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const Text(
                          '.',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w900,
                            color: SiparColors.orange,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Electromovilidad Inteligente • Paraguay',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.grey,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 20),

                    // SELECTOR DE MODO: INICIAR SESIÓN VS ONBOARDING (CREAR CUENTA)
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: SiparColors.darkBg,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: SiparColors.darkBorder),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _isOnboarding = false;
                                _mfaRequired = false;
                                _errorMsg = null;
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: !_isOnboarding
                                      ? SiparColors.orange
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  'Iniciar Sesión',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.bold,
                                    color: !_isOnboarding
                                        ? Colors.white
                                        : Colors.grey,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _isOnboarding = true;
                                _mfaRequired = false;
                                _errorMsg = null;
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: _isOnboarding
                                      ? SiparColors.orange
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  'Crear Cuenta',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.bold,
                                    color: _isOnboarding
                                        ? Colors.white
                                        : Colors.grey,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                    // MENSAJE DE ERROR O ALERTA DE SEGURIDAD
                    if (_errorMsg != null)
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: SiparColors.red.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: SiparColors.red.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              LucideIcons.triangleAlert,
                              color: Colors.redAccent,
                              size: 18,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _errorMsg!,
                                style: const TextStyle(
                                  color: Colors.redAccent,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                    // BOTÓN DESTACADO DE FACE ID SI TIENE SESIÓN GUARDADA
                    if (!_isOnboarding && _hasSavedBiometricSession) ...[
                      OutlinedButton.icon(
                        onPressed: _loading ? null : _handleFaceIdLogin,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          side: const BorderSide(
                            color: SiparColors.orange,
                            width: 1.5,
                          ),
                          backgroundColor: SiparColors.orange.withValues(
                            alpha: 0.08,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        icon: const Icon(
                          LucideIcons.scanFace,
                          color: SiparColors.orange,
                          size: 20,
                        ),
                        label: Text(
                          'Ingresar con Face ID (${_savedUserEmail ?? "Guardado"})',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 12.5,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // CAMPOS DE NOMBRE Y APELLIDO (SOLO EN ONBOARDING)
                    if (_isOnboarding) ...[
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _firstNameCtrl,
                              textCapitalization: TextCapitalization.words,
                              decoration: InputDecoration(
                                labelText: 'Nombre',
                                prefixIcon: const Icon(
                                  LucideIcons.user,
                                  size: 18,
                                ),
                                filled: true,
                                fillColor: SiparColors.darkBg,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextField(
                              controller: _lastNameCtrl,
                              textCapitalization: TextCapitalization.words,
                              decoration: InputDecoration(
                                labelText: 'Apellido',
                                filled: true,
                                fillColor: SiparColors.darkBg,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],

                    // CORREO ELECTRÓNICO
                    TextField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: 'Correo Electrónico',
                        prefixIcon: const Icon(LucideIcons.mail, size: 18),
                        filled: true,
                        fillColor: SiparColors.darkBg,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // CONTRASEÑA CON BOTÓN MOSTRAR/OCULTAR
                    TextField(
                      controller: _passCtrl,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'Contraseña',
                        prefixIcon: const Icon(LucideIcons.lock, size: 18),
                        suffixIcon: IconButton(
                          onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword,
                          ),
                          icon: Icon(
                            _obscurePassword
                                ? LucideIcons.eyeOff
                                : LucideIcons.eye,
                            size: 18,
                            color: Colors.grey,
                          ),
                        ),
                        filled: true,
                        fillColor: SiparColors.darkBg,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),

                    // CHECKLIST INTERACTIVO DE COMPLEJIDAD ISO 27001 EN ONBOARDING
                    if (_isOnboarding) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: SiparColors.darkBg,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: SiparColors.darkBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: const [
                                Icon(
                                  LucideIcons.shieldCheck,
                                  size: 14,
                                  color: SiparColors.orange,
                                ),
                                SizedBox(width: 6),
                                Text(
                                  'Requisitos de Seguridad ISO 27001:',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white70,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            _buildPasswordRule(
                              'Mínimo 8 caracteres',
                              _hasMinLength,
                            ),
                            _buildPasswordRule(
                              'Al menos una letra mayúscula (A-Z)',
                              _hasUppercase,
                            ),
                            _buildPasswordRule(
                              'Al menos una letra minúscula (a-z)',
                              _hasLowercase,
                            ),
                            _buildPasswordRule(
                              'Al menos un número (0-9)',
                              _hasDigit,
                            ),
                            _buildPasswordRule(
                              'Un carácter especial (!@#\$%^&*)',
                              _hasSpecial,
                            ),
                          ],
                        ),
                      ),
                    ],

                    // CAMPO 2FA TOTP SI LA CUENTA LO REQUIERE
                    if (_mfaRequired && !_isOnboarding) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: _otpCtrl,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        decoration: InputDecoration(
                          labelText: 'Código 2FA (6 dígitos Authenticator)',
                          prefixIcon: const Icon(
                            LucideIcons.keyRound,
                            color: SiparColors.orange,
                            size: 18,
                          ),
                          filled: true,
                          fillColor: SiparColors.darkBg,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ],

                    const SizedBox(height: 18),

                    // BOTÓN PRINCIPAL DE ACCIÓN
                    ElevatedButton(
                      onPressed: _loading ? null : _handleEmailSubmit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: SiparColors.orange,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _loading
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              _isOnboarding
                                  ? 'Completar Onboarding e Ingresar'
                                  : _mfaRequired
                                  ? 'Verificar Código 2FA'
                                  : 'Iniciar Sesión',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                    ),

                    const SizedBox(height: 16),

                    // DIVISOR SSO
                    Row(
                      children: [
                        Expanded(child: Divider(color: Colors.grey.shade800)),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10),
                          child: Text(
                            'o continúa con',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                        ),
                        Expanded(child: Divider(color: Colors.grey.shade800)),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // BOTÓN OFICIAL CONTINUAR CON GOOGLE
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _handleGoogleSignIn,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        backgroundColor: SiparColors.darkBg,
                        side: const BorderSide(color: SiparColors.darkBorder),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      icon: const Icon(
                        LucideIcons.globe,
                        size: 18,
                        color: Colors.white,
                      ),
                      label: Text(
                        _isOnboarding
                            ? 'Registrarse rápido con Google'
                            : 'Continuar con Google',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(LucideIcons.lock, size: 12, color: Colors.grey),
                        SizedBox(width: 5),
                        Text(
                          'Protegido bajo controles ISO/IEC 27001 • Keychain Cifrado',
                          style: TextStyle(fontSize: 10.5, color: Colors.grey),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
