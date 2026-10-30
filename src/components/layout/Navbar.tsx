/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Plus,
  Menu,
  X,
  HardDrive,
  Download,
  LogIn,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { formatCurrency } from '../../utils/calculations';
import { BrandLogo } from './BrandLogo';

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

export const Navbar: React.FC<NavbarProps> = ({
  currentEquity,
  settings,
  activeTab,
  onNavigate,
  onOpenMobileMenu,
  isMobileMenuOpen,
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] px-4 sm:px-6 transition-colors duration-150">
      {/* Left: Mobile Brand & Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors"
          aria-label="Buka Menu"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5 stroke-[1.75]" /> : <Menu className="h-5 w-5 stroke-[1.75]" />}
        </button>

        {/* Adaptive Brand Logo on Mobile/Tablet */}
        <div className="flex items-center lg:hidden">
          {/* Narrow screens (< sm): symbol-only to avoid colliding with right actions */}
          <span className="inline-block sm:hidden">
            <BrandLogo variant="symbol" className="h-7 w-7" />
          </span>
          {/* Roomier mobile/tablet screens (>= sm): full horizontal lockup */}
          <span className="hidden sm:inline-block">
            <BrandLogo variant="lockup" className="h-7 w-auto" />
          </span>
        </div>

        {/* Current breadcrumb indicator on desktop */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-[#697586] dark:text-[#929BA9]">
          <span>Journal</span>
          <span>/</span>
          <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] capitalize">
            {activeTab.replace('-', ' ')}
          </span>
        </div>
      </div>

      {/* Right: Restrained Status, Equity & Add Trade */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Restrained Storage Mode Control */}
        <button
          type="button"
          onClick={onOpenLocalInfo}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:border-[#1769E8]/50 text-[11px] font-medium transition-colors"
          title="Informasi penyimpanan lokal (localStorage)"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          <HardDrive className="h-3.5 w-3.5 stroke-[1.75] shrink-0 hidden sm:inline" />
          <span className="font-semibold tracking-tight">Lokal</span>
        </button>

        {/* Quick Backup Trigger */}
        <button
          type="button"
          onClick={onOpenBackupModal}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] text-xs font-medium transition-colors"
          title="Buka menu Cadangan Data JSON & ZIP"
        >
          <Download className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
          <span>Backup</span>
        </button>

        {/* User Auth Status Control */}
        {currentUser ? (
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs text-[#151D2A] dark:text-[#F2F5F9] transition-colors"
            title={`Akun: ${currentUser.email} (Klik untuk profil & logout)`}
          >
            <div className="relative">
              <div className="h-5 w-5 rounded-full bg-white dark:bg-[#11151B] text-[#1769E8] flex items-center justify-center font-bold text-[10px] uppercase border border-[#DDE3EA] dark:border-[#252B34]">
                {(currentUser.email || 'U').charAt(0)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <span className="hidden sm:inline font-medium text-[#151D2A] dark:text-[#F2F5F9] max-w-[120px] truncate text-[11px]">
              {currentUser.email}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold transition-colors"
            title="Masuk atau Buat Akun Supabase"
          >
            <LogIn className="h-3.5 w-3.5 stroke-[1.75] text-[#1769E8]" />
            <span className="hidden sm:inline">Masuk</span>
          </button>
        )}

        {/* Saldo Terkini */}
        <div className="flex flex-col text-right pl-1 sm:pl-2 border-l border-[#DDE3EA] dark:border-[#252B34]">
          <span className="text-[10px] text-[#697586] dark:text-[#929BA9] uppercase tracking-wider">Saldo</span>
          <span className="text-xs sm:text-sm font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9]">
            {formatCurrency(currentEquity, settings)}
          </span>
        </div>

        {/* Catat Trade Action */}
        <button
          onClick={() => onNavigate('add-trade')}
          className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2]" />
          <span className="hidden sm:inline">Catat Trade</span>
        </button>
      </div>
    </header>
  );
};
