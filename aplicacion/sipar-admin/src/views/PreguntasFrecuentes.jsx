import { useState, useEffect } from 'react';
import { HelpCircle, Plus, Edit, Trash2, CheckCircle, X, Loader2, EyeOff } from 'lucide-react';
import api from '../api/axios';

export default function PreguntasFrecuentes() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'Operación OCPP',
    order_index: 1,
    is_active: true
  });

  const fetchFaqs = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const res = await api.get('/api/v1/users/faqs?all_items=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFaqs(res.data || []);
    } catch (err) {
      console.error('Error cargando FAQs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, []);

  const openCreate = () => {
    setEditingFaq(null);
    setFormData({
      question: '',
      answer: '',
      category: 'Operación OCPP',
      order_index: faqs.length + 1,
      is_active: true
    });
    setIsModalOpen(true);
  };

  const openEdit = (faq) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category || 'General',
      order_index: faq.order_index || 1,
      is_active: faq.is_active
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem('sipar_token');
      if (editingFaq) {
        await api.put(`/api/v1/users/faqs/${editingFaq.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await api.post('/api/v1/users/faqs', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setIsModalOpen(false);
      fetchFaqs();
    } catch (err) {
      alert(err.response?.data?.detail || 'No se pudo guardar la pregunta frecuente.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.delete(`/api/v1/users/faqs/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeleteTarget(null);
      fetchFaqs();
    } catch (err) {
      alert(err.response?.data?.detail || 'No se pudo eliminar.');
    } finally {
      setSaving(false);
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
    <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-sipar-orange" /> Centro de Preguntas Frecuentes (App Móvil)
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Administra las preguntas y respuestas de ayuda OCPP que visualizan los conductores en la App iOS y Android.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-sipar-orange hover:bg-orange-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Nueva Pregunta
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="bg-white dark:bg-sipar-dark p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row justify-between gap-4"
          >
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 dark:bg-orange-950/40 text-sipar-orange border border-orange-200 dark:border-orange-800/50">
                  #{faq.order_index} • {faq.category}
                </span>
                {faq.is_active ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Visible en App
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 dark:bg-gray-800 text-gray-500 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Oculta
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-sipar-dark dark:text-white">
                {faq.question}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                {faq.answer}
              </p>
            </div>
            <div className="flex sm:flex-col justify-end gap-2 shrink-0">
              <button
                onClick={() => openEdit(faq)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-sipar-orange hover:text-sipar-orange flex items-center gap-1.5 transition"
              >
                <Edit className="w-3.5 h-3.5" /> Editar
              </button>
              <button
                onClick={() => setDeleteTarget(faq)}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-2xl w-full max-w-lg border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-base text-sipar-dark dark:text-white">
                {editingFaq ? 'Editar Pregunta Frecuente' : 'Nueva Pregunta Frecuente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Orden</label>
                  <input
                    type="number"
                    required
                    value={formData.order_index}
                    onChange={(e) => setFormData({ ...formData, order_index: Number(e.target.value) })}
                    className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3.5 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pregunta</label>
                <input
                  type="text"
                  required
                  placeholder="¿Cómo inicio una carga...?"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Respuesta detallada</label>
                <textarea
                  rows={4}
                  required
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Publicar inmediatamente en la App Móvil
              </label>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-sipar-orange text-white hover:bg-orange-600"
                >
                  {saving ? 'Guardando...' : 'Guardar Pregunta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-sipar-dark rounded-2xl w-full max-w-sm p-6 text-center border border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-base text-sipar-dark dark:text-white mb-2">
              ¿Estás seguro de eliminar esta pregunta?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              "{deleteTarget.question}" dejará de aparecer en la App Móvil.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-red-500 text-xs font-bold text-white hover:bg-red-600"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}