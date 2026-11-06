import React, { useState, useMemo } from 'react';
import { AppSettings, CurrencyCode } from '../../types/settings';
import {
  calculateCompoundingGrowth,
  CompoundingInterval,
  DepositTiming,
  MIN_GROWTH_RATE_PERCENT,
  MAX_GROWTH_RATE_PERCENT,
} from '../../utils/compoundingCalculator';
import { formatCurrency } from '../../utils/calculations';
import { AlertTriangle } from 'lucide-react';

interface CompoundingCalculatorTabProps {
  settings: AppSettings;
  currentEquity: number;
}

const DURATION_PRESETS = [
  { label: '3 Months', interval: 'monthly' as CompoundingInterval, duration: '3' },
  { label: '6 Months', interval: 'monthly' as CompoundingInterval, duration: '6' },
  { label: '12 Months', interval: 'monthly' as CompoundingInterval, duration: '12' },
  { label: '24 Months', interval: 'monthly' as CompoundingInterval, duration: '24' },
  { label: '30 Days', interval: 'daily' as CompoundingInterval, duration: '30' },
];

export const CompoundingCalculatorTab: React.FC<CompoundingCalculatorTabProps> = ({
  settings,
  currentEquity,
}) => {
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>('1000');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency || 'USD');
  const [interval, setInterval] = useState<CompoundingInterval>('monthly');
  const [growthRateInput, setGrowthRateInput] = useState<string>('5');
  const [durationInput, setDurationInput] = useState<string>('12');
  const [depositInput, setDepositInput] = useState<string>('0');
  const [depositTiming, setDepositTiming] = useState<DepositTiming>('end_of_period');
  const [showAdvancedDeposit, setShowAdvancedDeposit] = useState<boolean>(false);
  const [tablePage, setTablePage] = useState<number>(1);
  const rowsPerPage = 12;

  const startingCapital = Math.max(0, parseFloat(startingCapitalInput) || 0);
  const rawParsedGrowthRate =
    growthRateInput === '' || growthRateInput === '-' || growthRateInput === '-.'
      ? 0
      : parseFloat(growthRateInput);
  const growthRate = Number.isFinite(rawParsedGrowthRate) ? rawParsedGrowthRate : 0;
  const isGrowthRateOutOfBounds =
    Number.isFinite(rawParsedGrowthRate) &&
    (rawParsedGrowthRate < MIN_GROWTH_RATE_PERCENT || rawParsedGrowthRate > MAX_GROWTH_RATE_PERCENT);

  const duration = Math.max(1, Math.min(365, parseInt(durationInput, 10) || 1));
  const regularDeposit = Math.max(0, parseFloat(depositInput) || 0);

  const activeSettings: AppSettings = useMemo(() => {
    let symbol = '$';
    if (currency === 'IDR') symbol = 'Rp';
    if (currency === 'EUR') symbol = '€';
    return {
      ...settings,
      currency,
      currencySymbol: symbol,
    };
  }, [settings, currency]);

  // Compute BOTH Compounding and Fixed Profit / Withdrawal simultaneously for side-by-side comparison
  const compoundingResult = useMemo(() => {
    return calculateCompoundingGrowth({
      startingCapital,
      growthRatePercent: growthRate,
      interval,
      duration,
      regularDeposit,
      depositTiming,
      mode: 'compounding',
    });
  }, [startingCapital, growthRate, interval, duration, regularDeposit, depositTiming]);

  const withdrawnResult = useMemo(() => {
    return calculateCompoundingGrowth({
      startingCapital,
      growthRatePercent: growthRate,
      interval,
      duration,
      regularDeposit,
      depositTiming,
      mode: 'fixed_withdrawn',
    });
  }, [startingCapital, growthRate, interval, duration, regularDeposit, depositTiming]);

  const intervalUnitLabel =
    interval === 'daily' ? 'Day' : interval === 'weekly' ? 'Week' : 'Month';
  const intervalReturnLabel =
    interval === 'daily'
      ? 'Daily Return (%)'
      : interval === 'weekly'
      ? 'Weekly Return (%)'
      : 'Monthly Return (%)';

  const handleCleanNumberInput = (
    val: string,
    setter: (s: string) => void,
    allowDecimal = true,
    allowNegative = false
  ) => {
    if (val === '') {
      setter('');
      return;
    }
    if (allowNegative && (val === '-' || val === '-0' || val === '-.')) {
      setter(val);
      return;
    }
    const isNeg = allowNegative && val.startsWith('-');
    const unsigned = isNeg ? val.slice(1) : val;
    let cleaned = unsigned.replace(/^0+(?=\d)/, '');
    if (!allowDecimal) {
      cleaned = cleaned.replace(/[^0-9]/g, '');
    } else {
      cleaned = cleaned.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) {
        cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
      }
    }
    setter(isNeg ? `-${cleaned}` : cleaned);
  };

  const formatSignedCurrency = (amount: number) => {
    if (amount > 0) return `+${formatCurrency(amount, activeSettings)}`;
    if (amount < 0) return `-${formatCurrency(Math.abs(amount), activeSettings)}`;
    return formatCurrency(0, activeSettings);
  };

  const formatSignedPercent = (pct: number) => {
    if (pct > 0) return `+${pct.toFixed(2)}%`;
    return `${pct.toFixed(2)}%`;
  };

  // Pagination for unified table
  const totalPages = Math.max(1, Math.ceil(compoundingResult.steps.length / rowsPerPage));
  const startIdx = (tablePage - 1) * rowsPerPage;
  const paginatedCompSteps = compoundingResult.steps.slice(startIdx, startIdx + rowsPerPage);

  // Chart geometry
  const chartHeight = 220;
  const chartWidth = 700;
  const padding = { top: 20, right: 24, bottom: 28, left: 68 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const allPlottedValues = [
    startingCapital,
    ...compoundingResult.steps.map((s) => s.endBalance),
    ...withdrawnResult.steps.map((s) => s.endBalance),
    ...withdrawnResult.steps.map((s) => s.combinedWealth),
  ];

  const maxBalance = Math.max(...allPlottedValues, 1);
  const minBalance = Math.min(...allPlottedValues);

  const getY = (val: number) => {
    if (maxBalance === minBalance) return padding.top + innerHeight / 2;
    const norm = (val - minBalance) / (maxBalance - minBalance);
    return padding.top + innerHeight - norm * innerHeight;
  };

  const getX = (idx: number, total: number) => {
    if (total <= 1) return padding.left;
    return padding.left + (idx / (total - 1)) * innerWidth;
  };

  const totalPoints = compoundingResult.steps.length + 1;
  const points = [
    {
      x: getX(0, totalPoints),
      compY: getY(startingCapital),
      fixedWealthY: getY(startingCapital),
      fixedBalY: getY(startingCapital),
      period: 0,
    },
    ...compoundingResult.steps.map((s, idx) => {
      const wStep = withdrawnResult.steps[idx];
      return {
        x: getX(idx + 1, totalPoints),
        compY: getY(s.endBalance),
        fixedWealthY: getY(wStep ? wStep.combinedWealth : startingCapital),
        fixedBalY: getY(wStep ? wStep.endBalance : startingCapital),
        period: s.period,
      };
    }),
  ];

  const compLinePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.compY.toFixed(1)}`)
    .join(' ');
  const compAreaPath = `${compLinePath} L ${points[points.length - 1].x.toFixed(1)} ${
    chartHeight - padding.bottom
  } L ${points[0].x.toFixed(1)} ${chartHeight - padding.bottom} Z`;

  const fixedWealthLinePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.fixedWealthY.toFixed(1)}`)
    .join(' ');

  const isNegativeGrowth = compoundingResult.clampedGrowthRatePercent < 0;
  const primaryStrokeColor = isNegativeGrowth ? '#E05260' : '#3B82F6';

  return (
    <div className="space-y-6 pt-2">
      {/* Header & Input Section */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-[#DDE3EA] dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Simulator Compounding
            </h2>
            <p className="text-xs text-[#697586] dark:text-[#8E98A8] mt-0.5">
              Capital growth projection
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const liveBal = currentEquity > 0 ? currentEquity : settings.startingBalance;
                setStartingCapitalInput(String(Math.round(liveBal)));
                setTablePage(1);
              }}
              className="px-3.5 py-1.5 rounded-full border border-[#DDE3EA] dark:border-white/[0.08] bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] transition-colors"
            >
              Use Current Balance (
              {formatCurrency(
                currentEquity > 0 ? currentEquity : settings.startingBalance,
                settings
              )}
              )
            </button>
          </div>
        </div>

        {/* Main Input Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Initial Capital */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#8E98A8]">
                Initial Capital ({activeSettings.currencySymbol})
              </label>
              <div className="flex items-center gap-1">
                {(['USD', 'IDR', 'EUR'] as CurrencyCode[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                      currency === c
                        ? 'bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30'
                        : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              value={startingCapitalInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setStartingCapitalInput)}
              className="w-full rounded-xl bg-[#F5F7FA] dark:bg-white/[0.03] border border-[#DDE3EA] dark:border-white/[0.08] px-3.5 py-2.5 text-sm font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#3B82F6] focus:outline-none transition-colors"
              placeholder="1000"
            />
          </div>

          {/* Return (%) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#8E98A8]">
                {intervalReturnLabel}
              </label>
              <select
                value={interval}
                onChange={(e) => {
                  setInterval(e.target.value as CompoundingInterval);
                  setTablePage(1);
                }}
                className="bg-transparent text-[11px] font-semibold text-[#3B82F6] focus:outline-none cursor-pointer"
              >
                <option value="monthly" className="bg-white dark:bg-[#0D1015] text-[#151D2A] dark:text-[#F2F5F9]">
                  Monthly
                </option>
                <option value="weekly" className="bg-white dark:bg-[#0D1015] text-[#151D2A] dark:text-[#F2F5F9]">
                  Weekly
                </option>
                <option value="daily" className="bg-white dark:bg-[#0D1015] text-[#151D2A] dark:text-[#F2F5F9]">
                  Daily
                </option>
              </select>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={growthRateInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setGrowthRateInput, true, true)}
              className="w-full rounded-xl bg-[#F5F7FA] dark:bg-white/[0.03] border border-[#DDE3EA] dark:border-white/[0.08] px-3.5 py-2.5 text-sm font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#3B82F6] focus:outline-none transition-colors"
              placeholder="5"
            />
          </div>

          {/* Duration Preset + Custom Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#8E98A8]">
                Duration ({intervalUnitLabel}s)
              </label>
              <div className="flex items-center gap-1">
                {DURATION_PRESETS.slice(0, 4).map((p) => {
                  const isActive = interval === p.interval && durationInput === p.duration;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setInterval(p.interval);
                        setDurationInput(p.duration);
                        setTablePage(1);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono-numbers tabular-nums transition-colors ${
                        isActive
                          ? 'bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30 font-semibold'
                          : 'text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      {p.duration}M
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              type="number"
              step="1"
              min="1"
              max="365"
              value={durationInput}
              onChange={(e) => {
                handleCleanNumberInput(e.target.value, setDurationInput, false);
                setTablePage(1);
              }}
              className="w-full rounded-xl bg-[#F5F7FA] dark:bg-white/[0.03] border border-[#DDE3EA] dark:border-white/[0.08] px-3.5 py-2.5 text-sm font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#3B82F6] focus:outline-none transition-colors"
              placeholder="12"
            />
          </div>

          {/* Action Button & Optional Deposit Toggle */}
          <div className="flex flex-col justify-end gap-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAdvancedDeposit((prev) => !prev)}
                className="text-[11px] font-medium text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors"
              >
                {showAdvancedDeposit || regularDeposit > 0
                  ? 'Hide Regular Deposit'
                  : '+ Add Regular Deposit'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTablePage(1)}
              className="w-full rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-semibold py-2.5 px-4 transition-colors"
            >
              Calculate
            </button>
          </div>
        </div>

        {/* Optional Regular Deposit Section */}
        {(showAdvancedDeposit || regularDeposit > 0) && (
          <div className="pt-4 border-t border-[#DDE3EA] dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#8E98A8] mb-1.5">
                Regular Deposit per {intervalUnitLabel} ({activeSettings.currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={depositInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setDepositInput)}
                className="w-full rounded-xl bg-[#F5F7FA] dark:bg-white/[0.03] border border-[#DDE3EA] dark:border-white/[0.08] px-3.5 py-2.5 text-sm font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#3B82F6] focus:outline-none transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#8E98A8] mb-1.5">
                Deposit Timing (Compounding Mode)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDepositTiming('end_of_period')}
                  className={`py-2.5 px-3 rounded-full border text-xs font-semibold transition-colors ${
                    depositTiming === 'end_of_period'
                      ? 'bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/40'
                      : 'bg-transparent text-[#697586] dark:text-[#8E98A8] border-[#DDE3EA] dark:border-white/[0.08]'
                  }`}
                >
                  End of Period
                </button>
                <button
                  type="button"
                  onClick={() => setDepositTiming('start_of_period')}
                  className={`py-2.5 px-3 rounded-full border text-xs font-semibold transition-colors ${
                    depositTiming === 'start_of_period'
                      ? 'bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/40'
                      : 'bg-transparent text-[#697586] dark:text-[#8E98A8] border-[#DDE3EA] dark:border-white/[0.08]'
                  }`}
                >
                  Start of Period
                </button>
              </div>
            </div>
          </div>
        )}

        {isGrowthRateOutOfBounds && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Return rate is clamped to the valid mathematical range ({MIN_GROWTH_RATE_PERCENT}% to +{MAX_GROWTH_RATE_PERCENT}%). Effective rate used: {compoundingResult.clampedGrowthRatePercent}%.
            </span>
          </div>
        )}
      </div>

      {/* Side-by-Side Comparison: COMPOUNDING vs FIXED PROFIT / WITHDRAWAL */}
      <div className="pt-5 border-t border-[#DDE3EA] dark:border-white/[0.06] grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1: COMPOUNDING */}
        <div className="space-y-3.5 md:pr-6 md:border-r md:border-[#DDE3EA] md:dark:border-white/[0.06]">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Compounding
            </span>
            <span className="text-[11px] text-[#697586] dark:text-[#8E98A8]">
              Reinvested each {intervalUnitLabel.toLowerCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-[#697586] dark:text-[#8E98A8] block mb-1">
                Ending Balance
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(compoundingResult.endingBalance, activeSettings)}
              </div>
            </div>

            <div>
              <span className="text-xs text-[#697586] dark:text-[#8E98A8] block mb-1">
                Total Profit
              </span>
              <div
                className={`text-xl sm:text-2xl font-bold font-mono-numbers tabular-nums ${
                  compoundingResult.pureGrowthProfit >= 0
                    ? 'text-[#00A878]'
                    : 'text-[#E05260]'
                }`}
              >
                {formatSignedCurrency(compoundingResult.pureGrowthProfit)}
              </div>
              <span className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#8E98A8] block mt-0.5">
                {formatSignedPercent(compoundingResult.profitToTotalContributedPercent)} of capital
              </span>
            </div>
          </div>

          {regularDeposit > 0 && (
            <div className="pt-2.5 border-t border-[#DDE3EA] dark:border-white/[0.06] flex items-center justify-between text-xs text-[#697586] dark:text-[#8E98A8]">
              <span>Total Contributed Capital</span>
              <span className="font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(compoundingResult.totalContributedCapital, activeSettings)}
              </span>
            </div>
          )}
        </div>

        {/* Column 2: FIXED PROFIT / WITHDRAWAL */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#DDE3EA] dark:border-white/[0.06]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Fixed Profit / Withdrawal
            </span>
            <span className="text-[11px] text-[#697586] dark:text-[#8E98A8]">
              Profit withdrawn each {intervalUnitLabel.toLowerCase()}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-xs text-[#697586] dark:text-[#8E98A8] block mb-1">
                Account Balance
              </span>
              <div className="text-base sm:text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(withdrawnResult.endingBalance, activeSettings)}
              </div>
            </div>

            <div>
              <span className="text-xs text-[#697586] dark:text-[#8E98A8] block mb-1">
                Total Withdrawn
              </span>
              <div
                className={`text-base sm:text-lg font-bold font-mono-numbers tabular-nums ${
                  withdrawnResult.totalWithdrawnProfit >= 0
                    ? 'text-[#00A878]'
                    : 'text-[#E05260]'
                }`}
              >
                {formatSignedCurrency(withdrawnResult.totalWithdrawnProfit)}
              </div>
            </div>

            <div>
              <span className="text-xs text-[#697586] dark:text-[#8E98A8] block mb-1">
                Total Wealth
              </span>
              <div className="text-base sm:text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(withdrawnResult.combinedTotalWealth, activeSettings)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GROWTH PROJECTION CHART */}
      <div className="pt-5 border-t border-[#DDE3EA] dark:border-white/[0.06] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
            Growth Projection
          </h3>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[#151D2A] dark:text-[#F2F5F9]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: primaryStrokeColor }}
              />
              <span>Compounding ({formatCurrency(compoundingResult.endingBalance, activeSettings)})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#697586] dark:text-[#8E98A8]">
              <span className="h-2 w-2 rounded-full bg-[#00A878]" />
              <span>Fixed Total Wealth ({formatCurrency(withdrawnResult.combinedTotalWealth, activeSettings)})</span>
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <div className="min-w-[540px] h-[220px]">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
              <defs>
                <linearGradient id="compGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryStrokeColor} stopOpacity="0.14" />
                  <stop offset="100%" stopColor={primaryStrokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const y = padding.top + pct * innerHeight;
                const val = maxBalance - pct * (maxBalance - minBalance);
                return (
                  <g key={pct}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      className="stroke-[#DDE3EA] dark:stroke-white/[0.06]"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      fill="#8E98A8"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="Arial, Helvetica, sans-serif"
                    >
                      {formatCurrency(val, activeSettings)}
                    </text>
                  </g>
                );
              })}

              <path d={compAreaPath} fill="url(#compGrowthGrad)" />

              {/* Fixed Profit Total Wealth Line (Dashed) */}
              <path
                d={fixedWealthLinePath}
                fill="none"
                stroke="#00A878"
                strokeWidth="1.75"
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Compounding Line */}
              <path
                d={compLinePath}
                fill="none"
                stroke={primaryStrokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* X Axis Labels */}
              <text
                x={padding.left}
                y={chartHeight - 6}
                fill="#8E98A8"
                fontSize="10"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                Start
              </text>
              <text
                x={chartWidth - padding.right}
                y={chartHeight - 6}
                fill="#8E98A8"
                fontSize="10"
                textAnchor="end"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {intervalUnitLabel} {duration}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* MONTHLY / PERIOD PROJECTION TABLE */}
      <div className="pt-5 border-t border-[#DDE3EA] dark:border-white/[0.06] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
            {interval === 'monthly' ? 'Monthly Projection' : `${intervalUnitLabel}ly Projection`}
          </h3>
          <span className="text-xs font-mono-numbers tabular-nums text-[#697586] dark:text-[#8E98A8]">
            Page {tablePage} of {totalPages} ({compoundingResult.steps.length} {intervalUnitLabel}s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
            <thead className="border-b border-[#DDE3EA] dark:border-white/[0.06] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#8E98A8]">
              <tr>
                <th className="py-2.5 px-3">{intervalUnitLabel}</th>
                <th className="py-2.5 px-3 font-mono-numbers">Compounding</th>
                <th className="py-2.5 px-3 font-mono-numbers">Period Profit</th>
                <th className="py-2.5 px-3 font-mono-numbers">Fixed Balance</th>
                <th className="py-2.5 px-3 font-mono-numbers">Withdrawn</th>
                <th className="py-2.5 px-3 font-mono-numbers">Total Wealth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EA] dark:divide-white/[0.05] font-mono-numbers tabular-nums">
              {paginatedCompSteps.map((cStep, idx) => {
                const globalIdx = startIdx + idx;
                const wStep = withdrawnResult.steps[globalIdx];
                return (
                  <tr
                    key={cStep.period}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-sans font-medium text-[#697586] dark:text-[#8E98A8]">
                      {cStep.period}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                      {formatCurrency(cStep.endBalance, activeSettings)}
                    </td>
                    <td
                      className={`py-2.5 px-3 ${
                        cStep.growthProfit >= 0 ? 'text-[#00A878]' : 'text-[#E05260]'
                      }`}
                    >
                      {formatSignedCurrency(cStep.growthProfit)}
                    </td>
                    <td className="py-2.5 px-3 text-[#697586] dark:text-[#8E98A8]">
                      {formatCurrency(wStep ? wStep.endBalance : startingCapital, activeSettings)}
                    </td>
                    <td
                      className={`py-2.5 px-3 ${
                        (wStep?.cumulativeWithdrawnProfit ?? 0) >= 0
                          ? 'text-[#00A878]'
                          : 'text-[#E05260]'
                      }`}
                    >
                      {formatCurrency(wStep ? wStep.cumulativeWithdrawnProfit : 0, activeSettings)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                      {formatCurrency(wStep ? wStep.combinedWealth : startingCapital, activeSettings)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-[#DDE3EA] dark:border-white/[0.06] text-xs">
            <button
              type="button"
              onClick={() => setTablePage((p) => Math.max(1, p - 1))}
              disabled={tablePage <= 1}
              className="px-3.5 py-1.5 rounded-full border border-[#DDE3EA] dark:border-white/[0.08] bg-transparent text-[#151D2A] dark:text-[#F2F5F9] disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="font-mono-numbers tabular-nums text-[#697586] dark:text-[#8E98A8]">
              {tablePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
              disabled={tablePage >= totalPages}
              className="px-3.5 py-1.5 rounded-full border border-[#DDE3EA] dark:border-white/[0.08] bg-transparent text-[#151D2A] dark:text-[#F2F5F9] disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        <p className="text-[11px] text-[#697586] dark:text-[#8E98A8] pt-2 border-t border-[#DDE3EA] dark:border-white/[0.06]">
          Note: Mathematical compounding projection assumes a constant return rate per period and does not guarantee future market performance. In Fixed Profit / Withdrawal mode, period profit is separated from the trading account balance.
        </p>
      </div>
    </div>
  );
};
