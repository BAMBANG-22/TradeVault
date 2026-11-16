import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Trade, TradeCloseType, TradingSession } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import { useLanguage } from '../../utils/language';
import { formatCurrency } from '../../utils/calculations';
import { useGlobalCurrency } from '../../utils/currencyRate';
import { compressAndResizeImage } from './TradeForm';
import {
  buildClosedTradeFromMt5Candidate,
  deduplicateBatchMt5Candidates,
  Mt5HistoryTradeCandidate,
  scanSingleMt5HistoryScreenshot,
} from '../../utils/tradeScreenshotScanner';

interface UploadedScreenshotItem {
  id: string;
  name: string;
  dataUrl: string;
  status: 'pending' | 'scanning' | 'done' | 'error';
  foundCount: number;
  error?: string;
}

interface Mt5HistoryScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingTrades: Trade[];
  settings: AppSettings;
  onImportBatchTrades: (
    newTrades: Trade[]
  ) => Promise<{ success: boolean; error?: string; importedCount?: number }>;
}

const SESSION_OPTIONS: TradingSession[] = ['Asian', 'London', 'Overlap', 'New York', 'Other'];
const CLOSE_TYPE_OPTIONS: TradeCloseType[] = ['TP', 'SL', 'Manual'];

export const Mt5HistoryScanModal: React.FC<Mt5HistoryScanModalProps> = ({
  isOpen,
  onClose,
  existingTrades,
  settings,
  onImportBatchTrades,
}) => {
  const { tr } = useLanguage();
  const { preferredCurrency, formatDynamic } = useGlobalCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [screenshots, setScreenshots] = useState<UploadedScreenshotItem[]>([]);
  const [candidates, setCandidates] = useState<Mt5HistoryTradeCandidate[]>([]);
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [defaultStrategy, setDefaultStrategy] = useState<string>('MT5 History Scan');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const availableStrategies = useMemo(() => {
    const set = new Set<string>(['MT5 History Scan']);
    for (const t of existingTrades) {
      if (t.strategy && t.strategy.trim()) {
        set.add(t.strategy.trim());
      }
    }
    return Array.from(set);
  }, [existingTrades]);

  const fmtMoney = (val: number) =>
    preferredCurrency === 'IDR' ? formatDynamic(val) : formatCurrency(val, settings);

  // Reset modal state cleanly when closed
  useEffect(() => {
    if (!isOpen) {
      setScreenshots([]);
      setCandidates([]);
      setExpandedRowIds({});
      setIsScanning(false);
      setIsSaving(false);
      setIsDragging(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Escape key dismissal matching TradeForm
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving && !isScanning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isScanning, onClose]);

  const processAndScanFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setErrorMsg(
        tr(
          'Format file tidak valid. Pilih screenshot gambar PNG/JPG/WEBP dari riwayat MT5.',
          'Invalid file format. Please select PNG/JPG/WEBP screenshot images from MT5 history.'
        )
      );
      return;
    }

    setErrorMsg(null);
    setIsScanning(true);

    try {
      const prepared: UploadedScreenshotItem[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const dataUrl = await compressAndResizeImage(file, 2000, 4200, 0.92);
        prepared.push({
          id: `ss_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name || `Screenshot ${screenshots.length + i + 1}`,
          dataUrl,
          status: 'pending',
          foundCount: 0,
        });
      }

      const startIndex = screenshots.length;
      setScreenshots((prev) => [...prev, ...prepared]);

      const newlyExtracted: Mt5HistoryTradeCandidate[] = [];
      let firstFailureMsg: string | null = null;

      for (let i = 0; i < prepared.length; i++) {
        const item = prepared[i];
        setScreenshots((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, status: 'scanning', error: undefined } : s))
        );

        try {
          const result = await scanSingleMt5HistoryScreenshot(item.dataUrl, {
            existingTrades,
            sourceImageIndex: startIndex + i,
            defaultStrategy,
          });
          newlyExtracted.push(...result.trades);

          setScreenshots((prev) =>
            prev.map((s) =>
              s.id === item.id
                ? { ...s, status: 'done', foundCount: result.trades.length }
                : s
            )
          );
        } catch (err: any) {
          const errMessage = err?.message || tr('Gagal memindai gambar', 'Failed to scan image');
          if (!firstFailureMsg) firstFailureMsg = errMessage;
          setScreenshots((prev) =>
            prev.map((s) =>
              s.id === item.id
                ? {
                    ...s,
                    status: 'error',
                    error: errMessage,
                  }
                : s
            )
          );
        }
      }

      setCandidates((prev) => deduplicateBatchMt5Candidates([...prev, ...newlyExtracted]));

      if (newlyExtracted.length === 0) {
        if (firstFailureMsg) {
          setErrorMsg(firstFailureMsg);
        } else {
          setErrorMsg(
            tr(
              'Tidak ada baris transaksi close MT5/MT4 yang terdeteksi pada screenshot. Pastikan kolom History Positions/Deals terlihat jelas.',
              'No closed MT5/MT4 trade rows were detected in the screenshot. Make sure the History Positions/Deals rows are clearly visible.'
            )
          );
        }
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          tr('Terjadi kesalahan saat memproses screenshot.', 'Error processing screenshot.')
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Support Ctrl+V / Cmd+V clipboard screenshot paste while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (isSaving) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        void processAndScanFiles(pastedFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (list.length > 0) {
      void processAndScanFiles(list);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isScanning || isSaving) return;
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) {
      void processAndScanFiles(files);
    }
  };

  const handleRescanItem = async (item: UploadedScreenshotItem, index: number) => {
    if (isScanning || isSaving) return;
    setErrorMsg(null);
    setIsScanning(true);
    setScreenshots((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, status: 'scanning', error: undefined } : s))
    );
    try {
      const result = await scanSingleMt5HistoryScreenshot(item.dataUrl, {
        existingTrades,
        sourceImageIndex: index,
        defaultStrategy,
      });
      setScreenshots((prev) =>
        prev.map((s) =>
          s.id === item.id ? { ...s, status: 'done', foundCount: result.trades.length } : s
        )
      );
      if (result.trades.length === 0) {
        setErrorMsg(
          tr(
            'Tidak ada baris transaksi close MT5/MT4 yang terdeteksi pada screenshot. Pastikan kolom History Positions/Deals terlihat jelas.',
            'No closed MT5/MT4 trade rows were detected in the screenshot. Make sure the History Positions/Deals rows are clearly visible.'
          )
        );
      } else {
        setCandidates((prev) => deduplicateBatchMt5Candidates([...prev, ...result.trades]));
      }
    } catch (err: any) {
      const errMessage = err?.message || tr('Gagal memindai ulang', 'Rescan failed');
      setErrorMsg(errMessage);
      setScreenshots((prev) =>
        prev.map((s) =>
          s.id === item.id ? { ...s, status: 'error', error: errMessage } : s
        )
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveScreenshot = (id: string) => {
    setScreenshots((prev) => prev.filter((s) => s.id !== id));
  };

  const updateCandidate = <K extends keyof Mt5HistoryTradeCandidate>(
    tempId: string,
    field: K,
    value: Mt5HistoryTradeCandidate[K]
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, [field]: value } : c))
    );
  };

  const removeCandidate = (tempId: string) => {
    setCandidates((prev) => prev.filter((c) => c.tempId !== tempId));
  };

  const applyStrategyToAll = (nextStrategy: string) => {
    setDefaultStrategy(nextStrategy);
    setCandidates((prev) => prev.map((c) => ({ ...c, strategy: nextStrategy })));
  };

  const toggleSelectAll = (selectNonDuplicatesOnly: boolean) => {
    setCandidates((prev) =>
      prev.map((c) => ({
        ...c,
        selected: selectNonDuplicatesOnly ? !c.isDuplicate : true,
      }))
    );
  };

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => c.selected),
    [candidates]
  );

  const selectedNetTotal = useMemo(
    () => selectedCandidates.reduce((acc, c) => acc + (Number(c.netProfit) || 0), 0),
    [selectedCandidates]
  );

  const duplicateCount = useMemo(
    () => candidates.filter((c) => c.isDuplicate).length,
    [candidates]
  );

  const handleSaveSelected = async () => {
    if (isSaving || isScanning || selectedCandidates.length === 0) return;
    setErrorMsg(null);

    for (const item of selectedCandidates) {
      if (!item.instrument.trim()) {
        setErrorMsg(tr('Simbol pair tidak boleh kosong.', 'Instrument symbol cannot be empty.'));
        return;
      }
      if (!Number.isFinite(item.lotSize) || item.lotSize <= 0) {
        setErrorMsg(
          tr(
            `Lot pada ${item.instrument} harus lebih dari 0.`,
            `Lot size on ${item.instrument} must be greater than 0.`
          )
        );
        return;
      }
      if (!Number.isFinite(item.entryPrice) || item.entryPrice <= 0) {
        setErrorMsg(
          tr(
            `Harga Entry pada ${item.instrument} harus valid (> 0).`,
            `Entry price on ${item.instrument} must be valid (> 0).`
          )
        );
        return;
      }
      if (!Number.isFinite(item.exitPrice) || item.exitPrice <= 0) {
        setErrorMsg(
          tr(
            `Harga Exit pada ${item.instrument} harus valid (> 0).`,
            `Exit price on ${item.instrument} must be valid (> 0).`
          )
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const usedIds = new Set<string>(existingTrades.map((t) => t.id.toLowerCase()));
      const newTrades = selectedCandidates.map((cand) =>
        buildClosedTradeFromMt5Candidate(cand, usedIds, settings)
      );

      const res = await onImportBatchTrades(newTrades);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(
          res.error ||
            tr(
              'Gagal menyimpan transaksi ke Jurnal.',
              'Failed to save trades to Journal.'
            )
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || tr('Terjadi kesalahan saat menyimpan.', 'Error saving trades.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt5-scan-modal-title"
      onClick={() => {
        if (!isSaving && !isScanning) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className="relative w-[92vw] sm:w-full max-w-[460px] sm:max-w-[540px] max-h-[calc(100vh-1.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] my-auto shrink-0 flex flex-col rounded-[28px] border border-[#DDE3EA] dark:border-[#1E232B] bg-white dark:bg-[#0B0D11] text-[#151D2A] dark:text-[#F2F4F7] font-['Arial',Helvetica,sans-serif] shadow-[0_24px_64px_rgba(15,23,42,0.18)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden select-none"
      >
        {/* Header — Identical to TradeForm */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#DDE3EA] dark:border-[#1E232B] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2
              id="mt5-scan-modal-title"
              className="text-[15px] font-bold tracking-tight text-[#151D2A] dark:text-[#F2F4F7] truncate"
            >
              {tr('Catat dari Riwayat MT5', 'Import MT5 History')}
            </h2>
            {candidates.length > 0 && (
              <span className="text-[10px] font-semibold tracking-wider uppercase text-[#697586] dark:text-[#929BA9] tabular-nums whitespace-nowrap shrink-0">
                · {selectedCandidates.length}/{candidates.length} {tr('SIAP', 'READY')}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label={tr('Tutup', 'Close')}
            title={tr('Tutup Formulir', 'Close Form')}
            className="rounded-full p-1.5 text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#151921] active:scale-95 transition-all disabled:opacity-50 cursor-pointer shrink-0"
          >
            <X className="h-4 w-4 stroke-[2]" />
          </button>
        </div>

        {/* Seamless Hairline-Divided Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#DDE3EA] dark:divide-[#1E232B] min-h-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Error Banner — Exact TradeForm pattern */}
          {errorMsg && (
            <div className="px-5 py-2.5 bg-[#E05260]/10">
              <div className="flex items-start gap-2 text-[11px] text-[#E11D48] dark:text-[#E05260]">
                <AlertCircle className="h-3.5 w-3.5 stroke-[2] shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Section 1: Screenshot MT5 Upload & Queue */}
          <div
            className={`px-5 py-3 space-y-2.5 transition-colors ${
              isDragging ? 'bg-[#F5F7FA] dark:bg-[#12161D]' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[11px] text-[#697586] dark:text-[#929BA9]">
                  {tr('Screenshot Riwayat MT5 / MT4', 'MT5 / MT4 History Screenshot')}
                </span>
                <span className="block text-[10px] text-[#94A3B8] dark:text-[#606875] truncate">
                  {tr(
                    'Unggah banyak gambar, seret ke sini, atau tekan Ctrl+V',
                    'Upload multiple images, drag here, or press Ctrl+V'
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning || isSaving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F5F7FA] dark:bg-[#12161D] border border-[#DDE3EA] dark:border-[#1E232B] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F4F7] hover:border-[#697586] dark:hover:border-[#929BA9] active:scale-[0.98] transition-all cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                {isScanning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : screenshots.length > 0 ? (
                  <Plus className="h-3 w-3 stroke-[2]" />
                ) : (
                  <Upload className="h-3 w-3 stroke-[2]" />
                )}
                <span>
                  {isScanning
                    ? tr('Memindai...', 'Scanning...')
                    : screenshots.length > 0
                    ? tr('Tambah', 'Add')
                    : tr('Unggah', 'Upload')}
                </span>
              </button>
            </div>

            {screenshots.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning || isSaving}
                className="w-full rounded-2xl bg-[#F5F7FA] dark:bg-[#12161D] border border-[#DDE3EA] dark:border-[#1E232B] hover:border-[#697586] dark:hover:border-[#929BA9] px-4 py-5 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer disabled:opacity-50"
              >
                <ImageIcon className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                  {tr(
                    'Pilih screenshot riwayat posisi close',
                    'Choose closed position history screenshots'
                  )}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  {tr(
                    'Otomatis membaca TP, SL, dan tutup manual beserta harga & profit',
                    'Automatically extracts TP, SL, and manual closes with price & profit'
                  )}
                </span>
              </button>
            ) : (
              <div className="rounded-2xl bg-[#F5F7FA] dark:bg-[#12161D] border border-[#DDE3EA] dark:border-[#1E232B] divide-y divide-[#DDE3EA] dark:divide-[#1E232B] overflow-hidden">
                {screenshots.map((ss, idx) => (
                  <div
                    key={ss.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={ss.dataUrl}
                        alt={ss.name}
                        className="h-8 w-8 rounded-lg object-cover border border-[#DDE3EA] dark:border-[#1E232B] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] truncate">
                          {ss.name}
                        </div>
                        <div className="text-[11px] text-[#697586] dark:text-[#929BA9] tabular-nums flex items-center gap-1.5">
                          <span>#{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          {ss.status === 'scanning' && (
                            <span className="inline-flex items-center gap-1 text-[#151D2A] dark:text-[#F2F4F7]">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {tr('Memindai...', 'Scanning...')}
                            </span>
                          )}
                          {ss.status === 'done' && (
                            <span>
                              {ss.foundCount} {tr('transaksi terbaca', 'trades found')}
                            </span>
                          )}
                          {ss.status === 'error' && (
                            <span className="text-[#E11D48] dark:text-[#E05260] truncate">
                              {tr('Gagal dipindai', 'Scan failed')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(ss.status === 'error' || (ss.status === 'done' && ss.foundCount === 0)) && (
                        <button
                          type="button"
                          onClick={() => handleRescanItem(ss, idx)}
                          disabled={isScanning || isSaving}
                          title={tr('Pindai Ulang', 'Rescan')}
                          className="p-1.5 rounded-full text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-40"
                        >
                          <RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveScreenshot(ss.id)}
                        disabled={isScanning || isSaving}
                        title={tr('Hapus gambar', 'Remove image')}
                        className="p-1.5 rounded-full text-[#697586] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5 stroke-[1.75]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Ringkasan & Strategi Default (Clean TradeForm Row) */}
          {candidates.length > 0 && (
            <div className="px-5 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-[#697586] dark:text-[#929BA9] tabular-nums">
                  <span>
                    {candidates.length} {tr('Terdeteksi', 'Detected')}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                    {selectedCandidates.length} {tr('Dipilih', 'Selected')}
                  </span>
                  {duplicateCount > 0 && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="text-[#D97706] dark:text-[#F59E0B] font-semibold">
                        {duplicateCount} {tr('duplikat', 'duplicates')}
                      </span>
                    </>
                  )}
                </div>

                <span
                  className={`text-xs font-bold tabular-nums ${
                    selectedNetTotal >= 0.01
                      ? 'text-[#059669] dark:text-[#00A878]'
                      : selectedNetTotal <= -0.01
                      ? 'text-[#E11D48] dark:text-[#E05260]'
                      : 'text-[#151D2A] dark:text-[#F2F4F7]'
                  }`}
                >
                  {selectedNetTotal >= 0 ? '+' : ''}
                  {fmtMoney(selectedNetTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-[#DDE3EA]/70 dark:border-[#1E232B]/60">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <label
                    htmlFor="mt5-default-strategy"
                    className="text-[11px] text-[#697586] dark:text-[#929BA9] shrink-0"
                  >
                    {tr('Strategi', 'Strategy')}
                  </label>
                  <select
                    id="mt5-default-strategy"
                    value={defaultStrategy}
                    onChange={(e) => applyStrategyToAll(e.target.value)}
                    className="min-w-0 max-w-[190px] bg-white dark:bg-[#0B0D11] border-b border-[#DDE3EA] dark:border-[#1E232B] pb-0.5 text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none truncate"
                  >
                    {availableStrategies.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-[#151D2A] dark:text-[#F2F4F7] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {tr('Pilih Baru', 'Select New')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCandidates((prev) => prev.map((c) => ({ ...c, selected: false })))
                    }
                    className="text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] cursor-pointer whitespace-nowrap"
                  >
                    {tr('Kosongkan', 'Clear')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 3+: Seamless Candidate Rows (Hairline Divided, Zero Card-in-Card) */}
          {candidates.map((cand) => {
            const isExpanded = Boolean(expandedRowIds[cand.tempId]);
            const isWin = cand.netProfit >= 0.01;
            const isLoss = cand.netProfit <= -0.01;

            return (
              <div
                key={cand.tempId}
                className={`px-5 py-3 transition-opacity ${
                  cand.selected ? 'opacity-100' : 'opacity-50'
                }`}
              >
                {/* Row Line 1: Check, Pair, BUY/SELL, Lot, Net P/L, Close Type, Expand/Delete */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => updateCandidate(cand.tempId, 'selected', !cand.selected)}
                      aria-label={tr('Pilih transaksi', 'Select trade')}
                      className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        cand.selected
                          ? 'bg-[#151D2A] dark:bg-[#F2F4F7] border-[#151D2A] dark:border-[#F2F4F7] text-white dark:text-[#050607]'
                          : 'bg-transparent border-[#DDE3EA] dark:border-[#2A313D] text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    </button>

                    <input
                      type="text"
                      value={cand.instrument}
                      onChange={(e) =>
                        updateCandidate(cand.tempId, 'instrument', e.target.value.toUpperCase())
                      }
                      aria-label={tr('Instrumen', 'Instrument')}
                      className="w-20 bg-transparent text-sm font-bold tracking-wide uppercase text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none focus:border-b focus:border-[#697586] dark:focus:border-[#929BA9]"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        updateCandidate(
                          cand.tempId,
                          'position',
                          cand.position === 'BUY' ? 'SELL' : 'BUY'
                        )
                      }
                      className={`text-xs font-bold uppercase tracking-wide cursor-pointer shrink-0 ${
                        cand.position === 'BUY'
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : 'text-[#E11D48] dark:text-[#E05260]'
                      }`}
                    >
                      {cand.position}
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        value={cand.lotSize}
                        onChange={(e) =>
                          updateCandidate(
                            cand.tempId,
                            'lotSize',
                            parseFloat(e.target.value) || 0.01
                          )
                        }
                        aria-label="Lot"
                        className="w-12 bg-transparent text-right text-xs font-bold tabular-nums text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none focus:border-b focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                      <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">Lot</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    {/* Close Type Segmented Control — Matches TradeForm MARKET/LIMIT */}
                    <div className="inline-flex items-center gap-0.5 rounded-full bg-[#F5F7FA] dark:bg-[#12161D] p-0.5 border border-[#DDE3EA] dark:border-[#1E232B]">
                      {CLOSE_TYPE_OPTIONS.map((ct) => {
                        const active = cand.closeType === ct;
                        return (
                          <button
                            key={ct}
                            type="button"
                            onClick={() => updateCandidate(cand.tempId, 'closeType', ct)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              active
                                ? 'bg-white dark:bg-[#202631] text-[#151D2A] dark:text-[#F2F4F7] shadow-2xs dark:shadow-none'
                                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7]'
                            }`}
                          >
                            {ct}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={cand.netProfit}
                      onChange={(e) =>
                        updateCandidate(
                          cand.tempId,
                          'netProfit',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      aria-label="Net Profit"
                      className={`w-20 bg-transparent text-right text-sm font-bold tabular-nums focus:outline-none focus:border-b focus:border-[#697586] dark:focus:border-[#929BA9] ${
                        isWin
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : isLoss
                          ? 'text-[#E11D48] dark:text-[#E05260]'
                          : 'text-[#151D2A] dark:text-[#F2F4F7]'
                      }`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRowIds((prev) => ({
                          ...prev,
                          [cand.tempId]: !prev[cand.tempId],
                        }))
                      }
                      title={tr('Detail lanjutan', 'More details')}
                      aria-label={tr('Detail lanjutan', 'More details')}
                      className="p-1 rounded-full text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#151921] cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeCandidate(cand.tempId)}
                      title={tr('Hapus baris', 'Remove row')}
                      aria-label={tr('Hapus baris', 'Remove row')}
                      className="p-1 rounded-full text-[#697586] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] hover:bg-[#F5F7FA] dark:hover:bg-[#151921] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                    </button>
                  </div>
                </div>

                {/* Row Line 2: Entry -> Exit, Date/Time, Session & Unboxed Metadata */}
                <div className="mt-1.5 pl-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#697586] dark:text-[#929BA9] tabular-nums">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={cand.entryPrice}
                      onChange={(e) =>
                        updateCandidate(
                          cand.tempId,
                          'entryPrice',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      aria-label="Entry"
                      className="w-[68px] bg-transparent border-b border-transparent hover:border-[#DDE3EA] focus:border-[#697586] dark:hover:border-[#1E232B] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none"
                    />
                    <span aria-hidden="true">→</span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={cand.exitPrice}
                      onChange={(e) =>
                        updateCandidate(
                          cand.tempId,
                          'exitPrice',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      aria-label="Exit"
                      className="w-[68px] bg-transparent border-b border-transparent hover:border-[#DDE3EA] focus:border-[#697586] dark:hover:border-[#1E232B] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none"
                    />
                  </div>

                  <span aria-hidden="true">·</span>

                  <input
                    type="datetime-local"
                    value={cand.closeDateTime}
                    onChange={(e) =>
                      updateCandidate(cand.tempId, 'closeDateTime', e.target.value)
                    }
                    className="bg-transparent text-[11px] text-[#697586] dark:text-[#929BA9] focus:outline-none dark:[color-scheme:dark]"
                  />

                  <span aria-hidden="true">·</span>

                  <select
                    value={cand.session}
                    onChange={(e) =>
                      updateCandidate(
                        cand.tempId,
                        'session',
                        e.target.value as TradingSession
                      )
                    }
                    className="bg-transparent text-[11px] text-[#697586] dark:text-[#929BA9] focus:outline-none"
                  >
                    {SESSION_OPTIONS.map((ses) => (
                      <option key={ses} value={ses} className="bg-white dark:bg-[#0B0D11]">
                        {ses}
                      </option>
                    ))}
                  </select>

                  {cand.ticketId && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[10px] text-[#94A3B8] dark:text-[#606875]">
                        #{cand.ticketId}
                      </span>
                    </>
                  )}

                  {cand.isDuplicate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[10px] font-semibold text-[#D97706] dark:text-[#F59E0B]">
                        {tr(
                          `Sudah ada (${cand.duplicateMatchId || 'Jurnal'})`,
                          `Already logged (${cand.duplicateMatchId || 'Journal'})`
                        )}
                      </span>
                    </>
                  )}
                </div>

                {/* Expanded Detail Grid — Exact TradeForm underline inputs */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 pl-7 border-t border-[#DDE3EA]/70 dark:border-[#1E232B]/60 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        Stop Loss
                      </label>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={cand.stopLoss ?? ''}
                        onChange={(e) =>
                          updateCandidate(
                            cand.tempId,
                            'stopLoss',
                            e.target.value ? parseFloat(e.target.value) : null
                          )
                        }
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs font-bold tabular-nums text-[#151D2A] dark:text-[#F2F4F7] placeholder-[#94A3B8] dark:placeholder-[#4B525E] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        Take Profit
                      </label>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={cand.takeProfit ?? ''}
                        onChange={(e) =>
                          updateCandidate(
                            cand.tempId,
                            'takeProfit',
                            e.target.value ? parseFloat(e.target.value) : null
                          )
                        }
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs font-bold tabular-nums text-[#151D2A] dark:text-[#F2F4F7] placeholder-[#94A3B8] dark:placeholder-[#4B525E] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        {tr('Komisi', 'Commission')} ({settings.currencySymbol})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={cand.commission}
                        onChange={(e) =>
                          updateCandidate(
                            cand.tempId,
                            'commission',
                            Math.abs(parseFloat(e.target.value) || 0)
                          )
                        }
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs font-bold tabular-nums text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        Swap ({settings.currencySymbol})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={cand.swap}
                        onChange={(e) =>
                          updateCandidate(
                            cand.tempId,
                            'swap',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs font-bold tabular-nums text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        {tr('Strategi', 'Strategy')}
                      </label>
                      <input
                        type="text"
                        value={cand.strategy}
                        onChange={(e) =>
                          updateCandidate(cand.tempId, 'strategy', e.target.value)
                        }
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#697586] dark:text-[#929BA9] mb-0.5">
                        {tr('Catatan', 'Notes')}
                      </label>
                      <input
                        type="text"
                        value={cand.notes}
                        onChange={(e) =>
                          updateCandidate(cand.tempId, 'notes', e.target.value)
                        }
                        placeholder={tr('Opsional...', 'Optional...')}
                        className="w-full bg-transparent border-b border-[#DDE3EA] dark:border-[#1E232B] pb-1 text-xs text-[#151D2A] dark:text-[#F2F4F7] placeholder-[#94A3B8] dark:placeholder-[#4B525E] focus:outline-none focus:border-[#697586] dark:focus:border-[#929BA9]"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer — Exact 2-button TradeForm Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#DDE3EA] dark:border-[#1E232B] bg-white dark:bg-[#0B0D11] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-full bg-[#F5F7FA] dark:bg-[#151921] hover:bg-[#EEF2F6] dark:hover:bg-[#1C222D] active:scale-[0.98] text-xs font-semibold text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] transition-all disabled:opacity-50 cursor-pointer"
          >
            {tr('Batal', 'Cancel')}
          </button>

          <button
            type="button"
            onClick={handleSaveSelected}
            disabled={isSaving || isScanning || selectedCandidates.length === 0}
            aria-busy={isSaving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[#151D2A] hover:bg-[#1E293B] text-white dark:bg-[#F2F4F7] dark:hover:bg-white active:scale-[0.98] dark:text-[#050607] text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{tr('Menyimpan...', 'Saving...')}</span>
              </>
            ) : selectedCandidates.length > 0 ? (
              <span>
                {tr(
                  `Simpan ${selectedCandidates.length} Trade`,
                  `Save ${selectedCandidates.length} Trades`
                )}
              </span>
            ) : (
              <span>{tr('Simpan', 'Save')}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
