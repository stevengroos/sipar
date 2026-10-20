import { useState, useEffect } from 'react';
import { 
  ShoppingBag, PlusCircle, Image as ImageIcon, Package, Boxes, 
  Edit, XCircle, ClipboardList, Download, Smartphone, 
  Plus, Minus, Check, PackagePlus, ImagePlus, Save, X, 
  Loader2, CheckCircle, AlertTriangle, Trash2
} from 'lucide-react';
import api from '../api/axios';

export default function Tienda() {
  const [products, setProducts] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  // Formularios
  const [productForm, setProductForm] = useState({
    id: null, name: '', sku: '', price: '', image_file: null, image_preview: ''
  });

  const [stockForm, setStockForm] = useState({
    movement_type: 'ingreso', quantity: 1, notes: ''
  });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const [prodRes, histRes] = await Promise.all([
        api.get('/api/v1/store/products', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/store/stock/history', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setProducts(prodRes.data);
      setStockHistory(histRes.data);
    } catch (error) {
      console.error("Error cargando datos:", error);
      showNotification('error', 'Error al cargar el inventario.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4000);
  };

  const openCreateProduct = () => {
    setProductForm({ id: null, name: '', sku: '', price: '', image_file: null, image_preview: '' });
    setIsProductModalOpen(true);
  };

  const openEditProduct = (product) => {
    setProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      image_file: null,
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
      formData.append('price', productForm.price);
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
        showNotification('success', 'Producto actualizado correctamente.');
      } else {
        await api.post('/api/v1/store/products', formData, { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          } 
        });
        showNotification('success', 'Nuevo producto creado.');
      }
      
      setIsProductModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al guardar el producto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/store/products/${selectedProduct.id}`, { headers: { Authorization: `Bearer ${token}` } });
      showNotification('success', 'Producto eliminado.');
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', 'Error al eliminar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openStockModal = (product) => {
    setSelectedProduct(product);
    setStockForm({ movement_type: 'ingreso', quantity: 1, notes: 'Ingreso manual desde panel' });
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
      
      showNotification('success', 'Stock actualizado.');
      setIsStockModalOpen(false);
      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || "Error al ajustar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-10 h-10 text-sipar-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
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
              {notification.type === 'success' ? 'Operación Exitosa' : 'Error'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        
        {/* ================= INVENTARIO ================= */}
        <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
          <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-sipar-orange" /> Inventario de Accesorios
              </h2>
            </div>
            <button onClick={openCreateProduct} className="bg-sipar-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg transition">
              <PlusCircle className="w-4 h-4" /> Nuevo Producto
            </button>
          </div>
          
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Producto (App)</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Precio Unitario</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Stock Disponible</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {products.map(product => (
                  <tr key={product.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition ${product.stock === 0 && 'bg-red-50/10 dark:bg-red-950/10'}`}>
                    <td className="px-6 py-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-700 text-gray-400 overflow-hidden">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-[13px] text-sipar-dark dark:text-white">{product.name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-mono">SKU: {product.sku}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[13px] font-bold text-sipar-dark dark:text-white">{Number(product.price).toLocaleString('es-PY')} ₲</td>
                    <td className="px-6 py-4">
                      {product.stock > 5 ? (
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2.5 py-1.5 rounded-md text-[11px] font-bold flex items-center w-max gap-1.5 border border-green-200 dark:border-green-800"><Package className="w-3.5 h-3.5" /> {product.stock} Unidades</span>
                      ) : product.stock > 0 ? (
                        <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2.5 py-1.5 rounded-md text-[11px] font-bold flex items-center w-max gap-1.5 border border-yellow-200 dark:border-yellow-800"><Package className="w-3.5 h-3.5" /> {product.stock} Unidades (Bajo)</span>
                      ) : (
                        <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2.5 py-1.5 rounded-md text-[11px] font-bold flex items-center w-max gap-1.5 border border-red-200 dark:border-red-800"><XCircle className="w-3.5 h-3.5" /> Sin Stock</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button onClick={() => openStockModal(product)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-orange shadow-sm transition"><Boxes className="w-3.5 h-3.5" /> Stock</button>
                      <button onClick={() => openEditProduct(product)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-sipar-orange shadow-sm transition"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setSelectedProduct(product); setIsDeleteModalOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-300 rounded-lg text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 shadow-sm transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-sm text-gray-400">No hay productos en la tienda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ================= HISTORIAL STOCK ================= */}
        <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-sipar-dark dark:text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-sipar-orange" /> Historial de Movimientos de Stock
            </h3>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white dark:bg-sipar-dark border-b border-gray-100 dark:border-gray-800">
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fecha & Hora</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Responsable</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Producto</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">Movimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {stockHistory.map(history => (
                  <tr key={history.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="px-6 py-4 text-[12px] font-bold text-sipar-dark dark:text-white">{new Date(history.created_at).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-6 py-4 text-[12px] font-bold text-sipar-dark dark:text-white">
                      {history.user ? history.user.first_name : "Sistema"}
                    </td>
                    <td className="px-6 py-4 text-[12px] text-gray-600 dark:text-gray-300">{history.product.name} ({history.product.sku})</td>
                    <td className="px-6 py-4 text-right">
                      {history.movement_type === 'ingreso' ? (
                        <span className="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded text-xs font-bold inline-block border border-green-100 dark:border-green-800 mb-1">+ {history.quantity}</span>
                      ) : (
                        <span className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded text-xs font-bold inline-block border border-red-100 dark:border-red-800 mb-1">- {history.quantity}</span>
                      )}
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{history.notes || 'Sin notas'}</p>
                    </td>
                  </tr>
                ))}
                {stockHistory.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-sm text-gray-400">No hay movimientos registrados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ================= MODAL PRODUCTO ================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out] border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-sipar-orange" /> Formulario de Accesorio
              </h2>
              <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleProductSubmit}>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nombre del Producto</label>
                  <input type="text" required value={productForm.name} onChange={(e) => setProductForm({...productForm, name: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">SKU (Código)</label>
                    <input type="text" required value={productForm.sku} onChange={(e) => setProductForm({...productForm, sku: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Precio de Venta</label>
                    <input type="number" required min="0" value={productForm.price} onChange={(e) => setProductForm({...productForm, price: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                  </div>
                </div>

                <div className="mb-8">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fotografía (App Móvil)</label>
                  
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer relative overflow-hidden h-40">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    
                    {productForm.image_preview ? (
                      <img src={productForm.image_preview} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                      <>
                        <ImagePlus className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-center">Haz clic o arrastra <br/>una imagen JPG/PNG aquí</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-sipar-dark dark:bg-black text-white font-bold rounded-xl shadow-md hover:bg-gray-800 dark:hover:bg-gray-900 transition flex items-center justify-center gap-2 disabled:opacity-70">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Guardar Producto</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL ACTUALIZAR STOCK ================= */}
      {isStockModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
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
                        <Minus className="w-3 h-3 inline" /> Salida / Merma
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Cantidad a ajustar</label>
                  <input type="number" required min="1" max={stockForm.movement_type === 'salida' ? selectedProduct.stock : undefined} value={stockForm.quantity} onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-lg text-center text-sipar-dark dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nota / Justificación (Opcional)</label>
                  <input type="text" value={stockForm.notes} onChange={(e) => setStockForm({...stockForm, notes: e.target.value})} placeholder="Ej. Lote recibido, o Merma por daño" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg text-sm text-sipar-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-sipar-orange transition" />
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={isSubmitting || (stockForm.movement_type === 'salida' && selectedProduct.stock < parseInt(stockForm.quantity))} className="w-full py-3 bg-sipar-orange text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(255,158,0,0.3)] hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Confirmar Ajuste</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL ELIMINAR ================= */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-sipar-dark/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[20px] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] transition-colors">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 dark:border-red-800/40">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="font-bold text-lg text-sipar-dark dark:text-white mb-2">¿Eliminar Producto?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Estás a punto de eliminar <span className="font-bold text-sipar-dark dark:text-white">{selectedProduct?.name}</span> de la tienda.
            </p>
            <div className="flex gap-3">
              <button onClick={() => {setIsDeleteModalOpen(false); setSelectedProduct(null);}} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition text-sm">Cancelar</button>
              <button onClick={handleDeleteProduct} disabled={isSubmitting} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm shadow-sm">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}