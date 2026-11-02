import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/secure_storage_service.dart';
import '../../core/theme.dart';
import '../../models/charger_station.dart';
import 'widgets/charger_marker_generator.dart';
import 'widgets/map_ui_palette.dart';
import 'widgets/station_bottom_sheet.dart';

class InicioMapView extends StatefulWidget {
  const InicioMapView({super.key});

  @override
  State<InicioMapView> createState() => _InicioMapViewState();
}

class _InicioMapViewState extends State<InicioMapView> {
  final Completer<GoogleMapController> _mapController = Completer();
  final TextEditingController _searchCtrl = TextEditingController();
  final ChargerMarkerGenerator _markerGenerator = ChargerMarkerGenerator();

  static const LatLng _defaultCenter = LatLng(-25.270, -57.520);

  LatLng? _userLocation;
  bool _locationPermissionGranted = false;

  List<ChargerStationModel> _stations = [];
  List<ChargerStationModel> _filteredStations = [];
  Set<Marker> _mapMarkers = {};

  ChargerStationModel? _selectedStation;
  int _activeConnectorId = 1;
  String _mapFilter = 'all';
  bool _showFilters = false;
  String _sendingCommand = '';
  double? _walletBalance;
  Map<String, dynamic>? _currentUser;
  Timer? _pollingTimer;

  LatLng get _activeReferenceCenter => _userLocation ?? _defaultCenter;

  @override
  void initState() {
    super.initState();
    _loadCurrentUser();
    _initUserLocation();
    _refreshWalletBalance();
    _fetchLiveChargers(initialLoad: true);
    _pollingTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _fetchLiveChargers(),
    );
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentUser() async {
    final user = await SecureStorageService.getUser();
    if (mounted) {
      setState(() => _currentUser = user);
    }
  }

  // Solicita permiso de GPS en iOS y obtiene la ubicación exacta del usuario
  Future<void> _initUserLocation({bool centerCamera = false}) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }

      if (mounted) {
        setState(() => _locationPermissionGranted = true);
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      final currentLatLng = LatLng(pos.latitude, pos.longitude);
      if (mounted) {
        setState(() => _userLocation = currentLatLng);
      }

      if (centerCamera) {
        await _animateTo(currentLatLng, 15.0);
      }
    } catch (_) {
      // Si falla la lectura inicial, mantiene el centro por defecto
    }
  }

  Future<double> _refreshWalletBalance() async {
    try {
      final res = await ApiClient.dio.get('/api/v1/wallet/balance');
      final bal = (res.data['balance_pyg'] as num?)?.toDouble() ?? 0.0;
      if (mounted) {
        setState(() => _walletBalance = bal);
      }
      return bal;
    } catch (_) {
      if (mounted) {
        setState(() => _walletBalance = 0.0);
      }
      return 0.0;
    }
  }

  Future<void> _fetchLiveChargers({bool initialLoad = false}) async {
    try {
      final res = await ApiClient.dio.get('/api/v1/dashboards/map-chargers');
      final rawList = res.data as List<dynamic>;

      final parsed = <ChargerStationModel>[];
      for (var i = 0; i < rawList.length; i++) {
        if (rawList[i] is Map) {
          parsed.add(
            ChargerStationModel.fromJson(
              Map<String, dynamic>.from(rawList[i]),
              fallbackIndex: i,
            ),
          );
        }
      }

      if (!mounted) return;
      await _rebuildMarkersAndState(parsed, initialLoad: initialLoad);
    } catch (_) {}
  }

  Future<void> _rebuildMarkersAndState(
    List<ChargerStationModel> sourceStations, {
    bool initialLoad = false,
  }) async {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final query = _searchCtrl.text.trim().toLowerCase();

    final filtered = sourceStations.where((ch) {
      if (_mapFilter == 'disponible' &&
          (ch.status != 'disponible' || ch.hasFault)) {
        return false;
      }
      if (_mapFilter == 'active' &&
          ch.status != 'en_uso' &&
          ch.status != 'conectado') {
        return false;
      }
      if (_mapFilter == 'falla' && !ch.hasFault) {
        return false;
      }
      if (_mapFilter == 'offline' && !ch.isOffline) {
        return false;
      }
      if (query.isNotEmpty) {
        return ch.serialNumber.toLowerCase().contains(query) ||
            ch.address.toLowerCase().contains(query);
      }
      return true;
    }).toList();

    final Set<Marker> newMarkers = {};
    for (final ch in filtered) {
      final isSelected = _selectedStation?.serialNumber == ch.serialNumber;
      final icon = await _markerGenerator.getMarker(
        label: '${ch.availableConnectors}/${ch.totalConnectors}',
        statusColor: _statusColor(ch),
        isSelected: isSelected,
        isDark: isDark,
      );

      newMarkers.add(
        Marker(
          markerId: MarkerId(ch.serialNumber),
          position: ch.position,
          icon: icon,
          zIndex: isSelected ? 10.0 : 1.0,
          onTap: () => _selectStation(ch),
        ),
      );
    }

    if (!mounted) return;
    setState(() {
      _stations = sourceStations;
      _filteredStations = filtered;
      _mapMarkers = newMarkers;

      if (_selectedStation != null) {
        final updated = sourceStations
            .where((c) => c.serialNumber == _selectedStation!.serialNumber)
            .firstOrNull;
        if (updated != null) {
          _selectedStation = updated;
        }
      }
    });

    if (initialLoad) {
      if (_userLocation != null) {
        _animateTo(_userLocation!, 14.2);
      } else if (sourceStations.isNotEmpty) {
        _animateTo(sourceStations.first.position, 13.5);
      }
    }
  }

  Future<void> _animateTo(LatLng pos, double zoom) async {
    final controller = await _mapController.future;
    controller.animateCamera(CameraUpdate.newLatLngZoom(pos, zoom));
  }

  void _selectStation(ChargerStationModel station) {
    HapticFeedback.selectionClick();
    setState(() {
      _selectedStation = station;
      _activeConnectorId = station.connectors.isNotEmpty
          ? station.connectors.first.connectorId
          : 1;
    });
    _refreshWalletBalance();
    _rebuildMarkersAndState(_stations);
    _animateTo(
      LatLng(station.position.latitude - 0.0035, station.position.longitude),
      15.2,
    );
  }

  Future<void> _openGoogleMaps(double lat, double lng) async {
    final url = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _sendOcppCommand(String commandType) async {
    final station = _selectedStation;
    if (station == null || _sendingCommand.isNotEmpty) return;

    if (commandType == 'StartCharge') {
      setState(() => _sendingCommand = 'Verificando saldo...');
      final balance = await _refreshWalletBalance();

      if (balance <= 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: SiparColors.red,
              behavior: SnackBarBehavior.floating,
              content: Text(
                'Saldo insuficiente en tu Wallet. Recarga saldo para iniciar la carga.',
              ),
            ),
          );
          setState(() => _sendingCommand = '');
        }
        return;
      }
    }

    setState(() => _sendingCommand = 'Conectando con cargador...');

    try {
      final serial = station.serialNumber;
      final userId = _currentUser?['id'] ?? 'DRIVER';
      final idTag = 'APP-SIPAR-$userId';
      String endpoint = '';

      if (commandType == 'StartCharge') {
        endpoint =
            '/api/v1/ocpp/$serial/start?tag=$idTag&connector_id=$_activeConnectorId';
      } else if (commandType == 'StopCharge') {
        endpoint =
            '/api/v1/ocpp/$serial/stop?transaction_id=1&connector_id=$_activeConnectorId';
      }

      final res = await ApiClient.dio.post(endpoint);
      final hwMsg =
          res.data['respuesta_hardware'] ??
          res.data['mensaje'] ??
          'Comando aceptado';

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: SiparColors.green,
            behavior: SnackBarBehavior.floating,
            content: Text('Estación $serial: "$hwMsg"'),
          ),
        );
      }
      await Future.delayed(const Duration(milliseconds: 600));
      await _fetchLiveChargers();
      await _refreshWalletBalance();
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: SiparColors.red,
            behavior: SnackBarBehavior.floating,
            content: Text(
              e.response?.data?['detail']?.toString() ??
                  'Error de comunicación OCPP. Intente de nuevo.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _sendingCommand = '');
      }
    }
  }

  Color _statusColor(ChargerStationModel st) {
    if (st.isOffline) return SiparColors.red;
    if (st.hasFault) return const Color(0xFFF97316);
    switch (st.status) {
      case 'disponible':
        return SiparColors.green;
      case 'conectado':
        return const Color(0xFFEAB308);
      case 'en_uso':
        return SiparColors.blue;
      default:
        return SiparColors.red;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = MapUiPalette.of(context);
    final selected = _selectedStation;

    return Stack(
      children: [
        // 1. MAPA NATIVO ADAPTATIVO CON UBICACIÓN EN VIVO
        GoogleMap(
          initialCameraPosition: const CameraPosition(
            target: _defaultCenter,
            zoom: 13.0,
          ),
          style: palette.mapStyle,
          onMapCreated: (controller) {
            if (!_mapController.isCompleted) {
              _mapController.complete(controller);
            }
          },
          onTap: (_) {
            if (_selectedStation != null) {
              setState(() => _selectedStation = null);
              _rebuildMarkersAndState(_stations);
            }
          },
          myLocationEnabled: _locationPermissionGranted,
          myLocationButtonEnabled: false,
          compassEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          markers: _mapMarkers,
        ),

        // 2. CABECERA SUPERIOR: BUSCADOR + FILTROS ADAPTATIVOS
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 16,
          right: 16,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 48,
                      padding: const EdgeInsets.symmetric(horizontal: 15),
                      decoration: BoxDecoration(
                        color: palette.cardBg,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: palette.border),
                        boxShadow: [
                          BoxShadow(
                            color: palette.shadowColor,
                            blurRadius: 18,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Icon(
                            LucideIcons.search,
                            color: SiparColors.green,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextField(
                              controller: _searchCtrl,
                              onChanged: (_) =>
                                  _rebuildMarkersAndState(_stations),
                              style: TextStyle(
                                color: palette.textPrimary,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                              decoration: InputDecoration(
                                hintText:
                                    'Buscar estación (${_filteredStations.length} disp.)',
                                hintStyle: TextStyle(
                                  color: palette.textSecondary,
                                  fontSize: 13.5,
                                ),
                                border: InputBorder.none,
                                isDense: true,
                              ),
                            ),
                          ),
                          if (_searchCtrl.text.isNotEmpty)
                            GestureDetector(
                              onTap: () {
                                _searchCtrl.clear();
                                _rebuildMarkersAndState(_stations);
                              },
                              child: Icon(
                                LucideIcons.x,
                                size: 16,
                                color: palette.textSecondary,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  _buildCircleAction(
                    palette: palette,
                    icon: LucideIcons.slidersHorizontal,
                    size: 48,
                    isActive: _showFilters || _mapFilter != 'all',
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _showFilters = !_showFilters);
                    },
                  ),
                ],
              ),
              if (_showFilters) ...[
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip(palette, 'all', 'Todas', null),
                      _buildFilterChip(
                        palette,
                        'disponible',
                        'Disponibles',
                        SiparColors.green,
                      ),
                      _buildFilterChip(
                        palette,
                        'active',
                        'En Carga',
                        SiparColors.blue,
                      ),
                      _buildFilterChip(
                        palette,
                        'falla',
                        'Mantenimiento',
                        const Color(0xFFF97316),
                      ),
                      _buildFilterChip(
                        palette,
                        'offline',
                        'Offline',
                        SiparColors.red,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),

        // 3. CONTROLES LATERALES DE MAPA (REFRESCAR Y IR A MI UBICACIÓN REAL)
        Positioned(
          top: MediaQuery.of(context).padding.top + (_showFilters ? 108 : 66),
          right: 16,
          child: Column(
            children: [
              _buildCircleAction(
                palette: palette,
                icon: LucideIcons.refreshCw,
                onTap: () {
                  HapticFeedback.lightImpact();
                  _fetchLiveChargers();
                  _refreshWalletBalance();
                },
              ),
              const SizedBox(height: 10),
              _buildCircleAction(
                palette: palette,
                icon: LucideIcons.locateFixed,
                isActive: _userLocation != null,
                onTap: () async {
                  HapticFeedback.lightImpact();
                  setState(() => _selectedStation = null);
                  await _initUserLocation(centerCamera: true);
                  if (_userLocation == null && _stations.isNotEmpty) {
                    _animateTo(_stations.first.position, 13.5);
                  }
                },
              ),
            ],
          ),
        ),

        // 4. CARRUSEL RÁPIDO DE ESTACIONES (CUANDO NO HAY SELECCIÓN)
        if (selected == null && _filteredStations.isNotEmpty)
          Positioned(
            left: 0,
            right: 0,
            bottom: 104,
            child: SizedBox(
              height: 92,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _filteredStations.length,
                itemBuilder: (ctx, idx) {
                  final st = _filteredStations[idx];
                  final stColor = _statusColor(st);
                  return GestureDetector(
                    onTap: () => _selectStation(st),
                    child: Container(
                      width: 245,
                      margin: const EdgeInsets.only(right: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: palette.cardBg,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: palette.border),
                        boxShadow: [
                          BoxShadow(
                            color: palette.shadowColor,
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: palette.isDark
                                  ? stColor.withValues(alpha: 0.16)
                                  : stColor,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  LucideIcons.zap,
                                  size: 14,
                                  color: palette.isDark
                                      ? stColor
                                      : Colors.white,
                                ),
                                Text(
                                  '${st.availableConnectors}/${st.totalConnectors}',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    color: palette.isDark
                                        ? stColor
                                        : Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  st.address,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: palette.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  '${st.powerKw.toStringAsFixed(0)} kW • ${st.priceKwh} ₲/kWh',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: palette.textSecondary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  st.distanceLabelFrom(_activeReferenceCenter),
                                  style: const TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w800,
                                    color: SiparColors.green,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            LucideIcons.chevronRight,
                            size: 16,
                            color: palette.textSecondary,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),

        // 5. PANEL INFERIOR DE ESTACIÓN SELECCIONADA
        if (selected != null)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: StationBottomSheet(
              station: selected,
              activeConnectorId: _activeConnectorId,
              sendingCommand: _sendingCommand,
              walletBalance: _walletBalance,
              referenceCenter: _activeReferenceCenter,
              statusColor: _statusColor(selected),
              onSelectConnector: (id) {
                setState(() => _activeConnectorId = id);
              },
              onClose: () {
                setState(() => _selectedStation = null);
                _rebuildMarkersAndState(_stations);
              },
              onOpenMaps: () => _openGoogleMaps(
                selected.position.latitude,
                selected.position.longitude,
              ),
              onSendCommand: _sendOcppCommand,
            ),
          ),
      ],
    );
  }

  Widget _buildFilterChip(
    MapUiPalette palette,
    String id,
    String label,
    Color? dotColor,
  ) {
    final active = _mapFilter == id;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() => _mapFilter = id);
          _rebuildMarkersAndState(_stations);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: active ? SiparColors.green : palette.cardBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? SiparColors.green : palette.border,
            ),
            boxShadow: [BoxShadow(color: palette.shadowColor, blurRadius: 8)],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (dotColor != null) ...[
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: active ? Colors.white : dotColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: active ? Colors.white : palette.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCircleAction({
    required MapUiPalette palette,
    required IconData icon,
    required VoidCallback onTap,
    double size = 44,
    bool isActive = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: isActive ? SiparColors.green : palette.cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isActive ? SiparColors.green : palette.border,
          ),
          boxShadow: [
            BoxShadow(
              color: palette.shadowColor,
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Icon(
          icon,
          color: isActive ? Colors.white : palette.textPrimary,
          size: 19,
        ),
      ),
    );
  }
}
