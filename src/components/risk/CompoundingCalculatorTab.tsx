import React, { useState, useMemo } from 'react';
import { AppSettings, CurrencyCode } from '../../types/settings';
import {
  calculateCompoundingGrowth,
  CompoundingInterval,
  CompoundingMode,
  DepositTiming,
} from '../../utils/compoundingCalculator';
import { formatCurrency } from '../../utils/calculations';
import {
  TrendingUp,
  Coins,
  Calendar,
  Info,
  Sliders,
} from 'lucide-react';

interface CompoundingCalculatorTabProps {
  settings: AppSettings;
  currentEquity: number;
}

export const CompoundingCalculatorTab: React.FC<CompoundingCalculatorTabProps> = ({
  settings,
}) => {
  // Inputs state - default $50 as requested
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>('50');
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency || 'USD');
  const [interval, setInterval] = useState<CompoundingInterval>('daily');
  const [growthRateInput, setGrowthRateInput] = useState<string>('5');
  const [durationInput, setDurationInput] = useState<string>('30');
  const [depositInput, setDepositInput] = useState<string>('0');
  const [depositTiming, setDepositTiming] = useState<DepositTiming>('end_of_period');
  const [mode, setMode] = useState<CompoundingMode>('compounding');
  const [tablePage, setTablePage] = useState<number>(1);
  const rowsPerPage = 15;

  // Clean and parse inputs
  const startingCapital = Math.max(0, parseFloat(startingCapitalInput) || 0);
  const growthRate = Math.max(0, parseFloat(growthRateInput) || 0);
  const duration = Math.max(1, Math.min(365, parseInt(durationInput, 10) || 1));
  const regularDeposit = Math.max(0, parseFloat(depositInput) || 0);

  // Temporary settings wrapper for currency symbol
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

  // Reactive calculation
  const result = useMemo(() => {
    return calculateCompoundingGrowth({
      startingCapital,
      growthRatePercent: growthRate,
      interval,
      duration,
      regularDeposit,
      depositTiming,
      mode,
    });
  }, [startingCapital, growthRate, interval, duration, regularDeposit, depositTiming, mode]);

  // Interval label in Indonesian
  const intervalLabel =
    interval === 'daily' ? 'Hari' : interval === 'weekly' ? 'Minggu' : 'Bulan';

  // Sanitized input handlers to prevent leading zero quirks like "0100"
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
    }
    setter(cleaned);
  };

  // Table pagination
  const totalPages = Math.ceil(result.steps.length / rowsPerPage);
  const paginatedSteps = result.steps.slice(
    (tablePage - 1) * rowsPerPage,
    tablePage * rowsPerPage
  );

  // Quick preset test buttons
  const applyDefaultPreset = () => {
    setStartingCapitalInput('50');
    setGrowthRateInput('5');
    setInterval('daily');
    setDurationInput('30');
    setDepositInput('0');
    setMode('compounding');
    setTablePage(1);
  };

  const applyTestExample = () => {
    setStartingCapitalInput('1000');
    setGrowthRateInput('5');
    setInterval('monthly');
    setDurationInput('2');
    setDepositInput('0');
    setMode('compounding');
    setTablePage(1);
  };

  // SVG Chart Dimensions & Calculations
  const chartHeight = 220;
  const chartWidth = 700;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const maxBalance = Math.max(
    ...result.steps.map((s) => s.endBalance),
    startingCapital,
    1
  );
  const minBalance = Math.min(
    ...result.steps.map((s) => s.startBalance),
    startingCapital
  );

  const getY = (val: number) => {
    if (maxBalance === minBalance) return padding.top + innerHeight / 2;
    const norm = (val - minBalance) / (maxBalance - minBalance);
    return padding.top + innerHeight - norm * innerHeight;
  };

  const getX = (idx: number, total: number) => {
    if (total <= 1) return padding.left;
    return padding.left + (idx / (total - 1)) * innerWidth;
  };

  const points = [
    { x: getX(0, result.steps.length + 1), y: getY(startingCapital), val: startingCapital, period: 0 },
    ...result.steps.map((s, idx) => ({
      x: getX(idx + 1, result.steps.length + 1),
      y: getY(s.endBalance),
      val: s.endBalance,
      period: s.period,
    })),
  ];

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${chartHeight - padding.bottom} L ${points[0].x.toFixed(1)} ${chartHeight - padding.bottom} Z`;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Banner & Compounding Concept Explanation */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#1769E8]/10 text-[#1769E8] dark:bg-[#1769E8]/20 dark:text-[#60A5FA] border border-[#1769E8]/30">
              TRADEVAULT COMPOUNDING SIMULATOR
            </span>
            <span className="text-xs text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
              Compounding vs Profit Withdrawal
            </span>
          </div>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-2xl leading-relaxed">
            Simulasikan pertumbuhan modal berdasarkan target return, periode investasi, dan tambahan modal. Bandingkan compounding dengan metode penarikan profit untuk memahami perbedaan hasil secara matematis.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={applyDefaultPreset}
            className="px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Muat preset modal $50, target 5% per hari selama 30 hari"
          >
            <Sliders className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Preset Modal $50</span>
          </button>
          <button
            type="button"
            onClick={applyTestExample}
            className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-medium transition-colors"
            title="Uji skenario: modal $1.000, 5% per bulan, 2 bulan -> $1.102,50"
          >
            Uji Skenario $1.000
          </button>
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Parameters */}
        <div className="lg:col-span-2 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <Coins className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Parameter Pertumbuhan Modal</span>
            </h3>
            <span className="text-xs text-[#697586] dark:text-[#929BA9]">
              Input otomatis memperbarui grafik & tabel
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Modal Awal */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Modal Awal ({activeSettings.currencySymbol})
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

            {/* Mata Uang */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Mata Uang</label>
              <div className="grid grid-cols-3 gap-1">
                {(['USD', 'IDR', 'EUR'] as CurrencyCode[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`py-2 rounded-lg border font-bold text-xs transition-colors ${
                      currency === c
                        ? 'bg-[#1769E8] text-white border-[#1769E8]'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Simbol: {activeSettings.currencySymbol}
              </span>
            </div>

            {/* Interval Pertumbuhan */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Interval Pertumbuhan</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as CompoundingInterval)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="daily">Harian (Per Hari)</option>
                <option value="weekly">Mingguan (Per Minggu)</option>
                <option value="monthly">Bulanan (Per Bulan)</option>
              </select>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Satuan langkah periode
              </span>
            </div>

            {/* Target Pertumbuhan per Interval */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Target Pertumbuhan (%) per {intervalLabel}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={growthRateInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setGrowthRateInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="5"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Tingkat bunga per {intervalLabel.toLowerCase()}
              </span>
            </div>

            {/* Durasi Simulasi */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Durasi Simulasi (Jumlah {intervalLabel})
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="365"
                value={durationInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setDurationInput, false)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="30"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Total rentang: {duration} {intervalLabel.toLowerCase()}
              </span>
            </div>

            {/* Tambahan Modal Rutin (Deposit) */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Setoran Rutin ({activeSettings.currencySymbol}) (Opsional)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={depositInput}
                onChange={(e) => handleCleanNumberInput(e.target.value, setDepositInput)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="0"
              />
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-1 block">
                Ditambahkan setiap {intervalLabel.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Mode Switcher & Deposit Timing */}
          <div className="pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Mode Compounding vs Fixed Withdrawn */}
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1.5">
                Model Pertumbuhan Profit
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('compounding')}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    mode === 'compounding'
                      ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  <span className="font-bold block text-xs">Compounding</span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                    Profit digulung kembali ke saldo
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('fixed_withdrawn')}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    mode === 'fixed_withdrawn'
                      ? 'bg-white dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border-[#1769E8]'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  <span className="font-bold block text-xs">Profit Tetap / Ditarik</span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                    Profit dihitung dari modal awal saja
                  </span>
                </button>
              </div>
            </div>

            {/* Waktu Deposit */}
            {regularDeposit > 0 && (
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1.5">
                  Waktu Setoran Rutin (Deposit)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositTiming('end_of_period')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      depositTiming === 'end_of_period'
                        ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                    }`}
                  >
                    <span className="font-bold block text-xs">Di Akhir Periode</span>
                    <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                      Bunga dihitung sebelum deposit
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositTiming('start_of_period')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      depositTiming === 'start_of_period'
                        ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                    }`}
                  >
                    <span className="font-bold block text-xs">Di Awal Periode</span>
                    <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                      Deposit ikut berbunga langsung
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Mathematical Explanation Box */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <Info className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <h4 className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Aturan & Metode Perhitungan</h4>
          </div>

          {mode === 'compounding' ? (
            <div className="space-y-2 text-[#151D2A] dark:text-[#F2F5F9] text-[11px] leading-relaxed">
              <span className="font-bold text-[#1769E8] dark:text-[#60A5FA] block">Rumus Mode Compounding:</span>
              <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] font-mono-numbers text-[#1769E8] dark:text-[#60A5FA] border border-[#DDE3EA] dark:border-[#252B34]">
                Saldo Akhir = Saldo Awal × (1 + r) + Deposit
              </div>
              <p className="text-[#697586] dark:text-[#929BA9]">
                • <strong>r</strong> adalah target pertumbuhan per {intervalLabel.toLowerCase()} ({growthRate}%).
              </p>
              <p className="text-[#697586] dark:text-[#929BA9]">
                • Profit periode ini otomatis menambah modal pokok untuk periode berikutnya, menghasilkan kurva pertumbuhan eksponensial.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-[#151D2A] dark:text-[#F2F5F9] text-[11px] leading-relaxed">
              <span className="font-bold text-amber-600 dark:text-amber-400 block">Rumus Mode Profit Tetap / Ditarik:</span>
              <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] font-mono-numbers text-amber-700 dark:text-amber-300 border border-[#DDE3EA] dark:border-[#252B34]">
                Profit Periode = Modal Awal Pokok × r
              </div>
              <p className="text-[#697586] dark:text-[#929BA9]">
                • Profit dihitung secara <strong>linier</strong> hanya dari modal awal pokok ({formatCurrency(startingCapital, activeSettings)}).
              </p>
              <p className="text-[#697586] dark:text-[#929BA9]">
                • Profit tidak di-compound, melainkan dipisahkan/ditarik sehingga total profit = Modal Pokok × r × Durasi.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-1 text-[11px]">
            <span className="font-semibold text-[#697586] dark:text-[#929BA9] block">Verifikasi Akurasi:</span>
            <p className="text-[#697586] dark:text-[#929BA9]">
              Modal $1.000, 5% per bulan, durasi 2 bulan tanpa deposit menghasilkan tepat <strong className="text-emerald-600 dark:text-emerald-400 font-mono-numbers">$1.102,50</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Saldo Akhir */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Saldo Akhir
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
            {formatCurrency(result.endingBalance, activeSettings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Setelah {duration} {intervalLabel.toLowerCase()}
          </span>
        </div>

        {/* Total Profit */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Total Profit
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(result.totalProfit, activeSettings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Akumulasi keuntungan
          </span>
        </div>

        {/* Total Tambahan Modal */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Total Deposit
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
            {formatCurrency(result.totalDeposits, activeSettings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Setoran rutin disuntikkan
          </span>
        </div>

        {/* Profit Murni dari Pertumbuhan */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Profit Murni
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(result.pureGrowthProfit, activeSettings)}
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            Tanpa tambahan deposit
          </span>
        </div>

        {/* Persentase Pertumbuhan Total */}
        <div className="p-4 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider font-semibold block">
            Pertumbuhan Total
          </span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">
            +{result.totalGrowthPercent.toFixed(2)}%
          </div>
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
            ROI dari modal total
          </span>
        </div>
      </div>

      {/* Visual Growth Curve (Interactive SVG) */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34] gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Grafik Perkembangan Saldo per {intervalLabel}</span>
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Trayektori modal dari {formatCurrency(startingCapital, activeSettings)} menuju{' '}
              {formatCurrency(result.endingBalance, activeSettings)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono-numbers">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
              <span className="h-2 w-2 rounded-full bg-[#1769E8]" />
              {mode === 'compounding' ? 'Eksponensial Compounding' : 'Linier Profit Tetap'}
            </span>
          </div>
        </div>

        {/* SVG Curve Container */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[600px] h-[220px]">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
              <defs>
                <linearGradient id="compAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1769E8" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#1769E8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
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
                      {formatCurrency(val, activeSettings)}
                    </text>
                  </g>
                );
              })}

              {/* Area Gradient */}
              <path d={areaPath} fill="url(#compAreaGrad)" />

              {/* Line */}
              <path
                d={linePath}
                fill="none"
                stroke="#1769E8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Period Markers */}
              {points.map((p, idx) => {
                const shouldShowDot = points.length <= 35 || idx % Math.ceil(points.length / 20) === 0 || idx === points.length - 1;
                if (!shouldShowDot) return null;
                return (
                  <g key={idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="3"
                      className="fill-white dark:fill-[#080A0E]"
                      stroke="#1769E8"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}

              {/* X Axis Labels */}
              <text
                x={padding.left}
                y={chartHeight - 8}
                fill="#697586"
                fontSize="10"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                Awal
              </text>
              <text
                x={chartWidth - padding.right}
                y={chartHeight - 8}
                fill="#697586"
                fontSize="10"
                textAnchor="end"
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {intervalLabel} ke-{duration}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* Detailed Period Table */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34] gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <Calendar className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Tabel Rincian Saldo Setiap {intervalLabel}</span>
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Saldo awal, pertumbuhan, deposit, dan saldo akhir setiap periode
            </p>
          </div>

          <div className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers">
            Menampilkan halaman {tablePage} dari {totalPages} ({result.steps.length} Periode)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
            <thead className="bg-[#F5F7FA] dark:bg-[#080A0E] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] border-b border-[#DDE3EA] dark:border-[#252B34] font-semibold">
              <tr>
                <th className="py-2.5 px-3">Periode</th>
                <th className="py-2.5 px-3 font-mono-numbers">Saldo Awal</th>
                <th className="py-2.5 px-3 font-mono-numbers">Pertumbuhan ({growthRate}%)</th>
                {regularDeposit > 0 && (
                  <th className="py-2.5 px-3 font-mono-numbers">Deposit Rutin</th>
                )}
                <th className="py-2.5 px-3 font-mono-numbers">Saldo Akhir</th>
                <th className="py-2.5 px-3 font-mono-numbers">Akumulasi Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers">
              {paginatedSteps.map((s) => (
                <tr key={s.period} className="hover:bg-[#F5F7FA] dark:hover:bg-[#171D26]/60 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {intervalLabel} {s.period}
                  </td>
                  <td className="py-2.5 px-3 text-[#697586] dark:text-[#929BA9]">
                    {formatCurrency(s.startBalance, activeSettings)}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{formatCurrency(s.growthProfit, activeSettings)}
                  </td>
                  {regularDeposit > 0 && (
                    <td className="py-2.5 px-3 text-[#1769E8] dark:text-[#60A5FA]">
                      +{formatCurrency(s.deposit, activeSettings)}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-[#151D2A] dark:text-[#F2F5F9] font-bold">
                    {formatCurrency(s.endBalance, activeSettings)}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(s.cumulativeProfit, activeSettings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] text-xs">
            <button
              type="button"
              onClick={() => setTablePage((p) => Math.max(1, p - 1))}
              disabled={tablePage === 1}
              className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] disabled:opacity-30 disabled:cursor-not-allowed text-[#151D2A] dark:text-[#F2F5F9] font-medium transition-colors"
            >
              Sebelumnya
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTablePage(i + 1)}
                  className={`w-7 h-7 rounded-lg text-xs font-mono-numbers font-bold transition-colors ${
                    tablePage === i + 1
                      ? 'bg-[#1769E8] text-white'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
              disabled={tablePage === totalPages}
              className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] disabled:opacity-30 disabled:cursor-not-allowed text-[#151D2A] dark:text-[#F2F5F9] font-medium transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
