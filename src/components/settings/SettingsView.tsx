/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Camera,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import { formatCurrency } from '../../utils/calculations';
import { isDemoTrade, DEMO_TRADES } from '../../utils/demoData';
import { mergeTradesDatasets } from '../../utils/supabaseSync';
import {
  getUserAvatarUrl,
  updateUserProfileAvatar,
  removeUserProfileAvatar,
} from '../../utils/supabaseClient';
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
  isDeveloperMode?: boolean;
  onUnlockDeveloperMode?: () => void;
  onUserUpdated?: (user: any) => void;
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
  isDeveloperMode = false,
  onUnlockDeveloperMode,
  onUserUpdated,
}) => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, tr } = useLanguage();

  // Modals state
  const [activePrefModal, setActivePrefModal] = useState<PreferenceCategory | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  // Standalone Backend Server config state
  const [isEditingBackend, setIsEditingBackend] = useState(false);
  const [backendInfo, setBackendInfo] = useState(() => getBackendSourceInfo());
  const [backendUrlInput, setBackendUrlInput] = useState(() => getStandaloneBackendUrl());
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [backendHealth, setBackendHealth] = useState<StandaloneBackendHealthResult | null>(null);
  const [isNewsCycleOffline, setIsNewsCycleOffline] = useState(() => isNewsCycleOfflineMode());
  const [devTapCount, setDevTapCount] = useState(0);

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

  const handleSettingsAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUpdatingAvatar(true);
    const res = await updateUserProfileAvatar(file);
    setIsUpdatingAvatar(false);

    if (res.success && res.user) {
      onUserUpdated?.(res.user);
      showFeedback(tr('Foto profil berhasil diperbarui.', 'Profile photo updated successfully.'));
    } else {
      showFeedback(
        res.error || tr('Gagal memperbarui foto profil.', 'Failed to update profile photo.'),
        'error'
      );
    }
  };

  const handleSettingsAvatarRemove = async () => {
    if (isUpdatingAvatar) return;
    setIsUpdatingAvatar(true);
    const res = await removeUserProfileAvatar();
    setIsUpdatingAvatar(false);

    if (res.success && res.user) {
      onUserUpdated?.(res.user);
      showFeedback(tr('Foto profil telah dihapus.', 'Profile photo has been removed.'));
    } else {
      showFeedback(
        res.error || tr('Gagal menghapus foto profil.', 'Failed to remove profile photo.'),
        'error'
      );
    }
  };

  const activeAvatarUrl = currentUser ? getUserAvatarUrl(currentUser) : '';

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
    'text-[11px] font-semibold uppercase tracking-[0.08em] text-[#526071] dark:text-[#929BA9] px-1 block';
  const cardClass =
    'bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none rounded-xl divide-y divide-[#D9E2EC] dark:divide-[#20252D] overflow-hidden';
  const rowInteractiveClass =
    'w-full px-4 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#F8FAFC] dark:hover:bg-[#161A22]/75 transition-colors duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35';
  const iconClass = 'h-4 w-4 shrink-0 text-[#526071] dark:text-[#929BA9] stroke-[1.75]';
  const chevronClass =
    'h-4 w-4 shrink-0 text-[#526071] dark:text-[#929BA9] group-hover:text-[#0F172A] dark:group-hover:text-[#F2F4F7] transition-colors stroke-[1.75]';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-[#D9E2EC] dark:border-[#20252D]">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#0F172A] dark:text-[#F2F4F7]">
            {tr('Pengaturan Aplikasi', 'App Settings')}
          </h1>
          <p className="text-xs text-[#526071] dark:text-[#929BA9] mt-1">
            {tr(
              'Kelola tampilan, parameter trading XAUUSD, sinkronisasi cloud, serta cadangan data VLO.',
              'Manage appearance, XAUUSD trading parameters, cloud sync, and VLO data backups.'
            )}
          </p>
        </div>
        <span className="text-[11px] font-mono-numbers tabular-nums font-medium text-[#526071] dark:text-[#929BA9] shrink-0">
          {tr(`${trades.length} Transaksi`, `${trades.length} Trades`)}
        </span>
      </div>

      {/* Inline Feedback Notice */}
      {feedbackMsg && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150"
        >
          {feedbackMsg.type === 'success' ? (
            <Check className="h-4 w-4 shrink-0 text-[#059669] dark:text-[#00A878] stroke-[2]" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-[#E11D48] dark:text-[#E05260] stroke-[2]" />
          )}
          <span
            className={
              feedbackMsg.type === 'success'
                ? 'text-[#059669] dark:text-[#00A878]'
                : 'text-[#E11D48] dark:text-[#E05260]'
            }
          >
            {feedbackMsg.text}
          </span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TOP ACCOUNT & SYNC SUMMARY CARD                                       */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none rounded-xl p-4 sm:p-5 space-y-4">
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleSettingsAvatarChange}
          data-testid="settings-avatar-file-input"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {currentUser ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  disabled={isUpdatingAvatar}
                  onClick={() => avatarFileInputRef.current?.click()}
                  data-testid="settings-avatar-upload-trigger"
                  aria-label={tr('Ubah Foto Profil', 'Change Profile Photo')}
                  title={tr('Klik untuk mengubah foto profil', 'Click to change profile photo')}
                  className="group relative h-12 w-12 rounded-full bg-[#F5F7FA] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] flex items-center justify-center text-[#0F172A] dark:text-[#F2F4F7] overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 disabled:opacity-60"
                >
                  {activeAvatarUrl ? (
                    <img
                      src={activeAvatarUrl}
                      alt={
                        currentUser.user_metadata?.full_name ||
                        currentUser.user_metadata?.name ||
                        currentUser.email ||
                        'User'
                      }
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-bold uppercase text-base select-none">
                      {(
                        currentUser.user_metadata?.full_name ||
                        currentUser.user_metadata?.name ||
                        currentUser.email ||
                        'U'
                      ).charAt(0)}
                    </span>
                  )}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {isUpdatingAvatar ? (
                      <RefreshCw className="h-3.5 w-3.5 text-white animate-spin stroke-[2]" />
                    ) : (
                      <Camera className="h-3.5 w-3.5 text-white stroke-[2]" />
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isUpdatingAvatar}
                  onClick={() => avatarFileInputRef.current?.click()}
                  aria-label={tr('Unggah Foto Profil', 'Upload Profile Photo')}
                  title={tr('Unggah Foto Profil', 'Upload Profile Photo')}
                  className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white dark:bg-white dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] border-2 border-white dark:border-[#101318] flex items-center justify-center shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isUpdatingAvatar ? (
                    <RefreshCw className="h-2.5 w-2.5 animate-spin stroke-[2]" />
                  ) : (
                    <Camera className="h-2.5 w-2.5 stroke-[2]" />
                  )}
                </button>
              </div>
            ) : (
              <div className="h-11 w-11 rounded-full bg-[#F5F7FA] dark:bg-[#161A22] border border-[#D9E2EC] dark:border-[#20252D] flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-[#0F172A] dark:text-[#F2F4F7] stroke-[1.75]" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[#0F172A] dark:text-[#F2F4F7] truncate">
                  {currentUser
                    ? currentUser.user_metadata?.full_name ||
                      currentUser.user_metadata?.name ||
                      currentUser.email
                    : tr('Mode Penyimpanan Lokal', 'Local Storage Mode')}
                </span>
              </div>
              <p className="text-[11px] text-[#526071] dark:text-[#929BA9] mt-0.5 leading-snug">
                {currentUser ? (
                  <span className="text-[#059669] dark:text-[#00A878] font-medium">
                    {tr('VLO Cloud aktif · Data terenkripsi & terisolasi', 'VLO Cloud active · Data encrypted & isolated')}
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

          <div className="shrink-0 self-start sm:self-center flex flex-wrap items-center gap-2">
            {currentUser ? (
              <>
                <button
                  type="button"
                  disabled={isUpdatingAvatar}
                  onClick={() => avatarFileInputRef.current?.click()}
                  data-testid="settings-upload-photo-btn"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#161A22] hover:bg-[#EEF2F6] dark:hover:bg-[#1F2530] text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 disabled:opacity-50"
                >
                  {isUpdatingAvatar ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.75]" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 stroke-[1.75]" />
                  )}
                  <span>
                    {activeAvatarUrl
                      ? tr('Ganti Foto', 'Change Photo')
                      : tr('Tambah Foto', 'Add Photo')}
                  </span>
                </button>
                {activeAvatarUrl && (
                  <button
                    type="button"
                    disabled={isUpdatingAvatar}
                    onClick={handleSettingsAvatarRemove}
                    data-testid="settings-remove-photo-btn"
                    aria-label={tr('Hapus Foto Profil', 'Remove Profile Photo')}
                    title={tr('Hapus Foto Profil', 'Remove Profile Photo')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#161A22] hover:bg-[#EEF2F6] dark:hover:bg-[#1F2530] text-[#526071] hover:text-[#E11D48] dark:text-[#929BA9] dark:hover:text-[#E05260] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 stroke-[1.75]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="px-4 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white dark:bg-white dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                >
                  {tr('Kelola Akun', 'Manage Account')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white dark:bg-white dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Masuk Akun', 'Sign In')}
              </button>
            )}
          </div>
        </div>

        {currentUser && (onSyncLocalToCloud || onReloadFromCloud) && (
          <div className="pt-3 border-t border-[#D9E2EC] dark:border-[#20252D] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#526071] dark:text-[#929BA9]">
              {tr('Sinkronisasi manual data jurnal & pengaturan', 'Manual sync for journal trades & settings')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {onSyncLocalToCloud && trades.length > 0 && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={onSyncLocalToCloud}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white dark:bg-white dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Tema Visual', 'Visual Theme')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Mode warna antarmuka VLO disimpan pada perangkat ini',
                    'VLO interface color mode saved on this device'
                  )}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center rounded-full bg-[#F5F7FA] dark:bg-[#0B0E13] p-1 border border-[#D9E2EC] dark:border-[#20252D] shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3.5 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  theme === 'light'
                    ? 'bg-[#0F172A] text-white font-semibold'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] font-medium'
                }`}
              >
                {tr('Terang', 'Light')}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3.5 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  theme === 'dark'
                    ? 'bg-white text-[#050607] font-semibold'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] font-medium'
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Bahasa Aplikasi', 'Application Language')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Terapkan Bahasa Indonesia atau Bahasa Inggris ke seluruh antarmuka',
                    'Apply Bahasa Indonesia or English across the entire application'
                  )}
                </span>
              </div>
            </div>

            <div
              data-testid="settings-language-selector"
              className="inline-flex items-center rounded-full bg-[#F5F7FA] dark:bg-[#0B0E13] p-1 border border-[#D9E2EC] dark:border-[#20252D] shrink-0 self-start sm:self-auto"
            >
              <button
                type="button"
                data-testid="lang-option-id"
                onClick={() => {
                  setLanguage('id');
                  showFeedback('Bahasa aplikasi diubah ke Bahasa Indonesia.');
                }}
                className={`px-3.5 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  language === 'id'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607] font-semibold'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] font-medium'
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
                className={`px-3.5 py-1 text-xs rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35 ${
                  language === 'en'
                    ? 'bg-[#0F172A] text-white dark:bg-white dark:text-[#050607] font-semibold'
                    : 'text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] font-medium'
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Modal Awal Akun', 'Initial Account Capital')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                  {tr('Basis perhitungan pertumbuhan ekuitas & batas risiko', 'Baseline for equity growth & risk sizing')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7]">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Mata Uang Jurnal', 'Journal Currency')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                  {tr('Satuan moneter utama laporan dan pencatatan', 'Primary monetary unit for reports and entries')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7]">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Spesifikasi Broker (XAUUSD)', 'Broker Specification (XAUUSD)')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 break-words">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Parameter Risiko & Target', 'Risk & Target Parameters')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 break-words">
                  {tr('Risiko', 'Risk')}{' '}
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
                    {settings.defaultRiskPercent}%
                  </span>{' '}
                  ({settings.riskCapitalBasis === 'BALANCE' ? tr('Saldo Awal', 'Initial Balance') : tr('Ekuitas', 'Equity')}) ·{' '}
                  {tr('Target', 'Target')}{' '}
                  <span className="font-mono-numbers tabular-nums font-semibold text-[#0F172A] dark:text-[#F2F4F7]">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Penyesuaian Modal (Deposit & WD)', 'Capital Adjustments (Deposit & WD)')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 break-words">
                  <span className="font-mono-numbers tabular-nums text-[#059669] dark:text-[#00A878]">
                    +{formatCurrency(settings.totalDeposits ?? 0, settings)}
                  </span>{' '}
                  ·{' '}
                  <span className="font-mono-numbers tabular-nums text-[#E11D48] dark:text-[#E05260]">
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
      {/* 3. KONEKSI & MODE DATA (PLUS PENGATURAN DEVELOPER BILA AKTIF)         */}
      {/* ===================================================================== */}
      <section className="space-y-2">
        <span className={sectionLabelClass}>
          {isDeveloperMode
            ? tr('Koneksi, Cloud & Backend (Developer)', 'Connection, Cloud & Backend (Developer)')
            : tr('Koneksi & Mode Data', 'Connection & Data Mode')}
        </span>
        <div className={cardClass}>
          {isDeveloperMode && (
            <>
              {/* Konfigurasi Supabase (Developer Only) */}
              <button
                type="button"
                onClick={onOpenConfig}
                className={rowInteractiveClass}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Cloud className={`${iconClass} mt-0.5`} />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                      {tr('Konfigurasi Cloud Supabase', 'Supabase Cloud Configuration')}
                    </span>
                    <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                      {tr(
                        'Atur Project URL & Anon Key untuk server VLO Cloud',
                        'Configure Project URL & Anon Key for VLO Cloud server'
                      )}
                    </span>
                  </div>
                </div>
                <ChevronRight className={chevronClass} />
              </button>

              {/* Server Backend Mandiri (Developer Only) */}
              <div className="px-4 py-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Server className={`${iconClass} mt-0.5`} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                        {tr('Server Backend & AI Proxy', 'Backend Server & AI Proxy')}
                      </span>
                      <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 break-all">
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
                      className="px-3 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[11px] font-medium text-[#526071] dark:text-[#929BA9] hover:text-[#0F172A] dark:hover:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
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
                      className="px-3 py-1 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#161A22] text-[11px] font-semibold text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#EEF2F6] dark:hover:bg-[#1F2530] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                    >
                      {isEditingBackend ? tr('Tutup', 'Close') : tr('Atur', 'Configure')}
                    </button>
                  </div>
                </div>

                {backendHealth && (
                  <div className="ml-7 px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#0B0E13] border border-[#D9E2EC] dark:border-[#20252D] text-[11px] leading-relaxed">
                    <span
                      className={
                        backendHealth.reachable && backendHealth.geminiConfigured
                          ? 'text-[#059669] dark:text-[#00A878] font-medium'
                          : backendHealth.reachable
                          ? 'text-[#D97706] dark:text-[#F59E0B] font-medium'
                          : 'text-[#E11D48] dark:text-[#E05260] font-medium'
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
                      className="w-full px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#0B0E13] border border-[#D9E2EC] dark:border-[#20252D] text-xs text-[#0F172A] dark:text-[#F2F4F7] placeholder-[#929BA9] focus:outline-none focus:border-[#0F172A] dark:focus:border-white"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isTestingBackend}
                        onClick={() => handleSaveBackendUrl(true)}
                        className="px-3.5 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white dark:bg-white dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                      >
                        {tr('Simpan & Tes', 'Save & Test')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveBackendUrl(false)}
                        className="px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                      >
                        {tr('Simpan', 'Save')}
                      </button>
                      {backendInfo.source === 'custom' && (
                        <button
                          type="button"
                          onClick={handleResetBackendUrl}
                          className="px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                        >
                          {tr('Reset Otomatis', 'Reset to Auto')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mode Offline News & Cycle */}
          <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {isNewsCycleOffline ? (
                <WifiOff className={`${iconClass} mt-0.5`} />
              ) : (
                <Wifi className={`${iconClass} mt-0.5`} />
              )}
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Mode Offline (News & Cycle)', 'Offline Mode (News & Cycle)')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 leading-relaxed">
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
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] bg-[#F5F7FA] dark:bg-[#0B0E13] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                <span
                  className={
                    isNewsCycleOffline
                      ? 'text-[#D97706] dark:text-[#F59E0B]'
                      : 'text-[#059669] dark:text-[#00A878]'
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Penyimpanan Lokal Perangkat', 'Device Local Storage')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
                  {tr(
                    'Ringkasan kapasitas & status cache transaksi di browser/aplikasi',
                    'Storage capacity summary & transaction cache status on this device'
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#0F172A] dark:text-[#F2F4F7]">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Cadangan & Pemulihan Data', 'Backup & Restore Data')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Impor Spreadsheet (CSV / Excel)', 'Import Spreadsheet (CSV / Excel)')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Dataset Transaksi Demo', 'Demo Trades Dataset')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5 font-mono-numbers tabular-nums">
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
                className="px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-[#0F172A] dark:text-[#F2F4F7] text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Muat Demo', 'Load Demo')}
              </button>
              {demoCount > 0 && (
                <button
                  type="button"
                  onClick={onRequestClearDemo}
                  className="px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#D97706] dark:text-[#F59E0B] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
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
                <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F2F4F7] block">
                  {tr('Audit Rumus Finansial', 'Financial Formula Audit')}
                </span>
                <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
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
        <div className="bg-white dark:bg-[#101318] border border-[#D9E2EC] dark:border-[#20252D] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Trash2 className="h-4 w-4 shrink-0 text-[#E11D48] dark:text-[#E05260] stroke-[1.75] mt-0.5" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-[#E11D48] dark:text-[#E05260] block">
                {tr('Reset Total Jurnal', 'Full Journal Reset')}
              </span>
              <span className="text-[11px] text-[#526071] dark:text-[#929BA9] block mt-0.5">
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
                className="px-4 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#526071] dark:text-[#929BA9] hover:text-[#E11D48] dark:hover:text-[#E05260] hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
              >
                {tr('Reset Semua', 'Reset All')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={() => setIsConfirmingClearAll(false)}
                  className="px-3.5 py-1.5 rounded-full border border-[#D9E2EC] dark:border-[#20252D] text-[#0F172A] dark:text-[#F2F4F7] text-xs font-medium hover:bg-[#F5F7FA] dark:hover:bg-[#161A22] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A]/35 dark:focus-visible:ring-white/35"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={handleConfirmClearAllTrades}
                  className="px-4 py-1.5 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]/50"
                >
                  {tr('Ya, Hapus Semua', 'Yes, Delete All')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Minimalist App Version Footer (5-tap unlocks Developer Mode) */}
      <div className="pt-2 flex items-center justify-between px-1 text-[11px] text-[#526071] dark:text-[#929BA9]">
        <span>{tr('Vlo Journal', 'Vlo Journal')}</span>
        <button
          type="button"
          onClick={() => {
            if (isDeveloperMode) return;
            const next = devTapCount + 1;
            if (next >= 5) {
              setDevTapCount(0);
              onUnlockDeveloperMode?.();
              showFeedback(tr('Mode Developer diaktifkan.', 'Developer Mode enabled.'));
            } else {
              setDevTapCount(next);
            }
          }}
          className="font-mono-numbers tabular-nums hover:text-[#0F172A] dark:hover:text-[#F2F4F7] transition-colors cursor-default"
        >
          v1.0.0
        </button>
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
