import React, { useEffect } from 'react';
import { Trash2, ShieldCheck, X } from 'lucide-react';
import { Trade } from '../../types/trade';
import { isDemoTrade } from '../../utils/demoData';
import { useLanguage } from '../../utils/language';

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
  const { tr } = useLanguage();

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] shadow-2xl overflow-hidden text-[#151D2A] dark:text-[#F2F5F9]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#D97706] dark:text-[#F59E0B] shrink-0">
              <Trash2 className="h-4 w-4 stroke-[1.75]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Hapus Dataset Demo', 'Delete Demo Dataset')}
              </h3>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                {tr('Bersihkan transaksi contoh bawaan VLO', 'Remove built-in VLO sample trades')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer shrink-0"
            aria-label={tr('Tutup konfirmasi hapus data demo', 'Close clear demo data confirmation')}
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Breakdown Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                {tr('Akan Dihapus', 'Will Be Deleted')}
              </span>
              <span className="text-lg font-bold font-mono-numbers tabular-nums text-[#D97706] dark:text-[#F59E0B] mt-0.5 block">
                {demoTrades.length}
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                {tr('Transaksi DEMO', 'DEMO Trades')}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                {tr('Tetap Aman', 'Kept Safe')}
              </span>
              <span className="text-lg font-bold font-mono-numbers tabular-nums text-[#059669] dark:text-[#10B981] mt-0.5 block">
                {realTrades.length}
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                {tr('Transaksi Asli', 'Real Trades')}
              </span>
            </div>
          </div>

          {/* Protection Notice */}
          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#059669] dark:text-[#10B981] shrink-0 mt-0.5 stroke-[1.75]" />
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
              {tr(
                'Hanya transaksi berlabel DEMO yang dihapus. Catatan trading pribadi Anda tidak tersentuh.',
                'Only trades tagged DEMO are removed. Your personal trade logs remain untouched.'
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA]/60 dark:bg-[#080A0E]/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            {tr('Batal', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={demoTrades.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] dark:bg-[#F43F5E] dark:hover:bg-[#E11D48] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{tr(`Hapus ${demoTrades.length} Demo`, `Delete ${demoTrades.length} Demo`)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
