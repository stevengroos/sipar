import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

class ChargerMarkerGenerator {
  final Map<String, BitmapDescriptor> _cache = {};

  Future<BitmapDescriptor> getMarker({
    required String label,
    required Color statusColor,
    required bool isSelected,
    required bool isDark,
  }) async {
    final key = '${label}_${statusColor.hashCode}_${isSelected}_$isDark';
    if (_cache.containsKey(key)) {
      return _cache[key]!;
    }

    const double scale = 3.0;
    final double logicalW = isSelected ? 68.0 : 60.0;
    final double logicalH = isSelected ? 34.0 : 30.0;
    const double pointerH = 5.0;

    final double width = logicalW * scale;
    final double height = (logicalH + pointerH) * scale;
    final double pillH = logicalH * scale;
    final double radius = (logicalH / 2) * scale;

    final ui.PictureRecorder recorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(recorder);

    // Sombra suave con tinte verde en modo claro
    final Paint shadowPaint = Paint()
      ..color = isDark
          ? Colors.black.withValues(alpha: 0.45)
          : statusColor.withValues(alpha: 0.32)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5.0);
    canvas.drawRRect(
      RRect.fromLTRBR(2, 4, width - 2, pillH + 2, Radius.circular(radius)),
      shadowPaint,
    );

    // En Modo Claro el cuerpo de la píldora es del color ecológico (Verde SIPAR)
    // En Modo Oscuro el cuerpo es oscuro con borde neón
    final Color bgColor = isDark
        ? (isSelected ? statusColor : const Color(0xFF18202F))
        : (isSelected ? const Color(0xFF065F46) : statusColor);

    final Paint bgPaint = Paint()..color = bgColor;
    final RRect pillRect = RRect.fromLTRBR(
      2,
      2,
      width - 2,
      pillH - 2,
      Radius.circular(radius),
    );
    canvas.drawRRect(pillRect, bgPaint);

    // Borde blanco limpio en modo claro para resaltar el verde ecológico
    final Color borderColor = isDark
        ? (isSelected ? Colors.white : statusColor)
        : Colors.white;

    final Paint borderPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = (isSelected ? 2.4 : 1.8) * scale;
    canvas.drawRRect(pillRect, borderPaint);

    // Círculo interno izquierdo (Rayo)
    final double dotRadius = (isSelected ? 9.5 : 8.5) * scale;
    final Offset dotCenter = Offset(13.5 * scale, pillH / 2);
    final Paint dotPaint = Paint()
      ..color = isDark
          ? (isSelected ? Colors.white : statusColor)
          : Colors.white;
    canvas.drawCircle(dotCenter, dotRadius, dotPaint);

    final TextPainter boltPainter = TextPainter(
      text: TextSpan(
        text: '⚡',
        style: TextStyle(
          fontSize: (isSelected ? 10.5 : 9.5) * scale,
          color: isDark ? (isSelected ? statusColor : Colors.white) : bgColor,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    boltPainter.layout();
    boltPainter.paint(
      canvas,
      Offset(
        dotCenter.dx - boltPainter.width / 2,
        dotCenter.dy - boltPainter.height / 2,
      ),
    );

    // Texto de conectores (ej. 2/2) en blanco puro sobre el verde en Modo Claro
    final TextPainter textPainter = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          fontSize: (isSelected ? 11.5 : 10.5) * scale,
          fontWeight: FontWeight.w900,
          color: Colors.white,
          letterSpacing: -0.3,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(
        25.5 * scale + ((width - 28 * scale) - textPainter.width) / 2,
        (pillH - textPainter.height) / 2,
      ),
    );

    // Puntero inferior
    final Paint pointerPaint = Paint()..color = bgColor;
    final Path triangle = Path()
      ..moveTo(width / 2 - (4.5 * scale), pillH - 2)
      ..lineTo(width / 2 + (4.5 * scale), pillH - 2)
      ..lineTo(width / 2, height - 1)
      ..close();
    canvas.drawPath(triangle, pointerPaint);

    final ui.Image image = await recorder.endRecording().toImage(
      width.toInt(),
      height.toInt(),
    );
    final ByteData? byteData = await image.toByteData(
      format: ui.ImageByteFormat.png,
    );

    final BitmapDescriptor bitmap = BitmapDescriptor.bytes(
      byteData!.buffer.asUint8List(),
      imagePixelRatio: scale,
    );

    _cache[key] = bitmap;
    return bitmap;
  }
}
