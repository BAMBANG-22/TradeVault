/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  BarChart3,
  ShieldAlert,
  X,
  Plus,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { formatCurrency } from '../../utils/calculations';
import { useTheme } from '../../utils/theme';
import { BrandLogo } from './BrandLogo';

interface MobileNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
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

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onNavigate,
  isOpen,
  onClose,
  tradesCount,
  currentEquity,
  settings,
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
  onAddTrade,
}) => {
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const bottomTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trades', label: 'Trade Log', icon: BookOpen },
    { id: 'detail', label: 'Detail', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'risk', label: 'Risk', icon: ShieldAlert },
  ];

  const drawerItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'trades', label: 'Trade Log' },
    { id: 'add-trade', label: 'Catat Trade Baru' },
    { id: 'detail', label: 'Trade Detail' },
    { id: 'analytics', label: 'Analytics & Grafik' },
    { id: 'risk', label: 'Manajemen Risiko & Lot' },
    { id: 'settings', label: 'Pengaturan & Backup' },
  ];

  return (
    <>
      {/* Mobile Bottom Thumb Navigation Bar (Respects Android Safe Area Bottom) */}
      <nav
        aria-label="Navigasi Utama Bawah"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-[#DDE3EA] dark:border-[#252B34] bg-white/95 dark:bg-[#11151B]/95 backdrop-blur-md px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] transition-colors duration-150"
      >
        <div className="flex items-center justify-around">
          {bottomTabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[50px] py-1 px-1 text-[10px] font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#1769E8] font-semibold'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                <Icon className={`h-4 w-4 mb-0.5 ${isActive ? 'stroke-[2]' : 'stroke-[1.75]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Dedicated Global Add Transaction Shortcut Button */}
          <button
            type="button"
            onClick={() => {
              if (onAddTrade) {
                onAddTrade();
              } else {
                onNavigate('add-trade');
              }
            }}
            aria-label="Add Transaction"
            title="Add Transaction"
            data-testid="global-bottom-add-trade-button"
            className="flex flex-col items-center justify-center min-h-[44px] min-w-[48px] px-1 group cursor-pointer focus:outline-none"
          >
            <div className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-[#1769E8] hover:bg-[#1458C4] active:scale-95 text-white shadow-sm transition-all duration-150">
              <Plus className="h-4 w-4 stroke-[2.25]" />
            </div>
          </button>

          {bottomTabs.slice(2).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[50px] py-1 px-1 text-[10px] font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#1769E8] font-semibold'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                <Icon className={`h-4 w-4 mb-0.5 ${isActive ? 'stroke-[2]' : 'stroke-[1.75]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Slide-out Hamburger Drawer Overlay — MINIMAL VAULT DRAWER */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 dark:bg-black/75 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={onClose}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-[#11151B] border-r border-[#DDE3EA] dark:border-[#252B34] px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto flex flex-col justify-between shadow-xl animate-in slide-in-from-left duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* A. Header Drawer */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <div className="flex items-center gap-2.5">
                  <BrandLogo variant="symbol" className="h-6 w-6 shrink-0" />
                  <span className="text-[15px] font-bold tracking-tight text-[#151D2A] dark:text-[#F2F5F9]">
                    TradeVault
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -mr-1.5 rounded-md text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <X className="h-4 w-4 stroke-[1.75]" />
                </button>
              </div>

              {/* B. Informasi Saldo */}
              <div className="py-3.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block">
                  SALDO BERJALAN
                </span>
                <span className="text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] mt-0.5 block">
                  {formatCurrency(currentEquity, settings)}
                </span>
              </div>

              {/* C. Navigasi Utama */}
              <div className="py-3.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#697586] dark:text-[#929BA9] block mb-2">
                  MENU UTAMA
                </span>
                <nav className="flex flex-col space-y-0.5" aria-label="Menu Samping">
                  {drawerItems.map((item) => {
                    const isActive = activeTab === item.id;

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
                          onClose();
                        }}
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
                        onClick={() => {
                          onClose();
                          onOpenAccount();
                        }}
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
                        onClick={() => {
                          onClose();
                          onOpenAuth();
                        }}
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
                    onClick={() => {
                      onClose();
                      onOpenLocalInfo();
                    }}
                    className="text-xs font-medium text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
                  >
                    Info Status
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal();
                    }}
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
          </div>
        </div>
      )}
    </>
  );
};
