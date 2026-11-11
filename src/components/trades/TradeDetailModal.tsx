import React, { useState, useEffect, useMemo } from 'react';
import {
  Trade,
  TradeCloseType,
  TradeActivityEvent,
} from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  computePlannedRiskReward,
  computeRealizedRMultiple,
  formatCurrency,
  formatPlannedRR,
  formatRMultiple,
  normalizeTradeDateTimeLocal,
} from '../../utils/calculations';
import { calculateLotBasedOrderMetrics } from '../../utils/riskCalculator';
import { evaluateTradeCompliance } from '../../utils/complianceRating';
import {
  isStoragePath,
  createScreenshotSignedUrl,
} from '../../utils/supabaseSync';
import {
  resolveTradeLifecycle,
  encodeLifecycleMetaIntoExecutionNotes,
  createActivityEvent,
  transitionPlannedTradeToOpen,
  transitionPlannedTradeToCancelled,
  transitionOpenTradeToClosed,
  TradeLifecycleMeta,
} from '../../utils/tradeLifecycle';
import {
  getCachedUsdIdrRate,
  getCurrentUsdIdrSnapshot,
  useGlobalCurrency,
} from '../../utils/currencyRate';
import { resolveTradingViewSnapshotUrl } from '../../utils/tradeScreenshotScanner';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Image,
  ChevronDown,
  Loader2,
  Upload,
  ZoomIn,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
} from 'lucide-react';

interface TradeDetailModalProps {
  trade: Trade | null;
  allTrades?: Trade[];
  settings: AppSettings;
  isOpen: boolean;
  isFullPage?: boolean;
  isChildModalOpen?: boolean;
  onClose: () => void;
  onSelectTrade?: (trade: Trade) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onViewScreenshot: (url: string, title: string) => void;
  onSaveTradeUpdate?: (
    updatedTrade: Trade,
    originalId?: string
  ) => Promise<{ success: boolean; error?: string; uploadedScreenshotPath?: string } | void>;
  onOpenMobileMenu?: () => void;
}

export const TradeDetailModal: React.FC<TradeDetailModalProps> = ({
  trade,
  allTrades = [],
  settings,
  isOpen,
  isFullPage = true,
  isChildModalOpen = false,
  onClose,
  onSelectTrade,
  onEdit,
  onDelete,
  onViewScreenshot,
  onSaveTradeUpdate,
}) => {
  const { preferredCurrency, formatDynamic, formatTradeFinancial } = useGlobalCurrency();
  // 5 Collapsible Accordion States
  const [openSections, setOpenSections] = useState<{
    plan: boolean;
    execution: boolean;
    screenshots: boolean;
    evaluation: boolean;
    activity: boolean;
  }>({
    plan: true,
    execution: true,
    screenshots: true,
    evaluation: true,
    activity: true,
  });

  // Resolved image URLs for BEFORE TRADE and AFTER TRADE
  const [beforeDisplayUrl, setBeforeDisplayUrl] = useState<string | null>(null);
  const [isBeforeLoading, setIsBeforeLoading] = useState<boolean>(false);
  const [afterDisplayUrl, setAfterDisplayUrl] = useState<string | null>(null);
  const [isAfterLoading, setIsAfterLoading] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

  // Evaluation inline edit state
  const [isEditingEval, setIsEditingEval] = useState<boolean>(false);
  const [evalReflectionInput, setEvalReflectionInput] = useState<string>('');
  const [evalNotesInput, setEvalNotesInput] = useState<string>('');
  const [isSavingEval, setIsSavingEval] = useState<boolean>(false);

  // Lifecycle transition state inside Detail page
  const [activeTransitionPanel, setActiveTransitionPanel] = useState<
    null | 'OPEN' | 'CANCEL' | 'CLOSE'
  >(null);
  const [mt5Confirmed, setMt5Confirmed] = useState<boolean>(true);
  const [actualEntryInput, setActualEntryInput] = useState<string>('');
  const [actualLotInput, setActualLotInput] = useState<string>('');
  const [entryDateInput, setEntryDateInput] = useState<string>('');
  const [entryTimeInput, setEntryTimeInput] = useState<string>('');
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');

  const [closeTypeInput, setCloseTypeInput] = useState<TradeCloseType>('TP');
  const [actualExitInput, setActualExitInput] = useState<string>('');
  const [exitDateInput, setExitDateInput] = useState<string>('');
  const [exitTimeInput, setExitTimeInput] = useState<string>('');
  const [closeNetOverrideInput, setCloseNetOverrideInput] = useState<string>('');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isTransitionSaving, setIsTransitionSaving] = useState<boolean>(false);

  const resolved = useMemo(
    () => (trade ? resolveTradeLifecycle(trade) : null),
    [trade]
  );

  // Genuine Activity Timeline Items (declared unconditionally before any early returns)
  const timelineEvents = useMemo((): TradeActivityEvent[] => {
    if (!trade || !resolved) return [];
    if (resolved.activityLog.length > 0) {
      return resolved.activityLog;
    }
    const fallbackEvents: TradeActivityEvent[] = [
      {
        id: 'legacy-created',
        type: 'TRADE_CREATED',
        timestamp: trade.createdAt || trade.dateTime,
        label: 'Trade Created / Recorded',
        newValue: `${trade.instrument} ${trade.position} ${trade.lotSize.toFixed(2)} Lot @ ${trade.entryPrice.toFixed(2)}`,
      },
    ];
    if (resolved.status === 'CLOSED') {
      fallbackEvents.push({
        id: 'legacy-closed',
        type: 'POSITION_CLOSED',
        timestamp: trade.updatedAt || trade.dateTime,
        label: 'Position Closed',
        newValue: `Outcome: ${trade.outcome} • Net P/L: ${
          preferredCurrency === 'IDR'
            ? formatTradeFinancial(trade, 'netProfit', false, true)
            : formatCurrency(trade.netProfit, settings)
        }`,
      });
    }
    return fallbackEvents;
  }, [resolved, trade, settings, preferredCurrency, formatTradeFinancial]);

  useEffect(() => {
    if (!trade || !resolved) return;
    setEvalReflectionInput(trade.postTradeEvaluation || '');
    setEvalNotesInput(trade.notes || '');
    setIsEditingEval(false);
    setActiveTransitionPanel(null);
    setTransitionError(null);

    const nowLocal = normalizeTradeDateTimeLocal(new Date());
    setActualEntryInput(String(resolved.plannedEntry || trade.entryPrice || ''));
    setActualLotInput(String(resolved.plannedLot || trade.lotSize || '0.01'));
    setEntryDateInput(nowLocal.slice(0, 10));
    setEntryTimeInput(nowLocal.slice(11, 16));
    setCancelReasonInput('');

    const defaultCloseType: TradeCloseType =
      trade.takeProfit && trade.takeProfit > 0
        ? 'TP'
        : trade.stopLoss && trade.stopLoss > 0
        ? 'SL'
        : 'Manual';
    setCloseTypeInput(defaultCloseType);
    setActualExitInput(
      defaultCloseType === 'TP' && trade.takeProfit
        ? String(trade.takeProfit)
        : defaultCloseType === 'SL' && trade.stopLoss
        ? String(trade.stopLoss)
        : trade.exitPrice
        ? String(trade.exitPrice)
        : String(trade.entryPrice || '')
    );
    setExitDateInput(nowLocal.slice(0, 10));
    setExitTimeInput(nowLocal.slice(11, 16));
    setCloseNetOverrideInput('');
  }, [trade?.id, trade?.updatedAt]);

  useEffect(() => {
    if (!isOpen || isChildModalOpen || isFullPage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isChildModalOpen, isFullPage, onClose]);

  // Resolve BEFORE screenshot URL
  useEffect(() => {
    const rawBefore = resolved?.beforeScreenshotUrl || trade?.screenshotUrl || '';
    if (!isOpen || !rawBefore) {
      setBeforeDisplayUrl(null);
      setIsBeforeLoading(false);
      return;
    }

    const trimmed = rawBefore.trim();
    if (trimmed.startsWith('data:image/')) {
      setBeforeDisplayUrl(trimmed);
      setIsBeforeLoading(false);
      return;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const resolvedTv = resolveTradingViewSnapshotUrl(trimmed);
      setBeforeDisplayUrl(resolvedTv.directImageUrl || trimmed);
      setIsBeforeLoading(false);
      return;
    }

    if (isStoragePath(trimmed)) {
      let isMounted = true;
      setIsBeforeLoading(true);
      createScreenshotSignedUrl(trimmed, 3600)
        .then((url) => {
          if (!isMounted) return;
          setIsBeforeLoading(false);
          setBeforeDisplayUrl(url);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsBeforeLoading(false);
          setBeforeDisplayUrl(null);
        });
      return () => {
        isMounted = false;
      };
    }

    setBeforeDisplayUrl(trimmed);
    setIsBeforeLoading(false);
  }, [isOpen, resolved?.beforeScreenshotUrl, trade?.screenshotUrl]);

  // Resolve AFTER screenshot URL
  useEffect(() => {
    const rawAfter = resolved?.afterScreenshotUrl || '';
    if (!isOpen || !rawAfter) {
      setAfterDisplayUrl(null);
      setIsAfterLoading(false);
      return;
    }

    const trimmed = rawAfter.trim();
    if (trimmed.startsWith('data:image/')) {
      setAfterDisplayUrl(trimmed);
      setIsAfterLoading(false);
      return;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const resolvedTv = resolveTradingViewSnapshotUrl(trimmed);
      setAfterDisplayUrl(resolvedTv.directImageUrl || trimmed);
      setIsAfterLoading(false);
      return;
    }

    if (isStoragePath(trimmed)) {
      let isMounted = true;
      setIsAfterLoading(true);
      createScreenshotSignedUrl(trimmed, 3600)
        .then((url) => {
          if (!isMounted) return;
          setIsAfterLoading(false);
          setAfterDisplayUrl(url);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsAfterLoading(false);
          setAfterDisplayUrl(null);
        });
      return () => {
        isMounted = false;
      };
    }

    setAfterDisplayUrl(trimmed);
    setIsAfterLoading(false);
  }, [isOpen, resolved?.afterScreenshotUrl]);

  if (!isOpen) return null;

  if (!trade || !resolved) {
    return (
      <div
        data-testid="trade-detail-empty-state"
        className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-8 text-center space-y-3"
      >
        <h2 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
          Belum Ada Transaksi Dipilih
        </h2>
        <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-md mx-auto">
          Pilih salah satu transaksi dari halaman Trade Log untuk melihat detail rencana, eksekusi, chart screenshot, evaluasi, dan riwayat aktivitas.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.75]" />
          <span>Kembali ke Trade Log</span>
        </button>
      </div>
    );
  }

  const toggleAccordion = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Plan metrics strictly calculated from Planned values
  const planLotMetrics = calculateLotBasedOrderMetrics(
    {
      symbol: trade.instrument,
      position: trade.position,
      lotSize: resolved.plannedLot,
      entryPrice: resolved.plannedEntry,
      stopLossPrice: resolved.plannedStopLoss,
      takeProfitPrice: resolved.plannedTakeProfit,
      capitalBasis: settings.startingBalance,
    },
    settings
  );

  const plannedRR = computePlannedRiskReward(
    resolved.plannedEntry,
    resolved.plannedStopLoss,
    resolved.plannedTakeProfit,
    trade.position
  );

  const isClosed = resolved.status === 'CLOSED';
  const isPlanned = resolved.status === 'PLANNED';
  const isOpenPos = resolved.status === 'OPEN';
  const isCancelled = resolved.status === 'CANCELLED';

  const isProfit = isClosed && trade.netProfit >= 0.01;
  const isLoss = isClosed && trade.netProfit <= -0.01;
  const realizedR = isClosed ? computeRealizedRMultiple(trade) : null;
  const compliance = evaluateTradeCompliance(trade, settings);

  // Compress and persist BEFORE or AFTER screenshot (Smart WebP/JPEG ~45-90KB)
  const handleScreenshotSlotUpload = (
    slot: 'BEFORE' | 'AFTER',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onSaveTradeUpdate) return;
    if (file.size > 10 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1280;
        let width = img.width;
        let height = img.height;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height >= width && height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        let compressedDataUrl = event.target?.result as string;
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          canvas.width = 0;
          canvas.height = 0;
        }

        setIsUploadingImage(true);
        try {
          const nextMainScreenshot =
            slot === 'BEFORE' ? compressedDataUrl : trade.screenshotUrl;
          const nextBeforeMeta =
            slot === 'BEFORE'
              ? undefined
              : resolved.beforeScreenshotUrl &&
                  resolved.beforeScreenshotUrl !== nextMainScreenshot
                ? resolved.beforeScreenshotUrl
                : undefined;

          const nextMeta: TradeLifecycleMeta = {
            status: resolved.status,
            orderType: resolved.orderType,
            plannedEntry: resolved.plannedEntry,
            plannedLot: resolved.plannedLot,
            plannedStopLoss: resolved.plannedStopLoss,
            plannedTakeProfit: resolved.plannedTakeProfit,
            plannedDateTime: resolved.plannedDateTime,
            actualEntry: resolved.actualEntry,
            actualLot: resolved.actualLot,
            actualExit: resolved.actualExit,
            entryTime: resolved.entryTime,
            exitTime: resolved.exitTime,
            closeType: resolved.closeType,
            beforeScreenshotUrl: nextBeforeMeta,
            afterScreenshotUrl:
              slot === 'AFTER' ? compressedDataUrl : resolved.afterScreenshotUrl,
            cancellationReason: resolved.cancellationReason,
            cancelledAt: resolved.cancelledAt,
            activityLog: resolved.activityLog,
          };

          const updatedTrade: Trade = {
            ...trade,
            screenshotUrl: nextMainScreenshot,
            executionNotes: encodeLifecycleMetaIntoExecutionNotes(
              trade.executionNotes,
              nextMeta
            ),
            updatedAt: new Date().toISOString(),
          };
          await onSaveTradeUpdate(updatedTrade, trade.id);
        } finally {
          setIsUploadingImage(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteScreenshotSlot = async (slot: 'BEFORE' | 'AFTER') => {
    if (!onSaveTradeUpdate) return;
    setIsUploadingImage(true);
    try {
      const nextMainScreenshot = slot === 'BEFORE' ? undefined : trade.screenshotUrl;
      const nextBeforeMeta =
        slot === 'BEFORE'
          ? undefined
          : resolved.beforeScreenshotUrl && resolved.beforeScreenshotUrl !== nextMainScreenshot
            ? resolved.beforeScreenshotUrl
            : undefined;

      const nextMeta: TradeLifecycleMeta = {
        status: resolved.status,
        orderType: resolved.orderType,
        plannedEntry: resolved.plannedEntry,
        plannedLot: resolved.plannedLot,
        plannedStopLoss: resolved.plannedStopLoss,
        plannedTakeProfit: resolved.plannedTakeProfit,
        plannedDateTime: resolved.plannedDateTime,
        actualEntry: resolved.actualEntry,
        actualLot: resolved.actualLot,
        actualExit: resolved.actualExit,
        entryTime: resolved.entryTime,
        exitTime: resolved.exitTime,
        closeType: resolved.closeType,
        beforeScreenshotUrl: nextBeforeMeta,
        afterScreenshotUrl:
          slot === 'AFTER' ? undefined : resolved.afterScreenshotUrl,
        cancellationReason: resolved.cancellationReason,
        cancelledAt: resolved.cancelledAt,
        activityLog: resolved.activityLog,
      };

      const updatedTrade: Trade = {
        ...trade,
        screenshotUrl: nextMainScreenshot,
        executionNotes: encodeLifecycleMetaIntoExecutionNotes(
          trade.executionNotes,
          nextMeta
        ),
        updatedAt: new Date().toISOString(),
      };
      await onSaveTradeUpdate(updatedTrade, trade.id);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTradeUpdate || isSavingEval) return;
    setIsSavingEval(true);
    try {
      const nowIso = new Date().toISOString();
      const nextLog = [
        ...resolved.activityLog,
        createActivityEvent('EVALUATION_ADDED', 'Evaluation Added', {
          timestamp: nowIso,
          note: evalReflectionInput.trim()
            ? 'Refleksi pasca-trade diperbarui.'
            : 'Catatan evaluasi diperbarui.',
        }),
      ];
      const nextMeta: TradeLifecycleMeta = {
        status: resolved.status,
        orderType: resolved.orderType,
        plannedEntry: resolved.plannedEntry,
        plannedLot: resolved.plannedLot,
        plannedStopLoss: resolved.plannedStopLoss,
        plannedTakeProfit: resolved.plannedTakeProfit,
        plannedDateTime: resolved.plannedDateTime,
        actualEntry: resolved.actualEntry,
        actualLot: resolved.actualLot,
        actualExit: resolved.actualExit,
        entryTime: resolved.entryTime,
        exitTime: resolved.exitTime,
        closeType: resolved.closeType,
        beforeScreenshotUrl: resolved.beforeScreenshotUrl,
        afterScreenshotUrl: resolved.afterScreenshotUrl,
        cancellationReason: resolved.cancellationReason,
        cancelledAt: resolved.cancelledAt,
        activityLog: nextLog,
      };

      const updatedTrade: Trade = {
        ...trade,
        postTradeEvaluation: evalReflectionInput.trim() || undefined,
        notes: evalNotesInput.trim() || undefined,
        executionNotes: encodeLifecycleMetaIntoExecutionNotes(
          trade.executionNotes,
          nextMeta
        ),
        updatedAt: nowIso,
      };
      const res = await onSaveTradeUpdate(updatedTrade, trade.id);
      if (!res || res.success !== false) {
        setIsEditingEval(false);
      }
    } finally {
      setIsSavingEval(false);
    }
  };

  const handleExecuteTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTradeUpdate || !activeTransitionPanel || isTransitionSaving) return;
    setTransitionError(null);

    try {
      let updatedTrade: Trade;
      if (activeTransitionPanel === 'OPEN') {
        if (!mt5Confirmed) {
          setTransitionError('Harap centang konfirmasi bahwa order telah tereksekusi di MT5.');
          return;
        }
        const entryNum = parseFloat(actualEntryInput);
        const lotNum = parseFloat(actualLotInput);
        if (isNaN(entryNum) || entryNum <= 0) {
          setTransitionError('Actual Entry wajib berupa angka positif.');
          return;
        }
        if (isNaN(lotNum) || lotNum <= 0) {
          setTransitionError('Actual Lot wajib berupa angka lebih dari 0.');
          return;
        }
        updatedTrade = transitionPlannedTradeToOpen(trade, {
          actualEntryPrice: entryNum,
          actualLotSize: lotNum,
          entryTime:
            entryDateInput && entryTimeInput
              ? `${entryDateInput}T${entryTimeInput}`
              : new Date().toISOString(),
          settings,
        });
      } else if (activeTransitionPanel === 'CANCEL') {
        updatedTrade = transitionPlannedTradeToCancelled(trade, cancelReasonInput);
      } else {
        const exitNum = parseFloat(actualExitInput);
        if (isNaN(exitNum) || exitNum <= 0) {
          setTransitionError('Actual Exit wajib berupa angka positif.');
          return;
        }
        const overrideNet =
          closeNetOverrideInput.trim() !== '' ? parseFloat(closeNetOverrideInput) : undefined;
        updatedTrade = transitionOpenTradeToClosed(trade, {
          closeType: closeTypeInput,
          actualExitPrice: exitNum,
          exitTime:
            exitDateInput && exitTimeInput
              ? `${exitDateInput}T${exitTimeInput}`
              : new Date().toISOString(),
          overrideNetProfit:
            overrideNet !== undefined && !isNaN(overrideNet) ? overrideNet : undefined,
          closeExchangeRate: getCurrentUsdIdrSnapshot(getCachedUsdIdrRate()),
          settings,
        });
      }

      setIsTransitionSaving(true);
      const res = await onSaveTradeUpdate(updatedTrade, trade.id);
      if (!res || res.success !== false) {
        setActiveTransitionPanel(null);
      } else {
        setTransitionError(res.error || 'Gagal memperbarui status transaksi.');
      }
    } catch (err: any) {
      setTransitionError(err?.message || 'Gagal memperbarui status.');
    } finally {
      setIsTransitionSaving(false);
    }
  };

  const displayLot =
    isOpenPos || isClosed
      ? resolved.actualLot ?? trade.lotSize
      : resolved.plannedLot ?? trade.lotSize;

  return (
    <div
      data-testid="trade-detail-full-page"
      className="space-y-4 font-sans text-[#151D2A] dark:text-[#F2F5F9]"
    >
      {/* Top Navigation & Quick Trade Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs font-semibold transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.75]" />
          <span>Kembali ke Trade Log</span>
        </button>

        <div className="flex items-center gap-2">
          {allTrades.length > 1 && onSelectTrade && (
            <select
              value={trade.id}
              onChange={(e) => {
                const found = allTrades.find((item) => item.id === e.target.value);
                if (found) onSelectTrade(found);
              }}
              aria-label="Pilih transaksi lain"
              className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-xs font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none"
            >
              {allTrades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} • {item.instrument} ({item.position})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => onEdit(trade)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs font-semibold transition-colors cursor-pointer"
            title="Edit Transaksi"
          >
            <Edit2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(trade)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-rose-500 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
            title="Hapus Transaksi"
          >
            <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Hapus</span>
          </button>
        </div>
      </div>

      {/* RINGKASAN TRANSAKSI (SUMMARY CARD) */}
      <div className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
                {trade.instrument}
              </h1>
              <span
                className={`text-sm font-bold uppercase ${
                  trade.position === 'BUY'
                    ? 'text-[#059669] dark:text-[#34D399]'
                    : 'text-[#E11D48] dark:text-[#FB7185]'
                }`}
              >
                {trade.position}
              </span>
              <span
                data-testid="trade-detail-status-badge"
                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                  isPlanned
                    ? 'border-[#1769E8]/30 bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8]'
                    : isOpenPos
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : isCancelled
                    ? 'border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9]'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {resolved.status}
              </span>
            </div>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
              <span
                className={`font-semibold ${
                  trade.position === 'BUY'
                    ? 'text-[#059669] dark:text-[#34D399]'
                    : 'text-[#E11D48] dark:text-[#FB7185]'
                }`}
              >
                {trade.position}
              </span>{' '}
              · {displayLot.toFixed(2)} LOT · {(resolved.entryTime || trade.dateTime || '').slice(0, 10)} · ID: {trade.id}
            </p>
          </div>

          {/* Right: Realized Profit / Loss or Lifecycle Status Info */}
          <div className="sm:text-right">
            {isClosed ? (
              <div>
                <span className="block text-[10px] uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] font-semibold">
                  REALIZED P/L
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-bold font-mono-numbers tabular-nums ${
                    isProfit
                      ? 'text-[#059669] dark:text-[#34D399]'
                      : isLoss
                      ? 'text-[#E11D48] dark:text-[#FB7185]'
                      : 'text-[#151D2A] dark:text-[#F2F5F9]'
                  }`}
                >
                  {preferredCurrency === 'IDR'
                    ? formatTradeFinancial(trade, 'netProfit', false, true)
                    : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`}
                </div>
                {realizedR !== null && (
                  <span className="text-xs font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                    Realized R: <strong>{formatRMultiple(realizedR)}</strong>
                  </span>
                )}
              </div>
            ) : isCancelled ? (
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  CANCELLED
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Dibatalkan sebelum eksekusi (bukan Loss)
                </span>
              </div>
            ) : (
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {isPlanned ? 'MENUNGGU EKSEKUSI' : 'POSISI SEDANG BERJALAN'}
                </span>
                <span className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                  Planned RR: {formatPlannedRR(plannedRR)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status-Specific Primary Lifecycle Action Bar */}
        {onSaveTradeUpdate && (isPlanned || isOpenPos) && (
          <div className="mt-4 pt-3.5 border-t border-[#DDE3EA] dark:border-[#252B34] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#697586] dark:text-[#929BA9]">
              {isPlanned
                ? 'Tindakan Status PLANNED: Konfirmasi saat posisi dibuka di MT5 atau batalkan rencana.'
                : 'Tindakan Status OPEN: Tutup posisi dengan harga exit aktual (TP / SL / Manual).'}
            </span>
            <div className="flex items-center gap-2">
              {isPlanned && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTransitionPanel(
                        activeTransitionPanel === 'OPEN' ? null : 'OPEN'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Konfirmasi Posisi Dibuka (OPEN)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTransitionPanel(
                        activeTransitionPanel === 'CANCEL' ? null : 'CANCEL'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs font-semibold cursor-pointer"
                  >
                    <XCircle className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Batalkan (CANCELLED)</span>
                  </button>
                </>
              )}

              {isOpenPos && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveTransitionPanel(
                      activeTransitionPanel === 'CLOSE' ? null : 'CLOSE'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 stroke-[1.75]" />
                  <span>Tutup Posisi (CLOSED)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Inline Transition Form when triggered */}
        {activeTransitionPanel && (
          <form
            onSubmit={handleExecuteTransition}
            className="mt-3 p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-3 text-xs"
          >
            {transitionError && (
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-rose-600 dark:text-rose-400">
                {transitionError}
              </div>
            )}

            {activeTransitionPanel === 'OPEN' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mt5Confirmed}
                    onChange={(e) => setMt5Confirmed(e.target.checked)}
                  />
                  <span>Konfirmasi posisi benar-benar telah dibuka di MT5</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Actual Entry Price
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={actualEntryInput}
                      onChange={(e) => setActualEntryInput(e.target.value)}
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold"
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
                      value={actualLotInput}
                      onChange={(e) => setActualLotInput(e.target.value)}
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Tanggal Entry
                    </label>
                    <input
                      type="date"
                      value={entryDateInput}
                      onChange={(e) => setEntryDateInput(e.target.value)}
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Jam Entry
                    </label>
                    <input
                      type="time"
                      value={entryTimeInput}
                      onChange={(e) => setEntryTimeInput(e.target.value)}
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {activeTransitionPanel === 'CANCEL' && (
              <div>
                <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Alasan Pembatalan (Opsional)
                </label>
                <input
                  type="text"
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  placeholder="Contoh: Setup tidak valid / harga melewati zona entry..."
                  className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5"
                />
              </div>
            )}

            {activeTransitionPanel === 'CLOSE' && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Jenis Penutupan
                  </label>
                  <select
                    value={closeTypeInput}
                    onChange={(e) => {
                      const ct = e.target.value as TradeCloseType;
                      setCloseTypeInput(ct);
                      if (ct === 'TP' && trade.takeProfit) setActualExitInput(String(trade.takeProfit));
                      if (ct === 'SL' && trade.stopLoss) setActualExitInput(String(trade.stopLoss));
                    }}
                    className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 font-semibold"
                  >
                    <option value="TP">TP (Take Profit)</option>
                    <option value="SL">SL (Stop Loss)</option>
                    <option value="Manual">Manual Close</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Actual Exit Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={actualExitInput}
                    onChange={(e) => setActualExitInput(e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Tanggal Exit
                  </label>
                  <input
                    type="date"
                    value={exitDateInput}
                    onChange={(e) => setExitDateInput(e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Jam Exit
                  </label>
                  <input
                    type="time"
                    value={exitTimeInput}
                    onChange={(e) => setExitTimeInput(e.target.value)}
                    className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Net P/L (Opsional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={closeNetOverrideInput}
                    onChange={(e) => setCloseNetOverrideInput(e.target.value)}
                    placeholder="Otomatis"
                    className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 font-mono-numbers tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTransitionPanel(null)}
                className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isTransitionSaving}
                className="px-4 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold cursor-pointer"
              >
                Simpan Perubahan Status
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SESI TRADING (DIRECTLY UNDER SUMMARY CARD) */}
      <div className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-3">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
          SESI TRADING
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="block text-[10px] uppercase font-semibold text-[#697586] dark:text-[#929BA9]">
              Sesi Aktif
            </span>
            <span className="mt-1 block font-bold text-sm text-[#151D2A] dark:text-[#F2F5F9]">
              {trade.session || 'London'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="block text-[10px] uppercase font-semibold text-[#697586] dark:text-[#929BA9]">
              Jam Transaksi
            </span>
            <span className="mt-1 block font-bold text-sm font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
              {(resolved.entryTime || trade.dateTime || '').slice(11, 16) || '15:30'}
              {resolved.exitTime ? ` – ${resolved.exitTime.slice(11, 16)}` : ''} WIB
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="block text-[10px] uppercase font-semibold text-[#697586] dark:text-[#929BA9]">
              Jendela Acuan Sesi
            </span>
            <span className="mt-1 block font-bold text-sm font-mono-numbers tabular-nums text-[#1769E8]">
              {(trade.session || '').toLowerCase().includes('new york') || (trade.session || '').toLowerCase().includes('ny')
                ? '19:00 – 03:00 WIB'
                : (trade.session || '').toLowerCase().includes('asia') || (trade.session || '').toLowerCase().includes('tokyo')
                ? '06:00 – 15:00 WIB'
                : (trade.session || '').toLowerCase().includes('sydney')
                ? '04:00 – 12:00 WIB'
                : '15:00 – 23:00 WIB (London)'}
            </span>
          </div>
        </div>
      </div>

      {/* ACCORDION 1: 01 — RENCANA */}
      <div
        data-testid="accordion-trade-plan"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden transition-colors duration-150"
      >
        <button
          type="button"
          onClick={() => toggleAccordion('plan')}
          aria-expanded={openSections.plan}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              01 — Rencana
            </h2>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Parameter rencana trading, lot, SL, TP, dan target RR
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] transition-transform ${
              openSections.plan ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.plan && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers tabular-nums">
            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Symbol &amp; Direction
              </span>
              <span className="mt-0.5 block font-bold text-sm">
                {trade.instrument}{' '}
                <span
                  className={
                    trade.position === 'BUY'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {trade.position}
                </span>
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Order Type
              </span>
              <span className="mt-0.5 block font-bold text-sm font-sans">
                {resolved.orderType}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Planned Entry
              </span>
              <span className="mt-0.5 block font-bold text-sm">
                {resolved.plannedEntry.toFixed(2)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Planned Lot
              </span>
              <span className="mt-0.5 block font-bold text-sm">
                {resolved.plannedLot.toFixed(2)} Lot
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-rose-600 dark:text-rose-400 font-sans">
                Stop Loss (SL)
              </span>
              <span className="mt-0.5 block font-bold text-sm text-rose-600 dark:text-rose-400">
                {resolved.plannedStopLoss ? resolved.plannedStopLoss.toFixed(2) : '-'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-sans">
                Take Profit (TP)
              </span>
              <span className="mt-0.5 block font-bold text-sm text-emerald-600 dark:text-emerald-400">
                {resolved.plannedTakeProfit ? resolved.plannedTakeProfit.toFixed(2) : '-'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Risk / Reward ({preferredCurrency === 'IDR' ? 'Rp' : '$'})
              </span>
              <span className="mt-0.5 block font-semibold text-xs">
                <span className="text-rose-600 dark:text-rose-400">
                  {planLotMetrics.riskAmount !== null
                    ? preferredCurrency === 'IDR'
                      ? formatDynamic(planLotMetrics.riskAmount)
                      : formatCurrency(planLotMetrics.riskAmount, settings)
                    : preferredCurrency === 'IDR'
                    ? formatDynamic(trade.riskAmount)
                    : formatCurrency(trade.riskAmount, settings)}
                </span>
                {' / '}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {planLotMetrics.potentialProfit !== null
                    ? preferredCurrency === 'IDR'
                      ? formatDynamic(planLotMetrics.potentialProfit)
                      : formatCurrency(planLotMetrics.potentialProfit, settings)
                    : '-'}
                </span>
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Risk/Reward Ratio
              </span>
              <span className="mt-0.5 block font-bold text-sm text-[#1769E8]">
                {formatPlannedRR(plannedRR)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] col-span-2">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Trading Session &amp; Strategy
              </span>
              <span className="mt-0.5 block font-semibold text-xs font-sans">
                {trade.session || 'London'} • {trade.strategy || 'Umum'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] col-span-2">
              <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                Planned Date &amp; Time
              </span>
              <span className="mt-0.5 block font-semibold text-xs">
                {resolved.plannedDateTime.replace('T', ' ')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 2: 02 — EKSEKUSI */}
      <div
        data-testid="accordion-execution"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden transition-colors duration-150"
      >
        <button
          type="button"
          onClick={() => toggleAccordion('execution')}
          aria-expanded={openSections.execution}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              02 — Eksekusi
            </h2>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Data realisasi entry, lot, penutupan, dan hasil bersih
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] transition-transform ${
              openSections.execution ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.execution && (
          <div className="p-4">
            {isPlanned ? (
              <div className="p-4 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#697586] dark:text-[#929BA9]">
                Transaksi ini masih berstatus <strong className="text-[#1769E8]">PLANNED</strong> dan belum dieksekusi di pasar. Data eksekusi akan tercatat saat posisi dikonfirmasi menjadi OPEN.
              </div>
            ) : isCancelled ? (
              <div className="p-4 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#697586] dark:text-[#929BA9] space-y-1">
                <div className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  Transaksi Dibatalkan (CANCELLED)
                </div>
                <p>
                  Order rencana dibatalkan sebelum tereksekusi dan tidak dihitung sebagai kerugian (LOSS).
                </p>
                {resolved.cancellationReason && (
                  <p className="pt-1 text-[#151D2A] dark:text-[#F2F5F9]">
                    Alasan: {resolved.cancellationReason}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers tabular-nums">
                <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                    Actual Entry
                  </span>
                  <span className="mt-0.5 block font-bold text-sm">
                    {resolved.actualEntry !== undefined ? resolved.actualEntry.toFixed(2) : '-'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                    Actual Lot
                  </span>
                  <span className="mt-0.5 block font-bold text-sm">
                    {resolved.actualLot !== undefined
                      ? `${resolved.actualLot.toFixed(2)} Lot`
                      : '-'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] col-span-2">
                  <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                    Waktu Entry
                  </span>
                  <span className="mt-0.5 block font-semibold text-xs">
                    {(resolved.entryTime || trade.dateTime).replace('T', ' ')}
                  </span>
                </div>

                {/* Only display Close Data when status is CLOSED */}
                {isClosed ? (
                  <>
                    <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                        Actual Exit
                      </span>
                      <span className="mt-0.5 block font-bold text-sm">
                        {resolved.actualExit !== undefined ? resolved.actualExit.toFixed(2) : '-'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                        Jenis Penutupan
                      </span>
                      <span className="mt-0.5 block font-bold text-sm font-sans">
                        {resolved.closeType ||
                          (trade.outcome === 'WIN'
                            ? 'TP / Profit'
                            : trade.outcome === 'LOSS'
                            ? 'SL / Cut Loss'
                            : 'Manual / BE')}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                        Waktu Exit
                      </span>
                      <span className="mt-0.5 block font-semibold text-xs">
                        {resolved.exitTime
                          ? resolved.exitTime.slice(0, 16).replace('T', ' ')
                          : '-'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] font-sans">
                        Realized P/L
                      </span>
                      <span
                        className={`mt-0.5 block font-bold text-sm ${
                          isProfit
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isLoss
                            ? 'text-rose-600 dark:text-rose-400'
                            : ''
                        }`}
                      >
                        {preferredCurrency === 'IDR'
                          ? formatTradeFinancial(trade, 'netProfit', false, true)
                          : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 sm:col-span-4 p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] font-sans text-xs text-[#697586] dark:text-[#929BA9]">
                    Posisi saat ini masih <strong className="text-amber-600 dark:text-amber-400">OPEN</strong>. Data penutupan (Actual Exit, Waktu Exit, dan Realized P/L) akan ditampilkan setelah posisi ditutup.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACCORDION 3: 03 — CHART & SCREENSHOT */}
      <div
        data-testid="accordion-screenshots"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden transition-colors duration-150"
      >
        <button
          type="button"
          onClick={() => toggleAccordion('screenshots')}
          aria-expanded={openSections.screenshots}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              03 — Chart &amp; Screenshot
            </h2>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Dokumentasi visual Before Trade dan After Trade
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] transition-transform ${
              openSections.screenshots ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.screenshots && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Slot 1: BEFORE TRADE */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                  BEFORE TRADE (Opsional)
                </span>
                {onSaveTradeUpdate && (
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-[11px] font-semibold cursor-pointer">
                      <Upload className="h-3 w-3 stroke-[1.75] text-[#1769E8]" />
                      <span>{beforeDisplayUrl ? 'Ganti' : 'Tambah Gambar'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleScreenshotSlotUpload('BEFORE', e)}
                        className="hidden"
                      />
                    </label>
                    {(resolved.beforeScreenshotUrl || trade.screenshotUrl) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteScreenshotSlot('BEFORE')}
                        className="px-2 py-1 rounded-md bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative rounded-lg overflow-hidden border border-[#DDE3EA] dark:border-[#252B34] h-48 bg-white dark:bg-[#080A0E] flex items-center justify-center">
                {isBeforeLoading || isUploadingImage ? (
                  <div className="flex items-center gap-2 text-xs text-[#1769E8]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memuat gambar...</span>
                  </div>
                ) : beforeDisplayUrl ? (
                  <div
                    onClick={() =>
                      onViewScreenshot(
                        resolved.beforeScreenshotUrl || trade.screenshotUrl!,
                        `BEFORE TRADE — ${trade.instrument}`
                      )
                    }
                    className="w-full h-full cursor-pointer group relative"
                  >
                    <img
                      src={beforeDisplayUrl}
                      alt="Before Trade Chart"
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11151B]/90 text-white text-xs font-semibold">
                        <ZoomIn className="h-3.5 w-3.5" />
                        <span>Perbesar</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-[#697586] dark:text-[#929BA9] space-y-1">
                    <Image className="h-6 w-6 mx-auto stroke-[1.5]" />
                    <p>Belum ada screenshot Before Trade</p>
                  </div>
                )}
              </div>
            </div>

            {/* Slot 2: AFTER TRADE */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                  AFTER TRADE (Opsional)
                </span>
                {onSaveTradeUpdate && (
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-[11px] font-semibold cursor-pointer">
                      <Upload className="h-3 w-3 stroke-[1.75] text-[#1769E8]" />
                      <span>{afterDisplayUrl ? 'Ganti' : 'Tambah Gambar'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleScreenshotSlotUpload('AFTER', e)}
                        className="hidden"
                      />
                    </label>
                    {resolved.afterScreenshotUrl && (
                      <button
                        type="button"
                        onClick={() => handleDeleteScreenshotSlot('AFTER')}
                        className="px-2 py-1 rounded-md bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative rounded-lg overflow-hidden border border-[#DDE3EA] dark:border-[#252B34] h-48 bg-white dark:bg-[#080A0E] flex items-center justify-center">
                {isAfterLoading || isUploadingImage ? (
                  <div className="flex items-center gap-2 text-xs text-[#1769E8]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memuat gambar...</span>
                  </div>
                ) : afterDisplayUrl ? (
                  <div
                    onClick={() =>
                      onViewScreenshot(
                        resolved.afterScreenshotUrl!,
                        `AFTER TRADE — ${trade.instrument}`
                      )
                    }
                    className="w-full h-full cursor-pointer group relative"
                  >
                    <img
                      src={afterDisplayUrl}
                      alt="After Trade Chart"
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#11151B]/90 text-white text-xs font-semibold">
                        <ZoomIn className="h-3.5 w-3.5" />
                        <span>Perbesar</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-xs text-[#697586] dark:text-[#929BA9] space-y-1">
                    <Image className="h-6 w-6 mx-auto stroke-[1.5]" />
                    <p>Belum ada screenshot After Trade</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 4: 04 — EVALUASI */}
      <div
        data-testid="accordion-evaluation"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden transition-colors duration-150"
      >
        <button
          type="button"
          onClick={() => toggleAccordion('evaluation')}
          aria-expanded={openSections.evaluation}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              04 — Evaluasi
            </h2>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Kepatuhan rencana, rating disiplin, perbandingan Plan vs Actual, dan refleksi
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] transition-transform ${
              openSections.evaluation ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.evaluation && (
          <div className="p-4 space-y-3 text-xs">
            {/* Discipline Rating & Plan Adherence */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold">
                  Kepatuhan Rencana &amp; Rating Disiplin
                </span>
                <span className="font-mono-numbers tabular-nums font-bold px-2.5 py-0.5 rounded border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B]">
                  {compliance.rating !== null
                    ? `${compliance.rating}/5 — ${compliance.label}`
                    : compliance.label}
                </span>
              </div>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                {compliance.reason}
              </p>
            </div>

            {/* Plan vs Actual Comparison */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-2">
                Perbandingan Plan vs Actual
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono-numbers tabular-nums">
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="block text-[10px] text-[#697586] dark:text-[#929BA9] font-sans">
                    Entry (Plan vs Actual)
                  </span>
                  <span className="font-semibold">
                    {resolved.plannedEntry.toFixed(2)} vs{' '}
                    {resolved.actualEntry !== undefined
                      ? resolved.actualEntry.toFixed(2)
                      : '-'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="block text-[10px] text-[#697586] dark:text-[#929BA9] font-sans">
                    Lot (Plan vs Actual)
                  </span>
                  <span className="font-semibold">
                    {resolved.plannedLot.toFixed(2)} vs{' '}
                    {resolved.actualLot !== undefined
                      ? resolved.actualLot.toFixed(2)
                      : '-'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="block text-[10px] text-[#697586] dark:text-[#929BA9] font-sans">
                    RR (Planned vs Realized)
                  </span>
                  <span className="font-semibold">
                    {formatPlannedRR(plannedRR)} vs {formatRMultiple(realizedR)}
                  </span>
                </div>
              </div>
            </div>

            {/* Post-trade Reflection & Evaluation Notes */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  Refleksi Pasca-Trade &amp; Catatan Evaluasi
                </span>
                {onSaveTradeUpdate && !isEditingEval && (
                  <button
                    type="button"
                    onClick={() => setIsEditingEval(true)}
                    className="text-[11px] font-semibold text-[#1769E8] hover:underline cursor-pointer"
                  >
                    {trade.postTradeEvaluation || trade.notes
                      ? 'Ubah Evaluasi'
                      : '+ Tambah Evaluasi'}
                  </button>
                )}
              </div>

              {isEditingEval ? (
                <form onSubmit={handleSaveEvaluation} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Refleksi Pasca-Trade
                    </label>
                    <textarea
                      rows={2}
                      value={evalReflectionInput}
                      onChange={(e) => setEvalReflectionInput(e.target.value)}
                      placeholder="Apakah eksekusi sudah sesuai rencana? Apa pelajaran dari transaksi ini?"
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Catatan Evaluasi &amp; Konfluensi
                    </label>
                    <textarea
                      rows={2}
                      value={evalNotesInput}
                      onChange={(e) => setEvalNotesInput(e.target.value)}
                      placeholder="Catatan tambahan..."
                      className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingEval(false)}
                      className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] font-semibold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingEval}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#1769E8] text-white font-semibold cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5 stroke-[1.75]" />
                      <span>Simpan Evaluasi</span>
                    </button>
                  </div>
                </form>
              ) : trade.postTradeEvaluation || trade.notes || trade.entryReason ? (
                <div className="space-y-2">
                  {trade.postTradeEvaluation && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] mb-0.5">
                        Refleksi Pasca-Trade
                      </span>
                      <p className="whitespace-pre-line leading-relaxed">
                        {trade.postTradeEvaluation}
                      </p>
                    </div>
                  )}
                  {(trade.notes || trade.entryReason) && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="block text-[10px] uppercase text-[#697586] dark:text-[#929BA9] mb-0.5">
                        Catatan Evaluasi / Konfluensi
                      </span>
                      <p className="whitespace-pre-line leading-relaxed">
                        {trade.notes || trade.entryReason}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[#697586] dark:text-[#929BA9] text-[11px]">
                  Belum ada catatan refleksi atau evaluasi manual untuk transaksi ini.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 5: 05 — RIWAYAT AKTIVITAS */}
      <div
        data-testid="accordion-activity-history"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] overflow-hidden transition-colors duration-150"
      >
        <button
          type="button"
          onClick={() => toggleAccordion('activity')}
          aria-expanded={openSections.activity}
          className="w-full px-5 py-4 flex items-center justify-between text-left bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
        >
          <div>
            <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              05 — Riwayat Aktivitas
            </h2>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Timeline kronologis seluruh aktivitas dan perubahan status
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9] transition-transform ${
              openSections.activity ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.activity && (
          <div className="p-4">
            <div className="relative pl-5 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-1.5 before:bottom-1.5 before:w-px before:bg-[#DDE3EA] dark:before:bg-[#252B34]">
              {timelineEvents.map((ev) => (
                <div key={ev.id} className="relative text-xs">
                  <span className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-[#1769E8] ring-4 ring-white dark:ring-[#11151B]" />
                  <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                        {ev.label}
                      </span>
                      <span className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9] inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 stroke-[1.75]" />
                        {ev.timestamp.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    {(ev.previousValue || ev.newValue) && (
                      <div className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                        {ev.previousValue ? `${ev.previousValue} → ` : ''}
                        <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
                          {ev.newValue}
                        </strong>
                      </div>
                    )}
                    {ev.note && (
                      <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                        {ev.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
