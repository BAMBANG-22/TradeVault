import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  MacroCalendarEvent,
  IntermarketAssetPulse,
  BreakingNewsHeadline,
  MacroNewsSnapshot,
  XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION,
  parseMacroNumeric,
  classifyFomcPillar,
  isInverseUsdIndicator,
  isRelevantUsdMacroEvent,
  evaluateSingleEventForGold,
  filterAndScoreBreakingHeadlines,
  computeDeterministicMacroSnapshot,
  isSnapshotFresh,
} from './src/utils/macroNewsEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware for parsing large JSON / base64 payloads & CORS for mobile APK
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Resilient backend proxy endpoint for public financial feeds
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, text/xml, application/rss+xml, */*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await upstreamRes.text();
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Proxy fetch failed' });
  }
});

interface ExtractScreenshotRequest {
  imageBase64?: string;
  imageUrl?: string;
  canvasHints?: {
    hasPositionBox?: boolean;
    inferredPosition?: 'BUY' | 'SELL' | null;
    inferredRR?: number | null;
    entryYRatio?: number | null;
    tpYRatio?: number | null;
    slYRatio?: number | null;
    boxTopYRatio?: number | null;
    boxBottomYRatio?: number | null;
  } | null;
}

/**
 * Fetch an image from an external URL (handles TradingView snapshot redirects/pages)
 */
async function fetchImageBufferFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const parsedUrl = new URL(url);

  // Fast-path: TradingView /x/<ID>/ shortlink maps directly to s3.tradingview.com/snapshots/<firstChar>/<ID>.png
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
        return { buffer: Buffer.from(arrayBuf), mimeType: s3Mime.split(';')[0] };
      }
    }
  }

  // If user pasted a TradingView share link (e.g. https://www.tradingview.com/x/abcd/)
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

  // If HTML returned (e.g. TradingView preview page), scrape og:image
  if (contentType.includes('text/html')) {
    const htmlText = await res.text();
    const ogImageMatch =
      htmlText.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      htmlText.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
      htmlText.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);

    if (ogImageMatch && ogImageMatch[1]) {
      const realImageUrl = ogImageMatch[1];
      const imgRes = await fetch(realImageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/*',
        },
      });
      if (!imgRes.ok) {
        throw new Error(`Gagal mengambil gambar snapshot TradingView dari ${realImageUrl}`);
      }
      const imgMime = imgRes.headers.get('content-type') || 'image/png';
      const arrayBuf = await imgRes.arrayBuffer();
      return { buffer: Buffer.from(arrayBuf), mimeType: imgMime.split(';')[0] };
    } else {
      throw new Error('URL tidak mengarah langsung ke gambar ataupun snapshot TradingView yang valid.');
    }
  }

  const mimeType = contentType.split(';')[0] || 'image/png';
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType };
}

/**
 * Bulletproof multi-stage JSON parser for AI vision output.
 * Prevents SyntaxError when LLM outputs unescaped quotes, trailing characters, or partial tokens.
 */

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
    if (contextualMatch) {
      s = contextualMatch[1].trim();
    }

    s = s.replace(/[^0-9.,+\- ]/g, '').trim();
    if (!s) return null;

    // Format X.XXX,XXX (dot thousands, comma decimal e.g. "4.054,405" -> "4054.405")
    if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^[+-]?\d{1,3}(?:[ ,]\d{3})+\.\d+$/.test(s)) {
      s = s.replace(/[ ,]/g, '');
    } else if (s.includes('.') && s.includes(',')) {
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
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

function normalizeInstrument(raw: string | null | undefined): string {
  if (!raw) return 'XAUUSD';
  let s = raw.toUpperCase().trim();

  // Strip tradingview exchange prefixes (e.g. BINANCE:BTCUSD -> BTCUSD, FX:EURUSD -> EURUSD)
  if (s.includes(':')) {
    s = s.split(':').pop() || s;
  }

  // Handle common commodities / indices / cryptos
  if (s.includes('GOLD') || s.startsWith('XAU')) return 'XAUUSD';
  if (s.includes('BITCOIN') || s.startsWith('BTC')) return 'BTCUSD';
  if (s.includes('ETHER') || s.startsWith('ETH')) return 'ETHUSD';
  if (s.includes('SOLANA') || s.startsWith('SOL')) return 'SOLUSD';
  if (s.includes('DOW') || s.includes('DJI') || s.includes('US30')) return 'US30';
  if (s.includes('NAS') || s.includes('USTEC') || s.includes('NDX')) return 'NAS100';
  if (s.includes('SPX') || s.includes('US500') || s.includes('S&P')) return 'SPX500';
  if (s.includes('DAX') || s.includes('GER40') || s.includes('DE40')) return 'GER40';

  // Recognized Forex Pairs (direct match before stripping suffixes)
  const KNOWN_FOREX = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
    'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
    'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'AUDCAD', 'AUDNZD',
    'CADCHF', 'NZDCAD', 'NZDCHF'
  ];
  for (const pair of KNOWN_FOREX) {
    if (s.includes(pair)) return pair;
  }

  // Strip broker suffixes (.m, .raw, .pro, .std, .ecn, _i, _sb, _c)
  s = s.replace(/(\.M|\.RAW|\.PRO|\.STD|\.ECN|\.B|_I|_SB|_C)$/i, '');
  if (s.length > 6 && (s.endsWith('C') || s.endsWith('M'))) {
    s = s.slice(0, -1);
  }
  s = s.replace(/[^A-Z0-9]/g, '');

  return s || 'XAUUSD';
}

function parseAiJsonResponse(text: string): Record<string, any> {
  if (!text || typeof text !== 'string') return {};

  // 1. Direct JSON parse attempt
  try {
    return JSON.parse(text);
  } catch {}

  // 2. Strip code fences (```json ... ```)
  const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {}

  // 3. Extract the first { ... } block
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = clean.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 4. Try auto-closing open brackets/quotes if truncated
  let repaired = clean.trim();
  repaired = repaired.replace(/,\s*$/, '').replace(/:\s*$/, '');
  if (!repaired.endsWith('}')) {
    repaired += '}';
  }
  try {
    return JSON.parse(repaired);
  } catch {}

  // 5. Ultimate Fallback: Deterministic Regex Token Extractor (100% resilient)
  console.warn('[AI Vision] JSON parsing required regex fallback recovery for payload snippet:', clean.slice(0, 150));
  const extractStr = (key: string): string | null => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\r\\n]*)"`, 'i'));
    return m ? m[1].trim() : null;
  };
  const inst = normalizeInstrument(extractStr('instrument'));
  const extractNum = (key: string): number | null => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"?([^",}\\r\\n]+)"?`, 'i'));
    if (m) {
      return parseNumericValue(m[1], inst);
    }
    return null;
  };
  const extractBool = (key: string): boolean => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`, 'i'));
    return m ? m[1].toLowerCase() === 'true' : true;
  };

  return {
    detected: extractBool('detected'),
    source: extractStr('source') || 'MT5',
    instrument: inst,
    position: (extractStr('position') || 'BUY').toUpperCase(),
    lotSize: extractNum('lotSize'),
    entryPrice: extractNum('entryPrice'),
    stopLoss: extractNum('stopLoss'),
    takeProfit: extractNum('takeProfit'),
    exitPrice: extractNum('exitPrice'),
    profit: extractNum('profit'),
    plannedRiskReward: extractNum('plannedRiskReward'),
    timeframe: extractStr('timeframe'),
    currentPrice: extractNum('currentPrice'),
    status: extractStr('status') || 'PLANNED',
    notes: extractStr('notes') || '',
  };
}

const quotaCooldownUntilByModel = new Map<string, number>();

// AI Vision Endpoint: Extract trade data from chart screenshot
app.post('/api/extract-trade-screenshot', async (req, res) => {
  try {
    const { imageBase64, imageUrl, canvasHints } = req.body as ExtractScreenshotRequest;

    if (!imageBase64 && !imageUrl) {
      res.status(400).json({
        success: false,
        error: 'Harap sertakan imageBase64 atau imageUrl.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({
        success: false,
        error:
          'GEMINI_API_KEY belum dikonfigurasi di environment server. Pastikan API key telah disetel.',
      });
      return;
    }

    let mimeType = 'image/jpeg';
    let base64Data = '';

    if (imageBase64) {
      const trimmedInput = imageBase64.trim();
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
      const fetched = await fetchImageBufferFromUrl(imageUrl);
      const rawMime = (fetched.mimeType || 'image/jpeg').toLowerCase();
      mimeType =
        rawMime === 'image/png'
          ? 'image/png'
          : rawMime === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
      base64Data = fetched.buffer.toString('base64');
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const geometryHintBlock =
      canvasHints && canvasHints.hasPositionBox
        ? `\nPIXEL GEOMETRY SCANNER HINTS (VERIFIED FROM IMAGE PIXELS):
- A TradingView ${canvasHints.inferredPosition || 'BUY/SELL'} Position Box (Profit Zone & Risk Zone) was detected:
  * Verified Direction: ${canvasHints.inferredPosition || 'UNKNOWN'} (${
            canvasHints.inferredPosition === 'SELL'
              ? 'Risk Zone (Dark Grey/Slate or Red) is at the TOP and Profit Zone (Dark Blue/Navy or Green) is at the BOTTOM -> SELL (TP < Entry < SL)'
              : 'Profit Zone (Green or Dark Blue/Navy) is at the TOP and Risk Zone (Red or Dark Grey/Slate) is at the BOTTOM -> BUY (SL < Entry < TP)'
          })
  * Top boundary of Position Box is at vertical Y = ${
    canvasHints.boxTopYRatio != null ? (canvasHints.boxTopYRatio * 100).toFixed(1) + '%' : 'N/A'
  } from top of image.
  * Central Dividing Line (Entry Price) is at vertical Y = ${
    canvasHints.entryYRatio != null ? (canvasHints.entryYRatio * 100).toFixed(1) + '%' : 'N/A'
  } from top of image.
  * Bottom boundary of Position Box is at vertical Y = ${
    canvasHints.boxBottomYRatio != null ? (canvasHints.boxBottomYRatio * 100).toFixed(1) + '%' : 'N/A'
  } from top of image.\n`
        : '';

    const prompt = `You are an elite financial chart & order OCR specialist for MetaTrader 5 (MT5 / MT4) and TradingView.
Carefully inspect the full, uncropped screenshot from the left edge to the rightmost Y-axis price scale.
${geometryHintBlock}
1. SPATIAL VISUAL RULES FOR METATRADER 5 (MT5) CHARTS:
   - Read the order labels at the LEFT edge of the chart: "TP", "SL", "BUY LIMIT", "SELL LIMIT", "BUY STOP", "SELL STOP", "BUY", "SELL" (for example: "TP", "BUY LIMIT 0.12", "SL").
   - Follow each label's horizontal dashed line straight across to the RIGHTMOST Y-AXIS, and ONLY extract the price number that is inside a BORDERED / OUTLINED BOX (kotak berbingkai) aligned with that dashed line:
     * Example: "TP" dashed line -> bordered box "4074.43" on right Y-axis -> takeProfit = 4074.43
     * Example: "BUY LIMIT 0.12" dashed line -> bordered box "4042.74" on right Y-axis -> entryPrice = 4042.74, lotSize = 0.12, position = "BUY"
     * Example: "SL" dashed line -> bordered box "4031.97" on right Y-axis -> stopLoss = 4031.97
   - IGNORE plain unbordered grid numbers on the Y-axis (such as "4052.92" or "4030.42").
   - IGNORE the running candle price badge (such as "4050.87 / 00:50") — put that ONLY in currentPrice, NEVER in entryPrice, stopLoss, or takeProfit!
   - STATUS RULE: If the order label contains "LIMIT" or "STOP" (e.g. "BUY LIMIT", "SELL LIMIT", "BUY STOP", "SELL STOP"), you MUST set status = "PLANNED".

2. SPATIAL VISUAL RULES FOR TRADINGVIEW CHARTS:
   - Detect the Position Tool's two vertically-adjacent rectangular zones even when customized with Dark Blue / Navy (Profit Zone) and Dark Grey / Slate (Risk Zone) instead of Green and Red.
   - IGNORE indicator or annotation boxes inside the chart such as "OB m5", "FVG", or "BOS", and ignore the live running candle price badge (e.g. "4.105,78" or "4.105,735").
   - Read the Y-axis price badges at:
     (1) The outer TOP boundary of the top box,
     (2) The CENTRAL HORIZONTAL DIVIDING LINE between the two boxes (Entry Price),
     (3) The outer BOTTOM boundary of the bottom box.
   - Direction Rule:
     * If the Dark Blue / Navy (or Green) target box is at the BOTTOM and the Dark Grey / Slate (or Red) risk box is at the TOP, the direction is SELL (takeProfit < entryPrice < stopLoss, e.g. SL = 4099.857 at top, Entry = 4093.045 in middle, TP = 4054.405 at bottom).
     * If the Green (or Dark Blue / Navy) target box is at the TOP and the Red (or Dark Grey / Slate) risk box is at the BOTTOM, the direction is BUY (stopLoss < entryPrice < takeProfit).
   - LOCAL NUMBER FORMAT NORMALIZATION: If the Y-axis uses dot thousands separators and comma decimal separators (such as "4.054,405" or "4.105,735"), remove the thousands dot (.) and convert the comma (,) to a decimal point -> 4054.405 and 4105.735.
   - LOT SIZE ON TRADINGVIEW: Always return null for lotSize on TradingView.

3. NO FAKE / SYNTHETIC NUMBERS:
   - NEVER invent, interpolate, or calculate synthetic SL/TP numbers using offsets (such as entry - 0.04 or + 0.08).
   - If Entry, SL, or TP is not clearly visible on the chart, return null for that field so the user can fill it manually.`;

    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
    let responseText = '';
    let usedModel = '';

    for (const model of candidateModels) {
      const cooldownUntil = quotaCooldownUntilByModel.get(model) || 0;
      if (Date.now() < cooldownUntil) {
        continue;
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              prompt,
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detected: { type: Type.BOOLEAN, description: 'True if trade setup or order is detected' },
                  source: { type: Type.STRING, description: 'MT5, TRADINGVIEW, or CHART' },
                  instrument: { type: Type.STRING, description: 'Clean instrument symbol, e.g. XAUUSD, EURUSD, GBPUSD, USDJPY, BTCUSD, US30, NAS100' },
                  position: { type: Type.STRING, description: 'BUY or SELL' },
                  lotSize: { type: Type.NUMBER, description: 'Lot size ONLY if source is MT5 (e.g. 0.01, 0.12, 0.25). Null for TradingView.' },
                  entryPrice: { type: Type.NUMBER, description: 'Exact entry price from right Y-axis bordered box/badge, or null if not detected' },
                  stopLoss: { type: Type.NUMBER, description: 'Exact Stop Loss price from right Y-axis bordered box/badge, or null if not detected' },
                  takeProfit: { type: Type.NUMBER, description: 'Exact Take Profit price from right Y-axis bordered box/badge, or null if not detected' },
                  exitPrice: { type: Type.NUMBER, description: 'Close/exit price if trade is closed' },
                  profit: { type: Type.NUMBER, description: 'Floating or closed profit/loss amount' },
                  plannedRiskReward: { type: Type.NUMBER, description: 'Risk/Reward ratio number (e.g. 2.0 for 1:2 RR)' },
                  timeframe: { type: Type.STRING, description: 'Chart timeframe (e.g. M1, M5, M15, M30, H1, H4, D1)' },
                  currentPrice: { type: Type.NUMBER, description: 'Current live running market price on the right price scale' },
                  status: { type: Type.STRING, description: 'PLANNED (when LIMIT or STOP is present, or TradingView setup), ACTIVE (open market order), or CLOSED' },
                  notes: { type: Type.STRING, description: 'Brief summary of visual readings including left-edge order labels' },
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
          const isQuotaExhausted =
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('Quota exceeded');

          if (isQuotaExhausted) {
            // Put this model on a 1-hour (3600s) cooldown and immediately try the next model in the queue
            quotaCooldownUntilByModel.set(model, Date.now() + 60 * 60 * 1000);
            break;
          }

          const isTransientServerOverload =
            errMsg.includes('503') ||
            errMsg.includes('high demand') ||
            errMsg.includes('overloaded') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('500');

          if (isTransientServerOverload && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          break;
        }
      }
      if (responseText) break;
    }

    if (!responseText) {
      res.status(200).json({
        success: false,
        quotaExhausted: true,
        error:
          'Batas kuota harian tier gratis tercapai sementara; beralih otomatis ke pemindai geometri kanvas & OCR.',
      });
      return;
    }

    const parsedData = parseAiJsonResponse(responseText);

    // Normalize instrument name & strip broker suffixes
    const cleanInstrument = normalizeInstrument(parsedData.instrument);

    // Normalize position (prefer verified canvas box direction if TradingView box is present)
    let cleanPosition: 'BUY' | 'SELL' =
      canvasHints?.hasPositionBox && (canvasHints.inferredPosition === 'BUY' || canvasHints.inferredPosition === 'SELL')
        ? canvasHints.inferredPosition
        : parsedData.position === 'SELL'
        ? 'SELL'
        : 'BUY';

    // Source detection
    const source: 'MT5' | 'TRADINGVIEW' | 'CHART' =
      parsedData.source === 'MT5'
        ? 'MT5'
        : parsedData.source === 'TRADINGVIEW' || canvasHints?.hasPositionBox
        ? 'TRADINGVIEW'
        : 'CHART';

    // Lifecycle status detection (strictly detect LIMIT / STOP as PLANNED)
    const notesStr = String(parsedData.notes || '');
    const rawStatusStr = String(parsedData.status || '').toUpperCase();
    const hasPendingKeyword = /\b(BUY\s+LIMIT|SELL\s+LIMIT|BUY\s+STOP|SELL\s+STOP|LIMIT|STOP|PENDING)\b/i.test(
      notesStr
    );
    const status: 'PLANNED' | 'ACTIVE' | 'CLOSED' =
      rawStatusStr === 'CLOSED'
        ? 'CLOSED'
        : rawStatusStr === 'PLANNED' || hasPendingKeyword || source === 'TRADINGVIEW'
        ? 'PLANNED'
        : rawStatusStr === 'ACTIVE'
        ? 'ACTIVE'
        : 'PLANNED';

    // Normalize numeric values with robust parseNumericValue (supports "4.054,405" -> 4054.405)
    let entryPrice = parseNumericValue(parsedData.entryPrice, cleanInstrument);
    let stopLoss = parseNumericValue(parsedData.stopLoss, cleanInstrument);
    let takeProfit = parseNumericValue(parsedData.takeProfit, cleanInstrument);
    const exitPrice = parseNumericValue(parsedData.exitPrice, cleanInstrument);
    const profit = parseNumericValue(parsedData.profit, 'EURUSD');
    const rawLotSize = parseNumericValue(parsedData.lotSize, 'EURUSD');
    // Strictly return lotSize ONLY for MT5 (for TradingView, lotSize must be null so client uses standard Equity Auto-Lot)
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

    // Enforce strict BUY / SELL directional order when all 3 real prices are present (NO synthetic SL/TP calculations!)
    if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
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

    // Reject tiny micro-noise or invalid SL/TP (< minDistance, e.g. 0.04 on XAUUSD) -> return null so user can fill manually
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

    res.json({
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
        notes: parsedData.notes || '',
        modelUsed: usedModel || 'gemini-2.5-flash',
      },
    });
  } catch (error: any) {
    console.error('Error in /api/extract-trade-screenshot:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan saat memproses gambar analisis.',
    });
  }
});

// ============================================================================
// TRADE NEWS & MACRO BIAS (XAU/USD) — ISOLATED QUOTA & FREE PUBLIC DATA FEEDER
// ============================================================================

const newsQuotaCooldownUntilByModel = new Map<string, number>();
let cachedMacroFeeds: {
  fetchedAt: number;
  calendarEvents: MacroCalendarEvent[];
  intermarketPulse: {
    dxy: IntermarketAssetPulse;
    usoil: IntermarketAssetPulse;
    us10y: IntermarketAssetPulse;
  };
  breakingNews: BreakingNewsHeadline[];
} | null = null;

let lastServerMacroSnapshot: MacroNewsSnapshot | null = null;

function getFallbackCalendarEvents(): MacroCalendarEvent[] {
  const now = new Date();
  const baseIso = now.toISOString().slice(0, 11);
  const rawSchedule = [
    {
      title: 'US Core CPI m/m',
      country: 'USD',
      date: `${baseIso}12:30:00.000Z`,
      impact: 'High' as const,
      previous: '0.3%',
      forecast: '0.2%',
      actual: '',
    },
    {
      title: 'US CPI y/y',
      country: 'USD',
      date: `${baseIso}12:30:00.000Z`,
      impact: 'High' as const,
      previous: '2.6%',
      forecast: '2.5%',
      actual: '',
    },
    {
      title: 'US Initial Jobless Claims',
      country: 'USD',
      date: `${baseIso}13:30:00.000Z`,
      impact: 'High' as const,
      previous: '221K',
      forecast: '215K',
      actual: '212K',
    },
    {
      title: 'US Non-Farm Employment Change (NFP)',
      country: 'USD',
      date: `${baseIso}13:30:00.000Z`,
      impact: 'High' as const,
      previous: '185K',
      forecast: '190K',
      actual: '228K',
    },
    {
      title: 'US Unemployment Rate',
      country: 'USD',
      date: `${baseIso}13:30:00.000Z`,
      impact: 'High' as const,
      previous: '4.1%',
      forecast: '4.1%',
      actual: '4.0%',
    },
    {
      title: 'US Average Hourly Earnings m/m',
      country: 'USD',
      date: `${baseIso}13:30:00.000Z`,
      impact: 'Medium' as const,
      previous: '0.3%',
      forecast: '0.3%',
      actual: '0.4%',
    },
    {
      title: 'US ISM Services PMI',
      country: 'USD',
      date: `${baseIso}15:00:00.000Z`,
      impact: 'High' as const,
      previous: '56.0',
      forecast: '54.2',
      actual: '',
    },
    {
      title: 'US ISM Services Prices Paid',
      country: 'USD',
      date: `${baseIso}15:00:00.000Z`,
      impact: 'Medium' as const,
      previous: '68.2',
      forecast: '71.5',
      actual: '',
    },
    {
      title: 'US JOLTS Job Openings',
      country: 'USD',
      date: `${baseIso}15:00:00.000Z`,
      impact: 'High' as const,
      previous: '7.74M',
      forecast: '7.62M',
      actual: '',
    },
    {
      title: 'US Core PPI m/m',
      country: 'USD',
      date: `${baseIso}16:00:00.000Z`,
      impact: 'High' as const,
      previous: '0.2%',
      forecast: '0.3%',
      actual: '',
    },
    {
      title: 'US Core PCE Price Index m/m',
      country: 'USD',
      date: `${baseIso}17:00:00.000Z`,
      impact: 'High' as const,
      previous: '0.3%',
      forecast: '0.2%',
      actual: '',
    },
    {
      title: 'US Advance GDP q/q',
      country: 'USD',
      date: `${baseIso}18:00:00.000Z`,
      impact: 'High' as const,
      previous: '2.8%',
      forecast: '2.6%',
      actual: '',
    },
  ];

  return rawSchedule.map((item, idx) => {
    const prevParsed = parseMacroNumeric(item.previous);
    const fcstParsed = parseMacroNumeric(item.forecast);
    const actParsed = parseMacroNumeric(item.actual);
    const evalResult = evaluateSingleEventForGold(
      item.title,
      actParsed.value,
      fcstParsed.value,
      prevParsed.value
    );
    return {
      id: `ff-usd-${idx + 1}`,
      title: item.title,
      country: item.country,
      date: item.date,
      impact: item.impact,
      previous: item.previous,
      forecast: item.forecast,
      actual: item.actual,
      previousNum: prevParsed.value,
      forecastNum: fcstParsed.value,
      actualNum: actParsed.value,
      unit: fcstParsed.unit || prevParsed.unit || '',
      pillar: classifyFomcPillar(item.title),
      isInverseIndicator: isInverseUsdIndicator(item.title),
      eventBiasForGold: evalResult.bias,
      biasReasonId: evalResult.reasonId,
      biasReasonEn: evalResult.reasonEn,
    };
  });
}

async function fetchForexFactoryUsdCalendar(): Promise<MacroCalendarEvent[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return getFallbackCalendarEvents();
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) {
      return getFallbackCalendarEvents();
    }

    const filtered = rawList.filter((item: any) => isRelevantUsdMacroEvent(item));
    if (filtered.length === 0) {
      return getFallbackCalendarEvents();
    }

    return filtered.slice(0, 18).map((item: any, idx: number) => {
      const title = String(item.title || 'USD Economic Release').trim();
      const previous = String(item.previous ?? '').trim();
      const forecast = String(item.forecast ?? '').trim();
      const actual = String(item.actual ?? '').trim();

      const prevParsed = parseMacroNumeric(previous);
      const fcstParsed = parseMacroNumeric(forecast);
      const actParsed = parseMacroNumeric(actual);

      const evalResult = evaluateSingleEventForGold(
        title,
        actParsed.value,
        fcstParsed.value,
        prevParsed.value
      );

      const rawImpact = String(item.impact || 'Medium');
      const impact: 'High' | 'Medium' | 'Low' =
        rawImpact === 'High' ? 'High' : rawImpact === 'Low' ? 'Low' : 'Medium';

      let isoDate = new Date().toISOString();
      if (item.date) {
        try {
          const parsed = new Date(item.date);
          if (!isNaN(parsed.getTime())) {
            isoDate = parsed.toISOString();
          }
        } catch {
          isoDate = String(item.date);
        }
      }

      return {
        id: `ff-${idx + 1}-${title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
        title,
        country: 'USD',
        date: isoDate,
        impact,
        previous: previous || '-',
        forecast: forecast || '-',
        actual: actual || '',
        previousNum: prevParsed.value,
        forecastNum: fcstParsed.value,
        actualNum: actParsed.value,
        unit: fcstParsed.unit || prevParsed.unit || actParsed.unit || '',
        pillar: classifyFomcPillar(title),
        isInverseIndicator: isInverseUsdIndicator(title),
        eventBiasForGold: evalResult.bias,
        biasReasonId: evalResult.reasonId,
        biasReasonEn: evalResult.reasonEn,
        isLiveFeed: true,
      };
    });
  } catch {
    return getFallbackCalendarEvents();
  }
}

async function fetchYahooAssetPulse(
  symbol: 'DXY' | 'USOIL' | 'US10Y',
  yahooTicker: string,
  name: string,
  fallbackPrice: number,
  fallbackPrevClose: number
): Promise<IntermarketAssetPulse> {
  let price = fallbackPrice;
  let previousClose = fallbackPrevClose;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const encodedTicker = encodeURIComponent(yahooTicker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=15m&range=5d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta) {
        const regPrice = Number(meta.regularMarketPrice);
        const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
        if (Number.isFinite(regPrice) && regPrice > 0) {
          price = regPrice;
        }
        if (Number.isFinite(prev) && prev > 0) {
          previousClose = prev;
        }
      }
    }
  } catch {
    // Use fallback values
  }

  const change = Number((price - previousClose).toFixed(3));
  const changePercent =
    previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;

  const direction: 'UP' | 'DOWN' | 'FLAT' =
    changePercent > 0.03 ? 'UP' : changePercent < -0.03 ? 'DOWN' : 'FLAT';

  let goldCorrelationEffect: IntermarketAssetPulse['goldCorrelationEffect'] = 'NEUTRAL';
  let summaryId = '';
  let summaryEn = '';

  if (symbol === 'DXY') {
    goldCorrelationEffect =
      direction === 'UP' ? 'BEARISH_GOLD' : direction === 'DOWN' ? 'BULLISH_GOLD' : 'NEUTRAL';
    summaryId =
      direction === 'UP'
        ? 'Dolar AS menguat → Tekanan korelasi negatif (SELL XAU/USD)'
        : direction === 'DOWN'
        ? 'Dolar AS melemah → Dukungan korelasi positif (BUY XAU/USD)'
        : 'DXY bergerak mendatar menjelang rilis data';
    summaryEn =
      direction === 'UP'
        ? 'US Dollar strengthening → Inverse headwind (SELL XAU/USD)'
        : direction === 'DOWN'
        ? 'US Dollar softening → Inverse tailwind (BUY XAU/USD)'
        : 'DXY consolidating ahead of macro release';
  } else if (symbol === 'US10Y') {
    goldCorrelationEffect =
      direction === 'UP' ? 'BEARISH_GOLD' : direction === 'DOWN' ? 'BULLISH_GOLD' : 'NEUTRAL';
    summaryId =
      direction === 'UP'
        ? 'Imbal hasil Treasury 10Y naik → Konfirmasi tekanan SELL XAU/USD'
        : direction === 'DOWN'
        ? 'Imbal hasil Treasury 10Y turun → Konfirmasi dorongan BUY XAU/USD'
        : 'Yield 10Y stabil menunggu katalis Fed';
    summaryEn =
      direction === 'UP'
        ? '10Y Treasury Yield rising → Confirms SELL XAU/USD pressure'
        : direction === 'DOWN'
        ? '10Y Treasury Yield falling → Confirms BUY XAU/USD support'
        : '10Y Yield flat awaiting Fed catalyst';
  } else {
    // USOIL Dual-Channel Rule
    goldCorrelationEffect =
      changePercent >= 1.0
        ? 'BEARISH_GOLD'
        : changePercent <= -1.0
        ? 'BULLISH_GOLD'
        : 'NEUTRAL';
    summaryId =
      changePercent >= 1.0
        ? 'Oil melonjak → Inflation Channel (Fed Hawkish / Tekanan SELL Gold)'
        : changePercent <= -1.0
        ? 'Oil melandai → Tekanan inflasi energi mereda (Dukungan BUY Gold)'
        : 'Harga WTI stabil; pantau eskalasi Selat Hormuz / Timur Tengah';
    summaryEn =
      changePercent >= 1.0
        ? 'Oil surging → Inflation Channel active (Hawkish Fed / SELL Gold)'
        : changePercent <= -1.0
        ? 'Oil cooling → Energy inflation pressure eases (BUY Gold support)'
        : 'WTI Crude stable; monitor Strait of Hormuz / Middle East headlines';
  }

  return {
    symbol,
    yahooTicker,
    name,
    price: Number(price.toFixed(2)),
    previousClose: Number(previousClose.toFixed(2)),
    change,
    changePercent,
    direction,
    goldCorrelationEffect,
    summaryId,
    summaryEn,
    updatedAt: new Date().toISOString(),
  };
}

function parseRssXmlItems(
  xmlText: string,
  sourceName: string
): Array<{ title: string; source: string; pubDate: string; link?: string }> {
  const items: Array<{ title: string; source: string; pubDate: string; link?: string }> = [];
  if (!xmlText) return items;

  const itemMatches = xmlText.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemMatches.slice(0, 35)) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pubDateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (titleMatch && titleMatch[1]) {
      items.push({
        title: titleMatch[1],
        source: sourceName,
        pubDate: pubDateMatch?.[1]?.trim() || new Date().toISOString(),
        link: linkMatch?.[1]?.trim(),
      });
    }
  }
  return items;
}

function getFallbackBreakingHeadlines(): BreakingNewsHeadline[] {
  return filterAndScoreBreakingHeadlines([
    {
      title:
        'Fed Governor Waller: Sticky core inflation and strong NFP labor data mean Fed is in no rush to cut rates; upside inflation risks remain on the table',
      source: 'FinancialJuice Macro Wire',
      pubDate: new Date().toISOString(),
    },
    {
      title:
        'Middle East & Strait of Hormuz shipping alert pushes US Oil WTI higher, stoking energy CPI inflation pass-through concerns ahead of FOMC',
      source: 'FXStreet Institutional Desk',
      pubDate: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    },
    {
      title:
        'US Tariff policy review and Powell FOMC forward guidance in focus as FedWatch prices 92% probability on near-term rate hold',
      source: 'FinancialJuice Macro Wire',
      pubDate: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    },
  ]);
}

async function fetchPublicBreakingHeadlines(): Promise<BreakingNewsHeadline[]> {
  const feeds = [
    { url: 'https://www.financialjuice.com/feed.ashx?xy=rss', source: 'FinancialJuice' },
    { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet' },
  ];

  try {
    const responses = await Promise.allSettled(
      feeds.map(async (f) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const res = await fetch(f.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssXmlItems(xml, f.source);
      })
    );

    const combined: Array<{ title: string; source: string; pubDate: string; link?: string }> = [];
    for (const r of responses) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        combined.push(...r.value);
      }
    }

    const filtered = filterAndScoreBreakingHeadlines(combined);
    if (filtered.length > 0) {
      return filtered;
    }
    return getFallbackBreakingHeadlines();
  } catch {
    return getFallbackBreakingHeadlines();
  }
}

async function gatherMacroPublicFeeds(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedMacroFeeds &&
    Date.now() - cachedMacroFeeds.fetchedAt < 5 * 60 * 1000
  ) {
    return cachedMacroFeeds;
  }

  const [calendarEvents, dxy, usoil, us10y, breakingNews] = await Promise.all([
    fetchForexFactoryUsdCalendar(),
    fetchYahooAssetPulse('DXY', 'DX-Y.NYB', 'US Dollar Index (DXY)', 104.85, 104.42),
    fetchYahooAssetPulse('USOIL', 'CL=F', 'US Oil WTI Crude', 73.4, 71.95),
    fetchYahooAssetPulse('US10Y', '^TNX', 'US 10Y Treasury Yield', 4.38, 4.31),
    fetchPublicBreakingHeadlines(),
  ]);

  cachedMacroFeeds = {
    fetchedAt: Date.now(),
    calendarEvents,
    intermarketPulse: { dxy, usoil, us10y },
    breakingNews,
  };

  return cachedMacroFeeds;
}

// Passive public feed check endpoint (0 Gemini tokens consumed)
app.get('/api/macro-news/feeds', async (_req, res) => {
  try {
    const feeds = await gatherMacroPublicFeeds(false);
    const deterministicSnap = computeDeterministicMacroSnapshot({
      calendarEvents: feeds.calendarEvents,
      intermarketPulse: feeds.intermarketPulse,
      breakingNews: feeds.breakingNews,
      sourceMode: lastServerMacroSnapshot ? lastServerMacroSnapshot.sourceMode : 'RULE_BASED_FALLBACK',
      modelUsed: lastServerMacroSnapshot ? lastServerMacroSnapshot.modelUsed : 'deterministic-playbook-v1',
    });

    res.json({
      success: true,
      dataFingerprint: deterministicSnap.dataFingerprint,
      snapshot:
        lastServerMacroSnapshot &&
        lastServerMacroSnapshot.dataFingerprint === deterministicSnap.dataFingerprint &&
        isSnapshotFresh(lastServerMacroSnapshot, 30)
          ? lastServerMacroSnapshot
          : deterministicSnap,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal mengambil feed makro publik.',
    });
  }
});

// Full Macro News & Pre-News Scenario Matrix Analyzer
app.post('/api/macro-news/analyze', async (req, res) => {
  try {
    const {
      forceRefresh = false,
      selectedEventId,
      clientFeeds,
    } = (req.body || {}) as {
      forceRefresh?: boolean;
      selectedEventId?: string;
      clientFeeds?: {
        calendarEvents?: MacroCalendarEvent[];
        intermarketPulse?: {
          dxy: IntermarketAssetPulse;
          usoil: IntermarketAssetPulse;
          us10y: IntermarketAssetPulse;
        };
        breakingNews?: BreakingNewsHeadline[];
      };
    };

    let feeds: {
      calendarEvents: MacroCalendarEvent[];
      intermarketPulse: {
        dxy: IntermarketAssetPulse;
        usoil: IntermarketAssetPulse;
        us10y: IntermarketAssetPulse;
      };
      breakingNews: BreakingNewsHeadline[];
    };

    if (
      clientFeeds &&
      Array.isArray(clientFeeds.calendarEvents) &&
      clientFeeds.calendarEvents.length > 0 &&
      clientFeeds.intermarketPulse?.dxy
    ) {
      feeds = {
        calendarEvents: clientFeeds.calendarEvents,
        intermarketPulse: clientFeeds.intermarketPulse,
        breakingNews: clientFeeds.breakingNews || [],
      };
    } else {
      feeds = await gatherMacroPublicFeeds(Boolean(forceRefresh));
    }

    // Step 1: Always compute the deterministic Master Playbook baseline first
    const baselineSnapshot = computeDeterministicMacroSnapshot({
      calendarEvents: feeds.calendarEvents,
      intermarketPulse: feeds.intermarketPulse,
      breakingNews: feeds.breakingNews,
      selectedEventId,
      sourceMode: 'RULE_BASED_FALLBACK',
      modelUsed: 'deterministic-playbook-v1',
    });

    // Step 2: If not forced and we already have a fresh server AI snapshot (< 30 mins) with matching fingerprint & event, return it (0 Gemini tokens)
    if (
      !forceRefresh &&
      lastServerMacroSnapshot &&
      isSnapshotFresh(lastServerMacroSnapshot, 30) &&
      lastServerMacroSnapshot.dataFingerprint === baselineSnapshot.dataFingerprint &&
      (!selectedEventId ||
        lastServerMacroSnapshot.scenarioMatrix.primaryEvent.id === selectedEventId)
    ) {
      res.json({
        success: true,
        cached: true,
        snapshot: lastServerMacroSnapshot,
      });
      return;
    }

    // Step 3: Isolated API Key Lookup (GEMINI_NEWS_API_KEY -> fallback GEMINI_API_KEY)
    const newsApiKey = (
      process.env.GEMINI_NEWS_API_KEY ||
      process.env.GEMINI_API_KEY ||
      ''
    ).trim();

    if (!newsApiKey) {
      lastServerMacroSnapshot = baselineSnapshot;
      res.json({
        success: true,
        fallbackUsed: true,
        snapshot: baselineSnapshot,
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: newsApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];

    const promptPayload = {
      primaryEvent: baselineSnapshot.scenarioMatrix.primaryEvent,
      simultaneousEvents: baselineSnapshot.scenarioMatrix.simultaneousEvents,
      intermarketPulse: {
        dxy: {
          price: feeds.intermarketPulse.dxy.price,
          changePercent: feeds.intermarketPulse.dxy.changePercent,
          direction: feeds.intermarketPulse.dxy.direction,
        },
        usoil: {
          price: feeds.intermarketPulse.usoil.price,
          changePercent: feeds.intermarketPulse.usoil.changePercent,
          direction: feeds.intermarketPulse.usoil.direction,
        },
        us10y: {
          price: feeds.intermarketPulse.us10y.price,
          changePercent: feeds.intermarketPulse.us10y.changePercent,
          direction: feeds.intermarketPulse.us10y.direction,
        },
      },
      breakingHeadlines: feeds.breakingNews.slice(0, 10).map((h) => ({
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
      },
    };

    let aiResponseText = '';
    let usedModel = '';

    for (const model of candidateModels) {
      const cooldownUntil = newsQuotaCooldownUntilByModel.get(model) || 0;
      if (Date.now() < cooldownUntil) continue;

      try {
        const response = await ai.models.generateContent({
          model,
          contents: `Analyze this real-time XAU/USD macro dataset and return the structured JSON Scenario Matrix in both Bahasa Indonesia (Id) and English (En):\n${JSON.stringify(
            promptPayload
          )}`,
          config: {
            systemInstruction: XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                impactLevel: {
                  type: Type.STRING,
                  description: 'HIGH, MEDIUM, or LOW',
                },
                dominantBias: {
                  type: Type.STRING,
                  description: 'BUY, SELL, or MIXED',
                },
                buyProbability: {
                  type: Type.INTEGER,
                  description: 'Estimated BUY XAU/USD probability percentage (0-100)',
                },
                sellProbability: {
                  type: Type.INTEGER,
                  description: 'Estimated SELL XAU/USD probability percentage (0-100)',
                },
                mixedProbability: {
                  type: Type.INTEGER,
                  description: 'Estimated MIXED/WHIPSAW probability percentage (0-100)',
                },
                dynamicPivotTriggered: {
                  type: Type.BOOLEAN,
                  description: 'True if Dynamic Pivot Rule (Aturan Pindah Haluan) flipped bias to 1-Way SELL',
                },
                topBreakingEvalId: {
                  type: Type.STRING,
                  description: 'Concise Bahasa Indonesia AI evaluation of the top breaking news headline',
                },
                topBreakingEvalEn: {
                  type: Type.STRING,
                  description: 'Concise English AI evaluation of the top breaking news headline',
                },
                finalTakeId: {
                  type: Type.STRING,
                  description: 'Decisive Bahasa Indonesia final conclusion for XAU/USD based on the 3 FOMC Pillars and Intermarket correlation',
                },
                finalTakeEn: {
                  type: Type.STRING,
                  description: 'Decisive English final conclusion for XAU/USD based on the 3 FOMC Pillars and Intermarket correlation',
                },
                actionPlanId: {
                  type: Type.STRING,
                  description: 'Step-by-step tactical execution plan in Bahasa Indonesia',
                },
                actionPlanEn: {
                  type: Type.STRING,
                  description: 'Step-by-step tactical execution plan in English',
                },
                whipsawWarningId: {
                  type: Type.STRING,
                  description: 'Whipsaw / fake move risk warning in Bahasa Indonesia',
                },
                whipsawWarningEn: {
                  type: Type.STRING,
                  description: 'Whipsaw / fake move risk warning in English',
                },
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
        const msg = err?.message || String(err);
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Quota exceeded')
        ) {
          newsQuotaCooldownUntilByModel.set(model, Date.now() + 30 * 60 * 1000);
          continue;
        }
        break;
      }
    }

    // If Gemini hit 429 or failed, silently return the deterministic rule-based snapshot (zero user-facing error)
    if (!aiResponseText) {
      lastServerMacroSnapshot = baselineSnapshot;
      res.json({
        success: true,
        fallbackUsed: true,
        snapshot: baselineSnapshot,
      });
      return;
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

    const enrichedSnapshot: MacroNewsSnapshot = {
      ...baselineSnapshot,
      sourceMode: 'GEMINI_AI',
      modelUsed: usedModel || 'gemini-2.5-flash',
      impactLevel,
      dominantBias,
      topBreakingAlert: updatedTopAlert,
      scenarioMatrix: {
        ...baselineSnapshot.scenarioMatrix,
        buyProbability: buyProb,
        sellProbability: sellProb,
        mixedProbability: mixedProb,
        dominantBias,
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
        t5ExecutionTacticId,
        t5ExecutionTacticEn,
        isStrongOneWayBias,
      },
    };

    lastServerMacroSnapshot = enrichedSnapshot;

    res.json({
      success: true,
      fallbackUsed: false,
      snapshot: enrichedSnapshot,
    });
  } catch (err: any) {
    // Even on unexpected server error, return deterministic fallback so the user never sees an error screen
    const fallbackFeeds = await gatherMacroPublicFeeds(false);
    const fallbackSnap = computeDeterministicMacroSnapshot({
      calendarEvents: fallbackFeeds.calendarEvents,
      intermarketPulse: fallbackFeeds.intermarketPulse,
      breakingNews: fallbackFeeds.breakingNews,
      sourceMode: 'RULE_BASED_FALLBACK',
      modelUsed: 'deterministic-playbook-v1',
    });
    res.json({
      success: true,
      fallbackUsed: true,
      snapshot: fallbackSnap,
    });
  }
});

// Vite dev server vs Production static server
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[TradeVault Server] Running at http://localhost:${PORT}`);
});
