import React, { useState, useMemo } from 'react';
import { Trade, TradeFilter } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  computeRealizedRMultiple,
  formatCurrency,
  formatRMultiple,
} from '../../utils/calculations';
import {
  Search,
  Filter,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Image,
  Calendar,
  ChevronDown,
  FileText,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Cloud,
  AlertTriangle,
} from 'lucide-react';

interface TradeTableProps {
  trades: Trade[];
  settings: AppSettings;
  onAddTrade: () => void;
  onEditTrade: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => void;
  onViewDetail: (trade: Trade) => void;
  onViewScreenshot: (url: string, title: string) => void;
  onClearDemoTrades: () => void;
  currentUser?: any | null;
  dataSource?: 'cloud' | 'local_fallback' | 'local';
  isCloudSyncing?: boolean;
  cloudLoadError?: string | null;
  onReloadFromCloud?: () => void;
  onSyncLocalToCloud?: () => void;
}

export const TradeTable: React.FC<TradeTableProps> = ({
  trades,
  settings,
  onAddTrade,
  onEditTrade,
  onDeleteTrade,
  onViewDetail,
  onViewScreenshot,
  onClearDemoTrades,
  currentUser,
  dataSource = 'local',
  isCloudSyncing = false,
  onReloadFromCloud,
}) => {
  // Filter state
  const [filters, setFilters] = useState<TradeFilter>({
    search: '',
    outcome: 'ALL',
    position: 'ALL',
    strategy: 'ALL',
    instrument: 'ALL',
    session: 'ALL',
    startDate: '',
    endDate: '',
    sortBy: 'date-desc',
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Extract unique strategies, instruments, and sessions for filter dropdowns
  const uniqueStrategies = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => {
      if (t.strategy) set.add(t.strategy);
    });
    return Array.from(set).sort();
  }, [trades]);

  const uniqueInstruments = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => {
      if (t.instrument) set.add(t.instrument.toUpperCase());
    });
    return Array.from(set).sort();
  }, [trades]);

  const uniqueSessions = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => {
      if (t.session) set.add(t.session);
    });
    return Array.from(set).sort();
  }, [trades]);

  const hasDemoTrades = useMemo(() => {
    return trades.some((t) => t.isDemo);
  }, [trades]);

  // Filtered and sorted trades
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        // Search query
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const matchId = t.id.toLowerCase().includes(q);
          const matchStrat = t.strategy?.toLowerCase().includes(q);
          const matchNotes = t.notes?.toLowerCase().includes(q);
          const matchReason = t.entryReason?.toLowerCase().includes(q);
          const matchEval = t.postTradeEvaluation?.toLowerCase().includes(q);
          const matchPair = t.instrument?.toLowerCase().includes(q);
          const matchSession = t.session?.toLowerCase().includes(q);
          if (
            !matchId &&
            !matchStrat &&
            !matchNotes &&
            !matchReason &&
            !matchEval &&
            !matchPair &&
            !matchSession
          ) {
            return false;
          }
        }

        // Outcome filter
        if (filters.outcome !== 'ALL' && t.outcome !== filters.outcome) {
          return false;
        }

        // Position filter
        if (filters.position !== 'ALL' && t.position !== filters.position) {
          return false;
        }

        // Strategy filter
        if (filters.strategy !== 'ALL' && t.strategy !== filters.strategy) {
          return false;
        }

        // Instrument filter
        if (filters.instrument !== 'ALL' && t.instrument.toUpperCase() !== filters.instrument) {
          return false;
        }

        // Session filter
        if (filters.session !== 'ALL' && t.session !== filters.session) {
          return false;
        }

        // Date range
        if (filters.startDate) {
          if (t.dateTime.slice(0, 10) < filters.startDate) return false;
        }
        if (filters.endDate) {
          if (t.dateTime.slice(0, 10) > filters.endDate) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === 'date-desc') {
          return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
        }
        if (filters.sortBy === 'date-asc') {
          return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
        }
        if (filters.sortBy === 'profit-desc') {
          return b.netProfit - a.netProfit;
        }
        if (filters.sortBy === 'profit-asc') {
          return a.netProfit - b.netProfit;
        }
        if (filters.sortBy === 'lot-desc') {
          return b.lotSize - a.lotSize;
        }
        return 0;
      });
  }, [trades, filters]);

  // Legacy journal records contain realized outcomes, not lifecycle statuses.
  // Keep these counters outcome-based until the new status model is implemented.
  const outcomeSummary = useMemo(() => ({
    total: filteredTrades.length,
    wins: filteredTrades.filter((t) => t.outcome === 'WIN').length,
    losses: filteredTrades.filter((t) => t.outcome === 'LOSS').length,
    breakeven: filteredTrades.filter((t) => t.outcome === 'BREAKEVEN').length,
  }), [filteredTrades]);


  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  // Pagination calculation
  const totalItems = filteredTrades.length;
  const isAll = pageSize === 0;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = isAll ? 0 : (safePage - 1) * pageSize;
  const endIndex = isAll ? totalItems : Math.min(startIndex + pageSize, totalItems);
  const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

  // Quick date chips
  const applyQuickDate = (type: 'ALL' | 'TODAY' | '7D' | 'MONTH') => {
    const now = new Date();
    if (type === 'ALL') {
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }));
    } else if (type === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setFilters((prev) => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (type === '7D') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setFilters((prev) => ({
        ...prev,
        startDate: past.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      }));
    } else if (type === 'MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFilters((prev) => ({
        ...prev,
        startDate: firstDay.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      }));
    }
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      outcome: 'ALL',
      position: 'ALL',
      strategy: 'ALL',
      instrument: 'ALL',
      session: 'ALL',
      startDate: '',
      endDate: '',
      sortBy: 'date-desc',
    });
  };

  return (
    <div className="space-y-4">
      {/* Trade Log header and legacy-safe summary */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">Trade Log</h1>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1">Catatan dan riwayat transaksi trading Anda</p>
          </div>
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">{outcomeSummary.total} catatan ditemukan</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#697586] dark:text-[#929BA9]">Total Catatan</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">{outcomeSummary.total}</div>
          </div>
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#697586] dark:text-[#929BA9]">Win</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{outcomeSummary.wins}</div>
          </div>
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#697586] dark:text-[#929BA9]">Loss</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{outcomeSummary.losses}</div>
          </div>
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#697586] dark:text-[#929BA9]">Break-even</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-[#697586] dark:text-[#929BA9]">{outcomeSummary.breakeven}</div>
          </div>
        </div>
      </section>
      {/* Top Banner if demo data exists */}
      {hasDemoTrades && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-bold bg-[#F5F7FA] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] text-[10px]">
              DATA DEMO AKTIF
            </span>
            <span className="text-[#697586] dark:text-[#929BA9]">
              Catatan jurnal saat ini memuat data contoh transaksi XAUUSD untuk demonstrasi analitik.
            </span>
          </div>
          <button
            onClick={onClearDemoTrades}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold text-xs transition-colors shrink-0 cursor-pointer"
          >
            Hapus Semua Data Demo
          </button>
        </div>
      )}

      {/* Action & Filter Bar */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <input
              type="text"
              placeholder="Cari ID trade, setup strategi, instrumen, sesi, atau catatan..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-4 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
            />
          </div>

          {/* Quick buttons & Cloud Status */}
          <div className="flex items-center flex-wrap gap-2">
            {currentUser && (
              <div className="flex items-center gap-1.5">
                {dataSource === 'cloud' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium">
                    <Cloud className="h-3.5 w-3.5 stroke-[1.75] text-emerald-500" />
                    <span>Cloud ({trades.length})</span>
                    {onReloadFromCloud && (
                      <button
                        onClick={onReloadFromCloud}
                        disabled={isCloudSyncing}
                        title="Muat Ulang Transaksi dari Cloud Supabase"
                        aria-label="Muat ulang transaksi dari cloud"
                        className="ml-1 p-0.5 rounded text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RotateCcw className={`h-3 w-3 stroke-[1.75] ${isCloudSyncing ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                )}
                {dataSource === 'local_fallback' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-rose-600 dark:text-rose-400 text-xs font-medium" title="Menampilkan data cache offline milik akun ini">
                    <AlertTriangle className="h-3.5 w-3.5 stroke-[1.75] text-rose-500" />
                    <span>Cache Offline ({trades.length})</span>
                    {onReloadFromCloud && (
                      <button
                        onClick={onReloadFromCloud}
                        disabled={isCloudSyncing}
                        title="Coba Muat Ulang dari Cloud"
                        aria-label="Coba muat ulang dari cloud"
                        className="ml-1 p-0.5 rounded text-rose-600 dark:text-rose-400 hover:underline transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <RotateCcw className={`h-3 w-3 stroke-[1.75] ${isCloudSyncing ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                showAdvancedFilters
                  ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#DDE3EA] dark:border-[#252B34]'
                  : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#151D2A] dark:text-[#F2F5F9] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50'
              }`}
            >
              <Filter className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>Filter &amp; Urutkan</span>
              <ChevronDown
                className={`h-3 w-3 stroke-[1.75] transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`}
              />
            </button>

            <button
              onClick={onAddTrade}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2]" />
              <span>Tambah Trade</span>
            </button>
          </div>
        </div>

        {/* Quick Date Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-[#697586] dark:text-[#929BA9] font-medium mr-1">Filter Cepat:</span>
          <button
            type="button"
            onClick={() => applyQuickDate('ALL')}
            className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              !filters.startDate && !filters.endDate
                ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => applyQuickDate('TODAY')}
            className="px-2.5 py-1 rounded-md bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => applyQuickDate('7D')}
            className="px-2.5 py-1 rounded-md bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => applyQuickDate('MONTH')}
            className="px-2.5 py-1 rounded-md bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            Bulan Ini
          </button>
        </div>

        {/* Collapsible Advanced Filter Panel */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 animate-in fade-in duration-100 text-xs">
            {/* Outcome Filter */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Hasil (Win/Loss/BE)</label>
              <select
                value={filters.outcome}
                onChange={(e) => setFilters({ ...filters, outcome: e.target.value as any })}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="ALL">Semua Hasil</option>
                <option value="WIN">WIN (Profit)</option>
                <option value="LOSS">LOSS (Rugi)</option>
                <option value="BREAKEVEN">BREAKEVEN (BE)</option>
              </select>
            </div>

            {/* Position Filter */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Posisi (Buy/Sell)</label>
              <select
                value={filters.position}
                onChange={(e) => setFilters({ ...filters, position: e.target.value as any })}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="ALL">Semua Posisi</option>
                <option value="BUY">BUY / Long</option>
                <option value="SELL">SELL / Short</option>
              </select>
            </div>

            {/* Instrument Filter */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Instrumen</label>
              <select
                value={filters.instrument}
                onChange={(e) => setFilters({ ...filters, instrument: e.target.value })}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="ALL">Semua Instrumen</option>
                {uniqueInstruments.map((inst) => (
                  <option key={inst} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>
            </div>

            {/* Session Filter */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Sesi Trading</label>
              <select
                value={filters.session}
                onChange={(e) => setFilters({ ...filters, session: e.target.value })}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="ALL">Semua Sesi</option>
                {uniqueSessions.map((sess) => (
                  <option key={sess} value={sess}>
                    {sess}
                  </option>
                ))}
              </select>
            </div>

            {/* Setup Strategy Filter */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Setup / Strategi</label>
              <select
                value={filters.strategy}
                onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="ALL">Semua Setup</option>
                {uniqueStrategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Sorting */}
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Urutan Data</label>
              <div className="flex items-center gap-1">
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                  className="flex-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none text-[11px]"
                >
                  <option value="date-desc">Tanggal Terbaru</option>
                  <option value="date-asc">Tanggal Terlama</option>
                  <option value="profit-desc">Net P/L Tertinggi</option>
                  <option value="profit-asc">Net P/L Terendah</option>
                  <option value="lot-desc">Lot Terbesar</option>
                </select>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
                  title="Reset Semua Filter"
                  aria-label="Reset semua filter"
                >
                  <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trades Counter, Page Size & Pagination Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#697586] dark:text-[#929BA9] px-1 gap-2">
        <div>
          Menampilkan{' '}
          <strong className="text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums">
            {totalItems === 0 ? 0 : startIndex + 1} - {endIndex}
          </strong>{' '}
          dari <strong className="text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums">{totalItems}</strong> trade tersaring (total{' '}
          <strong className="text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums">{trades.length}</strong> tercatat)
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">Tampilkan:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2 py-1 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
          >
            <option value={15}>15 per hal</option>
            <option value={25}>25 per hal</option>
            <option value={50}>50 per hal</option>
            <option value={0}>Semua</option>
          </select>
        </div>
      </div>

      {/* Mobile Card View (Optimized for Phones / Small Screens) */}
      <div className="block lg:hidden space-y-3">
        {paginatedTrades.length === 0 ? (
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-8 text-center text-xs text-[#697586] dark:text-[#929BA9] space-y-3">
            {trades.length === 0 && currentUser && dataSource === 'cloud' ? (
              <>
                <Cloud className="w-8 h-8 stroke-[1.75] text-[#697586] dark:text-[#929BA9] mx-auto" />
                <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Belum Ada Transaksi di Database Cloud</h3>
                <p className="text-[#697586] dark:text-[#929BA9] max-w-sm mx-auto text-[11px]">
                  Akun Anda ({currentUser.email}) terhubung ke tabel <code className="text-[#1769E8]">public.trades</code>, namun belum memiliki catatan transaksi.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    onClick={onAddTrade}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs cursor-pointer"
                  >
                    + Tambah Trade Baru
                  </button>
                  {onReloadFromCloud && (
                    <button
                      onClick={onReloadFromCloud}
                      disabled={isCloudSyncing}
                      className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-medium text-xs cursor-pointer"
                    >
                      Muat Ulang
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div>Tidak ada trade yang sesuai dengan filter atau pencarian.</div>
            )}
          </div>
        ) : (
          paginatedTrades.map((t, idx) => {
            const rowNumber = startIndex + idx + 1;
            const isWin = t.outcome === 'WIN';
            const isLoss = t.outcome === 'LOSS';
            const realizedR = computeRealizedRMultiple(t);

            return (
              <div
                key={t.id}
                onClick={() => onViewDetail(t)}
                className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 space-y-3 transition-colors cursor-pointer"
              >
                {/* Header Card: Row No, ID, Posisi, Instrumen, Hasil (WIN/LOSS/BE) & Net P/L */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono-numbers tabular-nums px-1.5 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
                      #{rowNumber} • {t.id}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span
                        className={
                          t.position === 'BUY'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {t.position}
                      </span>{' '}
                      <span className="text-[#151D2A] dark:text-[#F2F5F9]">{t.instrument}</span>
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] ${
                        isWin
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isLoss
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {t.outcome}
                    </span>
                    {t.isDemo && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#F5F7FA] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] font-semibold">
                        DEMO
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono-numbers tabular-nums text-sm font-bold ${
                        isWin ? 'text-emerald-600 dark:text-emerald-400' : isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {isWin ? '+' : ''}
                      {formatCurrency(t.netProfit, settings)}
                    </div>
                    {(t.commission > 0 || t.swap !== 0) && (
                      <div className="text-[10px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                        Fee: ${(t.commission || 0).toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Strategy, Session and Date */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] break-words">
                      {t.strategy || '-'}
                    </span>
                    {t.session && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] font-medium shrink-0">
                        {t.session}
                      </span>
                    )}
                  </div>
                  <span className="font-mono-numbers tabular-nums text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1 shrink-0">
                    <Calendar className="h-3 w-3 stroke-[1.75]" />
                    {t.dateTime.slice(0, 10)} {t.dateTime.slice(11, 16)}
                  </span>
                </div>

                {/* Price Levels, Lot & RR Aktual Grid */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                  <div>
                    <span className="block text-[10px] text-[#697586] dark:text-[#929BA9]">Entry / Exit</span>
                    <span className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
                      {t.entryPrice.toFixed(2)} / {t.exitPrice !== undefined ? t.exitPrice.toFixed(2) : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#697586] dark:text-[#929BA9]">SL / TP</span>
                    <span className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
                      <span className="text-rose-600 dark:text-rose-400">{t.stopLoss ? t.stopLoss.toFixed(2) : '-'}</span>
                      {' / '}
                      <span className="text-emerald-600 dark:text-emerald-400">{t.takeProfit ? t.takeProfit.toFixed(2) : '-'}</span>
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#697586] dark:text-[#929BA9]">Lot &amp; RR Aktual</span>
                    <div className="font-semibold flex items-center gap-1 flex-wrap">
                      <span className="text-[#151D2A] dark:text-[#F2F5F9]">{t.lotSize.toFixed(2)}</span>
                      <span className="text-[#697586] dark:text-[#929BA9]">•</span>
                      {realizedR !== null ? (
                        <span
                          className={
                            realizedR > 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                              : realizedR < 0
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-[#697586] dark:text-[#929BA9]'
                          }
                        >
                          {formatRMultiple(realizedR)}
                        </span>
                      ) : (
                        <span className="text-[#697586] dark:text-[#929BA9] font-normal">N/A</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Optional Notes Preview */}
                {(t.notes || t.entryReason) && (
                  <div className="text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1.5 pt-1 truncate">
                    <FileText className="h-3.5 w-3.5 stroke-[1.75] shrink-0" />
                    <span className="truncate">{t.entryReason || t.notes}</span>
                  </div>
                )}

                {/* Touch-Friendly Action Buttons (Target >= 44x44px for Mobile) */}
                <div
                  className="flex items-center gap-2 pt-2.5 border-t border-[#DDE3EA] dark:border-[#252B34]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onViewDetail(t)}
                    className="flex-1 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] transition-colors cursor-pointer"
                    title="Lihat Detail Transaksi"
                  >
                    <Eye className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] shrink-0" />
                    <span>Detail</span>
                  </button>

                  {t.screenshotUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        onViewScreenshot(t.screenshotUrl!, `${t.instrument} - ${t.strategy}`)
                      }
                      className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] text-[#1769E8] text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] transition-colors cursor-pointer"
                      title="Lihat Screenshot Chart"
                    >
                      <Image className="h-4 w-4 stroke-[1.75] shrink-0" />
                      <span>Chart</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onEditTrade(t)}
                    className="flex-1 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] transition-colors cursor-pointer"
                    title="Edit Transaksi"
                  >
                    <Edit2 className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] shrink-0" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteTrade(t)}
                    className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] transition-colors cursor-pointer"
                    title="Hapus Transaksi"
                    aria-label={`Hapus transaksi ${t.id}`}
                  >
                    <Trash2 className="h-4 w-4 stroke-[1.75] shrink-0" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-hidden rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
            <thead className="bg-[#F5F7FA] dark:bg-[#080A0E] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] border-b border-[#DDE3EA] dark:border-[#252B34] font-semibold">
              <tr>
                <th className="py-3 px-3">No / ID</th>
                <th className="py-3 px-3">Tanggal &amp; Sesi</th>
                <th className="py-3 px-3">Instrumen &amp; Posisi</th>
                <th className="py-3 px-3">Setup / Strategi</th>
                <th className="py-3 px-3 font-mono-numbers">Entry &amp; Exit</th>
                <th className="py-3 px-3 font-mono-numbers">SL / TP</th>
                <th className="py-3 px-3 font-mono-numbers">Lot</th>
                <th className="py-3 px-3 text-center">Hasil</th>
                <th className="py-3 px-3 font-mono-numbers text-center">RR Aktual</th>
                <th className="py-3 px-3.5 font-mono-numbers text-right">Net P/L</th>
                <th className="py-3 px-3 text-center">Catatan</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers tabular-nums">
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-xs text-[#697586] dark:text-[#929BA9] font-sans">
                    {trades.length === 0 && currentUser && dataSource === 'cloud' ? (
                      <div className="max-w-md mx-auto space-y-3 py-4">
                        <Cloud className="w-10 h-10 stroke-[1.75] text-[#697586] dark:text-[#929BA9] mx-auto" />
                        <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Belum Ada Transaksi di Database Cloud</h3>
                        <p className="text-[#697586] dark:text-[#929BA9] text-xs">
                          Akun Anda (<strong className="text-[#151D2A] dark:text-[#F2F5F9]">{currentUser.email}</strong>) terhubung ke tabel <code className="text-[#1769E8] font-mono-numbers">public.trades</code>, namun belum memiliki transaksi.
                        </p>
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            onClick={onAddTrade}
                            className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs cursor-pointer"
                          >
                            + Tambah Trade Baru
                          </button>
                          {onReloadFromCloud && (
                            <button
                              onClick={onReloadFromCloud}
                              disabled={isCloudSyncing}
                              className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-medium text-xs cursor-pointer"
                            >
                              Muat Ulang dari Cloud
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>Tidak ada trade yang sesuai kriteria pencarian atau filter.</div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((t, idx) => {
                  const rowNumber = startIndex + idx + 1;
                  const isWin = t.outcome === 'WIN';
                  const isLoss = t.outcome === 'LOSS';
                  const realizedR = computeRealizedRMultiple(t);

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-[#EEF2F6]/60 dark:hover:bg-[#171D26] transition-colors group cursor-pointer"
                      onClick={() => onViewDetail(t)}
                    >
                      {/* No / ID */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-mono-numbers">#{rowNumber}</span>
                          <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers">{t.id}</span>
                          {t.isDemo && (
                            <span className="text-[9px] px-1 rounded bg-[#F5F7FA] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34]">
                              DEMO
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date & Session */}
                      <td className="py-3 px-3">
                        <div className="text-[11px] text-[#151D2A] dark:text-[#F2F5F9] font-sans">
                          {t.dateTime.slice(0, 10)} {t.dateTime.slice(11, 16)}
                        </div>
                        {t.session && (
                          <div className="text-[10px] text-[#697586] dark:text-[#929BA9] font-medium font-sans">
                            {t.session}
                          </div>
                        )}
                      </td>

                      {/* Instrument & Position */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[11px] font-bold ${
                              t.position === 'BUY'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {t.position}
                          </span>
                          <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">{t.instrument}</span>
                        </div>
                      </td>

                      {/* Setup / Strategy */}
                      <td
                        className="py-3 px-3 font-sans text-[#151D2A] dark:text-[#F2F5F9] max-w-[180px] truncate"
                        title={t.strategy}
                      >
                        {t.strategy}
                      </td>

                      {/* Entry & Exit */}
                      <td className="py-3 px-3">
                        <div className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">{t.entryPrice.toFixed(2)}</div>
                        <div className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                          Exit: {t.exitPrice !== undefined ? t.exitPrice.toFixed(2) : '-'}
                        </div>
                      </td>

                      {/* SL / TP */}
                      <td className="py-3 px-3 text-[11px]">
                        <div>
                          SL: <span className="text-rose-600 dark:text-rose-400">{t.stopLoss ? t.stopLoss.toFixed(2) : '-'}</span>
                        </div>
                        <div>
                          TP: <span className="text-emerald-600 dark:text-emerald-400">{t.takeProfit ? t.takeProfit.toFixed(2) : '-'}</span>
                        </div>
                      </td>

                      {/* Lot size */}
                      <td className="py-3 px-3 font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                        {t.lotSize.toFixed(2)}
                      </td>

                      {/* Outcome Badge */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`text-[11px] font-bold ${
                            isWin
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isLoss
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {t.outcome}
                        </span>
                      </td>

                      {/* RR Aktual */}
                      <td className="py-3 px-3 text-center font-bold text-xs">
                        {realizedR !== null ? (
                          <span
                            className={
                              realizedR > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : realizedR < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[#697586] dark:text-[#929BA9]'
                            }
                          >
                            {formatRMultiple(realizedR)}
                          </span>
                        ) : (
                          <span className="text-[#697586] dark:text-[#929BA9] font-normal">N/A</span>
                        )}
                      </td>

                      {/* Net Profit */}
                      <td className="py-3 px-3.5 text-right">
                        <div
                          className={`font-bold text-sm ${
                            isWin ? 'text-emerald-600 dark:text-emerald-400' : isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {isWin ? '+' : ''}
                          {formatCurrency(t.netProfit, settings)}
                        </div>
                        {(t.commission > 0 || t.swap !== 0) && (
                          <div className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                            Fee: ${(t.commission || 0).toFixed(1)}
                          </div>
                        )}
                      </td>

                      {/* Notes / Screenshot */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {t.screenshotUrl && (
                            <button
                              onClick={() =>
                                onViewScreenshot(t.screenshotUrl!, `${t.instrument} - ${t.strategy}`)
                              }
                              className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] hover:border-[#1769E8]"
                              title="Lihat Screenshot"
                              aria-label={`Lihat screenshot ${t.id}`}
                            >
                              <Image className="h-3.5 w-3.5 stroke-[1.75]" />
                            </button>
                          )}
                          {(t.notes || t.entryReason) && (
                            <button
                              onClick={() => onViewDetail(t)}
                              className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
                              title={t.entryReason || t.notes}
                              aria-label={`Lihat catatan ${t.id}`}
                            >
                              <FileText className="h-3.5 w-3.5 stroke-[1.75]" />
                            </button>
                          )}
                          {!t.screenshotUrl && !t.notes && !t.entryReason && (
                            <span className="text-[#697586] dark:text-[#929BA9] text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onViewDetail(t)}
                            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8] transition-colors"
                            title="Detail Transaksi"
                            aria-label={`Detail transaksi ${t.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 stroke-[1.75]" />
                          </button>
                          <button
                            onClick={() => onEditTrade(t)}
                            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8] transition-colors"
                            title="Edit Transaksi"
                            aria-label={`Edit transaksi ${t.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          </button>
                          <button
                            onClick={() => onDeleteTrade(t)}
                            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Hapus Transaksi"
                            aria-label={`Hapus transaksi ${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] text-xs">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] disabled:opacity-30 disabled:cursor-not-allowed text-[#151D2A] dark:text-[#F2F5F9] font-medium transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Sebelumnya</span>
          </button>

          <div className="flex items-center gap-1 font-mono-numbers tabular-nums">
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              if (
                totalPages > 7 &&
                pageNum !== 1 &&
                pageNum !== totalPages &&
                Math.abs(pageNum - currentPage) > 2
              ) {
                if (Math.abs(pageNum - currentPage) === 3) {
                  return (
                    <span key={pageNum} className="text-[#697586] dark:text-[#929BA9] px-1">
                      ...
                    </span>
                  );
                }
                return null;
              }

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                    currentPage === pageNum
                      ? 'bg-[#1769E8] text-white'
                      : 'bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] disabled:opacity-30 disabled:cursor-not-allowed text-[#151D2A] dark:text-[#F2F5F9] font-medium transition-colors"
          >
            <span>Selanjutnya</span>
            <ChevronRight className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </div>
      )}
    </div>
  );
};
