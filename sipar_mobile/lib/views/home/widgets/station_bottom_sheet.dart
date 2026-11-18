import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme.dart';
import '../../../models/charger_station.dart';
import 'map_ui_palette.dart';

// Convertimos a StatefulWidget para manejar el estado del Slider de tiempo
class StationBottomSheet extends StatefulWidget {
  final ChargerStationModel station;
  final int activeConnectorId;
  final String sendingCommand;
  final double? walletBalance;
  final LatLng referenceCenter;
  final Color statusColor;
  final ValueChanged<int> onSelectConnector;
  final VoidCallback onClose;
  final VoidCallback onOpenMaps;
  // Cambiamos el callback para que envíe también la duración elegida en minutos
  final void Function(String command, {int durationMinutes}) onSendCommand;

  const StationBottomSheet({
    super.key,
    required this.station,
    required this.activeConnectorId,
    required this.sendingCommand,
    required this.walletBalance,
    required this.referenceCenter,
    required this.statusColor,
    required this.onSelectConnector,
    required this.onClose,
    required this.onOpenMaps,
    required this.onSendCommand,
  });

  @override
  State<StationBottomSheet> createState() => _StationBottomSheetState();
}

class _StationBottomSheetState extends State<StationBottomSheet> {
  // 0 significa "Sin Límite", > 0 es el tiempo en minutos
  double _selectedMinutes = 0;

  String _formatPyg(double val) {
    final s = val.round().abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  String _statusLabel(String status, bool hasFault, bool isOffline) {
    if (isOffline) return 'Fuera de Línea';
    if (hasFault) return 'En Mantenimiento';
    switch (status) {
      case 'disponible':
        return 'Disponible';
      case 'conectado':
        return 'Auto Conectado';
      case 'en_uso':
        return 'En Carga';
      default:
        return 'No disponible';
    }
  }

  // Calcula el costo de cargar por la cantidad de minutos elegidos a la potencia máxima
  double _calculateCostForMinutes(
    double minutes,
    double powerKw,
    int priceKwh,
  ) {
    if (minutes == 0) return 0;
    double kwhToConsume = (minutes / 60) * powerKw;
    return kwhToConsume * priceKwh;
  }

  String _formatDurationLabel(double val) {
    if (val == 0) return "Sin Límite";
    if (val < 60) return "${val.toInt()} min";
    int h = val.toInt() ~/ 60;
    int m = val.toInt() % 60;
    if (m == 0) return "${h}h";
    return "${h}h ${m}m";
  }

  @override
  Widget build(BuildContext context) {
    final palette = MapUiPalette.of(context);

    final activeConnectorObj =
        widget.station.connectors
            .where((c) => c.connectorId == widget.activeConnectorId)
            .firstOrNull ??
        (widget.station.connectors.isNotEmpty
            ? widget.station.connectors.first
            : null);

    final displayConnectorStatus = widget.station.isOffline
        ? 'fuera_de_linea'
        : (activeConnectorObj?.status ?? widget.station.status);

    final activeErrorCode =
        (activeConnectorObj != null &&
            activeConnectorObj.errorCode.isNotEmpty &&
            activeConnectorObj.errorCode != 'NoError')
        ? activeConnectorObj.errorCode
        : widget.station.lastErrorCode;

    final isConnectorCharging = displayConnectorStatus == 'en_uso';

    // --- LÓGICA FINANCIERA PARA EL TEMPORIZADOR ---
    final double currentBalance = widget.walletBalance ?? 0.0;
    // Potencia del conector actual
    final double currentPowerKw = widget.activeConnectorId == 1
        ? widget.station.powerKw
        : (widget.station.powerKw >= 120 ? 60.0 : widget.station.powerKw);

    final double estimatedCost = _calculateCostForMinutes(
      _selectedMinutes,
      currentPowerKw,
      widget.station.priceKwh,
    );

    // El balance es insuficiente si no tiene dinero en absoluto, o si escogió un tiempo y el costo supera su saldo
    final bool hasInsufficientBalance =
        !isConnectorCharging &&
        (currentBalance <= 0 ||
            (_selectedMinutes > 0 && estimatedCost > currentBalance));

    return Container(
      constraints: BoxConstraints(
        maxHeight:
            MediaQuery.of(context).size.height *
            0.85, // Aumentado para alojar el Slider
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 104),
      decoration: BoxDecoration(
        color: palette.sheetBg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
        border: Border(top: BorderSide(color: palette.border, width: 1)),
        boxShadow: [
          BoxShadow(
            color: palette.shadowColor,
            blurRadius: 28,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Barra de arrastre y botón cerrar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const SizedBox(width: 28),
                GestureDetector(
                  onTap: widget.onClose,
                  child: Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: palette.textSecondary.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: widget.onClose,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: palette.subtleBg,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      LucideIcons.x,
                      size: 15,
                      color: palette.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Alerta técnica si existe falla en el conector
            if (activeErrorCode.isNotEmpty && activeErrorCode != 'NoError')
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: SiparColors.red.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: SiparColors.red.withValues(alpha: 0.35),
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(
                      LucideIcons.triangleAlert,
                      color: SiparColors.red,
                      size: 16,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Conector en mantenimiento preventivo. Seleccione otra manguera o estación.',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: SiparColors.red,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // 1. CABECERA DE ESTACIÓN + BOTÓN IR A GOOGLE MAPS
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: palette.cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: palette.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: widget.statusColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      widget.station.isPrivate
                          ? LucideIcons.home
                          : LucideIcons.zap,
                      color: widget.statusColor,
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
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: widget.statusColor.withValues(
                                  alpha: 0.14,
                                ),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _statusLabel(
                                  widget.station.status,
                                  widget.station.hasFault,
                                  widget.station.isOffline,
                                ),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: widget.statusColor,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              widget.station.serialNumber,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: palette.textSecondary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.station.address,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 15.5,
                            fontWeight: FontWeight.w800,
                            color: palette.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      widget.onOpenMaps();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: SiparColors.green.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: SiparColors.green.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            LucideIcons.navigation,
                            size: 15,
                            color: SiparColors.green,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.station.distanceLabelFrom(
                              widget.referenceCenter,
                            ),
                            style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: SiparColors.green,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // 2. SELECTOR COMPACTO DE MANGUERAS (CONECTORES)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Selecciona una manguera (${widget.station.availableConnectors}/${widget.station.totalConnectors} disp.)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: palette.textSecondary,
                    ),
                  ),
                  Text(
                    '${widget.station.priceKwh} ₲ / kWh',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: SiparColors.green,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            Row(
              children: widget.station.connectors.map((con) {
                final isSelectedCon =
                    widget.activeConnectorId == con.connectorId;
                final realStatus = widget.station.isOffline
                    ? 'fuera_de_linea'
                    : con.status;
                final conKw = con.connectorId == 1
                    ? widget.station.powerKw
                    : (widget.station.powerKw >= 120
                          ? 60.0
                          : widget.station.powerKw);

                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                      right:
                          con.connectorId == 1 &&
                              widget.station.connectors.length > 1
                          ? 8
                          : 0,
                    ),
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        widget.onSelectConnector(con.connectorId);
                      },
                      child: _CompactConnectorTile(
                        palette: palette,
                        connectorId: con.connectorId,
                        type: con.type,
                        powerLabel: '${conKw.toStringAsFixed(0)} kW',
                        speedLabel:
                            '~${widget.station.estimateKmPerMin(connectorKw: conKw)} km/min',
                        status: realStatus,
                        isSelected: isSelectedCon,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 14),

            // 3. ZONA DEL PULGAR: SALDO WALLET + ESTIMACIÓN + BOTÓN DE CARGA OCPP
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: palette.cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: palette.border),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            LucideIcons.wallet,
                            size: 15,
                            color: currentBalance <= 0
                                ? SiparColors.red
                                : SiparColors.green,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Saldo en Wallet:',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: palette.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        widget.walletBalance == null
                            ? 'Consultando...'
                            : _formatPyg(currentBalance),
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: currentBalance <= 0
                              ? SiparColors.red
                              : palette.textPrimary,
                        ),
                      ),
                    ],
                  ),

                  // TEXTO DE ESTIMACIÓN MÁXIMA DE CARGA SEGÚN SALDO
                  if (widget.walletBalance != null && !isConnectorCharging)
                    Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 2),
                      child: Row(
                        children: [
                          Icon(
                            LucideIcons.clock,
                            size: 12,
                            color: palette.textSecondary.withValues(alpha: 0.8),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            currentBalance <= 0
                                ? 'Sin saldo para iniciar carga'
                                : 'Con tu saldo actual puedes cargar aprox. ',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: palette.textSecondary,
                            ),
                          ),
                          if (currentBalance > 0)
                            Text(
                              widget.station.calculateEstimatedTime(
                                currentBalance,
                              ),
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.bold,
                                color: palette.textPrimary,
                              ),
                            ),
                        ],
                      ),
                    ),

                  // --- NUEVO: DESLIZADOR (SLIDER) DEL TEMPORIZADOR ---
                  if (!isConnectorCharging) ...[
                    const SizedBox(height: 12),
                    Divider(color: palette.border),
                    const SizedBox(height: 12),

                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Detener automáticamente en:',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: palette.textSecondary,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: _selectedMinutes > 0
                                ? SiparColors.orange.withValues(alpha: 0.15)
                                : palette.subtleBg,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _formatDurationLabel(_selectedMinutes),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: _selectedMinutes > 0
                                  ? SiparColors.orange
                                  : palette.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 4),

                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        activeTrackColor: SiparColors.orange,
                        inactiveTrackColor: palette.border,
                        thumbColor: SiparColors.orange,
                        overlayColor: SiparColors.orange.withValues(alpha: 0.2),
                        trackHeight: 4,
                      ),
                      child: Slider(
                        value: _selectedMinutes,
                        min: 0,
                        max: 240, // Máximo 4 horas (240 min)
                        divisions:
                            16, // Incrementos de 15 minutos (0, 15, 30, 45, 60...)
                        onChanged: (val) {
                          HapticFeedback.selectionClick();
                          setState(() => _selectedMinutes = val);
                        },
                      ),
                    ),

                    // Alerta si el tiempo escogido supera el saldo disponible
                    if (_selectedMinutes > 0 && estimatedCost > currentBalance)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            const Icon(
                              LucideIcons.triangleAlert,
                              size: 12,
                              color: SiparColors.red,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                'Costo estimado (${_formatPyg(estimatedCost)}) supera tu saldo actual.',
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: SiparColors.red,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],

                  const SizedBox(height: 8),

                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed:
                          (widget.station.isOffline ||
                              widget.sendingCommand.isNotEmpty ||
                              widget.station.hasFault ||
                              hasInsufficientBalance)
                          ? null
                          : () {
                              HapticFeedback.mediumImpact();

                              if (isConnectorCharging) {
                                widget.onSendCommand('StopCharge');
                              } else {
                                widget.onSendCommand(
                                  'StartCharge',
                                  durationMinutes: _selectedMinutes.toInt(),
                                );
                              }
                            },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isConnectorCharging
                            ? SiparColors.red
                            : SiparColors.green,
                        disabledBackgroundColor: palette.subtleBg,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      icon: Icon(
                        isConnectorCharging
                            ? LucideIcons.square
                            : LucideIcons.zap,
                        size: 16,
                      ),
                      label: Text(
                        widget.sendingCommand.isNotEmpty
                            ? widget.sendingCommand
                            : widget.station.hasFault
                            ? 'Estación en Mantenimiento'
                            : widget.station.isOffline
                            ? 'Estación Fuera de Línea'
                            : isConnectorCharging
                            ? 'Detener Carga (Manguera #${widget.activeConnectorId})'
                            : 'Iniciar Carga en Manguera #${widget.activeConnectorId}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13.5,
                        ),
                      ),
                    ),
                  ),

                  // AVISO LEGAL DE INACTIVIDAD
                  if (!isConnectorCharging)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            LucideIcons.info,
                            size: 12,
                            color: palette.textSecondary,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              _selectedMinutes > 0
                                  ? 'La carga se cortará automáticamente. Si no desconectas el vehículo a tiempo, aplicará la tarifa por inactividad, lo que podría generar un saldo negativo.'
                                  : 'Asegúrate de detener la carga y desconectar el vehículo al terminar. De lo contrario, aplicará la tarifa por inactividad pudiendo generar saldo negativo.',
                              style: TextStyle(
                                fontSize: 9.5,
                                color: palette.textSecondary,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompactConnectorTile extends StatelessWidget {
  final MapUiPalette palette;
  final int connectorId;
  final String type;
  final String powerLabel;
  final String speedLabel;
  final String status;
  final bool isSelected;

  const _CompactConnectorTile({
    required this.palette,
    required this.connectorId,
    required this.type,
    required this.powerLabel,
    required this.speedLabel,
    required this.status,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context) {
    final isAvailable = status == 'disponible';
    final isCharging = status == 'en_uso' || status == 'conectado';

    final Color statusDotColor = isAvailable
        ? SiparColors.green
        : isCharging
        ? SiparColors.blue
        : SiparColors.red;

    final String statusText = isAvailable
        ? 'Libre'
        : status == 'conectado'
        ? 'Conectado'
        : status == 'en_uso'
        ? 'En Uso'
        : 'Offline';

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
      decoration: BoxDecoration(
        color: isSelected
            ? SiparColors.green.withValues(alpha: palette.isDark ? 0.16 : 0.08)
            : palette.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isSelected ? SiparColors.green : palette.border,
          width: isSelected ? 1.8 : 1.0,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    LucideIcons.plugZap,
                    size: 16,
                    color: isSelected
                        ? SiparColors.green
                        : palette.textSecondary,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    '#$connectorId $type',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: palette.textPrimary,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: statusDotColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                    color: statusDotColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                powerLabel,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: palette.textPrimary,
                ),
              ),
              Text(
                speedLabel,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: palette.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
