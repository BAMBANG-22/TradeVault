import React, { useState, useEffect } from 'react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  sanitizeSupabaseUrl,
} from '../../utils/supabaseClient';
import { SUPABASE_SCHEMA_SQL } from '../../utils/supabaseSchemaSql';
import {
  X,
  Cloud,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../../utils/language';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const { tr } = useLanguage();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    hasTables?: boolean;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    'save_unusual_url' | 'clear_credentials' | null
  >(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setTestResult(null);
      setPendingConfirm(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isTesting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingConfirm) {
          setPendingConfirm(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTesting, pendingConfirm, onClose]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    const cleanUrl = sanitizeSupabaseUrl(url);
    const cleanKey = anonKey.trim();

    if (!cleanUrl || !cleanKey) {
      setTestResult({
        success: false,
        message: tr(
          'Masukkan Project URL dan Anon Key terlebih dahulu.',
          'Please enter Project URL and Anon Key first.'
        ),
      });
      return;
    }

    setUrl(cleanUrl);
    saveSupabaseConfig(cleanUrl, cleanKey);
    setIsTesting(true);
    setTestResult(null);
    setPendingConfirm(null);

    const res = await testSupabaseConnection();
    setIsTesting(false);
    setTestResult(res);
  };

  const commitSaveConfig = (cleanUrl: string, cleanKey: string) => {
    setUrl(cleanUrl);
    setPendingConfirm(null);
    saveSupabaseConfig(cleanUrl, cleanKey);
    onConfigSaved();
    onClose();
  };

  const handleSave = () => {
    const cleanUrl = sanitizeSupabaseUrl(url);
    const cleanKey = anonKey.trim();

    if (!cleanUrl || !cleanKey) {
      setTestResult({
        success: false,
        message: tr(
          'Project URL dan Anon Key wajib diisi.',
          'Project URL and Anon Key are required.'
        ),
      });
      return;
    }

    if (!cleanUrl.startsWith('https://') || !cleanUrl.includes('.supabase.co')) {
      setPendingConfirm('save_unusual_url');
      return;
    }

    commitSaveConfig(cleanUrl, cleanKey);
  };

  const handleClear = () => {
    setPendingConfirm('clear_credentials');
  };

  const confirmClearCredentials = () => {
    clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    setPendingConfirm(null);
    onConfigSaved();
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = SUPABASE_SCHEMA_SQL;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2500);
      } catch {
        setTestResult({
          success: false,
          message: tr('Gagal menyalin skrip SQL.', 'Failed to copy SQL script.'),
        });
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] shadow-2xl overflow-hidden text-[#151D2A] dark:text-[#F2F5F9]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#929BA9] shrink-0">
              <Cloud className="h-4 w-4 stroke-[1.75]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Konfigurasi Cloud Supabase', 'Supabase Cloud Configuration')}
              </h3>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                {tr(
                  'Hubungkan database cloud pribadi dengan keamanan RLS',
                  'Connect your personal cloud database with RLS protection'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] transition-colors cursor-pointer shrink-0"
            aria-label={tr('Tutup konfigurasi Supabase', 'Close Supabase configuration')}
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Quick Setup Strip */}
          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Langkah Setup Cepat', 'Quick Setup Steps')}
              </span>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1769E8] dark:text-[#60A5FA] hover:underline"
              >
                <span>{tr('Buka Dashboard', 'Open Dashboard')}</span>
                <ExternalLink className="h-3 w-3 stroke-[1.75]" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('1. Buat Proyek', '1. Create Project')}
                </span>
                <span className="text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr('Proyek baru di Supabase', 'New project in Supabase')}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('2. Jalankan SQL', '2. Run SQL')}
                </span>
                <span className="text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr('Tempel & Run di SQL Editor', 'Paste & Run in SQL Editor')}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                  {tr('3. Salin API Key', '3. Copy API Key')}
                </span>
                <span className="text-[#697586] dark:text-[#929BA9] block mt-0.5">
                  {tr('Project Settings → API', 'Project Settings → API')}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                {tr('Tabel trades, user_settings, storage & RLS', 'Tables, storage bucket & RLS policies')}
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#059669] dark:text-[#10B981] stroke-[1.75]" />
                    <span className="text-[#059669] dark:text-[#10B981]">{tr('Tersalin', 'Copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#1769E8] dark:text-[#60A5FA] stroke-[1.75]" />
                    <span>{tr('Salin Skrip SQL', 'Copy SQL Script')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Credentials Form */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                Project URL
              </label>
              <input
                type="text"
                placeholder="https://xxxx.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  if (url.trim()) {
                    setUrl(sanitizeSupabaseUrl(url));
                  }
                }}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
              />
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1">
                {tr(
                  'Domain dasar proyek tanpa /auth/v1 atau path tambahan.',
                  'Base project domain without /auth/v1 or extra paths.'
                )}
              </p>
            </div>

            <div>
              <label className="block font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                {tr('Anon Public Key', 'Anon Public Key')}
              </label>
              <textarea
                rows={2}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
              />
            </div>
          </div>

          {/* Security Note */}
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-start gap-2.5 text-[11px] text-[#697586] dark:text-[#929BA9]">
            <ShieldAlert className="h-4 w-4 text-[#D97706] dark:text-[#F59E0B] shrink-0 mt-0.5 stroke-[1.75]" />
            <span>
              {tr(
                'Hanya gunakan Public Anon Key. Jangan masukkan kunci service_role di browser.',
                'Use the Public Anon Key only. Never enter service_role keys in the browser.'
              )}
            </span>
          </div>

          {/* Test Status */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'text-[#059669] dark:text-[#10B981]'
                  : 'text-[#E11D48] dark:text-[#F43F5E]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 stroke-[1.75]" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.75]" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Inline Confirmation */}
          {pendingConfirm && (
            <div className="p-3.5 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#080A0E] text-xs space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-start gap-2 text-[#151D2A] dark:text-[#F2F5F9]">
                <AlertTriangle className="h-4 w-4 text-[#D97706] dark:text-[#F59E0B] shrink-0 mt-0.5 stroke-[1.75]" />
                <span className="text-[11px] leading-relaxed">
                  {pendingConfirm === 'save_unusual_url'
                    ? tr(
                        'Format URL berbeda dari standar https://xxxx.supabase.co. Tetap simpan?',
                        'URL format differs from https://xxxx.supabase.co. Save anyway?'
                      )
                    : tr(
                        'Hapus kredensial cloud dan kembali ke penyimpanan lokal?',
                        'Clear cloud credentials and revert to local storage?'
                      )}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F5F9] cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingConfirm === 'save_unusual_url') {
                      commitSaveConfig(sanitizeSupabaseUrl(url), anonKey.trim());
                    } else {
                      confirmClearCredentials();
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white cursor-pointer ${
                    pendingConfirm === 'clear_credentials'
                      ? 'bg-[#E11D48] hover:bg-[#BE123C] dark:bg-[#F43F5E]'
                      : 'bg-[#1769E8] hover:bg-[#1458C4]'
                  }`}
                >
                  {pendingConfirm === 'save_unusual_url'
                    ? tr('Tetap Simpan', 'Save Anyway')
                    : tr('Ya, Hapus', 'Yes, Clear')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA]/60 dark:bg-[#080A0E]/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-medium text-[#E11D48] dark:text-[#F43F5E] hover:underline cursor-pointer"
          >
            {tr('Hapus Kredensial', 'Clear Credentials')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="px-3.5 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] hover:bg-[#F5F7FA] dark:hover:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isTesting ? tr('Menguji...', 'Testing...') : tr('Uji Koneksi', 'Test Connection')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {tr('Simpan & Aktifkan', 'Save & Activate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
