import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/api_client.dart';
import '../../../core/theme.dart';

class EvVehicleModel {
  final String brandModel;
  final String plate;
  final String connectorType;
  final double batteryKwh;

  const EvVehicleModel({
    required this.brandModel,
    required this.plate,
    required this.connectorType,
    required this.batteryKwh,
  });

  Map<String, dynamic> toJson() => {
    'brandModel': brandModel,
    'plate': plate,
    'connectorType': connectorType,
    'batteryKwh': batteryKwh,
  };

  factory EvVehicleModel.fromJson(Map<String, dynamic> json) {
    return EvVehicleModel(
      brandModel: (json['brandModel'] ?? '').toString(),
      plate: (json['plate'] ?? 'S/C').toString(),
      connectorType: (json['connectorType'] ?? 'CCS2').toString(),
      batteryKwh:
          (num.tryParse(json['batteryKwh']?.toString() ?? '60.0') ?? 60.0)
              .toDouble(),
    );
  }
}

class ProfileModals {
  // 1. MODAL DE ROTACIÓN DE CONTRASEÑA CON CHECKLIST ISO 27001 EN VIVO
  static Future<void> showPasswordRotationSheet(
    BuildContext context, {
    required bool isDark,
  }) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    bool obscureCurrent = true;
    bool obscureNew = true;
    bool isSaving = false;
    String? errorMsg;

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
          final pass = newCtrl.text;
          final hasMin = pass.length >= 8;
          final hasUpper = RegExp(r'[A-Z]').hasMatch(pass);
          final hasLower = RegExp(r'[a-z]').hasMatch(pass);
          final hasDigit = RegExp(r'\d').hasMatch(pass);
          final hasSpec = RegExp(
            r'[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\]]',
          ).hasMatch(pass);
          final isCompliant =
              hasMin && hasUpper && hasLower && hasDigit && hasSpec;

          Widget buildRule(String text, bool met) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Row(
                children: [
                  Icon(
                    met ? LucideIcons.circleCheck : LucideIcons.circle,
                    size: 14,
                    color: met ? SiparColors.green : textSec,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      text,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: met ? SiparColors.green : textSec,
                        fontWeight: met ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }

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
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: SiparColors.green.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          LucideIcons.shieldCheck,
                          color: SiparColors.green,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Rotación de Clave ISO 27001',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: textPrim,
                              ),
                            ),
                            Text(
                              'Control A.5.17 • Información de Autenticación',
                              style: TextStyle(fontSize: 11.5, color: textSec),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  if (errorMsg != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 14),
                      decoration: BoxDecoration(
                        color: SiparColors.red.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: SiparColors.red.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            LucideIcons.triangleAlert,
                            color: SiparColors.red,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              errorMsg!,
                              style: const TextStyle(
                                color: SiparColors.red,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  TextField(
                    controller: currentCtrl,
                    obscureText: obscureCurrent,
                    style: TextStyle(color: textPrim, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Contraseña actual',
                      labelStyle: TextStyle(color: textSec, fontSize: 13),
                      filled: true,
                      fillColor: bgInput,
                      prefixIcon: Icon(
                        LucideIcons.lock,
                        size: 18,
                        color: textSec,
                      ),
                      suffixIcon: IconButton(
                        onPressed: () => setModalState(
                          () => obscureCurrent = !obscureCurrent,
                        ),
                        icon: Icon(
                          obscureCurrent ? LucideIcons.eyeOff : LucideIcons.eye,
                          size: 18,
                          color: textSec,
                        ),
                      ),
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
                  TextField(
                    controller: newCtrl,
                    obscureText: obscureNew,
                    onChanged: (_) => setModalState(() {}),
                    style: TextStyle(color: textPrim, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Nueva contraseña segura',
                      labelStyle: TextStyle(color: textSec, fontSize: 13),
                      filled: true,
                      fillColor: bgInput,
                      prefixIcon: Icon(
                        LucideIcons.keyRound,
                        size: 18,
                        color: textSec,
                      ),
                      suffixIcon: IconButton(
                        onPressed: () =>
                            setModalState(() => obscureNew = !obscureNew),
                        icon: Icon(
                          obscureNew ? LucideIcons.eyeOff : LucideIcons.eye,
                          size: 18,
                          color: textSec,
                        ),
                      ),
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
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: bgInput,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: borderCol),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        buildRule('Mínimo 8 caracteres de longitud', hasMin),
                        buildRule(
                          'Al menos una letra mayúscula (A-Z)',
                          hasUpper,
                        ),
                        buildRule(
                          'Al menos una letra minúscula (a-z)',
                          hasLower,
                        ),
                        buildRule(
                          'Al menos un dígito numérico (0-9)',
                          hasDigit,
                        ),
                        buildRule(
                          'Al menos un símbolo especial (!@#\$%^&*)',
                          hasSpec,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: SiparColors.green,
                        disabledBackgroundColor: borderCol,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      onPressed:
                          (!isCompliant || currentCtrl.text.isEmpty || isSaving)
                          ? null
                          : () async {
                              setModalState(() {
                                isSaving = true;
                                errorMsg = null;
                              });
                              try {
                                await ApiClient.dio.post(
                                  '/api/v1/auth/change-password',
                                  data: {
                                    'current_password': currentCtrl.text,
                                    'new_password': newCtrl.text,
                                  },
                                );
                                if (ctx.mounted) Navigator.pop(ctx);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      backgroundColor: SiparColors.green,
                                      behavior: SnackBarBehavior.floating,
                                      content: Text(
                                        'Contraseña actualizada y auditada (ISO 27001).',
                                      ),
                                    ),
                                  );
                                }
                              } on DioException catch (e) {
                                setModalState(() {
                                  isSaving = false;
                                  errorMsg =
                                      e.response?.data?['detail']?.toString() ??
                                      'No se pudo actualizar la contraseña.';
                                });
                              }
                            },
                      child: isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'Confirmar Rotación de Clave',
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

  // 2. MODAL DE BITÁCORA PERSONAL Y AUDITORÍA ISO 27001 (SIN OVERFLOW)
  static Future<void> showSecurityAuditSheet(
    BuildContext context, {
    required bool isDark,
    required bool bioEnabled,
    required String biometricLabel,
    required String userEmail,
  }) async {
    final bgSheet = isDark ? const Color(0xFF0B0F17) : const Color(0xFFF4FBF7);
    final cardBg = isDark ? const Color(0xFF161E2E) : Colors.white;
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
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.78,
          minChildSize: 0.5,
          maxChildSize: 0.94,
          expand: false,
          builder: (_, scrollCtrl) {
            return FutureBuilder(
              future: ApiClient.dio.get('/api/v1/users/me/audit-logs?limit=25'),
              builder: (context, snapshot) {
                final logs = (snapshot.data?.data as List<dynamic>?) ?? [];

                return ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 32),
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
                    // CABECERA CON EXPANDED PARA EVITAR RIGHT OVERFLOW
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: SiparColors.green.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            LucideIcons.shieldCheck,
                            color: SiparColors.green,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Centro de Seguridad ISO 27001',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: textPrim,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Controles A.5.17, A.8.15, A.8.24 y Keychain',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: textSec,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: Icon(LucideIcons.x, color: textSec, size: 20),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: cardBg,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: borderCol),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'PROTECCIONES ACTIVAS EN TU CUENTA',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: textSec,
                              letterSpacing: 0.6,
                            ),
                          ),
                          const SizedBox(height: 12),
                          _SecurityCheckRow(
                            title: 'Almacenamiento y PII Cifrado (A.8.24)',
                            subtitle:
                                'Tokens en Keychain/Keystore y RUC cifrado en BD',
                            isActive: true,
                            textPrim: textPrim,
                            textSec: textSec,
                          ),
                          const Divider(height: 20),
                          _SecurityCheckRow(
                            title: 'Autenticación Biométrica ($biometricLabel)',
                            subtitle: bioEnabled
                                ? 'Desbloqueo biométrico activo para $userEmail'
                                : 'Pendiente de activación en preferencias',
                            isActive: bioEnabled,
                            textPrim: textPrim,
                            textSec: textSec,
                          ),
                          const Divider(height: 20),
                          _SecurityCheckRow(
                            title: 'Transporte Seguro OCPP 1.6J / TLS',
                            subtitle:
                                'Verificación de saldo y firma de sesión activa',
                            isActive: true,
                            textPrim: textPrim,
                            textSec: textSec,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Bitácora de Actividad de tu Cuenta (A.8.15)',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: textPrim,
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (snapshot.connectionState == ConnectionState.waiting)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 30),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: SiparColors.green,
                          ),
                        ),
                      )
                    else if (logs.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: cardBg,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: borderCol),
                        ),
                        child: Text(
                          'Sesión verificada. Tus eventos de inicio de sesión, biometría y recargas se auditan de forma inmutable conforme a ISO/IEC 27001.',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: textSec,
                            height: 1.4,
                          ),
                        ),
                      )
                    else
                      ...logs.map((raw) {
                        final item = Map<String, dynamic>.from(raw as Map);
                        final action = (item['action'] ?? 'EVENT').toString();
                        final details = (item['details'] ?? '').toString();
                        final ip = (item['ip_address'] ?? '').toString();
                        final status = (item['status'] ?? 'SUCCESS').toString();
                        final isOk = status == 'SUCCESS';

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: cardBg,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: borderCol),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                isOk
                                    ? LucideIcons.circleCheck
                                    : LucideIcons.triangleAlert,
                                size: 16,
                                color: isOk
                                    ? SiparColors.green
                                    : SiparColors.red,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            action,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.w800,
                                              color: textPrim,
                                            ),
                                          ),
                                        ),
                                        if (ip.isNotEmpty)
                                          Text(
                                            'IP: $ip',
                                            style: TextStyle(
                                              fontSize: 10.5,
                                              color: textSec,
                                            ),
                                          ),
                                      ],
                                    ),
                                    if (details.isNotEmpty) ...[
                                      const SizedBox(height: 3),
                                      Text(
                                        details,
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: textSec,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}

class _SecurityCheckRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool isActive;
  final Color textPrim;
  final Color textSec;

  const _SecurityCheckRow({
    required this.title,
    required this.subtitle,
    required this.isActive,
    required this.textPrim,
    required this.textSec,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          isActive ? LucideIcons.circleCheck : LucideIcons.clock,
          color: isActive ? SiparColors.green : const Color(0xFFF59E0B),
          size: 18,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: textPrim,
                ),
              ),
              const SizedBox(height: 2),
              Text(subtitle, style: TextStyle(fontSize: 11.5, color: textSec)),
            ],
          ),
        ),
      ],
    );
  }
}
