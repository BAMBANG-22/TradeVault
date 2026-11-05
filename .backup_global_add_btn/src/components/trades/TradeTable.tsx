import React, { useState, useMemo } from 'react';
import {
  Trade,
  TradeFilter,
  TradeLifecycleStatus,
  TradeCloseType,
} from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  computeRealizedRMultiple,
  formatCurrency,
  formatRMultiple,
  normalizeTradeDateTimeLocal,
} from '../../utils/calculations';
import {
  computeLifecycleSummaryCounts,
  getTradeLifecycleStatus,
  groupTradesByDate,
  resolveTradeLifecycle,
  transitionPlannedTradeToOpen,
  transitionPlannedTradeToCancelled,
  transitionOpenTradeToClosed,
} from '../../utils/tradeLifecycle';
import { calculateLotBasedOrderMetrics } from '../../utils/riskCalculator';
import {
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Image,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Cloud,
  AlertTriangle,
  Menu,
  HardDrive,
  CheckCircle2,
  XCircle,
  Lock,
  X,
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
  onUpdateTradeLifecycle?: (
    updatedTrade: Trade,
    originalId?: string
  ) => Promise<{ success: boolean; error?: string } | void>;
  onOpenMobileMenu?: () => void;
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
  onUpdateTradeLifecycle,
  onOpenMobileMenu,
  currentUser,
  dataSource = 'local',
  isCloudSyncing = false,
  onReloadFromCloud,
}) => {
  const [filters, setFilters] = useState<TradeFilter>({
    search: '',
    lifecycleStatus: 'ALL',
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
  const [pageSize, setPageSize] = useState<number>(25);

  // Lifecycle transition dialog state
  const [plannedModalTrade, setPlannedModalTrade] = useState<Trade | null>(null);
  const [plannedActionMode, setPlannedActionMode] = useState<'OPEN' | 'CANCEL'>('OPEN');
  const [mt5Confirmed, setMt5Confirmed] = useState<boolean>(true);
  const [actualEntryInput, setActualEntryInput] = useState<string>('');
  const [actualLotInput, setActualLotInput] = useState<string>('');
  const [openDateInput, setOpenDateInput] = useState<string>('');
  const [openTimeInput, setOpenTimeInput] = useState<string>('');
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [isTransitionSubmitting, setIsTransitionSubmitting] = useState<boolean>(false);

  const [closeModalTrade, setCloseModalTrade] = useState<Trade | null>(null);
  const [closeTypeInput, setCloseTypeInput] = useState<TradeCloseType>('TP');
  const [actualExitInput, setActualExitInput] = useState<string>('');
  const [closeDateInput, setCloseDateInput] = useState<string>('');
  const [closeTimeInput, setCloseTimeInput] = useState<string>('');
  const [closeCommInput, setCloseCommInput] = useState<string>('0');
  const [closeSwapInput, setCloseSwapInput] = useState<string>('0');
  const [closeNetOverrideInput, setCloseNetOverrideInput] = useState<string>('');

  // Summary counts for the 4 lifecycle categories
  const summaryCounts = useMemo(() => computeLifecycleSummaryCounts(trades), [trades]);

  // Unique filter values
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

  const hasDemoTrades = useMemo(() => trades.some((t) => t.isDemo), [trades]);

  // Filtered and sorted trades (never mutates original timestamps)
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        const status = getTradeLifecycleStatus(t);

        if (
          filters.lifecycleStatus &&
          filters.lifecycleStatus !== 'ALL' &&
          status !== filters.lifecycleStatus
        ) {
          return false;
        }

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

        if (filters.outcome !== 'ALL') {
          if (status !== 'CLOSED' || t.outcome !== filters.outcome) {
            return false;
          }
        }

        if (filters.position !== 'ALL' && t.position !== filters.position) {
          return false;
        }

        if (filters.strategy !== 'ALL' && t.strategy !== filters.strategy) {
          return false;
        }

        if (filters.instrument !== 'ALL' && t.instrument.toUpperCase() !== filters.instrument) {
          return false;
        }

        if (filters.session !== 'ALL' && t.session !== filters.session) {
          return false;
        }

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
          const diff = new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
          return diff !== 0 ? diff : b.id.localeCompare(a.id);
        }
        if (filters.sortBy === 'date-asc') {
          const diff = new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
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

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  // Pagination
  const totalItems = filteredTrades.length;
  const isAll = pageSize === 0;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = isAll ? 0 : (safePage - 1) * pageSize;
  const endIndex = isAll ? totalItems : Math.min(startIndex + pageSize, totalItems);
  const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

  // Date-grouped sections
  const dateGroupedSections = useMemo(
    () => groupTradesByDate(paginatedTrades),
    [paginatedTrades]
  );

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
      lifecycleStatus: 'ALL',
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

  const toggleStatusFilter = (targetStatus: TradeLifecycleStatus) => {
    setFilters((prev) => ({
      ...prev,
      lifecycleStatus: prev.lifecycleStatus === targetStatus ? 'ALL' : targetStatus,
    }));
  };

  // Open PLANNED -> OPEN / CANCELLED dialog
  const openPlannedTransitionModal = (trade: Trade, mode: 'OPEN' | 'CANCEL' = 'OPEN') => {
    const resolved = resolveTradeLifecycle(trade);
    const nowLocal = normalizeTradeDateTimeLocal(new Date());
    setPlannedModalTrade(trade);
    setPlannedActionMode(mode);
    setMt5Confirmed(true);
    setActualEntryInput(String(resolved.plannedEntry || trade.entryPrice || ''));
    setActualLotInput(String(resolved.plannedLot || trade.lotSize || '0.01'));
    setOpenDateInput(nowLocal.slice(0, 10));
    setOpenTimeInput(nowLocal.slice(11, 16));
    setCancelReasonInput('');
    setLifecycleError(null);
  };

  // Open OPEN -> CLOSED dialog
  const openClosePositionModal = (trade: Trade) => {
    const nowLocal = normalizeTradeDateTimeLocal(new Date());
    setCloseModalTrade(trade);
    const defaultCloseType: TradeCloseType =
      trade.takeProfit && trade.takeProfit > 0
        ? 'TP'
        : trade.stopLoss && trade.stopLoss > 0
        ? 'SL'
        : 'Manual';
    setCloseTypeInput(defaultCloseType);
    const defaultExit =
      defaultCloseType === 'TP' && trade.takeProfit
        ? String(trade.takeProfit)
        : defaultCloseType === 'SL' && trade.stopLoss
        ? String(trade.stopLoss)
        : trade.exitPrice
        ? String(trade.exitPrice)
        : String(trade.entryPrice || '');
    setActualExitInput(defaultExit);
    setCloseDateInput(nowLocal.slice(0, 10));
    setCloseTimeInput(nowLocal.slice(11, 16));
    setCloseCommInput(String(trade.commission || 0));
    setCloseSwapInput(String(trade.swap || 0));
    setCloseNetOverrideInput('');
    setLifecycleError(null);
  };

  const handleCloseTypeSelect = (nextType: TradeCloseType) => {
    setCloseTypeInput(nextType);
    if (!closeModalTrade) return;
    if (nextType === 'TP' && closeModalTrade.takeProfit && closeModalTrade.takeProfit > 0) {
      setActualExitInput(String(closeModalTrade.takeProfit));
      setCloseNetOverrideInput('');
    } else if (nextType === 'SL' && closeModalTrade.stopLoss && closeModalTrade.stopLoss > 0) {
      setActualExitInput(String(closeModalTrade.stopLoss));
      setCloseNetOverrideInput('');
    }
  };

  const handleConfirmPlannedTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plannedModalTrade || !onUpdateTradeLifecycle || isTransitionSubmitting) return;
    setLifecycleError(null);

    try {
      let updatedTrade: Trade;
      if (plannedActionMode === 'OPEN') {
        if (!mt5Confirmed) {
          setLifecycleError('Harap centang konfirmasi bahwa order telah tereksekusi di MT5.');
          return;
        }
        const entryNum = parseFloat(actualEntryInput);
        const lotNum = parseFloat(actualLotInput);
        if (isNaN(entryNum) || entryNum <= 0) {
          setLifecycleError('Harga Actual Entry wajib diisi dengan angka positif.');
          return;
        }
        if (isNaN(lotNum) || lotNum <= 0) {
          setLifecycleError('Actual Lot wajib diisi dengan angka lebih dari 0.');
          return;
        }
        const combinedEntryTime =
          openDateInput && openTimeInput
            ? `${openDateInput}T${openTimeInput}`
            : new Date().toISOString();

        updatedTrade = transitionPlannedTradeToOpen(plannedModalTrade, {
          actualEntryPrice: entryNum,
          actualLotSize: lotNum,
          entryTime: combinedEntryTime,
          settings,
        });
      } else {
        updatedTrade = transitionPlannedTradeToCancelled(
          plannedModalTrade,
          cancelReasonInput
        );
      }

      setIsTransitionSubmitting(true);
      const res = await onUpdateTradeLifecycle(updatedTrade, plannedModalTrade.id);
      if (!res || res.success !== false) {
        setPlannedModalTrade(null);
      } else {
        setLifecycleError(res.error || 'Gagal memperbarui status transaksi.');
      }
    } catch (err: any) {
      setLifecycleError(err?.message || 'Gagal memproses perubahan status.');
    } finally {
      setIsTransitionSubmitting(false);
    }
  };

  const handleConfirmClosePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeModalTrade || !onUpdateTradeLifecycle || isTransitionSubmitting) return;
    setLifecycleError(null);

    try {
      const exitNum = parseFloat(actualExitInput);
      if (isNaN(exitNum) || exitNum <= 0) {
        setLifecycleError('Harga Actual Exit wajib diisi dengan angka positif.');
        return;
      }
      const combinedExitTime =
        closeDateInput && closeTimeInput
          ? `${closeDateInput}T${closeTimeInput}`
          : new Date().toISOString();
      const commNum = Math.abs(parseFloat(closeCommInput) || 0);
      const swapNum = parseFloat(closeSwapInput) || 0;
      const overrideNet =
        closeNetOverrideInput.trim() !== '' ? parseFloat(closeNetOverrideInput) : undefined;

      const updatedTrade = transitionOpenTradeToClosed(closeModalTrade, {
        closeType: closeTypeInput,
        actualExitPrice: exitNum,
        exitTime: combinedExitTime,
        commission: commNum,
        swap: swapNum,
        overrideNetProfit: overrideNet !== undefined && !isNaN(overrideNet) ? overrideNet : undefined,
        settings,
      });

      setIsTransitionSubmitting(true);
      const res = await onUpdateTradeLifecycle(updatedTrade, closeModalTrade.id);
      if (!res || res.success !== false) {
        setCloseModalTrade(null);
      } else {
        setLifecycleError(res.error || 'Gagal menutup posisi transaksi.');
      }
    } catch (err: any) {
      setLifecycleError(err?.message || 'Gagal menutup posisi.');
    } finally {
      setIsTransitionSubmitting(false);
    }
  };

  // Live preview of P/L inside Close Position modal
  const closePreviewMetrics = useMemo(() => {
    if (!closeModalTrade) return null;
    const exitNum = parseFloat(actualExitInput);
    if (isNaN(exitNum) || exitNum <= 0) return null;
    const resolved = resolveTradeLifecycle(closeModalTrade);
    const activeEntry = resolved.actualEntry || closeModalTrade.entryPrice;
    const activeLot = resolved.actualLot || closeModalTrade.lotSize;
    const metrics = calculateLotBasedOrderMetrics(
      {
        symbol: closeModalTrade.instrument,
        position: closeModalTrade.position,
        lotSize: activeLot,
        entryPrice: activeEntry,
        stopLossPrice: closeModalTrade.stopLoss,
        takeProfitPrice: closeModalTrade.takeProfit,
        exitPrice: exitNum,
        capitalBasis: settings.startingBalance,
      },
      settings
    );
    const comm = Math.abs(parseFloat(closeCommInput) || 0);
    const swp = parseFloat(closeSwapInput) || 0;
    const gross = metrics.estimatedExitGrossProfit ?? 0;
    const net = Number((gross - comm + swp).toFixed(2));
    return { gross, net };
  }, [closeModalTrade, actualExitInput, closeCommInput, closeSwapInput, settings]);

  return (
    <div className="space-y-4 font-sans" data-testid="trade-log-view">
      {/* 1. HEADER: Title, Subtitle & Clean Cloud Sync Status Icon */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
            Trade Log
          </h1>
          <p className="text-xs text-[#697586] dark:text-[#929BA9]">
            Kelola seluruh aktivitas trading
          </p>
        </div>

        {/* Clean Sync Status Icon (Tooltip only, no heavy text) */}
        <div className="flex items-center gap-2">
          {currentUser ? (
            dataSource === 'cloud' ? (
              <div
                data-testid="trade-log-sync-indicator"
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-emerald-600 dark:text-emerald-400"
                title={isCloudSyncing ? 'Menyinkronkan dengan Cloud...' : 'Cloud Synced — Data tersimpan aman di Supabase'}
              >
                <Cloud
                  className={`h-4 w-4 stroke-[1.75] ${isCloudSyncing ? 'animate-spin' : ''}`}
                />
              </div>
            ) : (
              <div
                data-testid="trade-log-sync-indicator"
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-rose-500 dark:text-rose-400"
                title="Cache Offline — Gagal tersambung ke cloud, menggunakan data lokal"
              >
                <AlertTriangle className="h-4 w-4 stroke-[1.75]" />
              </div>
            )
          ) : (
            <div
              data-testid="trade-log-sync-indicator"
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]"
              title={`Penyimpanan Lokal (${trades.length} transaksi)`}
            >
              <HardDrive className="h-4 w-4 stroke-[1.75]" />
            </div>
          )}
        </div>
      </div>

      {/* Demo Data Notice Banner */}
      {hasDemoTrades && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] gap-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-bold bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] text-[10px]">
              DATA DEMO AKTIF
            </span>
            <span className="text-[#697586] dark:text-[#929BA9]">
              Jurnal saat ini memuat data contoh transaksi XAUUSD untuk demonstrasi analitik.
            </span>
          </div>
          <button
            type="button"
            onClick={onClearDemoTrades}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold text-xs transition-colors shrink-0 cursor-pointer"
          >
            Hapus Data Demo
          </button>
        </div>
      )}

      {/* 2. RINGKASAN TRANSAKSI (SINGLE UNIFIED PANEL) */}
      <div
        data-testid="trade-log-summary-panel"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4"
      >
        {/* Top: Total Transaksi */}
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
              TOTAL TRANSAKSI
            </span>
            <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
              {summaryCounts.total}
            </div>
          </div>
          {filters.lifecycleStatus !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, lifecycleStatus: 'ALL' }))}
              className="text-xs font-semibold text-[#1769E8] hover:underline cursor-pointer"
            >
              Tampilkan Semua ({summaryCounts.total})
            </button>
          )}
        </div>

        {/* Thin Divider */}
        <div className="border-t border-[#DDE3EA] dark:border-[#252B34]" />

        {/* Bottom: 4 Statuses in one horizontal row */}
        <div
          data-testid="trade-log-summary-grid"
          className="grid grid-cols-4 divide-x divide-[#DDE3EA] dark:divide-[#252B34] text-center"
        >
          {(
            [
              { key: 'PLANNED' as const, label: 'Planned', count: summaryCounts.planned },
              { key: 'OPEN' as const, label: 'Open', count: summaryCounts.open },
              { key: 'CLOSED' as const, label: 'Closed', count: summaryCounts.closed },
              { key: 'CANCELLED' as const, label: 'Cancelled', count: summaryCounts.cancelled },
            ] as const
          ).map((item) => {
            const isSelected = filters.lifecycleStatus === item.key;
            const formattedCount = String(item.count).padStart(2, '0');
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleStatusFilter(item.key)}
                data-testid={`summary-card-${item.key.toLowerCase()}`}
                className={`px-2 py-1.5 transition-colors cursor-pointer rounded-lg mx-0.5 ${
                  isSelected
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8]'
                    : 'hover:bg-[#F5F7FA] dark:hover:bg-[#171D26]'
                }`}
              >
                <span
                  className={`block text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                    isSelected
                      ? 'text-[#1769E8]'
                      : 'text-[#697586] dark:text-[#929BA9]'
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`mt-0.5 block text-base sm:text-xl font-bold font-mono-numbers tabular-nums ${
                    isSelected
                      ? 'text-[#1769E8]'
                      : 'text-[#151D2A] dark:text-[#F2F5F9]'
                  }`}
                >
                  {formattedCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SEARCH & ICON-ONLY FILTER TOOLBAR (Add Trade button moved to bottom) */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3 sm:p-3.5 space-y-3">
        <div className="flex items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <input
              type="text"
              placeholder="Cari transaksi..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
            />
          </div>

          {/* Filter Button: Icon Only */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            title="Filter & Urutan Transaksi"
            aria-label="Filter & Urutan Transaksi"
            className={`flex items-center justify-center h-9 w-9 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              showAdvancedFilters ||
              filters.lifecycleStatus !== 'ALL' ||
              filters.outcome !== 'ALL' ||
              filters.position !== 'ALL' ||
              filters.instrument !== 'ALL' ||
              filters.session !== 'ALL' ||
              filters.strategy !== 'ALL' ||
              Boolean(filters.startDate || filters.endDate)
                ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#1769E8]'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#151D2A] dark:text-[#F2F5F9] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50'
            }`}
          >
            <Filter className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Collapsible Filter & Sort Panel */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-3 animate-in fade-in duration-150 text-xs">
            {/* Quick Date Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-[#697586] dark:text-[#929BA9] font-medium mr-1">
                Periode Cepat:
              </span>
              <button
                type="button"
                onClick={() => applyQuickDate('ALL')}
                className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                  !filters.startDate && !filters.endDate
                    ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
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
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => applyQuickDate('MONTH')}
                className="px-2.5 py-1 rounded-md bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
              >
                Bulan Ini
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5">
              {/* Lifecycle Status Filter */}
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Status Transaksi
                </label>
                <select
                  value={filters.lifecycleStatus || 'ALL'}
                  onChange={(e) =>
                    setFilters({ ...filters, lifecycleStatus: e.target.value as any })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="PLANNED">PLANNED</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              {/* Outcome Filter */}
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Hasil Closed
                </label>
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
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Arah (Buy/Sell)
                </label>
                <select
                  value={filters.position}
                  onChange={(e) => setFilters({ ...filters, position: e.target.value as any })}
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                >
                  <option value="ALL">Semua Arah</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              {/* Instrument Filter */}
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Simbol
                </label>
                <select
                  value={filters.instrument}
                  onChange={(e) => setFilters({ ...filters, instrument: e.target.value })}
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                >
                  <option value="ALL">Semua Simbol</option>
                  {uniqueInstruments.map((inst) => (
                    <option key={inst} value={inst}>
                      {inst}
                    </option>
                  ))}
                </select>
              </div>

              {/* Session Filter */}
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Sesi Trading
                </label>
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
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Setup / Strategi
                </label>
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
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Urutan
                </label>
                <div className="flex items-center gap-1">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                    className="flex-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none text-[11px]"
                  >
                    <option value="date-desc">Terbaru</option>
                    <option value="date-asc">Terlama</option>
                    <option value="profit-desc">P/L Tertinggi</option>
                    <option value="profit-asc">P/L Terendah</option>
                    <option value="lot-desc">Lot Terbesar</option>
                  </select>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
                    title="Reset Filter"
                    aria-label="Reset semua filter"
                  >
                    <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. DAFTAR TRANSAKSI BERKELOMPOK TANGGAL (TODAY, YESTERDAY, DD MMM YYYY) */}
      {paginatedTrades.length === 0 ? (
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-8 text-center text-xs text-[#697586] dark:text-[#929BA9] space-y-3">
          <p className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
            {trades.length === 0
              ? 'Belum Ada Transaksi Tercatat'
              : 'Tidak Ada Transaksi yang Sesuai Filter'}
          </p>
          <p className="text-[11px] max-w-sm mx-auto">
            {trades.length === 0
              ? 'Tambahkan rencana trade atau catat transaksi Anda melalui tombol Add Trade.'
              : 'Ubah kata kunci pencarian atau reset filter untuk melihat seluruh transaksi.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {trades.length === 0 ? (
              <button
                type="button"
                onClick={onAddTrade}
                className="px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs cursor-pointer"
              >
                + Add Trade
              </button>
            ) : (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold text-xs cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="trade-log-date-groups">
          {dateGroupedSections.map((section) => (
            <div
              key={section.dateKey}
              className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden"
            >
              {/* Date Group Header */}
              <div className="px-4 py-2 bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                  {section.headerLabel}
                </span>
                <span className="text-[10px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                  {section.trades.length} Transaksi
                </span>
              </div>

              {/* Rows in this Date Group */}
              <div className="divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
                {section.trades.map((t) => {
                  const status = getTradeLifecycleStatus(t);
                  const resolved = resolveTradeLifecycle(t);
                  const timePart = (t.dateTime || '').slice(11, 16) || '00:00';
                  const displayLot =
                    status === 'OPEN' || status === 'CLOSED'
                      ? resolved.actualLot ?? t.lotSize
                      : resolved.plannedLot ?? t.lotSize;
                  const isProfit = t.netProfit >= 0.01;
                  const isLoss = t.netProfit <= -0.01;
                  const realizedR = status === 'CLOSED' ? computeRealizedRMultiple(t) : null;

                  return (
                    <div
                      key={t.id}
                      onClick={() => onViewDetail(t)}
                      data-testid={`trade-row-${t.id}`}
                      className="px-4 py-3.5 hover:bg-[#EEF2F6]/60 dark:hover:bg-[#171D26] transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      {/* Left: Symbol, BUY/SELL (separate from status), Lot, Time */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                            {t.instrument}
                          </span>
                          <span
                            className={`text-xs font-bold uppercase ${
                              t.position === 'BUY'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {t.position}
                          </span>
                          <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                            {displayLot.toFixed(2)} Lot
                          </span>
                          {t.isDemo && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] font-semibold">
                              DEMO
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums flex-wrap">
                          <span>{timePart}</span>
                          <span>•</span>
                          <span className="font-sans truncate max-w-[200px] sm:max-w-xs">
                            {t.strategy || 'Umum'}
                          </span>
                          {t.session && (
                            <>
                              <span>•</span>
                              <span className="font-sans">{t.session}</span>
                            </>
                          )}
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">
                            Entry {(resolved.actualEntry ?? resolved.plannedEntry).toFixed(2)}
                          </span>
                          {realizedR !== null && (
                            <>
                              <span className="hidden md:inline">•</span>
                              <span className="hidden md:inline font-semibold">
                                {formatRMultiple(realizedR)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Status or Realized Result + Quick Lifecycle / Row Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          {status === 'CLOSED' && (
                            <>
                              <div
                                className={`text-sm font-bold font-mono-numbers tabular-nums ${
                                  isProfit
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isLoss
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-[#151D2A] dark:text-[#F2F5F9]'
                                }`}
                              >
                                {isProfit ? '+' : ''}
                                {formatCurrency(t.netProfit, settings)}
                              </div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                                CLOSED
                              </div>
                            </>
                          )}

                          {status === 'PLANNED' && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#1769E8]">
                                PLANNED
                              </span>
                              {onUpdateTradeLifecycle && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPlannedTransitionModal(t, 'OPEN');
                                  }}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors cursor-pointer"
                                >
                                  Eksekusi / Batal
                                </button>
                              )}
                            </div>
                          )}

                          {status === 'OPEN' && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                OPEN
                              </span>
                              {onUpdateTradeLifecycle && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openClosePositionModal(t);
                                  }}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors cursor-pointer"
                                >
                                  Tutup Posisi
                                </button>
                              )}
                            </div>
                          )}

                          {status === 'CANCELLED' && (
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                                CANCELLED
                              </span>
                              <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                                Dibatalkan
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Secondary Row Actions on Desktop */}
                        <div
                          className="hidden sm:flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.screenshotUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                onViewScreenshot(
                                  t.screenshotUrl!,
                                  `${t.instrument} - ${t.strategy}`
                                )
                              }
                              className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#1769E8] hover:bg-[#F5F7FA] dark:hover:bg-[#080A0E] transition-colors cursor-pointer"
                              title="Lihat Screenshot"
                              aria-label={`Lihat screenshot ${t.id}`}
                            >
                              <Image className="h-3.5 w-3.5 stroke-[1.75]" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditTrade(t)}
                            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#080A0E] transition-colors cursor-pointer"
                            title="Edit Transaksi"
                            aria-label={`Edit transaksi ${t.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTrade(t)}
                            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[#F5F7FA] dark:hover:bg-[#080A0E] transition-colors cursor-pointer"
                            title="Hapus Transaksi"
                            aria-label={`Hapus transaksi ${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. PAGINATION & ADD TRADE FOOTER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-[#697586] dark:text-[#929BA9]">
        <div className="flex items-center gap-2">
          <span>
            Menampilkan{' '}
            <strong className="font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
              {totalItems === 0 ? 0 : startIndex + 1}-{endIndex}
            </strong>{' '}
            dari{' '}
            <strong className="font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
              {totalItems}
            </strong>
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2 py-1 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
          >
            <option value={15}>15 / hal</option>
            <option value={25}>25 / hal</option>
            <option value={50}>50 / hal</option>
            <option value={0}>Semua</option>
          </select>
        </div>

        {!isAll && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] text-[#151D2A] dark:text-[#F2F5F9] disabled:opacity-40 cursor-pointer"
              aria-label="Halaman Sebelumnya"
            >
              <ChevronLeft className="h-4 w-4 stroke-[1.75]" />
            </button>
            <span className="px-2 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] text-[#151D2A] dark:text-[#F2F5F9] disabled:opacity-40 cursor-pointer"
              aria-label="Halaman Berikutnya"
            >
              <ChevronRight className="h-4 w-4 stroke-[1.75]" />
            </button>
          </div>
        )}
      </div>

      {/* 6. TOMBOL TAMBAH TRANSAKSI DI BAGIAN BAWAH (IDENTIK DENGAN DASHBOARD CTA) */}
      <div className="pt-2 pb-1 flex justify-center">
        <button
          type="button"
          onClick={onAddTrade}
          data-testid="trade-log-add-trade-button"
          className="w-full sm:w-auto sm:min-w-[220px] flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2]" />
          <span>Tambah Transaksi</span>
        </button>
      </div>

      {/* MODAL 1: PLANNED -> OPEN / CANCELLED */}
      {plannedModalTrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => !isTransitionSubmitting && setPlannedModalTrade(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 shadow-2xl text-[#151D2A] dark:text-[#F2F5F9]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div>
                <h3 className="text-sm font-bold">
                  Status Rencana: {plannedModalTrade.instrument} ({plannedModalTrade.position})
                </h3>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  ID: {plannedModalTrade.id} • Status saat ini: PLANNED
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlannedModalTrade(null)}
                className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setPlannedActionMode('OPEN');
                  setLifecycleError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  plannedActionMode === 'OPEN'
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75]" />
                <span>Posisi Dibuka (OPEN)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlannedActionMode('CANCEL');
                  setLifecycleError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  plannedActionMode === 'CANCEL'
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                }`}
              >
                <XCircle className="h-3.5 w-3.5 stroke-[1.75]" />
                <span>Batalkan (CANCELLED)</span>
              </button>
            </div>

            {lifecycleError && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400">
                {lifecycleError}
              </div>
            )}

            <form onSubmit={handleConfirmPlannedTransition} className="mt-4 space-y-3 text-xs">
              {plannedActionMode === 'OPEN' ? (
                <>
                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mt5Confirmed}
                      onChange={(e) => setMt5Confirmed(e.target.checked)}
                      className="mt-0.5 rounded border-[#DDE3EA] dark:border-[#252B34]"
                    />
                    <span className="text-[11px] leading-relaxed">
                      Saya mengonfirmasi bahwa posisi ini benar-benar telah tereksekusi di MT5.
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Actual Entry Price
                      </label>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={actualEntryInput}
                        onChange={(e) => setActualEntryInput(e.target.value)}
                        className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums font-semibold focus:border-[#1769E8] focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Actual Lot
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        value={actualLotInput}
                        onChange={(e) => setActualLotInput(e.target.value)}
                        className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums font-semibold focus:border-[#1769E8] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Tanggal Entry
                      </label>
                      <input
                        type="date"
                        value={openDateInput}
                        onChange={(e) => setOpenDateInput(e.target.value)}
                        className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Jam Entry
                      </label>
                      <input
                        type="time"
                        value={openTimeInput}
                        onChange={(e) => setOpenTimeInput(e.target.value)}
                        className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Alasan Pembatalan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={cancelReasonInput}
                    onChange={(e) => setCancelReasonInput(e.target.value)}
                    placeholder="Contoh: Harga sudah menyentuh target sebelum mengenai limit order..."
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs focus:border-[#1769E8] focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Catatan: Transaksi CANCELLED tidak dihitung sebagai LOSS dan tidak memengaruhi Win Rate.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
                <button
                  type="button"
                  onClick={() => setPlannedModalTrade(null)}
                  disabled={isTransitionSubmitting}
                  className="px-3.5 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isTransitionSubmitting}
                  className="px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold cursor-pointer"
                >
                  {plannedActionMode === 'OPEN' ? 'Konfirmasi OPEN' : 'Batalkan Trade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OPEN -> CLOSED */}
      {closeModalTrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => !isTransitionSubmitting && setCloseModalTrade(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 shadow-2xl text-[#151D2A] dark:text-[#F2F5F9]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div>
                <h3 className="text-sm font-bold">
                  Tutup Posisi: {closeModalTrade.instrument} ({closeModalTrade.position})
                </h3>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  ID: {closeModalTrade.id} • Status saat ini: OPEN
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseModalTrade(null)}
                className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            {lifecycleError && (
              <div className="mt-3 p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400">
                {lifecycleError}
              </div>
            )}

            <form onSubmit={handleConfirmClosePosition} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Jenis Penutupan Posisi
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['TP', 'SL', 'Manual'] as const).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => handleCloseTypeSelect(ct)}
                      className={`py-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                        closeTypeInput === ct
                          ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#1769E8]'
                          : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                      }`}
                    >
                      {ct === 'TP' ? 'Take Profit' : ct === 'SL' ? 'Stop Loss' : 'Manual'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Actual Exit Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={actualExitInput}
                    onChange={(e) => setActualExitInput(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums font-semibold focus:border-[#1769E8] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Realized Net P/L ({settings.currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={
                      closeNetOverrideInput !== ''
                        ? closeNetOverrideInput
                        : closePreviewMetrics
                        ? String(closePreviewMetrics.net)
                        : ''
                    }
                    onChange={(e) => setCloseNetOverrideInput(e.target.value)}
                    placeholder="Otomatis dari Exit"
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums font-bold focus:border-[#1769E8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Tanggal Close
                  </label>
                  <input
                    type="date"
                    value={closeDateInput}
                    onChange={(e) => setCloseDateInput(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Jam Close
                  </label>
                  <input
                    type="time"
                    value={closeTimeInput}
                    onChange={(e) => setCloseTimeInput(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
                <button
                  type="button"
                  onClick={() => setCloseModalTrade(null)}
                  disabled={isTransitionSubmitting}
                  className="px-3.5 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isTransitionSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 stroke-[1.75]" />
                  <span>Konfirmasi CLOSED</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
