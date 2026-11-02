import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api_client.dart';
import '../../core/biometric_service.dart';
import '../../core/secure_storage_service.dart';
import '../../core/theme.dart';

class PerfilView extends StatefulWidget {
  final VoidCallback onLogout;
  const PerfilView({super.key, required this.onLogout});

  @override
  State<PerfilView> createState() => _PerfilViewState();
}

class _PerfilViewState extends State<PerfilView> {
  String _fullName = 'Steven Groos';
  String _userIdBadge = 'ID 3832';
  bool _bioEnabled = false;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final user = await SecureStorageService.getUser();
    final bio = await SecureStorageService.isBiometricEnabled();
    if (!mounted) return;
    setState(() {
      _bioEnabled = bio;
      if (user != null) {
        final fn = (user['first_name'] ?? '').toString().trim();
        final ln = (user['last_name'] ?? '').toString().trim();
        final full = '$fn $ln'.trim();
        if (full.isNotEmpty) _fullName = full;
        if (user['id'] != null) _userIdBadge = 'ID ${user['id']}';
      }
    });
  }

  Future<void> _toggleBiometrics() async {
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
          content: Text(
            nextVal
                ? 'Face ID / Biometría activada (ISO 27001)'
                : 'Face ID desactivado',
          ),
        ),
      );
    }
  }

  // Modal de Rotación de Contraseña ISO 27001 A.5.17
  Future<void> _openPasswordRotationModal() async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    String? modalError;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          backgroundColor: Colors.white,
          title: Row(
            children: const [
              Icon(LucideIcons.shieldCheck, color: SiparColors.green, size: 20),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Rotación de Clave ISO 27001',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (modalError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    modalError!,
                    style: const TextStyle(
                      color: SiparColors.red,
                      fontSize: 12,
                    ),
                  ),
                ),
              TextField(
                controller: currentCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Contraseña actual',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: newCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Nueva contraseña (8+ car., A-Z, 0-9, símbolo)',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: SiparColors.green,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                try {
                  await ApiClient.dio.post(
                    '/api/v1/auth/change-password',
                    data: {
                      'current_password': currentCtrl.text,
                      'new_password': newCtrl.text,
                    },
                  );
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        backgroundColor: SiparColors.green,
                        content: Text(
                          'Contraseña actualizada conforme a ISO 27001.',
                        ),
                      ),
                    );
                  }
                } on DioException catch (e) {
                  setModalState(() {
                    modalError =
                        e.response?.data?['detail']?.toString() ??
                        'No se pudo actualizar la contraseña.';
                  });
                }
              },
              child: const Text('Actualizar Clave'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 56, 20, 120),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Stack(
                  children: [
                    Container(
                      width: 76,
                      height: 76,
                      decoration: const BoxDecoration(
                        color: SiparColors.green,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        LucideIcons.power,
                        color: Colors.white,
                        size: 34,
                      ),
                    ),
                    Positioned(
                      bottom: 0,
                      right: 0,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: SiparColors.dark,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(
                          LucideIcons.pencil,
                          color: Colors.white,
                          size: 11,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _fullName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: SiparColors.dark,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFD1FAE5),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            LucideIcons.idCard,
                            size: 12,
                            color: SiparColors.green,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _userIdBadge,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.bold,
                              color: SiparColors.green,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.grey.shade100),
              ),
              child: const Icon(
                LucideIcons.bell,
                color: SiparColors.dark,
                size: 18,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.grey.shade100),
                ),
                child: Column(
                  children: const [
                    Icon(LucideIcons.tag, color: SiparColors.dark, size: 24),
                    SizedBox(height: 8),
                    Text(
                      'Promociones',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: SiparColors.dark,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: GestureDetector(
                onTap: _openPasswordRotationModal,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Colors.grey.shade100),
                  ),
                  child: Column(
                    children: const [
                      Icon(
                        LucideIcons.settings,
                        color: SiparColors.dark,
                        size: 24,
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Configuración',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: SiparColors.dark,
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
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: const [
            Text(
              'Mis autos',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: SiparColors.dark,
              ),
            ),
            Text(
              'Ver más',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.bold,
                color: SiparColors.green,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.grey.shade100),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  LucideIcons.car,
                  color: SiparColors.green,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'BYD Dolphin',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: SiparColors.dark,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Placa: AAA 123 • CCS2',
                      style: TextStyle(fontSize: 12, color: SiparColors.gray),
                    ),
                  ],
                ),
              ),
              const Icon(
                LucideIcons.chevronRight,
                color: Colors.grey,
                size: 18,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () {},
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: SiparColors.green, width: 1.5),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: const Text(
            'Agregar otro auto',
            style: TextStyle(
              color: SiparColors.green,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ),
        const SizedBox(height: 26),
        const Text(
          'Preferencias',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: SiparColors.dark,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.grey.shade100),
          ),
          child: Column(
            children: [
              _buildPrefRow(
                icon: LucideIcons.creditCard,
                title: 'Métodos de pago',
                trailingChip: 'Visa ****4092',
              ),
              _buildPrefRow(icon: LucideIcons.fileText, title: 'Facturación'),
              _buildPrefRow(
                icon: LucideIcons.scanFace,
                title: 'Código de acceso y Face ID',
                trailingChip: _bioEnabled ? 'Face ID Activo' : 'Activar',
                onTap: _toggleBiometrics,
              ),
              _buildPrefRow(
                icon: LucideIcons.keyRound,
                title: 'Rotar contraseña (ISO 27001)',
                onTap: _openPasswordRotationModal,
              ),
              _buildPrefRow(
                icon: LucideIcons.messageSquare,
                title: 'Preguntas frecuentes',
              ),
              _buildPrefRow(
                icon: LucideIcons.messageCircleMore,
                iconColor: SiparColors.blue,
                title: 'Comentarios y sugerencias',
              ),
              _buildPrefRow(
                icon: LucideIcons.info,
                title: 'Información (ISO/IEC 27001)',
              ),
              _buildPrefRow(
                icon: LucideIcons.logOut,
                title: 'Cerrar sesión',
                isDestructive: true,
                showDivider: false,
                onTap: widget.onLogout,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPrefRow({
    required IconData icon,
    required String title,
    Color? iconColor,
    String? trailingChip,
    bool isDestructive = false,
    bool showDivider = true,
    VoidCallback? onTap,
  }) {
    final mainColor = isDestructive ? SiparColors.red : SiparColors.dark;
    return InkWell(
      onTap: onTap ?? () {},
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          border: showDivider
              ? Border(bottom: BorderSide(color: Colors.grey.shade100))
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: isDestructive
                        ? Colors.red.shade50
                        : const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    icon,
                    size: 16,
                    color: isDestructive
                        ? SiparColors.red
                        : (iconColor ?? SiparColors.gray),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: mainColor,
                  ),
                ),
              ],
            ),
            Row(
              children: [
                if (trailingChip != null) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      trailingChip,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: SiparColors.gray,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Icon(
                  LucideIcons.chevronRight,
                  size: 16,
                  color: isDestructive
                      ? Colors.red.shade200
                      : Colors.grey.shade300,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
