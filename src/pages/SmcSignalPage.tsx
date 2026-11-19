/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Compass,
  Wifi,
  WifiOff,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  CheckCircle2,
  XCircle,
  BookmarkCheck,
  PlusCircle,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { setNewsCycleOfflineMode } from '../utils/apiConfig';
import {
  evaluateSmcSignalEngine,
  loadStoredSessionHoursWib,
  loadStoredManualAmdOverride,
  loadStoredTradingConfluenceMode,
  saveStoredTradingConfluenceMode,
  MANUAL_AMD_OVERRIDE_CHANGE_EVENT,
  MANUAL_AMD_OVERRIDE_STORAGE_KEY,
  SESSION_HOURS_WIB_CHANGE_EVENT,
  SESSION_HOURS_WIB_STORAGE_KEY,
  TRADING_CONFLUENCE_MODE_CHANGE_EVENT,
  TRADING_CONFLUENCE_MODE_STORAGE_KEY,
  type TradingConfluenceMode,
  type ManualAmdOverrideMode,
  type SessionHoursWibConfig,
  type SmcLimitOrderSetup,
} from '../utils/confluenceEngine';
import {
  getWibDateKey,
  getSignalHistoryEffectiveDateKey,
  getAvailableHistoryDates,
  filterSignalHistoryRecords,
  groupHistoryRecordsByDate,
  computeSignalHistorySummary,
  recordDeletedActiveSignal,
  reconcileIncomingSignalsWithDeleted,
  type SmcSignalOutcomeStatus,
  type SmcSignalBatchStatus,
  type SmcHistoryDateFilterMode,
  type SmcStoredSignalRecord,
  type SmcDeletedSignalRecord,
} from '../utils/smcSignalHistory';
import { useCycleConfluenceData } from '../hooks/useCycleConfluenceData';
import { useLanguage } from '../utils/language';

export type {
  SmcSignalOutcomeStatus,
  SmcSignalBatchStatus,
  SmcHistoryDateFilterMode,
  SmcStoredSignalRecord,
};

interface SmcSignalPageProps {
  isActive?: boolean;
  onNavigate?: (tab: string) => void;
}

const OFFLINE_SIGNALS_STORAGE_KEY = 'tradevault_smc_offline_signals_v1';
const DELETED_SIGNALS_STORAGE_KEY = 'tradevault_smc_deleted_signals_v1';
const RESURFACE_DELETED_OPTION_STORAGE_KEY = 'tradevault_smc_resurface_deleted_v1';

/**
 * Returns YYYY-MM-DD in WIB (UTC+7) so daily signal sheets follow Indonesian trading days.
 */
function getCurrentWibDateKey(date: Date = new Date()): string {
  return getWibDateKey(date);
}

function getCurrentWibTimeLabel(date: Date = new Date()): string {
  try {
    const timeStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${timeStr.replace('.', ':')} WIB`;
  } catch {
    return 'WIB';
  }
}

function formatDateKeyHuman(dateKey: string, todayKey: string): string {
  if (!dateKey) return '—';
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const formatted = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
    return dateKey === todayKey ? `Hari Ini · ${formatted}` : formatted;
  } catch {
    return dateKey;
  }
}

function normalizeSignalRecordsForDay(
  records: SmcStoredSignalRecord[],
  todayKey: string
): SmcStoredSignalRecord[] {
  return records.map((item) => {
    const isPastActive =
      item.status === 'ACTIVE' &&
      item.dateKey < todayKey &&
      item.promotedDateKey !== todayKey;
    return {
      ...item,
      batchStatus: isPastActive
        ? 'PREVIOUS'
        : item.batchStatus === 'PREVIOUS'
        ? 'PREVIOUS'
        : 'ON_GOING',
    };
  });
}

function loadStoredOfflineSignals(): SmcStoredSignalRecord[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(OFFLINE_SIGNALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const todayKey = getCurrentWibDateKey();
    const valid = parsed.filter(
      (item) =>
        item &&
        typeof item.uid === 'string' &&
        typeof item.dateKey === 'string' &&
        typeof item.entryLimit === 'number' &&
        item.entryLimit > 0
    );
    return normalizeSignalRecordsForDay(valid, todayKey);
  } catch {
    return [];
  }
}

function saveStoredOfflineSignals(records: SmcStoredSignalRecord[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(OFFLINE_SIGNALS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors
  }
}

function loadStoredDeletedSignals(): SmcDeletedSignalRecord[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(DELETED_SIGNALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SmcDeletedSignalRecord =>
        Boolean(
          item &&
            typeof item.signatureKey === 'string' &&
            typeof item.entryLimit === 'number' &&
            item.entryLimit > 0
        )
    );
  } catch {
    return [];
  }
}

function saveStoredDeletedSignals(records: SmcDeletedSignalRecord[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(DELETED_SIGNALS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors
  }
}

function loadResurfaceDeletedOption(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(RESURFACE_DELETED_OPTION_STORAGE_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
}

function saveResurfaceDeletedOption(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(RESURFACE_DELETED_OPTION_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore quota errors
  }
}

const TIER_SORT_WEIGHT: Record<SmcLimitOrderSetup['tier'], number> = {
  A_PLUS: 1,
  B_STANDARD: 2,
  HIGH_RISK: 3,
};

export const SmcSignalPage: React.FC<SmcSignalPageProps> = ({
  isActive = true,
  onNavigate,
}) => {
  const { tr } = useLanguage();

  const todayDateKey = getCurrentWibDateKey();

  const [tradingMode, setTradingModeState] = useState<TradingConfluenceMode>(() =>
    loadStoredTradingConfluenceMode('SCALP')
  );
  const setTradingMode = useCallback((mode: TradingConfluenceMode) => {
    setTradingModeState(mode);
    saveStoredTradingConfluenceMode(mode);
  }, []);
  const [selectedSide, setSelectedSide] = useState<'BUY' | 'SELL'>('BUY');
  const [hasUserToggledSide, setHasUserToggledSide] = useState<boolean>(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayDateKey);
  const [previousDateFilter, setPreviousDateFilter] = useState<string>('ALL');
  const [historyDateFilterMode, setHistoryDateFilterMode] =
    useState<SmcHistoryDateFilterMode>('ALL');
  const [historyCustomDateKey, setHistoryCustomDateKey] = useState<string>(todayDateKey);
  const [viewSection, setViewSection] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [batchFilter, setBatchFilter] = useState<'ALL' | 'ON_GOING' | 'TAKEN' | 'PREVIOUS'>('ALL');
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState<boolean>(false);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState<boolean>(false);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOptionsMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOptionsMenuOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        optionsMenuRef.current &&
        !optionsMenuRef.current.contains(e.target as Node)
      ) {
        setIsOptionsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOptionsMenuOpen]);

  const [storedSignals, setStoredSignals] = useState<SmcStoredSignalRecord[]>(() =>
    loadStoredOfflineSignals()
  );
  const [deletedSignals, setDeletedSignals] = useState<SmcDeletedSignalRecord[]>(() =>
    loadStoredDeletedSignals()
  );
  const [resurfaceDeletedSignals, setResurfaceDeletedSignals] = useState<boolean>(() =>
    loadResurfaceDeletedOption()
  );

  const storedSignalsRef = useRef<SmcStoredSignalRecord[]>(storedSignals);
  storedSignalsRef.current = storedSignals;
  const deletedSignalsRef = useRef<SmcDeletedSignalRecord[]>(deletedSignals);
  deletedSignalsRef.current = deletedSignals;
  const resurfaceOptionRef = useRef<boolean>(resurfaceDeletedSignals);
  resurfaceOptionRef.current = resurfaceDeletedSignals;

  // Persist to localStorage whenever storedSignals / deletedSignals / resurface option change
  useEffect(() => {
    saveStoredOfflineSignals(storedSignals);
  }, [storedSignals]);

  useEffect(() => {
    saveStoredDeletedSignals(deletedSignals);
  }, [deletedSignals]);

  useEffect(() => {
    saveResurfaceDeletedOption(resurfaceDeletedSignals);
  }, [resurfaceDeletedSignals]);

  // Automatically roll selectedDateKey and archive prior days' ON_GOING signals to PREVIOUS on a new WIB calendar day
  const lastTodayRef = useRef<string>(todayDateKey);
  useEffect(() => {
    const checkDayRollover = () => {
      const currentKey = getCurrentWibDateKey();
      if (currentKey !== lastTodayRef.current) {
        const previousTodayKey = lastTodayRef.current;
        lastTodayRef.current = currentKey;
        setSelectedDateKey(currentKey);
        setHistoryCustomDateKey((prev) => (prev === previousTodayKey ? currentKey : prev));
        setStoredSignals((prev) => normalizeSignalRecordsForDay(prev, currentKey));
      }
    };
    const interval = window.setInterval(checkDayRollover, 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const [sessionConfig, setSessionConfig] = useState<SessionHoursWibConfig>(() =>
    loadStoredSessionHoursWib()
  );
  const [manualAmdOverride, setManualAmdOverride] = useState<ManualAmdOverrideMode>(() =>
    loadStoredManualAmdOverride()
  );

  useEffect(() => {
    const syncAll = () => {
      setManualAmdOverride(loadStoredManualAmdOverride());
      setSessionConfig(loadStoredSessionHoursWib());
      setTradingModeState(loadStoredTradingConfluenceMode('SCALP'));
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === MANUAL_AMD_OVERRIDE_STORAGE_KEY ||
        e.key === SESSION_HOURS_WIB_STORAGE_KEY ||
        e.key === TRADING_CONFLUENCE_MODE_STORAGE_KEY
      ) {
        syncAll();
      } else if (e.key === OFFLINE_SIGNALS_STORAGE_KEY) {
        setStoredSignals(loadStoredOfflineSignals());
      } else if (e.key === DELETED_SIGNALS_STORAGE_KEY) {
        setDeletedSignals(loadStoredDeletedSignals());
      } else if (e.key === RESURFACE_DELETED_OPTION_STORAGE_KEY) {
        setResurfaceDeletedSignals(loadResurfaceDeletedOption());
      }
    };
    window.addEventListener(MANUAL_AMD_OVERRIDE_CHANGE_EVENT, syncAll);
    window.addEventListener(SESSION_HOURS_WIB_CHANGE_EVENT, syncAll);
    window.addEventListener(TRADING_CONFLUENCE_MODE_CHANGE_EVENT, syncAll);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(MANUAL_AMD_OVERRIDE_CHANGE_EVENT, syncAll);
      window.removeEventListener(SESSION_HOURS_WIB_CHANGE_EVENT, syncAll);
      window.removeEventListener(TRADING_CONFLUENCE_MODE_CHANGE_EVENT, syncAll);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const {
    livePrice,
    macroBias,
    rawMacroContext,
    candlesByTf,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    isOfflineMode,
    refresh,
  } = useCycleConfluenceData(tradingMode, isActive);

  const handleToggleOfflineMode = () => {
    setNewsCycleOfflineMode(!isOfflineMode);
  };

  const signalResult = useMemo(
    () =>
      evaluateSmcSignalEngine({
        tradingMode,
        livePrice,
        macroBias,
        rawMacroContext,
        candlesByTf,
        sessionConfig,
        manualAmdOverride,
      }),
    [tradingMode, livePrice, macroBias, rawMacroContext, candlesByTf, sessionConfig, manualAmdOverride]
  );

  const { cycleCompass, buyLimitGroups, sellLimitGroups, buyOption, sellOption, spotPrice } =
    signalResult;
  const twoStage = cycleCompass.twoStageValidation;
  const activeSidePlan = selectedSide === 'BUY' ? buyOption : sellOption;

  const liveDominantBiasLabel: 'BULLISH' | 'BEARISH' | 'NETRAL' =
    cycleCompass.dominantCycleBias === 'BULLISH'
      ? 'BULLISH'
      : cycleCompass.dominantCycleBias === 'BEARISH'
      ? 'BEARISH'
      : 'NETRAL';

  /**
   * Captures and locks real-time signals into Offline Storage (localStorage) for today's WIB date.
   * Rules:
   * 1. Existing ACTIVE signals from earlier batches move to `PREVIOUS`, while newly pulled ones become `ON_GOING`.
   * 2. Matching ACTIVE signals are promoted back to `ON_GOING` without duplicating.
   * 3. Deleted (`ON_GOING` / `PREVIOUS`) signals are either re-surfaced into `ON_GOING` (if option ON)
   *    or kept hidden/suppressed (if option OFF).
   */
  const captureSignalsToOfflineVault = useCallback(
    (
      isManualTrigger: boolean
    ): {
      added: number;
      resurfaced: number;
      promoted: number;
      keptInOnGoing: number;
      promotedFromPrevious: number;
      archivedToPrevious: number;
      suppressed: number;
    } => {
      if (!spotPrice || spotPrice <= 0) {
        return {
          added: 0,
          resurfaced: 0,
          promoted: 0,
          keptInOnGoing: 0,
          promotedFromPrevious: 0,
          archivedToPrevious: 0,
          suppressed: 0,
        };
      }

      const currentDayKey = getCurrentWibDateKey();
      const now = new Date();
      const nowIso = now.toISOString();
      const nowWib = getCurrentWibTimeLabel(now);
      const allIncoming = [...buyLimitGroups, ...sellLimitGroups];

      const result = reconcileIncomingSignalsWithDeleted({
        storedSignals: storedSignalsRef.current,
        deletedSignals: deletedSignalsRef.current,
        incomingGroups: allIncoming,
        tradingMode,
        currentDayKey,
        nowIso,
        nowWib,
        spotPrice,
        dominantBias: liveDominantBiasLabel,
        pdZone: cycleCompass.pdZone,
        positionPct: cycleCompass.positionPct,
        recommendedSide: cycleCompass.recommendedSide,
        resurfaceDeletedSignals: resurfaceOptionRef.current,
        mode: 'FULL_PULL',
        isManualTrigger,
      });

      if (result.nextSignals !== storedSignalsRef.current) {
        storedSignalsRef.current = result.nextSignals;
        setStoredSignals(result.nextSignals);
      }
      if (result.nextDeletedSignals !== deletedSignalsRef.current) {
        deletedSignalsRef.current = result.nextDeletedSignals;
        setDeletedSignals(result.nextDeletedSignals);
      }

      return {
        added: result.addedCount,
        resurfaced: result.resurfacedCount,
        promoted: result.promotedCount,
        keptInOnGoing: result.keptInOnGoingCount,
        promotedFromPrevious: result.promotedFromPreviousCount,
        archivedToPrevious: result.archivedToPreviousCount,
        suppressed: result.suppressedCount,
      };
    },
    [
      spotPrice,
      buyLimitGroups,
      sellLimitGroups,
      tradingMode,
      liveDominantBiasLabel,
      cycleCompass.pdZone,
      cycleCompass.positionPct,
      cycleCompass.recommendedSide,
    ]
  );

  // Auto-seed today's offline signal snapshot ONCE per day/mode when the page opens and today has 0 signals
  const autoSeedAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!spotPrice || spotPrice <= 0) return;
    const currentDayKey = getCurrentWibDateKey();
    const seedKey = `${currentDayKey}:${tradingMode}`;
    if (autoSeedAttemptedRef.current.has(seedKey)) return;
    autoSeedAttemptedRef.current.add(seedKey);

    const hasTodaySignalsForMode = storedSignalsRef.current.some(
      (r) => r.dateKey === currentDayKey && r.tradingMode === tradingMode
    );
    if (!hasTodaySignalsForMode) {
      captureSignalsToOfflineVault(false);
    }
  }, [spotPrice, tradingMode, storedSignals, captureSignalsToOfflineVault]);

  // Automatic background market re-analysis check (e.g. 1h / 6h later when market scan refreshes):
  // If `resurfaceDeletedSignals` is ON and the market scan detects a setup matching a deleted ON_GOING / PREVIOUS signal,
  // automatically re-surface it into ON_GOING cleanly.
  const lastAutoResurfaceCheckKeyRef = useRef<string>('');
  useEffect(() => {
    if (
      !resurfaceDeletedSignals ||
      !spotPrice ||
      spotPrice <= 0 ||
      isLoading ||
      isRefreshing ||
      !lastUpdatedAt
    ) {
      return;
    }
    const deletedForMode = deletedSignalsRef.current.filter((d) => d.tradingMode === tradingMode);
    if (deletedForMode.length === 0) return;

    const checkKey = `${tradingMode}|${lastUpdatedAt}|${spotPrice.toFixed(1)}`;
    if (lastAutoResurfaceCheckKeyRef.current === checkKey) return;
    lastAutoResurfaceCheckKeyRef.current = checkKey;

    const currentDayKey = getCurrentWibDateKey();
    const now = new Date();
    const nowIso = now.toISOString();
    const nowWib = getCurrentWibTimeLabel(now);
    const allIncoming = [...buyLimitGroups, ...sellLimitGroups];

    const res = reconcileIncomingSignalsWithDeleted({
      storedSignals: storedSignalsRef.current,
      deletedSignals: deletedSignalsRef.current,
      incomingGroups: allIncoming,
      tradingMode,
      currentDayKey,
      nowIso,
      nowWib,
      spotPrice,
      dominantBias: liveDominantBiasLabel,
      pdZone: cycleCompass.pdZone,
      positionPct: cycleCompass.positionPct,
      recommendedSide: cycleCompass.recommendedSide,
      resurfaceDeletedSignals: true,
      mode: 'AUTO_RESURFACE_ONLY',
    });

    if (res.resurfacedCount > 0) {
      storedSignalsRef.current = res.nextSignals;
      deletedSignalsRef.current = res.nextDeletedSignals;
      setStoredSignals(res.nextSignals);
      setDeletedSignals(res.nextDeletedSignals);
      setCaptureFeedback(
        tr(
          `[Analisa Pasar] ${res.resurfacedCount} sinyal yang pernah dihapus terdeteksi sama kembali & dimunculkan lagi ke On Going (${nowWib}).`,
          `[Market Scan] ${res.resurfacedCount} previously deleted signal setup matched again & re-appeared in On Going (${nowWib}).`
        )
      );
      window.setTimeout(() => setCaptureFeedback(null), 6000);
    }
  }, [
    resurfaceDeletedSignals,
    spotPrice,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    tradingMode,
    buyLimitGroups,
    sellLimitGroups,
    liveDominantBiasLabel,
    cycleCompass.pdZone,
    cycleCompass.positionPct,
    cycleCompass.recommendedSide,
    tr,
  ]);

  const formatPullFeedback = useCallback(
    (stats: {
      added: number;
      resurfaced: number;
      promoted: number;
      keptInOnGoing: number;
      promotedFromPrevious: number;
      archivedToPrevious: number;
      suppressed: number;
    }, fromCacheOnly: boolean): string => {
      const timeTag = getCurrentWibTimeLabel();
      const resurfaceNote =
        stats.resurfaced > 0 ? ` (termasuk ${stats.resurfaced} sinyal hapus yang muncul lagi)` : '';
      const archiveNote =
        stats.archivedToPrevious > 0
          ? `, ${stats.archivedToPrevious} sinyal lama dipindah ke Previous Data`
          : '';
      const keptNote =
        stats.keptInOnGoing > 0 ? ` · ${stats.keptInOnGoing} sinyal sama tetap di On Going` : '';
      const promotedPrevNote =
        stats.promotedFromPrevious > 0
          ? ` · ${stats.promotedFromPrevious} sinyal Previous kembali ke On Going`
          : '';
      const suppressedNote =
        stats.suppressed > 0 ? ` · ${stats.suppressed} sinyal terhapus tetap disembunyikan` : '';

      if (stats.added > 0) {
        return fromCacheOnly
          ? `${stats.added} sinyal masuk ke On Going dari cache${resurfaceNote}${archiveNote}${keptNote}${promotedPrevNote}${suppressedNote}.`
          : `${stats.added} sinyal terbaru masuk ke On Going${resurfaceNote}${archiveNote}${keptNote}${promotedPrevNote}${suppressedNote} · Prioritas: UTAMAKAN ${cycleCompass.recommendedSide} (${timeTag}).`;
      }
      if (stats.suppressed > 0 && stats.promoted === 0) {
        return `Tidak ada sinyal baru (${stats.suppressed} setup cocok dengan daftar hapus permanen) · Prioritas Real-Time: UTAMAKAN ${cycleCompass.recommendedSide} (${timeTag}).`;
      }
      if (stats.promotedFromPrevious > 0 && stats.keptInOnGoing === 0) {
        return `${stats.promotedFromPrevious} sinyal Previous sama dengan setup terbaru & kembali ke On Going${suppressedNote} · Prioritas: UTAMAKAN ${cycleCompass.recommendedSide} (${timeTag}).`;
      }
      return fromCacheOnly
        ? `Semua ${stats.promoted} sinyal masih sama dan tetap berada di On Going${suppressedNote}.`
        : `Semua ${stats.promoted} sinyal masih sama dengan sebelumnya dan tetap di On Going${suppressedNote} · Prioritas Real-Time: UTAMAKAN ${cycleCompass.recommendedSide} (${timeTag}).`;
    },
    [cycleCompass.recommendedSide]
  );

  // Pending manual capture flag after online refresh finishes
  const pendingManualCaptureRef = useRef<boolean>(false);
  const feedbackTimerRef = useRef<number | null>(null);

  const showTimedFeedback = useCallback((msg: string, durationMs: number = 5000) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setCaptureFeedback(msg);
    feedbackTimerRef.current = window.setTimeout(() => {
      setCaptureFeedback(null);
      feedbackTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    if (pendingManualCaptureRef.current && !isRefreshing && !isLoading && spotPrice > 0) {
      pendingManualCaptureRef.current = false;
      const stats = captureSignalsToOfflineVault(true);
      const currentDayKey = getCurrentWibDateKey();
      setSelectedDateKey(currentDayKey);
      setViewSection('ACTIVE');
      // Sync selected side with latest real-time Cycle priority when user pulls latest data
      setHasUserToggledSide(false);
      setSelectedSide(cycleCompass.recommendedSide);
      showTimedFeedback(formatPullFeedback(stats, false));
    }
  }, [
    isRefreshing,
    isLoading,
    spotPrice,
    lastUpdatedAt,
    captureSignalsToOfflineVault,
    cycleCompass.recommendedSide,
    formatPullFeedback,
    showTimedFeedback,
  ]);

  const handlePullNewRealtimeSignals = async () => {
    const currentDayKey = getCurrentWibDateKey();
    setSelectedDateKey(currentDayKey);
    if (!isOfflineMode) {
      pendingManualCaptureRef.current = true;
      const didRefresh = await refresh(true);
      // Only fallback immediately if refresh returned early (e.g. 12s cooldown) and won't trigger a fresh effect commit
      if (!didRefresh && pendingManualCaptureRef.current) {
        pendingManualCaptureRef.current = false;
        const stats = captureSignalsToOfflineVault(true);
        setViewSection('ACTIVE');
        setHasUserToggledSide(false);
        setSelectedSide(cycleCompass.recommendedSide);
        showTimedFeedback(formatPullFeedback(stats, false));
      }
    } else {
      const stats = captureSignalsToOfflineVault(true);
      setViewSection('ACTIVE');
      setHasUserToggledSide(false);
      setSelectedSide(cycleCompass.recommendedSide);
      showTimedFeedback(formatPullFeedback(stats, true));
    }
  };

  // Build available dates list (always includes todayDateKey + all distinct dates in storedSignals)
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>([todayDateKey]);
    for (const r of storedSignals) {
      if (r.tradingMode === tradingMode) {
        dateSet.add(r.dateKey);
      }
    }
    return Array.from(dateSet).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  }, [storedSignals, tradingMode, todayDateKey]);

  // Signals filtered by selectedDateKey and tradingMode
  const dateSignalsForMode = useMemo(
    () =>
      storedSignals.filter(
        (r) => r.dateKey === selectedDateKey && r.tradingMode === tradingMode
      ),
    [storedSignals, selectedDateKey, tradingMode]
  );

  /**
   * Compass for the selected date:
   * - For TODAY (`selectedDateKey === todayDateKey`), ALWAYS use 100% REAL-TIME Cycle data (`signalResult.cycleCompass`)
   *   so Bias Dominan, Discount/Premium, CHoCH validation, and Prioritas Buy/Sell are NEVER stuck on stale morning snapshots!
   * - For past historical dates, show the last recorded compass snapshot on that date.
   */
  const activeDateCompass = useMemo(() => {
    if (selectedDateKey !== todayDateKey && dateSignalsForMode.length > 0) {
      const latestRecordOnDate = dateSignalsForMode[0];
      return {
        dominantBias: latestRecordOnDate.dominantBias,
        pdZone: latestRecordOnDate.pdZone,
        positionPct: latestRecordOnDate.positionPct,
        recommendedSide: latestRecordOnDate.recommendedSide,
        spotAtCapture: latestRecordOnDate.spotPriceAtCapture,
        capturedTimeWib: latestRecordOnDate.createdTimeWib,
        isLiveCycle: false,
      };
    }
    return {
      dominantBias: liveDominantBiasLabel,
      pdZone: cycleCompass.pdZone,
      positionPct: cycleCompass.positionPct,
      recommendedSide: cycleCompass.recommendedSide,
      spotAtCapture: spotPrice,
      capturedTimeWib: getCurrentWibTimeLabel(),
      isLiveCycle: true,
    };
  }, [
    selectedDateKey,
    todayDateKey,
    dateSignalsForMode,
    liveDominantBiasLabel,
    cycleCompass.pdZone,
    cycleCompass.positionPct,
    cycleCompass.recommendedSide,
    spotPrice,
  ]);

  useEffect(() => {
    if (!hasUserToggledSide) {
      setSelectedSide(activeDateCompass.recommendedSide);
    }
  }, [activeDateCompass.recommendedSide, hasUserToggledSide]);

  // Active signals across ALL dates for current tradingMode (Previous Data combines today's earlier batches + prior days)
  const allActiveSignalsForMode = useMemo(() => {
    return storedSignals.filter(
      (r) => r.tradingMode === tradingMode && r.status === 'ACTIVE'
    );
  }, [storedSignals, tradingMode]);

  // Distinct dates available in Previous Data for current mode
  const previousAvailableDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const r of allActiveSignalsForMode) {
      if ((r.batchStatus || 'ON_GOING') === 'PREVIOUS') {
        dateSet.add(r.dateKey);
      }
    }
    return Array.from(dateSet).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  }, [allActiveSignalsForMode]);

  // Reset previousDateFilter back to 'ALL' if selected filter date no longer has records
  useEffect(() => {
    if (previousDateFilter !== 'ALL' && !previousAvailableDates.includes(previousDateFilter)) {
      setPreviousDateFilter('ALL');
    }
  }, [previousDateFilter, previousAvailableDates]);

  const sortSignalsInsideBatch = useCallback(
    (list: SmcStoredSignalRecord[]) => {
      return [...list].sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
        if (a.isTaken !== b.isTaken) return a.isTaken ? -1 : 1;
        const tierDiff = TIER_SORT_WEIGHT[a.tier] - TIER_SORT_WEIGHT[b.tier];
        if (tierDiff !== 0) return tierDiff;
        return b.createdAtIso.localeCompare(a.createdAtIso);
      });
    },
    []
  );

  // Active signals for the selected side (BUY or SELL):
  // - ON_GOING: latest real-time batch (or promoted active signals)
  // - PREVIOUS: ALL previous batches from today AND all prior dates combined (filterable by previousDateFilter)
  const onGoingSideSignals = useMemo(
    () =>
      sortSignalsInsideBatch(
        allActiveSignalsForMode.filter(
          (r) => r.direction === selectedSide && (r.batchStatus || 'ON_GOING') === 'ON_GOING'
        )
      ),
    [allActiveSignalsForMode, selectedSide, sortSignalsInsideBatch]
  );

  const allPreviousSideSignals = useMemo(
    () =>
      sortSignalsInsideBatch(
        allActiveSignalsForMode.filter(
          (r) => r.direction === selectedSide && (r.batchStatus || 'ON_GOING') === 'PREVIOUS'
        )
      ),
    [allActiveSignalsForMode, selectedSide, sortSignalsInsideBatch]
  );

  const filteredPreviousSideSignals = useMemo(() => {
    if (previousDateFilter === 'ALL') return allPreviousSideSignals;
    return allPreviousSideSignals.filter((r) => r.dateKey === previousDateFilter);
  }, [allPreviousSideSignals, previousDateFilter]);

  // Active signals with "Ambil Sinyal" (isTaken === true), regardless of ON_GOING or PREVIOUS batch
  const takenSideSignals = useMemo(
    () =>
      sortSignalsInsideBatch(
        allActiveSignalsForMode.filter(
          (r) => r.direction === selectedSide && r.isTaken
        )
      ),
    [allActiveSignalsForMode, selectedSide, sortSignalsInsideBatch]
  );

  const untakenOnGoingSideSignals = useMemo(
    () => onGoingSideSignals.filter((r) => !r.isTaken),
    [onGoingSideSignals]
  );

  const untakenFilteredPreviousSideSignals = useMemo(
    () => filteredPreviousSideSignals.filter((r) => !r.isTaken),
    [filteredPreviousSideSignals]
  );

  // Group Previous Data signals by dateKey (newest date first) so user can clearly distinguish today vs prior dates
  const groupedPreviousSideSignals = useMemo(() => {
    const groups = new Map<string, SmcStoredSignalRecord[]>();
    for (const sig of filteredPreviousSideSignals) {
      const existing = groups.get(sig.dateKey);
      if (existing) {
        existing.push(sig);
      } else {
        groups.set(sig.dateKey, [sig]);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0));
  }, [filteredPreviousSideSignals]);

  const groupedUntakenPreviousSideSignals = useMemo(() => {
    const groups = new Map<string, SmcStoredSignalRecord[]>();
    for (const sig of untakenFilteredPreviousSideSignals) {
      const existing = groups.get(sig.dateKey);
      if (existing) {
        existing.push(sig);
      } else {
        groups.set(sig.dateKey, [sig]);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0));
  }, [untakenFilteredPreviousSideSignals]);

  const onGoingSideCount = onGoingSideSignals.length;
  const takenSideCount = takenSideSignals.length;
  const previousSideCount = allPreviousSideSignals.length;
  const allActiveSideCount =
    takenSideCount + untakenOnGoingSideSignals.length + untakenFilteredPreviousSideSignals.length;

  const activeSideSignals = useMemo(() => {
    if (batchFilter === 'ON_GOING') return onGoingSideSignals;
    if (batchFilter === 'TAKEN') return takenSideSignals;
    if (batchFilter === 'PREVIOUS') return filteredPreviousSideSignals;
    return [...takenSideSignals, ...untakenOnGoingSideSignals, ...untakenFilteredPreviousSideSignals];
  }, [
    batchFilter,
    onGoingSideSignals,
    takenSideSignals,
    filteredPreviousSideSignals,
    untakenOnGoingSideSignals,
    untakenFilteredPreviousSideSignals,
  ]);

  const activeBuyCount = useMemo(() => {
    return allActiveSignalsForMode.filter((r) => {
      if (r.direction !== 'BUY') return false;
      const batch = r.batchStatus || 'ON_GOING';
      if (batchFilter === 'ON_GOING') return batch === 'ON_GOING';
      if (batchFilter === 'TAKEN') return Boolean(r.isTaken);
      if (batchFilter === 'PREVIOUS') {
        return batch === 'PREVIOUS' && (previousDateFilter === 'ALL' || r.dateKey === previousDateFilter);
      }
      return Boolean(r.isTaken) || batch === 'ON_GOING' || previousDateFilter === 'ALL' || r.dateKey === previousDateFilter;
    }).length;
  }, [allActiveSignalsForMode, batchFilter, previousDateFilter]);

  const activeSellCount = useMemo(() => {
    return allActiveSignalsForMode.filter((r) => {
      if (r.direction !== 'SELL') return false;
      const batch = r.batchStatus || 'ON_GOING';
      if (batchFilter === 'ON_GOING') return batch === 'ON_GOING';
      if (batchFilter === 'TAKEN') return Boolean(r.isTaken);
      if (batchFilter === 'PREVIOUS') {
        return batch === 'PREVIOUS' && (previousDateFilter === 'ALL' || r.dateKey === previousDateFilter);
      }
      return Boolean(r.isTaken) || batch === 'ON_GOING' || previousDateFilter === 'ALL' || r.dateKey === previousDateFilter;
    }).length;
  }, [allActiveSignalsForMode, batchFilter, previousDateFilter]);

  const totalActiveAllDates = allActiveSignalsForMode.length;

  // Combined History signals across all dates for current tradingMode
  const allHistorySignalsForMode = useMemo(
    () =>
      filterSignalHistoryRecords({
        records: storedSignals,
        tradingMode,
        filterMode: 'ALL',
        customDateKey: historyCustomDateKey,
        todayDateKey,
      }),
    [storedSignals, tradingMode, historyCustomDateKey, todayDateKey]
  );

  const todayHistoryCount = useMemo(
    () =>
      allHistorySignalsForMode.filter(
        (r) => getSignalHistoryEffectiveDateKey(r) === todayDateKey
      ).length,
    [allHistorySignalsForMode, todayDateKey]
  );

  const historyAvailableDates = useMemo(
    () => getAvailableHistoryDates(storedSignals, tradingMode, todayDateKey),
    [storedSignals, tradingMode, todayDateKey]
  );

  // Filtered History signals according to active filter mode ('ALL' | 'TODAY' | 'CUSTOM')
  const filteredHistorySignals = useMemo(
    () =>
      filterSignalHistoryRecords({
        records: storedSignals,
        tradingMode,
        filterMode: historyDateFilterMode,
        customDateKey: historyCustomDateKey,
        todayDateKey,
      }),
    [storedSignals, tradingMode, historyDateFilterMode, historyCustomDateKey, todayDateKey]
  );

  // History grouped by effective completion date (newest date first) for combined 'ALL' view
  const groupedHistorySignals = useMemo(
    () => groupHistoryRecordsByDate(filteredHistorySignals),
    [filteredHistorySignals]
  );

  // History Stats (Hit TP vs Hit SL, Win Rate & Net Pips) matching active filter
  const historySummary = useMemo(
    () => computeSignalHistorySummary(filteredHistorySignals),
    [filteredHistorySignals]
  );

  // Handlers for interacting with signal cards
  const handleToggleTakeSignal = (uid: string) => {
    setStoredSignals((prev) =>
      prev.map((item) => (item.uid === uid ? { ...item, isTaken: !item.isTaken } : item))
    );
  };

  const handleToggleBatchStatus = (uid: string, targetBatch: SmcSignalBatchStatus) => {
    const currentDayKey = getCurrentWibDateKey();
    setStoredSignals((prev) =>
      prev.map((item) =>
        item.uid === uid
          ? {
              ...item,
              batchStatus: targetBatch,
              promotedDateKey: targetBatch === 'ON_GOING' ? currentDayKey : null,
            }
          : item
      )
    );
  };

  const handleMarkSignalOutcome = (
    record: SmcStoredSignalRecord,
    outcome: Exclude<SmcSignalOutcomeStatus, 'ACTIVE'>
  ) => {
    const now = new Date();
    const closedAtIso = now.toISOString();
    const closedDateKey = getCurrentWibDateKey(now);
    const closedTimeWib = getCurrentWibTimeLabel(now);

    let resultPips = 0;
    if (outcome === 'HIT_TP1') {
      resultPips = record.tp1Pips || Math.round(Math.abs(record.tp1 - record.entryLimit) * 10);
    } else if (outcome === 'HIT_TP2') {
      resultPips = 100; // 1:2 = 100 pips
    } else if (outcome === 'HIT_TP_MAX') {
      resultPips = Math.round(Math.abs(record.tpMax - record.entryLimit) * 10);
    } else if (outcome === 'HIT_SL') {
      // 50 pips + 20 point = 52 pips risk
      resultPips = -(record.slPips + Math.round(record.slPoints / 10));
    }

    setStoredSignals((prev) =>
      prev.map((item) =>
        item.uid === record.uid
          ? {
              ...item,
              isTaken: true,
              status: outcome,
              closedAtIso,
              closedDateKey,
              closedTimeWib,
              resultPips,
            }
          : item
      )
    );
  };

  const handleRestoreToActive = (uid: string) => {
    const currentDayKey = getCurrentWibDateKey();
    setStoredSignals((prev) =>
      prev.map((item) =>
        item.uid === uid
          ? {
              ...item,
              status: 'ACTIVE',
              batchStatus: 'ON_GOING',
              promotedDateKey: currentDayKey,
              closedAtIso: null,
              closedDateKey: null,
              closedTimeWib: null,
              resultPips: null,
            }
          : item
      )
    );
  };

  const handleDeleteSignal = (uid: string) => {
    const target = storedSignalsRef.current.find((item) => item.uid === uid);
    const nextSignals = storedSignalsRef.current.filter((item) => item.uid !== uid);
    storedSignalsRef.current = nextSignals;
    setStoredSignals(nextSignals);

    if (target && target.status === 'ACTIVE') {
      const nextDeleted = recordDeletedActiveSignal(
        deletedSignalsRef.current,
        target,
        new Date().toISOString()
      );
      deletedSignalsRef.current = nextDeleted;
      setDeletedSignals(nextDeleted);

      setCaptureFeedback(
        resurfaceOptionRef.current
          ? tr(
              `Sinyal ${target.headerTitle} dihapus. Jika nanti analisa market menemukan sinyal ini lagi, akan dimunculkan kembali.`,
              `Signal ${target.headerTitle} deleted. If future market analysis finds the same setup, it will re-appear.`
            )
          : tr(
              `Sinyal ${target.headerTitle} dihapus & disembunyikan permanen.`,
              `Signal ${target.headerTitle} deleted & kept hidden.`
            )
      );
      window.setTimeout(() => setCaptureFeedback(null), 4500);
    }
  };

  const handleToggleResurfaceDeleted = () => {
    const next = !resurfaceOptionRef.current;
    resurfaceOptionRef.current = next;
    setResurfaceDeletedSignals(next);
  };

  const handleClearDeletedArchiveForMode = () => {
    const remaining = deletedSignalsRef.current.filter((d) => d.tradingMode !== tradingMode);
    deletedSignalsRef.current = remaining;
    setDeletedSignals(remaining);
  };

  const deletedForModeCount = useMemo(
    () => deletedSignals.filter((d) => d.tradingMode === tradingMode).length,
    [deletedSignals, tradingMode]
  );

  const formattedUpdatedTime = useMemo(() => {
    if (!lastUpdatedAt) return '—';
    try {
      return new Date(lastUpdatedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '—';
    }
  }, [lastUpdatedAt]);

  return (
    <div
      data-testid="smc-signal-page"
      className="space-y-5 pb-10 text-[#0F172A] dark:text-[#F2F4F7] font-sans transition-colors duration-150 overflow-x-hidden"
    >
      {/* =====================================================================
          HEADER MINIMALIS + POPOVER OPSI + UNDERLINE TABS & TIMEFRAME SWITCH
         ===================================================================== */}
      <div className="space-y-3">
        {/* Row 1: Title/Spot Meta + 4 Compact Header Actions */}
        <div className="relative flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold uppercase tracking-[0.12em] text-[#0F172A] dark:text-[#F2F4F7] truncate">
                SMC SIGNAL · XAU/USD
              </h1>
              <span
                title={
                  isOfflineMode
                    ? tr('Mode Offline Aktif (Tersimpan Lokal)', 'Offline Mode Active (Local Storage)')
                    : tr('Terhubung Online · Cache Offline Aktif', 'Online Connected · Offline Cache Active')
                }
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isOfflineMode
                    ? 'bg-[#D97706] dark:bg-[#F59E0B]'
                    : 'bg-[#059669] dark:bg-[#00A878]'
                }`}
              />
            </div>
            <p className="text-[11px] text-[#526071] dark:text-[#929BA9] font-mono-numbers tabular-nums mt-0.5 truncate">
              {spotPrice > 0 ? `$${spotPrice.toFixed(1)}` : tr('Memuat...', 'Loading...')}
              {` · ${isOfflineMode ? tr('Tersimpan Offline', 'Saved Offline') : tr('Sync Lokal', 'Local Sync')} · ${formattedUpdatedTime}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="smc-signal-offline-toggle"
              onClick={handleToggleOfflineMode}
              title={
                isOfflineMode
                  ? tr('Mode Offline Aktif — klik untuk Online', 'Offline Mode — click for Online')
                  : tr('Mode Online Aktif — klik untuk Offline', 'Online Mode — click for Offline')
              }
              aria-label={isOfflineMode ? 'Mode Offline' : 'Mode Online'}
              className={`h-8 w-8 inline-flex items-center justify-center rounded-full border transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                isOfflineMode
                  ? 'bg-[#D97706]/10 dark:bg-[#F59E0B]/15 border-[#D97706]/40 dark:border-[#F59E0B]/40 text-[#B45309] dark:text-[#F59E0B]'
                  : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-[#059669] dark:text-[#00A878]'
              }`}
            >
              {isOfflineMode ? (
                <WifiOff className="w-3.5 h-3.5 stroke-[2]" />
              ) : (
                <Wifi className="w-3.5 h-3.5 stroke-[1.75]" />
              )}
            </button>

            {onNavigate && (
              <button
                type="button"
                data-testid="smc-signal-open-cycle-button"
                onClick={() => onNavigate('cycle-confluence')}
                className="h-8 px-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                <Compass className="w-3.5 h-3.5 stroke-[1.75] text-[#526071] dark:text-[#929BA9]" />
                <span>Cycle</span>
              </button>
            )}

            {/* Overflow Options Menu (Resurface Deleted Signal Switch & Reset) */}
            <div ref={optionsMenuRef}>
              <button
                type="button"
                data-testid="smc-signal-options-button"
                aria-expanded={isOptionsMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                title={tr('Pengaturan Sinyal', 'Signal Options')}
                className={`relative h-8 w-8 inline-flex items-center justify-center rounded-full border transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  isOptionsMenuOpen
                    ? 'bg-[#0F172A] text-white border-[#0F172A] dark:bg-white dark:text-[#050607] dark:border-white'
                    : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-[#0F172A] dark:text-[#F2F4F7]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.75]" />
                {deletedForModeCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#D97706] dark:bg-[#F59E0B] ring-2 ring-white dark:ring-[#101318]" />
                )}
              </button>

              {isOptionsMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-lg p-3 space-y-2.5 z-40"
                >
                  <div className="flex items-center justify-between border-b border-[#D9E2EC] dark:border-[#20252D] pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#526071] dark:text-[#929BA9]">
                      {tr('Pengaturan Sinyal', 'Signal Settings')}
                    </span>
                    {deletedForModeCount > 0 && (
                      <span className="text-[10px] font-mono-numbers font-semibold text-[#D97706] dark:text-[#F59E0B]">
                        {deletedForModeCount} {tr('arsip hapus', 'deleted')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={resurfaceDeletedSignals}
                    data-testid="smc-resurface-deleted-toggle"
                    onClick={handleToggleResurfaceDeleted}
                    className={`w-full px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      resurfaceDeletedSignals
                        ? 'bg-[#059669]/8 dark:bg-[#00A878]/12 border-[#059669]/30 dark:border-[#00A878]/30'
                        : 'bg-[#F8FAFC] dark:bg-[#161A22] border-[#D9E2EC] dark:border-[#20252D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                        <RotateCcw
                          className={`w-3.5 h-3.5 shrink-0 ${
                            resurfaceDeletedSignals
                              ? 'text-[#059669] dark:text-[#00A878]'
                              : 'text-[#526071] dark:text-[#929BA9]'
                          }`}
                        />
                        <span>
                          {tr('Munculkan Lagi Sinyal Dihapus', 'Re-surface Deleted Signals')}
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          resurfaceDeletedSignals
                            ? 'bg-[#059669] text-white dark:bg-[#00A878] dark:text-[#050607]'
                            : 'bg-[#E2E8F0] dark:bg-[#20252D] text-[#526071] dark:text-[#929BA9]'
                        }`}
                      >
                        {resurfaceDeletedSignals ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#526071] dark:text-[#929BA9] mt-1 leading-relaxed">
                      {resurfaceDeletedSignals
                        ? tr(
                            'Sinyal On Going/Previous yang dihapus muncul lagi otomatis jika analisa nanti menemukan setup sama.',
                            'Deleted On Going/Previous signals re-appear automatically if later analysis finds the same setup.'
                          )
                        : tr(
                            'Sinyal yang dihapus tetap tersembunyi permanen sampai arsip di-reset.',
                            'Deleted signals stay hidden permanently until the archive is reset.'
                          )}
                    </p>
                  </button>

                  {deletedForModeCount > 0 && (
                    <button
                      type="button"
                      data-testid="smc-clear-deleted-archive"
                      onClick={() => {
                        handleClearDeletedArchiveForMode();
                        setIsOptionsMenuOpen(false);
                      }}
                      className="w-full h-8 px-3 rounded-full border border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-xs font-semibold text-[#E11D48] dark:text-[#E05260] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {tr('Reset Arsip Sinyal Dihapus', 'Reset Deleted Tracker')} ({deletedForModeCount})
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              data-testid="smc-signal-pull-new-button"
              onClick={() => void handlePullNewRealtimeSignals()}
              disabled={isRefreshing || isLoading}
              className="h-8 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] hover:opacity-90 text-xs font-semibold transition-opacity disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              {isRefreshing || isLoading ? (
                <RefreshCw className="w-3.5 h-3.5 stroke-[2] animate-spin" />
              ) : (
                <PlusCircle className="w-3.5 h-3.5 stroke-[2]" />
              )}
              <span>{tr('Tarik Sinyal', 'Pull Signal')}</span>
            </button>
          </div>
        </div>

        {captureFeedback && (
          <div className="px-3.5 py-2 rounded-xl bg-[#059669]/10 dark:bg-[#00A878]/15 border border-[#059669]/30 dark:border-[#00A878]/30 text-xs font-semibold text-[#059669] dark:text-[#00A878]">
            {captureFeedback}
          </div>
        )}

        {/* Row 2: Editorial Underline Tabs + Compact Timeframe Switch */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#D9E2EC] dark:border-[#20252D]">
          <div
            role="tablist"
            aria-label="Sinyal Aktif atau Riwayat"
            className="flex items-center gap-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewSection === 'ACTIVE'}
              data-testid="smc-view-active-button"
              onClick={() => setViewSection('ACTIVE')}
              className={`pb-2.5 text-xs font-bold border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewSection === 'ACTIVE'
                  ? 'border-[#0F172A] dark:border-white text-[#0F172A] dark:text-[#F2F4F7]'
                  : 'border-transparent text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              <span>{tr('Sinyal Aktif', 'Active Signals')}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono-numbers bg-[#F1F5F9] dark:bg-[#161A22] text-[#0F172A] dark:text-[#F2F4F7]">
                {totalActiveAllDates}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewSection === 'HISTORY'}
              data-testid="smc-view-history-button"
              onClick={() => setViewSection('HISTORY')}
              className={`pb-2.5 text-xs font-bold border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewSection === 'HISTORY'
                  ? 'border-[#0F172A] dark:border-white text-[#0F172A] dark:text-[#F2F4F7]'
                  : 'border-transparent text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              <span>{tr('Riwayat TP / SL', 'TP / SL History')}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono-numbers bg-[#F1F5F9] dark:bg-[#161A22] text-[#0F172A] dark:text-[#F2F4F7]">
                {allHistorySignalsForMode.length}
              </span>
            </button>
          </div>

          <div
            role="group"
            aria-label="Mode Timeframe"
            className="mb-1.5 inline-flex items-center p-0.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D]"
          >
            <button
              type="button"
              data-testid="smc-signal-mode-scalp"
              onClick={() => setTradingMode('SCALP')}
              className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                tradingMode === 'SCALP'
                  ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                  : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              Scalping · M5–1H
            </button>
            <button
              type="button"
              data-testid="smc-signal-mode-swing"
              onClick={() => setTradingMode('SWING')}
              className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                tradingMode === 'SWING'
                  ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                  : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              Intraday · 1H–D1
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BARIS INFO UTAMA (REAL-TIME DARI CYCLE): SATU STRIP RINGKAS BERSEKAT
         ===================================================================== */}
      <div
        data-testid="smc-cycle-compass-card"
        className="rounded-xl border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#D9E2EC] dark:divide-[#20252D]"
      >
        {/* 1. BIAS DOMINAN & POSISI EQUILIBRIUM */}
        <div className="min-w-0 px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
              {tr('Bias Cycle', 'Cycle Bias')}
            </span>
            <span className="text-[10px] font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
              EQ ${cycleCompass.equilibriumPrice.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 font-mono-numbers tabular-nums">
            <span
              className={`text-sm font-bold ${
                activeDateCompass.dominantBias === 'BULLISH'
                  ? 'text-[#059669] dark:text-[#00A878]'
                  : activeDateCompass.dominantBias === 'BEARISH'
                  ? 'text-[#E11D48] dark:text-[#E05260]'
                  : 'text-[#D97706] dark:text-[#F59E0B]'
              }`}
            >
              {activeDateCompass.dominantBias}
              {activeDateCompass.isLiveCycle &&
              typeof cycleCompass.cycleUptrendPct === 'number' &&
              typeof cycleCompass.cycleDowntrendPct === 'number'
                ? activeDateCompass.dominantBias === 'BULLISH'
                  ? ` ${cycleCompass.cycleUptrendPct}%`
                  : activeDateCompass.dominantBias === 'BEARISH'
                  ? ` ${cycleCompass.cycleDowntrendPct}%`
                  : ` ${cycleCompass.cycleUptrendPct}%/${cycleCompass.cycleDowntrendPct}%`
                : ''}
            </span>
            <span className="text-[11px] font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
              {activeDateCompass.pdZone} {activeDateCompass.positionPct.toFixed(0)}%
            </span>
          </div>
          {cycleCompass.rawMacroContext?.macroSourceLabelId && (
            <p className="text-[10px] text-[#526071] dark:text-[#929BA9] font-mono-numbers truncate">
              Makro: {cycleCompass.rawMacroContext.fundamentalBias} ·{' '}
              {cycleCompass.rawMacroContext.macroSourceLabelId}
            </p>
          )}
        </div>

        {/* 2. INDIKASI VALIDASI CHoCH / MSS */}
        <div
          data-testid="smc-choch-indication-card"
          className="min-w-0 px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col justify-between gap-1"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
              {tradingMode === 'SCALP'
                ? tr('Indikasi CHoCH · M5/M15', 'CHoCH · M5/M15')
                : tr('Indikasi CHoCH · 1H', 'CHoCH · 1H')}
            </span>
            <span className="text-[10px] font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
              {selectedSide === 'BUY'
                ? twoStage.narrowPullbackHighToBreak
                  ? `PB $${twoStage.narrowPullbackHighToBreak.toFixed(1)}`
                  : twoStage.referenceLhPrice
                  ? `LH $${twoStage.referenceLhPrice.toFixed(1)}`
                  : ''
                : twoStage.narrowPullbackLowToBreak
                ? `PB $${twoStage.narrowPullbackLowToBreak.toFixed(1)}`
                : twoStage.referenceHlPrice
                ? `HL $${twoStage.referenceHlPrice.toFixed(1)}`
                : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-bold uppercase font-mono-numbers truncate ${
                twoStage.stage === 'STAGE_2_CHOCH_BULLISH' ||
                twoStage.stage === 'STAGE_2_CHOCH_BEARISH' ||
                twoStage.narrowBullishChochValid ||
                twoStage.narrowBearishChochValid
                  ? 'text-[#059669] dark:text-[#00A878]'
                  : twoStage.isImpulsiveDropWithoutChoch || twoStage.isImpulsiveRallyWithoutChoch
                  ? 'text-[#E11D48] dark:text-[#E05260]'
                  : 'text-[#D97706] dark:text-[#F59E0B]'
              }`}
            >
              {twoStage.statusBadgeId}
            </span>
            <span className="text-[10px] font-mono-numbers font-semibold text-[#526071] dark:text-[#929BA9] shrink-0">
              {activeSidePlan.healthyObAudit.isHealthySmcOb ? 'OB+FVG ✓' : 'Cek OB+FVG'}
            </span>
          </div>
        </div>

        {/* 3. PRIORITAS SETUP */}
        <div className="min-w-0 px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
              {tr('Prioritas Setup', 'Priority Setup')}
            </span>
            <span className="text-[10px] font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
              {activeDateCompass.isLiveCycle ? 'LIVE CYCLE' : activeDateCompass.capturedTimeWib}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              data-testid="smc-priority-recommendation-badge"
              className={`inline-flex items-center gap-1 text-sm font-bold uppercase ${
                activeDateCompass.recommendedSide === 'BUY'
                  ? 'text-[#059669] dark:text-[#00A878]'
                  : 'text-[#E11D48] dark:text-[#E05260]'
              }`}
            >
              {activeDateCompass.recommendedSide === 'BUY' ? (
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownRight className="w-4 h-4 shrink-0" />
              )}
              <span>
                {activeDateCompass.recommendedSide === 'BUY'
                  ? tr('UTAMAKAN BUY', 'PRIORITIZE BUY')
                  : tr('UTAMAKAN SELL', 'PRIORITIZE SELL')}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 3: FILTER BAR RINGKAS (TANPA KAPSUL BERTUMPUK) + DRAWER TANGGAL
         ===================================================================== */}
      <div className="space-y-2.5">
        {viewSection === 'ACTIVE' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Segmented BUY vs SELL (Fluid Rounded-Full) */}
            <div
              role="tablist"
              aria-label="Pilih Opsi Buy atau Sell"
              className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex items-center p-0.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedSide === 'BUY'}
                data-testid="smc-signal-tab-buy"
                onClick={() => {
                  setHasUserToggledSide(true);
                  setSelectedSide('BUY');
                }}
                className={`h-8 sm:h-7 px-3 rounded-full text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  selectedSide === 'BUY'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                <span>BUY ({activeBuyCount})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedSide === 'SELL'}
                data-testid="smc-signal-tab-sell"
                onClick={() => {
                  setHasUserToggledSide(true);
                  setSelectedSide('SELL');
                }}
                className={`h-8 sm:h-7 px-3 rounded-full text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  selectedSide === 'SELL'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                <span>SELL ({activeSellCount})</span>
              </button>
            </div>

            {/* Filter Status Pill Bulat + Tombol Tanggal */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 flex-1 min-w-0">
              <div
                role="group"
                aria-label="Filter On Going, Sedang Diambil, atau Previous"
                className="flex flex-wrap items-center gap-1.5"
              >
                <button
                  type="button"
                  data-testid="smc-batch-filter-all"
                  onClick={() => setBatchFilter('ALL')}
                  className={`h-8 px-3 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    batchFilter === 'ALL'
                      ? 'bg-[#0F172A] border-[#0F172A] text-white dark:bg-white dark:border-white dark:text-[#050607]'
                      : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                  }`}
                >
                  Semua <span className="font-mono-numbers opacity-80">({allActiveSideCount})</span>
                </button>
                <button
                  type="button"
                  data-testid="smc-batch-filter-ongoing"
                  onClick={() => setBatchFilter('ON_GOING')}
                  className={`h-8 px-3 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    batchFilter === 'ON_GOING'
                      ? 'bg-[#059669]/15 dark:bg-[#00A878]/20 border-[#059669]/40 dark:border-[#00A878]/40 text-[#059669] dark:text-[#00A878]'
                      : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                  }`}
                >
                  On Going <span className="font-mono-numbers opacity-80">({onGoingSideCount})</span>
                </button>
                <button
                  type="button"
                  data-testid="smc-batch-filter-taken"
                  onClick={() => setBatchFilter('TAKEN')}
                  className={`h-8 px-3 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1 cursor-pointer ${
                    batchFilter === 'TAKEN'
                      ? 'bg-[#0284C7]/15 dark:bg-[#38BDF8]/20 border-[#0284C7]/40 dark:border-[#38BDF8]/40 text-[#0284C7] dark:text-[#38BDF8]'
                      : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                  }`}
                >
                  <span>{tr('Sedang Diambil', 'Taken')}</span>
                  <span className="font-mono-numbers opacity-80">({takenSideCount})</span>
                </button>
                <button
                  type="button"
                  data-testid="smc-batch-filter-previous"
                  onClick={() => setBatchFilter('PREVIOUS')}
                  className={`h-8 px-3 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    batchFilter === 'PREVIOUS'
                      ? 'bg-[#D97706]/15 dark:bg-[#F59E0B]/20 border-[#D97706]/40 dark:border-[#F59E0B]/40 text-[#B45309] dark:text-[#F59E0B]'
                      : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                  }`}
                >
                  Previous <span className="font-mono-numbers opacity-80">({previousSideCount})</span>
                </button>
              </div>

              {/* Compact On-Demand Date Filter Toggle */}
              <button
                type="button"
                data-testid="smc-signal-date-toggle-button"
                onClick={() => setIsDateFilterOpen((prev) => !prev)}
                className={`h-8 px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto ${
                  isDateFilterOpen || previousDateFilter !== 'ALL'
                    ? 'bg-[#D97706]/10 dark:bg-[#F59E0B]/15 border-[#D97706]/40 dark:border-[#F59E0B]/40 text-[#B45309] dark:text-[#F59E0B]'
                    : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {previousDateFilter === 'ALL'
                    ? tr('Tanggal', 'Date')
                    : formatDateKeyHuman(previousDateFilter, todayDateKey)}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Compact Fluid History Mode Switch: Semua | Hari Ini | Pilih Tanggal */}
            <div
              role="group"
              aria-label="Filter Riwayat TP / SL"
              className="w-full sm:w-auto flex flex-wrap sm:inline-flex items-center gap-1.5 sm:gap-0 sm:p-0.5 sm:rounded-full sm:bg-white sm:dark:bg-[#101318] sm:border sm:border-[#D9E2EC] sm:dark:border-[#20252D]"
            >
              <button
                type="button"
                data-testid="smc-history-filter-all"
                onClick={() => {
                  setHistoryDateFilterMode('ALL');
                  setIsDateFilterOpen(false);
                }}
                className={`flex-1 sm:flex-initial h-8 sm:h-7 px-3 rounded-full border sm:border-0 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  historyDateFilterMode === 'ALL'
                    ? 'bg-[#0F172A] border-[#0F172A] text-white dark:bg-white dark:border-white dark:text-[#050607]'
                    : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                {tr('Semua Tanggal', 'All Dates')} ({allHistorySignalsForMode.length})
              </button>

              <button
                type="button"
                data-testid="smc-history-filter-today"
                onClick={() => {
                  setHistoryDateFilterMode('TODAY');
                  setHistoryCustomDateKey(todayDateKey);
                  setIsDateFilterOpen(false);
                }}
                className={`flex-1 sm:flex-initial h-8 sm:h-7 px-3 rounded-full border sm:border-0 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  historyDateFilterMode === 'TODAY'
                    ? 'bg-[#0F172A] border-[#0F172A] text-white dark:bg-white dark:border-white dark:text-[#050607]'
                    : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                {tr('Hari Ini', 'Today')} ({todayHistoryCount})
              </button>

              <button
                type="button"
                data-testid="smc-history-filter-custom"
                onClick={() => {
                  setHistoryDateFilterMode('CUSTOM');
                  setIsDateFilterOpen(true);
                }}
                className={`flex-1 sm:flex-initial h-8 sm:h-7 px-3 rounded-full border sm:border-0 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  historyDateFilterMode === 'CUSTOM'
                    ? 'bg-[#D97706] border-[#D97706] text-white dark:bg-[#F59E0B] dark:border-[#F59E0B] dark:text-[#050607]'
                    : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                {tr('Pilih Tanggal', 'Choose Date')}
              </button>
            </div>

            <button
              type="button"
              data-testid="smc-signal-date-toggle-button"
              onClick={() => setIsDateFilterOpen((prev) => !prev)}
              className={`h-8 px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto ${
                isDateFilterOpen || historyDateFilterMode === 'CUSTOM'
                  ? 'bg-[#D97706]/10 dark:bg-[#F59E0B]/15 border-[#D97706]/40 dark:border-[#F59E0B]/40 text-[#B45309] dark:text-[#F59E0B]'
                  : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {historyDateFilterMode === 'CUSTOM'
                  ? formatDateKeyHuman(historyCustomDateKey, todayDateKey)
                  : tr('Kalender', 'Calendar')}
              </span>
            </button>
          </div>
        )}

        {/* Drawer Tanggal On-Demand (Terbuka saat user klik Tanggal / Pilih Tanggal / Kalender) */}
        {(isDateFilterOpen ||
          (viewSection === 'HISTORY' && historyDateFilterMode === 'CUSTOM')) && (
          <div
            data-testid="smc-signal-date-bar"
            className="rounded-xl border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] p-2.5 flex flex-wrap items-center justify-between gap-2"
          >
            {viewSection === 'ACTIVE' ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  <button
                    type="button"
                    data-testid="smc-date-pill-all-previous"
                    onClick={() => {
                      setSelectedDateKey(todayDateKey);
                      setPreviousDateFilter('ALL');
                    }}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      previousDateFilter === 'ALL'
                        ? 'bg-[#D97706] text-white dark:bg-[#F59E0B] dark:text-[#050607]'
                        : 'bg-[#F8FAFC] dark:bg-[#161A22] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] border border-[#D9E2EC] dark:border-[#20252D]'
                    }`}
                  >
                    <span>{tr('Semua Tanggal', 'All Dates')}</span>
                    <span className="font-mono-numbers opacity-85">
                      ({allActiveSignalsForMode.filter((r) => (r.batchStatus || 'ON_GOING') === 'PREVIOUS').length})
                    </span>
                  </button>

                  {availableDates.map((dKey) => {
                    const isSelected = previousDateFilter === dKey;
                    const countActive = storedSignals.filter(
                      (r) =>
                        r.dateKey === dKey &&
                        r.tradingMode === tradingMode &&
                        r.status === 'ACTIVE'
                    ).length;

                    return (
                      <button
                        key={dKey}
                        type="button"
                        data-testid={`smc-date-pill-${dKey}`}
                        onClick={() => {
                          setSelectedDateKey(dKey);
                          setPreviousDateFilter(dKey);
                        }}
                        className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                            : 'bg-[#F8FAFC] dark:bg-[#161A22] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] border border-[#D9E2EC] dark:border-[#20252D]'
                        }`}
                      >
                        <span>{formatDateKeyHuman(dKey, todayDateKey)}</span>
                        <span className="font-mono-numbers opacity-80">({countActive})</span>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="date"
                  aria-label="Pilih Tanggal Sinyal"
                  value={previousDateFilter !== 'ALL' ? previousDateFilter : selectedDateKey}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDateKey(e.target.value);
                      setPreviousDateFilter(e.target.value);
                    }
                  }}
                  className="h-8 px-3 w-full sm:w-auto rounded-full text-[11px] font-mono-numbers bg-[#F8FAFC] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] focus:outline-none shrink-0"
                />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                  {historyAvailableDates
                    .filter((dKey) => dKey !== todayDateKey || todayHistoryCount > 0)
                    .map((dKey) => {
                      const countHistOnDate = allHistorySignalsForMode.filter(
                        (r) => getSignalHistoryEffectiveDateKey(r) === dKey
                      ).length;
                      if (countHistOnDate === 0) return null;
                      const isSelectedCustom =
                        historyDateFilterMode === 'CUSTOM' && historyCustomDateKey === dKey;

                      return (
                        <button
                          key={`hist-pill-${dKey}`}
                          type="button"
                          data-testid={`smc-history-date-pill-${dKey}`}
                          onClick={() => {
                            setHistoryCustomDateKey(dKey);
                            setHistoryDateFilterMode('CUSTOM');
                          }}
                          className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                            isSelectedCustom
                              ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                              : 'bg-[#F8FAFC] dark:bg-[#161A22] text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] border border-[#D9E2EC] dark:border-[#20252D]'
                          }`}
                        >
                          <span>{formatDateKeyHuman(dKey, todayDateKey)}</span>
                          <span className="font-mono-numbers opacity-80">({countHistOnDate})</span>
                        </button>
                      );
                    })}
                </div>

                <input
                  type="date"
                  data-testid="smc-history-date-picker"
                  aria-label="Pilih Tanggal Riwayat TP / SL"
                  value={historyCustomDateKey}
                  onChange={(e) => {
                    if (e.target.value) {
                      setHistoryCustomDateKey(e.target.value);
                      setHistoryDateFilterMode('CUSTOM');
                    }
                  }}
                  className="h-8 px-3 w-full sm:w-auto rounded-full text-[11px] font-mono-numbers bg-[#F8FAFC] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] focus:outline-none shrink-0"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          VIEW 1: DAFTAR KELOMPOK SINYAL AKTIF (ON GOING + PREVIOUS DATA PER TANGGAL)
         ===================================================================== */}
      {viewSection === 'ACTIVE' && (() => {
        const renderSignalCard = (group: SmcStoredSignalRecord) => {
          const isTierAPlus = group.tier === 'A_PLUS';
          const isTierB = group.tier === 'B_STANDARD';
          const isPreviousBatch = (group.batchStatus || 'ON_GOING') === 'PREVIOUS';
          const cardDateLabel = formatDateKeyHuman(group.dateKey, todayDateKey);

          return (
            <div
              key={group.uid}
              data-testid={`smc-group-card-${group.uid}`}
              className={`rounded-xl border bg-white dark:bg-[#101318] p-4 font-mono-numbers tabular-nums transition-colors flex flex-col justify-between ${
                group.isTaken
                  ? 'border-[#0284C7]/60 dark:border-[#38BDF8]/55 ring-1 ring-[#0284C7]/20 dark:ring-[#38BDF8]/20'
                  : isPreviousBatch
                  ? 'border-[#D9E2EC] dark:border-[#20252D] opacity-95'
                  : isTierAPlus
                  ? 'border-[#0F172A]/45 dark:border-white/35'
                  : 'border-[#D9E2EC] dark:border-[#20252D]'
              }`}
            >
              <div>
                {/* Micro Status Eyebrow + Quick Action */}
                <div className="flex items-center justify-between gap-2 mb-2 font-sans">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 text-[10px] font-semibold uppercase tracking-[0.06em]">
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        isPreviousBatch
                          ? 'text-[#B45309] dark:text-[#F59E0B]'
                          : 'text-[#059669] dark:text-[#00A878]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isPreviousBatch
                            ? 'bg-[#D97706] dark:bg-[#F59E0B]'
                            : 'bg-[#059669] dark:bg-[#00A878]'
                        }`}
                      />
                      <span>
                        {isPreviousBatch
                          ? `PREVIOUS · ${cardDateLabel}`
                          : 'ON GOING'}
                      </span>
                    </span>

                    {group.isTaken && (
                      <span className="text-[#0284C7] dark:text-[#38BDF8]">
                        · {tr('DIAMBIL', 'TAKEN')}
                      </span>
                    )}

                    {group.resurfacedFromBatch && (
                      <span
                        data-testid={`smc-resurfaced-badge-${group.uid}`}
                        className="inline-flex items-center gap-0.5 text-[#0369A1] dark:text-[#38BDF8]"
                      >
                        · {group.resurfacedFromBatch === 'PREVIOUS'
                          ? tr('MUNCUL LAGI (EKS PREV)', 'RE-SHOWN (EX PREV)')
                          : tr('MUNCUL LAGI', 'RE-SHOWN')}
                      </span>
                    )}
                  </div>

                  {isPreviousBatch && (
                    <button
                      type="button"
                      onClick={() => handleToggleBatchStatus(group.uid, 'ON_GOING')}
                      className="px-2.5 py-0.5 rounded-full border border-[#059669]/30 dark:border-[#00A878]/30 bg-[#059669]/8 dark:bg-[#00A878]/12 text-[10px] font-sans font-semibold text-[#059669] dark:text-[#00A878] hover:bg-[#059669]/15 dark:hover:bg-[#00A878]/20 transition-colors shrink-0 cursor-pointer"
                    >
                      {tr('Ke On Going', 'To On Going')}
                    </button>
                  )}
                </div>

                {/* Title + Single Tier Label */}
                <div className="flex items-start justify-between gap-2 pb-2.5 mb-3 border-b border-[#D9E2EC] dark:border-[#20252D]">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F2F4F7] truncate">
                      {group.headerTitle}
                    </h2>
                    <span className="text-[10px] text-[#526071] dark:text-[#929BA9] font-sans block mt-0.5 truncate">
                      {cardDateLabel} · {group.createdTimeWib} · Spot ${group.spotPriceAtCapture.toFixed(1)}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      isTierAPlus
                        ? 'bg-[#059669]/10 dark:bg-[#00A878]/15 text-[#059669] dark:text-[#00A878]'
                        : isTierB
                        ? 'bg-[#D97706]/10 dark:bg-[#F59E0B]/15 text-[#D97706] dark:text-[#F59E0B]'
                        : 'bg-[#E11D48]/10 dark:bg-[#E05260]/15 text-[#E11D48] dark:text-[#E05260]'
                    }`}
                  >
                    {isTierAPlus ? 'A+' : isTierB ? 'SETUP B' : 'HIGH RISK'}
                  </span>
                </div>

                {/* Clean Tabular Price Matrix */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2 pb-1">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans font-medium">
                      Entry Limit
                    </span>
                    <span className="text-base font-bold tracking-tight text-[#0F172A] dark:text-[#F2F4F7]">
                      {group.entryLimit.toFixed(1)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      SL
                    </span>
                    <span className="font-semibold text-[#E11D48] dark:text-[#E05260]">
                      {group.stopLoss.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">
                        ({group.slPips}p + {group.slPoints}pt)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#D9E2EC]/70 dark:border-[#20252D]/70">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP 1
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {group.tp1.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">(1:1)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP 2
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {group.tp2.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">(1:2)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP Max
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {group.tpMax.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">({group.tpMaxRrLabel})</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* =========================================================
                  TOMBOL AKSI ROUNDED-FULL & RESPONSIF: AMBIL SINYAL & HIT TP/SL
                 ========================================================= */}
              <div className="mt-3.5 pt-3 border-t border-[#D9E2EC] dark:border-[#20252D] space-y-2 font-sans">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`smc-take-signal-${group.uid}`}
                    onClick={() => handleToggleTakeSignal(group.uid)}
                    className={`flex-1 h-8 px-3.5 rounded-full text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      group.isTaken
                        ? 'bg-[#0284C7] text-white dark:bg-[#38BDF8] dark:text-[#050607]'
                        : 'bg-[#F8FAFC] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#E2E8F0] dark:hover:bg-[#20252D]'
                    }`}
                  >
                    <BookmarkCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {group.isTaken
                        ? tr('Sedang Diambil', 'Signal Taken')
                        : tr('Ambil Sinyal', 'Take Signal')}
                    </span>
                  </button>

                  <button
                    type="button"
                    title={tr('Hapus sinyal ini', 'Delete this signal')}
                    onClick={() => handleDeleteSignal(group.uid)}
                    className="h-8 w-8 rounded-full shrink-0 inline-flex items-center justify-center border border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Pill Bulat Hasil: TP 1 | TP 2 | Max | SL (Fluid Grid) */}
                <div className="grid grid-cols-2 min-[340px]:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    data-testid={`smc-hit-tp1-${group.uid}`}
                    onClick={() => handleMarkSignalOutcome(group, 'HIT_TP1')}
                    className="h-7 px-2 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F8FAFC] dark:bg-[#161A22] text-[10px] font-semibold text-[#059669] dark:text-[#00A878] hover:bg-[#059669]/12 dark:hover:bg-[#00A878]/15 hover:border-[#059669]/35 dark:hover:border-[#00A878]/35 transition-colors cursor-pointer"
                  >
                    TP 1
                  </button>
                  <button
                    type="button"
                    data-testid={`smc-hit-tp2-${group.uid}`}
                    onClick={() => handleMarkSignalOutcome(group, 'HIT_TP2')}
                    className="h-7 px-2 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F8FAFC] dark:bg-[#161A22] text-[10px] font-semibold text-[#059669] dark:text-[#00A878] hover:bg-[#059669]/12 dark:hover:bg-[#00A878]/15 hover:border-[#059669]/35 dark:hover:border-[#00A878]/35 transition-colors cursor-pointer"
                  >
                    TP 2
                  </button>
                  <button
                    type="button"
                    data-testid={`smc-hit-tpmax-${group.uid}`}
                    onClick={() => handleMarkSignalOutcome(group, 'HIT_TP_MAX')}
                    className="h-7 px-2 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F8FAFC] dark:bg-[#161A22] text-[10px] font-semibold text-[#059669] dark:text-[#00A878] hover:bg-[#059669]/12 dark:hover:bg-[#00A878]/15 hover:border-[#059669]/35 dark:hover:border-[#00A878]/35 transition-colors cursor-pointer"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    data-testid={`smc-hit-sl-${group.uid}`}
                    onClick={() => handleMarkSignalOutcome(group, 'HIT_SL')}
                    className="h-7 px-2 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F8FAFC] dark:bg-[#161A22] text-[10px] font-semibold text-[#E11D48] dark:text-[#E05260] hover:bg-[#E11D48]/12 dark:hover:bg-[#E05260]/15 hover:border-[#E11D48]/35 dark:hover:border-[#E05260]/35 transition-colors cursor-pointer"
                  >
                    SL
                  </button>
                </div>
              </div>
            </div>
          );
        };

        if (activeSideSignals.length === 0) {
          return (
            <div className="rounded-xl border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] p-6 text-center space-y-3">
              <p className="text-xs font-semibold text-[#526071] dark:text-[#929BA9]">
                {tr(
                  `Tidak ada sinyal ${selectedSide} (${
                    batchFilter === 'ON_GOING'
                      ? 'On Going'
                      : batchFilter === 'TAKEN'
                      ? 'Sedang Diambil'
                      : batchFilter === 'PREVIOUS'
                      ? previousDateFilter === 'ALL'
                        ? 'Previous Data'
                        : `Previous Data · ${formatDateKeyHuman(previousDateFilter, todayDateKey)}`
                      : 'Aktif'
                  }).`,
                  `No ${selectedSide} signals available.`
                )}
              </p>
              <button
                type="button"
                onClick={() => void handlePullNewRealtimeSignals()}
                className="h-9 px-4 py-1.5 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{tr('+ Tarik Sinyal Baru Hari Ini', '+ Pull New Signal Today')}</span>
              </button>
            </div>
          );
        }

        const displayOnGoingSignals =
          batchFilter === 'ALL' ? untakenOnGoingSideSignals : onGoingSideSignals;
        const displayPreviousGroups =
          batchFilter === 'ALL' ? groupedUntakenPreviousSideSignals : groupedPreviousSideSignals;
        const displayPreviousCount =
          batchFilter === 'ALL'
            ? untakenFilteredPreviousSideSignals.length
            : filteredPreviousSideSignals.length;
        const displayPreviousChipPool =
          batchFilter === 'ALL'
            ? allPreviousSideSignals.filter((r) => !r.isTaken)
            : allPreviousSideSignals;

        return (
          <div data-testid={`smc-signal-groups-${selectedSide.toLowerCase()}`} className="space-y-6">
            {/* BAGIAN 0: SEDANG DIAMBIL (PINNED TOP — GABUNGAN ON GOING & PREVIOUS YANG DIAMBIL) */}
            {(batchFilter === 'ALL' || batchFilter === 'TAKEN') && takenSideSignals.length > 0 && (
              <div data-testid="smc-taken-signals-section" className="space-y-3">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#0284C7]/35 dark:border-[#38BDF8]/30">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-[#38BDF8] inline-flex items-center gap-1.5">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>
                      {tr('SEDANG DIAMBIL · PRIORITAS POSISI AKTIF', 'TAKEN SIGNALS · ACTIVE TRADES')} ({takenSideSignals.length})
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,285px),1fr))] gap-3.5 sm:gap-4">
                  {takenSideSignals.map(renderSignalCard)}
                </div>
              </div>
            )}

            {/* BAGIAN 1: ON GOING (DATA TERBARU) */}
            {(batchFilter === 'ALL' || batchFilter === 'ON_GOING') && displayOnGoingSignals.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#D9E2EC] dark:border-[#20252D]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#059669] dark:text-[#00A878]">
                    {tr('ON GOING · DATA TERBARU', 'ON GOING · LATEST SIGNALS')} ({displayOnGoingSignals.length})
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,285px),1fr))] gap-3.5 sm:gap-4">
                  {displayOnGoingSignals.map(renderSignalCard)}
                </div>
              </div>
            )}

            {/* BAGIAN 2: PREVIOUS DATA (GABUNGAN HARI INI & TANGGAL SEBELUMNYA, DIKELOMPOKKAN PER TANGGAL) */}
            {(batchFilter === 'ALL' || batchFilter === 'PREVIOUS') &&
              displayPreviousGroups.length > 0 && (
                <div data-testid="smc-previous-data-grouped" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#D9E2EC] dark:border-[#20252D]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#B45309] dark:text-[#F59E0B]">
                      {tr(
                        'PREVIOUS DATA · GABUNGAN HARI INI & HARI SEBELUMNYA',
                        'PREVIOUS DATA · TODAY & PRIOR DAYS COMBINED'
                      )}{' '}
                      ({displayPreviousCount})
                    </span>

                    {/* Filter Tanggal Cepat di dalam Previous Data */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviousDateFilter('ALL')}
                        className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold transition-colors cursor-pointer ${
                          previousDateFilter === 'ALL'
                            ? 'bg-[#D97706]/15 dark:bg-[#F59E0B]/20 border-[#D97706]/35 dark:border-[#F59E0B]/35 text-[#B45309] dark:text-[#F59E0B]'
                            : 'border-transparent text-[#526071] dark:text-[#929BA9] hover:bg-[#F1F5F9] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                        }`}
                      >
                        Semua ({displayPreviousChipPool.length})
                      </button>
                      {previousAvailableDates.map((dKey) => {
                        const dateCount = displayPreviousChipPool.filter((r) => r.dateKey === dKey).length;
                        if (dateCount === 0) return null;
                        return (
                          <button
                            key={`prev-sub-${dKey}`}
                            type="button"
                            onClick={() => setPreviousDateFilter(dKey)}
                            className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold transition-colors cursor-pointer ${
                              previousDateFilter === dKey
                                ? 'bg-[#0F172A]/10 dark:bg-white/15 border-[#0F172A]/20 dark:border-white/25 text-[#0F172A] dark:text-white'
                                : 'border-transparent text-[#526071] dark:text-[#929BA9] hover:bg-[#F1F5F9] dark:hover:bg-[#161A22] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                            }`}
                          >
                            {formatDateKeyHuman(dKey, todayDateKey)} ({dateCount})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-5">
                    {displayPreviousGroups.map(([dateKey, recordsOnDate]) => (
                      <div key={`prev-group-${dateKey}`} className="space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-[#526071] dark:text-[#929BA9]">
                          <span>
                            {dateKey === todayDateKey
                              ? tr(`Hari Ini · ${formatDateKeyHuman(dateKey, todayDateKey)}`, `Today · ${formatDateKeyHuman(dateKey, todayDateKey)}`)
                              : formatDateKeyHuman(dateKey, todayDateKey)}
                          </span>
                          <span className="font-mono-numbers opacity-80">
                            {recordsOnDate.length} {tr('sinyal', 'signals')}
                          </span>
                        </div>

                        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,285px),1fr))] gap-3.5 sm:gap-4">
                          {recordsOnDate.map(renderSignalCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        );
      })()}

      {/* =====================================================================
          VIEW 2: DAFTAR RIWAYAT SINYAL (SEMUA TANGGAL / HARI INI / PILIH TANGGAL)
         ===================================================================== */}
      {viewSection === 'HISTORY' && (() => {
        const historyBannerLabel =
          historyDateFilterMode === 'ALL'
            ? tr('SEMUA TANGGAL (GABUNGAN)', 'ALL DATES (COMBINED)')
            : historyDateFilterMode === 'TODAY'
            ? formatDateKeyHuman(todayDateKey, todayDateKey)
            : formatDateKeyHuman(historyCustomDateKey, todayDateKey);

        const renderHistoryCard = (item: SmcStoredSignalRecord) => {
          const isWin = item.status !== 'HIT_SL';
          const statusBadgeLabel =
            item.status === 'HIT_TP1'
              ? 'HIT TP 1 (1:1)'
              : item.status === 'HIT_TP2'
              ? 'HIT TP 2 (1:2)'
              : item.status === 'HIT_TP_MAX'
              ? `HIT TP MAX (${item.tpMaxRrLabel})`
              : 'HIT SL';
          const effectiveClosedDateKey = getSignalHistoryEffectiveDateKey(item);

          return (
            <div
              key={item.uid}
              data-testid={`smc-history-card-${item.uid}`}
              className={`rounded-xl border bg-white dark:bg-[#101318] p-4 font-mono-numbers tabular-nums flex flex-col justify-between ${
                isWin
                  ? 'border-[#059669]/40 dark:border-[#00A878]/40'
                  : 'border-[#E11D48]/40 dark:border-[#E05260]/40'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 pb-2.5 mb-3 border-b border-[#D9E2EC] dark:border-[#20252D]">
                  <div className="space-y-0.5 min-w-0">
                    <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F2F4F7] truncate">
                      {item.headerTitle}
                    </h2>
                    <div className="text-[10px] text-[#526071] dark:text-[#929BA9] font-sans leading-relaxed">
                      <div>
                        Input {formatDateKeyHuman(item.dateKey, todayDateKey)} · {item.createdTimeWib}
                      </div>
                      <div>
                        Selesai {formatDateKeyHuman(effectiveClosedDateKey, todayDateKey)} ·{' '}
                        {item.closedTimeWib || '—'}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                      isWin
                        ? 'bg-[#059669]/12 text-[#059669] dark:text-[#00A878]'
                        : 'bg-[#E11D48]/12 text-[#E11D48] dark:text-[#E05260]'
                    }`}
                  >
                    {isWin ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    <span>{statusBadgeLabel}</span>
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2 pb-1">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans font-medium">
                      Entry Limit
                    </span>
                    <span className="text-base font-bold tracking-tight text-[#0F172A] dark:text-[#F2F4F7]">
                      {item.entryLimit.toFixed(1)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      SL
                    </span>
                    <span className="font-semibold text-[#E11D48] dark:text-[#E05260]">
                      {item.stopLoss.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">
                        ({item.slPips}p + {item.slPoints}pt)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#D9E2EC]/70 dark:border-[#20252D]/70">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP 1
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {item.tp1.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">(1:1)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP 2
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {item.tp2.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">(1:2)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans">
                      TP Max
                    </span>
                    <span className="font-semibold text-[#059669] dark:text-[#00A878]">
                      {item.tpMax.toFixed(1)}{' '}
                      <span className="text-[10px] opacity-75 font-normal">({item.tpMaxRrLabel})</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#D9E2EC]/70 dark:border-[#20252D]/70">
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] font-sans font-medium">
                      Hasil
                    </span>
                    <span
                      className={`font-bold ${
                        (item.resultPips ?? 0) >= 0
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : 'text-[#E11D48] dark:text-[#E05260]'
                      }`}
                    >
                      {(item.resultPips ?? 0) >= 0
                        ? `+${item.resultPips} pips`
                        : `${item.resultPips} pips`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 pt-3 border-t border-[#D9E2EC] dark:border-[#20252D] flex items-center justify-between gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => handleRestoreToActive(item.uid)}
                  className="flex-1 h-8 px-3.5 rounded-full text-[11px] font-semibold bg-[#F8FAFC] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#E2E8F0] dark:hover:bg-[#20252D] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span className="truncate">{tr('Kembalikan ke Aktif', 'Restore to Active')}</span>
                </button>

                <button
                  type="button"
                  title={tr('Hapus riwayat ini', 'Delete this history item')}
                  onClick={() => handleDeleteSignal(item.uid)}
                  className="h-8 w-8 rounded-full shrink-0 inline-flex items-center justify-center border border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-4">
            {/* Baris Rekap Gabungan / Harian Ringkas */}
            <div
              data-testid="smc-history-summary-bar"
              className="rounded-xl border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono-numbers"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="font-sans font-bold uppercase text-[#526071] dark:text-[#929BA9]">
                  {historyBannerLabel} ({historySummary.totalClosed}{' '}
                  {tr('sinyal', 'signals')})
                </span>
                <span className="font-bold text-[#059669] dark:text-[#00A878]">
                  Hit TP: {historySummary.tpCount}
                </span>
                <span className="font-bold text-[#E11D48] dark:text-[#E05260]">
                  Hit SL: {historySummary.slCount}
                </span>
                <span className="font-bold text-[#0F172A] dark:text-[#F2F4F7]">
                  Win Rate: {historySummary.winRate}%
                </span>
              </div>
              <div
                className={`font-bold text-sm ${
                  historySummary.netPips >= 0
                    ? 'text-[#059669] dark:text-[#00A878]'
                    : 'text-[#E11D48] dark:text-[#E05260]'
                }`}
              >
                Net:{' '}
                {historySummary.netPips >= 0
                  ? `+${historySummary.netPips}`
                  : historySummary.netPips}{' '}
                pips
              </div>
            </div>

            {filteredHistorySignals.length === 0 ? (
              <div className="rounded-xl border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] p-6 text-center text-xs font-semibold text-[#526071] dark:text-[#929BA9]">
                {historyDateFilterMode === 'ALL'
                  ? tr(
                      'Belum ada sinyal yang ditandai Hit TP atau Hit SL di tanggal mana pun.',
                      'No signals marked Hit TP or Hit SL on any date yet.'
                    )
                  : historyDateFilterMode === 'TODAY'
                  ? tr(
                      'Belum ada sinyal yang ditandai Hit TP atau Hit SL pada hari ini.',
                      'No signals marked Hit TP or Hit SL today yet.'
                    )
                  : tr(
                      'Belum ada sinyal yang ditandai Hit TP atau Hit SL pada tanggal terpilih.',
                      'No signals marked Hit TP or Hit SL on the selected date yet.'
                    )}
              </div>
            ) : historyDateFilterMode === 'ALL' ? (
              <div className="space-y-5">
                {groupedHistorySignals.map(([dateKey, recordsOnDate]) => (
                  <div key={`hist-group-${dateKey}`} className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#526071] dark:text-[#929BA9]">
                      <span>
                        {dateKey === todayDateKey
                          ? tr(
                              `Selesai Hari Ini · ${formatDateKeyHuman(dateKey, todayDateKey)}`,
                              `Closed Today · ${formatDateKeyHuman(dateKey, todayDateKey)}`
                            )
                          : formatDateKeyHuman(dateKey, todayDateKey)}
                      </span>
                      <span className="font-mono-numbers opacity-80">
                        {recordsOnDate.length} {tr('sinyal', 'signals')}
                      </span>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,285px),1fr))] gap-3.5 sm:gap-4">
                      {recordsOnDate.map(renderHistoryCard)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,285px),1fr))] gap-3.5 sm:gap-4">
                {filteredHistorySignals.map(renderHistoryCard)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
