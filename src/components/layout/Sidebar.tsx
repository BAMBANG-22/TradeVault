/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppSettings } from '../../types/settings';
import { formatCurrency } from '../../utils/calculations';
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
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  tradesCount,
  currentEquity,
  settings,
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
}) => {
  const { isDark, toggleTheme } = useTheme();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'trades', label: 'Trade Log' },
    { id: 'add-trade', label: 'Catat Trade Baru' },
    { id: 'detail', label: 'Trade Detail' },
    { id: 'analytics', label: 'Analytics & Grafik' },
    { id: 'risk', label: 'Manajemen Risiko & Lot' },
    { id: 'settings', label: 'Pengaturan & Backup' },
  ];

  return (
    <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] px-5 py-5 text-[#151D2A] dark:text-[#F2F5F9] transition-colors duration-150 sticky top-0 h-screen overflow-y-auto shrink-0">
      <div>
        {/* A. Brand Header */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <BrandLogo variant="symbol" className="h-6 w-6 shrink-0" />
          <span className="text-[15px] font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
            TradeVault
          </span>
        </div>

        {/* B. Informasi Saldo */}
        <div className="py-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block">
            SALDO BERJALAN
          </span>
          <span className="text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] mt-0.5 block">
            {formatCurrency(currentEquity, settings)}
          </span>
        </div>

        {/* C. Navigasi Utama */}
        <div className="py-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block mb-2">
            MENU UTAMA
          </span>
          <nav className="flex flex-col space-y-0.5" aria-label="Navigasi Desktop">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full text-left pl-3 pr-2 py-2.5 text-[13px] leading-snug transition-colors cursor-pointer border-l-2 ${
                    isActive
                      ? 'border-[#1458C4] dark:border-[#38BDF8] bg-[#F5F7FA] dark:bg-[#171D26]/70 text-[#151D2A] dark:text-[#F2F5F9] font-semibold'
                      : 'border-transparent text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] hover:bg-[#F5F7FA]/60 dark:hover:bg-[#171D26]/40 font-medium'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Utility Sections */}
      <div className="mt-2">
        {/* D. Pengaturan Tema */}
        <div className="py-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between text-xs transition-colors cursor-pointer group"
          >
            <span className="font-medium text-[#697586] dark:text-[#929BA9] group-hover:text-[#151D2A] dark:group-hover:text-[#F2F5F9] transition-colors">
              Tema Tampilan
            </span>
            <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
              {isDark ? 'Gelap' : 'Terang'}
            </span>
          </button>
        </div>

        {/* E. Informasi Akun */}
        <div className="py-3 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block">
            AKUN
          </span>
          {currentUser ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] truncate"
                  title={currentUser.email}
                >
                  {currentUser.email}
                </span>
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline shrink-0 cursor-pointer"
                >
                  Profil
                </button>
              </div>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Cloud Aktif
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                  Mode Offline / Lokal
                </span>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline shrink-0 cursor-pointer"
                >
                  Masuk
                </button>
              </div>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block">
                Sinkronisasi Cloud
              </span>
            </>
          )}
        </div>

        {/* F. Informasi Penyimpanan */}
        <div className="py-3 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">
              Penyimpanan Lokal
            </span>
            <span className="text-xs font-semibold font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
              {tradesCount} Trade
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenLocalInfo}
              className="text-xs font-medium text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
            >
              Info Status
            </button>
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="text-xs font-semibold text-[#1458C4] dark:text-[#38BDF8] hover:underline transition-colors cursor-pointer"
            >
              Backup
            </button>
          </div>
        </div>

        {/* G. Footer */}
        <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#697586] dark:text-[#929BA9] block">
            TRADEVAULT JOURNAL
          </span>
        </div>
      </div>
    </aside>
  );
};
