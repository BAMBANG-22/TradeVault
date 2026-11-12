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
  oilChannelDominance: 'INFLATION_CHANNEL_SELL_GOLD' | 'SAFE_HAVEN_BUY_GOLD' | 'NEUTRAL';
  buyArguments: PillarArgumentItem[];
  sellArguments: PillarArgumentItem[];
  finalTakeId: string;
  finalTakeEn: string;
  actionPlanId: string;
  actionPlanEn: string;
  whipsawWarningId: string;
  whipsawWarningEn: string;
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
}

export const MACRO_SNAPSHOT_LOCAL_STORAGE_KEY = 'tradevault_macro_news_snapshot_v1';
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
 * Computes a deterministic fingerprint from calendar events and top breaking news headlines.
 * Used to determine whether there is new calendar/news data in the last 30 minutes.
 */
export function computeMacroDataFingerprint(
  events: MacroCalendarEvent[],
  headlines: BreakingNewsHeadline[]
): string {
  const eventSig = events
    .slice(0, 8)
    .map((e) => `${e.title}:${e.previous}:${e.forecast}:${e.actual}`)
    .join('|');
  const newsSig = headlines
    .slice(0, 3)
    .map((h) => h.title.slice(0, 40))
    .join('|');
  const raw = `${eventSig}##${newsSig}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16)}`;
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
}): MacroNewsSnapshot {
  const {
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
    sourceMode = 'RULE_BASED_FALLBACK',
    modelUsed = 'deterministic-playbook-v1',
  } = params;

  const nowMs = Date.now();

  // Pick the primary event: either matching selectedEventId, or the closest upcoming/recent High Impact USD event
  const sortedEvents = [...calendarEvents].sort((a, b) => {
    const aTime = new Date(a.date).getTime() || nowMs;
    const bTime = new Date(b.date).getTime() || nowMs;
    return Math.abs(aTime - nowMs) - Math.abs(bTime - nowMs);
  });

  const highImpactNearest = sortedEvents.find((e) => e.impact === 'High');
  const primaryEvent: MacroCalendarEvent =
    calendarEvents.find((e) => e.id === selectedEventId) ||
    highImpactNearest ||
    sortedEvents[0] || {
      id: 'fallback-cpi-event',
      title: 'US Core CPI m/m',
      country: 'USD',
      date: new Date().toISOString(),
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
      biasReasonId: '[Pilar INFLATION] US Core CPI m/m (Forecast vs Previous: 0.2% vs 0.3%) mengindikasikan pelambatan inflasi bulanan → Dorongan awal BUY XAU/USD.',
      biasReasonEn: '[INFLATION Pillar] US Core CPI m/m (Forecast vs Previous: 0.2% vs 0.3%) indicates cooling monthly inflation → Initial BUY XAU/USD catalyst.',
    };

  // Detect Simultaneous Releases (other USD events within 15 minutes of primaryEvent)
  const primaryTimeMs = new Date(primaryEvent.date).getTime();
  const simultaneousEvents = calendarEvents.filter((e) => {
    if (e.id === primaryEvent.id) return false;
    const tMs = new Date(e.date).getTime();
    if (!Number.isFinite(primaryTimeMs) || !Number.isFinite(tMs)) return false;
    return Math.abs(tMs - primaryTimeMs) <= 15 * 60 * 1000;
  });

  const allClusterEvents = [primaryEvent, ...simultaneousEvents];
  const isSimultaneousRelease = simultaneousEvents.length > 0;

  let buyScore = 0;
  let sellScore = 0;
  let whipsawScore = 15; // Base uncertainty

  const buyArguments: PillarArgumentItem[] = [];
  const sellArguments: PillarArgumentItem[] = [];

  // 1. Evaluate all events in the release cluster & across the 3 FOMC Pillars
  for (const ev of allClusterEvents) {
    const weight = ev.impact === 'High' ? 28 : 16;
    if (ev.eventBiasForGold === 'BUY') {
      buyScore += weight;
      buyArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else if (ev.eventBiasForGold === 'SELL') {
      sellScore += weight;
      sellArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else {
      whipsawScore += 14;
    }
  }

  // Also include broader weekly FOMC Pillar context from other key calendar events
  for (const ev of calendarEvents) {
    if (allClusterEvents.some((c) => c.id === ev.id)) continue;
    if (ev.impact !== 'High') continue;
    if (ev.eventBiasForGold === 'BUY' && buyArguments.length < 4) {
      buyScore += 10;
      buyArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    } else if (ev.eventBiasForGold === 'SELL' && sellArguments.length < 4) {
      sellScore += 10;
      sellArguments.push({
        pillar: ev.pillar,
        tag: `${ev.pillar} • ${ev.title}`,
        textId: ev.biasReasonId,
        textEn: ev.biasReasonEn,
      });
    }
  }

  // 2. Check Simultaneous Release alignment vs conflict
  let simultaneousAlignment: PreNewsScenarioMatrix['simultaneousAlignment'] = 'SINGLE';
  if (isSimultaneousRelease) {
    const hasBuy = allClusterEvents.some((e) => e.eventBiasForGold === 'BUY');
    const hasSell = allClusterEvents.some((e) => e.eventBiasForGold === 'SELL');
    if (hasBuy && hasSell) {
      simultaneousAlignment = 'CONFLICTING_WHIPSAW';
      whipsawScore += 32;
    } else if (hasSell && !hasBuy) {
      simultaneousAlignment = 'ALIGNED_SELL';
      sellScore += 18;
    } else if (hasBuy && !hasSell) {
      simultaneousAlignment = 'ALIGNED_BUY';
      buyScore += 18;
    }
  }

  // 3. Evaluate Intermarket Pulse (DXY, US10Y, USOIL) & Dual-Channel Oil Rule
  const { dxy, usoil, us10y } = intermarketPulse;
  if (dxy.direction === 'UP' && us10y.direction === 'UP') {
    sellScore += 20;
    sellArguments.push({
      pillar: 'INTERMARKET',
      tag: `INTERMARKET • DXY & US10Y`,
      textId: `Konfirmasi Intermarket Valid: DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) kompak naik, menekan daya tarik XAU/USD tanpa imbal hasil.`,
      textEn: `Valid Intermarket Confirmation: DXY (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%) are rising in tandem, pressuring non-yielding XAU/USD.`,
    });
  } else if (dxy.direction === 'DOWN' && us10y.direction === 'DOWN') {
    buyScore += 20;
    buyArguments.push({
      pillar: 'INTERMARKET',
      tag: `INTERMARKET • DXY & US10Y`,
      textId: `Dukungan Intermarket: Pelemahan serempak DXY (${dxy.changePercent.toFixed(2)}%) dan US10Y Yield (${us10y.changePercent.toFixed(2)}%) membuka ruang reli BUY pada XAU/USD.`,
      textEn: `Intermarket Support: Simultaneous pullback in DXY (${dxy.changePercent.toFixed(2)}%) and US10Y Yield (${us10y.changePercent.toFixed(2)}%) opens upside room for BUY XAU/USD.`,
    });
  } else {
    whipsawScore += 10;
  }

  // Dual-Channel Oil & Geopolitics Evaluation
  let oilChannelDominance: PreNewsScenarioMatrix['oilChannelDominance'] = 'NEUTRAL';
  const hasOilHeadline = breakingNews.some(
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

  // 4. Evaluate Dynamic Pivot Rule ("Aturan Dinamis Pindah Haluan")
  // Condition: CPI forecast cools (initial BUY), but Breaking News has Hawkish Fed official (Waller/Warsh/Powell/Fed) AND NFP is strong
  const hasCoolingCpiForecast = calendarEvents.some(
    (e) =>
      e.pillar === 'INFLATION' &&
      e.title.toUpperCase().includes('CPI') &&
      e.forecastNum !== null &&
      e.previousNum !== null &&
      e.forecastNum < e.previousNum
  );
  const hawkishFedNews = breakingNews.find(
    (b) => b.channelType === 'FED_SPEECH' && b.sentimentForGold === 'BEARISH'
  );
  const strongNfpEvent = calendarEvents.find(
    (e) =>
      e.pillar === 'LABOR' &&
      (e.title.toUpperCase().includes('NON-FARM') || e.title.toUpperCase().includes('NFP')) &&
      e.eventBiasForGold === 'SELL'
  );

  let dynamicPivotTriggered = false;
  let dynamicPivotReasonId: string | undefined;
  let dynamicPivotReasonEn: string | undefined;

  if (hawkishFedNews && (hasCoolingCpiForecast || strongNfpEvent)) {
    dynamicPivotTriggered = true;
    sellScore += 35;
    buyScore = Math.max(10, Math.round(buyScore * 0.45));
    dynamicPivotReasonId = `ATURAN PINDAH HALUAN AKTIF: Meskipun konsensus CPI bulanan melambat, Breaking News pejabat Fed (${hawkishFedNews.matchedKeywords.join(', ')}) yang Hawkish ditambah ketahanan pasar tenaga kerja (NFP) membalikkan skenario menjadi SELL 1 Arah pada XAU/USD.`;
    dynamicPivotReasonEn = `DYNAMIC PIVOT RULE ACTIVE: Despite a softer monthly CPI consensus, Hawkish Fed official commentary (${hawkishFedNews.matchedKeywords.join(', ')}) combined with resilient NFP labor data flips the decision into a 1-Way SELL on XAU/USD.`;
    sellArguments.unshift({
      pillar: 'POLICY',
      tag: 'PINDAH HALUAN • FED HAWKISH PIVOT',
      textId: dynamicPivotReasonId,
      textEn: dynamicPivotReasonEn,
    });
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

  if (buyProbability + sellProbability + mixedProbability !== 100) {
    const diff = 100 - (buyProbability + sellProbability + mixedProbability);
    mixedProbability += diff;
  }

  // Determine Dominant Bias
  let dominantBias: MacroBiasDirection = 'MIXED';
  if (simultaneousAlignment === 'CONFLICTING_WHIPSAW' && mixedProbability >= 30) {
    dominantBias = 'MIXED';
  } else if (sellProbability >= buyProbability + 8) {
    dominantBias = 'SELL';
  } else if (buyProbability >= sellProbability + 8) {
    dominantBias = 'BUY';
  } else {
    dominantBias = 'MIXED';
  }

  // Impact Level
  const hasHighImpactNews = breakingNews.some((b) => b.impact === 'HIGH');
  const hasHighImpactEvent = primaryEvent.impact === 'High';
  const impactLevel: MacroImpactLevel =
    hasHighImpactNews || hasHighImpactEvent || dynamicPivotTriggered ? 'HIGH' : 'MEDIUM';

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
      ? `1. Tunggu rilis ${primaryEvent.title} dan pantau reaksi 15 menit pertama.\n2. Konfirmasi SELL 1 Arah jika Actual mendukung penguatan USD disertai kenaikan US10Y Yield & DXY.\n3. Jika FedWatch > 90%, fokuskan eksekusi pada nada Forward Guidance / Press Conference.`
      : dominantBias === 'BUY'
      ? `1. Pantau area likuiditas bawah menjelang rilis ${primaryEvent.title}.\n2. Eksekusi BUY bertahap apabila data aktual melemahkan USD (atau Klaim Pengangguran aktual > forecast) dan US10Y Yield tertahan turun.\n3. Amankan parsial pada rasio 1:2 R:R.`
      : `1. Jangan pasang market order tepat pada detik rilis ${primaryEvent.title}.\n2. Tunggu sweep likuiditas atas & bawah (15–30 menit pasca-rilis).\n3. Hanya eksekusi searah breakout struktur M15 yang dikonfirmasi oleh arah DXY & US10Y.`;

  const actionPlanEn =
    dominantBias === 'SELL'
      ? `1. Wait for the ${primaryEvent.title} print and observe the first 15-minute reaction.\n2. Execute 1-Way SELL if Actuals reinforce USD strength alongside rising US10Y Yields & DXY.\n3. If FedWatch pricing > 90%, anchor execution on Forward Guidance / Press Conference tone.`
      : dominantBias === 'BUY'
      ? `1. Monitor downside liquidity zones heading into ${primaryEvent.title}.\n2. Scale into BUY setups if actual data softens USD (or Jobless Claims print > forecast) and US10Y Yields roll over.\n3. Lock partial profit at 1:2 R:R.`
      : `1. Do not place market orders at the exact second of the ${primaryEvent.title} release.\n2. Wait for the two-way liquidity sweep (15–30 minutes post-release).\n3. Only execute in the direction of the M15 structure break confirmed by DXY & US10Y.`;

  const whipsawWarningId =
    simultaneousAlignment === 'CONFLICTING_WHIPSAW'
      ? `PERINGATAN WHIPSAW TINGGI: ${allClusterEvents.length} data rilis bersamaan (${allClusterEvents.map((e) => e.title).join(' + ')}) memiliki sinyal berlawanan! Risiko Fake Move 2 arah sangat tinggi pada 15 menit pertama.`
      : isSimultaneousRelease
      ? `Rilis Simultan (${allClusterEvents.length} Event Bersamaan): Pastikan seluruh komponen searah saat angka Aktual keluar. Jika salah satu komponen meleset tajam berlawanan arah, waspadai Fake Move.`
      : `Waspadai spike likuiditas awal jika angka Aktual meleset tipis dari Forecast atau terdapat revisi data bulan sebelumnya.`;

  const whipsawWarningEn =
    simultaneousAlignment === 'CONFLICTING_WHIPSAW'
      ? `HIGH WHIPSAW WARNING: ${allClusterEvents.length} simultaneous releases (${allClusterEvents.map((e) => e.title).join(' + ')}) show conflicting signals! High risk of a two-way Fake Move in the first 15 minutes.`
      : isSimultaneousRelease
      ? `Simultaneous Release (${allClusterEvents.length} Concurrent Events): Verify all sub-components print in the same direction. If one component diverges sharply, guard against a Fake Move.`
      : `Watch for initial liquidity spikes if Actuals print close to Forecast or if prior-month revisions conflict with the headline number.`;

  const topBreakingAlert =
    breakingNews.find((b) => b.impact === 'HIGH') || breakingNews[0] || null;

  const dataFingerprint = computeMacroDataFingerprint(calendarEvents, breakingNews);

  return {
    id: `macro-snap-${Date.now()}`,
    instrument: 'XAUUSD',
    dataFingerprint,
    analyzedAt: new Date().toISOString(),
    sourceMode,
    modelUsed,
    impactLevel,
    dominantBias,
    breakingNews,
    topBreakingAlert,
    intermarketPulse,
    calendarEvents,
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
      oilChannelDominance,
      buyArguments,
      sellArguments,
      finalTakeId,
      finalTakeEn,
      actionPlanId,
      actionPlanEn,
      whipsawWarningId,
      whipsawWarningEn,
    },
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
 * Loads the latest cached MacroNewsSnapshot from localStorage and/or Supabase (`macro_news_snapshots`).
 * Uses 0 Gemini tokens!
 */
export async function loadLatestCachedMacroSnapshot(): Promise<MacroNewsSnapshot | null> {
  let localSnap: MacroNewsSnapshot | null = null;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MacroNewsSnapshot;
        if (parsed && parsed.scenarioMatrix && parsed.intermarketPulse) {
          localSnap = parsed;
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
          .limit(1)
          .maybeSingle();

        if (!error && data && data.snapshot_payload) {
          const remoteSnap = data.snapshot_payload as MacroNewsSnapshot;
          if (remoteSnap && remoteSnap.scenarioMatrix && remoteSnap.intermarketPulse) {
            const remoteTime = new Date(data.analyzed_at || remoteSnap.analyzedAt).getTime();
            const localTime = localSnap ? new Date(localSnap.analyzedAt).getTime() : 0;

            if (!localSnap || remoteTime >= localTime) {
              const hydrated: MacroNewsSnapshot = {
                ...remoteSnap,
                sourceMode: 'SUPABASE_CACHE',
              };
              if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                try {
                  localStorage.setItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY, JSON.stringify(hydrated));
                } catch {}
              }
              return hydrated;
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
 * Saves a newly analyzed MacroNewsSnapshot to both localStorage and Supabase (`macro_news_snapshots`).
 * Returns an explicit status object so callers can detect and display any Supabase schema/network errors.
 */
export async function saveMacroSnapshotToCache(
  snapshot: MacroNewsSnapshot
): Promise<{ success: boolean; error?: string; remoteSaved: boolean }> {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MACRO_SNAPSHOT_LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
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
