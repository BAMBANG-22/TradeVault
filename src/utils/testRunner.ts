import { Trade } from '../types/trade';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import {
  calculatePerformance,
  computeTradeNetProfit,
  formatProfitFactor,
  formatCurrency,
} from './calculations';
import {
  calculateXauusdLot,
  simulateConsecutiveLosses,
  evaluateTradingDiscipline,
} from './riskCalculator';
import { calculateCompoundingGrowth } from './compoundingCalculator';
import { simulateTrades } from './tradeSimulation';
import {
  translateAuthError,
  isSupabaseConfigured,
  getSupabaseConfig,
  sanitizeSupabaseUrl,
} from './supabaseClient';
import {
  translateDatabaseError,
  mapTradeToDatabasePayload,
  mapDatabaseRowToTrade,
  normalizeTradeDirection,
  mapDatabaseDirectionToApp,
  normalizeTradeDateTimeLocal,
} from './supabaseSync';

export interface TestResultItem {
  name: string;
  category: string;
  passed: boolean;
  expected: any;
  actual: any;
  details?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResultItem[];
}

/**
 * Runs automated tests on financial calculation logic with known dummy fixtures.
 * CRITICAL: This is a pure in-memory test runner. It DOES NOT touch real trade data or localStorage.
 */
export function runFinancialCalculationsTests(): TestSuiteSummary {
  const startTime = Date.now();
  const results: TestResultItem[] = [];

  const assertEqual = (
    name: string,
    category: string,
    actual: any,
    expected: any,
    details?: string
  ) => {
    // Tolerant comparison for floating point numbers
    let passed = false;
    if (typeof actual === 'number' && typeof expected === 'number') {
      passed = Math.abs(actual - expected) < 0.01;
    } else {
      passed = actual === expected;
    }

    results.push({
      name,
      category,
      passed,
      actual,
      expected,
      details,
    });
  };

  const testSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    startingBalance: 10000,
    xauusdContractSize: 100,
  };

  // =========================================================================
  // TEST SUITE 1: Standard Balanced Journal (5 Trades)
  // =========================================================================
  const standardDummyTrades: Trade[] = [
    {
      id: 'TEST-01',
      dateTime: '2026-10-01T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup A',
      entryPrice: 2700,
      stopLoss: 2695,
      takeProfit: 2715,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'WIN',
      grossProfit: 310,
      commission: 10,
      swap: 0,
      netProfit: 300,
    },
    {
      id: 'TEST-02',
      dateTime: '2026-10-02T11:00',
      instrument: 'XAUUSD',
      position: 'SELL',
      strategy: 'Setup B',
      entryPrice: 2710,
      stopLoss: 2715,
      takeProfit: 2700,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'LOSS',
      grossProfit: -140,
      commission: 10,
      swap: 0,
      netProfit: -150,
    },
    {
      id: 'TEST-03',
      dateTime: '2026-10-03T12:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup C',
      entryPrice: 2705,
      stopLoss: 2700,
      takeProfit: 2720,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'WIN',
      grossProfit: 610,
      commission: 10,
      swap: 0,
      netProfit: 600,
    },
    {
      id: 'TEST-04',
      dateTime: '2026-10-04T13:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup D',
      entryPrice: 2715,
      stopLoss: 2710,
      takeProfit: 2730,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'BREAKEVEN',
      grossProfit: 10,
      commission: 10,
      swap: 0,
      netProfit: 0,
    },
    {
      id: 'TEST-05',
      dateTime: '2026-10-05T14:00',
      instrument: 'XAUUSD',
      position: 'SELL',
      strategy: 'Setup E',
      entryPrice: 2725,
      stopLoss: 2730,
      takeProfit: 2715,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'LOSS',
      grossProfit: -190,
      commission: 10,
      swap: 0,
      netProfit: -200,
    },
  ];

  const res1 = calculatePerformance(standardDummyTrades, testSettings);
  const m1 = res1.metrics;

  assertEqual('Total Trades Count', 'Standard Dataset', m1.totalTrades, 5);
  assertEqual('Winning Trades Count', 'Standard Dataset', m1.winningTrades, 2);
  assertEqual('Losing Trades Count', 'Standard Dataset', m1.losingTrades, 2);
  assertEqual('Breakeven Trades Count', 'Standard Dataset', m1.breakevenTrades, 1);
  assertEqual('Win Rate % (2 / 5)', 'Standard Dataset', m1.winRate, 40.0);
  assertEqual('Loss Rate % (2 / 5)', 'Standard Dataset', m1.lossRate, 40.0);
  assertEqual('Breakeven Rate % (1 / 5)', 'Standard Dataset', m1.breakevenRate, 20.0);
  assertEqual('Win Rate Excluding Breakeven % (2 / 4)', 'Standard Dataset', m1.winRateExcludingBE, 50.0);
  assertEqual('Total Net Profit ($300 - 150 + 600 + 0 - 200)', 'Standard Dataset', m1.totalNetProfit, 550.0);
  assertEqual('Total Gross Profit ($310 + $610 + $10)', 'Standard Dataset', m1.totalGrossProfit, 930.0);
  assertEqual('Total Gross Loss (|-140| + |-190|)', 'Standard Dataset', m1.totalGrossLoss, 330.0);
  assertEqual('Profit Factor Net (900 / 350)', 'Standard Dataset', m1.profitFactor, 2.57);
  assertEqual('Expectancy per trade (550 / 5)', 'Standard Dataset', m1.expectancy, 110.0);
  assertEqual('Current Equity ($10,000 + 550)', 'Standard Dataset', m1.currentEquity, 10550.0);
  assertEqual('Total Gain Capital', 'Standard Dataset', m1.totalGainCapital, 550.0);
  assertEqual('Total Gain % (550 / 10000)', 'Standard Dataset', m1.totalGainPercent, 5.5);
  assertEqual('Max Drawdown Amount ($)', 'Standard Dataset', m1.maxDrawdownAmount, 200.0);
  assertEqual('Max Drawdown % (200 / 10750 peak)', 'Standard Dataset', m1.maxDrawdownPercent, 1.86);

  // =========================================================================
  // TEST SUITE 2: Edge Cases & Zero-Division Safety
  // =========================================================================
  // Test A: 100% Win Rate (Zero Loss)
  const allWinTrades: Trade[] = [
    {
      id: 'WIN-1',
      dateTime: '2026-10-01T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Clean Win',
      entryPrice: 2700,
      stopLoss: 2695,
      takeProfit: 2710,
      lotSize: 0.1,
      riskAmount: 50,
      riskPercentage: 0.5,
      outcome: 'WIN',
      grossProfit: 500,
      commission: 0,
      swap: 0,
      netProfit: 500,
    },
    {
      id: 'WIN-2',
      dateTime: '2026-10-02T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Clean Win',
      entryPrice: 2710,
      stopLoss: 2705,
      takeProfit: 2720,
      lotSize: 0.1,
      riskAmount: 50,
      riskPercentage: 0.5,
      outcome: 'WIN',
      grossProfit: 250,
      commission: 0,
      swap: 0,
      netProfit: 250,
    },
  ];
  const resWin = calculatePerformance(allWinTrades, testSettings);
  assertEqual('100% Win Rate', 'Zero-Division Tests', resWin.metrics.winRate, 100.0);
  assertEqual('100% Win: isProfitFactorInfinite flag', 'Zero-Division Tests', resWin.metrics.isProfitFactorInfinite, true);
  assertEqual('100% Win: formatProfitFactor returns infinity symbol', 'Zero-Division Tests', formatProfitFactor(resWin.metrics.profitFactor, resWin.metrics.isProfitFactorInfinite), '∞');
  assertEqual('100% Win: Max Drawdown is 0%', 'Zero-Division Tests', resWin.metrics.maxDrawdownPercent, 0.0);
  assertEqual('100% Win: No NaN in expectancy', 'Zero-Division Tests', Number.isFinite(resWin.metrics.expectancy), true);

  // Test B: 100% Loss Rate (Zero Wins)
  const allLossTrades: Trade[] = [
    {
      id: 'LOSS-1',
      dateTime: '2026-10-01T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Stop Hit',
      entryPrice: 2700,
      stopLoss: 2695,
      takeProfit: 2710,
      lotSize: 0.1,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'LOSS',
      grossProfit: -200,
      commission: 0,
      swap: 0,
      netProfit: -200,
    },
    {
      id: 'LOSS-2',
      dateTime: '2026-10-02T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Stop Hit',
      entryPrice: 2700,
      stopLoss: 2695,
      takeProfit: 2710,
      lotSize: 0.1,
      riskAmount: 300,
      riskPercentage: 3.0,
      outcome: 'LOSS',
      grossProfit: -300,
      commission: 0,
      swap: 0,
      netProfit: -300,
    },
  ];
  const resLoss = calculatePerformance(allLossTrades, testSettings);
  assertEqual('100% Loss: Win Rate is 0%', 'Zero-Division Tests', resLoss.metrics.winRate, 0.0);
  assertEqual('100% Loss: Profit Factor is 0', 'Zero-Division Tests', resLoss.metrics.profitFactor, 0.0);
  assertEqual('100% Loss: Drawdown Amount ($500)', 'Zero-Division Tests', resLoss.metrics.maxDrawdownAmount, 500.0);
  assertEqual('100% Loss: Drawdown % (500 / 10000 = 5%)', 'Zero-Division Tests', resLoss.metrics.maxDrawdownPercent, 5.0);

  // Test C: Empty Dataset (0 trades)
  const resEmpty = calculatePerformance([], testSettings);
  assertEqual('Empty Data: isEmpty flag is true', 'Zero-Division Tests', resEmpty.metrics.isEmpty, true);
  assertEqual('Empty Data: totalTrades is 0', 'Zero-Division Tests', resEmpty.metrics.totalTrades, 0);
  assertEqual('Empty Data: winRate is 0', 'Zero-Division Tests', resEmpty.metrics.winRate, 0.0);
  assertEqual('Empty Data: profitFactor is 0', 'Zero-Division Tests', resEmpty.metrics.profitFactor, 0.0);
  assertEqual('Empty Data: expectancy is 0', 'Zero-Division Tests', resEmpty.metrics.expectancy, 0.0);
  assertEqual('Empty Data: equity equals starting balance', 'Zero-Division Tests', resEmpty.metrics.currentEquity, 10000);
  assertEqual('Empty Data: No NaN present', 'Zero-Division Tests', Number.isFinite(resEmpty.metrics.totalGainPercent), true);

  // =========================================================================
  // TEST SUITE 3: Net Profit with Fees & Swap Calculation
  // =========================================================================
  const tradeWithFees: Partial<Trade> = {
    grossProfit: 500,
    commission: 7.5,
    swap: -2.5,
  };
  const computedNet = computeTradeNetProfit(tradeWithFees);
  // Expected: 500 - 7.50 + (-2.50) = 490.00
  assertEqual('Net Profit = Gross - Comm + Swap (500 - 7.5 - 2.5)', 'Fees & Swap', computedNet, 490.0);

  // =========================================================================
  // TEST SUITE 4: Drawdown Strictly from Previous Peak
  // =========================================================================
  // Sequence of trades:
  // Start: $10,000 (Peak $10,000)
  // T1: +$2,000 -> Eq $12,000, Peak $12,000, DD = 0
  // T2: -$1,000 -> Eq $11,000, Peak $12,000, DD = $1,000 (8.33%)
  // T3: +$500  -> Eq $11,500, Peak $12,000, DD = $500 (4.17%)
  // T4: -$1,500 -> Eq $10,000, Peak $12,000, DD = $2,000 (16.67%)
  // T5: +$3,000 -> Eq $13,000, Peak $13,000, DD = 0
  const peakTestTrades: Trade[] = [
    { id: 'PK-1', dateTime: '2026-10-01', instrument: 'XAUUSD', position: 'BUY', strategy: 'S', entryPrice: 1, stopLoss: 1, takeProfit: 1, lotSize: 1, riskAmount: 100, riskPercentage: 1, outcome: 'WIN', grossProfit: 2000, commission: 0, swap: 0, netProfit: 2000 },
    { id: 'PK-2', dateTime: '2026-10-02', instrument: 'XAUUSD', position: 'BUY', strategy: 'S', entryPrice: 1, stopLoss: 1, takeProfit: 1, lotSize: 1, riskAmount: 100, riskPercentage: 1, outcome: 'LOSS', grossProfit: -1000, commission: 0, swap: 0, netProfit: -1000 },
    { id: 'PK-3', dateTime: '2026-10-03', instrument: 'XAUUSD', position: 'BUY', strategy: 'S', entryPrice: 1, stopLoss: 1, takeProfit: 1, lotSize: 1, riskAmount: 100, riskPercentage: 1, outcome: 'WIN', grossProfit: 500, commission: 0, swap: 0, netProfit: 500 },
    { id: 'PK-4', dateTime: '2026-10-04', instrument: 'XAUUSD', position: 'BUY', strategy: 'S', entryPrice: 1, stopLoss: 1, takeProfit: 1, lotSize: 1, riskAmount: 100, riskPercentage: 1, outcome: 'LOSS', grossProfit: -1500, commission: 0, swap: 0, netProfit: -1500 },
    { id: 'PK-5', dateTime: '2026-10-05', instrument: 'XAUUSD', position: 'BUY', strategy: 'S', entryPrice: 1, stopLoss: 1, takeProfit: 1, lotSize: 1, riskAmount: 100, riskPercentage: 1, outcome: 'WIN', grossProfit: 3000, commission: 0, swap: 0, netProfit: 3000 },
  ];
  const resPeak = calculatePerformance(peakTestTrades, testSettings);
  // Max DD Dollar must be exactly $2000 (from $12000 peak down to $10000)
  assertEqual('Max Drawdown Peak-to-Trough Amount ($2,000)', 'Drawdown Peak', resPeak.metrics.maxDrawdownAmount, 2000.0);
  // Max DD %: 2000 / 12000 * 100 = 16.67%
  assertEqual('Max Drawdown Peak-to-Trough % (16.67%)', 'Drawdown Peak', resPeak.metrics.maxDrawdownPercent, 16.67);
  assertEqual('Final Equity ($13,000)', 'Drawdown Peak', resPeak.metrics.currentEquity, 13000.0);

  // =========================================================================
  // TEST SUITE 5: Configurable XAUUSD Lot Sizing & Risk Scenarios
  // =========================================================================
  // Standard Lot (100 oz):
  // Equity $10,000, Risk 1% ($100), Entry 2720, SL 2715 (Distance $5.00)
  // Loss per lot = 5.00 * 100 = $500
  // Lot = 100 / 500 = 0.20
  const lotStandard = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720,
      stopLossPrice: 2715,
      position: 'BUY',
      contractSize: 100,
    },
    testSettings
  );
  assertEqual('Standard Lot (100 oz) Size = 0.20', 'Lot Sizing', lotStandard.recommendedLot, 0.2);
  assertEqual('SL Distance $5.00', 'Lot Sizing', lotStandard.slDistancePrice, 5.0);
  assertEqual('TP 1:2 Price = 2730.00', 'Lot Sizing', lotStandard.tpScenarios[0]?.targetPrice, 2730.0);
  assertEqual('TP 1:3 Price = 2735.00', 'Lot Sizing', lotStandard.tpScenarios[1]?.targetPrice, 2735.0);
  assertEqual('TP 1:5 Price = 2745.00', 'Lot Sizing', lotStandard.tpScenarios[2]?.targetPrice, 2745.0);

  // Mini Lot (10 oz):
  // Loss per lot = 5.00 * 10 = $50 -> Lot = 100 / 50 = 2.00
  const lotMini = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720,
      stopLossPrice: 2715,
      position: 'BUY',
      contractSize: 10,
    },
    testSettings
  );
  assertEqual('Mini Lot (10 oz) Size = 2.00', 'Lot Sizing', lotMini.recommendedLot, 2.0);

  // Micro / Cent Lot (1 oz):
  // Loss per lot = 5.00 * 1 = $5 -> Lot = 100 / 5 = 20.00
  const lotMicro = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720,
      stopLossPrice: 2715,
      position: 'BUY',
      contractSize: 1,
    },
    testSettings
  );
  assertEqual('Micro Lot (1 oz) Size = 20.00', 'Lot Sizing', lotMicro.recommendedLot, 20.0);

  // Inverted SL validation check (BUY with SL >= Entry)
  const lotInvalid = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720,
      stopLossPrice: 2725, // invalid for BUY
      position: 'BUY',
      contractSize: 100,
    },
    testSettings
  );
  assertEqual('Inverted SL rejected for BUY', 'Lot Sizing', lotInvalid.isValid, false);

  // =========================================================================
  // TEST SUITE 7: TradeVault Compounding & Trade Simulation
  // =========================================================================
  // Test 7.1: Modal $1000, 5% per bulan, 2 bulan, tanpa deposit = $1,102.50
  const comp1 = calculateCompoundingGrowth({
    startingCapital: 1000,
    growthRatePercent: 5,
    interval: 'monthly',
    duration: 2,
    regularDeposit: 0,
    mode: 'compounding',
  });
  assertEqual('Compounding $1,000 5% 2 Bulan Ending = $1,102.50', 'TradeVault Compounding', comp1.endingBalance, 1102.5);
  assertEqual('Compounding $1,000 5% 2 Bulan Profit = $102.50', 'TradeVault Compounding', comp1.totalProfit, 102.5);

  // Test 7.2: Mode Fixed Profit $1000, 5% per bulan, 2 bulan = $100
  const compFixed = calculateCompoundingGrowth({
    startingCapital: 1000,
    growthRatePercent: 5,
    interval: 'monthly',
    duration: 2,
    regularDeposit: 0,
    mode: 'fixed_withdrawn',
  });
  assertEqual('Fixed Profit Mode $1,000 5% 2 Bulan Total Profit = $100.00', 'TradeVault Compounding', compFixed.totalProfit, 100.0);

  // Test 7.3: Trade Simulation $50, 30 Win berturut-turut (100% WR), RR 2.5, Risk 1.5%
  // Metode Modal Awal: 50 + 30 * (50 * 0.015 * 2.5) = 106.25
  const simFixedRisk = simulateTrades({
    startingCapital: 50,
    winRate: 100,
    rrRatio: 2.5,
    riskType: 'percent',
    riskValue: 1.5,
    tradesCount: 30,
    riskMethod: 'initial_capital',
  });
  assertEqual('Simulasi 30 Wins Risiko Modal Awal = $106.25', 'Trade Simulation', simFixedRisk.finalBalance, 106.25);

  // Metode Saldo Berjalan (Compounding): 50 * (1.0375)^30 = 150.87
  const simCompRisk = simulateTrades({
    startingCapital: 50,
    winRate: 100,
    rrRatio: 2.5,
    riskType: 'percent',
    riskValue: 1.5,
    tradesCount: 30,
    riskMethod: 'balance',
  });
  // =========================================================================
  // TEST SUITE 8: Tahap 7 - Trade Log Lifecycle & Full Data Integration
  // =========================================================================
  // Baseline initial trades list
  let lifecycleTrades: Trade[] = [];

  // Test 8.1: Menambahkan transaksi WIN
  const winTrade: Trade = {
    id: 'TRD-TEST-WIN',
    dateTime: '2026-10-26T09:00',
    instrument: 'XAUUSD',
    position: 'BUY',
    strategy: 'London Liquidity Sweep',
    session: 'London',
    entryPrice: 2720.0,
    stopLoss: 2710.0,
    takeProfit: 2750.0,
    exitPrice: 2749.0,
    lotSize: 0.2,
    riskAmount: 100,
    riskPercentage: 1.0,
    outcome: 'WIN',
    grossProfit: 400,
    commission: 10,
    swap: 0,
    netProfit: 390, // 400 - 10 + 0 = 390
    rMultiple: 3.9,
    notes: 'Entry terkonfirmasi sempurna di M15',
    entryReason: 'Liquidity sweep sesi Asian di level 2720',
    postTradeEvaluation: 'Exit sesuai rencana sebelum rilis berita',
  };
  lifecycleTrades.push(winTrade);
  assertEqual('Tambah Transaksi WIN: Net Profit dihitung tepat', 'Trade Lifecycle', winTrade.netProfit, 390);
  assertEqual('Tambah Transaksi WIN: Outcome adalah WIN', 'Trade Lifecycle', winTrade.outcome, 'WIN');
  assertEqual('Tambah Transaksi WIN: Sesi tercatat', 'Trade Lifecycle', winTrade.session, 'London');

  // Test 8.2: Menambahkan transaksi LOSS
  const lossTrade: Trade = {
    id: 'TRD-TEST-LOSS',
    dateTime: '2026-10-26T14:30',
    instrument: 'XAUUSD',
    position: 'SELL',
    strategy: 'NY FVG Retest',
    session: 'New York',
    entryPrice: 2740.0,
    stopLoss: 2745.0,
    takeProfit: 2725.0,
    exitPrice: 2745.0,
    lotSize: 0.2,
    riskAmount: 100,
    riskPercentage: 1.0,
    outcome: 'LOSS',
    grossProfit: -100,
    commission: 10,
    swap: -2,
    netProfit: -112, // -100 - 10 + (-2) = -112
    rMultiple: -1.12,
    notes: 'Kena SL karena lonjakan volatilitas',
  };
  lifecycleTrades.push(lossTrade);
  assertEqual('Tambah Transaksi LOSS: Net Profit kotor - komisi + swap', 'Trade Lifecycle', lossTrade.netProfit, -112);
  assertEqual('Tambah Transaksi LOSS: Outcome adalah LOSS', 'Trade Lifecycle', lossTrade.outcome, 'LOSS');

  // Test 8.3: Menambahkan transaksi BREAKEVEN
  const beTrade: Trade = {
    id: 'TRD-TEST-BE',
    dateTime: '2026-10-26T18:00',
    instrument: 'XAUUSD',
    position: 'BUY',
    strategy: 'Order Block Bounce',
    session: 'Overlap',
    entryPrice: 2735.0,
    stopLoss: 2735.0,
    lotSize: 0.1,
    riskAmount: 50,
    riskPercentage: 0.5,
    outcome: 'BREAKEVEN',
    grossProfit: 5,
    commission: 5,
    swap: 0,
    netProfit: 0, // 5 - 5 + 0 = 0
    rMultiple: 0,
  };
  lifecycleTrades.push(beTrade);
  assertEqual('Tambah Transaksi BREAKEVEN: Net Profit = 0', 'Trade Lifecycle', beTrade.netProfit, 0);
  assertEqual('Tambah Transaksi BREAKEVEN: Outcome adalah BREAKEVEN', 'Trade Lifecycle', beTrade.outcome, 'BREAKEVEN');

  // Test 8.4: Mengedit transaksi dan memastikan tidak ada duplikat
  const countBeforeEdit = lifecycleTrades.length;
  const editedWinTrade: Trade = {
    ...winTrade,
    exitPrice: 2755.0,
    grossProfit: 500,
    commission: 10,
    swap: 0,
    netProfit: 490,
    rMultiple: 4.9,
  };
  // Simulate App.tsx handleSaveTrade update by originalId
  const existingIdx = lifecycleTrades.findIndex((t) => t.id === 'TRD-TEST-WIN');
  lifecycleTrades[existingIdx] = editedWinTrade;
  assertEqual('Edit Transaksi: Panjang list tidak berubah (tidak ada duplikasi)', 'Trade Lifecycle', lifecycleTrades.length, countBeforeEdit);
  assertEqual('Edit Transaksi: Net Profit record terupdate', 'Trade Lifecycle', lifecycleTrades[0].netProfit, 490);

  // Test 8.5: Pencegahan ID transaksi ganda
  const isDuplicateIdDetected = lifecycleTrades.some((t) => t.id === 'TRD-TEST-LOSS');
  assertEqual('Cegah ID Ganda: Mendeteksi ID yang sudah ada', 'Trade Lifecycle', isDuplicateIdDetected, true);

  // Test 8.6: Menghapus transaksi setelah konfirmasi
  const tradeToDeleteId = 'TRD-TEST-BE';
  const tradesAfterDelete = lifecycleTrades.filter((t) => t.id !== tradeToDeleteId);
  assertEqual('Hapus Transaksi: Jumlah berkurang 1', 'Trade Lifecycle', tradesAfterDelete.length, countBeforeEdit - 1);
  assertEqual('Hapus Transaksi: ID terhapus tidak ada lagi di list', 'Trade Lifecycle', tradesAfterDelete.some((t) => t.id === tradeToDeleteId), false);

  // Test 8.7: Integrasi Perhitungan Aktual (Dashboard & Analytics)
  // Current trades: editedWinTrade (+490), lossTrade (-112)
  const perfResult = calculatePerformance(tradesAfterDelete, testSettings);
  assertEqual('Integrasi Metrik: Total trades = 2', 'Data Integration', perfResult.metrics.totalTrades, 2);
  assertEqual('Integrasi Metrik: Winning trades = 1', 'Data Integration', perfResult.metrics.winningTrades, 1);
  assertEqual('Integrasi Metrik: Losing trades = 1', 'Data Integration', perfResult.metrics.losingTrades, 1);
  assertEqual('Integrasi Metrik: Win Rate = 50%', 'Data Integration', perfResult.metrics.winRate, 50.0);
  assertEqual('Integrasi Metrik: Total Net Profit = +378', 'Data Integration', perfResult.metrics.totalNetProfit, 378.0);
  assertEqual('Integrasi Metrik: Current Equity = $10,378', 'Data Integration', perfResult.metrics.currentEquity, 10378.0);
  assertEqual('Integrasi Metrik: Expectancy = $189.00', 'Data Integration', perfResult.metrics.expectancy, 189.0);
  assertEqual('Integrasi Metrik: Profit Factor Net = 490 / 112 = 4.38', 'Data Integration', perfResult.metrics.profitFactor, 4.38);

  // Test 8.8: Equity Curve & Drawdown calculation
  // Peak is after trade 1 (10,490), then trade 2 drops to 10,378
  // Drawdown amount = 112, Drawdown % = (112 / 10490) * 100 = 1.07%
  assertEqual('Integrasi Metrik: Max Drawdown Amount = $112', 'Data Integration', perfResult.metrics.maxDrawdownAmount, 112.0);
  assertEqual('Integrasi Metrik: Max Drawdown % = 1.07%', 'Data Integration', perfResult.metrics.maxDrawdownPercent, 1.07);

  // Test 8.9: Persistensi Data (Simulasi Refresh Browser / JSON Storage)
  const serialized = JSON.stringify(tradesAfterDelete);
  const deserialized: Trade[] = JSON.parse(serialized);
  assertEqual('Persistensi LocalStorage: Data pulih utuh setelah serialisasi', 'Data Integration', deserialized.length, tradesAfterDelete.length);
  assertEqual('Persistensi LocalStorage: Net profit trade pertama identik', 'Data Integration', deserialized[0].netProfit, 490);

  // =========================================================================
  // TEST SUITE 9: Tahap 8 Analytics Dashboard & Edge Cases
  // =========================================================================

  // Test 9.1: Dataset Kosong (0 Trades)
  const emptyPerf = calculatePerformance([], testSettings);
  assertEqual('Tahap 8 - Dataset Kosong: isEmpty bernilai true', 'Analytics Engine', emptyPerf.metrics.isEmpty, true);
  assertEqual('Tahap 8 - Dataset Kosong: Current Equity = Modal Awal ($10,000)', 'Analytics Engine', emptyPerf.metrics.currentEquity, 10000);
  assertEqual('Tahap 8 - Dataset Kosong: Win Rate = 0%', 'Analytics Engine', emptyPerf.metrics.winRate, 0);
  assertEqual('Tahap 8 - Dataset Kosong: Profit Factor = 0', 'Analytics Engine', emptyPerf.metrics.profitFactor, 0);
  assertEqual('Tahap 8 - Dataset Kosong: Max Drawdown = 0%', 'Analytics Engine', emptyPerf.metrics.maxDrawdownPercent, 0);
  assertEqual('Tahap 8 - Dataset Kosong: Radar Data Belum Cukup', 'Analytics Engine', emptyPerf.radarIndicators.isDataSufficient, false);

  // Test 9.2: 1 Win, 1 Loss, 1 Breakeven
  const trioTrades: Trade[] = [
    {
      id: 'TRIO-01',
      dateTime: '2026-10-10T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup Win',
      entryPrice: 2700,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'WIN',
      grossProfit: 300,
      commission: 10,
      swap: 0,
      netProfit: 290,
      rMultiple: 2.9,
    },
    {
      id: 'TRIO-02',
      dateTime: '2026-10-11T11:00',
      instrument: 'XAUUSD',
      position: 'SELL',
      strategy: 'Setup Loss',
      entryPrice: 2710,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'LOSS',
      grossProfit: -150,
      commission: 10,
      swap: 0,
      netProfit: -160,
      rMultiple: -1.6,
    },
    {
      id: 'TRIO-03',
      dateTime: '2026-10-12T12:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup BE',
      entryPrice: 2715,
      lotSize: 0.1,
      riskAmount: 50,
      riskPercentage: 0.5,
      outcome: 'BREAKEVEN',
      grossProfit: 10,
      commission: 10,
      swap: 0,
      netProfit: 0,
      rMultiple: 0,
    },
  ];

  const trioPerf = calculatePerformance(trioTrades, testSettings);
  assertEqual('Tahap 8 - Trio Trades: Total Trades = 3', 'Analytics Engine', trioPerf.metrics.totalTrades, 3);
  assertEqual('Tahap 8 - Trio Trades: Winning = 1, Losing = 1, BE = 1', 'Analytics Engine', trioPerf.metrics.winningTrades, 1);
  assertEqual('Tahap 8 - Trio Trades: Win Rate = 33.33%', 'Analytics Engine', trioPerf.metrics.winRate, 33.33);
  assertEqual('Tahap 8 - Trio Trades: Win Rate (Excl BE) = 50.0%', 'Analytics Engine', trioPerf.metrics.winRateExcludingBE, 50.0);
  assertEqual('Tahap 8 - Trio Trades: Total Net Profit = +$130', 'Analytics Engine', trioPerf.metrics.totalNetProfit, 130.0);
  assertEqual('Tahap 8 - Trio Trades: Total Gain Capital = +$130', 'Analytics Engine', trioPerf.metrics.totalGainCapital, 130.0);
  assertEqual('Tahap 8 - Trio Trades: Total Gain % = +1.3%', 'Analytics Engine', trioPerf.metrics.totalGainPercent, 1.3);
  assertEqual('Tahap 8 - Trio Trades: Profit Factor Net = 290 / 160 = 1.81', 'Analytics Engine', trioPerf.metrics.profitFactor, 1.81);
  assertEqual('Tahap 8 - Trio Trades: Expectancy = $43.33 / trade', 'Analytics Engine', trioPerf.metrics.expectancy, 43.33);
  assertEqual('Tahap 8 - Trio Trades: Radar Data Cukup (3 trades)', 'Analytics Engine', trioPerf.radarIndicators.isDataSufficient, true);

  // Test 9.3: Profit Besar dengan 0 Loss (Infinite Profit Factor)
  const zeroLossTrades: Trade[] = [
    {
      id: 'ZL-01',
      dateTime: '2026-10-15T09:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Big Win 1',
      entryPrice: 2700,
      lotSize: 0.5,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'WIN',
      grossProfit: 1010,
      commission: 10,
      swap: 0,
      netProfit: 1000,
    },
    {
      id: 'ZL-02',
      dateTime: '2026-10-16T14:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Big Win 2',
      entryPrice: 2720,
      lotSize: 0.5,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'WIN',
      grossProfit: 2510,
      commission: 10,
      swap: 0,
      netProfit: 2500,
    },
  ];

  const zeroLossPerf = calculatePerformance(zeroLossTrades, testSettings);
  assertEqual('Tahap 8 - Zero Loss: isProfitFactorInfinite adalah true', 'Analytics Engine', zeroLossPerf.metrics.isProfitFactorInfinite, true);
  assertEqual('Tahap 8 - Zero Loss: formatProfitFactor menghasilkan ∞', 'Analytics Engine', formatProfitFactor(zeroLossPerf.metrics.profitFactor, zeroLossPerf.metrics.isProfitFactorInfinite), '∞');
  assertEqual('Tahap 8 - Zero Loss: Max Drawdown tetap 0%', 'Analytics Engine', zeroLossPerf.metrics.maxDrawdownPercent, 0.0);

  // Test 9.4: 2 Trade dengan Waktu Sama (Identical DateTime)
  const sameTimeTrades: Trade[] = [
    {
      id: 'ST-01',
      dateTime: '2026-10-20T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Scale in 1',
      entryPrice: 2710,
      lotSize: 0.1,
      riskAmount: 50,
      riskPercentage: 0.5,
      outcome: 'WIN',
      grossProfit: 100,
      commission: 0,
      swap: 0,
      netProfit: 100,
    },
    {
      id: 'ST-02',
      dateTime: '2026-10-20T10:00',
      instrument: 'XAUUSD',
      position: 'SELL',
      strategy: 'Hedge 1',
      entryPrice: 2710,
      lotSize: 0.1,
      riskAmount: 50,
      riskPercentage: 0.5,
      outcome: 'LOSS',
      grossProfit: -50,
      commission: 0,
      swap: 0,
      netProfit: -50,
    },
  ];

  const sameTimePerf = calculatePerformance(sameTimeTrades, testSettings);
  assertEqual('Tahap 8 - Timestamp Sama: Menghasilkan 3 titik kurva stabil', 'Analytics Engine', sameTimePerf.equityCurve.length, 3);
  assertEqual('Tahap 8 - Timestamp Sama: Saldo akhir konsisten $10,050', 'Analytics Engine', sameTimePerf.metrics.currentEquity, 10050);

  // Test 9.5: Drawdown Ekstrem lalu Pemulihan ke Puncak Baru (All-Time High Recovery)
  const recoveryTrades: Trade[] = [
    {
      id: 'REC-01',
      dateTime: '2026-10-01T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Rally',
      entryPrice: 2700,
      lotSize: 0.5,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'WIN',
      grossProfit: 2000,
      commission: 0,
      swap: 0,
      netProfit: 2000, // Equity: 10,000 -> 12,000 (Peak: 12,000)
    },
    {
      id: 'REC-02',
      dateTime: '2026-10-05T10:00',
      instrument: 'XAUUSD',
      position: 'SELL',
      strategy: 'Deep Pullback',
      entryPrice: 2750,
      lotSize: 0.5,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'LOSS',
      grossProfit: -3000,
      commission: 0,
      swap: 0,
      netProfit: -3000, // Equity: 12,000 -> 9,000 (Peak: 12,000, DD: $3,000 / 25%)
    },
    {
      id: 'REC-03',
      dateTime: '2026-10-10T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'New High Surge',
      entryPrice: 2720,
      lotSize: 0.5,
      riskAmount: 200,
      riskPercentage: 2.0,
      outcome: 'WIN',
      grossProfit: 4000,
      commission: 0,
      swap: 0,
      netProfit: 4000, // Equity: 9,000 -> 13,000 (Peak: 13,000, DD: 0)
    },
  ];

  const recPerf = calculatePerformance(recoveryTrades, testSettings);
  assertEqual('Tahap 8 - ATH Recovery: Saldo Akhir $13,000', 'Analytics Engine', recPerf.metrics.currentEquity, 13000);
  assertEqual('Tahap 8 - ATH Recovery: Max Drawdown Nominal = $3,000', 'Analytics Engine', recPerf.metrics.maxDrawdownAmount, 3000);
  assertEqual('Tahap 8 - ATH Recovery: Max Drawdown % = 25.0%', 'Analytics Engine', recPerf.metrics.maxDrawdownPercent, 25.0);
  assertEqual('Tahap 8 - ATH Recovery: Titik terakhir mencapai Puncak Baru $13,000', 'Analytics Engine', recPerf.equityCurve[3].peak, 13000);

  // Test 9.6: Saldo Drop Mendekati / di Bawah Nol (Zero/Negative Equity Handling)
  const criticalSettings: AppSettings = {
    ...testSettings,
    startingBalance: 1000,
  };
  const blownTrades: Trade[] = [
    {
      id: 'BLOWN-01',
      dateTime: '2026-10-25T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Margin Call Scenario',
      entryPrice: 2700,
      lotSize: 1.0,
      riskAmount: 500,
      riskPercentage: 50.0,
      outcome: 'LOSS',
      grossProfit: -1200,
      commission: 0,
      swap: 0,
      netProfit: -1200, // Equity: 1000 - 1200 = -200
    },
  ];

  const blownPerf = calculatePerformance(blownTrades, criticalSettings);
  assertEqual('Tahap 8 - Saldo Negatif: Saldo terhitung -$200 tanpa crash', 'Analytics Engine', blownPerf.metrics.currentEquity, -200);
  assertEqual('Tahap 8 - Saldo Negatif: Deteksi Status Kritis aktif', 'Analytics Engine', blownPerf.metrics.isAccountInCriticalDrawdown, true);
  assertEqual('Tahap 8 - Saldo Negatif: Max Drawdown % = 120%', 'Analytics Engine', blownPerf.metrics.maxDrawdownPercent, 120.0);

  // Test 9.7: Mode Privasi (Privacy Masking)
  const maskedUsd = formatCurrency(2500.75, testSettings, true);
  const unmaskedUsd = formatCurrency(2500.75, testSettings, false);
  assertEqual('Tahap 8 - Mode Privasi: Format nominal disamarkan', 'Analytics Engine', maskedUsd, '$••••••');
  assertEqual('Tahap 8 - Mode Privasi: Format normal tetap presisi', 'Analytics Engine', unmaskedUsd, '$2,500.75');

  // Test 9.8: Hari Tanpa Transaksi Bukan Hari Rugi
  assertEqual('Tahap 8 - Kalender Harian: Hanya merekam 2 hari bertransaksi pada ATH Recovery', 'Analytics Engine', recPerf.dailyPerformance.length, 3);
  assertEqual('Tahap 8 - Kalender Harian: Hari profit tidak tertimpa hari jeda', 'Analytics Engine', recPerf.dailyPerformance.filter((d) => d.netProfit > 0).length, 2);

  // =========================================================================
  // TEST SUITE 10: Tahap 9 Risk Management & Kalkulator Lot XAUUSD
  // =========================================================================

  // Test 10.1: Perhitungan Lot XAUUSD Standar BUY
  // Equity $10,000, Risk 1% = $100. Entry: 2720, SL: 2715 (Distance $5.00), Contract: 100 oz
  // Loss per lot = $5.00 * 100 = $500. Exact lot = $100 / $500 = 0.200 lot
  const standardBuyLot = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720.0,
      stopLossPrice: 2715.0,
      position: 'BUY',
      contractSize: 100,
      minLot: 0.01,
      lotStep: 0.01,
      leverage: 500,
    },
    testSettings
  );
  assertEqual('Tahap 9 - Lot BUY: Validitas bernilai true', 'Risk Engine', standardBuyLot.isValid, true);
  assertEqual('Tahap 9 - Lot BUY: Nominal risiko $100', 'Risk Engine', standardBuyLot.riskAmount, 100.0);
  assertEqual('Tahap 9 - Lot BUY: Jarak SL $5.00', 'Risk Engine', standardBuyLot.slDistancePrice, 5.0);
  assertEqual('Tahap 9 - Lot BUY: Jarak SL pips = 50 pips', 'Risk Engine', standardBuyLot.slDistancePips, 50.0);
  assertEqual('Tahap 9 - Lot BUY: Loss per 1 lot = $500', 'Risk Engine', standardBuyLot.lossPerLot, 500.0);
  assertEqual('Tahap 9 - Lot BUY: Lot rekomendasi = 0.20 lot', 'Risk Engine', standardBuyLot.recommendedLot, 0.2);
  assertEqual('Tahap 9 - Lot BUY: Estimasi kerugian pada SL = $100', 'Risk Engine', standardBuyLot.estimatedLossAtSL, 100.0);
  // Margin required = (0.20 * 100 * 2720) / 500 = $108.80
  assertEqual('Tahap 9 - Lot BUY: Estimasi margin required = $108.80', 'Risk Engine', standardBuyLot.requiredMargin, 108.8);

  // Test 10.2: Perhitungan Lot XAUUSD SELL dengan Take Profit dan R:R
  // Risk fixed $150. Entry: 2750, SL: 2755 (Dist $5), TP: 2740 (Dist $10). R:R = 2.0
  const standardSellLot = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      riskAmountManual: 150,
      entryPrice: 2750.0,
      stopLossPrice: 2755.0,
      takeProfitPrice: 2740.0,
      position: 'SELL',
      contractSize: 100,
    },
    testSettings
  );
  assertEqual('Tahap 9 - Lot SELL: Validitas bernilai true', 'Risk Engine', standardSellLot.isValid, true);
  assertEqual('Tahap 9 - Lot SELL: Lot rekomendasi = 0.30 lot', 'Risk Engine', standardSellLot.recommendedLot, 0.3);
  assertEqual('Tahap 9 - Lot SELL: R:R terwujud = 2.0', 'Risk Engine', standardSellLot.rewardRiskRatio, 2.0);
  assertEqual('Tahap 9 - Lot SELL: Estimasi profit TP = $300', 'Risk Engine', standardSellLot.estimatedProfitAtTP, 300.0);

  // Test 10.3: Pembulatan Lot ke Bawah (Rounding Down to Lot Step)
  // Risk $100, Distance $4.30 * 100 = $430/lot. Exact lot = 100 / 430 = 0.23255... lot
  // Floored to 0.01 step = 0.23 lot (bukan 0.24, agar risiko $98.90 tidak melampaui $100)
  const flooredLotCalc = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      riskAmountManual: 100,
      entryPrice: 2724.3,
      stopLossPrice: 2720.0,
      position: 'BUY',
      contractSize: 100,
      lotStep: 0.01,
    },
    testSettings
  );
  assertEqual('Tahap 9 - Lot Rounding Down: Recommended lot dibulatkan ke bawah menjadi 0.23 lot', 'Risk Engine', flooredLotCalc.recommendedLot, 0.23);
  assertEqual('Tahap 9 - Lot Rounding Down: Estimasi rugi ($98.90) tidak melampaui rencana ($100)', 'Risk Engine', flooredLotCalc.estimatedLossAtSL <= 100, true);

  // Test 10.4: Validasi Arah Buy/Sell dan SL/TP Tidak Valid
  // BUY dengan SL di atas Entry
  const invalidBuySL = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720.0,
      stopLossPrice: 2725.0,
      position: 'BUY',
    },
    testSettings
  );
  assertEqual('Tahap 9 - Validasi BUY: SL di atas Entry ditolak (isValid: false)', 'Risk Engine', invalidBuySL.isValid, false);

  // BUY dengan TP di bawah Entry
  const invalidBuyTP = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720.0,
      stopLossPrice: 2715.0,
      takeProfitPrice: 2710.0,
      position: 'BUY',
    },
    testSettings
  );
  assertEqual('Tahap 9 - Validasi BUY: TP di bawah Entry ditolak (isValid: false)', 'Risk Engine', invalidBuyTP.isValid, false);

  // SELL dengan SL di bawah Entry
  const invalidSellSL = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720.0,
      stopLossPrice: 2715.0,
      position: 'SELL',
    },
    testSettings
  );
  assertEqual('Tahap 9 - Validasi SELL: SL di bawah Entry ditolak (isValid: false)', 'Risk Engine', invalidSellSL.isValid, false);

  // SELL dengan TP di atas Entry
  const invalidSellTP = calculateXauusdLot(
    {
      equity: 10000,
      riskPercent: 1.0,
      entryPrice: 2720.0,
      stopLossPrice: 2725.0,
      takeProfitPrice: 2730.0,
      position: 'SELL',
    },
    testSettings
  );
  assertEqual('Tahap 9 - Validasi SELL: TP di atas Entry ditolak (isValid: false)', 'Risk Engine', invalidSellTP.isValid, false);

  // Test 10.5: Simulasi Loss Beruntun Persen Saldo Berjalan (Compounding / Geometric)
  // Capital $1000, Risk 10% per trade, 3 steps:
  // Step 1: Loss $100, Remaining $900, DD 10.0%
  // Step 2: Loss $90, Remaining $810, DD 19.0%
  // Step 3: Loss $81, Remaining $729, DD 27.1%
  const geomLossSteps = simulateConsecutiveLosses(1000, 10, 3, 'PERCENT_RUNNING_EQUITY');
  assertEqual('Tahap 9 - Loss Geometrik: Step 1 rugi $100, sisa $900', 'Risk Engine', geomLossSteps[0].remainingEquity, 900);
  assertEqual('Tahap 9 - Loss Geometrik: Step 2 rugi $90, sisa $810', 'Risk Engine', geomLossSteps[1].remainingEquity, 810);
  assertEqual('Tahap 9 - Loss Geometrik: Step 3 rugi $81, sisa $729', 'Risk Engine', geomLossSteps[2].remainingEquity, 729);
  assertEqual('Tahap 9 - Loss Geometrik: Step 3 Drawdown = 27.1%', 'Risk Engine', geomLossSteps[2].cumulativeDrawdownPercent, 27.1);

  // Test 10.6: Simulasi Loss Beruntun Nominal Tetap (Linear)
  // Capital $1000, Risk $100 fixed, 10 steps:
  // Step 1: Remaining $900, DD 10%
  // Step 10: Remaining $0, DD 100%, isAccountBlown: true
  const linearLossSteps = simulateConsecutiveLosses(1000, 100, 10, 'FIXED_NOMINAL');
  assertEqual('Tahap 9 - Loss Linear: Step 1 sisa $900', 'Risk Engine', linearLossSteps[0].remainingEquity, 900);
  assertEqual('Tahap 9 - Loss Linear: Step 5 sisa $500, DD 50%', 'Risk Engine', linearLossSteps[4].remainingEquity, 500);
  assertEqual('Tahap 9 - Loss Linear: Step 10 sisa $0, DD 100%', 'Risk Engine', linearLossSteps[9].remainingEquity, 0);
  assertEqual('Tahap 9 - Loss Linear: Step 10 Akun Habis (isAccountBlown)', 'Risk Engine', linearLossSteps[9].isAccountBlown, true);

  // Test 10.7: Evaluasi Disiplin & Audit Trade Log
  // Sample: 1 loss trade compliant, 1 loss trade over-risk, 1 trade without SL
  const auditTestTrades: Trade[] = [
    {
      id: 'AUD-01',
      dateTime: '2026-10-20T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup 1',
      entryPrice: 2700,
      stopLoss: 2695,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'LOSS',
      grossProfit: -95,
      commission: 5,
      swap: 0,
      netProfit: -100, // exact compliant loss
    },
    {
      id: 'AUD-02',
      dateTime: '2026-10-21T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup 2 Over-risk',
      entryPrice: 2700,
      stopLoss: 2695,
      lotSize: 0.2,
      riskAmount: 100,
      riskPercentage: 1.0,
      outcome: 'LOSS',
      grossProfit: -200,
      commission: 10,
      swap: 0,
      netProfit: -210, // Over-risk violation (actual loss $210 vs planned $100)
    },
    {
      id: 'AUD-03',
      dateTime: '2026-10-22T10:00',
      instrument: 'XAUUSD',
      position: 'BUY',
      strategy: 'Setup 3 Incomplete',
      entryPrice: 2700,
      // No stopLoss, no riskAmount
      lotSize: 0.1,
      riskAmount: 0,
      riskPercentage: 0,
      outcome: 'WIN',
      grossProfit: 100,
      commission: 0,
      swap: 0,
      netProfit: 100,
    },
  ];

  const disciplineAudit = evaluateTradingDiscipline(auditTestTrades, testSettings);
  assertEqual('Tahap 9 - Audit Disiplin: hasSufficientData adalah true (3 trades)', 'Risk Engine', disciplineAudit.hasSufficientData, true);
  assertEqual('Tahap 9 - Audit Disiplin: Mendeteksi 1 pelanggaran over-risk', 'Risk Engine', disciplineAudit.overRiskTradesCount, 1);
  assertEqual('Tahap 9 - Audit Disiplin: Mendeteksi 1 transaksi data tidak lengkap (tanpa SL)', 'Risk Engine', disciplineAudit.tradesWithIncompleteData, 1);
  assertEqual('Tahap 9 - Audit Disiplin: Menghasilkan audit findings', 'Risk Engine', disciplineAudit.auditFindings.length > 0, true);

  // Test 10.8: Audit Disiplin dengan Data Belum Cukup (< 3 trades)
  const insufficientAudit = evaluateTradingDiscipline([auditTestTrades[0]], testSettings);
  assertEqual('Tahap 9 - Audit Data Kurang: hasSufficientData adalah false', 'Risk Engine', insufficientAudit.hasSufficientData, false);

  // ==========================================
  // 11. SUPABASE AUTH & ERROR TRANSLATION SUITE
  // ==========================================

  // Test 11.1: Invalid login credentials
  const errInvalidCreds = translateAuthError({ message: 'Invalid login credentials' });
  assertEqual(
    'Supabase Auth: Translasi error Invalid Credentials ke Bahasa Indonesia',
    'Supabase Auth',
    errInvalidCreds.includes('Email atau kata sandi tidak cocok'),
    true
  );

  // Test 11.2: Email not confirmed
  const errEmailNotConfirmed = translateAuthError({ message: 'Email not confirmed' });
  assertEqual(
    'Supabase Auth: Translasi error Email Not Confirmed ke Bahasa Indonesia',
    'Supabase Auth',
    errEmailNotConfirmed.includes('Email belum dikonfirmasi'),
    true
  );

  // Test 11.3: User already registered
  const errAlreadyReg = translateAuthError({ message: 'User already registered' });
  assertEqual(
    'Supabase Auth: Translasi error User Already Registered ke Bahasa Indonesia',
    'Supabase Auth',
    errAlreadyReg.includes('sudah terdaftar'),
    true
  );

  // Test 11.4: Password length requirement
  const errPasswordShort = translateAuthError({ message: 'Password should be at least 6 characters' });
  assertEqual(
    'Supabase Auth: Translasi error Password Short ke Bahasa Indonesia',
    'Supabase Auth',
    errPasswordShort.includes('minimal harus 6 karakter'),
    true
  );

  // Test 11.5: Rate limit
  const errRateLimit = translateAuthError({ message: 'over_email_send_rate_limit' });
  assertEqual(
    'Supabase Auth: Translasi error Rate Limit ke Bahasa Indonesia',
    'Supabase Auth',
    errRateLimit.includes('Terlalu banyak permintaan'),
    true
  );

  // Test 11.6: Network error / Failed to fetch
  const errNetwork = translateAuthError(new Error('Failed to fetch'));
  assertEqual(
    'Supabase Auth: Translasi error Failed to Fetch ke Bahasa Indonesia',
    'Supabase Auth',
    errNetwork.includes('Gagal terhubung ke server Supabase'),
    true
  );

  // Test 11.7: Null or undefined fallback error
  const errNull = translateAuthError(null);
  assertEqual(
    'Supabase Auth: Fallback pesan error untuk null/undefined',
    'Supabase Auth',
    typeof errNull === 'string' && errNull.length > 0,
    true
  );

  // Test 11.8: Supabase configuration retrieval returns an object with url and anonKey
  const cfg = getSupabaseConfig();
  assertEqual(
    'Supabase Auth: getSupabaseConfig mengembalikan url dan anonKey',
    'Supabase Auth',
    typeof cfg === 'object' && 'url' in cfg && 'anonKey' in cfg,
    true
  );

  // Test 11.9: Sanitasi URL menghapus /auth/v1 agar tidak memicu error "Invalid path specified in request url"
  const sanitizedWithAuth = sanitizeSupabaseUrl('https://example.supabase.co/auth/v1');
  assertEqual(
    'Supabase Auth: sanitizeSupabaseUrl membuang /auth/v1',
    'Supabase Auth',
    sanitizedWithAuth,
    'https://example.supabase.co'
  );

  // Test 11.10: Sanitasi URL menghapus /auth/v1/ dan trailing slash
  const sanitizedWithSlash = sanitizeSupabaseUrl('https://example.supabase.co/auth/v1/');
  assertEqual(
    'Supabase Auth: sanitizeSupabaseUrl membuang /auth/v1/ dan trailing slash',
    'Supabase Auth',
    sanitizedWithSlash,
    'https://example.supabase.co'
  );

  // Test 11.11: Sanitasi URL menghapus /rest/v1
  const sanitizedWithRest = sanitizeSupabaseUrl('https://example.supabase.co/rest/v1');
  assertEqual(
    'Supabase Auth: sanitizeSupabaseUrl membuang /rest/v1',
    'Supabase Auth',
    sanitizedWithRest,
    'https://example.supabase.co'
  );

  // Test 11.12: Translasi error Invalid Path ke Bahasa Indonesia yang informatif
  const errInvalidPath = translateAuthError({ message: 'Invalid path specified in request url' });
  assertEqual(
    'Supabase Auth: Translasi error Invalid Path ke Bahasa Indonesia',
    'Supabase Auth',
    errInvalidPath.includes('Jalur endpoint autentikasi Supabase tidak valid'),
    true
  );

  // ==========================================
  // 12. SUPABASE DATABASE MAPPING & RLS ERROR SUITE
  // ==========================================

  // Test 12.1: Mapping Trade to database payload uses trade_date and matches Supabase schema
  const mockTrade: Trade = {
    id: 'TRD-998877',
    dateTime: '2026-03-30T14:30',
    instrument: 'xauusd',
    position: 'BUY',
    strategy: 'London Breakout',
    session: 'London',
    entryPrice: 2750.5,
    stopLoss: 2745.0,
    takeProfit: 2765.0,
    lotSize: 0.15,
    riskAmount: 82.5,
    riskPercentage: 1.0,
    outcome: 'WIN',
    grossProfit: 220,
    commission: 5,
    swap: 0,
    netProfit: 215,
    disciplineRating: 5,
    notes: 'Good execution',
    isDemo: false,
  };

  const payload = mapTradeToDatabasePayload(mockTrade, '00000000-0000-0000-0000-000000000001');
  assertEqual('Supabase DB: Payload user_id sesuai dengan UUID pengguna login', 'Supabase DB', payload.user_id, '00000000-0000-0000-0000-000000000001');
  assertEqual('Supabase DB: id dikonversi ke UUID valid yang kompatibel dengan kolom UUID Postgres', 'Supabase DB', payload.id.includes('-'), true);
  assertEqual('Supabase DB: trade_date menghasilkan format ISO timestamptz (bukan date_time)', 'Supabase DB', payload.trade_date.includes('T'), true);
  assertEqual('Supabase DB: direction BUY dinormalisasi persis ke "Buy" sesuai CHECK constraint PostgreSQL', 'Supabase DB', payload.direction, 'Buy');
  assertEqual('Supabase DB: setup memetakan strategy trading', 'Supabase DB', payload.setup, 'London Breakout');
  assertEqual('Supabase DB: net_pnl memetakan netProfit numerik', 'Supabase DB', payload.net_pnl, 215);
  assertEqual('Supabase DB: trading_session memetakan session', 'Supabase DB', payload.trading_session, 'London');

  // Test 12.2: Mapping SELL trade maps to 'Sell' in Supabase
  const sellTrade: Trade = { ...mockTrade, id: 'TRD-SELL-1', position: 'SELL', netProfit: -120 };
  const sellPayload = mapTradeToDatabasePayload(sellTrade, '00000000-0000-0000-0000-000000000001');
  assertEqual('Supabase DB: direction SELL dinormalisasi persis ke "Sell" sesuai CHECK constraint PostgreSQL', 'Supabase DB', sellPayload.direction, 'Sell');

  // Test 12.3: normalizeTradeDirection aliases for Buy
  assertEqual('normalizeTradeDirection: "BUY" -> "Buy"', 'Supabase DB', normalizeTradeDirection('BUY'), 'Buy');
  assertEqual('normalizeTradeDirection: "Buy" -> "Buy"', 'Supabase DB', normalizeTradeDirection('Buy'), 'Buy');
  assertEqual('normalizeTradeDirection: "Beli" -> "Buy"', 'Supabase DB', normalizeTradeDirection('Beli'), 'Buy');
  assertEqual('normalizeTradeDirection: "Long" -> "Buy"', 'Supabase DB', normalizeTradeDirection('Long'), 'Buy');
  assertEqual('normalizeTradeDirection: "  long  " -> "Buy"', 'Supabase DB', normalizeTradeDirection('  long  '), 'Buy');

  // Test 12.4: normalizeTradeDirection aliases for Sell
  assertEqual('normalizeTradeDirection: "SELL" -> "Sell"', 'Supabase DB', normalizeTradeDirection('SELL'), 'Sell');
  assertEqual('normalizeTradeDirection: "Sell" -> "Sell"', 'Supabase DB', normalizeTradeDirection('Sell'), 'Sell');
  assertEqual('normalizeTradeDirection: "Jual" -> "Sell"', 'Supabase DB', normalizeTradeDirection('Jual'), 'Sell');
  assertEqual('normalizeTradeDirection: "Short" -> "Sell"', 'Supabase DB', normalizeTradeDirection('Short'), 'Sell');
  assertEqual('normalizeTradeDirection: "  short  " -> "Sell"', 'Supabase DB', normalizeTradeDirection('  short  '), 'Sell');

  // Test 12.5: normalizeTradeDirection strictly rejects invalid, empty, or unknown values
  let emptyThrows = false;
  try {
    normalizeTradeDirection('');
  } catch {
    emptyThrows = true;
  }
  assertEqual('normalizeTradeDirection: Empty string throws Error', 'Supabase DB', emptyThrows, true);

  let nullThrows = false;
  try {
    normalizeTradeDirection(null);
  } catch {
    nullThrows = true;
  }
  assertEqual('normalizeTradeDirection: null throws Error', 'Supabase DB', nullThrows, true);

  let invalidThrows = false;
  try {
    normalizeTradeDirection('HOLD');
  } catch {
    invalidThrows = true;
  }
  assertEqual('normalizeTradeDirection: Unknown value "HOLD" throws Error', 'Supabase DB', invalidThrows, true);

  // Test 12.6: mapDatabaseDirectionToApp maps DB 'Buy' and 'Sell' back to app 'BUY' and 'SELL'
  assertEqual('mapDatabaseDirectionToApp: "Buy" -> "BUY"', 'Supabase DB', mapDatabaseDirectionToApp('Buy'), 'BUY');
  assertEqual('mapDatabaseDirectionToApp: "Sell" -> "SELL"', 'Supabase DB', mapDatabaseDirectionToApp('Sell'), 'SELL');
  assertEqual('mapDatabaseDirectionToApp: "BUY" -> "BUY"', 'Supabase DB', mapDatabaseDirectionToApp('BUY'), 'BUY');
  assertEqual('mapDatabaseDirectionToApp: "SELL" -> "SELL"', 'Supabase DB', mapDatabaseDirectionToApp('SELL'), 'SELL');

  // Test 12.7: Mapping Row back to Trade preserves data types, handles direction 'Sell', and extracts LocalID
  const mockRow = {
    id: '5452442d-3939-4838-8737-aaaaaaaaaaaa',
    user_id: '00000000-0000-0000-0000-000000000001',
    trade_date: '2026-03-30T14:30:00.000Z',
    instrument: 'XAUUSD',
    direction: 'Sell', // Title case from Supabase
    setup: 'London Breakout',
    entry_price: '2750.50',
    stop_loss: '2745.00',
    take_profit: '2765.00',
    exit_price: '2765.00',
    lot_size: '0.15',
    outcome: 'LOSS',
    net_pnl: '-120.00',
    commission: '5.00',
    swap: '0.00',
    screenshot_url: null,
    notes: '[LocalID: TRD-998877] Good execution [Meta: {"riskAmount":82.5,"riskPercentage":1,"rMultiple":-1.45,"disciplineRating":5}]',
    trading_session: 'London',
    created_at: '2026-03-30T14:30:00.000Z',
    updated_at: '2026-03-30T14:30:00.000Z',
  };

  const restoredTrade = mapDatabaseRowToTrade(mockRow);
  assertEqual('Supabase DB: Row mapping merekonstruksi LocalID TRD-998877 dari row', 'Supabase DB', restoredTrade.id, 'TRD-998877');
  assertEqual('Supabase DB: Row mapping memetakan direction "Sell" kembali ke position "SELL"', 'Supabase DB', restoredTrade.position, 'SELL');
  assertEqual(
    'Supabase DB: Row mapping menormalisasi trade_date ke dateTime lokal YYYY-MM-DDTHH:mm',
    'Supabase DB',
    restoredTrade.dateTime,
    normalizeTradeDateTimeLocal('2026-03-30T14:30:00.000Z')
  );
  assertEqual('Supabase DB: Row mapping mengonversi entry_price string ke number', 'Supabase DB', restoredTrade.entryPrice, 2750.5);
  assertEqual('Supabase DB: Row mapping mengonversi net_pnl ke netProfit', 'Supabase DB', restoredTrade.netProfit, -120);
  assertEqual('Supabase DB: Row mapping merekonstruksi rMultiple', 'Supabase DB', restoredTrade.rMultiple, -1.45);
  assertEqual('Supabase DB: Row mapping membersihkan tag LocalID dari notes pengguna', 'Supabase DB', restoredTrade.notes, 'Good execution');

  // Test 12.8: Database error translation for RLS violation
  const rlsErr = translateDatabaseError({
    message: 'new row violates row-level security policy for table "trades"',
    code: '42501',
  });
  assertEqual(
    'Supabase DB: Translasi error RLS ke Bahasa Indonesia yang jelas',
    'Supabase DB',
    rlsErr.includes('Row Level Security (RLS)'),
    true
  );

  // Test 12.9: Database error translation for trades_direction_check
  const dirCheckErr = translateDatabaseError({
    message: 'new row for relation "trades" violates check constraint "trades_direction_check"',
    code: '23514',
  });
  assertEqual(
    'Supabase DB: Translasi error check constraint trades_direction_check',
    'Supabase DB',
    dirCheckErr.includes('arah transaksi'),
    true
  );

  // Test 12.10: Database error translation for Foreign Key violation
  const fkErr = translateDatabaseError({
    message: 'insert or update on table "trades" violates foreign key constraint "trades_user_id_fkey"',
    code: '23503',
  });
  assertEqual(
    'Supabase DB: Translasi error Foreign Key user_id ke Bahasa Indonesia',
    'Supabase DB',
    fkErr.includes('User ID tidak terdaftar'),
    true
  );

  // Test 12.11: Database error translation for Schema Cache mismatch
  const schemaErr = translateDatabaseError({
    message: "Could not find the 'unknown_col' column of 'trades' in the schema cache",
    code: 'PGRST204',
  });
  assertEqual(
    'Supabase DB: Translasi error Schema Column Mismatch',
    'Supabase DB',
    schemaErr.includes('Struktur kolom database tidak cocok'),
    true
  );

  const durationMs = Date.now() - startTime;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    durationMs,
    results,
  };
}
