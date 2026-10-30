import React, { useState, useMemo } from 'react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import {
  calculateXauusdLot,
  simulateConsecutiveLosses,
  evaluateTradingDiscipline,
  ConsecutiveLossMethod,
} from '../../utils/riskCalculator';
import { formatCurrency } from '../../utils/calculations';
import { CompoundingCalculatorTab } from './CompoundingCalculatorTab';
import { TradeSimulationTab } from './TradeSimulationTab';
import {
  ShieldAlert,
  Calculator,
  Sliders,
  TrendingDown,
  AlertTriangle,
  Info,
  Coins,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Scale,
  AlertOctagon,
  FileText,
} from 'lucide-react';

interface RiskCalculatorViewProps {
  currentEquity: number;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  dailyLossToday: number;
  trades?: Trade[];
}

type RiskTabType =
  | 'lot-calc'
  | 'risk-rules'
  | 'consecutive-sim'
  | 'discipline-audit'
  | 'compounding'
  | 'trade-sim';

export const RiskCalculatorView: React.FC<RiskCalculatorViewProps> = ({
  currentEquity,
  settings,
  onUpdateSettings,
  dailyLossToday,
  trades = [],
}) => {
  const [activeTab, setActiveTab] = useState<RiskTabType>('lot-calc');

  // Lot Calculator Inputs
  const [capitalBaseMode, setCapitalBaseMode] = useState<'equity' | 'starting' | 'custom'>('equity');
  const [customCapitalInput, setCustomCapitalInput] = useState<string>('');
  const [position, setPosition] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState<string>('2720.00');
  const [stopLoss, setStopLoss] = useState<string>('2715.00');
  const [takeProfit, setTakeProfit] = useState<string>('2730.00');
  const [riskMode, setRiskMode] = useState<'PERCENT' | 'NOMINAL'>('PERCENT');
  const [riskPercent, setRiskPercent] = useState<number>(settings.defaultRiskPercent || 1.0);
  const [customRiskAmount, setCustomRiskAmount] = useState<string>('');

  // Broker Specifications
  const [showBrokerSpecs, setShowBrokerSpecs] = useState<boolean>(false);
  const [contractSize, setContractSize] = useState<number>(settings.xauusdContractSize || 100);
  const [minLot] = useState<number>(settings.xauusdMinLot || 0.01);
  const [lotStep, setLotStep] = useState<number>(settings.xauusdLotStep || 0.01);
  const [leverage, setLeverage] = useState<number>(settings.defaultLeverage || 500);

  // Consecutive Loss Simulation Inputs
  const [simCapital, setSimCapital] = useState<string>(
    String(currentEquity > 0 ? Math.round(currentEquity) : settings.startingBalance)
  );
  const [simRiskMode, setSimRiskMode] = useState<ConsecutiveLossMethod>('PERCENT_RUNNING_EQUITY');
  const [simRiskValue, setSimRiskValue] = useState<number>(settings.defaultRiskPercent || 1.0);
  const [simSteps, setSimSteps] = useState<number>(10);

  // Determine active capital for Lot Calculator
  const activeCapital = useMemo(() => {
    if (capitalBaseMode === 'equity') {
      return currentEquity > 0 ? currentEquity : settings.startingBalance;
    }
    if (capitalBaseMode === 'starting') {
      return settings.startingBalance;
    }
    return parseFloat(customCapitalInput) || (currentEquity > 0 ? currentEquity : settings.startingBalance);
  }, [capitalBaseMode, currentEquity, settings.startingBalance, customCapitalInput]);

  // Compute Lot Sizing Result
  const parsedEntry = parseFloat(entryPrice) || 0;
  const parsedSL = parseFloat(stopLoss) || 0;
  const parsedTP = takeProfit ? parseFloat(takeProfit) : undefined;
  const parsedManualRisk = riskMode === 'NOMINAL' && customRiskAmount ? parseFloat(customRiskAmount) : undefined;

  const lotResult = useMemo(() => {
    return calculateXauusdLot(
      {
        equity: activeCapital,
        riskPercent: riskMode === 'PERCENT' ? riskPercent : 1.0,
        riskAmountManual: parsedManualRisk,
        entryPrice: parsedEntry,
        stopLossPrice: parsedSL,
        takeProfitPrice: parsedTP,
        position,
        contractSize,
        minLot,
        lotStep,
        leverage,
        accountCurrency: settings.currency,
      },
      settings
    );
  }, [
    activeCapital,
    riskMode,
    riskPercent,
    parsedManualRisk,
    parsedEntry,
    parsedSL,
    parsedTP,
    position,
    contractSize,
    minLot,
    lotStep,
    leverage,
    settings,
  ]);

  // Consecutive Losses Simulation
  const parsedSimCapital = parseFloat(simCapital) || settings.startingBalance;
  const consecutiveLossSteps = useMemo(() => {
    return simulateConsecutiveLosses(parsedSimCapital, simRiskValue, simSteps, simRiskMode);
  }, [parsedSimCapital, simRiskValue, simSteps, simRiskMode]);

  // Discipline & Risk Audit
  const disciplineResult = useMemo(() => {
    return evaluateTradingDiscipline(trades, settings);
  }, [trades, settings]);

  // Protection Status Evaluators
  const currentDailyLossPercent = activeCapital > 0 ? (dailyLossToday / activeCapital) * 100 : 0;
  const isDailyLossBreached =
    dailyLossToday >= settings.maxDailyLossAmount ||
    currentDailyLossPercent >= settings.maxDailyLossPercent;
  const isDailyLossWarning =
    !isDailyLossBreached &&
    (dailyLossToday >= settings.maxDailyLossAmount * 0.7 ||
      currentDailyLossPercent >= settings.maxDailyLossPercent * 0.7);

  const maxDrawdownLimit = settings.maxDrawdownLimitPercent || 10.0;
  const currentDrawdownAmount = Math.max(0, settings.startingBalance - currentEquity);
  const currentDrawdownPercent =
    settings.startingBalance > 0 ? (currentDrawdownAmount / settings.startingBalance) * 100 : 0;
  const isDrawdownBreached = currentDrawdownPercent >= maxDrawdownLimit;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div>
          <h2 className="text-xl font-bold text-[#151D2A] dark:text-[#F2F5F9]">
            Manajemen Risiko, Proteksi Akun & Kalkulator Lot XAUUSD
          </h2>
          <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
            Sistem evaluasi risiko presisi, simulator posisi lot MT5, dan audit kepatuhan rencana trading
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-numbers">
          <div className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5">
            <span className="text-[#697586] dark:text-[#929BA9] font-sans">Ekuitas: </span>
            <span className="font-bold text-[#151D2A] dark:text-[#F2F5F9]">{formatCurrency(currentEquity, settings)}</span>
          </div>
          <div className="rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
            <span className="text-[#697586] dark:text-[#929BA9] font-sans">Reset: </span>
            <span className="text-[#151D2A] dark:text-[#F2F5F9]">{settings.resetTimezone || 'WIB (UTC+7)'}</span>
          </div>
        </div>
      </div>

      {/* Daily Loss Status Guard Alert */}
      <div className="p-4 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg border bg-[#EEF2F6] dark:bg-[#171D26] border-[#DDE3EA] dark:border-[#252B34]">
            {isDailyLossBreached ? (
              <AlertOctagon className="h-5 w-5 stroke-[1.75] text-rose-600 dark:text-rose-400" />
            ) : isDailyLossWarning ? (
              <AlertTriangle className="h-5 w-5 stroke-[1.75] text-amber-600 dark:text-amber-400" />
            ) : (
              <ShieldCheck className="h-5 w-5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div>
            <div className="font-bold text-sm flex items-center gap-2">
              <span
                className={
                  isDailyLossBreached
                    ? 'text-rose-600 dark:text-rose-400'
                    : isDailyLossWarning
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[#151D2A] dark:text-[#F2F5F9]'
                }
              >
                {isDailyLossBreached
                  ? 'STATUS: BATAS KERUGIAN HARIAN TERLAMPAUI!'
                  : isDailyLossWarning
                  ? 'STATUS: PERINGATAN MENDEKATI BATAS RUGI HARIAN'
                  : 'STATUS PROTEKSI RISIKO: AMAN DALAM TOLERANSI'}
              </span>
            </div>
            <div className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5 font-mono-numbers">
              Rugi hari ini: <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{formatCurrency(dailyLossToday, settings)}</strong> ({currentDailyLossPercent.toFixed(1)}%) •
              Maksimum toleransi: <strong className="text-[#151D2A] dark:text-[#F2F5F9]">{formatCurrency(settings.maxDailyLossAmount, settings)}</strong> ({settings.maxDailyLossPercent}%)
            </div>
          </div>
        </div>

        {isDailyLossBreached && (
          <div className="px-3 py-1.5 rounded-lg bg-[#EEF2F6] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider shrink-0">
            Hentikan Trading Hari Ini
          </div>
        )}
      </div>

      {/* Main Tab Navigation Buttons */}
      <div className="flex flex-wrap gap-2 border-b border-[#DDE3EA] dark:border-[#252B34] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('lot-calc')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'lot-calc'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <Calculator className="h-4 w-4 stroke-[1.75]" />
          <span>1. Kalkulator Lot XAUUSD</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('risk-rules')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'risk-rules'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <ShieldAlert className="h-4 w-4 stroke-[1.75]" />
          <span>2. Proteksi & Aturan Risiko</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('consecutive-sim')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'consecutive-sim'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <TrendingDown className="h-4 w-4 stroke-[1.75]" />
          <span>3. Simulasi Loss Beruntun</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('discipline-audit')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'discipline-audit'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <FileText className="h-4 w-4 stroke-[1.75]" />
          <span>4. Evaluasi Disiplin ({trades.length} Trade)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('compounding')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'compounding'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <Coins className="h-4 w-4 stroke-[1.75]" />
          <span>Simulator Compounding</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trade-sim')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'trade-sim'
              ? 'bg-[#1769E8] text-white font-bold'
              : 'bg-white hover:bg-[#EEF2F6] dark:bg-[#11151B] dark:hover:bg-[#171D26] text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] border border-[#DDE3EA] dark:border-[#252B34]'
          }`}
        >
          <Activity className="h-4 w-4 stroke-[1.75]" />
          <span>Simulasi Berbasis Trade</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: KALKULATOR LOT XAUUSD & SPESIFIKASI BROKER
      ========================================================================= */}
      {activeTab === 'lot-calc' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Input Kalkulator */}
            <div className="lg:col-span-2 rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <div className="flex items-center gap-2.5">
                  <Calculator className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                      Kalkulator Position Sizing XAUUSD (Gold)
                    </h3>
                    <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                      Hitung lot presisi dan pembulatan ke bawah (*floor*) sesuai lot step broker MT5
                    </p>
                  </div>
                </div>

                {/* BUY / SELL Switch */}
                <div className="flex rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#252B34] text-xs">
                  <button
                    type="button"
                    onClick={() => setPosition('BUY')}
                    className={`px-3 py-1 rounded font-bold transition-colors ${
                      position === 'BUY'
                        ? 'bg-white dark:bg-[#171D26] text-emerald-600 dark:text-emerald-400 border border-[#DDE3EA] dark:border-[#252B34]'
                        : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosition('SELL')}
                    className={`px-3 py-1 rounded font-bold transition-colors ${
                      position === 'SELL'
                        ? 'bg-white dark:bg-[#171D26] text-rose-600 dark:text-rose-400 border border-[#DDE3EA] dark:border-[#252B34]'
                        : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              {/* Basis Modal / Saldo */}
              <div>
                <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                  Basis Saldo Perhitungan
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCapitalBaseMode('equity')}
                    className={`py-1.5 px-2 rounded-lg border font-mono-numbers text-center transition-colors ${
                      capitalBaseMode === 'equity'
                        ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40 font-semibold'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    Ekuitas ({formatCurrency(currentEquity, settings)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapitalBaseMode('starting')}
                    className={`py-1.5 px-2 rounded-lg border font-mono-numbers text-center transition-colors ${
                      capitalBaseMode === 'starting'
                        ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40 font-semibold'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    Modal Awal ({formatCurrency(settings.startingBalance, settings)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapitalBaseMode('custom')}
                    className={`py-1.5 px-2 rounded-lg border text-center transition-colors ${
                      capitalBaseMode === 'custom'
                        ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40 font-semibold'
                        : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                    }`}
                  >
                    Kustom Nominal
                  </button>
                </div>
                {capitalBaseMode === 'custom' && (
                  <input
                    type="number"
                    step="100"
                    placeholder="Masukkan nominal saldo basis..."
                    value={customCapitalInput}
                    onChange={(e) => setCustomCapitalInput(e.target.value)}
                    className="mt-2 w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                )}
              </div>

              {/* Price Inputs: Entry, SL, TP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1">
                    Entry Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-rose-600 dark:text-rose-400 mb-1">
                    Stop Loss Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-rose-600 dark:text-rose-400 focus:border-[#1769E8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                    Take Profit Price ($) <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">(Opsional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="Contoh: 2735.00"
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-emerald-600 dark:text-emerald-400 focus:border-[#1769E8] focus:outline-none"
                  />
                </div>
              </div>

              {/* Risk Method Toggle: Percent or Nominal */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9]">Toleransi Risiko per Posisi</label>
                  <div className="flex rounded-md bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRiskMode('PERCENT')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        riskMode === 'PERCENT'
                          ? 'bg-[#1769E8] text-white font-semibold'
                          : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      Persen (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRiskMode('NOMINAL')}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        riskMode === 'NOMINAL'
                          ? 'bg-[#1769E8] text-white font-semibold'
                          : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      Nominal ($)
                    </button>
                  </div>
                </div>

                {riskMode === 'PERCENT' ? (
                  <div className="flex items-center gap-1.5">
                    {[0.5, 1.0, 1.5, 2.0, 3.0].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setRiskPercent(pct)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-mono-numbers font-medium transition-colors ${
                          riskPercent === pct
                            ? 'bg-[#1769E8]/10 dark:bg-[#1769E8]/15 text-[#1769E8] dark:text-[#60A5FA] border-[#1769E8]/40 font-bold'
                            : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="10"
                    placeholder="Tentukan nominal risiko, misal: 100"
                    value={customRiskAmount}
                    onChange={(e) => setCustomRiskAmount(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                )}
              </div>

              {/* Collapsible Broker Specification Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowBrokerSpecs(!showBrokerSpecs)}
                  className="flex items-center gap-1.5 text-xs text-[#1769E8] dark:text-[#60A5FA] hover:underline font-semibold"
                >
                  <Sliders className="h-3.5 w-3.5 stroke-[1.75]" />
                  <span>
                    {showBrokerSpecs ? 'Sembunyikan' : 'Sesuaikan'} Spesifikasi Simbol Broker MT5
                  </span>
                </button>

                {showBrokerSpecs && (
                  <div className="mt-3 p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-3 animate-in fade-in duration-150">
                    <div className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Parameter ini disesuaikan dengan tab <em>Symbol Specification</em> pada MT5 broker Anda:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[#697586] dark:text-[#929BA9] mb-1">Contract Size (oz / 1 Lot)</label>
                        <select
                          value={contractSize}
                          onChange={(e) => setContractSize(Number(e.target.value))}
                          className="w-full rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8]"
                        >
                          <option value={100}>100 oz (Standard MT5)</option>
                          <option value={10}>10 oz (Mini)</option>
                          <option value={1}>1 oz (Micro / Cent)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#697586] dark:text-[#929BA9] mb-1">Lot Step Broker</label>
                        <select
                          value={lotStep}
                          onChange={(e) => setLotStep(Number(e.target.value))}
                          className="w-full rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] font-mono-numbers"
                        >
                          <option value={0.01}>0.01 (Standar Broker)</option>
                          <option value={0.1}>0.10 (Cent / Khusus)</option>
                          <option value={1.0}>1.00 (Institusional)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#697586] dark:text-[#929BA9] mb-1">Leverage Akun</label>
                        <select
                          value={leverage}
                          onChange={(e) => setLeverage(Number(e.target.value))}
                          className="w-full rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1.5 text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] font-mono-numbers"
                        >
                          <option value={100}>1:100</option>
                          <option value={200}>1:200</option>
                          <option value={500}>1:500 (Umum)</option>
                          <option value={1000}>1:1000</option>
                          <option value={2000}>1:2000</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Lot Result Display Card */}
              {lotResult.isValid ? (
                <div className="mt-4 p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-4">
                  {/* Recommended Lot Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] font-semibold">
                        Lot Rekomendasi (Dibulatkan ke Bawah)
                      </span>
                      <div className="text-3xl font-extrabold font-mono-numbers text-[#1769E8] dark:text-[#60A5FA] mt-0.5 flex items-baseline gap-2">
                        <span>{lotResult.recommendedLot}</span>
                        <span className="text-xs font-sans text-[#697586] dark:text-[#929BA9] font-normal">
                          Lots (Persis: {lotResult.calculatedLot})
                        </span>
                      </div>
                    </div>

                    <div className="text-left sm:text-right font-mono-numbers text-xs">
                      <div className="text-[#697586] dark:text-[#929BA9] font-sans">Estimasi Kerugian pada SL:</div>
                      <div className="text-rose-600 dark:text-rose-400 font-bold text-base">
                        -{formatCurrency(lotResult.estimatedLossAtSL, settings)}
                      </div>
                      <div className="text-[10px] text-[#697586] dark:text-[#929BA9] font-sans">
                        Rencana: {formatCurrency(lotResult.riskAmount, settings)}
                      </div>
                    </div>
                  </div>

                  {/* Warning if below min lot */}
                  {lotResult.isBelowMinLot && (
                    <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] text-xs flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 stroke-[1.75]" />
                      <span>
                        Lot hasil kalkulasi ({lotResult.calculatedLot}) berada di bawah batas minimum broker ({lotResult.minLot} lot). Jika Anda membuka {lotResult.minLot} lot, risiko kerugian akan melampaui rencana!
                      </span>
                    </div>
                  )}

                  {/* Metrics Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-numbers">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Jarak Stop Loss</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                        ${lotResult.slDistancePrice.toFixed(2)} ({lotResult.slDistancePips} pips)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Loss per 1.0 Lot</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        ${lotResult.lossPerLot.toFixed(0)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Estimasi Margin</span>
                      <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                        {formatCurrency(lotResult.requiredMargin, settings)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Margin Level</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {lotResult.marginLevelPercent > 0 ? `${lotResult.marginLevelPercent.toFixed(0)}%` : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Take Profit & R:R Custom Display */}
                  {lotResult.hasCustomTP && (
                    <div className="p-3 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono-numbers">
                      <div>
                        <span className="text-[#697586] dark:text-[#929BA9] font-sans block text-[11px]">
                          Target TP ${parsedTP?.toFixed(2)}:
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          +{formatCurrency(lotResult.estimatedProfitAtTP, settings)}
                        </span>
                      </div>
                      <div className="sm:text-right">
                        <span className="text-[#697586] dark:text-[#929BA9] font-sans block text-[11px]">
                          Risk to Reward Terwujud:
                        </span>
                        <span className="font-bold text-[#1769E8] dark:text-[#60A5FA] text-sm">
                          1 : {lotResult.rewardRiskRatio.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Preset R:R Targets (1:1.5, 1:2, 1:3, 1:5) */}
                  <div className="pt-1">
                    <div className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-2 flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                      Simulasi Target Take Profit Otomatis (R:R Scenario)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {lotResult.tpScenarios.map((tp) => (
                        <div
                          key={tp.ratio}
                          className="p-2.5 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]"
                        >
                          <div className="flex items-center justify-between pb-1 border-b border-[#DDE3EA] dark:border-[#252B34] text-xs">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{tp.ratio}</span>
                            <span className="font-mono-numbers text-[10px] text-[#697586] dark:text-[#929BA9]">+{tp.gainPercent.toFixed(1)}%</span>
                          </div>
                          <div className="mt-1.5 font-mono-numbers text-[11px] space-y-0.5">
                            <div className="text-[#151D2A] dark:text-[#F2F5F9] font-semibold">${tp.targetPrice.toFixed(2)}</div>
                            <div className="text-emerald-600 dark:text-emerald-400 font-bold">+{formatCurrency(tp.profitAmount, settings)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 stroke-[1.75]" />
                  <span>{lotResult.errorMessage || 'Masukkan harga entry dan Stop Loss yang valid.'}</span>
                </div>
              )}
            </div>

            {/* Quick Rules & Broker Advice */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  <Info className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                  <div>
                    <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Formula Matematika Lot</h3>
                    <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">Spesifikasi kontrak XAUUSD</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] leading-relaxed">
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                    Lot dihitung berdasarkan jarak kerugian riil dan dibulatkan ke bawah ke kelipatan lot step broker:
                  </p>
                  <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] font-mono-numbers text-[10px] text-[#1769E8] dark:text-[#60A5FA] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                    <div>Delta = |Entry - SL|</div>
                    <div>Loss/Lot = Delta × ContractSize</div>
                    <div>Exact Lot = Risk / Loss/Lot</div>
                    <div>Rec. Lot = floor(Exact / Step) × Step</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9]">
                    <strong className="text-amber-600 dark:text-amber-400">Catatan Penting Broker:</strong> Setiap broker MT5 dapat memiliki contract size, leverage gold, dan tick value yang berbeda. Jika data belum terkonfirmasi, selalu verifikasi spesifikasi simbol di MT5 Anda sebelum eksekusi.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: PROTEKSI & ATURAN RISIKO (MONITORING & DEFINISI)
      ========================================================================= */}
      {activeTab === 'risk-rules' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Status Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Daily Loss Status */}
            <div className="p-4 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs font-semibold text-[#697586] dark:text-[#929BA9]">Kerugian Harian</span>
                <span className={`text-[10px] font-bold ${isDailyLossBreached ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {isDailyLossBreached ? 'TERLAMPAUI' : 'AMAN'}
                </span>
              </div>
              <div className="mt-2 font-mono-numbers">
                <div className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">{formatCurrency(dailyLossToday, settings)}</div>
                <div className="text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">Batas: {formatCurrency(settings.maxDailyLossAmount, settings)} ({settings.maxDailyLossPercent}%)</div>
              </div>
            </div>

            {/* Consecutive Loss Status */}
            <div className="p-4 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs font-semibold text-[#697586] dark:text-[#929BA9]">Loss Berturut-turut</span>
                <span className={`text-[10px] font-bold ${disciplineResult.maxConsecutiveLossesEncountered >= settings.maxConsecutiveLossLimit ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {disciplineResult.maxConsecutiveLossesEncountered >= settings.maxConsecutiveLossLimit ? 'PERINGATAN' : 'AMAN'}
                </span>
              </div>
              <div className="mt-2 font-mono-numbers">
                <div className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">{disciplineResult.maxConsecutiveLossesEncountered} Loss</div>
                <div className="text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">Batas Disiplin: {settings.maxConsecutiveLossLimit} Loss</div>
              </div>
            </div>

            {/* Drawdown Akun */}
            <div className="p-4 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs font-semibold text-[#697586] dark:text-[#929BA9]">Drawdown Akun</span>
                <span className={`text-[10px] font-bold ${isDrawdownBreached ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {isDrawdownBreached ? 'TERLAMPAUI' : 'AMAN'}
                </span>
              </div>
              <div className="mt-2 font-mono-numbers">
                <div className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">{currentDrawdownPercent.toFixed(1)}%</div>
                <div className="text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">Batas Maksimal: {maxDrawdownLimit}%</div>
              </div>
            </div>

            {/* Reset Timezone */}
            <div className="p-4 rounded-xl border bg-white dark:bg-[#11151B] border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center justify-between pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs font-semibold text-[#697586] dark:text-[#929BA9]">Zona Waktu Reset</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#1769E8]/10 text-[#1769E8] dark:bg-[#1769E8]/20 dark:text-[#60A5FA]">
                  AKTIF
                </span>
              </div>
              <div className="mt-2 font-mono-numbers">
                <div className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">{settings.resetTimezone || 'WIB (UTC+7)'}</div>
                <div className="text-[11px] text-[#697586] dark:text-[#929BA9] font-sans">Reset harian pada 00:00 waktu zona</div>
              </div>
            </div>
          </div>

          {/* Settings Form for Risk Parameters */}
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <Sliders className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              <div>
                <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Pengaturan Parameter Batas Proteksi Akun</h3>
                <p className="text-xs text-[#697586] dark:text-[#929BA9]">Tentukan batas toleransi agar sistem memberikan peringatan otomatis</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Batas Rugi Harian ($)
                </label>
                <input
                  type="number"
                  value={settings.maxDailyLossAmount}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, maxDailyLossAmount: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Batas Rugi Harian (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={settings.maxDailyLossPercent}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, maxDailyLossPercent: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Batas Loss Berturut-turut
                </label>
                <input
                  type="number"
                  value={settings.maxConsecutiveLossLimit}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, maxConsecutiveLossLimit: parseInt(e.target.value, 10) || 3 })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  Zona Waktu Reset Harian
                </label>
                <select
                  value={settings.resetTimezone || 'WIB (UTC+7)'}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, resetTimezone: e.target.value })
                  }
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                >
                  <option value="WIB (UTC+7)">WIB (Waktu Indonesia Barat - UTC+7)</option>
                  <option value="WITA (UTC+8)">WITA (UTC+8)</option>
                  <option value="WIT (UTC+9)">WIT (UTC+9)</option>
                  <option value="UTC (Waktu Standar Universal)">UTC (Universal Time)</option>
                  <option value="Server MT5 (UTC+2 / UTC+3)">Server MT5 (Cyprus / London)</option>
                  <option value="New York (UTC-5 / UTC-4)">New York (EST/EDT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Educational Concept Guide */}
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-2 pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <Scale className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              Edukasi Finansial: Memahami Saldo & Batasan Sistem
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[#151D2A] dark:text-[#F2F5F9]">
              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">Balance vs Equity</span>
                <p className="text-[#697586] dark:text-[#929BA9] text-[11px] leading-relaxed">
                  <strong>Balance</strong> adalah kas riil hasil dari transaksi yang telah selesai (*closed P/L*). Sedangkan <strong>Equity</strong> adalah Balance ditambah <strong>Floating P/L</strong> (keuntungan/kerugian posisi yang sedang terbuka di pasar saat ini).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] space-y-1">
                <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">Floating P/L vs Closed P/L</span>
                <p className="text-[#697586] dark:text-[#929BA9] text-[11px] leading-relaxed">
                  Perhitungan jurnal TradeVault didasarkan pada <strong>Closed P/L</strong> setelah posisi ditutup untuk memastikan metrik evaluasi objektif dan tidak terombang-ambing oleh pergerakan sementara pasar.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-[11px] text-[#697586] dark:text-[#929BA9] flex items-start gap-2 leading-relaxed">
              <Info className="h-4 w-4 text-[#697586] dark:text-[#929BA9] shrink-0 mt-0.5 stroke-[1.75]" />
              <span>
                <strong className="text-[#151D2A] dark:text-[#F2F5F9]">Penegasan Batasan Sistem:</strong> TradeVault Journal adalah instrumen pemantauan mandiri, evaluasi disiplin, dan simulasi risiko. Sistem ini <strong className="text-[#151D2A] dark:text-[#F2F5F9]">tidak dapat mencegah atau membatalkan order secara otomatis di terminal MetaTrader 5 (MT5)</strong>. Kedisiplinan sejati bertumpu pada kepatuhan Anda terhadap rencana trading.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: SIMULASI KERUGIAN BERUNTUN (CONSECUTIVE LOSSES)
      ========================================================================= */}
      {activeTab === 'consecutive-sim' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center gap-2.5">
                <TrendingDown className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                <div>
                  <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    Simulasi Kerugian Beruntun (Stress-Test Drawdown)
                  </h3>
                  <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                    Bandingkan dampak rentetan kerugian pada metode risiko persentase majemuk vs nominal tetap
                  </p>
                </div>
              </div>
            </div>

            {/* Inputs: Capital, Method, Risk Value, Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Modal Awal Simulasi ($)</label>
                <input
                  type="number"
                  value={simCapital}
                  onChange={(e) => setSimCapital(e.target.value)}
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Metode Risiko</label>
                <select
                  value={simRiskMode}
                  onChange={(e) => setSimRiskMode(e.target.value as ConsecutiveLossMethod)}
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                >
                  <option value="PERCENT_RUNNING_EQUITY">Persen dari Saldo Berjalan (Compounding)</option>
                  <option value="FIXED_NOMINAL">Nominal Tetap dari Modal Awal (Linear)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                  {simRiskMode === 'PERCENT_RUNNING_EQUITY' ? 'Risiko per Trade (%)' : 'Risiko per Trade ($)'}
                </label>
                <input
                  type="number"
                  step={simRiskMode === 'PERCENT_RUNNING_EQUITY' ? '0.5' : '10'}
                  value={simRiskValue}
                  onChange={(e) => setSimRiskValue(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">Rentetan Kerugian</label>
                <div className="flex gap-1">
                  {[5, 10, 15, 20].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setSimSteps(cnt)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-mono-numbers font-medium transition-colors ${
                        simSteps === cnt
                          ? 'bg-[#1769E8] text-white border-[#1769E8] font-bold'
                          : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Comparison Explanation Banner */}
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] text-xs text-[#151D2A] dark:text-[#F2F5F9] space-y-1">
              <span className="font-semibold text-[#151D2A] dark:text-[#F2F5F9] block">
                {simRiskMode === 'PERCENT_RUNNING_EQUITY'
                  ? 'Karakteristik Risiko Persentase Majemuk (Geometric Drawdown):'
                  : 'Karakteristik Risiko Nominal Tetap (Linear Drawdown):'}
              </span>
              <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                {simRiskMode === 'PERCENT_RUNNING_EQUITY'
                  ? 'Karena nominal kerugian dihitung dari saldo yang tersisa, nominal rugi di setiap trade akan mengecil secara otomatis saat saldo menurun. Secara matematis akun terlindungi dari kebangkrutan total (kebangkrutan terjadi lebih lambat), namun pemulihan modal membutuhkan performa lebih tinggi.'
                  : 'Risiko nominal dollar tetap sama di setiap posisi ($' +
                    simRiskValue +
                    '). Jika terjadi rentetan kekalahan yang panjang, modal akan terkikis secara linear dan dapat mencapai nol (100% drawdown / account blown).'}
              </p>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
                <thead className="bg-[#F5F7FA] dark:bg-[#080A0E] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9] border-b border-[#DDE3EA] dark:border-[#252B34] font-sans">
                  <tr>
                    <th className="py-2.5 px-3">Rentetan Loss</th>
                    <th className="py-2.5 px-3 font-mono-numbers">Nominal Rugi</th>
                    <th className="py-2.5 px-3 font-mono-numbers">Sisa Modal</th>
                    <th className="py-2.5 px-3 font-mono-numbers">Kumulatif Drawdown</th>
                    <th className="py-2.5 px-3">Status Toleransi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers">
                  {consecutiveLossSteps.map((step) => {
                    const isOverConsecutive = step.lossNumber >= settings.maxConsecutiveLossLimit;
                    const isOverDrawdown = step.cumulativeDrawdownPercent >= maxDrawdownLimit;

                    return (
                      <tr
                        key={step.lossNumber}
                        className="hover:bg-[#F5F7FA] dark:hover:bg-[#171D26]/60 transition-colors"
                      >
                        <td className="py-2 px-3 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          Loss ke-{step.lossNumber}
                        </td>
                        <td className="py-2 px-3 text-rose-600 dark:text-rose-400">
                          -{formatCurrency(step.dollarLost, settings)}
                        </td>
                        <td className="py-2 px-3 font-bold text-[#151D2A] dark:text-[#F2F5F9]">
                          {formatCurrency(step.remainingEquity, settings)}
                        </td>
                        <td className="py-2 px-3 text-rose-600 dark:text-rose-400 font-bold">
                          -{step.cumulativeDrawdownPercent.toFixed(2)}%
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {step.isAccountBlown ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              Akun Habis (Blown)
                            </span>
                          ) : isOverDrawdown ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              Melebihi Max DD ({maxDrawdownLimit}%)
                            </span>
                          ) : isOverConsecutive ? (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              Melebihi Batas Streak ({settings.maxConsecutiveLossLimit})
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Toleransi Aman
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: EVALUASI DISIPLIN & AUDIT JURNAL AKTUAL
      ========================================================================= */}
      {activeTab === 'discipline-audit' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                <div>
                  <h3 className="text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    Audit Kepatuhan Risiko & Evaluasi Disiplin Jurnal
                  </h3>
                  <p className="text-xs text-[#697586] dark:text-[#929BA9]">
                    Membandingkan risiko rencana dengan realisasi eksekusi pada {trades.length} transaksi Trade Log
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#697586] dark:text-[#929BA9]">Skor Disiplin:</span>
                <span
                  className={`text-sm font-bold font-mono-numbers px-2.5 py-1 rounded-lg border bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] ${
                    disciplineResult.disciplineScore >= 80
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : disciplineResult.disciplineScore >= 60
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  Grade {disciplineResult.disciplineGrade} ({disciplineResult.disciplineScore}/100)
                </span>
              </div>
            </div>

            {/* Audit Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-numbers">
              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[#697586] dark:text-[#929BA9] block text-[10px] font-sans">Trade Dievaluasi</span>
                <span className="text-base font-bold text-[#151D2A] dark:text-[#F2F5F9]">{disciplineResult.totalTradesEvaluated} Trade</span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">({disciplineResult.lossTradesEvaluated} posisi loss)</span>
              </div>

              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[#697586] dark:text-[#929BA9] block text-[10px] font-sans">Pelanggaran Over-Risk</span>
                <span className={`text-base font-bold ${disciplineResult.overRiskTradesCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {disciplineResult.overRiskTradesCount} Posisi
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Rugi riil melampaui SL</span>
              </div>

              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[#697586] dark:text-[#929BA9] block text-[10px] font-sans">Pelanggaran Rugi Harian</span>
                <span className={`text-base font-bold ${disciplineResult.dailyLossViolationsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {disciplineResult.dailyLossViolationsCount} Hari
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Melebihi toleransi harian</span>
              </div>

              <div className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-[#697586] dark:text-[#929BA9] block text-[10px] font-sans">Data Tanpa Stop Loss</span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">{disciplineResult.tradesWithIncompleteData} Posisi</span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9] block font-sans">Diberi label tidak lengkap</span>
              </div>
            </div>

            {/* Audit Findings List */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">Temuan Audit Disiplin:</h4>
              {disciplineResult.auditFindings.map((finding, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] text-[#151D2A] dark:text-[#F2F5F9] flex items-start gap-3 text-xs"
                >
                  <div className="mt-0.5">
                    {finding.type === 'VIOLATION' ? (
                      <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400 stroke-[1.75]" />
                    ) : finding.type === 'WARNING' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[1.75]" />
                    )}
                  </div>
                  <div>
                    <strong
                      className={`block font-semibold ${
                        finding.type === 'VIOLATION'
                          ? 'text-rose-600 dark:text-rose-400'
                          : finding.type === 'WARNING'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {finding.title}
                    </strong>
                    <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-0.5 leading-relaxed">{finding.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: SIMULASI COMPOUNDING (JAPSKU-INSPIRED ORIGINAL)
      ========================================================================= */}
      {activeTab === 'compounding' && (
        <CompoundingCalculatorTab settings={settings} currentEquity={currentEquity} />
      )}

      {/* =========================================================================
          TAB 6: SIMULASI BERBASIS TRADE
      ========================================================================= */}
      {activeTab === 'trade-sim' && (
        <TradeSimulationTab settings={settings} currentEquity={currentEquity} />
      )}
    </div>
  );
};
