import React, { useState, useEffect } from 'react';
import {
  getSupabase,
  isSupabaseConfigured,
  translateAuthError,
  resendVerificationEmail,
} from '../../utils/supabaseClient';
import {
  X,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Database,
  RefreshCw,
  Send,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
  onOpenConfig: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot' | 'verify_notice';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  onOpenConfig,
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');

  useEffect(() => {
    if (!isOpen || loading || resendingEmail) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, resendingEmail, onClose]);

  if (!isOpen) return null;

  const isConfigured = isSupabaseConfigured();

  const handleResetState = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    handleResetState();

    if (!isConfigured) {
      setErrorMessage('Konfigurasi URL & Anon Key Supabase belum diatur.');
      return;
    }

    const client = getSupabase();
    if (!client) {
      setErrorMessage('Koneksi Supabase tidak tersedia.');
      return;
    }

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setErrorMessage(translateAuthError(error));
        setLoading(false);
        return;
      }

      if (data?.user) {
        setSuccessMessage('Login berhasil! Mengalihkan ke dashboard...');
        setTimeout(() => {
          onAuthSuccess(data.user);
          onClose();
        }, 600);
      } else {
        setErrorMessage('Sesi login tidak ditemukan. Silakan periksa kembali email dan kata sandi.');
      }
    } catch (err: any) {
      setErrorMessage(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    handleResetState();

    if (!isConfigured) {
      setErrorMessage('Konfigurasi URL & Anon Key Supabase belum diatur.');
      return;
    }

    const client = getSupabase();
    if (!client) {
      setErrorMessage('Koneksi Supabase tidak tersedia.');
      return;
    }

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMessage('Kata sandi harus memiliki panjang minimal 6 karakter.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setErrorMessage(translateAuthError(error));
        setLoading(false);
        return;
      }

      if (data?.user && !data.session) {
        setRegisteredEmail(cleanEmail);
        setMode('verify_notice');
        setSuccessMessage(
          `Pendaftaran akun berhasil dibuat. Silakan lakukan konfirmasi email.`
        );
      } else if (data?.session && data?.user) {
        setSuccessMessage('Pendaftaran berhasil! Anda telah masuk secara otomatis.');
        setTimeout(() => {
          onAuthSuccess(data.user);
          onClose();
        }, 800);
      } else {
        setErrorMessage('Pendaftaran tidak dapat diselesaikan. Silakan coba lagi.');
      }
    } catch (err: any) {
      setErrorMessage(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    handleResetState();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Masukkan alamat email untuk menerima tautan pemulihan kata sandi.');
      return;
    }

    const client = getSupabase();
    if (!client) {
      setErrorMessage('Koneksi Supabase tidak tersedia.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        setErrorMessage(translateAuthError(error));
      } else {
        setSuccessMessage(
          `Instruksi pemulihan kata sandi telah dikirim ke ${cleanEmail}. Periksa kotak masuk dan folder spam Anda.`
        );
      }
    } catch (err: any) {
      setErrorMessage(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = registeredEmail || email.trim();
    if (!targetEmail) {
      setErrorMessage('Alamat email tidak ditemukan.');
      return;
    }

    setResendingEmail(true);
    setErrorMessage(null);

    const result = await resendVerificationEmail(targetEmail);
    setResendingEmail(false);

    if (result.success) {
      setSuccessMessage(result.message);
    } else {
      setErrorMessage(result.message);
    }
  };

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
            <div className="p-2 rounded-xl bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#252B34]">
              <ShieldCheck className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                {mode === 'signin' && 'Masuk ke TradeVault'}
                {mode === 'signup' && 'Buat Akun Trader Baru'}
                {mode === 'forgot' && 'Pemulihan Kata Sandi'}
                {mode === 'verify_notice' && 'Verifikasi Email Diperlukan'}
              </h3>
              <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                Autentikasi aman melalui Supabase Auth
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors"
            aria-label="Tutup"
          >
            <X className="h-5 w-5 stroke-[1.75]" />
          </button>
        </div>

        {!isConfigured ? (
          <div className="my-5 p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0 stroke-[1.75]" />
              <span>Koneksi Supabase Belum Dikonfigurasi</span>
            </div>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
              Untuk mendaftar dan masuk menggunakan Supabase Auth, Project URL dan Anon Key harus diatur terlebih dahulu melalui environment variables (<code>VITE_SUPABASE_URL</code> & <code>VITE_SUPABASE_ANON_KEY</code>) atau pengaturan database di aplikasi.
            </p>
            <button
              onClick={() => {
                onClose();
                onOpenConfig();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors"
            >
              <Database className="h-4 w-4 stroke-[1.75]" />
              <span>Buka Konfigurasi Supabase</span>
            </button>
          </div>
        ) : (
          <>
            {/* Navigation Tabs (only for signin & signup) */}
            {(mode === 'signin' || mode === 'signup') && (
              <div className="my-4 grid grid-cols-2 p-1 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    handleResetState();
                  }}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    mode === 'signin'
                      ? 'bg-[#1769E8] text-white'
                      : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  Masuk (Login)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    handleResetState();
                  }}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    mode === 'signup'
                      ? 'bg-[#1769E8] text-white'
                      : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  Daftar Akun Baru
                </button>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="my-3 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Success Message Box */}
            {successMessage && (
              <div className="my-3 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
            )}

            {/* VIEW 1: SIGN IN */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-semibold mb-1">Alamat Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="trader@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">Kata Sandi (Password)</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        handleResetState();
                      }}
                      className="text-[11px] text-[#1769E8] dark:text-[#60A5FA] hover:underline"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Masukkan kata sandi"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-10 py-2 text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 stroke-[1.75]" /> : <Eye className="h-4 w-4 stroke-[1.75]" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin stroke-[1.75]" />
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4 stroke-[1.75]" />
                      <span>Masuk ke Akun</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* VIEW 2: SIGN UP */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-semibold mb-1">Alamat Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="trader@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-semibold mb-1">Kata Sandi Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimal 6 karakter"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-10 py-2 text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]"
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 stroke-[1.75]" /> : <Eye className="h-4 w-4 stroke-[1.75]" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1">
                    Gunakan kombinasi huruf dan angka minimal 6 karakter.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9]">
                  <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block mb-0.5">Catatan Verifikasi Email:</span>
                  Jika verifikasi email diaktifkan pada project Supabase Anda, tautan konfirmasi akan dikirimkan ke email Anda sebelum dapat masuk.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin stroke-[1.75]" />
                      <span>Mendaftarkan...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 stroke-[1.75]" />
                      <span>Daftar Akun Baru</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* VIEW 3: FORGOT PASSWORD */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-semibold mb-1">Alamat Email Terdaftar</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#697586] dark:text-[#929BA9] stroke-[1.75]" />
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="trader@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] pl-9 pr-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1">
                    Kami akan mengirimkan instruksi dan tautan untuk membuat kata sandi baru.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin stroke-[1.75]" />
                      <span>Mengirimkan...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 stroke-[1.75]" />
                      <span>Kirim Tautan Pemulihan</span>
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      handleResetState();
                    }}
                    className="text-xs text-[#697586] dark:text-[#929BA9] hover:text-[#1769E8] dark:hover:text-[#60A5FA] font-medium"
                  >
                    ← Kembali ke Halaman Masuk
                  </button>
                </div>
              </form>
            )}

            {/* VIEW 4: VERIFY NOTICE (When Email Confirmation is required) */}
            {mode === 'verify_notice' && (
              <div className="space-y-4 text-xs py-2">
                <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
                  <div className="flex items-center gap-2 text-[#1769E8] dark:text-[#60A5FA] font-bold text-sm">
                    <Mail className="h-5 w-5 shrink-0 stroke-[1.75]" />
                    <span>Konfirmasi Email Telah Dikirim!</span>
                  </div>
                  <p className="text-[#151D2A] dark:text-[#F2F5F9] leading-relaxed text-xs">
                    Akun Anda telah berhasil dibuat di Supabase. Sebuah tautan verifikasi telah dikirimkan ke:
                  </p>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] font-mono-numbers text-[#1769E8] dark:text-[#60A5FA] text-xs text-center font-bold break-all">
                    {registeredEmail || email}
                  </div>
                  <div className="text-[11px] text-[#697586] dark:text-[#929BA9] space-y-1 pt-1">
                    <p className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Langkah berikutnya:</p>
                    <ol className="list-decimal list-inside space-y-1 pl-1">
                      <li>Buka aplikasi email Anda (cek kotak masuk atau folder spam).</li>
                      <li>Klik tautan verifikasi dari Supabase.</li>
                      <li>Setelah terverifikasi, kembali ke sini dan masuk menggunakan email & kata sandi Anda.</li>
                    </ol>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      handleResetState();
                    }}
                    className="w-full py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <LogIn className="h-4 w-4 stroke-[1.75]" />
                    <span>Saya Sudah Konfirmasi, Masuk Sekarang</span>
                  </button>

                  <button
                    type="button"
                    disabled={resendingEmail}
                    onClick={handleResendVerification}
                    className="w-full py-2 rounded-lg bg-[#EEF2F6] hover:bg-[#DDE3EA] dark:bg-[#171D26] dark:hover:bg-[#252B34] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] font-medium text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.75]" />
                        <span>Mengirim ulang...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                        <span>Kirim Ulang Email Konfirmasi</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
