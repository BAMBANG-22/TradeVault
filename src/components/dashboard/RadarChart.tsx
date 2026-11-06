/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RadarIndicators } from '../../utils/calculations';
import { HelpCircle, X, ShieldAlert } from 'lucide-react';

interface RadarChartProps {
  indicators: RadarIndicators;
  size?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ indicators, size = 290 }) => {
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  useEffect(() => {
    if (!showFormulaModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFormulaModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFormulaModal]);

  const axes = [
    {
      key: 'winRateScore',
      label: 'Win Rate',
      val: indicators.isDataSufficient ? indicators.winRateScore : 0,
      description: 'Persentase kemenangan transaksi (Target: > 50% = 65, >= 70% = 100)',
    },
    {
      key: 'profitFactorScore',
      label: 'Profit Factor',
      val: indicators.isDataSufficient ? indicators.profitFactorScore : 0,
      description: 'Rasio Gross Profit terhadap Gross Loss (Target: >= 1.5 = 70, >= 2.0 = 85, >= 3.0 / ∞ = 100)',
    },
    {
      key: 'rewardRiskScore',
      label: 'Avg RR',
      val: indicators.isDataSufficient ? indicators.rewardRiskScore : 0,
      description: 'Rata-rata Realized Risk/Reward aktual (Target: 0R = 50, +0.5R = 70, +1R = 85, >= +2R = 100)',
    },
    {
      key: 'expectancyScore',
      label: 'Expectancy',
      val: indicators.isDataSufficient ? indicators.expectancyScore : 0,
      description: 'Nilai harapan rata-rata keuntungan per transaksi (Target: Positif > 0, >= 1% modal = 100)',
    },
    {
      key: 'riskControlScore',
      label: 'Risk Control',
      val: indicators.isDataSufficient ? (indicators.riskControlScore ?? indicators.drawdownControlScore) : 0,
      description: 'Pengendalian risiko dan toleransi drawdown (Target: Max DD <= 2% = 100, <= 5% = 85, <= 10% = 70)',
    },
    {
      key: 'consistencyScore',
      label: 'Consistency',
      val: indicators.isDataSufficient ? indicators.consistencyScore : 0,
      description: 'Konsistensi performa harian dan rasio hari profit (Target: >= 60% hari profit = 80+)',
    },
  ];

  const center = size / 2;
  const radius = center - 54;
  const totalAxes = axes.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  // Grid concentric polygons (20%, 40%, 60%, 80%, 100%)
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];

  const getCoordinates = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Polygon points
  const polygonPoints = axes
    .map((axis, i) => {
      const coord = getCoordinates(axis.val, i);
      return `${coord.x},${coord.y}`;
    })
    .join(' ');

  return (
    <div className="relative w-full font-['Arial',Helvetica,sans-serif]">
      {/* Subtle Top Action for Methodology Info */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-[0.08em] text-[#697586] dark:text-[#7D8796]">
          6-Pillar Radar Geometry
        </span>
        <button
          type="button"
          onClick={() => setShowFormulaModal(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] bg-black/[0.03] dark:bg-white/[0.04] border border-[#DDE3EA] dark:border-white/[0.07] transition-colors cursor-pointer"
          title="Penjelasan formula & kriteria penilaian radar"
          aria-label="Penjelasan formula & kriteria penilaian radar"
        >
          <HelpCircle className="h-3 w-3 stroke-[1.75]" />
          <span>Metodologi</span>
        </button>
      </div>

      {/* Main Radar Presentation */}
      <div className="flex flex-col items-center justify-center relative w-full">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[280px] h-auto aspect-square select-none"
        >
          {/* Concentric grid rings */}
          {levels.map((level, lvlIdx) => {
            const ringPoints = axes
              .map((_, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const r = level * radius;
                return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
              })
              .join(' ');

            return (
              <polygon
                key={lvlIdx}
                points={ringPoints}
                fill="none"
                stroke="currentColor"
                className="text-[#DDE3EA] dark:text-[#1E242D]"
                strokeWidth="1"
                strokeDasharray={lvlIdx < 4 ? '2 2' : undefined}
              />
            );
          })}

          {/* Radial axis lines */}
          {axes.map((_, i) => {
            const coord = getCoordinates(100, i);
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={coord.x}
                y2={coord.y}
                stroke="currentColor"
                className="text-[#DDE3EA] dark:text-[#1E242D]"
                strokeWidth="1"
              />
            );
          })}

          {/* Filled polygon for trader performance (only if data is sufficient) */}
          {indicators.isDataSufficient ? (
            <polygon
              points={polygonPoints}
              fill="#3B82F6"
              fillOpacity="0.16"
              stroke="#3B82F6"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          ) : (
            <polygon
              points={polygonPoints}
              fill="currentColor"
              className="text-[#697586] dark:text-[#7D8796]"
              fillOpacity="0.06"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* Node dots and labels */}
          {axes.map((axis, i) => {
            const coord = getCoordinates(axis.val, i);
            const labelCoord = getCoordinates(121, i);

            return (
              <g key={i}>
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r="3"
                  fill={indicators.isDataSufficient ? '#3B82F6' : '#697586'}
                  stroke="currentColor"
                  className="text-white dark:text-[#0B0E11]"
                  strokeWidth="1.5"
                />
                <text
                  x={labelCoord.x}
                  y={labelCoord.y - 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-[#697586] dark:fill-[#8E98A8] text-[10px] font-medium"
                >
                  {axis.label}
                </text>
                <text
                  x={labelCoord.x}
                  y={labelCoord.y + 8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`tabular-nums text-[10px] font-bold ${
                    indicators.isDataSufficient
                      ? 'fill-[#151D2A] dark:fill-[#F2F5F9]'
                      : 'fill-[#697586] dark:fill-[#7D8796]'
                  }`}
                >
                  {indicators.isDataSufficient ? `${axis.val}` : '-'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Insufficient data notice (clean inline text, no bulky card) */}
        {!indicators.isDataSufficient && (
          <div className="mt-2 py-2 px-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-[#DDE3EA] dark:border-white/[0.06] text-center max-w-xs">
            <div className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-semibold">
              <ShieldAlert className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>Data Belum Cukup (Min. 3 Trade)</span>
            </div>
            <p className="text-[11px] text-[#697586] dark:text-[#8E98A8] mt-0.5 leading-relaxed">
              Dibutuhkan minimal 3 transaksi tertutup untuk menghitung profil 6 pilar secara objektif (saat ini:{' '}
              <strong className="text-[#151D2A] dark:text-[#F2F5F9] tabular-nums">{indicators.totalTrades || 0}</strong>).
            </p>
          </div>
        )}
      </div>

      {/* Formula & Scoring Criteria Modal */}
      {showFormulaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowFormulaModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-[#DDE3EA] dark:border-white/10 bg-white dark:bg-[#0D1014] p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-white/[0.07]">
              <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Metodologi &amp; Target 6 Pilar Performance Profile
              </h3>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="p-1 rounded-lg text-[#697586] dark:text-[#8E98A8] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
                aria-label="Tutup metodologi"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#151D2A] dark:text-[#F2F5F9]">
              <p className="text-[#697586] dark:text-[#8E98A8] leading-relaxed">
                Skala normalisasi skor 0–100 dirancang secara objektif berdasarkan standar evaluasi manajemen risiko prop-firm dan hedge fund profesional:
              </p>

              <div className="divide-y divide-[#DDE3EA] dark:divide-white/[0.06]">
                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>1. Win Rate (Tingkat Kemenangan)</span>
                    <span className="text-[#3B82F6] tabular-nums">Skala: 0 - 100</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Normalisasi persentase transaksi menang. Target: 50% = skor 65, sedangkan 70%+ = skor 100.
                  </p>
                </div>

                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>2. Profit Factor (Faktor Keuntungan)</span>
                    <span className="text-[#3B82F6] tabular-nums">Gross Profit / Gross Loss</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Target: 1.0 = skor 50 (breakeven), 1.5 = skor 70, 2.0 = skor 85, dan ≥ 3.0 atau nol loss (∞) = skor 100.
                  </p>
                </div>

                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>3. Average RR (Risk / Reward Aktual)</span>
                    <span className="text-[#3B82F6] tabular-nums">Rata-rata (Net Profit / Risiko)</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Rata-rata Realized Risk/Reward aktual dari seluruh transaksi tertutup: 0R = skor 50, +0.5R = skor 70, +1.0R = skor 85, ≥ +2.0R = skor 100.
                  </p>
                </div>

                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>4. Expectancy (Nilai Harapan per Trade)</span>
                    <span className="text-[#3B82F6] tabular-nums">Total Net PnL / Total Trades</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Rata-rata keuntungan bersih setiap posisi dieksekusi terhadap modal. Positif bernilai &gt; 50, mencapai 100 jika ≥ 1% modal.
                  </p>
                </div>

                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>5. Risk Control (Pengendalian Risiko)</span>
                    <span className="text-[#3B82F6] tabular-nums">Toleransi Max Drawdown</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Toleransi penurunan modal dari puncak ekuitas: Max DD ≤ 2% = 100, ≤ 5% = 85, ≤ 10% = 70, ≤ 20% = 40.
                  </p>
                </div>

                <div className="py-2.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>6. Consistency (Konsistensi Harian)</span>
                    <span className="text-[#3B82F6] tabular-nums">Rasio Hari Profit</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#8E98A8] text-[11px] mt-0.5">
                    Rasio hari trading profit dibanding total hari trading aktif: ≥ 60% hari profit = 80+, 50% = 65.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-1.5 rounded-full bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs transition-colors cursor-pointer"
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
