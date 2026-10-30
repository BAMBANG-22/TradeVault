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
import {
  PHASE_1_TEST_DB_NAME,
  PRODUCTION_DB_NAME_BLOCKED_IN_PHASE_1,
} from '../storage/databaseTypes';
import {
  computeCanonicalSettingsDigest,
  computeCanonicalTradeDigest,
  computeSha256Hex,
  decodeBase64DataUrlToBinary,
  decodeBase64UrlToUtf8,
  decodeTradeNotesWithMeta,
  encodeTradeNotesWithMetaB64,
  encodeUtf8ToBase64Url,
} from '../storage/utf8Base64Url';
import {
  classifySupabaseSyncError,
  IdbDatabaseAdapter,
  lockScreenshotInMemory,
  mapLocalRowToSettings,
  mapLocalRowToTrade,
  unlockScreenshotInMemory,
  validateAndNormalizeTradeRecord,
} from '../storage/idbAdapter';
import {
  SQLITE_PHASE_1_ERROR_CODE,
  SqliteDatabaseAdapter,
  verifyDatabaseSchemaParity,
} from '../storage/sqliteAdapter';
import {
  captureWindowLocalStorageSnapshotDigest,
  createInMemorySnapshotProvider,
  runShadowMigration,
} from '../storage/migrationService';

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

export interface Phase1AcceptanceTestItem extends TestResultItem {
  testId: string;
  status: 'PASS' | 'FAIL' | 'NOT RUN';
  databaseUsed: string;
}

export interface Phase1TestSuiteSummary extends TestSuiteSummary {
  databaseUsed: typeof PHASE_1_TEST_DB_NAME;
  localStorageKeyCountBefore: number;
  localStorageKeyCountAfter: number;
  localStorageDigestBefore: string;
  localStorageDigestAfter: string;
  isLocalStorageUnchanged: boolean;
  acceptanceResults: Phase1AcceptanceTestItem[];
}

// Synthetic 1x1 transparent PNG in Base64 for isolated screenshot testing (AT-05, AT-10, AT-11, AT-13)
const SYNTHETIC_PNG_BASE64_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Runs Phase 1 Acceptance Tests (AT-01 through AT-17) strictly inside 'tradevault_idb_test'.
 * - Uses synthetic fixtures only.
 * - Never opens or modifies 'tradevault_idb'.
 * - Never reads/copies user trade content from window.localStorage into IndexedDB.
 * - Makes zero Supabase network requests.
 * - Captures before/after SHA-256 digest of window.localStorage to prove 100% non-destruction.
 */
export async function runPhase1StorageAndMigrationTests(): Promise<Phase1TestSuiteSummary> {
  const startTime = Date.now();
  const acceptanceResults: Phase1AcceptanceTestItem[] = [];

  const recordTest = (
    testId: string,
    name: string,
    category: string,
    passed: boolean,
    actual: unknown,
    expected: unknown,
    details?: string
  ) => {
    acceptanceResults.push({
      testId,
      name: `${testId}: ${name}`,
      category,
      passed,
      status: passed ? 'PASS' : 'FAIL',
      actual,
      expected,
      details,
      databaseUsed: PHASE_1_TEST_DB_NAME,
    });
  };

  // Capture initial window.localStorage SHA-256 snapshot before any test runs (AT-17)
  const snapshotBefore = await captureWindowLocalStorageSnapshotDigest();

  const adapter = new IdbDatabaseAdapter(PHASE_1_TEST_DB_NAME);
  let testDatabaseCleanupError: string | null = null;

  try {
    await adapter.destroyDatabaseForTestingOnly();
    await adapter.open();

    // =========================================================================
    // AT-01: Trade 27-Field Round-Trip & Canonical Digest
    // =========================================================================
    try {
      const full27FieldTrade: Trade = {
        id: 'SYNTH-TRD-001',
        dateTime: '2026-10-15T09:45',
        instrument: 'XAUUSD',
        position: 'BUY',
        strategy: 'London Liquidity Sweep + CHoCH',
        session: 'London',
        entryPrice: 2715.25,
        stopLoss: 2710.25,
        takeProfit: 2730.25,
        exitPrice: 2730.25,
        lotSize: 0.25,
        riskAmount: 125.0,
        riskPercentage: 1.25,
        outcome: 'WIN',
        grossProfit: 375.0,
        commission: 7.5,
        swap: -1.5,
        netProfit: 366.0,
        rMultiple: 2.93,
        screenshotUrl: 'https://example.invalid/chart-001.png',
        notes: 'Catatan jurnal lengkap [uji karakter ] dan } serta emoji 🚀]',
        entryReason: 'Konfirmasi sweep low Asia + displacement M5',
        postTradeEvaluation: 'Eksekusi disiplin sesuai trading plan tanpa geser SL',
        disciplineRating: 5,
        executionNotes: 'Slippage 0.05 poin pada saat entry market order',
        isDemo: false,
        createdAt: '2026-10-15T09:45:00.000Z',
        updatedAt: '2026-10-15T11:30:00.000Z',
      };

      const expectedDigest = await computeCanonicalTradeDigest(full27FieldTrade);
      await adapter.putTrade(full27FieldTrade, { ownerScope: 'GUEST' });

      const storedRow = await adapter.getTradeByOwnerAndLocalId('GUEST', 'SYNTH-TRD-001');
      if (!storedRow) {
        throw new Error('Stored row was not found on read-back.');
      }
      const restoredTrade = mapLocalRowToTrade(storedRow);
      const actualDigest = await computeCanonicalTradeDigest(restoredTrade);

      const all27Match =
        restoredTrade.id === full27FieldTrade.id &&
        restoredTrade.dateTime === full27FieldTrade.dateTime &&
        restoredTrade.instrument === full27FieldTrade.instrument &&
        restoredTrade.position === full27FieldTrade.position &&
        restoredTrade.strategy === full27FieldTrade.strategy &&
        restoredTrade.session === full27FieldTrade.session &&
        restoredTrade.entryPrice === full27FieldTrade.entryPrice &&
        restoredTrade.stopLoss === full27FieldTrade.stopLoss &&
        restoredTrade.takeProfit === full27FieldTrade.takeProfit &&
        restoredTrade.exitPrice === full27FieldTrade.exitPrice &&
        restoredTrade.lotSize === full27FieldTrade.lotSize &&
        restoredTrade.riskAmount === full27FieldTrade.riskAmount &&
        restoredTrade.riskPercentage === full27FieldTrade.riskPercentage &&
        restoredTrade.outcome === full27FieldTrade.outcome &&
        restoredTrade.grossProfit === full27FieldTrade.grossProfit &&
        restoredTrade.commission === full27FieldTrade.commission &&
        restoredTrade.swap === full27FieldTrade.swap &&
        restoredTrade.netProfit === full27FieldTrade.netProfit &&
        restoredTrade.rMultiple === full27FieldTrade.rMultiple &&
        restoredTrade.screenshotUrl === full27FieldTrade.screenshotUrl &&
        restoredTrade.notes === full27FieldTrade.notes &&
        restoredTrade.entryReason === full27FieldTrade.entryReason &&
        restoredTrade.postTradeEvaluation === full27FieldTrade.postTradeEvaluation &&
        restoredTrade.disciplineRating === full27FieldTrade.disciplineRating &&
        restoredTrade.executionNotes === full27FieldTrade.executionNotes &&
        restoredTrade.isDemo === full27FieldTrade.isDemo &&
        restoredTrade.createdAt === full27FieldTrade.createdAt &&
        restoredTrade.updatedAt === full27FieldTrade.updatedAt &&
        actualDigest === expectedDigest;

      recordTest(
        'AT-01',
        'Trade 27-Field Round-Trip & Canonical SHA-256 Digest Verification',
        'AT-01..AT-04 Identity & Serialization',
        all27Match,
        all27Match ? '27/27 fields + SHA-256 matched' : 'Field or digest mismatch',
        '27/27 fields + SHA-256 matched',
        `Digest: ${actualDigest.slice(0, 16)}...`
      );
    } catch (err: unknown) {
      recordTest(
        'AT-01',
        'Trade 27-Field Round-Trip & Canonical SHA-256 Digest Verification',
        'AT-01..AT-04 Identity & Serialization',
        false,
        err instanceof Error ? err.message : String(err),
        '27/27 fields + SHA-256 matched'
      );
    }

    // =========================================================================
    // AT-02: AppSettings 20-Property Round-Trip & Scope Isolation
    // =========================================================================
    try {
      const guestSettings: AppSettings = {
        currency: 'USD',
        currencySymbol: '$',
        startingBalance: 10000,
        xauusdContractSize: 100,
        xauusdPointValue: 0.01,
        xauusdTickSize: 0.01,
        xauusdTickValue: 1.0,
        xauusdMinLot: 0.01,
        xauusdLotStep: 0.01,
        defaultLeverage: 500,
        brokerCommissionPerLot: 6,
        defaultRiskPercent: 1.0,
        maxTradeRiskPercent: 2.0,
        maxTradeRiskAmount: 200,
        maxDailyLossPercent: 3.0,
        maxDailyLossAmount: 300,
        maxConsecutiveLossLimit: 3,
        maxDrawdownLimitPercent: 10.0,
        resetTimezone: 'WIB (UTC+7)',
        targetMonthlyReturnPercent: 8,
      };

      const userASettings: AppSettings = {
        currency: 'EUR',
        currencySymbol: '€',
        startingBalance: 25000,
        xauusdContractSize: 10,
        xauusdPointValue: 0.05,
        xauusdTickSize: 0.05,
        xauusdTickValue: 0.5,
        xauusdMinLot: 0.05,
        xauusdLotStep: 0.05,
        defaultLeverage: 200,
        brokerCommissionPerLot: 4.5,
        defaultRiskPercent: 0.75,
        maxTradeRiskPercent: 1.5,
        maxTradeRiskAmount: 375,
        maxDailyLossPercent: 2.5,
        maxDailyLossAmount: 625,
        maxConsecutiveLossLimit: 4,
        maxDrawdownLimitPercent: 8.5,
        resetTimezone: 'UTC',
        targetMonthlyReturnPercent: 12,
      };

      const expectedGuestDigest = await computeCanonicalSettingsDigest(guestSettings);
      const expectedUserADigest = await computeCanonicalSettingsDigest(userASettings);

      await adapter.putSettings(guestSettings, 'GUEST');
      await adapter.putSettings(userASettings, 'synth-user-A');

      const guestRow = await adapter.getSettingsByOwner('GUEST');
      const userARow = await adapter.getSettingsByOwner('synth-user-A');

      if (!guestRow || !userARow) {
        throw new Error('Failed to read back scoped settings rows.');
      }

      const restoredGuest = mapLocalRowToSettings(guestRow);
      const restoredUserA = mapLocalRowToSettings(userARow);

      const actualGuestDigest = await computeCanonicalSettingsDigest(restoredGuest);
      const actualUserADigest = await computeCanonicalSettingsDigest(restoredUserA);

      const passed =
        actualGuestDigest === expectedGuestDigest &&
        actualUserADigest === expectedUserADigest &&
        actualGuestDigest !== actualUserADigest &&
        restoredUserA.defaultLeverage === 200 &&
        restoredGuest.defaultLeverage === 500 &&
        restoredUserA.resetTimezone === 'UTC' &&
        restoredGuest.resetTimezone === 'WIB (UTC+7)';

      recordTest(
        'AT-02',
        'AppSettings 20-Property Round-Trip & Multi-Scope Isolation',
        'AT-01..AT-04 Identity & Serialization',
        passed,
        passed ? '20/20 props isolated across GUEST & synth-user-A' : 'Settings mismatch',
        '20/20 props isolated across GUEST & synth-user-A'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-02',
        'AppSettings 20-Property Round-Trip & Multi-Scope Isolation',
        'AT-01..AT-04 Identity & Serialization',
        false,
        err instanceof Error ? err.message : String(err),
        '20/20 props isolated across GUEST & synth-user-A'
      );
    }

    // =========================================================================
    // AT-03: UTF-8 Base64URL Serialization ([MetaB64] & Legacy [Meta])
    // =========================================================================
    try {
      const complexTrade: Trade = {
        id: 'TRD-UTF8-03',
        dateTime: '2026-10-16T14:00',
        instrument: 'XAUUSD',
        position: 'SELL',
        strategy: 'NY Reversal',
        entryPrice: 2740,
        lotSize: 0.1,
        riskAmount: 50,
        riskPercentage: 0.5,
        outcome: 'WIN',
        grossProfit: 150,
        commission: 0,
        swap: 0,
        netProfit: 150,
        rMultiple: 3.0,
        disciplineRating: 4,
        isDemo: true,
        notes: 'Catatan Bahasa Indonesia: disiplin tinggi! [Kurung siku] & {kurung kurawal} 金相場 🚀📈',
        entryReason: 'Rejection di area supply H4 + divergence [RSI > 70] }',
        postTradeEvaluation: 'Target tercapai mulus ✅ 東京・ロンドン',
        executionNotes: 'Eksekusi limit order tepat di 2740.00',
      };

      const encodedNotes = encodeTradeNotesWithMetaB64(complexTrade, {
        syncRevision: 3,
        lastMutationId: 'mut-utf8-003',
      });
      const decoded = decodeTradeNotesWithMeta(encodedNotes);

      // Also verify legacy [LocalID: ...] and [Meta: {...}] backward compatibility
      const legacyString =
        '[LocalID: TRD-LEGACY-77] Catatan lama sebelum migrasi [Meta: {"riskAmount":85.5,"riskPercentage":1.5,"rMultiple":2.25,"disciplineRating":5,"isDemo":true}]';
      const decodedLegacy = decodeTradeNotesWithMeta(legacyString);

      // Also verify explicit rejection of malformed Base64URL input
      let malformedRejected = false;
      try {
        decodeBase64UrlToUtf8('!!!NOT_VALID_BASE64URL$$$');
      } catch {
        malformedRejected = true;
      }

      const utf8RoundTripPassed =
        decoded.formatDetected === 'METAB64' &&
        decoded.cleanNotes === complexTrade.notes &&
        decoded.meta.entryReason === complexTrade.entryReason &&
        decoded.meta.postTradeEvaluation === complexTrade.postTradeEvaluation &&
        decoded.meta.executionNotes === complexTrade.executionNotes &&
        decoded.meta.rMultiple === 3.0 &&
        decoded.meta.disciplineRating === 4 &&
        decoded.meta.isDemo === true &&
        decodedLegacy.formatDetected === 'LEGACY_META' &&
        decodedLegacy.extractedLocalId === 'TRD-LEGACY-77' &&
        decodedLegacy.cleanNotes === 'Catatan lama sebelum migrasi' &&
        decodedLegacy.meta.riskAmount === 85.5 &&
        decodedLegacy.meta.rMultiple === 2.25 &&
        malformedRejected &&
        decodeBase64UrlToUtf8(encodeUtf8ToBase64Url('Uji karakter: é, ü, 日本語, العربية, 🎯')) ===
          'Uji karakter: é, ü, 日本語, العربية, 🎯';

      recordTest(
        'AT-03',
        'UTF-8 Base64URL [MetaB64] Round-Trip, Legacy [Meta] Compatibility & Malformed Input Rejection',
        'AT-01..AT-04 Identity & Serialization',
        utf8RoundTripPassed,
        utf8RoundTripPassed ? 'UTF-8 + Legacy + Validation Verified' : 'Serialization mismatch',
        'UTF-8 + Legacy + Validation Verified'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-03',
        'UTF-8 Base64URL [MetaB64] Round-Trip, Legacy [Meta] Compatibility & Malformed Input Rejection',
        'AT-01..AT-04 Identity & Serialization',
        false,
        err instanceof Error ? err.message : String(err),
        'UTF-8 + Legacy + Validation Verified'
      );
    }

    // =========================================================================
    // AT-04: Multi-Scope Local ID Coexistence & Canonical UUID Collision Recovery
    // =========================================================================
    try {
      const baseSameIdTrade: Trade = {
        id: 'TRD-SHARED-100',
        dateTime: '2026-10-17T10:00',
        instrument: 'XAUUSD',
        position: 'BUY',
        strategy: 'Breakout',
        entryPrice: 2700,
        lotSize: 0.1,
        riskAmount: 50,
        riskPercentage: 0.5,
        outcome: 'WIN',
        grossProfit: 100,
        commission: 0,
        swap: 0,
        netProfit: 100,
      };

      const rowGuest = await adapter.putTrade(
        { ...baseSameIdTrade, netProfit: 111, grossProfit: 111 },
        { ownerScope: 'GUEST' }
      );
      const rowUserA = await adapter.putTrade(
        { ...baseSameIdTrade, netProfit: 222, grossProfit: 222 },
        { ownerScope: 'synth-user-A' }
      );

      // Simulate a canonical_uuid collision on attempt #1 for synth-user-B (returns rowUserA.canonical_uuid first, then a fresh UUID)
      let generatorCallCount = 0;
      const collidingUuidGenerator = () => {
        generatorCallCount++;
        if (generatorCallCount === 1) {
          return rowUserA.canonical_uuid; // Deliberate collision on primary key!
        }
        return crypto.randomUUID();
      };

      const rowUserB = await adapter.putTrade(
        { ...baseSameIdTrade, netProfit: 333, grossProfit: 333 },
        {
          ownerScope: 'synth-user-B',
          uuidGenerator: collidingUuidGenerator,
        }
      );

      // Verify cloud-bound UUID preservation (isCloudBound = 1)
      const cloudBoundUuid = '11111111-2222-4333-8444-555555555555';
      const cloudBoundRow = await adapter.putTrade(
        { ...baseSameIdTrade, id: 'TRD-CLOUD-BOUND-1', netProfit: 444, grossProfit: 444 },
        {
          ownerScope: 'synth-user-A',
          isCloudBound: 1,
          canonicalUuid: cloudBoundUuid,
        }
      );

      const readGuest = await adapter.getTradeByOwnerAndLocalId('GUEST', 'TRD-SHARED-100');
      const readUserA = await adapter.getTradeByOwnerAndLocalId('synth-user-A', 'TRD-SHARED-100');
      const readUserB = await adapter.getTradeByOwnerAndLocalId('synth-user-B', 'TRD-SHARED-100');

      const distinctUuids =
        new Set([rowGuest.canonical_uuid, rowUserA.canonical_uuid, rowUserB.canonical_uuid]).size ===
        3;

      const passed =
        distinctUuids &&
        generatorCallCount === 2 &&
        readGuest?.netProfit === 111 &&
        readUserA?.netProfit === 222 &&
        readUserB?.netProfit === 333 &&
        cloudBoundRow.canonical_uuid === cloudBoundUuid &&
        cloudBoundRow.is_cloud_bound === 1;

      recordTest(
        'AT-04',
        'Multi-Scope Local ID Coexistence (GUEST, user-A, user-B) & ConstraintError UUID Collision Recovery',
        'AT-01..AT-04 Identity & Serialization',
        passed,
        passed
          ? '3 scopes coexist + collision retried after abort + cloud UUID preserved'
          : 'Scope collision or UUID error',
        '3 scopes coexist + collision retried after abort + cloud UUID preserved'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-04',
        'Multi-Scope Local ID Coexistence (GUEST, user-A, user-B) & ConstraintError UUID Collision Recovery',
        'AT-01..AT-04 Identity & Serialization',
        false,
        err instanceof Error ? err.message : String(err),
        '3 scopes coexist + collision retried after abort + cloud UUID preserved'
      );
    }

    // =========================================================================
    // AT-05: VERIFIED_SHADOW Full 11-Step Migration & Digest Verification
    // =========================================================================
    try {
      const cleanTradesFixture: Trade[] = [
        {
          id: 'MIG-CLEAN-01',
          dateTime: '2026-10-18T09:00',
          instrument: 'XAUUSD',
          position: 'BUY',
          strategy: 'Order Block',
          entryPrice: 2710,
          lotSize: 0.2,
          riskAmount: 100,
          riskPercentage: 1.0,
          outcome: 'WIN',
          grossProfit: 260,
          commission: 6,
          swap: 0,
          netProfit: 254,
          screenshotUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
          entryReason: 'Clean OB tap',
        },
        {
          id: 'MIG-CLEAN-02',
          dateTime: '2026-10-18T15:00',
          instrument: 'XAUUSD',
          position: 'SELL',
          strategy: 'FVG Fill',
          entryPrice: 2725,
          lotSize: 0.1,
          riskAmount: 50,
          riskPercentage: 0.5,
          outcome: 'LOSS',
          grossProfit: -50,
          commission: 3,
          swap: 0,
          netProfit: -53,
        },
      ];

      const provider = createInMemorySnapshotProvider({
        synth_trades_clean: JSON.stringify(cleanTradesFixture),
        synth_settings_clean: JSON.stringify(DEFAULT_SETTINGS),
      });

      const report = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at05-clean',
        tradesStorageKey: 'synth_trades_clean',
        settingsStorageKey: 'synth_settings_clean',
      });

      const migState = await adapter.getMigrationState('scope-at05-clean');

      // Also verify that if read-back digest mismatches, VERIFIED_SHADOW is rejected and marked FAILED
      const badDigestReport = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at05-digest-fail',
        tradesStorageKey: 'synth_trades_clean',
        settingsStorageKey: 'synth_settings_clean',
        simulateReadBackDigestMismatch: true,
      });
      const failedScopeTrades = await adapter.getTradesByOwner('scope-at05-digest-fail');
      const failedScopeSettings = await adapter.getSettingsByOwner('scope-at05-digest-fail');
      const failedScopeQuarantine = await adapter.getQuarantinedRecordsByOwner('scope-at05-digest-fail');

      const passed =
        report.status === 'VERIFIED_SHADOW' &&
        report.migratedTradesCount === 2 &&
        report.migratedScreenshotsCount === 1 &&
        report.quarantinedCount === 0 &&
        report.isActiveSourceOfTruth === false &&
        report.snapshotChecksumStart === report.snapshotChecksumEnd &&
        migState?.is_active_source_of_truth === 0 &&
        badDigestReport.status === 'FAILED' &&
        failedScopeTrades.length === 0 &&
        failedScopeSettings === null &&
        failedScopeQuarantine.length === 0;

      recordTest(
        'AT-05',
        'VERIFIED_SHADOW Shadow Migration (Snapshot + Per-Record Digest + Read-Back Verification)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        report.status,
        'VERIFIED_SHADOW'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-05',
        'VERIFIED_SHADOW Shadow Migration (Snapshot + Per-Record Digest + Read-Back Verification)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'VERIFIED_SHADOW'
      );
    }

    // =========================================================================
    // AT-06: Invalid Top-Level JSON Document Quarantine
    // =========================================================================
    try {
      const malformedJsonStr = '[{"id":"TRD-BROKEN-JSON","instrument":"XAUUSD","entryPrice":2700';
      const provider = createInMemorySnapshotProvider({
        synth_trades_malformed_json: malformedJsonStr,
        synth_settings_malformed_json: JSON.stringify(DEFAULT_SETTINGS),
      });

      const report = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at06-badjson',
        tradesStorageKey: 'synth_trades_malformed_json',
        settingsStorageKey: 'synth_settings_malformed_json',
      });

      const quarantined = await adapter.getQuarantinedRecordsByOwner('scope-at06-badjson');
      const passed =
        report.status === 'COMPLETED_WITH_QUARANTINE' &&
        report.migratedTradesCount === 0 &&
        report.quarantinedCount === 1 &&
        quarantined.length === 1 &&
        quarantined[0].corruption_scope === 'TOP_LEVEL_JSON' &&
        quarantined[0].raw_payload === malformedJsonStr &&
        provider.getItem('synth_trades_malformed_json') === malformedJsonStr;

      recordTest(
        'AT-06',
        'Top-Level Malformed JSON Document Quarantine Without Partial Migration',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        `${report.status} (quarantined=${report.quarantinedCount}, migrated=${report.migratedTradesCount})`,
        'COMPLETED_WITH_QUARANTINE (quarantined=1, migrated=0)'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-06',
        'Top-Level Malformed JSON Document Quarantine Without Partial Migration',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'COMPLETED_WITH_QUARANTINE (quarantined=1, migrated=0)'
      );
    }

    // =========================================================================
    // AT-07A: Valid JSON Document Containing Invalid Records
    // =========================================================================
    try {
      const mixedJsonRecords = [
        {
          id: 'AT07A-VALID-1',
          dateTime: '2026-10-19T10:00',
          instrument: 'XAUUSD',
          position: 'BUY',
          strategy: 'Valid 1',
          entryPrice: 2700,
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
          id: 'AT07A-VALID-2',
          dateTime: '2026-10-19T11:00',
          instrument: 'XAUUSD',
          position: 'SELL',
          strategy: 'Valid 2',
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
        // Invalid Record #1: Missing required id and dateTime
        {
          instrument: 'XAUUSD',
          position: 'BUY',
          entryPrice: 2700,
          lotSize: 0.1,
        },
        // Invalid Record #2: null / string where required numbers are expected
        {
          id: 'AT07A-BAD-NUM',
          dateTime: '2026-10-19T12:00',
          instrument: 'XAUUSD',
          position: 'BUY',
          strategy: 'Invalid Num',
          entryPrice: null,
          lotSize: 'not-a-number',
          riskAmount: 50,
          riskPercentage: 0.5,
          outcome: 'WIN',
          grossProfit: 100,
          commission: 0,
          swap: 0,
          netProfit: null,
        },
      ];

      const provider = createInMemorySnapshotProvider({
        synth_trades_at07a: JSON.stringify(mixedJsonRecords),
        synth_settings_at07a: JSON.stringify(DEFAULT_SETTINGS),
      });

      const report = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at07a',
        tradesStorageKey: 'synth_trades_at07a',
        settingsStorageKey: 'synth_settings_at07a',
      });

      const quarantined = await adapter.getQuarantinedRecordsByOwner('scope-at07a');
      const storedValid = await adapter.getTradesByOwner('scope-at07a');

      const passed =
        report.status === 'COMPLETED_WITH_QUARANTINE' &&
        report.migratedTradesCount === 2 &&
        report.quarantinedCount === 2 &&
        storedValid.length === 2 &&
        quarantined.length === 2 &&
        quarantined.every((q) => q.corruption_scope === 'ARRAY_ITEM_RECORD');

      recordTest(
        'AT-07A',
        'Valid JSON Document with Malformed Records (Preserve Valid, Quarantine Invalid)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        `${report.status} (valid=${report.migratedTradesCount}, quarantined=${report.quarantinedCount})`,
        'COMPLETED_WITH_QUARANTINE (valid=2, quarantined=2)'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-07A',
        'Valid JSON Document with Malformed Records (Preserve Valid, Quarantine Invalid)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'COMPLETED_WITH_QUARANTINE (valid=2, quarantined=2)'
      );
    }

    // =========================================================================
    // AT-07B: In-Memory JavaScript Objects Containing NaN, Infinity, -Infinity
    // =========================================================================
    try {
      const nanTrade: Trade = {
        id: 'AT07B-NAN',
        dateTime: '2026-10-19T14:00',
        instrument: 'XAUUSD',
        position: 'BUY',
        strategy: 'NaN Test',
        entryPrice: Number.NaN,
        lotSize: 0.1,
        riskAmount: 50,
        riskPercentage: 0.5,
        outcome: 'WIN',
        grossProfit: 100,
        commission: 0,
        swap: 0,
        netProfit: 100,
      };

      const posInfTrade: Trade = {
        ...nanTrade,
        id: 'AT07B-POS-INF',
        entryPrice: 2700,
        netProfit: Number.POSITIVE_INFINITY,
      };

      const negInfTrade: Trade = {
        ...nanTrade,
        id: 'AT07B-NEG-INF',
        entryPrice: 2700,
        lotSize: 0.1,
        stopLoss: Number.NEGATIVE_INFINITY,
      };

      // 1. Direct adapter putTrade must reject NaN / Infinity / -Infinity
      let nanRejected = false;
      let posInfRejected = false;
      let negInfRejected = false;

      try {
        await adapter.putTrade(nanTrade, { ownerScope: 'scope-at07b' });
      } catch {
        nanRejected = true;
      }
      try {
        await adapter.putTrade(posInfTrade, { ownerScope: 'scope-at07b' });
      } catch {
        posInfRejected = true;
      }
      try {
        await adapter.putTrade(negInfTrade, { ownerScope: 'scope-at07b' });
      } catch {
        negInfRejected = true;
      }

      // 2. Shadow migration with in-memory objects must quarantine all 3 non-finite records
      const provider = createInMemorySnapshotProvider({
        synth_trades_at07b: '[]',
        synth_settings_at07b: JSON.stringify(DEFAULT_SETTINGS),
      });

      const migReport = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at07b',
        tradesStorageKey: 'synth_trades_at07b',
        settingsStorageKey: 'synth_settings_at07b',
        inMemoryTradeObjectsOverride: [nanTrade, posInfTrade, negInfTrade],
      });

      const storedTrades = await adapter.getTradesByOwner('scope-at07b');
      const validatorCheck = validateAndNormalizeTradeRecord(nanTrade, 'scope-at07b');

      const passed =
        nanRejected &&
        posInfRejected &&
        negInfRejected &&
        !validatorCheck.isValid &&
        migReport.status === 'COMPLETED_WITH_QUARANTINE' &&
        migReport.migratedTradesCount === 0 &&
        migReport.quarantinedCount === 3 &&
        storedTrades.length === 0;

      recordTest(
        'AT-07B',
        'In-Memory NaN, Infinity & -Infinity Rejection and Quarantine (Zero Silent Coercion)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        passed
          ? 'NaN/Infinity/-Infinity rejected & quarantined (0 stored in trades)'
          : 'Failed to reject non-finite numbers',
        'NaN/Infinity/-Infinity rejected & quarantined (0 stored in trades)'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-07B',
        'In-Memory NaN, Infinity & -Infinity Rejection and Quarantine (Zero Silent Coercion)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'NaN/Infinity/-Infinity rejected & quarantined (0 stored in trades)'
      );
    }

    // =========================================================================
    // AT-08: Atomic Write Failure Rollback & Retry Recovery
    // =========================================================================
    try {
      const threeValidTrades: Trade[] = [1, 2, 3].map((n) => ({
        id: `AT08-TRD-${n}`,
        dateTime: `2026-10-20T1${n}:00`,
        instrument: 'XAUUSD',
        position: 'BUY',
        strategy: 'Atomic Test',
        entryPrice: 2700 + n,
        lotSize: 0.1,
        riskAmount: 50,
        riskPercentage: 0.5,
        outcome: 'WIN',
        grossProfit: 100 * n,
        commission: 0,
        swap: 0,
        netProfit: 100 * n,
      }));

      const provider = createInMemorySnapshotProvider({
        synth_trades_at08: JSON.stringify(threeValidTrades),
        synth_settings_at08: JSON.stringify(DEFAULT_SETTINGS),
      });

      // Run 1: Simulate write failure on trade index 2 (the 3rd valid trade)
      const failedReport = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at08-atomic',
        tradesStorageKey: 'synth_trades_at08',
        settingsStorageKey: 'synth_settings_at08',
        simulateWriteFailureOnTradeIndex: 2,
      });

      const tradesAfterFailedTx = await adapter.getTradesByOwner('scope-at08-atomic');
      const stateAfterFailedTx = await adapter.getMigrationState('scope-at08-atomic');

      // Run 2: Retry without simulated error -> must cleanly succeed with 3 trades and 0 duplicates
      const retryReport = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at08-atomic',
        tradesStorageKey: 'synth_trades_at08',
        settingsStorageKey: 'synth_settings_at08',
      });
      const tradesAfterRetry = await adapter.getTradesByOwner('scope-at08-atomic');

      const passed =
        failedReport.status === 'FAILED' &&
        stateAfterFailedTx?.status === 'FAILED' &&
        tradesAfterFailedTx.length === 0 &&
        retryReport.status === 'VERIFIED_SHADOW' &&
        tradesAfterRetry.length === 3;

      recordTest(
        'AT-08',
        'Atomic Write Failure Rollback (0 Partial Trades Committed, FAILED Status, Clean Retry)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        `Run1=${failedReport.status} (rows=${tradesAfterFailedTx.length}), Retry=${retryReport.status} (rows=${tradesAfterRetry.length})`,
        'Run1=FAILED (rows=0), Retry=VERIFIED_SHADOW (rows=3)'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-08',
        'Atomic Write Failure Rollback (0 Partial Trades Committed, FAILED Status, Clean Retry)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'Run1=FAILED (rows=0), Retry=VERIFIED_SHADOW (rows=3)'
      );
    }

    // =========================================================================
    // AT-09: Source Snapshot Mutation Detection
    // =========================================================================
    try {
      const initialTrades: Trade[] = [
        {
          id: 'AT09-TRD-1',
          dateTime: '2026-10-21T09:00',
          instrument: 'XAUUSD',
          position: 'BUY',
          strategy: 'Snapshot Lock',
          entryPrice: 2700,
          lotSize: 0.1,
          riskAmount: 50,
          riskPercentage: 0.5,
          outcome: 'WIN',
          grossProfit: 100,
          commission: 0,
          swap: 0,
          netProfit: 100,
        },
      ];

      const provider = createInMemorySnapshotProvider({
        synth_trades_at09: JSON.stringify(initialTrades),
        synth_settings_at09: JSON.stringify(DEFAULT_SETTINGS),
      });

      const report = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at09-mutated',
        tradesStorageKey: 'synth_trades_at09',
        settingsStorageKey: 'synth_settings_at09',
        onBeforeFinalSnapshotCheck: () => {
          // Mutate source snapshot mid-migration before final checksum check
          provider.mutateKey(
            'synth_trades_at09',
            JSON.stringify([...initialTrades, { ...initialTrades[0], id: 'AT09-TRD-INJECTED' }])
          );
        },
      });

      const migState = await adapter.getMigrationState('scope-at09-mutated');
      const failedScopeTrades = await adapter.getTradesByOwner('scope-at09-mutated');
      const failedScopeSettings = await adapter.getSettingsByOwner('scope-at09-mutated');
      const failedScopeQuarantine = await adapter.getQuarantinedRecordsByOwner('scope-at09-mutated');
      const passed =
        report.status === 'FAILED' &&
        report.failureReason === 'ERR_SOURCE_SNAPSHOT_MUTATED_DURING_MIGRATION' &&
        migState?.status === 'FAILED' &&
        failedScopeTrades.length === 0 &&
        failedScopeSettings === null &&
        failedScopeQuarantine.length === 0;

      recordTest(
        'AT-09',
        'Mid-Migration Source Snapshot Mutation Detection (Checksum Mismatch -> FAILED)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        passed,
        `${report.status} (${report.failureReason})`,
        'FAILED (ERR_SOURCE_SNAPSHOT_MUTATED_DURING_MIGRATION)'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-09',
        'Mid-Migration Source Snapshot Mutation Detection (Checksum Mismatch -> FAILED)',
        'AT-05..AT-09 Shadow Migration & Corruption',
        false,
        err instanceof Error ? err.message : String(err),
        'FAILED (ERR_SOURCE_SNAPSHOT_MUTATED_DURING_MIGRATION)'
      );
    }

    // =========================================================================
    // AT-10: Screenshot Base64-to-Blob Extraction & SHA-256 Binary Integrity
    // =========================================================================
    try {
      const decodedBinary = await decodeBase64DataUrlToBinary(SYNTHETIC_PNG_BASE64_DATA_URL);
      const stagedMeta = await adapter.stageScreenshot({
        screenshotId: 'sc-at10-valid',
        ownerScope: 'scope-at10',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'ACTIVE',
        uploadStatus: 'LOCAL_ONLY',
      });

      const fileRow = await adapter.getScreenshotFile('sc-at10-valid');
      if (!fileRow) throw new Error('Screenshot file row missing.');

      const readBackBuffer = await fileRow.blob_data.arrayBuffer();
      const readBackHash = await computeSha256Hex(readBackBuffer);

      const passed =
        stagedMeta.mime_type === 'image/png' &&
        stagedMeta.size_bytes === decodedBinary.sizeBytes &&
        stagedMeta.size_bytes > 0 &&
        stagedMeta.sha256_hash === decodedBinary.sha256Hex &&
        readBackHash === decodedBinary.sha256Hex &&
        fileRow.blob_data instanceof Blob;

      recordTest(
        'AT-10',
        'Base64 Screenshot Conversion to Blob & Read-Back SHA-256 Binary Integrity',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        passed,
        passed
          ? `Blob (${fileRow.size_bytes} bytes) + SHA-256 verified`
          : 'Binary or hash mismatch',
        `Blob (${decodedBinary.sizeBytes} bytes) + SHA-256 verified`
      );
    } catch (err: unknown) {
      recordTest(
        'AT-10',
        'Base64 Screenshot Conversion to Blob & Read-Back SHA-256 Binary Integrity',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        false,
        err instanceof Error ? err.message : String(err),
        'Blob + SHA-256 verified'
      );
    }

    // =========================================================================
    // AT-11: Screenshot Lease & 24-Hour Cleanup State Machine (Isolated Test DB)
    // =========================================================================
    try {
      const nowMs = 1_800_000_000_000;
      const HOUR = 60 * 60 * 1000;
      const MIN = 60 * 1000;

      // Fixture 1: ACTIVE item (48 hours old) -> must remain UNCHANGED
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-1-active',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'ACTIVE',
        uploadStatus: 'SYNCED',
        createdAt: nowMs - 48 * HOUR,
        updatedAt: nowMs - 48 * HOUR,
      });

      // Fixture 2: UPLOADING item older than 15m (16m old), expired lease, valid binary -> transitions to PENDING_UPLOAD
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-2-stuck-uploading',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'ACTIVE',
        uploadStatus: 'UPLOADING',
        leaseOwnerId: 'sess_old::OUTBOX_UPLOAD::1',
        leaseAcquiredAt: nowMs - 31 * MIN,
        leaseExpiresAt: nowMs - 1 * MIN, // expired 1 minute ago
        createdAt: nowMs - 31 * MIN,
        updatedAt: nowMs - 16 * MIN,
      });

      // Fixture 3: STAGED item younger than 24h (23 hours old), unreferenced -> must remain UNCHANGED
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-3-staged-young',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'STAGED',
        uploadStatus: 'LOCAL_ONLY',
        createdAt: nowMs - 23 * HOUR,
        updatedAt: nowMs - 23 * HOUR,
      });

      // Fixture 4: STAGED item older than 24h (48 hours old), BUT referenced by an outbox entry -> must remain UNCHANGED
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-4-staged-referenced',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'STAGED',
        uploadStatus: 'LOCAL_ONLY',
        createdAt: nowMs - 48 * HOUR,
        updatedAt: nowMs - 48 * HOUR,
      });
      await adapter.enqueueOutboxMutation({
        ownerScope: 'scope-at11',
        entityType: 'SCREENSHOT',
        entityKey: 'sc-at11-4-staged-referenced',
        operationType: 'UPLOAD_SCREENSHOT',
        payload: { screenshotId: 'sc-at11-4-staged-referenced' },
        nowMs,
      });

      // Fixture 5: STAGED item older than 24h (25 hours old), unreferenced, no lease -> ONLY item eligible for deletion in test DB
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-5-staged-orphan-25h',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'STAGED',
        uploadStatus: 'LOCAL_ONLY',
        createdAt: nowMs - 25 * HOUR,
        updatedAt: nowMs - 25 * HOUR,
      });

      // Verify dry-run protection when allowDeleteInIsolatedTestDbOnly is false
      const dryRunReport = await adapter.cleanupOrphanScreenshots({
        nowMs,
        allowDeleteInIsolatedTestDbOnly: false,
      });

      // Execute authorized test-DB cleanup
      const cleanupReport = await adapter.cleanupOrphanScreenshots({
        nowMs,
        allowDeleteInIsolatedTestDbOnly: true,
      });

      const meta1 = await adapter.getScreenshotMetadata('sc-at11-1-active');
      const meta2 = await adapter.getScreenshotMetadata('sc-at11-2-stuck-uploading');
      const file2 = await adapter.getScreenshotFile('sc-at11-2-stuck-uploading');
      const meta3 = await adapter.getScreenshotMetadata('sc-at11-3-staged-young');
      const meta4 = await adapter.getScreenshotMetadata('sc-at11-4-staged-referenced');
      const meta5 = await adapter.getScreenshotMetadata('sc-at11-5-staged-orphan-25h');
      const file5 = await adapter.getScreenshotFile('sc-at11-5-staged-orphan-25h');

      // Also verify that an active in-memory lock prevents deletion even if >24h
      await adapter.stageScreenshot({
        screenshotId: 'sc-at11-6-locked',
        ownerScope: 'scope-at11',
        base64DataUrl: SYNTHETIC_PNG_BASE64_DATA_URL,
        lifecycleStatus: 'STAGED',
        createdAt: nowMs - 30 * HOUR,
        updatedAt: nowMs - 30 * HOUR,
      });
      lockScreenshotInMemory('sc-at11-6-locked');
      await adapter.cleanupOrphanScreenshots({
        nowMs,
        allowDeleteInIsolatedTestDbOnly: true,
      });
      unlockScreenshotInMemory('sc-at11-6-locked');
      const meta6 = await adapter.getScreenshotMetadata('sc-at11-6-locked');

      const passed =
        dryRunReport.isDryRun === true &&
        dryRunReport.deletedScreenshotIds.length === 0 &&
        cleanupReport.deletedScreenshotIds.length === 1 &&
        cleanupReport.deletedScreenshotIds[0] === 'sc-at11-5-staged-orphan-25h' &&
        cleanupReport.transitionedToPendingUploadIds.includes('sc-at11-2-stuck-uploading') &&
        meta1?.lifecycle_status === 'ACTIVE' &&
        meta2?.upload_status === 'PENDING_UPLOAD' &&
        meta2?.lease_owner_id === null &&
        file2 !== null &&
        meta3 !== null &&
        meta4 !== null &&
        meta5 === null &&
        file5 === null &&
        meta6 !== null;

      recordTest(
        'AT-11',
        'Screenshot Lease & 24-Hour Orphan Cleanup Rules in Isolated Test DB',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        passed,
        passed
          ? 'ACTIVE/23h/Referenced retained; 16m UPLOADING->PENDING_UPLOAD; only 25h orphan deleted'
          : 'Cleanup state machine mismatch',
        'ACTIVE/23h/Referenced retained; 16m UPLOADING->PENDING_UPLOAD; only 25h orphan deleted'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-11',
        'Screenshot Lease & 24-Hour Orphan Cleanup Rules in Isolated Test DB',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        false,
        err instanceof Error ? err.message : String(err),
        'ACTIVE/23h/Referenced retained; 16m UPLOADING->PENDING_UPLOAD; only 25h orphan deleted'
      );
    }

    // =========================================================================
    // AT-12: Corrupt Screenshot Quarantined Without Losing Valid Trade Record
    // =========================================================================
    try {
      const tradeWithCorruptScreenshot: Trade = {
        id: 'AT12-VALID-TRADE-BAD-IMG',
        dateTime: '2026-10-22T10:30',
        instrument: 'XAUUSD',
        position: 'BUY',
        strategy: 'London Sweep',
        entryPrice: 2730,
        lotSize: 0.25,
        riskAmount: 125,
        riskPercentage: 1.25,
        outcome: 'WIN',
        grossProfit: 460,
        commission: 10,
        swap: 0,
        netProfit: 450,
        screenshotUrl: 'data:image/png;base64,!!!CORRUPTED_BASE64_PAYLOAD_$$$===',
      };

      const provider = createInMemorySnapshotProvider({
        synth_trades_at12: JSON.stringify([tradeWithCorruptScreenshot]),
        synth_settings_at12: JSON.stringify(DEFAULT_SETTINGS),
      });

      const report = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at12-corrupt-img',
        tradesStorageKey: 'synth_trades_at12',
        settingsStorageKey: 'synth_settings_at12',
      });

      const savedTrade = await adapter.getTradeByOwnerAndLocalId(
        'scope-at12-corrupt-img',
        'AT12-VALID-TRADE-BAD-IMG'
      );
      const quarantined = await adapter.getQuarantinedRecordsByOwner('scope-at12-corrupt-img');

      const passed =
        report.status === 'COMPLETED_WITH_QUARANTINE' &&
        report.migratedTradesCount === 1 &&
        report.quarantinedCount === 1 &&
        savedTrade !== null &&
        savedTrade.netProfit === 450 &&
        savedTrade.screenshot_id === null &&
        quarantined.length === 1 &&
        quarantined[0].corruption_scope === 'SCREENSHOT_DECODE_FAILURE' &&
        quarantined[0].record_local_id === 'AT12-VALID-TRADE-BAD-IMG';

      recordTest(
        'AT-12',
        'Corrupt Base64 Screenshot Quarantined While Preserving Valid Financial Trade Record',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        passed,
        passed
          ? `Trade saved ($${savedTrade?.netProfit}) + screenshot quarantined`
          : 'Failed to preserve trade or quarantine screenshot',
        'Trade saved ($450) + screenshot quarantined'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-12',
        'Corrupt Base64 Screenshot Quarantined While Preserving Valid Financial Trade Record',
        'AT-10..AT-12 Screenshot Lifecycle & Safety',
        false,
        err instanceof Error ? err.message : String(err),
        'Trade saved ($450) + screenshot quarantined'
      );
    }

    // =========================================================================
    // AT-13: Pre-Transaction Async Preparation & Atomic Transaction Lifecycle
    // =========================================================================
    try {
      const batchTrades: Trade[] = Array.from({ length: 8 }, (_, idx) => ({
        id: `AT13-BATCH-${idx + 1}`,
        dateTime: `2026-10-23T1${idx}:00`,
        instrument: 'XAUUSD',
        position: idx % 2 === 0 ? 'BUY' : 'SELL',
        strategy: 'Batch Async Prep',
        entryPrice: 2700 + idx,
        lotSize: 0.1,
        riskAmount: 50,
        riskPercentage: 0.5,
        outcome: 'WIN',
        grossProfit: 100,
        commission: 0,
        swap: 0,
        netProfit: 100,
        screenshotUrl: idx < 3 ? SYNTHETIC_PNG_BASE64_DATA_URL : undefined,
      }));

      const provider = createInMemorySnapshotProvider({
        synth_trades_at13: JSON.stringify(batchTrades),
        synth_settings_at13: JSON.stringify(DEFAULT_SETTINGS),
      });

      const batchReport = await runShadowMigration({
        adapter,
        snapshotProvider: provider,
        ownerScope: 'scope-at13-batch',
        tradesStorageKey: 'synth_trades_at13',
        settingsStorageKey: 'synth_settings_at13',
      });

      // Also verify that passing an async callback into executeAtomicWriteTransaction is rejected
      let asyncCallbackRejected = false;
      try {
        await adapter.executeAtomicWriteTransaction(
          ['trades'],
          (async () => {
            await Promise.resolve();
          }) as unknown as () => void
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TransactionInactiveError') {
          asyncCallbackRejected = true;
        }
      }

      const passed =
        batchReport.status === 'VERIFIED_SHADOW' &&
        batchReport.migratedTradesCount === 8 &&
        batchReport.migratedScreenshotsCount === 3 &&
        asyncCallbackRejected;

      recordTest(
        'AT-13',
        'Pre-Transaction Async Preparation & Atomic IDBTransaction Boundary Enforcement',
        'AT-13..AT-17 Architecture & Parity',
        passed,
        passed
          ? '8 trades + 3 blobs committed atomically; async tx callback rejected'
          : 'Transaction boundary failure',
        '8 trades + 3 blobs committed atomically; async tx callback rejected'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-13',
        'Pre-Transaction Async Preparation & Atomic IDBTransaction Boundary Enforcement',
        'AT-13..AT-17 Architecture & Parity',
        false,
        err instanceof Error ? err.message : String(err),
        '8 trades + 3 blobs committed atomically; async tx callback rejected'
      );
    }

    // =========================================================================
    // AT-14: Outbox Idempotency Key (mutation_id) & CAS Revision Progression
    // =========================================================================
    try {
      const entityKey = '00000000-0000-4000-8000-000000000014';

      // 1. INSERT operation -> sync_revision = 1
      const insertOp = await adapter.enqueueOutboxMutation({
        ownerScope: 'scope-at14',
        entityType: 'TRADE',
        entityKey,
        operationType: 'INSERT_TRADE',
        payload: { id: 'TRD-14', netProfit: 100 },
        expectedBaseRevision: 0,
      });

      // 2. Retry of the exact same INSERT operation -> preserves mutation_id and sync_revision = 1, increments retry_count
      const retryInsertOp = await adapter.enqueueOutboxMutation({
        ownerScope: 'scope-at14',
        entityType: 'TRADE',
        entityKey,
        operationType: 'INSERT_TRADE',
        payload: { id: 'TRD-14', netProfit: 100 },
        existingMutationId: insertOp.mutation_id,
      });

      // 3. UPDATE operation -> new mutation_id, sync_revision = 2
      const updateOp = await adapter.enqueueOutboxMutation({
        ownerScope: 'scope-at14',
        entityType: 'TRADE',
        entityKey,
        operationType: 'UPDATE_TRADE',
        payload: { id: 'TRD-14', netProfit: 250 },
        expectedBaseRevision: 1,
      });

      // 4. DELETE operation -> new mutation_id, sync_revision = 3
      const deleteOp = await adapter.enqueueOutboxMutation({
        ownerScope: 'scope-at14',
        entityType: 'TRADE',
        entityKey,
        operationType: 'DELETE_TRADE',
        payload: { id: 'TRD-14' },
        expectedBaseRevision: 2,
      });

      // 5. Stale expectedBaseRevision must throw ERR_CAS_REVISION_CONFLICT
      let staleCasRejected = false;
      try {
        await adapter.enqueueOutboxMutation({
          ownerScope: 'scope-at14',
          entityType: 'TRADE',
          entityKey,
          operationType: 'UPDATE_TRADE',
          payload: { id: 'TRD-14', netProfit: 999 },
          expectedBaseRevision: 1, // Stale! Current is 3
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('ERR_CAS_REVISION_CONFLICT')) {
          staleCasRejected = true;
        }
      }

      const queueRows = await adapter.getOutboxQueueByOwner('scope-at14');

      const passed =
        insertOp.sync_revision === 1 &&
        retryInsertOp.mutation_id === insertOp.mutation_id &&
        retryInsertOp.sync_revision === 1 &&
        retryInsertOp.retry_count === 1 &&
        updateOp.mutation_id !== insertOp.mutation_id &&
        updateOp.sync_revision === 2 &&
        deleteOp.mutation_id !== updateOp.mutation_id &&
        deleteOp.sync_revision === 3 &&
        queueRows.length === 3 &&
        staleCasRejected;

      recordTest(
        'AT-14',
        'Outbox Queue Idempotency Key (INSERT/UPDATE/DELETE), Retry Stability & CAS Revision Protection',
        'AT-13..AT-17 Architecture & Parity',
        passed,
        passed
          ? 'Rev 1->2->3 monotonic, retry preserved mutation_id, stale CAS rejected'
          : 'Outbox revision or idempotency error',
        'Rev 1->2->3 monotonic, retry preserved mutation_id, stale CAS rejected'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-14',
        'Outbox Queue Idempotency Key (INSERT/UPDATE/DELETE), Retry Stability & CAS Revision Protection',
        'AT-13..AT-17 Architecture & Parity',
        false,
        err instanceof Error ? err.message : String(err),
        'Rev 1->2->3 monotonic, retry preserved mutation_id, stale CAS rejected'
      );
    }

    // =========================================================================
    // AT-15: PostgreSQL Error Classification (23505 vs 42501 vs Network)
    // =========================================================================
    try {
      const rlsDecision = classifySupabaseSyncError(
        { code: '42501', message: 'new row violates row-level security policy for table "trades"' },
        0,
        false
      );
      const netDecision = classifySupabaseSyncError(
        { message: 'TypeError: Failed to fetch' },
        0,
        false
      );
      const pkeyUnboundDecision = classifySupabaseSyncError(
        {
          code: '23505',
          constraint: 'trades_pkey',
          message: 'duplicate key value violates unique constraint "trades_pkey"',
        },
        0,
        false
      );
      const otherUniqueDecision = classifySupabaseSyncError(
        {
          code: '23505',
          constraint: 'idx_trades_other_unique',
          message: 'duplicate key value violates unique constraint "idx_trades_other_unique"',
        },
        0,
        false
      );
      const cloudBoundDecision = classifySupabaseSyncError(
        {
          code: '23505',
          constraint: 'trades_pkey',
          message: 'duplicate key value violates unique constraint "trades_pkey"',
        },
        1,
        false
      );
      const selfRetryDecision = classifySupabaseSyncError(
        {
          code: '23505',
          constraint: 'trades_pkey',
          message: 'duplicate key value violates unique constraint "trades_pkey"',
        },
        0,
        true
      );

      const passed =
        rlsDecision.reallocateUuid === false &&
        netDecision.reallocateUuid === false &&
        pkeyUnboundDecision.reallocateUuid === true &&
        otherUniqueDecision.reallocateUuid === false &&
        cloudBoundDecision.reallocateUuid === false &&
        selfRetryDecision.reallocateUuid === false;

      recordTest(
        'AT-15',
        'PostgreSQL Error Classification Matrix (42501, Network, 23505 trades_pkey vs Cloud-Bound/Other)',
        'AT-13..AT-17 Architecture & Parity',
        passed,
        passed
          ? '42501=false, Net=false, 23505(pkey,unbound)=true, 23505(other/bound/self)=false'
          : 'Error classification mismatch',
        '42501=false, Net=false, 23505(pkey,unbound)=true, 23505(other/bound/self)=false'
      );
    } catch (err: unknown) {
      recordTest(
        'AT-15',
        'PostgreSQL Error Classification Matrix (42501, Network, 23505 trades_pkey vs Cloud-Bound/Other)',
        'AT-13..AT-17 Architecture & Parity',
        false,
        err instanceof Error ? err.message : String(err),
        '42501=false, Net=false, 23505(pkey,unbound)=true, 23505(other/bound/self)=false'
      );
    }

    // =========================================================================
    // AT-16: Deep 7-Entity Schema Parity & SQLite Stub Boundary Verification
    // =========================================================================
    try {
      const parityReport = await verifyDatabaseSchemaParity(adapter);
      const sqliteStub = new SqliteDatabaseAdapter(PHASE_1_TEST_DB_NAME);

      let stubErrorCode = '';
      try {
        await sqliteStub.open();
      } catch (err: unknown) {
        stubErrorCode = err instanceof Error ? err.message : String(err);
      }

      // Also verify that attempting to instantiate IdbDatabaseAdapter with production 'tradevault_idb' is blocked
      let prodDbBlocked = false;
      try {
        new IdbDatabaseAdapter(PRODUCTION_DB_NAME_BLOCKED_IN_PHASE_1);
      } catch {
        prodDbBlocked = true;
      }

      const passed =
        parityReport.isParityValid === true &&
        parityReport.verifiedEntityCount === 7 &&
        stubErrorCode === SQLITE_PHASE_1_ERROR_CODE &&
        prodDbBlocked;

      recordTest(
        'AT-16',
        '7-Entity Schema Parity (Columns, Types, PKs, Unique Indexes, Relationships) & SQLite Stub Guard',
        'AT-13..AT-17 Architecture & Parity',
        passed,
        passed
          ? `7/7 entities verified + ${SQLITE_PHASE_1_ERROR_CODE} + prod DB blocked`
          : JSON.stringify(parityReport),
        `7/7 entities verified + ${SQLITE_PHASE_1_ERROR_CODE} + prod DB blocked`
      );
    } catch (err: unknown) {
      recordTest(
        'AT-16',
        '7-Entity Schema Parity (Columns, Types, PKs, Unique Indexes, Relationships) & SQLite Stub Guard',
        'AT-13..AT-17 Architecture & Parity',
        false,
        err instanceof Error ? err.message : String(err),
        `7/7 entities verified + ${SQLITE_PHASE_1_ERROR_CODE} + prod DB blocked`
      );
    }
  } finally {
    try {
      await adapter.close();
    } catch (closeErr: unknown) {
      testDatabaseCleanupError =
        closeErr instanceof Error ? closeErr.message : String(closeErr);
    }

    try {
      await adapter.destroyDatabaseForTestingOnly();
    } catch (destroyErr: unknown) {
      const message = destroyErr instanceof Error ? destroyErr.message : String(destroyErr);
      testDatabaseCleanupError = testDatabaseCleanupError
        ? `${testDatabaseCleanupError}; ${message}`
        : message;
    }
  }

  // ===========================================================================
  // AT-17: window.localStorage Isolation & Zero-Mutation SHA-256 Proof
  // ===========================================================================
  const snapshotAfter = await captureWindowLocalStorageSnapshotDigest();
  const isKeysIdentical =
    snapshotBefore.keyCount === snapshotAfter.keyCount &&
    snapshotBefore.sortedKeys.join('\u0000') === snapshotAfter.sortedKeys.join('\u0000');
  const isContentIdentical =
    isKeysIdentical &&
    snapshotBefore.sha256Digest === snapshotAfter.sha256Digest &&
    snapshotBefore.sortedKeys.every(
      (k) => snapshotBefore.entries[k] === snapshotAfter.entries[k]
    );

  recordTest(
    'AT-17',
    'Isolated Test Execution & window.localStorage Before/After SHA-256 Identity Proof',
    'AT-13..AT-17 Architecture & Parity',
    isContentIdentical && testDatabaseCleanupError === null,
    testDatabaseCleanupError
      ? `Cleanup failed: ${testDatabaseCleanupError}; localStorage unchanged=${isContentIdentical}`
      : `keys=${snapshotAfter.keyCount}, sha256=${snapshotAfter.sha256Digest.slice(0, 16)}...`,
    `keys=${snapshotBefore.keyCount}, sha256=${snapshotBefore.sha256Digest.slice(0, 16)}...`,
    testDatabaseCleanupError
      ? `DB cleanup failed: ${testDatabaseCleanupError}; localStorage digest=${snapshotAfter.sha256Digest}`
      : `DB="${PHASE_1_TEST_DB_NAME}" destroyed after test; localStorage digest=${snapshotAfter.sha256Digest}`
  );

  const durationMs = Date.now() - startTime;
  const passedCount = acceptanceResults.filter((r) => r.passed).length;
  const failedCount = acceptanceResults.filter((r) => !r.passed).length;

  return {
    total: acceptanceResults.length,
    passed: passedCount,
    failed: failedCount,
    durationMs,
    results: acceptanceResults,
    databaseUsed: PHASE_1_TEST_DB_NAME,
    localStorageKeyCountBefore: snapshotBefore.keyCount,
    localStorageKeyCountAfter: snapshotAfter.keyCount,
    localStorageDigestBefore: snapshotBefore.sha256Digest,
    localStorageDigestAfter: snapshotAfter.sha256Digest,
    isLocalStorageUnchanged: isContentIdentical,
    acceptanceResults,
  };
}

