import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'tienda_view.dart'; // Para referenciar StoreProduct
import '../../core/theme.dart';

class ProductoDetalleView extends StatelessWidget {
  final StoreProduct producto;

  const ProductoDetalleView({super.key, required this.producto});

  String _formatPyg(int val) {
    final s = val.abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    final bgScaffold = isDark
        ? const Color(0xFF0B0F17)
        : const Color(0xFFF4FBF7);
    final bgSurface = isDark ? const Color(0xFF161E2E) : Colors.white;
    final textPrim = isDark ? Colors.white : SiparColors.dark;
    final textSec = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    final hasImage = producto.imageUrl != null && producto.imageUrl!.isNotEmpty;
    final inStock = producto.stock > 0;

    return Scaffold(
      backgroundColor: bgScaffold,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        leading: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Container(
            margin: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: bgSurface.withValues(alpha: 0.8),
              shape: BoxShape.circle,
            ),
            child: Icon(LucideIcons.arrowLeft, color: textPrim, size: 20),
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Cabecera de Imagen a sangría completa
            Container(
              width: double.infinity,
              height: MediaQuery.of(context).size.height * 0.45,
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF1A2234)
                    : const Color(0xFFE2E8F0),
              ),
              child: hasImage
                  ? Image.network(
                      producto.imageUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Icon(
                        LucideIcons.imageOff,
                        size: 64,
                        color: textSec.withValues(alpha: 0.5),
                      ),
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          LucideIcons.shoppingBag,
                          size: 64,
                          color: textSec.withValues(alpha: 0.5),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Sin imagen disponible',
                          style: TextStyle(
                            color: textSec,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
            ),

            // Cuerpo del detalle
            Container(
              transform: Matrix4.translationValues(0.0, -24.0, 0.0),
              padding: const EdgeInsets.fromLTRB(24, 32, 24, 100),
              decoration: BoxDecoration(
                color: bgScaffold,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(32),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: isDark
                              ? const Color(0xFF1E293B)
                              : Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: borderCol),
                        ),
                        child: Text(
                          producto.category,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: textSec,
                          ),
                        ),
                      ),
                      if (!inStock)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: SiparColors.red.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'Agotado',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: SiparColors.red,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  Text(
                    producto.name,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: textPrim,
                      height: 1.1,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 16),

                  Text(
                    _formatPyg(producto.price),
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: SiparColors.green,
                    ),
                  ),
                  const SizedBox(height: 32),

                  Text(
                    'Descripción del Producto',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: textPrim,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    producto.description.isNotEmpty
                        ? producto.description
                        : 'Este artículo de SIPAR no cuenta con una descripción detallada en este momento.',
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w400,
                      color: textSec,
                      height: 1.6,
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Ficha técnica rápida
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: bgSurface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderCol),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0F141C)
                                : const Color(0xFFF1F5F9),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            LucideIcons.shieldCheck,
                            color: SiparColors.green,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Garantía Oficial SIPAR',
                                style: TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.bold,
                                  color: textPrim,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Soporte técnico y calidad asegurada.',
                                style: TextStyle(fontSize: 12, color: textSec),
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
          ],
        ),
      ),

      // Bottom Bar Fijo de Acción
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(
          24,
          16,
          24,
          MediaQuery.of(context).padding.bottom > 0
              ? MediaQuery.of(context).padding.bottom + 8
              : 24,
        ),
        decoration: BoxDecoration(
          color: bgSurface,
          border: Border(top: BorderSide(color: borderCol)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.05),
              blurRadius: 20,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: ElevatedButton(
          onPressed: inStock
              ? () {
                  HapticFeedback.mediumImpact();
                  // Lógica para contactar/reservar en el futuro
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: SiparColors.green,
                      content: Text(
                        'Por el momento las compras se realizan en sucursal.',
                      ),
                    ),
                  );
                }
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: SiparColors.green,
            disabledBackgroundColor: isDark
                ? const Color(0xFF1E293B)
                : const Color(0xFFE2E8F0),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            elevation: 0,
          ),
          child: Text(
            inStock ? 'Consultar Disponibilidad' : 'Agotado Temporalmente',
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ),
    );
  }
}
