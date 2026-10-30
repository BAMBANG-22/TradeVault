/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  DailyPerformance,
  MonthlyPerformance,
  formatCurrency,
  resolveActiveCalendarMonth,
  formatLocalDateKey,
  computeTradeNetProfit,
  computeRealizedRMultiple,
  formatRMultiple,
  resolveTradeOutcome,
} from '../../utils/calculations';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import {
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  BarChart2,
  Minus,
  X,
  Eye,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

/**
 * Pure helper that filters and chronologically sorts trades matching a calendar date key ('YYYY-MM-DD').
 * Guaranteed not to mutate the input trades array and matches dailyPerformance grouping in calculations.ts.
 */
export const getTradesForCalendarDate = (
  trades: Trade[] | undefined | null,
  dateKey: string
): Trade[] => {
  if (!Array.isArray(trades) || !dateKey) return [];
  return trades
    .filter((t) => (t.dateTime || '').slice(0, 10) === dateKey)
    .slice()
    .sort((a, b) => {
      const timeDiff = new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      if (!Number.isNaN(timeDiff) && timeDiff !== 0) return timeDiff;
      return (a.id || '').localeCompare(b.id || '');
    });
};

interface PerformanceCalendarProps {
  dailyPerformance: DailyPerformance[];
  monthlyPerformance: MonthlyPerformance[];
  settings: AppSettings;
  isPrivacyMode?: boolean;
  trades?: Trade[];
  onViewTrade?: (trade: Trade) => void;
}

export const PerformanceCalendar: React.FC<PerformanceCalendarProps> = ({
  dailyPerformance,
  monthlyPerformance,
  settings,
  isPrivacyMode = false,
  trades = [],
  onViewTrade,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'calendar' | 'monthly'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Close daily trades modal on Escape key
  useEffect(() => {
    if (!selectedDate) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate]);

  // Summary statistics of daily performance
  const dailySummary = useMemo(() => {
    const totalDays = dailyPerformance.length;
    const profitDays = dailyPerformance.filter((d) => d.netProfit > 0).length;
    const lossDays = dailyPerformance.filter((d) => d.netProfit < 0).length;
    const breakevenDays = dailyPerformance.filter((d) => d.netProfit === 0).length;
    const dayWinRate = totalDays > 0 ? ((profitDays / totalDays) * 100).toFixed(1) : '0.0';

    return {
      totalDays,
      profitDays,
      lossDays,
      breakevenDays,
      dayWinRate,
    };
  }, [dailyPerformance]);

  // Calendar Grid Month Selector State
  const availableMonths = useMemo(() => {
    if (dailyPerformance.length === 0) {
      return [formatLocalDateKey(new Date()).slice(0, 7)];
    }
    const monthsSet = new Set<string>();
    dailyPerformance.forEach((d) => monthsSet.add(d.date.slice(0, 7)));
    return Array.from(monthsSet).sort();
  }, [dailyPerformance]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return resolveActiveCalendarMonth('', availableMonths);
  });

  useEffect(() => {
    const nextMonth = resolveActiveCalendarMonth(selectedMonth, availableMonths);
    if (nextMonth !== selectedMonth) {
      setSelectedMonth(nextMonth);
    }
  }, [availableMonths, selectedMonth]);

  const activeMonth = resolveActiveCalendarMonth(selectedMonth, availableMonths);

  const handlePrevMonth = () => {
    const idx = availableMonths.indexOf(activeMonth);
    if (idx > 0) {
      setSelectedMonth(availableMonths[idx - 1]);
    }
  };

  const handleNextMonth = () => {
    const idx = availableMonths.indexOf(activeMonth);
    if (idx >= 0 && idx < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[idx + 1]);
    }
  };

  // Build calendar matrix for activeMonth
  const calendarCells = useMemo(() => {
    const [yearStr, monthStr] = activeMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate();

    // In JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday.
    // Convert so Monday = 0, Sunday = 6
    const firstDayIndex = (firstDay.getDay() + 6) % 7;

    const cells: {
      dayNum: number | null;
      dateStr: string;
      perf: DailyPerformance | null;
    }[] = [];

    // Preceding empty padding
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ dayNum: null, dateStr: `empty-pre-${i}`, perf: null });
    }

    // Days in month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${yearStr}-${monthStr}-${dayStr}`;
      const foundPerf = dailyPerformance.find((d) => d.date === dateKey) || null;
      cells.push({ dayNum: day, dateStr: dateKey, perf: foundPerf });
    }

    return cells;
  }, [activeMonth, dailyPerformance]);

  const maxDailyProfit = Math.max(
    ...dailyPerformance.map((d) => Math.abs(d.netProfit)),
    100
  );

  // Selected date details for modal
  const selectedDayPerf = useMemo(() => {
    if (!selectedDate) return null;
    return dailyPerformance.find((d) => d.date === selectedDate) || null;
  }, [selectedDate, dailyPerformance]);

  const selectedDateTrades = useMemo(() => {
    if (!selectedDate) return [];
    return getTradesForCalendarDate(trades, selectedDate);
  }, [selectedDate, trades]);

  return (
    <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5 space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] p-2 text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34]">
            <CalendarIcon className="h-4 w-4 stroke-[1.75]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              {activeTab === 'calendar'
                ? 'Kalender Visual Performa Trading'
                : activeTab === 'daily'
                ? 'Daftar Hasil Harian'
                : 'Ringkasan Bulanan'}
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Distribusi hasil transaksi aktual berdasarkan tanggal penutupan (klik tanggal untuk rincian trade)
            </p>
          </div>
        </div>

        <div className="flex rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] text-xs select-none">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-[#1769E8] text-white'
                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Grid Kalender</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-[#1769E8] text-white'
                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
            }`}
          >
            <List className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Daftar Harian ({dailyPerformance.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'monthly'
                ? 'bg-[#1769E8] text-white'
                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>Bulanan ({monthlyPerformance.length})</span>
          </button>
        </div>
      </div>

      {/* Daily Performance Quick Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono-numbers tabular-nums">
        <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
          <span className="text-[#697586] dark:text-[#929BA9] font-sans text-[11px]">Hari Trading:</span>
          <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{dailySummary.totalDays} Hari</strong>
        </div>
        <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-emerald-700 dark:text-emerald-400">
          <span className="text-[#697586] dark:text-[#929BA9] font-sans text-[11px]">Hari Profit:</span>
          <strong>{dailySummary.profitDays} Hari</strong>
        </div>
        <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-rose-700 dark:text-rose-400">
          <span className="text-[#697586] dark:text-[#929BA9] font-sans text-[11px]">Hari Loss:</span>
          <strong>{dailySummary.lossDays} Hari</strong>
        </div>
        <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-[#151D2A] dark:text-[#F2F5F9]">
          <span className="text-[#697586] dark:text-[#929BA9] font-sans text-[11px]">Hari BE:</span>
          <strong>{dailySummary.breakevenDays} Hari</strong>
        </div>
        <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-[#151D2A] dark:text-[#F2F5F9]">
          <span className="text-[#697586] dark:text-[#929BA9] font-sans text-[11px]">Win Rate Hari:</span>
          <strong>{dailySummary.dayWinRate}%</strong>
        </div>
      </div>

      {/* TAB 1: CALENDAR HEATMAP GRID VIEW */}
      {activeTab === 'calendar' && (
        <div className="space-y-3">
          {/* Month Navigator Toolbar */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={availableMonths.indexOf(activeMonth) <= 0}
              className="p-1 rounded text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] disabled:opacity-30 cursor-pointer"
              title="Bulan sebelumnya"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="h-4 w-4 stroke-[1.75]" />
            </button>
            <div className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2 font-mono-numbers tabular-nums">
              <CalendarIcon className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>{activeMonth}</span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={availableMonths.indexOf(activeMonth) >= availableMonths.length - 1}
              className="p-1 rounded text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] disabled:opacity-30 cursor-pointer"
              title="Bulan berikutnya"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="h-4 w-4 stroke-[1.75]" />
            </button>
          </div>

          {/* Responsive Scroll Wrapper so 7-column cells never clip P/L values on narrow viewports */}
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[560px] sm:min-w-0 space-y-1.5">
              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-[#697586] dark:text-[#929BA9]">
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, i) => (
                  <div key={i} className="py-1.5 rounded bg-[#F5F7FA] dark:bg-[#171D26]">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Day Cells */}
              <div className="grid grid-cols-7 gap-1.5 select-none">
                {calendarCells.map((cell, idx) => {
                  if (cell.dayNum === null) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="min-h-[84px] sm:min-h-[90px] rounded-lg bg-[#F5F7FA]/50 dark:bg-[#080A0E]/50 border border-[#DDE3EA]/40 dark:border-[#252B34]/40 opacity-40"
                      />
                    );
                  }

                  const hasTrade = cell.perf !== null;
                  const isProfit = hasTrade && cell.perf!.netProfit > 0;
                  const isLoss = hasTrade && cell.perf!.netProfit < 0;
                  const isSelected = selectedDate === cell.dateStr;
                  const formattedCellPl = hasTrade
                    ? `${isProfit ? '+' : ''}${formatCurrency(cell.perf!.netProfit, settings, isPrivacyMode)}`
                    : '';

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateStr)}
                      aria-label={
                        hasTrade
                          ? `Tanggal ${cell.dateStr}, ${cell.perf!.tradesCount} transaksi, Net P/L ${formattedCellPl}, Win Rate ${cell.perf!.winRate}%`
                          : `Tanggal ${cell.dateStr}, tanpa transaksi`
                      }
                      className={`min-h-[84px] sm:min-h-[90px] p-2 sm:p-2.5 rounded-lg border transition-colors flex flex-col justify-between text-left w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1769E8] hover:border-[#1769E8] ${
                        isSelected
                          ? 'border-[#1769E8] bg-[#EEF2F6] dark:bg-[#171D26]'
                          : !hasTrade
                          ? 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]'
                          : 'bg-[#EEF2F6] dark:bg-[#171D26] border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full text-[11px]">
                        <span
                          className={`font-mono-numbers tabular-nums font-bold ${
                            hasTrade
                              ? 'text-[#151D2A] dark:text-[#F2F5F9]'
                              : 'text-[#697586] dark:text-[#929BA9]'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {hasTrade && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-white/80 dark:bg-[#11151B]/80 text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums leading-none">
                            {cell.perf!.tradesCount}T
                          </span>
                        )}
                      </div>

                      <div className="my-1 w-full text-center font-mono-numbers tabular-nums">
                        {!hasTrade ? (
                          <span className="text-[10px] text-[#697586]/60 dark:text-[#929BA9]/60 flex items-center justify-center">
                            <Minus className="h-2.5 w-2.5" />
                          </span>
                        ) : (
                          <div className="text-[11px] sm:text-xs font-bold leading-snug whitespace-nowrap">
                            <span
                              className={
                                isProfit
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isLoss
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-[#151D2A] dark:text-[#F2F5F9]'
                              }
                            >
                              {formattedCellPl}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="w-full text-[10px] text-[#697586] dark:text-[#929BA9] text-center font-mono-numbers tabular-nums leading-none min-h-[12px]">
                        {hasTrade ? `WR: ${cell.perf!.winRate}%` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Heatmap Legend */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#697586] dark:text-[#929BA9] border-t border-[#DDE3EA] dark:border-[#252B34]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+PnL</span>
                <span>Profit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-rose-600 dark:text-rose-400">-PnL</span>
                <span>Loss</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#697586] dark:text-[#929BA9]">0</span>
                <span>Breakeven</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#DDE3EA] dark:bg-[#252B34]" />
                <span>Tanpa Transaksi (Bukan Rugi)</span>
              </div>
            </div>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
              Klik tanggal mana pun untuk melihat daftar transaksi hari tersebut
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED DAILY LIST VIEW */}
      {activeTab === 'daily' && (
        <div className="space-y-3">
          {dailyPerformance.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#697586] dark:text-[#929BA9]">Belum ada catatan trade harian.</p>
          ) : (
            <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
              {dailyPerformance.slice().reverse().map((day) => {
                const isProfit = day.netProfit >= 0;
                const barWidth = Math.min(100, (Math.abs(day.netProfit) / maxDailyProfit) * 100);

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] transition-colors gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1769E8]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-1.5 rounded-md bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] ${
                          isProfit
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isProfit ? <TrendingUp className="h-4 w-4 stroke-[1.75]" /> : <TrendingDown className="h-4 w-4 stroke-[1.75]" />}
                      </div>
                      <div>
                        <div className="font-mono-numbers tabular-nums text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {day.date}
                        </div>
                        <div className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                          {day.tradesCount} Trade ({day.winningTrades}W - {day.losingTrades}L - {day.breakevenTrades}BE) • Win Rate: {day.winRate}%
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                      <div className="hidden md:block w-24 h-2 bg-[#DDE3EA] dark:bg-[#252B34] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <div className="font-mono-numbers tabular-nums text-sm font-bold text-right">
                        <span className={isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {isProfit ? '+' : ''}{formatCurrency(day.netProfit, settings, isPrivacyMode)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MONTHLY PERFORMANCE SUMMARY */}
      {activeTab === 'monthly' && (
        <div className="space-y-3">
          {monthlyPerformance.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#697586] dark:text-[#929BA9]">Belum ada data bulanan.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {monthlyPerformance.slice().reverse().map((m) => {
                const isProfit = m.netProfit >= 0;
                return (
                  <div
                    key={m.monthKey}
                    className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] transition-colors"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-xs">{m.label}</span>
                      <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">{m.tradesCount} Trade Selesai</span>
                    </div>

                    <div className="mt-2.5 space-y-1.5 font-mono-numbers tabular-nums text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#697586] dark:text-[#929BA9]">Net Profit:</span>
                        <span className={`font-bold ${isProfit ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {isProfit ? '+' : ''}{formatCurrency(m.netProfit, settings, isPrivacyMode)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#697586] dark:text-[#929BA9]">Return:</span>
                        <span
                          className={`font-semibold ${
                            settings.startingBalance <= 0
                              ? 'text-[#697586] dark:text-[#929BA9]'
                              : isProfit
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {settings.startingBalance <= 0
                            ? 'N/A'
                            : `${isProfit ? '+' : ''}${m.gainPercent}%`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#697586] dark:text-[#929BA9]">Win Rate:</span>
                        <span className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">{m.winRate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DAILY TRADE DETAILS MODAL (READ-ONLY) */}
      {selectedDate !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedDate(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-date-modal-title"
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
                  <CalendarIcon className="h-4 w-4 stroke-[1.75]" />
                </div>
                <div>
                  <h4
                    id="calendar-date-modal-title"
                    className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers tabular-nums"
                  >
                    Rincian Transaksi — {selectedDate}
                  </h4>
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                    {selectedDateTrades.length > 0
                      ? `${selectedDateTrades.length} transaksi tercatat pada tanggal ini`
                      : 'Tidak ada transaksi tercatat pada tanggal ini'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                aria-label="Tutup rincian tanggal"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            {/* Daily Summary Strip (when trades exist) */}
            {selectedDayPerf && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3 bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] text-xs font-mono-numbers tabular-nums">
                <div>
                  <span className="block text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">
                    Net P/L Harian
                  </span>
                  <strong
                    className={`text-sm font-bold ${
                      selectedDayPerf.netProfit > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : selectedDayPerf.netProfit < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[#151D2A] dark:text-[#F2F5F9]'
                    }`}
                  >
                    {selectedDayPerf.netProfit > 0 ? '+' : ''}
                    {formatCurrency(selectedDayPerf.netProfit, settings, isPrivacyMode)}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">
                    Jumlah Transaksi
                  </span>
                  <strong className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    {selectedDayPerf.tradesCount} Trade
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">
                    Distribusi Hasil
                  </span>
                  <strong className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    {selectedDayPerf.winningTrades}W / {selectedDayPerf.losingTrades}L / {selectedDayPerf.breakevenTrades}BE
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">
                    Win Rate Harian
                  </span>
                  <strong className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    {selectedDayPerf.winRate}%
                  </strong>
                </div>
              </div>
            )}

            {/* Modal Body: Trade List or Empty State */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {selectedDateTrades.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    Tidak ada aktivitas trading pada {selectedDate}
                  </p>
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Hari tanpa transaksi tidak memengaruhi perhitungan win rate maupun drawdown akun.
                  </p>
                </div>
              ) : (
                selectedDateTrades.map((trade) => {
                  const netPl = computeTradeNetProfit(trade);
                  const outcome = resolveTradeOutcome(trade);
                  const rMultiple = computeRealizedRMultiple(trade);
                  const timePart = (trade.dateTime || '').slice(11, 16) || '--:--';
                  const isBuy = trade.position === 'BUY';

                  return (
                    <div
                      key={trade.id}
                      className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-numbers tabular-nums font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                            {trade.instrument || 'XAUUSD'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono-numbers tabular-nums text-[11px] font-bold ${
                              isBuy
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isBuy ? (
                              <ArrowUpRight className="h-3 w-3 stroke-[2]" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 stroke-[2]" />
                            )}
                            {trade.position}
                          </span>
                          <span className="font-mono-numbers tabular-nums text-[11px] text-[#697586] dark:text-[#929BA9]">
                            {trade.lotSize} Lot
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                            <Clock className="h-3 w-3 stroke-[1.75]" />
                            {timePart}
                          </span>
                          <span className="text-[10px] font-mono-numbers tabular-nums px-1.5 py-0.5 rounded bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
                            {trade.id}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#697586] dark:text-[#929BA9]">
                          {trade.session && <span>Sesi: {trade.session}</span>}
                          {trade.strategy && (
                            <>
                              <span>•</span>
                              <span>Strategi: {trade.strategy}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="font-mono-numbers tabular-nums">
                            Realized R:{' '}
                            <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
                              {rMultiple !== null ? formatRMultiple(rMultiple, true) : 'N/A'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#DDE3EA] dark:border-[#252B34]">
                        <div className="text-left sm:text-right font-mono-numbers tabular-nums">
                          <div
                            className={`text-sm font-bold ${
                              netPl > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : netPl < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[#151D2A] dark:text-[#F2F5F9]'
                            }`}
                          >
                            {netPl > 0 ? '+' : ''}
                            {formatCurrency(netPl, settings, isPrivacyMode)}
                          </div>
                          <div className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                            Status: {outcome}
                          </div>
                        </div>

                        {onViewTrade && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(null);
                              onViewTrade(trade);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 stroke-[1.75] text-[#1769E8]" />
                            <span>Lihat Detail</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] flex items-center justify-between text-[11px] text-[#697586] dark:text-[#929BA9]">
              <span>Mode baca saja (Read-only)</span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9] font-medium text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

