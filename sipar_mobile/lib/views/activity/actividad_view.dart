import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

class _UserTxItem {
  final int id;
  final String status;
  final String chargerSerial;
  final int connectorId;
  final double kwh;
  final int amountPyg;
  final double durationSeconds;
  final DateTime? startTime;
  final DateTime? endTime;
  final String errorCode;
  final String stopReason;

  const _UserTxItem({
    required this.id,
    required this.status,
    required this.chargerSerial,
    required this.connectorId,
    required this.kwh,
    required this.amountPyg,
    required this.durationSeconds,
    this.startTime,
    this.endTime,
    required this.errorCode,
    required this.stopReason,
  });

  factory _UserTxItem.fromJson(Map<String, dynamic> json) {
    return _UserTxItem(
      id: (num.tryParse(json['id']?.toString() ?? '0') ?? 0).toInt(),
      status: (json['status'] ?? 'desconocido').toString(),
      chargerSerial: (json['charger_serial'] ?? 'SIPAR').toString(),
      connectorId: (num.tryParse(json['connector_id']?.toString() ?? '1') ?? 1)
          .toInt(),
      kwh:
          (num.tryParse(
                    json['kwh_delivered']?.toString() ??
                        json['kwh']?.toString() ??
                        '0',
                  ) ??
                  0)
              .toDouble(),
      amountPyg:
          (num.tryParse(
                    json['total_amount_pyg']?.toString() ??
                        json['amount_pyg']?.toString() ??
                        '0',
                  ) ??
                  0)
              .toInt(),
      durationSeconds:
          (num.tryParse(json['duration_seconds']?.toString() ?? '0') ?? 0)
              .toDouble(),
      startTime: json['start_time'] != null
          ? DateTime.tryParse(json['start_time'].toString())?.toLocal()
          : null,
      endTime: json['end_time'] != null
          ? DateTime.tryParse(json['end_time'].toString())?.toLocal()
          : null,
      errorCode: (json['error_code'] ?? 'NoError').toString(),
      stopReason: (json['stop_reason'] ?? 'Local').toString(),
    );
  }
}

class ActividadView extends StatefulWidget {
  const ActividadView({super.key});

  @override
  State<ActividadView> createState() => _ActividadViewState();
}

class _ActividadViewState extends State<ActividadView> {
  String _period = 'month';
  bool _isLoading = true;

  double _totalKwh = 0.0;
  double _co2SavedKg = 0.0;
  int _sessionsCount = 0;
  int _totalSpentPyg = 0;
  double _totalDurationSec = 0.0;
  List<_UserTxItem> _recentSessions = [];

  @override
  void initState() {
    super.initState();
    _loadActivityData();
  }

  String get _periodLabel {
    if (_period == 'today') return 'Hoy';
    if (_period == 'all') return 'Histórico total';
    return 'Últimos 30 días';
  }

  Future<void> _loadActivityData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);

    try {
      // Endpoint optimizado que realiza la búsqueda, el filtro y la paginación en SQL
      final res = await ApiClient.dio.get(
        '/api/v1/transactions/me?period=$_period&limit=50',
      );
      final txRaw = res.data as List<dynamic>? ?? [];

      double kwh = 0.0;
      int spent = 0;
      double duration = 0.0;
      final parsedSessions = <_UserTxItem>[];

      for (final item in txRaw) {
        if (item is Map) {
          final tx = _UserTxItem.fromJson(Map<String, dynamic>.from(item));
          parsedSessions.add(tx);
          kwh += tx.kwh;
          spent += tx.amountPyg;
          duration += tx.durationSeconds;
        }
      }

      if (!mounted) return;
      setState(() {
        _totalKwh = kwh;
        _co2SavedKg = double.parse((kwh * 1.052).toStringAsFixed(2));
        _sessionsCount = parsedSessions.length;
        _totalSpentPyg = spent;
        _totalDurationSec = duration;
        _recentSessions = parsedSessions;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _selectPeriodModal() async {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: isDark ? const Color(0xFF161E2E) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        final options = [
          {'id': 'month', 'label': 'Últimos 30 días (Este mes)'},
          {'id': 'today', 'label': 'Hoy'},
          {'id': 'all', 'label': 'Histórico total'},
        ];
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Seleccionar período',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : SiparColors.dark,
                ),
              ),
              const SizedBox(height: 12),
              ...options.map((opt) {
                final isSelected = _period == opt['id'];
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    opt['label']!,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: isSelected
                          ? FontWeight.bold
                          : FontWeight.w500,
                      color: isSelected
                          ? SiparColors.green
                          : (isDark
                                ? const Color(0xFF94A3B8)
                                : SiparColors.dark),
                    ),
                  ),
                  trailing: isSelected
                      ? const Icon(
                          LucideIcons.check,
                          color: SiparColors.green,
                          size: 18,
                        )
                      : null,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    Navigator.pop(ctx, opt['id']);
                  },
                );
              }),
            ],
          ),
        );
      },
    );

    if (selected != null && selected != _period) {
      setState(() => _period = selected);
      _loadActivityData();
    }
  }

  String _formatSeconds(double sec) {
    if (sec <= 0) return "00:00:00";
    final int total = sec.floor();
    final int hrs = total ~/ 3600;
    final int mins = (total % 3600) ~/ 60;
    final int secs = total % 60;
    return '${hrs.toString().padLeft(2, '0')}:${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _formatPyg(int val) {
    final s = val.abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  String _formatDateShort(DateTime? date) {
    if (date == null) return 'N/A';
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  void _abrirDetalleTransaccion(_UserTxItem tx, bool isDark) {
    HapticFeedback.lightImpact();
    final bgSurface = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    final hasFault = tx.errorCode.isNotEmpty && tx.errorCode != 'NoError';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark
          ? const Color(0xFF0B0F17)
          : const Color(0xFFF4FBF7),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.75,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, controller) {
            return Column(
              children: [
                // Cabecera Modal
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                  decoration: BoxDecoration(
                    color: bgSurface,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                    border: Border(bottom: BorderSide(color: borderCol)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: tx.status == 'concluida'
                                      ? SiparColors.green.withValues(alpha: 0.1)
                                      : SiparColors.blue.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      tx.status == 'concluida'
                                          ? LucideIcons.circleCheck
                                          : LucideIcons.loader,
                                      size: 12,
                                      color: tx.status == 'concluida'
                                          ? SiparColors.green
                                          : SiparColors.blue,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      tx.status == 'concluida'
                                          ? 'Concluida'
                                          : 'En Curso',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: tx.status == 'concluida'
                                            ? SiparColors.green
                                            : SiparColors.blue,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (hasFault) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: SiparColors.red.withValues(
                                      alpha: 0.1,
                                    ),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    tx.errorCode.split(' ').first,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: SiparColors.red,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          GestureDetector(
                            onTap: () => Navigator.pop(ctx),
                            child: Icon(
                              LucideIcons.x,
                              color: textSec,
                              size: 22,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Recarga / #${tx.id}',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: textPrim,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(LucideIcons.clock, size: 14, color: textSec),
                          const SizedBox(width: 4),
                          Text(
                            _formatSeconds(tx.durationSeconds),
                            style: TextStyle(
                              fontSize: 12,
                              color: textSec,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Icon(
                            LucideIcons.zap,
                            size: 14,
                            color: SiparColors.green,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${tx.kwh.toStringAsFixed(2)} kWh',
                            style: TextStyle(
                              fontSize: 12,
                              color: SiparColors.green,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Contenido Scrollable
                Expanded(
                  child: ListView(
                    controller: controller,
                    padding: const EdgeInsets.all(20),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: bgSurface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: borderCol),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'INICIO',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: textSec,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _formatDateShort(tx.startTime),
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: textPrim,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              LucideIcons.chevronRight,
                              color: borderCol,
                              size: 20,
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    'CONCLUSIÓN',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: textSec,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    tx.endTime != null
                                        ? _formatDateShort(tx.endTime)
                                        : 'Activa',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: textPrim,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: bgSurface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: borderCol),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'ESTACIÓN Y CONECTOR',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: textSec,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              tx.chargerSerial,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: textPrim,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'SIPAR EV Network',
                              style: TextStyle(fontSize: 12, color: textSec),
                            ),
                            const Divider(height: 24),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Manguera #${tx.connectorId}',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: textPrim,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isDark
                                        ? const Color(0xFF1E293B)
                                        : const Color(0xFFF1F5F9),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'OCPP 1.6J',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: textSec,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: bgSurface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: borderCol),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'LIQUIDACIÓN DE RECARGA',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: textSec,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Energía consumida',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: textSec,
                                  ),
                                ),
                                Text(
                                  '${tx.kwh.toStringAsFixed(2)} kWh',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: textPrim,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Duración de sesión',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: textSec,
                                  ),
                                ),
                                Text(
                                  _formatSeconds(tx.durationSeconds),
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: textPrim,
                                  ),
                                ),
                              ],
                            ),
                            const Divider(height: 24),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Total debitado',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: textPrim,
                                  ),
                                ),
                                Text(
                                  _formatPyg(tx.amountPyg),
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    color: SiparColors.green,
                                  ),
                                ),
                              ],
                            ),
                            if (hasFault) ...[
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: SiparColors.red.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      LucideIcons.triangleAlert,
                                      color: SiparColors.red,
                                      size: 14,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Motivo cierre: ${tx.stopReason}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: SiparColors.red,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    final bgTextPrimary = isDark ? const Color(0xFFF8FAFC) : SiparColors.dark;
    final bgTextSecondary = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final cardBg = isDark ? const Color(0xFF18202F) : Colors.white;
    final subtleBg = isDark ? const Color(0xFF222C3F) : const Color(0xFFF1F5F9);
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    return RefreshIndicator(
      color: SiparColors.green,
      backgroundColor: cardBg,
      onRefresh: _loadActivityData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 56, 20, 120),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              GestureDetector(
                onTap: _selectPeriodModal,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: borderCol),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _periodLabel,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: bgTextPrimary,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        LucideIcons.chevronDown,
                        size: 14,
                        color: bgTextSecondary,
                      ),
                    ],
                  ),
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _loadActivityData();
                },
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: borderCol),
                  ),
                  child: Icon(
                    LucideIcons.refreshCw,
                    size: 16,
                    color: bgTextPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          Text(
            'Mis Estadísticas',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: bgTextPrimary,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 16),

          if (_isLoading)
            const SizedBox(
              height: 100,
              child: Center(
                child: CircularProgressIndicator(color: SiparColors.green),
              ),
            )
          else
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              childAspectRatio: 1.35,
              children: [
                _MetricCard(
                  icon: LucideIcons.leaf,
                  iconColor: SiparColors.green,
                  iconBg: isDark
                      ? SiparColors.green.withValues(alpha: 0.15)
                      : const Color(0xFFECFDF5),
                  title: 'CO2 Ahorrado',
                  value: '${_co2SavedKg.toStringAsFixed(2)} kg',
                  subtitle: _periodLabel,
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: bgTextPrimary,
                  textSec: bgTextSecondary,
                ),
                _MetricCard(
                  icon: LucideIcons.zap,
                  iconColor: SiparColors.blue,
                  iconBg: isDark
                      ? SiparColors.blue.withValues(alpha: 0.15)
                      : const Color(0xFFEFF6FF),
                  title: 'Energía',
                  value: '${_totalKwh.toStringAsFixed(2)} kWh',
                  subtitle: 'Consumo total',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: bgTextPrimary,
                  textSec: bgTextSecondary,
                ),
                _MetricCard(
                  icon: LucideIcons.clock,
                  iconColor: isDark ? Colors.white : SiparColors.gray,
                  iconBg: subtleBg,
                  title: 'Tiempo',
                  value: _formatSeconds(_totalDurationSec),
                  subtitle: 'Tiempo total',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: bgTextPrimary,
                  textSec: bgTextSecondary,
                ),
                _MetricCard(
                  icon: LucideIcons.plug,
                  iconColor: isDark ? Colors.white : SiparColors.gray,
                  iconBg: subtleBg,
                  title: 'Sesiones',
                  value: '$_sessionsCount',
                  subtitle: 'Recargas logradas',
                  cardBg: cardBg,
                  borderCol: borderCol,
                  textPrim: bgTextPrimary,
                  textSec: bgTextSecondary,
                ),
              ],
            ),

          const SizedBox(height: 24),

          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: borderCol),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Inversión acumulada',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: bgTextPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Total facturado en tus sesiones OCPP en este período',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: bgTextSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  _formatPyg(_totalSpentPyg),
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: bgTextPrimary,
                  ),
                ),
              ],
            ),
          ),

          if (_recentSessions.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text(
              'Historial de Recargas',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: bgTextPrimary,
              ),
            ),
            const SizedBox(height: 12),

            ..._recentSessions.map((tx) {
              final hasFault =
                  tx.errorCode.isNotEmpty && tx.errorCode != 'NoError';
              return GestureDetector(
                onTap: () => _abrirDetalleTransaccion(tx, isDark),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderCol),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: isDark ? 0.2 : 0.02,
                        ),
                        blurRadius: 8,
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
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: hasFault
                                  ? SiparColors.red.withValues(alpha: 0.15)
                                  : SiparColors.green.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              hasFault
                                  ? LucideIcons.triangleAlert
                                  : LucideIcons.zap,
                              size: 16,
                              color: hasFault
                                  ? SiparColors.red
                                  : SiparColors.green,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${tx.chargerSerial} • #${tx.id}',
                                style: TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.bold,
                                  color: bgTextPrimary,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                hasFault
                                    ? 'Alerta OCPP: ${tx.errorCode.split(' ').first}'
                                    : _formatDateShort(tx.startTime),
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: hasFault
                                      ? SiparColors.red
                                      : bgTextSecondary,
                                  fontWeight: hasFault
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _formatPyg(tx.amountPyg),
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: bgTextPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(
                                '${tx.kwh.toStringAsFixed(2)} kWh',
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: SiparColors.green,
                                ),
                              ),
                              Icon(
                                LucideIcons.chevronRight,
                                size: 14,
                                color: bgTextSecondary,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ] else if (!_isLoading) ...[
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: Center(
                child: Column(
                  children: [
                    Icon(LucideIcons.receipt, size: 48, color: borderCol),
                    const SizedBox(height: 12),
                    Text(
                      'No hay recargas en este período.',
                      style: TextStyle(
                        color: bgTextSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String value;
  final String subtitle;

  final Color cardBg;
  final Color borderCol;
  final Color textPrim;
  final Color textSec;

  const _MetricCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.value,
    required this.subtitle,
    required this.cardBg,
    required this.borderCol,
    required this.textPrim,
    required this.textSec,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: borderCol),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: iconBg,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 13, color: iconColor),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: textSec,
                  ),
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: textPrim,
                  letterSpacing: -0.5,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 10.5,
                  color: textSec,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
