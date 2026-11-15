/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  LogOut,
  User,
  Mail,
  ShieldCheck,
  Calendar,
  Key,
  HardDrive,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { signOutUser } from '../../utils/supabaseClient';
import { useLanguage } from '../../utils/language';

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onLogoutSuccess: () => void;
}

export const UserAccountModal: React.FC<UserAccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogoutSuccess,
}) => {
  const { tr, locale } = useLanguage();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || loggingOut) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmLogout) {
          setConfirmLogout(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loggingOut, confirmLogout, onClose]);

  if (!isOpen || !currentUser) return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);

    const { success, error } = await signOutUser();
    setLoggingOut(false);

    if (success) {
      onLogoutSuccess();
      onClose();
    } else {
      setLogoutError(
        error?.message ||
          tr(
            'Gagal keluar dari sesi. Silakan coba beberapa saat lagi.',
            'Failed to sign out of session. Please try again shortly.'
          )
      );
    }
  };

  const displayName =
    currentUser.user_metadata?.full_name ||
    currentUser.user_metadata?.name ||
    currentUser.user_metadata?.preferred_username ||
    '';
  const avatarUrl =
    currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || '';
  const rawProvider = String(currentUser.app_metadata?.provider || 'email').toLowerCase();
  const providerLabel =
    rawProvider === 'google' ? 'Google' : tr('Akun VLO', 'VLO Account');

  const email = currentUser.email || tr('Pengguna Tanpa Email', 'User Without Email');
  const userId = currentUser.id || '-';
  const createdAt = currentUser.created_at
    ? new Date(currentUser.created_at).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '-';
  const lastSignIn = currentUser.last_sign_in_at
    ? new Date(currentUser.last_sign_in_at).toLocaleString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-6 shadow-2xl text-[#151D2A] dark:text-[#F2F5F9] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center">
              <User className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {tr('Profil Akun VLO', 'VLO Account Profile')}
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                {tr('Sinkronisasi VLO Cloud aktif & terisolasi', 'VLO Cloud sync active & isolated')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] text-[#697586] hover:text-[#151D2A] dark:bg-[#171D26] dark:text-[#929BA9] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
            aria-label={tr('Tutup', 'Close')}
          >
            <X className="h-5 w-5 stroke-[1.75]" />
          </button>
        </div>

        {/* User Card */}
        <div className="my-4 p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="uppercase font-semibold tracking-wider text-[#697586] dark:text-[#929BA9]">
              {tr('Status Akun', 'Account Status')}
            </span>
            <span className="font-semibold text-[#059669] dark:text-[#10B981]">
              {tr('Aktif & Terisolasi', 'Active & Isolated')}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || email}
                referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-full border border-[#DDE3EA] dark:border-[#252B34] object-cover shrink-0"
              />
            ) : (
              <div className="h-11 w-11 rounded-full bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#1769E8] dark:text-[#60A5FA] shrink-0 font-bold uppercase text-base">
                {(displayName || email).charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {displayName && (
                <div className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9] truncate">
                  {displayName}
                </div>
              )}
              <div
                className={`${
                  displayName
                    ? 'text-xs text-[#697586] dark:text-[#929BA9]'
                    : 'text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9]'
                } break-all`}
                title={email}
              >
                {email}
              </div>
              <div className="text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="h-3 w-3 text-[#059669] dark:text-[#10B981] shrink-0 stroke-[1.75]" />
                <span>{providerLabel}</span>
                <span aria-hidden="true">·</span>
                <span>VLO Cloud</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details List */}
        <div className="space-y-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>{tr('ID Akun', 'Account ID')}</span>
            </span>
            <span className="font-mono-numbers text-[11px] text-[#151D2A] dark:text-[#F2F5F9] max-w-[180px] truncate" title={userId}>
              {userId}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>{tr('Terdaftar Sejak', 'Registered Since')}</span>
            </span>
            <span className="text-[#151D2A] dark:text-[#F2F5F9] font-medium">{createdAt}</span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>{tr('Login Terakhir', 'Last Sign In')}</span>
            </span>
            <span className="text-[#151D2A] dark:text-[#F2F5F9] font-medium">{lastSignIn}</span>
          </div>
        </div>

        {/* Data Safety Note */}
        <div className="my-4 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] flex items-start gap-2">
          <HardDrive className="h-4 w-4 text-[#697586] dark:text-[#929BA9] shrink-0 mt-0.5 stroke-[1.75]" />
          <p className="leading-relaxed">
            <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{tr('Privasi & Isolasi Data:', 'Data Privacy & Isolation:')}</strong>{' '}
            {tr(
              'Jurnal dan screenshot Anda diproteksi khusus untuk akun ini dan terpisah sepenuhnya dari akun pengguna lain.',
              'Your journal and screenshots are strictly scoped to this account and completely isolated from other users.'
            )}
          </p>
        </div>

        {logoutError && (
          <div className="mb-3 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.75]" />
            <span>{logoutError}</span>
          </div>
        )}

        {/* Logout Actions */}
        <div className="pt-2">
          {!confirmLogout ? (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="w-full min-h-[44px] py-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-rose-600 dark:text-rose-400 border border-[#DDE3EA] dark:border-[#252B34] text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4 stroke-[1.75]" />
              <span>{tr('Keluar dari Akun', 'Sign Out')}</span>
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
                <span>{tr('Yakin ingin keluar dari akun ini?', 'Are you sure you want to sign out?')}</span>
              </div>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                {tr(
                  'Sesi cloud Anda akan ditutup di perangkat ini. Anda dapat masuk kembali kapan saja.',
                  'Your cloud session will be closed on this device. You can sign back in anytime.'
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => setConfirmLogout(false)}
                  className="py-2 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold transition-colors cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loggingOut ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.75]" />
                      <span>{tr('Keluar...', 'Signing out...')}</span>
                    </>
                  ) : (
                    <span>{tr('Ya, Keluar', 'Yes, Sign Out')}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
