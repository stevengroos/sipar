import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Wallet, Landmark, ArrowLeftRight, ArrowUpRight, AlertCircle, 
  Receipt, Search, Download, BatteryCharging, CheckCircle2, 
  ShieldAlert, FileWarning, Ban, CornerDownLeft, X, Loader2, 
  Zap, Clock, ChevronLeft, ChevronRight, RotateCcw, Lock, 
  MessageSquareWarning, Eye, AlertTriangle, CheckCircle, Filter, ChevronDown
} from 'lucide-react';
import api from '../api/axios';

export default function Finanzas() {
  const [transactions, setTransactions] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros
  const [selectedCharger, setSelectedCharger] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'refunded' | 'rejected' | 'fault_alert'
  const [searchTerm, setSearchTerm] = useState('');
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef(null);

  // Paginación (20 por defecto, seleccionable 20, 50, 100)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modales
  const [selectedTx, setSelectedTx] = useState(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isOpenDisputeModalOpen, setIsOpenDisputeModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Formulario para Abrir Reclamo (Soporte / App Móvil)
  const [newDisputeReason, setNewDisputeReason] = useState('');

  // Formulario para Resolver Reclamo / Reversión (ISO 27001)
  const [resolutionType, setResolutionType] = useState('refund_full'); // 'refund_full' | 'refund_partial' | 'reject'
  const [partialRefundAmount, setPartialRefundAmount] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [notification, setNotification] = useState({ show: false, type: '', message: '' });

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: '', message: '' }), 4500);
  };

  // Cerrar menú desplegable al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setIsStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchFinancialData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      let url = '/api/v1/transactions/?limit=2000&';
      if (selectedCharger) url += `charger_id=${selectedCharger}&`;
      if (selectedMonth) url += `month=${selectedMonth}&`;

      const [txRes, chRes] = await Promise.all([
        api.get(url, { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/api/v1/chargers/', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setTransactions(txRes.data);
      setChargers(chRes.data);
    } catch (error) {
      console.error("Error al cargar datos financieros:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
    const interval = setInterval(fetchFinancialData, 10000);
    return () => clearInterval(interval);
  }, [selectedCharger, selectedMonth]);

  // Reiniciar a la página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCharger, selectedMonth, statusFilter, searchTerm, pageSize]);

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return "00:00:00";
    const total = Math.floor(sec);
    const hrs = Math.floor(total / 3600).toString().padStart(2, '0');
    const mins = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const formatPYG = (val) => {
    const num = Math.round(Number(val || 0));
    return `${num.toLocaleString('es-PY')} ₲`;
  };

  // Definición de opciones para el selector personalizado con Lucide Icons
  const statusOptions = [
    { id: 'all', label: 'Todos los Estados', icon: Filter, color: 'text-gray-400' },
    { id: 'pending', label: 'Con Reclamo / Disputa Pendiente', icon: AlertCircle, color: 'text-red-500' },
    { id: 'refunded', label: 'Reembolsadas / Revertidas', icon: CornerDownLeft, color: 'text-amber-500' },
    { id: 'rejected', label: 'Reclamo Rechazado', icon: Ban, color: 'text-gray-400' },
    { id: 'fault_alert', label: 'Con Falla Técnica OCPP', icon: Zap, color: 'text-sipar-orange' }
  ];

  const currentStatusOption = statusOptions.find(o => o.id === statusFilter) || statusOptions[0];

  // Filtrado combinado
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const dStatus = tx.dispute_status || 'none';
      const hasOcppError = tx.error_code && tx.error_code !== 'NoError';

      if (statusFilter === 'pending' && dStatus !== 'pending') return false;
      if (statusFilter === 'refunded' && dStatus !== 'refunded') return false;
      if (statusFilter === 'rejected' && dStatus !== 'rejected') return false;
      if (statusFilter === 'fault_alert' && !hasOcppError) return false;

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchId = tx.id.toString().includes(lower) || `trx-${tx.id}`.includes(lower);
        const matchUser = tx.user_name.toLowerCase().includes(lower) || tx.user_email.toLowerCase().includes(lower);
        const matchCharger = tx.charger_serial.toLowerCase().includes(lower);
        const matchMethod = (tx.payment_method || '').toLowerCase().includes(lower);
        const matchDispute = (tx.dispute_reason || '').toLowerCase().includes(lower);
        if (!matchId && !matchUser && !matchCharger && !matchMethod && !matchDispute) return false;
      }

      return true;
    });
  }, [transactions, statusFilter, searchTerm]);

  // KPIs Financieros Dinámicos
  const financialMetrics = useMemo(() => {
    let grossBilled = 0;
    let totalRefunded = 0;
    let totalAndeCost = 0;
    let totalKwh = 0;
    let pendingDisputesCount = 0;
    let refundedCount = 0;
    let faultTxCount = 0;

    filteredTransactions.forEach(tx => {
      const billed = Number(tx.total_amount_pyg || 0);
      const refunded = tx.dispute_status === 'refunded' ? Number(tx.refund_amount_pyg || 0) : 0;
      grossBilled += billed;
      totalRefunded += refunded;
      totalAndeCost += Number(tx.ande_energy_cost_pyg || 0);
      totalKwh += Number(tx.kwh_delivered || 0);

      if (tx.dispute_status === 'pending') pendingDisputesCount += 1;
      if (tx.dispute_status === 'refunded') refundedCount += 1;
      if (tx.error_code && tx.error_code !== 'NoError') faultTxCount += 1;
    });

    const netRevenue = Math.max(0, grossBilled - totalRefunded);
    const netMargin = netRevenue - totalAndeCost;

    return {
      grossBilled: Math.round(grossBilled),
      netRevenue: Math.round(netRevenue),
      totalRefunded: Math.round(totalRefunded),
      totalAndeCost: Math.round(totalAndeCost),
      netMargin: Math.round(netMargin),
      totalKwh: Number(totalKwh.toFixed(2)),
      pendingDisputesCount,
      refundedCount,
      faultTxCount
    };
  }, [filteredTransactions]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  const openCreateDisputeModal = (tx) => {
    setSelectedTx(tx);
    const defaultReason = tx.error_code && tx.error_code !== 'NoError'
      ? `Solicitud de revisión por corte técnico (${tx.error_code}).`
      : '';
    setNewDisputeReason(defaultReason);
    setIsOpenDisputeModalOpen(true);
  };

  const openResolveModal = (tx) => {
    setSelectedTx(tx);
    setResolutionType('refund_full');
    setPartialRefundAmount(String(Math.round(Number(tx.total_amount_pyg || 0) / 2)));
    setResolutionNote('');
    setAdminPassword('');
    setIsResolveModalOpen(true);
  };

  const handleCreateDisputeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTx) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post(`/api/v1/transactions/${selectedTx.id}/dispute`, {
        reason: newDisputeReason
      }, { headers: { Authorization: `Bearer ${token}` } });

      showNotification('success', `Reclamo registrado para la transacción #TRX-${selectedTx.id}.`);
      setIsOpenDisputeModalOpen(false);
      fetchFinancialData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'Error al registrar el reclamo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveDisputeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTx) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('sipar_token');
      await api.post(`/api/v1/transactions/${selectedTx.id}/resolve-dispute`, {
        resolution: resolutionType,
        refund_amount_pyg: resolutionType === 'refund_partial' ? parseFloat(partialRefundAmount) || 0 : 0,
        resolution_note: resolutionNote,
        admin_password: adminPassword
      }, { headers: { Authorization: `Bearer ${token}` } });

      showNotification('success', `Resolución financiera de #TRX-${selectedTx.id} aplicada y auditada.`);
      setIsResolveModalOpen(false);
      fetchFinancialData();
    } catch (err) {
      showNotification('error', err.response?.data?.detail || 'No se pudo procesar la resolución.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportFinancialCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = [
      "ID Transaccion", "Fecha/Hora", "Usuario", "Email", "Estacion",
      "kWh Entregados", "Duracion (HH:MM:SS)", "Medio de Pago", "Estado Operativo",
      "Diagnostico OCPP", "Monto Bruto Cobrado (Gs)", "Estado Reclamo / Disputa",
      "Monto Revertido / Reembolsado (Gs)", "Ingreso Neto Final (Gs)",
      "Costo Energia ANDE (Gs)", "Margen Neto SIPAR (Gs)", "Motivo Reclamo", "Resolucion Auditoria"
    ];

    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredTransactions.map(tx => {
      const billed = Math.round(Number(tx.total_amount_pyg || 0));
      const refunded = tx.dispute_status === 'refunded' ? Math.round(Number(tx.refund_amount_pyg || 0)) : 0;
      const netRev = Math.max(0, billed - refunded);
      const ande = Math.round(Number(tx.ande_energy_cost_pyg || 0));
      const margin = netRev - ande;

      return [
        `#TRX-${tx.id}`,
        tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY') : 'N/A',
        tx.user_name, tx.user_email, tx.charger_serial,
        Number(tx.kwh_delivered || 0).toFixed(2),
        formatSeconds(tx.duration_seconds),
        tx.payment_method || 'Cartera Digital',
        tx.status, tx.error_code || 'NoError', billed,
        tx.dispute_status || 'none', refunded, netRev, ande, margin,
        tx.dispute_reason || '',
        tx.dispute_resolution_note ? `${tx.dispute_resolution_note} (${tx.dispute_resolved_by || ''})` : ''
      ].map(escapeCsv).join(',');
    });

    const summaryRow = [
      "TOTALES CONCILIACION", `${filteredTransactions.length} operaciones`, "", "",
      selectedCharger ? (chargers.find(c => String(c.id) === String(selectedCharger))?.serial_number || '') : "Todas las estaciones",
      financialMetrics.totalKwh.toFixed(2), "", "", "", "",
      financialMetrics.grossBilled, `${financialMetrics.pendingDisputesCount} pendientes`,
      financialMetrics.totalRefunded, financialMetrics.netRevenue,
      financialMetrics.totalAndeCost, financialMetrics.netMargin, "", ""
    ].map(escapeCsv).join(',');

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows, summaryRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Conciliacion_Financiera_SIPAR_${selectedMonth || 'Historico'}.csv`);
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

  const hasActiveFilters = Boolean(selectedCharger || selectedMonth || statusFilter !== 'all' || searchTerm);

  const CurrentStatusIcon = currentStatusOption.icon;

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative space-y-6">
      
      {/* NOTIFICACIÓN TOAST */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border ${
          notification.type === 'success' 
            ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' 
            : 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div>
            <p className="font-bold text-sm text-sipar-dark dark:text-white">
              {notification.type === 'success' ? 'Operación Financiera Registrada' : 'Aviso del Sistema'}
            </p>
            <p className="text-xs mt-0.5">{notification.message}</p>
          </div>
          <button onClick={() => setNotification({show:false, type:'', message:''})} className="ml-4 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* CABECERA Y FILTROS SUPERIORES */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-sipar-dark dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-sipar-orange" /> Finanzas, Conciliación & Reversiones
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Libro mayor conectado en tiempo real a los cargadores, liquidación ANDE y gestión de reclamos de la App Móvil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCharger}
            onChange={(e) => setSelectedCharger(e.target.value)}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white text-xs font-bold px-3.5 py-2.5 rounded-xl outline-none shadow-sm cursor-pointer"
          >
            <option value="">Todas las Estaciones</option>
            {chargers.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.serial_number}</option>
            ))}
          </select>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white text-xs font-bold px-3.5 py-2.5 rounded-xl outline-none shadow-sm"
          />

          {/* ================= SELECTOR PERSONALIZADO CON LUCIDE ICONS ================= */}
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
              className="bg-white dark:bg-sipar-dark border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white text-xs font-bold px-3.5 py-2.5 rounded-xl outline-none shadow-sm flex items-center gap-2 cursor-pointer hover:border-sipar-orange transition"
            >
              <CurrentStatusIcon className={`w-4 h-4 ${currentStatusOption.color}`} />
              <span>{currentStatusOption.label}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
            </button>

            {isStatusMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#161B26] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl py-2 z-50 animate-[slideDown_0.15s_ease-out]">
                {statusOptions.map(opt => {
                  const IconComponent = opt.icon;
                  const isSelected = statusFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt.id);
                        setIsStatusMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2.5 transition ${
                        isSelected
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-sipar-orange'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <IconComponent className={`w-4 h-4 shrink-0 ${opt.color}`} />
                      <span className="flex-1 truncate">{opt.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-sipar-orange shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => { setSelectedCharger(''); setSelectedMonth(''); setStatusFilter('all'); setSearchTerm(''); }}
              className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}

          <button
            onClick={exportFinancialCSV}
            disabled={filteredTransactions.length === 0}
            className="bg-sipar-orange hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition"
          >
            <Download className="w-4 h-4" /> Exportar CSV ({filteredTransactions.length})
          </button>
        </div>
      </div>

      {/* ================= 4 KPIs FINANCIEROS REALES ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Facturación Neta Cobrada</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {formatPYG(financialMetrics.netRevenue)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5">
              Bruto: {formatPYG(financialMetrics.grossBilled)} ({financialMetrics.totalKwh} kWh)
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex justify-center items-center text-blue-500 border border-blue-100 dark:border-blue-800/40 shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Costo Energía (ANDE)</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {formatPYG(financialMetrics.totalAndeCost)}
            </p>
            <p className="text-[11px] text-green-500 font-bold mt-1.5 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> Reembolso a propietarios
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-500 border border-green-100 dark:border-green-800/40 shrink-0">
            <Landmark className="w-6 h-6" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-orange-200 dark:border-orange-900/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Margen Neto (SIPAR)</p>
            <p className="text-[24px] font-extrabold text-sipar-orange tracking-tight mt-1">
              {formatPYG(financialMetrics.netMargin)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-sipar-orange" /> Ganancia libre tras ANDE y reversiones
            </p>
          </div>
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex justify-center items-center text-sipar-orange border border-orange-100 dark:border-orange-800/40 shrink-0">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
        </div>

        <div className={`bg-white dark:bg-sipar-dark rounded-[20px] p-5 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border flex items-center justify-between ${
          financialMetrics.pendingDisputesCount > 0
            ? 'border-red-300 dark:border-red-800/80'
            : 'border-gray-100 dark:border-gray-800'
        }`}>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Reclamos & Reversiones</p>
            <p className="text-[24px] font-extrabold text-sipar-dark dark:text-white tracking-tight mt-1">
              {financialMetrics.pendingDisputesCount} <span className="text-sm font-bold text-red-500">Pendiente(s)</span>
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-1.5">
              Revertido: <span className="text-amber-500 font-bold">{formatPYG(financialMetrics.totalRefunded)}</span> ({financialMetrics.refundedCount})
            </p>
          </div>
          <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-xl flex justify-center items-center text-red-500 border border-red-100 dark:border-red-800/40 shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* ================= LIBRO MAYOR / CONCILIACIÓN PAGINADA ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-sipar-orange" /> Conciliación & Libro Mayor ({filteredTransactions.length})
            </h2>
            {financialMetrics.pendingDisputesCount > 0 && (
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" /> {financialMetrics.pendingDisputesCount} reclamo(s) por resolver
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
              <span className="text-xs text-gray-400 font-medium">Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value={20} className="bg-gray-900 text-white">20</option>
                <option value={50} className="bg-gray-900 text-white">50</option>
                <option value={100} className="bg-gray-900 text-white">100</option>
              </select>
            </div>

            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar ID, cliente, estación o reclamo..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-white focus:outline-none placeholder-gray-500 w-60" 
              />
            </div>
          </div>
        </div>
        
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">
                <th className="px-6 py-4">Transacción & Fecha</th>
                <th className="px-6 py-4">Usuario / Cliente App</th>
                <th className="px-6 py-4">Estación & Consumo</th>
                <th className="px-6 py-4">Estado Financiero & Reclamos</th>
                <th className="px-6 py-4 text-right">Facturación / Costo ANDE</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
              {paginatedTransactions.length > 0 ? (
                paginatedTransactions.map(tx => {
                  const dStatus = tx.dispute_status || 'none';
                  const hasOcppFault = tx.error_code && tx.error_code !== 'NoError';
                  const billed = Number(tx.total_amount_pyg || 0);
                  const refunded = dStatus === 'refunded' ? Number(tx.refund_amount_pyg || 0) : 0;
                  const netAmount = Math.max(0, billed - refunded);

                  return (
                    <tr
                      key={tx.id}
                      className={`transition ${
                        dStatus === 'pending'
                          ? 'bg-red-50/30 dark:bg-red-950/15 hover:bg-red-50/50 dark:hover:bg-red-950/25'
                          : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-[13px] text-sipar-dark dark:text-white">#TRX-{tx.id}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-[13px] font-bold text-sipar-dark dark:text-white">{tx.user_name}</p>
                        <p className="text-[11px] text-gray-400">{tx.user_email}</p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-[13px] text-gray-700 dark:text-gray-200 font-bold flex items-center gap-1.5">
                          <BatteryCharging className="w-3.5 h-3.5 text-sipar-orange" /> {tx.charger_serial}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          ⚡ {tx.kwh_delivered} kWh • ⏱ {formatSeconds(tx.duration_seconds)} • {tx.payment_method || 'Cartera Digital'}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {dStatus === 'pending' ? (
                            <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-red-200 dark:border-red-800">
                              <AlertCircle className="w-3.5 h-3.5" /> Reclamo / Reversión Pendiente
                            </span>
                          ) : dStatus === 'refunded' ? (
                            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-amber-200 dark:border-amber-800">
                              <CornerDownLeft className="w-3.5 h-3.5" /> Revertido (-{formatPYG(refunded)})
                            </span>
                          ) : dStatus === 'rejected' ? (
                            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border border-gray-200 dark:border-gray-700">
                              <Ban className="w-3.5 h-3.5" /> Reclamo Rechazado
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border ${
                              tx.status === 'concluida' 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' 
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 animate-pulse'
                            }`}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> {tx.status === 'concluida' ? 'Cobro Aprobado' : 'En Curso'}
                            </span>
                          )}

                          {hasOcppFault && (
                            <span className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Alerta OCPP: {tx.error_code}
                            </span>
                          )}
                          {tx.dispute_reason && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate max-w-[230px]" title={tx.dispute_reason}>
                              "{tx.dispute_reason}"
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {dStatus === 'refunded' && refunded > 0 ? (
                          <>
                            <p className="text-xs text-gray-400 line-through">{formatPYG(billed)}</p>
                            <p className="font-extrabold text-amber-500 text-sm">+ {formatPYG(netAmount)}</p>
                          </>
                        ) : (
                          <p className="font-extrabold text-green-600 dark:text-green-400 text-sm">
                            + {formatPYG(billed)}
                          </p>
                        )}
                        <p className="text-[10px] text-blue-500 font-semibold mt-0.5">
                          ANDE: {formatPYG(tx.ande_energy_cost_pyg)}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          {dStatus === 'pending' ? (
                            <button
                              onClick={() => openResolveModal(tx)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" /> Resolver Reclamo
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => openCreateDisputeModal(tx)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold hover:border-amber-500 hover:text-amber-500 transition"
                                title="Registrar Reclamo o Solicitud de Reversión"
                              >
                                <MessageSquareWarning className="w-3.5 h-3.5" /> {dStatus === 'none' ? 'Reclamo / Revertir' : 'Reabrir'}
                              </button>
                              {dStatus !== 'none' && (
                                <button
                                  onClick={() => openResolveModal(tx)}
                                  className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-orange rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                                  title="Editar Resolución Financiera"
                                >
                                  <ShieldAlert className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}

                          <button
                            onClick={() => { setSelectedTx(tx); setIsReceiptModalOpen(true); }}
                            className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 rounded-lg hover:text-sipar-dark dark:hover:text-white transition"
                            title="Ver Comprobante / Recibo"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-sm text-gray-400">
                    No se encontraron transacciones financieras con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA: CONTROLES DE PAGINACIÓN */}
        {filteredTransactions.length > 0 && (
          <div className="px-6 py-4 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <span>
                Mostrando <strong className="text-sipar-dark dark:text-white">{startIndex + 1}</strong> a{' '}
                <strong className="text-sipar-dark dark:text-white">{Math.min(endIndex, filteredTransactions.length)}</strong> de{' '}
                <strong className="text-sipar-dark dark:text-white">{filteredTransactions.length}</strong> operaciones
              </span>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <div className="flex items-center gap-1.5">
                <span>Filas por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sipar-dark dark:text-white font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1)
                .reduce((acc, page, idx, arr) => {
                  if (idx > 0 && page - arr[idx - 1] > 1) acc.push('...');
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item)}
                      className={`w-8 h-8 rounded-lg font-bold transition ${
                        safeCurrentPage === item
                          ? 'bg-sipar-orange text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sipar-dark dark:text-gray-200 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL 1: ABRIR RECLAMO / SOLICITUD DE REVERSIÓN ================= */}
      {isOpenDisputeModalOpen && selectedTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
              <h3 className="text-base font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                <MessageSquareWarning className="w-5 h-5 text-sipar-orange" /> Registrar Reclamo / Solicitud de Reversión
              </h3>
              <button onClick={() => setIsOpenDisputeModalOpen(false)} className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateDisputeSubmit} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Operación:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">#TRX-{selectedTx.id} ({selectedTx.charger_serial})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cliente:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.user_name} ({selectedTx.user_email})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Monto Cobrado / Energía:</span>
                  <span className="font-bold text-green-600 dark:text-green-400">{formatPYG(selectedTx.total_amount_pyg)} ({selectedTx.kwh_delivered} kWh)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Diagnóstico OCPP:</span>
                  <span className="font-mono font-bold text-sipar-orange">{selectedTx.error_code || 'NoError'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Motivo reportado por el usuario (App Móvil / Soporte)
                </label>
                <textarea
                  rows={3}
                  required
                  value={newDisputeReason}
                  onChange={(e) => setNewDisputeReason(e.target.value)}
                  placeholder="Ej. El cliente reporta desde la App que la carga se interrumpió por baja tensión y solicita reversión del saldo..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-sipar-orange outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsOpenDisputeModalOpen(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-sipar-orange hover:bg-orange-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Marcar en Disputa / Revisión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: RESOLVER RECLAMO / AUTORIZAR REVERSIÓN (ISO 27001) ================= */}
      {isResolveModalOpen && selectedTx && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 max-h-[92vh] animate-[slideUp_0.2s_ease-out]">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-sipar-dark dark:text-white flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-500" /> Auditoría de Reclamo & Autorización de Reversión
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                  Transacción #TRX-{selectedTx.id} • Estación {selectedTx.charger_serial}
                </p>
              </div>
              <button onClick={() => setIsResolveModalOpen(false)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleResolveDisputeSubmit} className="p-6 overflow-y-auto hide-scroll space-y-5">
              {selectedTx.dispute_reason && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl p-4">
                  <p className="text-xs text-red-800 dark:text-red-300 font-bold mb-1">
                    Motivo del Reclamo ({selectedTx.user_name}):
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 italic">"{selectedTx.dispute_reason}"</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Datos del Cobro</h3>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between border-b border-gray-200/60 dark:border-gray-800 pb-1.5">
                      <span className="text-gray-500">Monto Cobrado:</span>
                      <span className="font-extrabold text-green-600 dark:text-green-400">{formatPYG(selectedTx.total_amount_pyg)}</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-200/60 dark:border-gray-800 pb-1.5">
                      <span className="text-gray-500">Tarifa Aplicada:</span>
                      <span className="font-bold text-sipar-dark dark:text-white">{formatPYG(selectedTx.tariff_price_kwh)} / kWh</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-gray-500">Medio de Pago:</span>
                      <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.payment_method || 'Cartera Digital'}</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Evidencia Hardware (OCPP)</h3>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between border-b border-gray-200/60 dark:border-gray-800 pb-1.5">
                      <span className="text-gray-500">Energía Real Medidor:</span>
                      <span className="font-extrabold text-sipar-orange">{selectedTx.kwh_delivered} kWh</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-200/60 dark:border-gray-800 pb-1.5">
                      <span className="text-gray-500">Duración / Inactividad:</span>
                      <span className="font-bold text-sipar-dark dark:text-white">{formatSeconds(selectedTx.duration_seconds)}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-gray-500">Código Error OCPP:</span>
                      <span className={`font-bold ${selectedTx.error_code && selectedTx.error_code !== 'NoError' ? 'text-red-500' : 'text-green-500'}`}>
                        {selectedTx.error_code || 'NoError'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Decisión Financiera
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setResolutionType('refund_full')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      resolutionType === 'refund_full'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    <CornerDownLeft className="w-4 h-4" />
                    <span>Reversión Total</span>
                    <span className="text-[10px] opacity-80">({formatPYG(selectedTx.total_amount_pyg)})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolutionType('refund_partial')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      resolutionType === 'refund_partial'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-700 dark:text-amber-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Reembolso Parcial</span>
                    <span className="text-[10px] opacity-80">(Monto a definir)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolutionType('reject')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                      resolutionType === 'reject'
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    <Ban className="w-4 h-4" />
                    <span>Rechazar Reclamo</span>
                    <span className="text-[10px] opacity-80">(Mantener cobro)</span>
                  </button>
                </div>
              </div>

              {resolutionType === 'refund_partial' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                    Monto a Reembolsar al Cliente (₲)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedTx.total_amount_pyg || 10000000}
                    required
                    value={partialRefundAmount}
                    onChange={(e) => setPartialRefundAmount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sipar-orange"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  Nota de Resolución / Justificación Contable
                </label>
                <input
                  type="text"
                  required
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Ej. Aprobado reembolso a billetera digital tras verificar corte por falla en estación."
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-sipar-orange"
                />
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl p-4">
                <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Contraseña de Autorización Administrativa (ISO 27001)
                </label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña de administrador para autorizar"
                  className="w-full px-4 py-2 border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 text-sipar-dark dark:text-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsResolveModalOpen(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-sipar-orange hover:bg-orange-600 text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Autorizar y Aplicar Resolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: COMPROBANTE / RECIBO FINANCIERO ================= */}
      {isReceiptModalOpen && selectedTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white dark:bg-sipar-dark rounded-[22px] w-full max-w-md shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-[slideUp_0.2s_ease-out]">
            <div className="bg-sipar-dark px-6 py-5 text-white flex justify-between items-center border-b border-gray-800">
              <div>
                <p className="text-[10px] font-mono text-sipar-orange uppercase tracking-widest">Comprobante de Conciliación</p>
                <h3 className="text-lg font-bold mt-0.5">Recibo #TRX-{selectedTx.id}</h3>
              </div>
              <button onClick={() => setIsReceiptModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-2 pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha & Hora:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">
                    {selectedTx.start_time ? new Date(selectedTx.start_time).toLocaleString('es-PY') : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cliente / Usuario:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.user_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estación / Conector:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">{selectedTx.charger_serial} (#{selectedTx.connector_id})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Energía Entregada:</span>
                  <span className="font-bold text-sipar-orange">{selectedTx.kwh_delivered} kWh</span>
                </div>
              </div>

              <div className="space-y-2 pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex justify-between">
                  <span className="text-gray-400">Monto Bruto Facturado:</span>
                  <span className="font-bold text-sipar-dark dark:text-white">{formatPYG(selectedTx.total_amount_pyg)}</span>
                </div>
                {selectedTx.dispute_status === 'refunded' && (
                  <div className="flex justify-between text-amber-500 font-bold">
                    <span>Monto Revertido / Reembolsado:</span>
                    <span>- {formatPYG(selectedTx.refund_amount_pyg)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Costo Energía ANDE ({selectedTx.time_band_label}):</span>
                  <span className="font-bold text-blue-500">{formatPYG(selectedTx.ande_energy_cost_pyg)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800 text-sm">
                  <span className="font-bold text-sipar-dark dark:text-white">Ingreso Neto Final:</span>
                  <span className="font-extrabold text-green-600 dark:text-green-400">
                    {formatPYG(Math.max(0, Number(selectedTx.total_amount_pyg || 0) - (selectedTx.dispute_status === 'refunded' ? Number(selectedTx.refund_amount_pyg || 0) : 0)))}
                  </span>
                </div>
              </div>

              {selectedTx.dispute_resolution_note && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 space-y-1">
                  <p className="font-bold text-sipar-dark dark:text-white">Auditoría de Resolución:</p>
                  <p className="text-gray-500 dark:text-gray-400">{selectedTx.dispute_resolution_note}</p>
                  <p className="text-[10px] text-gray-400 font-mono">Autorizado por: {selectedTx.dispute_resolved_by}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-full py-2.5 bg-sipar-dark dark:bg-gray-800 text-white font-bold rounded-xl text-xs"
              >
                Cerrar Comprobante
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}