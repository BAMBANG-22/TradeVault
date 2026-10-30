/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EquityPoint, formatCurrency } from '../../utils/calculations';
import { AppSettings } from '../../types/settings';
import { ShieldAlert } from 'lucide-react';

interface DrawdownChartProps {
  equityCurve: EquityPoint[];
  settings: AppSettings;
  height?: number;
  isPrivacyMode?: boolean;
}

export const DrawdownChart: React.FC<DrawdownChartProps> = ({
  equityCurve,
  settings,
  height = 200,
  isPrivacyMode = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const hasExecutedTrades = equityCurve && equityCurve.length > 1;
  const hasCriticalDrawdown = equityCurve.some(
    (pt) => pt.equity <= 0 || pt.drawdownPercent >= 100
  );

  if (!hasExecutedTrades) {
    return (
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 flex flex-col items-center justify-center min-h-[160px] text-center">
        <div className="p-2.5 rounded-full bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] mb-2 border border-[#DDE3EA] dark:border-[#252B34]">
          <ShieldAlert className="h-5 w-5 stroke-[1.75]" />
        </div>
        <h3 className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Kurva Drawdown Belum Ada</h3>
        <p className="text-[11px] text-[#697586] dark:text-[#929BA9] max-w-xs mt-1">
          Penurunan saldo dari puncak tertinggi akan divisualisasikan secara dinamis begitu transaksi tersedia.
        </p>
      </div>
    );
  }

  const padding = { top: 20, right: 30, bottom: 25, left: 60 };
  const width = 800;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Max drawdown observed
  const maxDdPercent = Math.max(...equityCurve.map((pt) => pt.drawdownPercent), 1);
  const yMax = Math.ceil(maxDdPercent * 1.25); // round up scale

  const getX = (idx: number) => {
    if (equityCurve.length <= 1) return padding.left + innerWidth / 2;
    return padding.left + (idx / (equityCurve.length - 1)) * innerWidth;
  };

  // Drawdown 0% is at top (padding.top), higher drawdown goes down
  const getY = (ddPercent: number) => {
    return padding.top + (ddPercent / yMax) * innerHeight;
  };

  const points = equityCurve.map((pt, idx) => ({
    x: getX(idx),
    y: getY(pt.drawdownPercent),
    pt,
  }));

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top} L ${points[0].x} ${padding.top} Z`;

  const hoveredItem = hoveredIndex !== null ? equityCurve[hoveredIndex] : null;

  return (
    <div className="relative rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] p-2 text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34]">
            <ShieldAlert className="h-4 w-4 stroke-[1.75]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Drawdown Curve (Penurunan dari Puncak)</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Maksimum Drawdown: <span className="font-mono-numbers tabular-nums text-rose-600 dark:text-rose-400 font-semibold">-{maxDdPercent.toFixed(2)}%</span>
            </p>
          </div>
        </div>

        {hasCriticalDrawdown && (
          <div className="px-2.5 py-1 rounded-md bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 stroke-[1.75] text-rose-600 dark:text-rose-400" />
            <span>Peringatan: Saldo mencapai batas kritis / nol</span>
          </div>
        )}
      </div>

      <div className="relative mt-2 w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          style={{ maxHeight: `${height}px` }}
        >
          <defs>
            <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.5, 1].map((ratio, i) => {
            const val = yMax * ratio;
            const yPos = getY(val);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={yPos}
                  x2={width - padding.right}
                  y2={yPos}
                  stroke="currentColor"
                  className="text-[#DDE3EA] dark:text-[#252B34]"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  className="fill-[#697586] dark:fill-[#929BA9] font-mono-numbers tabular-nums text-[10px]"
                >
                  -{val.toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Area */}
          <path d={areaD} fill="url(#drawdownGrad)" />

          {/* Top 0% baseline */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={width - padding.right}
            y2={padding.top}
            stroke="currentColor"
            strokeWidth="1.25"
            className="text-[#DDE3EA] dark:text-[#252B34]"
          />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#F43F5E"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive nodes */}
          {points.map((p, idx) => (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === idx ? 5 : 2.5}
                fill="#F43F5E"
                stroke="currentColor"
                className="text-white dark:text-[#11151B]"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>

        {hoveredItem && (
          <div className="absolute top-2 right-2 rounded-lg bg-white dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 shadow-lg text-xs font-mono-numbers tabular-nums">
            <div className="text-[#697586] dark:text-[#929BA9] text-[10px] pb-1 border-b border-[#DDE3EA] dark:border-[#252B34]">
              Trade #{hoveredItem.index} • {hoveredItem.date.slice(0, 10)}
            </div>
            <div className="text-rose-600 dark:text-rose-400 font-semibold pt-1">
              Drawdown: -{hoveredItem.drawdownPercent.toFixed(2)}% ({formatCurrency(hoveredItem.drawdownAmount, settings, isPrivacyMode)})
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
