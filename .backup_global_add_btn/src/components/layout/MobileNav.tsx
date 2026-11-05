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
  Settings,
  X,
  Download,
  Info,
  Sun,
  Moon,
  LogIn,
  ShieldCheck,
  HardDrive,
  Cloud,
} from 'lucide-react';
import { AppSettings } from '../../types/settings';
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
  onOpenLocalInfo,
  onOpenBackupModal,
  currentUser,
  onOpenAuth,
  onOpenAccount,
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

  const drawerTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trades', label: 'Trade Log (Jurnal)', icon: BookOpen, badge: tradesCount },
    { id: 'detail', label: 'Trade Detail', icon: FileText },
    { id: 'analytics', label: 'Analytics & Kurva Ekuitas', icon: BarChart3 },
    { id: 'risk', label: 'Manajemen Risiko & Kalkulator Lot', icon: ShieldAlert },
    { id: 'settings', label: 'Pengaturan & Sistem', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Bottom Thumb Navigation Bar (Respects Android Safe Area Bottom) */}
      <nav
        aria-label="Navigasi Utama Bawah"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-[#DDE3EA] dark:border-[#252B34] bg-white/95 dark:bg-[#11151B]/95 backdrop-blur-md px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] transition-colors duration-150"
      >
        <div className="flex items-center justify-around">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
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
      </nav>

      {/* Slide-out Hamburger Drawer Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={onClose}
        >
          <div
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-[#11151B] border-r border-[#DDE3EA] dark:border-[#252B34] px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              {/* Drawer Brand Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <div className="flex items-center gap-2">
                  <BrandLogo variant="symbol" className="h-6 w-6" />
                  <span className="text-sm font-extrabold tracking-[0.06em] uppercase">
                    <span className="text-[#172033] dark:text-[#F8FAFC]">TRADE</span>
                    <span className="text-[#1458C4] dark:text-[#38BDF8]">VAULT</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <X className="h-4 w-4 stroke-[1.75]" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1" aria-label="Menu Samping">
                {drawerTabs.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
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
                        <Icon
                          className={`h-4 w-4 stroke-[1.75] ${isActive ? 'text-[#1769E8]' : ''}`}
                        />
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

              {/* Storage / Synchronization Status Section (Moved from Header) */}
              <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block px-1">
                  Status Penyimpanan &amp; Sinkronisasi
                </span>

                {/* 1. Local Storage Status */}
                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                      <HardDrive className="h-3.5 w-3.5 stroke-[1.75] text-amber-500" />
                      <span>Penyimpanan Lokal</span>
                    </span>
                    <span className="text-[10px] font-mono-numbers tabular-nums font-semibold text-[#697586] dark:text-[#929BA9]">
                      {tradesCount} Trade
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLocalInfo();
                      }}
                      className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Info className="h-3 w-3 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                      <span>Status Lokal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBackupModal();
                      }}
                      className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Download className="h-3 w-3 stroke-[1.75]" />
                      <span>Backup Data</span>
                    </button>
                  </div>
                </div>

                {/* 2. Cloud Synchronization Status */}
                <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                  {currentUser ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span>Cloud Terhubung</span>
                        </span>
                        <span
                          className="block text-[11px] text-[#697586] dark:text-[#929BA9] truncate mt-0.5"
                          title={currentUser.email}
                        >
                          {currentUser.email}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAccount();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#11151B] text-[#151D2A] dark:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] font-semibold hover:border-[#1769E8] transition-colors shrink-0 cursor-pointer"
                      >
                        Akun
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          <Cloud className="h-3.5 w-3.5 text-[#697586] dark:text-[#929BA9]" />
                          <span>Sinkronisasi Cloud</span>
                        </span>
                        <span className="block text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5">
                          Mode Offline / Lokal
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAuth();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-[11px] transition-colors shrink-0 cursor-pointer"
                      >
                        <LogIn className="h-3 w-3 stroke-[1.75]" />
                        <span>Masuk</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Theme Toggle (Light / Dark Stability) */}
                <button
                  type="button"
                  onClick={toggleTheme}
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
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9]">
                    {isDark ? 'Mode Gelap' : 'Mode Terang'}
                  </span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] flex items-center justify-between">
              <span>TradeVault Journal</span>
              <span className="font-mono-numbers">v3.2</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
