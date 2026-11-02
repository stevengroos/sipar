import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class WalletView extends StatefulWidget {
  const WalletView({super.key});

  @override
  State<WalletView> createState() => _WalletViewState();
}

class _WalletViewState extends State<WalletView> {
  String _filter = 'all';
  int _balancePyg = 150000;

  List<Map<String, dynamic>> _items = [
    {
      'id': 1,
      'type': 'charge',
      'title': 'Carga - SIPAR Luque Centro',
      'date': '06 Sep 2026, 14:30 hs',
      'amount': -25500,
      'dispute_status': 'none',
    },
    {
      'id': 2,
      'type': 'deposit',
      'title': 'Recarga - Visa ****4092',
      'date': '05 Sep 2026, 10:15 hs',
      'amount': 100000,
      'dispute_status': 'none',
    },
    {
      'id': 3,
      'type': 'charge',
      'title': 'Carga - SIPAR Conmebol',
      'date': '02 Sep 2026, 18:45 hs',
      'amount': -42000,
      'dispute_status': 'none',
    },
    {
      'id': 4,
      'type': 'deposit',
      'title': 'Recarga - Pago Móvil',
      'date': '01 Sep 2026, 09:00 hs',
      'amount': 50000,
      'dispute_status': 'none',
    },
  ];

  @override
  void initState() {
    super.initState();
    _loadRealTransactions();
  }

  Future<void> _loadRealTransactions() async {
    try {
      final res = await ApiClient.dio.get('/api/v1/transactions/?limit=30');
      final list = res.data as List<dynamic>;
      if (list.isEmpty) return;

      final mapped = <Map<String, dynamic>>[
        {
          'id': 9991,
          'type': 'deposit',
          'title': 'Recarga - Visa ****4092',
          'date': 'Recarga de Billetera SIPAR',
          'amount': 200000,
          'dispute_status': 'none',
        },
      ];

      for (final item in list) {
        final tx = item as Map<String, dynamic>;
        final amt =
            (double.tryParse(tx['total_amount_pyg']?.toString() ?? '0') ?? 0)
                .round();
        mapped.add({
          'id': tx['id'],
          'type': 'charge',
          'title': 'Carga - ${tx['charger_serial'] ?? "Estación SIPAR"}',
          'date': '${tx['kwh_delivered'] ?? 0} kWh • #TRX-${tx['id']}',
          'amount': -amt,
          'dispute_status': tx['dispute_status'] ?? 'none',
        });
      }

      if (mounted) setState(() => _items = mapped);
    } catch (_) {}
  }

  String _formatPyg(int val) {
    final s = val.abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  Future<void> _openTopUpDialog() async {
    final ctrl = TextEditingController(text: '50000');
    final added = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text(
          'Agregar fondos a tu Wallet',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Monto en Guaraníes (₲)',
            border: OutlineInputBorder(),
          ),
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
            onPressed: () =>
                Navigator.pop(ctx, int.tryParse(ctrl.text.trim()) ?? 0),
            child: const Text('Confirmar Recarga'),
          ),
        ],
      ),
    );

    if (added != null && added > 0) {
      setState(() {
        _balancePyg += added;
        _items.insert(0, {
          'id': DateTime.now().millisecondsSinceEpoch,
          'type': 'deposit',
          'title': 'Recarga - Visa ****4092',
          'date': 'Hoy • Acreditación inmediata',
          'amount': added,
          'dispute_status': 'none',
        });
      });
    }
  }

  Future<void> _openDisputeModal(Map<String, dynamic> tx) async {
    final ctrl = TextEditingController();
    final sent = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: Text(
          'Solicitar Reversión (${tx['title']})',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
        ),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText:
                'Describe el inconveniente con esta carga para Finanzas SIPAR...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
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
          content: Text('Solicitud de reversión enviada a Finanzas SIPAR.'),
        ),
      );
      _loadRealTransactions();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _items.where((t) {
      if (_filter == 'deposits') return (t['amount'] as int) > 0;
      if (_filter == 'charges') return (t['amount'] as int) < 0;
      return true;
    }).toList();

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 56, 20, 0),
      child: Column(
        children: [
          Container(
            height: 205,
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: SiparColors.dark,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.16),
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
                      'SIPAR',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 21,
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
                      'Tu balance:',
                      style: TextStyle(
                        color: Colors.grey.shade300,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _formatPyg(_balancePyg),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
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
                  onTap: _openTopUpDialog,
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
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        backgroundColor: SiparColors.blue,
                        content: Text(
                          'Transferencia entre cuentas SIPAR disponible próximamente.',
                        ),
                      ),
                    );
                  },
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
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F3F5),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              children: [
                _buildSegmentTab('all', 'Todos'),
                _buildSegmentTab('deposits', 'Depósitos'),
                _buildSegmentTab('charges', 'Cargos'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.only(bottom: 110),
              itemCount: filtered.length,
              itemBuilder: (context, index) {
                final t = filtered[index];
                final amount = t['amount'] as int;
                final isCharge = amount < 0;

                return GestureDetector(
                  onTap: isCharge ? () => _openDisputeModal(t) : null,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.grey.shade100),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.03),
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
                                    ? const Color(0xFFECFDF5)
                                    : const Color(0xFFEFF6FF),
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
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: SiparColors.dark,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  t['date'].toString(),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: SiparColors.gray,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        Text(
                          '${isCharge ? "-" : "+"} ${_formatPyg(amount)}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: isCharge
                                ? SiparColors.dark
                                : SiparColors.blue,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSegmentTab(String key, String label) {
    final active = _filter == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filter = key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: active ? FontWeight.bold : FontWeight.w600,
              color: active ? SiparColors.green : SiparColors.gray,
            ),
          ),
        ),
      ),
    );
  }
}
