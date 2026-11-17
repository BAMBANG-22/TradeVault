// @ts-nocheck
import { GoogleGenAI, ThinkingLevel, Type } from 'npm:@google/genai@3.3.0';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, apikey, x-client-info, Cache-Control, Pragma',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function isMarketDayUtc(date = new Date()): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (day === 5 && date.getUTCHours() >= 22) return false;
  return day >= 1 && day <= 5;
}

const XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION = `You are the Senior Institutional Macro Strategist & Head of XAU/USD Fundamental Trading Desk for TradeVault.
Your mission is to synthesize the provided real-time USD Economic Calendar, 2x2 Intermarket Pulse (DXY, US02Y Yield, US10Y Yield, US Oil WTI), Filtered Breaking News headlines, and CME FedWatch Tool probabilities to construct a high-conviction institutional scenario matrix and a concise "Tesis Meja Institusi (Institutional Desk Thesis)".

YOU MUST STRICTLY ENFORCE THE 12 HUKUM BANG NAEL & CROSS-ASSET TRANSMISSION PRINCIPLES:

1. CROSS-ASSET TRANSMISSION CHAIN (RANTAI SEBAB-AKIBAT LINTAS ASET):
   - Track the deterministic capital flow: Macro Momentum (Growth/Labor/Inflation) -> Fed Policy Expectations (CME FedWatch & FOMC Speeches) -> Front-End Rate Sensitivity (US02Y) -> Long-End Inflation & Real Yields (US10Y) -> US Dollar Currency Valuation (DXY) -> Institutional Demand & Liquidity in XAU/USD.
   - US02Y (2-Year Treasury Yield): Primary barometer of near-term Fed policy expectations. A sharp spike in US02Y signals immediate hawkish repricing and provides direct downward pressure on XAU/USD (SELL Gold).
   - US10Y (10-Year Treasury Yield): Reflects long-term inflation & real cost of capital. Rising US10Y increases the opportunity cost of holding non-yielding Gold.
   - DXY (US Dollar Index): Inversely correlated with Gold as a global reserve benchmark.
   - USOIL (WTI Crude): Evaluated via the Dual-Channel mechanism (Safe-Haven vs Inflation Channel).

2. EVALUASI PRICED-IN VS SURPRISE (KEJENUHAN PASAR & ASIMETRI REPRICING):
   - Compare calendar consensus (Forecast vs Previous) against market positioning in CME FedWatch and US02Y.
   - If market expectation is already heavily skewed (CME FedWatch >= 80% for Hike/Hold/Cut, or US02Y strongly extended), evaluate whether the upcoming data can deliver an incremental surprise or will trigger a sharp counter-reaction (asymmetric repricing shock).
   - Clean 1-Way Breakout (BUY or SELL) occurs when calendar data aligns with an unpriced catalyst.
   - Conflicting releases or priced-in saturation without new catalyst produce a Whipsaw / Fake Move trap (MIXED).

3. PROPORTIONAL FOCUS FOR 3 FOMC PILLARS (MODE A VS MODE B):
   - Mode A — Individual Economic Releases (CPI, Core CPI, PPI, Core PPI, NFP, Unemployment Rate, PCE, Core PCE, GDP, Retail Sales, ISM PMI):
     * Anchor the primary evaluation tightly to the SPECIFIC PILLAR of the releasing indicator (e.g., Inflation Pillar for Core PPI/PPI).
     * The broader 3 FOMC Pillars recap serves as Background Macro Momentum.
   - Mode B — Federal Reserve Meetings (FOMC Rate Decision, FOMC Statement, FOMC Economic Projections / Dot Plot):
     * Activate the FULL RECAPITULATION OF ALL 3 FOMC PILLARS (Inflation + Labor + Growth) combined with CME FedWatch and US02Y to deduce the Fed's overarching policy stance (Hawkish vs Dovish).

4. INVERSE INDICATORS & SUB-COMPONENT RULES:
   - Unemployment Claims (Initial & Continuing) and Challenger Job Cuts: Actual < Forecast (fewer layoffs) = Strong Labor = Bullish USD = SELL XAU/USD. Actual > Forecast = Weak Labor = BUY XAU/USD.
   - Unemployment Rate: Actual < Forecast = Strong Labor = SELL XAU/USD. Actual > Forecast = BUY XAU/USD.
   - "GDP Price Index" MUST be classified under the INFLATION pillar, NEVER under Economic Growth.
   - ISM Prices Paid >= 70 transmits upstream inflationary pressure into headline CPI.
   - ISM PMI > 50 = Expansion (Hawkish USD / SELL Gold). Watch for sharp volatility spikes if ISM PMI drops below 55.

5. DUAL-CHANNEL GEOPOLITICS & US OIL (WTI):
   - If geopolitical tensions surge while US inflation is sticky (> 2%), the INFLATION CHANNEL DOMINATES: energy spikes lift inflation expectations, locking the Fed into a hawkish stance and pushing US02Y/US10Y higher -> SELL XAU/USD once initial safe-haven panic subsides.

6. DYNAMIC PIVOT RULE ("ATURAN PINDAH HALUAN BANG NAEL"):
   - If consensus favors BUY Gold (e.g. softer CPI forecast), but breaking commentary reveals a Fed official (Waller, Warsh, Powell) advocating rate hikes or tighter policy AND NFP is resilient, immediately flip the bias to 1-WAY SELL XAU/USD.

7. INSTITUTIONAL DESK THESIS OUTPUT (TESIS MEJA INSTITUSI):
   - Formulate 2 to 3 dense, decisive sentences detailing:
     (1) Institutional positioning toward the US Dollar based on the cross-asset transmission (US02Y, US10Y, DXY, USOIL, CME FedWatch),
     (2) The most logical directional path for XAU/USD ahead of release, and
     (3) The exact trigger condition for an intraday "Pindah Haluan".

8. AUTOMATIC DETECTION OF "1 ARAH (DIRECT EXPANSION)" VS "2 ARAH (SWEEP FIRST)", SPEECH EVENTS, & PRICED-IN EXHAUSTION:
   - Evaluate the pre-computed flags HAS_SPEECH_EVENT (Speech/Speaks/Testimony/Press Conference/FOMC within -1h to +2h of primary release) and IS_PRICED_IN (6-hour XAU/USD move > 1.5x ATR(14) 1H in the direction of data forecast).
   - "2 ARAH (SWEEP FIRST)" is active if ANY of the following hold: HAS_SPEECH_EVENT = true, IS_PRICED_IN = true, directional divergence between DXY vs US02Y/US10Y, >= 2 simultaneous High-Impact releases with conflicting signals, or GC=F 3D positioning in extreme zone (<= -2.5% or >= +2.5%).
   - "1 ARAH (DIRECT EXPANSION)" is active ONLY when intermarket signals (DXY, US02Y), data catalyst, and session bias are aligned without speech schedule conflicts or extreme 6H priced-in exhaustion.
   - Structure the intraday manipulation scenario into 2 crisp time phases:
     * Fase 1 (Menit 0–5 Rilis): Initial sweep/push direction (explicitly warn if IS_PRICED_IN profit-taking or HAS_SPEECH_EVENT two-way trap is active).
     * Fase 2 (Menit 15+ / Lanjutan): Primary institutional expansion direction after intraday BSL/SSL or 1H/15M POI (capped at 1.8x ATR 1H) is swept.`;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageBase64FromUrl(url: string): Promise<{ base64: string; mimeType: string }> {
  const parsedUrl = new URL(url);

  if (parsedUrl.hostname.toLowerCase().includes('tradingview.com')) {
    const xMatch = parsedUrl.pathname.match(/\/x\/([A-Za-z0-9]+)\/?/i);
    if (xMatch && xMatch[1]) {
      const id = xMatch[1];
      const directS3Url = `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`;
      const s3Res = await fetch(directS3Url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
      });
      if (s3Res.ok) {
        const s3Mime = s3Res.headers.get('content-type') || 'image/png';
        const arrayBuf = await s3Res.arrayBuffer();
        return {
          base64: bytesToBase64(new Uint8Array(arrayBuf)),
          mimeType: s3Mime.split(';')[0],
        };
      }
    }
  }

  const res = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Gagal mengunduh gambar dari URL (Status ${res.status})`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const htmlText = await res.text();
    const ogImageMatch =
      htmlText.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      htmlText.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
      htmlText.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);

    if (ogImageMatch && ogImageMatch[1]) {
      const imgRes = await fetch(ogImageMatch[1], {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
      });
      if (!imgRes.ok) {
        throw new Error(`Gagal mengambil gambar snapshot TradingView`);
      }
      const imgMime = imgRes.headers.get('content-type') || 'image/png';
      const arrayBuf = await imgRes.arrayBuffer();
      return {
        base64: bytesToBase64(new Uint8Array(arrayBuf)),
        mimeType: imgMime.split(';')[0],
      };
    }
    throw new Error('URL tidak mengarah langsung ke gambar ataupun snapshot TradingView yang valid.');
  }

  const arrayBuf = await res.arrayBuffer();
  return {
    base64: bytesToBase64(new Uint8Array(arrayBuf)),
    mimeType: (contentType || 'image/png').split(';')[0],
  };
}

function normalizeInstrument(raw: string | null | undefined): string {
  if (!raw) return 'XAUUSD';
  let s = raw.toUpperCase().trim();
  if (!s || s === 'NULL' || s === 'NONE' || s === 'UNKNOWN' || s === 'UNDEFINED' || s === 'N/A' || s === '-') {
    return 'XAUUSD';
  }
  if (s.includes(':')) s = s.split(':').pop() || s;
  if (s.includes('GOLD') || s.startsWith('XAU')) return 'XAUUSD';
  if (s.includes('BITCOIN') || s.startsWith('BTC')) return 'BTCUSD';
  if (s.includes('ETHER') || s.startsWith('ETH')) return 'ETHUSD';
  if (s.includes('SOLANA') || s.startsWith('SOL')) return 'SOLUSD';
  if (s.includes('DOW') || s.includes('DJI') || s.includes('US30')) return 'US30';
  if (s.includes('NAS') || s.includes('USTEC') || s.includes('NDX')) return 'NAS100';
  if (s.includes('SPX') || s.includes('US500') || s.includes('S&P')) return 'SPX500';
  if (s.includes('DAX') || s.includes('GER40') || s.includes('DE40')) return 'GER40';

  const KNOWN_FOREX = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
    'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
    'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'AUDCAD', 'AUDNZD',
    'CADCHF', 'NZDCAD', 'NZDCHF',
  ];
  for (const pair of KNOWN_FOREX) {
    if (s.includes(pair)) return pair;
  }

  s = s.replace(/(\.M|\.RAW|\.PRO|\.STD|\.ECN|\.B|_I|_SB|_C)$/i, '');
  if (s.length > 6 && (s.endsWith('C') || s.endsWith('M'))) {
    s = s.slice(0, -1);
  }
  s = s.replace(/[^A-Z0-9]/g, '');
  return s || 'XAUUSD';
}

function parseNumericValue(val: any, instrument = 'XAUUSD'): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (isNaN(val) || !Number.isFinite(val)) return null;
    if (instrument === 'XAUUSD' && val >= 1.5 && val <= 6.5) {
      return Number((val * 1000).toFixed(3));
    }
    return val;
  }
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return null;
    const contextualMatch = s.match(
      /(?:at|@|entry[:\s]|open[:\s]|price[:\s]|level[:\s])\s*([+-]?[0-9][0-9., ]+)/i
    );
    if (contextualMatch) s = contextualMatch[1].trim();
    s = s.replace(/[^0-9.,+\- ]/g, '').trim();
    if (!s) return null;
    if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^[+-]?\d{1,3}(?:[ ,]\d{3})+\.\d+$/.test(s)) {
      s = s.replace(/[ ,]/g, '');
    } else if (s.includes('.') && s.includes(',')) {
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    } else if ((s.match(/\./g) || []).length >= 2) {
      const lastDot = s.lastIndexOf('.');
      s = s.slice(0, lastDot).replace(/\./g, '') + '.' + s.slice(lastDot + 1);
    } else {
      s = s.replace(/ /g, '');
    }
    const num = parseFloat(s);
    if (isNaN(num) || !Number.isFinite(num)) return null;
    if (instrument === 'XAUUSD' && num >= 1.5 && num <= 6.5) {
      return Number((num * 1000).toFixed(3));
    }
    return num;
  }
  return null;
}

function parseAiJsonResponse(text: string): Record<string, any> {
  if (!text || typeof text !== 'string') return {};
  try {
    return JSON.parse(text);
  } catch {}
  const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {}
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  let repaired = clean.trim().replace(/,\s*$/, '').replace(/:\s*$/, '');
  if (!repaired.endsWith('}')) repaired += '}';
  try {
    return JSON.parse(repaired);
  } catch {}
  return {};
}

/**
 * Strictly isolated API key resolver for Scan Kilat (Opsi 1: MT5 History & Opsi 2: Individual MT5/TradingView).
 * Reads ONLY `GEMINI_SCAN_API_KEY` and `GEMINI_API_KEY` (never `GEMINI_NEWS_API_KEY`).
 */
function getScannerGeminiApiKeys(): string[] {
  const raw = [Deno.env.get('GEMINI_SCAN_API_KEY') || '', Deno.env.get('GEMINI_API_KEY') || '']
    .join(',')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

/**
 * Strictly isolated API key resolver for Trade News & Macro Analysis.
 * Reads ONLY `GEMINI_NEWS_API_KEY` — NEVER falls back to `GEMINI_API_KEY` so Trade News
 * can never consume or exhaust the Scan Kilat quota.
 */
function getNewsGeminiApiKeys(): string[] {
  const raw = (Deno.env.get('GEMINI_NEWS_API_KEY') || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

const SCANNER_MODEL_CASCADE = [
  'gemini-4-hydrogen',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const NEWS_MODEL_CASCADE = [
  'gemini-4-hydrogen',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

function isGeminiQuotaError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('limit exceeded')
  );
}

const scanQuotaCooldownByKeyModel = new Map<string, number>();
const newsQuotaCooldownByModel = new Map<string, number>();

function buildScannerGeometryHintBlock(canvasHints: any): string {
  if (!canvasHints || typeof canvasHints !== 'object') return '';
  const lines: string[] = [];

  if (canvasHints.hasPositionBox) {
    lines.push(
      `- TradingView ${canvasHints.inferredPosition || 'BUY/SELL'} Position Box detected (${
        canvasHints.profitTheme === 'BLUE_NAVY' ? 'Dark Blue/Navy Profit' : 'Green Profit'
      } & ${canvasHints.riskTheme === 'GREY_SLATE' ? 'Grey/Slate Risk' : 'Red Risk'}):`
    );
    lines.push(
      `  * Verified Direction: ${canvasHints.inferredPosition || 'UNKNOWN'} (${
        canvasHints.inferredPosition === 'SELL'
          ? 'Risk Zone is at TOP, Profit Zone is at BOTTOM -> SELL (takeProfit < entryPrice < stopLoss)'
          : 'Profit Zone is at TOP, Risk Zone is at BOTTOM -> BUY (stopLoss < entryPrice < takeProfit)'
      })`
    );
    if (canvasHints.boxTopYRatio != null) {
      lines.push(
        `  * Box TOP edge (${canvasHints.inferredPosition === 'SELL' ? 'STOP LOSS' : 'TAKE PROFIT'}): vertical Y = ${(
          Number(canvasHints.boxTopYRatio) * 100
        ).toFixed(1)}% from top`
      );
    }
    if (canvasHints.entryYRatio != null) {
      lines.push(
        `  * Box CENTRAL divider (ENTRY PRICE): vertical Y = ${(
          Number(canvasHints.entryYRatio) * 100
        ).toFixed(1)}% from top`
      );
    }
    if (canvasHints.boxBottomYRatio != null) {
      lines.push(
        `  * Box BOTTOM edge (${canvasHints.inferredPosition === 'SELL' ? 'TAKE PROFIT' : 'STOP LOSS'}): vertical Y = ${(
          Number(canvasHints.boxBottomYRatio) * 100
        ).toFixed(1)}% from top`
      );
    }
    if (canvasHints.tpYRatio != null) {
      lines.push(
        `  * Exact Take Profit Y-level: ${(Number(canvasHints.tpYRatio) * 100).toFixed(1)}% from top`
      );
    }
    if (canvasHints.slYRatio != null) {
      lines.push(
        `  * Exact Stop Loss Y-level: ${(Number(canvasHints.slYRatio) * 100).toFixed(1)}% from top`
      );
    }
  }

  const badgeHints: string[] = [];
  if (canvasHints.rightAxisGreenBadgeYRatio != null) {
    badgeHints.push(
      `Green badge at Y = ${(Number(canvasHints.rightAxisGreenBadgeYRatio) * 100).toFixed(1)}%`
    );
  }
  if (canvasHints.rightAxisRedBadgeYRatio != null) {
    badgeHints.push(
      `Red badge at Y = ${(Number(canvasHints.rightAxisRedBadgeYRatio) * 100).toFixed(1)}%`
    );
  }
  if (canvasHints.rightAxisBlueOrDarkBadgeYRatio != null) {
    badgeHints.push(
      `Blue/Navy badge at Y = ${(Number(canvasHints.rightAxisBlueOrDarkBadgeYRatio) * 100).toFixed(1)}%`
    );
  }
  if (badgeHints.length > 0) {
    lines.push(`- Right-hand Y-axis colored price badge positions (remember: smaller Y% = HIGHER price on chart, larger Y% = LOWER price on chart):`);
    for (const bh of badgeHints) {
      lines.push(`  * ${bh}`);
    }
  }

  if (lines.length === 0) return '';
  return `\nPIXEL GEOMETRY SCANNER HINTS (VERIFIED FROM IMAGE PIXELS):\n${lines.join('\n')}\n`;
}

const ALLOWED_PROXY_DOMAINS = [
  'faireconomy.media',
  'yahoo.com',
  'financialjuice.com',
  'cnbc.com',
  'dowjones.io',
  'fxstreet.com',
  'news.google.com',
  'twelvedata.com',
  'er-api.com',
  'frankfurter.app',
  'investing.com',
  'cmegroup.com',
  'tradingview.com',
  'forexlive.com',
  'reuters.com',
  'marketwatch.com',
  'dailyfx.com',
  'exchangerate-api.com',
  'stooq.com',
  'stlouisfed.org',
  'treasury.gov',
];

function isAllowedProxyTargetUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_PROXY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function handleProxy(reqUrl: URL): Promise<Response> {
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) {
    return jsonResponse({ error: 'Missing target url parameter' }, 400);
  }
  if (!isAllowedProxyTargetUrl(targetUrl)) {
    return jsonResponse({ error: 'Target domain is not in the allowed financial feeds list' }, 403);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const upstreamRes = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, text/xml, application/rss+xml, */*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await upstreamRes.text();
    return new Response(text, {
      status: upstreamRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Proxy fetch failed' }, 502);
  }
}

async function handleExtractTradeScreenshot(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { imageBase64, imageUrl, canvasHints } = body || {};

    if (!imageBase64 && !imageUrl) {
      return jsonResponse({ success: false, error: 'Harap sertakan imageBase64 atau imageUrl.' }, 400);
    }

    const scannerApiKeys = getScannerGeminiApiKeys();

    if (scannerApiKeys.length === 0) {
      return jsonResponse(
        {
          success: false,
          error: 'GEMINI_API_KEY (khusus Scan Kilat) belum dikonfigurasi di Supabase Edge Function Secrets.',
        },
        400
      );
    }

    let mimeType = 'image/jpeg';
    let base64Data = '';

    if (imageBase64) {
      const trimmedInput = String(imageBase64).trim();
      const match = trimmedInput.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,([\s\S]+)$/i);
      if (match) {
        const rawMime = match[1].toLowerCase();
        mimeType =
          rawMime === 'image/png'
            ? 'image/png'
            : rawMime === 'image/webp'
            ? 'image/webp'
            : 'image/jpeg';
        base64Data = match[2].replace(/\s+/g, '');
      } else {
        base64Data = trimmedInput.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      }
    } else if (imageUrl) {
      const fetched = await fetchImageBase64FromUrl(String(imageUrl));
      const rawMime = (fetched.mimeType || 'image/jpeg').toLowerCase();
      mimeType =
        rawMime === 'image/png'
          ? 'image/png'
          : rawMime === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
      base64Data = fetched.base64;
    }

    const geometryHintBlock = buildScannerGeometryHintBlock(canvasHints);

    const prompt = `You are an elite financial chart & order OCR specialist for MetaTrader 5 (MT5 / MT4) and TradingView.
Carefully inspect the FULL screenshot from the left edge to the rightmost Y-axis price scale before outputting any number.
Remember: smaller Y% (closer to top of image) = HIGHER price; larger Y% (closer to bottom of image) = LOWER price.
${geometryHintBlock}
1. SPATIAL VISUAL RULES FOR METATRADER 5 (MT5 / MT4):
   - A) CHART VIEW:
     * Read EVERY text label at the LEFT edge of the chart: "TP", "SL", "BUY LIMIT", "SELL LIMIT", "BUY STOP", "SELL STOP", "BUY", "SELL", "BELI", "JUAL" (for example: "TP", "BUY LIMIT 0.12", "SL").
     * Trace each label's exact horizontal dashed/dotted line straight across to the RIGHTMOST Y-AXIS, and extract ONLY the exact price inside the BORDERED / OUTLINED BOX or COLORED TAG sitting ON that exact horizontal line.
     * IGNORE plain unbordered Y-axis tick grid numbers (like "4052.92" or "4030.42").
     * IGNORE the running live candle price badge (often has a bar countdown timer like "00:50" or "04:12") — put that ONLY in currentPrice, NEVER in entryPrice, stopLoss, or takeProfit unless an Entry dashed line is literally at that exact price!
     * STATUS RULE: If the order label contains "LIMIT" or "STOP", set status = "PLANNED". If it says "BUY 0.10" or "SELL 0.10" (without LIMIT/STOP), set status = "ACTIVE".
   - B) MT5 TRADE / HISTORY LIST VIEW (if screenshot shows one or more MT5 trade/history rows instead of candles):
     * Format like "XAUUSD, buy 0.10" or "XAUUSD, beli 0.10" or "XAUUSD, sell 0.05" / "jual 0.05", "2650.12 -> 2662.30", with profit on the right (e.g. "121.80" or "-45.00") and optional "S / L:" and "T / P:" below.
     * Extract: source = "MT5", instrument = symbol (strip suffixes like m/c/pro), position = "BUY" (for buy/beli) or "SELL" (for sell/jual), lotSize = lot number, entryPrice = number BEFORE "->", exitPrice = number AFTER "->", profit = right-side profit number, stopLoss = S/L value (null if 0 or "-" or absent), takeProfit = T/P value (null if 0 or "-" or absent), status = "CLOSED" (if from history / closed position) or "ACTIVE" (if open position).

2. SPATIAL VISUAL RULES FOR TRADINGVIEW CHARTS:
   - Identify the Position Tool's two vertically-adjacent shaded rectangles (either Green/Red OR Dark Blue-Navy/Dark Grey-Slate).
   - IGNORE inner chart labels ("OB m5", "FVG", "BOS", "Liquidity") and IGNORE bottom sub-indicator panels (RSI / MACD / Stochastic scales like 0..100).
   - IGNORE the live running candle price badge (put ONLY in currentPrice).
   - Read the exact Y-axis price tags aligned with:
     (1) TOP outer border of the top zone,
     (2) CENTRAL horizontal dividing line between the two zones (Entry Price),
     (3) BOTTOM outer border of the bottom zone.
   - Direction Rule:
     * Profit Zone (Green or Blue/Navy) at TOP + Risk Zone (Red or Grey/Slate) at BOTTOM => position = "BUY" (stopLoss < entryPrice < takeProfit).
     * Risk Zone (Red or Grey/Slate) at TOP + Profit Zone (Green or Blue/Navy) at BOTTOM => position = "SELL" (takeProfit < entryPrice < stopLoss).
   - NUMBER FORMAT NORMALIZATION: Convert European/Indonesian format like "4.054,405" or "4.099,857" -> 4054.405 and 4099.857.
   - LOT SIZE ON TRADINGVIEW: Always return null for lotSize on TradingView.

3. STRICT GROUNDING & ZERO HALLUCINATION:
   - First populate leftEdgeLabels and rightAxisPriceTags verbatim from what you visually see from top to bottom, THEN assign entryPrice, stopLoss, and takeProfit consistently.
   - NEVER invent, round roughly, or compute synthetic offsets. If a price tag is obscured or absent, return null for that field.`;

    let responseText = '';
    let usedModel = '';

    for (const model of SCANNER_MODEL_CASCADE) {
      for (let keyIdx = 0; keyIdx < scannerApiKeys.length; keyIdx++) {
        const cooldownKey = `${keyIdx}:${model}`;
        const cooldownUntil = scanQuotaCooldownByKeyModel.get(cooldownKey) || 0;
        if (Date.now() < cooldownUntil) {
          continue;
        }

        const ai = new GoogleGenAI({
          apiKey: scannerApiKeys[keyIdx],
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [
                { inlineData: { mimeType, data: base64Data } },
                prompt,
              ],
              config: {
                ...(model === 'gemini-4-hydrogen' || model === 'gemini-3-flash-preview'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    detected: { type: Type.BOOLEAN },
                    source: { type: Type.STRING },
                    instrument: { type: Type.STRING },
                    leftEdgeLabels: {
                      type: Type.STRING,
                      description: 'Verbatim order/line labels on left edge (e.g. "TP, BUY LIMIT 0.12, SL") or "TradingView Position Box"',
                    },
                    rightAxisPriceTags: {
                      type: Type.STRING,
                      description: 'Highlighted/bordered Y-axis price badges listed top-to-bottom with colors/borders before assigning prices',
                    },
                    position: { type: Type.STRING },
                    lotSize: { type: Type.NUMBER },
                    entryPrice: { type: Type.NUMBER },
                    stopLoss: { type: Type.NUMBER },
                    takeProfit: { type: Type.NUMBER },
                    exitPrice: { type: Type.NUMBER },
                    profit: { type: Type.NUMBER },
                    plannedRiskReward: { type: Type.NUMBER },
                    timeframe: { type: Type.STRING },
                    currentPrice: { type: Type.NUMBER },
                    status: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                  required: ['detected', 'instrument', 'position'],
                },
              },
            });
            if (response && response.text) {
              responseText = response.text;
              usedModel = model;
              break;
            }
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (isGeminiQuotaError(err)) {
              scanQuotaCooldownByKeyModel.set(cooldownKey, Date.now() + 20 * 60 * 1000);
              break;
            }
            const isTransient =
              errMsg.includes('503') ||
              errMsg.includes('500') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('overloaded') ||
              errMsg.includes('high demand');
            if (isTransient && attempt < 2) {
              await new Promise((r) => setTimeout(r, 450));
              continue;
            }
            break;
          }
        }
        if (responseText) break;
      }
      if (responseText) break;
    }

    if (!responseText) {
      return jsonResponse({
        success: false,
        quotaExhausted: true,
        error:
          'Batas kuota tier gratis tercapai sementara; beralih otomatis ke pemindai geometri kanvas & OCR.',
      });
    }

    const parsedData = parseAiJsonResponse(responseText);
    const cleanInstrument = normalizeInstrument(parsedData.instrument);

    const leftLabelsStr = String(parsedData.leftEdgeLabels || '');
    const notesStr = String(parsedData.notes || '');
    const combinedLabelsText = `${leftLabelsStr} ${notesStr}`;

    const hasExplicitMt5Buy = /\b(?:BUY|BELI)(?:\s+(?:LIMIT|STOP))?\b/i.test(combinedLabelsText);
    const hasExplicitMt5Sell = /\b(?:SELL|JUAL)(?:\s+(?:LIMIT|STOP))?\b/i.test(combinedLabelsText);

    const hasVerifiedDirection = Boolean(
      (canvasHints?.hasPositionBox &&
        (canvasHints.inferredPosition === 'BUY' || canvasHints.inferredPosition === 'SELL')) ||
        (hasExplicitMt5Buy && !hasExplicitMt5Sell) ||
        (hasExplicitMt5Sell && !hasExplicitMt5Buy)
    );

    const rawPosUpper = String(parsedData.position || '').toUpperCase();
    let cleanPosition: 'BUY' | 'SELL' =
      canvasHints?.hasPositionBox &&
      (canvasHints.inferredPosition === 'BUY' || canvasHints.inferredPosition === 'SELL')
        ? canvasHints.inferredPosition
        : hasExplicitMt5Sell && !hasExplicitMt5Buy
        ? 'SELL'
        : hasExplicitMt5Buy && !hasExplicitMt5Sell
        ? 'BUY'
        : rawPosUpper === 'SELL' || rawPosUpper === 'JUAL' || rawPosUpper === 'SHORT'
        ? 'SELL'
        : 'BUY';

    const source: 'MT5' | 'TRADINGVIEW' | 'CHART' =
      parsedData.source === 'MT5'
        ? 'MT5'
        : parsedData.source === 'TRADINGVIEW' || canvasHints?.hasPositionBox
        ? 'TRADINGVIEW'
        : 'CHART';

    const rawStatusStr = String(parsedData.status || '').toUpperCase();
    const hasPendingKeyword = /\b(BUY\s+LIMIT|SELL\s+LIMIT|BUY\s+STOP|SELL\s+STOP|BELI\s+LIMIT|JUAL\s+LIMIT|LIMIT|STOP|PENDING)\b/i.test(
      combinedLabelsText
    );
    const status: 'PLANNED' | 'ACTIVE' | 'CLOSED' =
      rawStatusStr === 'CLOSED'
        ? 'CLOSED'
        : rawStatusStr === 'PLANNED' || hasPendingKeyword || source === 'TRADINGVIEW'
        ? 'PLANNED'
        : rawStatusStr === 'ACTIVE'
        ? 'ACTIVE'
        : 'PLANNED';

    let entryPrice = parseNumericValue(parsedData.entryPrice, cleanInstrument);
    let stopLoss = parseNumericValue(parsedData.stopLoss, cleanInstrument);
    let takeProfit = parseNumericValue(parsedData.takeProfit, cleanInstrument);
    const exitPrice = parseNumericValue(parsedData.exitPrice, cleanInstrument);
    const profit = parseNumericValue(parsedData.profit, 'EURUSD');
    const rawLotSize = parseNumericValue(parsedData.lotSize, 'EURUSD');
    const lotSize = source === 'MT5' && rawLotSize !== null && rawLotSize > 0 ? rawLotSize : null;
    let plannedRR = parseNumericValue(parsedData.plannedRiskReward, 'EURUSD');
    const currentPrice = parseNumericValue(parsedData.currentPrice, cleanInstrument);

    const minDistance =
      cleanInstrument === 'XAUUSD'
        ? 1.0
        : cleanInstrument === 'BTCUSD'
        ? 25
        : cleanInstrument.includes('JPY') || cleanInstrument === 'XAGUSD'
        ? 0.03
        : 0.0003;

    if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
      if (hasVerifiedDirection) {
        if (cleanPosition === 'BUY' && stopLoss > entryPrice && takeProfit < entryPrice) {
          const tmp = stopLoss;
          stopLoss = takeProfit;
          takeProfit = tmp;
        } else if (cleanPosition === 'SELL' && stopLoss < entryPrice && takeProfit > entryPrice) {
          const tmp = stopLoss;
          stopLoss = takeProfit;
          takeProfit = tmp;
        }
      } else {
        if (stopLoss < entryPrice && entryPrice < takeProfit) {
          cleanPosition = 'BUY';
        } else if (takeProfit < entryPrice && entryPrice < stopLoss) {
          cleanPosition = 'SELL';
        } else if (cleanPosition === 'BUY' && stopLoss > takeProfit) {
          const tmp = stopLoss;
          stopLoss = takeProfit;
          takeProfit = tmp;
        } else if (cleanPosition === 'SELL' && stopLoss < takeProfit) {
          const tmp = stopLoss;
          stopLoss = takeProfit;
          takeProfit = tmp;
        }
      }
    }

    if (
      entryPrice !== null &&
      stopLoss !== null &&
      (Math.abs(entryPrice - stopLoss) < minDistance ||
        (cleanPosition === 'BUY' && stopLoss >= entryPrice) ||
        (cleanPosition === 'SELL' && stopLoss <= entryPrice))
    ) {
      stopLoss = null;
    }
    if (
      entryPrice !== null &&
      takeProfit !== null &&
      (Math.abs(takeProfit - entryPrice) < minDistance ||
        (cleanPosition === 'BUY' && takeProfit <= entryPrice) ||
        (cleanPosition === 'SELL' && takeProfit >= entryPrice))
    ) {
      takeProfit = null;
    }

    if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(takeProfit - entryPrice);
      if (risk >= minDistance) {
        plannedRR = parseFloat((reward / risk).toFixed(2));
      }
    }

    return jsonResponse({
      success: true,
      data: {
        detected: parsedData.detected !== false,
        source,
        instrument: cleanInstrument,
        position: cleanPosition,
        lotSize,
        entryPrice,
        stopLoss,
        takeProfit,
        exitPrice,
        profit,
        status,
        plannedRiskReward: plannedRR,
        timeframe: parsedData.timeframe || null,
        currentPrice: currentPrice ?? null,
        confidence: parsedData.confidence || 0.95,
        notes: parsedData.notes || parsedData.leftEdgeLabels || '',
        modelUsed: usedModel || 'gemini-4-hydrogen',
      },
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: err?.message || 'Terjadi kesalahan saat memproses gambar analisis.',
      },
      500
    );
  }
}

function normalizeMt5DateTimeOutput(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    const hh = m[4].padStart(2, '0');
    const min = m[5].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const min = String(parsed.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }
  return null;
}

function inferMt5CloseType(params: {
  rawCloseType?: unknown;
  notes?: string;
  position: 'BUY' | 'SELL';
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  netProfit: number | null;
  instrument: string;
}): 'TP' | 'SL' | 'Manual' {
  const { rawCloseType, notes, exitPrice, stopLoss, takeProfit, netProfit, instrument } = params;
  const rawUpper = String(rawCloseType || '').trim().toUpperCase();
  const notesLower = String(notes || '').toLowerCase();

  const priceTol =
    instrument === 'XAUUSD'
      ? 0.65
      : instrument === 'BTCUSD'
      ? 25
      : instrument === 'US30' || instrument === 'NAS100'
      ? 8
      : instrument.includes('JPY') || instrument === 'XAGUSD'
      ? 0.05
      : 0.0005;

  if (exitPrice !== null && takeProfit !== null && Math.abs(exitPrice - takeProfit) <= priceTol) {
    return 'TP';
  }
  if (exitPrice !== null && stopLoss !== null && Math.abs(exitPrice - stopLoss) <= priceTol) {
    return 'SL';
  }
  if (/\[\s*tp\s*\]|\/\s*tp\b|\btake\s*profit\b/i.test(notesLower)) {
    return 'TP';
  }
  if (/\[\s*sl\s*\]|\/\s*sl\b|\bstop\s*loss\b/i.test(notesLower)) {
    return 'SL';
  }

  if (rawUpper === 'TP') {
    if (netProfit !== null && netProfit < -0.05 && takeProfit === null) return 'Manual';
    return 'TP';
  }
  if (rawUpper === 'SL') {
    if (netProfit !== null && netProfit > 0.05 && stopLoss === null) return 'Manual';
    return 'SL';
  }
  return 'Manual';
}

async function handleExtractMt5History(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { imageBase64, imageUrl } = body || {};
    if (!imageBase64 && !imageUrl) {
      return jsonResponse({ success: false, error: 'Harap sertakan imageBase64 atau imageUrl.' }, 400);
    }

    const scannerApiKeys = getScannerGeminiApiKeys();
    if (scannerApiKeys.length === 0) {
      return jsonResponse(
        { success: false, error: 'GEMINI_API_KEY (khusus Scan Kilat) belum dikonfigurasi di Supabase Secret.' },
        400
      );
    }

    let mimeType = 'image/jpeg';
    let base64Data = '';

    if (imageBase64) {
      const trimmedInput = String(imageBase64).trim();
      const match = trimmedInput.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,([\s\S]+)$/i);
      if (match) {
        const rawMime = match[1].toLowerCase();
        mimeType =
          rawMime === 'image/png'
            ? 'image/png'
            : rawMime === 'image/webp'
            ? 'image/webp'
            : 'image/jpeg';
        base64Data = match[2].replace(/\s+/g, '');
      } else {
        base64Data = trimmedInput.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      }
    } else if (imageUrl) {
      const fetched = await fetchImageBase64FromUrl(String(imageUrl));
      const rawMime = (fetched.mimeType || 'image/jpeg').toLowerCase();
      mimeType =
        rawMime === 'image/png'
          ? 'image/png'
          : rawMime === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
      base64Data = fetched.base64;
    }

    const prompt = `You are an elite MetaTrader 5 (MT5) & MetaTrader 4 (MT4) Account History OCR & trade-ledger extraction specialist.
Inspect the FULL screenshot carefully from top to bottom and extract EVERY closed trade row visible (even if the screenshot is cropped and has no header).

STRICT EXTRACTION RULES:
1. SUPPORTED SCREENSHOT VIEWS:
   - MT5 / MT4 Mobile "History -> Positions" (e.g. "XAUUSD, sell 0.10", "2615.40 -> 2602.10", timestamp, profit)
   - MT5 Mobile "History -> Deals" (rows showing symbol, buy/sell, "out" / "in/out", volume, price, profit — extract closing/profit deals as closed trades)
   - Indonesian MT5 locale ("beli" = BUY, "jual" = SELL) as well as English ("buy"/"long" = BUY, "sell"/"short" = SELL)
   - MT5 / MT4 Desktop Account History table
   - Broker trade history lists showing closed positions with entry/exit or realized profit/loss
   - IGNORE summary header lines ("Profit:", "Deposit:", "Balance:", "Credit:", "Withdrawal:") and non-trade ledger rows ("balance", "deposit", "credit", "withdrawal") and unfilled "canceled" pending orders.
2. READING MOBILE MT5 HISTORY ROWS:
   - Left: symbol + direction + lot, e.g. "XAUUSD, sell 0.10", "XAUUSDm, buy 0.05", "GOLD, beli 0.10"
   - Below left: "2615.40 -> 2602.10" (entryPrice BEFORE "->", exitPrice AFTER "->")
   - Top-right of row: timestamp like "2026.11.14 14:22:10" (closeDateTime)
   - Bottom-right of row: realized profit/loss like "133.00" or "-45.20" (preserve minus sign strictly for red/negative values!)
   - Expanded row details (if expanded): "S / L:" -> stopLoss, "T / P:" -> takeProfit, "Open:" -> openDateTime, "Swap:" -> swap, "Commission:"/"Fee:" -> commission, "ID:"/"#12345" -> ticketId.
3. READING DESKTOP MT5 ACCOUNT HISTORY TABLE:
   - Map columns: Time (open), Position/Order/Ticket (ticketId), Symbol (instrument), Type (buy->BUY, sell->SELL), Volume (lotSize), Open Price (entryPrice), S/L (stopLoss), T/P (takeProfit), Close Time (closeDateTime), Close Price (exitPrice), Commission, Swap, Profit (netProfit).
4. CLOSE TYPE DETECTION (TP / SL / Manual):
   - "TP": comment/tag shows "[tp]", OR T/P badge is green/highlighted, OR exitPrice closely matches takeProfit.
   - "SL": comment/tag shows "[sl]", OR S/L badge is red/highlighted, OR exitPrice closely matches stopLoss.
   - "Manual": otherwise (closed manually by trader).
5. FORMATTING:
   - Return empty string "" (NEVER literal "null") when ticketId, openDateTime, closeDateTime, or notes are not visible.
   - Output openDateTime / closeDateTime in "YYYY-MM-DD HH:mm" if visible.
   - Never invent trades that are not visibly printed on screen.`;

    let responseText = '';
    let usedModel = '';

    for (const model of SCANNER_MODEL_CASCADE) {
      for (let keyIdx = 0; keyIdx < scannerApiKeys.length; keyIdx++) {
        const cooldownKey = `${keyIdx}:${model}`;
        const cooldownUntil = scanQuotaCooldownByKeyModel.get(cooldownKey) || 0;
        if (Date.now() < cooldownUntil) continue;

        const ai = new GoogleGenAI({
          apiKey: scannerApiKeys[keyIdx],
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [{ inlineData: { mimeType, data: base64Data } }, prompt],
              config: {
                ...(model === 'gemini-4-hydrogen' || model === 'gemini-3-flash-preview'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    detected: { type: Type.BOOLEAN },
                    source: { type: Type.STRING },
                    trades: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          ticketId: { type: Type.STRING },
                          instrument: { type: Type.STRING },
                          position: { type: Type.STRING },
                          lotSize: { type: Type.NUMBER },
                          entryPrice: { type: Type.NUMBER },
                          exitPrice: { type: Type.NUMBER },
                          stopLoss: { type: Type.NUMBER },
                          takeProfit: { type: Type.NUMBER },
                          commission: { type: Type.NUMBER },
                          swap: { type: Type.NUMBER },
                          netProfit: { type: Type.NUMBER },
                          openDateTime: { type: Type.STRING },
                          closeDateTime: { type: Type.STRING },
                          closeType: { type: Type.STRING },
                          notes: { type: Type.STRING },
                        },
                        required: ['instrument', 'position'],
                      },
                    },
                  },
                  required: ['detected', 'trades'],
                },
              },
            });
            if (response && response.text) {
              responseText = response.text;
              usedModel = model;
              break;
            }
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (isGeminiQuotaError(err)) {
              scanQuotaCooldownByKeyModel.set(cooldownKey, Date.now() + 20 * 60 * 1000);
              break;
            }
            const isTransient =
              errMsg.includes('503') ||
              errMsg.includes('500') ||
              errMsg.includes('UNAVAILABLE') ||
              errMsg.includes('overloaded') ||
              errMsg.includes('high demand');
            if (isTransient && attempt < 2) {
              await new Promise((r) => setTimeout(r, 450));
              continue;
            }
            break;
          }
        }
        if (responseText) break;
      }
      if (responseText) break;
    }

    if (!responseText) {
      return jsonResponse({
        success: false,
        quotaExhausted: true,
        error: 'Kuota AI Scan Kilat sedang penuh sementara. Silakan coba beberapa saat lagi.',
      });
    }

    let parsedData = parseAiJsonResponse(responseText);
    if (!Array.isArray(parsedData.trades)) {
      const tradesIdx = responseText.indexOf('"trades"');
      if (tradesIdx !== -1) {
        const arrStart = responseText.indexOf('[', tradesIdx);
        if (arrStart !== -1) {
          const recovered: any[] = [];
          const objMatches = responseText.slice(arrStart).match(/\{[^{}]+\}/g) || [];
          for (const rawObj of objMatches) {
            try {
              recovered.push(JSON.parse(rawObj));
            } catch {}
          }
          if (recovered.length > 0) {
            parsedData = { detected: true, source: 'MT5_HISTORY', trades: recovered };
          }
        }
      }
    }

    const rawTrades = Array.isArray(parsedData.trades) ? parsedData.trades : [];

    const normalizedTrades = rawTrades
      .map((row: any) => {
        if (!row || typeof row !== 'object') return null;
        const rawPos = String(row.position || '').trim().toUpperCase();
        const isSell =
          rawPos.includes('SELL') || rawPos.includes('JUAL') || rawPos.includes('SHORT');
        const isBuy =
          rawPos.includes('BUY') || rawPos.includes('BELI') || rawPos.includes('LONG');
        if (!isBuy && !isSell) {
          return null;
        }
        const position: 'BUY' | 'SELL' = isSell && !isBuy ? 'SELL' : isSell ? 'SELL' : 'BUY';
        const instrument = normalizeInstrument(row.instrument);
        const lotRaw = parseNumericValue(row.lotSize, 'EURUSD');
        const entryPrice = parseNumericValue(row.entryPrice, instrument);
        const exitPrice = parseNumericValue(row.exitPrice, instrument);
        const stopLoss = parseNumericValue(row.stopLoss, instrument);
        const takeProfit = parseNumericValue(row.takeProfit, instrument);
        const rawComm = parseNumericValue(row.commission, 'EURUSD');
        const rawSwap = parseNumericValue(row.swap, 'EURUSD');
        const rawProfit = parseNumericValue(row.netProfit, 'EURUSD');

        if (entryPrice === null && exitPrice === null && rawProfit === null) {
          return null;
        }

        const cleanStr = (v: unknown): string => {
          if (typeof v !== 'string') return '';
          const t = v.trim();
          return /^(null|undefined|none|n\/a)$/i.test(t) ? '' : t;
        };

        const openDateTime = normalizeMt5DateTimeOutput(cleanStr(row.openDateTime));
        const closeDateTime = normalizeMt5DateTimeOutput(cleanStr(row.closeDateTime));
        const notes = cleanStr(row.notes);
        const closeType = inferMt5CloseType({
          rawCloseType: row.closeType,
          notes,
          position,
          exitPrice,
          stopLoss,
          takeProfit,
          netProfit: rawProfit,
          instrument,
        });

        const rawTicket =
          typeof row.ticketId === 'string' || typeof row.ticketId === 'number'
            ? String(row.ticketId).replace(/^#/, '').trim()
            : '';
        const cleanTicket =
          rawTicket && !/^(null|undefined|none|n\/a|-)$/i.test(rawTicket) ? rawTicket : null;

        return {
          ticketId: cleanTicket,
          instrument,
          position,
          lotSize: lotRaw !== null && lotRaw > 0 ? Number(lotRaw.toFixed(2)) : 0.01,
          entryPrice: entryPrice !== null && entryPrice > 0 ? entryPrice : exitPrice || 0,
          exitPrice: exitPrice !== null && exitPrice > 0 ? exitPrice : entryPrice || 0,
          stopLoss: stopLoss !== null && stopLoss > 0 ? stopLoss : null,
          takeProfit: takeProfit !== null && takeProfit > 0 ? takeProfit : null,
          commission: rawComm !== null ? Number(Math.abs(rawComm).toFixed(2)) : 0,
          swap: rawSwap !== null ? Number(rawSwap.toFixed(2)) : 0,
          netProfit: rawProfit !== null ? Number(rawProfit.toFixed(2)) : 0,
          openDateTime,
          closeDateTime,
          closeType,
          notes,
        };
      })
      .filter((item: any) => item !== null);

    return jsonResponse({
      success: true,
      data: {
        detected: normalizedTrades.length > 0 && parsedData.detected !== false,
        source: String(parsedData.source || 'MT5_HISTORY'),
        trades: normalizedTrades,
        modelUsed: usedModel || 'gemini-4-hydrogen',
      },
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: err?.message || 'Terjadi kesalahan saat memindai riwayat MT5.',
      },
      500
    );
  }
}

async function fetchTradingViewActualsMap(calendarEvents: any[]): Promise<Map<string, string>> {
  const actualMap = new Map<string, string>();
  if (!Array.isArray(calendarEvents) || calendarEvents.length === 0) return actualMap;
  try {
    const times = calendarEvents
      .map((e) => new Date(e.date).getTime())
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) return actualMap;
    const minMs = Math.min(...times) - 24 * 60 * 60 * 1000;
    const maxMs = Math.max(...times) + 24 * 60 * 60 * 1000;
    const tvUrl = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
      new Date(minMs).toISOString()
    )}&to=${encodeURIComponent(new Date(maxMs).toISOString())}&countries=US`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(tvUrl, {
      headers: {
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return actualMap;
    const json = await res.json();
    const list = Array.isArray(json?.result) ? json.result : [];
    for (const item of list) {
      if (item && item.actual !== null && item.actual !== undefined) {
        const key = String(item.title || item.indicator || '')
          .trim()
          .toLowerCase();
        if (key) {
          const unit = item.unit ? String(item.unit) : '';
          actualMap.set(key, `${item.actual}${unit}`);
        }
      }
    }
  } catch {
    // ignore TradingView enrichment timeout
  }
  return actualMap;
}

async function fetchPastActualsViaGoogleSearch(
  missingEvents: any[],
  ai: GoogleGenAI
): Promise<Record<string, string>> {
  if (missingEvents.length === 0) return {};
  const listDesc = missingEvents
    .slice(0, 8)
    .map(
      (e) =>
        `- "${e.title}" (Scheduled: ${e.date}, Forecast: ${e.forecast || 'N/A'}, Previous: ${
          e.previous || 'N/A'
        })`
    )
    .join('\n');
  const prompt = `Search the web for the official released ACTUAL economic data values for these US USD economic indicators that have already been published:\n${listDesc}\n\nReturn ONLY a raw JSON object mapping the exact event title to its released actual value string (for example: {"Core CPI m/m": "0.3%", "CPI m/m": "0.2%"}). If an event has genuinely not been released yet, omit it. Do not include markdown fences or explanation.`;

  for (const model of NEWS_MODEL_CASCADE) {
    const cooldownUntil = newsQuotaCooldownByModel.get(model) || 0;
    if (Date.now() < cooldownUntil) continue;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const parsed = parseAiJsonResponse(response?.text || '');
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (
          typeof v === 'string' &&
          v.trim() &&
          v.trim() !== '-' &&
          !/menunggu|pending|n\/a/i.test(v)
        ) {
          out[k.trim().toLowerCase()] = v.trim();
        }
      }
      if (Object.keys(out).length > 0) return out;
    } catch (err: any) {
      if (isGeminiQuotaError(err)) {
        newsQuotaCooldownByModel.set(model, Date.now() + 30 * 60 * 1000);
      }
      continue;
    }
  }
  return {};
}

async function fetchCmeFedWatchWithGrounding(
  ai: GoogleGenAI,
  existingFedWatch: any
): Promise<any> {
  if (
    existingFedWatch?.isAvailable &&
    typeof existingFedWatch?.sourceLabel === 'string' &&
    existingFedWatch.sourceLabel.includes('Grounding')
  ) {
    return existingFedWatch;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const fedWatchPrompt = `Today is ${todayIso}. Search for the latest CME FedWatch Tool target rate probabilities for the December 2026 FOMC meeting (FOMC Desember 2026).
Return ONLY a valid JSON object (no markdown fences) with these exact fields:
{
  "isAvailable": boolean,
  "fomcMeetingDate": "FOMC Desember 2026",
  "targetRateRange": "string (e.g. '450-475 bps' or '')",
  "hikeProbability": number or null,
  "holdProbability": number or null,
  "cutProbability": number or null,
  "hawkishShiftDetected": boolean
}
CRITICAL RULE: Do not invent numbers. If search results do not contain exact figures, set "isAvailable": false.`;

  for (const model of NEWS_MODEL_CASCADE) {
    const cooldownUntil = newsQuotaCooldownByModel.get(model) || 0;
    if (Date.now() < cooldownUntil) continue;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: fedWatchPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const parsed = parseAiJsonResponse(response?.text || '');
      const cutVal = parsed.cutProbability != null ? Number(parsed.cutProbability) : null;
      const holdVal = parsed.holdProbability != null ? Number(parsed.holdProbability) : null;
      const hikeVal = parsed.hikeProbability != null ? Number(parsed.hikeProbability) : 0;

      if (
        parsed.isAvailable !== false &&
        cutVal !== null &&
        holdVal !== null &&
        Number.isFinite(cutVal) &&
        Number.isFinite(holdVal) &&
        cutVal + holdVal + (Number.isFinite(hikeVal) ? hikeVal : 0) > 0
      ) {
        return {
          ...(existingFedWatch || {}),
          isAvailable: true,
          fomcMeetingDate: 'FOMC Desember 2026',
          targetRateRange: String(parsed.targetRateRange || existingFedWatch?.targetRateRange || ''),
          cutProbability: cutVal,
          holdProbability: holdVal,
          hikeProbability: Number.isFinite(hikeVal) ? hikeVal : 0,
          hawkishShiftDetected: Boolean(parsed.hawkishShiftDetected || (hikeVal ?? 0) >= 50),
          sourceLabel: 'Sumber: CME FedWatch Grounding (Des 2026)',
        };
      }
    } catch (err: any) {
      if (isGeminiQuotaError(err)) {
        newsQuotaCooldownByModel.set(model, Date.now() + 30 * 60 * 1000);
      }
      continue;
    }
  }
  return existingFedWatch;
}

async function handleMacroNewsAnalyze(req: Request): Promise<Response> {
  let baselineSnapshot: any = null;
  try {
    const body = await req.json();
    const { clientFeeds, baselineSnapshot: clientBaseline } = body || {};
    baselineSnapshot = clientBaseline || null;

    if (!baselineSnapshot || !baselineSnapshot.scenarioMatrix) {
      return jsonResponse(
        {
          success: false,
          error: 'baselineSnapshot wajib disertakan dari klien TradeVault.',
        },
        400
      );
    }

    // Strictly isolated Trade News API Key (ONLY GEMINI_NEWS_API_KEY — never touches GEMINI_API_KEY used by Scan Kilat!)
    const newsApiKey = getNewsGeminiApiKeys()[0] || '';

    if (!newsApiKey) {
      return jsonResponse({
        success: true,
        fallbackUsed: true,
        snapshot: baselineSnapshot,
      });
    }

    const ai = new GoogleGenAI({
      apiKey: newsApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const calendarEvents = Array.isArray(clientFeeds?.calendarEvents)
      ? clientFeeds.calendarEvents
      : Array.isArray(baselineSnapshot.calendarEvents)
      ? baselineSnapshot.calendarEvents
      : [];
    const intermarketPulse = clientFeeds?.intermarketPulse || baselineSnapshot.intermarketPulse || {};
    const breakingNews = Array.isArray(clientFeeds?.breakingNews)
      ? clientFeeds.breakingNews
      : Array.isArray(baselineSnapshot.breakingNews)
      ? baselineSnapshot.breakingNews
      : [];

    // Enrich past missing Actuals via TradingView & Google Search Grounding in parallel with CME FedWatch
    const nowCutoffMs = Date.now() - 5 * 60 * 1000;
    const pastMissing = calendarEvents.filter(
      (ev: any) =>
        (!ev.actual || !String(ev.actual).trim()) &&
        !/speech|speaks|testimony|fomc\s+press|beige\s+book/i.test(String(ev.title || '')) &&
        (ev.forecastNum !== null || ev.previousNum !== null) &&
        new Date(ev.date).getTime() < nowCutoffMs
    );

    const [tvActualsMap, groundedFedWatch] = await Promise.all([
      pastMissing.length > 0 ? fetchTradingViewActualsMap(calendarEvents) : Promise.resolve(new Map()),
      fetchCmeFedWatchWithGrounding(ai, clientFeeds?.cmeFedWatch || baselineSnapshot.cmeFedWatch),
    ]);

    let enrichedCalendar = calendarEvents.map((ev: any) => {
      if (!ev.actual || !String(ev.actual).trim()) {
        const found = tvActualsMap.get(String(ev.title || '').trim().toLowerCase());
        if (found) {
          return { ...ev, actual: found };
        }
      }
      return ev;
    });

    const stillMissing = enrichedCalendar.filter(
      (ev: any) =>
        (!ev.actual || !String(ev.actual).trim()) &&
        !/speech|speaks|testimony|fomc\s+press|beige\s+book/i.test(String(ev.title || '')) &&
        ev.impact === 'High' &&
        (ev.forecastNum !== null || ev.previousNum !== null) &&
        new Date(ev.date).getTime() < nowCutoffMs
    );

    if (stillMissing.length > 0) {
      const searchActuals = await fetchPastActualsViaGoogleSearch(stillMissing, ai);
      if (Object.keys(searchActuals).length > 0) {
        enrichedCalendar = enrichedCalendar.map((ev: any) => {
          if (!ev.actual || !String(ev.actual).trim()) {
            const found = searchActuals[String(ev.title || '').trim().toLowerCase()];
            if (found) return { ...ev, actual: found };
          }
          return ev;
        });
      }
    }

    const promptPayload = {
      primaryEvent: baselineSnapshot.scenarioMatrix.primaryEvent,
      simultaneousEvents: baselineSnapshot.scenarioMatrix.simultaneousEvents || [],
      supportingContextEvents: enrichedCalendar.slice(0, 12).map((ev: any) => ({
        title: ev.title,
        date: ev.date,
        impact: ev.impact,
        previous: ev.previous,
        forecast: ev.forecast,
        actual: ev.actual,
        eventBiasForGold: ev.eventBiasForGold,
        biasReasonId: ev.biasReasonId,
      })),
      cmeFedWatch: groundedFedWatch,
      intermarketPulse: {
        dxy: intermarketPulse.dxy
          ? {
              price: intermarketPulse.dxy.price,
              changePercent: intermarketPulse.dxy.changePercent,
              direction: intermarketPulse.dxy.direction,
            }
          : undefined,
        usoil: intermarketPulse.usoil
          ? {
              price: intermarketPulse.usoil.price,
              changePercent: intermarketPulse.usoil.changePercent,
              direction: intermarketPulse.usoil.direction,
            }
          : undefined,
        us10y: intermarketPulse.us10y
          ? {
              price: intermarketPulse.us10y.price,
              changePercent: intermarketPulse.us10y.changePercent,
              direction: intermarketPulse.us10y.direction,
            }
          : undefined,
        us02y: intermarketPulse.us02y
          ? {
              price: intermarketPulse.us02y.price,
              changePercent: intermarketPulse.us02y.changePercent,
              direction: intermarketPulse.us02y.direction,
            }
          : undefined,
        vix: intermarketPulse.vix?.isAvailable ? intermarketPulse.vix : undefined,
        goldPositioning: intermarketPulse.goldPositioning?.isAvailable
          ? intermarketPulse.goldPositioning
          : undefined,
      },
      preNewsFlow: baselineSnapshot.scenarioMatrix.preNewsFlow,
      breakingHeadlines: breakingNews.slice(0, 10).map((h: any) => ({
        title: h.title,
        keywords: h.matchedKeywords,
        channel: h.channelType,
      })),
      deterministicBaseline: {
        buyProbability: baselineSnapshot.scenarioMatrix.buyProbability,
        sellProbability: baselineSnapshot.scenarioMatrix.sellProbability,
        mixedProbability: baselineSnapshot.scenarioMatrix.mixedProbability,
        dominantBias: baselineSnapshot.scenarioMatrix.dominantBias,
        dynamicPivotTriggered: baselineSnapshot.scenarioMatrix.dynamicPivotTriggered,
        evaluationMode: baselineSnapshot.scenarioMatrix.evaluationMode || 'INDIVIDUAL_RELEASE',
        hasSpeechEvent: baselineSnapshot.scenarioMatrix.dualHorizon?.hasSpeechEvent ?? false,
        speechEventsNearby: baselineSnapshot.scenarioMatrix.dualHorizon?.speechEventsNearby ?? [],
        isPricedIn: baselineSnapshot.scenarioMatrix.dualHorizon?.isPricedIn ?? false,
        move6hUsd: baselineSnapshot.scenarioMatrix.dualHorizon?.move6hUsd ?? 0,
        atr14_1h: baselineSnapshot.scenarioMatrix.dualHorizon?.atr14_1h ?? 12.0,
        movementType:
          baselineSnapshot.scenarioMatrix.dualHorizon?.movementType ?? 'TWO_WAY_SWEEP_FIRST',
        movementBadgeId:
          baselineSnapshot.scenarioMatrix.dualHorizon?.movementBadgeId ??
          'TIPE PERGERAKAN: [2 ARAH — SWEEP FIRST]',
      },
    };

    let aiResponseText = '';
    let usedModel = '';

    for (const model of NEWS_MODEL_CASCADE) {
      const cooldownUntil = newsQuotaCooldownByModel.get(model) || 0;
      if (Date.now() < cooldownUntil) continue;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `Analyze this real-time XAU/USD macro dataset (including CME FedWatch probabilities, simultaneous USD High-Impact events, and preNewsFlow intelligence such as Leading Indicator Chain, Consensus Tightness, 2s10s Yield Curve Spread, VIX risk regime, Gold 3-day GC=F positioning, and FOMC Blackout window while strictly preserving Master Playbook rules) and return the structured JSON Scenario Matrix in both Bahasa Indonesia (Id) and English (En):\n${JSON.stringify(
            promptPayload
          )}`,
          config: {
            systemInstruction: XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                impactLevel: { type: Type.STRING },
                dominantBias: { type: Type.STRING },
                buyProbability: { type: Type.INTEGER },
                sellProbability: { type: Type.INTEGER },
                mixedProbability: { type: Type.INTEGER },
                dynamicPivotTriggered: { type: Type.BOOLEAN },
                topBreakingEvalId: { type: Type.STRING },
                topBreakingEvalEn: { type: Type.STRING },
                finalTakeId: { type: Type.STRING },
                finalTakeEn: { type: Type.STRING },
                actionPlanId: { type: Type.STRING },
                actionPlanEn: { type: Type.STRING },
                whipsawWarningId: { type: Type.STRING },
                whipsawWarningEn: { type: Type.STRING },
                institutionalDeskThesisId: { type: Type.STRING },
                institutionalDeskThesisEn: { type: Type.STRING },
                phase1Minute0to5Id: { type: Type.STRING },
                phase1Minute0to5En: { type: Type.STRING },
                phase2Minute15PlusId: { type: Type.STRING },
                phase2Minute15PlusEn: { type: Type.STRING },
              },
              required: [
                'impactLevel',
                'dominantBias',
                'buyProbability',
                'sellProbability',
                'mixedProbability',
                'finalTakeId',
                'finalTakeEn',
                'actionPlanId',
                'actionPlanEn',
              ],
            },
          },
        });
        if (response && response.text) {
          aiResponseText = response.text;
          usedModel = model;
          break;
        }
      } catch (err: any) {
        if (isGeminiQuotaError(err)) {
          newsQuotaCooldownByModel.set(model, Date.now() + 30 * 60 * 1000);
          continue;
        }
        break;
      }
    }

    if (!aiResponseText) {
      return jsonResponse({
        success: true,
        fallbackUsed: true,
        snapshot: {
          ...baselineSnapshot,
          calendarEvents: enrichedCalendar,
          cmeFedWatch: groundedFedWatch,
        },
      });
    }

    const aiParsed = parseAiJsonResponse(aiResponseText);
    let buyProb = Number(aiParsed.buyProbability);
    let sellProb = Number(aiParsed.sellProbability);
    let mixedProb = Number(aiParsed.mixedProbability);

    if (
      !Number.isFinite(buyProb) ||
      !Number.isFinite(sellProb) ||
      !Number.isFinite(mixedProb) ||
      buyProb + sellProb + mixedProb <= 0
    ) {
      buyProb = baselineSnapshot.scenarioMatrix.buyProbability;
      sellProb = baselineSnapshot.scenarioMatrix.sellProbability;
      mixedProb = baselineSnapshot.scenarioMatrix.mixedProbability;
    } else {
      const sum = buyProb + sellProb + mixedProb;
      buyProb = Math.round((buyProb / sum) * 100);
      sellProb = Math.round((sellProb / sum) * 100);
      mixedProb = Math.max(0, 100 - buyProb - sellProb);
    }

    const rawBias = String(aiParsed.dominantBias || '').toUpperCase();
    const dominantBias: 'BUY' | 'SELL' | 'MIXED' =
      rawBias === 'BUY' || rawBias === 'SELL' || rawBias === 'MIXED'
        ? rawBias
        : baselineSnapshot.dominantBias;

    const rawImpact = String(aiParsed.impactLevel || '').toUpperCase();
    const impactLevel: 'HIGH' | 'MEDIUM' | 'LOW' =
      rawImpact === 'HIGH' || rawImpact === 'MEDIUM' || rawImpact === 'LOW'
        ? rawImpact
        : baselineSnapshot.impactLevel;

    const updatedTopAlert = baselineSnapshot.topBreakingAlert
      ? {
          ...baselineSnapshot.topBreakingAlert,
          aiEvaluationId:
            aiParsed.topBreakingEvalId || baselineSnapshot.topBreakingAlert.aiEvaluationId,
          aiEvaluationEn:
            aiParsed.topBreakingEvalEn || baselineSnapshot.topBreakingAlert.aiEvaluationEn,
        }
      : null;

    const isStrongOneWayBias = buyProb >= 60 || sellProb >= 60;
    const t5ExecutionTacticId = isStrongOneWayBias
      ? 'BIAS 1 ARAH KUAT (FINAL T-5M) — Siapkan setup dan kalkulasi lot di area struktur M1/M5 sebelum detik rilis, gunakan SL ketat.'
      : 'POTENSI SPIKE 2 ARAH / WHIPSAW (FINAL T-5M) — Tahan entry sebelum rilis; biarkan likuiditas 1–2 menit pertama tersapu terlebih dahulu.';
    const t5ExecutionTacticEn = isStrongOneWayBias
      ? 'STRONG 1-WAY BIAS (FINAL T-5M) — Prepare setup and lot calculation at M1/M5 structure zones before release second, use tight SL.'
      : 'TWO-WAY SPIKE / WHIPSAW RISK (FINAL T-5M) — Hold entry before release; let the first 1–2 minutes of liquidity sweep settle first.';

    const baseDualHorizon = baselineSnapshot.scenarioMatrix.dualHorizon || {};
    const updatedDualHorizon = {
      ...baseDualHorizon,
      phase1Minute0to5Id:
        typeof aiParsed.phase1Minute0to5Id === 'string' && aiParsed.phase1Minute0to5Id.trim()
          ? aiParsed.phase1Minute0to5Id.trim()
          : baseDualHorizon.phase1Minute0to5Id,
      phase1Minute0to5En:
        typeof aiParsed.phase1Minute0to5En === 'string' && aiParsed.phase1Minute0to5En.trim()
          ? aiParsed.phase1Minute0to5En.trim()
          : baseDualHorizon.phase1Minute0to5En,
      phase2Minute15PlusId:
        typeof aiParsed.phase2Minute15PlusId === 'string' && aiParsed.phase2Minute15PlusId.trim()
          ? aiParsed.phase2Minute15PlusId.trim()
          : baseDualHorizon.phase2Minute15PlusId,
      phase2Minute15PlusEn:
        typeof aiParsed.phase2Minute15PlusEn === 'string' && aiParsed.phase2Minute15PlusEn.trim()
          ? aiParsed.phase2Minute15PlusEn.trim()
          : baseDualHorizon.phase2Minute15PlusEn,
    };

    const enrichedSnapshot = {
      ...baselineSnapshot,
      analyzedAt: new Date().toISOString(),
      sourceMode: 'GEMINI_AI',
      modelUsed: usedModel || 'gemini-4-hydrogen',
      impactLevel,
      dominantBias,
      calendarEvents: enrichedCalendar,
      cmeFedWatch: groundedFedWatch,
      topBreakingAlert: updatedTopAlert,
      scenarioMatrix: {
        ...baselineSnapshot.scenarioMatrix,
        buyProbability: buyProb,
        sellProbability: sellProb,
        mixedProbability: mixedProb,
        dominantBias,
        dualHorizon: updatedDualHorizon,
        dynamicPivotTriggered:
          typeof aiParsed.dynamicPivotTriggered === 'boolean'
            ? aiParsed.dynamicPivotTriggered
            : baselineSnapshot.scenarioMatrix.dynamicPivotTriggered,
        finalTakeId: aiParsed.finalTakeId || baselineSnapshot.scenarioMatrix.finalTakeId,
        finalTakeEn: aiParsed.finalTakeEn || baselineSnapshot.scenarioMatrix.finalTakeEn,
        actionPlanId: aiParsed.actionPlanId || baselineSnapshot.scenarioMatrix.actionPlanId,
        actionPlanEn: aiParsed.actionPlanEn || baselineSnapshot.scenarioMatrix.actionPlanEn,
        whipsawWarningId:
          aiParsed.whipsawWarningId || baselineSnapshot.scenarioMatrix.whipsawWarningId,
        whipsawWarningEn:
          aiParsed.whipsawWarningEn || baselineSnapshot.scenarioMatrix.whipsawWarningEn,
        institutionalDeskThesisId:
          aiParsed.institutionalDeskThesisId ||
          baselineSnapshot.scenarioMatrix.institutionalDeskThesisId,
        institutionalDeskThesisEn:
          aiParsed.institutionalDeskThesisEn ||
          baselineSnapshot.scenarioMatrix.institutionalDeskThesisEn,
        t5ExecutionTacticId,
        t5ExecutionTacticEn,
        isStrongOneWayBias,
        cmeFedWatch: groundedFedWatch,
      },
    };

    return jsonResponse({
      success: true,
      fallbackUsed: false,
      snapshot: enrichedSnapshot,
    });
  } catch {
    if (baselineSnapshot) {
      return jsonResponse({
        success: true,
        fallbackUsed: true,
        snapshot: baselineSnapshot,
      });
    }
    return jsonResponse({ success: false, error: 'Gagal memproses analisis makro.' }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const reqUrl = new URL(req.url);
  const path = reqUrl.pathname.replace(/\/+$/, '');

  if (req.method === 'GET' && (path.endsWith('/api/health') || path.endsWith('/tradevault-api'))) {
    const scannerKeys = getScannerGeminiApiKeys();
    const newsKeys = getNewsGeminiApiKeys();
    return jsonResponse({
      ok: true,
      service: 'tradevault-supabase-edge-api',
      geminiConfigured: Boolean(scannerKeys.length > 0 || newsKeys.length > 0),
      scannerGeminiConfigured: scannerKeys.length > 0,
      newsGeminiConfigured: newsKeys.length > 0,
      apiKeysStrictlySeparated: true,
      scannerModelCascade: SCANNER_MODEL_CASCADE,
      isMarketOpen: isMarketDayUtc(new Date()),
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === 'GET' && path.endsWith('/api/proxy')) {
    return handleProxy(reqUrl);
  }

  if (req.method === 'POST' && path.endsWith('/api/extract-trade-screenshot')) {
    return handleExtractTradeScreenshot(req);
  }

  if (req.method === 'POST' && path.endsWith('/api/extract-mt5-history')) {
    return handleExtractMt5History(req);
  }

  if (req.method === 'POST' && path.endsWith('/api/macro-news/analyze')) {
    return handleMacroNewsAnalyze(req);
  }

  return jsonResponse(
    {
      ok: false,
      error: `Route not found: ${req.method} ${path}`,
    },
    404
  );
});
