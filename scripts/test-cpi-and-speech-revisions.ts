import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  evaluateSingleEventForGold,
  computeDeterministicMacroSnapshot,
  analyzeStatementTone,
  isFedSpeechEvent,
  MacroCalendarEvent,
  IntermarketAssetPulse,
} from '../src/utils/macroNewsEngine';

console.log('=== RUNNING CPI RELEASE, SIMULTANEOUS GROUPING & SPEECH OVERRIDE TEST ===\n');

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
// 1. Post-News Inflation Priority (Actual > Forecast => SELL even if Actual < Previous)
// ---------------------------------------------------------------------------
{
  // Core CPI: Previous 0.4%, Forecast 0.2%, Actual 0.3%
  // 0.3% > 0.2% (beating forecast) => MUST BE SELL XAU/USD!
  const coreCpiEval = evaluateSingleEventForGold('US Core CPI m/m', 0.3, 0.2, 0.4);
  assert.strictEqual(
    coreCpiEval.bias,
    'SELL',
    'Core CPI Actual (0.3%) > Forecast (0.2%) must produce SELL XAU/USD despite Actual < Previous (0.4%)'
  );
  assert.ok(
    coreCpiEval.reasonId.includes('Aktual') && coreCpiEval.reasonId.includes('0.3'),
    'Reason must explain Actual vs Forecast comparison'
  );

  // CPI m/m: Previous 0.5%, Forecast 0.3%, Actual 0.4%
  const cpiEval = evaluateSingleEventForGold('US CPI m/m', 0.4, 0.3, 0.5);
  assert.strictEqual(
    cpiEval.bias,
    'SELL',
    'CPI m/m Actual (0.4%) > Forecast (0.3%) must produce SELL XAU/USD'
  );

  console.log('✓ PASS [1]: Post-News inflation priority: Actual > Forecast produces strong SELL XAU/USD');
}

// ---------------------------------------------------------------------------
// 2. Simultaneous Release Grouping (Core CPI + CPI m/m at 20:30 WIB)
// ---------------------------------------------------------------------------
{
  const releaseTime = new Date('2026-11-12T13:30:00Z').toISOString(); // 20:30 WIB
  const events: MacroCalendarEvent[] = [
    {
      id: 'cpi-core',
      title: 'US Core CPI m/m',
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
      biasReasonId: 'Initial buy',
      biasReasonEn: 'Initial buy',
    },
    {
      id: 'cpi-headline',
      title: 'US CPI m/m',
      country: 'USD',
      date: releaseTime,
      impact: 'High',
      previous: '0.5%',
      forecast: '0.3%',
      actual: '',
      previousNum: 0.5,
      forecastNum: 0.3,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Initial buy',
      biasReasonEn: 'Initial buy',
    },
  ];

  const snap = computeDeterministicMacroSnapshot({
    calendarEvents: events,
    intermarketPulse: mockPulse,
    breakingNews: [],
    selectedEventId: 'cpi-core',
  });

  assert.strictEqual(snap.scenarioMatrix.isSimultaneousRelease, true, 'Must detect simultaneous release');
  assert.strictEqual(snap.scenarioMatrix.simultaneousEvents.length, 1, 'Simultaneous events must contain CPI m/m');
  assert.strictEqual(snap.scenarioMatrix.simultaneousEvents[0].id, 'cpi-headline');

  // Test Actual Override through customActualOverrides:
  // User types 0.3% for Core CPI and 0.4% for Headline CPI -> both beat forecast!
  const updatedSnap = computeDeterministicMacroSnapshot({
    calendarEvents: events,
    intermarketPulse: mockPulse,
    breakingNews: [],
    selectedEventId: 'cpi-core',
    customActualOverrides: {
      'cpi-core': '0.3%',
      'cpi-headline': '0.4%',
    },
  });

  assert.strictEqual(updatedSnap.scenarioMatrix.primaryEvent.actual, '0.3%');
  assert.strictEqual(updatedSnap.scenarioMatrix.primaryEvent.actualNum, 0.3);
  assert.strictEqual(updatedSnap.scenarioMatrix.primaryEvent.eventBiasForGold, 'SELL');
  assert.strictEqual(updatedSnap.scenarioMatrix.simultaneousEvents[0].actual, '0.4%');
  assert.strictEqual(updatedSnap.scenarioMatrix.simultaneousEvents[0].actualNum, 0.4);
  assert.strictEqual(updatedSnap.scenarioMatrix.simultaneousEvents[0].eventBiasForGold, 'SELL');
  assert.strictEqual(updatedSnap.scenarioMatrix.simultaneousAlignment, 'ALIGNED_SELL');
  assert.strictEqual(updatedSnap.scenarioMatrix.dominantBias, 'SELL');

  console.log('✓ PASS [2]: Simultaneous release grouping & Actual overrides trigger instant Post-News re-evaluation to SELL');
}

// ---------------------------------------------------------------------------
// 3. Fed Speech & Headline Tone Analysis (Hawkish vs Dovish vs Neutral Note)
// ---------------------------------------------------------------------------
{
  assert.strictEqual(
    analyzeStatementTone('Waller signals support for 25-50 bps rate hike amid sticky inflation'),
    'HAWKISH'
  );
  assert.strictEqual(
    analyzeStatementTone('Powell: Labor market cooling, time has come for rate cuts'),
    'DOVISH'
  );
  assert.strictEqual(
    analyzeStatementTone('FOMC Member speaks at economic club luncheon'),
    'NEUTRAL'
  );

  // Test Hawkish Override
  const hawkishSnap = computeDeterministicMacroSnapshot({
    calendarEvents: [],
    intermarketPulse: mockPulse,
    breakingNews: [],
    customHeadlineText: 'Waller: Inflation is sticky, Fed should hike 25 bps',
  });
  assert.strictEqual(hawkishSnap.scenarioMatrix.dynamicPivotTriggered, true);
  assert.strictEqual(hawkishSnap.scenarioMatrix.dynamicPivotType, 'HAWKISH_OVERRIDE');
  assert.strictEqual(hawkishSnap.scenarioMatrix.dominantBias, 'SELL');

  // Test Dovish Override
  const dovishSnap = computeDeterministicMacroSnapshot({
    calendarEvents: [],
    intermarketPulse: mockPulse,
    breakingNews: [],
    customHeadlineText: 'Powell: Easing cycle ready, rate cuts to commence immediately',
  });
  assert.strictEqual(dovishSnap.scenarioMatrix.dynamicPivotTriggered, true);
  assert.strictEqual(dovishSnap.scenarioMatrix.dynamicPivotType, 'DOVISH_OVERRIDE');
  assert.strictEqual(dovishSnap.scenarioMatrix.dominantBias, 'BUY');

  // Test Fed speech scheduled today with NO statement headline -> Cautionary Note
  const todaySpeechEvents: MacroCalendarEvent[] = [
    {
      id: 'fed-powell-speaks',
      title: 'Fed Chair Powell Speaks',
      country: 'USD',
      date: new Date().toISOString(),
      impact: 'High',
      previous: '',
      forecast: '',
      actual: '',
      previousNum: null,
      forecastNum: null,
      actualNum: null,
      unit: '',
      pillar: 'POLICY',
      isInverseIndicator: false,
      eventBiasForGold: 'MIXED',
      biasReasonId: 'Pending speech',
      biasReasonEn: 'Pending speech',
    },
  ];

  const speechScheduledSnap = computeDeterministicMacroSnapshot({
    calendarEvents: todaySpeechEvents,
    intermarketPulse: mockPulse,
    breakingNews: [],
  });

  assert.strictEqual(isFedSpeechEvent('Fed Chair Powell Speaks'), true);
  assert.ok(
    speechScheduledSnap.scenarioMatrix.fedSpeechAlertNoteId &&
      speechScheduledSnap.scenarioMatrix.fedSpeechAlertNoteId.includes('Waspada jadwal pidato pejabat Fed hari ini'),
    'Must show neutral cautionary note when Fed speech is on calendar today without statement'
  );

  console.log('✓ PASS [3]: Fed speech tone analysis, Hawkish Override, Dovish Override, and Cautionary Note verified');
}

// ---------------------------------------------------------------------------
// 4. Verify MacroNewsView UI Structure
// ---------------------------------------------------------------------------
{
  const viewSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/news/MacroNewsView.tsx'),
    'utf8'
  );

  assert.ok(
    viewSrc.includes('data-testid="toggle-input-actual-btn"') &&
      viewSrc.includes('data-testid="macro-actual-input-drawer"') &&
      viewSrc.includes('data-testid="recalculate-bias-btn"'),
    'MacroNewsView must render Input Actual toggle, actual input drawer, and recalculate bias button'
  );
  assert.ok(
    viewSrc.includes('PINDAH HALUAN: HAWKISH OVERRIDE') &&
      viewSrc.includes('PINDAH HALUAN: DOVISH OVERRIDE'),
    'MacroNewsView must render PINDAH HALUAN: HAWKISH OVERRIDE and PINDAH HALUAN: DOVISH OVERRIDE badges'
  );
  assert.ok(
    viewSrc.includes('data-testid="macro-fed-speech-alert-note"'),
    'MacroNewsView must render macro-fed-speech-alert-note'
  );

  console.log('✓ PASS [4]: UI components for Input Actual, Recalculate Bias, and Pindah Haluan badges verified');
}

console.log('\n=== ALL NEW REVISION TESTS PASSED ===');
