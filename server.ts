import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

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
