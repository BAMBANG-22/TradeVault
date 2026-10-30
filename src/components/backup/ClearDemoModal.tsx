import React, { useEffect } from 'react';
import { Trash2, ShieldCheck, X } from 'lucide-react';
import { Trade } from '../../types/trade';
import { isDemoTrade } from '../../utils/demoData';

interface ClearDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  trades: Trade[];
}

export const ClearDemoModal: React.FC<ClearDemoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  trades,
}) => {
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

  const demoTrades = trades.filter((t) => isDemoTrade(t));
  const realTrades = trades.filter((t) => !isDemoTrade(t));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-6 shadow-2xl space-y-5 text-[#151D2A] dark:text-[#F2F5F9]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] transition-colors"
          aria-label="Tutup konfirmasi hapus data demo"
        >
          <X className="h-5 w-5 stroke-[1.75]" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Trash2 className="h-6 w-6 stroke-[1.75]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              Hapus Seluruh Data DEMO
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Konfirmasi Pembersihan Data Contoh
            </span>
          </div>
        </div>

        {/* Stats Breakdown Card */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[#697586] dark:text-[#929BA9] block text-[11px]">Akan Dihapus:</span>
            <div className="text-lg font-extrabold text-amber-600 dark:text-amber-400 font-mono-numbers">
              {demoTrades.length} Trade DEMO
            </div>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
              Data transaksi contoh bawaan
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
            <span className="text-[#697586] dark:text-[#929BA9] block text-[11px]">Tetap Aman (Disimpan):</span>
            <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 font-mono-numbers">
              {realTrades.length} Trade Asli
            </div>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
              Data buatan Anda tidak tersentuh
            </span>
          </div>
        </div>

        {/* Protection Explanatory Box */}
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-2 text-xs text-[#697586] dark:text-[#929BA9]">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 stroke-[1.75]" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-[#151D2A] dark:text-[#F2F5F9]">Proteksi Data Pengguna:</strong> TradeVault hanya akan menghapus transaksi yang memiliki label <code className="text-amber-600 dark:text-amber-400 bg-[#EEF2F6] dark:bg-[#171D26] px-1 py-0.5 rounded font-mono-numbers">DEMO</code>. Transaksi manual yang Anda catat sendiri tidak akan pernah dihapus tanpa izin.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#EEF2F6] hover:bg-[#DDE3EA] text-[#151D2A] dark:bg-[#171D26] dark:hover:bg-[#252B34] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={demoTrades.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition-colors"
          >
            <Trash2 className="h-4 w-4 stroke-[1.75]" />
            <span>Hapus {demoTrades.length} Data DEMO</span>
          </button>
        </div>
      </div>
    </div>
  );
};
