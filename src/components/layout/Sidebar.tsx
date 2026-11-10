/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  BarChart3,
  ShieldAlert,
  CandlestickChart,
  User,
  ChevronRight,
  Moon,
  Sun,
  Settings,
  Database,
  Info,
  HardDriveDownload,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { useTheme } from '../../utils/theme';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  tradesCount: number;
  currentEquity: number;
  settings: AppSettings;
  onOpenLocalInfo: () => void;
  onOpenBackupModal: () => void;
  currentUser?: any;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
  onAddTrade?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  tradesCount,
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
  onAddTrade,
}) => {
  const { isDark, toggleTheme } = useTheme();

  const mainMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trades', label: 'Trade Log', icon: BookOpen },
    { id: 'add-trade', label: 'Catat Trade Baru', icon: PlusCircle },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'risk', label: 'Risk Management', icon: ShieldAlert },
    { id: 'market-chart', label: 'Market Chart', icon: CandlestickChart },
  ];

  return (
    <aside
      data-testid="desktop-sidebar"
      className="hidden lg:flex w-64 flex-col justify-between border-r border-[#DDE3EA] dark:border-[#202630] bg-white dark:bg-[#0E1218] px-4 py-5 text-[#151D2A] dark:text-[#F2F5F9] transition-colors duration-150 sticky top-0 h-screen overflow-y-auto shrink-0"
    >
      <div className="space-y-4">
        {/* 1. Logo TradeVault */}
        <div
          data-testid="sidebar-logo-section"
          className="flex items-center gap-2.5 px-1 pb-3.5 border-b border-[#DDE3EA] dark:border-[#202630]"
        >
          <BrandLogo variant="symbol" className="h-6 w-6 shrink-0" />
          <span className="text-[15px] font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
            TradeVault
          </span>
        </div>

        {/* 2. Informasi Akun Aktif */}
        <div
          data-testid="sidebar-account-section"
          className="pb-3.5 border-b border-[#DDE3EA] dark:border-[#202630]"
        >
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenAccount}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#141922] hover:bg-[#F1F5F9] dark:hover:bg-[#1A202C] border border-[#DDE3EA] dark:border-[#202630] transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-white dark:bg-[#0E1218] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#151D2A] dark:text-[#F2F5F9] shrink-0">
                  <User className="h-4 w-4 stroke-[1.75]" />
                </div>
                <div className="min-w-0">
                  <span
                    className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block truncate"
                    title={currentUser.email}
                  >
                    {currentUser.email}
                  </span>
                  <span className="text-[11px] text-[#697586] dark:text-[#8E98A8] block mt-0.5">
                    Akun aktif
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#697586] dark:text-[#8E98A8] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] shrink-0 stroke-[1.75] transition-colors" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl bg-[#F8FAFC] dark:bg-[#141922] hover:bg-[#F1F5F9] dark:hover:bg-[#1A202C] border border-[#DDE3EA] dark:border-[#202630] transition-colors cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-white dark:bg-[#0E1218] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-center text-[#697586] dark:text-[#8E98A8] shrink-0">
                  <User className="h-4 w-4 stroke-[1.75]" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] block truncate">
                    Belum masuk
                  </span>
                  <span className="text-[11px] text-[#697586] dark:text-[#8E98A8] block mt-0.5">
                    Ketuk untuk masuk akun
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#697586] dark:text-[#8E98A8] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] shrink-0 stroke-[1.75] transition-colors" />
            </button>
          )}
        </div>

        {/* 3. Menu Utama */}
        <div
          data-testid="sidebar-main-section"
          className="pb-3.5 border-b border-[#DDE3EA] dark:border-[#202630]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#8E98A8] block px-2 mb-1.5">
            MENU UTAMA
          </span>
          <nav className="flex flex-col space-y-0.5" aria-label="Navigasi Desktop">
            {mainMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id || (item.id === 'trades' && activeTab === 'detail');

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'add-trade' && onAddTrade) {
                      onAddTrade();
                    } else {
                      onNavigate(item.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#F1F5F9] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] font-semibold'
                      : 'text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? 'text-[#151D2A] dark:text-[#F2F5F9] stroke-[2]'
                        : 'text-[#697586] dark:text-[#8E98A8] stroke-[1.75]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 4. Preferensi */}
        <div
          data-testid="sidebar-preferences-section"
          className="pb-3.5 border-b border-[#DDE3EA] dark:border-[#202630]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#8E98A8] block px-2 mb-1.5">
            PREFERENSI
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            data-testid="sidebar-theme-toggle"
            className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              {isDark ? (
                <Moon className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] stroke-[1.75]" />
              ) : (
                <Sun className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] stroke-[1.75]" />
              )}
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-[#151D2A] dark:text-[#F2F5F9] block leading-snug">
                  Tampilan
                </span>
                <span className="text-[11px] text-[#697586] dark:text-[#8E98A8] block">
                  {isDark ? 'Gelap' : 'Terang'}
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* 5. Pengaturan */}
        <div
          data-testid="sidebar-settings-section"
          className="pb-3.5 border-b border-[#DDE3EA] dark:border-[#202630]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#8E98A8] block px-2 mb-1.5">
            PENGATURAN
          </span>
          <div className="flex flex-col space-y-0.5">
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug transition-colors cursor-pointer group ${
                activeTab === 'settings'
                  ? 'bg-[#F1F5F9] dark:bg-[#171D26] text-[#151D2A] dark:text-[#F2F5F9] font-semibold'
                  : 'text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Settings className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
                <span className="truncate">Pengaturan Aplikasi</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentUser) {
                  onOpenAccount();
                } else {
                  onOpenAuth();
                }
              }}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <User className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
                <span className="truncate">Pengaturan Akun</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
            </button>
          </div>
        </div>

        {/* 6. Data & Penyimpanan */}
        <div data-testid="sidebar-storage-section" className="pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#8E98A8] block px-2 mb-1.5">
            DATA &amp; PENYIMPANAN
          </span>
          <div className="flex flex-col space-y-0.5">
            <button
              type="button"
              onClick={onOpenLocalInfo}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Database className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
                <span className="truncate">Penyimpanan Lokal</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#8E98A8]">
                  {tradesCount}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenLocalInfo}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Info className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
                <span className="truncate">Info Penyimpanan</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
            </button>

            <button
              type="button"
              onClick={onOpenBackupModal}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] leading-snug text-[#5E6A7D] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F8FAFC] dark:hover:bg-[#141922] font-medium transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <HardDriveDownload className="h-4 w-4 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
                <span className="truncate">Backup Data</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#697586] dark:text-[#8E98A8] stroke-[1.75]" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-3 mt-4 border-t border-[#DDE3EA] dark:border-[#202630] px-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#697586] dark:text-[#8E98A8] block">
          TRADEVAULT JOURNAL
        </span>
      </div>
    </aside>
  );
};
