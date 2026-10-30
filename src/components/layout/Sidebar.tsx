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
  Settings,
  Download,
  Info,
  LogIn,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
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
  const { isDark } = useTheme();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'trades', label: 'Trade Log', icon: BookOpen, badge: tradesCount },
    { id: 'add-trade', label: 'Add Trade', icon: PlusCircle, isHighlight: true },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'risk', label: 'Risk Management', icon: ShieldAlert },
    { id: 'settings', label: 'Settings & Backup', icon: Settings },
  ];

  const totalGain = currentEquity - settings.startingBalance;
  const isGainPositive = totalGain >= 0;

  const handleOpenAppearanceSettings = () => {
    onNavigate('settings');
    window.setTimeout(() => {
      const appearanceSection = document.getElementById('settings-appearance');
      if (appearanceSection) {
        appearanceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  return (
    <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 text-[#151D2A] dark:text-[#F2F5F9] transition-colors duration-150">
      <div className="space-y-5">
        {/* Brand Header */}
        <div className="px-2 py-1 space-y-1">
          <BrandLogo variant="lockup" className="h-8 w-auto block" />
          <span className="text-[10px] uppercase tracking-widest text-[#697586] dark:text-[#929BA9] font-semibold block pl-0.5">
            XAUUSD Journal
          </span>
        </div>

        {/* Quick Account Snapshot Card */}
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#697586] dark:text-[#929BA9]">
            <span>Saldo Berjalan</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono-numbers font-semibold text-[#697586] dark:text-[#929BA9]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <div className="text-xl font-bold font-mono-numbers tabular-nums text-[#151D2A] dark:text-[#F2F5F9] break-words">
            {formatCurrency(currentEquity, settings)}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono-numbers tabular-nums pt-1.5 border-t border-[#DDE3EA] dark:border-[#252B34]">
            <span className="text-[#697586] dark:text-[#929BA9]">Net Growth:</span>
            <span className={`font-semibold ${isGainPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isGainPositive ? '+' : ''}{formatCurrency(totalGain, settings)}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34]'
                    : item.isHighlight
                    ? 'text-[#1769E8] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26]'
                    : 'text-[#697586] dark:text-[#929BA9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 stroke-[1.75] ${isActive || item.isHighlight ? 'text-[#1769E8]' : 'text-[#697586] dark:text-[#929BA9]'}`} />
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

      {/* Footer Info: Appearance Access, User Account & Storage Controls */}
      <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] space-y-3">
        {/* Appearance Settings Access (Settings -> Appearance) */}
        <button
          type="button"
          onClick={handleOpenAppearanceSettings}
          className="w-full p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-2 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {isDark ? (
              <Moon className="h-3.5 w-3.5 stroke-[1.75] text-[#929BA9]" />
            ) : (
              <Sun className="h-3.5 w-3.5 stroke-[1.75] text-[#697586]" />
            )}
            <span>Tampilan (Tema)</span>
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9]">
            {isDark ? 'Dark' : 'Light'}
          </span>
        </button>

        {/* User Account Card */}
        {currentUser ? (
          <div className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative">
                <div className="h-7 w-7 rounded-full bg-white dark:bg-[#11151B] text-[#1769E8] flex items-center justify-center font-bold text-xs uppercase border border-[#DDE3EA] dark:border-[#252B34] shrink-0">
                  {(currentUser.email || 'U').charAt(0)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-white dark:border-[#11151B]" />
              </div>
              <div className="min-w-0">
                <span className="block text-[#151D2A] dark:text-[#F2F5F9] text-xs font-semibold truncate max-w-[110px]" title={currentUser.email}>
                  {currentUser.email}
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] flex items-center gap-1 font-mono-numbers">
                  <ShieldCheck className="h-2.5 w-2.5 text-emerald-500" />
                  <span>Supabase Aktif</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAccount}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#11151B] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-[10px] font-semibold transition-colors shrink-0 cursor-pointer"
            >
              Akun
            </button>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between gap-2">
            <div className="text-[11px]">
              <span className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold block">Supabase Cloud</span>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">Belum masuk</span>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white font-semibold text-[11px] transition-colors cursor-pointer"
            >
              <LogIn className="h-3 w-3 stroke-[1.75]" />
              <span>Masuk</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs px-0.5">
          <span>Instrumen Utama</span>
          <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] font-mono-numbers">XAUUSD</span>
        </div>

        {/* Restrained Storage & Backup Panel */}
        <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#151D2A] dark:text-[#F2F5F9]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Penyimpanan Lokal
            </span>
            <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-mono-numbers tabular-nums">
              {tradesCount} Trade
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onOpenLocalInfo}
              className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Info className="h-3 w-3 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <span>Info Status</span>
            </button>
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="py-1.5 px-2 rounded-lg bg-white dark:bg-[#11151B] hover:border-[#1769E8] border border-[#DDE3EA] dark:border-[#252B34] text-[#1769E8] text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Download className="h-3 w-3 stroke-[1.75]" />
              <span>Backup</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
