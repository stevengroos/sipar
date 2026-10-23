import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingBag, PlusCircle, Image as ImageIcon, Package, Boxes, 
  Edit, XCircle, ClipboardList, Download, Smartphone, 
  Plus, Minus, Check, PackagePlus, ImagePlus, Save, X, 
  Loader2, CheckCircle, AlertTriangle, Trash2, Search, Eye, EyeOff,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Tag, Layers, RotateCcw, Link2
} from 'lucide-react';
import api from '../api/axios';

const PRODUCT_CATEGORIES = [
  "Cargadores Portátiles",
  "Cables & Adaptadores",
  "Tarjetas RFID & Tags",
  "Repuestos & Conectores",
  "Merchandising SIPAR",
  "Accesorios EV"
];

export default function Tienda() {
  const [products, setProducts] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros de Inventario
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'app_visible'
  const [isStockFilterOpen, setIsStockFilterOpen] = useState(false);
  const stockFilterRef = useRef(null);

  // Paginación de Productos (20, 50, 100)
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(20);

  // Paginación y búsqueda de Historial de Stock (20, 50, 100)
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);

  // Modales
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAppPreviewOpen, setIsAppPreviewOpen] = useState(false);
  const [previewCategory, setPreviewCategory] = useState('Todas');
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  // Formulario de Producto
  const [productForm, setProductForm] = useState({
    id: null,
    name: '',
    sku: '',
    category: 'Cables & Adaptadores',
    description: '',
    price: '',
    initial_stock: '0',
    show_in_app: true,
    image_file: null,
    image_url_input: '',
    image_preview: ''
  });

  // Formulario de Stock
  const [stockForm, setStockForm] = useState({
    movement_type: 'ingreso',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (stockFilterRef.current && !stockFilterRef.current.contains(e.target)) {
        setIsStockFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [prodRes, histRes] = await Promise.all([
        api.get('/api/v1/store/products', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/store/stock/history?limit=1000', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setProducts(prodRes.data);
      setStockHistory(histRes.data);
    } catch (error) {
      console.error("Error cargando datos de tienda:", error);
      showNotification('error', 'Error al cargar el inventario de la tienda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setProductPage(1);
  }, [searchTerm, categoryFilter, stockFilter, productPageSize]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historyPageSize]);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const formatPYG = (val) => `${Math.round(Number(val || 0)).toLocaleString('es-PY')} ₲`;

  // Opciones del selector de estado de stock con íconos Lucide React
  const stockFilterOptions = [
    { id: 'all', label: 'Todos los Estados', icon: Filter, color: 'text-gray-400' },
    { id: 'app_visible', label: 'Publicados en App Móvil', icon: Smartphone, color: 'text-sipar-orange' },
    { id: 'in_stock', label: 'Con Stock Disponible (>5)', icon: CheckCircle, color: 'text-green-500' },
    { id: 'low_stock', label: 'Stock Bajo (1 a 5 unid.)', icon: AlertTriangle, color: 'text-amber-500' },
    { id: 'out_of_stock', label: 'Agotados (Sin Stock)', icon: XCircle, color: 'text-red-500' }
  ];
  const currentStockOption = stockFilterOptions.find(o => o.id === stockFilter) || stockFilterOptions[0];
  const CurrentStockIcon = currentStockOption.icon;

  // Filtrado de Productos
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (categoryFilter !== 'all' && (p.category || 'Accesorios EV') !== categoryFilter) return false;
      if (stockFilter === 'app_visible' && !p.show_in_app) return false;
      if (stockFilter === 'in_stock' && p.stock <= 5) return false;
      if (stockFilter === 'low_stock' && (p.stock <= 0 || p.stock > 5)) return false;
      if (stockFilter === 'out_of_stock' && p.stock > 0) return false;

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(lower);
        const matchSku = p.sku.toLowerCase().includes(lower);
        const matchCat = (p.category || '').toLowerCase().includes(lower);
        const matchDesc = (p.description || '').toLowerCase().includes(lower);
        if (!matchName && !matchSku && !matchCat && !matchDesc) return false;
      }
      return true;
    });
  }, [products, categoryFilter, stockFilter, searchTerm]);

  // KPIs de Inventario y App Móvil
  const storeMetrics = useMemo(() => {
    let totalInventoryValue = 0;
    let totalUnits = 0;
    let appVisibleCount = 0;
    let lowOrOutCount = 0;

    filteredProducts.forEach(p => {
      const qty = Number(p.stock || 0);
      const price = Number(p.price || 0);
      totalUnits += qty;
      totalInventoryValue += qty * price;
      if (p.show_in_app) appVisibleCount += 1;
      if (qty <= 5) lowOrOutCount += 1;
    });

    return {
      totalProducts: filteredProducts.length,
      totalInventoryValue: Math.round(totalInventoryValue),
      totalUnits,
      appVisibleCount,
      lowOrOutCount
    };
  }, [filteredProducts]);

  // Paginación de Productos
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const prodStartIndex = (safeProductPage - 1) * productPageSize;
  const prodEndIndex = prodStartIndex + productPageSize;
  const paginatedProducts = filteredProducts.slice(prodStartIndex, prodEndIndex);

  // Filtrado y Paginación de Historial de Stock
  const filteredHistory = useMemo(() => {
    if (!historySearch) return stockHistory;
    const lower = historySearch.toLowerCase();
    return stockHistory.filter(h =>
      (h.product?.name || '').toLowerCase().includes(lower) ||
      (h.product?.sku || '').toLowerCase().includes(lower) ||
      (h.user?.first_name || '').toLowerCase().includes(lower) ||
      (h.notes || '').toLowerCase().includes(lower)
    );
  }, [stockHistory, historySearch]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const histStartIndex = (safeHistoryPage - 1) * historyPageSize;
  const histEndIndex = histStartIndex + historyPageSize;
  const paginatedHistory = filteredHistory.slice(histStartIndex, histEndIndex);

  const openCreateProduct = () => {
    setProductForm({
      id: null,
      name: '',
      sku: '',
      category: 'Cables & Adaptadores',
      description: '',
      price: '',
      initial_stock: '0',
      show_in_app: true,
      image_file: null,
      image_url_input: '',
      image_preview: ''
    });
    setIsProductModalOpen(true);
  };

  const openEditProduct = (product) => {
    setProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category || 'Accesorios EV',
      description: product.description || '',
      price: product.price,
      initial_stock: String(product.stock || 0),
      show_in_app: product.show_in_app !== false,
      image_file: null,
      image_url_input: product.image_url || '',
      image_preview: product.image_url || ''
    });
    setIsProductModalOpen(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProductForm({
        ...productForm,
        image_file: file,
        image_preview: URL.createObjectURL(file)
      });
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('sipar_token');
      const formData = new FormData();
      formData.append('name', productForm.name);
      formData.append('sku', productForm.sku);
      formData.append('category', productForm.category);
      formData.append('description', productForm.description);
      formData.append('price', productForm.price);
      formData.append('show_in_app', String(productForm.show_in_app));

      if (!productForm.id) {
        formData.append('initial_stock', productForm.initial_stock || '0');
      }
      if (productForm.image_url_input) {
        formData.append('image_url_input', productForm.image_url_input);
      }
      if (productForm.image_file) {
        formData.append('image', productForm.image_file);
      }

      if (productForm.id) {
        await api.put(`/api/v1/store/products/${productForm.id}`, formData, { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data' 
          } 
        });
        showNotification('success', 'Producto actualizado en el catálogo.');
      } else {
        await api.post('/api/v1/store/products', formData, { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          } 
        });
        showNotification('success', 'Nuevo producto creado y sincronizado con la App.');
      }
      
      setIsProductModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al guardar el producto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAppVisibility = async (product) => {
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.patch(`/api/v1/store/products/${product.id}/toggle-app`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification(
        'success',
        `${res.data.name}: ${res.data.show_in_app ? 'Visible en la App Móvil' : 'Oculto en la App Móvil'}`
      );
      fetchData();
    } catch (err) {
      showNotification('error', 'No se pudo cambiar la visibilidad del producto.');
    }
  };

  const handleDeleteProduct = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/store/products/${selectedProduct.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification('success', 'Producto retirado de la tienda.');
      setIsDeleteModalOpen(false);
      setSelectedProduct(null);
      fetchData();
    } catch (err) {
      showNotification('error', 'Error al eliminar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openStockModal = (product) => {
    setSelectedProduct(product);
    setStockForm({ movement_type: 'ingreso', quantity: 1, notes: 'Reposición de inventario' });
    setIsStockModalOpen(true);
  };

  const handleStockSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post('/api/v1/store/stock', {
        product_id: selectedProduct.id,
        movement_type: stockForm.movement_type,
        quantity: parseInt(stockForm.quantity),
        notes: stockForm.notes
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      showNotification('success', 'Inventario actualizado y registrado en auditoría.');
      setIsStockModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al ajustar el stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Exportar Catálogo e Inventario a CSV
  const exportCatalogCSV = () => {
    if (filteredProducts.length === 0) return;
    const headers = ["ID", "SKU", "Producto", "Categoria", "Descripcion", "Precio Unitario (Gs)", "Stock Disponible", "Valor Total Stock (Gs)", "Visible en App Movil"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredProducts.map(p => [
      p.id,
      p.sku,
      p.name,
      p.category || 'Accesorios EV',
      p.description || '',
      Math.round(Number(p.price || 0)),
      p.stock,
      Math.round(Number(p.price || 0) * Number(p.stock || 0)),
      p.show_in_app ? 'SI' : 'NO'
    ].map(escapeCsv).join(','));

    const summaryRow = [
      "TOTALES INVENTARIO",
      `${filteredProducts.length} productos`,
      "",
      "",
      "",
      "",
      storeMetrics.totalUnits,
      storeMetrics.totalInventoryValue,
      `${storeMetrics.appVisibleCount} en App`
    ].map(escapeCsv).join(',');

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows, summaryRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Inventario_Tienda_SIPAR.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Exportar Historial de Movimientos de Stock a CSV
  const exportHistoryCSV = () => {
    if (filteredHistory.length === 0) return;
    const headers = ["ID Movimiento", "Fecha y Hora", "Responsable", "SKU", "Producto", "Tipo Movimiento", "Cantidad", "Notas / Justificacion"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredHistory.map(h => [
      h.id,
      h.created_at ? new Date(h.created_at).toLocaleString('es-PY') : 'N/A',
      h.user ? `${h.user.first_name || ''} ${h.user.last_name || ''}`.trim() : 'Sistema',
      h.product?.sku || '',
      h.product?.name || '',
      h.movement_type.toUpperCase(),
      h.movement_type === 'ingreso' ? `+${h.quantity}` : `-${h.quantity}`,
      h.notes || ''
    ].map(escapeCsv).join(','));

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Historial_Movimientos_Stock_SIPAR.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  const hasActiveFilters = Boolean(searchTerm || categoryFilter !== 'all' || stockFilter !== 'all');
  const appCatalogProducts = products.filter(p => p.show_in_app !== false && (previewCategory === 'Todas' || (p.category || 'Accesorios EV') === previewCategory));

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative space-y-6">
      
      {/* NOTIFICACIÓN TOAST */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl animate-[slideDown_0.3s_ease-out] border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Tienda Actualizada' : 'Aviso del Sistema'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ================= CABECERA Y ACCIONES RÁPIDAS ================= */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-sipar-orange" /> Tienda de Accesorios & Catálogo App Móvil
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Administra el stock físico, precios y qué productos ven los conductores en la App Móvil de SIPAR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsAppPreviewOpen(true)}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 hover:border-sipar-orange text-sipar-dark dark:text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition"
          >
            <Smartphone className="w-4 h-4 text-sipar-orange" /> Vista Previa App Móvil
          </button>

          <button
            onClick={exportCatalogCSV}
            disabled={filteredProducts.length === 0}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-sipar-dark dark:text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition"
          >
            <Download className="w-4 h-4 text-sipar-orange" /> Exportar Inventario CSV
          </button>

          <button
            onClick={openCreateProduct}
            className="bg-sipar-orange hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition"
          >
            <PlusCircle className="w-4 h-4" /> Nuevo Producto
          </button>
        </div>
      </div>

      {/* ================= 4 KPIs DE INVENTARIO Y CATÁLOGO APP ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Valorización de Stock</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {formatPYG(storeMetrics.totalInventoryValue)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5">
              En {storeMetrics.totalProducts} referencias activas
            </p>
          </div>
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex justify-center items-center text-sipar-orange border border-orange-100 dark:border-orange-800/40 shrink-0">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Unidades Disponibles</p>
            <p className="text-[24px] font-extrabold text-green-600 dark:text-green-400 tracking-tight mt-1">
              {storeMetrics.totalUnits} <span className="text-sm font-bold">unid.</span>
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5">
              Stock físico en depósito
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-500 border border-green-100 dark:border-green-800/40 shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Publicados en App Móvil</p>
            <p className="text-[24px] font-extrabold text-blue-600 dark:text-blue-400 tracking-tight mt-1">
              {storeMetrics.appVisibleCount} <span className="text-xs font-normal text-gray-400">/ {storeMetrics.totalProducts}</span>
            </p>
            <p className="text-[11px] text-blue-500 font-semibold mt-1.5">
              Sincronizados con `/app-catalog`
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex justify-center items-center text-blue-500 border border-blue-100 dark:border-blue-800/40 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
        </div>

        <div className={`bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border flex items-center justify-between ${
          storeMetrics.lowOrOutCount > 0 ? 'border-amber-300 dark:border-amber-800/70' : 'border-gray-100 dark:border-gray-800'
        }`}>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Stock Bajo o Agotado</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {storeMetrics.lowOrOutCount} <span className="text-sm font-bold text-amber-500">alerta(s)</span>
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5">
              Referencias con ≤ 5 unidades
            </p>
          </div>
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex justify-center items-center text-amber-500 border border-amber-100 dark:border-amber-800/40 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ================= TABLA DE INVENTARIO Y CATÁLOGO APP ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-sipar-orange" /> Catálogo de Productos ({filteredProducts.length})
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro por Categoría */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none cursor-pointer"
            >
              <option value="all">Todas las Categorías</option>
              {PRODUCT_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Dropdown personalizado con Lucide Icons para Estado de Stock / App */}
            <div className="relative" ref={stockFilterRef}>
              <button
                type="button"
                onClick={() => setIsStockFilterOpen(!isStockFilterOpen)}
                className="bg-gray-800 border border-gray-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 hover:border-sipar-orange transition"
              >
                <CurrentStockIcon className={`w-3.5 h-3.5 ${currentStockOption.color}`} />
                <span>{currentStockOption.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {isStockFilterOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#161B26] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl py-2 z-50">
                  {stockFilterOptions.map(opt => {
                    const IconComp = opt.icon;
                    const isSelected = stockFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => { setStockFilter(opt.id); setIsStockFilterOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2.5 transition ${
                          isSelected
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-sipar-orange'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 shrink-0 ${opt.color}`} />
                        <span className="flex-1 truncate">{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sipar-orange" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selector de paginado (20, 50, 100) */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
              <span className="text-xs text-gray-400">Mostrar:</span>
              <select
                value={productPageSize}
                onChange={(e) => setProductPageSize(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value={20} className="bg-gray-900">20</option>
                <option value={50} className="bg-gray-900">50</option>
                <option value={100} className="bg-gray-900">100</option>
              </select>
            </div>

            {/* Buscador */}
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto o SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:outline-none placeholder-gray-500 w-44"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => { setSearchTerm(''); setCategoryFilter('all'); setStockFilter('all'); }}
                className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700"
                title="Limpiar filtros"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">
                <th className="px-6 py-4">Producto & Especificación</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Precio Unitario</th>
                <th className="px-6 py-4">Stock Disponible</th>
                <th className="px-6 py-4">Visibilidad App Móvil</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {paginatedProducts.map(product => (
                <tr key={product.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition ${product.stock === 0 && 'bg-red-50/10 dark:bg-red-950/10'}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-700 text-gray-400 overflow-hidden shrink-0">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[13px] text-sipar-dark dark:text-white truncate max-w-[240px]">{product.name}</p>
                        <p className="text-[11px] text-gray-400 font-mono mt-0.5">SKU: {product.sku}</p>
                        {product.description && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[260px] mt-0.5" title={product.description}>
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 inline-flex items-center gap-1">
                      <Tag className="w-3 h-3 text-sipar-orange" /> {product.category || 'Accesorios EV'}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <p className="text-[14px] font-extrabold text-sipar-dark dark:text-white">
                      {formatPYG(product.price)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Total: {formatPYG(Number(product.price || 0) * Number(product.stock || 0))}
                    </p>
                  </td>

                  <td className="px-6 py-4">
                    {product.stock > 5 ? (
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-green-200 dark:border-green-800">
                        <Package className="w-3.5 h-3.5" /> {product.stock} Unidades
                      </span>
                    ) : product.stock > 0 ? (
                      <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5" /> {product.stock} Unid. (Bajo)
                      </span>
                    ) : (
                      <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-red-200 dark:border-red-800">
                        <XCircle className="w-3.5 h-3.5" /> Agotado (0)
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() => handleToggleAppVisibility(product)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border transition ${
                        product.show_in_app !== false
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
                      }`}
                      title="Haz clic para mostrar u ocultar este producto en la App Móvil"
                    >
                      {product.show_in_app !== false ? (
                        <><Eye className="w-3.5 h-3.5" /> Visible en App</>
                      ) : (
                        <><EyeOff className="w-3.5 h-3.5" /> Oculto en App</>
                      )}
                    </button>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openStockModal(product)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-lg text-xs font-bold hover:border-sipar-orange hover:text-sipar-orange shadow-sm transition"
                      >
                        <Boxes className="w-3.5 h-3.5" /> Stock
                      </button>
                      <button
                        onClick={() => openEditProduct(product)}
                        className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:text-sipar-orange shadow-sm transition"
                        title="Editar Producto"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setSelectedProduct(product); setIsDeleteModalOpen(true); }}
                        className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 shadow-sm transition"
                        title="Eliminar Producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-sm text-gray-400">
                    No se encontraron productos en el catálogo con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación de Productos */}
        {filteredProducts.length > 0 && (
          <div className="px-6 py-4 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Mostrando <strong className="text-sipar-dark dark:text-white">{prodStartIndex + 1}</strong> a{' '}
              <strong className="text-sipar-dark dark:text-white">{Math.min(prodEndIndex, filteredProducts.length)}</strong> de{' '}
              <strong className="text-sipar-dark dark:text-white">{filteredProducts.length}</strong> productos
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setProductPage(p => Math.max(1, p - 1))}
                disabled={safeProductPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <span className="px-3 font-bold text-sipar-dark dark:text-white">
                Página {safeProductPage} de {totalProductPages}
              </span>
              <button
                onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))}
                disabled={safeProductPage === totalProductPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold disabled:opacity-40 flex items-center gap-1"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= HISTORIAL DE MOVIMIENTOS DE STOCK PAGINADO ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-sipar-orange" /> Kardex & Historial de Movimientos de Stock ({filteredHistory.length})
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-xs">
              <span className="text-gray-400">Filas:</span>
              <select
                value={historyPageSize}
                onChange={(e) => setHistoryPageSize(Number(e.target.value))}
                className="bg-transparent font-bold text-sipar-dark dark:text-white outline-none cursor-pointer"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-gray-200 dark:border-gray-700">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filtrar kardex..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="bg-transparent border-none text-xs text-sipar-dark dark:text-white focus:outline-none w-40"
              />
            </div>

            {filteredHistory.length > 0 && (
              <button
                onClick={exportHistoryCSV}
                className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-sipar-dark dark:text-white rounded-lg hover:border-sipar-orange flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-sipar-orange" /> Exportar Kardex CSV
              </button>
            )}
          </div>
        </div>

        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white dark:bg-sipar-dark border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                <th className="px-6 py-3">Fecha & Hora</th>
                <th className="px-6 py-3">Responsable</th>
                <th className="px-6 py-3">Producto / SKU</th>
                <th className="px-6 py-3">Nota / Justificación</th>
                <th className="px-6 py-3 text-right">Movimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-xs">
              {paginatedHistory.map(history => (
                <tr key={history.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                  <td className="px-6 py-3.5 font-mono text-gray-500 dark:text-gray-400">
                    {new Date(history.created_at).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-6 py-3.5 font-bold text-sipar-dark dark:text-white">
                    {history.user ? `${history.user.first_name || ''} ${history.user.last_name || ''}`.trim() || history.user.email : "Sistema"}
                  </td>
                  <td className="px-6 py-3.5 font-semibold text-gray-700 dark:text-gray-200">
                    {history.product?.name} <span className="font-mono text-gray-400">({history.product?.sku})</span>
                  </td>
                  <td className="px-6 py-3.5 text-gray-500 dark:text-gray-400">
                    {history.notes || 'Sin notas'}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {history.movement_type === 'ingreso' ? (
                      <span className="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2.5 py-1 rounded-full text-xs font-extrabold border border-green-200 dark:border-green-800">
                        + {history.quantity} unid.
                      </span>
                    ) : (
                      <span className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full text-xs font-extrabold border border-red-200 dark:border-red-800">
                        - {history.quantity} unid.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {paginatedHistory.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-sm text-gray-400">No hay movimientos de stock registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredHistory.length > 0 && (
          <div className="px-6 py-3.5 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Mostrando {histStartIndex + 1} a {Math.min(histEndIndex, filteredHistory.length)} de {filteredHistory.length} movimientos
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                disabled={safeHistoryPage === 1}
                className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-2 font-bold text-sipar-dark dark:text-white">
                {safeHistoryPage} / {totalHistoryPages}
              </span>
              <button
                onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                disabled={safeHistoryPage === totalHistoryPages}
                className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-bold disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL 1: CREAR / EDITAR PRODUCTO ================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.2s_ease-out] border border-gray-200 dark:border-gray-800 max-h-[92vh]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-base font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-sipar-orange" /> {productForm.id ? 'Editar Producto del Catálogo' : 'Nuevo Producto para Tienda & App'}
              </h2>
              <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleProductSubmit} className="p-6 overflow-y-auto hide-scroll space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-8">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Nombre Comercial (App)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Adaptador CCS2 a Tipo 2 (22 kW)"
                    value={productForm.name}
                    onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">SKU / Código</label>
                  <input
                    type="text"
                    required
                    placeholder="SIP-EV-001"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({...productForm, sku: e.target.value.toUpperCase()})}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Categoría App</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({...productForm, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-xs font-bold outline-none"
                  >
                    {PRODUCT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Precio Venta (₲)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Ej. 450000"
                    value={productForm.price}
                    onChange={(e) => setProductForm({...productForm, price: e.target.value})}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>

                {!productForm.id ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Stock Inicial</label>
                    <input
                      type="number"
                      min="0"
                      value={productForm.initial_stock}
                      onChange={(e) => setProductForm({...productForm, initial_stock: e.target.value})}
                      className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 cursor-pointer text-xs font-bold text-sipar-dark dark:text-white">
                      <input
                        type="checkbox"
                        checked={productForm.show_in_app}
                        onChange={(e) => setProductForm({...productForm, show_in_app: e.target.checked})}
                        className="rounded text-sipar-orange focus:ring-sipar-orange"
                      />
                      Visible en App
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Descripción / Especificaciones (Visible en la App Móvil)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej. Cable trifásico 32A de 5 metros con bolso de transporte incluido y garantía SIPAR..."
                  value={productForm.description}
                  onChange={(e) => setProductForm({...productForm, description: e.target.value})}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-sipar-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Fotografía del Producto (Subir Archivo o Pegar URL)
                </label>
                <div className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-5 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-2 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer relative overflow-hidden h-28">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    {productForm.image_preview ? (
                      <img src={productForm.image_preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                    ) : (
                      <>
                        <ImagePlus className="w-6 h-6 text-gray-400 mb-1" />
                        <p className="text-[10px] font-semibold text-gray-500 text-center">Subir JPG/PNG</p>
                      </>
                    )}
                  </div>

                  <div className="col-span-7 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Link2 className="w-3.5 h-3.5 text-sipar-orange" />
                      <span>O pega una URL directa de imagen:</span>
                    </div>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={productForm.image_url_input}
                      onChange={(e) => setProductForm({
                        ...productForm,
                        image_url_input: e.target.value,
                        image_preview: e.target.value || productForm.image_preview
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-sipar-orange hover:bg-orange-600 text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Guardar Producto</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: SIMULADOR VISTA PREVIA APP MÓVIL SIPAR ================= */}
      {isAppPreviewOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-[#11151E] rounded-[38px] w-full max-w-[390px] h-[740px] max-h-[92vh] shadow-2xl border-[6px] border-gray-800 flex flex-col overflow-hidden relative animate-[slideUp_0.2s_ease-out]">
            
            {/* Barra superior estilo iPhone */}
            <div className="bg-[#161B26] px-6 pt-4 pb-3 border-b border-gray-800 flex justify-between items-center text-white shrink-0">
              <div>
                <span className="text-[10px] font-bold text-sipar-orange uppercase tracking-widest flex items-center gap-1">
                  <Smartphone className="w-3 h-3" /> Simulador App Conductores
                </span>
                <h3 className="text-base font-extrabold mt-0.5">Tienda SIPAR EV</h3>
              </div>
              <button
                onClick={() => setIsAppPreviewOpen(false)}
                className="p-1.5 bg-gray-800 rounded-full text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Píldoras de Categorías dentro de la App */}
            <div className="px-4 py-3 bg-[#161B26]/60 flex gap-2 overflow-x-auto hide-scroll shrink-0 border-b border-gray-800/80">
              {['Todas', ...PRODUCT_CATEGORIES].map(cat => (
                <button
                  key={cat}
                  onClick={() => setPreviewCategory(cat)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                    previewCategory === cat
                      ? 'bg-sipar-orange text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Grilla de Productos como los ve el cliente en la App */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scroll">
              {appCatalogProducts.length > 0 ? (
                appCatalogProducts.map(prod => (
                  <div key={prod.id} className="bg-[#1A202C] rounded-2xl p-3.5 border border-gray-800 flex gap-3.5 items-center shadow-sm">
                    <div className="w-20 h-20 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {prod.image_url ? (
                        <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBag className="w-7 h-7 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-bold text-sipar-orange uppercase tracking-wider">
                        {prod.category || 'Accesorios EV'}
                      </span>
                      <h4 className="text-xs font-bold text-white truncate mt-0.5">{prod.name}</h4>
                      {prod.description && (
                        <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5">{prod.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-sm font-extrabold text-white">{formatPYG(prod.price)}</span>
                        {prod.stock > 0 ? (
                          <span className="px-2.5 py-1 rounded-lg bg-sipar-orange text-white text-[10px] font-bold">
                            Comprar ({prod.stock})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-500 text-[10px] font-bold">
                            Agotado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                  <ShoppingBag className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-xs font-bold">No hay productos visibles en esta categoría para la App Móvil.</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-[#161B26] border-t border-gray-800 text-center text-[10px] text-gray-400 font-mono">
              Endpoint conectado: GET /api/v1/store/app-catalog
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: ACTUALIZAR STOCK ================= */}
      {isStockModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out] border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-sipar-orange" /> Ajuste de Stock
              </h2>
              <button onClick={() => setIsStockModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleStockSubmit}>
                <div className="mb-5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Producto Seleccionado</p>
                  <p className="text-[14px] font-bold text-sipar-dark dark:text-white">{selectedProduct.name}</p>
                  <p className="text-[12px] text-green-600 dark:text-green-400 font-semibold mt-1">Stock Actual: {selectedProduct.stock} unidades</p>
                </div>
                
                <div className="mb-5">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tipo de Movimiento</label>
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <input type="radio" name="movimiento" value="ingreso" checked={stockForm.movement_type === 'ingreso'} onChange={(e) => setStockForm({...stockForm, movement_type: e.target.value})} className="peer hidden" />
                      <div className="px-3 py-2 text-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 font-semibold text-xs peer-checked:bg-green-50 dark:peer-checked:bg-green-900/30 peer-checked:border-green-500 peer-checked:text-green-700 dark:peer-checked:text-green-400 cursor-pointer transition">
                        <Plus className="w-3 h-3 inline" /> Ingreso
                      </div>
                    </label>
                    <label className="flex-1">
                      <input type="radio" name="movimiento" value="salida" checked={stockForm.movement_type === 'salida'} onChange={(e) => setStockForm({...stockForm, movement_type: e.target.value})} className="peer hidden" />
                      <div className="px-3 py-2 text-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 font-semibold text-xs peer-checked:bg-red-50 dark:peer-checked:bg-red-900/30 peer-checked:border-red-500 peer-checked:text-red-700 dark:peer-checked:text-red-400 cursor-pointer transition">
                        <Minus className="w-3 h-3 inline" /> Salida / Venta
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Cantidad a ajustar</label>
                  <input type="number" required min="1" max={stockForm.movement_type === 'salida' ? selectedProduct.stock : undefined} value={stockForm.quantity} onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-lg text-center text-sipar-dark dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nota / Justificación</label>
                  <input type="text" required value={stockForm.notes} onChange={(e) => setStockForm({...stockForm, notes: e.target.value})} placeholder="Ej. Lote importado recibido / Venta mostrador" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-xs text-sipar-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>

                <button type="submit" disabled={isSubmitting || (stockForm.movement_type === 'salida' && selectedProduct.stock < parseInt(stockForm.quantity))} className="w-full py-3 bg-sipar-orange text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,158,0,0.3)] hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50 text-xs">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Confirmar Ajuste de Inventario</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: ELIMINAR PRODUCTO ================= */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] transition-colors">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Retirar Producto?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Estás a punto de retirar <span className="font-bold text-sipar-dark dark:text-white">{selectedProduct?.name}</span> de la tienda y del catálogo de la App Móvil.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {setIsDeleteModalOpen(false); setSelectedProduct(null);}} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition text-sm">Cancelar</button>
              <button onClick={handleDeleteProduct} disabled={isSubmitting} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm shadow-sm">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, retirar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}