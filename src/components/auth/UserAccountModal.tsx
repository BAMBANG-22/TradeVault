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
        error?.message || 'Gagal keluar dari sesi. Silakan coba beberapa saat lagi.'
      );
    }
  };

  const email = currentUser.email || 'Pengguna Tanpa Email';
  const userId = currentUser.id || '-';
  const createdAt = currentUser.created_at
    ? new Date(currentUser.created_at).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '-';
  const lastSignIn = currentUser.last_sign_in_at
    ? new Date(currentUser.last_sign_in_at).toLocaleString('id-ID', {
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
              <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">Profil Akun Trader</h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">Informasi akun terautentikasi Supabase</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] text-[#697586] hover:text-[#151D2A] dark:bg-[#171D26] dark:text-[#929BA9] dark:hover:text-[#F2F5F9] transition-colors"
            aria-label="Tutup"
          >
            <X className="h-5 w-5 stroke-[1.75]" />
          </button>
        </div>

        {/* User Card */}
        <div className="my-4 p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#697586] dark:text-[#929BA9]">
              Status Autentikasi
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-[#11151B] text-emerald-600 dark:text-emerald-400 border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              Aktif & Terverifikasi
            </span>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <div className="h-10 w-10 rounded-full bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#1769E8] dark:text-[#60A5FA] shrink-0 font-bold uppercase text-base">
              {email.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#151D2A] dark:text-[#F2F5F9] break-all" title={email}>
                {email}
              </div>
              <div className="text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1 mt-0.5 font-mono-numbers">
                <ShieldCheck className="h-3 w-3 text-[#697586] dark:text-[#929BA9] shrink-0 stroke-[1.75]" />
                <span>Supabase Auth Cloud</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details List */}
        <div className="space-y-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>User ID</span>
            </span>
            <span className="font-mono-numbers text-[11px] text-[#151D2A] dark:text-[#F2F5F9] max-w-[180px] truncate" title={userId}>
              {userId}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>Terdaftar Sejak</span>
            </span>
            <span className="text-[#151D2A] dark:text-[#F2F5F9] font-medium">{createdAt}</span>
          </div>

          <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
            <span className="text-[#697586] dark:text-[#929BA9] flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
              <span>Login Terakhir</span>
            </span>
            <span className="text-[#151D2A] dark:text-[#F2F5F9] font-medium">{lastSignIn}</span>
          </div>
        </div>

        {/* Data Safety Note */}
        <div className="my-4 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] flex items-start gap-2">
          <HardDrive className="h-4 w-4 text-[#697586] dark:text-[#929BA9] shrink-0 mt-0.5 stroke-[1.75]" />
          <p className="leading-relaxed">
            <strong className="text-[#151D2A] dark:text-[#F2F5F9]">Keamanan Data:</strong> Jurnal transaksi Anda tetap tersimpan aman di browser ini (<code className="text-[#1769E8] dark:text-[#60A5FA]">localStorage</code>) dan tidak akan hilang saat Anda logout.
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
              className="w-full py-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] text-rose-600 dark:text-rose-400 border border-[#DDE3EA] dark:border-[#252B34] text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4 stroke-[1.75]" />
              <span>Keluar dari Akun (Logout)</span>
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
                <span>Yakin ingin keluar dari akun ini?</span>
              </div>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                Sesi cloud Anda akan ditutup. Anda dapat masuk kembali kapan saja.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => setConfirmLogout(false)}
                  className="py-1.5 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  {loggingOut ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.75]" />
                      <span>Keluar...</span>
                    </>
                  ) : (
                    <span>Ya, Keluar</span>
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
