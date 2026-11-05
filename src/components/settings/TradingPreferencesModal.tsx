import React, { useState, useEffect } from 'react';
import { AppSettings, CurrencyCode } from '../../types/settings';
import { X, Check } from 'lucide-react';

export type PreferenceCategory = 'balance' | 'currency' | 'broker' | 'risk' | 'adjustments';

interface TradingPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: PreferenceCategory;
  settings: AppSettings;
  onSave: (updatedSettings: AppSettings) => void;
}

export const TradingPreferencesModal: React.FC<TradingPreferencesModalProps> = ({
  isOpen,
  onClose,
  category,
  settings,
  onSave,
}) => {
  const [activeCategory, setActiveCategory] = useState<PreferenceCategory>(category);
  const [formData, setFormData] = useState<AppSettings>({ ...settings });

  useEffect(() => {
    setActiveCategory(category);
  }, [category]);

  useEffect(() => {
    setFormData({ ...settings });
  }, [settings, isOpen]);

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

  if (!isOpen) return null;

  const handleCurrencySelect = (curr: CurrencyCode) => {
    let symbol = '$';
    if (curr === 'IDR') symbol = 'Rp';
    if (curr === 'EUR') symbol = '€';
    setFormData({ ...formData, currency: curr, currencySymbol: symbol });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const categoryTitles: Record<PreferenceCategory, string> = {
    balance: 'Saldo Akun (Modal Awal)',
    currency: 'Mata Uang Akun',
    broker: 'Spesifikasi Broker (XAUUSD)',
    risk: 'Parameter Risiko & Target',
    adjustments: 'Penyesuaian Modal (Deposit / WD)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] rounded-2xl p-5 sm:p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-150 text-[#151D2A] dark:text-[#F2F5F9]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h3 className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">
              {categoryTitles[activeCategory]}
            </h3>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Atur parameter preferensi trading untuk kalkulasi jurnal dan manajemen risiko
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-md text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Category Switcher Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
          {(['balance', 'currency', 'broker', 'risk', 'adjustments'] as PreferenceCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`flex-1 min-w-[70px] py-1.5 px-2 text-[11px] font-medium rounded-md transition-colors cursor-pointer text-center ${
                activeCategory === cat
                  ? 'bg-white dark:bg-[#171D26] text-[#1458C4] dark:text-[#38BDF8] font-semibold shadow-xs'
                  : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
              }`}
            >
              {cat === 'balance' && 'Saldo'}
              {cat === 'currency' && 'Mata Uang'}
              {cat === 'broker' && 'Broker'}
              {cat === 'risk' && 'Risiko'}
              {cat === 'adjustments' && 'Deposit/WD'}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* CATEGORY: BALANCE */}
          {activeCategory === 'balance' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Modal Awal Akun ({formData.currencySymbol})
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.startingBalance}
                  onChange={(e) =>
                    setFormData({ ...formData, startingBalance: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                  required
                />
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1">
                  Digunakan sebagai patokan ekuitas dasar awal dan kalkulator persentase pertumbuhan.
                </p>
              </div>
            </div>
          )}

          {/* CATEGORY: CURRENCY */}
          {activeCategory === 'currency' && (
            <div className="space-y-3">
              <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium">
                Pilih Mata Uang Jurnal
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['USD', 'IDR', 'EUR'] as CurrencyCode[]).map((c) => {
                  const isSelected = formData.currency === c;
                  const symbol = c === 'IDR' ? 'Rp' : c === 'EUR' ? '€' : '$';
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCurrencySelect(c)}
                      className={`p-3 rounded-xl border text-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#1458C4] dark:border-[#38BDF8] bg-[#F5F7FA] dark:bg-[#171D26] text-[#1458C4] dark:text-[#38BDF8] font-bold'
                          : 'border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      <span className="block text-sm">{c}</span>
                      <span className="text-xs text-[#697586] dark:text-[#929BA9] block mt-0.5">{symbol}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CATEGORY: BROKER */}
          {activeCategory === 'broker' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Standar Jarak 1 Pip XAUUSD (Gold)
                </label>
                <select
                  value={formData.xauusdPipSize || 1.0}
                  onChange={(e) =>
                    setFormData({ ...formData, xauusdPipSize: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none font-mono-numbers"
                >
                  <option value={1.0}>1 Pip = $1.00 Harga (Contoh: 4000 → 3950 = 50 pips, 0.05 lot = $25)</option>
                  <option value={0.1}>1 Pip = $0.10 Harga (Contoh: 2720 → 2715 = 50 pips, 0.05 lot = $25)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Contract Size (Troy Ounces per 1.0 Lot Standar)
                </label>
                <select
                  value={formData.xauusdContractSize}
                  onChange={(e) =>
                    setFormData({ ...formData, xauusdContractSize: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                >
                  <option value={100}>100 oz (Standar Industri Forex/CFD MT5)</option>
                  <option value={10}>10 oz (Akun Mini)</option>
                  <option value={1}>1 oz (Akun Micro / Cent)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Perkiraan Komisi Broker per Lot ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.brokerCommissionPerLot}
                  onChange={(e) =>
                    setFormData({ ...formData, brokerCommissionPerLot: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9]">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block mb-0.5">
                  Rumus Standar: LOT × JARAK PIP = NILAI UANG
                </span>
                0.01 lot = $0.10/pip • 0.05 lot = $0.50/pip • 0.10 lot = $1.00/pip • 1.00 lot = $10.00/pip.
              </div>
            </div>
          )}

          {/* CATEGORY: RISK */}
          {activeCategory === 'risk' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Default Risiko per Trade (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={formData.defaultRiskPercent}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultRiskPercent: parseFloat(e.target.value) || 1.0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Basis Modal Perhitungan Risiko Default
                </label>
                <select
                  value={formData.riskCapitalBasis || 'EQUITY'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      riskCapitalBasis: e.target.value === 'BALANCE' ? 'BALANCE' : 'EQUITY',
                    })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                >
                  <option value="EQUITY">Ekuitas Saat Ini (Current Equity)</option>
                  <option value="BALANCE">Saldo Awal (Starting Balance)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Target Return Bulanan (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.targetMonthlyReturnPercent}
                  onChange={(e) =>
                    setFormData({ ...formData, targetMonthlyReturnPercent: parseFloat(e.target.value) || 8.0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* CATEGORY: ADJUSTMENTS */}
          {activeCategory === 'adjustments' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Total Deposit Tambahan ({formData.currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={formData.totalDeposits ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      totalDeposits: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Total Penarikan / Withdrawal ({formData.currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={formData.totalWithdrawals ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      totalWithdrawals: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1458C4] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] font-medium transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#1458C4] hover:bg-[#11469e] text-white font-semibold transition-colors cursor-pointer"
            >
              Simpan Pengaturan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
