import React, { useState, useMemo } from 'react';
import { AppSettings } from '../../types/settings';
import {
  simulateTrades,
  RiskMethod,
  RiskType,
  SequenceMode,
  CONSECUTIVE_LOSS_PRESETS,
  MONTE_CARLO_ITERATION_OPTIONS,
} from '../../utils/tradeSimulation';
import { formatCurrency } from '../../utils/calculations';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface TradeSimulationTabProps {
  settings: AppSettings;
  currentEquity: number;
}

export const TradeSimulationTab: React.FC<TradeSimulationTabProps> = ({
  settings,
  currentEquity,
}) => {
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>('1000');
  const [winRateInput, setWinRateInput] = useState<string>('55');
  const [rrRatioInput, setRrRatioInput] = useState<string>('2');
  const [riskType, setRiskType] = useState<RiskType>('percent');
  const [riskValueInput, setRiskValueInput] = useState<string>('1');
  const [tradesCountInput, setTradesCountInput] = useState<string>('50');
  const [riskMethod, setRiskMethod] = useState<RiskMethod>('balance');
  const [sequenceMode, setSequenceMode] = useState<SequenceMode>('expected_spread');
  const [customLossStreakInput, setCustomLossStreakInput] = useState<string>('5');
  const [monteCarloIterations, setMonteCarloIterations] = useState<number>(1000);
  const [randomSeedInput, setRandomSeedInput] = useState<string>('1');
  const [showTradeTable, setShowTradeTable] = useState<boolean>(false);

  const startingCapital = Math.max(0, parseFloat(startingCapitalInput) || 0);

  const handleWinRateChange = (raw: string) => {
    if (raw === '') {
      setWinRateInput('');
      return;
    }
    const cleaned = raw.replace(/^0+(?=\d)/, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      if (num < 0) setWinRateInput('0');
      else if (num > 100) setWinRateInput('100');
      else setWinRateInput(cleaned);
    } else {
      setWinRateInput(cleaned);
    }
  };

  const handleCleanNumberInput = (
    val: string,
    setter: (s: string) => void,
    allowDecimal = true
  ) => {
    if (val === '') {
      setter('');
      return;
    }
    let cleaned = val.replace(/^0+(?=\d)/, '');
    if (!allowDecimal) {
      cleaned = cleaned.replace(/[^0-9]/g, '');
    } else {
      cleaned = cleaned.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) {
        cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
      }
    }
    setter(cleaned);
  };

  const winRate = Math.min(100, Math.max(0, parseFloat(winRateInput) || 0));
  const rrRatio = Math.max(0.01, parseFloat(rrRatioInput) || 1.0);
  const riskValue = Math.max(0, parseFloat(riskValueInput) || 0);
  const tradesCount = Math.max(1, Math.min(500, parseInt(tradesCountInput, 10) || 1));
  const customLossStreak = Math.max(0, parseInt(customLossStreakInput, 10) || 0);
  const randomSeed = Math.max(1, parseInt(randomSeedInput, 10) || 1);

  const simulation = useMemo(() => {
    return simulateTrades({
      startingCapital,
      winRate,
      rrRatio,
      riskType,
      riskValue,
      tradesCount,
      riskMethod,
      sequenceMode,
      randomSeed,
      customLossStreak,
      monteCarloIterations,
    });
  }, [
    startingCapital,
    winRate,
    rrRatio,
    riskType,
    riskValue,
    tradesCount,
    riskMethod,
    sequenceMode,
    randomSeed,
    customLossStreak,
    monteCarloIterations,
  ]);

  const handleSyncLiveEquity = () => {
    const val = currentEquity > 0 ? currentEquity : settings.startingBalance;
    setStartingCapitalInput(String(Math.round(val)));
  };

  // Chart geometry
  const chartHeight = 220;
  const chartWidth = 700;
  const padding = { top: 20, right: 24, bottom: 28, left: 68 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const samplePathValues =
    sequenceMode === 'monte_carlo_random'
      ? simulation.monteCarlo.samplePaths.flatMap((sp) => sp.curve)
      : [];

  const maxEquity = Math.max(
    ...simulation.curve.map((c) => c.equity),
    ...samplePathValues,
    startingCapital,
    1
  );
  const minEquity = Math.min(
    ...simulation.curve.map((c) => c.equity),
    ...samplePathValues,
    startingCapital
  );

  const getY = (val: number) => {
    if (maxEquity === minEquity) return padding.top + innerHeight / 2;
    const norm = (val - minEquity) / (maxEquity - minEquity);
    return padding.top + innerHeight - norm * innerHeight;
  };

  const getX = (idx: number, total: number) => {
    if (total <= 1) return padding.left;
    return padding.left + (idx / (total - 1)) * innerWidth;
  };

  const points = simulation.curve.map((step, idx) => ({
    x: getX(idx, simulation.curve.length),
    y: getY(step.equity),
    equity: step.equity,
    drawdown: step.drawdownPercent,
    isWin: step.isWin,
    tradeNum: step.tradeNum,
  }));

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${
    chartHeight - padding.bottom
  } L ${points[0].x.toFixed(1)} ${chartHeight - padding.bottom} Z`;

  const isProfit = simulation.totalNetProfit >= 0;
  const isRoundingAdjusted = Math.abs(simulation.actualWinRatePercent - winRate) > 0.005;
  const primaryStrokeColor = isProfit ? '#1769E8' : '#e11d48';

  const formattedProfitFactor = !Number.isFinite(simulation.profitFactor)
    ? '∞'
    : simulation.profitFactor.toFixed(2);

  return (
    <div className="space-y-6">
      {/* Main Form Card */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Simulasi Berbasis Trade
            </h2>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Trading performance scenarios
            </p>
          </div>

          <button
            type="button"
            onClick={handleSyncLiveEquity}
            className="px-2.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors"
          >
            Use Current Balance ({formatCurrency(currentEquity > 0 ? currentEquity : settings.startingBalance, settings)})
          </button>
        </div>

        {/* Core Parameters (Section 10) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Initial Capital */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Initial Capital ({settings.currencySymbol})
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={startingCapitalInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setStartingCapitalInput)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              placeholder="1000"
            />
          </div>

          {/* Win Rate (%) */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Win Rate (%)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={winRateInput}
              onChange={(e) => handleWinRateChange(e.target.value)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              placeholder="55"
            />
          </div>

          {/* Risk per Trade */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                Risk per Trade ({riskType === 'percent' ? '%' : settings.currencySymbol})
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRiskType('percent')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    riskType === 'percent'
                      ? 'bg-[#1769E8] text-white'
                      : 'text-[#697586] dark:text-[#929BA9]'
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setRiskType('nominal')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    riskType === 'nominal'
                      ? 'bg-[#1769E8] text-white'
                      : 'text-[#697586] dark:text-[#929BA9]'
                  }`}
                >
                  {settings.currencySymbol}
                </button>
              </div>
            </div>
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={riskValueInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setRiskValueInput)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              placeholder="1"
            />
          </div>

          {/* Risk / Reward */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Risk / Reward (1 : X)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={rrRatioInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setRrRatioInput)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              placeholder="2"
            />
          </div>

          {/* Total Trades */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Total Trades
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="500"
              value={tradesCountInput}
              onChange={(e) => handleCleanNumberInput(e.target.value, setTradesCountInput, false)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              placeholder="50"
            />
          </div>
        </div>

        {/* Risk Method, Sequence Mode & Simulate Action */}
        <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Risk Method */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Risk Calculation Method
            </label>
            <select
              value={riskMethod}
              onChange={(e) => setRiskMethod(e.target.value as RiskMethod)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
            >
              <option value="balance">Percentage of Remaining Balance (Compounding)</option>
              <option value="initial_capital">Fixed Initial Capital (Flat Risk)</option>
            </select>
          </div>

          {/* Sequence Mode */}
          <div>
            <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
              Trade Sequence Distribution
            </label>
            <select
              value={sequenceMode}
              onChange={(e) => setSequenceMode(e.target.value as SequenceMode)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
            >
              <option value="expected_spread">Even Distribution</option>
              <option value="loss_streak_first">Losses at Start (Worst-Case Streak)</option>
              <option value="win_streak_first">Wins at Start</option>
              <option value="custom_loss_streak">Custom Initial Loss Streak</option>
              <option value="monte_carlo_random">Seeded Random Sequence</option>
            </select>
          </div>

          {/* Simulate Action */}
          <div>
            <button
              type="button"
              onClick={() => {
                if (sequenceMode === 'monte_carlo_random') {
                  setRandomSeedInput(String(randomSeed + 1));
                }
              }}
              className="w-full rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold py-2.5 px-4 transition-colors"
            >
              Simulate
            </button>
          </div>
        </div>

        {/* Custom Consecutive Loss Sub-Controls (only when custom_loss_streak selected) */}
        {sequenceMode === 'custom_loss_streak' && (
          <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                Initial Consecutive Losses:
              </span>
              {CONSECUTIVE_LOSS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCustomLossStreakInput(String(preset))}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono-numbers transition-colors ${
                    customLossStreak === preset
                      ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <input
                type="number"
                step="1"
                min="0"
                max="500"
                value={customLossStreakInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setCustomLossStreakInput, false)}
                className="w-20 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              />
            </div>

            <span className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9]">
              Applied Initial Loss Streak: {simulation.actualInitialLossStreak} trades
            </span>
          </div>
        )}

        {simulation.isLossStreakExceedingTotalLosses && simulation.lossStreakWarningMessage && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{simulation.lossStreakWarningMessage}</span>
          </div>
        )}

        {simulation.isRiskCappedByEquity && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Account balance reached the available equity limit on one or more trades; risk was capped at remaining balance so equity never drops below $0.00.
            </span>
          </div>
        )}
      </div>

      {/* RESULT CARD (Section 10 Specification) */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
            Result
          </h3>
          {isRoundingAdjusted && sequenceMode !== 'monte_carlo_random' && (
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              Discrete trade rounding: {winRate}% of {tradesCount} trades = {simulation.winCount}W / {simulation.lossCount}L ({simulation.actualWinRatePercent.toFixed(2)}% actual win rate)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Winning Trades */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Winning Trades
            </span>
            <div className="text-lg font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
              {simulation.winCount}
            </div>
            <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-0.5">
              {simulation.actualWinRatePercent.toFixed(1)}% of {tradesCount}
            </span>
          </div>

          {/* Losing Trades */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Losing Trades
            </span>
            <div className="text-lg font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
              {simulation.lossCount}
            </div>
            <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-0.5">
              {simulation.actualLossRatePercent.toFixed(1)}% of {tradesCount}
            </span>
          </div>

          {/* Net Profit / Loss */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Net Profit / Loss
            </span>
            <div
              className={`text-lg font-bold font-mono-numbers ${
                isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isProfit ? '+' : '-'}
              {formatCurrency(Math.abs(simulation.totalNetProfit), settings)}
            </div>
            <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-0.5">
              Expectancy: {simulation.expectancyR >= 0 ? '+' : ''}
              {simulation.expectancyR.toFixed(2)}R
            </span>
          </div>

          {/* Final Balance */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Final Balance
            </span>
            <div className="text-lg font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
              {formatCurrency(simulation.finalBalance, settings)}
            </div>
            <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-0.5">
              Initial: {formatCurrency(simulation.startingCapital, settings)}
            </span>
          </div>

          {/* Return (%) */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Return
            </span>
            <div
              className={`text-lg font-bold font-mono-numbers ${
                simulation.totalGainPercent >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {simulation.totalGainPercent > 0 ? '+' : ''}
              {simulation.totalGainPercent.toFixed(2)}%
            </div>
            <span className="text-[11px] font-mono-numbers text-rose-600 dark:text-rose-400 block mt-0.5">
              Max DD: -{simulation.maxDrawdownPercent.toFixed(2)}%
            </span>
          </div>

          {/* Profit Factor */}
          <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
              Profit Factor
            </span>
            <div className="text-lg font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
              {formattedProfitFactor}
            </div>
            <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-0.5">
              1 : {rrRatio} R/R
            </span>
          </div>
        </div>
      </div>

      {/* PERFORMANCE PROJECTION CHART */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Performance Projection
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Equity trajectory across {tradesCount} trades (Max Drawdown: -{simulation.maxDrawdownPercent.toFixed(2)}% / -{formatCurrency(simulation.maxDrawdownDollar, settings)})
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowTradeTable((prev) => !prev)}
            className="text-xs font-medium text-[#1769E8] dark:text-[#60A5FA] hover:underline self-start sm:self-auto"
          >
            {showTradeTable ? 'Hide Trade-by-Trade Table' : 'View Trade-by-Trade Table'}
          </button>
        </div>

        <div className="w-full overflow-x-auto">
          <div className="min-w-[540px] h-[220px]">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
              <defs>
                <linearGradient id="tradeSimGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryStrokeColor} stopOpacity="0.14" />
                  <stop offset="100%" stopColor={primaryStrokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const y = padding.top + pct * innerHeight;
                const val = maxEquity - pct * (maxEquity - minEquity);
                return (
                  <g key={pct}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      className="stroke-[#DDE3EA] dark:stroke-[#252B34]"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      fill="#697586"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="Arial, Helvetica, sans-serif"
                    >
                      {formatCurrency(val, settings)}
                    </text>
                  </g>
                );
              })}

              {/* Baseline Starting Capital */}
              <line
                x1={padding.left}
                y1={getY(startingCapital)}
                x2={chartWidth - padding.right}
                y2={getY(startingCapital)}
                stroke="#697586"
                strokeOpacity="0.45"
                strokeDasharray="3 3"
              />

              {/* Sample Monte Carlo Paths when in random mode */}
              {sequenceMode === 'monte_carlo_random' &&
                simulation.monteCarlo.samplePaths.map((sp) => {
                  const spPath = sp.curve
                    .map((eqVal, idx) => {
                      const x = getX(idx, sp.curve.length);
                      const y = getY(eqVal);
                      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <path
                      key={sp.runIndex}
                      d={spPath}
                      fill="none"
                      stroke="#697586"
                      strokeWidth="1"
                      strokeOpacity="0.3"
                    />
                  );
                })}

              <path d={areaPath} fill="url(#tradeSimGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke={primaryStrokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <text
                x={padding.left}
                y={chartHeight - 6}
                fill="#697586"
                fontSize="10"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                Trade 0
              </text>
              <text
                x={chartWidth - padding.right}
                y={chartHeight - 6}
                fill="#697586"
                fontSize="10"
                textAnchor="end"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                Trade {tradesCount}
              </text>
            </svg>
          </div>
        </div>

        {/* Monte Carlo Probability Summary */}
        <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Monte Carlo Distribution ({simulation.monteCarlo.iterationsRun.toLocaleString('en-US')} Runs · Seed #{simulation.monteCarlo.seedUsed})
            </span>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {MONTE_CARLO_ITERATION_OPTIONS.map((iter) => (
                  <button
                    key={iter}
                    type="button"
                    onClick={() => setMonteCarloIterations(iter)}
                    className={`px-2 py-1 rounded text-[11px] font-mono-numbers transition-colors ${
                      monteCarloIterations === iter
                        ? 'bg-[#1769E8] text-white font-semibold'
                        : 'bg-[#F5F7FA] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9]'
                    }`}
                  >
                    {iter.toLocaleString('en-US')}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setRandomSeedInput(String(randomSeed + 1))}
                className="px-2.5 py-1 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Seed #{randomSeed}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Worst Case (P5)
              </span>
              <span className="text-sm font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
                {formatCurrency(simulation.monteCarlo.p5WorstCase, settings)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Median (P50)
              </span>
              <span className="text-sm font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(simulation.monteCarlo.medianFinalBalance, settings)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Best Case (P95)
              </span>
              <span className="text-sm font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                {formatCurrency(simulation.monteCarlo.p95BestCase, settings)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Profit Probability
              </span>
              <span className="text-sm font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                {simulation.monteCarlo.probabilityOfProfit.toFixed(1)}%
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] col-span-2 sm:col-span-1">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Avg Max Drawdown
              </span>
              <span className="text-sm font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
                -{simulation.monteCarlo.averageMaxDrawdown.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Trade-by-Trade Table */}
        {showTradeTable && (
          <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
              <thead className="border-b border-[#DDE3EA] dark:border-[#252B34] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                <tr>
                  <th className="py-2 px-3">Trade</th>
                  <th className="py-2 px-3">Result</th>
                  <th className="py-2 px-3 font-mono-numbers">Risk Amount</th>
                  <th className="py-2 px-3 font-mono-numbers">P/L</th>
                  <th className="py-2 px-3 font-mono-numbers">Balance</th>
                  <th className="py-2 px-3 font-mono-numbers">Drawdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers">
                {simulation.curve.slice(1).map((step) => (
                  <tr key={step.tradeNum}>
                    <td className="py-2 px-3 text-[#697586] dark:text-[#929BA9]">#{step.tradeNum}</td>
                    <td
                      className={`py-2 px-3 font-sans font-semibold ${
                        step.isWin
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {step.isWin ? 'WIN' : 'LOSS'}
                    </td>
                    <td className="py-2 px-3">{formatCurrency(step.riskAmount, settings)}</td>
                    <td
                      className={`py-2 px-3 ${
                        step.pnl >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {step.pnl >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(step.pnl), settings)}
                    </td>
                    <td className="py-2 px-3 font-semibold">
                      {formatCurrency(step.equity, settings)}
                    </td>
                    <td className="py-2 px-3 text-rose-600 dark:text-rose-400">
                      -{step.drawdownPercent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
