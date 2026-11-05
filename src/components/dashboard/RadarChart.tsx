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

export const RadarChart: React.FC<RadarChartProps> = ({ indicators, size = 320 }) => {
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
  const radius = center - 56;
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

  // Calculate average overall score (only if data is sufficient)
  const overallScore = indicators.isDataSufficient
    ? Math.round(axes.reduce((sum, a) => sum + a.val, 0) / axes.length)
    : 0;

  return (
    <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-5 relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">6 Pillars Radar</h3>
          <p className="text-xs text-[#697586] dark:text-[#929BA9]">Skor holistik kualitas &amp; konsistensi sistem trading</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowFormulaModal(true)}
            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8] transition-colors cursor-pointer"
            title="Penjelasan formula & kriteria penilaian radar"
            aria-label="Penjelasan formula & kriteria penilaian radar"
          >
            <HelpCircle className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>

          <div className="px-2.5 py-1 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-mono-numbers tabular-nums font-bold">
            <span>
              {indicators.isDataSufficient ? `${overallScore}/100` : 'Data Belum Cukup'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Radar Presentation */}
      <div className="mt-4 flex flex-col items-center justify-center relative w-full">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[320px] h-auto aspect-square select-none"
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
                className="text-[#DDE3EA] dark:text-[#252B34]"
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
                className="text-[#DDE3EA] dark:text-[#252B34]"
                strokeWidth="1"
              />
            );
          })}

          {/* Filled polygon for trader performance (only if data is sufficient) */}
          {indicators.isDataSufficient ? (
            <polygon
              points={polygonPoints}
              fill="#1769E8"
              fillOpacity="0.16"
              stroke="#1769E8"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ) : (
            <polygon
              points={polygonPoints}
              fill="currentColor"
              className="text-[#697586] dark:text-[#929BA9]"
              fillOpacity="0.08"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* Node dots and labels */}
          {axes.map((axis, i) => {
            const coord = getCoordinates(axis.val, i);
            const labelCoord = getCoordinates(120, i);

            return (
              <g key={i}>
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r="3.5"
                  fill={indicators.isDataSufficient ? '#1769E8' : '#697586'}
                  stroke="currentColor"
                  className="text-white dark:text-[#11151B]"
                  strokeWidth="1.75"
                />
                <text
                  x={labelCoord.x}
                  y={labelCoord.y - 3}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-[#697586] dark:fill-[#929BA9] text-[10px] font-semibold"
                >
                  {axis.label}
                </text>
                <text
                  x={labelCoord.x}
                  y={labelCoord.y + 9}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`font-mono-numbers tabular-nums text-[10px] font-bold ${
                    indicators.isDataSufficient ? 'fill-[#151D2A] dark:fill-[#F2F5F9]' : 'fill-[#697586] dark:fill-[#929BA9]'
                  }`}
                >
                  {indicators.isDataSufficient ? `${axis.val}%` : '-'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Insufficient data badge overlay */}
        {!indicators.isDataSufficient && (
          <div className="mt-3 p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-center max-w-xs">
            <div className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              <ShieldAlert className="h-4 w-4 stroke-[1.75]" />
              <span>Data Belum Cukup (Min. 3 Trade)</span>
            </div>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1 leading-relaxed">
              Dibutuhkan minimal 3 transaksi selesai untuk menghitung 6 pilar performa trading secara andal (saat ini:{' '}
              <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{indicators.totalTrades || 0}</strong> transaksi). Kami tidak menampilkan skor 100 palsu.
            </p>
          </div>
        )}

        {/* Legend / Insight pills */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 w-full pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] text-xs">
          {axes.map((axis, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]"
              title={axis.description}
            >
              <span className="text-[#697586] dark:text-[#929BA9] pr-1">{axis.label}</span>
              <span
                className={`font-mono-numbers tabular-nums font-semibold ${
                  !indicators.isDataSufficient
                    ? 'text-[#697586] dark:text-[#929BA9]'
                    : axis.val >= 70
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : axis.val >= 50
                    ? 'text-[#151D2A] dark:text-[#F2F5F9]'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {indicators.isDataSufficient ? axis.val : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Formula & Scoring Criteria Modal */}
      {showFormulaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowFormulaModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 shadow-2xl space-y-4 max-h-[90vh] max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Metodologi &amp; Target 6 Pilar Performance Profile
              </h3>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="p-1 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                aria-label="Tutup metodologi"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#151D2A] dark:text-[#F2F5F9]">
              <p className="text-[#697586] dark:text-[#929BA9] leading-relaxed">
                Skala normalisasi skor 0–100 dirancang secara adil dan objektif berdasarkan standar evaluasi manajemen risiko prop-firm dan hedge fund profesional:
              </p>

              <div className="space-y-2.5">
                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>1. Win Rate (Tingkat Kemenangan)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Skala: 0 - 100</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Normalisasi persentase transaksi menang. Target: 50% menghasilkan skor 65, sedangkan 70%+ menghasilkan skor sempurna 100.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>2. Profit Factor (Faktor Keuntungan)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Gross Profit / Gross Loss</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Target: 1.0 = skor 50 (breakeven), 1.5 = skor 70, 2.0 = skor 85, dan ≥ 3.0 atau nol loss (∞) = skor 100.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>3. Average RR (Risk / Reward Aktual)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Rata-rata (Net Profit / Risiko)</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Rata-rata Realized Risk/Reward aktual dari seluruh transaksi tertutup yang memiliki data risiko valid: 0R = skor 50, +0.5R = skor 70, +1.0R = skor 85, dan ≥ +2.0R = skor 100.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>4. Expectancy (Nilai Harapan per Trade)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Total Net PnL / Total Trades</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Mengukur rata-rata keuntungan bersih setiap posisi dieksekusi terhadap modal. Expectancy positif bernilai &gt; 50, dan mencapai 100 jika rata-rata trade menghasilkan keuntungan ≥ 1% modal.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>5. Risk Control (Pengendalian Risiko)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Toleransi Max Drawdown</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Toleransi penurunan modal dari puncak ekuitas: Max DD ≤ 2% = 100, ≤ 5% = 85, ≤ 10% = 70, ≤ 20% = 40, dan &gt; 35% = 0.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  <div className="flex items-center justify-between font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    <span>6. Consistency (Konsistensi Harian)</span>
                    <span className="text-[#1769E8] font-mono-numbers">Rasio Hari Profit</span>
                  </div>
                  <p className="text-[#697586] dark:text-[#929BA9] text-[11px] mt-1">
                    Mengukur rasio hari trading yang menghasilkan keuntungan bersih dibanding total hari trading aktif: ≥ 60% hari profit = 80+, 50% = 65.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
