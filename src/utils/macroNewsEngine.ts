import { LocalNotifications } from '@capacitor/local-notifications';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export type FomcPillarType = 'GROWTH' | 'LABOR' | 'INFLATION' | 'POLICY';
export type MacroBiasDirection = 'BUY' | 'SELL' | 'MIXED';
export type MacroImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type BreakingSentimentType = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MacroCalendarEvent {
  id: string;
  title: string;
  country: string;
  date: string; // ISO string or ForexFactory date string
  impact: 'High' | 'Medium' | 'Low';
  forecast: string;
  previous: string;
  actual: string;
  forecastNum: number | null;
  previousNum: number | null;
  actualNum: number | null;
  unit: string;
  pillar: FomcPillarType;
  isInverseIndicator: boolean;
  eventBiasForGold: MacroBiasDirection;
  biasReasonId: string;
  biasReasonEn: string;
  isLiveFeed?: boolean;
  eventCategory?: 'PRIMARY_HIGH_IMPACT' | 'SUPPORTING_REFERENCE';
}

export interface IntermarketAssetPulse {
  symbol: 'DXY' | 'USOIL' | 'US10Y';
  yahooTicker: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
  goldCorrelationEffect: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL';
  summaryId: string;
  summaryEn: string;
  updatedAt: string;
}

export interface BreakingNewsHeadline {
  id: string;
  title: string;
  source: string;
  pubDate: string;
  link?: string;
  matchedKeywords: string[];
  impact: 'HIGH' | 'LOW';
  sentimentForGold: BreakingSentimentType;
  channelType: 'FED_SPEECH' | 'GEOPOLITICS_SAFEN_HAVEN' | 'OIL_INFLATION_CHANNEL' | 'TARIFF_TRADE' | 'MACRO_DATA';
  aiEvaluationId: string;
  aiEvaluationEn: string;
}

export interface PillarArgumentItem {
  pillar: FomcPillarType | 'INTERMARKET' | 'GEOPOLITICS';
  tag: string;
  textId: string;
  textEn: string;
}

export interface PreNewsScenarioMatrix {
  primaryEvent: MacroCalendarEvent;
  simultaneousEvents: MacroCalendarEvent[];
  isSimultaneousRelease: boolean;
  simultaneousAlignment: 'ALIGNED_BUY' | 'ALIGNED_SELL' | 'CONFLICTING_WHIPSAW' | 'SINGLE';
  buyProbability: number; // 0 - 100
  sellProbability: number; // 0 - 100
  mixedProbability: number; // 0 - 100
  dominantBias: MacroBiasDirection;
  dynamicPivotTriggered: boolean;
  dynamicPivotReasonId?: string;
  dynamicPivotReasonEn?: string;
  dynamicPivotType?: 'HAWKISH_OVERRIDE' | 'DOVISH_OVERRIDE';
  fedSpeechAlertNoteId?: string;
  fedSpeechAlertNoteEn?: string;
  oilChannelDominance: 'INFLATION_CHANNEL_SELL_GOLD' | 'SAFE_HAVEN_BUY_GOLD' | 'NEUTRAL';
  buyArguments: PillarArgumentItem[];
  sellArguments: PillarArgumentItem[];
  finalTakeId: string;
  finalTakeEn: string;
  actionPlanId: string;
  actionPlanEn: string;
  whipsawWarningId: string;
  whipsawWarningEn: string;
  t5ExecutionTacticId?: string;
  t5ExecutionTacticEn?: string;
  isStrongOneWayBias?: boolean;
}

export interface MacroEventGroup {
  groupId: string;
  primaryEvent: MacroCalendarEvent;
  events: MacroCalendarEvent[];
  releaseDateIso: string;
  combinedTitle: string;
  formattedScheduleId: string;
  formattedScheduleEn: string;
  isUpcoming: boolean;
  isRecentlyReleased: boolean;
  searchKeywords: string;
}

export interface PreNewsCountdownState {
  targetEvent: MacroCalendarEvent | null;
  remainingMs: number;
  formattedCountdown: string;
  countdownHms: string;
  isLockedT5M: boolean;
  statusLabelId: string;
  statusLabelEn: string;
  projectionBadgeId: string;
  projectionBadgeEn: string;
  projectionSubtextId: string;
  projectionSubtextEn: string;
}

export interface MacroNewsSnapshot {
  id: string;
  instrument: 'XAUUSD';
  dataFingerprint: string;
  analyzedAt: string; // ISO timestamp
  sourceMode: 'GEMINI_AI' | 'SUPABASE_CACHE' | 'RULE_BASED_FALLBACK';
  modelUsed: string;
  impactLevel: MacroImpactLevel;
  dominantBias: MacroBiasDirection;
  breakingNews: BreakingNewsHeadline[];
  topBreakingAlert: BreakingNewsHeadline | null;
  intermarketPulse: {
    dxy: IntermarketAssetPulse;
    usoil: IntermarketAssetPulse;
    us10y: IntermarketAssetPulse;
  };
  calendarEvents: MacroCalendarEvent[];
  scenarioMatrix: PreNewsScenarioMatrix;
  isCalendarLiveFeed?: boolean;
}

export const MACRO_SNAPSHOT_LOCAL_STORAGE_KEY = 'tradevault_macro_news_snapshot_v1';
export const MACRO_GROUP_SNAPSHOT_CACHE_KEY = 'tradevault_macro_group_snapshots_v1';
export const MACRO_NOTIFIED_FINGERPRINT_KEY = 'tradevault_macro_notified_fp_v1';
export const SNAPSHOT_TTL_MINUTES = 30;

export const BREAKING_NEWS_KEYWORDS = [
  'Fed',
  'Warsh',
  'Waller',
  'Powell',
  'Trump',
  'Tariff',
  'Hormuz',
  'Iran',
  'Oil',
  'Inflation',
  'CPI',
  'NFP',
  'Rate',
] as const;

/**
 * Canonical System Instruction embedding the Master Playbook Rules for Gemini AI.
 */
export const XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION = `You are the Elite Institutional Macro Strategist & XAU/USD Fundamental Desk Analyst for TradeVault.
Your task is to evaluate the provided real-time USD Economic Calendar, Intermarket Pulse (DXY, US Oil WTI, US10Y Yield), and Filtered Breaking News headlines to produce a strictly deterministic XAU/USD (Gold) Pre-News & Post-Release Scenario Matrix.

YOU MUST STRICTLY ENFORCE THESE 5 MASTER PLAYBOOK RULES:

1. THE 3 FOMC PILLARS:
   - PILLAR 1: ECONOMIC GROWTH (GDP, ISM Manufacturing PMI, ISM Services PMI, Retail Sales):
     * ISM PMI > 50 signals expansion. Watch out for sharp volatility spikes if ISM PMI drops below 55 after a strong run.
     * CRITICAL EXCEPTION: "GDP Price Index" MUST be classified and evaluated under the INFLATION pillar, NEVER under Economic Growth.
     * Stronger US Growth (Actual > Forecast or Forecast > Previous) = Hawkish Fed = Bullish USD = SELL XAU/USD. Weaker Growth = BUY XAU/USD.
   - PILLAR 2: LABOR MARKET (JOLTS Job Openings, ADP, NFP, Average Hourly Earnings / Wage, Unemployment Rate, Jobless Claims, Challenger Job Cuts):
     * INVERSE RULE FOR CLAIMS & CUTS: For Unemployment Claims (Initial / Continuing Jobless Claims) and Challenger Job Cuts, Actual < Forecast (or Forecast < Previous) means fewer layoffs = tighter labor market = Bullish USD = SELL Gold (XAU/USD). Conversely, Actual > Forecast = Weak Labor = BUY Gold.
     * INVERSE RULE FOR UNEMPLOYMENT RATE: Actual < Forecast (lower unemployment rate) = Bullish USD = SELL Gold; Actual > Forecast = BUY Gold.
     * "SLOW HIRE, SLOW FIRE" SUB-COMPONENT RULE: Always check JOLTS Hiring and ISM Employment sub-components. If ISM Employment < 50 or JOLTS Hiring slows despite low layoffs, flag the "Slow Hire, Slow Fire" structural cooling risk (supports medium-term BUY Gold on dips).
   - PILLAR 3: INFLATION (CPI, Core CPI, PPI, Core PPI, Core PCE, GDP Price Index, ISM Prices Paid):
     * Separate CPI and PPI reactions if they are released on different days.
     * Check ISM Manufacturing/Services Prices Paid: if > 70, warn of extreme upstream price pressure that transmits into Headline CPI.
     * Track transmission from Producer Energy PPI into Headline CPI.
     * Hotter Inflation (Actual > Forecast or Forecast > Previous) = Fed holds rates higher for longer = SELL XAU/USD. Cooler Inflation = BUY XAU/USD.

2. DUAL-CHANNEL GEOPOLITICS & US OIL (WTI):
   - Distinguish between the SAFE-HAVEN CHANNEL (acute military shock -> initial spike BUY Gold) vs the INFLATION CHANNEL.
   - CRITICAL RULE: If Middle East / Strait of Hormuz tensions push US Oil (WTI) & gasoline sharply higher while US inflation is above the 2% target, the INFLATION CHANNEL DOMINATES: surging energy costs force the Fed into a Hawkish stance (delaying cuts or hiking rates), lifting US10Y yields and DXY -> SELL Gold (XAU/USD) after the initial geopolitical spike fades.
   - Account for the time-lag between this week's Oil surge and the upcoming monthly CPI release.

3. FEDWATCH & INTERMARKET CONFIRMATION:
   - If FedWatch rate decision pricing is > 90%, the headline rate move is already 100% priced-in; XAU/USD direction is dictated by Forward Guidance, Dot Plot, and the FOMC Press Conference.
   - A valid SELL XAU/USD setup requires intermarket confirmation from rising US02Y/US10Y Treasury Yields and a rising DXY.

4. DYNAMIC PIVOT RULE ("ATURAN DINAMIS PINDAH HALUAN"):
   - If monthly CPI forecast slows down (which normally gives an initial BUY Gold bias), BUT Breaking News reveals a Fed official (such as Waller, Warsh, or Powell) supporting a rate hike (25-50 bps) or aggressive Hawkish stance AND the current month's NFP is very strong, you MUST immediately flip the bias to a 1-WAY SELL (Strong Directional SELL on XAU/USD).

5. SIMULTANEOUS RELEASE & WHIPSAW DETECTOR:
   - When 2 or 3 macro data points are released at the exact same timestamp (e.g., ISM PMI + ISM Prices Paid + JOLTS, or NFP + Unemployment Rate + Average Hourly Earnings):
     * If all components point in the SAME direction = High-Conviction 1-Way Execution.
     * If components CONFLICT (e.g., Headline PMI drops below Forecast while Prices Paid jumps above 70, or NFP beats while Unemployment Rate rises) = Issue a mandatory WHIPSAW / FAKE MOVE warning and increase the MIXED/WHIPSAW probability (%).`;

/**
 * Parses macro calendar string values such as "3.1%", "254K", "-0.2%", "52.4", "$1.2B" into numeric values.
 */
export function parseMacroNumeric(raw: string | number | null | undefined): {
  value: number | null;
  unit: string;
} {
  if (raw === null || raw === undefined) return { value: null, unit: '' };
  if (typeof raw === 'number') {
    return { value: Number.isFinite(raw) ? raw : null, unit: '' };
  }
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a') {
    return { value: null, unit: '' };
  }

  const unitMatch = trimmed.match(/(%|K|M|B|T)$/i);
  const unit = unitMatch ? unitMatch[1].toUpperCase() : '';
  const numericClean = trimmed.replace(/[^0-9.,+\-]/g, '').replace(/,/g, '');
  if (!numericClean) return { value: null, unit };

  const parsed = parseFloat(numericClean);
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    unit,
  };
}

/**
 * Classifies an economic event title into one of the 3 FOMC Pillars (or POLICY).
 * Enforces Master Playbook Rule: GDP Price Index belongs to INFLATION, not GROWTH.
 */
export function classifyFomcPillar(title: string): FomcPillarType {
  const t = (title || '').toUpperCase();

  if (
    t.includes('GDP PRICE') ||
    t.includes('CPI') ||
    t.includes('PPI') ||
    t.includes('PCE') ||
    t.includes('INFLATION') ||
    t.includes('PRICES')
  ) {
    return 'INFLATION';
  }

  if (
    t.includes('NON-FARM') ||
    t.includes('NFP') ||
    t.includes('UNEMPLOYMENT') ||
    t.includes('JOBLESS') ||
    t.includes('CLAIMS') ||
    t.includes('JOLTS') ||
    t.includes('ADP') ||
    t.includes('EARNINGS') ||
    t.includes('WAGE') ||
    t.includes('CHALLENGER') ||
    t.includes('EMPLOYMENT')
  ) {
    return 'LABOR';
  }

  if (
    t.includes('FOMC') ||
    t.includes('FEDERAL FUNDS') ||
    t.includes('POWELL') ||
    t.includes('FED CHAIR') ||
    t.includes('RATE DECISION')
  ) {
    return 'POLICY';
  }

  return 'GROWTH';
}

/**
 * Identifies inverse USD indicators where a LOWER number is Bullish USD (SELL Gold)
 * and a HIGHER number is Bearish USD (BUY Gold):
 * - Initial / Continuing Unemployment Claims (Jobless Claims)
 * - Challenger Job Cuts
 * - Unemployment Rate
 */
export function isInverseUsdIndicator(title: string): boolean {
  const t = (title || '').toUpperCase();
  return (
    t.includes('CLAIMS') ||
    t.includes('JOBLESS') ||
    t.includes('CHALLENGER') ||
    t.includes('UNEMPLOYMENT RATE')
  );
}

/**
 * Checks whether a ForexFactory calendar event is a relevant USD High/Medium impact macro event.
 */
export function isRelevantUsdMacroEvent(rawEvent: {
  country?: string;
  impact?: string;
  title?: string;
}): boolean {
  const country = (rawEvent.country || '').toUpperCase().trim();
  if (country !== 'USD') return false;

  const impact = (rawEvent.impact || '').trim();
  const title = (rawEvent.title || '').toUpperCase();

  const coreKeywordMatch =
    /\b(CPI|PPI|PCE|NFP|NON-FARM|UNEMPLOYMENT|EARNINGS|JOLTS|ADP|CLAIMS|JOBLESS|CHALLENGER|ISM|PMI|PRICES|GDP|FOMC|FEDERAL FUNDS|POWELL|RETAIL SALES)\b/i.test(
      title
    );

  if (impact === 'High' || impact === 'Medium') {
    return true;
  }

  return coreKeywordMatch;
}

/**
 * Evaluates a single calendar event's directional bias for XAU/USD using Forecast vs Previous
 * (when Actual is not yet released) and Actual vs Forecast (when Actual is released).
 */
export function evaluateSingleEventForGold(
  title: string,
  actualNum: number | null,
  forecastNum: number | null,
  previousNum: number | null
): {
  bias: MacroBiasDirection;
  reasonId: string;
  reasonEn: string;
} {
  const inverse = isInverseUsdIndicator(title);
  const pillar = classifyFomcPillar(title);
  const upperTitle = title.toUpperCase();

  // Determine comparison pair: Actual vs Forecast (if released) else Forecast vs Previous
  const hasActual = actualNum !== null;
  const primaryVal = hasActual ? actualNum : forecastNum;
  const referenceVal = hasActual
    ? forecastNum !== null
      ? forecastNum
      : previousNum
    : previousNum;

  const compLabelId = hasActual ? 'Aktual vs Forecast' : 'Forecast vs Previous';
  const compLabelEn = hasActual ? 'Actual vs Forecast' : 'Forecast vs Previous';

  if (primaryVal === null || referenceVal === null) {
    return {
      bias: 'MIXED',
      reasonId: `${title}: Menunggu angka konsensus (${compLabelId}) untuk konfirmasi arah.`,
      reasonEn: `${title}: Awaiting consensus figures (${compLabelEn}) for directional confirmation.`,
    };
  }

  const diff = Number((primaryVal - referenceVal).toFixed(4));

  // Special ISM PMI check (>50 expansion, <55 spike alert)
  const isIsmPmi =
    upperTitle.includes('ISM') &&
    upperTitle.includes('PMI') &&
    !upperTitle.includes('PRICES');
  const isIsmPrices = upperTitle.includes('ISM') && upperTitle.includes('PRICES');

  if (Math.abs(diff) < 0.0001) {
    return {
      bias: 'MIXED',
      reasonId: `${title} (${compLabelId}: ${primaryVal} = ${referenceVal}) sejalan ekspektasi; potensi reaksi dua arah (whipsaw).`,
      reasonEn: `${title} (${compLabelEn}: ${primaryVal} = ${referenceVal}) in-line with consensus; two-way whipsaw risk.`,
    };
  }

  // Standard indicator: primaryVal > referenceVal = Stronger USD = SELL XAU/USD
  // Inverse indicator (Claims / Unemployment Rate): primaryVal < referenceVal = Stronger USD = SELL XAU/USD
  const isStrongerUsd = inverse ? diff < 0 : diff > 0;

  if (isStrongerUsd) {
    let extraNoteId = '';
    let extraNoteEn = '';
    if (inverse) {
      extraNoteId = ' (Aturan Terbalik Klaim/Pengangguran: angka lebih rendah = pasar kerja ketat = USD menguat)';
      extraNoteEn = ' (Inverse Claims/Unemployment Rule: lower figure = tighter labor = stronger USD)';
    } else if (pillar === 'INFLATION' && hasActual && forecastNum !== null && previousNum !== null && primaryVal < previousNum) {
      extraNoteId = ` (Prioritas Rilis: Aktual ${primaryVal} > Forecast ${referenceVal} → Inflasi mengalahkan konsensus memicu ekspektasi Hawkish SELL XAU/USD, meskipun angka Aktual lebih rendah dari Previous ${previousNum})`;
      extraNoteEn = ` (Release Priority: Actual ${primaryVal} > Forecast ${referenceVal} → Hotter than consensus fuels Hawkish SELL XAU/USD, even though Actual is lower than Previous ${previousNum})`;
    } else if (isIsmPrices && primaryVal >= 70) {
      extraNoteId = ' (ISM Prices Paid ≥ 70: tekanan harga hulu ekstrem memicu ekspektasi Fed Hawkish)';
      extraNoteEn = ' (ISM Prices Paid ≥ 70: extreme upstream price pressure fuels Hawkish Fed expectations)';
    } else if (isIsmPmi && primaryVal > 50 && primaryVal < 55) {
      extraNoteId = ' (Ekspansi > 50 namun di bawah ambang 55: waspadai spike volatilitas awal)';
      extraNoteEn = ' (Expansion > 50 but below 55 threshold: watch for initial volatility spike)';
    }

    return {
      bias: 'SELL',
      reasonId: `[Pilar ${pillar}] ${title} (${compLabelId}: ${primaryVal} vs ${referenceVal}) mendukung penguatan DXY/Yield → Tekanan SELL XAU/USD.${extraNoteId}`,
      reasonEn: `[${pillar} Pillar] ${title} (${compLabelEn}: ${primaryVal} vs ${referenceVal}) supports stronger DXY/Yields → SELL XAU/USD pressure.${extraNoteEn}`,
    };
  } else {
    let extraNoteId = '';
    let extraNoteEn = '';
    if (inverse) {
      extraNoteId = ' (Aturan Terbalik Klaim/Pengangguran: angka naik = pasar tenaga kerja melambat = USD melemah)';
      extraNoteEn = ' (Inverse Claims/Unemployment Rule: higher figure = cooling labor market = weaker USD)';
    } else if (pillar === 'INFLATION' && hasActual && forecastNum !== null) {
      extraNoteId = ` (Prioritas Rilis: Aktual ${primaryVal} < Forecast ${referenceVal} → Inflasi mendingin di bawah proyeksi membuka ruang pemangkasan Fed)`;
      extraNoteEn = ` (Release Priority: Actual ${primaryVal} < Forecast ${referenceVal} → Softer inflation opens door to Fed rate cuts)`;
    } else if (isIsmPmi && primaryVal < 55) {
      extraNoteId =
        primaryVal < 50
          ? ' (Kontraksi ISM PMI < 50: sinyal perlambatan pertumbuhan AS)'
          : ' (ISM PMI turun di bawah 55: memicu potensi spike BUY XAU/USD)';
      extraNoteEn =
        primaryVal < 50
          ? ' (ISM PMI contraction < 50: US growth slowdown signal)'
          : ' (ISM PMI dropped below 55: triggers upside spike potential on XAU/USD)';
    }

    return {
      bias: 'BUY',
      reasonId: `[Pilar ${pillar}] ${title} (${compLabelId}: ${primaryVal} vs ${referenceVal}) mengindikasikan pelonggaran Fed → Dorongan BUY XAU/USD.${extraNoteId}`,
      reasonEn: `[${pillar} Pillar] ${title} (${compLabelEn}: ${primaryVal} vs ${referenceVal}) signals dovish Fed tilt → BUY XAU/USD catalyst.${extraNoteEn}`,
    };
  }
}

/**
 * Filters raw RSS headlines strictly by BREAKING_NEWS_KEYWORDS and evaluates their macro channel & sentiment.
 */
export function filterAndScoreBreakingHeadlines(
  rawItems: Array<{ title: string; source: string; pubDate: string; link?: string }>
): BreakingNewsHeadline[] {
  const results: BreakingNewsHeadline[] = [];
  const seenTitles = new Set<string>();

  for (const item of rawItems) {
    const cleanTitle = (item.title || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!cleanTitle) continue;

    const normalizedKey = cleanTitle.toLowerCase();
    if (seenTitles.has(normalizedKey)) continue;

    const matchedKeywords: string[] = [];
    for (const kw of BREAKING_NEWS_KEYWORDS) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(cleanTitle) || cleanTitle.toLowerCase().includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
      }
    }

    if (matchedKeywords.length === 0) continue;
    seenTitles.add(normalizedKey);

    const upper = cleanTitle.toUpperCase();

    // Detect Hawkish Fed Speech (Waller / Warsh / Powell / Rate hike / Higher for longer)
    const hasFedOfficial = /\b(FED|WALLER|WARSH|POWELL|FOMC|RATE)\b/i.test(cleanTitle);
    const isHawkishSpeech =
      hasFedOfficial &&
      /\b(HIKE|HIKES|HAWKISH|25\s*BPS|50\s*BPS|HIGHER FOR LONGER|NO RUSH TO CUT|PAUSE|INFLATION RISK|UPSIDE RISK|RESTRICTIVE)\b/i.test(
        cleanTitle
      );
    const isDovishSpeech =
      hasFedOfficial &&
      /\b(CUT|CUTS|DOVISH|EASING|LOWER RATES|COOLING|WEAKENING LABOR)\b/i.test(cleanTitle);

    // Detect Geopolitics / Strait of Hormuz / Iran / Oil surge
    const hasGeopoliticsOil = /\b(HORMUZ|IRAN|OIL|CRUDE|MIDDLE EAST|TARIFF|TRUMP)\b/i.test(
      cleanTitle
    );
    const isOilInflationSurge =
      /\b(OIL|HORMUZ|IRAN|TARIFF)\b/i.test(cleanTitle) &&
      /\b(SURGE|SURGES|SPIKE|JUMP|RALLY|HIGHER|INFLATION|BLOCKADE|SUPPLY|DISRUPTION|CLIMBS)\b/i.test(
        cleanTitle
      );

    let impact: 'HIGH' | 'LOW' =
      matchedKeywords.some((k) =>
        ['Fed', 'Warsh', 'Waller', 'Powell', 'Hormuz', 'Iran', 'CPI', 'NFP', 'Rate', 'Tariff'].includes(k)
      )
        ? 'HIGH'
        : 'LOW';

    let sentimentForGold: BreakingSentimentType = 'NEUTRAL';
    let channelType: BreakingNewsHeadline['channelType'] = 'MACRO_DATA';
    let aiEvaluationId = '';
    let aiEvaluationEn = '';

    if (isHawkishSpeech) {
      impact = 'HIGH';
      sentimentForGold = 'BEARISH';
      channelType = 'FED_SPEECH';
      aiEvaluationId =
        'Pernyataan Hawkish pejabat Fed (risiko kenaikan/tahan suku bunga) memicu repricing imbal hasil US10Y & DXY naik → Tekanan SELL kuat pada XAU/USD (Waspada Aturan Pindah Haluan).';
      aiEvaluationEn =
        'Hawkish Fed commentary (rate hike/hold risk) triggers upward repricing in US10Y yields & DXY → Strong SELL pressure on XAU/USD (Dynamic Pivot Rule active).';
    } else if (isDovishSpeech) {
      impact = 'HIGH';
      sentimentForGold = 'BULLISH';
      channelType = 'FED_SPEECH';
      aiEvaluationId =
        'Sinyal Dovish pejabat Fed mendukung ekspektasi pemangkasan suku bunga → Menekan DXY & mendukung skenario BUY XAU/USD.';
      aiEvaluationEn =
        'Dovish Fed signal supports rate-cut expectations → Pressures DXY & reinforces BUY XAU/USD scenario.';
    } else if (isOilInflationSurge) {
      impact = 'HIGH';
      sentimentForGold = 'BEARISH';
      channelType = 'OIL_INFLATION_CHANNEL';
      aiEvaluationId =
        'Dual-Channel Geopolitik & Oil: Lonjakan harga energi (Hormuz/Iran/Tarif) saat inflasi > 2% mengaktifkan Inflation Channel → Memaksa Fed Hawkish & menekan XAU/USD (SELL setelah spike safe-haven mereda).';
      aiEvaluationEn =
        'Geopolitics & Oil Dual-Channel: Energy spike (Hormuz/Iran/Tariffs) while inflation > 2% activates the Inflation Channel → Forces Hawkish Fed & pressures XAU/USD (SELL once initial safe-haven spike fades).';
    } else if (hasGeopoliticsOil) {
      sentimentForGold = 'BULLISH';
      channelType = 'GEOPOLITICS_SAFEN_HAVEN';
      aiEvaluationId =
        'Sentimen geopolitik / tarif memicu permintaan Safe-Haven jangka pendek pada XAU/USD, namun pantau efek rambatan harga US Oil terhadap ekspektasi CPI.';
      aiEvaluationEn =
        'Geopolitical / tariff headline sparks short-term Safe-Haven demand for XAU/USD, but monitor US Oil pass-through into CPI expectations.';
    } else {
      const isBearishGoldData = /\b(HOT|BEATS|STRONGER|SURGES|RISES|ABOVE FORECAST|HAWKISH)\b/i.test(
        upper
      );
      const isBullishGoldData = /\b(COOLS|MISSES|WEAKER|SLOWS|BELOW FORECAST|DOVISH|DROPS)\b/i.test(
        upper
      );
      sentimentForGold = isBearishGoldData
        ? 'BEARISH'
        : isBullishGoldData
        ? 'BULLISH'
        : 'NEUTRAL';
      aiEvaluationId =
        sentimentForGold === 'BEARISH'
          ? 'Headline makro mengindikasikan ketahanan data AS / tekanan inflasi yang mendukung penguatan USD (Bearish XAU/USD).'
          : sentimentForGold === 'BULLISH'
          ? 'Headline makro menunjukkan tanda pelambatan data AS yang mendukung pelemahan imbal hasil & potensi BUY XAU/USD.'
          : 'Headline terpantau pada radar kata kunci utama; tunggu konfirmasi rilis data aktual & respons US10Y.';
      aiEvaluationEn =
        sentimentForGold === 'BEARISH'
          ? 'Macro headline points to resilient US data / inflation persistence supporting USD strength (Bearish XAU/USD).'
          : sentimentForGold === 'BULLISH'
          ? 'Macro headline indicates cooling US data supporting softer yields & BUY XAU/USD potential.'
          : 'Headline tracked on core macro keyword radar; await actual data release & US10Y yield reaction.';
    }

    results.push({
      id: `news-${results.length + 1}-${Date.now()}`,
      title: cleanTitle,
      source: item.source || 'Macro Wire',
      pubDate: item.pubDate || new Date().toISOString(),
      link: item.link,
      matchedKeywords,
      impact,
      sentimentForGold,
      channelType,
      aiEvaluationId,
      aiEvaluationEn,
    });
  }

  return results.slice(0, 10);
}

/**
 * Checks if a calendar event is a Fed speech, testimony, or press conference (NOT a quantitative rate decision).
 */
export function isFedSpeechEvent(title: string): boolean {
  const t = (title || '').toUpperCase();
  if (
    t.includes('RATE DECISION') ||
    t.includes('FEDERAL FUNDS RATE') ||
    t.includes('FOMC STATEMENT') ||
    t.includes('ECONOMIC PROJECTIONS') ||
    t.includes('DOT PLOT')
  ) {
    return false;
  }
  return (
    t.includes('SPEAKS') ||
    t.includes('SPEECH') ||
    t.includes('TESTIFIES') ||
    t.includes('TESTIMONY') ||
    t.includes('POWELL') ||
    t.includes('FOMC MEMBER') ||
    t.includes('FED CHAIR') ||
    t.includes('FED GOVERNOR') ||
    t.includes('FOMC PRESS CONFERENCE') ||
    t.includes('CENTRAL BANK')
  );
}

/**
 * Strictly determines whether a USD calendar event is a Primary High-Impact Quantitative Target:
 * ONLY High-impact (Red Folder) quantitative releases:
 * - CPI, Core CPI, PPI, Core PPI
 * - NFP (Non-Farm Employment Change), Unemployment Rate, Average Hourly Earnings
 * - FOMC Rate Decision / Federal Funds Rate / FOMC Statement / Economic Projections / Dot Plot
 * - PCE, Core PCE
 * - GDP (Advance, Prelim, Final, GDP Price Index)
 * - Retail Sales, Core Retail Sales
 * - ISM Manufacturing PMI, ISM Services PMI
 *
 * Strictly EXCLUDES:
 * - Fed Speeches (FOMC Member Speaks, Fed Chair Speaks, Testifies)
 * - Medium / Secondary indicators (Initial Jobless Claims, Unemployment Claims, ADP, JOLTS, Challenger, UoM, Consumer Confidence, ISM Prices)
 */
export function isPrimaryHighImpactEvent(ev: {
  title?: string;
  impact?: string;
  country?: string;
  eventCategory?: 'PRIMARY_HIGH_IMPACT' | 'SUPPORTING_REFERENCE';
}): boolean {
  if (ev.eventCategory === 'SUPPORTING_REFERENCE') return false;
  const title = (ev.title || '').toUpperCase().trim();
  const impact = (ev.impact || 'High').trim();

  // 1. Never allow Fed speeches as primary target
  if (isFedSpeechEvent(title)) {
    return false;
  }

  // 2. Never allow Medium/Secondary supporting reference indicators as primary target
  if (
    title.includes('CLAIMS') ||
    title.includes('JOBLESS') ||
    title.includes('ADP') ||
    title.includes('JOLTS') ||
    title.includes('CHALLENGER') ||
    title.includes('UOM') ||
    title.includes('CONSUMER CONFIDENCE') ||
    title.includes('EMPIRE STATE') ||
    title.includes('PHILLY FED') ||
    title.includes('ISM MANUFACTURING PRICES') ||
    title.includes('ISM SERVICES PRICES') ||
    title.includes('FLASH MANUFACTURING PMI') ||
    title.includes('FLASH SERVICES PMI')
  ) {
    return false;
  }

  // 3. Must match one of the core Tier-1 quantitative volatility targets
  const isTier1Quantitative =
    /\b(CPI|PPI|PCE|NFP|NON-FARM|UNEMPLOYMENT RATE|AVERAGE HOURLY EARNINGS|FOMC RATE|FOMC STATEMENT|FOMC ECONOMIC PROJECTIONS|FEDERAL FUNDS RATE|DOT PLOT|RATE DECISION|GDP|RETAIL SALES|ISM MANUFACTURING PMI|ISM SERVICES PMI)\b/i.test(
      title
    );

  if (!isTier1Quantitative) {
    return false;
  }

  // Allow Average Hourly Earnings when grouped with NFP even if tagged Medium, otherwise require High
  if (title.includes('AVERAGE HOURLY EARNINGS')) {
    return impact === 'High' || impact === 'Medium';
  }

  return impact === 'High';
}

/**
 * Checks whether a USD calendar event belongs to the Supporting Reference & Fed Speeches category
 * (Medium impact data like Initial Jobless Claims, ADP, JOLTS, or any FOMC/Fed Speech).
 */
export function isSupportingReferenceEvent(ev: {
  title?: string;
  impact?: string;
  country?: string;
  eventCategory?: 'PRIMARY_HIGH_IMPACT' | 'SUPPORTING_REFERENCE';
}): boolean {
  return !isPrimaryHighImpactEvent(ev);
}

/**
 * Extracts all Supporting Reference & Fed Speech events (Medium data + FOMC speeches)
 * sorted chronologically near the current time so they can be displayed in "Konteks Pendukung & Pidato Fed"
 * and fed into Gemini as supporting context / Pindah Haluan signals.
 */
export function getSupportingContextEvents(
  events: MacroCalendarEvent[],
  nowMs: number = Date.now()
): MacroCalendarEvent[] {
  if (!events || events.length === 0) return [];
  const THREE_DAYS_PAST_MS = 3 * 24 * 60 * 60 * 1000;
  return events
    .filter((ev) => isSupportingReferenceEvent(ev))
    .filter((ev) => {
      const t = new Date(ev.date).getTime();
      return !Number.isFinite(t) || t >= nowMs - THREE_DAYS_PAST_MS;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Analyzes the tone of a Fed speech statement or breaking news headline.
 */
export function analyzeStatementTone(statement: string): 'HAWKISH' | 'DOVISH' | 'NEUTRAL' {
  if (!statement || !statement.trim()) return 'NEUTRAL';
  const clean = statement.toUpperCase();

  const isHawkish =
    /\b(HIKE|HIKES|HAWKISH|25\s*BPS|50\s*BPS|75\s*BPS|HIGHER FOR LONGER|NO RUSH TO CUT|RESTRICTIVE|STICKY|TIGHTEN|TIGHTENING|MORE WORK TO DO|UPSIDE INFLATION|ABOVE TARGET|INFLATION PERSISTENT|NO RATE CUT|PAUSE CUTS|MORE RATE HIKES)\b/i.test(
      clean
    ) ||
    /\b(NAIK|KENAIKAN|SUKU BUNGA NAIK|LENGKET|PENGETATAN|TIDAK BURU-BURU PANGKAS|INFLASI TINGGI)\b/i.test(
      clean
    );

  const isDovish =
    /\b(CUT|CUTS|DOVISH|EASING|LOWER RATES|COOLING|WEAKENING LABOR|PAUSE HIKE|RATE CUTS|UNEMPLOYMENT RISING|DISINFLATION|SLOWDOWN|TIME TO CUT|READY TO CUT|CUTTING CYCLE)\b/i.test(
      clean
    ) ||
    /\b(TURUN|PEMOTONGAN|PANGKAS|PELONGGARAN|JEDA|MELAMBAT|SIAP PANGKAS)\b/i.test(clean);

  if (isHawkish && !isDovish) return 'HAWKISH';
  if (isDovish && !isHawkish) return 'DOVISH';
  return 'NEUTRAL';
}

/**
 * Creates a BreakingNewsHeadline from user-pasted speech quote or breaking headline.
 */
export function createCustomBreakingHeadline(text: string): BreakingNewsHeadline {
  const tone = analyzeStatementTone(text);
  const matchedKeywords: string[] = [];
  for (const kw of BREAKING_NEWS_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(text)) {
      matchedKeywords.push(kw);
    }
  }
  if (matchedKeywords.length === 0) {
    matchedKeywords.push('Fed', 'Rate');
  }

  const sentimentForGold: BreakingSentimentType =
    tone === 'HAWKISH' ? 'BEARISH' : tone === 'DOVISH' ? 'BULLISH' : 'NEUTRAL';

  return {
    id: `custom-headline-${Date.now()}`,
    title: text,
    source: 'User Input / Breaking Wire',
    pubDate: new Date().toISOString(),
    matchedKeywords,
    impact: 'HIGH',
    sentimentForGold,
    channelType: 'FED_SPEECH',
    aiEvaluationId:
      tone === 'HAWKISH'
        ? 'Pernyataan bernada Hawkish: memicu kenaikan imbal hasil obligasi & DXY → Tekanan SELL kuat pada XAU/USD (Pindah Haluan: Hawkish Override).'
        : tone === 'DOVISH'
        ? 'Pernyataan bernada Dovish: memicu ekspektasi penurunan imbal hasil & pelemahan DXY → Dorongan BUY kuat pada XAU/USD (Pindah Haluan: Dovish Override).'
        : 'Pernyataan pejabat Fed dipantau; perhatikan reaksi respons US10Y & DXY.',
    aiEvaluationEn:
      tone === 'HAWKISH'
        ? 'Hawkish statement: pushes yields & DXY higher → Strong SELL pressure on XAU/USD (Dynamic Pivot: Hawkish Override).'
        : tone === 'DOVISH'
        ? 'Dovish statement: drives yields & DXY lower → Strong BUY momentum on XAU/USD (Dynamic Pivot: Dovish Override).'
        : 'Fed remarks monitored; observe US10Y & DXY market reaction.',
  };
}

/**
 * Computes a deterministic fingerprint from calendar events, top breaking news headlines,
 * and optionally the selected event group ID/slot so each event group is cached distinctly in Supabase.
 */
export function computeMacroDataFingerprint(
  events: MacroCalendarEvent[],
  headlines: BreakingNewsHeadline[],
  selectedEventSlotKey?: string
): string {
  const eventSig = events
    .slice(0, 8)
    .map((e) => `${e.title}:${e.previous}:${e.forecast}:${e.actual}`)
    .join('|');
  const newsSig = headlines
    .slice(0, 3)
    .map((h) => h.title.slice(0, 40))
    .join('|');
  const slotPart = selectedEventSlotKey ? `##slot:${selectedEventSlotKey}` : '';
  const raw = `${eventSig}##${newsSig}${slotPart}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16)}`;
}

/**
 * Formats an ISO date into the compact WIB schedule header, e.g. "13 Nov 2026 • 20.30 WIB".
 */
export function formatEventGroupWibHeader(isoStr: string, lang: 'id' | 'en' = 'id'): string {
  if (!isoStr) return '-';
  try {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return isoStr;
    const datePart = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(dt);
    const timePart = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dt);
    const normalizedTime = lang === 'id' ? timePart.replace(':', '.') : timePart.replace('.', ':');
    return `${datePart} • ${normalizedTime} WIB`;
  } catch {
    return isoStr;
  }
}

/**
 * Groups USD economic calendar events that share the same release slot (within 15 minutes)
 * into unified MacroEventGroup items for the Upcoming Event Explorer & Search Bar.
 * By default (`primaryOnly = true`), strictly includes ONLY Primary High-Impact Quantitative releases,
 * excluding FOMC Speeches and Medium/Supporting indicators (Claims, ADP, JOLTS).
 */
export function groupCalendarEventsBySlot(
  events: MacroCalendarEvent[],
  nowMs: number = Date.now(),
  primaryOnly: boolean = true
): MacroEventGroup[] {
  if (!events || events.length === 0) return [];

  const candidateEvents = primaryOnly
    ? events.filter((e) => isPrimaryHighImpactEvent(e))
    : events;

  if (candidateEvents.length === 0) return [];

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const FIFTEEN_MINS_MS = 15 * 60 * 1000;

  const sorted = [...candidateEvents].sort((a, b) => {
    const ta = new Date(a.date).getTime() || 0;
    const tb = new Date(b.date).getTime() || 0;
    return ta - tb;
  });

  const clusters: MacroCalendarEvent[][] = [];
  for (const ev of sorted) {
    const evTime = new Date(ev.date).getTime();
    const lastCluster = clusters[clusters.length - 1];
    if (lastCluster && lastCluster.length > 0) {
      const clusterTime = new Date(lastCluster[0].date).getTime();
      if (
        Number.isFinite(evTime) &&
        Number.isFinite(clusterTime) &&
        Math.abs(evTime - clusterTime) <= FIFTEEN_MINS_MS
      ) {
        lastCluster.push(ev);
        continue;
      }
    }
    clusters.push([ev]);
  }

  return clusters.map((cluster) => {
    const primaryEvent = cluster.find((e) => e.impact === 'High') || cluster[0];
    const releaseTime = new Date(primaryEvent.date).getTime();
    const isUpcoming = Number.isFinite(releaseTime) && releaseTime > nowMs;
    const isRecentlyReleased =
      Number.isFinite(releaseTime) && releaseTime <= nowMs && releaseTime >= nowMs - TWO_HOURS_MS;

    const combinedTitle = cluster.map((e) => e.title).join(' & ');
    const headerId = formatEventGroupWibHeader(primaryEvent.date, 'id');
    const headerEn = formatEventGroupWibHeader(primaryEvent.date, 'en');

    const formattedScheduleId = `${headerId} — ${combinedTitle}`;
    const formattedScheduleEn = `${headerEn} — ${combinedTitle}`;

    const searchKeywords = [
      combinedTitle,
      headerId,
      headerEn,
      ...cluster.map((e) => e.pillar),
      ...cluster.map((e) => e.impact),
    ]
      .join(' ')
      .toLowerCase();

    return {
      groupId: primaryEvent.id,
      primaryEvent,
      events: cluster,
      releaseDateIso: primaryEvent.date,
      combinedTitle,
      formattedScheduleId,
      formattedScheduleEn,
      isUpcoming,
      isRecentlyReleased,
      searchKeywords,
    };
  });
}

/**
 * Deterministic Rule-Based Engine implementing all 5 Master Playbook Rules.
 * Used as the zero-error fallback when Gemini hits 429 or when running offline,
 * and as baseline verification for AI outputs.
 */
export function computeDeterministicMacroSnapshot(params: {
  calendarEvents: MacroCalendarEvent[];
  intermarketPulse: {
    dxy: IntermarketAssetPulse;
    usoil: IntermarketAssetPulse;
    us10y: IntermarketAssetPulse;
  };
  breakingNews: BreakingNewsHeadline[];
  selectedEventId?: string;
  sourceMode?: MacroNewsSnapshot['sourceMode'];
  modelUsed?: string;
  customHeadlineText?: string;
  customActualOverrides?: Record<string, string | number>;
}): MacroNewsSnapshot {
  const {
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
    sourceMode = 'RULE_BASED_FALLBACK',
    modelUsed = 'deterministic-playbook-v1',
    customHeadlineText,
    customActualOverrides,
  } = params;

  const nowMs = Date.now();

  // Apply quick actual overrides if provided (re-evaluating individual event bias)
  let workingCalendarEvents = [...calendarEvents];
  if (customActualOverrides && Object.keys(customActualOverrides).length > 0) {
    workingCalendarEvents = workingCalendarEvents.map((ev) => {
      const overrideVal = customActualOverrides[ev.id] ?? customActualOverrides[ev.title];
      if (overrideVal !== undefined && overrideVal !== null && String(overrideVal).trim() !== '') {
        const parsed = parseMacroNumeric(overrideVal);
        const evalRes = evaluateSingleEventForGold(
          ev.title,
          parsed.value,
          ev.forecastNum,
          ev.previousNum
        );
        return {
          ...ev,
          actual: String(overrideVal).trim(),
          actualNum: parsed.value,
          unit: parsed.unit || ev.unit,
          eventBiasForGold: evalRes.bias,
          biasReasonId: evalRes.reasonId,
          biasReasonEn: evalRes.reasonEn,
        };
      }
      return ev;
    });
  }

  // Prepend custom breaking headline if supplied
  let workingBreakingNews = [...breakingNews];
  if (customHeadlineText && customHeadlineText.trim()) {
    const customHl = createCustomBreakingHeadline(customHeadlineText.trim());
    workingBreakingNews.unshift(customHl);
  }

  // Pick the primary event: strictly prioritize Primary High-Impact Quantitative releases
  // (NEVER default to FOMC Member Speaks or Medium/Supporting data like Jobless Claims, ADP, JOLTS)
  const primaryPool = workingCalendarEvents.filter((e) => isPrimaryHighImpactEvent(e));
  const effectivePool = primaryPool.length > 0 ? primaryPool : workingCalendarEvents;

  const upcomingPrimaryEvents = effectivePool
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return Number.isFinite(t) && t > nowMs;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let nearestUpcomingPrimary: MacroCalendarEvent | undefined;
  if (upcomingPrimaryEvents.length > 0) {
    const firstUpcomingTime = new Date(upcomingPrimaryEvents[0].date).getTime();
    const firstSlotCluster = upcomingPrimaryEvents.filter(
      (e) => Math.abs(new Date(e.date).getTime() - firstUpcomingTime) <= 15 * 60 * 1000
    );
    nearestUpcomingPrimary =
      firstSlotCluster.find((e) => e.impact === 'High') || firstSlotCluster[0];
  }

  const sortedPrimaryEvents = [...effectivePool].sort((a, b) => {
    const aTime = new Date(a.date).getTime() || nowMs;
    const bTime = new Date(b.date).getTime() || nowMs;
    return Math.abs(aTime - nowMs) - Math.abs(bTime - nowMs);
  });

  // Only allow selectedEventId if it belongs to primaryPool (or if primaryPool is empty in synthetic test)
  const explicitSelectedPrimary = selectedEventId
    ? primaryPool.find((e) => e.id === selectedEventId) ||
      (primaryPool.length === 0
        ? workingCalendarEvents.find((e) => e.id === selectedEventId)
        : undefined)
    : undefined;

  const highImpactNearest = sortedPrimaryEvents.find((e) => e.impact === 'High');
  const primaryEvent: MacroCalendarEvent =
    explicitSelectedPrimary ||
    nearestUpcomingPrimary ||
    highImpactNearest ||
    sortedPrimaryEvents[0] || {
      id: 'live-calendar-unavailable',
      title: 'Gagal memuat kalender live — periksa koneksi atau coba refresh',
      country: 'USD',
      date: new Date(nowMs).toISOString(),
      impact: 'High',
      previous: '—',
      forecast: '—',
      actual: '',
      previousNum: null,
      forecastNum: null,
      actualNum: null,
      unit: '',
      pillar: 'POLICY',
      isInverseIndicator: false,
      eventBiasForGold: 'MIXED',
      biasReasonId: 'Gagal memuat kalender live — periksa koneksi atau coba refresh',
      biasReasonEn: 'Failed to load live calendar — check connection or try refreshing',
      isLiveFeed: false,
      eventCategory: 'PRIMARY_HIGH_IMPACT',
    };

  // Detect Simultaneous Releases (other Primary High-Impact USD events within 15 minutes of primaryEvent)
  const primaryTimeMs = new Date(primaryEvent.date).getTime();
  const simultaneousEvents = workingCalendarEvents.filter((e) => {
    if (e.id === primaryEvent.id) return false;
    if (isFedSpeechEvent(e.title)) return false;
    const tMs = new Date(e.date).getTime();
    if (!Number.isFinite(primaryTimeMs) || !Number.isFinite(tMs)) return false;
    if (Math.abs(tMs - primaryTimeMs) > 15 * 60 * 1000) return false;
    // Strictly require Primary High-Impact in full calendars; allow synthetic 2-event test pairs
    return isPrimaryHighImpactEvent(e) || (workingCalendarEvents.length <= 3 && e.impact === 'High');
  });

  const allClusterEvents = [primaryEvent, ...simultaneousEvents];
  const isSimultaneousRelease = simultaneousEvents.length > 0;

  let buyScore = 0;
  let sellScore = 0;
  let whipsawScore = 15; // Base uncertainty

  const buyArguments: PillarArgumentItem[] = [];
  const sellArguments: PillarArgumentItem[] = [];

  // 1. Evaluate all events in the release cluster & across the 3 FOMC Pillars
  let clusterBuyCount = 0;
  let clusterSellCount = 0;
  let clusterMixedCount = 0;

  for (const ev of allClusterEvents) {
    const weight = ev.impact === 'High' ? 28 : 16;
    if (ev.eventBiasForGold === 'BUY') {
      buyScore += weight;
      clusterBuyCount += 1;
      buyArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else if (ev.eventBiasForGold === 'SELL') {
      sellScore += weight;
      clusterSellCount += 1;
      sellArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else {
      whipsawScore += 16;
      clusterMixedCount += 1;
    }
  }

  // Also include broader weekly FOMC Pillar & Supporting Reference context (Claims, ADP, JOLTS, etc.)
  for (const ev of workingCalendarEvents) {
    if (allClusterEvents.some((c) => c.id === ev.id)) continue;
    if (isFedSpeechEvent(ev.title)) continue;
    const isSupporting = isSupportingReferenceEvent(ev);
    const contextWeight = isSupporting ? 8 : 10;
    const tagPrefix = isSupporting ? `KONTEKS PENDUKUNG (${ev.pillar})` : ev.pillar;
    if (ev.eventBiasForGold === 'BUY' && buyArguments.length < 4) {
      buyScore += contextWeight;
      buyArguments.push({
        pillar: ev.pillar,
        tag: `${tagPrefix} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else if (ev.eventBiasForGold === 'SELL' && sellArguments.length < 4) {
      sellScore += contextWeight;
      sellArguments.push({
        pillar: ev.pillar,
        tag: `${tagPrefix} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    }
  }

  // 2. Check Simultaneous Release alignment vs conflict
  // Conflict occurs if >= 2 simultaneous events point in opposite directions (BUY vs SELL) or diverge (BUY/SELL vs stagnant MIXED)
  let simultaneousAlignment: PreNewsScenarioMatrix['simultaneousAlignment'] = 'SINGLE';
  if (isSimultaneousRelease) {
    const hasBuy = clusterBuyCount > 0;
    const hasSell = clusterSellCount > 0;
    const hasMixed = clusterMixedCount > 0;
    if ((hasBuy && hasSell) || (hasMixed && (hasBuy || hasSell))) {
      simultaneousAlignment = 'CONFLICTING_WHIPSAW';
      whipsawScore += 45;
    } else if (hasSell && !hasBuy) {
      simultaneousAlignment = 'ALIGNED_SELL';
      sellScore += 18;
    } else if (hasBuy && !hasSell) {
      simultaneousAlignment = 'ALIGNED_BUY';
      buyScore += 18;
    }
  }

  // 3. Evaluate Intermarket Pulse (DXY, US10Y, USOIL) & Real-Time Divergence (Priced-In / Pindah Haluan)
  const { dxy, usoil, us10y } = intermarketPulse;
  const calendarExpectsBuy = clusterBuyCount > clusterSellCount;
  const calendarExpectsSell = clusterSellCount > clusterBuyCount;

  if (dxy.direction === 'UP' && us10y.direction === 'UP') {
    sellScore += 20;
    if (calendarExpectsBuy) {
      // Intermarket contradicts calendar BUY expectation -> Priced-In / Intraday Divergence
      whipsawScore += 16;
      sellArguments.push({
        pillar: 'INTERMARKET',
        tag: `INTERMARKET • DIVERGENSI DXY & US10Y`,
        textId: `Divergensi Intermarket Real-Time: Meskipun ekspektasi kalender mendukung BUY, DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) justru naik (indikasi Priced-In / Pindah Haluan) → Menahan keyakinan BUY tunggal.`,
        textEn: `Real-Time Intermarket Divergence: Although calendar consensus favors BUY, DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) are rising (Priced-In / Intraday Pivot) → Dampening single-direction BUY conviction.`,
      });
    } else {
      sellArguments.push({
        pillar: 'INTERMARKET',
        tag: `INTERMARKET • DXY & US10Y`,
        textId: `Konfirmasi Intermarket Valid: DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) kompak naik, menekan daya tarik XAU/USD tanpa imbal hasil.`,
        textEn: `Valid Intermarket Confirmation: DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) are rising in tandem, pressuring non-yielding XAU/USD.`,
      });
    }
  } else if (dxy.direction === 'DOWN' && us10y.direction === 'DOWN') {
    buyScore += 20;
    if (calendarExpectsSell) {
      // Intermarket contradicts calendar SELL expectation -> Priced-In / Intraday Divergence
      whipsawScore += 16;
      buyArguments.push({
        pillar: 'INTERMARKET',
        tag: `INTERMARKET • DIVERGENSI DXY & US10Y`,
        textId: `Divergensi Intermarket Real-Time: Meskipun ekspektasi kalender mendukung SELL, DXY (${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent.toFixed(2)}%) melemah serempak (indikasi Priced-In) → Mengurangi keyakinan SELL tunggal.`,
        textEn: `Real-Time Intermarket Divergence: Despite a SELL calendar consensus, DXY (${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent.toFixed(2)}%) are pulling back in tandem (Priced-In signal) → Reducing single-direction SELL conviction.`,
      });
    } else {
      buyArguments.push({
        pillar: 'INTERMARKET',
        tag: `INTERMARKET • DXY & US10Y`,
        textId: `Dukungan Intermarket: Pelemahan serempak DXY (${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent.toFixed(2)}%) membuka ruang reli BUY pada XAU/USD.`,
        textEn: `Intermarket Support: Simultaneous pullback in DXY (${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent.toFixed(2)}%) opens upside room for BUY XAU/USD.`,
      });
    }
  } else {
    whipsawScore += 10;
  }

  // Dual-Channel Oil & Geopolitics Evaluation
  let oilChannelDominance: PreNewsScenarioMatrix['oilChannelDominance'] = 'NEUTRAL';
  const hasOilHeadline = workingBreakingNews.some(
    (b) => b.channelType === 'OIL_INFLATION_CHANNEL' || b.matchedKeywords.includes('Hormuz') || b.matchedKeywords.includes('Oil')
  );
  if (usoil.changePercent >= 1.25 || hasOilHeadline) {
    oilChannelDominance = 'INFLATION_CHANNEL_SELL_GOLD';
    sellScore += 18;
    sellArguments.push({
      pillar: 'GEOPOLITICS',
      tag: 'DUAL-CHANNEL • USOIL INFLATION',
      textId: `Dominasi Inflation Channel (US Oil WTI ${usoil.changePercent >= 0 ? '+' : ''}${usoil.changePercent.toFixed(2)}% @ $${usoil.price.toFixed(2)}): Kenaikan minyak saat inflasi > 2% memicu transmisi ke Producer Energy PPI & CPI (time-lag), memaksa Fed tetap Hawkish → SELL Gold.`,
      textEn: `Inflation Channel Dominance (US Oil WTI ${usoil.changePercent >= 0 ? '+' : ''}${usoil.changePercent.toFixed(2)}% @ $${usoil.price.toFixed(2)}): Oil surge while inflation > 2% transmits into Producer Energy PPI & CPI (with time-lag), forcing a Hawkish Fed → SELL Gold.`,
    });
  } else if (usoil.changePercent <= -1.0) {
    buyScore += 12;
    buyArguments.push({
      pillar: 'INTERMARKET',
      tag: 'INFLATION RELIEF • USOIL',
      textId: `Penurunan harga US Oil WTI (${usoil.changePercent.toFixed(2)}%) meredakan ekspektasi inflasi energi utama → Mengurangi tekanan suku bunga Fed (Pendukung BUY XAU/USD).`,
      textEn: `Pullback in US Oil WTI (${usoil.changePercent.toFixed(2)}%) eases headline energy inflation expectations → Reduces Hawkish Fed pressure (Supports BUY XAU/USD).`,
    });
  }

  // 4. Auto-Scan RSS Headline & Evaluate Dynamic Pivot Rule ("Aturan Pindah Haluan Bang Nael")
  const fedSpeechEvents = workingCalendarEvents.filter((e) => isFedSpeechEvent(e.title));
  const primaryDayStr = (primaryEvent?.date || '').slice(0, 10);
  const nowDayStr = new Date().toISOString().slice(0, 10);
  const hasFedSpeechTodayOrSameDay = fedSpeechEvents.some((e) => {
    const eDay = (e.date || '').slice(0, 10);
    return eDay === primaryDayStr || eDay === nowDayStr;
  });

  // Evaluate Tone of Speech / Top 10 RSS Headlines automatically
  let statementTone: 'HAWKISH' | 'DOVISH' | 'NEUTRAL' = 'NEUTRAL';
  let speechToneSource: BreakingNewsHeadline | null = null;

  for (const b of workingBreakingNews.slice(0, 10)) {
    const tone = analyzeStatementTone(b.title);
    if (tone !== 'NEUTRAL') {
      statementTone = tone;
      speechToneSource = b;
      break;
    }
  }

  if (statementTone === 'NEUTRAL' && customHeadlineText) {
    statementTone = analyzeStatementTone(customHeadlineText);
  }

  const hasCoolingCpiForecast = workingCalendarEvents.some(
    (e) =>
      e.pillar === 'INFLATION' &&
      e.title.toUpperCase().includes('CPI') &&
      e.forecastNum !== null &&
      e.previousNum !== null &&
      e.forecastNum < e.previousNum
  );
  const hawkishFedNews = workingBreakingNews.find(
    (b) => b.channelType === 'FED_SPEECH' && b.sentimentForGold === 'BEARISH'
  );
  const strongNfpEvent = workingCalendarEvents.find(
    (e) =>
      e.pillar === 'LABOR' &&
      (e.title.toUpperCase().includes('NON-FARM') || e.title.toUpperCase().includes('NFP')) &&
      e.eventBiasForGold === 'SELL'
  );

  let dynamicPivotTriggered = false;
  let dynamicPivotType: 'HAWKISH_OVERRIDE' | 'DOVISH_OVERRIDE' | undefined;
  let dynamicPivotReasonId: string | undefined;
  let dynamicPivotReasonEn: string | undefined;
  let fedSpeechAlertNoteId: string | undefined;
  let fedSpeechAlertNoteEn: string | undefined;

  // HAWKISH OVERRIDE: Auto-scanned RSS headline reveals Fed official backing rate hike / tightening / sticky inflation
  if (statementTone === 'HAWKISH' || (hawkishFedNews && (hasCoolingCpiForecast || strongNfpEvent))) {
    dynamicPivotTriggered = true;
    dynamicPivotType = 'HAWKISH_OVERRIDE';
    sellScore += 45;
    buyScore = Math.max(5, Math.min(buyScore, 15));
    const officialName =
      speechToneSource?.matchedKeywords?.join(', ') ||
      hawkishFedNews?.matchedKeywords?.join(', ') ||
      'Pejabat Fed';
    dynamicPivotReasonId = `PINDAH HALUAN: HAWKISH OVERRIDE (Aturan Pindah Haluan Bang Nael) — Auto-scan RSS mendeteksi pernyataan pejabat Fed (${officialName}) bernada Hawkish (sinyal suku bunga tinggi / pengetatan moneter) yang membalikkan arah skenario menjadi SELL 1 ARAH pada XAU/USD.`;
    dynamicPivotReasonEn = `DYNAMIC PIVOT: HAWKISH OVERRIDE (Bang Nael Pivot Rule) — RSS auto-scan detected Fed official remarks (${officialName}) tilting Hawkish (rate hike/higher-for-longer guidance), flipping the scenario into a 1-WAY SELL on XAU/USD.`;
    sellArguments.unshift({
      pillar: 'POLICY',
      tag: 'PINDAH HALUAN • HAWKISH OVERRIDE',
      textId: dynamicPivotReasonId,
      textEn: dynamicPivotReasonEn,
    });
  } else if (statementTone === 'DOVISH') {
    // DOVISH OVERRIDE: Auto-scanned RSS headline reveals Fed official signaling rate cuts / easing / pause
    dynamicPivotTriggered = true;
    dynamicPivotType = 'DOVISH_OVERRIDE';
    buyScore += 45;
    sellScore = Math.max(5, Math.min(sellScore, 15));
    const officialName = speechToneSource?.matchedKeywords?.join(', ') || 'Pejabat Fed';
    dynamicPivotReasonId = `PINDAH HALUAN: DOVISH OVERRIDE (Aturan Pindah Haluan Bang Nael) — Auto-scan RSS mendeteksi pernyataan pejabat Fed (${officialName}) bernada Dovish (sinyal pemangkasan suku bunga / pelonggaran moneter) yang membalikkan arah skenario menjadi BUY 1 ARAH pada XAU/USD.`;
    dynamicPivotReasonEn = `DYNAMIC PIVOT: DOVISH OVERRIDE (Bang Nael Pivot Rule) — RSS auto-scan detected Fed official remarks (${officialName}) tilting Dovish (rate cuts / monetary easing guidance), flipping the scenario into a 1-WAY BUY on XAU/USD.`;
    buyArguments.unshift({
      pillar: 'POLICY',
      tag: 'PINDAH HALUAN • DOVISH OVERRIDE',
      textId: dynamicPivotReasonId,
      textEn: dynamicPivotReasonEn,
    });
  }

  // Fed Speech Cautionary Note if Fed speech is on calendar today with no directional speech headline yet
  if (hasFedSpeechTodayOrSameDay && !dynamicPivotTriggered) {
    fedSpeechAlertNoteId =
      'Waspada jadwal pidato pejabat Fed hari ini — pantau DXY & US02Y sebelum entry';
    fedSpeechAlertNoteEn =
      'Caution: Fed official speech scheduled today — monitor DXY & US02Y before entry';
  }

  // Ensure both argument lists have at least 2 structured points for balanced tactical review
  if (buyArguments.length === 0) {
    buyArguments.push({
      pillar: 'LABOR',
      tag: 'LABOR • SLOW HIRE SLOW FIRE',
      textId:
        'Sub-komponen JOLTS Hiring & ISM Employment yang melambat di bawah 50 membuka peluang rebound BUY XAU/USD jika rilis data aktual meleset di bawah konsensus.',
      textEn:
        'Sub-components JOLTS Hiring & ISM Employment cooling below 50 open a BUY XAU/USD rebound window if actual data misses consensus.',
    });
  }
  if (sellArguments.length === 0) {
    sellArguments.push({
      pillar: 'INFLATION',
      tag: 'INFLATION • STICKY CORE',
      textId:
        'Inflasi inti layanan & komponen ISM Prices Paid yang bertahan tinggi menjaga imbal hasil riil AS tetap ketat, membatasi reli XAU/USD di area resistance.',
      textEn:
        'Sticky core services inflation & elevated ISM Prices Paid keep US real yields restrictive, capping XAU/USD rallies at resistance.',
    });
  }

  // 5. Normalize Probabilities (buyProbability + sellProbability + mixedProbability === 100)
  const rawTotal = Math.max(1, buyScore + sellScore + whipsawScore);
  let buyProbability = Math.round((buyScore / rawTotal) * 100);
  let sellProbability = Math.round((sellScore / rawTotal) * 100);
  let mixedProbability = Math.max(5, 100 - buyProbability - sellProbability);

  // Enforce >= 40% MIXED / WHIPSAW probability when Simultaneous Release Conflict is detected (unless overridden by Dynamic Pivot)
  if (
    simultaneousAlignment === 'CONFLICTING_WHIPSAW' &&
    !dynamicPivotTriggered &&
    mixedProbability < 40
  ) {
    mixedProbability = 42;
    const remaining = 100 - mixedProbability;
    const dirSum = Math.max(1, buyScore + sellScore);
    buyProbability = Math.round((buyScore / dirSum) * remaining);
    sellProbability = Math.max(0, remaining - buyProbability);
  }

  if (buyProbability + sellProbability + mixedProbability !== 100) {
    const diff = 100 - (buyProbability + sellProbability + mixedProbability);
    mixedProbability += diff;
  }

  // Determine Dominant Bias
  let dominantBias: MacroBiasDirection = 'MIXED';
  if (dynamicPivotTriggered) {
    dominantBias = dynamicPivotType === 'HAWKISH_OVERRIDE' ? 'SELL' : 'BUY';
  } else if (simultaneousAlignment === 'CONFLICTING_WHIPSAW' && mixedProbability >= 30) {
    dominantBias = 'MIXED';
  } else if (sellProbability >= buyProbability + 8) {
    dominantBias = 'SELL';
  } else if (buyProbability >= sellProbability + 8) {
    dominantBias = 'BUY';
  } else {
    dominantBias = 'MIXED';
  }

  // Impact Level
  const hasHighImpactNews = workingBreakingNews.some((b) => b.impact === 'HIGH');
  const hasHighImpactEvent = primaryEvent.impact === 'High';
  const impactLevel: MacroImpactLevel =
    hasHighImpactNews || hasHighImpactEvent || dynamicPivotTriggered ? 'HIGH' : 'MEDIUM';

  // T-5M First-Second Execution Tactics (100% Automatic from Probability Distribution)
  const isStrongOneWayBias = buyProbability >= 60 || sellProbability >= 60;
  const t5ExecutionTacticId = isStrongOneWayBias
    ? 'BIAS 1 ARAH KUAT (FINAL T-5M) — Siapkan setup dan kalkulasi lot di area struktur M1/M5 sebelum detik rilis, gunakan SL ketat.'
    : 'POTENSI SPIKE 2 ARAH / WHIPSAW (FINAL T-5M) — Tahan entry sebelum rilis; biarkan likuiditas 1–2 menit pertama tersapu terlebih dahulu.';
  const t5ExecutionTacticEn = isStrongOneWayBias
    ? 'STRONG 1-WAY BIAS (FINAL T-5M) — Prepare setup and lot calculation at M1/M5 structure zones before release second, use tight SL.'
    : 'TWO-WAY SPIKE / WHIPSAW RISK (FINAL T-5M) — Hold entry before release; let the first 1–2 minutes of liquidity sweep settle first.';

  // Final Take, Action Plan, and Whipsaw Warning
  const finalTakeId =
    dominantBias === 'SELL'
      ? `BIAS DOMINAN: SELL XAU/USD (${sellProbability}%). Kombinasi tekanan 3 Pilar FOMC${dynamicPivotTriggered ? ', sinyal Pindah Haluan pejabat Fed,' : ''} serta konfirmasi imbal hasil US10Y/DXY menempatkan XAU/USD dalam skenario jual saat pullback (Sell on Rally).`
      : dominantBias === 'BUY'
      ? `BIAS DOMINAN: BUY XAU/USD (${buyProbability}%). Ekspektasi pelambatan data makro AS dan meredanya tekanan DXY/US10Y mendukung skenario beli terukur (Buy on Dip) setelah likuiditas rilis berita terserap.`
      : `BIAS DOMINAN: MIXED / RAWAN WHIPSAW (${mixedProbability}%). Terdapat divergensi antar-pilar data makro atau rilis simultan yang berlawanan arah. Hindari entry agresif sebelum arah candle M15 pasca-rilis terkonfirmasi.`;

  const finalTakeEn =
    dominantBias === 'SELL'
      ? `DOMINANT BIAS: SELL XAU/USD (${sellProbability}%). Alignment across the 3 FOMC Pillars${dynamicPivotTriggered ? ', Dynamic Hawkish Fed Pivot,' : ''} and US10Y/DXY confirmation places XAU/USD in a Sell-on-Rally regime.`
      : dominantBias === 'BUY'
      ? `DOMINANT BIAS: BUY XAU/USD (${buyProbability}%). Cooling US macro consensus and softer DXY/US10Y yields support a disciplined Buy-on-Dip setup once initial release volatility settles.`
      : `DOMINANT BIAS: MIXED / WHIPSAW RISK (${mixedProbability}%). Cross-pillar divergence or conflicting simultaneous releases detected. Avoid aggressive execution until the post-release M15 candle structure confirms direction.`;

  const actionPlanId =
    dominantBias === 'SELL'
      ? `1. ${t5ExecutionTacticId}\n2. Konfirmasi SELL 1 Arah jika pergerakan harga selaras dengan kenaikan US10Y Yield & DXY.\n3. Jika FedWatch > 90%, fokuskan eksekusi pada nada Forward Guidance / Press Conference.`
      : dominantBias === 'BUY'
      ? `1. ${t5ExecutionTacticId}\n2. Eksekusi BUY terukur di area struktur M1/M5 apabila DXY & US10Y Yield tertahan turun.\n3. Amankan parsial pada rasio 1:2 R:R.`
      : `1. ${t5ExecutionTacticId}\n2. Tunggu sweep likuiditas atas & bawah pasca-rilis ${primaryEvent.title}.\n3. Hanya eksekusi searah breakout struktur M5/M15 yang dikonfirmasi oleh arah DXY & US10Y.`;

  const actionPlanEn =
    dominantBias === 'SELL'
      ? `1. ${t5ExecutionTacticEn}\n2. Confirm 1-Way SELL if price action aligns with rising US10Y Yields & DXY.\n3. If FedWatch pricing > 90%, anchor execution on Forward Guidance / Press Conference tone.`
      : dominantBias === 'BUY'
      ? `1. ${t5ExecutionTacticEn}\n2. Scale into BUY setups at M1/M5 structure zones as DXY & US10Y Yields roll over.\n3. Lock partial profit at 1:2 R:R.`
      : `1. ${t5ExecutionTacticEn}\n2. Wait for the two-way liquidity sweep after the ${primaryEvent.title} release.\n3. Only execute in the direction of the M5/M15 structure break confirmed by DXY & US10Y.`;

  const whipsawWarningId =
    simultaneousAlignment === 'CONFLICTING_WHIPSAW'
      ? `RISIKO WHIPSAW SAAT RILIS: ${allClusterEvents.length} data rilis bersamaan (${allClusterEvents.map((e) => e.title).join(' + ')}) memiliki sinyal berlawanan! Potensi spike 2 arah sangat tinggi pada menit pertama.`
      : isSimultaneousRelease
      ? `Rilis Simultan (${allClusterEvents.length} Event Bersamaan): Pastikan seluruh komponen searah saat rilis. Jika salah satu komponen berlawanan arah, waspadai RISIKO WHIPSAW SAAT RILIS.`
      : `Waspadai spike likuiditas awal pada detik rilis jika angka konsensus tipis atau terdapat divergensi intermarket.`;

  const whipsawWarningEn =
    simultaneousAlignment === 'CONFLICTING_WHIPSAW'
      ? `RELEASE WHIPSAW RISK: ${allClusterEvents.length} simultaneous releases (${allClusterEvents.map((e) => e.title).join(' + ')}) show conflicting signals! High risk of a two-way Fake Move in the first minute.`
      : isSimultaneousRelease
      ? `Simultaneous Release (${allClusterEvents.length} Concurrent Events): Verify all sub-components align at release. If one component diverges, guard against a Fake Move.`
      : `Watch for initial liquidity spikes at the release second if consensus figures are tight or intermarket diverges.`;

  const topBreakingAlert =
    workingBreakingNews.find((b) => b.impact === 'HIGH') || workingBreakingNews[0] || null;

  const slotKey = selectedEventId ? `${primaryEvent.id}:${primaryEvent.date}` : undefined;
  const dataFingerprint = computeMacroDataFingerprint(
    workingCalendarEvents,
    workingBreakingNews,
    slotKey
  );

  return {
    id: `macro-snap-${Date.now()}`,
    instrument: 'XAUUSD',
    dataFingerprint,
    analyzedAt: new Date().toISOString(),
    sourceMode,
    modelUsed,
    impactLevel,
    dominantBias,
    breakingNews: workingBreakingNews,
    topBreakingAlert,
    intermarketPulse,
    calendarEvents: workingCalendarEvents,
    scenarioMatrix: {
      primaryEvent,
      simultaneousEvents,
      isSimultaneousRelease,
      simultaneousAlignment,
      buyProbability,
      sellProbability,
      mixedProbability,
      dominantBias,
      dynamicPivotTriggered,
      dynamicPivotReasonId,
      dynamicPivotReasonEn,
      dynamicPivotType,
      fedSpeechAlertNoteId,
      fedSpeechAlertNoteEn,
      oilChannelDominance,
      buyArguments,
      sellArguments,
      finalTakeId,
      finalTakeEn,
      actionPlanId,
      actionPlanEn,
      whipsawWarningId,
      whipsawWarningEn,
      t5ExecutionTacticId,
      t5ExecutionTacticEn,
      isStrongOneWayBias,
    },
  };
}

/**
 * Formats remaining milliseconds into HH:MM:SS countdown format (e.g., "00:14:32").
 */
export function formatCountdownHms(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Analyzes a selected MacroEventGroup (or event ID) with 100% automatic Pre-News rules:
 * - Simultaneous release grouping (e.g. Core PPI m/m & PPI m/m)
 * - Forecast vs Previous directional scoring
 * - Simultaneous release conflict detection (MIXED >= 40% & RISIKO WHIPSAW SAAT RILIS)
 * - Real-time DXY, USOIL, US10Y intermarket confirmation & divergence detection
 * - RSS headline filtering for Fed speeches & geopolitics (Aturan Pindah Haluan Bang Nael)
 */
export function analyzeMacroEvent(
  selectedEventGroupOrParams:
    | MacroEventGroup
    | {
        calendarEvents: MacroCalendarEvent[];
        intermarketPulse: {
          dxy: IntermarketAssetPulse;
          usoil: IntermarketAssetPulse;
          us10y: IntermarketAssetPulse;
        };
        breakingNews: BreakingNewsHeadline[];
        selectedEventId?: string;
        selectedEventGroup?: MacroEventGroup;
        sourceMode?: MacroNewsSnapshot['sourceMode'];
        modelUsed?: string;
      },
  context?: {
    calendarEvents: MacroCalendarEvent[];
    intermarketPulse: {
      dxy: IntermarketAssetPulse;
      usoil: IntermarketAssetPulse;
      us10y: IntermarketAssetPulse;
    };
    breakingNews: BreakingNewsHeadline[];
    sourceMode?: MacroNewsSnapshot['sourceMode'];
    modelUsed?: string;
  }
): MacroNewsSnapshot {
  if ('groupId' in selectedEventGroupOrParams) {
    const group = selectedEventGroupOrParams;
    const ctx = context || {
      calendarEvents: group.events,
      intermarketPulse: {
        dxy: {
          symbol: 'DXY',
          yahooTicker: 'DX-Y.NYB',
          name: 'US Dollar Index (DXY)',
          price: 104.5,
          previousClose: 104.5,
          change: 0,
          changePercent: 0,
          direction: 'FLAT',
          goldCorrelationEffect: 'NEUTRAL',
          summaryId: 'DXY mendatar',
          summaryEn: 'DXY flat',
          updatedAt: new Date().toISOString(),
        },
        usoil: {
          symbol: 'USOIL',
          yahooTicker: 'CL=F',
          name: 'US Oil WTI',
          price: 73.0,
          previousClose: 73.0,
          change: 0,
          changePercent: 0,
          direction: 'FLAT',
          goldCorrelationEffect: 'NEUTRAL',
          summaryId: 'WTI stabil',
          summaryEn: 'WTI stable',
          updatedAt: new Date().toISOString(),
        },
        us10y: {
          symbol: 'US10Y',
          yahooTicker: '^TNX',
          name: 'US 10Y Treasury Yield',
          price: 4.35,
          previousClose: 4.35,
          change: 0,
          changePercent: 0,
          direction: 'FLAT',
          goldCorrelationEffect: 'NEUTRAL',
          summaryId: 'Yield 10Y stabil',
          summaryEn: '10Y Yield stable',
          updatedAt: new Date().toISOString(),
        },
      },
      breakingNews: [],
    };
    return computeDeterministicMacroSnapshot({
      calendarEvents: ctx.calendarEvents.length > 0 ? ctx.calendarEvents : group.events,
      intermarketPulse: ctx.intermarketPulse,
      breakingNews: ctx.breakingNews,
      selectedEventId: group.groupId,
      sourceMode: ctx.sourceMode,
      modelUsed: ctx.modelUsed,
    });
  }

  const targetId =
    selectedEventGroupOrParams.selectedEventGroup?.groupId ||
    selectedEventGroupOrParams.selectedEventId;

  return computeDeterministicMacroSnapshot({
    calendarEvents: selectedEventGroupOrParams.calendarEvents,
    intermarketPulse: selectedEventGroupOrParams.intermarketPulse,
    breakingNews: selectedEventGroupOrParams.breakingNews,
    selectedEventId: targetId,
    sourceMode: selectedEventGroupOrParams.sourceMode,
    modelUsed: selectedEventGroupOrParams.modelUsed,
  });
}

/**
 * Computes the T-5 Minute Pre-News Lock and Real-Time Countdown state for the selected or nearest upcoming USD release.
 * Distinguishes clearly between:
 * 1) Early Reference (> 5 minutes before release, including H-1 / tomorrow):
 *    projectionBadgeId = "REFERENSI AWAL • DATA SEMENTARA (BELUM FINAL T-5M)"
 *    projectionSubtextId = "Proyeksi berdasarkan Forecast, korelasi DXY/USOIL/US10Y, & sentimen RSS terkini. Tekan Refresh berkala menjelang rilis."
 * 2) Final T-5M Lock (0 < remainingMs <= 5 minutes before release):
 *    projectionBadgeId = "FINAL PRE-NEWS LOCKED (T-5M) • SIAP EKSEKUSI"
 */
export function computePreNewsLockState(
  calendarEvents: MacroCalendarEvent[],
  nowMs: number = Date.now(),
  selectedEventId?: string | null
): PreNewsCountdownState {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  // Prefer the selected event if it is a Primary High-Impact release; otherwise pick the nearest upcoming Primary High-Impact release
  const primaryPool = calendarEvents.filter((e) => isPrimaryHighImpactEvent(e));
  const effectivePool = primaryPool.length > 0 ? primaryPool : calendarEvents;

  const selectedEv = selectedEventId
    ? effectivePool.find((e) => e.id === selectedEventId)
    : undefined;

  let targetEvent: MacroCalendarEvent | null = null;
  if (selectedEv) {
    targetEvent = selectedEv;
  } else {
    const upcoming = effectivePool
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return Number.isFinite(t) && t > nowMs;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    targetEvent = upcoming[0] || effectivePool[0] || null;
  }

  const targetTimeMs = targetEvent ? new Date(targetEvent.date).getTime() : NaN;
  const remainingMs =
    Number.isFinite(targetTimeMs) && targetTimeMs > nowMs ? targetTimeMs - nowMs : 0;

  const isLockedT5M = remainingMs > 0 && remainingMs <= FIVE_MINUTES_MS;
  const formattedCountdown = formatCountdownHms(remainingMs);

  const statusLabelId = isLockedT5M
    ? 'FINAL PRE-NEWS LOCKED (T-5M)'
    : 'Auto-Update Final pada T-05:00';
  const statusLabelEn = isLockedT5M
    ? 'FINAL PRE-NEWS LOCKED (T-5M)'
    : 'Final Auto-Update at T-05:00';

  const projectionBadgeId = isLockedT5M
    ? 'FINAL PRE-NEWS LOCKED (T-5M) • SIAP EKSEKUSI'
    : 'REFERENSI AWAL • DATA SEMENTARA (BELUM FINAL T-5M)';
  const projectionBadgeEn = isLockedT5M
    ? 'FINAL PRE-NEWS LOCKED (T-5M) • READY FOR EXECUTION'
    : 'EARLY REFERENCE • PRELIMINARY DATA (NOT FINAL T-5M)';

  const projectionSubtextId = isLockedT5M
    ? 'Auto-Update Final telah dieksekusi pada T-05:00. Tampilan dikunci (Freeze Auto-Refresh) agar probabilitas BUY / SELL / MIXED stabil saat eksekusi.'
    : 'Proyeksi berdasarkan Forecast, korelasi DXY/USOIL/US10Y, & sentimen RSS terkini. Tekan Refresh berkala menjelang rilis.';
  const projectionSubtextEn = isLockedT5M
    ? 'Final Auto-Update executed at T-05:00. Display locked (Freeze Auto-Refresh) so BUY / SELL / MIXED probabilities remain stable for execution.'
    : 'Projection based on Forecast, DXY/USOIL/US10Y correlation, & latest RSS sentiment. Press Refresh periodically ahead of release.';

  return {
    targetEvent,
    remainingMs,
    formattedCountdown,
    countdownHms: formattedCountdown,
    isLockedT5M,
    statusLabelId,
    statusLabelEn,
    projectionBadgeId,
    projectionBadgeEn,
    projectionSubtextId,
    projectionSubtextEn,
  };
}

/**
 * Formats an ISO timestamp into WIB (Asia/Jakarta, UTC+7) human-readable string.
 */
export function formatTimestampWib(isoStr: string, lang: 'id' | 'en' = 'id'): string {
  if (!isoStr) return '-';
  try {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return isoStr;
    const formatted = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dt);
    return `${formatted.replace(',', ' ·')} WIB`;
  } catch {
    return isoStr;
  }
}

/**
 * Checks if a snapshot was analyzed within the last `maxAgeMinutes` (default 30 mins).
 */
export function isSnapshotFresh(
  snapshot: MacroNewsSnapshot | null | undefined,
  maxAgeMinutes = SNAPSHOT_TTL_MINUTES
): boolean {
  if (!snapshot || !snapshot.analyzedAt) return false;
  const analyzedMs = new Date(snapshot.analyzedAt).getTime();
  if (!Number.isFinite(analyzedMs)) return false;
  return Date.now() - analyzedMs < maxAgeMinutes * 60 * 1000;
}

/**
 * Verifies that a MacroNewsSnapshot contains 100% authentic live ForexFactory calendar data
 * and zero legacy/mock fallback items.
 */
export function isVerifiedLiveCalendarSnapshot(
  snap: MacroNewsSnapshot | null | undefined
): boolean {
  if (!snap || !snap.scenarioMatrix || !snap.intermarketPulse) return false;
  if (!snap.isCalendarLiveFeed) return false;
  if (!Array.isArray(snap.calendarEvents) || snap.calendarEvents.length === 0) return false;
  return snap.calendarEvents.every(
    (e) =>
      e.isLiveFeed === true &&
      !String(e.id || '').startsWith('ff-usd-') &&
      e.id !== 'fallback-ppi-event' &&
      e.id !== 'live-calendar-unavailable'
  );
}

/**
 * Loads the latest cached MacroNewsSnapshot from localStorage and/or Supabase (`macro_news_snapshots`).
 * Strictly rejects any legacy/non-live mock snapshot so only verified live ForexFactory data is used.
 * Uses 0 Gemini tokens!
 */
export async function loadLatestCachedMacroSnapshot(): Promise<MacroNewsSnapshot | null> {
  let localSnap: MacroNewsSnapshot | null = null;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MacroNewsSnapshot;
        if (isVerifiedLiveCalendarSnapshot(parsed)) {
          localSnap = parsed;
        } else {
          // Purge stale mock snapshot from localStorage
          localStorage.removeItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY);
          localStorage.removeItem(MACRO_GROUP_SNAPSHOT_CACHE_KEY);
        }
      }
    } catch {
      // ignore local storage parse error
    }
  }

  if (isSupabaseConfigured()) {
    const client = getSupabase();
    if (client) {
      try {
        const { data, error } = await client
          .from('macro_news_snapshots')
          .select('id, data_fingerprint, snapshot_payload, analyzed_at')
          .eq('instrument', 'XAUUSD')
          .order('analyzed_at', { ascending: false })
          .limit(5);

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const remoteSnap = row.snapshot_payload as MacroNewsSnapshot;
            if (isVerifiedLiveCalendarSnapshot(remoteSnap)) {
              const remoteTime = new Date(row.analyzed_at || remoteSnap.analyzedAt).getTime();
              const localTime = localSnap ? new Date(localSnap.analyzedAt).getTime() : 0;

              if (!localSnap || remoteTime >= localTime) {
                const hydrated: MacroNewsSnapshot = {
                  ...remoteSnap,
                  sourceMode: 'SUPABASE_CACHE',
                };
                if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                  try {
                    localStorage.setItem(
                      MACRO_SNAPSHOT_LOCAL_STORAGE_KEY,
                      JSON.stringify(hydrated)
                    );
                  } catch {}
                }
                return hydrated;
              }
              break;
            }
          }
        }
      } catch {
        // Fallback silently to localSnap if table does not exist or offline
      }
    }
  }

  return localSnap;
}

/**
 * Loads a cached MacroNewsSnapshot for a specific event group or data_fingerprint from localStorage or Supabase.
 */
export async function loadCachedSnapshotByFingerprint(
  dataFingerprint: string,
  maxAgeMinutes = 15
): Promise<MacroNewsSnapshot | null> {
  if (!dataFingerprint) return null;

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const rawMap = localStorage.getItem(MACRO_GROUP_SNAPSHOT_CACHE_KEY);
      if (rawMap) {
        const parsedMap = JSON.parse(rawMap) as Record<string, MacroNewsSnapshot>;
        const candidate = parsedMap[dataFingerprint];
        if (
          candidate &&
          isVerifiedLiveCalendarSnapshot(candidate) &&
          isSnapshotFresh(candidate, maxAgeMinutes)
        ) {
          return { ...candidate, sourceMode: 'SUPABASE_CACHE' };
        }
      }
    } catch {
      // ignore localStorage parse error
    }
  }

  if (isSupabaseConfigured()) {
    const client = getSupabase();
    if (client) {
      try {
        const { data, error } = await client
          .from('macro_news_snapshots')
          .select('id, data_fingerprint, snapshot_payload, analyzed_at')
          .eq('instrument', 'XAUUSD')
          .eq('data_fingerprint', dataFingerprint)
          .order('analyzed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data && data.snapshot_payload) {
          const remoteSnap = data.snapshot_payload as MacroNewsSnapshot;
          if (
            remoteSnap &&
            isVerifiedLiveCalendarSnapshot(remoteSnap) &&
            isSnapshotFresh(remoteSnap, maxAgeMinutes)
          ) {
            return {
              ...remoteSnap,
              sourceMode: 'SUPABASE_CACHE',
            };
          }
        }
      } catch {
        // ignore network error
      }
    }
  }

  return null;
}

/**
 * Saves a newly analyzed MacroNewsSnapshot to both localStorage (latest + per-fingerprint map)
 * and Supabase (`macro_news_snapshots` keyed with `data_fingerprint`).
 * Strictly refuses to cache any snapshot whose calendar data is not verified live.
 */
export async function saveMacroSnapshotToCache(
  snapshot: MacroNewsSnapshot
): Promise<{ success: boolean; error?: string; remoteSaved: boolean }> {
  if (!isVerifiedLiveCalendarSnapshot(snapshot)) {
    return {
      success: false,
      remoteSaved: false,
      error: 'Gagal memuat kalender live — periksa koneksi atau coba refresh',
    };
  }

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
      if (snapshot.dataFingerprint) {
        const rawMap = localStorage.getItem(MACRO_GROUP_SNAPSHOT_CACHE_KEY);
        const parsedMap: Record<string, MacroNewsSnapshot> = rawMap ? JSON.parse(rawMap) : {};
        parsedMap[snapshot.dataFingerprint] = snapshot;
        if (snapshot.scenarioMatrix?.primaryEvent?.id) {
          parsedMap[`event:${snapshot.scenarioMatrix.primaryEvent.id}`] = snapshot;
        }
        localStorage.setItem(MACRO_GROUP_SNAPSHOT_CACHE_KEY, JSON.stringify(parsedMap));
      }
    } catch {
      // ignore storage quota errors
    }
  }

  if (isSupabaseConfigured()) {
    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client.from('macro_news_snapshots').insert({
          instrument: 'XAUUSD',
          data_fingerprint: snapshot.dataFingerprint,
          snapshot_payload: snapshot,
          impact_level: snapshot.impactLevel,
          dominant_bias: snapshot.dominantBias,
          source_mode: snapshot.sourceMode,
          analyzed_at: snapshot.analyzedAt,
        });

        if (error) {
          console.warn('[TradeVault Supabase] Gagal menyimpan snapshot ke macro_news_snapshots:', error);
          return {
            success: false,
            remoteSaved: false,
            error: error.message || error.details || 'Gagal menyimpan snapshot ke tabel Supabase macro_news_snapshots.',
          };
        }

        return { success: true, remoteSaved: true };
      } catch (err: any) {
        console.warn('[TradeVault Supabase] Exception saat menyimpan snapshot:', err);
        return {
          success: false,
          remoteSaved: false,
          error: err?.message || 'Terjadi kesalahan jaringan saat menyimpan ke Supabase.',
        };
      }
    }
  }

  return { success: true, remoteSaved: false };
}

/**
 * Triggers a local notification on Android (@capacitor/local-notifications) or Web Notification API
 * when `snapshot.impactLevel === 'HIGH'`.
 */
export async function triggerHighImpactMacroNotification(
  snapshot: MacroNewsSnapshot,
  lang: 'id' | 'en' = 'id',
  forceNotify = false
): Promise<boolean> {
  if (snapshot.impactLevel !== 'HIGH' && !forceNotify) {
    return false;
  }

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && !forceNotify) {
    try {
      const lastFp = localStorage.getItem(MACRO_NOTIFIED_FINGERPRINT_KEY);
      if (lastFp === snapshot.dataFingerprint) {
        return false; // Already notified for this exact data fingerprint
      }
      localStorage.setItem(MACRO_NOTIFIED_FINGERPRINT_KEY, snapshot.dataFingerprint);
    } catch {}
  }

  const matrix = snapshot.scenarioMatrix;
  const title =
    lang === 'en'
      ? `⚡ HIGH IMPACT XAU/USD: ${matrix.dominantBias} BIAS (BUY ${matrix.buyProbability}% | SELL ${matrix.sellProbability}%)`
      : `⚡ HIGH IMPACT XAU/USD: BIAS ${matrix.dominantBias} (BUY ${matrix.buyProbability}% | SELL ${matrix.sellProbability}%)`;

  const body =
    lang === 'en'
      ? `${matrix.primaryEvent.title}: ${matrix.finalTakeEn.slice(0, 140)}`
      : `${matrix.primaryEvent.title}: ${matrix.finalTakeId.slice(0, 140)}`;

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    let granted = permStatus.display === 'granted';
    if (!granted) {
      const req = await LocalNotifications.requestPermissions();
      granted = req.display === 'granted';
    }

    if (granted) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor((Date.now() % 2000000000) + 1),
            title,
            body,
            schedule: { at: new Date(Date.now() + 300) },
            extra: {
              instrument: 'XAUUSD',
              dominantBias: matrix.dominantBias,
              impactLevel: snapshot.impactLevel,
            },
          },
        ],
      });
      return true;
    }
  } catch {
    // Fallback to browser Notification API if available
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          new Notification(title, { body });
          return true;
        }
      } catch {}
    }
  }

  return false;
}
