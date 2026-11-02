import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme.dart';
import '../../../models/charger_station.dart';
import 'map_ui_palette.dart';

class StationBottomSheet extends StatelessWidget {
  final ChargerStationModel station;
  final int activeConnectorId;
  final String sendingCommand;
  final double? walletBalance;
  final LatLng referenceCenter;
  final Color statusColor;
  final ValueChanged<int> onSelectConnector;
  final VoidCallback onClose;
  final VoidCallback onOpenMaps;
  final ValueChanged<String> onSendCommand;

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

  @override
  Widget build(BuildContext context) {
    final palette = MapUiPalette.of(context);

    final activeConnectorObj =
        station.connectors
            .where((c) => c.connectorId == activeConnectorId)
            .firstOrNull ??
        (station.connectors.isNotEmpty ? station.connectors.first : null);

    final displayConnectorStatus = station.isOffline
        ? 'fuera_de_linea'
        : (activeConnectorObj?.status ?? station.status);

    final activeErrorCode =
        (activeConnectorObj != null &&
            activeConnectorObj.errorCode.isNotEmpty &&
            activeConnectorObj.errorCode != 'NoError')
        ? activeConnectorObj.errorCode
        : station.lastErrorCode;

    final isConnectorCharging = displayConnectorStatus == 'en_uso';
    final hasInsufficientBalance =
        !isConnectorCharging && walletBalance != null && walletBalance! <= 0;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.68,
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
                  onTap: onClose,
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
                  onTap: onClose,
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
                      color: statusColor.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(LucideIcons.zap, color: statusColor, size: 20),
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
                                color: statusColor.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _statusLabel(
                                  station.status,
                                  station.hasFault,
                                  station.isOffline,
                                ),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: statusColor,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              station.serialNumber,
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
                          station.address,
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
                      onOpenMaps();
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
                            station.distanceLabelFrom(referenceCenter),
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
                    'Selecciona una manguera (${station.availableConnectors}/${station.totalConnectors} disp.)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: palette.textSecondary,
                    ),
                  ),
                  Text(
                    '${station.priceKwh} ₲ / kWh',
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
              children: station.connectors.map((con) {
                final isSelectedCon = activeConnectorId == con.connectorId;
                final realStatus = station.isOffline
                    ? 'fuera_de_linea'
                    : con.status;
                final conKw = con.connectorId == 1
                    ? station.powerKw
                    : (station.powerKw >= 120 ? 60.0 : station.powerKw);

                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                      right:
                          con.connectorId == 1 && station.connectors.length > 1
                          ? 8
                          : 0,
                    ),
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        onSelectConnector(con.connectorId);
                      },
                      child: _CompactConnectorTile(
                        palette: palette,
                        connectorId: con.connectorId,
                        type: con.type,
                        powerLabel: '${conKw.toStringAsFixed(0)} kW',
                        speedLabel:
                            '~${station.estimateKmPerMin(connectorKw: conKw)} km/min',
                        status: realStatus,
                        isSelected: isSelectedCon,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 14),

            // 3. ZONA DEL PULGAR: SALDO WALLET + BOTÓN DE CARGA OCPP
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
                            color: hasInsufficientBalance
                                ? SiparColors.red
                                : SiparColors.green,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Saldo disponible en Wallet:',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: palette.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        walletBalance == null
                            ? 'Consultando...'
                            : _formatPyg(walletBalance!),
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: hasInsufficientBalance
                              ? SiparColors.red
                              : palette.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed:
                          (station.isOffline ||
                              sendingCommand.isNotEmpty ||
                              station.hasFault)
                          ? null
                          : () {
                              HapticFeedback.mediumImpact();
                              onSendCommand(
                                isConnectorCharging
                                    ? 'StopCharge'
                                    : 'StartCharge',
                              );
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
                        sendingCommand.isNotEmpty
                            ? sendingCommand
                            : station.hasFault
                            ? 'Estación en Mantenimiento'
                            : station.isOffline
                            ? 'Estación Fuera de Línea'
                            : isConnectorCharging
                            ? 'Detener Carga (Manguera #$activeConnectorId)'
                            : 'Iniciar Carga en Manguera #$activeConnectorId',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13.5,
                        ),
                      ),
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
