/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import { formatCurrency } from '../../utils/calculations';
import { isDemoTrade, DEMO_TRADES } from '../../utils/demoData';
import { mergeTradesDatasets } from '../../utils/supabaseSync';
import { useTheme } from '../../utils/theme';
import { CsvImportModal } from './CsvImportModal';
import { FinancialAuditModal } from './FinancialAuditModal';
import { TradingPreferencesModal, PreferenceCategory } from './TradingPreferencesModal';

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
  const { theme, setTheme } = useTheme();

  // Modals state
  const [activePrefModal, setActivePrefModal] = useState<PreferenceCategory | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const demoCount = trades.filter((t) => isDemoTrade(t)).length;
  const realCount = trades.filter((t) => !isDemoTrade(t)).length;

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSavePreferences = (newSettings: AppSettings) => {
    onSaveSettings(newSettings);
    showFeedback('Pengaturan berhasil diperbarui!');
  };

  const handleLoadDemo = async () => {
    if (onLoadDemoTrades) {
      await onLoadDemoTrades();
    } else {
      const nonDemo = trades.filter((t) => !isDemoTrade(t));
      onUpdateTrades([...nonDemo, ...DEMO_TRADES]);
    }
    showFeedback(`Berhasil memuat ${DEMO_TRADES.length} transaksi contoh DEMO.`);
  };

  const handleConfirmClearAllTrades = async () => {
    setIsConfirmingClearAll(false);
    if (onClearAllTrades) {
      await onClearAllTrades();
    } else {
      onUpdateTrades([]);
    }
    showFeedback('Seluruh riwayat transaksi telah dihapus.');
  };

  const handleImportCsvSuccess = async (newTrades: Trade[], mode: 'merge' | 'replace') => {
    if (onImportCsvTrades) {
      await onImportCsvTrades(newTrades, mode);
    } else {
      const { finalTrades } = mergeTradesDatasets(trades, newTrades, mode);
      onUpdateTrades(finalTrades);
    }
    showFeedback(`Berhasil mengimpor ${newTrades.length} transaksi dari CSV!`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Top Header */}
      <div className="pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <h2 className="text-xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
          Pengaturan &amp; Cadangan
        </h2>
        <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
          Workspace minimalis untuk mengelola tampilan antarmuka, akun trading, sinkronisasi cloud, cadangan data, dan dataset.
        </p>
      </div>

      {/* Feedback Message Banner */}
      {feedbackMsg && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-semibold animate-in fade-in duration-150 ${
            feedbackMsg.type === 'success'
              ? 'bg-[#EEF2F6] dark:bg-[#171D26] border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-[#EEF2F6] dark:bg-[#171D26] border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* ========================================================================= */}
      {/* A. TAMPILAN */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block px-1">
          Tampilan
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
              Tema Tampilan
            </span>
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
              Pilihan mode visual aplikasi TradeVault disimpan di browser Anda
            </span>
          </div>

          <div className="flex items-center rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-[#1458C4] font-semibold shadow-xs'
                  : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
              }`}
            >
              Terang
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[#171D26] text-[#38BDF8] font-semibold shadow-xs'
                  : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
              }`}
            >
              Gelap
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* B. AKUN & PREFERENSI TRADING */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block px-1">
          Akun &amp; Preferensi Trading
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
          {/* Row 1: Saldo Akun */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Saldo Akun (Modal Awal)
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                Dasar kalkulasi pertumbuhan dan risiko
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(settings.startingBalance, settings)}
              </span>
              <button
                type="button"
                onClick={() => setActivePrefModal('balance')}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Ubah ›
              </button>
            </div>
          </div>

          {/* Row 2: Mata Uang */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Mata Uang Akun
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                Format simbol moneter jurnal
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                {settings.currency} ({settings.currencySymbol})
              </span>
              <button
                type="button"
                onClick={() => setActivePrefModal('currency')}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Ubah ›
              </button>
            </div>
          </div>

          {/* Row 3: Spesifikasi Broker */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Spesifikasi Broker (XAUUSD)
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 truncate">
                1 Pip = ${settings.xauusdPipSize === 0.1 ? '0.10' : '1.00'} • {settings.xauusdContractSize} oz • Komisi ${settings.brokerCommissionPerLot}/lot
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setActivePrefModal('broker')}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Atur ›
              </button>
            </div>
          </div>

          {/* Row 4: Parameter Risiko & Target */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Parameter Risiko &amp; Target
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 truncate">
                Risiko {settings.defaultRiskPercent}% per trade ({settings.riskCapitalBasis === 'BALANCE' ? 'Saldo Awal' : 'Ekuitas'}) • Target {settings.targetMonthlyReturnPercent}%/bln
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setActivePrefModal('risk')}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Atur ›
              </button>
            </div>
          </div>

          {/* Row 5: Penyesuaian Modal (Deposit / WD) */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Penyesuaian Modal
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 truncate">
                Deposit +{formatCurrency(settings.totalDeposits ?? 0, settings)} • Penarikan -{formatCurrency(settings.totalWithdrawals ?? 0, settings)}
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setActivePrefModal('adjustments')}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Atur ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* C. AKUN & KONEKSI */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block px-1">
          Akun &amp; Koneksi
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
          {/* Row 1: Informasi Akun TradeVault */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Akun TradeVault
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 truncate">
                {currentUser ? currentUser.email : 'Mode Offline / Lokal (Belum Masuk)'}
              </span>
            </div>
            <div className="shrink-0">
              {currentUser ? (
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
                >
                  Kelola ›
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
                >
                  Masuk ›
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Sinkronisasi Cloud */}
          <div className="px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  Sinkronisasi Cloud Supabase
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {currentUser
                    ? 'Tabel public.trades aktif • RLS terlindungi'
                    : 'Sinkronisasi nonaktif. Masuk akun untuk mengaktifkan sinkronisasi.'}
                </span>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={onOpenConfig}
                  className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
                >
                  Konfigurasi ›
                </button>
              </div>
            </div>

            {/* Cloud Controls if logged in */}
            {currentUser && (
              <div className="pt-2 flex flex-wrap items-center gap-2">
                {onSyncLocalToCloud && trades.length > 0 && (
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={onSyncLocalToCloud}
                    className="px-3 py-1.5 rounded-lg bg-[#1458C4] hover:bg-[#11469e] text-white text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isCloudSyncing ? 'Menyinkronkan...' : `Unggah ${trades.length} Trade ke Cloud`}
                  </button>
                )}
                {onReloadFromCloud && (
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={onReloadFromCloud}
                    className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Ambil dari Cloud
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Row 3: Penyimpanan Lokal */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Penyimpanan Lokal Browser
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                {trades.length} Transaksi tersimpan di browser (localStorage)
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={onOpenLocalInfo}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Detail ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* D. BACKUP & PEMULIHAN */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block px-1">
          Backup &amp; Pemulihan
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
              Cadangan Data (Backup &amp; Restore)
            </span>
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
              Simpan atau pulihkan transaksi dan data pendukung TradeVault dalam format ZIP lengkap, JSON, atau CSV.
            </span>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
            >
              Buka ›
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* E. MANAJEMEN DATA */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block px-1">
          Manajemen Data
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl divide-y divide-[#DDE3EA] dark:divide-[#252B34]">
          {/* Row 1: Transaksi Demo */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Dataset Transaksi Demo
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                {demoCount} transaksi contoh • {realCount} transaksi asli
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleLoadDemo}
                className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium transition-colors cursor-pointer"
              >
                Muat Demo
              </button>
              {demoCount > 0 && (
                <button
                  type="button"
                  onClick={onRequestClearDemo}
                  className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-amber-600 dark:text-amber-400 hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hapus Demo ({demoCount})
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Audit Rumus Finansial */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Audit Rumus Finansial
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 truncate">
                Uji 46 formula matematis (Win Rate, Profit Factor, Expectancy, Drawdown, Lot Sizing)
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Jalankan ›
              </button>
            </div>
          </div>

          {/* Row 3: Impor CSV Spreadsheet */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                Impor Transaksi Spreadsheet (CSV)
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                Unggah riwayat transaksi dari format tabel CSV/Excel
              </span>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(true)}
                className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline cursor-pointer"
              >
                Impor ›
              </button>
            </div>
          </div>

          {/* Row 4: Tindakan Sensitif — Reset Total Jurnal */}
          <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block">
                Reset Total Jurnal
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                Hapus seluruh transaksi untuk memulai jurnal baru dari nol. Tindakan ini tidak dapat dibatalkan.
              </span>
            </div>

            <div className="shrink-0 self-start sm:self-auto">
              {!isConfirmingClearAll ? (
                <button
                  type="button"
                  disabled={isCloudSyncing || trades.length === 0}
                  onClick={() => setIsConfirmingClearAll(true)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-900 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Reset Semua
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={() => setIsConfirmingClearAll(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={handleConfirmClearAllTrades}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Ya, Hapus Semua
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trading Preferences Modal (Group B Editor) */}
      <TradingPreferencesModal
        isOpen={Boolean(activePrefModal)}
        onClose={() => setActivePrefModal(null)}
        category={activePrefModal || 'balance'}
        settings={settings}
        onSave={handleSavePreferences}
      />

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
