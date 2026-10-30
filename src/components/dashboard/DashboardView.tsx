/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  calculatePerformance,
  formatCurrency,
  formatProfitFactor,
  formatGrowthPercent,
} from '../../utils/calculations';
import { StatCard } from './StatCard';
import { EquityChart } from './EquityChart';
import { RadarChart } from './RadarChart';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  ArrowRight,
  Plus,
  Calculator,
  Scale,
} from 'lucide-react';

interface DashboardViewProps {
  trades: Trade[];
  settings: AppSettings;
  onNavigate: (tab: string) => void;
  onAddTrade: () => void;
  onViewTrade: (trade: Trade) => void;
  onClearDemoTrades: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  trades,
  settings,
  onNavigate,
  onAddTrade,
  onViewTrade,
  onClearDemoTrades,
}) => {
  const { metrics, equityCurve, radarIndicators } = calculatePerformance(trades, settings);

  const recentTrades = [...trades]
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
    .slice(0, 5);

  const isNetProfitPositive = metrics.totalNetProfit >= 0;
  const hasDemoTrades = trades.some((t) => t.isDemo);

  return (
    <div className="space-y-6">
      {/* Demo notice banner if demo trades are present */}
      {hasDemoTrades && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-bold bg-[#F5F7FA] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] text-[10px]">
              DATA DEMO AKTIF
            </span>
            <span className="text-[#697586] dark:text-[#929BA9]">
              Aplikasi ini sedang menampilkan data contoh transaksi XAUUSD untuk tujuan pengujian metrik.
            </span>
          </div>
          <button
            onClick={onClearDemoTrades}
            className="px-3 py-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold text-xs transition-colors shrink-0 cursor-pointer"
          >
            Hapus Data Demo
          </button>
        </div>
      )}

      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
            Trading Analytics Dashboard
          </h1>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1 font-mono-numbers tabular-nums">
            Ringkasan performa XAUUSD • Modal Awal: {formatCurrency(settings.startingBalance, settings)}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('risk')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors cursor-pointer"
          >
            <Calculator className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <span>Kalkulator Lot</span>
          </button>

          <button
            onClick={onAddTrade}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[2]" />
            <span>Catat Trade Baru</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          title="Saldo Berjalan (Ekuitas)"
          value={formatCurrency(metrics.currentEquity, settings)}
          subtitle={`Modal Awal: ${formatCurrency(metrics.startingBalance, settings)}`}
          icon={DollarSign}
          trend={metrics.currentEquity >= metrics.startingBalance ? 'up' : 'down'}
          trendValue={formatGrowthPercent(metrics.totalGainPercent, metrics.hasValidGrowthPercent, 2)}
        />

        <StatCard
          title="Total Net Profit"
          value={formatCurrency(metrics.totalNetProfit, settings)}
          subtitle={`Dari ${metrics.totalTrades} trade dieksekusi`}
          icon={TrendingUp}
          trend={isNetProfitPositive ? 'up' : 'down'}
          trendValue={`${isNetProfitPositive ? '+' : ''}${formatCurrency(metrics.totalNetProfit, settings)}`}
        />

        <StatCard
          title="Win Rate"
          value={`${metrics.winRate}%`}
          subtitle={`${metrics.winningTrades} Menang • ${metrics.losingTrades} Kalah`}
          icon={PieChart}
          trend={metrics.winRate >= 50 ? 'up' : 'down'}
          trendValue={`${metrics.winRate}%`}
        />

        <StatCard
          title="Profit Factor"
          value={formatProfitFactor(metrics.profitFactor, metrics.isProfitFactorInfinite)}
          subtitle={`Max DD: -${metrics.maxDrawdownPercent.toFixed(2)}%`}
          icon={Scale}
          trend={metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite ? 'up' : 'neutral'}
          trendValue={metrics.profitFactor >= 1.5 || metrics.isProfitFactorInfinite ? 'Profitabel' : 'Evaluasi'}
        />
      </div>

      {/* Main Row: Equity Chart & Radar Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EquityChart equityCurve={equityCurve} settings={settings} height={340} />
        </div>
        <div>
          <RadarChart indicators={radarIndicators} size={280} />
        </div>
      </div>

      {/* Recent Trades Table Preview */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Riwayat Transaksi Terakhir</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">5 trade terbaru yang tercatat dalam jurnal</p>
          </div>
          <button
            onClick={() => onNavigate('trades')}
            className="flex items-center gap-1 text-xs font-semibold text-[#1769E8] hover:underline cursor-pointer"
          >
            <span>Buka Trade Log Lengkap</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </div>

        {recentTrades.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#697586] dark:text-[#929BA9]">
            Belum ada trade yang dicatat. Klik tombol "Catat Trade Baru" di atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums">
              <thead className="bg-[#F5F7FA] dark:bg-[#080A0E] text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] border-b border-[#DDE3EA] dark:border-[#252B34]">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Posisi &amp; Pair</th>
                  <th className="py-2.5 px-3 font-sans">Setup</th>
                  <th className="py-2.5 px-3">Entry / SL</th>
                  <th className="py-2.5 px-3">Lot</th>
                  <th className="py-2.5 px-3 text-center">Hasil</th>
                  <th className="py-2.5 px-3 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
                {recentTrades.map((t) => {
                  const isWin = t.outcome === 'WIN';
                  const isLoss = t.outcome === 'LOSS';

                  return (
                    <tr
                      key={t.id}
                      onClick={() => onViewTrade(t)}
                      className="hover:bg-[#EEF2F6]/60 dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 text-[#697586] dark:text-[#929BA9]">
                        {t.dateTime.slice(0, 10)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[11px] font-bold ${
                            t.position === 'BUY'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {t.position}
                        </span>{' '}
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {t.instrument}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[#151D2A] dark:text-[#F2F5F9]">
                        {t.strategy}
                      </td>
                      <td className="py-2.5 px-3 text-[#151D2A] dark:text-[#F2F5F9]">
                        ${t.entryPrice.toFixed(2)} /{' '}
                        <span className="text-rose-600 dark:text-rose-400">
                          {t.stopLoss !== undefined && t.stopLoss !== null ? `$${t.stopLoss.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">{t.lotSize.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[11px] font-bold ${
                            isWin
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isLoss
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {t.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`font-bold ${
                            isWin ? 'text-emerald-600 dark:text-emerald-400' : isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {isWin ? '+' : ''}{formatCurrency(t.netProfit, settings)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
