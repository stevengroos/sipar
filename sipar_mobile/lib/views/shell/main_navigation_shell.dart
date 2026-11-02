import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme.dart';
import '../home/inicio_map_view.dart';
import '../wallet/wallet_view.dart';
import '../store/tienda_view.dart';
import '../activity/actividad_view.dart';
import '../profile/perfil_view.dart';

class _NavItemData {
  final IconData icon;
  final String label;
  final bool showBadge;

  const _NavItemData({
    required this.icon,
    required this.label,
    this.showBadge = false,
  });
}

class MainNavigationShell extends StatefulWidget {
  final VoidCallback onLogout;
  const MainNavigationShell({super.key, required this.onLogout});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;

  static const List<_NavItemData> _navItems = [
    _NavItemData(icon: LucideIcons.mapPin, label: 'Mapa'),
    _NavItemData(icon: LucideIcons.wallet, label: 'Wallet'),
    _NavItemData(
      icon: LucideIcons.shoppingBag,
      label: 'Tienda',
      showBadge: true,
    ),
    _NavItemData(icon: LucideIcons.activity, label: 'Actividad'),
    _NavItemData(icon: LucideIcons.user, label: 'Perfil'),
  ];

  @override
  Widget build(BuildContext context) {
    // Inicializamos las vistas asegurando que pasamos el onLogout a PerfilView
    final List<Widget> pages = [
      const InicioMapView(),
      const WalletView(),
      const TiendaView(),
      const ActividadView(),
      PerfilView(onLogout: widget.onLogout),
    ];

    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;

    // Paleta adaptativa: Modo Claro Ecológico vs Modo Oscuro
    final Color scaffoldBg = isDark
        ? const Color(0xFF0B0F17)
        : const Color(0xFFF4FBF7);
    final Color navBarBg = isDark
        ? const Color(0xFF161E2E).withValues(alpha: 0.92)
        : Colors.white.withValues(alpha: 0.94);
    final Color navBorder = isDark
        ? const Color(0xFF2B364B)
        : const Color(0xFFD1FAE5);
    final Color inactiveColor = isDark
        ? const Color(0xFF94A3B8)
        : SiparColors.gray;
    final Color activePillBg = isDark
        ? SiparColors.green.withValues(alpha: 0.18)
        : const Color(0xFFECFDF5);
    final Color shadowColor = isDark
        ? Colors.black.withValues(alpha: 0.50)
        : SiparColors.green.withValues(alpha: 0.14);

    final overlayStyle = isDark
        ? SystemUiOverlayStyle.light
        : SystemUiOverlayStyle.dark;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: Scaffold(
        backgroundColor: scaffoldBg,
        extendBody: true,
        body: Stack(
          children: [
            // Mantiene el estado vivo de todas las pestañas
            IndexedStack(index: _currentIndex, children: pages),

            // Barra de navegación flotante adaptativa
            Positioned(
              left: 16,
              right: 16,
              bottom: MediaQuery.of(context).padding.bottom > 0
                  ? MediaQuery.of(context).padding.bottom
                  : 16,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(26),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    height: 68,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: navBarBg,
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(color: navBorder, width: 1.2),
                      boxShadow: [
                        BoxShadow(
                          color: shadowColor,
                          blurRadius: 24,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: List.generate(_navItems.length, (index) {
                        final item = _navItems[index];
                        final isSelected = _currentIndex == index;

                        return Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () {
                              if (_currentIndex != index) {
                                HapticFeedback.selectionClick();
                                setState(() => _currentIndex = index);
                              }
                            },
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              curve: Curves.easeOutCubic,
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? activePillBg
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(18),
                                border: isSelected
                                    ? Border.all(
                                        color: SiparColors.green.withValues(
                                          alpha: isDark ? 0.45 : 0.30,
                                        ),
                                        width: 1,
                                      )
                                    : null,
                              ),
                              child: Stack(
                                alignment: Alignment.center,
                                clipBehavior: Clip.none,
                                children: [
                                  Column(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        item.icon,
                                        size: isSelected ? 21 : 19,
                                        color: isSelected
                                            ? SiparColors.green
                                            : inactiveColor,
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        item.label,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 10.5,
                                          fontWeight: isSelected
                                              ? FontWeight.w800
                                              : FontWeight.w600,
                                          color: isSelected
                                              ? SiparColors.green
                                              : inactiveColor,
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (item.showBadge)
                                    Positioned(
                                      top: -2,
                                      right: 12,
                                      child: Container(
                                        width: 8,
                                        height: 8,
                                        decoration: BoxDecoration(
                                          color: SiparColors.blue,
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: navBarBg,
                                            width: 1.5,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
