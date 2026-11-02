import 'dart:convert';
import 'dart:math' show cos, sqrt, asin;
import 'package:google_maps_flutter/google_maps_flutter.dart';

class OcppDiagnostics {
  static const Map<String, String> errorLabels = {
    'NoError': 'Sin fallos reportados (Operación Normal)',
    'ConnectorLockFailure': 'Fallo en bloqueo electromecánico del conector',
    'EVCommunicationError':
        'Fallo de comunicación CP con el vehículo eléctrico',
    'GroundFailure': 'Fallo de puesta a tierra (PE) detectado',
    'HighTemperature': 'Alerta de alta temperatura interna',
    'InternalError': 'Error interno del hardware del cargador',
    'OverCurrentFailure': 'Protección por sobrecorriente activada',
    'OverVoltage': 'Sobretensión en la línea de alimentación',
    'PowerMeterFailure': 'Error en medidor de energía',
    'PowerSwitchFailure': 'Fallo en contactor / relé de potencia',
    'UnderVoltage': 'Baja tensión / Falla de tierra en red eléctrica',
    'WeakSignal': 'Señal de comunicación débil',
  };

  static String getReadableError(String? code) {
    if (code == null || code.isEmpty || code == 'NoError') {
      return 'Sin fallos reportados (NoError)';
    }
    if (errorLabels.containsKey(code)) return errorLabels[code]!;
    for (final entry in errorLabels.entries) {
      if (code.startsWith(entry.key)) {
        return '${entry.value} — $code';
      }
    }
    return code;
  }
}

class ChargerConnectorModel {
  final int id;
  final int connectorId;
  final String status;
  final String type;
  final String errorCode;

  const ChargerConnectorModel({
    required this.id,
    required this.connectorId,
    required this.status,
    required this.type,
    required this.errorCode,
  });

  factory ChargerConnectorModel.fromJson(Map<String, dynamic> json) {
    return ChargerConnectorModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      connectorId: (json['connector_id'] as num?)?.toInt() ?? 1,
      status: (json['status'] ?? 'disponible').toString().toLowerCase(),
      type:
          (json['type'] == null ||
              json['type'].toString().isEmpty ||
              json['type'] == 'Desconocido')
          ? 'CCS2'
          : json['type'].toString(),
      errorCode: (json['error_code'] ?? 'NoError').toString(),
    );
  }
}

class ChargerStationModel {
  final int id;
  final String serialNumber;
  final String status;
  final double powerKw;
  final int priceKwh;
  final String lastErrorCode;
  final String vendor;
  final String model;
  final DateTime? lastHeartbeat;
  final LatLng position;
  final String address;
  final List<ChargerConnectorModel> connectors;

  const ChargerStationModel({
    required this.id,
    required this.serialNumber,
    required this.status,
    required this.powerKw,
    required this.priceKwh,
    required this.lastErrorCode,
    required this.vendor,
    required this.model,
    required this.lastHeartbeat,
    required this.position,
    required this.address,
    required this.connectors,
  });

  bool get hasFault =>
      status == 'falla' ||
      (lastErrorCode.isNotEmpty && lastErrorCode != 'NoError') ||
      connectors.any((c) => c.errorCode.isNotEmpty && c.errorCode != 'NoError');

  bool get isOffline => status == 'fuera_de_linea';

  int get totalConnectors => connectors.isNotEmpty ? connectors.length : 2;

  int get availableConnectors {
    if (isOffline || hasFault) return 0;
    if (connectors.isNotEmpty) {
      return connectors.where((c) => c.status == 'disponible').length;
    }
    return status == 'disponible' ? 2 : (status == 'en_uso' ? 1 : 0);
  }

  int estimateKmPerMin({double? connectorKw}) {
    final kw = connectorKw ?? powerKw;
    return (kw * 0.1).round().clamp(1, 35);
  }

  /// Cálculo nativo de distancia en línea recta (Haversine) para no depender de latlong2
  String distanceLabelFrom(LatLng origin) {
    var p = 0.017453292519943295; // Math.PI / 180
    var c = cos;
    var a =
        0.5 -
        c((position.latitude - origin.latitude) * p) / 2 +
        c(origin.latitude * p) *
            c(position.latitude * p) *
            (1 - c((position.longitude - origin.longitude) * p)) /
            2;
    var km = 12742 * asin(sqrt(a)); // 2 * R; R = 6371 km
    return '${km.toStringAsFixed(1)} km';
  }

  static Map<String, dynamic>? _parseLocationRaw(dynamic rawLoc) {
    if (rawLoc == null) return null;
    dynamic parsed = rawLoc;
    int guard = 0;
    while (parsed is String && guard < 4) {
      try {
        parsed = jsonDecode(parsed);
      } catch (_) {
        break;
      }
      guard++;
    }
    if (parsed is Map) {
      return Map<String, dynamic>.from(parsed);
    }
    return null;
  }

  factory ChargerStationModel.fromJson(
    Map<String, dynamic> json, {
    int fallbackIndex = 0,
  }) {
    final locMap = _parseLocationRaw(json['location']);
    final lat =
        double.tryParse(locMap?['lat']?.toString() ?? '') ??
        (-25.2667 - (fallbackIndex * 0.008));
    final lng =
        double.tryParse(locMap?['lng']?.toString() ?? '') ??
        (-57.4833 - (fallbackIndex * 0.011));
    final serial = (json['serial_number'] ?? 'S001038').toString();
    final address =
        (locMap?['address'] ?? locMap?['name'] ?? 'Estación SIPAR $serial')
            .toString();

    final rawConnectors = json['connectors'] as List<dynamic>? ?? [];
    final parsedConnectors =
        rawConnectors
            .whereType<Map>()
            .map(
              (c) =>
                  ChargerConnectorModel.fromJson(Map<String, dynamic>.from(c)),
            )
            .toList()
          ..sort((a, b) => a.connectorId.compareTo(b.connectorId));

    final stationStatus = (json['status'] ?? 'disponible')
        .toString()
        .toLowerCase();
    final finalConnectors = parsedConnectors.isNotEmpty
        ? parsedConnectors
        : [
            ChargerConnectorModel(
              id: 1,
              connectorId: 1,
              status: stationStatus,
              type: 'CCS2',
              errorCode: (json['last_error_code'] ?? 'NoError').toString(),
            ),
            ChargerConnectorModel(
              id: 2,
              connectorId: 2,
              status: stationStatus == 'fuera_de_linea'
                  ? 'fuera_de_linea'
                  : 'disponible',
              type: 'CCS2',
              errorCode: 'NoError',
            ),
          ];

    return ChargerStationModel(
      id: (json['id'] as num?)?.toInt() ?? fallbackIndex,
      serialNumber: serial,
      status: stationStatus,
      powerKw: double.tryParse(json['power_kw']?.toString() ?? '120') ?? 120.0,
      priceKwh:
          (double.tryParse(json['price_kwh']?.toString() ?? '2500') ?? 2500)
              .round(),
      lastErrorCode: (json['last_error_code'] ?? 'NoError').toString(),
      vendor: (json['vendor'] ?? 'WGD').toString(),
      model: (json['model'] ?? '').toString(),
      lastHeartbeat: json['last_heartbeat'] != null
          ? DateTime.tryParse(json['last_heartbeat'].toString())
          : null,
      position: LatLng(lat, lng),
      address: address,
      connectors: finalConnectors,
    );
  }
}
