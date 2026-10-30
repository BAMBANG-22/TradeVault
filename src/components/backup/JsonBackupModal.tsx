import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  ShieldAlert,
  ArrowRight,
  Database,
  Layers,
  Cloud,
  FileArchive,
  Image,
  Loader2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check,
  Info,
} from 'lucide-react';
import { Trade } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import { generateBackupJson } from '../../utils/storage';
import { formatCurrency } from '../../utils/calculations';
import {
  generateFullZipBackup,
  ZipBackupProgress,
  ZipBackupFailedItem,
  GenerateZipResult,
  MAX_SAFE_TOTAL_SIZE_BYTES,
  ParsedZipArchive,
  RestoreZipProgress,
  RestoreZipResult,
  parseAndValidateZipArchive,
  executeZipRestore,
} from '../../utils/backupZip';
import { isStoragePath, prepareTradesForJsonBackup } from '../../utils/supabaseSync';

interface JsonBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  trades: Trade[];
  settings: AppSettings;
  currentUser?: any | null;
  onRestoreSuccess: (
    trades: Trade[],
    settings?: AppSettings,
    mode?: 'replace' | 'merge',
    syncToCloud?: boolean
  ) => Promise<any> | void;
}

interface ValidationReport {
  isValid: boolean;
  fileFormat: 'json' | 'zip';
  fileName: string;
  fileSize: number;
  totalParsedTrades: number;
  validTradesCount: number;
  invalidTradesCount: number;
  hasSettings: boolean;
  backupSettings?: AppSettings;
  backupTrades?: Trade[];
  backupTotalProfit?: number;
  errors: string[];
  warnings?: string[];
  archivedImagesCount?: number;
  storageScreenshotsCount?: number;
  base64ScreenshotsCount?: number;
  externalScreenshotsCount?: number;
}

export const JsonBackupModal: React.FC<JsonBackupModalProps> = ({
  isOpen,
  onClose,
  trades,
  settings,
  currentUser,
  onRestoreSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [parsedZipArchive, setParsedZipArchive] = useState<ParsedZipArchive | null>(null);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState<boolean>(false);

  // Restore Execution Settings
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');
  const [syncToCloud, setSyncToCloud] = useState<boolean>(true);
  const [confirmOverwrite, setConfirmOverwrite] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExportingJson, setIsExportingJson] = useState<boolean>(false);
  const [isRestoringJson, setIsRestoringJson] = useState<boolean>(false);

  // Restore ZIP Progress & Execution States (Tahap 2)
  const [restoreZipPhase, setRestoreZipPhase] = useState<'idle' | 'uploading' | 'completed' | 'failed'>('idle');
  const [restoreZipProgress, setRestoreZipProgress] = useState<RestoreZipProgress | null>(null);
  const [restoreZipFailedItems, setRestoreZipFailedItems] = useState<
    Array<{ tradeId: string; archivePath: string; error: string }>
  >([]);
  const [restoreZipSuccessSummary, setRestoreZipSuccessSummary] = useState<RestoreZipResult | null>(null);
  const restoreAbortControllerRef = useRef<AbortController | null>(null);

  // Upload cache: prevents re-uploading already succeeded files when user clicks Retry
  const uploadCacheRef = useRef<Map<string, string>>(new Map());

  // Export ZIP States (Tahap 1)
  const [exportFormat, setExportFormat] = useState<'zip' | 'json'>('zip');
  const [zipPhase, setZipPhase] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [zipProgress, setZipProgress] = useState<ZipBackupProgress | null>(null);
  const [zipResult, setZipResult] = useState<GenerateZipResult | null>(null);
  const [zipFailedItems, setZipFailedItems] = useState<ZipBackupFailedItem[]>([]);
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  const isBackupOrRestoreBusy =
    isAnalyzingFile ||
    isExportingJson ||
    isRestoringJson ||
    zipPhase === 'running' ||
    restoreZipPhase === 'uploading';

  useEffect(() => {
    if (!isOpen || isBackupOrRestoreBusy) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBackupOrRestoreBusy, onClose]);

  // Memoized screenshot breakdown for Export
  const screenshotStats = useMemo(() => {
    let storageCount = 0;
    let base64Count = 0;
    let externalCount = 0;
    for (const t of trades) {
      const url = t.screenshotUrl ? String(t.screenshotUrl).trim() : '';
      if (!url) continue;
      if (url.startsWith('data:image/')) base64Count++;
      else if (url.startsWith('http://') || url.startsWith('https://')) externalCount++;
      else if (isStoragePath(url)) storageCount++;
    }
    return {
      totalScreenshots: storageCount + base64Count + externalCount,
      storageCount,
      base64Count,
      externalCount,
    };
  }, [trades]);

  // Conflict preview for Merge Mode
  const mergeStats = useMemo(() => {
    if (!validationReport?.backupTrades) return null;
    const incomingIds = new Set(validationReport.backupTrades.map((t) => t.id));
    let duplicates = 0;
    let newItems = 0;
    for (const t of validationReport.backupTrades) {
      if (trades.some((ex) => ex.id === t.id)) {
        duplicates++;
      } else {
        newItems++;
      }
    }
    const unchanged = trades.filter((ex) => !incomingIds.has(ex.id)).length;
    return { duplicates, newItems, unchanged };
  }, [validationReport, trades]);

  if (!isOpen) return null;

  // Helper to trigger browser file download
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Handle Standard JSON Export (Tahap 1 & Lama)
  // Resolves private Storage paths into self-contained Base64 Data URLs in the exported JSON copy
  // so restoring the JSON backup after deleting trades can always re-upload screenshots to Storage.
  const handleDownloadBackup = async () => {
    if (isExportingJson) return;
    setIsExportingJson(true);
    try {
      const exportReadyTrades = await prepareTradesForJsonBackup(trades, currentUser?.id || null);
      const jsonStr = generateBackupJson(exportReadyTrades, settings);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      triggerDownload(blob, `TradeVault_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    } finally {
      setIsExportingJson(false);
    }
  };

  // Handle Full ZIP Backup Export (Tahap 1)
  const handleStartZipBackup = async (allowPartial = false) => {
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    setZipPhase('running');
    setZipProgress({
      phase: 'scanning',
      currentStep: 0,
      totalSteps: trades.length,
      message: 'Mempersiapkan proses backup arsip...',
      percent: 5,
    });
    setZipFailedItems([]);

    try {
      const res = await generateFullZipBackup(
        trades,
        settings,
        currentUser ? { id: currentUser.id, email: currentUser.email } : null,
        (progress) => {
          setZipProgress(progress);
        },
        {
          allowPartial,
          abortSignal: controller.signal,
        }
      );

      setZipResult(res);

      if (res.success && res.blob && res.fileName) {
        triggerDownload(res.blob, res.fileName);
        setZipPhase('completed');
      } else {
        setZipFailedItems(res.failedItems || []);
        setZipPhase('failed');
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        setZipPhase('idle');
        setZipProgress(null);
      } else {
        console.error('Error in zip backup:', err);
        setZipFailedItems([
          {
            tradeId: 'GLOBAL',
            sourceType: 'storage',
            pathOrRef: 'Arsip Backup',
            error: err?.message || 'Gagal memproses arsip ZIP.',
          },
        ]);
        setZipPhase('failed');
      }
    } finally {
      exportAbortControllerRef.current = null;
    }
  };

  const handleCancelZipBackup = () => {
    if (exportAbortControllerRef.current) {
      exportAbortControllerRef.current.abort();
    }
    setZipPhase('idle');
    setZipProgress(null);
  };

  const handleResetZipState = () => {
    setZipPhase('idle');
    setZipProgress(null);
    setZipFailedItems([]);
  };

  // ==========================================================================
  // RESTORE / IMPORT LOGIC (Tahap 1 JSON & Tahap 2 ZIP)
  // ==========================================================================

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setErrorMessage(null);
    setConfirmOverwrite(false);
    setRestoreZipPhase('idle');
    setRestoreZipFailedItems([]);
    setRestoreZipSuccessSummary(null);
    uploadCacheRef.current.clear();

    const isZip =
      file.name.toLowerCase().endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed';

    if (isZip) {
      await validateSelectedZipFile(file);
    } else {
      validateSelectedJsonFile(file);
    }
  };

  // Validate ZIP Archive (Tahap 2)
  const validateSelectedZipFile = async (file: File) => {
    setIsAnalyzingFile(true);
    try {
      const zipRes = await parseAndValidateZipArchive(file);
      setParsedZipArchive(zipRes);

      const totalProfit = zipRes.trades.reduce((acc, t) => acc + (t.netProfit || 0), 0);

      setValidationReport({
        isValid: zipRes.isValid,
        fileFormat: 'zip',
        fileName: file.name,
        fileSize: file.size,
        totalParsedTrades: zipRes.totalParsedTrades,
        validTradesCount: zipRes.validTradesCount,
        invalidTradesCount: zipRes.invalidTradesCount,
        hasSettings: Boolean(zipRes.settings),
        backupSettings: zipRes.settings,
        backupTrades: zipRes.trades,
        backupTotalProfit: totalProfit,
        errors: zipRes.errors,
        warnings: zipRes.warnings,
        archivedImagesCount: zipRes.archivedImagesCount,
        storageScreenshotsCount: zipRes.storageScreenshotsCount,
        base64ScreenshotsCount: zipRes.base64ScreenshotsCount,
        externalScreenshotsCount: zipRes.externalScreenshotsCount,
      });
    } catch (err: any) {
      setParsedZipArchive(null);
      setValidationReport({
        isValid: false,
        fileFormat: 'zip',
        fileName: file.name,
        fileSize: file.size,
        totalParsedTrades: 0,
        validTradesCount: 0,
        invalidTradesCount: 0,
        hasSettings: false,
        errors: [`Gagal memvalidasi arsip ZIP: ${err.message || 'Format tidak dikenali'}`],
      });
    } finally {
      setIsAnalyzingFile(false);
    }
  };

  // Validate JSON File (Preserved 100%)
  const validateSelectedJsonFile = (file: File) => {
    setParsedZipArchive(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        const errors: string[] = [];
        let parsedTradesArray: any[] = [];
        let fileSettings: AppSettings | undefined = undefined;

        if (Array.isArray(parsed)) {
          parsedTradesArray = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.trades)) {
            parsedTradesArray = parsed.trades;
          } else {
            errors.push('File JSON tidak memiliki daftar transaksi (trades array).');
          }

          if (parsed.settings && typeof parsed.settings === 'object') {
            fileSettings = parsed.settings;
          }
        } else {
          errors.push('Format data JSON tidak dikenali.');
        }

        const validTrades: Trade[] = [];
        let invalidCount = 0;

        for (const t of parsedTradesArray) {
          if (
            t &&
            typeof t === 'object' &&
            typeof t.id === 'string' &&
            typeof t.dateTime === 'string' &&
            typeof t.entryPrice === 'number' &&
            typeof t.netProfit === 'number'
          ) {
            validTrades.push(t as Trade);
          } else {
            invalidCount++;
          }
        }

        if (validTrades.length === 0 && parsedTradesArray.length > 0) {
          errors.push('Semua entri transaksi dalam file memiliki properti yang tidak sesuai.');
        }

        const totalProfit = validTrades.reduce((acc, t) => acc + (t.netProfit || 0), 0);

        setValidationReport({
          isValid: errors.length === 0 && validTrades.length > 0,
          fileFormat: 'json',
          fileName: file.name,
          fileSize: file.size,
          totalParsedTrades: parsedTradesArray.length,
          validTradesCount: validTrades.length,
          invalidTradesCount: invalidCount,
          hasSettings: Boolean(fileSettings),
          backupSettings: fileSettings,
          backupTrades: validTrades,
          backupTotalProfit: totalProfit,
          errors,
        });
      } catch (err: any) {
        setValidationReport({
          isValid: false,
          fileFormat: 'json',
          fileName: file.name,
          fileSize: file.size,
          totalParsedTrades: 0,
          validTradesCount: 0,
          invalidTradesCount: 0,
          hasSettings: false,
          errors: [`File tidak dapat dibaca sebagai format JSON valid: ${err.message}`],
        });
      }
    };
    reader.readAsText(file);
  };

  // Execute Restore: Branch to JSON or ZIP
  const handleExecuteRestore = async () => {
    if (isRestoringJson) return;
    if (!validationReport || !validationReport.isValid || !validationReport.backupTrades) {
      setErrorMessage('Pilih file backup yang valid terlebih dahulu.');
      return;
    }

    if (importMode === 'replace' && !confirmOverwrite) {
      setErrorMessage('Anda harus mencentang kotak konfirmasi sebelum menimpa seluruh data.');
      return;
    }

    if (validationReport.fileFormat === 'zip' && parsedZipArchive) {
      handleExecuteZipRestore(false);
    } else {
      // Standard JSON Restore: await completion so Storage uploads and DB sync finish cleanly
      setIsRestoringJson(true);
      setErrorMessage(null);
      try {
        await onRestoreSuccess(
          validationReport.backupTrades,
          validationReport.backupSettings,
          importMode,
          Boolean(currentUser && syncToCloud)
        );
        onClose();
      } catch (err: any) {
        setErrorMessage(err?.message || 'Gagal memulihkan file cadangan JSON.');
      } finally {
        setIsRestoringJson(false);
      }
    }
  };

  // Execute ZIP Restore (Tahap 2)
  const handleExecuteZipRestore = async (allowPartialScreenshots = false) => {
    if (!parsedZipArchive || !validationReport?.backupTrades) return;

    const controller = new AbortController();
    restoreAbortControllerRef.current = controller;

    setRestoreZipPhase('uploading');
    setRestoreZipFailedItems([]);
    setErrorMessage(null);

    setRestoreZipProgress({
      phase: 'uploading_images',
      currentStep: 0,
      totalSteps: parsedZipArchive.archivedImagesCount,
      message: 'Mempersiapkan pengunggahan screenshot dan pemulihan data...',
      percent: 5,
    });

    try {
      const res = await executeZipRestore({
        archive: parsedZipArchive,
        existingTrades: trades,
        currentUser: currentUser ? { id: currentUser.id, email: currentUser.email } : null,
        mode: importMode,
        syncToCloud: Boolean(currentUser && syncToCloud),
        uploadCache: uploadCacheRef.current,
        allowPartialScreenshots,
        onProgress: (p) => setRestoreZipProgress(p),
        abortSignal: controller.signal,
      });

      if (res.success) {
        setRestoreZipSuccessSummary(res);
        setRestoreZipPhase('completed');

        // Apply final trades and settings to App state & Supabase
        const saveRes = (await onRestoreSuccess(
          res.restoredTrades,
          res.restoredSettings,
          importMode,
          Boolean(currentUser && syncToCloud)
        )) as { success?: boolean; error?: string } | undefined;
        if (saveRes && saveRes.success === false) {
          setErrorMessage(saveRes.error || 'Gagal menyimpan data pemulihan ke penyimpanan lokal browser.');
        }
      } else {
        setRestoreZipFailedItems(res.failedScreenshots || []);
        setRestoreZipPhase('failed');
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        setRestoreZipPhase('idle');
        setRestoreZipProgress(null);
      } else {
        console.error('Error during zip restore:', err);
        setRestoreZipFailedItems([
          {
            tradeId: 'GLOBAL',
            archivePath: 'Arsip ZIP',
            error: err.message || 'Kesalahan sistem saat memulihkan arsip.',
          },
        ]);
        setRestoreZipPhase('failed');
      }
    } finally {
      restoreAbortControllerRef.current = null;
    }
  };

  const handleCancelRestore = () => {
    if (restoreAbortControllerRef.current) {
      restoreAbortControllerRef.current.abort();
    }
    setRestoreZipPhase('idle');
    setRestoreZipProgress(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-[#151D2A] dark:text-[#F2F5F9]">
        {/* Close Button */}
        <button
          onClick={() => {
            if (!isBackupOrRestoreBusy) {
              onClose();
            }
          }}
          disabled={isBackupOrRestoreBusy}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] transition-colors disabled:opacity-50"
          aria-label="Tutup menu cadangan data"
        >
          <X className="h-5 w-5 stroke-[1.75]" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
            <Database className="h-6 w-6 stroke-[1.75]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              Cadangan Data (Export & Import)
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Mendukung Cadangan Lengkap Arsip ZIP (Data & Screenshot) dan Cadangan Ringkas JSON
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34]">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'export'
                ? 'bg-[#1769E8] text-white font-bold'
                : 'text-[#697586] hover:text-[#151D2A] dark:text-[#929BA9] dark:hover:text-[#F2F5F9]'
            }`}
          >
            <Download className="h-4 w-4 stroke-[1.75]" />
            <span>Ekspor Cadangan (Export)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'import'
                ? 'bg-[#1769E8] text-white font-bold'
                : 'text-[#697586] hover:text-[#151D2A] dark:text-[#929BA9] dark:hover:text-[#F2F5F9]'
            }`}
          >
            <Upload className="h-4 w-4 stroke-[1.75]" />
            <span>Impor Cadangan (Import)</span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: EXPORT (Tahap 1) */}
        {/* ================================================================= */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* Format Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setExportFormat('zip');
                  if (zipPhase === 'completed') handleResetZipState();
                }}
                className={`p-3.5 rounded-xl border text-left transition-colors relative flex flex-col justify-between ${
                  exportFormat === 'zip'
                    ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#697586] text-[#697586] dark:text-[#929BA9]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
                      <FileArchive className="h-4 w-4 stroke-[1.75]" />
                    </div>
                    <div>
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] block">Backup Lengkap (ZIP)</span>
                      <span className="text-[10px] text-[#1769E8] dark:text-[#60A5FA] font-medium">Disarankan</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono-numbers px-1.5 py-0.5 rounded bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border border-[#1769E8]/30">
                    Tahap 1
                  </span>
                </div>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed mt-1">
                  Mencakup <strong className="text-[#151D2A] dark:text-[#F2F5F9]">manifest.json</strong>, <strong className="text-[#151D2A] dark:text-[#F2F5F9]">trades.json</strong>, serta folder <strong className="text-[#151D2A] dark:text-[#F2F5F9]">screenshots/</strong> dengan file gambar asli.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('json')}
                className={`p-3.5 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                  exportFormat === 'json'
                    ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#697586] text-[#697586] dark:text-[#929BA9]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
                      <FileJson className="h-4 w-4 stroke-[1.75]" />
                    </div>
                    <div>
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9] block">Backup Ringkas (JSON)</span>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">Format Standar</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed mt-1">
                  Berkas JSON ringan berisi seluruh riwayat transaksi dan pengaturan akun tanpa mengunduh berkas biner screenshot.
                </p>
              </button>
            </div>

            {/* FORMAT A: FULL ZIP BACKUP (TAHAP 1) */}
            {exportFormat === 'zip' && (
              <div className="space-y-3.5">
                <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-1.5">
                      <Image className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                      <span>Inventaris Screenshot & Gambar</span>
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Total <strong className="text-[#1769E8] dark:text-[#60A5FA]">{screenshotStats.totalScreenshots}</strong> gambar ditemukan
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Total Transaksi</span>
                      <span className="text-sm font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                        {trades.length}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Storage Privat</span>
                      <span className="text-sm font-bold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">
                        {screenshotStats.storageCount}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Base64 Lokal</span>
                      <span className="text-sm font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                        {screenshotStats.base64Count}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Link Eksternal</span>
                      <span className="text-sm font-bold font-mono-numbers text-amber-600 dark:text-amber-400">
                        {screenshotStats.externalCount}
                      </span>
                    </div>
                  </div>

                  {screenshotStats.storageCount > 0 && !currentUser?.id && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#151D2A] dark:text-[#F2F5F9] flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                      <div>
                        <strong className="text-amber-600 dark:text-amber-400">Perhatian Autentikasi:</strong> Terdapat {screenshotStats.storageCount} gambar tersimpan di Supabase Storage privat. Anda belum login. Silakan login ke akun Supabase terlebih dahulu agar sistem memiliki izin mengunduh file gambar tersebut.
                      </div>
                    </div>
                  )}

                  {screenshotStats.totalScreenshots > 80 && (
                    <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[10px] text-[#697586] dark:text-[#929BA9]">
                      Terdapat {screenshotStats.totalScreenshots} gambar. Pengunduhan dan kompresi akan diproses secara bertahap agar konsumsi memori browser tetap stabil.
                    </div>
                  )}
                </div>

                {/* State: RUNNING PROGRESS */}
                {zipPhase === 'running' && (
                  <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1769E8] dark:text-[#60A5FA] flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-[#1769E8] stroke-[1.75]" />
                        <span>{zipProgress?.message || 'Membuat arsip backup...'}</span>
                      </span>
                      <span className="font-mono-numbers font-bold text-[#1769E8] dark:text-[#60A5FA]">
                        {zipProgress?.percent || 0}%
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-white dark:bg-[#11151B] overflow-hidden border border-[#DDE3EA] dark:border-[#252B34]">
                      <div
                        className="h-full bg-[#1769E8] transition-all duration-200"
                        style={{ width: `${zipProgress?.percent || 0}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#697586] dark:text-[#929BA9] pt-1">
                      <span>
                        Langkah {zipProgress?.currentStep || 0} dari {zipProgress?.totalSteps || 0}
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelZipBackup}
                        className="text-rose-600 dark:text-rose-400 hover:underline font-medium"
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                )}

                {/* State: COMPLETED SUCCESS */}
                {zipPhase === 'completed' && zipResult && (
                  <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                      <span>Cadangan Lengkap Berhasil Dibuat & Diunduh!</span>
                    </div>
                    <div className="text-[11px] text-[#151D2A] dark:text-[#F2F5F9] space-y-1">
                      <p>
                        Berkas arsip: <strong className="font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">{zipResult.fileName}</strong>
                      </p>
                      <p>
                        Total {zipResult.manifest.summary.archivedScreenshots} file gambar berhasil dikemas ke dalam folder <code className="bg-white dark:bg-[#11151B] px-1 py-0.5 rounded text-[10px]">screenshots/</code> tanpa kegagalan.
                      </p>
                      {zipResult.blob && (
                        <p className="text-[#697586] dark:text-[#929BA9] text-[10px]">
                          Ukuran file ZIP: {(zipResult.blob.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {zipResult.blob && zipResult.fileName && (
                        <button
                          type="button"
                          onClick={() => triggerDownload(zipResult.blob!, zipResult.fileName!)}
                          className="py-2 px-3 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5 stroke-[1.75]" />
                          <span>Unduh Ulang ZIP</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleResetZipState}
                        className="py-2 px-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] text-xs transition-colors"
                      >
                        Selesai
                      </button>
                    </div>
                  </div>
                )}

                {/* State: FAILED DOWNLOADS */}
                {zipPhase === 'failed' && (
                  <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                    <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-bold">
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 stroke-[1.75]" />
                      <span>Cadangan Lengkap Belum Berhasil Dibuat</span>
                    </div>

                    <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                      Terdapat <strong className="text-rose-600 dark:text-rose-400">{zipFailedItems.length}</strong> file screenshot yang gagal diunduh dari Supabase Storage. Sistem menolak membuang gambar secara diam-diam demi menjaga kelengkapan catatan transaksi Anda.
                    </p>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px]">
                      {zipFailedItems.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-2 p-1.5 rounded bg-[#F5F7FA] dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                          <div className="truncate">
                            <span className="font-mono-numbers text-[#1769E8] dark:text-[#60A5FA] font-semibold">{item.tradeId}</span>
                            <span className="text-[#697586] dark:text-[#929BA9] text-[10px] block truncate">{item.pathOrRef}</span>
                          </div>
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 shrink-0 font-medium">
                            {item.error}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartZipBackup(false)}
                        className="py-2 px-3.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />
                        <span>Coba Lagi (Retry)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartZipBackup(true)}
                        className="py-2 px-3.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                        <span>Unduh Sebagai Cadangan Parsial</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResetZipState}
                        className="py-2 px-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] text-xs transition-colors"
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                )}

                {/* State: IDLE */}
                {zipPhase === 'idle' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] space-y-1">
                      <p className="flex items-center gap-1.5 text-[#151D2A] dark:text-[#F2F5F9] font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                        <span>Prinsip Keamanan Ekspor Cadangan:</span>
                      </p>
                      <p>
                        • File screenshot dari bucket privat diunduh menggunakan sesi Supabase login Anda secara terautentikasi.
                      </p>
                      <p>
                        • Path folder dan ID rahasia internal disanitasi menjadi nama berkas aman di dalam arsip ZIP.
                      </p>
                      <p>
                        • Token otentikasi maupun kredensial sensitif tidak pernah disertakan ke dalam file arsip.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartZipBackup(false)}
                      disabled={screenshotStats.storageCount > 0 && !currentUser?.id}
                      className="w-full py-3 px-4 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <FileArchive className="h-4 w-4 stroke-[1.75]" />
                      <span>
                        Mulai Buat Cadangan ZIP Lengkap ({trades.length} Transaksi & {screenshotStats.totalScreenshots} Screenshot)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* FORMAT B: STANDARD JSON BACKUP (PRESERVED 100%) */}
            {exportFormat === 'json' && (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-4 space-y-3">
                  <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                    Ringkasan Data yang Akan Diekspor (JSON):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Total Trade</span>
                      <span className="text-sm font-bold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">
                        {trades.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Trade Asli</span>
                      <span className="text-sm font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                        {trades.filter((t) => !t.isDemo).length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Trade Demo</span>
                      <span className="text-sm font-bold font-mono-numbers text-amber-600 dark:text-amber-400">
                        {trades.filter((t) => t.isDemo).length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Mata Uang</span>
                      <span className="text-sm font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                        {settings.currency} ({settings.currencySymbol})
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] space-y-1">
                    <p>
                      • Berkas JSON mencakup seluruh riwayat trade, evaluasi psikologi, catatan eksekusi, screenshot lokal, serta parameter akun (modal awal dan spesifikasi broker).
                    </p>
                    <p>
                      • File ini dapat disimpan di hard drive, Google Drive pribadi, atau dipindahkan ke ponsel/laptop lain.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExportingJson}
                  className="w-full py-3 px-4 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4 stroke-[1.75]" />
                  <span>
                    {isExportingJson
                      ? 'Menyiapkan Cadangan JSON & Screenshot...'
                      : `Unduh File Cadangan JSON (${trades.length} Transaksi)`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: IMPORT WITH DUAL-FORMAT (JSON & ZIP - Tahap 2) */}
        {/* ================================================================= */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            {/* File Picker Box */}
            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-dashed border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] transition-colors text-center space-y-2">
              <input
                type="file"
                id="backup-file-input"
                accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="backup-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#1769E8] dark:text-[#60A5FA]">
                  {isAnalyzingFile ? (
                    <Loader2 className="h-5 w-5 animate-spin stroke-[1.75]" />
                  ) : (
                    <Upload className="h-5 w-5 stroke-[1.75]" />
                  )}
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-[#1769E8] dark:text-[#60A5FA] hover:underline">
                    Pilih Berkas Cadangan (.ZIP atau .JSON)
                  </span>{' '}
                  <span className="text-[#697586] dark:text-[#929BA9]">atau tarik file ke sini</span>
                </div>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Mendukung arsip lengkap .zip (Tahap 1 & 2) atau berkas ringkas .json
                </span>
              </label>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.75]" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* In-Progress ZIP Restore UI */}
            {restoreZipPhase === 'uploading' && (
              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1769E8] dark:text-[#60A5FA] flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#1769E8] stroke-[1.75]" />
                    <span>{restoreZipProgress?.message || 'Memulihkan data dan screenshot...'}</span>
                  </span>
                  <span className="font-mono-numbers font-bold text-[#1769E8] dark:text-[#60A5FA]">
                    {restoreZipProgress?.percent || 0}%
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-white dark:bg-[#11151B] overflow-hidden border border-[#DDE3EA] dark:border-[#252B34]">
                  <div
                    className="h-full bg-[#1769E8] transition-all duration-200"
                    style={{ width: `${restoreZipProgress?.percent || 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#697586] dark:text-[#929BA9] pt-1">
                  <span>
                    Proses {restoreZipProgress?.currentStep || 0} dari {restoreZipProgress?.totalSteps || 0}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelRestore}
                    className="text-rose-600 dark:text-rose-400 hover:underline font-medium"
                  >
                    Batalkan Pemulihan
                  </button>
                </div>
              </div>
            )}

            {/* Succeeded ZIP Restore Summary */}
            {restoreZipPhase === 'completed' && restoreZipSuccessSummary && (
              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                  <span>Pemulihan Arsip ZIP Selesai!</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                    <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Total Dipulihkan</span>
                    <span className="text-sm font-bold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">
                      {restoreZipSuccessSummary.restoredTrades.length} Trade
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                    <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Screenshot Diunggah</span>
                    <span className="text-sm font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                      {restoreZipSuccessSummary.uploadedScreenshotsCount} File
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                    <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Trade Baru / Update</span>
                    <span className="text-sm font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                      +{restoreZipSuccessSummary.newTradesAdded} / ↻{restoreZipSuccessSummary.duplicateTradesUpdated}
                    </span>
                  </div>
                </div>

                {restoreZipSuccessSummary.unchangedTradesKept > 0 && (
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                    • {restoreZipSuccessSummary.unchangedTradesKept} transaksi lokal Anda yang tidak ada dalam arsip tetap dipertahankan.
                  </p>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors"
                >
                  Selesai & Tutup Jendela
                </button>
              </div>
            )}

            {/* Failed Screenshot Uploads in ZIP Restore (Requirement 7) */}
            {restoreZipPhase === 'failed' && (
              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-bold">
                  <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 stroke-[1.75]" />
                  <span>Pemulihan Arsip Belum Berhasil Sempurna</span>
                </div>

                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                  Terdapat <strong className="text-rose-600 dark:text-rose-400">{restoreZipFailedItems.length}</strong> file screenshot yang gagal diunggah ke Supabase Storage. Sistem tidak membuang data transaksi atau membiarkan path rusak tanpa persetujuan Anda.
                </p>

                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px]">
                  {restoreZipFailedItems.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 p-1.5 rounded bg-[#F5F7FA] dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <div className="truncate">
                        <span className="font-mono-numbers text-[#1769E8] dark:text-[#60A5FA] font-semibold">{item.tradeId}</span>
                        <span className="text-[#697586] dark:text-[#929BA9] text-[10px] block truncate">{item.archivePath}</span>
                      </div>
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 shrink-0 font-medium">
                        {item.error}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleExecuteZipRestore(false)}
                    className="py-2 px-3.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Coba Lagi Screenshot yang Gagal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecuteZipRestore(true)}
                    className="py-2 px-3.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                    <span>Lanjutkan Tanpa Gambar yang Gagal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestoreZipPhase('idle')}
                    className="py-2 px-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] text-xs transition-colors"
                  >
                    Batalkan
                  </button>
                </div>
              </div>
            )}

            {/* Validation Report & Preview (shown when not actively uploading or completed) */}
            {validationReport && restoreZipPhase === 'idle' && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl border bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-1.5">
                      {validationReport.isValid ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {validationReport.fileFormat === 'zip'
                              ? 'Arsip ZIP Valid & Terverifikasi'
                              : 'File JSON Valid & Terverifikasi'}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
                          <span className="text-rose-600 dark:text-rose-400">File Backup Tidak Memenuhi Syarat</span>
                        </>
                      )}
                    </span>
                    <span className="text-[11px] font-mono-numbers px-2 py-0.5 rounded bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] truncate max-w-[180px]">
                      {validationReport.fileName}
                    </span>
                  </div>

                  {/* Valid stats preview */}
                  {validationReport.isValid && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                      <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Trade Valid</span>
                        <span className="text-sm font-bold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA]">
                          {validationReport.validTradesCount} Trade
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Total P/L</span>
                        <span
                          className={`text-sm font-bold font-mono-numbers ${
                            (validationReport.backupTotalProfit || 0) >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {formatCurrency(validationReport.backupTotalProfit || 0, settings)}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">Pengaturan</span>
                        <span className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                          {validationReport.hasSettings ? 'Tersedia' : 'Pakai Saat Ini'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block">
                          {validationReport.fileFormat === 'zip' ? 'Screenshot ZIP' : 'Format'}
                        </span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono-numbers">
                          {validationReport.fileFormat === 'zip'
                            ? `${validationReport.archivedImagesCount || 0} File`
                            : 'JSON Teks'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Warnings if any */}
                  {validationReport.warnings && validationReport.warnings.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#151D2A] dark:text-[#F2F5F9] space-y-1">
                      <span className="font-semibold block flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                        <span>Catatan Arsip:</span>
                      </span>
                      {validationReport.warnings.map((warn, idx) => (
                        <p key={idx} className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                          • {warn}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Errors listing if any */}
                  {validationReport.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400 space-y-1">
                      <span className="font-semibold block">Catatan Validasi:</span>
                      {validationReport.errors.map((err, idx) => (
                        <p key={idx} className="text-[11px]">
                          • {err}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Import Mode Selection */}
                {validationReport.isValid && (
                  <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                    <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                      Pilih Metode Pemulihan:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* MERGE OPTION */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                          importMode === 'merge'
                            ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9]'
                            : 'bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'merge'}
                            onChange={() => setImportMode('merge')}
                            className="text-[#1769E8]"
                          />
                          <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">Gabungkan (Merge)</span>
                        </div>
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] leading-tight">
                          Menambahkan transaksi dari cadangan tanpa menghapus data yang ada. Jika ada ID yang sama, data diperbarui.
                        </span>
                      </label>

                      {/* REPLACE OPTION */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between ${
                          importMode === 'replace'
                            ? 'bg-white dark:bg-[#171D26] border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9]'
                            : 'bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                            className="text-[#1769E8]"
                          />
                          <span className="font-bold text-rose-600 dark:text-rose-400">Ganti Total (Overwrite)</span>
                        </div>
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] leading-tight">
                          Mengganti seluruh trade di browser lokal dengan data cadangan ini.
                        </span>
                      </label>
                    </div>

                    {/* Conflict Explanation Details for Merge */}
                    {importMode === 'merge' && mergeStats && (
                      <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] space-y-1">
                        <span className="font-semibold block text-[#151D2A] dark:text-[#F2F5F9]">
                          Rincian Penggabungan (Merge):
                        </span>
                        <p>• <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{mergeStats.newItems}</strong> transaksi baru akan ditambahkan ke riwayat Anda.</p>
                        {mergeStats.duplicates > 0 && (
                          <p>• <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{mergeStats.duplicates}</strong> transaksi yang sudah ada (ID cocok) akan diperbarui nilainya dari cadangan.</p>
                        )}
                        <p>• <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{mergeStats.unchanged}</strong> transaksi lama di browser Anda yang tidak ada dalam cadangan tetap aman dan utuh.</p>
                      </div>
                    )}

                    {/* Explicit Confirmation Checkbox for Overwrite */}
                    {importMode === 'replace' && (
                      <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
                        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#151D2A] dark:text-[#F2F5F9]">
                          <input
                            type="checkbox"
                            checked={confirmOverwrite}
                            onChange={(e) => setConfirmOverwrite(e.target.checked)}
                            className="mt-0.5 rounded border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] focus:ring-0"
                          />
                          <span className="text-[11px] leading-relaxed">
                            <strong className="text-amber-600 dark:text-amber-400">Konfirmasi Penggantian:</strong> Saya memahami bahwa {trades.length} transaksi yang ada saat ini di browser akan digantikan seluruhnya oleh {validationReport.validTradesCount} transaksi dari berkas cadangan ini.
                          </span>
                        </label>
                        <p className="text-[10px] text-[#697586] dark:text-[#929BA9] pl-6 leading-tight">
                          Pemberitahuan Cloud: Penggantian ini hanya berlaku untuk tampilan dan cache browser lokal Anda. Transaksi yang ada di database cloud Supabase TIDAK dihapus dari server demi keselamatan data.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Cloud Sync Option when authenticated */}
                {validationReport.isValid && currentUser && (
                  <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-1.5">
                        <Cloud className="h-3.5 w-3.5 text-[#1769E8] dark:text-[#60A5FA] stroke-[1.75]" />
                        <span>Sinkronisasi Cloud Supabase</span>
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] truncate max-w-[200px]">
                        {currentUser.email || 'Akun Terhubung'}
                      </span>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#151D2A] dark:text-[#F2F5F9]">
                      <input
                        type="checkbox"
                        checked={syncToCloud}
                        onChange={(e) => setSyncToCloud(e.target.checked)}
                        className="mt-0.5 rounded border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] focus:ring-0"
                      />
                      <div className="text-[11px] leading-relaxed">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          Unggah & sinkronkan langsung ke database Supabase setelah pemulihan
                        </span>
                        <p className="text-[10px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                          {syncToCloud
                            ? validationReport.fileFormat === 'zip'
                              ? 'Transaksi baru disimpan, screenshot diunggah ke folder Storage Anda, dan transaksi yang ada diperbarui secara aman.'
                              : 'Transaksi baru akan disimpan dan transaksi yang sudah ada diperbarui secara aman tanpa duplikasi.'
                            : 'Peringatan: Jika tidak dicentang, data hanya dimuat ke browser dan BELUM tersimpan di server cloud Supabase.'}
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Confirm Action Button */}
                {validationReport.isValid && (
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={(importMode === 'replace' && !confirmOverwrite) || isRestoringJson}
                    className="w-full py-3 px-4 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4 stroke-[1.75]" />
                    <span>
                      {isRestoringJson
                        ? 'Memulihkan & Menyinkronkan Screenshot ke Cloud...'
                        : importMode === 'replace'
                        ? `Ganti Seluruh Data (${validationReport.validTradesCount} Trade)${currentUser && syncToCloud ? ' & Simpan ke Cloud' : ''}`
                        : `Gabungkan ${validationReport.validTradesCount} Trade${currentUser && syncToCloud ? ' & Simpan ke Cloud' : ''}`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

