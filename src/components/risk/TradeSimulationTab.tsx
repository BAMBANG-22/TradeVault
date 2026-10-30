import React, { useState, useMemo } from 'react';
import { AppSettings } from '../../types/settings';
import {
  simulateTrades,
  RiskMethod,
  RiskType,
  SequenceMode,
} from '../../utils/tradeSimulation';
import { formatCurrency } from '../../utils/calculations';
import {
  TrendingUp,
  TrendingDown,
  Sliders,
  RefreshCw,
  BarChart3,
  Info,
  Activity,
} from 'lucide-react';

interface TradeSimulationTabProps {
  settings: AppSettings;
  currentEquity: number;
}

export const TradeSimulationTab: React.FC<TradeSimulationTabProps> = ({
  settings,
  currentEquity,
}) => {
  // Inputs state - default capital $50
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>('50');
  const [winRateInput, setWinRateInput] = useState<string>('55');
  const [rrRatioInput, setRrRatioInput] = useState<string>('2.5');
  const [riskType, setRiskType] = useState<RiskType>('percent');
  const [riskValueInput, setRiskValueInput] = useState<string>('1.5');
  const [tradesCountInput, setTradesCountInput] = useState<string>('30');
  const [riskMethod, setRiskMethod] = useState<RiskMethod>('balance');
  const [sequenceMode, setSequenceMode] = useState<SequenceMode>('expected_spread');
  const [randomSeed, setRandomSeed] = useState<number>(1);

  // Clean and validate inputs
  const startingCapital = Math.max(0, parseFloat(startingCapitalInput) || 0);

  // Sanitized Win Rate Handler: Ensures 100% is displayed as '100' (never '0100')
  const handleWinRateChange = (raw: string) => {
    if (raw === '') {
      setWinRateInput('');
      return;
    }
    const cleaned = raw.replace(/^0+(?=\d)/, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      if (num < 0) {
        setWinRateInput('0');
      } else if (num > 100) {
        setWinRateInput('100');
      } else {
        setWinRateInput(cleaned);
      }
    } else {
      setWinRateInput(cleaned);
    }
  };

  const handleCleanNumberInput = (val: string, setter: (s: string) => void) => {
    if (val === '') {
      setter('');
      return;
    }
    const cleaned = val.replace(/^0+(?=\d)/, '');
    setter(cleaned);
  };

  const winRate = Math.min(100, Math.max(0, parseFloat(winRateInput) || 0));
  const rrRatio = Math.max(0.01, parseFloat(rrRatioInput) || 1.0);
  const riskValue = Math.max(0, parseFloat(riskValueInput) || 0);
  const tradesCount = Math.max(1, Math.min(500, parseInt(tradesCountInput, 10) || 1));

  // Run simulation reactively
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
  ]);

  // Section D 1-Click Verification Test Preset:
  const applySectionDTest = (method: RiskMethod) => {
    setStartingCapitalInput('50');
    setWinRateInput('100');
    setRrRatioInput('2.5');
    setRiskType('percent');
    setRiskValueInput('1.5');
    setTradesCountInput('30');
    setRiskMethod(method);
    setSequenceMode('expected_spread');
  };

  // Sync with live equity button
  const handleSyncLiveEquity = () => {
    const val = currentEquity > 0 ? currentEquity : settings.startingBalance;
    setStartingCapitalInput(String(Math.round(val)));
  };

  // Chart Dimensions & Calculations
  const chartHeight = 220;
  const chartWidth = 700;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const maxEquity = Math.max(
    ...simulation.curve.map((c) => c.equity),
    startingCapital,
    1
  );
  const minEquity = Math.min(
    ...simulation.curve.map((c) => c.equity),
    startingCapital,
    0
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

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${chartHeight - padding.bottom} L ${points[0].x.toFixed(1)} ${chartHeight - padding.bottom} Z`;

  // Drawdown Underwater Path
  const maxDdVal = Math.max(...simulation.curve.map((c) => c.drawdownPercent), 1);
  const getDdY = (dd: number) => {
    const norm = dd / maxDdVal;
    return padding.top + norm * innerHeight;
  };
  const ddPoints = simulation.curve.map((s, idx) => ({
    x: getX(idx, simulation.curve.length),
    y: getDdY(s.drawdownPercent),
    dd: s.drawdownPercent,
  }));
  const ddLinePath = ddPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const ddAreaPath = `${ddLinePath} L ${ddPoints[ddPoints.length - 1].x.toFixed(1)} ${padding.top} L ${ddPoints[0].x.toFixed(1)} ${padding.top} Z`;

  const isProfit = simulation.totalNetProfit >= 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Banner & Section D Test Presets */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#1769E8]/10 text-[#1769E8] dark:bg-[#1769E8]/20 dark:text-[#60A5FA] border border-[#1769E8]/30">
              Simulasi Berbasis Trade & Monte Carlo
            </span>
            <span className="text-xs text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
              Kalkulasi Ekspektasi Matematika & Risiko
            </span>
          </div>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-2xl leading-relaxed">
            Uji model risiko berbasis trade dengan probabilitas statistik, rasio Reward:Risk, dan simulasi multi-iterasi Monte Carlo untuk memetakan risiko kebangkrutan dan drawdown maksimal.
          </p>
        </div>

        {/* Section D Test Presets */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => applySectionDTest('balance')}
            className="px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors"
            title="Uji 30 Win Saldo Berjalan (Compounding): Modal $50, 100% WR, RR 2.5, 1.5% -> Hasil $150.87 (sekitar $150.04)"
          >
            Uji 30 Win Compounding ($150,87)
          </button>
          <button
            type="button"
            onClick={() => applySectionDTest('initial_capital')}
            className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-medium transition-colors"
            title="Uji 30 Win Risiko Modal Awal (Fixed): Modal $50, 100% WR, RR 2.5, 1.5% -> Hasil $106.25"
          >
            Uji 30 Win Modal Awal ($106,25)
          </button>
        </div>
      </div>

      {/* Input Parameters Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Parameters */}
        <div className="lg:col-span-2 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <Sliders className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Parameter Simulasi Trade</span>
            </h3>
            <button
              type="button"
              onClick={handleSyncLiveEquity}
              className="text-xs text-[#1769E8] dark:text-[#60A5FA] hover:underline flex items-center gap-1"
            >
              <span>Gunakan Saldo Live ({formatCurrency(currentEquity, settings)})</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Modal Awal */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Modal Awal ({settings.currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={startingCapitalInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setStartingCapitalInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="50"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Default: $50
              </span>
            </div>

            {/* Win Rate (0-100%) */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Win Rate (%) (0 - 100)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={winRateInput}
                onChange={(e) => handleWinRateChange(e.target.value)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="55"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                {winRate === 100 ? '100% (Semua Win)' : `${winRate}% Menang`}
              </span>
            </div>

            {/* Reward : Risk (RR) */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Reward : Risk Ratio (R)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={rrRatioInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setRrRatioInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="2.5"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Rasio Take Profit : Stop Loss (1:{rrRatio})
              </span>
            </div>

            {/* Risiko per Trade */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#151D2A] dark:text-[#F2F5F9] font-medium">Risiko per Trade</label>
                <div className="flex rounded bg-[#F5F7FA] dark:bg-[#080A0E] p-0.5 border border-[#DDE3EA] dark:border-[#252B34] text-[10px]">
                  <button
                    type="button"
                    onClick={() => setRiskType('percent')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                      riskType === 'percent'
                        ? 'bg-[#1769E8] text-white'
                        : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskType('nominal')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                      riskType === 'nominal'
                        ? 'bg-[#1769E8] text-white'
                        : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>
              <input
                type="number"
                step="0.1"
                min="0.01"
                value={riskValueInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setRiskValueInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="1.5"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                {riskType === 'percent' ? `${riskValue}% dari modal` : `${formatCurrency(riskValue, settings)} tetap`}
              </span>
            </div>

            {/* Jumlah Trade */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Jumlah Transaksi (Trades)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="500"
                value={tradesCountInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setTradesCountInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="30"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Durasi rentang {tradesCount} eksekusi
              </span>
            </div>

            {/* Kocok Ulang Monte Carlo */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Kocok Simulasi Acak</label>
              <button
                type="button"
                onClick={() => {
                  setSequenceMode('monte_carlo_random');
                  setRandomSeed((s) => s + 1);
                }}
                className="w-full py-2 px-3 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                <span>Kocok Urutan (# {randomSeed})</span>
              </button>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Hasilkan variasi acak baru
              </span>
            </div>
          </div>

          {/* Metode Risiko: Saldo Berjalan (Compounding) vs Modal Awal (Fixed) */}
          <div className="pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1.5">
                Metode Perhitungan Risiko per Trade
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRiskMethod('balance')}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    riskMethod === 'balance'
                      ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  <span className="font-bold block text-xs">Saldo Berjalan</span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                    Compounding dinamis dari ekuitas
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRiskMethod('initial_capital')}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    riskMethod === 'initial_capital'
                      ? 'bg-white dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border-[#1769E8]'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  <span className="font-bold block text-xs">Modal Awal Tetap</span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                    Risiko dolar selalu flat konstan
                  </span>
                </button>
              </div>
            </div>

            {/* Model Distribusi Urutan */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1.5">
                Model Urutan Trade (Sequence)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSequenceMode('expected_spread')}
                  className={`py-2 px-1 rounded-lg border text-center transition-colors ${
                    sequenceMode === 'expected_spread'
                      ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40 font-bold'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] text-[11px]'
                  }`}
                >
                  Distribusi Rata
                </button>
                <button
                  type="button"
                  onClick={() => setSequenceMode('loss_streak_first')}
                  className={`py-2 px-1 rounded-lg border text-center transition-colors ${
                    sequenceMode === 'loss_streak_first'
                      ? 'bg-white dark:bg-[#171D26] text-rose-600 dark:text-rose-400 border-[#1769E8] font-bold'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] text-[11px]'
                  }`}
                  title="Simulasi skenario terburuk: seluruh loss terjadi di awal"
                >
                  Loss di Awal
                </button>
                <button
                  type="button"
                  onClick={() => setSequenceMode('win_streak_first')}
                  className={`py-2 px-1 rounded-lg border text-center transition-colors ${
                    sequenceMode === 'win_streak_first'
                      ? 'bg-white dark:bg-[#171D26] text-emerald-600 dark:text-emerald-400 border-[#1769E8] font-bold'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] text-[11px]'
                  }`}
                  title="Simulasi skenario terbaik: seluruh win terjadi di awal"
                >
                  Win di Awal
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Mathematical Expectancy & Win/Loss Counts */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <Activity className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <h4 className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Ekspektasi Matematika & Probabilitas</h4>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1 font-mono-numbers">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">
                Expectancy per Trade (R-Multiple):
              </span>
              <div
                className={`text-xl font-extrabold ${
                  simulation.expectancyR > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : simulation.expectancyR < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#697586] dark:text-[#929BA9]'
                }`}
              >
                {simulation.expectancyR > 0 ? '+' : ''}
                {simulation.expectancyR.toFixed(2)} R
              </div>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">
                = ({winRate}% × {rrRatio}) - ({(100 - winRate).toFixed(0)}% × 1.0)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center font-mono-numbers">
              <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Jumlah Menang (Win)</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{simulation.winCount} Trade</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Jumlah Kalah (Loss)</span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">{simulation.lossCount} Trade</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] space-y-1">
              <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">Ekspektasi Dolar Awal:</span>
              <p>
                Rata-rata ekspektasi nilai tambah:{' '}
                <strong className={simulation.expectancyDollar >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {simulation.expectancyDollar >= 0 ? '+' : ''}
                  {formatCurrency(simulation.expectancyDollar, settings)}
                </strong>{' '}
                per eksekusi trade.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Estimasi Saldo Akhir */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Estimasi Saldo Akhir
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
            {formatCurrency(simulation.finalBalance, settings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Setelah {tradesCount} Trade
          </span>
        </div>

        {/* Total Net Profit / Loss */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Total Net P/L
          </span>
          <div
            className={`text-xl sm:text-2xl font-extrabold font-mono-numbers ${
              isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isProfit ? '+' : ''}
            {formatCurrency(simulation.totalNetProfit, settings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            {isProfit ? '+' : ''}
            {simulation.totalGainPercent.toFixed(2)}% dari modal
          </span>
        </div>

        {/* Expectancy R */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Expectancy
          </span>
          <div
            className={`text-xl sm:text-2xl font-extrabold font-mono-numbers ${
              simulation.expectancyR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {simulation.expectancyR > 0 ? '+' : ''}
            {simulation.expectancyR.toFixed(2)} R
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Keunggulan statistik sistem
          </span>
        </div>

        {/* Maximum Drawdown */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Max Drawdown
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-rose-600 dark:text-rose-400">
            -{simulation.maxDrawdownPercent.toFixed(2)}%
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            -{formatCurrency(simulation.maxDrawdownDollar, settings)} dari puncak
          </span>
        </div>

        {/* Win / Loss Ratio */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Hasil Eksekusi
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
            <span className="text-emerald-600 dark:text-emerald-400">{simulation.winCount}W</span>{' '}
            <span className="text-[#697586] dark:text-[#929BA9]">/</span>{' '}
            <span className="text-rose-600 dark:text-rose-400">{simulation.lossCount}L</span>
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            {((simulation.winCount / tradesCount) * 100).toFixed(0)}% Efektif Win
          </span>
        </div>
      </div>

      {/* Dual Interactive Chart: Equity Curve + Drawdown Underwater Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Curve */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Kurva Ekuitas (Equity Curve)</span>
            </h3>
            <span className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers">
              {riskMethod === 'balance' ? 'Compounding' : 'Modal Awal Tetap'}
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[320px] h-[190px]">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
                <defs>
                  <linearGradient id="eqAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1769E8" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#1769E8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.5, 1].map((pct) => {
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
                        x={padding.left - 6}
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

                <path d={areaPath} fill="url(#eqAreaGrad)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#1769E8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Dots on wins/losses */}
                {points.map((p, idx) => {
                  if (idx === 0) return null;
                  return (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r="3"
                      fill={p.isWin ? '#10b981' : '#f43f5e'}
                      className="stroke-white dark:stroke-[#080A0E]"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Drawdown Curve (Underwater Chart) */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <TrendingDown className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Kurva Drawdown dari Puncak</span>
            </h3>
            <span className="text-xs text-rose-600 dark:text-rose-400 font-mono-numbers font-semibold">
              Max: -{simulation.maxDrawdownPercent.toFixed(2)}%
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[320px] h-[190px]">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
                <defs>
                  <linearGradient id="ddAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Zero line */}
                <line
                  x1={padding.left}
                  y1={padding.top}
                  x2={chartWidth - padding.right}
                  y2={padding.top}
                  className="stroke-[#DDE3EA] dark:stroke-[#252B34]"
                  strokeWidth="1"
                />

                <path d={ddAreaPath} fill="url(#ddAreaGrad)" />
                <path
                  d={ddLinePath}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <text
                  x={padding.left - 6}
                  y={padding.top + 4}
                  fill="#697586"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="Arial, Helvetica, sans-serif"
                >
                  0%
                </text>
                <text
                  x={padding.left - 6}
                  y={chartHeight - padding.bottom}
                  fill="#f43f5e"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="Arial, Helvetica, sans-serif"
                >
                  -{maxDdVal.toFixed(1)}%
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Monte Carlo Probabilistic Box */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34] gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <BarChart3 className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Simulasi Probabilistik Monte Carlo (250 Iterasi Acak)</span>
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Mencegah bias deterministik dengan mensimulasikan ratusan variasi urutan acak nyata
            </p>
          </div>

          <div className="text-xs text-[#697586] dark:text-[#929BA9]">
            Probabilitas Profit:{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono-numbers">
              {simulation.monteCarlo.probabilityOfProfit}%
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers">
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Median Saldo Akhir (P50)</span>
            <span className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              {formatCurrency(simulation.monteCarlo.medianFinalBalance, settings)}
            </span>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Nilai tengah statistik</span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Skenario Terbaik (P95)</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(simulation.monteCarlo.p95BestCase, settings)}
            </span>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Top 5% kemungkinan</span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Skenario Terburuk (P5)</span>
            <span className="text-base font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(simulation.monteCarlo.p5WorstCase, settings)}
            </span>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Bottom 5% kemungkinan</span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Rata-rata Max Drawdown</span>
            <span className="text-base font-bold text-amber-600 dark:text-amber-400">
              -{simulation.monteCarlo.averageMaxDrawdown}%
            </span>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Ekspektasi penurunan</span>
          </div>
        </div>

        {/* Assumptions Box */}
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1.5 text-xs text-[#697586] dark:text-[#929BA9]">
          <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            Asumsi & Catatan Transparansi Simulasi:
          </span>
          {simulation.assumptions.map((asm, idx) => (
            <p key={idx} className="text-[11px] leading-relaxed">
              • {asm}
            </p>
          ))}
          <p className="text-[11px] text-amber-700 dark:text-amber-300/90 pt-1 font-medium">
            Perhatian: Simulasi tidak boleh dijadikan jaminan kepastian. Urutan kemenangan/kekalahan acak di pasar nyata dapat menyebabkan drawdown psikologis sebelum mencapai target.
          </p>
        </div>
      </div>
    </div>
  );
};
