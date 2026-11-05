/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  calculatePerformance,
  computePeriodTradesAndStartingBalance,
  computeTradeNetProfit,
  resolveTradeOutcome,
  formatCurrency,
  formatGrowthPercent,
  DashboardPeriodPreset,
  DASHBOARD_PERIOD_OPTIONS,
  resolveDashboardPeriodDates,
} from '../../utils/calculations';
import {
  UsdIdrRateRecord,
  PRIVACY_MODE_STORAGE_KEY,
  getCachedUsdIdrRate,
  fetchLiveUsdIdrRate,
  computeDualCurrencyDisplay,
  calculateCapitalGrowthBreakdown,
} from '../../utils/currencyRate';
import { EquityChart } from './EquityChart';
import { DashboardCalendar } from './DashboardCalendar';
import { RiskSnapshot } from './RiskSnapshot';
import { Eye, EyeOff, ChevronDown, Check, ArrowRight, Plus } from 'lucide-react';

interface DashboardViewProps {
  trades: Trade[];
  settings: AppSettings;
  onNavigate: (tab: string) => void;
  onAddTrade: () => void;
  onViewTrade: (trade: Trade) => void;
  onClearDemoTrades?: () => void;
}

function formatRecentTradeDate(dateTimeStr: string): string {
  if (!dateTimeStr) return '-';
  try {
    const dt = new Date(dateTimeStr);
    if (!isNaN(dt.getTime())) {
      const datePart = dt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timePart = dateTimeStr.includes('T') ? dateTimeStr.split('T')[1]?.slice(0, 5) : '';
      return timePart ? `${datePart}, ${timePart}` : datePart;
    }
  } catch {
    // Fallback below
  }
  return dateTimeStr.replace('T', ' ').slice(0, 16);
}

function formatUsdNominalPnl(netProfit: number, isPrivacyMode: boolean): string {
  if (isPrivacyMode) {
    return '******';
  }
  const safe = Number.isFinite(netProfit) ? netProfit : 0;
  const rounded = Number(safe.toFixed(2));
  if (Math.abs(rounded) < 0.01) {
    return '$0.00';
  }
  const formattedAbs = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(rounded));
  return rounded > 0 ? `+${formattedAbs}` : `-${formattedAbs}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  trades,
  settings,
  onNavigate,
  onAddTrade,
  onViewTrade,
}) => {
  // Global Privacy Mode (Hide Balance) persisted in localStorage
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncPrivacyFromEvent = () => {
      try {
        setIsPrivacyMode(localStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === 'true');
      } catch {
        // Ignore storage read errors
      }
    };
    window.addEventListener('tradevault-privacy-change', syncPrivacyFromEvent);
    window.addEventListener('storage', syncPrivacyFromEvent);
    return () => {
      window.removeEventListener('tradevault-privacy-change', syncPrivacyFromEvent);
      window.removeEventListener('storage', syncPrivacyFromEvent);
    };
  }, []);

  const handleTogglePrivacy = () => {
    const next = !isPrivacyMode;
    setIsPrivacyMode(next);
    try {
      localStorage.setItem(PRIVACY_MODE_STORAGE_KEY, String(next));
      window.dispatchEvent(new Event('tradevault-privacy-change'));
    } catch {
      // Ignore storage write errors
    }
  };

  // Live USD/IDR Exchange Rate state with localStorage cache fallback
  const [rateRecord, setRateRecord] = useState<UsdIdrRateRecord | null>(() =>
    getCachedUsdIdrRate()
  );

  const refreshExchangeRate = useCallback(async (signal?: AbortSignal) => {
    try {
      const record = await fetchLiveUsdIdrRate(signal);
      if (!signal?.aborted) {
        setRateRecord(record);
      }
    } catch {
      // Keep cached rate on network failure
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshExchangeRate(controller.signal);

    const intervalId = window.setInterval(() => {
      refreshExchangeRate();
    }, 15 * 60 * 1000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshExchangeRate]);

  // Overall Account Performance (All-Time) for Total Balance calculation
  const allTimePerformance = useMemo(
    () => calculatePerformance(trades, settings),
    [trades, settings]
  );

  const capitalBreakdown = useMemo(
    () =>
      calculateCapitalGrowthBreakdown(settings, allTimePerformance.metrics.totalNetProfit),
    [settings, allTimePerformance.metrics.totalNetProfit]
  );

  // Dual Currency Presentation (Strictly USD & IDR on Dashboard)
  const dualBalance = useMemo(
    () =>
      computeDualCurrencyDisplay(
        capitalBreakdown.currentBalance,
        settings.currency,
        rateRecord,
        isPrivacyMode
      ),
    [capitalBreakdown.currentBalance, settings.currency, rateRecord, isPrivacyMode]
  );

  // Period Dropdown State ('1D' | '7D' | '1M' | '3M' | '6M' | '1Y' | 'ALL')
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriodPreset>('ALL');
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState<boolean>(false);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPeriodMenuOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) {
        setIsPeriodMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPeriodMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isPeriodMenuOpen]);

  const { startDate: periodStartDate, endDate: periodEndDate } = useMemo(
    () => resolveDashboardPeriodDates(selectedPeriod),
    [selectedPeriod]
  );

  // Base settings using pure contributed capital (so deposits/withdrawals are never treated as trading profit)
  const effectiveCapitalSettings = useMemo(
    () => ({
      ...settings,
      startingBalance:
        capitalBreakdown.netContributedCapital > 0
          ? capitalBreakdown.netContributedCapital
          : settings.startingBalance,
    }),
    [settings, capitalBreakdown.netContributedCapital]
  );

  // Period-filtered trades & starting balance using the exact same Analytics engine
  const { filteredTrades: periodTrades, periodStartingBalance } = useMemo(
    () =>
      computePeriodTradesAndStartingBalance(
        trades,
        effectiveCapitalSettings,
        periodStartDate,
        periodEndDate
      ),
    [trades, effectiveCapitalSettings, periodStartDate, periodEndDate]
  );

  const periodSettings = useMemo(
    () => ({
      ...effectiveCapitalSettings,
      startingBalance: periodStartingBalance,
    }),
    [effectiveCapitalSettings, periodStartingBalance]
  );

  const { metrics: periodMetrics, equityCurve: periodEquityCurve } = useMemo(
    () => calculatePerformance(periodTrades, periodSettings),
    [periodTrades, periodSettings]
  );

  // Recent Trades: Maximum 3 latest trades sorted chronologically descending
  const recentThreeTrades = useMemo(
    () =>
      [...trades]
        .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        .slice(0, 3),
    [trades]
  );

  const isPeriodProfitPositive = periodMetrics.totalNetProfit >= 0;
  const activePeriodLabel =
    DASHBOARD_PERIOD_OPTIONS.find((opt) => opt.id === selectedPeriod)?.label || 'Semua Waktu';

  const periodDropdownControl = (
    <div ref={periodMenuRef} className="relative">
      <button
        type="button"
        data-testid="dashboard-period-dropdown-button"
        onClick={() => setIsPeriodMenuOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isPeriodMenuOpen}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer whitespace-nowrap"
      >
        <span>{activePeriodLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 stroke-[2] text-[#697586] dark:text-[#929BA9] transition-transform duration-150 ${
            isPeriodMenuOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isPeriodMenuOpen && (
        <div
          role="listbox"
          aria-label="Pilih Periode Performa"
          data-testid="dashboard-period-dropdown-menu"
          className="absolute right-0 bottom-full mb-1.5 z-20 w-40 rounded-xl bg-white dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] py-1 shadow-lg"
        >
          {DASHBOARD_PERIOD_OPTIONS.map((opt) => {
            const isSelected = selectedPeriod === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-testid={`dashboard-period-option-${opt.id}`}
                onClick={() => {
                  setSelectedPeriod(opt.id);
                  setIsPeriodMenuOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#EEF2F6] dark:bg-[#11151B] text-[#1769E8] font-semibold'
                    : 'text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#11151B]'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 stroke-[2] text-[#1769E8]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 1. TOTAL BALANCE */}
      <section
        aria-label="Total Balance"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 transition-colors duration-150"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
              TOTAL BALANCE
            </span>

            {/* Primary Balance Value */}
            <div
              data-testid="dashboard-primary-balance"
              className="text-3xl sm:text-4xl font-bold tracking-tight font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] truncate"
            >
              {dualBalance.primaryFormatted}
            </div>

            {/* Secondary Converted Balance (Strictly USD or IDR) */}
            <div
              data-testid="dashboard-secondary-balance"
              className="text-xs sm:text-sm font-medium font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]"
            >
              {dualBalance.secondaryFormatted}
            </div>
          </div>

          {/* Direct unboxed Hide Balance icon button (no decorative container or background) */}
          <button
            type="button"
            onClick={handleTogglePrivacy}
            data-testid="dashboard-privacy-toggle"
            className="inline-flex items-center justify-center p-1 text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer shrink-0"
            title={isPrivacyMode ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Nominal Saldo'}
            aria-label={isPrivacyMode ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Nominal Saldo'}
            aria-pressed={isPrivacyMode}
          >
            {isPrivacyMode ? (
              <EyeOff className="h-5 w-5 stroke-[1.75]" />
            ) : (
              <Eye className="h-5 w-5 stroke-[1.75]" />
            )}
          </button>
        </div>
      </section>

      {/* 2. ACCOUNT PERFORMANCE (Unified Metrics + Equity Curve + Controls) */}
      <section
        aria-label="Account Performance"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 space-y-5 transition-colors duration-150"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
          ACCOUNT PERFORMANCE
        </h2>

        {/* Unified 2x2 Metrics Grid (Integrated, not 4 separate cards) */}
        <div
          data-testid="dashboard-account-metrics-grid"
          className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono-numbers tabular-nums"
        >
          {/* Top-Left: Net Profit */}
          <div>
            <span className="block text-xs font-sans text-[#697586] dark:text-[#929BA9]">
              Net Profit
            </span>
            <span
              data-testid="dashboard-account-net-profit"
              className={`block text-xl sm:text-2xl font-bold mt-0.5 ${
                isPeriodProfitPositive
                  ? 'text-[#059669] dark:text-[#34D399]'
                  : 'text-[#E11D48] dark:text-[#FB7185]'
              }`}
            >
              {isPrivacyMode
                ? '******'
                : `${isPeriodProfitPositive ? '+' : ''}${formatCurrency(
                    periodMetrics.totalNetProfit,
                    settings,
                    false
                  )}`}
            </span>
          </div>

          {/* Top-Right: Pertumbuhan */}
          <div>
            <span className="block text-xs font-sans text-[#697586] dark:text-[#929BA9]">
              Pertumbuhan
            </span>
            <span
              data-testid="dashboard-account-growth"
              className={`block text-xl sm:text-2xl font-bold mt-0.5 ${
                periodMetrics.totalGainPercent >= 0
                  ? 'text-[#059669] dark:text-[#34D399]'
                  : 'text-[#E11D48] dark:text-[#FB7185]'
              }`}
            >
              {formatGrowthPercent(
                periodMetrics.totalGainPercent,
                periodMetrics.hasValidGrowthPercent,
                2
              )}
            </span>
          </div>

          {/* Bottom-Left: Win Rate */}
          <div>
            <span className="block text-xs font-sans text-[#697586] dark:text-[#929BA9]">
              Win Rate
            </span>
            <span
              data-testid="dashboard-account-win-rate"
              className="block text-lg sm:text-xl font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5"
            >
              {periodMetrics.winRate}%
            </span>
          </div>

          {/* Bottom-Right: Total Trades */}
          <div>
            <span className="block text-xs font-sans text-[#697586] dark:text-[#929BA9]">
              Total Trades
            </span>
            <span
              data-testid="dashboard-account-total-trades"
              className="block text-lg sm:text-xl font-bold text-[#151D2A] dark:text-[#F2F5F9] mt-0.5"
            >
              {periodMetrics.totalTrades}
            </span>
          </div>
        </div>

        {/* Integrated Equity Curve Subsection */}
        <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-3">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
            EQUITY CURVE
          </span>

          <EquityChart
            equityCurve={periodEquityCurve}
            settings={periodSettings}
            startingBalance={periodStartingBalance}
            height={220}
            isPrivacyMode={isPrivacyMode}
            embedded={true}
            periodControl={periodDropdownControl}
          />
        </div>
      </section>

      {/* 3 & 4. PERFORMANCE CALENDAR & RISK SNAPSHOT (Responsive Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 xl:col-span-7">
          <DashboardCalendar
            trades={trades}
            settings={settings}
            isPrivacyMode={isPrivacyMode}
            onViewTrade={onViewTrade}
          />
        </div>
        <div className="lg:col-span-5 xl:col-span-5">
          <RiskSnapshot
            trades={trades}
            settings={settings}
            currentEquity={capitalBreakdown.currentBalance}
            onNavigate={onNavigate}
            isPrivacyMode={isPrivacyMode}
          />
        </div>
      </div>

      {/* 5. RECENT TRADES (Maximum 3 Latest Trades) */}
      <section
        aria-label="Recent Trades"
        className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 space-y-3 transition-colors duration-150"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
            RECENT TRADES
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('trades')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1769E8] hover:text-[#1458C4] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Lihat Semua</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </div>

        {recentThreeTrades.length === 0 ? (
          <div className="py-7 text-center text-xs text-[#697586] dark:text-[#929BA9]">
            Belum ada transaksi yang dicatat. Gunakan tombol &ldquo;Tambah Entry&rdquo; di bawah
            untuk mulai mencatat.
          </div>
        ) : (
          <div
            data-testid="dashboard-recent-trades-list"
            className="divide-y divide-[#DDE3EA] dark:divide-[#252B34]"
          >
            {recentThreeTrades.map((t) => {
              const netProfit = computeTradeNetProfit(t);
              const outcome = resolveTradeOutcome(t);
              const isWin = outcome === 'WIN';
              const isLoss = outcome === 'LOSS';
              const isBuy = t.position === 'BUY';

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onViewTrade(t)}
                  className="w-full py-3 px-1.5 flex items-center justify-between gap-3 hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] rounded-lg transition-colors text-left cursor-pointer font-mono-numbers tabular-nums"
                >
                  {/* Left: Symbol, BUY/SELL (soft semantic text), Lot Size, Date */}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] truncate">
                        {t.instrument}
                      </span>
                      <span
                        data-testid={`recent-trade-side-${t.id}`}
                        className={`text-xs font-bold uppercase ${
                          isBuy
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : 'text-[#E11D48] dark:text-[#FB7185]'
                        }`}
                      >
                        {t.position}
                      </span>
                      <span className="text-[#697586] dark:text-[#929BA9]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs text-[#697586] dark:text-[#929BA9]">
                        {Number(t.lotSize || 0).toFixed(2)} Lot
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-sans text-[#697586] dark:text-[#929BA9]">
                      <span className="font-mono-numbers">
                        {formatRecentTradeDate(t.dateTime)}
                      </span>
                      {outcome === 'BREAKEVEN' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>BE</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Realized Profit/Loss in USD */}
                  <div className="text-right shrink-0">
                    <span
                      data-testid={`recent-trade-pnl-${t.id}`}
                      className={`text-xs sm:text-sm font-bold ${
                        isWin
                          ? 'text-[#059669] dark:text-[#34D399]'
                          : isLoss
                          ? 'text-[#E11D48] dark:text-[#FB7185]'
                          : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {formatUsdNominalPnl(netProfit, isPrivacyMode)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. SINGLE PRIMARY "TAMBAH ENTRY" BUTTON AT BOTTOM OF DASHBOARD */}
      <div className="pt-2 pb-1">
        <button
          type="button"
          onClick={onAddTrade}
          data-testid="dashboard-add-entry-button"
          className="w-full sm:w-auto sm:min-w-[220px] mx-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.25]" />
          <span>Tambah Entry</span>
        </button>
      </div>
    </div>
  );
};
