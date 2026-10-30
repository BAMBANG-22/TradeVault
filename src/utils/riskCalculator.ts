import { AppSettings } from '../types/settings';
import { Trade } from '../types/trade';
import { computePlannedRiskReward, computeTradeNetProfit } from './calculations';

export interface LotCalculationInput {
  equity: number;
  riskPercent: number; // e.g. 1.0 for 1%
  riskAmountManual?: number; // if user wants to specify fixed dollar risk
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  position: 'BUY' | 'SELL';
  contractSize?: number; // default 100 oz
  tickSize?: number; // default 0.01
  tickValue?: number; // default 1.00 per standard lot
  minLot?: number; // default 0.01
  lotStep?: number; // default 0.01
  leverage?: number; // default 500 (1:500)
  accountCurrency?: string;
}

export interface LotCalculationResult {
  riskAmount: number;
  slDistancePrice: number; // in $ (e.g. $5.50)
  slDistancePips: number; // in pips (e.g. 55 pips)
  slDistancePoints: number; // in points (e.g. 550 points)
  calculatedLot: number; // unrounded exact (e.g. 0.456)
  recommendedLot: number; // floored to broker lot step (e.g. 0.45)
  isBelowMinLot: boolean;
  minLot: number;
  lotStep: number;
  lossPerLot: number;
  estimatedLossAtSL: number;
  // Take Profit & R:R
  hasCustomTP: boolean;
  tpDistancePrice: number;
  estimatedProfitAtTP: number;
  rewardRiskRatio: number;
  tpScenarios: {
    ratio: string;
    targetPrice: number;
    profitAmount: number;
    gainPercent: number;
  }[];
  // Margin Estimation
  hasMarginEstimate: boolean;
  requiredMargin: number;
  freeMarginRemaining: number;
  marginLevelPercent: number;
  leverage: number;
  isValid: boolean;
  errorMessage?: string;
}

export type ConsecutiveLossMethod = 'PERCENT_RUNNING_EQUITY' | 'FIXED_NOMINAL';

export interface ConsecutiveLossStep {
  lossNumber: number;
  remainingEquity: number;
  dollarLost: number;
  cumulativeDrawdownPercent: number;
  isAccountBlown: boolean;
}

export interface DisciplineEvaluationResult {
  hasSufficientData: boolean;
  totalTradesEvaluated: number;
  lossTradesEvaluated: number;
  tradesWithIncompleteData: number;
  // Risk Violations
  overRiskTradesCount: number; // loss exceeded planned risk amount (+5% tolerance)
  excessiveRiskTradesCount: number; // planned risk % exceeded max allowed trade risk
  dailyLossViolationsCount: number; // days where daily loss exceeded daily limit
  maxConsecutiveLossesEncountered: number;
  consecutiveLossBreachesCount: number; // times streak hit or exceeded limit
  // Discipline score
  disciplineScore: number; // 0 - 100
  disciplineGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  auditFindings: {
    type: 'VIOLATION' | 'WARNING' | 'COMPLIANT';
    title: string;
    description: string;
  }[];
}

/**
 * Calculate position sizing for XAUUSD (Gold) with broker specifications, rounding down, and margin estimation.
 */
export function calculateXauusdLot(
  input: LotCalculationInput,
  settings: AppSettings
): LotCalculationResult {
  const contractSize = input.contractSize || settings.xauusdContractSize || 100;
  const equity = input.equity > 0 ? input.equity : 1000;
  const lotStep = input.lotStep || settings.xauusdLotStep || 0.01;
  const minLot = input.minLot || settings.xauusdMinLot || 0.01;
  const leverage = input.leverage || settings.defaultLeverage || 500;

  const riskAmount =
    input.riskAmountManual && input.riskAmountManual > 0
      ? input.riskAmountManual
      : (equity * (input.riskPercent || 1.0)) / 100;

  const entry = Number(input.entryPrice);
  const sl = Number(input.stopLossPrice);
  const tp = input.takeProfitPrice !== undefined && !isNaN(Number(input.takeProfitPrice)) && Number(input.takeProfitPrice) > 0
    ? Number(input.takeProfitPrice)
    : undefined;

  const defaultResult: LotCalculationResult = {
    riskAmount: Number(riskAmount.toFixed(2)),
    slDistancePrice: 0,
    slDistancePips: 0,
    slDistancePoints: 0,
    calculatedLot: 0,
    recommendedLot: 0,
    isBelowMinLot: false,
    minLot,
    lotStep,
    lossPerLot: 0,
    estimatedLossAtSL: 0,
    hasCustomTP: false,
    tpDistancePrice: 0,
    estimatedProfitAtTP: 0,
    rewardRiskRatio: 0,
    tpScenarios: [],
    hasMarginEstimate: false,
    requiredMargin: 0,
    freeMarginRemaining: equity,
    marginLevelPercent: 0,
    leverage,
    isValid: false,
  };

  if (!entry || !sl || isNaN(entry) || isNaN(sl) || entry <= 0 || sl <= 0) {
    return {
      ...defaultResult,
      errorMessage: 'Masukkan harga Entry dan Stop Loss yang valid (angka positif).',
    };
  }

  // Direction & Price Validation
  if (input.position === 'BUY') {
    if (sl >= entry) {
      return {
        ...defaultResult,
        errorMessage: 'Untuk posisi BUY, Stop Loss ($' + sl.toFixed(2) + ') harus berada di bawah Entry Price ($' + entry.toFixed(2) + ').',
      };
    }
    if (tp !== undefined && tp <= entry) {
      return {
        ...defaultResult,
        errorMessage: 'Untuk posisi BUY, Take Profit ($' + tp.toFixed(2) + ') harus berada di atas Entry Price ($' + entry.toFixed(2) + ').',
      };
    }
  } else {
    // SELL
    if (sl <= entry) {
      return {
        ...defaultResult,
        errorMessage: 'Untuk posisi SELL, Stop Loss ($' + sl.toFixed(2) + ') harus berada di atas Entry Price ($' + entry.toFixed(2) + ').',
      };
    }
    if (tp !== undefined && tp >= entry) {
      return {
        ...defaultResult,
        errorMessage: 'Untuk posisi SELL, Take Profit ($' + tp.toFixed(2) + ') harus berada di bawah Entry Price ($' + entry.toFixed(2) + ').',
      };
    }
  }

  const slDistancePrice = Math.abs(entry - sl);
  if (slDistancePrice <= 0.001) {
    return {
      ...defaultResult,
      errorMessage: 'Jarak Stop Loss terlalu sempit (kurang dari $0.01).',
    };
  }

  // 1 pip on Gold (2 decimals) = $0.10, 1 point = $0.01
  const slDistancePoints = Math.round(slDistancePrice * 100);
  const slDistancePips = Number((slDistancePrice / 0.10).toFixed(1));

  // Loss per 1 lot = Delta Price * Contract Size
  // E.g. $5.00 SL * 100 oz = $500 per 1.0 lot
  const lossPerLot = slDistancePrice * contractSize;
  if (lossPerLot <= 0) {
    return {
      ...defaultResult,
      errorMessage: 'Perhitungan loss per lot bernilai nol.',
    };
  }

  // Exact unrounded lot
  const exactCalculatedLot = riskAmount / lossPerLot;

  // Floor to broker lot step (rounding down ensures risk is not exceeded)
  const stepFactor = 1 / lotStep;
  const flooredLot = Math.floor(exactCalculatedLot * stepFactor) / stepFactor;
  const decimals = lotStep < 0.01 ? 3 : 2;
  const recommendedLot = Number(flooredLot.toFixed(decimals));
  const isBelowMinLot = recommendedLot < minLot;

  // Effective estimated loss on SL with recommended lot
  const effectiveLossAmount = recommendedLot * lossPerLot;

  // Take Profit & R:R calculations if custom TP is given
  let hasCustomTP = false;
  let tpDistancePrice = 0;
  let estimatedProfitAtTP = 0;
  let rewardRiskRatio = 0;

  if (tp !== undefined) {
    hasCustomTP = true;
    tpDistancePrice = Math.abs(tp - entry);
    estimatedProfitAtTP = Number((recommendedLot * tpDistancePrice * contractSize).toFixed(2));
    rewardRiskRatio = computePlannedRiskReward(entry, sl, tp, input.position) ?? 0;
  }

  // Preset R:R scenarios (1:2, 1:3, 1:5)
  const presetRatios = [
    { label: '1:2', mult: 2.0 },
    { label: '1:3', mult: 3.0 },
    { label: '1:5', mult: 5.0 },
  ];

  const tpScenarios = presetRatios.map((r) => {
    const tpPrice =
      input.position === 'BUY'
        ? entry + slDistancePrice * r.mult
        : entry - slDistancePrice * r.mult;

    const profit = riskAmount * r.mult;
    const gainPct = equity > 0 ? (profit / equity) * 100 : 0;

    return {
      ratio: r.label,
      targetPrice: Number(tpPrice.toFixed(2)),
      profitAmount: Number(profit.toFixed(2)),
      gainPercent: Number(gainPct.toFixed(2)),
    };
  });

  // Margin estimation
  // Required Margin = (Lot * Contract Size * Entry Price) / Leverage
  const notionalValue = recommendedLot * contractSize * entry;
  const requiredMargin = leverage > 0 ? Number((notionalValue / leverage).toFixed(2)) : 0;
  const freeMarginRemaining = Number((equity - requiredMargin).toFixed(2));
  const marginLevelPercent =
    requiredMargin > 0 ? Number(((equity / requiredMargin) * 100).toFixed(1)) : 0;

  return {
    riskAmount: Number(riskAmount.toFixed(2)),
    slDistancePrice: Number(slDistancePrice.toFixed(2)),
    slDistancePips,
    slDistancePoints,
    calculatedLot: Number(exactCalculatedLot.toFixed(3)),
    recommendedLot,
    isBelowMinLot,
    minLot,
    lotStep,
    lossPerLot: Number(lossPerLot.toFixed(2)),
    estimatedLossAtSL: Number(effectiveLossAmount.toFixed(2)),
    hasCustomTP,
    tpDistancePrice: Number(tpDistancePrice.toFixed(2)),
    estimatedProfitAtTP,
    rewardRiskRatio,
    tpScenarios,
    hasMarginEstimate: leverage > 0 && entry > 0,
    requiredMargin,
    freeMarginRemaining,
    marginLevelPercent,
    leverage,
    isValid: true,
  };
}

/**
 * Simulate consecutive losses and drawdown impact under geometric vs linear models
 */
export function simulateConsecutiveLosses(
  startingCapital: number,
  riskPercentOrNominal: number,
  stepsCount: number = 10,
  method: ConsecutiveLossMethod = 'PERCENT_RUNNING_EQUITY'
): ConsecutiveLossStep[] {
  const steps: ConsecutiveLossStep[] = [];
  let runningCapital = Math.max(1, startingCapital);
  const capitalBase = runningCapital;

  for (let i = 1; i <= stepsCount; i++) {
    let dollarLost = 0;

    if (method === 'PERCENT_RUNNING_EQUITY') {
      const riskFraction = (riskPercentOrNominal || 1.0) / 100;
      dollarLost = runningCapital * riskFraction;
      runningCapital = Math.max(0, runningCapital - dollarLost);
    } else {
      // Fixed nominal dollar risk per trade
      dollarLost = riskPercentOrNominal;
      runningCapital = Math.max(0, runningCapital - dollarLost);
    }

    const cumulativeDrawdownPercent =
      capitalBase > 0 ? ((capitalBase - runningCapital) / capitalBase) * 100 : 100;

    steps.push({
      lossNumber: i,
      remainingEquity: Number(runningCapital.toFixed(2)),
      dollarLost: Number(dollarLost.toFixed(2)),
      cumulativeDrawdownPercent: Number(cumulativeDrawdownPercent.toFixed(2)),
      isAccountBlown: runningCapital <= 0,
    });
  }

  return steps;
}

/**
 * Evaluate trading discipline & risk compliance based on actual Trade Log records
 */
export function evaluateTradingDiscipline(
  trades: Trade[],
  settings: AppSettings
): DisciplineEvaluationResult {
  if (!trades || trades.length < 3) {
    return {
      hasSufficientData: false,
      totalTradesEvaluated: trades?.length || 0,
      lossTradesEvaluated: 0,
      tradesWithIncompleteData: 0,
      overRiskTradesCount: 0,
      excessiveRiskTradesCount: 0,
      dailyLossViolationsCount: 0,
      maxConsecutiveLossesEncountered: 0,
      consecutiveLossBreachesCount: 0,
      disciplineScore: 100,
      disciplineGrade: 'A',
      auditFindings: [
        {
          type: 'WARNING',
          title: 'Data Belum Cukup',
          description:
            'Diperlukan minimal 3 transaksi tercatat pada Trade Log untuk melakukan audit kepatuhan risiko secara obyektif.',
        },
      ],
    };
  }

  let lossTradesEvaluated = 0;
  let tradesWithIncompleteData = 0;
  let overRiskTradesCount = 0;
  let excessiveRiskTradesCount = 0;

  const maxAllowedRiskPercent = settings.maxTradeRiskPercent || 2.0;
  const maxAllowedRiskAmount = settings.maxTradeRiskAmount || 200;

  // Track streaks
  let currentStreak = 0;
  let maxStreak = 0;
  let consecutiveLossBreachesCount = 0;
  const limitConsecutive = settings.maxConsecutiveLossLimit || 3;

  trades.forEach((t) => {
    const net = computeTradeNetProfit(t);
    const isLoss = t.outcome === 'LOSS' || net < -0.01;

    // Check risk plan presence
    const hasRiskAmount = t.riskAmount !== undefined && t.riskAmount > 0;
    const hasSL = t.stopLoss !== undefined && t.stopLoss > 0;

    if (!hasRiskAmount && !hasSL) {
      tradesWithIncompleteData++;
    }

    // Check if initial planned risk was excessive
    if (t.riskPercentage && t.riskPercentage > maxAllowedRiskPercent) {
      excessiveRiskTradesCount++;
    } else if (hasRiskAmount && t.riskAmount > maxAllowedRiskAmount) {
      excessiveRiskTradesCount++;
    }

    if (isLoss) {
      lossTradesEvaluated++;
      const actualLoss = Math.abs(net);

      // Slippage tolerance: 5%
      if (hasRiskAmount && actualLoss > t.riskAmount * 1.05) {
        overRiskTradesCount++;
      }

      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
      if (currentStreak === limitConsecutive) {
        consecutiveLossBreachesCount++;
      }
    } else {
      currentStreak = 0;
    }
  });

  // Daily Loss Violations check
  const dailyMap: { [date: string]: number } = {};
  trades.forEach((t) => {
    const d = (t.dateTime || '').slice(0, 10);
    if (!d) return;
    dailyMap[d] = (dailyMap[d] || 0) + computeTradeNetProfit(t);
  });

  let dailyLossViolationsCount = 0;
  Object.keys(dailyMap).forEach((d) => {
    const dayNet = dailyMap[d];
    if (dayNet < 0) {
      const dayLoss = Math.abs(dayNet);
      if (
        dayLoss >= settings.maxDailyLossAmount ||
        (settings.startingBalance > 0 &&
          (dayLoss / settings.startingBalance) * 100 >= settings.maxDailyLossPercent)
      ) {
        dailyLossViolationsCount++;
      }
    }
  });

  // Calculate Discipline Score (0 to 100)
  let score = 100;
  // Deduct for over-risk on loss trades
  if (lossTradesEvaluated > 0) {
    const overRiskRatio = overRiskTradesCount / lossTradesEvaluated;
    score -= overRiskRatio * 35;
  }
  // Deduct for daily loss breaches
  score -= dailyLossViolationsCount * 15;
  // Deduct for excessive risk trades
  score -= (excessiveRiskTradesCount / trades.length) * 20;
  // Deduct for incomplete risk data
  score -= (tradesWithIncompleteData / trades.length) * 15;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let disciplineGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
  if (score >= 90) disciplineGrade = 'A';
  else if (score >= 80) disciplineGrade = 'B';
  else if (score >= 70) disciplineGrade = 'C';
  else if (score >= 60) disciplineGrade = 'D';
  else disciplineGrade = 'F';

  const auditFindings: {
    type: 'VIOLATION' | 'WARNING' | 'COMPLIANT';
    title: string;
    description: string;
  }[] = [];

  if (overRiskTradesCount > 0) {
    auditFindings.push({
      type: 'VIOLATION',
      title: `${overRiskTradesCount} Transaksi Rugi Melampaui Rencana Risiko`,
      description: `Terdapat transaksi rugi dengan kerugian riil lebih besar dari Stop Loss yang direncanakan (toleransi slippage 5%). Waspadai pelebaran SL manual atau averaging down.`,
    });
  }

  if (dailyLossViolationsCount > 0) {
    auditFindings.push({
      type: 'VIOLATION',
      title: `${dailyLossViolationsCount} Kali Melanggar Batas Kerugian Harian`,
      description: `Tercatat hari trading di mana akumulasi rugi harian melampaui ${settings.maxDailyLossPercent}% (${settings.currencySymbol}${settings.maxDailyLossAmount}).`,
    });
  }

  if (excessiveRiskTradesCount > 0) {
    auditFindings.push({
      type: 'WARNING',
      title: `${excessiveRiskTradesCount} Posisi Mengambil Risiko Terlalu Besar`,
      description: `Posisi dipasang dengan rencana risiko di atas batas aman ${maxAllowedRiskPercent}% per trade.`,
    });
  }

  if (tradesWithIncompleteData > 0) {
    auditFindings.push({
      type: 'WARNING',
      title: `${tradesWithIncompleteData} Transaksi Tanpa Catatan Stop Loss Lengkap`,
      description: `Beberapa transaksi tidak mencatat level Stop Loss atau nominal risiko awal, sehingga evaluasi eksekusi menggunakan estimasi.`,
    });
  }

  if (auditFindings.length === 0) {
    auditFindings.push({
      type: 'COMPLIANT',
      title: 'Disiplin Eksekusi Sangat Baik',
      description:
        'Seluruh transaksi mematuhi rencana Stop Loss, batas risiko per posisi, dan tidak ada pelanggaran batas kerugian harian.',
    });
  }

  return {
    hasSufficientData: true,
    totalTradesEvaluated: trades.length,
    lossTradesEvaluated,
    tradesWithIncompleteData,
    overRiskTradesCount,
    excessiveRiskTradesCount,
    dailyLossViolationsCount,
    maxConsecutiveLossesEncountered: maxStreak,
    consecutiveLossBreachesCount,
    disciplineScore: score,
    disciplineGrade,
    auditFindings,
  };
}
