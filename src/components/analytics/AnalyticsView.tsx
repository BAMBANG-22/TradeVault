/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
} from '../../utils/calculations';
import { EquityChart } from '../dashboard/EquityChart';
import { DrawdownChart } from '../dashboard/DrawdownChart';
import { RadarChart } from '../dashboard/RadarChart';
import { PerformanceCalendar } from '../dashboard/PerformanceCalendar';
import {
  BarChart,
  Calendar,
  Filter,
  RotateCcw,
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  X,
  Check,
} from 'lucide-react';

interface AnalyticsViewProps {
  trades: Trade[];
  settings: AppSettings;
  onViewTrade?: (trade: Trade) => void;
}

type PeriodPreset = 'ALL' | 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH' | '7D' | '30D' | 'YTD' | 'CUSTOM';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ trades, settings, onViewTrade }) => {
  // Period filter state
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState<boolean>(false);

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

  // 6. Day of Week Performance (Senin - Jumat)
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

  // 7. Session Performance (Asian, London, New York)
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

  // 8. Symbol Performance
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

  // 6 Pillars Indicator List for Section 2
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
          ? formatCurrency(metrics.expectancy, settings, isPrivacyMode)
          : '-',
        target: 'Target: Positif > $0',
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
  }, [radarIndicators, metrics, settings, isPrivacyMode]);

  return (
    <div className="space-y-6 font-sans">
      {/* Complete Empty State Banner */}
      {isJournalCompletelyEmpty ? (
        <div className="p-8 sm:p-12 rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-4 rounded-2xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
            <BarChart className="h-8 w-8 stroke-[1.75]" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
            Data Transaksi Jurnal Masih Kosong
          </h3>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-md leading-relaxed">
            Tidak ada transaksi tersimpan untuk dihitung. Tambahkan posisi trading Anda melalui tombol{' '}
            <strong className="text-[#1769E8] font-semibold">(+) Tambah Transaksi</strong> di navigasi bawah untuk mengeksplorasi seluruh metrik analitik profesional.
          </p>
        </div>
      ) : (
        <>
          {/* =========================================================================
              SECTION 1: PERFORMANCE OVERVIEW (UNIFIED CLEAN HERO PANEL)
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-5">
            {/* Top Toolbar: Active Period Indicator & Compact Filter Dropdown */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34] relative">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
                  Periode: <strong className="text-[#151D2A] dark:text-[#F2F5F9] ml-1">{getPeriodLabel()}</strong>
                </span>
                {(selectedPeriod !== 'ALL' || startDate || endDate) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="p-1 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                    title="Reset Filter Tanggal"
                    aria-label="Reset Filter Tanggal"
                  >
                    <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
                  </button>
                )}
              </div>

              {/* Action Buttons: Compact Icon-Only Filter Trigger + Privacy Toggle */}
              <div className="flex items-center gap-2">
                {/* Filter Trigger Button (Icon Only, styled consistently with Trade Log) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                    title="Filter Periode Analisis"
                    aria-label="Filter Periode Analisis"
                    className={`flex items-center justify-center h-9 w-9 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                      showPeriodDropdown || selectedPeriod !== 'ALL' || Boolean(startDate || endDate)
                        ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#1769E8]'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#151D2A] dark:text-[#F2F5F9] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50'
                    }`}
                  >
                    <Filter className="h-4 w-4 stroke-[1.75]" />
                  </button>

                  {/* Period Filter Dropdown Popover */}
                  {showPeriodDropdown && (
                    <div className="absolute right-0 top-11 z-30 w-72 sm:w-80 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3.5 shadow-xl space-y-3 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          Pilih Periode Analisis
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPeriodDropdown(false)}
                          className="p-1 rounded text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Quick Chips */}
                      <div>
                        <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1.5 font-medium">
                          Pilihan Cepat
                        </span>
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
                              className={`px-2.5 py-1.5 rounded-lg border text-left font-medium transition-colors cursor-pointer ${
                                selectedPeriod === p.id && !startDate && !endDate
                                  ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                                  : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Date Range Inputs */}
                      <div className="pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-2">
                        <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] font-medium">
                          Rentang Tanggal Kustom
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">Dari</label>
                            <input
                              type="date"
                              value={startDate}
                              onChange={(e) => handleCustomDateChange(e.target.value, endDate)}
                              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2 py-1 text-[#151D2A] dark:text-[#F2F5F9] focus:outline-none focus:border-[#1769E8] font-mono-numbers tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">Sampai</label>
                            <input
                              type="date"
                              value={endDate}
                              onChange={(e) => handleCustomDateChange(startDate, e.target.value)}
                              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2 py-1 text-[#151D2A] dark:text-[#F2F5F9] focus:outline-none focus:border-[#1769E8] font-mono-numbers tabular-nums"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#DDE3EA] dark:border-[#252B34]">
                        <button
                          type="button"
                          onClick={() => {
                            handleResetFilters();
                            setShowPeriodDropdown(false);
                          }}
                          className="px-2.5 py-1 text-[11px] rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPeriodDropdown(false)}
                          className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-[#1769E8] text-white hover:bg-[#1769E8]/90 transition-colors cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Privacy Mode Toggle */}
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`flex items-center justify-center h-9 w-9 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    isPrivacyMode
                      ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border-[#DDE3EA] dark:border-[#252B34]'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                  title="Sembunyikan nominal saldo agar aman dibagikan"
                  aria-label="Toggle Mode Privasi"
                >
                  {isPrivacyMode ? (
                    <EyeOff className="h-4 w-4 stroke-[1.75] text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Eye className="h-4 w-4 stroke-[1.75]" />
                  )}
                </button>
              </div>
            </div>

            {/* Hero Main Figure: Net Profit Anchor */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
                    Total Net Profit / Loss
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border border-[#1769E8]/30">
                    Day Trading
                  </span>
                </div>
                <div
                  className={`mt-1 text-3xl sm:text-4xl font-bold font-mono-numbers tabular-nums tracking-tight ${
                    isNetProfitPositive
                      ? 'text-[#059669] dark:text-[#34D399]'
                      : isNetProfitNegative
                      ? 'text-[#E11D48] dark:text-[#FB7185]'
                      : 'text-[#151D2A] dark:text-[#F2F5F9]'
                  }`}
                >
                  {isNetProfitPositive ? '+' : ''}
                  {formatCurrency(metrics.totalNetProfit, settings, isPrivacyMode)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                <span className="inline-flex items-center gap-1 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.totalGainPercent >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-[#059669] dark:text-[#34D399]" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-[#E11D48] dark:text-[#FB7185]" />
                  )}
                  {formatGrowthPercent(metrics.totalGainPercent, metrics.hasValidGrowthPercent, 2)}
                </span>
                <span>•</span>
                <span>Modal Awal: {formatCurrency(periodStartingBalance, settings, isPrivacyMode)}</span>
              </div>
            </div>

            {/* Clean Key Pillar Strip (Without Boxed Cards / Zero Box Soup) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-[#DDE3EA] dark:border-[#252B34]">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  Win Rate
                </span>
                <span className="mt-1 block text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.winRate}%
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  {metrics.winningTrades}W / {metrics.losingTrades}L
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  Total Trades
                </span>
                <span className="mt-1 block text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.totalTrades}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  {metrics.breakevenTrades} Breakeven
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  Profit Factor
                </span>
                <span
                  className={`mt-1 block text-lg font-bold font-mono-numbers tabular-nums ${
                    metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite
                      ? 'text-[#059669] dark:text-[#34D399]'
                      : 'text-[#151D2A] dark:text-[#F2F5F9]'
                  }`}
                >
                  {formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  Rasio Gross P/L
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  Average RR
                </span>
                <span className="mt-1 block text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {formatRMultiple(metrics.averageRiskReward, metrics.hasValidRiskReward)}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  Realized Multiple
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  Expectancy
                </span>
                <span className="mt-1 block text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {formatCurrency(metrics.expectancy, settings, isPrivacyMode)}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  Nilai Harapan / Trade
                </span>
              </div>
            </div>
          </section>

          {/* Critical Drawdown Alert Banner if applicable */}
          {metrics.isAccountInCriticalDrawdown && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#11151B] border border-rose-200 dark:border-rose-900/50 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-5 w-5 stroke-[1.75] text-[#E11D48] dark:text-[#FB7185] shrink-0" />
                <div className="text-[#697586] dark:text-[#929BA9]">
                  <strong className="font-semibold text-[#E11D48] dark:text-[#FB7185]">
                    Peringatan Risiko Kritis:
                  </strong>{' '}
                  Penurunan modal telah menyentuh batas risiko akun (Drawdown ≥ 100%). Evaluasi lot dan manajemen risiko.
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 2: PERFORMANCE PROFILE — 6 PILLARS
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Performance Profile
              </h3>

              <div className="px-2.5 py-1 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-mono-numbers tabular-nums font-bold">
                <span>
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left / Top: Radar Chart */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full">
                  <RadarChart indicators={radarIndicators} size={280} />
                </div>
              </div>

              {/* Right / Bottom: Clean 6-Pillar Indicator List */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {pillarList.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {p.name}
                        </span>
                        <span className="font-mono-numbers tabular-nums font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                          {p.displayVal}
                        </span>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="h-1.5 w-full bg-[#DDE3EA] dark:bg-[#252B34] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            !p.isAvailable
                              ? 'bg-transparent'
                              : p.score >= 70
                              ? 'bg-[#059669] dark:bg-[#34D399]'
                              : p.score >= 50
                              ? 'bg-[#1769E8]'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: p.isAvailable ? `${Math.max(4, p.score)}%` : '0%' }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#697586] dark:text-[#929BA9]">
                        <span>{p.target}</span>
                        <span className="font-mono-numbers tabular-nums font-semibold">
                          {p.isAvailable ? `Skor: ${p.score}/100` : 'Data Belum Cukup'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* =========================================================================
              SECTION 3: PERFORMANCE CALENDAR
             ========================================================================= */}
          <section className="space-y-2">
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
              SECTION 4: EQUITY CURVE
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                  Kurva Ekuitas (Equity Curve)
                </h3>
                <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                  Pertumbuhan kumulatif modal dan garis High Watermark historis
                </p>
              </div>
            </div>

            <EquityChart
              equityCurve={equityCurve}
              settings={periodSettings}
              startingBalance={periodStartingBalance}
              height={320}
              isPrivacyMode={isPrivacyMode}
            />
          </section>

          {/* =========================================================================
              SECTION 5: DRAWDOWN ANALYSIS
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                  Analisis Drawdown (Risiko Modal)
                </h3>
                <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                  Evaluasi penurunan saldo dari puncak tertinggi akun
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono-numbers tabular-nums">
                <div>
                  <span className="text-[#697586] dark:text-[#929BA9]">Max DD (%): </span>
                  <span className="font-bold text-[#E11D48] dark:text-[#FB7185]">
                    {metrics.maxDrawdownPercent > 0
                      ? `-${metrics.maxDrawdownPercent.toFixed(2)}%`
                      : '0.00%'}
                  </span>
                </div>
                <span>•</span>
                <div>
                  <span className="text-[#697586] dark:text-[#929BA9]">Nominal DD: </span>
                  <span className="font-bold text-[#E11D48] dark:text-[#FB7185]">
                    {metrics.maxDrawdownAmount > 0
                      ? `-${formatCurrency(metrics.maxDrawdownAmount, settings, isPrivacyMode)}`
                      : formatCurrency(0, settings, isPrivacyMode)}
                  </span>
                </div>
              </div>
            </div>

            <DrawdownChart
              equityCurve={equityCurve}
              settings={periodSettings}
              height={200}
              isPrivacyMode={isPrivacyMode}
            />
          </section>

          {/* =========================================================================
              SECTION 6: DAILY & MONTHLY PERFORMANCE
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Performa Harian &amp; Bulanan
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Pola profitabilitas berdasarkan hari dalam seminggu dan rekapitulasi bulanan
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Day of Week Breakdown */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-[#151D2A] dark:text-[#F2F5F9] uppercase tracking-wider block">
                  Hari dalam Seminggu (Senin – Jumat)
                </span>
                <div className="space-y-2">
                  {dayOfWeekStats.map((item) => (
                    <div
                      key={item.dayName}
                      className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                          {item.dayName}
                        </span>
                        <span className="text-[11px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                          {item.total} Trade ({item.winRate}% Win)
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono-numbers tabular-nums font-bold text-xs sm:text-sm ${
                            item.netProfit > 0.01
                              ? 'text-[#059669] dark:text-[#34D399]'
                              : item.netProfit < -0.01
                              ? 'text-[#E11D48] dark:text-[#FB7185]'
                              : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {item.netProfit > 0 ? '+' : ''}
                          {formatCurrency(item.netProfit, settings, isPrivacyMode)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Performance Table */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-[#151D2A] dark:text-[#F2F5F9] uppercase tracking-wider block">
                  Rekapitulasi Bulanan
                </span>
                {monthlyPerformance.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] text-center text-xs text-[#697586] dark:text-[#929BA9]">
                    Belum ada data bulanan.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {monthlyPerformance.map((m) => (
                      <div
                        key={m.monthKey}
                        className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block font-mono-numbers tabular-nums">
                            {m.label}
                          </span>
                          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                            {m.tradesCount} Trade ({m.winRate}% Win)
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-mono-numbers tabular-nums font-bold text-xs sm:text-sm ${
                              m.netProfit > 0.01
                                ? 'text-[#059669] dark:text-[#34D399]'
                                : m.netProfit < -0.01
                                ? 'text-[#E11D48] dark:text-[#FB7185]'
                                : 'text-[#697586] dark:text-[#929BA9]'
                            }`}
                          >
                            {m.netProfit > 0 ? '+' : ''}
                            {formatCurrency(m.netProfit, settings, isPrivacyMode)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* =========================================================================
              SECTION 7: SESSION ANALYSIS (ASIA, LONDON, NEW YORK)
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Analisis Sesi Trading (Session Performance)
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Perbandingan hasil eksekusi antara sesi Asia, London, dan New York
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {sessionStats.map((sess) => (
                <div
                  key={sess.id}
                  className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-[#151D2A] dark:text-[#F2F5F9] block">
                        {sess.label}
                      </span>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                        {sess.desc}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono-numbers tabular-nums font-semibold bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
                      {sess.total} Trade
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-[#697586] dark:text-[#929BA9]">
                      Net Profit / Loss
                    </span>
                    <div
                      className={`text-base sm:text-lg font-bold font-mono-numbers tabular-nums ${
                        sess.netProfit > 0.01
                          ? 'text-[#059669] dark:text-[#34D399]'
                          : sess.netProfit < -0.01
                          ? 'text-[#E11D48] dark:text-[#FB7185]'
                          : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {sess.netProfit > 0 ? '+' : ''}
                      {formatCurrency(sess.netProfit, settings, isPrivacyMode)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] text-xs font-mono-numbers tabular-nums">
                    <div>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Win Rate</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">{sess.winRate}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Profit Factor</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                        {sess.profitFactor === Infinity ? '∞' : sess.profitFactor.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* =========================================================================
              SECTION 8: SYMBOL PERFORMANCE
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-4">
            <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Performa Simbol / Instrumen (Symbol Breakdown)
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Statistik hasil trading berdasarkan instrumen yang digunakan
              </p>
            </div>

            <div className="space-y-2">
              {symbolStats.map((item) => (
                <div
                  key={item.symbol}
                  className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-lg font-bold bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-mono-numbers">
                      {item.symbol}
                    </span>
                    <span className="text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                      {item.total} Trade ({item.winCount}W / {item.lossCount}L)
                    </span>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 font-mono-numbers tabular-nums">
                    <div>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Win Rate</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">{item.winRate}%</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Rata-rata</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                        {formatCurrency(item.avgProfit, settings, isPrivacyMode)}
                      </span>
                    </div>

                    <div className="text-right min-w-[90px]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Net P/L</span>
                      <span
                        className={`font-bold text-xs sm:text-sm ${
                          item.netProfit > 0.01
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : item.netProfit < -0.01
                            ? 'text-[#E11D48] dark:text-[#FB7185]'
                            : 'text-[#697586] dark:text-[#929BA9]'
                        }`}
                      >
                        {item.netProfit > 0 ? '+' : ''}
                        {formatCurrency(item.netProfit, settings, isPrivacyMode)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* =========================================================================
              SECTION 9: ADDITIONAL STATISTICS (STREAKS & DISTRIBUTION)
             ========================================================================= */}
          <section className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150 space-y-5">
            <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Statistik Tambahan (Streaks &amp; Distribusi)
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Rincian runtutan menang/kalah, distribusi hasil, dan rata-rata rasio posisi
              </p>
            </div>

            {/* Streak & Ratio Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                <div className="text-xs text-[#697586] dark:text-[#929BA9]">
                  Win Streak Tertinggi
                </div>
                <div className="text-xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.consecutiveWinsMax} <span className="text-xs font-normal text-[#697586]">Trade Beruntun</span>
                </div>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                  Streak Saat Ini: {metrics.currentStreak.count} {metrics.currentStreak.type === 'WIN' ? 'Win' : metrics.currentStreak.type === 'LOSS' ? 'Loss' : '-'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                <div className="text-xs text-[#697586] dark:text-[#929BA9]">
                  Loss Streak Tertinggi
                </div>
                <div className="text-xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.consecutiveLossesMax} <span className="text-xs font-normal text-[#697586]">Trade Beruntun</span>
                </div>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                  Batas toleransi psikologis sistem
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                <div className="text-xs text-[#697586] dark:text-[#929BA9]">
                  Rasio Rata-rata Win / Loss
                </div>
                <div className="text-xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                  {metrics.averageLoss > 0
                    ? `${(metrics.averageWin / metrics.averageLoss).toFixed(2)}x`
                    : '1.00x'}
                </div>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                  Avg Win: {formatCurrency(metrics.averageWin, settings, isPrivacyMode)} / Avg Loss: {formatCurrency(metrics.averageLoss, settings, isPrivacyMode)}
                </span>
              </div>
            </div>

            {/* Trade Distribution Bar */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-[#697586] dark:text-[#929BA9]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  Distribusi Hasil Transaksi ({metrics.totalTrades} Trade)
                </span>
                <span className="font-mono-numbers tabular-nums">
                  {metrics.winningTrades} Win • {metrics.losingTrades} Loss • {metrics.breakevenTrades} BE
                </span>
              </div>

              {/* Segmented Horizontal Bar */}
              <div className="h-3 w-full bg-[#DDE3EA] dark:bg-[#252B34] rounded-full overflow-hidden flex">
                {metrics.totalTrades > 0 && (
                  <>
                    <div
                      className="h-full bg-[#059669] dark:bg-[#34D399] transition-all"
                      style={{ width: `${(metrics.winningTrades / metrics.totalTrades) * 100}%` }}
                      title={`Winning: ${metrics.winningTrades} (${metrics.winRate}%)`}
                    />
                    <div
                      className="h-full bg-[#E11D48] dark:bg-[#FB7185] transition-all"
                      style={{ width: `${(metrics.losingTrades / metrics.totalTrades) * 100}%` }}
                      title={`Losing: ${metrics.losingTrades} (${metrics.lossRate}%)`}
                    />
                    <div
                      className="h-full bg-[#929BA9] transition-all"
                      style={{ width: `${(metrics.breakevenTrades / metrics.totalTrades) * 100}%` }}
                      title={`Breakeven: ${metrics.breakevenTrades} (${metrics.breakevenRate}%)`}
                    />
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-[11px] text-[#697586] dark:text-[#929BA9] pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#059669] dark:bg-[#34D399]" />
                  Win ({metrics.winRate}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#E11D48] dark:bg-[#FB7185]" />
                  Loss ({metrics.lossRate}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#929BA9]" />
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
