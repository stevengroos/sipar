import 'package:flutter/material.dart';
import '../../../core/theme.dart';

class MapUiPalette {
  final bool isDark;

  const MapUiPalette({required this.isDark});

  factory MapUiPalette.of(BuildContext context) {
    final brightness = MediaQuery.platformBrightnessOf(context);
    return MapUiPalette(isDark: brightness == Brightness.dark);
  }

  Color get sheetBg =>
      isDark ? const Color(0xFF0F141C) : const Color(0xFFF4FBF7);
  Color get cardBg => isDark ? const Color(0xFF18202F) : Colors.white;
  Color get subtleBg =>
      isDark ? const Color(0xFF222C3F) : const Color(0xFFECFDF5);
  Color get border =>
      isDark ? const Color(0xFF2B364B) : const Color(0xFFD1FAE5);
  Color get textPrimary => isDark ? const Color(0xFFF8FAFC) : SiparColors.dark;
  Color get textSecondary =>
      isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
  Color get shadowColor => Colors.black.withValues(alpha: isDark ? 0.45 : 0.08);

  String get mapStyle => isDark ? _darkMapStyle : _lightEcoMapStyle;

  static const String _darkMapStyle = '''
  [
    { "elementType": "geometry", "stylers": [{ "color": "#131822" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#131822" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#7b8a9e" }] },
    { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#222b3a" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#161d28" }] },
    { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#8292a8" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#2d384c" }] },
    { "featureType": "transit", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0a0e14" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#475569" }] }
  ]
  ''';

  // Estilo Claro Ecológico: limpia POIs comerciales y realza tonos verdes y agua limpia
  static const String _lightEcoMapStyle = '''
  [
    { "featureType": "poi", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
    { "featureType": "transit", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
    { "featureType": "poi.park", "elementType": "geometry.fill", "stylers": [{ "color": "#d8f3dc" }] },
    { "featureType": "landscape.natural", "elementType": "geometry.fill", "stylers": [{ "color": "#f0fdf4" }] },
    { "featureType": "water", "elementType": "geometry.fill", "stylers": [{ "color": "#bae6fd" }] }
  ]
  ''';
}
