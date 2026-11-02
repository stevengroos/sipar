import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'producto_detalle_view.dart';

class StoreProduct {
  final int id;
  final String name;
  final String category;
  final String description;
  final int price;
  final int stock;
  final String? imageUrl;

  const StoreProduct({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    required this.price,
    required this.stock,
    this.imageUrl,
  });

  factory StoreProduct.fromJson(Map<String, dynamic> p) {
    final rawCat = p['category']?.toString().trim() ?? '';
    return StoreProduct(
      id: (num.tryParse(p['id']?.toString() ?? '0') ?? 0).toInt(),
      name: (p['name'] ?? 'Producto SIPAR').toString(),
      category: rawCat.isNotEmpty ? rawCat : 'Sin Categoría',
      description: (p['description'] ?? '').toString(),
      price: (num.tryParse(p['price']?.toString() ?? '0') ?? 0).toInt(),
      stock: (num.tryParse(p['stock']?.toString() ?? '0') ?? 0).toInt(),
      imageUrl: p['image_url']?.toString(),
    );
  }
}

class TiendaView extends StatefulWidget {
  const TiendaView({super.key});

  @override
  State<TiendaView> createState() => _TiendaViewState();
}

class _TiendaViewState extends State<TiendaView> {
  final ScrollController _scrollController = ScrollController();

  String _selectedCat = 'Todas';
  bool _isLoading = true;
  bool _isFetchingMore = false; // Listo para infinite scroll backend
  int _currentPage = 1;

  List<StoreProduct> _products = [];
  List<String> _categories = ['Todas'];

  @override
  void initState() {
    super.initState();
    _fetchCatalog(refresh: true);

    // Listener para Infinite Scroll
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
              _scrollController.position.maxScrollExtent - 200 &&
          !_isLoading &&
          !_isFetchingMore) {
        _fetchCatalog(refresh: false);
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _fetchCatalog({bool refresh = false}) async {
    if (refresh) {
      if (!mounted) return;
      setState(() {
        _isLoading = true;
        _currentPage = 1;
      });
    } else {
      if (!mounted) return;
      setState(() => _isFetchingMore = true);
      _currentPage++;
    }

    try {
      // En un caso real con paginación, agregarías ?page=$_currentPage
      final res = await ApiClient.dio.get('/api/v1/store/app-catalog');
      final list = res.data as List<dynamic>;

      final Set<String> dynamicCategories = {'Todas'};
      final List<StoreProduct> mapped = [];

      for (final item in list) {
        if (item is Map) {
          final prod = StoreProduct.fromJson(Map<String, dynamic>.from(item));
          dynamicCategories.add(prod.category);
          mapped.add(prod);
        }
      }

      if (!mounted) return;
      setState(() {
        if (refresh) {
          _products = mapped;
          _categories = dynamicCategories.toList();
        } else {
          // Evita duplicados simulando carga adicional
          final currentIds = _products.map((p) => p.id).toSet();
          final nuevos = mapped
              .where((p) => !currentIds.contains(p.id))
              .toList();
          _products.addAll(nuevos);
        }

        _isLoading = false;
        _isFetchingMore = false;
        if (!_categories.contains(_selectedCat)) {
          _selectedCat = 'Todas';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _isFetchingMore = false;
      });
    }
  }

  String _formatPyg(int val) {
    final s = val.abs().toString();
    final reg = RegExp(r'\B(?=(\d{3})+(?!\d))');
    return '${s.replaceAllMapped(reg, (m) => '.')} ₲';
  }

  void _abrirDetalle(StoreProduct product) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ProductoDetalleView(producto: product)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final bgTextPrimary = isDark ? const Color(0xFFF8FAFC) : SiparColors.dark;
    final bgTextSecondary = isDark ? const Color(0xFF94A3B8) : SiparColors.gray;
    final cardBg = isDark ? const Color(0xFF18202F) : Colors.white;
    final borderCol = isDark ? const Color(0xFF2B364B) : Colors.grey.shade200;

    final visibleProducts = _selectedCat == 'Todas'
        ? _products
        : _products
              .where(
                (p) => p.category.toLowerCase() == _selectedCat.toLowerCase(),
              )
              .toList();

    return RefreshIndicator(
      color: SiparColors.green,
      backgroundColor: cardBg,
      onRefresh: () => _fetchCatalog(refresh: true),
      child: ListView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 56, 20, 120),
        children: [
          Text(
            'Catálogo y Servicios',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: bgTextPrimary,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 20),

          // Banner Destacado Adaptable
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: isDark
                  ? const LinearGradient(
                      colors: [Color(0xFF065F46), Color(0xFF047857)],
                    )
                  : const LinearGradient(
                      colors: [SiparColors.green, Color(0xFF34D399)],
                    ),
              borderRadius: BorderRadius.circular(22),
              boxShadow: [
                BoxShadow(
                  color: isDark
                      ? Colors.black.withValues(alpha: 0.4)
                      : SiparColors.green.withValues(alpha: 0.25),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'TIENDA OFICIAL',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Equipamiento y\nCargadores SIPAR',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),
                Icon(
                  LucideIcons.zap,
                  size: 58,
                  color: Colors.white.withValues(alpha: 0.2),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Selector de Categorías (Píldoras)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _categories.map((cat) {
                final active = _selectedCat == cat;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedCat = cat);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: active
                            ? (isDark ? SiparColors.green : SiparColors.dark)
                            : cardBg,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: active ? Colors.transparent : borderCol,
                        ),
                      ),
                      child: Text(
                        cat,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.bold,
                          color: active ? Colors.white : bgTextSecondary,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 20),

          // Listado de Productos
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.only(top: 60),
              child: Center(
                child: CircularProgressIndicator(color: SiparColors.green),
              ),
            )
          else if (visibleProducts.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 60),
              child: Center(
                child: Column(
                  children: [
                    Icon(LucideIcons.packageOpen, size: 48, color: borderCol),
                    const SizedBox(height: 12),
                    Text(
                      'No hay productos en esta categoría.',
                      style: TextStyle(
                        color: bgTextSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ...visibleProducts.map((p) {
              final inStock = p.stock > 0;
              final hasImage = p.imageUrl != null && p.imageUrl!.isNotEmpty;

              return GestureDetector(
                onTap: () => _abrirDetalle(p),
                child: Opacity(
                  opacity: inStock ? 1.0 : 0.6,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cardBg,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderCol),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(
                            alpha: isDark ? 0.2 : 0.03,
                          ),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        // Imagen Cuadrada Limpia
                        Container(
                          width: 86,
                          height: 86,
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF0F141C)
                                : const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: borderCol),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: hasImage
                              ? Image.network(
                                  p.imageUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Icon(
                                    LucideIcons.shoppingBag,
                                    size: 32,
                                    color: !inStock
                                        ? bgTextSecondary
                                        : SiparColors.green,
                                  ),
                                )
                              : Icon(
                                  LucideIcons.shoppingBag,
                                  size: 32,
                                  color: !inStock
                                      ? bgTextSecondary
                                      : SiparColors.green,
                                ),
                        ),
                        const SizedBox(width: 16),

                        // Detalles e Información
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.bold,
                                  color: bgTextPrimary,
                                  height: 1.2,
                                ),
                              ),
                              const SizedBox(height: 6),
                              if (!inStock)
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
                                  child: const Text(
                                    'Agotado temporalmente',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: SiparColors.red,
                                    ),
                                  ),
                                )
                              else if (p.description.isNotEmpty)
                                Text(
                                  p.description,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    color: bgTextSecondary,
                                    height: 1.3,
                                  ),
                                ),
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _formatPyg(p.price),
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: isDark
                                          ? SiparColors.green
                                          : SiparColors.dark,
                                    ),
                                  ),
                                  Icon(
                                    LucideIcons.chevronRight,
                                    size: 18,
                                    color: bgTextSecondary,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),

          if (_isFetchingMore)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: CircularProgressIndicator(color: SiparColors.green),
              ),
            ),
        ],
      ),
    );
  }
}
