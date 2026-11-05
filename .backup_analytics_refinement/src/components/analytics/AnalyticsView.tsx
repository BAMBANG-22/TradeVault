import React, { useState, useMemo } from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  calculatePerformance,
  formatCurrency,
  formatProfitFactor,
  formatRMultiple,
  formatGrowthPercent,
  computePeriodTradesAndStartingBalance,
} from '../../utils/calculations';
import { StatCard } from '../dashboard/StatCard';
import { EquityChart } from '../dashboard/EquityChart';
import { DrawdownChart } from '../dashboard/DrawdownChart';
import { RadarChart } from '../dashboard/RadarChart';
import { PerformanceCalendar } from '../dashboard/PerformanceCalendar';
import {
  Percent,
  DollarSign,
  PieChart,
  ShieldAlert,
  Award,
  BarChart,
  Target,
  Scale,
  Zap,
  Calendar,
  Filter,
  RotateCcw,
  Info,
  Clock,
  Eye,
  EyeOff,
  Coins,
} from 'lucide-react';

interface AnalyticsViewProps {
  trades: Trade[];
  settings: AppSettings;
  onViewTrade?: (trade: Trade) => void;
}

type PeriodPreset = 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | '7D' | '30D' | 'YTD' | 'CUSTOM';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ trades, settings, onViewTrade }) => {
  // Period filter state
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Privacy Mode state persisted in localStorage
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tradevault_privacy_mode') === 'true';
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const syncPrivacy = () => {
      try {
        setIsPrivacyMode(localStorage.getItem('tradevault_privacy_mode') === 'true');
      } catch {
        // Ignore
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

  // Handle preset period changes using local calendar dates (preventing UTC day-shift in GMT+7/+8/+9)
  const handlePeriodChange = (period: PeriodPreset) => {
    setSelectedPeriod(period);
    const now = new Date();

    if (period === 'ALL') {
      setStartDate('');
      setEndDate('');
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

  // Compute strictly based on the filtered trades and period starting balance
  const { metrics, equityCurve, dailyPerformance, monthlyPerformance, radarIndicators } =
    useMemo(() => {
      return calculatePerformance(filteredTrades, periodSettings);
    }, [filteredTrades, periodSettings]);

  const isNetProfitPositive = metrics.totalNetProfit >= 0;
  const isJournalCompletelyEmpty = !trades || trades.length === 0;

  return (
    <div className="space-y-6">
      {/* Complete Empty State Banner */}
      {isJournalCompletelyEmpty ? (
        <div className="p-8 rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-4 rounded-2xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
            <BarChart className="h-8 w-8 stroke-[1.75]" />
          </div>
          <h3 className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">Data Transaksi Jurnal Masih Kosong</h3>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-md leading-relaxed">
            Tidak ada transaksi tersimpan untuk dihitung. Tambahkan posisi trading Anda di menu{' '}
            <strong className="text-[#1769E8]">Trade Log</strong> atau muat dataset contoh di menu{' '}
            <strong className="text-[#151D2A] dark:text-[#F2F5F9]">Settings</strong> untuk mengeksplorasi seluruh metrik analitik.
          </p>
        </div>
      ) : (
        <>
          {/* Top Header & Privacy Toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                  Analytics &amp; Performa Sistem Trading
                </h2>
                {isPrivacyMode && (
                  <span className="px-2 py-0.5 rounded bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                    MODE PRIVASI AKTIF
                  </span>
                )}
              </div>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
                Evaluasi presisi performa XAUUSD berdasarkan {filteredTrades.length} dari {trades.length} transaksi tersimpan
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {/* Privacy Mode Toggle Button */}
              <button
                onClick={togglePrivacyMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                  isPrivacyMode
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border-[#DDE3EA] dark:border-[#252B34]'
                    : 'bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8]'
                }`}
                title="Sembunyikan nominal uang agar aman dibagikan atau ditangkap layar (screenshot)"
              >
                {isPrivacyMode ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5 stroke-[1.75] text-amber-600 dark:text-amber-400" />
                    <span>Mode Privasi: Aktif</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                    <span>Mode Privasi: Nonaktif</span>
                  </>
                )}
              </button>

              <div className="hidden sm:flex items-center gap-2 font-mono-numbers tabular-nums">
                <div className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 text-xs">
                  <span className="text-[#697586] dark:text-[#929BA9]">Profit Factor: </span>
                  <span
                    className={`font-bold ${
                      metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-[#151D2A] dark:text-[#F2F5F9]'
                    }`}
                  >
                    {formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)}
                  </span>
                </div>
                <div className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 text-xs">
                  <span className="text-[#697586] dark:text-[#929BA9]">Win Rate: </span>
                  <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">{metrics.winRate}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Critical Drawdown Alert Banner */}
          {metrics.isAccountInCriticalDrawdown && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-5 w-5 stroke-[1.75] text-rose-600 dark:text-rose-400 shrink-0" />
                <div className="text-[#697586] dark:text-[#929BA9]">
                  <strong className="font-semibold text-rose-600 dark:text-rose-400">
                    Peringatan Penurunan Modal Kritis:
                  </strong>{' '}
                  Saldo akun telah menyentuh batas risiko atau mencapai drawdown ≥ 100%. Evaluasi ukuran lot dan stop loss segera.
                </div>
              </div>
            </div>
          )}

          {/* Date & Period Filter Toolbar */}
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-3.5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Presets Button Row */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 text-xs select-none">
                <span className="text-[#697586] dark:text-[#929BA9] text-[11px] font-semibold flex items-center gap-1 mr-1 shrink-0">
                  <Clock className="h-3.5 w-3.5 stroke-[1.75]" />
                  Periode:
                </span>
                {[
                  { id: 'ALL', label: 'Semua Waktu' },
                  { id: 'THIS_MONTH', label: 'Bulan Ini' },
                  { id: 'LAST_MONTH', label: 'Bulan Lalu' },
                  { id: '7D', label: '7 Hari' },
                  { id: '30D', label: '30 Hari' },
                  { id: 'YTD', label: 'Tahun Ini' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePeriodChange(p.id as PeriodPreset)}
                    className={`px-2.5 py-1.5 rounded-lg border font-medium text-xs transition-colors shrink-0 cursor-pointer ${
                      selectedPeriod === p.id
                        ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8]/50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date pickers & reset */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] rounded-lg px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9] shrink-0" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleCustomDateChange(e.target.value, endDate)}
                    className="bg-transparent text-[#151D2A] dark:text-[#F2F5F9] text-xs focus:outline-none font-mono-numbers tabular-nums"
                    title="Dari Tanggal"
                  />
                  <span className="text-[#697586] dark:text-[#929BA9]">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleCustomDateChange(startDate, e.target.value)}
                    className="bg-transparent text-[#151D2A] dark:text-[#F2F5F9] text-xs focus:outline-none font-mono-numbers tabular-nums"
                    title="Sampai Tanggal"
                  />
                </div>

                {(selectedPeriod !== 'ALL' || startDate || endDate) && (
                  <button
                    onClick={handleResetFilters}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9] text-xs transition-colors shrink-0 border border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
                    title="Reset Filter Tanggal"
                  >
                    <RotateCcw className="h-3 w-3 stroke-[1.75]" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter status readout */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[#697586] dark:text-[#929BA9] pt-2 border-t border-[#DDE3EA] dark:border-[#252B34] font-mono-numbers tabular-nums">
              <div className="flex items-center gap-1.5 font-sans">
                <Filter className="h-3 w-3 stroke-[1.75]" />
                <span>
                  Menampilkan <strong className="text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums">{filteredTrades.length}</strong> transaksi{' '}
                  {startDate || endDate
                    ? `(${startDate || 'Awal'} s/d ${endDate || 'Hari Ini'})`
                    : '(Seluruh Riwayat)'}
                </span>
              </div>
              <div>
                Modal Awal Periode:{' '}
                <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{formatCurrency(periodStartingBalance, settings, isPrivacyMode)}</strong>
              </div>
            </div>
          </div>

          {/* Zero results within filter check */}
          {filteredTrades.length === 0 ? (
            <div className="p-8 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] text-center text-xs text-[#697586] dark:text-[#929BA9] space-y-2">
              <Info className="h-6 w-6 stroke-[1.75] text-[#697586] dark:text-[#929BA9] mx-auto" />
              <p className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                Tidak ada transaksi yang cocok pada rentang tanggal yang dipilih.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Kembali ke Semua Waktu
              </button>
            </div>
          ) : (
            <>
              {/* Primary 10 KPI Performance Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {/* 1. Total Net Profit/Loss */}
                <StatCard
                  title="Total Net Profit"
                  value={formatCurrency(metrics.totalNetProfit, settings, isPrivacyMode)}
                  subtitle={`Gross: ${formatCurrency(metrics.totalGrossProfit, settings, isPrivacyMode)}`}
                  icon={DollarSign}
                  trend={isNetProfitPositive ? 'up' : 'down'}
                  trendValue={`${isNetProfitPositive ? '+' : ''}${formatCurrency(metrics.totalNetProfit, settings, isPrivacyMode)}`}
                  info="Keuntungan atau kerugian bersih setelah memperhitungkan komisi broker dan swap"
                />

                {/* 2. Total Gain % */}
                <StatCard
                  title="Total Gain (%)"
                  value={formatGrowthPercent(metrics.totalGainPercent, metrics.hasValidGrowthPercent, 2)}
                  subtitle={`Modal: ${formatCurrency(periodStartingBalance, settings, isPrivacyMode)}`}
                  icon={Percent}
                  trend={
                    !metrics.hasValidGrowthPercent
                      ? 'neutral'
                      : metrics.totalGainPercent >= 0
                      ? 'up'
                      : 'down'
                  }
                  trendValue={formatGrowthPercent(metrics.totalGainPercent, metrics.hasValidGrowthPercent, 1)}
                  info="Dihitung dari Net Profit dibagi modal awal periode yang dikonfigurasi (bukan return majemuk)"
                />

                {/* 3. Total Gain Capital */}
                <StatCard
                  title="Total Gain Capital"
                  value={formatCurrency(metrics.totalGainCapital, settings, isPrivacyMode)}
                  subtitle="Keuntungan Bersih Akun"
                  icon={Coins}
                  trend={metrics.totalGainCapital >= 0 ? 'up' : 'down'}
                  info="Keuntungan bersih riil dalam mata uang akun (Total Gain Capital = Net Profit)"
                />

                {/* 4. Win Rate */}
                <StatCard
                  title="Win Rate"
                  value={`${metrics.winRate}%`}
                  subtitle={`${metrics.winningTrades}W / ${metrics.losingTrades}L (${metrics.breakevenTrades} BE)`}
                  icon={PieChart}
                  trend={metrics.winRate >= 50 ? 'up' : 'down'}
                  trendValue={`${metrics.winRate}%`}
                  info="Persentase jumlah transaksi menang terhadap total transaksi selesai"
                />

                {/* 5. Profit Factor */}
                <StatCard
                  title="Profit Factor"
                  value={formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)}
                  subtitle={`Gross Loss: ${formatCurrency(metrics.totalGrossLoss, settings, isPrivacyMode)}`}
                  icon={Scale}
                  trend={metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite ? 'up' : 'neutral'}
                  trendValue={metrics.profitFactor >= 2 || metrics.isProfitFactorInfinite ? 'Kuat' : 'Stabil'}
                  info="Total Gross Profit dibagi Total Gross Loss (aman bila tanpa loss = ∞)"
                />

                {/* 6. Maximum Drawdown */}
                <StatCard
                  title="Max Drawdown"
                  value={`-${metrics.maxDrawdownPercent.toFixed(2)}%`}
                  subtitle={`Nominal: -${formatCurrency(metrics.maxDrawdownAmount, settings, isPrivacyMode)}`}
                  icon={ShieldAlert}
                  trend="down"
                  trendValue={`-${metrics.maxDrawdownPercent.toFixed(1)}%`}
                  info="Penurunan terdalam dari puncak tertinggi saldo historis (High Watermark)"
                />

                {/* 7. Expectancy per trade */}
                <StatCard
                  title="Expectancy / Trade"
                  value={formatCurrency(metrics.expectancy, settings, isPrivacyMode)}
                  subtitle="Nilai Harapan Matematis"
                  icon={Zap}
                  trend={metrics.expectancy >= 0 ? 'up' : 'down'}
                  trendValue={metrics.expectancy >= 0 ? 'Positif' : 'Negatif'}
                  info="Rata-rata keuntungan atau kerugian bersih setiap satu trade dieksekusi"
                />

                {/* 8. Average Realized R-Multiple */}
                <StatCard
                  title="Average R (Aktual)"
                  value={formatRMultiple(metrics.averageRiskReward, metrics.hasValidRiskReward)}
                  subtitle={
                    metrics.hasValidRiskReward
                      ? `Rata-rata R (${metrics.validRTradesCount} Trade)`
                      : 'Data R Tidak Tersedia'
                  }
                  icon={Target}
                  trend={
                    !metrics.hasValidRiskReward
                      ? 'neutral'
                      : metrics.averageRiskReward > 0
                      ? 'up'
                      : metrics.averageRiskReward < 0
                      ? 'down'
                      : 'neutral'
                  }
                  info="Rata-rata Realized R-Multiple (Net Profit / Risiko) dari seluruh transaksi tertutup yang memiliki data risiko valid"
                />

                {/* 9. Total Trades Breakdown */}
                <StatCard
                  title="Total Trades"
                  value={metrics.totalTrades}
                  subtitle={`BE: ${metrics.breakevenTrades} Trade`}
                  icon={BarChart}
                  info="Total posisi trading selesai dalam jurnal pada periode ini"
                />

                {/* 10. Average Win / Loss */}
                <StatCard
                  title="Avg Win / Loss"
                  value={
                    isPrivacyMode
                      ? `${settings.currencySymbol || '$'}•••• / ••••`
                      : `$${metrics.averageWin.toFixed(0)} / $${metrics.averageLoss.toFixed(0)}`
                  }
                  subtitle={`Rasio: ${(metrics.averageLoss > 0 ? metrics.averageWin / metrics.averageLoss : 1).toFixed(2)}x`}
                  icon={Award}
                  info="Rata-rata nominal profit pada posisi menang dibanding kerugian pada posisi kalah"
                />
              </div>

              {/* Main Charts: Equity Curve, Drawdown & 6-Pillar Radar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Equity & Cumulative Growth Curve */}
                  <EquityChart
                    equityCurve={equityCurve}
                    settings={periodSettings}
                    startingBalance={periodStartingBalance}
                    height={340}
                    isPrivacyMode={isPrivacyMode}
                  />

                  {/* Drawdown Curve */}
                  <DrawdownChart
                    equityCurve={equityCurve}
                    settings={periodSettings}
                    height={200}
                    isPrivacyMode={isPrivacyMode}
                  />
                </div>

                {/* Right Column: 6-Indicator Radar Profile */}
                <div className="space-y-6">
                  <RadarChart indicators={radarIndicators} size={280} />
                </div>
              </div>

              {/* Daily & Monthly Performance Breakdown */}
              <PerformanceCalendar
                dailyPerformance={dailyPerformance}
                monthlyPerformance={monthlyPerformance}
                settings={periodSettings}
                isPrivacyMode={isPrivacyMode}
                trades={filteredTrades}
                onViewTrade={onViewTrade}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};
