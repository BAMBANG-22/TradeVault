import React, { useState, useEffect } from 'react';
import { runFinancialCalculationsTests, TestSuiteSummary } from '../../utils/testRunner';
import {
  X,
  CheckCircle,
  XCircle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface FinancialAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FinancialAuditModal: React.FC<FinancialAuditModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [suiteResult, setSuiteResult] = useState<TestSuiteSummary | null>(() =>
    runFinancialCalculationsTests()
  );
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRerun = () => {
    const res = runFinancialCalculationsTests();
    setSuiteResult(res);
  };

  const categories = suiteResult
    ? Array.from(new Set(suiteResult.results.map((r) => r.category)))
    : [];

  const filteredResults = suiteResult
    ? filterCategory === 'ALL'
      ? suiteResult.results
      : suiteResult.results.filter((r) => r.category === filterCategory)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 sm:p-6 shadow-2xl text-[#151D2A] dark:text-[#F2F5F9] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34]">
              <ShieldCheck className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                Audit & Pengujian Otomatis Modul Finansial
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Uji verifikasi rumus matematis dengan data dummy terkontrol (tidak mengubah data riil Anda)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
            aria-label="Tutup modal audit finansial"
          >
            <X className="h-5 w-5 stroke-[1.75]" />
          </button>
        </div>

        {/* Status Bar */}
        {suiteResult && (
          <div className="my-3 p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                <span>
                  Lulus: <strong className="text-emerald-600 dark:text-emerald-400 font-mono-numbers">{suiteResult.passed}</strong> / {suiteResult.total}
                </span>
              </div>
              {suiteResult.failed > 0 && (
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <XCircle className="h-4 w-4 stroke-[1.75]" />
                  <span>Gagal: {suiteResult.failed}</span>
                </div>
              )}
              <span className="text-[#697586] dark:text-[#929BA9] font-mono-numbers">
                Waktu: {suiteResult.durationMs}ms
              </span>
            </div>

            <button
              onClick={handleRerun}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>Jalankan Ulang Tes</span>
            </button>
          </div>
        )}

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 text-xs">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
              filterCategory === 'ALL'
                ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
            }`}
          >
            Semua ({suiteResult?.total})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
                filterCategory === cat
                  ? 'bg-[#1769E8] text-white border-[#1769E8] font-semibold'
                  : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Assertion List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mt-2">
          {filteredResults.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-lg border bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-xs font-mono-numbers transition-colors"
            >
              <div className="flex items-center gap-2.5 pr-2">
                {item.passed ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[1.75]" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 stroke-[1.75]" />
                )}
                <div>
                  <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">{item.name}</span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">
                    {item.category}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className={`font-bold ${item.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {item.passed ? 'PASS' : `FAIL (${item.actual} vs ${item.expected})`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-xs">
          <span className="text-[#697586] dark:text-[#929BA9]">
            Jaminan: Isolasi memori murni. Data jurnal riil Anda 100% aman dan tidak tersentuh.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
