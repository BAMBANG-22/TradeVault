import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  evaluateTradeCompliance,
  parseExecutionAdherenceTag,
} from '../../utils/complianceRating';
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
  Image as ImageIcon,
  Loader2,
  Upload,
  ZoomIn,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  MoreHorizontal,
  Plus,
  Activity,
  Check,
  AlertCircle,
  Maximize2,
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

export type DetailSectionTab =
  | 'plan'
  | 'execution'
  | 'screenshots'
  | 'evaluation'
  | 'activity';

interface StructuredEvaluationFields {
  entryQuality: string;
  emotionalControl: string;
  wentWell: string;
  needsImprovement: string;
  lessonsLearned: string;
}

const EVAL_STRUCT_HEADER = '[TV_EVAL_V1]';

/**
 * Parses postTradeEvaluation string into structured reflection sections if formatted,
 * or maps legacy plain-text postTradeEvaluation into `lessonsLearned` without losing any text.
 */
function parseStructuredEvaluation(rawPostEval?: string): StructuredEvaluationFields {
  const empty: StructuredEvaluationFields = {
    entryQuality: '',
    emotionalControl: '',
    wentWell: '',
    needsImprovement: '',
    lessonsLearned: '',
  };
  if (!rawPostEval || typeof rawPostEval !== 'string') return empty;
  const trimmed = rawPostEval.trim();
  if (!trimmed) return empty;

  if (trimmed.startsWith(EVAL_STRUCT_HEADER)) {
    const body = trimmed.slice(EVAL_STRUCT_HEADER.length).trim();
    const extractField = (key: string): string => {
      const regex = new RegExp(`##\\s*${key}\\s*\\n([\\s\\S]*?)(?=\\n##\\s*[A-Z_]+|$)`, 'i');
      const m = body.match(regex);
      return m ? m[1].trim() : '';
    };
    return {
      entryQuality: extractField('ENTRY_QUALITY'),
      emotionalControl: extractField('EMOTIONAL_CONTROL'),
      wentWell: extractField('WENT_WELL'),
      needsImprovement: extractField('NEEDS_IMPROVEMENT'),
      lessonsLearned: extractField('LESSONS_LEARNED'),
    };
  }

  return {
    ...empty,
    lessonsLearned: trimmed,
  };
}

function serializeStructuredEvaluation(fields: StructuredEvaluationFields): string | undefined {
  const eq = fields.entryQuality.trim();
  const ec = fields.emotionalControl.trim();
  const ww = fields.wentWell.trim();
  const ni = fields.needsImprovement.trim();
  const ll = fields.lessonsLearned.trim();

  if (!eq && !ec && !ww && !ni && !ll) return undefined;

  // If only lessonsLearned is filled, store as clean plain text for full backward compatibility
  if (!eq && !ec && !ww && !ni && ll) {
    return ll;
  }

  const sections: string[] = [EVAL_STRUCT_HEADER];
  if (eq) sections.push(`## ENTRY_QUALITY\n${eq}`);
  if (ec) sections.push(`## EMOTIONAL_CONTROL\n${ec}`);
  if (ww) sections.push(`## WENT_WELL\n${ww}`);
  if (ni) sections.push(`## NEEDS_IMPROVEMENT\n${ni}`);
  if (ll) sections.push(`## LESSONS_LEARNED\n${ll}`);
  return sections.join('\n\n');
}

/**
 * Formats a price number using its natural recorded precision (minimum 2 decimals, up to 5 for forex pairs)
 * without fabricating values when undefined/null.
 */
function formatActualPrice(price?: number | null, instrument = 'XAUUSD'): string {
  if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) {
    return '—';
  }
  const str = String(price);
  const dotIdx = str.indexOf('.');
  if (dotIdx !== -1) {
    const decLen = str.length - dotIdx - 1;
    if (decLen >= 3) {
      return price.toFixed(Math.min(5, decLen));
    }
  }
  const upper = (instrument || '').toUpperCase();
  if (
    upper.includes('EUR') ||
    upper.includes('GBP') ||
    upper.includes('AUD') ||
    upper.includes('NZD') ||
    upper.includes('CAD') ||
    upper.includes('CHF')
  ) {
    if (!upper.includes('JPY')) {
      return price.toFixed(5);
    }
  }
  return price.toFixed(2);
}

/**
 * Extracts a timeframe token (e.g. M5, M15, H1, H4, D1) from trade notes/reason/strategy if present.
 * Never invents a fake timeframe if none is recorded.
 */
function extractRecordedTimeframe(trade: Trade): string | null {
  const combined = `${trade.strategy || ''} ${trade.entryReason || ''} ${trade.notes || ''}`;
  const m = combined.match(/\b(?:TF\s*)?(M1|M3|M5|M15|M30|H1|H4|D1|W1|1m|5m|15m|30m|1h|4h|1d)\b/i);
  if (!m || !m[1]) return null;
  const token = m[1].toUpperCase();
  if (token === '1M') return 'M1';
  if (token === '5M') return 'M5';
  if (token === '15M') return 'M15';
  if (token === '30M') return 'M30';
  if (token === '1H') return 'H1';
  if (token === '4H') return 'H4';
  if (token === '1D') return 'D1';
  return token;
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

  // Horizontal 5-Section Active Tab State
  const [activeSectionTab, setActiveSectionTab] = useState<DetailSectionTab>('plan');

  // Overflow Menu State ([⋯])
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Resolved image URLs for BEFORE TRADE and AFTER TRADE
  const [beforeDisplayUrl, setBeforeDisplayUrl] = useState<string | null>(null);
  const [isBeforeLoading, setIsBeforeLoading] = useState<boolean>(false);
  const [afterDisplayUrl, setAfterDisplayUrl] = useState<string | null>(null);
  const [isAfterLoading, setIsAfterLoading] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [activePrimarySlot, setActivePrimarySlot] = useState<'BEFORE' | 'AFTER'>('BEFORE');

  // Plan inline edit state (persisted across tab switches)
  const [isEditingPlanNotes, setIsEditingPlanNotes] = useState<boolean>(false);
  const [planStrategyInput, setPlanStrategyInput] = useState<string>('');
  const [planSessionInput, setPlanSessionInput] = useState<string>('');
  const [planEntryReasonInput, setPlanEntryReasonInput] = useState<string>('');
  const [planNotesInput, setPlanNotesInput] = useState<string>('');
  const [isSavingPlanNotes, setIsSavingPlanNotes] = useState<boolean>(false);

  // Evaluation inline edit state (persisted across tab switches)
  const [isEditingEval, setIsEditingEval] = useState<boolean>(false);
  const [evalEntryQualityInput, setEvalEntryQualityInput] = useState<string>('');
  const [evalEmotionalControlInput, setEvalEmotionalControlInput] = useState<string>('');
  const [evalWentWellInput, setEvalWentWellInput] = useState<string>('');
  const [evalNeedsImprovementInput, setEvalNeedsImprovementInput] = useState<string>('');
  const [evalReflectionInput, setEvalReflectionInput] = useState<string>('');
  const [evalNotesInput, setEvalNotesInput] = useState<string>('');
  const [evalDisciplineRatingInput, setEvalDisciplineRatingInput] = useState<number | null>(null);
  const [isSavingEval, setIsSavingEval] = useState<boolean>(false);

  // Feedback Banner State
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
        label: 'Trade dibuat',
        newValue: `${trade.instrument} ${trade.position} ${trade.lotSize.toFixed(2)} Lot @ ${formatActualPrice(
          trade.entryPrice,
          trade.instrument
        )}`,
        note: 'Catatan awal disimpan',
      },
    ];
    if (resolved.status === 'OPEN' || resolved.status === 'CLOSED') {
      fallbackEvents.push({
        id: 'legacy-entry',
        type: 'POSITION_OPENED',
        timestamp: resolved.entryTime || trade.dateTime,
        label: 'Entry dicatat',
        newValue: `${trade.position} ${(resolved.actualLot ?? trade.lotSize).toFixed(2)} Lot @ ${formatActualPrice(
          resolved.actualEntry ?? trade.entryPrice,
          trade.instrument
        )}`,
        note: 'Posisi dibuka',
      });
    }
    if (resolved.beforeScreenshotUrl || trade.screenshotUrl || resolved.afterScreenshotUrl) {
      fallbackEvents.push({
        id: 'legacy-screenshot',
        type: 'TRADE_CREATED',
        timestamp: trade.updatedAt || trade.dateTime,
        label: 'Screenshot ditambahkan',
        note: 'Gambar chart disimpan',
      });
    }
    if (resolved.status === 'CLOSED') {
      fallbackEvents.push({
        id: 'legacy-closed',
        type: 'POSITION_CLOSED',
        timestamp: resolved.exitTime || trade.updatedAt || trade.dateTime,
        label: 'Trade ditutup',
        newValue: `Outcome: ${trade.outcome} · Net P/L: ${
          preferredCurrency === 'IDR'
            ? formatTradeFinancial(trade, 'netProfit', false, true)
            : formatCurrency(trade.netProfit, settings)
        }`,
        note: 'Status trade diperbarui',
      });
    }
    if (trade.postTradeEvaluation) {
      fallbackEvents.push({
        id: 'legacy-eval',
        type: 'EVALUATION_ADDED',
        timestamp: trade.updatedAt || trade.dateTime,
        label: 'Evaluasi disimpan',
        note: 'Review selesai',
      });
    }
    return fallbackEvents;
  }, [resolved, trade, settings, preferredCurrency, formatTradeFinancial]);

  // Synchronize form inputs only when switching to a different trade ID or when external trade updates
  useEffect(() => {
    if (!trade || !resolved) return;
    const parsedEval = parseStructuredEvaluation(trade.postTradeEvaluation);
    setEvalEntryQualityInput(parsedEval.entryQuality);
    setEvalEmotionalControlInput(parsedEval.emotionalControl);
    setEvalWentWellInput(parsedEval.wentWell);
    setEvalNeedsImprovementInput(parsedEval.needsImprovement);
    setEvalReflectionInput(parsedEval.lessonsLearned);
    setEvalNotesInput(trade.notes || '');
    setEvalDisciplineRatingInput(
      typeof trade.disciplineRating === 'number' && trade.disciplineRating >= 1 && trade.disciplineRating <= 5
        ? trade.disciplineRating
        : null
    );

    setPlanStrategyInput(trade.strategy || '');
    setPlanSessionInput(trade.session || 'London');
    setPlanEntryReasonInput(trade.entryReason || '');
    setPlanNotesInput(trade.notes || '');

    setIsEditingEval(false);
    setIsEditingPlanNotes(false);
    setActiveTransitionPanel(null);
    setTransitionError(null);
    setSaveFeedback(null);

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

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMoreMenuOpen]);

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

  // Auto-dismiss save feedback banner
  useEffect(() => {
    if (!saveFeedback) return;
    const timer = setTimeout(() => setSaveFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [saveFeedback]);

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

  // Default primary image slot selection based on availability
  useEffect(() => {
    if (beforeDisplayUrl) {
      setActivePrimarySlot('BEFORE');
    } else if (afterDisplayUrl) {
      setActivePrimarySlot('AFTER');
    } else {
      setActivePrimarySlot('BEFORE');
    }
  }, [beforeDisplayUrl, afterDisplayUrl]);

  if (!isOpen) return null;

  if (!trade || !resolved) {
    return (
      <div
        data-testid="trade-detail-empty-state"
        className="rounded-xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-8 text-center space-y-3 max-w-2xl mx-auto"
      >
        <h2 className="text-base font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
          Belum Ada Transaksi Dipilih
        </h2>
        <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-md mx-auto leading-relaxed">
          Pilih salah satu transaksi dari halaman Trade Log untuk melihat detail rencana, eksekusi, chart screenshot, evaluasi, dan riwayat aktivitas.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] text-xs font-medium transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.75]" />
          <span>Kembali ke Trade Log</span>
        </button>
      </div>
    );
  }

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
  const { cleanNotes: cleanExecutionNotes } = parseExecutionAdherenceTag(trade.executionNotes);
  const parsedEvalView = parseStructuredEvaluation(trade.postTradeEvaluation);
  const recordedTimeframe = extractRecordedTimeframe(trade);

  // Derive concise semantic status label for Header ("TP HIT", "SL HIT", "ACTIVE", "PLANNED", "CLOSED", "CANCELLED")
  const headerStatusLabel = (() => {
    if (isPlanned) return 'PLANNED';
    if (isOpenPos) return 'ACTIVE';
    if (isCancelled) return 'CANCELLED';
    if (
      resolved.closeType === 'TP' ||
      compliance.status === 'COMPLIANT_TP' ||
      (isProfit &&
        trade.takeProfit &&
        trade.exitPrice &&
        Math.abs(trade.exitPrice - trade.takeProfit) <=
          Math.abs(trade.takeProfit - trade.entryPrice) * 0.15)
    ) {
      return 'TP HIT';
    }
    if (
      resolved.closeType === 'SL' ||
      compliance.status === 'COMPLIANT_SL' ||
      compliance.status === 'VIOLATION_SL' ||
      (isLoss &&
        trade.stopLoss &&
        trade.exitPrice &&
        Math.abs(trade.exitPrice - trade.stopLoss) <=
          Math.abs(trade.entryPrice - trade.stopLoss) * 0.2)
    ) {
      return 'SL HIT';
    }
    if (isProfit) return 'CLOSED · WIN';
    if (isLoss) return 'CLOSED · LOSS';
    return 'CLOSED · BE';
  })();

  // Header summary primary metric (R-Multiple or Planned R:R or Net P/L)
  const headerPrimaryMetric = (() => {
    if (isClosed) {
      if (realizedR !== null) {
        return formatRMultiple(realizedR);
      }
      return preferredCurrency === 'IDR'
        ? formatTradeFinancial(trade, 'netProfit', false, true)
        : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`;
    }
    if (isCancelled) {
      return '0.00R';
    }
    return formatPlannedRR(plannedRR);
  })();

  const headerSecondaryMetric = (() => {
    if (isClosed) {
      return preferredCurrency === 'IDR'
        ? formatTradeFinancial(trade, 'netProfit', false, true)
        : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`;
    }
    if (isCancelled) {
      return 'Order Dibatalkan';
    }
    return isPlanned ? 'Target R:R Rencana' : 'Target R:R Aktif';
  })();

  const summaryEntryPrice =
    isOpenPos || isClosed
      ? resolved.actualEntry ?? resolved.plannedEntry ?? trade.entryPrice
      : resolved.plannedEntry ?? trade.entryPrice;
  const summaryStopLoss = resolved.plannedStopLoss ?? trade.stopLoss;
  const summaryTakeProfit = resolved.plannedTakeProfit ?? trade.takeProfit;

  const screenshotCount =
    (resolved.beforeScreenshotUrl || trade.screenshotUrl ? 1 : 0) +
    (resolved.afterScreenshotUrl ? 1 : 0);

  // Compress and persist BEFORE or AFTER screenshot (Universal JPEG for 100% Supabase Storage compatibility)
  const handleScreenshotSlotUpload = (
    slot: 'BEFORE' | 'AFTER',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onSaveTradeUpdate) return;
    if (file.size > 10 * 1024 * 1024) {
      setSaveFeedback({
        type: 'error',
        message: 'Ukuran file gambar maksimal 10 MB.',
      });
      return;
    }

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
          const nowIso = new Date().toISOString();
          const nextMainScreenshot =
            slot === 'BEFORE' ? compressedDataUrl : trade.screenshotUrl;
          const nextBeforeMeta =
            slot === 'BEFORE'
              ? undefined
              : resolved.beforeScreenshotUrl &&
                  resolved.beforeScreenshotUrl !== nextMainScreenshot
                ? resolved.beforeScreenshotUrl
                : undefined;

          const nextLog = [
            ...resolved.activityLog,
            createActivityEvent('TRADE_CREATED', 'Screenshot ditambahkan', {
              timestamp: nowIso,
              newValue: slot === 'BEFORE' ? 'Before Trade Chart' : 'After Trade Chart',
              note: 'Gambar chart disimpan',
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
            beforeScreenshotUrl: nextBeforeMeta,
            afterScreenshotUrl:
              slot === 'AFTER' ? compressedDataUrl : resolved.afterScreenshotUrl,
            cancellationReason: resolved.cancellationReason,
            cancelledAt: resolved.cancelledAt,
            activityLog: nextLog,
          };

          const updatedTrade: Trade = {
            ...trade,
            screenshotUrl: nextMainScreenshot,
            executionNotes: encodeLifecycleMetaIntoExecutionNotes(
              trade.executionNotes,
              nextMeta
            ),
            updatedAt: nowIso,
          };
          const res = await onSaveTradeUpdate(updatedTrade, trade.id);
          if (!res || res.success !== false) {
            setActivePrimarySlot(slot);
            setSaveFeedback({
              type: 'success',
              message: `Screenshot ${slot === 'BEFORE' ? 'Before' : 'After'} Trade berhasil disimpan.`,
            });
          } else {
            setSaveFeedback({
              type: 'error',
              message: res.error || 'Gagal mengunggah screenshot.',
            });
          }
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
      const res = await onSaveTradeUpdate(updatedTrade, trade.id);
      if (!res || res.success !== false) {
        setSaveFeedback({
          type: 'success',
          message: `Screenshot ${slot === 'BEFORE' ? 'Before' : 'After'} Trade dihapus.`,
        });
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSavePlanDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTradeUpdate || isSavingPlanNotes) return;
    setIsSavingPlanNotes(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedTrade: Trade = {
        ...trade,
        strategy: planStrategyInput.trim() || trade.strategy,
        session: planSessionInput.trim() || trade.session,
        entryReason: planEntryReasonInput.trim() || undefined,
        notes: planNotesInput.trim() || undefined,
        updatedAt: nowIso,
      };
      const res = await onSaveTradeUpdate(updatedTrade, trade.id);
      if (!res || res.success !== false) {
        setEvalNotesInput(planNotesInput.trim());
        setIsEditingPlanNotes(false);
        setSaveFeedback({
          type: 'success',
          message: 'Catatan rencana trading berhasil diperbarui.',
        });
      } else {
        setSaveFeedback({
          type: 'error',
          message: res.error || 'Gagal menyimpan perubahan rencana.',
        });
      }
    } finally {
      setIsSavingPlanNotes(false);
    }
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTradeUpdate || isSavingEval) return;
    setIsSavingEval(true);
    try {
      const nowIso = new Date().toISOString();
      const serializedPostEval = serializeStructuredEvaluation({
        entryQuality: evalEntryQualityInput,
        emotionalControl: evalEmotionalControlInput,
        wentWell: evalWentWellInput,
        needsImprovement: evalNeedsImprovementInput,
        lessonsLearned: evalReflectionInput,
      });

      const nextLog = [
        ...resolved.activityLog,
        createActivityEvent('EVALUATION_ADDED', 'Evaluasi disimpan', {
          timestamp: nowIso,
          note: serializedPostEval
            ? 'Review dan refleksi pasca-trade diperbarui'
            : 'Catatan evaluasi diperbarui',
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
        postTradeEvaluation: serializedPostEval,
        notes: evalNotesInput.trim() || undefined,
        disciplineRating: evalDisciplineRatingInput ?? trade.disciplineRating,
        executionNotes: encodeLifecycleMetaIntoExecutionNotes(
          trade.executionNotes,
          nextMeta
        ),
        updatedAt: nowIso,
      };
      const res = await onSaveTradeUpdate(updatedTrade, trade.id);
      if (!res || res.success !== false) {
        setPlanNotesInput(evalNotesInput.trim());
        setIsEditingEval(false);
        setSaveFeedback({
          type: 'success',
          message: 'Evaluasi trade berhasil disimpan.',
        });
      } else {
        setSaveFeedback({
          type: 'error',
          message: res.error || 'Gagal menyimpan evaluasi.',
        });
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
        setSaveFeedback({
          type: 'success',
          message: 'Status eksekusi trade berhasil diperbarui.',
        });
      } else {
        setTransitionError(res.error || 'Gagal memperbarui status transaksi.');
      }
    } catch (err: any) {
      setTransitionError(err?.message || 'Gagal memperbarui status.');
    } finally {
      setIsTransitionSaving(false);
    }
  };

  const sectionTabs: Array<{
    id: DetailSectionTab;
    label: string;
    testId: string;
    badge?: string | number;
  }> = [
    { id: 'plan', label: 'Rencana', testId: 'tab-trade-plan' },
    { id: 'execution', label: 'Eksekusi', testId: 'tab-execution' },
    {
      id: 'screenshots',
      label: 'Chart',
      testId: 'tab-screenshots',
      badge: screenshotCount > 0 ? screenshotCount : undefined,
    },
    { id: 'evaluation', label: 'Evaluasi', testId: 'tab-evaluation' },
    {
      id: 'activity',
      label: 'Aktivitas',
      testId: 'tab-activity-history',
      badge: timelineEvents.length > 0 ? timelineEvents.length : undefined,
    },
  ];

  const hasEntryDeviation =
    resolved.actualEntry !== undefined &&
    resolved.plannedEntry > 0 &&
    Math.abs(resolved.actualEntry - resolved.plannedEntry) > 0.00001;

  const hasLotDeviation =
    resolved.actualLot !== undefined &&
    resolved.plannedLot > 0 &&
    Math.abs(resolved.actualLot - resolved.plannedLot) > 0.001;

  return (
    <div
      data-testid="trade-detail-full-page"
      className="max-w-4xl mx-auto space-y-5 font-sans text-[#151D2A] dark:text-[#F2F4F7] pb-8"
    >
      {/* Save / Upload Feedback Banner */}
      {saveFeedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            saveFeedback.type === 'success'
              ? 'bg-[#F5F7FA] dark:bg-[#101318] border-[#DDE3EA] dark:border-[#20252D] text-[#059669] dark:text-[#00A878]'
              : 'bg-[#F5F7FA] dark:bg-[#101318] border-rose-500/30 text-[#E11D48] dark:text-[#E05260]'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveFeedback.type === 'success' ? (
              <Check className="h-3.5 w-3.5 shrink-0 stroke-[2]" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 stroke-[2]" />
            )}
            <span>{saveFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveFeedback(null)}
            className="text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] text-[11px]"
          >
            Tutup
          </button>
        </div>
      )}

      {/* BAGIAN 2 — HEADER DAN RINGKASAN TRADE (Deep Pitch-Black / Monochrome Palette) */}
      <div className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] transition-colors duration-150">
        {/* Top Action Bar: Back Button · Title · [Edit] [⋯] */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-[#DDE3EA] dark:border-[#20252D]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Kembali ke Trade Log"
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-[#DDE3EA] dark:border-white/[0.14] bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] text-[#151D2A] dark:text-[#F2F4F7] transition-colors shrink-0 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 stroke-[1.75]" />
            </button>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#151D2A] dark:text-[#F2F4F7] truncate">
              DETAIL TRADE
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allTrades.length > 1 && onSelectTrade && (
              <select
                value={trade.id}
                onChange={(e) => {
                  const found = allTrades.find((item) => item.id === e.target.value);
                  if (found) onSelectTrade(found);
                }}
                aria-label="Pilih transaksi lain"
                className="hidden sm:block rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] hover:border-black/20 dark:hover:border-white/20 px-2.5 py-1.5 text-xs text-[#151D2A] dark:text-[#F2F4F7] font-mono-numbers tabular-nums focus:outline-none max-w-[190px] truncate"
              >
                {allTrades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.instrument} · {item.position} · {(item.dateTime || '').slice(0, 10)}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => onEdit(trade)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Edit Transaksi"
            >
              <Edit2 className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>Edit</span>
            </button>

            {/* Menu Tambahan [⋯] */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                aria-label="Menu tambahan"
                aria-expanded={isMoreMenuOpen}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-[#151D2A] dark:text-[#F2F4F7] transition-colors cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4 stroke-[1.75]" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#101318] shadow-xl py-1.5 z-30 text-xs">
                  {allTrades.length > 1 && onSelectTrade && (
                    <div className="px-3 py-1.5 border-b border-[#DDE3EA] dark:border-[#20252D] sm:hidden">
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Pindah Catatan Trade
                      </label>
                      <select
                        value={trade.id}
                        onChange={(e) => {
                          const found = allTrades.find((item) => item.id === e.target.value);
                          if (found) {
                            onSelectTrade(found);
                            setIsMoreMenuOpen(false);
                          }
                        }}
                        className="w-full rounded-md bg-[#F5F7FA] dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-2 py-1 text-xs font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
                      >
                        {allTrades.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.instrument} ({item.position}) · {(item.dateTime || '').slice(0, 10)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {onSaveTradeUpdate && isPlanned && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setActiveTransitionPanel('OPEN');
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[#151D2A] dark:text-[#F2F4F7]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75] text-[#3478DC]" />
                        <span>Konfirmasi Posisi Dibuka</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setActiveTransitionPanel('CANCEL');
                        }}
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[#697586] dark:text-[#929BA9]"
                      >
                        <XCircle className="h-3.5 w-3.5 stroke-[1.75]" />
                        <span>Batalkan Rencana Order</span>
                      </button>
                    </>
                  )}

                  {onSaveTradeUpdate && isOpenPos && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        setActiveTransitionPanel('CLOSE');
                      }}
                      className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[#151D2A] dark:text-[#F2F4F7]"
                    >
                      <Lock className="h-3.5 w-3.5 stroke-[1.75] text-[#3478DC]" />
                      <span>Tutup Posisi (Close Trade)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onDelete(trade);
                    }}
                    className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[#E11D48] dark:text-[#E05260]"
                  >
                    <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Hapus Catatan Trade</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Core Trade Summary Area */}
        <div className="px-4 sm:px-6 py-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Instrument + Direction + Timeframe & Date */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F4F7]">
                  {trade.instrument}
                </h1>
                {recordedTimeframe && (
                  <span className="text-xs font-medium text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                    {recordedTimeframe}
                  </span>
                )}
              </div>

              {/* Short Dashboard-style tertiary accent line */}
              <div className="w-8 h-0.5 bg-[#3478DC] rounded-full" />

              <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                <span
                  className={`font-bold uppercase tracking-wide ${
                    trade.position === 'BUY'
                      ? 'text-[#059669] dark:text-[#00A878]'
                      : 'text-[#E11D48] dark:text-[#E05260]'
                  }`}
                >
                  {trade.position}
                </span>
                <span className="text-[#DDE3EA] dark:text-[#20252D]" aria-hidden="true">
                  ·
                </span>
                <span className="text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                  {(resolved.entryTime || trade.dateTime || '').slice(0, 16).replace('T', ' ')}
                </span>
                {trade.id && (
                  <>
                    <span className="text-[#DDE3EA] dark:text-[#20252D]" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums truncate max-w-[140px]">
                      {trade.id}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Right: Status & Result / R:R */}
            <div className="text-right shrink-0 space-y-0.5">
              <div
                data-testid="trade-detail-status-badge"
                className={`text-xs font-bold uppercase tracking-[0.06em] ${
                  headerStatusLabel === 'TP HIT' || headerStatusLabel === 'CLOSED · WIN'
                    ? 'text-[#059669] dark:text-[#00A878]'
                    : headerStatusLabel === 'SL HIT' || headerStatusLabel === 'CLOSED · LOSS'
                    ? 'text-[#E11D48] dark:text-[#E05260]'
                    : headerStatusLabel === 'ACTIVE'
                    ? 'text-[#D97706] dark:text-[#F59E0B]'
                    : headerStatusLabel === 'PLANNED'
                    ? 'text-[#3478DC]'
                    : 'text-[#697586] dark:text-[#929BA9]'
                }`}
              >
                {headerStatusLabel}
              </div>

              <div
                className={`text-2xl sm:text-3xl font-bold font-mono-numbers tabular-nums tracking-tight ${
                  isClosed
                    ? isProfit
                      ? 'text-[#059669] dark:text-[#00A878]'
                      : isLoss
                      ? 'text-[#E11D48] dark:text-[#E05260]'
                      : 'text-[#151D2A] dark:text-[#F2F4F7]'
                    : 'text-[#151D2A] dark:text-[#F2F4F7]'
                }`}
              >
                {headerPrimaryMetric}
              </div>

              <div className="text-[11px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                {headerSecondaryMetric}
              </div>
            </div>
          </div>

          {/* Price Strip: Entry | Stop Loss | Take Profit */}
          <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-3 gap-4 sm:gap-6">
            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Entry
              </span>
              <span className="mt-0.5 block text-sm sm:text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                {formatActualPrice(summaryEntryPrice, trade.instrument)}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Stop Loss
              </span>
              <span className="mt-0.5 block text-sm sm:text-base font-semibold font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
                {formatActualPrice(summaryStopLoss, trade.instrument)}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Take Profit
              </span>
              <span className="mt-0.5 block text-sm sm:text-base font-semibold font-mono-numbers tabular-nums text-[#059669] dark:text-[#00A878]">
                {formatActualPrice(summaryTakeProfit, trade.instrument)}
              </span>
            </div>
          </div>

          {/* Quick Lifecycle Bar for PLANNED or OPEN trades (Monochrome Buttons) */}
          {onSaveTradeUpdate && (isPlanned || isOpenPos) && (
            <div className="pt-3.5 border-t border-[#DDE3EA] dark:border-[#20252D] flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-xs text-[#697586] dark:text-[#929BA9]">
                {isPlanned
                  ? 'Order masih berstatus rencana (Planned).'
                  : 'Posisi sedang aktif berjalan di pasar.'}
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75]" />
                      <span>Konfirmasi Entry</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTransitionPanel(
                          activeTransitionPanel === 'CANCEL' ? null : 'CANCEL'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-[#20252D] text-xs font-medium text-[#697586] dark:text-[#929BA9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5 stroke-[1.75]" />
                      <span>Batalkan</span>
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Tutup Posisi</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inline Transition Form when triggered */}
          {activeTransitionPanel && (
            <form
              onSubmit={handleExecuteTransition}
              className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] space-y-3.5 text-xs"
            >
              {transitionError && (
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#0B0D11] border border-rose-500/30 text-[#E11D48] dark:text-[#E05260]">
                  {transitionError}
                </div>
              )}

              {activeTransitionPanel === 'OPEN' && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer text-[#151D2A] dark:text-[#F2F4F7]">
                    <input
                      type="checkbox"
                      checked={mt5Confirmed}
                      onChange={(e) => setMt5Confirmed(e.target.checked)}
                    />
                    <span>Konfirmasi posisi benar-benar telah dibuka di pasar / MT5</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                        Actual Entry
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={actualEntryInput}
                        onChange={(e) => setActualEntryInput(e.target.value)}
                        className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold text-[#151D2A] dark:text-[#F2F4F7]"
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
                        className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold text-[#151D2A] dark:text-[#F2F4F7]"
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
                        className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
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
                        className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
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
                    className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 text-[#151D2A] dark:text-[#F2F4F7]"
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
                      className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-2.5 py-1.5 font-semibold text-[#151D2A] dark:text-[#F2F4F7]"
                    >
                      <option value="TP">TP (Take Profit)</option>
                      <option value="SL">SL (Stop Loss)</option>
                      <option value="Manual">Manual Close</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Actual Exit
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={actualExitInput}
                      onChange={(e) => setActualExitInput(e.target.value)}
                      className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums font-semibold text-[#151D2A] dark:text-[#F2F4F7]"
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
                      className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
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
                      className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
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
                      className="w-full rounded-lg bg-white dark:bg-[#0B0D11] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-1.5 font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTransitionPanel(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] font-medium text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isTransitionSaving}
                  className="px-4 py-1.5 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] font-semibold cursor-pointer"
                >
                  {isTransitionSaving ? 'Menyimpan...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* BAGIAN 3 — NAVIGASI LIMA BAGIAN (Monochrome / Subtle White Underline Indicator) */}
        <div
          role="tablist"
          aria-label="Bagian Detail Trade"
          className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 border-t border-[#DDE3EA] dark:border-[#20252D] overflow-x-auto"
        >
          {sectionTabs.map((tab) => {
            const isActive = activeSectionTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={tab.testId}
                aria-selected={isActive}
                onClick={() => setActiveSectionTab(tab.id)}
                className={`relative py-3 px-3 sm:px-4 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                  isActive
                    ? 'border-[#151D2A] dark:border-[#F2F4F7] text-[#151D2A] dark:text-[#F2F4F7] font-bold'
                    : 'border-transparent text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="ml-1.5 text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#8E98A8]">
                    ({tab.badge})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* BAGIAN 4 — KONTEN BAGIAN AKTIF (SATU AREA KONTEN TERFOKUS) */}

      {/* A. RENCANA */}
      {activeSectionTab === 'plan' && (
        <div
          data-testid="accordion-trade-plan"
          role="tabpanel"
          className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-5 sm:p-6 space-y-6 transition-colors duration-150"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                Rencana Trading
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Thesis analisis, parameter order rencana, dan konteks market sebelum posisi dibuka
              </p>
            </div>
            {onSaveTradeUpdate && !isEditingPlanNotes && (
              <button
                type="button"
                onClick={() => setIsEditingPlanNotes(true)}
                className="px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Ubah Rencana
              </button>
            )}
          </div>

          {/* 1. Market Bias & Setup / Strategi */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6 pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Market Bias
              </span>
              <span
                className={`mt-1 block text-sm font-semibold ${
                  trade.position === 'BUY'
                    ? 'text-[#059669] dark:text-[#00A878]'
                    : 'text-[#E11D48] dark:text-[#E05260]'
                }`}
              >
                {trade.position === 'BUY' ? 'Bullish (Buy)' : 'Bearish (Sell)'}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Setup / Strategi
              </span>
              <span className="mt-1 block text-sm font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                {trade.strategy || '—'}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Kondisi Market / Sesi
              </span>
              <span className="mt-1 block text-sm font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                {trade.session || 'London'}
                {recordedTimeframe ? ` · ${recordedTimeframe}` : ''}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Tipe &amp; Jadwal Rencana
              </span>
              <span className="mt-1 block text-sm font-medium font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                {resolved.orderType} · {(resolved.plannedDateTime || '').slice(0, 16).replace('T', ' ')}
              </span>
            </div>
          </div>

          {/* 2. Parameter Harga Rencana & Risk:Reward */}
          <div className="pt-5 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-6">
            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Entry Plan
              </span>
              <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                {formatActualPrice(resolved.plannedEntry, trade.instrument)}
              </span>
              <span className="mt-0.5 block text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                Ukuran: {resolved.plannedLot.toFixed(2)} Lot
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Stop Loss Plan
              </span>
              <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
                {formatActualPrice(resolved.plannedStopLoss, trade.instrument)}
              </span>
              {planLotMetrics.slDistancePips !== null && (
                <span className="mt-0.5 block text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                  Jarak: {planLotMetrics.slDistancePips} pips
                </span>
              )}
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Take Profit Plan
              </span>
              <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#059669] dark:text-[#00A878]">
                {formatActualPrice(resolved.plannedTakeProfit, trade.instrument)}
              </span>
              {planLotMetrics.tpDistancePips !== null && (
                <span className="mt-0.5 block text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                  Target: {planLotMetrics.tpDistancePips} pips
                </span>
              )}
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Risk:Reward
              </span>
              <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#3478DC]">
                {formatPlannedRR(plannedRR)}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Estimasi Risiko
              </span>
              <span className="mt-1 block text-sm font-semibold font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
                {planLotMetrics.riskAmount !== null
                  ? preferredCurrency === 'IDR'
                    ? formatDynamic(planLotMetrics.riskAmount)
                    : formatCurrency(planLotMetrics.riskAmount, settings)
                  : preferredCurrency === 'IDR'
                  ? formatDynamic(trade.riskAmount)
                  : formatCurrency(trade.riskAmount, settings)}
                {trade.riskPercentage > 0 ? ` (${trade.riskPercentage.toFixed(2)}%)` : ''}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                Potensi Target Profit
              </span>
              <span className="mt-1 block text-sm font-semibold font-mono-numbers tabular-nums text-[#059669] dark:text-[#00A878]">
                {planLotMetrics.potentialProfit !== null
                  ? preferredCurrency === 'IDR'
                    ? formatDynamic(planLotMetrics.potentialProfit)
                    : formatCurrency(planLotMetrics.potentialProfit, settings)
                  : '—'}
              </span>
            </div>
          </div>

          {/* 3. Alasan Entry, Kondisi Market & Catatan Tambahan */}
          <div className="pt-5 border-t border-[#DDE3EA] dark:border-[#20252D]">
            {isEditingPlanNotes ? (
              <form onSubmit={handleSavePlanDetails} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Setup / Strategi
                    </label>
                    <input
                      type="text"
                      value={planStrategyInput}
                      onChange={(e) => setPlanStrategyInput(e.target.value)}
                      placeholder="Contoh: Order Block + FVG"
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F4F7] focus:border-[#3478DC] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      Sesi / Kondisi Market
                    </label>
                    <select
                      value={planSessionInput}
                      onChange={(e) => setPlanSessionInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F4F7] focus:border-[#3478DC] focus:outline-none"
                    >
                      <option value="Asian">Asian Session</option>
                      <option value="London">London Session</option>
                      <option value="New York">New York Session</option>
                      <option value="Overlap">London / NY Overlap</option>
                      <option value="Other">Lainnya</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Alasan Entry &amp; Thesis Analisis
                  </label>
                  <textarea
                    rows={3}
                    value={planEntryReasonInput}
                    onChange={(e) => setPlanEntryReasonInput(e.target.value)}
                    placeholder="Jelaskan konfluensi teknikal, struktur market, dan alasan mengambil setup ini..."
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-3 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Catatan Tambahan
                  </label>
                  <textarea
                    rows={2}
                    value={planNotesInput}
                    onChange={(e) => setPlanNotesInput(e.target.value)}
                    placeholder="Catatan manajemen posisi atau kondisi berita makro..."
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-3 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingPlanNotes(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#101318] text-xs font-medium text-[#697586] dark:text-[#929BA9] cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPlanNotes}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] text-xs font-semibold cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>{isSavingPlanNotes ? 'Menyimpan...' : 'Simpan Rencana'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Alasan Entry
                  </span>
                  {trade.entryReason ? (
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed max-w-3xl">
                      {trade.entryReason}
                    </p>
                  ) : (
                    <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                      Belum ada alasan entry yang dicatat.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Catatan Tambahan
                  </span>
                  {trade.notes ? (
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed max-w-3xl">
                      {trade.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                      Tidak ada catatan tambahan pada rencana ini.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* B. EKSEKUSI */}
      {activeSectionTab === 'execution' && (
        <div
          data-testid="accordion-execution"
          role="tabpanel"
          className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-5 sm:p-6 space-y-6 transition-colors duration-150"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                Realisasi Eksekusi
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Data aktual pembukaan posisi, penutupan, biaya transaksi, dan hasil bersih
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEdit(trade)}
              className="px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              Edit Data Eksekusi
            </button>
          </div>

          {isPlanned ? (
            <div className="py-6 border-t border-[#DDE3EA] dark:border-[#20252D] space-y-2">
              <p className="text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                Posisi Belum Dieksekusi (Status: PLANNED)
              </p>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-xl leading-relaxed">
                Catatan ini masih berupa rencana order ({resolved.orderType} @{' '}
                <span className="font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                  {formatActualPrice(resolved.plannedEntry, trade.instrument)}
                </span>
                ). Gunakan tombol <strong>Konfirmasi Entry</strong> di bagian atas saat order tereksekusi di pasar.
              </p>
            </div>
          ) : isCancelled ? (
            <div className="py-6 border-t border-[#DDE3EA] dark:border-[#20252D] space-y-2">
              <p className="text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                Rencana Order Dibatalkan (CANCELLED)
              </p>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-xl leading-relaxed">
                Order dibatalkan sebelum tereksekusi di pasar dan tidak memengaruhi perhitungan Win Rate maupun kerugian akun.
              </p>
              {resolved.cancellationReason && (
                <p className="text-xs text-[#151D2A] dark:text-[#F2F4F7] pt-1">
                  Alasan Pembatalan: {resolved.cancellationReason}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Primary Execution Numeric Grid (2 Columns on Mobile, 4 on Desktop) */}
              <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6">
                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Actual Entry
                  </span>
                  <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {formatActualPrice(resolved.actualEntry, trade.instrument)}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Actual Exit
                  </span>
                  <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {isClosed ? formatActualPrice(resolved.actualExit, trade.instrument) : '—'}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Position Size (Lot)
                  </span>
                  <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {resolved.actualLot !== undefined
                      ? `${resolved.actualLot.toFixed(2)} Lot`
                      : `${trade.lotSize.toFixed(2)} Lot`}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Risk Aktual
                  </span>
                  <span className="mt-1 block text-base font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {preferredCurrency === 'IDR'
                      ? formatDynamic(trade.riskAmount)
                      : formatCurrency(trade.riskAmount, settings)}
                    {trade.riskPercentage > 0 ? ` (${trade.riskPercentage.toFixed(2)}%)` : ''}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Waktu Entry
                  </span>
                  <span className="mt-1 block text-xs sm:text-sm font-medium font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {(resolved.entryTime || trade.dateTime || '').slice(0, 16).replace('T', ' ')}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Waktu Exit
                  </span>
                  <span className="mt-1 block text-xs sm:text-sm font-medium font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {isClosed && resolved.exitTime
                      ? resolved.exitTime.slice(0, 16).replace('T', ' ')
                      : '—'}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Metode Penutupan
                  </span>
                  <span className="mt-1 block text-xs sm:text-sm font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                    {isClosed
                      ? resolved.closeType ||
                        (trade.outcome === 'WIN'
                          ? 'Take Profit (TP)'
                          : trade.outcome === 'LOSS'
                          ? 'Stop Loss (SL)'
                          : 'Manual / BE')
                      : 'Masih Terbuka (Active)'}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Hasil Aktual (Net P/L)
                  </span>
                  {isClosed ? (
                    <span
                      className={`mt-1 block text-base font-bold font-mono-numbers tabular-nums ${
                        isProfit
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : isLoss
                          ? 'text-[#E11D48] dark:text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F4F7]'
                      }`}
                    >
                      {preferredCurrency === 'IDR'
                        ? formatTradeFinancial(trade, 'netProfit', false, true)
                        : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`}
                      {realizedR !== null ? ` (${formatRMultiple(realizedR)})` : ''}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs font-medium text-[#D97706] dark:text-[#F59E0B]">
                      Posisi Sedang Berjalan
                    </span>
                  )}
                </div>
              </div>

              {/* Financial Breakdown (Gross Profit, Commission, Swap) when Closed */}
              {isClosed && (
                <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Gross P/L
                    </span>
                    <span className="mt-0.5 block font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                      {preferredCurrency === 'IDR'
                        ? formatTradeFinancial(trade, 'grossProfit', false, true)
                        : formatCurrency(trade.grossProfit, settings)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Komisi Broker
                    </span>
                    <span className="mt-0.5 block font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                      {preferredCurrency === 'IDR'
                        ? formatDynamic(trade.commission || 0)
                        : formatCurrency(trade.commission || 0, settings)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Biaya Swap
                    </span>
                    <span className="mt-0.5 block font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                      {preferredCurrency === 'IDR'
                        ? formatDynamic(trade.swap || 0)
                        : formatCurrency(trade.swap || 0, settings)}
                    </span>
                  </div>
                </div>
              )}

              {/* Explicit Planned vs Actual Comparison if Deviation Exists */}
              {(hasEntryDeviation || hasLotDeviation) && (
                <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] space-y-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9]">
                    Perbandingan Rencana vs Aktual
                  </span>
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono-numbers tabular-nums">
                    <div>
                      <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">
                        Planned Entry vs Actual Entry
                      </span>
                      <span className="mt-0.5 block font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                        {formatActualPrice(resolved.plannedEntry, trade.instrument)} →{' '}
                        {formatActualPrice(resolved.actualEntry, trade.instrument)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">
                        Planned Lot vs Actual Lot
                      </span>
                      <span className="mt-0.5 block font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                        {resolved.plannedLot.toFixed(2)} Lot →{' '}
                        {resolved.actualLot !== undefined
                          ? `${resolved.actualLot.toFixed(2)} Lot`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Notes separated cleanly from numeric metrics */}
              <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
                <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                  Catatan Eksekusi
                </span>
                {cleanExecutionNotes ? (
                  <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed max-w-3xl">
                    {cleanExecutionNotes}
                  </p>
                ) : (
                  <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                    {compliance.label} — {compliance.reason}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* C. CHART & SCREENSHOT */}
      {activeSectionTab === 'screenshots' && (
        <div
          data-testid="accordion-screenshots"
          role="tabpanel"
          className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-5 sm:p-6 space-y-5 transition-colors duration-150"
        >
          {/* Header: Title + File Count + Add Screenshot Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                  Chart &amp; Screenshot
                </h2>
                <span className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                  · {screenshotCount} file
                </span>
              </div>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Dokumentasi chart sebelum entry (Before Trade) dan sesudah posisi selesai (After Trade)
              </p>
            </div>

            {onSaveTradeUpdate && (
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] transition-colors cursor-pointer">
                  <Plus className="h-3.5 w-3.5 stroke-[2] text-[#697586] dark:text-[#929BA9]" />
                  <span>{beforeDisplayUrl ? 'Ganti Before' : 'Tambah Before'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleScreenshotSlotUpload('BEFORE', e)}
                    className="hidden"
                  />
                </label>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] transition-colors cursor-pointer">
                  <Upload className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                  <span>{afterDisplayUrl ? 'Ganti After' : 'Tambah After'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleScreenshotSlotUpload('AFTER', e)}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {isBeforeLoading || isAfterLoading || isUploadingImage ? (
            <div className="py-16 border-t border-[#DDE3EA] dark:border-[#20252D] flex flex-col items-center justify-center gap-2 text-xs text-[#697586] dark:text-[#929BA9]">
              <Loader2 className="h-5 w-5 animate-spin text-[#3478DC]" />
              <span>Memproses gambar chart...</span>
            </div>
          ) : screenshotCount === 0 ? (
            /* Minimalist Empty State when no screenshot is attached */
            <div className="py-12 px-4 border-t border-[#DDE3EA] dark:border-[#20252D] text-center space-y-3">
              <ImageIcon className="h-6 w-6 mx-auto stroke-[1.5] text-[#697586] dark:text-[#929BA9]" />
              <div className="space-y-1 max-w-sm mx-auto">
                <p className="text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                  Belum ada dokumentasi chart pada transaksi ini
                </p>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                  Tambahkan screenshot chart Before Trade atau After Trade untuk menyimpan bukti visual setup dan eksekusi.
                </p>
              </div>
              {onSaveTradeUpdate && (
                <div className="pt-1 flex items-center justify-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] text-xs font-semibold transition-colors cursor-pointer">
                    <Upload className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Unggah Screenshot Chart</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleScreenshotSlotUpload('BEFORE', e)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] space-y-4">
              {/* Primary Proportional Chart Stage (object-contain so no price levels or axes are cut off) */}
              {(() => {
                const activeUrl =
                  activePrimarySlot === 'AFTER' && afterDisplayUrl
                    ? afterDisplayUrl
                    : beforeDisplayUrl || afterDisplayUrl;
                const activeRawRef =
                  activePrimarySlot === 'AFTER' && resolved.afterScreenshotUrl
                    ? resolved.afterScreenshotUrl
                    : resolved.beforeScreenshotUrl || trade.screenshotUrl || resolved.afterScreenshotUrl;
                const activeTitle =
                  activePrimarySlot === 'AFTER' && afterDisplayUrl
                    ? `After Trade — ${trade.instrument}`
                    : `Before Trade — ${trade.instrument}`;

                if (!activeUrl || !activeRawRef) return null;

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                        {activePrimarySlot === 'AFTER' && afterDisplayUrl
                          ? 'Chart Utama · After Trade'
                          : 'Chart Utama · Before Trade'}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onViewScreenshot(activeRawRef, activeTitle)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7] cursor-pointer"
                        >
                          <Maximize2 className="h-3.5 w-3.5 stroke-[1.75]" />
                          <span>Layar Penuh</span>
                        </button>
                      </div>
                    </div>

                    <div
                      onClick={() => onViewScreenshot(activeRawRef, activeTitle)}
                      className="relative rounded-xl overflow-hidden border border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#050607] aspect-[16/10] sm:aspect-[16/9] flex items-center justify-center cursor-pointer group"
                    >
                      <img
                        src={activeUrl}
                        alt={activeTitle}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B0D11]/95 border border-white/[0.14] text-[#F2F4F7] text-xs font-medium">
                          <ZoomIn className="h-3.5 w-3.5 stroke-[1.75]" />
                          <span>Buka Layar Penuh</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Responsive Thumbnail Grid for Before & After Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Slot 1: Before Trade */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    activePrimarySlot === 'BEFORE' && beforeDisplayUrl
                      ? 'border-[#151D2A] dark:border-white/30 bg-[#F5F7FA] dark:bg-[#101318]'
                      : 'border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA]/60 dark:bg-[#101318]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (beforeDisplayUrl) setActivePrimarySlot('BEFORE');
                      }}
                      className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] text-left cursor-pointer"
                    >
                      Before Trade (Setup Awal)
                    </button>
                    <div className="flex items-center gap-2 text-[11px]">
                      {beforeDisplayUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onViewScreenshot(
                              resolved.beforeScreenshotUrl || trade.screenshotUrl!,
                              `BEFORE TRADE — ${trade.instrument}`
                            )
                          }
                          className="text-[#151D2A] dark:text-[#F2F4F7] hover:underline font-medium cursor-pointer"
                        >
                          Perbesar
                        </button>
                      )}
                      {onSaveTradeUpdate && (resolved.beforeScreenshotUrl || trade.screenshotUrl) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteScreenshotSlot('BEFORE')}
                          className="text-[#E11D48] dark:text-[#E05260] hover:underline font-medium cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>

                  {beforeDisplayUrl ? (
                    <div
                      onClick={() => setActivePrimarySlot('BEFORE')}
                      className="rounded-lg overflow-hidden border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#050607] aspect-[16/9] cursor-pointer"
                    >
                      <img
                        src={beforeDisplayUrl}
                        alt="Before Trade Thumbnail"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[#DDE3EA] dark:border-[#20252D] aspect-[16/9] flex flex-col items-center justify-center gap-1.5 text-xs text-[#697586] dark:text-[#929BA9]">
                      <span>Belum ada gambar Before Trade</span>
                      {onSaveTradeUpdate && (
                        <label className="text-[#151D2A] dark:text-[#F2F4F7] font-semibold hover:underline cursor-pointer">
                          + Unggah Before Trade
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleScreenshotSlotUpload('BEFORE', e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Slot 2: After Trade */}
                <div
                  className={`p-3.5 rounded-xl border transition-colors ${
                    activePrimarySlot === 'AFTER' && afterDisplayUrl
                      ? 'border-[#151D2A] dark:border-white/30 bg-[#F5F7FA] dark:bg-[#101318]'
                      : 'border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA]/60 dark:bg-[#101318]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (afterDisplayUrl) setActivePrimarySlot('AFTER');
                      }}
                      className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] text-left cursor-pointer"
                    >
                      After Trade (Hasil Akhir)
                    </button>
                    <div className="flex items-center gap-2 text-[11px]">
                      {afterDisplayUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onViewScreenshot(
                              resolved.afterScreenshotUrl!,
                              `AFTER TRADE — ${trade.instrument}`
                            )
                          }
                          className="text-[#151D2A] dark:text-[#F2F4F7] hover:underline font-medium cursor-pointer"
                        >
                          Perbesar
                        </button>
                      )}
                      {onSaveTradeUpdate && resolved.afterScreenshotUrl && (
                        <button
                          type="button"
                          onClick={() => handleDeleteScreenshotSlot('AFTER')}
                          className="text-[#E11D48] dark:text-[#E05260] hover:underline font-medium cursor-pointer"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>

                  {afterDisplayUrl ? (
                    <div
                      onClick={() => setActivePrimarySlot('AFTER')}
                      className="rounded-lg overflow-hidden border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#050607] aspect-[16/9] cursor-pointer"
                    >
                      <img
                        src={afterDisplayUrl}
                        alt="After Trade Thumbnail"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[#DDE3EA] dark:border-[#20252D] aspect-[16/9] flex flex-col items-center justify-center gap-1.5 text-xs text-[#697586] dark:text-[#929BA9]">
                      <span>Belum ada gambar After Trade</span>
                      {onSaveTradeUpdate && (
                        <label className="text-[#151D2A] dark:text-[#F2F4F7] font-semibold hover:underline cursor-pointer">
                          + Unggah After Trade
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleScreenshotSlotUpload('AFTER', e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* D. EVALUASI */}
      {activeSectionTab === 'evaluation' && (
        <div
          data-testid="accordion-evaluation"
          role="tabpanel"
          className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-5 sm:p-6 space-y-6 transition-colors duration-150"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                Evaluasi &amp; Refleksi Trade
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Tinjauan objektif hasil, kepatuhan rencana, psikologi, dan pembelajaran pasca-trade
              </p>
            </div>
            {onSaveTradeUpdate && !isEditingEval && (
              <button
                type="button"
                onClick={() => setIsEditingEval(true)}
                className="px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-white/[0.14] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {trade.postTradeEvaluation || trade.notes ? 'Ubah Evaluasi' : '+ Tulis Evaluasi'}
              </button>
            )}
          </div>

          {/* 1. Hasil Trade & 2. Disiplin terhadap Rencana */}
          <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Group 1: Hasil Trade */}
            <div className="space-y-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9]">
                1. Hasil Trade
              </span>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Status &amp; Outcome
                  </span>
                  <span
                    className={`mt-0.5 block text-sm font-semibold ${
                      isClosed
                        ? isProfit
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : isLoss
                          ? 'text-[#E11D48] dark:text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F4F7]'
                        : 'text-[#151D2A] dark:text-[#F2F4F7]'
                    }`}
                  >
                    {headerStatusLabel}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Realisasi R / Net P/L
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                    {isClosed
                      ? `${realizedR !== null ? `${formatRMultiple(realizedR)} · ` : ''}${
                          preferredCurrency === 'IDR'
                            ? formatTradeFinancial(trade, 'netProfit', false, true)
                            : `${isProfit ? '+' : ''}${formatCurrency(trade.netProfit, settings)}`
                        }`
                      : 'Belum Ditutup'}
                  </span>
                </div>
              </div>
              <div className="pt-2 grid grid-cols-3 gap-2 text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                <div>
                  <span className="block font-sans">Plan vs Actual Entry</span>
                  <span className="font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                    {formatActualPrice(resolved.plannedEntry, trade.instrument)} /{' '}
                    {formatActualPrice(resolved.actualEntry, trade.instrument)}
                  </span>
                </div>
                <div>
                  <span className="block font-sans">Plan vs Actual Lot</span>
                  <span className="font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                    {resolved.plannedLot.toFixed(2)} /{' '}
                    {resolved.actualLot !== undefined ? resolved.actualLot.toFixed(2) : '—'}
                  </span>
                </div>
                <div>
                  <span className="block font-sans">Plan vs Actual R:R</span>
                  <span className="font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                    {formatPlannedRR(plannedRR)} / {formatRMultiple(realizedR)}
                  </span>
                </div>
              </div>
            </div>

            {/* Group 2: Disiplin terhadap Rencana */}
            <div className="space-y-2.5 sm:border-l sm:border-[#DDE3EA] sm:dark:border-[#20252D] sm:pl-6">
              <div className="flex items-center justify-between gap-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9]">
                  2. Disiplin terhadap Rencana
                </span>
                <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7]">
                  {trade.disciplineRating
                    ? `Skor Manual: ${trade.disciplineRating}/5`
                    : compliance.rating !== null
                    ? `Audit Sistem: ${compliance.rating}/5`
                    : 'Belum Dinilai'}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                {compliance.label}
              </p>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] leading-relaxed">
                {compliance.reason}
              </p>
            </div>
          </div>

          {/* Qualitative Reflection Sections (3..7) or Inline Editor */}
          <div className="pt-5 border-t border-[#DDE3EA] dark:border-[#20252D]">
            {isEditingEval ? (
              <form onSubmit={handleSaveEvaluation} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1.5">
                    Skor Disiplin Pribadi (Opsional — Jangan pilih jika belum ingin memberi skor)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() =>
                          setEvalDisciplineRatingInput((prev) => (prev === score ? null : score))
                        }
                        className={`px-3 py-1.5 rounded-lg border font-mono-numbers tabular-nums font-semibold transition-colors cursor-pointer ${
                          evalDisciplineRatingInput === score
                            ? 'border-[#151D2A] dark:border-white bg-[#151D2A] text-white dark:bg-[#1A202A] dark:text-[#F2F4F7]'
                            : 'border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#101318] text-[#151D2A] dark:text-[#F2F4F7]'
                        }`}
                      >
                        {score} / 5
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      3. Kualitas Entry
                    </label>
                    <textarea
                      rows={2}
                      value={evalEntryQualityInput}
                      onChange={(e) => setEvalEntryQualityInput(e.target.value)}
                      placeholder="Apakah timing dan level harga entry sesuai konfirmasi setup?"
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      4. Kontrol Emosi
                    </label>
                    <textarea
                      rows={2}
                      value={evalEmotionalControlInput}
                      onChange={(e) => setEvalEmotionalControlInput(e.target.value)}
                      placeholder="Bagaimana kondisi psikologis saat floating profit/loss?"
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      5. Hal yang Berjalan Baik
                    </label>
                    <textarea
                      rows={2}
                      value={evalWentWellInput}
                      onChange={(e) => setEvalWentWellInput(e.target.value)}
                      placeholder="Apa langkah disiplin yang sudah tepat pada transaksi ini?"
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                      6. Hal yang Perlu Diperbaiki
                    </label>
                    <textarea
                      rows={2}
                      value={evalNeedsImprovementInput}
                      onChange={(e) => setEvalNeedsImprovementInput(e.target.value)}
                      placeholder="Apa kesalahan atau celah eksekusi yang perlu dihindari ke depan?"
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    7. Pelajaran dari Trade (Refleksi Utama)
                  </label>
                  <textarea
                    rows={3}
                    value={evalReflectionInput}
                    onChange={(e) => setEvalReflectionInput(e.target.value)}
                    placeholder="Tuliskan kesimpulan utama dan pelajaran dari transaksi ini..."
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-3 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">
                    Catatan Evaluasi &amp; Konfluensi Tambahan
                  </label>
                  <textarea
                    rows={2}
                    value={evalNotesInput}
                    onChange={(e) => setEvalNotesInput(e.target.value)}
                    placeholder="Catatan tambahan..."
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] p-3 text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed focus:border-[#3478DC] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingEval(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#101318] font-medium text-[#697586] dark:text-[#929BA9] cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEval}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#161A22] dark:hover:bg-[#1E2430] dark:text-[#F2F4F7] border border-black/10 dark:border-white/[0.14] font-semibold cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>{isSavingEval ? 'Menyimpan...' : 'Simpan Evaluasi'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1">
                      3. Kualitas Entry
                    </span>
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed">
                      {parsedEvalView.entryQuality ||
                        (hasEntryDeviation
                          ? `Actual Entry (${formatActualPrice(
                              resolved.actualEntry,
                              trade.instrument
                            )}) memiliki selisih terhadap Planned Entry (${formatActualPrice(
                              resolved.plannedEntry,
                              trade.instrument
                            )}).`
                          : 'Belum ada catatan evaluasi kualitas entry.')}
                    </p>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1">
                      4. Kontrol Emosi
                    </span>
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed">
                      {parsedEvalView.emotionalControl || 'Belum ada catatan evaluasi kontrol emosi.'}
                    </p>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1">
                      5. Hal yang Berjalan Baik
                    </span>
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed">
                      {parsedEvalView.wentWell || 'Belum diisi.'}
                    </p>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1">
                      6. Hal yang Perlu Diperbaiki
                    </span>
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed">
                      {parsedEvalView.needsImprovement || 'Belum diisi.'}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1.5">
                    7. Pelajaran dari Trade
                  </span>
                  {parsedEvalView.lessonsLearned ? (
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed max-w-3xl">
                      {parsedEvalView.lessonsLearned}
                    </p>
                  ) : (
                    <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                      Belum ada refleksi atau pelajaran pasca-trade yang ditulis untuk transaksi ini.
                    </p>
                  )}
                </div>

                {(trade.notes || trade.entryReason) && (
                  <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Catatan Konfluensi &amp; Jurnal
                    </span>
                    <p className="text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F4F7] whitespace-pre-line leading-relaxed max-w-3xl">
                      {trade.notes || trade.entryReason}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* E. RIWAYAT AKTIVITAS */}
      {activeSectionTab === 'activity' && (
        <div
          data-testid="accordion-activity-history"
          role="tabpanel"
          className="rounded-2xl border border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#0B0D11] p-5 sm:p-6 space-y-5 transition-colors duration-150"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                Riwayat Aktivitas
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Jejak kronologis pembuatan rencana, eksekusi posisi, dokumentasi chart, dan evaluasi
              </p>
            </div>
            <span className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
              {timelineEvents.length} aktivitas
            </span>
          </div>

          {timelineEvents.length === 0 ? (
            <div className="py-10 border-t border-[#DDE3EA] dark:border-[#20252D] text-center space-y-1.5">
              <Activity className="h-5 w-5 mx-auto stroke-[1.5] text-[#697586] dark:text-[#929BA9]" />
              <p className="text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7]">
                Belum ada riwayat aktivitas tercatat
              </p>
            </div>
          ) : (
            <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#20252D]">
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[#DDE3EA] dark:before:bg-[#20252D]">
                {timelineEvents.map((ev) => (
                  <div key={ev.id} className="relative text-xs">
                    {/* Minimalist timeline node using core monochrome + subtle Dashboard tertiary blue */}
                    <span
                      className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#3478DC] ring-4 ring-white dark:ring-[#0B0D11]"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <div className="font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                        {ev.label}
                      </div>
                      <div className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9] flex items-center gap-1.5">
                        <Clock className="h-3 w-3 stroke-[1.75] shrink-0" />
                        <span>{(ev.timestamp || '').slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      {(ev.previousValue || ev.newValue) && (
                        <div className="text-xs font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F4F7] pt-0.5">
                          {ev.previousValue ? (
                            <span className="text-[#697586] dark:text-[#929BA9]">
                              {ev.previousValue} →{' '}
                            </span>
                          ) : null}
                          <span>{ev.newValue}</span>
                        </div>
                      )}
                      {ev.note && (
                        <p className="text-xs text-[#697586] dark:text-[#929BA9] leading-relaxed">
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
      )}
    </div>
  );
};
