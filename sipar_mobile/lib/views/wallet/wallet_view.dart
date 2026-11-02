import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';

class WalletView extends StatefulWidget {
  const WalletView({super.key});

  @override
  State<WalletView> createState() => _WalletViewState();
}

class _WalletViewState extends State<WalletView> {
  String _filter = 'all'; // 'all' | 'deposits' | 'charges'
  double _balancePyg = 0.0;
  bool _isLoading = true;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _loadWalletAndTransactions();
  }

  Future<void> _loadWalletAndTransactions() async {
    if (!mounted) return;
    setState(() => _isLoading = true);

    try {
      final results = await Future.wait([
        ApiClient.dio.get('/api/v1/wallet/balance'),
        ApiClient.dio.get('/api/v1/transactions/me?limit=50'),
      ]);

      final bal =
          (num.tryParse(results[0].data['balance_pyg']?.toString() ?? '0') ??
                  0.0)
              .toDouble();
      final txList = results[1].data as List<dynamic>? ?? [];

      final List<Map<String, dynamic>> mapped = [];

      for (final item in txList) {
        final tx = Map<String, dynamic>.from(item as Map);
        final amt =
            (num.tryParse(tx['total_amount_pyg']?.toString() ?? '0') ?? 0)
                .round();
        final kwh = num.tryParse(tx['kwh_delivered']?.toString() ?? '0') ?? 0;
        final trxId = tx['id'];
        final dateStr = tx['start_time'] != null
            ? _formatDate(tx['start_time'].toString())
            : 'Recarga SIPAR';

        mapped.add({
          'id': trxId,
          'type': 'charge',
          'title': 'Carga - ${tx['charger_serial'] ?? "Estación SIPAR"}',
          'date': '$kwh kWh • #TRX-$trxId • $dateStr',
          'amount': -amt,
          'dispute_status': tx['dispute_status'] ?? 'none',
        });
      }

      if (mounted) {
        setState(() {
          _balancePyg = bal;
          _items = mapped;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _formatDate(String isoStr) {
    try {
      final dt = DateTime.parse(isoStr).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  String _formatPyg(double val) {
    final s = val.round().abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  Future<void> _openTopUpDialog(bool isDark) async {
    HapticFeedback.lightImpact();
    final ctrl = TextEditingController(text: '50000');
    bool saving = false;
    String? errorMsg;

    final bgDialog = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final added = await showDialog<double>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: bgDialog,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: Text(
            'Agregar fondos a tu Wallet',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: textPrim,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (errorMsg != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    errorMsg!,
                    style: const TextStyle(
                      color: SiparColors.red,
                      fontSize: 12,
                    ),
                  ),
                ),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                style: TextStyle(color: textPrim),
                decoration: InputDecoration(
                  labelText: 'Monto en Guaraníes (₲)',
                  labelStyle: TextStyle(color: textSec),
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('Cancelar', style: TextStyle(color: textSec)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: SiparColors.green,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: saving
                  ? null
                  : () async {
                      final val = double.tryParse(ctrl.text.trim()) ?? 0;
                      if (val <= 0) {
                        setDialogState(
                          () => errorMsg = 'Ingresa un monto válido.',
                        );
                        return;
                      }
                      setDialogState(() => saving = true);
                      try {
                        final res = await ApiClient.dio.post(
                          '/api/v1/wallet/topup',
                          data: {'amount_pyg': val},
                        );
                        final newBal =
                            (num.tryParse(
                                      res.data['balance_pyg']?.toString() ??
                                          '0',
                                    ) ??
                                    0)
                                .toDouble();
                        if (ctx.mounted) Navigator.pop(ctx, newBal);
                      } on DioException catch (e) {
                        setDialogState(() {
                          saving = false;
                          errorMsg =
                              e.response?.data?['detail']?.toString() ??
                              'Error al procesar recarga.';
                        });
                      }
                    },
              child: saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      'Confirmar Recarga',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
            ),
          ],
        ),
      ),
    );

    if (added != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: SiparColors.green,
          behavior: SnackBarBehavior.floating,
          content: Text('¡Fondos acreditados con éxito en tu Wallet!'),
        ),
      );
      _loadWalletAndTransactions();
    }
  }

  Future<void> _openTransferDialog(bool isDark) async {
    HapticFeedback.lightImpact();
    final emailCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    bool saving = false;
    String? errorMsg;

    final bgDialog = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final success = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: bgDialog,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: Text(
            'Transferir saldo a otro usuario',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: textPrim,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Envía guaraníes instantáneamente a cualquier conductor SIPAR usando su correo.',
                style: TextStyle(fontSize: 12, color: textSec),
              ),
              const SizedBox(height: 14),
              if (errorMsg != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    errorMsg!,
                    style: const TextStyle(
                      color: SiparColors.red,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              TextField(
                controller: emailCtrl,
                keyboardType: TextInputType.emailAddress,
                style: TextStyle(color: textPrim),
                decoration: InputDecoration(
                  labelText: 'Correo electrónico destinatario',
                  labelStyle: TextStyle(color: textSec),
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: amountCtrl,
                keyboardType: TextInputType.number,
                style: TextStyle(color: textPrim),
                decoration: InputDecoration(
                  labelText: 'Monto en Guaraníes (₲)',
                  labelStyle: TextStyle(color: textSec),
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Cancelar', style: TextStyle(color: textSec)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: SiparColors.blue,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: saving
                  ? null
                  : () async {
                      final email = emailCtrl.text.trim();
                      final amount =
                          double.tryParse(amountCtrl.text.trim()) ?? 0;
                      if (email.isEmpty || !email.contains('@')) {
                        setDialogState(
                          () => errorMsg = 'Ingresa un correo válido.',
                        );
                        return;
                      }
                      if (amount <= 0) {
                        setDialogState(
                          () => errorMsg = 'Ingresa un monto válido.',
                        );
                        return;
                      }

                      setDialogState(() => saving = true);
                      try {
                        await ApiClient.dio.post(
                          '/api/v1/wallet/transfer',
                          data: {
                            'recipient_email': email,
                            'amount_pyg': amount,
                          },
                        );
                        if (ctx.mounted) Navigator.pop(ctx, true);
                      } on DioException catch (e) {
                        setDialogState(() {
                          saving = false;
                          errorMsg =
                              e.response?.data?['detail']?.toString() ??
                              'Error en la transferencia.';
                        });
                      }
                    },
              child: saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      'Transferir',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
            ),
          ],
        ),
      ),
    );

    if (success == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: SiparColors.blue,
          behavior: SnackBarBehavior.floating,
          content: Text('¡Transferencia realizada con éxito!'),
        ),
      );
      _loadWalletAndTransactions();
    }
  }

  Future<void> _openDisputeModal(Map<String, dynamic> tx, bool isDark) async {
    HapticFeedback.lightImpact();
    final ctrl = TextEditingController();
    final bgDialog = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;

    final sent = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: bgDialog,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Solicitar Reversión (${tx['title']})',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: textPrim,
          ),
        ),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          style: TextStyle(color: textPrim),
          decoration: InputDecoration(
            hintText:
                'Describe el inconveniente con esta carga para Finanzas SIPAR...',
            hintStyle: TextStyle(color: textSec),
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancelar', style: TextStyle(color: textSec)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: SiparColors.green,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              if (ctrl.text.trim().length < 5) return;
              try {
                await ApiClient.dio.post(
                  '/api/v1/transactions/${tx['id']}/dispute',
                  data: {'reason': ctrl.text.trim()},
                );
              } catch (_) {}
              if (ctx.mounted) Navigator.pop(ctx, true);
            },
            child: const Text('Enviar a Finanzas'),
          ),
        ],
      ),
    );

    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: SiparColors.green,
          behavior: SnackBarBehavior.floating,
          content: Text('Solicitud de reversión enviada a Finanzas SIPAR.'),
        ),
      );
      _loadWalletAndTransactions();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    final textPrim = isDark ? const Color(0xFFF8FAFC) : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final cardBg = isDark ? const Color(0xFF18202F) : Colors.white;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade100;

    final filtered = _items.where((t) {
      if (_filter == 'deposits') return (t['amount'] as int) > 0;
      if (_filter == 'charges') return (t['amount'] as int) < 0;
      return true;
    }).toList();

    return RefreshIndicator(
      color: SiparColors.green,
      backgroundColor: cardBg,
      onRefresh: _loadWalletAndTransactions,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 56, 20, 120),
        children: [
          Container(
            height: 205,
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: isDark
                  ? const LinearGradient(
                      colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                    )
                  : const LinearGradient(
                      colors: [SiparColors.dark, Color(0xFF2D3748)],
                    ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.16),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: const [
                    Icon(LucideIcons.leaf, color: SiparColors.green, size: 22),
                    SizedBox(width: 8),
                    Text(
                      'SIPAR WALLET',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tu balance disponible:',
                      style: TextStyle(
                        color: Colors.grey.shade300,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    _isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(
                            _formatPyg(_balancePyg),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                            ),
                          ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => _openTopUpDialog(isDark),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [SiparColors.green, Color(0xFF059669)],
                      ),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [
                        BoxShadow(
                          color: SiparColors.green.withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Column(
                      children: const [
                        Icon(LucideIcons.plus, color: Colors.white, size: 20),
                        SizedBox(height: 4),
                        Text(
                          'Agregar fondos',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: GestureDetector(
                  onTap: () => _openTransferDialog(isDark),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [SiparColors.blue, Color(0xFF2563EB)],
                      ),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [
                        BoxShadow(
                          color: SiparColors.blue.withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Column(
                      children: const [
                        Icon(
                          LucideIcons.arrowLeftRight,
                          color: Colors.white,
                          size: 20,
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Transferir saldo',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF161E2E) : const Color(0xFFF1F3F5),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              children: [
                _buildSegmentTab('all', 'Todos', isDark),
                _buildSegmentTab('deposits', 'Depósitos', isDark),
                _buildSegmentTab('charges', 'Cargos', isDark),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: SiparColors.green),
              ),
            )
          else if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: Text(
                  'No hay movimientos en este filtro.',
                  style: TextStyle(color: textSec, fontWeight: FontWeight.w600),
                ),
              ),
            )
          else
            ...filtered.map((t) {
              final amount = t['amount'] as int;
              final isCharge = amount < 0;

              return GestureDetector(
                onTap: isCharge ? () => _openDisputeModal(t, isDark) : null,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: borderCol),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: isDark ? 0.2 : 0.03,
                        ),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: isCharge
                                  ? (isDark
                                        ? SiparColors.green.withValues(
                                            alpha: 0.15,
                                          )
                                        : const Color(0xFFECFDF5))
                                  : (isDark
                                        ? SiparColors.blue.withValues(
                                            alpha: 0.15,
                                          )
                                        : const Color(0xFFEFF6FF)),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              isCharge
                                  ? LucideIcons.zap
                                  : LucideIcons.arrowDown,
                              color: isCharge
                                  ? SiparColors.green
                                  : SiparColors.blue,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                t['title'].toString(),
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: textPrim,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                t['date'].toString(),
                                style: TextStyle(fontSize: 12, color: textSec),
                              ),
                            ],
                          ),
                        ],
                      ),
                      Text(
                        '${isCharge ? "-" : "+"} ${_formatPyg(amount.toDouble())}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: isCharge ? textPrim : SiparColors.blue,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildSegmentTab(String key, String label, bool isDark) {
    final active = _filter == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filter = key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active
                ? (isDark ? const Color(0xFF1E293B) : Colors.white)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: active ? FontWeight.bold : FontWeight.w600,
              color: active
                  ? SiparColors.green
                  : (isDark ? const Color(0xFF94A3B8) : SiparColors.gray),
            ),
          ),
        ),
      ),
    );
  }
}
