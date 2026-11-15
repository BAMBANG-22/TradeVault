import React, { useEffect } from 'react';
import {
  HardDrive,
  Download,
  X,
  Database,
  CloudOff,
  ArrowRight,
} from 'lucide-react';
import { useLanguage } from '../../utils/language';

interface LocalPrototypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBackupModal?: () => void;
  tradesCount: number;
}

export const LocalPrototypeModal: React.FC<LocalPrototypeModalProps> = ({
  isOpen,
  onClose,
  onOpenBackupModal,
  tradesCount,
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
            <div className="h-9 w-9 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
              <HardDrive className="h-4 w-4 stroke-[1.75]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Penyimpanan Lokal Perangkat', 'Device Local Storage')}
              </h3>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                {tr('Data tersimpan privat di browser ini', 'Data stored privately in this browser')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer shrink-0"
            aria-label={tr('Tutup informasi penyimpanan lokal', 'Close local storage modal')}
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                {tr('Tersimpan Lokal', 'Saved Locally')}
              </span>
              <span className="text-base font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] mt-0.5 block">
                {tradesCount} {tr('Transaksi', 'Trades')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                {tr('Status Operasi', 'Operation Status')}
              </span>
              <span className="text-sm font-bold text-[#059669] dark:text-[#10B981] mt-1 block">
                {tr('Offline Mandiri', 'Offline Ready')}
              </span>
            </div>
          </div>

          {/* Key Details List */}
          <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
            <div className="p-3.5 flex items-start gap-3">
              <Database className="h-4 w-4 text-[#697586] dark:text-[#929BA9] shrink-0 mt-0.5 stroke-[1.75]" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Persistensi Browser', 'Browser Persistence')}
                </span>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5 leading-relaxed">
                  {tr(
                    'Transaksi, kalkulasi risiko, dan pengaturan tetap aman saat halaman dimuat ulang.',
                    'Trades, risk metrics, and settings persist across page reloads.'
                  )}
                </p>
              </div>
            </div>

            <div className="p-3.5 flex items-start gap-3">
              <CloudOff className="h-4 w-4 text-[#D97706] dark:text-[#F59E0B] shrink-0 mt-0.5 stroke-[1.75]" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Tanpa Sinkronisasi Otomatis', 'No Auto Cross-Device Sync')}
                </span>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5 leading-relaxed">
                  {tr(
                    'Data lokal hanya berada di perangkat ini kecuali Anda masuk ke akun Cloud Supabase.',
                    'Local data stays on this device unless you sign in to a Supabase Cloud account.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Transfer Guide */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] block">
              {tr('Pindah Perangkat Manual', 'Manual Device Transfer')}
            </span>
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px]">
              <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('1. Ekspor ZIP/JSON', '1. Export ZIP/JSON')}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] shrink-0 stroke-[1.75]" />
              <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('2. Kirim File', '2. Send File')}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] shrink-0 stroke-[1.75]" />
              <span className="font-semibold text-[#1769E8] dark:text-[#60A5FA]">
                {tr('3. Impor', '3. Import')}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA]/60 dark:bg-[#080A0E]/40 flex items-center justify-between gap-2">
          {onOpenBackupModal ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBackupModal();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>{tr('Buka Cadangan Data', 'Open Data Backup')}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            {tr('Tutup', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
