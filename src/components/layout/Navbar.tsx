/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Menu, X, Bell, User } from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { BrandLogo } from './BrandLogo';
import { useLanguage } from '../../utils/language';

interface NavbarProps {
  currentEquity: number;
  settings: AppSettings;
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenMobileMenu: () => void;
  isMobileMenuOpen: boolean;
  onOpenLocalInfo: () => void;
  onOpenBackupModal: () => void;
  currentUser?: any;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
}

/**
 * Persistent App Header
 *
 * - Left: Hamburger menu button, official TradeVault symbol, and TRADEVAULT brand wordmark.
 * - Right: Circular notification icon button & circular profile icon button.
 * - Always persistent at top of viewport: remains static at top while content scrolls underneath.
 * - Respects Android / iOS safe area top.
 */
export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onNavigate,
  onOpenMobileMenu,
  isMobileMenuOpen,
  currentUser,
  onOpenAuth,
  onOpenAccount,
}) => {
  const { tr } = useLanguage();

  const desktopSectionLabels: Record<string, string> = {
    dashboard: tr('Dasbor', 'Dashboard'),
    trades: tr('Jurnal Trade', 'Trade Log'),
    detail: tr('Detail Transaksi', 'Trade Detail'),
    analytics: tr('Analitik', 'Analytics'),
    risk: tr('Manajemen Risiko', 'Risk Management'),
    'market-chart': tr('Chart Pasar', 'Market Chart'),
    'macro-news': 'Trade News',
    'cycle-confluence': 'Cycle & Confluence',
    settings: tr('Pengaturan', 'Settings'),
  };
  const desktopSectionTitle = desktopSectionLabels[activeTab] || 'VLO';
  const isSecondaryMenuTab =
    activeTab === 'market-chart' ||
    activeTab === 'macro-news' ||
    activeTab === 'cycle-confluence' ||
    activeTab === 'settings';

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 w-full isolate h-[calc(3.5rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-[#DDE3EA] dark:border-[#20252D] bg-white dark:bg-[#050607] backdrop-blur-md transition-colors duration-150 before:content-[''] before:absolute before:bottom-full before:left-0 before:right-0 before:h-20 before:bg-white dark:before:bg-[#050607] before:pointer-events-none"
    >
      <div className="w-full h-14 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile/Tablet Hamburger & Brand Lockup; Desktop Contextual Section Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            data-testid="header-hamburger-button"
            className="relative inline-flex lg:hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#151D2A] dark:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#101318] transition-colors cursor-pointer"
            aria-label={
              isMobileMenuOpen
                ? tr('Tutup Menu Navigasi', 'Close Navigation Menu')
                : tr('Buka Menu Navigasi', 'Open Navigation Menu')
            }
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5 stroke-[1.75]" />
            ) : (
              <Menu className="h-5 w-5 stroke-[1.75]" />
            )}
            {isSecondaryMenuTab && !isMobileMenuOpen && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#1769E8] dark:bg-[#3478DC] ring-2 ring-white dark:ring-[#050607]"
              />
            )}
          </button>

          {/* Official VLO Logo Symbol + Persistent Brand Wordmark (Mobile & Tablet) */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="group flex lg:hidden items-center gap-2.5 shrink-0 focus:outline-none cursor-pointer"
            aria-label={tr('VLO — Kembali ke Dasbor', 'VLO — Back to Dashboard')}
          >
            <BrandLogo
              variant="symbol"
              withTile
              className="h-9 w-9"
              title={tr('Simbol VLO', 'VLO Symbol')}
            />
            <span
              data-testid="header-brand-wordmark"
              className="inline-flex items-center"
            >
              <BrandLogo
                variant="wordmark"
                className="h-[19px] sm:h-[21px] w-auto"
                title="VLO"
              />
            </span>
          </button>

          {/* Mobile & Tablet Active Section Breadcrumb Badge */}
          <div className="flex lg:hidden items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="h-3.5 w-[1px] bg-[#DDE3EA] dark:bg-[#20252D] shrink-0"
            />
            <span
              data-testid="mobile-active-section-label"
              className={`text-[11px] font-bold uppercase tracking-[0.08em] truncate select-none ${
                isSecondaryMenuTab
                  ? 'text-[#1769E8] dark:text-[#60A5FA]'
                  : 'text-[#697586] dark:text-[#929BA9]'
              }`}
            >
              {desktopSectionTitle}
            </span>
          </div>

          {/* Desktop Contextual Section Title (Sidebar already displays brand & nav) */}
          <div className="hidden lg:flex items-center min-w-0">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#697586] dark:text-[#929BA9] truncate select-none">
              {desktopSectionTitle}
            </span>
          </div>
        </div>

        {/* Right: Circular notification button & circular profile button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onNavigate('macro-news')}
            data-testid="header-notification-button"
            className={`inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
              activeTab === 'macro-news'
                ? 'bg-[#1769E8]/10 text-[#1769E8] dark:bg-[#3478DC]/15 dark:text-[#60A5FA]'
                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:bg-[#F5F7FA] dark:hover:bg-[#101318]'
            }`}
            aria-label={tr('Jadwal & Notifikasi Berita (Trade News)', 'News Schedule & Alerts (Trade News)')}
            title={tr('Jadwal & Notifikasi Berita (Trade News)', 'News Schedule & Alerts (Trade News)')}
          >
            <Bell className="h-4 w-4 stroke-[1.75]" />
          </button>

          <button
            type="button"
            onClick={currentUser ? onOpenAccount : onOpenAuth}
            data-testid="header-account-button"
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:border-[#3478DC]/50 transition-colors cursor-pointer overflow-hidden"
            aria-label={currentUser ? tr('Akun Pengguna', 'User Account') : tr('Masuk ke Akun', 'Sign In to Account')}
            title={
              currentUser
                ? currentUser.user_metadata?.full_name ||
                  currentUser.user_metadata?.name ||
                  currentUser.email ||
                  tr('Akun Pengguna', 'User Account')
                : tr('Masuk ke Akun', 'Sign In to Account')
            }
          >
            {currentUser &&
            (currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture) ? (
              <img
                src={currentUser.user_metadata.avatar_url || currentUser.user_metadata.picture}
                alt={currentUser.user_metadata?.full_name || currentUser.email || 'User'}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="h-4 w-4 stroke-[1.75]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

