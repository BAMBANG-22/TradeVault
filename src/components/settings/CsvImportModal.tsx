import React, { useState, useEffect } from 'react';
import { Trade } from '../../types/trade';
import { parseCsvToTrades, CsvImportResult } from '../../utils/csv';
import { useLanguage } from '../../utils/language';
import { X, Upload, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (trades: Trade[], mode: 'merge' | 'replace') => void;
}

/**
 * Stabilizes CSV trade IDs deterministically (F-28) using a composite signature of:
 * dateTime + instrument + position + entryPrice + lotSize + netProfit + occurrenceIndex.
 * Ensures re-importing the same CSV yields identical IDs on retries (idempotency).
 */
function stabilizeCsvTradesDeterministically(trades: Trade[]): Trade[] {
  const occurrenceCountMap = new Map<string, number>();
  return trades.map((t) => {
    if (!t.id || t.id.startsWith('CSV-')) {
      const sig = `${t.dateTime}|${(t.instrument || 'XAUUSD').toUpperCase()}|${t.position}|${t.entryPrice}|${t.lotSize}|${t.netProfit}`;
      const occurrenceIndex = occurrenceCountMap.get(sig) || 0;
      occurrenceCountMap.set(sig, occurrenceIndex + 1);

      let h1 = 0x811c9dc5;
      let h2 = 0x9e3779b9;
      const seed = `${sig}|occ:${occurrenceIndex}`;
      for (let i = 0; i < seed.length; i++) {
        const c = seed.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
      }
      const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
      const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
      const stableId = `TRD-CSV-${hex1.slice(0, 4)}-${hex2.slice(0, 4)}`.toUpperCase();
      return {
        ...t,
        id: stableId,
      };
    }
    return t;
  });
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onConfirmImport,
}) => {
  const { tr } = useLanguage();
  const [csvText, setCsvText] = useState<string>('');
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplace, setConfirmReplace] = useState<boolean>(false);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
        const result = parseCsvToTrades(text);
        const stabilizedTrades = stabilizeCsvTradesDeterministically(result.validTrades);
        setImportResult({
          ...result,
          validTrades: stabilizedTrades,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCsvText(text);
    if (text.trim().length > 0) {
      const result = parseCsvToTrades(text);
      const stabilizedTrades = stabilizeCsvTradesDeterministically(result.validTrades);
      setImportResult({
        ...result,
        validTrades: stabilizedTrades,
      });
    } else {
      setImportResult(null);
    }
  };

  const handleCommit = () => {
    if (importResult && importResult.validTrades.length > 0) {
      if (importMode === 'replace' && !confirmReplace) {
        return;
      }
      onConfirmImport(importResult.validTrades, importMode);
      onClose();
    }
  };

  const canCommit =
    Boolean(importResult) &&
    (importResult?.validTrades.length ?? 0) > 0 &&
    (importMode !== 'replace' || confirmReplace);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] shadow-2xl overflow-hidden text-[#151D2A] dark:text-[#F2F5F9]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
              <FileSpreadsheet className="h-4 w-4 stroke-[1.75]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Impor Spreadsheet (CSV)', 'Import Spreadsheet (CSV)')}
              </h3>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                {tr('Unggah file .csv atau tempel data transaksi', 'Upload a .csv file or paste trade rows')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer shrink-0"
            aria-label={tr('Tutup modal impor CSV', 'Close CSV import modal')}
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Upload Zone */}
          <label className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl border border-dashed border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#080A0E] hover:border-[#1769E8] cursor-pointer transition-colors text-xs">
            <Upload className="h-4 w-4 stroke-[1.75] text-[#1769E8] dark:text-[#60A5FA]" />
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              {tr('Pilih file .CSV dari perangkat', 'Select .CSV file from device')}
            </span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          {/* Paste Area */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] block mb-1.5">
              {tr('Atau tempel teks CSV', 'Or paste CSV text')}
            </span>
            <textarea
              rows={4}
              value={csvText}
              onChange={handleTextChange}
              placeholder={`ID,Tanggal,Instrumen,Posisi,Setup,Entry,SL,TP,Lot,Risk,Hasil,Net Profit,Catatan\nTRD-01,2026-10-25T14:00,XAUUSD,BUY,Liquidity Sweep,2720,2715,2735,0.50,250,WIN,750,Target hit`}
              className="w-full rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-3 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
            />
          </div>

          {/* Validation & Preview Output */}
          {importResult && (
            <div className="space-y-3">
              {/* Summary + Mode Switcher */}
              <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[#059669] dark:text-[#10B981] stroke-[1.75]" />
                    <span className="text-[#697586] dark:text-[#929BA9]">
                      {tr('Valid:', 'Valid:')}{' '}
                      <strong className="text-[#059669] dark:text-[#10B981] font-mono-numbers tabular-nums">
                        {importResult.acceptedRowsCount ?? importResult.validTrades.length}/{importResult.totalRows}
                      </strong>
                    </span>
                  </div>
                  {(importResult.rejectedRowsCount > 0 || importResult.errors.length > 0) && (
                    <div className="flex items-center gap-1.5 text-[#E11D48] dark:text-[#F43F5E]">
                      <AlertCircle className="h-4 w-4 stroke-[1.75]" />
                      <span className="font-mono-numbers tabular-nums font-semibold">
                        {importResult.rejectedRowsCount || importResult.errors.length} {tr('ditolak', 'rejected')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Segmented Save Mode */}
                <div className="inline-flex items-center rounded-lg bg-white dark:bg-[#11151B] p-1 border border-[#DDE3EA] dark:border-[#252B34] shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('merge');
                      setConfirmReplace(false);
                    }}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                      importMode === 'merge'
                        ? 'bg-[#F5F7FA] dark:bg-[#171D26] text-[#1769E8] dark:text-[#F2F5F9] font-semibold border border-[#DDE3EA] dark:border-[#252B34]'
                        : 'text-[#697586] dark:text-[#929BA9] font-medium'
                    }`}
                  >
                    {tr('Gabungkan', 'Merge')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                      importMode === 'replace'
                        ? 'bg-[#F5F7FA] dark:bg-[#171D26] text-[#E11D48] dark:text-[#F43F5E] font-semibold border border-[#DDE3EA] dark:border-[#252B34]'
                        : 'text-[#697586] dark:text-[#929BA9] font-medium'
                    }`}
                  >
                    {tr('Ganti Semua', 'Replace All')}
                  </button>
                </div>
              </div>

              {/* Replace Warning */}
              {importMode === 'replace' && (
                <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-[#D97706] dark:text-[#F59E0B]">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 stroke-[1.75]" />
                    <span className="text-[11px] leading-relaxed">
                      {tr(
                        'Mode Ganti Semua menghapus transaksi lama yang tidak ada di file CSV ini.',
                        'Replace All removes existing trades not present in this CSV file.'
                      )}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F5F9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmReplace}
                      onChange={(e) => setConfirmReplace(e.target.checked)}
                      className="rounded border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] focus:ring-0"
                    />
                    <span>{tr('Konfirmasi penggantian seluruh data', 'Confirm replacing all data')}</span>
                  </label>
                </div>
              )}

              {/* Row Errors */}
              {(importResult.rowErrors?.length > 0 || importResult.errors.length > 0) && (
                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#E11D48] dark:text-[#F43F5E] space-y-1 max-h-28 overflow-y-auto font-mono-numbers">
                  {importResult.rowErrors && importResult.rowErrors.length > 0
                    ? importResult.rowErrors.map((rowErr, i) => (
                        <div key={i}>
                          • {tr('Baris', 'Row')} {rowErr.rowNumber}
                          {rowErr.tradeId ? ` [${rowErr.tradeId}]` : ''} · {rowErr.field}: {rowErr.reason}
                        </div>
                      ))
                    : importResult.errors.map((err, i) => <div key={i}>• {err}</div>)}
                </div>
              )}

              {/* Preview Table */}
              {importResult.validTrades.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#697586] dark:text-[#929BA9] block">
                    {tr(
                      `Pratinjau (${Math.min(5, importResult.validTrades.length)} Pertama)`,
                      `Preview (First ${Math.min(5, importResult.validTrades.length)})`
                    )}
                  </span>
                  <div className="max-h-44 overflow-auto rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#080A0E]">
                    <table className="w-full text-left text-[11px] font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                      <thead className="bg-white dark:bg-[#11151B] text-[#697586] dark:text-[#929BA9] border-b border-[#DDE3EA] dark:border-[#252B34]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">ID</th>
                          <th className="px-3 py-2 font-semibold">{tr('Tanggal', 'Date')}</th>
                          <th className="px-3 py-2 font-semibold">{tr('Posisi', 'Side')}</th>
                          <th className="px-3 py-2 font-semibold">Lot</th>
                          <th className="px-3 py-2 font-semibold">{tr('Hasil', 'Outcome')}</th>
                          <th className="px-3 py-2 font-semibold text-right">Net P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
                        {importResult.validTrades.slice(0, 5).map((t, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-semibold">{t.id}</td>
                            <td className="px-3 py-2 text-[#697586] dark:text-[#929BA9]">{t.dateTime.slice(0, 10)}</td>
                            <td className="px-3 py-2">{t.position} {t.instrument}</td>
                            <td className="px-3 py-2">{t.lotSize}</td>
                            <td className="px-3 py-2">{t.outcome}</td>
                            <td
                              className={`px-3 py-2 text-right font-bold ${
                                t.netProfit >= 0
                                  ? 'text-[#059669] dark:text-[#10B981]'
                                  : 'text-[#E11D48] dark:text-[#F43F5E]'
                              }`}
                            >
                              {t.netProfit >= 0 ? `+$${t.netProfit}` : `-$${Math.abs(t.netProfit)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA]/60 dark:bg-[#080A0E]/40 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
          >
            {tr('Batal', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!canCommit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.75]" />
            <span>{tr('Simpan ke Jurnal', 'Save to Journal')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
