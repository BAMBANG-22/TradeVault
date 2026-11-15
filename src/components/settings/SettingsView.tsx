/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Globe,
  Wallet,
  Coins,
  SlidersHorizontal,
  ShieldCheck,
  ArrowLeftRight,
  User,
  Cloud,
  Server,
  Wifi,
  WifiOff,
  Database,
  HardDriveDownload,
  FileSpreadsheet,
  Layers,
  Calculator,
  Trash2,
  ChevronRight,
  RefreshCw,
  UploadCloud,
  Check,
  AlertCircle,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import { formatCurrency } from '../../utils/calculations';
import { isDemoTrade, DEMO_TRADES } from '../../utils/demoData';
import { mergeTradesDatasets } from '../../utils/supabaseSync';
import { useTheme } from '../../utils/theme';
import { useLanguage } from '../../utils/language';
import { CsvImportModal } from './CsvImportModal';
import { FinancialAuditModal } from './FinancialAuditModal';
import { TradingPreferencesModal, PreferenceCategory } from './TradingPreferencesModal';
import {
  getStandaloneBackendUrl,
  getBackendSourceInfo,
  saveStandaloneBackendUrl,
  clearStandaloneBackendUrl,
  testStandaloneBackendConnection,
  StandaloneBackendHealthResult,
  isNewsCycleOfflineMode,
  setNewsCycleOfflineMode,
  NEWS_CYCLE_OFFLINE_MODE_CHANGE_EVENT,
  NEWS_CYCLE_OFFLINE_MODE_STORAGE_KEY,
} from '../../utils/apiConfig';

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
  const { language, setLanguage, tr } = useLanguage();

  // Modals state
  const [activePrefModal, setActivePrefModal] = useState<PreferenceCategory | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Standalone Backend Server config state
  const [isEditingBackend, setIsEditingBackend] = useState(false);
  const [backendInfo, setBackendInfo] = useState(() => getBackendSourceInfo());
  const [backendUrlInput, setBackendUrlInput] = useState(() => getStandaloneBackendUrl());
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [backendHealth, setBackendHealth] = useState<StandaloneBackendHealthResult | null>(null);
  const [isNewsCycleOffline, setIsNewsCycleOffline] = useState(() => isNewsCycleOfflineMode());

  useEffect(() => {
    const syncOffline = () => setIsNewsCycleOffline(isNewsCycleOfflineMode());
    const handleStorage = (e: StorageEvent) => {
      if (e.key === NEWS_CYCLE_OFFLINE_MODE_STORAGE_KEY) {
        syncOffline();
      }
    };
    window.addEventListener(NEWS_CYCLE_OFFLINE_MODE_CHANGE_EVENT, syncOffline);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(NEWS_CYCLE_OFFLINE_MODE_CHANGE_EVENT, syncOffline);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    window.setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleToggleNewsCycleOffline = () => {
    const next = !isNewsCycleOffline;
    setNewsCycleOfflineMode(next);
    setIsNewsCycleOffline(next);
    showFeedback(
      next
        ? tr(
            'Mode Offline aktif untuk Trade News & Cycle. Scan Kilat AI tetap aktif online.',
            'Offline Mode enabled for Trade News & Cycle. Instant AI Scan remains online.'
          )
        : tr(
            'Mode Online aktif kembali untuk Trade News & Cycle.',
            'Online Mode re-enabled for Trade News & Cycle.'
          )
    );
  };

  const demoCount = trades.filter((t) => isDemoTrade(t)).length;
  const realCount = trades.filter((t) => !isDemoTrade(t)).length;

  const handleSavePreferences = (newSettings: AppSettings) => {
    onSaveSettings(newSettings);
    showFeedback(tr('Pengaturan berhasil diperbarui.', 'Settings updated successfully.'));
  };

  const handleLoadDemo = async () => {
    if (onLoadDemoTrades) {
      await onLoadDemoTrades();
    } else {
      const nonDemo = trades.filter((t) => !isDemoTrade(t));
      onUpdateTrades([...nonDemo, ...DEMO_TRADES]);
    }
    showFeedback(
      tr(
        `Berhasil memuat ${DEMO_TRADES.length} transaksi contoh DEMO.`,
        `Successfully loaded ${DEMO_TRADES.length} DEMO sample trades.`
      )
    );
  };

  const handleConfirmClearAllTrades = async () => {
    setIsConfirmingClearAll(false);
    if (onClearAllTrades) {
      await onClearAllTrades();
    } else {
      onUpdateTrades([]);
    }
    showFeedback(tr('Seluruh riwayat transaksi telah dihapus.', 'All trade history has been cleared.'));
  };

  const handleImportCsvSuccess = async (newTrades: Trade[], mode: 'merge' | 'replace') => {
    if (onImportCsvTrades) {
      await onImportCsvTrades(newTrades, mode);
    } else {
      const { finalTrades } = mergeTradesDatasets(trades, newTrades, mode);
      onUpdateTrades(finalTrades);
    }
    showFeedback(
      tr(
        `Berhasil mengimpor ${newTrades.length} transaksi dari CSV.`,
        `Successfully imported ${newTrades.length} trades from CSV.`
      )
    );
  };

  const handleTestBackend = async (customUrl?: string) => {
    setIsTestingBackend(true);
    const result = await testStandaloneBackendConnection(customUrl);
    setBackendHealth(result);
    setIsTestingBackend(false);
  };

  const handleSaveBackendUrl = async (andTest = false) => {
    const saved = saveStandaloneBackendUrl(backendUrlInput);
    const nextInfo = getBackendSourceInfo();
    setBackendInfo(nextInfo);
    setBackendUrlInput(nextInfo.url);
    if (!saved && backendUrlInput.trim()) {
      showFeedback(
        tr(
          'Format URL tidak valid. Gunakan URL http:// atau https:// yang benar.',
          'Invalid URL format. Please enter a valid http:// or https:// URL.'
        ),
        'error'
      );
      return;
    }
    showFeedback(
      saved
        ? tr('URL Server Backend disimpan.', 'Backend Server URL saved.')
        : tr(
            'Override URL dihapus; kembali ke konfigurasi otomatis.',
            'URL override cleared; reverted to automatic configuration.'
          )
    );
    if (andTest) {
      await handleTestBackend(nextInfo.url);
    }
  };

  const handleResetBackendUrl = () => {
    clearStandaloneBackendUrl();
    const nextInfo = getBackendSourceInfo();
    setBackendInfo(nextInfo);
    setBackendUrlInput(nextInfo.url);
    setBackendHealth(null);
    showFeedback(
      nextInfo.source === 'supabase-edge'
        ? tr(
            'Kembali ke Supabase Edge Functions otomatis.',
            'Reverted to automatic Supabase Edge Functions.'
          )
        : nextInfo.url
        ? tr('URL dikembalikan ke bawaan aplikasi.', 'URL reset to build default.')
        : tr('Konfigurasi URL Server Backend dikosongkan.', 'Backend Server URL configuration cleared.')
    );
  };

  const sectionLabelClass =
    'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] px-1 block';
  const cardClass =
    'bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl divide-y divide-[#DDE3EA] dark:divide-[#252B34] overflow-hidden';
  const rowInteractiveClass =
    'w-full px-4 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#171D26]/65 transition-colors duration-150 cursor-pointer group';
  const iconClass = 'h-4 w-4 shrink-0 text-[#697586] dark:text-[#929BA9] stroke-[1.75]';
  const chevronClass =
    'h-4 w-4 shrink-0 text-[#697586] dark:text-[#929BA9] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] transition-colors stroke-[1.75]';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
            {tr('Pengaturan Aplikasi', 'App Settings')}
          </h1>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1">
            {tr(
              'Kelola tampilan, parameter trading XAUUSD, sinkronisasi cloud, serta cadangan data VLO.',
              'Manage appearance, XAUUSD trading parameters, cloud sync, and VLO data backups.'
            )}
          </p>
        </div>
        <span className="text-[11px] font-mono-numbers tabular-nums font-medium text-[#697586] dark:text-[#929BA9] shrink-0">
          {tr(`${trades.length} Transaksi`, `${trades.length} Trades`)}
        </span>
      </div>

      {/* Inline Feedback Notice */}
      {feedbackMsg && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150"
        >
          {feedbackMsg.type === 'success' ? (
            <Check className="h-4 w-4 shrink-0 text-[#059669] dark:text-[#10B981] stroke-[2]" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-[#E11D48] dark:text-[#F43F5E] stroke-[2]" />
          )}
          <span
            className={
              feedbackMsg.type === 'success'
                ? 'text-[#059669] dark:text-[#10B981]'
                : 'text-[#E11D48] dark:text-[#F43F5E]'
            }
          >
            {feedbackMsg.text}
          </span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TOP ACCOUNT & SYNC SUMMARY CARD                                       */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-[#151D2A] dark:text-[#F2F5F9] stroke-[1.75]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9] truncate">
                  {currentUser ? currentUser.email : tr('Mode Penyimpanan Lokal', 'Local Storage Mode')}
                </span>
              </div>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5 leading-snug">
                {currentUser ? (
                  <span className="text-[#059669] dark:text-[#10B981] font-medium">
                    {tr('Cloud Supabase aktif · RLS terlindungi', 'Supabase Cloud active · RLS protected')}
                  </span>
                ) : (
                  tr(
                    'Masuk akun untuk mengaktifkan sinkronisasi jurnal lintas perangkat.',
                    'Sign in to enable cross-device journal synchronization.'
                  )
                )}
              </p>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-center">
            {currentUser ? (
              <button
                type="button"
                onClick={onOpenAccount}
                className="px-3.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] hover:bg-[#EEF2F6] dark:hover:bg-[#1E2530] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
              >
                {tr('Kelola Akun', 'Manage Account')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {tr('Masuk Akun', 'Sign In')}
              </button>
            )}
          </div>
        </div>

        {currentUser && (onSyncLocalToCloud || onReloadFromCloud) && (
          <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
              {tr('Sinkronisasi manual data jurnal & pengaturan', 'Manual sync for journal trades & settings')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {onSyncLocalToCloud && trades.length > 0 && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={onSyncLocalToCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <UploadCloud className="h-3.5 w-3.5 stroke-[1.75]" />
                  <span>
                    {isCloudSyncing
                      ? tr('Menyinkronkan...', 'Syncing...')
                      : tr(`Unggah (${trades.length})`, `Upload (${trades.length})`)}
                  </span>
                </button>
              )}
              {onReloadFromCloud && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={onReloadFromCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 stroke-[1.75] ${isCloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{tr('Muat Ulang dari Cloud', 'Reload from Cloud')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 1. TAMPILAN & BAHASA                                                  */}
      {/* ===================================================================== */}
      <section id="settings-appearance" className="space-y-2">
        <span className={sectionLabelClass}>
          {tr('Tampilan & Bahasa', 'Appearance & Language')}
        </span>
        <div className={cardClass}>
          {/* Tema Tampilan */}
          <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {theme === 'dark' ? (
                <Moon className={`${iconClass} mt-0.5`} />
              ) : (
                <Sun className={`${iconClass} mt-0.5`} />
              )}
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Tema Visual', 'Visual Theme')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Mode warna antarmuka VLO disimpan pada perangkat ini',
                    'VLO interface color mode saved on this device'
                  )}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white text-[#1769E8] font-semibold shadow-2xs border border-[#DDE3EA]'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] font-medium'
                }`}
              >
                {tr('Terang', 'Light')}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-[#171D26] text-[#F2F5F9] font-semibold border border-[#252B34]'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] font-medium'
                }`}
              >
                {tr('Gelap', 'Dark')}
              </button>
            </div>
          </div>

          {/* Bahasa Aplikasi */}
          <div
            data-testid="settings-language-row"
            className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3 min-w-0">
              <Globe className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Bahasa Aplikasi', 'Application Language')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Terapkan Bahasa Indonesia atau Bahasa Inggris ke seluruh antarmuka',
                    'Apply Bahasa Indonesia or English across the entire application'
                  )}
                </span>
              </div>
            </div>

            <div
              data-testid="settings-language-selector"
              className="inline-flex items-center rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] shrink-0 self-start sm:self-auto"
            >
              <button
                type="button"
                data-testid="lang-option-id"
                onClick={() => {
                  setLanguage('id');
                  showFeedback('Bahasa aplikasi diubah ke Bahasa Indonesia.');
                }}
                className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                  language === 'id'
                    ? 'bg-white dark:bg-[#171D26] text-[#1769E8] dark:text-[#F2F5F9] font-semibold border border-[#DDE3EA] dark:border-[#252B34]'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] font-medium'
                }`}
              >
                Indonesia
              </button>
              <button
                type="button"
                data-testid="lang-option-en"
                onClick={() => {
                  setLanguage('en');
                  showFeedback('Application language changed to English.');
                }}
                className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-white dark:bg-[#171D26] text-[#1769E8] dark:text-[#F2F5F9] font-semibold border border-[#DDE3EA] dark:border-[#252B34]'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] font-medium'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. PARAMETER TRADING & MODAL                                          */}
      {/* ===================================================================== */}
      <section className="space-y-2">
        <span className={sectionLabelClass}>
          {tr('Parameter Trading & Modal', 'Trading & Capital Parameters')}
        </span>
        <div className={cardClass}>
          {/* Saldo Awal */}
          <button
            type="button"
            onClick={() => setActivePrefModal('balance')}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <Wallet className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Modal Awal Akun', 'Initial Account Capital')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr('Basis perhitungan pertumbuhan ekuitas & batas risiko', 'Baseline for equity growth & risk sizing')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(settings.startingBalance, settings)}
              </span>
              <ChevronRight className={chevronClass} />
            </div>
          </button>

          {/* Mata Uang */}
          <button
            type="button"
            onClick={() => setActivePrefModal('currency')}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <Coins className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Mata Uang Jurnal', 'Journal Currency')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr('Satuan moneter utama laporan dan pencatatan', 'Primary monetary unit for reports and entries')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {settings.currency} ({settings.currencySymbol})
              </span>
              <ChevronRight className={chevronClass} />
            </div>
          </button>

          {/* Spesifikasi Broker XAUUSD */}
          <button
            type="button"
            onClick={() => setActivePrefModal('broker')}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <SlidersHorizontal className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Spesifikasi Broker (XAUUSD)', 'Broker Specification (XAUUSD)')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 break-words">
                  {settings.xauusdPipSize === 0.1
                    ? tr('Mode A (1 Pip = $0.10)', 'Mode A (1 Pip = $0.10)')
                    : tr('Mode B (1 Pip = $1.00)', 'Mode B (1 Pip = $1.00)')}{' '}
                  · {settings.xauusdContractSize} oz · {tr('Komisi', 'Comm.')} ${settings.brokerCommissionPerLot}/lot
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>

          {/* Parameter Risiko & Target */}
          <button
            type="button"
            onClick={() => setActivePrefModal('risk')}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <ShieldCheck className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Parameter Risiko & Target', 'Risk & Target Parameters')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 break-words">
                  {tr('Risiko', 'Risk')}{' '}
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {settings.defaultRiskPercent}%
                  </span>{' '}
                  ({settings.riskCapitalBasis === 'BALANCE' ? tr('Saldo Awal', 'Initial Balance') : tr('Ekuitas', 'Equity')}) ·{' '}
                  {tr('Target', 'Target')}{' '}
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {settings.targetMonthlyReturnPercent}%
                  </span>
                  /{tr('bln', 'mo')}
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>

          {/* Penyesuaian Modal */}
          <button
            type="button"
            onClick={() => setActivePrefModal('adjustments')}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <ArrowLeftRight className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Penyesuaian Modal (Deposit & WD)', 'Capital Adjustments (Deposit & WD)')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 break-words">
                  <span className="font-mono-numbers tabular-nums text-[#059669] dark:text-[#10B981]">
                    +{formatCurrency(settings.totalDeposits ?? 0, settings)}
                  </span>{' '}
                  ·{' '}
                  <span className="font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#F43F5E]">
                    -{formatCurrency(settings.totalWithdrawals ?? 0, settings)}
                  </span>
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. KONEKSI, CLOUD & SERVER BACKEND                                    */}
      {/* ===================================================================== */}
      <section className="space-y-2">
        <span className={sectionLabelClass}>
          {tr('Koneksi, Cloud & Backend', 'Connection, Cloud & Backend')}
        </span>
        <div className={cardClass}>
          {/* Konfigurasi Supabase */}
          <button
            type="button"
            onClick={onOpenConfig}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <Cloud className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Konfigurasi Cloud Supabase', 'Supabase Cloud Configuration')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Atur Project URL & Anon Key untuk database cloud pribadi Anda',
                    'Configure Project URL & Anon Key for your personal cloud database'
                  )}
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>

          {/* Server Backend Mandiri */}
          <div className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Server className={`${iconClass} mt-0.5`} />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                    {tr('Server Backend & AI Proxy', 'Backend Server & AI Proxy')}
                  </span>
                  <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 break-all">
                    {backendInfo.source === 'supabase-edge'
                      ? `${tr('Otomatis Supabase Edge:', 'Auto Supabase Edge:')} ${backendInfo.url}`
                      : backendInfo.url
                      ? backendInfo.url
                      : tr(
                          'Belum diatur — gunakan Supabase Edge otomatis atau URL server kustom.',
                          'Not configured — uses auto Supabase Edge or custom server URL.'
                        )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isTestingBackend}
                  onClick={() => handleTestBackend(isEditingBackend ? backendUrlInput : backendInfo.url)}
                  className="px-2.5 py-1 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-medium text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isTestingBackend ? tr('Menguji...', 'Testing...') : tr('Tes', 'Test')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fresh = getBackendSourceInfo();
                    setBackendInfo(fresh);
                    setIsEditingBackend((prev) => !prev);
                    setBackendUrlInput(fresh.url);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-[11px] font-semibold text-[#1769E8] dark:text-[#60A5FA] hover:bg-[#EEF2F6] dark:hover:bg-[#1E2530] transition-colors cursor-pointer"
                >
                  {isEditingBackend ? tr('Tutup', 'Close') : tr('Atur', 'Configure')}
                </button>
              </div>
            </div>

            {backendHealth && (
              <div className="ml-7 px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] leading-relaxed">
                <span
                  className={
                    backendHealth.reachable && backendHealth.geminiConfigured
                      ? 'text-[#059669] dark:text-[#10B981] font-medium'
                      : backendHealth.reachable
                      ? 'text-[#D97706] dark:text-[#F59E0B] font-medium'
                      : 'text-[#E11D48] dark:text-[#F43F5E] font-medium'
                  }
                >
                  {language === 'id' ? backendHealth.messageId : backendHealth.messageEn}
                </span>
              </div>
            )}

            {isEditingBackend && (
              <div className="ml-7 pt-1 space-y-2">
                <input
                  type="url"
                  value={backendUrlInput}
                  onChange={(e) => setBackendUrlInput(e.target.value)}
                  placeholder="https://xxxx.supabase.co/functions/v1/tradevault-api"
                  className="w-full px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#929BA9] focus:outline-none focus:border-[#1769E8]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isTestingBackend}
                    onClick={() => handleSaveBackendUrl(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {tr('Simpan & Tes', 'Save & Test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveBackendUrl(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    {tr('Simpan', 'Save')}
                  </button>
                  {backendInfo.source === 'custom' && (
                    <button
                      type="button"
                      onClick={handleResetBackendUrl}
                      className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#F43F5E] text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      {tr('Reset Otomatis', 'Reset to Auto')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mode Offline News & Cycle */}
          <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {isNewsCycleOffline ? (
                <WifiOff className={`${iconClass} mt-0.5`} />
              ) : (
                <Wifi className={`${iconClass} mt-0.5`} />
              )}
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Mode Offline (News & Cycle)', 'Offline Mode (News & Cycle)')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 leading-relaxed">
                  {tr(
                    'Hemat kuota API dengan menjeda pembaruan otomatis berita & cycle. Scan Kilat AI tetap aktif.',
                    'Save API quota by pausing live news & cycle updates. Instant AI Scan stays active.'
                  )}
                </span>
              </div>
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <button
                type="button"
                data-testid="settings-offline-mode-toggle"
                onClick={handleToggleNewsCycleOffline}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#080A0E] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <span
                  className={
                    isNewsCycleOffline
                      ? 'text-[#D97706] dark:text-[#F59E0B]'
                      : 'text-[#059669] dark:text-[#10B981]'
                  }
                >
                  {isNewsCycleOffline ? tr('Aktif (Offline)', 'Active (Offline)') : tr('Online', 'Online')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 4. DATA, PENYIMPANAN & CADANGAN                                       */}
      {/* ===================================================================== */}
      <section className="space-y-2">
        <span className={sectionLabelClass}>
          {tr('Data, Penyimpanan & Cadangan', 'Data, Storage & Backups')}
        </span>
        <div className={cardClass}>
          {/* Penyimpanan Lokal Browser */}
          <button
            type="button"
            onClick={onOpenLocalInfo}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <Database className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Penyimpanan Lokal Perangkat', 'Device Local Storage')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Ringkasan kapasitas & status cache transaksi di browser/aplikasi',
                    'Storage capacity summary & transaction cache status on this device'
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
                {trades.length}
              </span>
              <ChevronRight className={chevronClass} />
            </div>
          </button>

          {/* Cadangan & Pemulihan (ZIP / JSON / CSV) */}
          <button
            type="button"
            onClick={onOpenBackupModal}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <HardDriveDownload className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Cadangan & Pemulihan Data', 'Backup & Restore Data')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Ekspor atau pulihkan jurnal dan screenshot dalam format ZIP, JSON, atau CSV',
                    'Export or restore journal trades and screenshots in ZIP, JSON, or CSV format'
                  )}
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>

          {/* Impor CSV Spreadsheet */}
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <FileSpreadsheet className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Impor Spreadsheet (CSV / Excel)', 'Import Spreadsheet (CSV / Excel)')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Unggah riwayat transaksi broker dari tabel CSV',
                    'Upload broker trade history from CSV spreadsheet'
                  )}
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>

          {/* Dataset Contoh DEMO */}
          <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Layers className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Dataset Transaksi Demo', 'Demo Trades Dataset')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5 font-mono-numbers tabular-nums">
                  {tr(
                    `${demoCount} transaksi contoh · ${realCount} transaksi asli`,
                    `${demoCount} sample trades · ${realCount} real trades`
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleLoadDemo}
                className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium transition-colors cursor-pointer"
              >
                {tr('Muat Demo', 'Load Demo')}
              </button>
              {demoCount > 0 && (
                <button
                  type="button"
                  onClick={onRequestClearDemo}
                  className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#D97706] dark:text-[#F59E0B] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-semibold transition-colors cursor-pointer"
                >
                  {tr(`Hapus Demo (${demoCount})`, `Clear Demo (${demoCount})`)}
                </button>
              )}
            </div>
          </div>

          {/* Audit Rumus Finansial */}
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            className={rowInteractiveClass}
          >
            <div className="flex items-start gap-3 min-w-0">
              <Calculator className={`${iconClass} mt-0.5`} />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('Audit Rumus Finansial', 'Financial Formula Audit')}
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Verifikasi 46 kalkulasi Win Rate, Profit Factor, Expectancy, Drawdown, dan Lot',
                    'Verify 46 Win Rate, Profit Factor, Expectancy, Drawdown, and Lot calculations'
                  )}
                </span>
              </div>
            </div>
            <ChevronRight className={chevronClass} />
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 5. ZONA SENSITIF                                                      */}
      {/* ===================================================================== */}
      <section className="space-y-2">
        <span className={sectionLabelClass}>
          {tr('Zona Sensitif', 'Danger Zone')}
        </span>
        <div className="bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Trash2 className="h-4 w-4 shrink-0 text-[#E11D48] dark:text-[#F43F5E] stroke-[1.75] mt-0.5" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#E11D48] dark:text-[#F43F5E] block">
                {tr('Reset Total Jurnal', 'Full Journal Reset')}
              </span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                {tr(
                  'Hapus permanen seluruh transaksi untuk memulai jurnal baru dari nol.',
                  'Permanently delete all trades to start a fresh journal from scratch.'
                )}
              </span>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-auto">
            {!isConfirmingClearAll ? (
              <button
                type="button"
                disabled={isCloudSyncing || trades.length === 0}
                onClick={() => setIsConfirmingClearAll(true)}
                className="px-3.5 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#F43F5E] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {tr('Reset Semua', 'Reset All')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={() => setIsConfirmingClearAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={handleConfirmClearAllTrades}
                  className="px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  {tr('Ya, Hapus Semua', 'Yes, Delete All')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Minimalist App Version Footer */}
      <div className="pt-2 flex items-center justify-between px-1 text-[11px] text-[#697586] dark:text-[#929BA9]">
        <span>{tr('Jurnal Trading VLO', 'VLO Trading Journal')}</span>
        <span className="font-mono-numbers tabular-nums">v1.0.0</span>
      </div>

      {/* Trading Preferences Modal */}
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
