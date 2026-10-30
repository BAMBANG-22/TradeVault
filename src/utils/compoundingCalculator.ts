export type CompoundingInterval = 'daily' | 'weekly' | 'monthly';
export type CompoundingMode = 'compounding' | 'fixed_withdrawn';
export type DepositTiming = 'end_of_period' | 'start_of_period';

export interface CompoundingInput {
  startingCapital: number;
  growthRatePercent: number; // e.g. 5 for 5%
  interval: CompoundingInterval;
  duration: number; // e.g. 30 periods
  regularDeposit?: number; // optional routine contribution
  depositTiming?: DepositTiming; // default 'end_of_period'
  mode: CompoundingMode;
}

export interface CompoundingPeriodStep {
  period: number;
  startBalance: number;
  growthProfit: number;
  deposit: number;
  endBalance: number;
  cumulativeProfit: number;
  cumulativeDeposits: number;
}

export interface CompoundingResult {
  startingCapital: number;
  endingBalance: number;
  totalProfit: number;
  totalDeposits: number;
  pureGrowthProfit: number;
  totalGrowthPercent: number;
  steps: CompoundingPeriodStep[];
}

/**
 * Calculates compounding growth or fixed/withdrawn profit for TradeVault.
 *
 * Rules:
 * - Mode Compounding:
 *   endBalance = startBalance * (1 + rate) + deposit (if depositTiming is end_of_period)
 *   endBalance = (startBalance + deposit) * (1 + rate) (if depositTiming is start_of_period)
 *
 * - Mode Fixed / Withdrawn Profit:
 *   Profit each period is computed strictly from the principal starting capital:
 *   profit = startingCapital * rate
 *   Profit is not reinvested into the growth engine (it is collected or withdrawn).
 */
export function calculateCompoundingGrowth(input: CompoundingInput): CompoundingResult {
  const startingCapital = Math.max(0, Number(input.startingCapital) || 0);
  const growthRate = (Number(input.growthRatePercent) || 0) / 100;
  const duration = Math.max(1, Math.min(1000, Math.floor(Number(input.duration) || 1)));
  const regularDeposit = Math.max(0, Number(input.regularDeposit) || 0);
  const depositTiming = input.depositTiming || 'end_of_period';
  const mode = input.mode || 'compounding';

  const steps: CompoundingPeriodStep[] = [];
  let currentStart = startingCapital;
  let runningProfit = 0;
  let runningDeposits = 0;

  for (let p = 1; p <= duration; p++) {
    let growthProfit = 0;
    let endBalance = currentStart;

    if (mode === 'compounding') {
      if (depositTiming === 'start_of_period') {
        const principalWithDeposit = currentStart + regularDeposit;
        growthProfit = principalWithDeposit * growthRate;
        endBalance = principalWithDeposit + growthProfit;
      } else {
        // end_of_period: exactly saldo akhir = saldo awal periode × (1 + tingkat pertumbuhan) + deposit periode
        growthProfit = currentStart * growthRate;
        endBalance = currentStart + growthProfit + regularDeposit;
      }
    } else {
      // Fixed / Withdrawn Profit mode:
      // Profit is calculated solely from the starting capital
      growthProfit = startingCapital * growthRate;
      // In withdrawn mode, the profit is harvested each interval, principal stays + any deposits
      endBalance = currentStart + regularDeposit;
    }

    runningProfit += growthProfit;
    runningDeposits += regularDeposit;

    steps.push({
      period: p,
      startBalance: Number(currentStart.toFixed(2)),
      growthProfit: Number(growthProfit.toFixed(2)),
      deposit: regularDeposit,
      endBalance: Number(endBalance.toFixed(2)),
      cumulativeProfit: Number(runningProfit.toFixed(2)),
      cumulativeDeposits: Number(runningDeposits.toFixed(2)),
    });

    currentStart = endBalance;
  }

  const finalStep = steps[steps.length - 1];
  const finalBalance = mode === 'compounding' ? (finalStep?.endBalance || startingCapital) : (startingCapital + runningDeposits + runningProfit);
  const pureGrowth = runningProfit;
  const totalBase = startingCapital + runningDeposits;
  const totalGrowthPercent = totalBase > 0 ? (pureGrowth / totalBase) * 100 : 0;

  return {
    startingCapital,
    endingBalance: Number(finalBalance.toFixed(2)),
    totalProfit: Number(runningProfit.toFixed(2)),
    totalDeposits: Number(runningDeposits.toFixed(2)),
    pureGrowthProfit: Number(pureGrowth.toFixed(2)),
    totalGrowthPercent: Number(totalGrowthPercent.toFixed(2)),
    steps,
  };
}
