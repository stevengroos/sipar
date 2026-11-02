import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'core/theme.dart';
import 'core/api_client.dart';
import 'core/secure_storage_service.dart';
import 'views/auth/auth_screen.dart';
import 'views/shell/main_navigation_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Carga segura de variables de entorno (.env) bajo normas ISO 27001
  try {
    await dotenv.load(fileName: ".env");
  } catch (_) {
    // Si aún no existe el archivo .env, ApiClient usará el valor por defecto seguro
  }

  runApp(const SiparMobileApp());
}

class SiparMobileApp extends StatelessWidget {
  const SiparMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SIPAR App - Clean Energy UI',
      debugShowCheckedModeBanner: false,
      theme: SiparTheme.cleanEnergyTheme,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> with WidgetsBindingObserver {
  bool _checking = true;
  bool _authenticated = false;
  DateTime? _pausedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ApiClient.onUnauthorized = () {
      if (mounted) setState(() => _authenticated = false);
    };
    _verifyInitialState();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Control ISO 27001 A.8.5: Bloqueo de sesión tras inactividad en segundo plano
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) async {
    if (state == AppLifecycleState.paused) {
      _pausedAt = DateTime.now();
    } else if (state == AppLifecycleState.resumed &&
        _authenticated &&
        _pausedAt != null) {
      final elapsed = DateTime.now().difference(_pausedAt!);
      _pausedAt = null;
      final bioEnabled = await SecureStorageService.isBiometricEnabled();
      if (elapsed.inMinutes >= 5 && bioEnabled && mounted) {
        setState(() => _authenticated = false);
      }
    }
  }

  Future<void> _verifyInitialState() async {
    final token = await SecureStorageService.getToken();
    final bioEnabled = await SecureStorageService.isBiometricEnabled();

    if (token != null && token.isNotEmpty && !bioEnabled) {
      setState(() {
        _authenticated = true;
        _checking = false;
      });
    } else {
      setState(() {
        _authenticated = false;
        _checking = false;
      });
    }
  }

  Future<void> _handleLogout() async {
    final keepBio = await SecureStorageService.isBiometricEnabled();
    await SecureStorageService.clearSession(keepBiometricToken: keepBio);
    if (mounted) setState(() => _authenticated = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        backgroundColor: SiparColors.light,
        body: Center(
          child: CircularProgressIndicator(color: SiparColors.green),
        ),
      );
    }

    return _authenticated
        ? MainNavigationShell(onLogout: _handleLogout)
        : Theme(
            data: ThemeData.dark().copyWith(
              scaffoldBackgroundColor: SiparColors.darkBg,
            ),
            child: AuthScreen(
              onAuthenticated: () => setState(() => _authenticated = true),
            ),
          );
  }
}
