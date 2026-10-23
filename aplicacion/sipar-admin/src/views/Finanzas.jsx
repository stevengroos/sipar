import { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, Landmark, ArrowLeftRight, ArrowUpRight, AlertCircle, 
  Receipt, Search, Download, BatteryCharging, CreditCard, 
  CheckCircle2, ShieldAlert, FileWarning, Ban, CornerDownLeft, X, Loader2, Zap, Clock 
} from 'lucide-react';
import api from '../api/axios';

export default function Finanzas() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [selectedTxForDispute, setSelectedTxForDispute] = useState(null);

  const fetchFinancialData = async () => {
    try {
      const token = localStorage.getItem('sipar_token');
      const response = await api.get('/api/v1/transactions/?limit=500', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTransactions(response.data);
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
  }, []);

  // Cálculos de KPIs Financieros Reales de la Red
  const financialMetrics = useMemo(() => {
    let grossRevenue = 0;
    let totalAndeCost = 0;
    let totalKwh = 0;
    let completedCount = 0;

    transactions.forEach(tx => {
      grossRevenue += Number(tx.total_amount_pyg || 0);
      totalAndeCost += Number(tx.ande_energy_cost_pyg || 0);
      totalKwh += Number(tx.kwh_delivered || 0);
      if (tx.status === 'concluida') completedCount += 1;
    });

    const netMargin = grossRevenue - totalAndeCost;

    return {
      grossRevenue: Math.round(grossRevenue),
      totalAndeCost: Math.round(totalAndeCost),
      netMargin: Math.round(netMargin),
      totalKwh: Number(totalKwh.toFixed(2)),
      completedCount
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;
    const lower = searchTerm.toLowerCase();
    return transactions.filter(tx =>
      tx.id.toString().includes(lower) ||
      tx.user_name.toLowerCase().includes(lower) ||
      tx.charger_serial.toLowerCase().includes(lower) ||
      tx.payment_method.toLowerCase().includes(lower)
    );
  }, [transactions, searchTerm]);

  const formatPYG = (val) => {
    const num = Number(val || 0);
    return `${num.toLocaleString('es-PY')} ₲`;
  };

  const exportFinancialCSV = () => {
    if (transactions.length === 0) return;
    const headers = ["ID Transaccion", "Fecha/Hora", "Usuario", "Estacion", "kWh Entregados", "Costo ANDE (Gs)", "Total Cobrado (Gs)", "Medio de Pago", "Estado"];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = transactions.map(tx => [
      `#TRX-${tx.id}`,
      tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY') : 'N/A',
      tx.user_name,
      tx.charger_serial,
      Number(tx.kwh_delivered || 0).toFixed(2),
      Math.round(Number(tx.ande_energy_cost_pyg || 0)),
      Math.round(Number(tx.total_amount_pyg || 0)),
      tx.payment_method || 'Cartera Digital',
      tx.status
    ].map(escapeCsv).join(','));

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Libro_Mayor_Financiero_SIPAR.csv`);
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

  return (
    <div className="block animate-[fadeIn_0.2s_ease-out] relative">
      
      {/* ================= KPIs FINANCIEROS REALES ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* KPI 1: Facturación Bruta (Ingresos Recargas) */}
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Facturación Bruta (Red)</p>
            <p className="text-[26px] font-bold text-sipar-dark dark:text-white tracking-tight">
              {formatPYG(financialMetrics.grossRevenue)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-2">
              {financialMetrics.completedCount} sesiones cobradas ({financialMetrics.totalKwh} kWh)
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex justify-center items-center text-blue-500 border border-blue-100 dark:border-blue-800/40">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
        
        {/* KPI 2: Costo de Energía ANDE Total (Liquidación Propietarios) */}
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Costo Total Energía (ANDE)</p>
            <p className="text-[26px] font-bold text-sipar-dark dark:text-white tracking-tight">
              {formatPYG(financialMetrics.totalAndeCost)}
            </p>
            <p className="text-[11px] text-green-500 font-bold mt-2 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Reembolso a propietarios
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-xl flex justify-center items-center text-green-500 border border-green-100 dark:border-green-800/40">
            <Landmark className="w-6 h-6" />
          </div>
        </div>
        
        {/* KPI 3: Margen Neto SIPAR */}
        <div className="bg-white dark:bg-sipar-dark rounded-[20px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-orange-200 dark:border-orange-900/40 flex items-center justify-between transition-colors">
          <div>
            <p className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Margen Neto (SIPAR)</p>
            <p className="text-[26px] font-bold text-sipar-orange tracking-tight">
              {formatPYG(financialMetrics.netMargin)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mt-2 flex items-center gap-1">
              <Zap className="w-3 h-3 text-sipar-orange" /> Ganancia neta operativa
            </p>
          </div>
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex justify-center items-center text-sipar-orange border border-orange-100 dark:border-orange-800/40">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* ================= LIBRO MAYOR / TRANSACCIONES REALES ================= */}
      <div className="w-full bg-white dark:bg-sipar-dark rounded-[20px] shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col transition-colors">
        <div className="bg-sipar-dark px-6 py-5 border-b border-gray-800 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-sipar-orange" /> Conciliación & Libro Mayor ({filteredTransactions.length})
          </h2>
          <div className="flex items-center gap-3">
            <div className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 border border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar por usuario o estación..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none text-sm text-white focus:outline-none placeholder-gray-500 w-52" 
              />
            </div>
            <button 
              onClick={exportFinancialCSV}
              className="bg-white dark:bg-gray-800 text-sipar-dark dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition border border-transparent dark:border-gray-700"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>
        
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Transacción & Fecha</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Usuario</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Estación & Energía</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Estado</th>
                <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider text-right">Monto Cobrado (₲)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="px-6 py-4">
                      <p className="font-bold text-[13px] text-sipar-dark dark:text-white">#TRX-{tx.id}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                        {tx.start_time ? new Date(tx.start_time).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-semibold text-sipar-dark dark:text-white">{tx.user_name}</p>
                      <p className="text-[11px] text-gray-400">{tx.user_email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[13px] text-gray-600 dark:text-gray-300 font-bold flex items-center gap-1.5">
                        <BatteryCharging className="w-3.5 h-3.5 text-sipar-orange" /> {tx.charger_serial}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {tx.kwh_delivered} kWh • {tx.payment_method || 'Cartera Digital'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center w-max gap-1.5 border ${
                        tx.status === 'concluida' 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' 
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 animate-pulse'
                      }`}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> {tx.status === 'concluida' ? 'Aprobado' : 'En Curso'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-extrabold text-green-600 dark:text-green-400 text-sm">
                        + {Number(tx.total_amount_pyg || 0).toLocaleString('es-PY')} ₲
                      </p>
                      <p className="text-[10px] text-blue-500 font-semibold mt-0.5">
                        ANDE: {Number(tx.ande_energy_cost_pyg || 0).toLocaleString('es-PY')} ₲
                      </p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-sm text-gray-400">
                    No se encontraron transacciones financieras registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}