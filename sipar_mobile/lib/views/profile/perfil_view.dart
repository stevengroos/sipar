import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

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
  String _role = 'conductor';
  bool _bioEnabled = false;
  String _biometricLabel = Platform.isIOS ? 'Face ID' : 'Huella Digital';

  // Datos de Facturación (persistidos y cifrados en BD)
  String _billingRuc = '';
  String _billingName = '';

  // Garaje de Vehículos EV (vacío por defecto si el usuario no registró ninguno)
  List<EvVehicleModel> _vehicles = [];
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
    final bioLabel = await BiometricService.getBiometricLabel();

    if (user != null) {
      _applyUserMap(user);
    }

    if (mounted) {
      setState(() {
        _bioEnabled = bio;
        _biometricLabel = bioLabel;
      });
    }

    // Sincronizar desde PostgreSQL (incluyendo RUC descifrado y garaje de vehículos)
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
    if (user['billing_ruc'] != null) {
      _billingRuc = user['billing_ruc'].toString();
    }
    if (user['billing_name'] != null) {
      _billingName = user['billing_name'].toString();
    }
    if (user['vehicles'] is List) {
      final rawList = user['vehicles'] as List<dynamic>;
      _vehicles = rawList
          .whereType()
          .map((e) => EvVehicleModel.fromJson(Map<String, dynamic>.from(e)))
          .where((v) => v.brandModel.trim().isNotEmpty)
          .toList();
      if (_selectedVehicleIndex >= _vehicles.length) {
        _selectedVehicleIndex = 0;
      }
    }
  }

  Future<void> _syncProfileToBackend() async {
    try {
      final res = await ApiClient.dio.put(
        '/api/v1/users/me',
        data: {
          'first_name': _firstName,
          'last_name': _lastName,
          'billing_ruc': _billingRuc,
          'billing_name': _billingName,
          'vehicles': _vehicles.map((v) => v.toJson()).toList(),
        },
      );
      if (res.data is Map) {
        final updatedUser = Map<String, dynamic>.from(res.data);
        final token = await SecureStorageService.getToken();
        if (token != null) {
          await SecureStorageService.saveSession(
            token: token,
            user: updatedUser,
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _toggleBiometrics() async {
    HapticFeedback.selectionClick();
    final nextVal = !_bioEnabled;
    if (nextVal) {
      final available = await BiometricService.isBiometricAvailable();
      if (!available) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: SiparColors.red,
              behavior: SnackBarBehavior.floating,
              content: Text(
                'No se detectó $_biometricLabel configurado en este dispositivo.',
              ),
            ),
          );
        }
        return;
      }

      // Exige validar con el rostro (Face ID) o Huella Digital real antes de activar
      final ok = await BiometricService.authenticateWithFaceId(
        strictBiometricOnly: true,
      );
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
                ? '$_biometricLabel verificado y activado en Keychain (ISO 27001)'
                : 'Desbloqueo con $_biometricLabel desactivado',
          ),
        ),
      );
    }
  }

  // Modal para Editar Nombre y Facturación (RUC / Razón Social Cifrados en BD)
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
                    'Tus datos fiscales se almacenan cifrados en reposo bajo ISO/IEC 27001 (A.8.24).',
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

                              if (mounted) {
                                setState(() {
                                  if (newFn.isNotEmpty) _firstName = newFn;
                                  _lastName = newLn;
                                  _billingRuc = newRuc;
                                  _billingName = newRaz;
                                });
                              }
                              await _syncProfileToBackend();
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                      child: saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'Guardar Cambios Cifrados',
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

  // Modal para Agregar Vehículo Eléctrico con Confirmación Previa
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

                        // Confirmación explícita antes de agregar el vehículo
                        final confirm = await showDialog<bool>(
                          context: ctx,
                          builder: (dCtx) => AlertDialog(
                            backgroundColor: bgSheet,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                            title: Text(
                              '¿Confirmar nuevo vehículo?',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: textPrim,
                              ),
                            ),
                            content: Text(
                              'Se agregará "$model" (Placa: $plate • Conector $connector) a tu garaje sincronizado.',
                              style: TextStyle(fontSize: 13, color: textSec),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(dCtx, false),
                                child: Text(
                                  'Cancelar',
                                  style: TextStyle(color: textSec),
                                ),
                              ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: SiparColors.green,
                                  foregroundColor: Colors.white,
                                ),
                                onPressed: () => Navigator.pop(dCtx, true),
                                child: const Text('Sí, agregar'),
                              ),
                            ],
                          ),
                        );

                        if (confirm != true) return;

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
                        await _syncProfileToBackend();
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

  // Confirmación antes de Eliminar un Vehículo del Garaje
  Future<void> _confirmDeleteVehicle(int idx, bool isDark) async {
    HapticFeedback.mediumImpact();
    final v = _vehicles[idx];
    final bgDialog = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: bgDialog,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          '¿Eliminar vehículo?',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: textPrim,
          ),
        ),
        content: Text(
          '¿Estás seguro de eliminar "${v.brandModel}" (Placa: ${v.plate}) de tu garaje?',
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
              'Sí, eliminar',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() {
        _vehicles.removeAt(idx);
        if (_selectedVehicleIndex >= _vehicles.length) {
          _selectedVehicleIndex = 0;
        }
      });
      await _syncProfileToBackend();
    }
  }

  // Modal de Preguntas Frecuentes Conectado en Vivo al Módulo Web (/api/v1/users/faqs)
  void _openFaqSheet(bool isDark) {
    HapticFeedback.lightImpact();
    final bgSheet = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: bgSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        minChildSize: 0.45,
        maxChildSize: 0.92,
        expand: false,
        builder: (_, scrollCtrl) => FutureBuilder(
          future: ApiClient.dio.get('/api/v1/users/faqs'),
          builder: (context, snapshot) {
            final rawList = (snapshot.data?.data as List<dynamic>?) ?? [];

            return ListView(
              controller: scrollCtrl,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        'Preguntas Frecuentes y Ayuda OCPP',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: textPrim,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(LucideIcons.x, color: textSec, size: 20),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: CircularProgressIndicator(
                        color: SiparColors.green,
                      ),
                    ),
                  )
                else if (rawList.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 30),
                    child: Text(
                      'No hay preguntas frecuentes publicadas en este momento.',
                      style: TextStyle(color: textSec, fontSize: 13),
                    ),
                  )
                else
                  ...rawList.map((item) {
                    final map = Map<String, dynamic>.from(item as Map);
                    final q = (map['question'] ?? '').toString();
                    final a = (map['answer'] ?? '').toString();
                    final cat = (map['category'] ?? 'General').toString();

                    return ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      iconColor: SiparColors.green,
                      collapsedIconColor: textSec,
                      title: Text(
                        q,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: textPrim,
                        ),
                      ),
                      subtitle: Text(
                        cat,
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: SiparColors.green,
                        ),
                      ),
                      children: [
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(
                              a,
                              style: TextStyle(
                                fontSize: 12.5,
                                color: textSec,
                                height: 1.45,
                              ),
                            ),
                          ),
                        ),
                      ],
                    );
                  }),
              ],
            );
          },
        ),
      ),
    );
  }

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
          'Saldrás de tu cuenta actual. Si tienes $_biometricLabel activado, podrás volver a ingresar rápidamente.',
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
          // 1. CABECERA DE PERFIL
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
                  biometricLabel: _biometricLabel,
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
              biometricLabel: _biometricLabel,
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
                            const SizedBox(width: 6),
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
                          'PII y Keychain cifrados • Toca para ver tu bitácora',
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

          // 3. ACCESOS RÁPIDOS
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

          // 4. MIS VEHÍCULOS ELÉCTRICOS (VACÍO POR DEFECTO + CONFIRMACIÓN AL ELIMINAR)
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
          if (_vehicles.isEmpty)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: borderCol),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: subtleBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(LucideIcons.car, color: textSec, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Sin vehículos registrados',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: textPrim,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Toca "+ Agregar auto" para registrar tu vehículo eléctrico.',
                          style: TextStyle(fontSize: 12, color: textSec),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            )
          else
            ...List.generate(_vehicles.length, (idx) {
              final v = _vehicles[idx];
              final isPrimary = idx == _selectedVehicleIndex;
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selectedVehicleIndex = idx);
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
                      IconButton(
                        onPressed: () => _confirmDeleteVehicle(idx, isDark),
                        icon: Icon(
                          LucideIcons.trash2,
                          size: 17,
                          color: SiparColors.red.withValues(alpha: 0.8),
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
                  icon: Platform.isIOS
                      ? LucideIcons.scanFace
                      : LucideIcons.fingerprint,
                  title: 'Desbloqueo con $_biometricLabel',
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
                    biometricLabel: _biometricLabel,
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
