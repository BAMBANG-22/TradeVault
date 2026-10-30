/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EquityPoint,
  formatCurrency,
  formatGrowthPercent,
  computeEquityChartSeries,
  computeEquityChartAxis,
} from '../../utils/calculations';
import { AppSettings } from '../../types/settings';
import { TrendingUp, Layers, Info } from 'lucide-react';

interface EquityChartProps {
  equityCurve: EquityPoint[];
  settings: AppSettings;
  startingBalance?: number;
  height?: number;
  isPrivacyMode?: boolean;
}

export const EquityChart: React.FC<EquityChartProps> = ({
  equityCurve,
  settings,
  startingBalance,
  height = 320,
  isPrivacyMode = false,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<EquityPoint | null>(null);
  const [viewMode, setViewMode] = useState<'equity' | 'growth'>('equity');
  const [showPeakLine, setShowPeakLine] = useState(true);

  const hasExecutedTrades = equityCurve && equityCurve.length > 1;

  if (!hasExecutedTrades) {
    return (
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="p-3 rounded-full bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] mb-3 border border-[#DDE3EA] dark:border-[#252B34]">
          <TrendingUp className="h-6 w-6 stroke-[1.75]" />
        </div>
        <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Kurva Ekuitas Belum Tersedia</h3>
        <p className="text-xs text-[#697586] dark:text-[#929BA9] max-w-sm mt-1">
          Tambahkan transaksi pada Trade Log atau sesuaikan filter periode untuk melihat kurva ekuitas dan pertumbuhan modal Anda.
        </p>
      </div>
    );
  }

  const padding = { top: 25, right: 30, bottom: 35, left: 65 };
  const width = 800; // SVG viewBox coordinate system
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Single authoritative series for Equity Curve & High Watermark (both nominal & growth %)
  const { chartStartingBalance, hasValidGrowth, values, peakValues } = computeEquityChartSeries(
    equityCurve,
    settings,
    viewMode,
    startingBalance
  );

  const { minValue, maxValue, tickValues } = computeEquityChartAxis(values, peakValues, viewMode);

  const getX = (index: number) => {
    if (equityCurve.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (equityCurve.length - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    const denom = maxValue - minValue || 1;
    return padding.top + innerHeight - ((val - minValue) / denom) * innerHeight;
  };

  // Generate path data
  const points = values.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
  }));

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Area under path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${
    padding.top + innerHeight
  } Z`;

  // Peak line path
  const peakPoints = peakValues.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
  }));
  const peakPathD = peakPoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Y-axis grid ticks (5 steps)
  const yTicks = tickValues.map((val) => {
    const yPos = getY(val);
    return {
      value: val,
      yPos,
      label:
        viewMode === 'equity'
          ? formatCurrency(val, settings, isPrivacyMode)
          : hasValidGrowth
          ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
          : 'N/A',
    };
  });

  return (
    <div className="relative rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5">
      {/* Chart header & controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] p-2 text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34]">
            <TrendingUp className="h-4 w-4 stroke-[1.75]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              {viewMode === 'equity' ? 'Equity Curve (Saldo Kumulatif)' : 'Growth Curve (Pertumbuhan Akun)'}
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
              {equityCurve.length - 1} trade dieksekusi • Saldo awal: {formatCurrency(chartStartingBalance, settings, isPrivacyMode)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] text-xs">
            <button
              onClick={() => setViewMode('equity')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === 'equity'
                  ? 'bg-[#1769E8] text-white'
                  : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
              }`}
            >
              Nominal ($)
            </button>
            <button
              onClick={() => setViewMode('growth')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMode === 'growth'
                  ? 'bg-[#1769E8] text-white'
                  : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
              }`}
            >
              Persen (%)
            </button>
          </div>

          <button
            onClick={() => setShowPeakLine(!showPeakLine)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              showPeakLine
                ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border-[#DDE3EA] dark:border-[#252B34]'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
            }`}
            title="Tampilkan / sembunyikan garis High Watermark (Puncak Saldo)"
          >
            <Layers className="h-3.5 w-3.5 stroke-[1.75]" />
            <span className="hidden sm:inline">High Watermark</span>
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative mt-3 w-full overflow-hidden select-none">
        {viewMode === 'growth' && !hasValidGrowth && (
          <div className="mb-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center justify-between gap-2">
            <span>
              Persentase pertumbuhan (<strong>N/A</strong>) tidak dapat dihitung karena saldo awal periode bernilai nol atau negatif ({formatCurrency(chartStartingBalance, settings, isPrivacyMode)}).
            </span>
            <button
              onClick={() => setViewMode('equity')}
              className="px-2 py-1 rounded bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-semibold shrink-0 cursor-pointer"
            >
              Lihat Nominal ($)
            </button>
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
        >
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1769E8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1769E8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines with light/dark adaptive color */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={tick.yPos}
                x2={width - padding.right}
                y2={tick.yPos}
                stroke="currentColor"
                className="text-[#DDE3EA] dark:text-[#252B34]"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={tick.yPos + 4}
                textAnchor="end"
                className="fill-[#697586] dark:fill-[#929BA9] font-mono-numbers tabular-nums text-[10px]"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Area under equity curve */}
          <path d={areaD} fill="url(#equityGradient)" />

          {/* High Watermark Peak line */}
          {showPeakLine && (
            <path
              d={peakPathD}
              fill="none"
              stroke="#697586"
              strokeWidth="1.25"
              strokeDasharray="4 4"
              opacity="0.65"
            />
          )}

          {/* Main Equity Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#1769E8"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Nodes */}
          {equityCurve.map((pt, idx) => {
            const cx = getX(idx);
            const cy = getY(values[idx]);
            const isHovered = hoveredPoint?.index === pt.index;

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
                className="cursor-pointer"
              >
                {/* Hit target */}
                <circle cx={cx} cy={cy} r="12" fill="transparent" />
                {/* Visible dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5.5 : idx === 0 || idx === equityCurve.length - 1 ? 3.5 : 2.5}
                  fill={isHovered ? '#1769E8' : pt.outcome === 'WIN' ? '#10B981' : pt.outcome === 'LOSS' ? '#F43F5E' : '#1769E8'}
                  stroke="currentColor"
                  className="text-white dark:text-[#11151B] transition-all duration-150"
                  strokeWidth="1.75"
                />
              </g>
            );
          })}

          {/* Hover Crosshair line */}
          {hoveredPoint && (
            <g>
              <line
                x1={getX(hoveredPoint.index)}
                y1={padding.top}
                x2={getX(hoveredPoint.index)}
                y2={padding.top + innerHeight}
                stroke="#1769E8"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.7"
              />
            </g>
          )}

          {/* X Axis labels */}
          {equityCurve.length > 0 && (
            <g>
              <text
                x={padding.left}
                y={padding.top + innerHeight + 20}
                className="fill-[#697586] dark:fill-[#929BA9] font-mono-numbers tabular-nums text-[10px]"
                textAnchor="start"
              >
                Trade #0 (Start)
              </text>
              <text
                x={width - padding.right}
                y={padding.top + innerHeight + 20}
                className="fill-[#697586] dark:fill-[#929BA9] font-mono-numbers tabular-nums text-[10px]"
                textAnchor="end"
              >
                Trade #{equityCurve.length - 1}
              </text>
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (() => {
          const hoveredGrowthPct =
            !hasValidGrowth
              ? 0
              : hoveredPoint.index === 0 && Math.abs(hoveredPoint.equity - chartStartingBalance) < 0.01
              ? 0
              : Number((((hoveredPoint.equity - chartStartingBalance) / chartStartingBalance) * 100).toFixed(2));
          const hoveredPeakPct =
            !hasValidGrowth
              ? 0
              : hoveredPoint.index === 0 && Math.abs(hoveredPoint.peak - chartStartingBalance) < 0.01
              ? 0
              : Number((((hoveredPoint.peak - chartStartingBalance) / chartStartingBalance) * 100).toFixed(2));

          return (
            <div className="absolute top-2 right-2 rounded-lg bg-white dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-3 shadow-lg text-xs pointer-events-none min-w-[195px]">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#DDE3EA] dark:border-[#252B34] mb-1.5">
                <span className="font-semibold text-[#1769E8]">
                  {hoveredPoint.index === 0 ? 'Modal Awal' : `Trade #${hoveredPoint.index} (${hoveredPoint.tradeId})`}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  {hoveredPoint.date.slice(0, 10)}
                </span>
              </div>
              <div className="space-y-1 font-mono-numbers tabular-nums">
                <div className="flex justify-between">
                  <span className="text-[#697586] dark:text-[#929BA9]">Saldo:</span>
                  <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                    {formatCurrency(hoveredPoint.equity, settings, isPrivacyMode)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#697586] dark:text-[#929BA9]">Pertumbuhan:</span>
                  <span
                    className={`font-semibold ${
                      !hasValidGrowth
                        ? 'text-[#697586] dark:text-[#929BA9]'
                        : hoveredGrowthPct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatGrowthPercent(hoveredGrowthPct, hasValidGrowth, 2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#697586] dark:text-[#929BA9]">High Watermark:</span>
                  <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {viewMode === 'growth'
                      ? formatGrowthPercent(hoveredPeakPct, hasValidGrowth, 2)
                      : formatCurrency(hoveredPoint.peak, settings, isPrivacyMode)}
                  </span>
                </div>
                {hoveredPoint.index > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#697586] dark:text-[#929BA9]">Net PnL:</span>
                      <span className={`font-semibold ${hoveredPoint.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {hoveredPoint.netProfit >= 0 ? '+' : ''}{formatCurrency(hoveredPoint.netProfit, settings, isPrivacyMode)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#697586] dark:text-[#929BA9]">Drawdown:</span>
                      <span className="text-rose-600 dark:text-rose-400">
                        -{hoveredPoint.drawdownPercent.toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend footer */}
      <div className="mt-3 pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex flex-wrap items-center justify-between gap-3 text-xs text-[#697586] dark:text-[#929BA9]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1769E8]" />
            <span>Ekuitas Terkini</span>
          </div>
          {showPeakLine && (
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 border-b-2 border-dashed border-[#697586]" />
              <span>High Watermark (Puncak)</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#697586] dark:text-[#929BA9]">
          <Info className="h-3 w-3 stroke-[1.75]" />
          <span>Arahkan kursor atau sentuh titik untuk melihat detail trade</span>
        </div>
      </div>
    </div>
  );
};
