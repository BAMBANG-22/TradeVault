import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  evaluateSingleEventForGold,
  computeDeterministicMacroSnapshot,
  analyzeStatementTone,
  isFedSpeechEvent,
  computePreNewsLockState,
  MacroCalendarEvent,
  IntermarketAssetPulse,
} from '../src/utils/macroNewsEngine';

console.log('=== RUNNING 100% AUTOMATIC PRE-NEWS VOLATILITY ENGINE & T-5M LOCK TESTS ===\n');

const mockPulse: {
  dxy: IntermarketAssetPulse;
  usoil: IntermarketAssetPulse;
  us10y: IntermarketAssetPulse;
} = {
  dxy: {
    symbol: 'DXY',
    yahooTicker: 'DX-Y.NYB',
    name: 'US Dollar Index',
    price: 104.5,
    previousClose: 104.5,
    change: 0,
    changePercent: 0,
    direction: 'FLAT',
    goldCorrelationEffect: 'NEUTRAL',
    summaryId: 'DXY datar',
    summaryEn: 'DXY flat',
    updatedAt: new Date().toISOString(),
  },
  usoil: {
    symbol: 'USOIL',
    yahooTicker: 'CL=F',
    name: 'US Oil',
    price: 78.0,
    previousClose: 78.0,
    change: 0,
    changePercent: 0,
    direction: 'FLAT',
    goldCorrelationEffect: 'NEUTRAL',
    summaryId: 'Minyak stabil',
    summaryEn: 'Oil stable',
    updatedAt: new Date().toISOString(),
  },
  us10y: {
    symbol: 'US10Y',
    yahooTicker: '^TNX',
    name: 'US 10Y Yield',
    price: 4.3,
    previousClose: 4.3,
    change: 0,
    changePercent: 0,
    direction: 'FLAT',
    goldCorrelationEffect: 'NEUTRAL',
    summaryId: 'Yield stabil',
    summaryEn: 'Yield stable',
    updatedAt: new Date().toISOString(),
  },
};

// ---------------------------------------------------------------------------
// 1. Pre-News Calendar Expectations & Simultaneous Release Grouping
// ---------------------------------------------------------------------------
{
  const releaseTime = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 mins ahead
  const events: MacroCalendarEvent[] = [
    {
      id: 'cpi-core',
      title: 'US Core CPI m/m',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '0.3%',
      forecast: '0.2%',
      actual: '',
      previousNum: 0.3,
      forecastNum: 0.2,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Forecast < Previous',
      biasReasonEn: 'Forecast < Previous',
    },
    {
      id: 'cpi-headline',
      title: 'US CPI m/m',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '0.4%',
      forecast: '0.2%',
      actual: '',
      previousNum: 0.4,
      forecastNum: 0.2,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Forecast < Previous',
      biasReasonEn: 'Forecast < Previous',
    },
  ];

  const snap = computeDeterministicMacroSnapshot({
    calendarEvents: events,
    intermarketPulse: mockPulse,
    breakingNews: [],
  });

  assert.strictEqual(snap.scenarioMatrix.isSimultaneousRelease, true, 'Must detect simultaneous release');
  assert.strictEqual(snap.scenarioMatrix.simultaneousEvents.length, 1, 'Simultaneous events must contain CPI m/m');
  assert.strictEqual(snap.scenarioMatrix.simultaneousAlignment, 'ALIGNED_BUY');
  assert.strictEqual(snap.scenarioMatrix.dominantBias, 'BUY');
  assert.ok(snap.scenarioMatrix.buyProbability >= 60, 'Aligned simultaneous BUY should have >= 60% conviction');
  assert.ok(
    snap.scenarioMatrix.t5ExecutionTacticId?.includes('BIAS 1 ARAH KUAT (FINAL T-5M)'),
    'Strong 1-way bias (>= 60%) must generate BIAS 1 ARAH KUAT (FINAL T-5M) tactic'
  );

  console.log('✓ PASS [1]: Simultaneous Pre-News release grouping & Strong 1-Way T-5M tactic verified');
}

// ---------------------------------------------------------------------------
// 2. Simultaneous Release Conflict Detection (MIXED >= 40% & RISIKO WHIPSAW SAAT RILIS)
// ---------------------------------------------------------------------------
{
  const releaseTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const conflictingEvents: MacroCalendarEvent[] = [
    {
      id: 'nfp-main',
      title: 'US Non-Farm Employment Change (NFP)',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '150K',
      forecast: '200K', // Stronger labor -> SELL Gold
      actual: '',
      previousNum: 150,
      forecastNum: 200,
      actualNum: null,
      unit: 'K',
      pillar: 'LABOR',
      isInverseIndicator: false,
      eventBiasForGold: 'SELL',
      biasReasonId: 'NFP naik',
      biasReasonEn: 'NFP up',
    },
    {
      id: 'unemp-rate',
      title: 'US Unemployment Rate',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '4.0%',
      forecast: '4.3%', // Higher unemployment (Inverse) -> BUY Gold
      actual: '',
      previousNum: 4.0,
      forecastNum: 4.3,
      actualNum: null,
      unit: '%',
      pillar: 'LABOR',
      isInverseIndicator: true,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Pengangguran naik',
      biasReasonEn: 'Unemployment up',
    },
  ];

  const conflictSnap = computeDeterministicMacroSnapshot({
    calendarEvents: conflictingEvents,
    intermarketPulse: mockPulse,
    breakingNews: [],
  });

  assert.strictEqual(conflictSnap.scenarioMatrix.isSimultaneousRelease, true);
  assert.strictEqual(conflictSnap.scenarioMatrix.simultaneousAlignment, 'CONFLICTING_WHIPSAW');
  assert.ok(
    conflictSnap.scenarioMatrix.mixedProbability >= 40,
    `Conflicting simultaneous releases must produce mixedProbability >= 40% (got ${conflictSnap.scenarioMatrix.mixedProbability}%)`
  );
  assert.ok(
    conflictSnap.scenarioMatrix.whipsawWarningId.includes('RISIKO WHIPSAW SAAT RILIS'),
    'Whipsaw warning must include RISIKO WHIPSAW SAAT RILIS'
  );
  assert.ok(
    conflictSnap.scenarioMatrix.t5ExecutionTacticId?.includes('POTENSI SPIKE 2 ARAH / WHIPSAW (FINAL T-5M)'),
    'Conflicting release must produce POTENSI SPIKE 2 ARAH / WHIPSAW (FINAL T-5M) tactic'
  );

  console.log('✓ PASS [2]: Simultaneous Release Conflict detection (>= 40% MIXED & RISIKO WHIPSAW SAAT RILIS) verified');
}

// ---------------------------------------------------------------------------
// 3. Intermarket Divergence Confirmation (DXY & US10Y moving opposite to Calendar)
// ---------------------------------------------------------------------------
{
  const releaseTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const buyCalendarEvent: MacroCalendarEvent[] = [
    {
      id: 'cpi-soft',
      title: 'US Core CPI m/m',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '0.3%',
      forecast: '0.2%', // Expecting softer inflation -> BUY Gold
      actual: '',
      previousNum: 0.3,
      forecastNum: 0.2,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Forecast lebih rendah',
      biasReasonEn: 'Lower forecast',
    },
  ];

  // However, DXY and US10Y are both rising strongly ahead of release (Bearish Gold / Divergence!)
  const divergingPulse = {
    ...mockPulse,
    dxy: {
      ...mockPulse.dxy,
      changePercent: 0.35,
      direction: 'UP' as const,
      goldCorrelationEffect: 'BEARISH_GOLD' as const,
    },
    us10y: {
      ...mockPulse.us10y,
      changePercent: 1.2,
      direction: 'UP' as const,
      goldCorrelationEffect: 'BEARISH_GOLD' as const,
    },
  };

  const divSnap = computeDeterministicMacroSnapshot({
    calendarEvents: buyCalendarEvent,
    intermarketPulse: divergingPulse,
    breakingNews: [],
  });

  const hasDivergenceArg = divSnap.scenarioMatrix.sellArguments.some((a) =>
    a.tag.includes('DIVERGENSI DXY & US10Y')
  );
  assert.strictEqual(
    hasDivergenceArg,
    true,
    'Must detect Intermarket Divergence when DXY & US10Y move opposite to BUY calendar expectation'
  );

  console.log('✓ PASS [3]: Real-Time Intermarket Divergence (DXY & US10Y vs Calendar) verified');
}

// ---------------------------------------------------------------------------
// 4. T-5M Automatic Lock State (computePreNewsLockState)
// ---------------------------------------------------------------------------
{
  const baseNow = Date.now();
  const evIn14Mins: MacroCalendarEvent = {
    id: 'ev-14m',
    title: 'US Core PCE Price Index m/m',
    country: 'USD',
    date: new Date(baseNow + 14 * 60 * 1000 + 32 * 1000).toISOString(),
    impact: 'High',
    previous: '0.3%',
    forecast: '0.2%',
    actual: '',
    previousNum: 0.3,
    forecastNum: 0.2,
    actualNum: null,
    unit: '%',
    pillar: 'INFLATION',
    isInverseIndicator: false,
    eventBiasForGold: 'BUY',
    biasReasonId: 'Buy',
    biasReasonEn: 'Buy',
  };

  // Before T-5M (14:32 remaining)
  const stateBefore = computePreNewsLockState([evIn14Mins], baseNow);
  assert.strictEqual(stateBefore.isLockedT5M, false);
  assert.strictEqual(stateBefore.statusLabelId, 'Auto-Update Final pada T-05:00');
  assert.strictEqual(stateBefore.countdownHms, '00:14:32');

  // Inside T-5M (04:15 remaining)
  const evIn4Mins: MacroCalendarEvent = {
    ...evIn14Mins,
    id: 'ev-4m',
    date: new Date(baseNow + 4 * 60 * 1000 + 15 * 1000).toISOString(),
  };
  const stateInside = computePreNewsLockState([evIn4Mins], baseNow);
  assert.strictEqual(stateInside.isLockedT5M, true);
  assert.strictEqual(stateInside.statusLabelId, 'FINAL PRE-NEWS LOCKED (T-5M)');
  assert.strictEqual(stateInside.countdownHms, '00:04:15');

  console.log('✓ PASS [4]: T-5M Lock state (Auto-Update Final pada T-05:00 -> FINAL PRE-NEWS LOCKED (T-5M)) verified');
}

// ---------------------------------------------------------------------------
// 5. Verify Zero Manual Input & First-Second Action Card in MacroNewsView.tsx
// ---------------------------------------------------------------------------
{
  const viewSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/news/MacroNewsView.tsx'),
    'utf8'
  );

  // Must NOT contain manual override inputs/buttons
  assert.strictEqual(
    viewSrc.includes('toggle-input-actual-btn'),
    false,
    'MacroNewsView must NOT contain manual Input Actual toggle button'
  );
  assert.strictEqual(
    viewSrc.includes('macro-actual-input-drawer'),
    false,
    'MacroNewsView must NOT contain manual actual input drawer'
  );
  assert.strictEqual(
    viewSrc.includes('recalculate-bias-btn'),
    false,
    'MacroNewsView must NOT contain manual recalculate bias button'
  );
  assert.strictEqual(
    viewSrc.includes('Tempel Breaking News'),
    false,
    'MacroNewsView must NOT contain manual Tempel Breaking News input'
  );

  // Must contain T-5M Execution Card & Lock Status Badges
  assert.ok(
    viewSrc.includes('data-testid="macro-t5-action-card"') &&
      viewSrc.includes('data-testid="macro-t5-countdown-timer"') &&
      viewSrc.includes('data-testid="macro-t5-probabilities-grid"') &&
      viewSrc.includes('data-testid="macro-t5-execution-tactic"') &&
      viewSrc.includes('data-testid="macro-t5-lock-status-badge"'),
    'MacroNewsView must render T-5M First-Second Action Card, Countdown Timer, Probabilities, and Lock Status Badge'
  );

  assert.ok(
    evaluateSingleEventForGold('US Core CPI m/m', 0.3, 0.2, 0.4).bias === 'SELL' &&
      analyzeStatementTone('Waller signals support for 25-50 bps rate hike') === 'HAWKISH' &&
      isFedSpeechEvent('Fed Chair Powell Speaks') === true,
    'Core deterministic functions must remain intact'
  );

  console.log('✓ PASS [5]: Zero Manual Input UI & First-Second Action Card verified in MacroNewsView.tsx');
}

console.log('\n=== ALL 100% AUTOMATIC PRE-NEWS VOLATILITY ENGINE TESTS PASSED ===');
