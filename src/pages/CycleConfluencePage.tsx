/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  RefreshCw,
  ChevronDown,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Clock,
  KeyRound,
  Wifi,
  WifiOff,
  Info,
  X,
} from 'lucide-react';
import { setNewsCycleOfflineMode } from '../utils/apiConfig';
import {
  XAUUSD_SEASONALITY,
  MONTH_LABELS_ID,
} from '../data/xauusdSeasonality';
import {
  evaluateConfluenceMaster,
  getSessionLabelId,
  DEFAULT_SESSION_HOURS_WIB,
  loadStoredSessionHoursWib,
  saveStoredSessionHoursWib,
  formatWibHour,
  formatSessionWindowWib,
  MANUAL_AMD_OVERRIDE_OPTIONS,
  MANUAL_AMD_OVERRIDE_CHANGE_EVENT,
  MANUAL_AMD_OVERRIDE_STORAGE_KEY,
  loadStoredManualAmdOverride,
  saveStoredManualAmdOverride,
  type ManualAmdOverrideMode,
  type SessionHoursWibConfig,
  type TradingSessionName,
  type ConfluenceViewMode,
  type TradingConfluenceMode,
} from '../utils/confluenceEngine';
import {
  useCycleConfluenceData,
  getRawStoredTwelveDataKey,
  type TwelveDataConfluenceInterval,
} from '../hooks/useCycleConfluenceData';
import { useTheme } from '../utils/theme';
import { useLanguage } from '../utils/language';

const WIB_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
const SESSION_KEYS: TradingSessionName[] = ['ASIA', 'LONDON', 'NEW_YORK'];

interface CycleConfluencePageProps {
  isActive?: boolean;
}

const CHART_TF_PILLS: Record<
  TradingConfluenceMode,
  Array<{ id: TwelveDataConfluenceInterval; label: string }>
> = {
  SWING: [
    { id: '1h', label: '1H' },
    { id: '4h', label: '4H' },
    { id: '1day', label: 'D1' },
  ],
  SCALP: [
    { id: '5min', label: '5m' },
    { id: '15min', label: '15m' },
    { id: '1h', label: '1H' },
  ],
};

function getHeatmapCellStyle(val: number | undefined, isCurrentLiveCell: boolean): string {
  if (val === undefined || !Number.isFinite(val)) {
    return 'bg-transparent text-[#526071] dark:text-[#929BA9]';
  }
  const ring = isCurrentLiveCell
    ? ' ring-1 ring-[#0F172A] dark:ring-[#F2F4F7] font-bold'
    : '';
  if (val >= 6) {
    return `bg-[#059669]/20 dark:bg-[#00A878]/25 text-[#059669] dark:text-[#00A878]${ring}`;
  }
  if (val >= 2) {
    return `bg-[#059669]/12 dark:bg-[#00A878]/15 text-[#059669] dark:text-[#00A878]${ring}`;
  }
  if (val > 0) {
    return `bg-[#059669]/[0.06] dark:bg-[#00A878]/10 text-[#059669] dark:text-[#00A878]${ring}`;
  }
  if (val <= -6) {
    return `bg-[#E11D48]/20 dark:bg-[#E05260]/25 text-[#E11D48] dark:text-[#E05260]${ring}`;
  }
  if (val <= -2) {
    return `bg-[#E11D48]/12 dark:bg-[#E05260]/15 text-[#E11D48] dark:text-[#E05260]${ring}`;
  }
  if (val < 0) {
    return `bg-[#E11D48]/[0.06] dark:bg-[#E05260]/10 text-[#E11D48] dark:text-[#E05260]${ring}`;
  }
  return `bg-white dark:bg-[#101318] text-[#526071] dark:text-[#929BA9]${ring}`;
}

export const CycleConfluencePage: React.FC<CycleConfluencePageProps> = ({
  isActive = true,
}) => {
  const { isDark } = useTheme();
  const { isEn, tr } = useLanguage();

  const [viewMode, setViewMode] = useState<ConfluenceViewMode>('FULL');
  const [tradingMode, setTradingMode] = useState<TradingConfluenceMode>('SWING');
  const [selectedChartTf, setSelectedChartTf] =
    useState<TwelveDataConfluenceInterval>('1h');
  const [isMtfTableOpen, setIsMtfTableOpen] = useState<boolean>(false);
  const [isChartOpen, setIsChartOpen] = useState<boolean>(false);
  const [isCycleDetailOpen, setIsCycleDetailOpen] = useState<boolean>(false);
  const [isApiKeyPanelOpen, setIsApiKeyPanelOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getRawStoredTwelveDataKey());
  const [sessionConfig, setSessionConfig] = useState<SessionHoursWibConfig>(() =>
    loadStoredSessionHoursWib()
  );
  const [sessionDraft, setSessionDraft] = useState<SessionHoursWibConfig>(() =>
    loadStoredSessionHoursWib()
  );
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState<boolean>(false);
  const [showPlaybookGuide, setShowPlaybookGuide] = useState<boolean>(false);
  const [manualAmdOverride, setManualAmdOverride] = useState<ManualAmdOverrideMode>(() =>
    loadStoredManualAmdOverride()
  );

  useEffect(() => {
    if (!showPlaybookGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPlaybookGuide(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPlaybookGuide]);

  // Sync Manual AMD Override across tabs/pages if updated from localStorage or custom event
  useEffect(() => {
    const syncOverride = () => {
      setManualAmdOverride(loadStoredManualAmdOverride());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === MANUAL_AMD_OVERRIDE_STORAGE_KEY) {
        syncOverride();
      }
    };
    window.addEventListener(MANUAL_AMD_OVERRIDE_CHANGE_EVENT, syncOverride);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(MANUAL_AMD_OVERRIDE_CHANGE_EVENT, syncOverride);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleSelectManualAmdOverride = (mode: ManualAmdOverrideMode) => {
    setManualAmdOverride(mode);
    saveStoredManualAmdOverride(mode);
  };

  // Sync default chart trigger timeframe cleanly when switching SWING <-> SCALP
  useEffect(() => {
    setSelectedChartTf(tradingMode === 'SWING' ? '1h' : '15min');
  }, [tradingMode]);

  const {
    candlesByTf,
    macroBias,
    macroAnalyzedAt,
    livePrice,
    isLoading,
    isRefreshing,
    error,
    cooldownNotice,
    lastUpdatedAt,
    hasStoredApiKey,
    twelveDataStatus,
    twelveDataError,
    candleSource,
    isMarketOpen,
    marketStatusText,
    isOfflineMode,
    refresh,
    updateApiKeyAndReload,
    loadSampleOrCachedCandles,
  } = useCycleConfluenceData(tradingMode, isActive);

  const handleToggleOfflineMode = () => {
    setNewsCycleOfflineMode(!isOfflineMode);
  };

  const result = useMemo(
    () =>
      evaluateConfluenceMaster({
        viewMode,
        tradingMode,
        livePrice,
        macroBias,
        candlesByTf,
        sessionConfig,
        manualAmdOverride,
      }),
    [viewMode, tradingMode, livePrice, macroBias, candlesByTf, sessionConfig, manualAmdOverride]
  );

  // Active trigger timeframe data for the collapsible mini-chart
  const chartCandles = useMemo(
    () => candlesByTf[selectedChartTf] || [],
    [candlesByTf, selectedChartTf]
  );
  const chartSmc = useMemo(
    () => result.smcByTimeframe[selectedChartTf] || result.ltfAnalysis || result.htfAnalysis,
    [result, selectedChartTf]
  );

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Initialize & clean up read-only lightweight-charts instance when collapsible section is open
  useEffect(() => {
    if (!isChartOpen) {
      if (chartApiRef.current) {
        chartApiRef.current.remove();
        chartApiRef.current = null;
        candleSeriesRef.current = null;
        priceLinesRef.current = [];
      }
      return;
    }

    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 340,
      height: 280,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#0B0E13' : '#FFFFFF',
        },
        textColor: isDark ? '#929BA9' : '#526071',
        fontFamily: "'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(32, 37, 45, 0.7)' : 'rgba(217, 226, 236, 0.6)',
        },
        horzLines: {
          color: isDark ? 'rgba(32, 37, 45, 0.7)' : 'rgba(217, 226, 236, 0.6)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isDark ? '#20252D' : '#D9E2EC',
      },
      timeScale: {
        borderColor: isDark ? '#20252D' : '#D9E2EC',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: isDark ? '#00A878' : '#059669',
      downColor: isDark ? '#E05260' : '#E11D48',
      borderVisible: true,
      borderUpColor: isDark ? '#00A878' : '#059669',
      borderDownColor: isDark ? '#E05260' : '#E11D48',
      wickUpColor: isDark ? '#00A878' : '#059669',
      wickDownColor: isDark ? '#E05260' : '#E11D48',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && chartApiRef.current) {
            chartApiRef.current.applyOptions({
              width: Math.floor(entry.contentRect.width),
            });
          }
        }
      });
      ro.observe(container);
    }

    return () => {
      ro?.disconnect();
      priceLinesRef.current = [];
      candleSeriesRef.current = null;
      chart.remove();
      chartApiRef.current = null;
    };
  }, [isChartOpen, isDark]);

  // Update candles & horizontal price lines (EQ 50%, OTE 0.57-0.70, AMD Box BSL/SSL, IDM)
  useEffect(() => {
    const series = candleSeriesRef.current;
    const chart = chartApiRef.current;
    if (!isChartOpen || !series || !chart) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // Ignore stale price line removal
      }
    }
    priceLinesRef.current = [];

    if (chartCandles.length === 0) {
      series.setData([]);
      return;
    }

    series.setData(
      chartCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const nextLines: IPriceLine[] = [];

    if (chartSmc && chartSmc.swingHigh > 0) {
      nextLines.push(
        series.createPriceLine({
          price: chartSmc.equilibrium,
          color: isDark ? '#929BA9' : '#526071',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'EQ 50%',
        })
      );

      nextLines.push(
        series.createPriceLine({
          price: chartSmc.poiHierarchy.layer1DecisionalFvgOte.high,
          color: isDark ? '#F2F4F7' : '#0F172A',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'POI 1 (FVG/OTE 0.57)',
        })
      );

      nextLines.push(
        series.createPriceLine({
          price: chartSmc.poiHierarchy.layer1DecisionalFvgOte.low,
          color: isDark ? '#F2F4F7' : '#0F172A',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'POI 1 (FVG/OTE 0.70)',
        })
      );

      nextLines.push(
        series.createPriceLine({
          price: chartSmc.poiHierarchy.layer2ExtremeOb.midpoint,
          color: isDark ? '#F59E0B' : '#D97706',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: chartSmc.poiHierarchy.layer2ExtremeOb.unmitigatedFutureLiquidity
            ? 'POI 2 (OB · Unmitigated)'
            : 'POI 2 (Extreme OB)',
        })
      );

      if (chartSmc.inducement.detected && chartSmc.inducement.price !== null) {
        nextLines.push(
          series.createPriceLine({
            price: chartSmc.inducement.price,
            color: isDark ? '#F59E0B' : '#D97706',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: chartSmc.inducement.swept ? 'IDM (Swept)' : 'IDM (<50% EQ)',
          })
        );
      }
    }

    if (result.amdState && result.amdState.activeBox.high > 0) {
      nextLines.push(
        series.createPriceLine({
          price: result.amdState.activeBox.high,
          color: isDark ? '#E05260' : '#E11D48',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'BSL (AMD High)',
        })
      );
      nextLines.push(
        series.createPriceLine({
          price: result.amdState.activeBox.low,
          color: isDark ? '#00A878' : '#059669',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SSL (AMD Low)',
        })
      );
    }

    priceLinesRef.current = nextLines;
    chart.timeScale().fitContent();
  }, [isChartOpen, chartCandles, chartSmc, result.amdState, isDark]);

  const heatmapYears = useMemo(
    () =>
      Object.keys(XAUUSD_SEASONALITY.monthlyPct)
        .map(Number)
        .sort((a, b) => b - a),
    []
  );

  const formattedUpdatedTime = useMemo(() => {
    if (!lastUpdatedAt) return tr('Belum diperbarui', 'Not updated yet');
    try {
      return new Intl.DateTimeFormat(isEn ? 'en-US' : 'id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(lastUpdatedAt));
    } catch {
      return lastUpdatedAt;
    }
  }, [lastUpdatedAt, isEn, tr]);

  // Derived Gatekeeper status & concise 1-line rule for BLOCK 1
  const gatekeeperDisplay = useMemo(() => {
    const amd = result.amdState;
    if (!amd) {
      return {
        statusText: tr('MODE DASAR · SEASONALITY & ASTRO', 'BASIC MODE · SEASONALITY & ASTRO'),
        statusColor: 'text-[#526071] dark:text-[#929BA9]',
        oneLineRule: tr(
          'Evaluasi berbasis probabilitas bulanan XAU/USD (60%) dan siklus waktu Astronacci (40%).',
          'Evaluation based on XAU/USD monthly seasonality (60%) and Astronacci time cycles (40%).'
        ),
      };
    }

    const actionPrefix =
      amd.gatekeeperStatus === 'ACTIVE'
        ? 'ACTIVE'
        : amd.gatekeeperStatus === 'PREPARE'
        ? 'PREPARE'
        : 'WAIT';

    const phaseLabelMap: Record<string, string> = {
      DOUBLE_ACCUMULATION: tr('AKUMULASI GANDA', 'DOUBLE ACCUMULATION'),
      ACCUMULATION: tr('AKUMULASI SESI', 'SESSION ACCUMULATION'),
      MANIPULATION: tr('MANIPULASI / SWEEP', 'MANIPULATION / SWEEP'),
      POST_SWEEP_CONSOLIDATION: tr('RANGING PASCA-SWEEP', 'POST-SWEEP RANGING'),
      EARLY_DISTRIBUTION: tr('DISTRIBUSI AWAL', 'EARLY DISTRIBUTION'),
      DISTRIBUTION: tr('DISTRIBUSI VALID', 'VALID DISTRIBUTION'),
      'RE-ACCUMULATION': tr('RE-AKUMULASI NY', 'NY RE-ACCUMULATION'),
    };
    const phaseShort = phaseLabelMap[amd.phase] || amd.phase;
    const statusText = `${actionPrefix} • ${phaseShort}`;

    const statusColor =
      amd.gatekeeperStatus === 'ACTIVE'
        ? 'text-[#059669] dark:text-[#00A878]'
        : 'text-[#D97706] dark:text-[#F59E0B]';

    let oneLineRule = '';
    if (amd.adaptiveRegime === 'DOUBLE_ACCUMULATION' || amd.phase === 'DOUBLE_ACCUMULATION') {
      oneLineRule = tr(
        `Kompresi Tokyo & London (${amd.tokyoRangeAtrRatio}x / ${amd.londonRangeAtrRatio}x ATR). Dilarang entry sebelum sweep ${getSessionLabelId(
          amd.manipulationWatchSession
        )}.`,
        `Tokyo & London compression (${amd.tokyoRangeAtrRatio}x / ${amd.londonRangeAtrRatio}x ATR). Hold entry until ${getSessionLabelId(
          amd.manipulationWatchSession
        )} sweep.`
      );
    } else if (amd.phase === 'ACCUMULATION') {
      oneLineRule = tr(
        `Rentang ${getSessionLabelId(
          amd.activeBox.session
        )} terkunci membangun likuiditas. Tunggu sapuan BSL/SSL di sesi ${getSessionLabelId(
          amd.manipulationWatchSession
        )}.`,
        `${getSessionLabelId(
          amd.activeBox.session
        )} range locked building liquidity. Wait for BSL/SSL sweep in ${getSessionLabelId(
          amd.manipulationWatchSession
        )}.`
      );
    } else if (amd.phase === 'MANIPULATION') {
      oneLineRule = tr(
        `Fase sapuan likuiditas aktif di sesi ${getSessionLabelId(
          amd.currentSession
        )}. Tunggu penolakan (rejection) & konfirmasi MSS sebelum entry.`,
        `Active liquidity sweep in ${getSessionLabelId(
          amd.currentSession
        )}. Wait for rejection & MSS confirmation before entry.`
      );
    } else if (amd.phase === 'POST_SWEEP_CONSOLIDATION') {
      oneLineRule = tr(
        `Harga berkonsolidasi pasca-sweep. Tunggu breakout impulsif & retest FVG sebelum eksekusi.`,
        `Post-sweep consolidation. Wait for impulsive breakout & FVG retest before execution.`
      );
    } else if (amd.phase === 'RE-ACCUMULATION') {
      oneLineRule = tr(
        `Anomali sesi terdeteksi (Re-Accumulation). Batas box direset; tunggu sapuan likuiditas baru.`,
        `Session anomaly detected (Re-Accumulation). Box bounds reset; wait for fresh liquidity sweep.`
      );
    } else {
      oneLineRule = tr(
        `Sweeping selesai — ekspansi distribusi sesi ${getSessionLabelId(
          amd.distributionProjectionSession
        )} aktif mengikuti struktur POI.`,
        `Sweep complete — ${getSessionLabelId(
          amd.distributionProjectionSession
        )} distribution expansion active along POI structure.`
      );
    }

    return { statusText, statusColor, oneLineRule };
  }, [result.amdState, tr]);

  // Derived Liquidity Map metrics for BLOCK 2
  const liquidityMapMetrics = useMemo(() => {
    const bsl = result.proDeskRead.nearestBsl || result.amdState?.nearestBslPrice || 0;
    const ssl = result.proDeskRead.nearestSsl || result.amdState?.nearestSslPrice || 0;
    const spot = livePrice && livePrice > 0 ? livePrice : bsl > 0 && ssl > 0 ? (bsl + ssl) / 2 : 0;
    const span = bsl > ssl ? bsl - ssl : 0;
    const rawPct = span > 0 && spot > 0 ? ((spot - ssl) / span) * 100 : 50;
    const positionPct = Math.max(4, Math.min(96, rawPct));
    const distToBsl = bsl > 0 && spot > 0 ? bsl - spot : null;
    const distToSsl = ssl > 0 && spot > 0 ? spot - ssl : null;
    const activeSmc = result.mtfAnalysis || result.ltfAnalysis || result.htfAnalysis;
    const pdZone = activeSmc?.pdZone || 'EQUILIBRIUM';
    return {
      bsl,
      ssl,
      spot,
      positionPct,
      distToBsl,
      distToSsl,
      pdZone,
    };
  }, [result, livePrice]);

  // Derived JIKA -> MAKA Execution Scenarios for BLOCK 3
  const executionScenarios = useMemo(() => {
    const activeSmc = result.mtfAnalysis || result.ltfAnalysis || result.htfAnalysis;
    const bsl = liquidityMapMetrics.bsl;
    const ssl = liquidityMapMetrics.ssl;
    const isPrimaryBullish =
      result.dominantDirection === 'BULLISH' ||
      (result.dominantDirection === 'NETRAL' && result.uptrendPct >= result.downtrendPct);

    const confirmTfLabel = tradingMode === 'SWING' ? 'MSS M15 / 1H' : 'MSS M5 / M15';

    const l1 = activeSmc?.poiHierarchy.layer1DecisionalFvgOte;
    const l2 = activeSmc?.poiHierarchy.layer2ExtremeOb;
    const activePoiLayer =
      activeSmc?.poiHierarchy.activeTargetLayer === 'LAYER_2_EXTREME_OB' ? l2 : l1;
    const altPoiLayer =
      activeSmc?.poiHierarchy.activeTargetLayer === 'LAYER_2_EXTREME_OB' ? l1 : l2;

    const lockType = activeSmc?.structuralLock.protectedSwingType || (isPrimaryBullish ? 'HL' : 'LH');
    const lockPrice =
      activeSmc?.structuralLock.protectedSwingPrice ||
      (isPrimaryBullish ? ssl : bsl);
    const opposingTarget =
      activeSmc?.structuralLock.opposingTargetPrice ||
      (isPrimaryBullish ? bsl : ssl);

    const idmNote =
      activeSmc?.inducement.detected && activeSmc.inducement.price
        ? ` / IDM $${activeSmc.inducement.price.toFixed(2)}`
        : '';

    const planA = isPrimaryBullish
      ? {
          badge: 'BUY SETUP',
          isBullish: true,
          title: 'Plan A · Primary Trend Setup',
          summary: tr(
            'Ikuti tren utama naik: tunggu harga menyapu likuiditas bawah lalu masuk di area diskon (POI) saat muncul konfirmasi naik.',
            'Follow primary uptrend: wait for a lower liquidity sweep, then enter at the discount POI zone upon bullish confirmation.'
          ),
          triggerSweep:
            ssl > 0
              ? `Sweep SSL $${ssl.toFixed(2)}${idmNote}`
              : tr('Sweep likuiditas sesi bawah / IDM', 'Lower session liquidity / IDM sweep'),
          poiZone:
            activePoiLayer && activePoiLayer.low > 0
              ? `$${activePoiLayer.low.toFixed(2)} – $${activePoiLayer.high.toFixed(2)} (${
                  activeSmc?.poiHierarchy.activeTargetLayer === 'LAYER_2_EXTREME_OB'
                    ? 'Extreme OB'
                    : 'FVG / OTE'
                })`
              : tr('Menunggu sinkronisasi candle', 'Waiting for candle sync'),
          confirmation: `Rejection + ${confirmTfLabel}`,
          targetTp:
            bsl > 0
              ? `BSL $${bsl.toFixed(2)}${
                  opposingTarget > bsl ? ` → $${opposingTarget.toFixed(2)}` : ''
                }`
              : tr('BSL Sesi Atas', 'Upper Session BSL'),
          invalidation:
            lockPrice > 0
              ? tr(
                  `Invalidasi (Kunci ${lockType}): Close di bawah $${lockPrice.toFixed(2)}`,
                  `Invalidation (${lockType} Lock): Close below $${lockPrice.toFixed(2)}`
                )
              : tr('Invalidasi: Close di bawah Swing Low utama', 'Invalidation: Close below key Swing Low'),
        }
      : {
          badge: 'SELL SETUP',
          isBullish: false,
          title: 'Plan A · Primary Trend Setup',
          summary: tr(
            'Ikuti tren utama turun: tunggu harga menyapu likuiditas atas lalu masuk di area premium (POI) saat muncul konfirmasi turun.',
            'Follow primary downtrend: wait for an upper liquidity sweep, then enter at the premium POI zone upon bearish confirmation.'
          ),
          triggerSweep:
            bsl > 0
              ? `Sweep BSL $${bsl.toFixed(2)}${idmNote}`
              : tr('Sweep likuiditas sesi atas / IDM', 'Upper session liquidity / IDM sweep'),
          poiZone:
            activePoiLayer && activePoiLayer.low > 0
              ? `$${activePoiLayer.low.toFixed(2)} – $${activePoiLayer.high.toFixed(2)} (${
                  activeSmc?.poiHierarchy.activeTargetLayer === 'LAYER_2_EXTREME_OB'
                    ? 'Extreme OB'
                    : 'FVG / OTE'
                })`
              : tr('Menunggu sinkronisasi candle', 'Waiting for candle sync'),
          confirmation: `Rejection + ${confirmTfLabel}`,
          targetTp:
            ssl > 0
              ? `SSL $${ssl.toFixed(2)}${
                  opposingTarget > 0 && opposingTarget < ssl
                    ? ` → $${opposingTarget.toFixed(2)}`
                    : ''
                }`
              : tr('SSL Sesi Bawah', 'Lower Session SSL'),
          invalidation:
            lockPrice > 0
              ? tr(
                  `Invalidasi (Kunci ${lockType}): Close di atas $${lockPrice.toFixed(2)}`,
                  `Invalidation (${lockType} Lock): Close above $${lockPrice.toFixed(2)}`
                )
              : tr('Invalidasi: Close di atas Swing High utama', 'Invalidation: Close above key Swing High'),
        };

    const planB = isPrimaryBullish
      ? {
          badge: 'COUNTER SELL',
          isBullish: false,
          title: 'Plan B · Counter-Trend Sweep',
          summary: tr(
            'Skenario alternatif lawan arus: hanya berlaku jika harga gagal menembus batas atas (false break) dan memicu patahan struktur turun.',
            'Alternative counter-trend setup: valid only if price fails to break the upper boundary (false break) and triggers a bearish structure shift.'
          ),
          triggerSweep:
            bsl > 0
              ? `False Break / Sweep BSL $${bsl.toFixed(2)}`
              : tr('False Break batas atas sesi', 'Upper session false break'),
          poiZone:
            altPoiLayer && altPoiLayer.low > 0
              ? `$${altPoiLayer.low.toFixed(2)} – $${altPoiLayer.high.toFixed(2)} (Supply / OB)`
              : bsl > 0
              ? tr(`Area Ekstrem > $${bsl.toFixed(2)}`, `Extreme Zone > $${bsl.toFixed(2)}`)
              : tr('Menunggu sinkronisasi candle', 'Waiting for candle sync'),
          confirmation: `CHoCH Bearish (${confirmTfLabel})`,
          targetTp:
            activeSmc && activeSmc.equilibrium > 0
              ? `EQ 50% $${activeSmc.equilibrium.toFixed(2)} → SSL $${ssl.toFixed(2)}`
              : ssl > 0
              ? `SSL $${ssl.toFixed(2)}`
              : tr('Equilibrium 50% Sesi', 'Session 50% Equilibrium'),
          invalidation:
            bsl > 0
              ? tr(
                  `Invalidasi (Kunci High): Close H1 di atas $${Math.max(
                    bsl,
                    altPoiLayer?.high || bsl
                  ).toFixed(2)}`,
                  `Invalidation (High Lock): H1 Close above $${Math.max(
                    bsl,
                    altPoiLayer?.high || bsl
                  ).toFixed(2)}`
                )
              : tr('Invalidasi: Breakout impulsif di atas puncak sweep', 'Invalidation: Impulsive breakout above sweep high'),
        }
      : {
          badge: 'COUNTER BUY',
          isBullish: true,
          title: 'Plan B · Counter-Trend Sweep',
          summary: tr(
            'Skenario alternatif lawan arus: hanya berlaku jika harga gagal menembus batas bawah (false break) dan memicu patahan struktur naik.',
            'Alternative counter-trend setup: valid only if price fails to break the lower boundary (false break) and triggers a bullish structure shift.'
          ),
          triggerSweep:
            ssl > 0
              ? `False Break / Sweep SSL $${ssl.toFixed(2)}`
              : tr('False Break batas bawah sesi', 'Lower session false break'),
          poiZone:
            altPoiLayer && altPoiLayer.low > 0
              ? `$${altPoiLayer.low.toFixed(2)} – $${altPoiLayer.high.toFixed(2)} (Demand / OB)`
              : ssl > 0
              ? tr(`Area Ekstrem < $${ssl.toFixed(2)}`, `Extreme Zone < $${ssl.toFixed(2)}`)
              : tr('Menunggu sinkronisasi candle', 'Waiting for candle sync'),
          confirmation: `CHoCH Bullish (${confirmTfLabel})`,
          targetTp:
            activeSmc && activeSmc.equilibrium > 0
              ? `EQ 50% $${activeSmc.equilibrium.toFixed(2)} → BSL $${bsl.toFixed(2)}`
              : bsl > 0
              ? `BSL $${bsl.toFixed(2)}`
              : tr('Equilibrium 50% Sesi', 'Session 50% Equilibrium'),
          invalidation:
            ssl > 0
              ? tr(
                  `Invalidasi (Kunci Low): Close H1 di bawah $${Math.min(
                    ssl,
                    altPoiLayer?.low && altPoiLayer.low > 0 ? altPoiLayer.low : ssl
                  ).toFixed(2)}`,
                  `Invalidation (Low Lock): H1 Close below $${Math.min(
                    ssl,
                    altPoiLayer?.low && altPoiLayer.low > 0 ? altPoiLayer.low : ssl
                  ).toFixed(2)}`
                )
              : tr('Invalidasi: Breakdown impulsif di bawah dasar sweep', 'Invalidation: Impulsive breakdown below sweep low'),
        };

    return { planA, planB };
  }, [result, liquidityMapMetrics, tradingMode, tr]);

  const mtfList = useMemo(
    () =>
      [result.htfAnalysis, result.mtfAnalysis, result.ltfAnalysis].filter(
        (x): x is NonNullable<typeof x> => Boolean(x)
      ),
    [result.htfAnalysis, result.mtfAnalysis, result.ltfAnalysis]
  );

  // Single-line summary for Seasonality + Lunar + Solar in BLOCK 4
  const cycleSummaryLine = useMemo(() => {
    const monthShort = MONTH_LABELS_ID[XAUUSD_SEASONALITY.currentTargetMonthIndex] || 'Nov';
    const lunarShort =
      result.astronacci.lunarPhase === 'NEW_MOON_WINDOW'
        ? 'New Moon'
        : result.astronacci.lunarPhase === 'FULL_MOON_WINDOW'
        ? 'Full Moon'
        : 'Normal';
    const seasonAstroWeight =
      result.weightsBreakdown.find((w) => w.labelId.toLowerCase().includes('seasonality'))
        ?.score ??
      result.seasonality.winRatePct * 0.6 + result.astronacci.astroScore * 0.4;
    return `Seasonality ${monthShort}: ${result.seasonality.winRatePct}% • Lunar: ${lunarShort} • ${tr('Skor', 'Score')}: ${seasonAstroWeight.toFixed(
      1
    )}`;
  }, [result.seasonality, result.astronacci, result.weightsBreakdown, tr]);

  const directionColorClass =
    result.dominantDirection === 'BULLISH'
      ? 'text-[#059669] dark:text-[#00A878]'
      : result.dominantDirection === 'BEARISH'
      ? 'text-[#E11D48] dark:text-[#E05260]'
      : 'text-[#0F172A] dark:text-[#F2F4F7]';

  return (
    <div
      data-testid="cycle-confluence-page"
      className="space-y-6 pb-10 text-[#0F172A] dark:text-[#F2F4F7] font-sans transition-colors duration-150 overflow-x-hidden"
    >
      {/* =====================================================================
          HEADER & TOP CONTROLS (SEAMLESS ON CANVAS, MATCHING TRADE NEWS)
         ===================================================================== */}
      <div className="space-y-3 pb-5 border-b border-[#D9E2EC] dark:border-[#20252D]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D9E2EC] dark:border-[#20252D]">
          <div className="min-w-0">
            <h1 className="text-xs font-bold uppercase tracking-[0.12em] text-[#0F172A] dark:text-[#F2F4F7] truncate">
              CYCLE &amp; CONFLUENCE · XAU/USD
            </h1>
            <p className="text-[11px] text-[#526071] dark:text-[#929BA9] font-mono-numbers tabular-nums truncate mt-0.5">
              {livePrice
                ? `$${livePrice.toFixed(2)}`
                : isOfflineMode
                ? tr('Cache Lokal Kosong', 'Local Cache Empty')
                : tr('Memuat harga...', 'Loading price...')}
              {' · '}
              {isOfflineMode ? (
                <span
                  data-testid="cycle-offline-status-text"
                  className="font-semibold text-[#D97706] dark:text-[#F59E0B]"
                >
                  {tr('Mode Offline Aktif · Cache Lokal (0 Kuota API)', 'Offline Mode Active · Local Cache (0 API Quota)')}
                </span>
              ) : (
                <>
                  <span
                    data-testid="cycle-market-hours-status"
                    className={`font-semibold ${
                      isMarketOpen
                        ? 'text-[#059669] dark:text-[#00A878]'
                        : 'text-[#D97706] dark:text-[#F59E0B]'
                    }`}
                  >
                    {marketStatusText}
                  </span>
                  {candleSource !== 'none' &&
                    ` · ${
                      candleSource === 'twelvedata'
                        ? tr('Twelve Data XAU/USD (Senin–Jumat)', 'Twelve Data XAU/USD (Mon–Fri)')
                        : candleSource === 'binance'
                        ? tr('Live Market XAU/USD (Senin–Jumat)', 'Live Market XAU/USD (Mon–Fri)')
                        : tr('Cache Penutupan Pasar (Senin–Jumat)', 'Market Close Cache (Mon–Fri)')
                    }`}
                </>
              )}
              {` · Update ${formattedUpdatedTime}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="cycle-offline-mode-toggle"
              onClick={handleToggleOfflineMode}
              title={
                isOfflineMode
                  ? tr(
                      'Mode Offline aktif untuk News & Cycle (Scan Kilat AI tetap online). Klik untuk kembali Online.',
                      'Offline Mode active for News & Cycle (AI Quick Scan stays online). Click to go back Online.'
                    )
                  : tr(
                      'Aktifkan Mode Offline untuk News & Cycle agar tidak memakai kuota Gemini/API (Scan Kilat AI tetap online).',
                      'Enable Offline Mode for News & Cycle to save Gemini/API quota (AI Quick Scan stays online).'
                    )
              }
              className={`h-9 w-9 sm:w-auto p-0 sm:px-3.5 sm:py-1.5 inline-flex items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                isOfflineMode
                  ? 'bg-[#D97706]/10 dark:bg-[#F59E0B]/15 border-[#D97706]/40 dark:border-[#F59E0B]/40 text-[#B45309] dark:text-[#F59E0B]'
                  : 'bg-white dark:bg-[#101318] border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 text-[#0F172A] dark:text-[#F2F4F7]'
              }`}
            >
              {isOfflineMode ? (
                <WifiOff className="w-3.5 h-3.5 stroke-[2]" />
              ) : (
                <Wifi className="w-3.5 h-3.5 stroke-[1.75] text-[#059669] dark:text-[#00A878]" />
              )}
              <span className="hidden sm:inline">
                {isOfflineMode ? tr('Mode Offline: ON', 'Offline Mode: ON') : 'Online'}
              </span>
            </button>
            <button
              type="button"
              data-testid="cycle-playbook-button"
              onClick={() => setShowPlaybookGuide(true)}
              title={tr('Playbook SMC, AMD & Siklus Waktu', 'SMC, AMD & Time Cycle Playbook')}
              className="h-9 w-9 sm:w-auto p-0 sm:px-3.5 sm:py-1.5 inline-flex items-center justify-center gap-1.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <Info className="w-3.5 h-3.5 stroke-[1.75] text-[#526071] dark:text-[#929BA9]" />
              <span className="hidden sm:inline">Playbook</span>
            </button>
            <button
              type="button"
              data-testid="cycle-session-toggle-button"
              onClick={() => {
                setSessionDraft(sessionConfig);
                setIsSessionPanelOpen((prev) => !prev);
              }}
              title={tr('Pengaturan Sesi WIB', 'Session Hours Settings')}
              className="h-9 w-9 sm:w-auto p-0 sm:px-3.5 sm:py-1.5 inline-flex items-center justify-center gap-1.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <Clock className="w-3.5 h-3.5 text-[#526071] dark:text-[#929BA9]" />
              <span className="hidden sm:inline">{tr('Sesi WIB', 'Session Hours')}</span>
            </button>
            <button
              type="button"
              data-testid="cycle-apikey-toggle-button"
              onClick={() => {
                setApiKeyInput(getRawStoredTwelveDataKey());
                setIsApiKeyPanelOpen((prev) => !prev);
              }}
              title={tr('Pengaturan API Key Twelve Data', 'Twelve Data API Key Settings')}
              className="h-9 w-9 sm:w-auto p-0 sm:px-3.5 sm:py-1.5 inline-flex items-center justify-center gap-1.5 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none hover:bg-[#F8FAFC] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#526071] dark:text-[#929BA9]" />
              <span className="hidden sm:inline">API Key</span>
            </button>
            <button
              type="button"
              data-testid="cycle-refresh-button"
              onClick={() => void refresh(true)}
              disabled={isRefreshing || isLoading || isOfflineMode}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] hover:opacity-90 text-xs font-semibold transition-opacity disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 stroke-[2] ${
                  isRefreshing || isLoading ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isOfflineMode
                  ? tr('Dijeda (Offline)', 'Paused (Offline)')
                  : isRefreshing
                  ? tr('Memperbarui...', 'Refreshing...')
                  : tr('Perbarui Data', 'Refresh Data')}
              </span>
            </button>
          </div>
        </div>

        {/* Mode & Horizon Segmented Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Mode Analisis"
            className="w-full sm:w-auto inline-flex items-center p-1 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none"
          >
            <button
              type="button"
              data-testid="toggle-basic-mode"
              onClick={() => setViewMode('BASIC')}
              className={`flex-1 sm:flex-initial min-h-[32px] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                viewMode === 'BASIC'
                  ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                  : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              Seasonality + Astro
            </button>
            <button
              type="button"
              data-testid="toggle-full-mode"
              onClick={() => setViewMode('FULL')}
              className={`flex-1 sm:flex-initial min-h-[32px] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                viewMode === 'FULL'
                  ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                  : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
              }`}
            >
              Full Confluence ON
            </button>
          </div>

          {viewMode === 'FULL' && (
            <div
              role="group"
              aria-label="Pilih Horizon Trading"
              className="w-full sm:w-auto inline-flex items-center p-1 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none"
            >
              <button
                type="button"
                data-testid="mode-swing-button"
                onClick={() => setTradingMode('SWING')}
                className={`flex-1 sm:flex-initial min-h-[32px] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  tradingMode === 'SWING'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                Intraday / Swing (D1 • 4H • 1H)
              </button>
              <button
                type="button"
                data-testid="mode-scalp-button"
                onClick={() => setTradingMode('SCALP')}
                className={`flex-1 sm:flex-initial min-h-[32px] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  tradingMode === 'SCALP'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                }`}
              >
                Scalping (1H • 15m • 5m)
              </button>
            </div>
          )}
        </div>

        {/* Status / Feed Notice Strip */}
        {(isOfflineMode
          ? Boolean(error || cooldownNotice || (!isLoading && !livePrice))
          : !hasStoredApiKey ||
            twelveDataStatus !== 'ok' ||
            error ||
            cooldownNotice ||
            (!isLoading && !livePrice)) && (
          <div
            data-testid="cycle-status-banner"
            className={`rounded-lg bg-white dark:bg-[#101318] border px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 ${
              !isOfflineMode && (error || twelveDataStatus === 'error')
                ? 'border-[#E11D48]/40 dark:border-[#E05260]/40'
                : 'border-[#D97706]/40 dark:border-[#F59E0B]/40'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0 text-xs">
              {isOfflineMode ? (
                <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D97706] dark:text-[#F59E0B]" />
              ) : (
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                    error || twelveDataStatus === 'error'
                      ? 'text-[#E11D48] dark:text-[#E05260]'
                      : 'text-[#D97706] dark:text-[#F59E0B]'
                  }`}
                />
              )}
              <div className="space-y-0.5 min-w-0">
                <p
                  className={`font-semibold ${
                    !isOfflineMode && (error || twelveDataStatus === 'error')
                      ? 'text-[#E11D48] dark:text-[#E05260]'
                      : 'text-[#D97706] dark:text-[#F59E0B]'
                  }`}
                >
                  {isOfflineMode
                    ? !livePrice
                      ? tr('Mode Offline Aktif · Belum Ada Cache Candle Lokal', 'Offline Mode Active · No Local Candle Cache Yet')
                      : tr('Mode Offline Aktif (Khusus News & Cycle)', 'Offline Mode Active (News & Cycle Only)')
                    : twelveDataStatus === 'rate_limited'
                    ? tr('Kuota Twelve Data Tercapai (Rate Limit)', 'Twelve Data Quota Reached (Rate Limit)')
                    : !hasStoredApiKey
                    ? tr('API Key Twelve Data Belum Disimpan di Browser', 'Twelve Data API Key Not Saved in Browser')
                    : tr('Status Umpan Data Pasar XAU/USD (Senin–Jumat)', 'XAU/USD Market Data Feed Status (Mon–Fri)')}
                </p>
                <p className="text-[11px] text-[#526071] dark:text-[#929BA9] leading-relaxed">
                  {isOfflineMode
                    ? cooldownNotice ||
                      error ||
                      tr(
                        'Seasonality (60%) + Astronacci (40%) tetap aktif tanpa koneksi API. Aktifkan Online sebentar untuk menyimpan cache candle terbaru, lalu nyalakan lagi Mode Offline kapan saja.',
                        'Seasonality (60%) + Astronacci (40%) remain active without API calls. Go Online briefly to cache the latest candles, then switch Offline Mode back on anytime.'
                      )
                    : error ||
                      cooldownNotice ||
                      twelveDataError ||
                      tr('Data candlestick XAU/USD (Senin–Jumat) sedang disinkronkan.', 'Synchronizing XAU/USD candlestick data (Mon–Fri).')}
                  {!isOfflineMode &&
                    candleSource === 'binance' &&
                    tr(' · Cadangan feed pasar XAU/USD (Senin–Jumat) aktif.', ' · XAU/USD fallback market feed (Mon–Fri) active.')}
                  {!isOfflineMode &&
                    candleSource === 'cached' &&
                    tr(' · Menampilkan candle hari kerja terakhir dari cache lokal.', ' · Showing last weekday candles from local cache.')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isOfflineMode ? (
                <>
                  <button
                    type="button"
                    data-testid="banner-go-online-button"
                    onClick={handleToggleOfflineMode}
                    className="min-h-[32px] px-3.5 py-1 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                  >
                    {tr('Aktifkan Online & Muat Data', 'Go Online & Load Data')}
                  </button>
                  <button
                    type="button"
                    data-testid="banner-load-sample-button"
                    onClick={loadSampleOrCachedCandles}
                    className="min-h-[32px] px-3.5 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#EAEEF4] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                  >
                    {tr('Cek Cache Lokal', 'Check Local Cache')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="banner-open-apikey-button"
                    onClick={() => {
                      setApiKeyInput(getRawStoredTwelveDataKey());
                      setIsApiKeyPanelOpen((prev) => !prev);
                    }}
                    className="min-h-[32px] px-3.5 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#EAEEF4] dark:hover:bg-[#161A22] hover:border-[#0F172A]/30 dark:hover:border-white/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                  >
                    {tr('Atur API Key', 'Set API Key')}
                  </button>
                  <button
                    type="button"
                    data-testid="banner-load-sample-button"
                    onClick={loadSampleOrCachedCandles}
                    className="min-h-[32px] px-3.5 py-1 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                  >
                    {tr('Muat Cache Hari Kerja', 'Load Weekday Cache')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Inline LuxAlgo WIB Session Hours Settings Panel */}
        {isSessionPanelOpen && (
          <div
            data-testid="cycle-session-wib-panel"
            className="rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none p-3.5 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr(
                    'Pengaturan Jam Sesi Trading (WIB / UTC+7 · Standar LuxAlgo)',
                    'Trading Session Hours (WIB / UTC+7 · LuxAlgo Standard)'
                  )}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block">
                  Default: Tokyo/Asia 04:00–13:00 WIB · London 13:00–18:00 WIB · New York 18:00–04:00 WIB
                </span>
              </div>
              <button
                type="button"
                data-testid="cycle-session-reset-button"
                onClick={() => {
                  setSessionDraft(DEFAULT_SESSION_HOURS_WIB);
                  setSessionConfig(DEFAULT_SESSION_HOURS_WIB);
                  saveStoredSessionHoursWib(DEFAULT_SESSION_HOURS_WIB);
                }}
                className="min-h-[32px] px-3.5 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] text-xs font-semibold text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] hover:bg-[#EAEEF4] dark:hover:bg-[#161A22] transition-colors self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                Reset LuxAlgo
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SESSION_KEYS.map((key) => {
                const win = sessionDraft[key];
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                        {getSessionLabelId(key)}
                      </span>
                      <span className="font-mono-numbers tabular-nums text-[11px] text-[#526071] dark:text-[#929BA9]">
                        {formatSessionWindowWib(key, sessionDraft)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[11px] text-[#526071] dark:text-[#929BA9]">
                        <span className="block">{tr('Mulai WIB', 'Start WIB')}</span>
                        <select
                          aria-label={`${getSessionLabelId(key)} ${tr('Mulai WIB', 'Start WIB')}`}
                          value={win.startHour}
                          onChange={(e) => {
                            const h = Number(e.target.value);
                            setSessionDraft((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], startHour: h },
                            }));
                          }}
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] text-xs font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                        >
                          {WIB_HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>
                              {formatWibHour(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-[11px] text-[#526071] dark:text-[#929BA9]">
                        <span className="block">{tr('Selesai WIB', 'End WIB')}</span>
                        <select
                          aria-label={`${getSessionLabelId(key)} ${tr('Selesai WIB', 'End WIB')}`}
                          value={win.endHour}
                          onChange={(e) => {
                            const h = Number(e.target.value);
                            setSessionDraft((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], endHour: h },
                            }));
                          }}
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] text-xs font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                        >
                          {WIB_HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>
                              {formatWibHour(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSessionPanelOpen(false)}
                className="min-h-[34px] px-3.5 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] text-xs font-semibold text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] hover:bg-[#EAEEF4] dark:hover:bg-[#161A22] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Tutup', 'Close')}
              </button>
              <button
                type="button"
                data-testid="cycle-session-save-button"
                onClick={() => {
                  setSessionConfig(sessionDraft);
                  saveStoredSessionHoursWib(sessionDraft);
                  setIsSessionPanelOpen(false);
                }}
                className="min-h-[34px] px-4 py-1 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Terapkan & Simpan', 'Apply & Save')}
              </button>
            </div>
          </div>
        )}

        {/* Inline Twelve Data API Key Settings Panel */}
        {isApiKeyPanelOpen && (
          <div
            data-testid="cycle-apikey-settings-panel"
            className="rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                {tr(
                  'Pengaturan API Key Twelve Data (Disimpan Lokal di Browser)',
                  'Twelve Data API Key Settings (Stored Locally in Browser)'
                )}
              </span>
              <span className="text-[11px] font-mono-numbers text-[#526071] dark:text-[#929BA9]">
                {hasStoredApiKey
                  ? tr('Tersimpan di localStorage', 'Saved in localStorage')
                  : tr('Belum tersimpan', 'Not saved yet')}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                data-testid="cycle-apikey-input"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={tr('Masukkan API Key Twelve Data Anda...', 'Enter your Twelve Data API Key...')}
                className="flex-1 min-h-[36px] px-4 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] text-xs font-mono-numbers text-[#0F172A] dark:text-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 focus:border-[#0F172A] dark:focus:border-white"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="cycle-apikey-save-button"
                  onClick={() => {
                    void updateApiKeyAndReload(apiKeyInput);
                    setIsApiKeyPanelOpen(false);
                  }}
                  className="min-h-[36px] px-4 py-1.5 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                >
                  {tr('Simpan & Muat Ulang', 'Save & Reload')}
                </button>
                {hasStoredApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setApiKeyInput('');
                      void updateApiKeyAndReload('');
                    }}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] hover:bg-[#EAEEF4] dark:hover:bg-[#161A22] text-xs font-semibold text-[#E11D48] dark:text-[#E05260] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                  >
                    {tr('Hapus', 'Clear')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          BLOCK 1 — STATUS & GATEKEEPER (SEAMLESS ON CANVAS)
         ===================================================================== */}
      <section
        data-testid="probability-card"
        className="space-y-4 pb-6 border-b border-[#D9E2EC] dark:border-[#20252D]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
              {tr('STATUS PASAR & AMD GATEKEEPER', 'MARKET STATUS & AMD GATEKEEPER')}
            </h2>
            <span className="text-[#526071] dark:text-[#929BA9]" aria-hidden="true">
              ·
            </span>
            <span
              data-testid="amd-adaptive-regime-badge"
              className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider font-mono-numbers tabular-nums ${gatekeeperDisplay.statusColor}`}
            >
              {result.amdState?.gatekeeperStatus === 'ACTIVE' ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{gatekeeperDisplay.statusText}</span>
            </span>

            {manualAmdOverride !== 'AUTO' && (
              <>
                <span className="text-[#526071] dark:text-[#929BA9]" aria-hidden="true">
                  ·
                </span>
                <span
                  data-testid="manual-amd-lock-badge"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#D97706] dark:text-[#F59E0B]"
                >
                  <Lock className="w-3 h-3 stroke-[2]" />
                  <span>MANUAL LOCK</span>
                </span>
              </>
            )}
          </div>

          <span className="text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
            {tr('Bias Makro:', 'Macro Bias:')}{' '}
            <strong
              className={
                macroBias === 'BUY'
                  ? 'text-[#059669] dark:text-[#00A878]'
                  : macroBias === 'SELL'
                  ? 'text-[#E11D48] dark:text-[#E05260]'
                  : 'text-[#0F172A] dark:text-[#F2F4F7]'
              }
            >
              {macroBias}
            </strong>
            {macroAnalyzedAt ? ` · ${macroAnalyzedAt.slice(0, 10)}` : ''}
          </span>
        </div>

        {/* Dominant Probability + Concise 1-Line Rule */}
        <div data-testid="amd-gatekeeper-box" className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span
              className={`text-3xl sm:text-4xl font-bold tracking-tight font-mono-numbers tabular-nums ${directionColorClass}`}
            >
              {result.dominantDirection === 'BULLISH'
                ? `UPTREND ${result.uptrendPct}%`
                : result.dominantDirection === 'BEARISH'
                ? `DOWNTREND ${result.downtrendPct}%`
                : `${tr('NETRAL', 'NEUTRAL')} ${result.uptrendPct}% / ${result.downtrendPct}%`}
            </span>

            <span className="text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
              {result.weightsBreakdown
                .map((w) => `${w.labelId.split(' ')[0]} ${w.score.toFixed(0)}`)
                .join(' · ')}
            </span>
          </div>

          <p className="text-xs text-[#526071] dark:text-[#929BA9] leading-relaxed">
            {gatekeeperDisplay.oneLineRule}
          </p>
        </div>

        {/* Horizontal Probability Bar (Emerald Uptrend vs Rose Downtrend) */}
        <div className="space-y-2 pt-0.5">
          <div
            data-testid="direction-split-bar"
            className="h-1 w-full rounded-full overflow-hidden flex bg-[#E2E8F0] dark:bg-[#161A22]"
          >
            <div
              className="h-full bg-[#059669] dark:bg-[#00A878] transition-all duration-200"
              style={{ width: `${result.uptrendPct}%` }}
            />
            <div
              className="h-full bg-[#E11D48] dark:bg-[#E05260] transition-all duration-200"
              style={{ width: `${result.downtrendPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono-numbers tabular-nums">
            <span className="font-semibold text-[#059669] dark:text-[#00A878]">
              UPTREND {result.uptrendPct}%
            </span>
            <span className="font-semibold text-[#E11D48] dark:text-[#E05260]">
              DOWNTREND {result.downtrendPct}%
            </span>
          </div>
        </div>

        {/* Manual AMD Override Segmented Bar */}
        {viewMode === 'FULL' && (
          <div
            data-testid="manual-amd-override-bar"
            className="pt-3 border-t border-[#D9E2EC] dark:border-[#20252D] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          >
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
                MANUAL AMD OVERRIDE
              </span>
              {manualAmdOverride !== 'AUTO' && (
                <span className="text-[11px] text-[#D97706] dark:text-[#F59E0B] font-medium">
                  · {tr('Tersinkron ke Trade News', 'Synced to Trade News')}
                </span>
              )}
            </div>

            <div
              role="group"
              aria-label="Manual AMD Override"
              className="inline-flex items-center p-1 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none overflow-x-auto max-w-full self-start sm:self-auto"
            >
              {MANUAL_AMD_OVERRIDE_OPTIONS.map((opt) => {
                const isSelected = manualAmdOverride === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`manual-amd-pill-${opt.id.toLowerCase()}`}
                    onClick={() => handleSelectManualAmdOverride(opt.id)}
                    className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                      isSelected
                        ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                        : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                    }`}
                  >
                    {isEn ? opt.labelEn : opt.labelId}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* =====================================================================
          BLOCK 2 — PETA LIKUIDITAS SESI (SEAMLESS 3-COLUMN / 3-ROW GRID)
         ===================================================================== */}
      <section
        data-testid="session-liquidity-map-card"
        className="space-y-3 pb-6 border-b border-[#D9E2EC] dark:border-[#20252D]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
            {tr('PETA LIKUIDITAS SESI (TRAP MAP)', 'SESSION LIQUIDITY MAP (TRAP MAP)')}
          </h2>
          {result.amdState && (
            <span className="text-xs text-[#526071] dark:text-[#929BA9] font-mono-numbers tabular-nums">
              {tr('Pantau Sweep:', 'Watch Sweep:')}{' '}
              <strong className="font-sans text-[#0F172A] dark:text-[#F2F4F7]">
                {tr('Sesi', 'Session')} {getSessionLabelId(result.amdState.manipulationWatchSession)}
              </strong>{' '}
              ({formatSessionWindowWib(result.amdState.manipulationWatchSession, sessionConfig)})
            </span>
          )}
        </div>

        {/* Seamless 3-Tier Range Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#D9E2EC] dark:divide-[#20252D] border-y border-[#D9E2EC] dark:border-[#20252D]">
          {/* Upper Target (BSL Terdekat) */}
          <div className="py-3.5 sm:pr-5 flex sm:flex-col justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9] block">
                {tr('UPPER TARGET · BSL TERDEKAT', 'UPPER TARGET · NEAREST BSL')}
              </span>
              <span className="text-xs text-[#526071] dark:text-[#929BA9]">
                {tr('Buy-Side Liquidity (Stop-Hunt Atas)', 'Buy-Side Liquidity (Upper Stop-Hunt)')}
              </span>
            </div>
            <div className="text-right sm:text-left font-mono-numbers tabular-nums">
              <span className="text-lg sm:text-xl font-bold text-[#E11D48] dark:text-[#E05260] block">
                {liquidityMapMetrics.bsl > 0 ? `$${liquidityMapMetrics.bsl.toFixed(2)}` : '—'}
              </span>
              {liquidityMapMetrics.distToBsl !== null && (
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9]">
                  {liquidityMapMetrics.distToBsl >= 0 ? '+' : ''}$
                  {liquidityMapMetrics.distToBsl.toFixed(2)} {tr('dr spot', 'from spot')}
                </span>
              )}
            </div>
          </div>

          {/* Center: Current XAU/USD Price */}
          <div className="py-3.5 sm:px-5 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9]">
                {tr('HARGA XAU/USD SAAT INI', 'CURRENT XAU/USD PRICE')}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F172A] dark:text-[#F2F4F7]">
                {liquidityMapMetrics.pdZone}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7]">
              {livePrice ? `$${livePrice.toFixed(2)}` : '—'}
            </div>
            <div className="h-1 w-full rounded-full bg-[#E2E8F0] dark:bg-[#161A22] overflow-hidden">
              <div
                className="h-full bg-[#0F172A] dark:bg-white rounded-full transition-all duration-200"
                style={{ width: `${liquidityMapMetrics.positionPct}%` }}
              />
            </div>
          </div>

          {/* Lower Target (SSL Terdekat) */}
          <div className="py-3.5 sm:pl-5 flex sm:flex-col justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9] block">
                {tr('LOWER TARGET · SSL TERDEKAT', 'LOWER TARGET · NEAREST SSL')}
              </span>
              <span className="text-xs text-[#526071] dark:text-[#929BA9]">
                {tr('Sell-Side Liquidity (Stop-Hunt Bawah)', 'Sell-Side Liquidity (Lower Stop-Hunt)')}
              </span>
            </div>
            <div className="text-right sm:text-left font-mono-numbers tabular-nums">
              <span className="text-lg sm:text-xl font-bold text-[#059669] dark:text-[#00A878] block">
                {liquidityMapMetrics.ssl > 0 ? `$${liquidityMapMetrics.ssl.toFixed(2)}` : '—'}
              </span>
              {liquidityMapMetrics.distToSsl !== null && (
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9]">
                  -${Math.abs(liquidityMapMetrics.distToSsl).toFixed(2)} {tr('dr spot', 'from spot')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Single Clean Metadata Footer Row */}
        {result.amdState && (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
            <span>
              <span className="font-sans">
                Box {getSessionLabelId(result.amdState.activeBox.session)}:
              </span>{' '}
              <strong className="text-[#0F172A] dark:text-[#F2F4F7]">
                {result.amdState.activeBox.high > 0
                  ? `$${result.amdState.activeBox.low.toFixed(2)} – $${result.amdState.activeBox.high.toFixed(2)}`
                  : '—'}
              </strong>
            </span>
            <span>
              <span className="font-sans">ATR(14):</span>{' '}
              <strong className="text-[#0F172A] dark:text-[#F2F4F7]">
                {result.amdState.atr14 > 0 ? `$${result.amdState.atr14.toFixed(2)}` : '—'}
              </strong>{' '}
              · Tokyo {result.amdState.tokyoRangeAtrRatio}x / London{' '}
              {result.amdState.londonRangeAtrRatio}x
            </span>
          </div>
        )}
      </section>

      {/* =====================================================================
          BLOCK 3 — SKENARIO EKSEKUSI (SEAMLESS 2-COLUMN JIKA -> MAKA)
         ===================================================================== */}
      <section
        data-testid="smc-pro-desk-read-card"
        className="space-y-3 pb-6 border-b border-[#D9E2EC] dark:border-[#20252D]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
            {tr('SKENARIO EKSEKUSI (JIKA → MAKA)', 'EXECUTION SCENARIOS (IF → THEN)')}
          </h2>
          <span
            data-testid="smc-active-poi-badge"
            className="text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]"
          >
            {result.proDeskRead.structureLockBadgeId} ·{' '}
            <strong className="text-[#0F172A] dark:text-[#F2F4F7]">
              {result.proDeskRead.activePoiBadgeId}
            </strong>
          </span>
        </div>

        {/* Seamless 2-Column Plan A & Plan B (No Nested Box Clutter) */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#D9E2EC] dark:divide-[#20252D] border-y border-[#D9E2EC] dark:border-[#20252D]">
          {/* Plan A: Primary Trend Setup */}
          <div
            data-testid="smc-pro-read-structure"
            className="py-3.5 md:pr-6 flex flex-col justify-between gap-3"
          >
            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.06em] text-[#0F172A] dark:text-[#F2F4F7]">
                    {executionScenarios.planA.title}
                  </span>
                  <span
                    className={`text-xs font-bold font-mono-numbers tabular-nums ${
                      executionScenarios.planA.isBullish
                        ? 'text-[#059669] dark:text-[#00A878]'
                        : 'text-[#E11D48] dark:text-[#E05260]'
                    }`}
                  >
                    {executionScenarios.planA.badge}
                  </span>
                </div>
                <p className="text-[11px] text-[#526071] dark:text-[#929BA9] leading-snug">
                  {executionScenarios.planA.summary}
                </p>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">Trigger Sweep</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planA.triggerSweep}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">{tr('Zona POI', 'POI Zone')}</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#059669] dark:text-[#00A878] text-right">
                    {executionScenarios.planA.poiZone}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">{tr('Konfirmasi', 'Confirmation')}</dt>
                  <dd className="font-medium text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planA.confirmation}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">Target TP</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planA.targetTp}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="pt-2 border-t border-[#D9E2EC] dark:border-[#20252D] text-xs font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
              {executionScenarios.planA.invalidation}
            </p>
          </div>

          {/* Plan B: Counter-Trend Sweep Setup */}
          <div
            data-testid="smc-pro-read-poi"
            className="py-3.5 md:pl-6 flex flex-col justify-between gap-3"
          >
            <div data-testid="smc-pro-read-projection" className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.06em] text-[#0F172A] dark:text-[#F2F4F7]">
                    {executionScenarios.planB.title}
                  </span>
                  <span className="text-xs font-bold font-mono-numbers tabular-nums text-[#D97706] dark:text-[#F59E0B]">
                    {executionScenarios.planB.badge}
                  </span>
                </div>
                <p className="text-[11px] text-[#526071] dark:text-[#929BA9] leading-snug">
                  {executionScenarios.planB.summary}
                </p>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">Trigger Sweep</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planB.triggerSweep}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">{tr('Zona POI', 'POI Zone')}</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planB.poiZone}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">{tr('Konfirmasi', 'Confirmation')}</dt>
                  <dd className="font-medium text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planB.confirmation}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[#526071] dark:text-[#929BA9] shrink-0">Target TP</dt>
                  <dd className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7] text-right">
                    {executionScenarios.planB.targetTp}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="pt-2 border-t border-[#D9E2EC] dark:border-[#20252D] text-xs font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
              {executionScenarios.planB.invalidation}
            </p>
          </div>
        </div>
      </section>

      {/* =====================================================================
          BLOCK 4 — DETAIL TEKNIS & SIKLUS MAKRO (CLEAN ACCORDIONS)
         ===================================================================== */}
      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9]">
          {tr('DETAIL TEKNIS & SIKLUS MAKRO', 'TECHNICAL DETAILS & MACRO CYCLES')}
        </h2>

        <div className="divide-y divide-[#D9E2EC] dark:divide-[#20252D] border-y border-[#D9E2EC] dark:border-[#20252D]">
          {/* 4A. Collapsible 3-Row MTF Structure & POI Table */}
          {viewMode === 'FULL' && mtfList.length > 0 && (
            <div>
              <button
                type="button"
                data-testid="collapsible-mtf-table-toggle"
                aria-expanded={isMtfTableOpen}
                onClick={() => setIsMtfTableOpen((prev) => !prev)}
                className="w-full min-h-[46px] py-3 rounded-lg flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.06em] text-[#0F172A] dark:text-[#F2F4F7]">
                    {tr('TABEL STRUKTUR MULTI-TIMEFRAME', 'MULTI-TIMEFRAME STRUCTURE TABLE')} ({tradingMode === 'SWING' ? 'D1 • 4H • 1H' : '1H • 15m • 5m'})
                  </span>
                  <span className="text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                    {mtfList
                      .map((t) => `${t.timeframe.toUpperCase()}: ${t.structureBias}`)
                      .join(' · ')}
                  </span>
                </div>
                <span className="w-7 h-7 rounded-full bg-[#F5F7FA] dark:bg-[#0B0E13] border border-[#D9E2EC] dark:border-[#20252D] inline-flex items-center justify-center shrink-0">
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-[#526071] dark:text-[#929BA9] transition-transform duration-200 ${
                      isMtfTableOpen ? 'rotate-180' : 'rotate-0'
                    }`}
                  />
                </span>
              </button>

              {isMtfTableOpen && (
                <div className="pb-3.5 pt-1 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#D9E2EC] dark:border-[#20252D] text-[11px] uppercase tracking-wider text-[#526071] dark:text-[#929BA9]">
                        <th className="py-2 pr-3 text-left font-semibold">TF</th>
                        <th className="py-2 px-2 text-left font-semibold">{tr('Struktur', 'Structure')}</th>
                        <th className="py-2 px-2 text-left font-semibold">{tr('POI Aktif', 'Active POI')}</th>
                        <th className="py-2 pl-2 text-right font-semibold">{tr('Kunci LH/HL', 'LH/HL Lock')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D9E2EC] dark:divide-[#20252D] font-mono-numbers tabular-nums">
                      {mtfList.map((tfItem, idx) => {
                        const poi = tfItem.poiHierarchy;
                        const activeLayer =
                          poi.activeTargetLayer === 'LAYER_2_EXTREME_OB'
                            ? poi.layer2ExtremeOb
                            : poi.layer1DecisionalFvgOte;
                        const biasColor =
                          tfItem.structureBias === 'BULLISH'
                            ? 'text-[#059669] dark:text-[#00A878]'
                            : tfItem.structureBias === 'BEARISH'
                            ? 'text-[#E11D48] dark:text-[#E05260]'
                            : 'text-[#526071] dark:text-[#929BA9]';

                        return (
                          <tr
                            key={tfItem.timeframe}
                            data-testid={`smc-tf-row-${tfItem.timeframe}`}
                          >
                            <td className="py-2.5 pr-3 font-semibold text-[#0F172A] dark:text-[#F2F4F7] whitespace-nowrap">
                              {tfItem.timeframe.toUpperCase()}{' '}
                              <span className="font-sans text-[10px] text-[#526071] dark:text-[#929BA9]">
                                ({idx === 0 ? 'HTF' : idx === 1 ? 'MTF' : 'LTF'})
                              </span>
                            </td>
                            <td className="py-2.5 px-2 whitespace-nowrap">
                              <span className={`font-sans font-semibold ${biasColor}`}>
                                {tfItem.structureBias}
                              </span>{' '}
                              <span className="text-[11px] text-[#526071] dark:text-[#929BA9]">
                                · {tfItem.pdZone} ({tfItem.positionPct}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2 whitespace-nowrap text-[#0F172A] dark:text-[#F2F4F7]">
                              ${activeLayer.low.toFixed(2)}–${activeLayer.high.toFixed(2)}{' '}
                              <span className="font-sans text-[11px] text-[#526071] dark:text-[#929BA9]">
                                ({poi.activeTargetLayer === 'LAYER_2_EXTREME_OB' ? 'OB' : 'FVG/OTE'})
                              </span>
                            </td>
                            <td className="py-2.5 pl-2 text-right font-semibold text-[#0F172A] dark:text-[#F2F4F7] whitespace-nowrap">
                              {tfItem.structuralLock.protectedSwingType} $
                              {tfItem.structuralLock.protectedSwingPrice.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4B. Collapsible Read-Only Mini Chart (Collapsed by Default) */}
          <div>
            <button
              type="button"
              data-testid="collapsible-chart-toggle"
              aria-expanded={isChartOpen}
              onClick={() => setIsChartOpen((prev) => !prev)}
              className="w-full min-h-[46px] py-3 rounded-lg flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.06em] text-[#0F172A] dark:text-[#F2F4F7]">
                  {tr('MINI CHART STRUKTUR · ZONA EQ 50%, OTE & BOX AMD', 'STRUCTURE MINI CHART · EQ 50%, OTE & AMD BOX')}
                </span>
                <span className="text-xs font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                  TF {selectedChartTf.toUpperCase()} · Read-Only
                </span>
              </div>
              <span className="w-7 h-7 rounded-full bg-[#F5F7FA] dark:bg-[#0B0E13] border border-[#D9E2EC] dark:border-[#20252D] inline-flex items-center justify-center shrink-0">
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#526071] dark:text-[#929BA9] transition-transform duration-200 ${
                    isChartOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </span>
            </button>

            {isChartOpen && (
              <div className="pb-4 pt-2 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="inline-flex items-center p-1 rounded-full bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none self-start">
                    {CHART_TF_PILLS[tradingMode].map((tf) => (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setSelectedChartTf(tf.id)}
                        className={`min-h-[30px] px-3.5 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                          selectedChartTf === tf.id
                            ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607]'
                            : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7]'
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                    {chartSmc && chartSmc.swingHigh > 0 ? (
                      <>
                        <span>EQ 50%: ${chartSmc.equilibrium.toFixed(2)}</span>
                        <span className="text-[#0F172A] dark:text-[#F2F4F7]">
                          POI 1: ${chartSmc.poiHierarchy.layer1DecisionalFvgOte.low.toFixed(2)}–$
                          {chartSmc.poiHierarchy.layer1DecisionalFvgOte.high.toFixed(2)}
                        </span>
                        <span className="text-[#D97706] dark:text-[#F59E0B]">
                          POI 2: ${chartSmc.poiHierarchy.layer2ExtremeOb.low.toFixed(2)}–$
                          {chartSmc.poiHierarchy.layer2ExtremeOb.high.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <span>EQ 50%: — · POI 1: — · POI 2: —</span>
                    )}
                  </div>
                </div>

                {chartCandles.length === 0 ? (
                  <div className="h-[280px] rounded-lg border border-[#D9E2EC] dark:border-[#20252D] bg-white dark:bg-[#101318] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none flex flex-col items-center justify-center gap-3 px-4 text-center text-xs text-[#526071] dark:text-[#929BA9]">
                    <span>
                      {isLoading
                        ? tr('Memuat data candlestick XAU/USD...', 'Loading XAU/USD candlestick data...')
                        : tr('Data candlestick untuk timeframe ini belum tersedia.', 'Candlestick data for this timeframe is not available yet.')}
                    </span>
                    {!isLoading && (
                      <button
                        type="button"
                        onClick={loadSampleOrCachedCandles}
                        className="min-h-[36px] px-4 py-1.5 rounded-full bg-[#0F172A] dark:bg-white text-white dark:text-[#050607] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                      >
                        {tr('Muat Data Sampel / Cache', 'Load Sample / Cached Data')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    ref={chartContainerRef}
                    data-testid="confluence-mini-chart-canvas"
                    className="w-full h-[280px] rounded-lg overflow-hidden border border-[#D9E2EC] dark:border-[#20252D]"
                  />
                )}
              </div>
            )}
          </div>

          {/* 4C. Merged Single-Line Summary Bar for Lunar, Solar & Seasonality + Heatmap */}
          <div data-testid="seasonality-heatmap-section">
            <button
              type="button"
              data-testid="collapsible-cycle-summary-toggle"
              aria-expanded={isCycleDetailOpen}
              onClick={() => setIsCycleDetailOpen((prev) => !prev)}
              className="w-full min-h-[46px] py-3 rounded-lg flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
            >
              <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.06em] font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7]">
                  {cycleSummaryLine}
                </span>
                <span
                  className={`text-xs font-mono-numbers tabular-nums font-semibold ${
                    result.seasonality.liveMomPct >= 0
                      ? 'text-[#059669] dark:text-[#00A878]'
                      : 'text-[#E11D48] dark:text-[#E05260]'
                  }`}
                >
                  MoM Live {result.seasonality.liveMomPct > 0 ? '+' : ''}
                  {result.seasonality.liveMomPct}%
                </span>
              </div>
              <span className="w-7 h-7 rounded-full bg-[#F5F7FA] dark:bg-[#0B0E13] border border-[#D9E2EC] dark:border-[#20252D] inline-flex items-center justify-center shrink-0">
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#526071] dark:text-[#929BA9] transition-transform duration-200 ${
                    isCycleDetailOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </span>
            </button>

            {isCycleDetailOpen && (
              <div className="pb-4 pt-2 space-y-4">
                {/* Seamless 3-Column Cycle Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#D9E2EC] dark:divide-[#20252D] border-y border-[#D9E2EC] dark:border-[#20252D] text-xs">
                  <div className="py-3 md:pr-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9] block">
                      {tr('SIKLUS LUNAR (ASTRONACCI)', 'LUNAR CYCLE (ASTRONACCI)')}
                    </span>
                    <p className="font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                      {result.astronacci.lunarPhaseLabelId}
                    </p>
                    <p className="font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                      {tr('Menuju', 'Toward')} {result.astronacci.nextLunarEvent} ({result.astronacci.daysUntilNextLunarEvent}{tr('h', 'd')}) · {tr('Iluminasi', 'Illumination')}{' '}
                      {result.astronacci.illuminationPct}%
                    </p>
                  </div>

                  <div className="py-3 md:px-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9] block">
                      SOLAR CARDINAL &amp; FIB TIME
                    </span>
                    <p className="font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                      {result.astronacci.isFibTimeCluster
                        ? tr('Cluster Fib Time Aktif (≥ 2 Titik)', 'Active Fib Time Cluster (≥ 2 Hits)')
                        : result.astronacci.solarCardinalLabelId}
                    </p>
                    <p className="font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                      {result.astronacci.fibTimeHits.length > 0
                        ? result.astronacci.fibTimeHits
                            .map((h) => `F${h.monthsElapsed} ${tr('dr', 'from')} ${h.swingDate.slice(0, 7)}`)
                            .join(' · ')
                        : tr('Tidak ada pertemuan angka Fibonacci bulan ini.', 'No Fibonacci time confluence this month.')}
                    </p>
                  </div>

                  <div className="py-3 md:pl-4 space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#526071] dark:text-[#929BA9] block">
                      SEASONALITY {result.seasonality.monthFullName.toUpperCase()}
                    </span>
                    <p className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                      {tr('Win-Rate Hijau', 'Bullish Win-Rate')} {result.seasonality.winRatePct}% ({result.seasonality.greenCount}/
                      {result.seasonality.sampleYears} {tr('thn', 'yrs')})
                    </p>
                    <p className="font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                      {tr('Rata-rata', 'Average')} {result.seasonality.avgReturnPct > 0 ? '+' : ''}
                      {result.seasonality.avgReturnPct}% · {tr('Acuan', 'Ref')} ${XAUUSD_SEASONALITY.prevMonthClose.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Monthly Return Heatmap Table */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                      {tr('Heatmap Return Bulanan XAU/USD (2018–2026)', 'XAU/USD Monthly Return Heatmap (2018–2026)')}
                    </span>
                    <span className="text-[11px] font-mono-numbers tabular-nums text-[#526071] dark:text-[#929BA9]">
                      {tr('Penutupan Okt 2026:', 'Oct 2026 Close:')} ${XAUUSD_SEASONALITY.prevMonthClose.toFixed(2)}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-xs font-mono-numbers tabular-nums">
                      <thead>
                        <tr className="border-b border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9]">
                          <th className="py-2 pr-3 text-left font-semibold sticky left-0 bg-[#EEF2F6] dark:bg-[#050607] z-10">
                            {tr('Tahun', 'Year')}
                          </th>
                          {MONTH_LABELS_ID.map((m, mIdx) => (
                            <th
                              key={m}
                              className={`py-2 px-1.5 text-right font-semibold ${
                                mIdx === XAUUSD_SEASONALITY.currentTargetMonthIndex
                                  ? 'text-[#0F172A] dark:text-[#F2F4F7] underline underline-offset-4'
                                  : ''
                              }`}
                            >
                              {m}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D9E2EC] dark:divide-[#20252D]">
                        {heatmapYears.map((year) => {
                          const row = XAUUSD_SEASONALITY.monthlyPct[year] || [];
                          return (
                            <tr key={year}>
                              <td className="py-1.5 pr-3 font-semibold text-[#0F172A] dark:text-[#F2F4F7] sticky left-0 bg-[#EEF2F6] dark:bg-[#050607] z-10">
                                {year}
                              </td>
                              {MONTH_LABELS_ID.map((_, mIdx) => {
                                const isLiveCell =
                                  year === XAUUSD_SEASONALITY.currentTargetYear &&
                                  mIdx === XAUUSD_SEASONALITY.currentTargetMonthIndex;
                                const cellVal = isLiveCell ? result.seasonality.liveMomPct : row[mIdx];
                                const cellClass = getHeatmapCellStyle(cellVal, isLiveCell);
                                return (
                                  <td key={`${year}-${mIdx}`} className="py-1 px-1 text-right">
                                    <span
                                      className={`inline-block w-full px-1.5 py-1 rounded ${cellClass}`}
                                    >
                                      {cellVal !== undefined && Number.isFinite(cellVal)
                                        ? `${cellVal > 0 ? '+' : ''}${cellVal.toFixed(2)}%`
                                        : '—'}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {showPlaybookGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tr(
            'Playbook Struktur SMC, AMD & Siklus Waktu',
            'SMC Structure, AMD & Time Cycle Playbook'
          )}
          data-testid="cycle-playbook-sheet"
          onClick={() => setShowPlaybookGuide(false)}
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 flex items-end sm:items-center justify-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-[20px] sm:rounded-2xl bg-white dark:bg-[#101318] border-t sm:border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] max-h-[85vh] overflow-y-auto px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:p-6 space-y-4"
          >
            <div className="w-10 h-1 rounded-full bg-[#D9E2EC] dark:bg-[#20252D] mx-auto sm:hidden" />

            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#D9E2EC] dark:border-[#20252D]">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9] block">
                  {tr('PLAYBOOK SMC & SIKLUS · XAU/USD', 'SMC & CYCLE PLAYBOOK · XAU/USD')}
                </span>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F2F4F7] mt-0.5">
                  {tr(
                    'Panduan Membaca Cycle & Confluence',
                    'How to Read Cycle & Confluence'
                  )}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaybookGuide(false)}
                aria-label={tr('Tutup Playbook', 'Close Playbook')}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-full text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            <div className="divide-y divide-[#D9E2EC] dark:divide-[#20252D]">
              {[
                {
                  badge: '01 · AMD GATEKEEPER',
                  title: tr(
                    'Akumulasi · Manipulasi · Distribusi (PO3)',
                    'Accumulation · Manipulation · Distribution (PO3)'
                  ),
                  body: tr(
                    'Pasar cenderung membangun rentang sempit di sesi Asia (Akumulasi), melakukan sapuan Stop Loss palsu di pembukaan London/NY (Manipulasi/Sweep), lalu bergerak ke arah tren sesungguhnya (Distribusi). Saat status WAIT, tahan entry hingga sapuan likuiditas selesai.',
                    'Price typically builds a tight range in Tokyo/Asia (Accumulation), executes a false Stop Loss sweep at London/NY open (Manipulation/Sweep), then expands in the true trend direction (Distribution). When status is WAIT, hold entry until the sweep completes.'
                  ),
                },
                {
                  badge: '02 · PETA LIKUIDITAS (TRAP MAP)',
                  title: tr(
                    'BSL (Target Atas) vs SSL (Target Bawah)',
                    'BSL (Upper Target) vs SSL (Lower Target)'
                  ),
                  body: tr(
                    'BSL (Buy-Side Liquidity) adalah area berkumpulnya Stop Loss posisi Sell di atas puncak sesi, sedangkan SSL (Sell-Side Liquidity) adalah area Stop Loss posisi Buy di bawah dasar sesi. Area ini menjadi magnet penarikan harga sekaligus titik rawan jebakan breakout.',
                    'BSL (Buy-Side Liquidity) marks clustered Sell Stop Losses above session highs, while SSL (Sell-Side Liquidity) marks Buy Stop Losses below session lows. These levels act as price magnets and frequent false-breakout traps.'
                  ),
                },
                {
                  badge: '03 · ZONA POI & EQUILIBRIUM 50%',
                  title: tr(
                    'FVG/OTE (Lapis 1) & Extreme OB (Lapis 2)',
                    'FVG/OTE (Layer 1) & Extreme OB (Layer 2)'
                  ),
                  body: tr(
                    'Garis Equilibrium (EQ 50%) membagi rentang harga menjadi zona Premium (mahal, ideal untuk Sell) dan Discount (murah, ideal untuk Buy). Zona POI menandai area pantulan institusional: FVG/OTE sebagai titik pijakan pertama, dan Extreme Order Block (OB) sebagai benteng pertahanan terakhir.',
                    'Equilibrium (EQ 50%) divides the dealing range into Premium (expensive, ideal for Sell) and Discount (cheap, ideal for Buy). POI zones highlight institutional reaction areas: FVG/OTE as the primary decisional zone, and Extreme Order Block (OB) as the final defense.'
                  ),
                },
                {
                  badge: '04 · SKENARIO JIKA → MAKA',
                  title: tr(
                    'Plan A (Searah Tren) vs Plan B (Counter-Sweep)',
                    'Plan A (Trend Continuation) vs Plan B (Counter-Sweep)'
                  ),
                  body: tr(
                    'Plan A adalah skenario utama mengikuti probabilitas tertinggi setelah koreksi ke Zona POI. Plan B adalah skenario cadangan jika harga menyapu BSL/SSL secara ekstrem lalu gagal melanjutkan tren (patah struktur CHoCH/MSS). Perhatikan baris Invalidasi sebagai batas wajib keluar.',
                    'Plan A is the primary setup aligned with the dominant trend after a pullback into POI. Plan B is the contingency setup if price sweeps BSL/SSL and rejects sharply with a structure shift (CHoCH/MSS). Always respect the Invalidation level as your hard exit.'
                  ),
                },
                {
                  badge: '05 · SIKLUS MAKRO & ASTRONACCI',
                  title: tr(
                    'Seasonality Bulanan + Fase Lunar & Solar',
                    'Monthly Seasonality + Lunar & Solar Cycles'
                  ),
                  body: tr(
                    'Mengukur kecenderungan historis XAU/USD dari data bulanan 2018–2026 yang dipadukan dengan jendela waktu New Moon / Full Moon dan deret waktu Fibonacci untuk mendeteksi potensi titik balik (time pivot) makro.',
                    'Combines historical XAU/USD monthly seasonality (2018–2026) with New Moon / Full Moon windows and Fibonacci time clusters to identify high-probability macro time pivots.'
                  ),
                },
              ].map((sec) => (
                <div key={sec.badge} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] font-mono-numbers text-[#526071] dark:text-[#929BA9] block">
                    {sec.badge}
                  </span>
                  <h4 className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#F2F4F7]">
                    {sec.title}
                  </h4>
                  <p className="text-xs text-[#526071] dark:text-[#929BA9] leading-relaxed">
                    {sec.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#D9E2EC] dark:border-[#20252D] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#526071] dark:text-[#929BA9]">
                {tr(
                  'Tip: Gunakan Full Confluence ON untuk memadukan struktur candle + siklus.',
                  'Tip: Keep Full Confluence ON to combine live candle structure + cycles.'
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowPlaybookGuide(false)}
                className="min-h-[38px] px-5 py-2 rounded-full bg-[#0F172A] hover:bg-[#1E293B] dark:bg-white dark:hover:bg-[#E2E8F0] text-white dark:text-[#0F172A] text-xs font-semibold transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Mengerti', 'Got It')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CycleConfluencePage;
