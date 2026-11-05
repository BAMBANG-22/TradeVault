import React, { useMemo } from 'react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import {
  calculatePerformance,
  formatCurrency,
  extractTradeLocalDateKey,
  formatLocalDateKey,
  computeTradeNetProfit,
  resolveTradeOutcome,
} from '../../utils/calculations';
import { ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react';

interface RiskSnapshotProps {
  trades: Trade[];
  settings: AppSettings;
  currentEquity: number;
  onNavigate: (tab: string) => void;
  isPrivacyMode?: boolean;
}

export const RiskSnapshot: React.FC<RiskSnapshotProps> = ({
  trades,
  settings,
  currentEquity,
  onNavigate,
  isPrivacyMode = false,
}) => {
  // Filter closed trades
  const closedTrades = useMemo(() => {
    return trades.filter((t) => {
      const outcome = resolveTradeOutcome(t);
      return outcome === 'WIN' || outcome === 'LOSS' || outcome === 'BREAKEVEN';
    });
  }, [trades]);

  const { metrics, equityCurve } = useMemo(() => {
    return calculatePerformance(closedTrades, settings);
  }, [closedTrades, settings]);

  // 1. Current Drawdown Calculation
  // Peak equity is the highest equity point reached so far
  const peakEquity = useMemo(() => {
    const startBal = settings.startingBalance > 0 ? settings.startingBalance : 10000;
    if (equityCurve.length === 0) return startBal;
    return Math.max(startBal, ...equityCurve.map((p) => p.equity));
  }, [equityCurve, settings.startingBalance]);

  const effectiveEquity = currentEquity > 0 ? currentEquity : settings.startingBalance;

  const currentDrawdownAmount = useMemo(() => {
    if (effectiveEquity >= peakEquity) return 0;
    return Number((peakEquity - effectiveEquity).toFixed(2));
  }, [effectiveEquity, peakEquity]);

  const currentDrawdownPercent = useMemo(() => {
    if (peakEquity <= 0 || currentDrawdownAmount <= 0) return 0;
    return Number(((currentDrawdownAmount / peakEquity) * 100).toFixed(2));
  }, [currentDrawdownAmount, peakEquity]);

  const maxDrawdownLimit = settings.maxDrawdownLimitPercent || 10.0;
  const drawdownProgress = Math.min(100, Math.max(0, (currentDrawdownPercent / maxDrawdownLimit) * 100));

  // 2. Daily Loss Usage Calculation
  // Calculate today's loss from today's closed trades using local calendar date key
  const todayKey = formatLocalDateKey(new Date());

  const dailyLossToday = useMemo(() => {
    const todayTrades = closedTrades.filter(
      (t) => extractTradeLocalDateKey(t.dateTime) === todayKey
    );
    const todayNet = todayTrades.reduce((sum, t) => sum + computeTradeNetProfit(t), 0);
    return todayNet < 0 ? Math.abs(todayNet) : 0;
  }, [closedTrades, todayKey]);

  // Check if daily loss limit is configured in user settings
  const dailyLossConfig = useMemo(() => {
    if (settings.maxDailyLossAmount && settings.maxDailyLossAmount > 0) {
      return {
        isConfigured: true,
        limitAmount: settings.maxDailyLossAmount,
        label: formatCurrency(settings.maxDailyLossAmount, settings),
      };
    }
    if (settings.maxDailyLossPercent && settings.maxDailyLossPercent > 0) {
      const amt = (settings.startingBalance * settings.maxDailyLossPercent) / 100;
      return {
        isConfigured: true,
        limitAmount: amt,
        label: `${settings.maxDailyLossPercent}% (${formatCurrency(amt, settings)})`,
      };
    }
    return {
      isConfigured: false,
      limitAmount: null,
      label: null,
    };
  }, [settings]);

  const dailyLossUsagePercent = useMemo(() => {
    if (!dailyLossConfig.isConfigured || !dailyLossConfig.limitAmount) return null;
    return Number(((dailyLossToday / dailyLossConfig.limitAmount) * 100).toFixed(1));
  }, [dailyLossConfig, dailyLossToday]);

  const dailyLossProgress = useMemo(() => {
    if (dailyLossUsagePercent === null) return 0;
    return Math.min(100, Math.max(0, dailyLossUsagePercent));
  }, [dailyLossUsagePercent]);

  return (
    <section
      aria-label="Risk Snapshot"
      className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 space-y-4 transition-colors duration-150 flex flex-col justify-between"
    >
      {/* Section Header: Text Only Title + Nav Link */}
      <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
          RISK SNAPSHOT
        </h2>

        <button
          type="button"
          onClick={() => onNavigate('risk')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1769E8] hover:text-[#1458C4] transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>Kelola Risiko</span>
          <ArrowRight className="h-3.5 w-3.5 stroke-[1.75]" />
        </button>
      </div>

      {/* Two Priority Indicators */}
      <div className="space-y-4 font-mono-numbers tabular-nums">
        {/* Indicator 1: Current Drawdown */}
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              Current Drawdown
            </span>
            <span
              className={`text-sm sm:text-base font-bold ${
                currentDrawdownPercent > maxDrawdownLimit * 0.8
                  ? 'text-[#E11D48] dark:text-[#FB7185]'
                  : currentDrawdownPercent > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-[#059669] dark:text-[#34D399]'
              }`}
            >
              {currentDrawdownPercent.toFixed(2)}%
            </span>
          </div>

          {/* Simple Progress Bar */}
          <div className="w-full h-2 rounded-full bg-[#E2E8F0] dark:bg-[#080A0E] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                drawdownProgress > 80
                  ? 'bg-rose-500'
                  : drawdownProgress > 50
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${drawdownProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-sans text-[#697586] dark:text-[#929BA9]">
            <span>Batas Maksimal: {maxDrawdownLimit}%</span>
            <span>
              {currentDrawdownAmount > 0
                ? isPrivacyMode
                  ? '••••••'
                  : `-${formatCurrency(currentDrawdownAmount, settings)}`
                : 'Aman di Puncak Ekuitas'}
            </span>
          </div>
        </div>

        {/* Indicator 2: Daily Loss Usage */}
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              Daily Loss Usage
            </span>
            <span
              className={`text-sm sm:text-base font-bold ${
                !dailyLossConfig.isConfigured
                  ? 'text-[#697586] dark:text-[#929BA9] text-xs font-semibold font-sans'
                  : dailyLossUsagePercent !== null && dailyLossUsagePercent >= 100
                  ? 'text-[#E11D48] dark:text-[#FB7185]'
                  : dailyLossUsagePercent !== null && dailyLossUsagePercent > 50
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-[#151D2A] dark:text-[#F2F5F9]'
              }`}
            >
              {dailyLossConfig.isConfigured && dailyLossUsagePercent !== null
                ? `${dailyLossUsagePercent.toFixed(1)}%`
                : 'Belum Dikonfigurasi'}
            </span>
          </div>

          {/* Progress Bar (only if configured) */}
          <div className="w-full h-2 rounded-full bg-[#E2E8F0] dark:bg-[#080A0E] overflow-hidden">
            {dailyLossConfig.isConfigured ? (
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  dailyLossProgress >= 100
                    ? 'bg-rose-500'
                    : dailyLossProgress > 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${dailyLossProgress}%` }}
              />
            ) : (
              <div className="h-full w-full bg-[#E2E8F0] dark:bg-[#080A0E] opacity-50" />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-sans text-[#697586] dark:text-[#929BA9]">
            {dailyLossConfig.isConfigured ? (
              <>
                <span>Batas: {dailyLossConfig.label}</span>
                <span>
                  Hari ini:{' '}
                  {isPrivacyMode
                    ? '••••••'
                    : formatCurrency(dailyLossToday, settings)}
                </span>
              </>
            ) : (
              <span>Atur batas risiko harian pada tab Risiko</span>
            )}
          </div>
        </div>
      </div>

      {/* Direct Quick Link at bottom */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onNavigate('risk')}
          className="w-full py-2 px-3 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#080A0E] hover:border-[#1769E8] transition-colors text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Buka Manajemen Risiko Lengkap</span>
          <ArrowRight className="h-3.5 w-3.5 stroke-[1.75]" />
        </button>
      </div>
    </section>
  );
};
