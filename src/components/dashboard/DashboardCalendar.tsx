import React, { useState, useMemo } from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  computeTradeNetProfit,
  resolveTradeOutcome,
  formatCurrency,
  extractTradeLocalDateKey,
  isClosedLifecycleTrade,
  formatCalendarAdaptivePnl,
} from '../../utils/calculations';
import { ChevronLeft, ChevronRight, X, ArrowUpRight } from 'lucide-react';

interface DashboardCalendarProps {
  trades: Trade[];
  settings: AppSettings;
  isPrivacyMode?: boolean;
  onViewTrade?: (trade: Trade) => void;
}

const DAYS_OF_WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export const DashboardCalendar: React.FC<DashboardCalendarProps> = ({
  trades,
  settings,
  isPrivacyMode = false,
  onViewTrade,
}) => {
  // Strictly filter only closed trades with realized outcome (exclude PLANNED, OPEN, CANCELLED)
  const closedTrades = useMemo(() => {
    return (trades || []).filter((t) => {
      if (!isClosedLifecycleTrade(t)) return false;
      const outcome = resolveTradeOutcome(t);
      return outcome === 'WIN' || outcome === 'LOSS' || outcome === 'BREAKEVEN';
    });
  }, [trades]);

  // Determine initial active month from latest closed trade or current local month
  const initialMonthKey = useMemo(() => {
    if (closedTrades.length > 0) {
      const sortedDates = [...closedTrades]
        .map((t) => extractTradeLocalDateKey(t.dateTime))
        .filter(Boolean)
        .sort();
      if (sortedDates.length > 0) {
        return sortedDates[sortedDates.length - 1].slice(0, 7);
      }
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [closedTrades]);

  const [activeMonth, setActiveMonth] = useState<string>(initialMonthKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Today local date key (YYYY-MM-DD)
  const todayDateKey = useMemo(() => {
    return extractTradeLocalDateKey(new Date().toISOString());
  }, []);

  // Parse active year and month
  const { year, month } = useMemo(() => {
    const [yStr, mStr] = activeMonth.split('-');
    return {
      year: parseInt(yStr, 10) || new Date().getFullYear(),
      month: parseInt(mStr, 10) || new Date().getMonth() + 1,
    };
  }, [activeMonth]);

  const monthLabel = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }, [year, month]);

  const handlePrevMonth = () => {
    const prevDate = new Date(year, month - 2, 1);
    const y = prevDate.getFullYear();
    const m = String(prevDate.getMonth() + 1).padStart(2, '0');
    setActiveMonth(`${y}-${m}`);
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(year, month, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    setActiveMonth(`${y}-${m}`);
    setSelectedDate(null);
  };

  // Group closed trades by local date key 'YYYY-MM-DD'
  const tradesByDateMap = useMemo(() => {
    const map = new Map<string, Trade[]>();
    closedTrades.forEach((t) => {
      const dateKey = extractTradeLocalDateKey(t.dateTime);
      if (dateKey) {
        const list = map.get(dateKey) || [];
        list.push(t);
        map.set(dateKey, list);
      }
    });
    return map;
  }, [closedTrades]);

  // Build calendar matrix for activeMonth
  const { cells, summary } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();

    // Monday-based index: 0 = Mon, 6 = Sun
    const firstDayIndex = (firstDay.getDay() + 6) % 7;

    const cellList: {
      dayNum: number | null;
      dateKey: string;
      netProfit: number;
      tradesCount: number;
      status: 'PROFIT' | 'LOSS' | 'BREAKEVEN' | 'NO_TRADE';
    }[] = [];

    // Preceding empty cells
    for (let i = 0; i < firstDayIndex; i++) {
      cellList.push({
        dayNum: null,
        dateKey: `pre-${i}`,
        netProfit: 0,
        tradesCount: 0,
        status: 'NO_TRADE',
      });
    }

    let profitDays = 0;
    let lossDays = 0;
    let noTradeDays = 0;

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;
      const dayTrades = tradesByDateMap.get(dateKey) || [];

      if (dayTrades.length > 0) {
        const netProfit = dayTrades.reduce((sum, t) => sum + computeTradeNetProfit(t), 0);
        const roundedNet = Number(netProfit.toFixed(2));
        if (roundedNet > 0) {
          profitDays++;
          cellList.push({
            dayNum: day,
            dateKey,
            netProfit: roundedNet,
            tradesCount: dayTrades.length,
            status: 'PROFIT',
          });
        } else if (roundedNet < 0) {
          lossDays++;
          cellList.push({
            dayNum: day,
            dateKey,
            netProfit: roundedNet,
            tradesCount: dayTrades.length,
            status: 'LOSS',
          });
        } else {
          // Breakeven day
          cellList.push({
            dayNum: day,
            dateKey,
            netProfit: 0,
            tradesCount: dayTrades.length,
            status: 'BREAKEVEN',
          });
        }
      } else {
        noTradeDays++;
        cellList.push({
          dayNum: day,
          dateKey,
          netProfit: 0,
          tradesCount: 0,
          status: 'NO_TRADE',
        });
      }
    }

    return {
      cells: cellList,
      summary: {
        profitDays,
        lossDays,
        noTradeDays,
        totalActiveDays: profitDays + lossDays,
      },
    };
  }, [year, month, tradesByDateMap]);

  // Selected date trades
  const selectedTrades = useMemo(() => {
    if (!selectedDate) return [];
    return tradesByDateMap.get(selectedDate) || [];
  }, [selectedDate, tradesByDateMap]);

  const selectedDateNetProfit = useMemo(() => {
    return selectedTrades.reduce((sum, t) => sum + computeTradeNetProfit(t), 0);
  }, [selectedTrades]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const d = new Date(selectedDate + 'T00:00:00');
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  return (
    <section
      aria-label="Performance Calendar"
      className="rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5 md:p-6 space-y-4 transition-colors duration-150"
    >
      {/* Section Header: Text Only Title + Month Navigation */}
      <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9]">
          PERFORMANCE CALENDAR
        </h2>

        {/* Minimal Month Navigator */}
        <div className="flex items-center gap-1.5 font-sans">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
            title="Bulan Sebelumnya"
            aria-label="Bulan Sebelumnya"
          >
            <ChevronLeft className="h-4 w-4 stroke-[2]" />
          </button>
          <span className="text-xs font-semibold capitalize text-[#151D2A] dark:text-[#F2F5F9] min-w-[110px] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
            title="Bulan Berikutnya"
            aria-label="Bulan Berikutnya"
          >
            <ChevronRight className="h-4 w-4 stroke-[2]" />
          </button>
        </div>
      </div>

      {/* Summary Stats Row (Profit Days, Loss Days, No Trade) */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono-numbers tabular-nums">
        <div className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
          <div className="text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">Profit Days</div>
          <div className="text-sm font-bold text-[#059669] dark:text-[#34D399] mt-0.5">
            {summary.profitDays} Hari
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
          <div className="text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">Loss Days</div>
          <div className="text-sm font-bold text-[#E11D48] dark:text-[#FB7185] mt-0.5">
            {summary.lossDays} Hari
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
          <div className="text-[10px] font-sans text-[#697586] dark:text-[#929BA9]">No Trade</div>
          <div className="text-sm font-bold text-[#697586] dark:text-[#929BA9] mt-0.5">
            {summary.noTradeDays} Hari
          </div>
        </div>
      </div>

      {/* Calendar Grid Header (Days of week) */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#697586] dark:text-[#929BA9]">
        {DAYS_OF_WEEK.map((dayName) => (
          <div key={dayName} className="py-1">
            {dayName}
          </div>
        ))}
      </div>

      {/* Calendar Matrix Cells (Enlarged with consistent vertical height, NO background green/red framing) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 font-mono-numbers tabular-nums">
        {cells.map((cell) => {
          if (cell.dayNum === null) {
            return (
              <div
                key={cell.dateKey}
                className="w-full min-h-[68px] sm:min-h-[76px] md:min-h-[82px] rounded-xl border border-transparent"
              />
            );
          }

          const isSelected = selectedDate === cell.dateKey;
          const isToday = todayDateKey === cell.dateKey;
          const isProfit = cell.status === 'PROFIT';
          const isLoss = cell.status === 'LOSS';

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => setSelectedDate(isSelected ? null : cell.dateKey)}
              className={`w-full min-h-[68px] sm:min-h-[76px] md:min-h-[82px] rounded-xl border p-1 sm:p-1.5 flex flex-col justify-between items-center text-center transition-all cursor-pointer relative bg-[#F5F7FA] dark:bg-[#080A0E] ${
                isSelected
                  ? 'ring-2 ring-[#1769E8] border-[#1769E8] shadow-sm z-10'
                  : isToday
                  ? 'border-[#58A6FF] dark:border-[#1769E8] hover:border-[#697586]'
                  : 'border-[#DDE3EA] dark:border-[#252B34] hover:border-[#697586] dark:hover:border-[#484F58]'
              }`}
              title={`${cell.dateKey}${cell.tradesCount > 0 ? `: ${cell.tradesCount} Closed Trades` : ''}`}
            >
              {/* 1. Angka Tanggal (Top, secondary color, highlight if today) */}
              <span
                className={`text-[11px] sm:text-xs leading-none font-semibold ${
                  isToday
                    ? 'text-[#1769E8] dark:text-[#58A6FF] font-bold'
                    : 'text-[#697586] dark:text-[#929BA9]'
                }`}
              >
                {cell.dayNum}
              </span>

              {/* 2. Nominal Net Profit/Loss (Middle, strictly one line, soft colors, zero background box) */}
              {cell.tradesCount > 0 ? (
                <div className="w-full my-auto flex flex-col items-center justify-center px-0.5">
                  <span
                    className={`block text-[10px] sm:text-[11px] md:text-xs font-bold leading-tight font-mono-numbers tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${
                      isProfit
                        ? 'text-[#059669] dark:text-[#34D399]'
                        : isLoss
                        ? 'text-[#E11D48] dark:text-[#FB7185]'
                        : 'text-[#697586] dark:text-[#929BA9]'
                    }`}
                  >
                    {/* Compact format on narrow mobile; adaptive format on sm/desktop */}
                    <span className="sm:hidden">
                      {formatCalendarAdaptivePnl(cell.netProfit, settings, isPrivacyMode, 'compact')}
                    </span>
                    <span className="hidden sm:inline">
                      {formatCalendarAdaptivePnl(cell.netProfit, settings, isPrivacyMode, 'adaptive')}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {/* 3. Jumlah Closed Trades (Bottom, e.g. 2T, neutral/gray text) */}
              {cell.tradesCount > 0 ? (
                <span className="text-[9px] sm:text-[10px] font-medium leading-none text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                  {cell.tradesCount}T
                </span>
              ) : (
                <span className="h-2.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Date Detail Panel (Clean, non-modal, accurate data, full nominals) */}
      {selectedDate && (
        <div className="mt-4 p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-3 animate-in fade-in duration-150">
          {/* Header Section: Date, Net P&L full value, Closed Trades count */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {selectedDateLabel}
              </div>
              <div className="text-xs font-medium text-[#697586] dark:text-[#929BA9]">
                {selectedTrades.length}{' '}
                {selectedTrades.length === 1 ? 'Closed Trade' : 'Closed Trades'}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedTrades.length > 0 && (
                <span
                  className={`text-base font-bold font-mono-numbers tabular-nums ${
                    selectedDateNetProfit > 0
                      ? 'text-[#059669] dark:text-[#34D399]'
                      : selectedDateNetProfit < 0
                      ? 'text-[#E11D48] dark:text-[#FB7185]'
                      : 'text-[#697586] dark:text-[#929BA9]'
                  }`}
                >
                  {formatCalendarAdaptivePnl(selectedDateNetProfit, settings, isPrivacyMode, 'full')}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-1 rounded-md text-[#697586] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
                title="Tutup Rincian"
                aria-label="Tutup Rincian"
              >
                <X className="h-4 w-4 stroke-[2]" />
              </button>
            </div>
          </div>

          {/* Trades List */}
          {selectedTrades.length === 0 ? (
            <div className="text-xs text-[#697586] dark:text-[#929BA9] py-1">
              Tidak ada transaksi Closed yang tercatat pada tanggal ini.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {selectedTrades.map((t, idx) => {
                const pnl = computeTradeNetProfit(t);
                const isBuy = t.position === 'BUY';
                const isWin = pnl > 0;
                const isLoss = pnl < 0;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onViewTrade?.(t)}
                    className="w-full p-2.5 rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] transition-colors flex items-center justify-between text-left cursor-pointer text-xs font-mono-numbers tabular-nums"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="font-semibold text-[#697586] dark:text-[#929BA9]">
                        Trade {idx + 1}
                      </span>
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                        {t.instrument}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          isBuy
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : 'text-[#E11D48] dark:text-[#FB7185]'
                        }`}
                      >
                        {t.position}
                      </span>
                      <span className="text-[#697586] dark:text-[#929BA9] hidden sm:inline">
                        {Number(t.lotSize || 0).toFixed(2)} Lot
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          isWin
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : isLoss
                            ? 'text-[#E11D48] dark:text-[#FB7185]'
                            : 'text-[#697586] dark:text-[#929BA9]'
                        }`}
                      >
                        {formatCalendarAdaptivePnl(pnl, settings, isPrivacyMode, 'full')}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-[#697586]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
