/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  calculatePerformance,
  formatCurrency,
  formatProfitFactor,
  formatRMultiple,
  formatGrowthPercent,
  computePeriodTradesAndStartingBalance,
  extractTradeLocalDateKey,
  EquityPoint,
} from '../../utils/calculations';
import {
  useGlobalCurrency,
  computeCumulativeProfitInDisplayCurrency,
} from '../../utils/currencyRate';
import { EquityChart } from '../dashboard/EquityChart';
import { DrawdownChart } from '../dashboard/DrawdownChart';
import { RadarChart } from '../dashboard/RadarChart';
import { PerformanceCalendar } from '../dashboard/PerformanceCalendar';
import {
  BarChart,
  RotateCcw,
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  X,
  ChevronDown,
} from 'lucide-react';

interface AnalyticsViewProps {
  trades: Trade[];
  settings: AppSettings;
  onViewTrade?: (trade: Trade) => void;
}

type PeriodPreset = 'ALL' | 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH' | '7D' | '30D' | 'YTD' | 'CUSTOM';
type ChartRangeOption = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
type BreakdownCategory = 'day' | 'session' | 'instrument';

const CHART_RANGE_OPTIONS: { id: ChartRangeOption; label: string }[] = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'All Time' },
];

/**
 * Filters an equityCurve by a relative chart timeframe ('1D', '1W', '1M', '3M', '6M', '1Y', 'ALL')
 * anchored to the latest trade date in the curve so historical journals work accurately.
 */
const filterEquityCurveByRange = (
  curve: EquityPoint[],
  range: ChartRangeOption
): EquityPoint[] => {
  if (!curve || curve.length <= 1 || range === 'ALL') return curve;

  const tradePoints = curve.filter((pt) => pt.index > 0);
  if (tradePoints.length === 0) return curve;

  const lastPoint = tradePoints[tradePoints.length - 1];
  const anchorKey = extractTradeLocalDateKey(lastPoint.date);
  if (!anchorKey) return curve;

  const anchorDate = new Date(anchorKey + 'T23:59:59');
  if (Number.isNaN(anchorDate.getTime())) return curve;

  const cutoff = new Date(anchorDate);
  if (range === '1D') cutoff.setDate(cutoff.getDate() - 1);
  else if (range === '1W') cutoff.setDate(cutoff.getDate() - 7);
  else if (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);

  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(
    cutoff.getDate()
  ).padStart(2, '0')}`;

  const matchingIndices: number[] = [];
  curve.forEach((pt, idx) => {
    if (pt.index === 0) return;
    const dKey = extractTradeLocalDateKey(pt.date);
    if (dKey && dKey >= cutoffKey) {
      matchingIndices.push(idx);
    }
  });

  if (matchingIndices.length === 0) {
    // Fallback to the baseline point right before the last trade
    return curve.slice(Math.max(0, curve.length - 2));
  }

  const firstIdx = matchingIndices[0];
  const baselineIdx = Math.max(0, firstIdx - 1);
  return curve.slice(baselineIdx);
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ trades, settings, onViewTrade }) => {
  const { preferredCurrency, rateRecord, formatDynamic } = useGlobalCurrency();
  const fmtMoney = (valUsd: number, privacy: boolean = isPrivacyMode) =>
    preferredCurrency === 'IDR' ? formatDynamic(valUsd, privacy) : formatCurrency(valUsd, settings, privacy);

  // Global Analytics Period filter state
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState<boolean>(false);

  // Section 02: Equity Curve independent pill dropdown states
  const [equityMode, setEquityMode] = useState<'equity' | 'growth'>('equity');
  const [equityRange, setEquityRange] = useState<ChartRangeOption>('ALL');
  const [openEquityDropdown, setOpenEquityDropdown] = useState<'mode' | 'range' | null>(null);

  // Section 02: Drawdown Curve independent pill dropdown states
  const [drawdownMode, setDrawdownMode] = useState<'percent' | 'nominal'>('percent');
  const [drawdownRange, setDrawdownRange] = useState<ChartRangeOption>('ALL');
  const [openDrawdownDropdown, setOpenDrawdownDropdown] = useState<'mode' | 'range' | null>(null);

  // Section 05: Performance Breakdown unified category selector
  const [breakdownCategory, setBreakdownCategory] = useState<BreakdownCategory>('day');
  const [showBreakdownDropdown, setShowBreakdownDropdown] = useState<boolean>(false);

  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const equityControlsRef = useRef<HTMLDivElement | null>(null);
  const drawdownControlsRef = useRef<HTMLDivElement | null>(null);
  const breakdownMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (periodMenuRef.current && !periodMenuRef.current.contains(target)) {
        setShowPeriodDropdown(false);
      }
      if (equityControlsRef.current && !equityControlsRef.current.contains(target)) {
        setOpenEquityDropdown(null);
      }
      if (drawdownControlsRef.current && !drawdownControlsRef.current.contains(target)) {
        setOpenDrawdownDropdown(null);
      }
      if (breakdownMenuRef.current && !breakdownMenuRef.current.contains(target)) {
        setShowBreakdownDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Privacy Mode state persisted in localStorage
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tradevault_privacy_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncPrivacy = () => {
      try {
        setIsPrivacyMode(localStorage.getItem('tradevault_privacy_mode') === 'true');
      } catch {
        // Ignore storage read errors
      }
    };
    window.addEventListener('tradevault-privacy-change', syncPrivacy);
    window.addEventListener('storage', syncPrivacy);
    return () => {
      window.removeEventListener('tradevault-privacy-change', syncPrivacy);
      window.removeEventListener('storage', syncPrivacy);
    };
  }, []);

  const togglePrivacyMode = () => {
    const next = !isPrivacyMode;
    setIsPrivacyMode(next);
    try {
      localStorage.setItem('tradevault_privacy_mode', String(next));
      window.dispatchEvent(new Event('tradevault-privacy-change'));
    } catch (err) {
      console.error('Failed to save privacy mode state:', err);
    }
  };

  const formatLocalDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle preset period changes using local calendar dates
  const handlePeriodChange = (period: PeriodPreset) => {
    setSelectedPeriod(period);
    const now = new Date();

    if (period === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (period === 'TODAY') {
      const todayStr = formatLocalDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (period === '7D') {
      const past7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      setStartDate(formatLocalDate(past7));
      setEndDate(formatLocalDate(now));
    } else if (period === '30D') {
      const past30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      setStartDate(formatLocalDate(past30));
      setEndDate(formatLocalDate(now));
    } else if (period === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatLocalDate(firstDay));
      setEndDate(formatLocalDate(now));
    } else if (period === 'LAST_MONTH') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatLocalDate(firstDayLastMonth));
      setEndDate(formatLocalDate(lastDayLastMonth));
    } else if (period === 'YTD') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setStartDate(formatLocalDate(startOfYear));
      setEndDate(formatLocalDate(now));
    }
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setSelectedPeriod('CUSTOM');
    setStartDate(start);
    setEndDate(end);
  };

  const handleResetFilters = () => {
    setSelectedPeriod('ALL');
    setStartDate('');
    setEndDate('');
  };

  const getPeriodLabel = (): string => {
    if (selectedPeriod === 'THIS_MONTH') return 'Bulan Ini';
    if (selectedPeriod === 'LAST_MONTH') return 'Bulan Lalu';
    if (selectedPeriod === '7D') return '7 Hari Terakhir';
    if (selectedPeriod === '30D') return '30 Hari Terakhir';
    if (selectedPeriod === 'TODAY') return 'Hari Ini';
    if (selectedPeriod === 'YTD') return 'Tahun Ini';
    if (startDate || endDate) return `${startDate || '...'} s/d ${endDate || '...'}`;
    return 'Semua Waktu';
  };

  // Filter trades based on active date range and compute true period starting balance
  const { filteredTrades, periodStartingBalance } = useMemo(() => {
    return computePeriodTradesAndStartingBalance(trades, settings, startDate, endDate);
  }, [trades, settings, startDate, endDate]);

  const periodSettings = useMemo(
    () => ({
      ...settings,
      startingBalance: periodStartingBalance,
    }),
    [settings, periodStartingBalance]
  );

  // Compute performance metrics strictly based on filtered trades
  const { metrics, equityCurve, dailyPerformance, monthlyPerformance, radarIndicators } =
    useMemo(() => {
      return calculatePerformance(filteredTrades, periodSettings);
    }, [filteredTrades, periodSettings]);

  const isNetProfitPositive = metrics.totalNetProfit >= 0.01;
  const isNetProfitNegative = metrics.totalNetProfit <= -0.01;
  const isJournalCompletelyEmpty = !trades || trades.length === 0;
  const hasClosedTradesInPeriod = metrics.totalTrades > 0;

  // Section 02A: Filtered Equity Curve & Dynamic Summary
  const rangedEquityCurve = useMemo(() => {
    return filterEquityCurveByRange(equityCurve, equityRange);
  }, [equityCurve, equityRange]);

  const equityRangeSummary = useMemo(() => {
    const label = CHART_RANGE_OPTIONS.find((o) => o.id === equityRange)?.label || 'All Time';
    if (!rangedEquityCurve || rangedEquityCurve.length <= 1) {
      return {
        label,
        tradesCount: 0,
        netDelta: 0,
        growthDelta: 0,
      };
    }
    const firstPt = rangedEquityCurve[0];
    const lastPt = rangedEquityCurve[rangedEquityCurve.length - 1];
    const tradesCount = Math.max(0, rangedEquityCurve.length - 1);
    const netDelta = Number((lastPt.equity - firstPt.equity).toFixed(2));
    const baseEq = firstPt.equity > 0 ? firstPt.equity : periodStartingBalance;
    const growthDelta = baseEq > 0 ? Number(((netDelta / baseEq) * 100).toFixed(2)) : 0;
    return {
      label,
      tradesCount,
      netDelta,
      growthDelta,
    };
  }, [rangedEquityCurve, equityRange, periodStartingBalance]);

  // Section 02B: Filtered Drawdown Curve & Dynamic Summary (Current DD, Max DD, Recovery %)
  const rangedDrawdownCurve = useMemo(() => {
    return filterEquityCurveByRange(equityCurve, drawdownRange);
  }, [equityCurve, drawdownRange]);

  const drawdownSummary = useMemo(() => {
    const label = CHART_RANGE_OPTIONS.find((o) => o.id === drawdownRange)?.label || 'All Time';
    if (!rangedDrawdownCurve || rangedDrawdownCurve.length <= 1) {
      return {
        label,
        currentDdPct: 0,
        currentDdAmt: 0,
        maxDdPct: 0,
        maxDdAmt: 0,
        recoveryPct: 100,
      };
    }
    const lastPt = rangedDrawdownCurve[rangedDrawdownCurve.length - 1];
    const currentDdPct = Number((lastPt.drawdownPercent || 0).toFixed(2));
    const currentDdAmt = Number((lastPt.drawdownAmount || 0).toFixed(2));
    const maxDdPct = Number(
      Math.max(...rangedDrawdownCurve.map((d) => d.drawdownPercent || 0), 0).toFixed(2)
    );
    const maxDdAmt = Number(
      Math.max(...rangedDrawdownCurve.map((d) => d.drawdownAmount || 0), 0).toFixed(2)
    );
    // Recovery %: 100% if back at peak (currentDD == 0); else (1 - currentDD / maxDD) * 100
    const recoveryPct =
      maxDdPct <= 0.0001
        ? 100
        : Math.max(0, Math.min(100, Math.round((1 - currentDdPct / maxDdPct) * 100)));

    return {
      label,
      currentDdPct,
      currentDdAmt,
      maxDdPct,
      maxDdAmt,
      recoveryPct,
    };
  }, [rangedDrawdownCurve, drawdownRange]);

  // Section 05: Day of Week Performance (Senin - Jumat)
  const dayOfWeekStats = useMemo(() => {
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const map: Record<
      number,
      { dayName: string; trades: Trade[]; netProfit: number; winCount: number; lossCount: number }
    > = {};
    for (let i = 1; i <= 5; i++) {
      map[i] = { dayName: dayNames[i], trades: [], netProfit: 0, winCount: 0, lossCount: 0 };
    }

    filteredTrades.forEach((t) => {
      const dateKey = extractTradeLocalDateKey(t.dateTime);
      if (!dateKey) return;
      const d = new Date(dateKey + 'T00:00:00');
      const day = d.getDay();
      if (day >= 1 && day <= 5) {
        map[day].trades.push(t);
        map[day].netProfit += t.netProfit || 0;
        if ((t.netProfit || 0) > 0.01) map[day].winCount++;
        else if ((t.netProfit || 0) < -0.01) map[day].lossCount++;
      }
    });

    return Object.values(map).map((item) => {
      const total = item.trades.length;
      const winRate = total > 0 ? Math.round((item.winCount / total) * 100) : 0;
      return {
        ...item,
        total,
        winRate,
        netProfit: Number(item.netProfit.toFixed(2)),
      };
    });
  }, [filteredTrades]);

  // Section 05: Session Performance (Asian, London, New York)
  const sessionStats = useMemo(() => {
    const sessions = [
      { id: 'Asian', label: 'Asia', desc: 'Tokyo & Sydney' },
      { id: 'London', label: 'London', desc: 'Eropa / UK' },
      { id: 'New York', label: 'New York', desc: 'Amerika / US' },
    ];

    return sessions.map((sess) => {
      const matchingTrades = filteredTrades.filter((t) => {
        const s = (t.session || '').toLowerCase();
        if (sess.id === 'Asian') return s.includes('asia') || s.includes('tokyo') || s.includes('sydney');
        if (sess.id === 'London') return s.includes('london') || s.includes('eropa') || s.includes('europe');
        if (sess.id === 'New York') return s.includes('new york') || s.includes('ny') || s.includes('us');
        return false;
      });

      const total = matchingTrades.length;
      let grossWin = 0;
      let grossLoss = 0;
      let winCount = 0;
      let lossCount = 0;
      let netProfit = 0;

      matchingTrades.forEach((t) => {
        netProfit += t.netProfit || 0;
        if ((t.netProfit || 0) > 0.01) {
          winCount++;
          grossWin += t.grossProfit || t.netProfit || 0;
        } else if ((t.netProfit || 0) < -0.01) {
          lossCount++;
          grossLoss += Math.abs(t.grossProfit || t.netProfit || 0);
        }
      });

      const winRate = total > 0 ? Math.round((winCount / total) * 100) : 0;
      const profitFactor =
        grossLoss > 0
          ? Number((grossWin / grossLoss).toFixed(2))
          : grossWin > 0
          ? Infinity
          : 0;

      return {
        id: sess.id,
        label: sess.label,
        desc: sess.desc,
        total,
        winCount,
        lossCount,
        winRate,
        netProfit: Number(netProfit.toFixed(2)),
        profitFactor,
      };
    });
  }, [filteredTrades]);

  // Section 05: Symbol / Instrument Performance
  const symbolStats = useMemo(() => {
    const map: Record<
      string,
      { symbol: string; trades: Trade[]; netProfit: number; winCount: number; lossCount: number }
    > = {};

    filteredTrades.forEach((t) => {
      const sym = (t.instrument || 'XAUUSD').toUpperCase();
      if (!map[sym]) {
        map[sym] = { symbol: sym, trades: [], netProfit: 0, winCount: 0, lossCount: 0 };
      }
      map[sym].trades.push(t);
      map[sym].netProfit += t.netProfit || 0;
      if ((t.netProfit || 0) > 0.01) map[sym].winCount++;
      else if ((t.netProfit || 0) < -0.01) map[sym].lossCount++;
    });

    return Object.values(map)
      .map((item) => {
        const total = item.trades.length;
        const winRate = total > 0 ? Math.round((item.winCount / total) * 100) : 0;
        const avgProfit = total > 0 ? Number((item.netProfit / total).toFixed(2)) : 0;
        return {
          symbol: item.symbol,
          total,
          winRate,
          winCount: item.winCount,
          lossCount: item.lossCount,
          netProfit: Number(item.netProfit.toFixed(2)),
          avgProfit,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredTrades]);

  // Section 03: 6 Pillars Indicator List for Performance Profile
  const pillarList = useMemo(() => {
    const isSufficient = radarIndicators.isDataSufficient;
    return [
      {
        name: 'Win Rate',
        score: isSufficient ? radarIndicators.winRateScore : 0,
        isAvailable: isSufficient,
        displayVal: isSufficient ? `${metrics.winRate}%` : '-',
        target: 'Target: ≥ 50%',
      },
      {
        name: 'Profit Factor',
        score: isSufficient ? radarIndicators.profitFactorScore : 0,
        isAvailable: isSufficient,
        displayVal: isSufficient
          ? formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)
          : '-',
        target: 'Target: ≥ 1.50',
      },
      {
        name: 'Average RR',
        score: isSufficient && metrics.hasValidRiskReward ? radarIndicators.rewardRiskScore : 0,
        isAvailable: isSufficient && metrics.hasValidRiskReward,
        displayVal: isSufficient
          ? formatRMultiple(metrics.averageRiskReward, metrics.hasValidRiskReward)
          : '-',
        target: 'Target: ≥ 1.00R',
      },
      {
        name: 'Expectancy',
        score: isSufficient ? radarIndicators.expectancyScore : 0,
        isAvailable: isSufficient,
        displayVal: isSufficient
          ? fmtMoney(metrics.expectancy, isPrivacyMode)
          : '-',
        target: preferredCurrency === 'IDR' ? 'Target: > Rp0' : 'Target: > $0',
      },
      {
        name: 'Risk Control',
        score: isSufficient
          ? radarIndicators.riskControlScore ?? radarIndicators.drawdownControlScore
          : 0,
        isAvailable: isSufficient,
        displayVal: isSufficient
          ? `${metrics.maxDrawdownPercent > 0 ? '-' : ''}${metrics.maxDrawdownPercent.toFixed(1)}% DD`
          : '-',
        target: 'Target: DD ≤ 10%',
      },
      {
        name: 'Consistency',
        score: isSufficient ? radarIndicators.consistencyScore : 0,
        isAvailable: isSufficient,
        displayVal: isSufficient ? `${radarIndicators.consistencyScore}%` : '-',
        target: 'Target: ≥ 60% Hari Win',
      },
    ];
  }, [radarIndicators, metrics, settings, isPrivacyMode, preferredCurrency, fmtMoney]);

  const breakdownLabels: Record<BreakdownCategory, string> = {
    day: 'Hari & Bulanan',
    session: 'Sesi Trading (Asia / London / NY)',
    instrument: `Instrumen (${symbolStats.length})`,
  };

  return (
    <div className="space-y-10 pb-8 font-['Arial',Helvetica,sans-serif]">
      {/* Complete Empty State when Journal has 0 trades */}
      {isJournalCompletelyEmpty ? (
        <div className="py-16 px-4 flex flex-col items-center justify-center text-center space-y-3 border-b border-[#DDE3EA] dark:border-white/[0.06]">
          <div className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#697586] dark:text-[#8E98A8]">
            <BarChart className="h-7 w-7 stroke-[1.75]" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
            Belum Ada Data Transaksi untuk Dianalisis
          </h3>
          <p className="text-xs text-[#697586] dark:text-[#8E98A8] max-w-md leading-relaxed">
            Jurnal trading Anda masih kosong. Tambahkan transaksi melalui tombol{' '}
            <strong className="text-[#3B82F6] font-semibold">(+) Tambah Transaksi</strong> di navigasi bawah untuk membuka statistik performa, kurva ekuitas, dan profil risiko.
          </p>
        </div>
      ) : (
        <>
          {/* =========================================================================
              SECTION 01 — PERFORMANCE OVERVIEW (SEAMLESS HERO & 6 METRICS)
             ========================================================================= */}
          <section className="space-y-6 pb-8 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            {/* Top Header & Global Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                  01 / PERFORMANCE OVERVIEW
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                  Ringkasan Performa Utama
                </h2>
              </div>

              {/* Global Period Pill Dropdown + Reset + Privacy Toggle */}
              <div className="relative flex flex-wrap items-center gap-2 self-start sm:self-auto max-w-full" ref={periodMenuRef}>
                {(selectedPeriod !== 'ALL' || startDate || endDate) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="p-1.5 rounded-full text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] transition-colors cursor-pointer shrink-0"
                    title="Reset Filter Tanggal"
                    aria-label="Reset Filter Tanggal"
                  >
                    <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
                  </button>
                )}

                {/* Period Selector Pill Dropdown */}
                <div className="max-w-full min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowPeriodDropdown((prev) => !prev)}
                    aria-label="Filter Periode Analisis"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer select-none max-w-full ${
                      showPeriodDropdown || selectedPeriod !== 'ALL' || Boolean(startDate || endDate)
                        ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] border-[#3B82F6]/60'
                        : 'bg-black/[0.03] dark:bg-white/[0.04] text-[#151D2A] dark:text-[#F2F5F9] border-[#DDE3EA] dark:border-white/[0.08] hover:border-[#3B82F6]/40'
                    }`}
                  >
                    <span className="text-[#697586] dark:text-[#8E98A8] shrink-0">Periode:</span>
                    <strong className="font-bold truncate max-w-[165px] sm:max-w-none">{getPeriodLabel()}</strong>
                    <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8] shrink-0" />
                  </button>

                  {showPeriodDropdown && (
                    <div className="absolute left-0 sm:left-auto sm:right-0 top-10 z-30 w-[min(288px,calc(100vw-2rem))] sm:w-80 rounded-2xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-3.5 shadow-2xl space-y-3 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-white/[0.07]">
                        <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                          Filter Periode Analytics
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPeriodDropdown(false)}
                          className="p-1 rounded-full text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        {[
                          { id: 'ALL', label: 'Semua Waktu' },
                          { id: 'TODAY', label: 'Hari Ini' },
                          { id: '7D', label: '7 Hari Terakhir' },
                          { id: '30D', label: '30 Hari Terakhir' },
                          { id: 'THIS_MONTH', label: 'Bulan Ini' },
                          { id: 'LAST_MONTH', label: 'Bulan Lalu' },
                          { id: 'YTD', label: 'Tahun Ini' },
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handlePeriodChange(p.id as PeriodPreset);
                              setShowPeriodDropdown(false);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                              selectedPeriod === p.id && !startDate && !endDate
                                ? 'bg-[#3B82F6] text-white font-bold'
                                : 'bg-black/[0.03] dark:bg-white/[0.04] text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom Date Range Inputs */}
                      <div className="pt-2 border-t border-[#DDE3EA] dark:border-white/[0.07] space-y-2">
                        <span className="block text-[11px] text-[#697586] dark:text-[#8E98A8] font-medium">
                          Rentang Tanggal Kustom
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <label className="block text-[10px] text-[#697586] dark:text-[#7D8796] mb-0.5">
                              Dari
                            </label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => handleCustomDateChange(e.target.value, endDate)}
                              className="w-full rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] px-2 py-1 text-[#151D2A] dark:text-[#F2F5F9] focus:outline-none focus:border-[#3B82F6] tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#697586] dark:text-[#7D8796] mb-0.5">
                              Sampai
                            </label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => handleCustomDateChange(startDate, e.target.value)}
                              className="w-full rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] px-2 py-1 text-[#151D2A] dark:text-[#F2F5F9] focus:outline-none focus:border-[#3B82F6] tabular-nums"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#DDE3EA] dark:border-white/[0.07]">
                        <button
                          type="button"
                          onClick={() => {
                            handleResetFilters();
                            setShowPeriodDropdown(false);
                          }}
                          className="px-2.5 py-1 text-[11px] text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPeriodDropdown(false)}
                          className="px-3 py-1 text-[11px] font-bold rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors cursor-pointer"
                        >
                          Selesai
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Privacy Mode Toggle */}
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`flex items-center justify-center h-8 w-8 rounded-full border transition-colors cursor-pointer shrink-0 ${
                    isPrivacyMode
                      ? 'bg-black/[0.05] dark:bg-white/[0.07] text-amber-500 border-amber-500/40'
                      : 'bg-black/[0.03] dark:bg-white/[0.04] border-[#DDE3EA] dark:border-white/[0.08] text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                  title="Sembunyikan nominal saldo agar aman dibagikan"
                  aria-label="Toggle Mode Privasi"
                >
                  {isPrivacyMode ? (
                    <EyeOff className="h-3.5 w-3.5 stroke-[1.75]" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 stroke-[1.75]" />
                  )}
                </button>
              </div>
            </div>

            {/* Honest Empty Period State when filter yields 0 closed trades */}
            {!hasClosedTradesInPeriod ? (
              <div className="py-8 px-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#DDE3EA] dark:border-white/[0.06] text-center space-y-1.5">
                <p className="text-xs sm:text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                  Belum Ada Transaksi Tertutup pada Periode Ini ({getPeriodLabel()})
                </p>
                <p className="text-[11px] text-[#697586] dark:text-[#7D8796]">
                  Pilih periode lain atau reset filter tanggal untuk melihat kembali analisis performa historis Anda.
                </p>
              </div>
            ) : (
              <>
                {/* Dominant Figure: Total Net Profit / Loss + Companion Growth */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#7D8796]">
                    Total Net Profit / Loss
                  </span>
                  <div
                    className={`text-3xl sm:text-4xl font-bold tabular-nums tracking-tight ${
                      isNetProfitPositive
                        ? 'text-[#00A878]'
                        : isNetProfitNegative
                        ? 'text-[#E05260]'
                        : 'text-[#151D2A] dark:text-[#F2F5F9]'
                    }`}
                  >
                    {isPrivacyMode
                      ? '******'
                      : preferredCurrency === 'IDR'
                      ? (() => {
                          const idrVal = computeCumulativeProfitInDisplayCurrency(
                            filteredTrades,
                            'IDR',
                            rateRecord
                          );
                          const sign = idrVal > 0 ? '+' : idrVal < 0 ? '-' : '';
                          const formatted = new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            maximumFractionDigits: 0,
                          }).format(Math.abs(idrVal));
                          return `${sign}${formatted}`;
                        })()
                      : `${isNetProfitPositive ? '+' : ''}${formatCurrency(
                          metrics.totalNetProfit,
                          settings,
                          false
                        )}`}
                  </div>

                  {/* Growth right below Net Profit as companion info */}
                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-[#697586] dark:text-[#8E98A8]">
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        metrics.totalGainPercent > 0
                          ? 'text-[#00A878]'
                          : metrics.totalGainPercent < 0
                          ? 'text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      {metrics.totalGainPercent >= 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      Growth {formatGrowthPercent(metrics.totalGainPercent, metrics.hasValidGrowthPercent, 2)}
                    </span>
                    <span className="text-[#DDE3EA] dark:text-white/15">·</span>
                    <span>Modal Awal Periode: {fmtMoney(periodStartingBalance, isPrivacyMode)}</span>
                  </div>
                </div>

                {/* 6 Core Metrics in 2-Column Mobile / 6-Column Desktop Grid (Cardless) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-5 gap-x-4 pt-5 border-t border-[#DDE3EA] dark:border-white/[0.06] tabular-nums">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Win Rate
                    </span>
                    <span className="mt-1 block text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                      {metrics.winRate}%
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      {metrics.winningTrades}W / {metrics.losingTrades}L
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Profit Factor
                    </span>
                    <span
                      className={`mt-1 block text-base sm:text-lg font-bold ${
                        metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite
                          ? 'text-[#00A878]'
                          : 'text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      {formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)}
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      Gross Profit / Loss
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Average RR
                    </span>
                    <span className="mt-1 block text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                      {formatRMultiple(metrics.averageRiskReward, metrics.hasValidRiskReward)}
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      Realized R-Multiple
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Expectancy
                    </span>
                    <span
                      className={`mt-1 block text-base sm:text-lg font-bold ${
                        metrics.expectancy > 0
                          ? 'text-[#00A878]'
                          : metrics.expectancy < 0
                          ? 'text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      {fmtMoney(metrics.expectancy, isPrivacyMode)}
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      Harapan / Trade
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Total Trades
                    </span>
                    <span className="mt-1 block text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                      {metrics.totalTrades}
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      {metrics.breakevenTrades} Breakeven
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                      Maximum Drawdown
                    </span>
                    <span
                      className={`mt-1 block text-base sm:text-lg font-bold ${
                        metrics.maxDrawdownPercent > 0
                          ? 'text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      {metrics.maxDrawdownPercent > 0
                        ? `-${metrics.maxDrawdownPercent.toFixed(2)}%`
                        : '0.00%'}
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                      {metrics.maxDrawdownAmount > 0
                        ? `-${fmtMoney(metrics.maxDrawdownAmount, isPrivacyMode)}`
                        : fmtMoney(0, isPrivacyMode)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Critical Drawdown Alert Banner if applicable */}
            {metrics.isAccountInCriticalDrawdown && (
              <div className="p-3.5 rounded-xl bg-[#E05260]/10 border border-[#E05260]/30 text-xs flex items-center gap-2.5">
                <ShieldAlert className="h-4 w-4 stroke-[1.75] text-[#E05260] shrink-0" />
                <div className="text-[#151D2A] dark:text-[#F2F5F9]">
                  <strong className="font-bold text-[#E05260]">Peringatan Risiko Kritis:</strong>{' '}
                  Penurunan modal telah menyentuh batas risiko akun (Drawdown ≥ 100%). Evaluasi ukuran lot dan manajemen risiko.
                </div>
              </div>
            )}
          </section>

          {/* =========================================================================
              SECTION 02 — CAPITAL PERFORMANCE (EQUITY CURVE + DRAWDOWN CURVE)
             ========================================================================= */}
          <section className="space-y-8 pb-8 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                02 / CAPITAL PERFORMANCE
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                Pertumbuhan Ekuitas &amp; Risiko Penurunan Modal
              </h2>
            </div>

            {/* SUB-SECTION 2A: EQUITY CURVE */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    Equity Curve
                  </h3>
                  {/* Dynamic Period Summary Line */}
                  <p className="text-xs text-[#697586] dark:text-[#8E98A8] tabular-nums mt-0.5">
                    <span className="font-semibold text-[#151D2A] dark:text-[#D5DCE6]">
                      {equityRangeSummary.label}
                    </span>
                    {' · '}
                    <span>{equityRangeSummary.tradesCount} Trades</span>
                    {' · '}
                    <span
                      className={`font-bold ${
                        equityRangeSummary.netDelta > 0
                          ? 'text-[#00A878]'
                          : equityRangeSummary.netDelta < 0
                          ? 'text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      {equityMode === 'growth'
                        ? `${equityRangeSummary.growthDelta > 0 ? '+' : ''}${equityRangeSummary.growthDelta.toFixed(2)}%`
                        : `${equityRangeSummary.netDelta > 0 ? '+' : ''}${fmtMoney(
                            equityRangeSummary.netDelta,
                            isPrivacyMode
                          )}`}
                    </span>
                  </p>
                </div>

                {/* Two Compact Pill Dropdowns: 1. Mode (Nominal/Percent), 2. Period (1D..All Time) */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto" ref={equityControlsRef}>
                  {/* Pill Dropdown 1: Mode */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenEquityDropdown((prev) => (prev === 'mode' ? null : 'mode'))
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#3B82F6]/50 transition-colors cursor-pointer select-none whitespace-nowrap"
                    >
                      <span>{equityMode === 'equity' ? 'Nominal' : 'Percent'}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8]" />
                    </button>

                    {openEquityDropdown === 'mode' && (
                      <div className="absolute left-0 top-9 z-30 w-36 rounded-xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-1 shadow-xl text-xs">
                        {[
                          { id: 'equity', label: 'Nominal' },
                          { id: 'growth', label: 'Percent (%)' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setEquityMode(opt.id as 'equity' | 'growth');
                              setOpenEquityDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                              equityMode === opt.id
                                ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] font-bold'
                                : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {equityMode === opt.id && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pill Dropdown 2: Period (Single Pill Dropdown, NEVER a horizontal button row) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenEquityDropdown((prev) => (prev === 'range' ? null : 'range'))
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#3B82F6]/50 transition-colors cursor-pointer select-none tabular-nums"
                    >
                      <span>{equityRangeSummary.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8]" />
                    </button>

                    {openEquityDropdown === 'range' && (
                      <div className="absolute right-0 top-9 z-30 w-36 rounded-xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-1 shadow-xl text-xs tabular-nums">
                        {CHART_RANGE_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setEquityRange(opt.id);
                              setOpenEquityDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                              equityRange === opt.id
                                ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] font-bold'
                                : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {equityRange === opt.id && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <EquityChart
                equityCurve={rangedEquityCurve}
                settings={periodSettings}
                startingBalance={
                  rangedEquityCurve.length > 0 ? rangedEquityCurve[0].equity : periodStartingBalance
                }
                height={290}
                isPrivacyMode={isPrivacyMode}
                embedded={true}
                externalViewMode={equityMode}
                hideInternalControls={true}
              />
            </div>

            {/* Subtle Divider between Equity Curve and Drawdown Curve */}
            <div className="border-t border-[#DDE3EA] dark:border-white/[0.06] pt-6 space-y-4">
              {/* SUB-SECTION 2B: DRAWDOWN CURVE */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    Drawdown Curve
                  </h3>
                  {/* Dynamic Period Summary Line for Drawdown */}
                  <p className="text-xs text-[#697586] dark:text-[#8E98A8] tabular-nums mt-0.5">
                    <span className="font-semibold text-[#151D2A] dark:text-[#D5DCE6]">
                      {drawdownSummary.label}
                    </span>
                    {' · '}
                    <span>
                      Max DD{' '}
                      <strong className="text-[#E05260]">
                        {drawdownMode === 'percent'
                          ? drawdownSummary.maxDdPct > 0
                            ? `-${drawdownSummary.maxDdPct.toFixed(2)}%`
                            : '0.00%'
                          : drawdownSummary.maxDdAmt > 0
                          ? `-${fmtMoney(drawdownSummary.maxDdAmt, isPrivacyMode)}`
                          : fmtMoney(0, isPrivacyMode)}
                      </strong>
                    </span>
                    {' · '}
                    <span>
                      Recovery{' '}
                      <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
                        {drawdownSummary.recoveryPct}%
                      </strong>
                    </span>
                  </p>
                </div>

                {/* Two Compact Pill Dropdowns for Drawdown: 1. Mode (Percent/Nominal), 2. Period */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto" ref={drawdownControlsRef}>
                  {/* Pill Dropdown 1: Mode */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDrawdownDropdown((prev) => (prev === 'mode' ? null : 'mode'))
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#3B82F6]/50 transition-colors cursor-pointer select-none whitespace-nowrap"
                    >
                      <span>{drawdownMode === 'percent' ? 'Percent' : 'Nominal'}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8]" />
                    </button>

                    {openDrawdownDropdown === 'mode' && (
                      <div className="absolute left-0 top-9 z-30 w-36 rounded-xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-1 shadow-xl text-xs">
                        {[
                          { id: 'percent', label: 'Percent (%)' },
                          { id: 'nominal', label: 'Nominal' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setDrawdownMode(opt.id as 'percent' | 'nominal');
                              setOpenDrawdownDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                              drawdownMode === opt.id
                                ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] font-bold'
                                : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {drawdownMode === opt.id && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pill Dropdown 2: Period */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDrawdownDropdown((prev) => (prev === 'range' ? null : 'range'))
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#3B82F6]/50 transition-colors cursor-pointer select-none tabular-nums whitespace-nowrap"
                    >
                      <span>{drawdownSummary.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8]" />
                    </button>

                    {openDrawdownDropdown === 'range' && (
                      <div className="absolute right-0 top-9 z-30 w-36 rounded-xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-1 shadow-xl text-xs tabular-nums">
                        {CHART_RANGE_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setDrawdownRange(opt.id);
                              setOpenDrawdownDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                              drawdownRange === opt.id
                                ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] font-bold'
                                : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {drawdownRange === opt.id && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Required Drawdown Indicators: Current Drawdown, Maximum Drawdown, Recovery */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 py-2.5 border-y border-[#DDE3EA] dark:border-white/[0.06] text-xs tabular-nums">
                <div className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                    Current Drawdown
                  </span>
                  <strong
                    className={`mt-0.5 block text-sm sm:text-base font-bold ${
                      drawdownSummary.currentDdPct > 0
                        ? 'text-[#E05260]'
                        : 'text-[#00A878]'
                    }`}
                  >
                    {drawdownMode === 'percent'
                      ? drawdownSummary.currentDdPct > 0
                        ? `-${drawdownSummary.currentDdPct.toFixed(2)}%`
                        : '0.00%'
                      : drawdownSummary.currentDdAmt > 0
                      ? `-${fmtMoney(drawdownSummary.currentDdAmt, isPrivacyMode)}`
                      : fmtMoney(0, isPrivacyMode)}
                  </strong>
                </div>

                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                    Maximum Drawdown
                  </span>
                  <strong
                    className={`mt-0.5 block text-sm sm:text-base font-bold ${
                      drawdownSummary.maxDdPct > 0
                        ? 'text-[#E05260]'
                        : 'text-[#151D2A] dark:text-[#F2F5F9]'
                    }`}
                  >
                    {drawdownMode === 'percent'
                      ? drawdownSummary.maxDdPct > 0
                        ? `-${drawdownSummary.maxDdPct.toFixed(2)}%`
                        : '0.00%'
                      : drawdownSummary.maxDdAmt > 0
                      ? `-${fmtMoney(drawdownSummary.maxDdAmt, isPrivacyMode)}`
                      : fmtMoney(0, isPrivacyMode)}
                  </strong>
                </div>

                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                    Recovery
                  </span>
                  <strong
                    className={`mt-0.5 block text-sm sm:text-base font-bold ${
                      drawdownSummary.recoveryPct >= 100
                        ? 'text-[#00A878]'
                        : 'text-[#151D2A] dark:text-[#F2F5F9]'
                    }`}
                  >
                    {drawdownSummary.recoveryPct}%
                  </strong>
                </div>
              </div>

              <DrawdownChart
                equityCurve={rangedDrawdownCurve}
                settings={periodSettings}
                height={185}
                isPrivacyMode={isPrivacyMode}
                viewMode={drawdownMode}
              />
            </div>
          </section>

          {/* =========================================================================
              SECTION 03 — PERFORMANCE PROFILE (6 PILLARS RADAR & SCORE)
             ========================================================================= */}
          <section className="space-y-5 pb-8 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                  03 / PERFORMANCE PROFILE
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                  Performance Profile
                </h2>
              </div>

              {/* Overall Performance Score Pill */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#697586] dark:text-[#7D8796]">Overall Score:</span>
                <span className="px-3 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] text-xs tabular-nums font-bold">
                  {radarIndicators.isDataSufficient
                    ? `${Math.round(
                        (radarIndicators.winRateScore +
                          radarIndicators.profitFactorScore +
                          radarIndicators.rewardRiskScore +
                          radarIndicators.expectancyScore +
                          (radarIndicators.riskControlScore ?? radarIndicators.drawdownControlScore) +
                          radarIndicators.consistencyScore) /
                          6
                      )}/100`
                    : 'Data Belum Cukup'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left / Top: Compact Seamless Radar Chart */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-[300px]">
                  <RadarChart indicators={radarIndicators} size={280} />
                </div>
              </div>

              {/* Right / Bottom: Clean 6-Pillar List without Boxed Mini-Cards */}
              <div className="lg:col-span-7">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {pillarList.map((p, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 border-b border-[#DDE3EA] dark:border-white/[0.06] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {p.name}
                        </span>
                        <span className="tabular-nums font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                          {p.displayVal}
                        </span>
                      </div>

                      {/* Slim Progress Bar */}
                      <div className="h-1 w-full bg-[#DDE3EA] dark:bg-white/[0.07] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            !p.isAvailable
                              ? 'bg-transparent'
                              : p.score >= 70
                              ? 'bg-[#00A878]'
                              : p.score >= 50
                              ? 'bg-[#3B82F6]'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: p.isAvailable ? `${Math.max(4, p.score)}%` : '0%' }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#697586] dark:text-[#7D8796]">
                        <span>{p.target}</span>
                        <span className="tabular-nums font-semibold">
                          {p.isAvailable ? `Skor ${p.score}/100` : 'Data Belum Cukup'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* =========================================================================
              SECTION 04 — PERFORMANCE CALENDAR
             ========================================================================= */}
          <section className="space-y-4 pb-8 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                04 / PERFORMANCE CALENDAR
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                Kalender Performa &amp; Aktivitas Harian
              </h2>
            </div>

            <PerformanceCalendar
              dailyPerformance={dailyPerformance}
              monthlyPerformance={monthlyPerformance}
              settings={periodSettings}
              isPrivacyMode={isPrivacyMode}
              trades={filteredTrades}
              onViewTrade={onViewTrade}
            />
          </section>

          {/* =========================================================================
              SECTION 05 — PERFORMANCE BREAKDOWN (HARI, SESI, INSTRUMEN)
             ========================================================================= */}
          <section className="space-y-5 pb-8 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                  05 / PERFORMANCE BREAKDOWN
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                  Rincian Performa Berdasarkan Dimensi
                </h2>
              </div>

              {/* Compact Pill Dropdown to switch between Hari, Sesi, and Instrumen */}
              <div className="relative self-start sm:self-auto max-w-full" ref={breakdownMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowBreakdownDropdown((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.08] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#3B82F6]/50 transition-colors cursor-pointer select-none max-w-full"
                >
                  <span className="text-[#697586] dark:text-[#8E98A8] shrink-0">Dimensi:</span>
                  <strong className="font-bold truncate">{breakdownLabels[breakdownCategory]}</strong>
                  <ChevronDown className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8] shrink-0" />
                </button>

                {showBreakdownDropdown && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-9 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0E1217] p-1 shadow-xl text-xs">
                    {(['day', 'session', 'instrument'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setBreakdownCategory(cat);
                          setShowBreakdownDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                          breakdownCategory === cat
                            ? 'bg-black/[0.05] dark:bg-white/[0.07] text-[#151D2A] dark:text-[#F2F5F9] font-bold'
                            : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                        }`}
                      >
                        <span>{breakdownLabels[cat]}</span>
                        {breakdownCategory === cat && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* DIMENSION 1: HARI DALAM SEMINGGU & REKAP BULANAN */}
            {breakdownCategory === 'day' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Senin - Jumat */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                    Hari dalam Seminggu (Senin – Jumat)
                  </span>
                  <div className="divide-y divide-[#DDE3EA] dark:divide-white/[0.06] border-y border-[#DDE3EA] dark:border-white/[0.06]">
                    {dayOfWeekStats.map((item) => (
                      <div
                        key={item.dayName}
                        className="py-3 px-1 flex items-center justify-between gap-3 text-xs tabular-nums"
                      >
                        <div>
                          <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] block">
                            {item.dayName}
                          </span>
                          <span className="text-[11px] text-[#697586] dark:text-[#7D8796]">
                            {item.total} Trade · Win Rate {item.winRate}%
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-bold text-xs sm:text-sm ${
                              item.netProfit > 0.01
                                ? 'text-[#00A878]'
                                : item.netProfit < -0.01
                                ? 'text-[#E05260]'
                                : 'text-[#697586] dark:text-[#7D8796]'
                            }`}
                          >
                            {item.netProfit > 0 ? '+' : ''}
                            {fmtMoney(item.netProfit, isPrivacyMode)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rekapitulasi Bulanan */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                    Rekapitulasi Bulanan
                  </span>
                  {monthlyPerformance.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#697586] dark:text-[#7D8796] border-y border-[#DDE3EA] dark:border-white/[0.06]">
                      Belum ada data bulanan.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#DDE3EA] dark:divide-white/[0.06] border-y border-[#DDE3EA] dark:border-white/[0.06] max-h-72 overflow-y-auto">
                      {monthlyPerformance.map((m) => (
                        <div
                          key={m.monthKey}
                          className="py-3 px-1 flex items-center justify-between gap-3 text-xs tabular-nums"
                        >
                          <div>
                            <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] block">
                              {m.label}
                            </span>
                            <span className="text-[11px] text-[#697586] dark:text-[#7D8796]">
                              {m.tradesCount} Trade · Win Rate {m.winRate}%
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`font-bold text-xs sm:text-sm ${
                                m.netProfit > 0.01
                                  ? 'text-[#00A878]'
                                  : m.netProfit < -0.01
                                  ? 'text-[#E05260]'
                                  : 'text-[#697586] dark:text-[#7D8796]'
                              }`}
                            >
                              {m.netProfit > 0 ? '+' : ''}
                              {fmtMoney(m.netProfit, isPrivacyMode)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DIMENSION 2: SESI TRADING (ASIA, LONDON, NEW YORK) */}
            {breakdownCategory === 'session' && (
              <div className="divide-y divide-[#DDE3EA] dark:divide-white/[0.06] border-y border-[#DDE3EA] dark:border-white/[0.06]">
                {sessionStats.map((sess) => (
                  <div
                    key={sess.id}
                    className="py-3.5 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs tabular-nums"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#151D2A] dark:text-[#F2F5F9]">
                          {sess.label}
                        </span>
                        <span className="text-[11px] text-[#697586] dark:text-[#7D8796]">
                          ({sess.desc})
                        </span>
                      </div>
                      <span className="text-[11px] text-[#697586] dark:text-[#7D8796] mt-0.5 block">
                        {sess.total} Trade ({sess.winCount}W · {sess.lossCount}L)
                      </span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                          Win Rate
                        </span>
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {sess.winRate}%
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                          Profit Factor
                        </span>
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {sess.profitFactor === Infinity ? '∞' : sess.profitFactor.toFixed(2)}
                        </span>
                      </div>

                      <div className="text-right min-w-[96px]">
                        <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                          Net P/L
                        </span>
                        <span
                          className={`font-bold text-xs sm:text-sm ${
                            sess.netProfit > 0.01
                              ? 'text-[#00A878]'
                              : sess.netProfit < -0.01
                              ? 'text-[#E05260]'
                              : 'text-[#697586] dark:text-[#7D8796]'
                          }`}
                        >
                          {sess.netProfit > 0 ? '+' : ''}
                          {fmtMoney(sess.netProfit, isPrivacyMode)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* DIMENSION 3: INSTRUMEN / SIMBOL */}
            {breakdownCategory === 'instrument' && (
              <div>
                {symbolStats.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#697586] dark:text-[#7D8796]">
                    Belum ada data instrumen pada periode ini.
                  </p>
                ) : (
                  <div className="divide-y divide-[#DDE3EA] dark:divide-white/[0.06] border-y border-[#DDE3EA] dark:border-white/[0.06]">
                    {symbolStats.map((item) => (
                      <div
                        key={item.symbol}
                        className="py-3.5 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs tabular-nums"
                      >
                        <div>
                          <span className="font-bold text-sm text-[#151D2A] dark:text-[#F2F5F9] block">
                            {item.symbol}
                          </span>
                          <span className="text-[11px] text-[#697586] dark:text-[#7D8796]">
                            {item.total} Trade ({item.winCount}W · {item.lossCount}L)
                          </span>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-6">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                              Win Rate
                            </span>
                            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                              {item.winRate}%
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                              Rata-rata / Trade
                            </span>
                            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                              {fmtMoney(item.avgProfit, isPrivacyMode)}
                            </span>
                          </div>

                          <div className="text-right min-w-[96px]">
                            <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#7D8796] block">
                              Net P/L
                            </span>
                            <span
                              className={`font-bold text-xs sm:text-sm ${
                                item.netProfit > 0.01
                                  ? 'text-[#00A878]'
                                  : item.netProfit < -0.01
                                  ? 'text-[#E05260]'
                                  : 'text-[#697586] dark:text-[#7D8796]'
                              }`}
                            >
                              {item.netProfit > 0 ? '+' : ''}
                              {fmtMoney(item.netProfit, isPrivacyMode)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* =========================================================================
              SECTION 06 — TRADING BEHAVIOR (STREAKS, AVERAGES & DISTRIBUTION)
             ========================================================================= */}
          <section className="space-y-5">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#697586] dark:text-[#6E7785]">
                06 / TRADING BEHAVIOR
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5">
                Perilaku Eksekusi, Streak &amp; Distribusi Hasil
              </h2>
            </div>

            {/* 5 Behavioral Metrics in Cardless Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-5 gap-x-4 py-4 border-y border-[#DDE3EA] dark:border-white/[0.06] tabular-nums">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                  Win Streak
                </span>
                <span className="mt-1 block text-base sm:text-lg font-bold text-[#00A878]">
                  {metrics.consecutiveWinsMax} Trade
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                  Saat ini: {metrics.currentStreak.count}{' '}
                  {metrics.currentStreak.type === 'WIN'
                    ? 'Win'
                    : metrics.currentStreak.type === 'LOSS'
                    ? 'Loss'
                    : '-'}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                  Loss Streak
                </span>
                <span className="mt-1 block text-base sm:text-lg font-bold text-[#E05260]">
                  {metrics.consecutiveLossesMax} Trade
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                  Maksimal beruntun
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                  Average Win
                </span>
                <span className="mt-1 block text-base sm:text-lg font-bold text-[#00A878]">
                  {metrics.averageWin > 0 ? `+${fmtMoney(metrics.averageWin, isPrivacyMode)}` : fmtMoney(0, isPrivacyMode)}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                  Rata-rata profit / win
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                  Average Loss
                </span>
                <span className="mt-1 block text-base sm:text-lg font-bold text-[#E05260]">
                  {metrics.averageLoss > 0 ? `-${fmtMoney(metrics.averageLoss, isPrivacyMode)}` : fmtMoney(0, isPrivacyMode)}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                  Rata-rata rugi / loss
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#7D8796]">
                  Win / Loss Ratio
                </span>
                <span className="mt-1 block text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.averageLoss > 0
                    ? `${(metrics.averageWin / metrics.averageLoss).toFixed(2)}x`
                    : metrics.averageWin > 0
                    ? '∞'
                    : '0.00x'}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#6E7785]">
                  Payoff Ratio
                </span>
              </div>
            </div>

            {/* Win / Loss / Breakeven Distribution Bar */}
            <div className="space-y-2 pt-1 tabular-nums">
              <div className="flex items-center justify-between text-xs text-[#697586] dark:text-[#8E98A8]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  Distribusi Win / Loss / Breakeven ({metrics.totalTrades} Trade)
                </span>
                <span>
                  {metrics.winningTrades}W · {metrics.losingTrades}L · {metrics.breakevenTrades}BE
                </span>
              </div>

              <div className="h-2 w-full bg-[#DDE3EA] dark:bg-white/[0.07] rounded-full overflow-hidden flex">
                {metrics.totalTrades > 0 && (
                  <>
                    <div
                      className="h-full bg-[#00A878] transition-all"
                      style={{ width: `${(metrics.winningTrades / metrics.totalTrades) * 100}%` }}
                      title={`Winning: ${metrics.winningTrades} (${metrics.winRate}%)`}
                    />
                    <div
                      className="h-full bg-[#E05260] transition-all"
                      style={{ width: `${(metrics.losingTrades / metrics.totalTrades) * 100}%` }}
                      title={`Losing: ${metrics.losingTrades} (${metrics.lossRate}%)`}
                    />
                    <div
                      className="h-full bg-[#7D8796] transition-all"
                      style={{ width: `${(metrics.breakevenTrades / metrics.totalTrades) * 100}%` }}
                      title={`Breakeven: ${metrics.breakevenTrades} (${metrics.breakevenRate}%)`}
                    />
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#697586] dark:text-[#7D8796] pt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#00A878]" />
                  Win ({metrics.winRate}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#E05260]" />
                  Loss ({metrics.lossRate}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#7D8796]" />
                  Breakeven ({metrics.breakevenRate}%)
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
