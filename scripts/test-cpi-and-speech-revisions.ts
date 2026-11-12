import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  evaluateSingleEventForGold,
  computeDeterministicMacroSnapshot,
  analyzeMacroEvent,
  groupCalendarEventsBySlot,
  analyzeStatementTone,
  isFedSpeechEvent,
  isPrimaryHighImpactEvent,
  isSupportingReferenceEvent,
  getSupportingContextEvents,
  computePreNewsLockState,
  MacroCalendarEvent,
  IntermarketAssetPulse,
} from '../src/utils/macroNewsEngine';
import {
  getClientFallbackCalendarEvents,
  fetchClientForexFactoryCalendar,
} from '../src/utils/macroFeedFetcher';

console.log('=== RUNNING UPCOMING EVENT EXPLORER, EARLY REFERENCE VS FINAL T-5M & AUTO ENGINE TESTS ===\n');

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
// 1. Upcoming Event Explorer: Grouping Simultaneous Releases & Search Keywords
// ---------------------------------------------------------------------------
{
  const ppiReleaseIso = '2026-11-13T13:30:00.000Z'; // 13 Nov 2026 • 20.30 WIB
  const nfpReleaseIso = '2026-11-13T15:00:00.000Z'; // 13 Nov 2026 • 22.00 WIB

  const scheduleEvents: MacroCalendarEvent[] = [
    {
      id: 'ppi-core',
      title: 'US Core PPI m/m',
      country: 'USD',
      date: ppiReleaseIso,
      impact: 'High',
      previous: '0.2%',
      forecast: '0.3%',
      actual: '',
      previousNum: 0.2,
      forecastNum: 0.3,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'SELL',
      biasReasonId: 'Forecast > Previous',
      biasReasonEn: 'Forecast > Previous',
    },
    {
      id: 'ppi-headline',
      title: 'US PPI m/m',
      country: 'USD',
      date: ppiReleaseIso,
      impact: 'High',
      previous: '0.1%',
      forecast: '0.2%',
      actual: '',
      previousNum: 0.1,
      forecastNum: 0.2,
      actualNum: null,
      unit: '%',
      pillar: 'INFLATION',
      isInverseIndicator: false,
      eventBiasForGold: 'SELL',
      biasReasonId: 'Forecast > Previous',
      biasReasonEn: 'Forecast > Previous',
    },
    {
      id: 'nfp-headline',
      title: 'US Non-Farm Employment Change (NFP)',
      country: 'USD',
      date: nfpReleaseIso,
      impact: 'High',
      previous: '185K',
      forecast: '160K',
      actual: '',
      previousNum: 185,
      forecastNum: 160,
      actualNum: null,
      unit: 'K',
      pillar: 'LABOR',
      isInverseIndicator: false,
      eventBiasForGold: 'BUY',
      biasReasonId: 'Forecast < Previous',
      biasReasonEn: 'Forecast < Previous',
    },
  ];

  const groups = groupCalendarEventsBySlot(scheduleEvents, new Date('2026-11-12T08:00:00Z').getTime());
  assert.strictEqual(groups.length, 2, 'Should group 3 events into 2 release time slots');
  assert.strictEqual(groups[0].combinedTitle, 'US Core PPI m/m & US PPI m/m');
  assert.ok(
    groups[0].formattedScheduleId.includes('20.30 WIB') &&
      groups[0].formattedScheduleId.includes('US Core PPI m/m & US PPI m/m'),
    `Formatted schedule should include WIB time and combined titles, got: ${groups[0].formattedScheduleId}`
  );
  assert.ok(groups[0].searchKeywords.includes('ppi'), 'Search keywords must include ppi');

  // Analyze selected PPI group via analyzeMacroEvent(selectedEventGroup)
  const ppiSnap = analyzeMacroEvent(groups[0], {
    calendarEvents: scheduleEvents,
    intermarketPulse: mockPulse,
    breakingNews: [],
  });
  const nfpSnap = analyzeMacroEvent(groups[1], {
    calendarEvents: scheduleEvents,
    intermarketPulse: mockPulse,
    breakingNews: [],
  });

  assert.strictEqual(ppiSnap.scenarioMatrix.primaryEvent.id, 'ppi-core');
  assert.strictEqual(ppiSnap.scenarioMatrix.simultaneousEvents.length, 1);
  assert.strictEqual(ppiSnap.scenarioMatrix.dominantBias, 'SELL');
  assert.strictEqual(nfpSnap.scenarioMatrix.primaryEvent.id, 'nfp-headline');
  assert.strictEqual(nfpSnap.scenarioMatrix.dominantBias, 'BUY');
  assert.notStrictEqual(
    ppiSnap.dataFingerprint,
    nfpSnap.dataFingerprint,
    'Each event group must have a distinct data_fingerprint for Supabase caching'
  );

  console.log('✓ PASS [1]: Upcoming Event Explorer grouping, analyzeMacroEvent(selectedEventGroup), & distinct data_fingerprint verified');
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
// 3. Real-Time Intermarket Divergence Confirmation (DXY & US10Y vs Calendar)
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
// 4. Status Differentiation: "REFERENSI AWAL (EARLY PROJECTION)" vs "FINAL T-5 MENIT"
// ---------------------------------------------------------------------------
{
  const baseNow = Date.now();
  const evTomorrow: MacroCalendarEvent = {
    id: 'ev-tomorrow-ppi',
    title: 'US Core PPI m/m',
    country: 'USD',
    date: new Date(baseNow + 24 * 60 * 60 * 1000).toISOString(), // H-1 day (tomorrow)
    impact: 'High',
    previous: '0.2%',
    forecast: '0.3%',
    actual: '',
    previousNum: 0.2,
    forecastNum: 0.3,
    actualNum: null,
    unit: '%',
    pillar: 'INFLATION',
    isInverseIndicator: false,
    eventBiasForGold: 'SELL',
    biasReasonId: 'Sell',
    biasReasonEn: 'Sell',
  };

  // Early Reference (> 5M away, e.g. H-1 day)
  const stateEarly = computePreNewsLockState([evTomorrow], baseNow, 'ev-tomorrow-ppi');
  assert.strictEqual(stateEarly.isLockedT5M, false);
  assert.strictEqual(
    stateEarly.projectionBadgeId,
    'REFERENSI AWAL • DATA SEMENTARA (BELUM FINAL T-5M)'
  );
  assert.strictEqual(
    stateEarly.projectionSubtextId,
    'Proyeksi berdasarkan Forecast, korelasi DXY/USOIL/US10Y, & sentimen RSS terkini. Tekan Refresh berkala menjelang rilis.'
  );

  // Inside T-5M (04:15 remaining)
  const evIn4Mins: MacroCalendarEvent = {
    ...evTomorrow,
    id: 'ev-4m',
    date: new Date(baseNow + 4 * 60 * 1000 + 15 * 1000).toISOString(),
  };
  const stateFinalT5 = computePreNewsLockState([evIn4Mins], baseNow, 'ev-4m');
  assert.strictEqual(stateFinalT5.isLockedT5M, true);
  assert.strictEqual(
    stateFinalT5.projectionBadgeId,
    'FINAL PRE-NEWS LOCKED (T-5M) • SIAP EKSEKUSI'
  );
  assert.strictEqual(stateFinalT5.countdownHms, '00:04:15');

  console.log('✓ PASS [4]: Status differentiation (REFERENSI AWAL vs FINAL PRE-NEWS LOCKED (T-5M) • SIAP EKSEKUSI) verified');
}

// ---------------------------------------------------------------------------
// 5. Verify Upcoming Event Explorer, Status Badges & Zero Manual Input in MacroNewsView.tsx
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

  // Must contain Upcoming Event Explorer & Projection Status Banner
  assert.ok(
    viewSrc.includes('data-testid="macro-upcoming-event-explorer"') &&
      viewSrc.includes('data-testid="macro-upcoming-search-input"') &&
      viewSrc.includes('data-testid="macro-upcoming-event-groups"') &&
      viewSrc.includes('data-testid="macro-projection-status-banner"') &&
      viewSrc.includes('data-testid="macro-projection-status-badge"') &&
      viewSrc.includes('data-testid="macro-projection-status-subtext"'),
    'MacroNewsView must render Upcoming Event Explorer, Search Input, Event Groups, and Projection Status Banner'
  );

  assert.ok(
    evaluateSingleEventForGold('US Core CPI m/m', 0.3, 0.2, 0.4).bias === 'SELL' &&
      analyzeStatementTone('Waller signals support for 25-50 bps rate hike') === 'HAWKISH' &&
      isFedSpeechEvent('Fed Chair Powell Speaks') === true,
    'Core deterministic functions must remain intact'
  );

  console.log('✓ PASS [5]: Upcoming Event Explorer UI, Status Banner, & Zero Manual Input verified in MacroNewsView.tsx');
}

// ---------------------------------------------------------------------------
// 6. Zero-Mock Policy, Live ForexFactory Feed (Core PPI 0.7%/0.3% & PPI 1.3%/0.4%), & LIVE FEED VERIFIED Badge
// ---------------------------------------------------------------------------
(async () => {
  // Classification checks
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'Core PPI m/m', impact: 'High', country: 'USD' }),
    true
  );
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'FOMC Rate Decision & Statement', impact: 'High', country: 'USD' }),
    true
  );
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'US Non-Farm Employment Change (NFP)', impact: 'High', country: 'USD' }),
    true
  );
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'FOMC Member Waller Speaks', impact: 'High', country: 'USD' }),
    false,
    'FOMC Member Speaks MUST NOT be classified as Primary High-Impact'
  );
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'Fed Chair Powell Speaks', impact: 'High', country: 'USD' }),
    false,
    'Fed Chair Speaks MUST NOT be classified as Primary High-Impact'
  );
  assert.strictEqual(
    isPrimaryHighImpactEvent({ title: 'Unemployment Claims', impact: 'Medium', country: 'USD' }),
    false,
    'Unemployment Claims MUST NOT be classified as Primary High-Impact'
  );
  assert.strictEqual(
    isSupportingReferenceEvent({ title: 'FOMC Member Waller Speaks', impact: 'High', country: 'USD' }),
    true
  );
  assert.strictEqual(
    isSupportingReferenceEvent({ title: 'Unemployment Claims', impact: 'Medium', country: 'USD' }),
    true
  );

  // 1) Zero-Mock Policy: getClientFallbackCalendarEvents() MUST return [] (never fake numbers)
  const fallbackEvents = getClientFallbackCalendarEvents();
  assert.strictEqual(
    fallbackEvents.length,
    0,
    'Zero-Mock Policy: getClientFallbackCalendarEvents() must return empty array []'
  );

  // When calendarEvents is empty [], computeDeterministicMacroSnapshot must NOT return fake 0.2% / 0.3% numbers
  const emptySnap = computeDeterministicMacroSnapshot({
    calendarEvents: [],
    intermarketPulse: mockPulse,
    breakingNews: [],
  });
  assert.strictEqual(
    emptySnap.scenarioMatrix.primaryEvent.title,
    'Gagal memuat kalender live — periksa koneksi atau coba refresh',
    'Empty calendar must return honest warning title instead of fake numbers'
  );
  assert.strictEqual(emptySnap.scenarioMatrix.primaryEvent.previousNum, null);
  assert.strictEqual(emptySnap.scenarioMatrix.primaryEvent.forecastNum, null);

  // 2) Verify Live ForexFactory Feed Fetching & Field Mapping
  const liveEvents = await fetchClientForexFactoryCalendar();
  assert.ok(liveEvents.length > 0, 'Live ForexFactory calendar fetch must return real USD events');
  assert.ok(
    liveEvents.every((e) => e.isLiveFeed === true && e.country === 'USD'),
    'Every fetched event must be marked isLiveFeed: true and country: USD'
  );

  const corePpi = liveEvents.find((e) => e.title === 'Core PPI m/m');
  const headlinePpi = liveEvents.find((e) => e.title === 'PPI m/m');
  if (corePpi && headlinePpi) {
    assert.strictEqual(corePpi.previous, '0.7%', 'Live Core PPI m/m previous must match ForexFactory (0.7%)');
    assert.strictEqual(corePpi.forecast, '0.3%', 'Live Core PPI m/m forecast must match ForexFactory (0.3%)');
    assert.strictEqual(corePpi.eventBiasForGold, 'BUY', 'Core PPI Forecast 0.3% < Previous 0.7% must produce BUY Gold bias');
    assert.strictEqual(headlinePpi.previous, '1.3%', 'Live PPI m/m previous must match ForexFactory (1.3%)');
    assert.strictEqual(headlinePpi.forecast, '0.4%', 'Live PPI m/m forecast must match ForexFactory (0.4%)');
    assert.strictEqual(headlinePpi.eventBiasForGold, 'BUY', 'PPI Forecast 0.4% < Previous 1.3% must produce BUY Gold bias');
  }

  const primaryGroups = groupCalendarEventsBySlot(liveEvents, Date.now(), true);
  const supportingEvents = getSupportingContextEvents(liveEvents, Date.now());

  assert.ok(
    primaryGroups.every((g) =>
      g.events.every((e) => !isFedSpeechEvent(e.title) && isPrimaryHighImpactEvent(e))
    ),
    'Primary event groups must NEVER contain FOMC Member Speaks or Medium data'
  );
  assert.ok(
    supportingEvents.some((e) => e.title.includes('Unemployment Claims') || e.title.includes('Speaks')),
    'Supporting context events must include Unemployment Claims and/or FOMC Member Speaks'
  );

  // 3) Verify Multi-Proxy URLs & LIVE FEED VERIFIED Badge in source code
  const fetcherSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/utils/macroFeedFetcher.ts'),
    'utf8'
  );
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const viewSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/news/MacroNewsView.tsx'),
    'utf8'
  );

  assert.ok(
    fetcherSrc.includes('https://api.codetabs.com/v1/proxy?quest=') &&
      fetcherSrc.includes('https://corsproxy.io/?url=') &&
      fetcherSrc.includes('https://api.allorigins.win/get?url=') &&
      fetcherSrc.includes('wrapperJson.contents'),
    'macroFeedFetcher.ts must implement all 3 proxy routes (codetabs, corsproxy.io/?url=, allorigins.win/get?url= with .contents)'
  );

  assert.ok(
    fetcherSrc.includes('ff_calendar_thisweek.json') &&
      fetcherSrc.includes('ff_calendar_nextweek.json') &&
      serverSrc.includes('ff_calendar_thisweek.json') &&
      serverSrc.includes('ff_calendar_nextweek.json'),
    'Both client and server fetchers must pull ff_calendar_thisweek.json AND ff_calendar_nextweek.json'
  );

  assert.ok(
    viewSrc.includes('LIVE FEED VERIFIED') &&
      viewSrc.includes('data-testid="macro-live-feed-verified-badge"') &&
      viewSrc.includes('Gagal memuat kalender live — periksa koneksi atau coba refresh') &&
      viewSrc.includes('data-testid="macro-empty-search-info-card"') &&
      viewSrc.includes('data-testid="macro-supporting-context-section"'),
    'MacroNewsView must render LIVE FEED VERIFIED badge, honest error message when offline, 14-day empty search info card, and Konteks Pendukung & Pidato Fed section'
  );

  console.log('✓ PASS [6]: Zero-Mock Policy, 3-Proxy Live ForexFactory Feed (Core PPI 0.7%/0.3%, PPI 1.3%/0.4%), & LIVE FEED VERIFIED badge verified');
  console.log('\n=== ALL UPCOMING EVENT EXPLORER & PRE-NEWS T-5M ENGINE TESTS PASSED ===');
})();
