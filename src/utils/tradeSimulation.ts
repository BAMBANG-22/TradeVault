export type RiskMethod = 'balance' | 'initial_capital';
export type RiskType = 'percent' | 'nominal';
export type SequenceMode = 'expected_spread' | 'win_streak_first' | 'loss_streak_first' | 'monte_carlo_random';

export interface TradeSimulationInput {
  startingCapital: number;
  winRate: number; // 0 - 100
  rrRatio: number; // Reward : Risk ratio (e.g. 2.5 for 1:2.5)
  riskType: RiskType; // 'percent' or 'nominal'
  riskValue: number; // e.g. 1.5 (%) or 10 ($)
  tradesCount: number; // e.g. 30
  riskMethod: RiskMethod; // 'balance' (compounding) or 'initial_capital' (fixed)
  sequenceMode?: SequenceMode;
  randomSeed?: number;
}

export interface TradeSimulationStep {
  tradeNum: number;
  isWin: boolean;
  riskAmount: number;
  pnl: number;
  equity: number;
  peakEquity: number;
  drawdownPercent: number;
  drawdownDollar: number;
}

export interface MonteCarloSummary {
  runsCount: number;
  medianFinalBalance: number;
  p95BestCase: number;
  p5WorstCase: number;
  probabilityOfProfit: number; // e.g. 85.5 (%)
  averageMaxDrawdown: number; // e.g. 12.4 (%)
  samplePaths: { runIndex: number; label: string; curve: number[] }[];
}

export interface TradeSimulationResult {
  startingCapital: number;
  finalBalance: number;
  totalNetProfit: number;
  totalGainPercent: number;
  winCount: number;
  lossCount: number;
  expectancyR: number; // in R multiples per trade
  expectancyDollar: number; // in $ per trade
  maxDrawdownPercent: number;
  maxDrawdownDollar: number;
  curve: TradeSimulationStep[];
  monteCarlo: MonteCarloSummary;
  assumptions: string[];
}

/**
 * Builds the sequence of wins and losses based on mode and win rate.
 */
function generateTradeSequence(
  tradesCount: number,
  winRate: number,
  mode: SequenceMode
): boolean[] {
  const winFraction = Math.min(100, Math.max(0, winRate)) / 100;
  const exactWins = Math.round(tradesCount * winFraction);
  const exactLosses = tradesCount - exactWins;

  if (mode === 'win_streak_first') {
    // All wins first, then losses
    return [...Array(exactWins).fill(true), ...Array(exactLosses).fill(false)];
  }

  if (mode === 'loss_streak_first') {
    // All losses first, then wins
    return [...Array(exactLosses).fill(false), ...Array(exactWins).fill(true)];
  }

  if (mode === 'monte_carlo_random') {
    // Pure independent Bernoulli trials
    const seq: boolean[] = [];
    for (let i = 0; i < tradesCount; i++) {
      seq.push(Math.random() < winFraction);
    }
    return seq;
  }

  // Default: 'expected_spread' (Evenly distributed wins and losses)
  // E.g. Bresenham-like even spacing so simulation reflects mathematical expected distribution without artificial clustering
  const seq: boolean[] = [];
  if (tradesCount <= 0) return seq;
  if (exactWins === tradesCount) return Array(tradesCount).fill(true);
  if (exactWins === 0) return Array(tradesCount).fill(false);

  let accumulated = 0;
  for (let i = 0; i < tradesCount; i++) {
    accumulated += exactWins;
    if (accumulated >= tradesCount) {
      seq.push(true);
      accumulated -= tradesCount;
    } else {
      seq.push(false);
    }
  }

  return seq;
}

/**
 * Simulates a single sequence of trades.
 */
function runSingleSequence(
  sequence: boolean[],
  startingCapital: number,
  rrRatio: number,
  riskType: RiskType,
  riskValue: number,
  riskMethod: RiskMethod
): TradeSimulationStep[] {
  const steps: TradeSimulationStep[] = [
    {
      tradeNum: 0,
      isWin: false,
      riskAmount: 0,
      pnl: 0,
      equity: startingCapital,
      peakEquity: startingCapital,
      drawdownPercent: 0,
      drawdownDollar: 0,
    },
  ];

  let currentEq = startingCapital;
  let peak = startingCapital;

  for (let i = 0; i < sequence.length; i++) {
    const isWin = sequence[i];

    // Compute risk in dollars for this trade
    let riskDollar = 0;
    if (riskMethod === 'initial_capital') {
      riskDollar = riskType === 'percent'
        ? (startingCapital * Math.max(0, riskValue)) / 100
        : Math.max(0, riskValue);
    } else {
      // 'balance' (compounding dynamic risk from current balance)
      riskDollar = riskType === 'percent'
        ? (currentEq * Math.max(0, riskValue)) / 100
        : Math.max(0, riskValue);
    }

    // Safety guard: cannot risk more than available equity
    if (riskDollar > currentEq && currentEq > 0) {
      riskDollar = currentEq;
    } else if (currentEq <= 0) {
      riskDollar = 0;
    }

    const pnl = isWin ? riskDollar * rrRatio : -riskDollar;
    currentEq = Math.max(0, currentEq + pnl);

    if (currentEq > peak) {
      peak = currentEq;
    }

    const drawdownDollar = peak > currentEq ? peak - currentEq : 0;
    const drawdownPercent = peak > 0 ? (drawdownDollar / peak) * 100 : 0;

    steps.push({
      tradeNum: i + 1,
      isWin,
      riskAmount: Number(riskDollar.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      equity: Number(currentEq.toFixed(2)),
      peakEquity: Number(peak.toFixed(2)),
      drawdownPercent: Number(drawdownPercent.toFixed(2)),
      drawdownDollar: Number(drawdownDollar.toFixed(2)),
    });
  }

  return steps;
}

/**
 * Runs full trade simulation with expectancy, drawdown analysis, and Monte Carlo multi-path.
 */
export function simulateTrades(input: TradeSimulationInput): TradeSimulationResult {
  const startingCapital = Math.max(0, Number(input.startingCapital) || 0);
  const winRate = Math.min(100, Math.max(0, Number(input.winRate) || 0));
  const rrRatio = Math.max(0.01, Number(input.rrRatio) || 1.0);
  const riskType = input.riskType || 'percent';
  const riskValue = Math.max(0, Number(input.riskValue) || 0);
  const tradesCount = Math.max(1, Math.min(500, Math.floor(Number(input.tradesCount) || 1)));
  const riskMethod = input.riskMethod || 'balance';
  const sequenceMode = input.sequenceMode || 'expected_spread';

  // 1. Generate the active sequence
  const sequence = generateTradeSequence(tradesCount, winRate, sequenceMode);
  const curve = runSingleSequence(
    sequence,
    startingCapital,
    rrRatio,
    riskType,
    riskValue,
    riskMethod
  );

  const finalStep = curve[curve.length - 1];
  const finalBalance = finalStep ? finalStep.equity : startingCapital;
  const totalNetProfit = finalBalance - startingCapital;
  const totalGainPercent = startingCapital > 0 ? (totalNetProfit / startingCapital) * 100 : 0;

  const winCount = sequence.filter(Boolean).length;
  const lossCount = sequence.length - winCount;

  // Mathematical Expectancy (R multiples)
  const winProb = winRate / 100;
  const lossProb = 1 - winProb;
  const expectancyR = winProb * rrRatio - lossProb * 1.0;

  // Expectancy in dollars for first trade
  const baseRiskDollar = riskType === 'percent'
    ? (startingCapital * riskValue) / 100
    : riskValue;
  const expectancyDollar = expectancyR * baseRiskDollar;

  // Max drawdown in the active curve
  let maxDrawdownPercent = 0;
  let maxDrawdownDollar = 0;
  for (const s of curve) {
    if (s.drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = s.drawdownPercent;
    if (s.drawdownDollar > maxDrawdownDollar) maxDrawdownDollar = s.drawdownDollar;
  }

  // 2. Run Monte Carlo simulation (250 runs) to prevent single-sequence deterministic illusion
  const monteCarloRuns = 250;
  const endBalances: number[] = [];
  const maxDds: number[] = [];
  const samplePathsData: { runIndex: number; label: string; curve: number[] }[] = [];

  for (let r = 0; r < monteCarloRuns; r++) {
    const mcSeq = generateTradeSequence(tradesCount, winRate, 'monte_carlo_random');
    const mcCurve = runSingleSequence(
      mcSeq,
      startingCapital,
      rrRatio,
      riskType,
      riskValue,
      riskMethod
    );
    const endEq = mcCurve[mcCurve.length - 1].equity;
    endBalances.push(endEq);

    let runMaxDd = 0;
    for (const st of mcCurve) {
      if (st.drawdownPercent > runMaxDd) runMaxDd = st.drawdownPercent;
    }
    maxDds.push(runMaxDd);

    // Keep first 4 sample curves for visual comparison
    if (r < 4) {
      samplePathsData.push({
        runIndex: r + 1,
        label: `Simulasi Acak #${r + 1}`,
        curve: mcCurve.map((c) => c.equity),
      });
    }
  }

  endBalances.sort((a, b) => a - b);
  maxDds.sort((a, b) => a - b);

  const medianIndex = Math.floor(monteCarloRuns * 0.5);
  const p5Index = Math.floor(monteCarloRuns * 0.05);
  const p95Index = Math.floor(monteCarloRuns * 0.95);

  const medianFinalBalance = endBalances[medianIndex] || finalBalance;
  const p5WorstCase = endBalances[p5Index] || finalBalance;
  const p95BestCase = endBalances[p95Index] || finalBalance;
  const profitableRuns = endBalances.filter((b) => b > startingCapital).length;
  const probabilityOfProfit = (profitableRuns / monteCarloRuns) * 100;
  const avgMaxDd = maxDds.reduce((acc, d) => acc + d, 0) / monteCarloRuns;

  const assumptions: string[] = [
    `Parameter: Win Rate ${winRate}%, R:R 1:${rrRatio}, Risiko ${riskValue}${riskType === 'percent' ? '%' : '$'} per trade.`,
    riskMethod === 'balance'
      ? 'Metode Risiko: Saldo Berjalan (Compounding): nominal risiko membesar saat profit dan mengecil saat drawdown.'
      : 'Metode Risiko: Modal Awal Tetap (Flat Risk): nominal risiko selalu konstan dihitung dari modal awal.',
    'Slippage, biaya komisi broker, dan swap tidak diperhitungkan dalam simulasi teoretis ini.',
    'Hasil Monte Carlo menjalankan 250 iterasi acak independen untuk memetakan rentang probabilistik (P5 s/d P95).',
  ];

  return {
    startingCapital,
    finalBalance: Number(finalBalance.toFixed(2)),
    totalNetProfit: Number(totalNetProfit.toFixed(2)),
    totalGainPercent: Number(totalGainPercent.toFixed(2)),
    winCount,
    lossCount,
    expectancyR: Number(expectancyR.toFixed(2)),
    expectancyDollar: Number(expectancyDollar.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    maxDrawdownDollar: Number(maxDrawdownDollar.toFixed(2)),
    curve,
    monteCarlo: {
      runsCount: monteCarloRuns,
      medianFinalBalance: Number(medianFinalBalance.toFixed(2)),
      p95BestCase: Number(p95BestCase.toFixed(2)),
      p5WorstCase: Number(p5WorstCase.toFixed(2)),
      probabilityOfProfit: Number(probabilityOfProfit.toFixed(1)),
      averageMaxDrawdown: Number(avgMaxDd.toFixed(1)),
      samplePaths: samplePathsData,
    },
    assumptions,
  };
}
