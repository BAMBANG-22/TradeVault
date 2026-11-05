import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings } from '../../types/settings';
import { Trade } from '../../types/trade';
import {
  calculateManualPositionPlan,
  calculateAutomaticLotSizing,
  BalanceSourceOption,
  RiskCapitalBasis,
  simulateConsecutiveLosses,
  evaluateTradingDiscipline,
  ConsecutiveLossMethod,
  MT5_SYMBOL_REGISTRY,
  getInstrumentPipSpec,
  POSITION_SIZING_RISK_PRESETS,
} from '../../utils/riskCalculator';
import { formatCurrency, computeTradeNetProfit } from '../../utils/calculations';
import { CompoundingCalculatorTab } from './CompoundingCalculatorTab';
import { TradeSimulationTab } from './TradeSimulationTab';
import { AlertTriangle, Check } from 'lucide-react';

interface RiskCalculatorViewProps {
  currentEquity: number;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  dailyLossToday: number;
  trades: Trade[];
}

type RiskToolTab =
  | 'lot-calc'
  | 'protection-rules'
  | 'consecutive-loss'
  | 'discipline-eval'
  | 'compounding-calc'
  | 'trade-sim';

type LotCalculatorSubMode = 'LOT_CALCULATOR' | 'LOT_SIZING';
type SizingCapitalSourceOption = 'APP_EQUITY' | 'APP_BALANCE' | 'CUSTOM_BALANCE';
type DisciplinePeriod = 'LAST_20' | 'LAST_50' | 'ALL';

const MANUAL_LOT_QUICK_OPTIONS = ['0.01', '0.02', '0.05', '0.10'];

const INSTRUMENT_DEFAULTS: Record<
  string,
  {
    entry: string;
    slBuy: string;
    tpBuy: string;
    slSell: string;
    tpSell: string;
  }
> = {
  XAUUSD: { entry: '4000.00', slBuy: '3950.00', tpBuy: '4100.00', slSell: '4050.00', tpSell: '3900.00' },
  EURUSD: { entry: '1.0850', slBuy: '1.0800', tpBuy: '1.0950', slSell: '1.0900', tpSell: '1.0750' },
  GBPUSD: { entry: '1.2700', slBuy: '1.2650', tpBuy: '1.2800', slSell: '1.2750', tpSell: '1.2600' },
  USDJPY: { entry: '150.00', slBuy: '149.50', tpBuy: '151.00', slSell: '150.50', tpSell: '149.00' },
  BTCUSD: { entry: '65000.00', slBuy: '64500.00', tpBuy: '66000.00', slSell: '65500.00', tpSell: '64000.00' },
  AUDUSD: { entry: '0.6550', slBuy: '0.6500', tpBuy: '0.6650', slSell: '0.6600', tpSell: '0.6450' },
  NZDUSD: { entry: '0.6050', slBuy: '0.6000', tpBuy: '0.6150', slSell: '0.6100', tpSell: '0.5950' },
  USDCAD: { entry: '1.3600', slBuy: '1.3550', tpBuy: '1.3700', slSell: '1.3650', tpSell: '1.3500' },
  USDCHF: { entry: '0.8850', slBuy: '0.8800', tpBuy: '0.8950', slSell: '0.8900', tpSell: '0.8750' },
  US30: { entry: '39000.00', slBuy: '38900.00', tpBuy: '39200.00', slSell: '39100.00', tpSell: '38800.00' },
  NAS100: { entry: '18000.00', slBuy: '17900.00', tpBuy: '18200.00', slSell: '18100.00', tpSell: '17800.00' },
};

const RISK_TOOLS_META: {
  id: RiskToolTab;
  title: string;
  subtitle: string;
}[] = [
  {
    id: 'lot-calc',
    title: 'Kalkulator Lot',
    subtitle: 'Lot Calculator & Lot Sizing',
  },
  {
    id: 'protection-rules',
    title: 'Proteksi & Aturan Risiko',
    subtitle: 'Daily limits and risk settings',
  },
  {
    id: 'consecutive-loss',
    title: 'Simulasi Loss Beruntun',
    subtitle: 'Consecutive loss simulation',
  },
  {
    id: 'discipline-eval',
    title: 'Evaluasi Disiplin',
    subtitle: 'Trading rule compliance',
  },
  {
    id: 'compounding-calc',
    title: 'Simulator Compounding',
    subtitle: 'Capital growth projection',
  },
  {
    id: 'trade-sim',
    title: 'Simulasi Berbasis Trade',
    subtitle: 'Trading performance scenarios',
  },
];

export const RiskCalculatorView: React.FC<RiskCalculatorViewProps> = ({
  currentEquity,
  settings,
  onUpdateSettings,
  dailyLossToday,
  trades,
}) => {
  const [activeTool, setActiveTool] = useState<RiskToolTab>('lot-calc');

  // Active account balance fallback
  const activeBalance = currentEquity > 0 ? currentEquity : settings.startingBalance || 2500;

  // ============================================================================
  // 1. TODAY'S RISK & RISK USAGE CALCULATIONS (Sections 3 & 4)
  // ============================================================================
  const actualDailyLossAmount = Math.max(0, Number(dailyLossToday) || 0);
  const dailyLossPercentOfBalance =
    activeBalance > 0 ? (actualDailyLossAmount / activeBalance) * 100 : 0;

  const configuredDailyLimitAmount = Math.max(0, Number(settings.maxDailyLossAmount) || 0);
  const configuredDailyLimitPercent =
    Number(settings.maxDailyLossPercent) > 0
      ? Number(settings.maxDailyLossPercent)
      : activeBalance > 0
      ? (configuredDailyLimitAmount / activeBalance) * 100
      : 0;

  // Risk Usage is strictly: (Actual Daily Loss / Daily Loss Limit) * 100
  const riskUsagePercent =
    configuredDailyLimitAmount > 0
      ? (actualDailyLossAmount / configuredDailyLimitAmount) * 100
      : 0;
  const riskUsageBarWidth = Math.min(100, Math.max(0, riskUsagePercent));
  const remainingDailyRiskAmount = Math.max(0, configuredDailyLimitAmount - actualDailyLossAmount);

  const isDailyLimitExceeded =
    configuredDailyLimitAmount > 0 && actualDailyLossAmount >= configuredDailyLimitAmount;
  const isDailyLimitWarning =
    configuredDailyLimitAmount > 0 && !isDailyLimitExceeded && riskUsagePercent >= 75;

  const dailyLossAlertEnabled = settings.dailyLossAlertEnabled !== false;
  const stopTradingAlertEnabled = settings.stopTradingAlertEnabled !== false;

  // ============================================================================
  // 2. FEATURE 01: LOT CALCULATOR (MANUAL) & LOT SIZING (AUTOMATIC) STATE (Section 5)
  // ============================================================================
  const [lotSubMode, setLotSubMode] = useState<LotCalculatorSubMode>('LOT_CALCULATOR');
  const [instrument, setInstrument] = useState<string>('XAUUSD');

  // --- Mode A: LOT CALCULATOR (Manual Position Planner) ---
  const [manualBalanceSource, setManualBalanceSource] =
    useState<BalanceSourceOption>('APP_BALANCE');
  const [manualCustomBalanceInput, setManualCustomBalanceInput] = useState<string>(
    String(Number(activeBalance.toFixed(2)))
  );
  const [manualDirection, setManualDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [manualLotSizeInput, setManualLotSizeInput] = useState<string>('0.01');
  const [manualEntryPriceInput, setManualEntryPriceInput] = useState<string>('4000.00');
  const [manualStopLossInput, setManualStopLossInput] = useState<string>('3950.00');
  const [manualTakeProfitInput, setManualTakeProfitInput] = useState<string>('4100.00');

  // --- Mode B: LOT SIZING (Automatic Position Sizing) ---
  const [sizingCapitalSource, setSizingCapitalSource] =
    useState<SizingCapitalSourceOption>('APP_EQUITY');
  const [sizingCustomBalanceInput, setSizingCustomBalanceInput] = useState<string>(
    String(Number(activeBalance.toFixed(2)))
  );
  const [sizingRiskPercentInput, setSizingRiskPercentInput] = useState<string>(
    String(settings.defaultRiskPercent || 1)
  );
  const [sizingDirection, setSizingDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [sizingEntryPriceInput, setSizingEntryPriceInput] = useState<string>('4000.00');
  const [sizingStopLossInput, setSizingStopLossInput] = useState<string>('3950.00');

  const instrumentSpec = useMemo(
    () => getInstrumentPipSpec(instrument, settings),
    [instrument, settings]
  );

  const handleInstrumentChange = (newSymbol: string) => {
    setInstrument(newSymbol);
    const preset = INSTRUMENT_DEFAULTS[newSymbol];
    if (preset) {
      setManualEntryPriceInput(preset.entry);
      setManualStopLossInput(manualDirection === 'BUY' ? preset.slBuy : preset.slSell);
      setManualTakeProfitInput(manualDirection === 'BUY' ? preset.tpBuy : preset.tpSell);

      setSizingEntryPriceInput(preset.entry);
      setSizingStopLossInput(sizingDirection === 'BUY' ? preset.slBuy : preset.slSell);
    }
  };

  const handleManualDirectionChange = (newDir: 'BUY' | 'SELL') => {
    if (newDir === manualDirection) return;
    setManualDirection(newDir);
    const entryVal = parseFloat(manualEntryPriceInput);
    const slVal = parseFloat(manualStopLossInput);
    const tpVal = parseFloat(manualTakeProfitInput);
    if (Number.isFinite(entryVal) && entryVal > 0) {
      if (Number.isFinite(slVal) && slVal > 0) {
        const slDist = Math.abs(entryVal - slVal);
        const nextSl = newDir === 'BUY' ? entryVal - slDist : entryVal + slDist;
        if (nextSl > 0) {
          setManualStopLossInput(nextSl.toFixed(instrumentSpec.digits));
        }
      }
      if (Number.isFinite(tpVal) && tpVal > 0) {
        const tpDist = Math.abs(tpVal - entryVal);
        const nextTp = newDir === 'BUY' ? entryVal + tpDist : entryVal - tpDist;
        if (nextTp > 0) {
          setManualTakeProfitInput(nextTp.toFixed(instrumentSpec.digits));
        }
      }
    }
  };

  const handleSizingDirectionChange = (newDir: 'BUY' | 'SELL') => {
    if (newDir === sizingDirection) return;
    setSizingDirection(newDir);
    const entryVal = parseFloat(sizingEntryPriceInput);
    const slVal = parseFloat(sizingStopLossInput);
    if (Number.isFinite(entryVal) && entryVal > 0 && Number.isFinite(slVal) && slVal > 0) {
      const slDist = Math.abs(entryVal - slVal);
      const nextSl = newDir === 'BUY' ? entryVal - slDist : entryVal + slDist;
      if (nextSl > 0) {
        setSizingStopLossInput(nextSl.toFixed(instrumentSpec.digits));
      }
    }
  };

  const effectiveManualBalance =
    manualBalanceSource === 'APP_BALANCE'
      ? activeBalance
      : Math.max(0, parseFloat(manualCustomBalanceInput) || 0);

  const manualPositionPlanResult = useMemo(() => {
    const slTrim = manualStopLossInput.trim();
    const tpTrim = manualTakeProfitInput.trim();
    return calculateManualPositionPlan(
      {
        balanceSource: manualBalanceSource,
        accountBalance: effectiveManualBalance,
        symbol: instrument,
        direction: manualDirection,
        lotSize: parseFloat(manualLotSizeInput) || 0,
        entryPrice: parseFloat(manualEntryPriceInput) || 0,
        stopLossPrice: slTrim !== '' ? parseFloat(slTrim) : null,
        takeProfitPrice: tpTrim !== '' ? parseFloat(tpTrim) : null,
      },
      settings
    );
  }, [
    manualBalanceSource,
    effectiveManualBalance,
    instrument,
    manualDirection,
    manualLotSizeInput,
    manualEntryPriceInput,
    manualStopLossInput,
    manualTakeProfitInput,
    settings,
  ]);

  const effectiveSizingBalance =
    sizingCapitalSource === 'CUSTOM_BALANCE'
      ? Math.max(0, parseFloat(sizingCustomBalanceInput) || 0)
      : activeBalance;

  const effectiveSizingBasisType: RiskCapitalBasis =
    sizingCapitalSource === 'APP_EQUITY' ? 'EQUITY' : 'BALANCE';

  const automaticSizingResult = useMemo(() => {
    return calculateAutomaticLotSizing(
      {
        symbol: instrument,
        accountBasisType: effectiveSizingBasisType,
        accountBasisAmount: effectiveSizingBalance,
        riskPercent: parseFloat(sizingRiskPercentInput) || 0,
        direction: sizingDirection,
        entryPrice: parseFloat(sizingEntryPriceInput) || 0,
        stopLossPrice: parseFloat(sizingStopLossInput) || 0,
      },
      settings
    );
  }, [
    instrument,
    effectiveSizingBasisType,
    effectiveSizingBalance,
    sizingRiskPercentInput,
    sizingDirection,
    sizingEntryPriceInput,
    sizingStopLossInput,
    settings,
  ]);

  // ============================================================================
  // 3. FEATURE 02: PROTEKSI & ATURAN RISIKO STATE (Section 6)
  // ============================================================================
  const [ruleDailyLossPct, setRuleDailyLossPct] = useState<string>(
    String(settings.maxDailyLossPercent || 3)
  );
  const [ruleDailyLossAmt, setRuleDailyLossAmt] = useState<string>(
    String(settings.maxDailyLossAmount || 75)
  );
  const [ruleConsecutiveLosses, setRuleConsecutiveLosses] = useState<string>(
    String(settings.maxConsecutiveLossLimit || 3)
  );
  const [ruleMaxDrawdownPct, setRuleMaxDrawdownPct] = useState<string>(
    String(settings.maxDrawdownLimitPercent || 10)
  );
  const [ruleMaxTradeRiskPct, setRuleMaxTradeRiskPct] = useState<string>(
    String(settings.maxTradeRiskPercent || 2)
  );
  const [ruleResetTimezone, setRuleResetTimezone] = useState<string>(
    settings.resetTimezone || 'WIB (UTC+7)'
  );
  const [ruleDailyAlertOn, setRuleDailyAlertOn] = useState<boolean>(
    settings.dailyLossAlertEnabled !== false
  );
  const [ruleStopAlertOn, setRuleStopAlertOn] = useState<boolean>(
    settings.stopTradingAlertEnabled !== false
  );
  const [rulesSavedFeedback, setRulesSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    setRuleDailyLossPct(String(settings.maxDailyLossPercent || 3));
    setRuleDailyLossAmt(String(settings.maxDailyLossAmount || 75));
    setRuleConsecutiveLosses(String(settings.maxConsecutiveLossLimit || 3));
    setRuleMaxDrawdownPct(String(settings.maxDrawdownLimitPercent || 10));
    setRuleMaxTradeRiskPct(String(settings.maxTradeRiskPercent || 2));
    setRuleResetTimezone(settings.resetTimezone || 'WIB (UTC+7)');
    setRuleDailyAlertOn(settings.dailyLossAlertEnabled !== false);
    setRuleStopAlertOn(settings.stopTradingAlertEnabled !== false);
  }, [settings]);

  const handleRuleDailyLossPctChange = (val: string) => {
    setRuleDailyLossPct(val);
    const pct = parseFloat(val);
    if (Number.isFinite(pct) && pct >= 0) {
      const baseCap = settings.startingBalance > 0 ? settings.startingBalance : activeBalance;
      setRuleDailyLossAmt(String(Number(((baseCap * pct) / 100).toFixed(2))));
    }
  };

  const handleRuleDailyLossAmtChange = (val: string) => {
    setRuleDailyLossAmt(val);
    const amt = parseFloat(val);
    const baseCap = settings.startingBalance > 0 ? settings.startingBalance : activeBalance;
    if (Number.isFinite(amt) && amt >= 0 && baseCap > 0) {
      setRuleDailyLossPct(String(Number(((amt / baseCap) * 100).toFixed(2))));
    }
  };

  const handleSaveProtectionRules = () => {
    const baseCap = settings.startingBalance > 0 ? settings.startingBalance : activeBalance;
    const maxDailyPct = Math.max(0.1, parseFloat(ruleDailyLossPct) || 3);
    const maxDailyAmt = Math.max(1, parseFloat(ruleDailyLossAmt) || (baseCap * maxDailyPct) / 100);
    const maxConsec = Math.max(1, Math.floor(parseFloat(ruleConsecutiveLosses) || 3));
    const maxDdPct = Math.max(1, parseFloat(ruleMaxDrawdownPct) || 10);
    const maxTradePct = Math.max(0.1, parseFloat(ruleMaxTradeRiskPct) || 2);
    const maxTradeAmt = Number(((baseCap * maxTradePct) / 100).toFixed(2));

    onUpdateSettings({
      ...settings,
      maxDailyLossPercent: maxDailyPct,
      maxDailyLossAmount: maxDailyAmt,
      maxConsecutiveLossLimit: maxConsec,
      maxDrawdownLimitPercent: maxDdPct,
      maxTradeRiskPercent: maxTradePct,
      maxTradeRiskAmount: maxTradeAmt,
      resetTimezone: ruleResetTimezone,
      dailyLossAlertEnabled: ruleDailyAlertOn,
      stopTradingAlertEnabled: ruleStopAlertOn,
    });

    setRulesSavedFeedback(true);
    setTimeout(() => setRulesSavedFeedback(false), 2500);
  };

  // ============================================================================
  // 4. FEATURE 03: SIMULASI LOSS BERUNTUN STATE (Section 7)
  // ============================================================================
  const [consecBalanceInput, setConsecBalanceInput] = useState<string>(
    String(Math.round(activeBalance))
  );
  const [consecRiskInput, setConsecRiskInput] = useState<string>(
    String(settings.defaultRiskPercent || 1)
  );
  const [consecMethod, setConsecMethod] = useState<ConsecutiveLossMethod>(
    'PERCENT_RUNNING_EQUITY'
  );
  const [consecCountInput, setConsecCountInput] = useState<string>('5');

  const consecInitialBalance = Math.max(0, parseFloat(consecBalanceInput) || 0);
  const consecRiskVal = Math.max(0, parseFloat(consecRiskInput) || 0);
  const consecLossesCount = Math.max(1, Math.min(50, parseInt(consecCountInput, 10) || 1));

  // In Fixed Risk Amount mode, if user enters % or $, we let them enter % of Initial Balance or direct $ amount.
  // Per Section 7:
  // Initial Balance [$1,000], Risk per Trade [1%], Risk Method [Percentage of Remaining Balance / Fixed Risk Amount]
  // When Fixed Risk Amount is selected, 1% of $1,000 = $10 fixed per trade!
  const effectiveConsecRiskParam =
    consecMethod === 'PERCENT_RUNNING_EQUITY'
      ? consecRiskVal
      : (consecInitialBalance * consecRiskVal) / 100;

  const consecSteps = useMemo(() => {
    if (consecInitialBalance <= 0) return [];
    return simulateConsecutiveLosses(
      consecInitialBalance,
      effectiveConsecRiskParam,
      consecLossesCount,
      consecMethod
    );
  }, [consecInitialBalance, effectiveConsecRiskParam, consecLossesCount, consecMethod]);

  const finalConsecStep =
    consecSteps.length > 0 ? consecSteps[consecSteps.length - 1] : undefined;
  const consecRemainingBalance = finalConsecStep
    ? finalConsecStep.remainingEquity
    : consecInitialBalance;
  const consecTotalLoss = Math.max(0, consecInitialBalance - consecRemainingBalance);
  const consecDrawdownPct = finalConsecStep ? finalConsecStep.cumulativeDrawdownPercent : 0;

  // ============================================================================
  // 5. FEATURE 04: EVALUASI DISIPLIN STATE (Section 8)
  // ============================================================================
  const [disciplinePeriod, setDisciplinePeriod] = useState<DisciplinePeriod>('LAST_20');
  const [showDisciplineDetails, setShowDisciplineDetails] = useState<boolean>(false);

  const executedTradesSorted = useMemo(() => {
    const valid = (trades || []).filter(
      (t) => t.outcome !== 'PLANNED' && t.outcome !== 'CANCELLED'
    );
    return [...valid].sort((a, b) => {
      const tA = new Date(a.dateTime || 0).getTime();
      const tB = new Date(b.dateTime || 0).getTime();
      return tB - tA; // newest first for slicing
    });
  }, [trades]);

  const filteredDisciplineTrades = useMemo(() => {
    let subset = executedTradesSorted;
    if (disciplinePeriod === 'LAST_20') {
      subset = executedTradesSorted.slice(0, 20);
    } else if (disciplinePeriod === 'LAST_50') {
      subset = executedTradesSorted.slice(0, 50);
    }
    // Reverse back to chronological order so consecutive loss streak evaluation is chronological
    return [...subset].reverse();
  }, [executedTradesSorted, disciplinePeriod]);

  const disciplineEval = useMemo(
    () => evaluateTradingDiscipline(filteredDisciplineTrades, settings),
    [filteredDisciplineTrades, settings]
  );

  return (
    <div className="space-y-6 pb-8">
      {/* ==========================================================================
          PAGE HEADER & OVERVIEW (Sections 3 & 4)
         ========================================================================== */}
      <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
          <div>
            <h1 className="text-base sm:text-lg font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Risk Management
            </h1>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Manage your trading risk
            </p>
          </div>

          <div className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9]">
            Active Balance:{' '}
            <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
              {formatCurrency(activeBalance, settings)}
            </strong>
          </div>
        </div>

        {/* TODAY'S RISK */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block">
            Today's Risk
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: DAILY LOSS */}
            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-xs font-medium uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block mb-1">
                Daily Loss
              </span>
              <div
                className={`text-xl sm:text-2xl font-bold font-mono-numbers ${
                  actualDailyLossAmount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#151D2A] dark:text-[#F2F5F9]'
                }`}
              >
                {actualDailyLossAmount > 0
                  ? `-${formatCurrency(actualDailyLossAmount, settings)}`
                  : formatCurrency(0, settings)}
              </div>
              <span className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-1">
                {dailyLossPercentOfBalance.toFixed(2)}% of balance
              </span>
            </div>

            {/* Card 2: DAILY LOSS LIMIT */}
            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
              <span className="text-xs font-medium uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block mb-1">
                Daily Loss Limit
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(configuredDailyLimitAmount, settings)}
              </div>
              <span className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-1">
                {configuredDailyLimitPercent.toFixed(2)}% of balance
              </span>
            </div>
          </div>
        </div>

        {/* RISK USAGE */}
        <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Risk Usage
            </span>
            <span
              className={`text-xs font-bold font-mono-numbers ${
                isDailyLimitExceeded
                  ? 'text-rose-600 dark:text-rose-400'
                  : isDailyLimitWarning
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-[#151D2A] dark:text-[#F2F5F9]'
              }`}
            >
              {riskUsagePercent.toFixed(1)}% Used
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[#DDE3EA] dark:bg-[#080A0E] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isDailyLimitExceeded
                  ? 'bg-rose-600'
                  : isDailyLimitWarning
                  ? 'bg-amber-500'
                  : 'bg-[#1769E8]'
              }`}
              style={{ width: `${riskUsageBarWidth}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9]">
            <span>
              Used:{' '}
              <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(actualDailyLossAmount, settings)}
              </strong>
            </span>
            <span>
              Remaining:{' '}
              <strong className="text-[#151D2A] dark:text-[#F2F5F9]">
                {formatCurrency(remainingDailyRiskAmount, settings)}
              </strong>
            </span>
          </div>
        </div>

        {/* Conditional In-App Risk Alerts */}
        {isDailyLimitExceeded && stopTradingAlertEnabled && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Stop Trading Alert: Daily Loss Limit Reached</span>
              <span className="text-[11px] opacity-90">
                Today's realized loss ({formatCurrency(actualDailyLossAmount, settings)}) has reached your daily limit ({formatCurrency(configuredDailyLimitAmount, settings)}). Pause trading until daily reset ({settings.resetTimezone || '00:00 WIB'}).
              </span>
            </div>
          </div>
        )}

        {isDailyLimitWarning && dailyLossAlertEnabled && (
          <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Daily Loss Alert: {riskUsagePercent.toFixed(1)}% of Limit Used</span>
              <span className="text-[11px] opacity-90">
                Remaining daily risk allowance is {formatCurrency(remainingDailyRiskAmount, settings)}. Reduce position size or stop trading if setup quality is low.
              </span>
            </div>
          </div>
        )}

        {/* RISK TOOLS (6 Core Features Navigation) */}
        <div className="space-y-2.5 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block">
            Risk Tools
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {RISK_TOOLS_META.map((tool) => {
              const isSelected = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? 'bg-[#EEF2F6] dark:bg-[#171D26] border-[#1769E8]'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] border-[#DDE3EA] dark:border-[#252B34] hover:border-[#697586]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                      {tool.title}
                    </span>
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-[#1769E8] shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-[#697586] dark:text-[#929BA9] block mt-0.5">
                    {tool.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==========================================================================
          FEATURE 01: LOT CALCULATOR & LOT SIZING (Section 5)
          CRITICAL: Only renders the active mode's form & result (never both at once)
         ========================================================================== */}
      {activeTool === 'lot-calc' && (
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-6">
          {/* Header & Segmented Mode Switcher: [ Lot Calculator ] [ Lot Sizing ] */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                {lotSubMode === 'LOT_CALCULATOR' ? 'Lot Calculator' : 'Lot Sizing'}
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
                {lotSubMode === 'LOT_CALCULATOR'
                  ? 'Manual Position Planner — Simulasi perencanaan posisi trading dengan ukuran lot manual'
                  : 'Automatic Position Sizing — Penentuan ukuran lot otomatis berdasarkan batas risiko akun'}
              </p>
            </div>

            <div className="inline-grid grid-cols-2 p-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34]">
              <button
                type="button"
                onClick={() => setLotSubMode('LOT_CALCULATOR')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  lotSubMode === 'LOT_CALCULATOR'
                    ? 'bg-[#1769E8] text-white'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                Lot Calculator
              </button>
              <button
                type="button"
                onClick={() => setLotSubMode('LOT_SIZING')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  lotSubMode === 'LOT_SIZING'
                    ? 'bg-[#1769E8] text-white'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                Lot Sizing
              </button>
            </div>
          </div>

          {/* ====================================================================
              MODE A: LOT CALCULATOR — MANUAL POSITION PLANNER
             ==================================================================== */}
          {lotSubMode === 'LOT_CALCULATOR' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN: MANUAL POSITION PLANNER FORM */}
              <div className="lg:col-span-6 space-y-4">
                {/* 1. ACCOUNT BALANCE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                      Account Balance
                    </label>
                    <select
                      value={manualBalanceSource}
                      onChange={(e) =>
                        setManualBalanceSource(e.target.value as BalanceSourceOption)
                      }
                      className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    >
                      <option value="APP_BALANCE">App Balance</option>
                      <option value="CUSTOM_BALANCE">Custom Balance</option>
                    </select>
                  </div>

                  {manualBalanceSource === 'APP_BALANCE' ? (
                    <div className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3.5 py-2.5 flex items-center justify-between">
                      <span className="text-base font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                        {formatCurrency(activeBalance, settings)}
                      </span>
                      <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                        App Balance
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={manualCustomBalanceInput}
                      onChange={(e) => setManualCustomBalanceInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                      placeholder="3000.00"
                    />
                  )}
                </div>

                {/* 2. INSTRUMENT & 3. DIRECTION */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Instrument
                    </label>
                    <select
                      value={instrument}
                      onChange={(e) => handleInstrumentChange(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    >
                      {Object.keys(MT5_SYMBOL_REGISTRY).map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Direction
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleManualDirectionChange('BUY')}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                          manualDirection === 'BUY'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                        }`}
                      >
                        BUY
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualDirectionChange('SELL')}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                          manualDirection === 'SELL'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                        }`}
                      >
                        SELL
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. LOT SIZE & 5. ENTRY PRICE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                        Lot Size
                      </label>
                      <div className="flex items-center gap-1">
                        {MANUAL_LOT_QUICK_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setManualLotSizeInput(opt)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-numbers transition-colors ${
                              parseFloat(manualLotSizeInput) === parseFloat(opt)
                                ? 'bg-[#1769E8] text-white font-semibold'
                                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      step={manualPositionPlanResult.contractSpec.lotStep}
                      min={manualPositionPlanResult.contractSpec.minLot}
                      max={manualPositionPlanResult.contractSpec.maxLot}
                      value={manualLotSizeInput}
                      onChange={(e) => setManualLotSizeInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                      placeholder="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Entry Price
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={manualEntryPriceInput}
                      onChange={(e) => setManualEntryPriceInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                </div>

                {/* 6. STOP LOSS & 7. TAKE PROFIT */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Stop Loss
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={manualStopLossInput}
                      onChange={(e) => setManualStopLossInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Take Profit
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={manualTakeProfitInput}
                      onChange={(e) => setManualTakeProfitInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Validation Notice */}
                {(manualPositionPlanResult.lotError ||
                  manualPositionPlanResult.slError ||
                  manualPositionPlanResult.tpError ||
                  manualPositionPlanResult.errorMessage) && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {manualPositionPlanResult.lotError ||
                        manualPositionPlanResult.slError ||
                        manualPositionPlanResult.tpError ||
                        manualPositionPlanResult.errorMessage}
                    </span>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: POSITION ANALYSIS */}
              <div className="lg:col-span-6">
                <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                        Position Analysis
                      </span>
                      <span className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9]">
                        {instrument} · {manualDirection} · {manualPositionPlanResult.lotSize || 0} Lot
                      </span>
                    </div>

                    {/* STOP LOSS ANALYSIS (Soft Red Hierarchy) */}
                    <div className="p-4 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                          Stop Loss
                        </span>
                        <span className="text-xs font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {manualPositionPlanResult.isLotValid &&
                          manualPositionPlanResult.isStopLossValid
                            ? `${manualPositionPlanResult.slDistancePips} pips`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-xs text-[#697586] dark:text-[#929BA9]">
                          Potential Loss
                        </span>
                        <span className="text-base font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
                          {manualPositionPlanResult.isLotValid &&
                          manualPositionPlanResult.isStopLossValid
                            ? `$${manualPositionPlanResult.potentialLossUsd.toFixed(2)}`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#697586] dark:text-[#929BA9]">Risk</span>
                        <span className="text-xs font-semibold font-mono-numbers text-rose-600 dark:text-rose-400">
                          {manualPositionPlanResult.isLotValid &&
                          manualPositionPlanResult.isStopLossValid
                            ? `${manualPositionPlanResult.riskPercentOfBalance.toFixed(2)}%`
                            : '--'}
                        </span>
                      </div>
                    </div>

                    {/* TAKE PROFIT ANALYSIS (Soft Green Hierarchy) */}
                    <div className="p-4 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                          Take Profit
                        </span>
                        <span className="text-xs font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {manualPositionPlanResult.isLotValid &&
                          manualPositionPlanResult.isTakeProfitValid
                            ? `${manualPositionPlanResult.tpDistancePips} pips`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-xs text-[#697586] dark:text-[#929BA9]">
                          Potential Profit
                        </span>
                        <span className="text-base font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                          {manualPositionPlanResult.isLotValid &&
                          manualPositionPlanResult.isTakeProfitValid
                            ? `$${manualPositionPlanResult.potentialProfitUsd.toFixed(2)}`
                            : '--'}
                        </span>
                      </div>
                    </div>

                    {/* RISK / REWARD */}
                    <div className="p-4 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                        Risk / Reward
                      </span>
                      <span className="text-base font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                        {manualPositionPlanResult.isLotValid &&
                        manualPositionPlanResult.hasRiskReward
                          ? manualPositionPlanResult.riskRewardFormatted
                          : '--'}
                      </span>
                    </div>
                  </div>

                  {/* Pre-commission & contract specification footnote */}
                  <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-1 text-[11px] text-[#697586] dark:text-[#929BA9]">
                    <p>
                      Hasil merupakan estimasi sebelum biaya komisi dan swap.
                    </p>
                    <p className="font-mono-numbers">
                      Contract: {manualPositionPlanResult.contractSpec.contractSize.toLocaleString()} · 1 pip ={' '}
                      {manualPositionPlanResult.contractSpec.pipSize} · Min Lot:{' '}
                      {manualPositionPlanResult.contractSpec.minLot} (Step{' '}
                      {manualPositionPlanResult.contractSpec.lotStep})
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ====================================================================
               MODE B: LOT SIZING — AUTOMATIC POSITION SIZING
               ==================================================================== */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN: AUTOMATIC POSITION SIZING FORM */}
              <div className="lg:col-span-6 space-y-4">
                {/* 1. ACCOUNT BALANCE / EQUITY */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                      Account Balance
                    </label>
                    <select
                      value={sizingCapitalSource}
                      onChange={(e) =>
                        setSizingCapitalSource(e.target.value as SizingCapitalSourceOption)
                      }
                      className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-2.5 py-1 text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    >
                      <option value="APP_EQUITY">App Equity</option>
                      <option value="APP_BALANCE">App Balance</option>
                      <option value="CUSTOM_BALANCE">Custom Balance</option>
                    </select>
                  </div>

                  {sizingCapitalSource !== 'CUSTOM_BALANCE' ? (
                    <div className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3.5 py-2.5 flex items-center justify-between">
                      <span className="text-base font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                        {formatCurrency(activeBalance, settings)}
                      </span>
                      <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                        {sizingCapitalSource === 'APP_EQUITY' ? 'App Equity' : 'App Balance'}
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={sizingCustomBalanceInput}
                      onChange={(e) => setSizingCustomBalanceInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                      placeholder="3000.00"
                    />
                  )}
                </div>

                {/* 2. INSTRUMENT & 3. RISK PER TRADE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Instrument
                    </label>
                    <select
                      value={instrument}
                      onChange={(e) => handleInstrumentChange(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-semibold text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    >
                      {Object.keys(MT5_SYMBOL_REGISTRY).map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                        Risk per Trade (%)
                      </label>
                      <div className="flex items-center gap-1">
                        {POSITION_SIZING_RISK_PRESETS.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setSizingRiskPercentInput(String(pct))}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-numbers transition-colors ${
                              parseFloat(sizingRiskPercentInput) === pct
                                ? 'bg-[#1769E8] text-white font-semibold'
                                : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      max="100"
                      value={sizingRiskPercentInput}
                      onChange={(e) => setSizingRiskPercentInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                      placeholder="1.00"
                    />
                  </div>
                </div>

                {/* 4. DIRECTION */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                    Direction
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSizingDirectionChange('BUY')}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                        sizingDirection === 'BUY'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSizingDirectionChange('SELL')}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                        sizingDirection === 'SELL'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                      }`}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                {/* 5. ENTRY PRICE & 6. STOP LOSS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Entry Price
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={sizingEntryPriceInput}
                      onChange={(e) => setSizingEntryPriceInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] mb-1.5">
                      Stop Loss
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={sizingStopLossInput}
                      onChange={(e) => setSizingStopLossInput(e.target.value)}
                      className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Validation Error Banner */}
                {!automaticSizingResult.isValid && automaticSizingResult.errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{automaticSizingResult.errorMessage}</span>
                  </div>
                )}

                {/* Execution Notice when Raw Lot < Min Lot or > Max Lot */}
                {automaticSizingResult.isValid && automaticSizingResult.executionNotice && (
                  <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{automaticSizingResult.executionNotice}</span>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: RESULT — AUTOMATIC POSITION SIZING */}
              <div className="lg:col-span-6">
                <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                        Result
                      </span>
                      <span className="text-xs font-mono-numbers text-[#697586] dark:text-[#929BA9]">
                        {instrument} · {sizingDirection}
                      </span>
                    </div>

                    {/* Recommended Lot */}
                    <div className="p-4 rounded-lg bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34]">
                      <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
                        Recommended Lot
                      </span>
                      <div
                        className={`text-2xl sm:text-3xl font-bold font-mono-numbers ${
                          automaticSizingResult.isValid && automaticSizingResult.isExecutable
                            ? 'text-[#1769E8] dark:text-[#60A5FA]'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {automaticSizingResult.isValid
                          ? automaticSizingResult.isExecutable
                            ? `${automaticSizingResult.recommendedLot.toFixed(2)}`
                            : '0.00 (Tidak dapat dieksekusi < Min Lot)'
                          : '0.00'}
                      </div>
                      {automaticSizingResult.isValid && (
                        <span className="text-[11px] font-mono-numbers text-[#697586] dark:text-[#929BA9] block mt-1">
                          Raw Lot: {automaticSizingResult.rawLot.toFixed(4)} · Step:{' '}
                          {automaticSizingResult.contractSpec.lotStep} (Floored)
                        </span>
                      )}
                    </div>

                    {/* Breakdown Rows */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between py-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[#697586] dark:text-[#929BA9]">Risk Amount</span>
                        <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          ${automaticSizingResult.riskAmountUsd.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[#697586] dark:text-[#929BA9]">Actual Risk</span>
                        <span className="font-mono-numbers font-semibold text-rose-600 dark:text-rose-400">
                          {automaticSizingResult.isValid
                            ? `${automaticSizingResult.actualRiskPercent.toFixed(2)}% ($${automaticSizingResult.actualLossUsd.toFixed(2)})`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                        <span className="text-[#697586] dark:text-[#929BA9]">
                          Stop Loss Distance
                        </span>
                        <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {automaticSizingResult.isValid
                            ? `${automaticSizingResult.slDistancePips} pips`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-[#697586] dark:text-[#929BA9]">
                          Maximum Allowed Risk
                        </span>
                        <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                          {automaticSizingResult.maximumAllowedRiskPercent.toFixed(2)}% ($
                          {automaticSizingResult.riskAmountUsd.toFixed(2)})
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9] pt-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
                    Recommended Lot selalu dibulatkan ke bawah (floor) sesuai Lot Step (
                    {automaticSizingResult.contractSpec.lotStep}) agar Actual Risk tidak pernah melampaui batas risiko yang dipilih.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          FEATURE 02: PROTEKSI & ATURAN RISIKO (Section 6)
         ========================================================================== */}
      {activeTool === 'protection-rules' && (
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-6">
          <div className="pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Proteksi & Aturan Risiko
            </h2>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Daily limits and risk settings
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Risk Limit Inputs */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Daily Loss Limit (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    value={ruleDailyLossPct}
                    onChange={(e) => handleRuleDailyLossPctChange(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Maximum Daily Loss ({settings.currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={ruleDailyLossAmt}
                    onChange={(e) => handleRuleDailyLossAmtChange(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Consecutive Loss Limit (Trades)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="20"
                    value={ruleConsecutiveLosses}
                    onChange={(e) => setRuleConsecutiveLosses(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Maximum Drawdown (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={ruleMaxDrawdownPct}
                    onChange={(e) => setRuleMaxDrawdownPct(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Max Risk per Trade (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    value={ruleMaxTradeRiskPct}
                    onChange={(e) => setRuleMaxTradeRiskPct(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                    Daily Reset
                  </label>
                  <select
                    value={ruleResetTimezone}
                    onChange={(e) => setRuleResetTimezone(e.target.value)}
                    className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                  >
                    <option value="WIB (UTC+7)">00:00 WIB (UTC+7)</option>
                    <option value="WITA (UTC+8)">00:00 WITA (UTC+8)</option>
                    <option value="WIT (UTC+9)">00:00 WIT (UTC+9)</option>
                    <option value="UTC (Server)">00:00 UTC (Server)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Alert Settings & Save */}
            <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9] block pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  Alert Settings
                </span>

                {/* Daily Loss Alert Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] block">
                      Daily Loss Alert
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Warning banner when daily loss reaches 75% of daily limit
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRuleDailyAlertOn((v) => !v)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      ruleDailyAlertOn
                        ? 'bg-[#1769E8] text-white border-[#1769E8]'
                        : 'bg-white dark:bg-[#11151B] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                    }`}
                  >
                    {ruleDailyAlertOn ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Stop Trading Alert Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] block">
                      Stop Trading Alert
                    </span>
                    <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                      Alert banner when daily loss reaches 100% of daily limit
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRuleStopAlertOn((v) => !v)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      ruleStopAlertOn
                        ? 'bg-[#1769E8] text-white border-[#1769E8]'
                        : 'bg-white dark:bg-[#11151B] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34]'
                    }`}
                  >
                    {ruleStopAlertOn ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-[#DDE3EA] dark:border-[#252B34]">
                <button
                  type="button"
                  onClick={handleSaveProtectionRules}
                  className="w-full rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold py-2.5 px-4 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  {rulesSavedFeedback ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Settings Saved</span>
                    </>
                  ) : (
                    <span>Save Settings</span>
                  )}
                </button>

                <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  Note: Risk protection alerts operate as in-app warnings and discipline evaluation benchmarks inside TradeVault. They do not automatically block orders at your broker terminal.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          FEATURE 03: SIMULASI LOSS BERUNTUN (Section 7)
         ========================================================================== */}
      {activeTool === 'consecutive-loss' && (
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-6">
          <div className="pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
              Simulasi Loss Beruntun
            </h2>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              Consecutive loss simulation
            </p>
          </div>

          {/* Input Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                Initial Balance ({settings.currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={consecBalanceInput}
                onChange={(e) => setConsecBalanceInput(e.target.value)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="1000"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                Risk per Trade (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                max="100"
                value={consecRiskInput}
                onChange={(e) => setConsecRiskInput(e.target.value)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                Risk Method
              </label>
              <select
                value={consecMethod}
                onChange={(e) => setConsecMethod(e.target.value as ConsecutiveLossMethod)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="PERCENT_RUNNING_EQUITY">Percentage of Remaining Balance</option>
                <option value="FIXED_NOMINAL">Fixed Risk Amount</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] mb-1.5">
                Number of Losses
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                value={consecCountInput}
                onChange={(e) => setConsecCountInput(e.target.value)}
                className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-sm font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
                placeholder="5"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setConsecCountInput(String(consecLossesCount))}
                className="w-full rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold py-2.5 px-4 transition-colors"
              >
                Simulate
              </button>
            </div>
          </div>

          {/* RESULT SUMMARY (Section 7) */}
          <div className="space-y-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9] block">
              Result
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
                  Initial Balance
                </span>
                <div className="text-lg font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                  {formatCurrency(consecInitialBalance, settings)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
                  Remaining Balance
                </span>
                <div className="text-lg font-bold font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                  {formatCurrency(consecRemainingBalance, settings)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
                  Total Loss
                </span>
                <div className="text-lg font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
                  -{formatCurrency(consecTotalLoss, settings)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34]">
                <span className="text-xs text-[#697586] dark:text-[#929BA9] block mb-1">
                  Drawdown
                </span>
                <div className="text-lg font-bold font-mono-numbers text-rose-600 dark:text-rose-400">
                  -{consecDrawdownPct.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* BALANCE PROJECTION (Section 7) */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9] block">
              Balance Projection
            </span>

            <div className="overflow-x-auto rounded-xl border border-[#DDE3EA] dark:border-[#252B34]">
              <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
                <thead className="bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                  <tr>
                    <th className="py-2.5 px-4">Step</th>
                    <th className="py-2.5 px-4 font-mono-numbers">Loss per Trade</th>
                    <th className="py-2.5 px-4 font-mono-numbers">Remaining Balance</th>
                    <th className="py-2.5 px-4 font-mono-numbers">Cumulative Drawdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers">
                  <tr className="bg-white dark:bg-[#11151B]">
                    <td className="py-2.5 px-4 font-sans font-medium text-[#697586] dark:text-[#929BA9]">
                      Initial
                    </td>
                    <td className="py-2.5 px-4 text-[#697586] dark:text-[#929BA9]">--</td>
                    <td className="py-2.5 px-4 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                      {formatCurrency(consecInitialBalance, settings)}
                    </td>
                    <td className="py-2.5 px-4 text-[#697586] dark:text-[#929BA9]">0.00%</td>
                  </tr>
                  {consecSteps.map((step) => (
                    <tr
                      key={step.lossNumber}
                      className="hover:bg-[#F5F7FA]/60 dark:hover:bg-[#171D26]/50 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-sans font-medium text-[#151D2A] dark:text-[#F2F5F9]">
                        Loss {step.lossNumber}
                      </td>
                      <td className="py-2.5 px-4 text-rose-600 dark:text-rose-400">
                        -{formatCurrency(step.dollarLost, settings)}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                        {formatCurrency(step.remainingEquity, settings)}
                      </td>
                      <td className="py-2.5 px-4 text-rose-600 dark:text-rose-400">
                        -{step.cumulativeDrawdownPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          FEATURE 04: EVALUASI DISIPLIN (Section 8)
         ========================================================================== */}
      {activeTool === 'discipline-eval' && (
        <div className="rounded-xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-5 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9]">
                Evaluasi Disiplin
              </h2>
              <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
                Trading rule compliance
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#697586] dark:text-[#929BA9]">
                Evaluation Period
              </label>
              <select
                value={disciplinePeriod}
                onChange={(e) => setDisciplinePeriod(e.target.value as DisciplinePeriod)}
                className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-1.5 text-xs font-medium text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="LAST_20">Last 20 Trades</option>
                <option value="LAST_50">Last 50 Trades</option>
                <option value="ALL">All Trades</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Discipline Score Card */}
            <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 flex flex-col justify-between space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9] block mb-2">
                  Discipline Score
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl sm:text-4xl font-bold font-mono-numbers ${
                      disciplineEval.disciplineScore >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : disciplineEval.disciplineScore >= 60
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {disciplineEval.disciplineScore}
                  </span>
                  <span className="text-base font-mono-numbers text-[#697586] dark:text-[#929BA9]">
                    / 100
                  </span>
                </div>
                <span className="text-xs text-[#697586] dark:text-[#929BA9] block mt-1">
                  Evaluated from {disciplineEval.totalTradesEvaluated} trades in Trade Log (Grade {disciplineEval.disciplineGrade})
                </span>
              </div>

              <div className="pt-3 border-t border-[#DDE3EA] dark:border-[#252B34] flex items-center justify-between text-xs">
                <span className="text-[#697586] dark:text-[#929BA9]">Max Loss Streak</span>
                <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                  {disciplineEval.maxConsecutiveLossesEncountered} trades (Limit: {settings.maxConsecutiveLossLimit || 3})
                </span>
              </div>
            </div>

            {/* RULE COMPLIANCE (Section 8) */}
            <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9] block pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                Rule Compliance
              </span>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="text-[#697586] dark:text-[#929BA9]">Risk per Trade</span>
                  <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {disciplineEval.riskPerTradeCompliantCount ?? 0} / {disciplineEval.totalTradesEvaluated}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="text-[#697586] dark:text-[#929BA9]">Stop Loss Compliance</span>
                  <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {disciplineEval.stopLossCompliantCount ?? 0} / {disciplineEval.totalTradesEvaluated}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  <span className="text-[#697586] dark:text-[#929BA9]">Trading Plan</span>
                  <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {disciplineEval.tradingPlanCompliantCount ?? 0} / {disciplineEval.totalTradesEvaluated}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[#697586] dark:text-[#929BA9]">Daily Limit Compliance</span>
                  <span className="font-mono-numbers font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                    {disciplineEval.dailyLimitCompliantCount ?? 0} / {disciplineEval.totalTradesEvaluated}
                  </span>
                </div>
              </div>
            </div>

            {/* RULE VIOLATIONS (Section 8) */}
            <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F5F9] block pb-2 border-b border-[#DDE3EA] dark:border-[#252B34]">
                  Rule Violations
                </span>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#697586] dark:text-[#929BA9]">Total Violations</span>
                  <span
                    className={`text-xl font-bold font-mono-numbers ${
                      (disciplineEval.totalViolationsCount ?? 0) > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {disciplineEval.totalViolationsCount ?? 0}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-[#697586] dark:text-[#929BA9]">
                  <div className="flex justify-between">
                    <span>Over-Risk on Losses</span>
                    <span className="font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                      {disciplineEval.overRiskTradesCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Excessive Planned Risk</span>
                    <span className="font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                      {disciplineEval.excessiveRiskTradesCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Limit Breaches</span>
                    <span className="font-mono-numbers text-[#151D2A] dark:text-[#F2F5F9]">
                      {disciplineEval.dailyLossViolationsCount}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDisciplineDetails((v) => !v)}
                className="w-full rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] hover:border-[#1769E8] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] py-2 px-4 transition-colors"
              >
                {showDisciplineDetails ? 'Hide Details' : 'View Details'}
              </button>
            </div>
          </div>

          {/* Expandable Details Section */}
          {showDisciplineDetails && (
            <div className="pt-4 border-t border-[#DDE3EA] dark:border-[#252B34] space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {disciplineEval.auditFindings.map((finding, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          finding.type === 'VIOLATION'
                            ? 'text-rose-600 dark:text-rose-400'
                            : finding.type === 'WARNING'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {finding.title}
                      </span>
                      <span className="text-[10px] uppercase font-mono-numbers text-[#697586] dark:text-[#929BA9]">
                        {finding.type}
                      </span>
                    </div>
                    <p className="text-xs text-[#697586] dark:text-[#929BA9] leading-relaxed">
                      {finding.description}
                    </p>
                  </div>
                ))}
              </div>

              {filteredDisciplineTrades.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#DDE3EA] dark:border-[#252B34]">
                  <table className="w-full text-left text-xs text-[#151D2A] dark:text-[#F2F5F9]">
                    <thead className="bg-[#F5F7FA] dark:bg-[#171D26] border-b border-[#DDE3EA] dark:border-[#252B34] text-[11px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Pair</th>
                        <th className="py-2.5 px-3 font-mono-numbers">Stop Loss</th>
                        <th className="py-2.5 px-3 font-mono-numbers">Planned Risk</th>
                        <th className="py-2.5 px-3 font-mono-numbers">Realized P/L</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#252B34] font-mono-numbers">
                      {[...filteredDisciplineTrades].reverse().slice(0, 20).map((t) => {
                        const net = computeTradeNetProfit(t);
                        const hasSL = t.stopLoss !== undefined && t.stopLoss > 0;
                        const hasRisk = t.riskAmount !== undefined && t.riskAmount > 0;
                        const isOverRisk =
                          net < 0 && hasRisk && Math.abs(net) > t.riskAmount! * 1.05;
                        const isCompliant = hasSL && !isOverRisk;
                        return (
                          <tr key={t.id}>
                            <td className="py-2 px-3 text-[#697586] dark:text-[#929BA9]">
                              {(t.dateTime || '').slice(0, 10)}
                            </td>
                            <td className="py-2 px-3 font-sans font-medium">
                              {t.pair} · {t.position}
                            </td>
                            <td className="py-2 px-3">
                              {hasSL ? t.stopLoss : 'Missing'}
                            </td>
                            <td className="py-2 px-3">
                              {hasRisk ? formatCurrency(t.riskAmount!, settings) : '--'}
                            </td>
                            <td
                              className={`py-2 px-3 font-semibold ${
                                net >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {net >= 0 ? '+' : '-'}
                              {formatCurrency(Math.abs(net), settings)}
                            </td>
                            <td
                              className={`py-2 px-3 font-sans font-semibold ${
                                isCompliant
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {isCompliant ? 'Compliant' : isOverRisk ? 'Over-Risk' : 'No SL'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          FEATURE 05: SIMULATOR COMPOUNDING (Section 9)
         ========================================================================== */}
      {activeTool === 'compounding-calc' && (
        <CompoundingCalculatorTab settings={settings} currentEquity={currentEquity} />
      )}

      {/* ==========================================================================
          FEATURE 06: SIMULASI BERBASIS TRADE (Section 10)
         ========================================================================== */}
      {activeTool === 'trade-sim' && (
        <TradeSimulationTab settings={settings} currentEquity={currentEquity} />
      )}
    </div>
  );
};
