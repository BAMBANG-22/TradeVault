import React, { useState, useEffect } from 'react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import {
  computePlannedRiskReward,
  computeRealizedRMultiple,
  formatCurrency,
  formatPlannedRR,
  formatRMultiple,
} from '../../utils/calculations';
import { isStoragePath, createScreenshotSignedUrl } from '../../utils/supabaseSync';
import {
  X,
  Edit2,
  Trash2,
  Image,
  Calendar,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';

interface TradeDetailModalProps {
  trade: Trade | null;
  settings: AppSettings;
  isOpen: boolean;
  isChildModalOpen?: boolean;
  onClose: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onViewScreenshot: (url: string, title: string) => void;
}

export const TradeDetailModal: React.FC<TradeDetailModalProps> = ({
  trade,
  settings,
  isOpen,
  isChildModalOpen = false,
  onClose,
  onEdit,
  onDelete,
  onViewScreenshot,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isThumbnailLoading, setIsThumbnailLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || isChildModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isChildModalOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !trade?.screenshotUrl) {
      setThumbnailUrl(null);
      setIsThumbnailLoading(false);
      return;
    }

    const trimmed = trade.screenshotUrl.trim();
    if (
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://')
    ) {
      setThumbnailUrl(trimmed);
      setIsThumbnailLoading(false);
      return;
    }

    if (isStoragePath(trimmed)) {
      let isMounted = true;
      setIsThumbnailLoading(true);
      createScreenshotSignedUrl(trimmed, 3600)
        .then((url) => {
          if (!isMounted) return;
          setIsThumbnailLoading(false);
          setThumbnailUrl(url);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsThumbnailLoading(false);
          setThumbnailUrl(null);
        });
      return () => {
        isMounted = false;
      };
    }

    setThumbnailUrl(trimmed);
    setIsThumbnailLoading(false);
  }, [isOpen, trade?.screenshotUrl]);

  if (!isOpen || !trade) return null;

  const isWin = trade.outcome === 'WIN';
  const isLoss = trade.outcome === 'LOSS';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F5F7FA] dark:bg-[#080A0E] animate-in fade-in duration-150">
      <div className="min-h-screen w-full max-w-5xl mx-auto bg-[#F5F7FA] dark:bg-[#080A0E] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 text-[#151D2A] dark:text-[#F2F5F9]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono-numbers tabular-nums text-xs font-bold px-2 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
                {trade.id}
              </span>
              {trade.isDemo && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-amber-600 dark:text-amber-400">
                  DEMO DATA
                </span>
              )}
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                <span
                  className={
                    trade.position === 'BUY'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {trade.position}
                </span>{' '}
                <span className="text-[#151D2A] dark:text-[#F2F5F9]">{trade.instrument}</span>
              </span>
              {trade.session && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] flex items-center gap-1">
                  <Clock className="h-3 w-3 stroke-[1.75]" />
                  Sesi {trade.session}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">{trade.strategy}</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] flex items-center gap-1.5 font-mono-numbers tabular-nums">
              <Calendar className="h-3.5 w-3.5 stroke-[1.75]" />
              {trade.dateTime.replace('T', ' ')}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEdit(trade)}
              className="p-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8] transition-colors"
              title="Edit Transaksi"
              aria-label={`Edit transaksi ${trade.id}`}
            >
              <Edit2 className="h-4 w-4 stroke-[1.75]" />
            </button>
            <button
              onClick={() => onDelete(trade)}
              className="p-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-rose-600 dark:hover:text-rose-400 hover:border-[#1769E8] transition-colors"
              title="Hapus Transaksi"
              aria-label={`Hapus transaksi ${trade.id}`}
            >
              <Trash2 className="h-4 w-4 stroke-[1.75]" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors"
              title="Tutup"
              aria-label="Tutup detail transaksi"
            >
              <X className="h-4 w-4 stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* Outcome Banner */}
        <div className="mt-4 rounded-xl p-4 bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-[#697586] dark:text-[#929BA9]">Hasil Eksekusi Bersih</div>
            <div
              className={`text-2xl font-bold font-mono-numbers tabular-nums mt-0.5 ${
                isWin
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isLoss
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[#151D2A] dark:text-[#F2F5F9]'
              }`}
            >
              {isWin ? '+' : ''}
              {formatCurrency(trade.netProfit, settings)}
            </div>
          </div>
          <div className="text-right space-y-0.5">
            <div
              className={`text-xs font-bold uppercase ${
                isWin
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isLoss
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-[#697586] dark:text-[#929BA9]'
              }`}
            >
              {trade.outcome}
            </div>
            <div className="text-sm font-mono-numbers tabular-nums font-medium text-[#151D2A] dark:text-[#F2F5F9]">
              Realized R:{' '}
              <span className="font-bold">
                {formatRMultiple(computeRealizedRMultiple(trade))}
              </span>
            </div>
            <div className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
              Planned RR:{' '}
              <span className="font-semibold text-[#1769E8]">
                {formatPlannedRR(
                  computePlannedRiskReward(
                    trade.entryPrice,
                    trade.stopLoss,
                    trade.takeProfit,
                    trade.position
                  )
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers tabular-nums">
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Entry Price</span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-sm">
              {trade.entryPrice !== undefined ? trade.entryPrice.toFixed(2) : '-'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-rose-600 dark:text-rose-400 block font-sans">Stop Loss</span>
            <span className="font-semibold text-rose-700 dark:text-rose-300 text-sm">
              {trade.stopLoss !== undefined && trade.stopLoss !== null ? trade.stopLoss.toFixed(2) : '-'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-sans">Take Profit</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">
              {trade.takeProfit !== undefined && trade.takeProfit !== null
                ? trade.takeProfit.toFixed(2)
                : '-'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Exit Price</span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-sm">
              {trade.exitPrice !== undefined && trade.exitPrice !== null
                ? trade.exitPrice.toFixed(2)
                : '-'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Lot Size</span>
            <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] text-sm">{trade.lotSize.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Risk Amount</span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-sm">
              {formatCurrency(trade.riskAmount, settings)} ({trade.riskPercentage}%)
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Gross Profit</span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-sm">
              {formatCurrency(trade.grossProfit, settings)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block font-sans">Biaya &amp; Swap</span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] text-sm">
              Fee: ${(trade.commission || 0).toFixed(2)} • Swap: ${(trade.swap || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Screenshot preview */}
        {trade.screenshotUrl && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-1.5">
                <Image className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                Screenshot Chart
              </span>
              <button
                onClick={() =>
                  onViewScreenshot(trade.screenshotUrl!, `${trade.instrument} - ${trade.strategy}`)
                }
                className="text-[11px] text-[#1769E8] hover:underline cursor-pointer font-medium"
              >
                Perbesar Gambar
              </button>
            </div>
            <div
              className="relative rounded-xl overflow-hidden border border-[#DDE3EA] dark:border-[#252B34] h-56 bg-[#F5F7FA] dark:bg-[#080A0E] flex items-center justify-center cursor-pointer group"
              onClick={() =>
                onViewScreenshot(trade.screenshotUrl!, `${trade.instrument} - ${trade.strategy}`)
              }
            >
              {isThumbnailLoading ? (
                <div className="flex items-center gap-2 text-[#1769E8] text-xs font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memuat screenshot...</span>
                </div>
              ) : thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt="Chart"
                    width={800}
                    height={450}
                    decoding="async"
                    className="w-full h-56 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#11151B]/90 text-white border border-[#252B34]">
                      Klik untuk Zoom
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-xs text-[#697586] dark:text-[#929BA9]">Tidak dapat memuat pratinjau gambar.</span>
              )}
            </div>
          </div>
        )}

        {/* Structured Notes: Alasan Entry, Evaluasi & Disiplin */}
        <div className="mt-4 space-y-3">
          {trade.entryReason && (
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs">
              <span className="text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F5F9] block mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                Alasan Entry &amp; Konfirmasi Teknikal:
              </span>
              <p className="text-[#151D2A] dark:text-[#F2F5F9] whitespace-pre-line leading-relaxed">{trade.entryReason}</p>
            </div>
          )}

          {trade.postTradeEvaluation && (
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-xs">
              <span className="text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F5F9] block mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                Evaluasi Pasca-Trade &amp; Pelajaran:
              </span>
              <p className="text-[#151D2A] dark:text-[#F2F5F9] whitespace-pre-line leading-relaxed">
                {trade.postTradeEvaluation}
              </p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Rating Kepatuhan Rencana</span>
              <span className="text-xs text-[#1769E8] font-bold">
                {'★'.repeat(trade.disciplineRating || 5)}
                {'☆'.repeat(5 - (trade.disciplineRating || 5))} ({trade.disciplineRating || 5}/5)
              </span>
            </div>

            {trade.notes && (
              <div>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mb-1">Catatan Tambahan:</span>
                <p className="text-xs text-[#151D2A] dark:text-[#F2F5F9] leading-relaxed whitespace-pre-line bg-white dark:bg-[#080A0E] p-3 rounded-lg border border-[#DDE3EA] dark:border-[#252B34]">
                  {trade.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
