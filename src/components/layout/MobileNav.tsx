/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Plus,
  BarChart3,
  ShieldAlert,
  Settings,
  X,
  Download,
  Info,
  Sun,
  Moon,
  LogIn,
  ShieldCheck,
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
}) => {
  const { isDark } = useTheme();

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

  const handleOpenAppearanceSettings = () => {
    onNavigate('settings');
    onClose();
    window.setTimeout(() => {
      const appearanceSection = document.getElementById('settings-appearance');
      if (appearanceSection) {
        appearanceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  const bottomTabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'trades', label: 'Trades', icon: BookOpen },
    { id: 'add-trade', label: 'Tambah', icon: Plus, isPrimary: true },
    { id: 'analytics', label: 'Analitik', icon: BarChart3 },
    { id: 'risk', label: 'Risiko', icon: ShieldAlert },
  ];

  const drawerTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trades', label: 'Trade Log', icon: BookOpen, badge: tradesCount },
    { id: 'add-trade', label: 'Catat Trade Baru', icon: Plus },
    { id: 'analytics', label: 'Analytics & Grafik', icon: BarChart3 },
    { id: 'risk', label: 'Manajemen Risiko & Lot', icon: ShieldAlert },
    { id: 'settings', label: 'Pengaturan & Backup', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Bottom Thumb Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] transition-colors duration-150">
        <div className="flex items-center justify-around">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            if (tab.isPrimary) {
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#1769E8] hover:bg-[#1458C4] text-white border-2 border-white dark:border-[#11151B] transition-colors cursor-pointer"
                  aria-label="Catat Trade Baru"
                >
                  <Plus className="h-5 w-5 stroke-[2.25]" />
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] min-w-[56px] py-1 px-2 text-[10px] font-medium transition-colors cursor-pointer ${
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
      </div>

      {/* Slide-out Drawer Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-150"
          onClick={onClose}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-[#11151B] border-r border-[#DDE3EA] dark:border-[#252B34] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <div className="space-y-1">
                  <BrandLogo variant="lockup" className="h-7 w-auto block" />
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] tracking-wider uppercase font-semibold block pl-0.5">
                    XAUUSD Journal
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <X className="h-5 w-5 stroke-[1.75]" />
                </button>
              </div>

              {/* Saldo Card */}
              <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block">
                  Saldo Akun
                </span>
                <span className="text-lg font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] break-words">
                  {formatCurrency(currentEquity, settings)}
                </span>
              </div>

              {/* Appearance Settings Navigation inside Drawer */}
              <button
                type="button"
                onClick={handleOpenAppearanceSettings}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] bg-[#F5F7FA] dark:bg-[#171D26] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  {isDark ? (
                    <Moon className="h-4 w-4 stroke-[1.75] text-[#929BA9]" />
                  ) : (
                    <Sun className="h-4 w-4 stroke-[1.75] text-[#697586]" />
                  )}
                  <span>Tema Tampilan</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
                  {isDark ? 'Mode Gelap →' : 'Mode Terang →'}
                </span>
              </button>

              {/* User Account / Auth Status in Drawer */}
              {currentUser ? (
                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full bg-white dark:bg-[#11151B] text-[#1769E8] flex items-center justify-center font-bold text-xs uppercase border border-[#DDE3EA] dark:border-[#252B34] shrink-0">
                        {(currentUser.email || 'U').charAt(0)}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-white dark:border-[#11151B]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold truncate max-w-[120px]" title={currentUser.email}>
                        {currentUser.email}
                      </span>
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1 font-mono-numbers">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                        <span>Cloud Aktif</span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#11151B] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-xs font-semibold hover:border-[#1769E8] transition-colors cursor-pointer"
                  >
                    Profil
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold block">Supabase Auth</span>
                    <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">Belum masuk</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <LogIn className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Masuk</span>
                  </button>
                </div>
              )}

              {/* Navigation */}
              <nav className="space-y-1">
                {drawerTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34]'
                          : 'text-[#697586] dark:text-[#929BA9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 stroke-[1.75] ${isActive ? 'text-[#1769E8]' : ''}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono-numbers tabular-nums font-semibold bg-[#DDE3EA]/70 dark:bg-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Footer with storage indicator & backup */}
            <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-3">
              <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#151D2A] dark:text-[#F2F5F9]">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Penyimpanan Lokal
                  </span>
                  <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
                    {tradesCount} Trade
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLocalInfo();
                    }}
                    className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Info className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                    <span>Info</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal();
                    }}
                    className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 stroke-[1.75]" />
                    <span>Backup</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center justify-between">
                <span>TradeVault Journal</span>
                <span>XAUUSD</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
