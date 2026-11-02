import 'package:flutter/material.dart';

class SiparColors {
  // Paleta oficial del prototipo Clean Energy UI
  static const Color dark = Color(0xFF1E232D); // sipar.dark
  static const Color green = Color(
    0xFF10B981,
  ); // sipar.green (Verde Energía Limpia)
  static const Color blue = Color(0xFF3B82F6); // sipar.blue
  static const Color light = Color(0xFFF8F9FA); // sipar.light (Fondo general)
  static const Color gray = Color(0xFF8E8E93); // sipar.gray
  static const Color lightGray = Color(0xFFF0F0F0); // sipar.lightgray
  static const Color red = Color(0xFFEF4444);

  // Alias de compatibilidad con vistas de seguridad
  static const Color orange = green;
  static const Color darkBg = Color(0xFF141820);
  static const Color darkCard = dark;
  static const Color darkBorder = Color(0xFF2D3545);
}

class SiparTheme {
  static ThemeData get cleanEnergyTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: SiparColors.light,
      primaryColor: SiparColors.green,
      colorScheme: const ColorScheme.light(
        primary: SiparColors.green,
        secondary: SiparColors.blue,
        surface: Colors.white,
        onSurface: SiparColors.dark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: SiparColors.dark,
        elevation: 0,
      ),
    );
  }

  static ThemeData get darkTheme => cleanEnergyTheme;
}
