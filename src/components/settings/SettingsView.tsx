/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppSettings, CurrencyCode } from '../../types/settings';
import { Trade } from '../../types/trade';
import { exportTradesToCsv, downloadCsvFile } from '../../utils/csv';
import { generateBackupJson } from '../../utils/storage';
import { prepareTradesForJsonBackup, mergeTradesDatasets } from '../../utils/supabaseSync';
import { DEMO_TRADES, isDemoTrade } from '../../utils/demoData';
import { useTheme } from '../../utils/theme';
import { CsvImportModal } from './CsvImportModal';
import { FinancialAuditModal } from './FinancialAuditModal';
import {
  Save,
  Download,
  Upload,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  FileJson,
  Terminal,
  Info,
  LogIn,
  User,
  Database,
  Sun,
  Moon,
} from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  trades: Trade[];
  onSaveSettings: (settings: AppSettings) => void;
  onUpdateTrades: (trades: Trade[]) => void;
  onImportCsvTrades?: (trades: Trade[], mode: 'merge' | 'replace') => Promise<void> | void;
  onLoadDemoTrades?: () => Promise<void> | void;
  onClearAllTrades?: () => Promise<void> | void;
  onRequestClearDemo: () => void;
  onOpenLocalInfo: () => void;
  onOpenBackupModal: () => void;
  currentUser?: any;
  onOpenAuth?: () => void;
  onOpenAccount?: () => void;
  onOpenConfig?: () => void;
  isCloudSyncing?: boolean;
  onSyncLocalToCloud?: () => void;
  onReloadFromCloud?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  trades,
  onSaveSettings,
  onUpdateTrades,
  onImportCsvTrades,
  onLoadDemoTrades,
  onClearAllTrades,
  onRequestClearDemo,
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
  onOpenConfig,
  isCloudSyncing = false,
  onSyncLocalToCloud,
  onReloadFromCloud,
}) => {
  const { theme, setTheme, isDark } = useTheme();
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Keep formData synchronized whenever settings prop changes (e.g. after JSON/ZIP restore or cloud sync)
  useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  const demoCount = trades.filter((t) => isDemoTrade(t)).length;
  const realCount = trades.filter((t) => !isDemoTrade(t)).length;

  const handleCurrencyChange = (curr: CurrencyCode) => {
    let symbol = '$';
    if (curr === 'IDR') symbol = 'Rp';
    if (curr === 'EUR') symbol = '€';
    setFormData({ ...formData, currency: curr, currencySymbol: symbol });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setFeedbackMsg({ text: 'Pengaturan akun berhasil disimpan ke browser!', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleExportCsv = () => {
    if (trades.length === 0) {
      setFeedbackMsg({ text: 'Belum ada trade untuk diekspor ke CSV.', type: 'error' });
      return;
    }
    const csvStr = exportTradesToCsv(trades);
    downloadCsvFile(csvStr, `TradeVault_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    setFeedbackMsg({ text: 'File CSV berhasil diunduh.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleQuickExportJson = async () => {
    const portableTrades = await prepareTradesForJsonBackup(trades, currentUser?.id || null);
    const jsonStr = generateBackupJson(portableTrades, formData);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TradeVault_FullBackup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setFeedbackMsg({ text: 'Cadangan data JSON berhasil dibuat dan diunduh.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleLoadDemo = async () => {
    if (onLoadDemoTrades) {
      await onLoadDemoTrades();
    } else {
      const nonDemo = trades.filter((t) => !isDemoTrade(t));
      onUpdateTrades([...nonDemo, ...DEMO_TRADES]);
    }
    setFeedbackMsg({ text: `Berhasil memuat ${DEMO_TRADES.length} transaksi contoh DEMO.`, type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleConfirmClearAllTrades = async () => {
    setIsConfirmingClearAll(false);
    if (onClearAllTrades) {
      await onClearAllTrades();
    } else {
      onUpdateTrades([]);
    }
    setFeedbackMsg({ text: 'Seluruh riwayat trade telah dihapus.', type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleImportCsvSuccess = async (newTrades: Trade[], mode: 'merge' | 'replace') => {
    if (onImportCsvTrades) {
      await onImportCsvTrades(newTrades, mode);
    } else {
      const { finalTrades } = mergeTradesDatasets(trades, newTrades, mode);
      onUpdateTrades(finalTrades);
    }
    setFeedbackMsg({ text: `Berhasil mengimpor ${newTrades.length} trade dari CSV!`, type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div>
          <h2 className="text-xl font-bold text-[#151D2A] dark:text-[#F2F5F9]">
            Pengaturan Akun & Cadangan Data
          </h2>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
            Kelola modal awal, mata uang, spesifikasi broker XAUUSD, tema tampilan, ekspor/impor CSV, dan backup persisten
          </p>
        </div>

        {/* Persistence & Prototype Status */}
        <button
          type="button"
          onClick={onOpenLocalInfo}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <HardDrive className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
          <span className="font-semibold">PROTOTIPE LOKAL ({trades.length} Trade Tersimpan)</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs flex items-center gap-2 font-medium animate-in fade-in">
          {feedbackMsg.type === 'success' ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
          )}
          <span className={feedbackMsg.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
            {feedbackMsg.text}
          </span>
        </div>
      )}

      {/* Interface Theme & Appearance Card */}
      <div id="settings-appearance" className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              {isDark ? (
                <Moon className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              ) : (
                <Sun className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              )}
              <span>Tema & Tampilan Antarmuka (Light / Dark Mode)</span>
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Pilihan tema disimpan secara mandiri di browser dan dipertahankan saat reload atau login
            </p>
          </div>
          <span className="text-[11px] font-mono-numbers px-2.5 py-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] self-start sm:self-auto">
            Tema Aktif: <strong className="text-[#1769E8] dark:text-[#60A5FA] capitalize">{theme === 'dark' ? 'Mode Gelap (Dark)' : 'Mode Terang (Light)'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Dark Mode Choice Card */}
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex items-start gap-3.5 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-[#080A0E] border-[#1769E8] text-[#F2F5F9]'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:border-[#697586]'
            }`}
          >
            <div
              className={`p-2.5 rounded-lg border shrink-0 ${
                theme === 'dark'
                  ? 'bg-[#171D26] text-[#F2F5F9] border-[#252B34]'
                  : 'bg-white dark:bg-[#11151B] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
              }`}
            >
              <Moon className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${theme === 'dark' ? 'text-[#F2F5F9]' : 'text-[#151D2A] dark:text-[#F2F5F9]'}`}>
                  Mode Gelap (Dark Mode)
                </span>
                {theme === 'dark' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1769E8] text-white">
                    Aktif
                  </span>
                )}
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-[#929BA9]' : 'text-[#697586] dark:text-[#929BA9]'}`}>
                Permukaan netral gelap dengan aksen biru terfokus, kontras tinggi, dan minim silau untuk sesi analisis panjang.
              </p>
            </div>
          </button>

          {/* Light Mode Choice Card */}
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex items-start gap-3.5 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-white border-[#1769E8] text-[#151D2A]'
                : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:border-[#697586]'
            }`}
          >
            <div
              className={`p-2.5 rounded-lg border shrink-0 ${
                theme === 'light'
                  ? 'bg-[#EEF2F6] text-[#151D2A] border-[#DDE3EA]'
                  : 'bg-white dark:bg-[#11151B] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
              }`}
            >
              <Sun className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#151D2A] dark:text-[#F2F5F9]">Mode Terang (Light Mode)</span>
                {theme === 'light' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1769E8] text-white">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                Permukaan netral cerah berlatar putih bersih, kontras tajam, dan optimal untuk pemakaian di siang hari.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* PROTOTIPE LOKAL Architecture Banner */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
              <HardDrive className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34]">
                  PROTOTIPE LOKAL
                </span>
                <span className="text-xs text-[#151D2A] dark:text-[#F2F5F9] font-semibold">
                  100% Gratis & Mandiri (Tanpa Supabase)
                </span>
              </div>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1">
                Data disimpan di memori browser Anda (<code className="text-[#1769E8] dark:text-[#60A5FA] font-semibold">localStorage</code>) dan tetap ada setelah browser di-refresh. Data tidak otomatis tersinkronkan antarperangkat.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenLocalInfo}
              className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold transition-colors flex items-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
            >
              <Info className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Info Lengkap</span>
            </button>
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>Menu Backup JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supabase Cloud & Account Card */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
              <Database className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]">Supabase Cloud Database & Auth</h3>
                {currentUser ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEF2F6] dark:bg-[#171D26] text-emerald-600 dark:text-emerald-400 border border-[#DDE3EA] dark:border-[#252B34]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Terhubung ({currentUser.email})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9]">
                    Belum Masuk
                  </span>
                )}
              </div>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1">
                {currentUser
                  ? 'Tersambung ke tabel public.trades dengan proteksi Row Level Security (RLS).'
                  : 'Daftar atau masuk dengan email & kata sandi untuk sinkronisasi ke tabel Supabase.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenAccount}
                className="px-3.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <User className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                <span>Kelola Akun</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5 stroke-[1.75]" />
                <span>Masuk / Daftar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenConfig}
              className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold transition-colors flex items-center gap-1.5 border border-[#DDE3EA] dark:border-[#252B34] cursor-pointer"
              title="Pengaturan URL & Kunci API Supabase"
            >
              <Database className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Konfigurasi</span>
            </button>
          </div>
        </div>

        {/* Sync Controls & Info for Authenticated User */}
        {currentUser && (
          <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#697586] dark:text-[#929BA9]">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[1.75]" />
              <span>
                Tabel <code className="text-[#1769E8] dark:text-[#60A5FA] font-mono-numbers font-semibold">public.trades</code> aktif. Transaksi tersimpan per pengguna (<code className="text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers font-semibold">auth.uid() = user_id</code>).
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onSyncLocalToCloud && trades.length > 0 && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={onSyncLocalToCloud}
                  className="px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Unggah seluruh transaksi lokal ke database Supabase"
                >
                  <Upload className="h-3.5 w-3.5 stroke-[1.75]" />
                  <span>{isCloudSyncing ? 'Menyinkronkan...' : `Unggah ${trades.length} Trade ke Supabase`}</span>
                </button>
              )}

              {onReloadFromCloud && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={onReloadFromCloud}
                  className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Ambil data transaksi terbaru dari Supabase"
                >
                  <RefreshCw className={`h-3.5 w-3.5 stroke-[1.75] ${isCloudSyncing ? 'animate-spin text-[#1769E8]' : 'text-[#697586] dark:text-[#929BA9]'}`} />
                  <span>Ambil dari Cloud</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid: Account Settings & Broker Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form: Account Balance & Currency */}
        <form onSubmit={handleSave} className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Parameter Akun & Saldo</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">Dasar perhitungan metrik pertumbuhan dan kalkulator risiko</p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Mata Uang Akun</label>
              <div className="grid grid-cols-3 gap-2">
                {(['USD', 'IDR', 'EUR'] as CurrencyCode[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleCurrencyChange(c)}
                    className={`py-2 rounded-lg border font-bold transition-colors cursor-pointer ${
                      formData.currency === c
                        ? 'bg-[#1769E8] text-white border-[#1769E8]'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    {c} ({c === 'IDR' ? 'Rp' : c === 'EUR' ? '€' : '$'})
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Modal Awal Akun ({formData.currencySymbol})
              </label>
              <input
                type="number"
                step="1"
                value={formData.startingBalance}
                onChange={(e) =>
                  setFormData({ ...formData, startingBalance: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Default Risiko per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.defaultRiskPercent}
                onChange={(e) =>
                  setFormData({ ...formData, defaultRiskPercent: parseFloat(e.target.value) || 1.0 })
                }
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Target Return Bulanan (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={formData.targetMonthlyReturnPercent}
                onChange={(e) =>
                  setFormData({ ...formData, targetMonthlyReturnPercent: parseFloat(e.target.value) || 8.0 })
                }
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Save className="h-4 w-4 stroke-[1.75]" />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>

        {/* Broker XAUUSD Specifications */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Spesifikasi Broker (XAUUSD)</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Setiap broker memiliki nilai kontrak berbeda; sesuaikan agar kalkulasi lot akurat
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Contract Size (Troy Ounces per 1.0 Standard Lot)
              </label>
              <select
                value={formData.xauusdContractSize}
                onChange={(e) =>
                  setFormData({ ...formData, xauusdContractSize: Number(e.target.value) })
                }
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value={100}>100 oz (Standar Industri Forex/CFD)</option>
                <option value={10}>10 oz (Akun Mini)</option>
                <option value={1}>1 oz (Akun Micro / Cent)</option>
              </select>
            </div>

            <div>
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Perkiraan Komisi Broker per Lot ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={formData.brokerCommissionPerLot}
                onChange={(e) =>
                  setFormData({ ...formData, brokerCommissionPerLot: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              />
            </div>

            <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] space-y-1.5 text-[#697586] dark:text-[#929BA9]">
              <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">Catatan Perhitungan:</span>
              <p>
                Jika broker Anda menggunakan akun Cent atau nilai 10 oz, pilih opsi di atas agar kalkulator posisi dan simulasi risiko tidak over-leveraging.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Backup, CSV Export/Import & Demo Data Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV & JSON Export / Import */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2">
              <FileJson className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Ekspor & Cadangan Data (Backup)</span>
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Ekspor ke spreadsheet Excel/CSV atau kelola backup pemulihan JSON dengan verifikasi
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50 hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Ekspor ke CSV</span>
            </button>

            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50 hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
            >
              <Upload className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Impor dari CSV...</span>
            </button>

            <button
              onClick={handleQuickExportJson}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8]/50 hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Download Backup JSON</span>
            </button>

            <button
              onClick={onOpenBackupModal}
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-[#1769E8]/10 dark:bg-[#1769E8]/15 border border-[#1769E8]/30 hover:bg-[#1769E8]/20 text-xs font-semibold text-[#1769E8] dark:text-[#60A5FA] transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 stroke-[1.75]" />
              <span>Impor & Validasi JSON...</span>
            </button>
          </div>
        </div>

        {/* Demo Data & Database Management */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
          <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Manajemen Data & Dataset Demo</h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9]">
              Data transaksi asli: <strong className="text-emerald-600 dark:text-emerald-400 font-mono-numbers">{realCount}</strong> •
              Data DEMO: <strong className="text-amber-600 dark:text-amber-400 font-mono-numbers">{demoCount}</strong>
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <div className="text-xs">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">Muat Ulang Transaksi DEMO</span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Tambahkan 8 transaksi contoh XAUUSD realistis untuk menguji dashboard.
                </span>
              </div>
              <button
                onClick={handleLoadDemo}
                className="px-3.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                Muat Demo
              </button>
            </div>

            {demoCount > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <div className="text-xs">
                  <span className="font-semibold text-amber-600 dark:text-amber-400 block">Hapus Khusus Data DEMO</span>
                  <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Bersihkan {demoCount} transaksi contoh tanpa menyentuh data asli Anda.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onRequestClearDemo}
                  className="px-3.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-amber-600 dark:text-amber-400 border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] transition-colors shrink-0 cursor-pointer"
                >
                  Hapus Demo ({demoCount})
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <div className="text-xs">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                  Pengujian Otomatis Modul Finansial
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Uji 46 poin rumus (Win Rate, Profit Factor, Expectancy, Max DD, Lot Sizing) dengan dataset tiruan terisolasi.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-bold transition-colors shrink-0 cursor-pointer"
              >
                Jalankan Pengujian
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <div className="text-xs">
                <span className="font-semibold text-rose-600 dark:text-rose-400 block">Reset Total Jurnal</span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Hapus seluruh data transaksi untuk memulai jurnal baru dari nol.
                </span>
              </div>
              {!isConfirmingClearAll ? (
                <button
                  type="button"
                  disabled={isCloudSyncing || trades.length === 0}
                  onClick={() => setIsConfirmingClearAll(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-rose-600 dark:text-rose-400 border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
                >
                  Reset Semua
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={() => setIsConfirmingClearAll(false)}
                    className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold hover:bg-[#DDE3EA] dark:hover:bg-[#252B34] transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={handleConfirmClearAllTrades}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition-colors cursor-pointer"
                  >
                    Ya, Hapus Semua
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onConfirmImport={handleImportCsvSuccess}
      />

      {/* Financial Calculations Audit Modal */}
      <FinancialAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
    </div>
  );
};
