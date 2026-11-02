import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/biometric_service.dart';
import '../../core/secure_storage_service.dart';
import '../../core/theme.dart';
import 'widgets/profile_modals.dart';

class PerfilView extends StatefulWidget {
  final VoidCallback onLogout;
  const PerfilView({super.key, required this.onLogout});

  @override
  State<PerfilView> createState() => _PerfilViewState();
}

class _PerfilViewState extends State<PerfilView> {
  String _firstName = 'Conductor';
  String _lastName = 'SIPAR';
  String _email = 'conductor@sipar.com.py';
  String _userIdBadge = 'ID ---';
  String _role = 'driver';
  bool _bioEnabled = false;

  // Datos de Facturación Local (Paraguay - RUC / CI)
  String _billingRuc = '';
  String _billingName = '';

  // Garaje de Vehículos EV del Usuario
  List<EvVehicleModel> _vehicles = [
    const EvVehicleModel(
      brandModel: 'BYD Dolphin',
      plate: 'AAA 123',
      connectorType: 'CCS2',
      batteryKwh: 44.9,
    ),
  ];
  int _selectedVehicleIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadAllProfileData();
  }

  String get _fullName => '$_firstName $_lastName'.trim();

  String get _initials {
    final f = _firstName.isNotEmpty ? _firstName[0].toUpperCase() : 'S';
    final l = _lastName.isNotEmpty ? _lastName[0].toUpperCase() : 'P';
    return '$f$l';
  }

  Future<void> _loadAllProfileData() async {
    final user = await SecureStorageService.getUser();
    final bio = await SecureStorageService.isBiometricEnabled();
    final prefs = await SharedPreferences.getInstance();

    if (user != null) {
      _applyUserMap(user);
    }

    // Cargar preferencias de facturación y vehículos guardados
    final savedRuc = prefs.getString('sipar_billing_ruc') ?? '';
    final savedRaz = prefs.getString('sipar_billing_name') ?? '';
    final savedVehiclesRaw = prefs.getString('sipar_ev_garage');
    final savedIdx = prefs.getInt('sipar_ev_selected_idx') ?? 0;

    if (savedVehiclesRaw != null && savedVehiclesRaw.isNotEmpty) {
      try {
        final decoded = jsonDecode(savedVehiclesRaw) as List<dynamic>;
        final parsed = decoded
            .map((e) => EvVehicleModel.fromJson(Map<String, dynamic>.from(e)))
            .toList();
        if (parsed.isNotEmpty) {
          _vehicles = parsed;
          _selectedVehicleIndex = savedIdx.clamp(0, _vehicles.length - 1);
        }
      } catch (_) {}
    }

    if (mounted) {
      setState(() {
        _bioEnabled = bio;
        _billingRuc = savedRuc;
        _billingName = savedRaz;
      });
    }

    // Sincronizar con el backend en segundo plano si el endpoint /users/me está activo
    try {
      final res = await ApiClient.dio.get('/api/v1/users/me');
      if (res.data is Map) {
        final freshUser = Map<String, dynamic>.from(res.data);
        final token = await SecureStorageService.getToken();
        if (token != null) {
          await SecureStorageService.saveSession(token: token, user: freshUser);
        }
        if (mounted) {
          setState(() => _applyUserMap(freshUser));
        }
      }
    } catch (_) {}
  }

  void _applyUserMap(Map<String, dynamic> user) {
    final fn = (user['first_name'] ?? '').toString().trim();
    final ln = (user['last_name'] ?? '').toString().trim();
    if (fn.isNotEmpty || ln.isNotEmpty) {
      _firstName = fn.isNotEmpty ? fn : 'Conductor';
      _lastName = ln;
    } else if (user['name'] != null) {
      final parts = user['name'].toString().trim().split(' ');
      _firstName = parts.first;
      _lastName = parts.length > 1 ? parts.sublist(1).join(' ') : '';
    }
    if (user['email'] != null) {
      _email = user['email'].toString();
    }
    if (user['id'] != null) {
      _userIdBadge = 'ID #${user['id']}';
    }
    if (user['role'] != null) {
      _role = user['role'].toString();
    }
  }

  Future<void> _saveGarageToPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'sipar_ev_garage',
      jsonEncode(_vehicles.map((v) => v.toJson()).toList()),
    );
    await prefs.setInt('sipar_ev_selected_idx', _selectedVehicleIndex);
  }

  Future<void> _toggleBiometrics() async {
    HapticFeedback.selectionClick();
    final nextVal = !_bioEnabled;
    if (nextVal) {
      final ok = await BiometricService.authenticateWithFaceId();
      if (!ok) return;
    }
    await SecureStorageService.setBiometricEnabled(nextVal);
    if (mounted) {
      setState(() => _bioEnabled = nextVal);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: SiparColors.green,
          behavior: SnackBarBehavior.floating,
          content: Text(
            nextVal
                ? 'Face ID / Biometría activada en Keychain (ISO 27001)'
                : 'Desbloqueo biométrico desactivado',
          ),
        ),
      );
    }
  }

  // Modal para Editar Nombre y Facturación (RUC / Razón Social)
  Future<void> _openEditProfileAndBillingSheet(bool isDark) async {
    HapticFeedback.lightImpact();
    final fnCtrl = TextEditingController(text: _firstName);
    final lnCtrl = TextEditingController(text: _lastName);
    final rucCtrl = TextEditingController(text: _billingRuc);
    final razCtrl = TextEditingController(
      text: _billingName.isNotEmpty ? _billingName : _fullName,
    );
    bool saving = false;

    final bgSheet = isDark ? const Color(0xFF161E2E) : Colors.white;
    final bgInput = isDark ? const Color(0xFF0F141C) : const Color(0xFFF8FAFC);
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: bgSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          InputDecoration deco(String label, IconData icon) => InputDecoration(
            labelText: label,
            labelStyle: TextStyle(color: textSec, fontSize: 13),
            prefixIcon: Icon(icon, size: 18, color: textSec),
            filled: true,
            fillColor: bgInput,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: borderCol),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: SiparColors.green,
                width: 1.5,
              ),
            ),
          );

          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              16,
              20,
              MediaQuery.of(ctx).viewInsets.bottom + 28,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: textSec.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Perfil y Datos de Facturación',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: textPrim,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Configura tus datos personales y tu RUC para comprobantes electrónicos.',
                    style: TextStyle(fontSize: 12, color: textSec),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: fnCtrl,
                          style: TextStyle(color: textPrim, fontSize: 14),
                          decoration: deco('Nombre', LucideIcons.user),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: lnCtrl,
                          style: TextStyle(color: textPrim, fontSize: 14),
                          decoration: deco('Apellido', LucideIcons.user),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: rucCtrl,
                    style: TextStyle(color: textPrim, fontSize: 14),
                    decoration: deco(
                      'RUC o Cédula (Ej. 80012345-6)',
                      LucideIcons.idCard,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: razCtrl,
                    style: TextStyle(color: textPrim, fontSize: 14),
                    decoration: deco(
                      'Razón Social / Nombre en Factura',
                      LucideIcons.fileText,
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: SiparColors.green,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      onPressed: saving
                          ? null
                          : () async {
                              setModalState(() => saving = true);
                              final newFn = fnCtrl.text.trim();
                              final newLn = lnCtrl.text.trim();
                              final newRuc = rucCtrl.text.trim();
                              final newRaz = razCtrl.text.trim();

                              final prefs =
                                  await SharedPreferences.getInstance();
                              await prefs.setString(
                                'sipar_billing_ruc',
                                newRuc,
                              );
                              await prefs.setString(
                                'sipar_billing_name',
                                newRaz,
                              );

                              try {
                                await ApiClient.dio.put(
                                  '/api/v1/users/me',
                                  data: {
                                    'first_name': newFn,
                                    'last_name': newLn,
                                  },
                                );
                              } catch (_) {}

                              final user =
                                  await SecureStorageService.getUser() ?? {};
                              user['first_name'] = newFn;
                              user['last_name'] = newLn;
                              final token =
                                  await SecureStorageService.getToken();
                              if (token != null) {
                                await SecureStorageService.saveSession(
                                  token: token,
                                  user: user,
                                );
                              }

                              if (mounted) {
                                setState(() {
                                  if (newFn.isNotEmpty) _firstName = newFn;
                                  _lastName = newLn;
                                  _billingRuc = newRuc;
                                  _billingName = newRaz;
                                });
                              }
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                      child: const Text(
                        'Guardar Cambios',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // Modal para Agregar Vehículo Eléctrico al Garaje
  Future<void> _openAddVehicleSheet(bool isDark) async {
    HapticFeedback.lightImpact();
    final modelCtrl = TextEditingController();
    final plateCtrl = TextEditingController();
    final capCtrl = TextEditingController(text: '60');
    String connector = 'CCS2';

    final bgSheet = isDark ? const Color(0xFF161E2E) : Colors.white;
    final bgInput = isDark ? const Color(0xFF0F141C) : const Color(0xFFF8FAFC);
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: bgSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              16,
              20,
              MediaQuery.of(ctx).viewInsets.bottom + 28,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: textSec.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Agregar Vehículo Eléctrico',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: textPrim,
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: modelCtrl,
                    style: TextStyle(color: textPrim, fontSize: 14),
                    decoration: InputDecoration(
                      labelText:
                          'Marca y Modelo (Ej. BYD Yuan Plus, Volvo EX30)',
                      labelStyle: TextStyle(color: textSec, fontSize: 13),
                      filled: true,
                      fillColor: bgInput,
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: borderCol),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: SiparColors.green,
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: plateCtrl,
                          textCapitalization: TextCapitalization.characters,
                          style: TextStyle(color: textPrim, fontSize: 14),
                          decoration: InputDecoration(
                            labelText: 'Chapa / Placa',
                            labelStyle: TextStyle(color: textSec, fontSize: 13),
                            filled: true,
                            fillColor: bgInput,
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(color: borderCol),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: SiparColors.green,
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: capCtrl,
                          keyboardType: TextInputType.number,
                          style: TextStyle(color: textPrim, fontSize: 14),
                          decoration: InputDecoration(
                            labelText: 'Batería (kWh)',
                            labelStyle: TextStyle(color: textSec, fontSize: 13),
                            filled: true,
                            fillColor: bgInput,
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(color: borderCol),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: SiparColors.green,
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Tipo de Conector Compatible',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: textSec,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: ['CCS2', 'Tipo 2', 'GB/T'].map((type) {
                      final active = connector == type;
                      return Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: GestureDetector(
                            onTap: () => setModalState(() => connector = type),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: active ? SiparColors.green : bgInput,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: active ? SiparColors.green : borderCol,
                                ),
                              ),
                              child: Text(
                                type,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w800,
                                  color: active ? Colors.white : textPrim,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: SiparColors.green,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      onPressed: () async {
                        final model = modelCtrl.text.trim();
                        if (model.isEmpty) return;
                        final plate = plateCtrl.text.trim().isNotEmpty
                            ? plateCtrl.text.trim().toUpperCase()
                            : 'S/C';
                        final kwh =
                            double.tryParse(capCtrl.text.trim()) ?? 60.0;

                        setState(() {
                          _vehicles.add(
                            EvVehicleModel(
                              brandModel: model,
                              plate: plate,
                              connectorType: connector,
                              batteryKwh: kwh,
                            ),
                          );
                          _selectedVehicleIndex = _vehicles.length - 1;
                        });
                        await _saveGarageToPrefs();
                        if (ctx.mounted) Navigator.pop(ctx);
                      },
                      child: const Text(
                        'Guardar en Mi Garaje',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // Modal de Preguntas Frecuentes y Soporte OCPP
  void _openFaqSheet(bool isDark) {
    HapticFeedback.lightImpact();
    final bgSheet = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final faqs = [
      {
        'q': '¿Cómo inicio una carga en una estación SIPAR?',
        'a':
            '1. Conecta la manguera a tu vehículo eléctrico.\n2. En el mapa de la app, selecciona la estación y el número de manguera.\n3. Asegúrate de contar con saldo disponible en tu Wallet y presiona "Iniciar Carga".',
      },
      {
        'q': '¿Qué significa la alerta GroundFailure o EVCommunicationError?',
        'a':
            'Por seguridad eléctrica OCPP 1.6J, si el cargador detecta una variación en la puesta a tierra (PE) o desconexión prematura del cable de control (CP), detiene el paso de energía automáticamente sin cobrarte recargos indebidos.',
      },
      {
        'q': '¿Cómo solicito una reversión o reclamo de saldo?',
        'a':
            'Desde la pestaña Actividad o contactando a soporte con tu número de transacción (#TRX), el equipo administrativo puede acreditar reembolsos auditados directamente en tu cuenta.',
      },
    ];

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: bgSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Preguntas Frecuentes y Ayuda OCPP',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: textPrim,
                ),
              ),
              const SizedBox(height: 12),
              ...faqs.map(
                (f) => ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  iconColor: SiparColors.green,
                  collapsedIconColor: textSec,
                  title: Text(
                    f['q']!,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: textPrim,
                    ),
                  ),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        f['a']!,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: textSec,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Confirmación antes de cerrar sesión (ISO 9241-110 Prevención de Errores)
  Future<void> _confirmLogout(bool isDark) async {
    HapticFeedback.mediumImpact();
    final bgDialog = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: bgDialog,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          '¿Cerrar sesión?',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: textPrim,
          ),
        ),
        content: Text(
          'Saldrás de tu cuenta actual. Si tienes Face ID activado, podrás volver a ingresar rápidamente.',
          style: TextStyle(fontSize: 13, color: textSec),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancelar', style: TextStyle(color: textSec)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: SiparColors.red,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Cerrar sesión',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );

    if (confirm == true) {
      widget.onLogout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    final textPrim = isDark ? const Color(0xFFF8FAFC) : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final cardBg = isDark ? const Color(0xFF18202F) : Colors.white;
    final subtleBg = isDark ? const Color(0xFF222C3F) : const Color(0xFFECFDF5);
    final borderCol = isDark
        ? const Color(0xFF2B364B)
        : const Color(0xFFD1FAE5);

    return RefreshIndicator(
      color: SiparColors.green,
      backgroundColor: cardBg,
      onRefresh: _loadAllProfileData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 56, 20, 120),
        children: [
          // 1. CABECERA DE PERFIL CON AVATAR DE INICIALES Y EDICIÓN
          Row(
            children: [
              GestureDetector(
                onTap: () => _openEditProfileAndBillingSheet(isDark),
                child: Stack(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [SiparColors.green, Color(0xFF059669)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: SiparColors.green.withValues(alpha: 0.28),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Text(
                        _initials,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 0,
                      right: 0,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: cardBg,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: SiparColors.green,
                            width: 1.5,
                          ),
                        ),
                        child: Icon(
                          LucideIcons.pencil,
                          color: textPrim,
                          size: 11,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: textPrim,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: textSec),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: subtleBg,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                LucideIcons.idCard,
                                size: 11,
                                color: SiparColors.green,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                _userIdBadge,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: SiparColors.green,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: SiparColors.blue.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _role.toUpperCase(),
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: SiparColors.blue,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => ProfileModals.showSecurityAuditSheet(
                  context,
                  isDark: isDark,
                  bioEnabled: _bioEnabled,
                  userEmail: _email,
                ),
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: cardBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: borderCol),
                  ),
                  child: const Icon(
                    LucideIcons.shieldCheck,
                    color: SiparColors.green,
                    size: 19,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // 2. BANNER DE POSTURA DE SEGURIDAD ISO/IEC 27001
          GestureDetector(
            onTap: () => ProfileModals.showSecurityAuditSheet(
              context,
              isDark: isDark,
              bioEnabled: _bioEnabled,
              userEmail: _email,
            ),
            child: Container(
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: borderCol),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: SiparColors.green.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      LucideIcons.lockKeyhole,
                      color: SiparColors.green,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Protección ISO/IEC 27001 Activa',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w800,
                                  color: textPrim,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: SiparColors.green.withValues(
                                  alpha: 0.15,
                                ),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _bioEnabled ? 'Nivel Óptimo' : 'Estándar',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: SiparColors.green,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Keychain cifrado • Toca para ver tu bitácora de accesos',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11.5, color: textSec),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(LucideIcons.chevronRight, size: 16, color: textSec),
                ],
              ),
            ),
          ),

          const SizedBox(height: 14),

          // 3. ACCESOS RÁPIDOS (EDITAR PERFIL Y ROTAR CONTRASEÑA)
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => _openEditProfileAndBillingSheet(isDark),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: borderCol),
                    ),
                    child: Column(
                      children: [
                        Icon(LucideIcons.userCheck, color: textPrim, size: 20),
                        const SizedBox(height: 6),
                        Text(
                          'Datos y RUC',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: textPrim,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => ProfileModals.showPasswordRotationSheet(
                    context,
                    isDark: isDark,
                  ),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: borderCol),
                    ),
                    child: Column(
                      children: [
                        Icon(LucideIcons.keyRound, color: textPrim, size: 20),
                        const SizedBox(height: 6),
                        Text(
                          'Rotar Clave',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: textPrim,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // 4. MIS VEHÍCULOS ELÉCTRICOS (DINÁMICO)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Mis Vehículos EV (${_vehicles.length})',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: textPrim,
                ),
              ),
              GestureDetector(
                onTap: () => _openAddVehicleSheet(isDark),
                child: const Row(
                  children: [
                    Icon(LucideIcons.plus, size: 15, color: SiparColors.green),
                    SizedBox(width: 4),
                    Text(
                      'Agregar auto',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: SiparColors.green,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...List.generate(_vehicles.length, (idx) {
            final v = _vehicles[idx];
            final isPrimary = idx == _selectedVehicleIndex;
            return GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _selectedVehicleIndex = idx);
                _saveGarageToPrefs();
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: cardBg,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: isPrimary ? SiparColors.green : borderCol,
                    width: isPrimary ? 1.8 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: isPrimary
                            ? SiparColors.green.withValues(alpha: 0.15)
                            : subtleBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        LucideIcons.car,
                        color: isPrimary ? SiparColors.green : textSec,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  v.brandModel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w800,
                                    color: textPrim,
                                  ),
                                ),
                              ),
                              if (isPrimary) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: SiparColors.green.withValues(
                                      alpha: 0.15,
                                    ),
                                    borderRadius: BorderRadius.circular(5),
                                  ),
                                  child: const Text(
                                    'Principal',
                                    style: TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w800,
                                      color: SiparColors.green,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Placa: ${v.plate} • ${v.connectorType} • ${v.batteryKwh.toStringAsFixed(1)} kWh',
                            style: TextStyle(fontSize: 11.5, color: textSec),
                          ),
                        ],
                      ),
                    ),
                    if (_vehicles.length > 1)
                      IconButton(
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          setState(() {
                            _vehicles.removeAt(idx);
                            if (_selectedVehicleIndex >= _vehicles.length) {
                              _selectedVehicleIndex = 0;
                            }
                          });
                          _saveGarageToPrefs();
                        },
                        icon: Icon(
                          LucideIcons.trash2,
                          size: 16,
                          color: textSec,
                        ),
                      ),
                  ],
                ),
              ),
            );
          }),

          const SizedBox(height: 20),

          // 5. PREFERENCIAS Y CONTROLES DE CUENTA
          Text(
            'Seguridad y Preferencias',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: textPrim,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: borderCol),
            ),
            child: Column(
              children: [
                _buildPrefRow(
                  icon: LucideIcons.fileText,
                  title: 'Facturación electrónica (RUC)',
                  trailingChip: _billingRuc.isNotEmpty
                      ? _billingRuc
                      : 'Configurar',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: () => _openEditProfileAndBillingSheet(isDark),
                ),
                _buildPrefRow(
                  icon: LucideIcons.scanFace,
                  title: 'Desbloqueo con Face ID',
                  trailingChip: _bioEnabled ? 'Activo' : 'Activar',
                  chipActive: _bioEnabled,
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: _toggleBiometrics,
                ),
                _buildPrefRow(
                  icon: LucideIcons.keyRound,
                  title: 'Rotación de contraseña (A.5.17)',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: () => ProfileModals.showPasswordRotationSheet(
                    context,
                    isDark: isDark,
                  ),
                ),
                _buildPrefRow(
                  icon: LucideIcons.shieldAlert,
                  title: 'Bitácora de seguridad (A.8.15)',
                  trailingChip: 'ISO 27001',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: () => ProfileModals.showSecurityAuditSheet(
                    context,
                    isDark: isDark,
                    bioEnabled: _bioEnabled,
                    userEmail: _email,
                  ),
                ),
                _buildPrefRow(
                  icon: LucideIcons.circleHelp,
                  iconColor: SiparColors.blue,
                  title: 'Preguntas frecuentes y ayuda OCPP',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: () => _openFaqSheet(isDark),
                ),
                _buildPrefRow(
                  icon: LucideIcons.logOut,
                  title: 'Cerrar sesión',
                  isDestructive: true,
                  showDivider: false,
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: textPrim,
                  textSec: textSec,
                  onTap: () => _confirmLogout(isDark),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPrefRow({
    required IconData icon,
    required String title,
    required Color cardBg,
    required Color borderCol,
    required Color textPrim,
    required Color textSec,
    Color? iconColor,
    String? trailingChip,
    bool chipActive = false,
    bool isDestructive = false,
    bool showDivider = true,
    VoidCallback? onTap,
  }) {
    final mainColor = isDestructive ? SiparColors.red : textPrim;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        decoration: BoxDecoration(
          border: showDivider
              ? Border(
                  bottom: BorderSide(color: borderCol.withValues(alpha: 0.6)),
                )
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isDestructive
                    ? SiparColors.red.withValues(alpha: 0.12)
                    : (iconColor ?? SiparColors.green).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                icon,
                size: 16,
                color: isDestructive
                    ? SiparColors.red
                    : (iconColor ?? SiparColors.green),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: mainColor,
                ),
              ),
            ),
            if (trailingChip != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: chipActive
                      ? SiparColors.green.withValues(alpha: 0.16)
                      : textSec.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  trailingChip,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: chipActive ? SiparColors.green : textSec,
                  ),
                ),
              ),
              const SizedBox(width: 6),
            ],
            Icon(
              LucideIcons.chevronRight,
              size: 16,
              color: isDestructive ? SiparColors.red : textSec,
            ),
          ],
        ),
      ),
    );
  }
}
