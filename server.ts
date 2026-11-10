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

interface CanvasHintsPayload {
  hasPositionBox?: boolean;
  inferredPosition?: 'BUY' | 'SELL' | null;
  inferredRR?: number | null;
  entryYRatio?: number | null;
  tpYRatio?: number | null;
  slYRatio?: number | null;
  rightAxisGreenBadgeYRatio?: number | null;
  rightAxisRedBadgeYRatio?: number | null;
  rightAxisBlueOrDarkBadgeYRatio?: number | null;
}

interface ExtractScreenshotRequest {
  imageBase64?: string;
  imageUrl?: string;
  canvasHints?: CanvasHintsPayload | null;
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

function parseNumericValue(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;

    // Check if string contains contextual prefix e.g. "at 96,250", "@ 1.0852", "entry: 2650"
    const contextualMatch = s.match(
      /(?:at|@|entry[:\s]|open[:\s]|price[:\s]|level[:\s])\s*([+-]?[0-9][0-9, ]*(?:\.[0-9]+)?)/i
    );
    if (contextualMatch) {
      const cleaned = contextualMatch[1].replace(/[, ]/g, '').trim();
      const num = parseFloat(cleaned);
      if (!isNaN(num)) return num;
    }

    // Extract first valid numerical sequence
    const match = s.match(/[-+]?[0-9][0-9, ]*(?:\.[0-9]+)?/);
    if (!match) return null;
    const cleaned = match[0].replace(/[, ]/g, '').trim();
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
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
  const extractNum = (key: string): number | null => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"?([^",}\\r\\n]+)"?`, 'i'));
    if (m) {
      return parseNumericValue(m[1]);
    }
    return null;
  };
  const extractStr = (key: string): string | null => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\r\\n]*)"`, 'i'));
    return m ? m[1].trim() : null;
  };
  const extractBool = (key: string): boolean => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`, 'i'));
    return m ? m[1].toLowerCase() === 'true' : true;
  };

  return {
    detected: extractBool('detected'),
    source: extractStr('source') || 'MT5',
    instrument: extractStr('instrument') || 'XAUUSD',
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

// AI Vision Endpoint: Extract trade data from chart screenshot
app.post('/api/extract-trade-screenshot', async (req, res) => {
  try {
    const { imageBase64, imageUrl } = req.body as ExtractScreenshotRequest;

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
      const match = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = imageBase64;
      }
    } else if (imageUrl) {
      const fetched = await fetchImageBufferFromUrl(imageUrl);
      mimeType = fetched.mimeType;
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

    const prompt = `You are an elite financial trade OCR specialist for MetaTrader 5 (MT5), MetaTrader 4 (MT4), and TradingView charts.
Carefully inspect the chart screenshot to identify the exact pair/instrument, entry price, stop loss, take profit, lot size, direction, and trade status.

1. INSTRUMENT / PAIR IDENTIFICATION (CRITICAL - DO NOT DEFAULT TO XAUUSD UNLESS IT IS TRULY GOLD):
   - You MUST read the exact symbol shown on the chart:
     * MT5: Look at the chart title tab or top-left corner (e.g. "BTCUSD, H1", "EURUSD, M15", "XAUUSD, M5", "GBPUSD, Daily"), background watermark, or terminal symbol column.
     * TradingView: Look at the top-left symbol ticker (e.g. "BTCUSDT", "BINANCE:BTCUSD", "FX:EURUSD", "OANDA:XAUUSD", "GBPUSD"), or large background watermark.
     * Recognize the pair accurately:
       - Crypto: BTCUSD, BTCUSDT, ETHUSD, SOLUSD
       - Commodities: XAUUSD (Gold), XAGUSD (Silver)
       - Forex: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, EURGBP, GBPJPY
       - Indices: US30, NAS100, SPX500, GER40
   - Strip broker prefixes/suffixes so instrument is cleanly e.g. "BTCUSD", "EURUSD", "XAUUSD".

2. ENTRY PRICE (CRITICAL - MANDATORY, DO NOT RETURN NULL):
   Every trade has an entry execution price. You must search all of the following locations:
   - MT5 / MT4:
     * HORIZONTAL ORDER LINE: An open order is shown as a horizontal dashed line across the candles with a label like "#12345678 sell 0.10" or "sell 0.10" or "buy 0.10". Follow this horizontal dashed line to the RIGHT-SIDE Y-AXIS PRICE SCALE: read the exact numerical price badge or level at this line!
     * ORDER LINE TEXT: Some brokers show text right on the line, e.g. "sell 0.10 at 96250.00" or "at 96,250.00" or "@ 1.08520".
     * EXECUTION ARROW: MT5 marks the entry candle with a small colored triangle arrow (red down-arrow for SELL, blue up-arrow for BUY). Read the price level where this arrow points.
     * MOBILE APP TOP BANNER: In MT5 Mobile, the top card or header displays "sell 0.10 at 96 250.00 -> 95 800.00". The first price after "at" is the Entry Price!
     * TERMINAL TRADE TAB: In the bottom table, look at columns: Type | Volume | Price. The first "Price" column is the Entry Price!
     * RELATIVE POSITION SANITY:
       - For SELL: Entry Price is strictly BETWEEN Stop Loss and Take Profit (takeProfit < entryPrice < stopLoss).
       - For BUY: Entry Price is strictly BETWEEN Stop Loss and Take Profit (stopLoss < entryPrice < takeProfit).
   - TRADINGVIEW:
     * LONG / SHORT POSITION TOOL: The green and red risk/reward box. The CENTRAL HORIZONTAL DIVIDING LINE between the green profit zone and red stop loss zone IS THE ENTRY PRICE! Read the exact price tag on the right-hand Y-axis at this middle dividing line, or read "Open: <price>" / "Entry: <price>" from the center box.
     * BROKER / PAPER TRADING ORDER LINE: Horizontal line with "Buy <lot> @ <price>" or "Sell <lot> @ <price>". The number after "@" is the Entry Price.

3. STOP LOSS (SL) & TAKE PROFIT (TP):
   - MT5:
     * Stop Loss (SL): Red or grey dashed horizontal line labeled "sl", "s/l", "sl <price>", or highlighted in a red badge on the right price scale.
     * Take Profit (TP): Red, green, or grey dashed horizontal line labeled "tp", "t/p", "tp <price>", or highlighted in a badge on the right price scale.
     * For SELL: SL is strictly ABOVE entry price. TP is strictly BELOW entry price.
     * For BUY: SL is strictly BELOW entry price. TP is strictly ABOVE entry price.
   - TRADINGVIEW:
     * Stop Loss: The outer horizontal line of the red box, labeled "Stop: <price>" or red tag on the price axis.
     * Take Profit: The outer horizontal line of the green box, labeled "Target: <price>" or green tag on the price axis.

4. LOT SIZE / VOLUME & POSITION DIRECTION:
   - Identify BUY (Long) or SELL (Short).
   - Volume / Lot size: Look for "0.10", "0.05", "1.00", "sell 0.10", "buy 0.05", or "Volume: 0.10".

5. CRYPTO & FOREX NUMBERS:
   - BTCUSD prices are 5-6 digits (e.g. 80,000 to 110,000, like 96450.00). MT5 may show spaces or commas ("96 450.00" or "96,450.00"). Output clean numbers.
   - EURUSD prices are 1.0xxxx to 1.1xxxx (5 decimals).
   - XAUUSD prices are 2600.00 to 2900.00.

STRICT OUTPUT JSON FORMAT:
{
  "detected": true,
  "source": "MT5" | "TRADINGVIEW" | "CHART",
  "instrument": "BTCUSD" | "EURUSD" | "XAUUSD" | "GBPUSD" | string,
  "position": "BUY" | "SELL",
  "lotSize": number or null (e.g. 0.10),
  "entryPrice": number (MANDATORY: entry line price on right axis, 'at <price>', or TradingView middle dividing line),
  "stopLoss": number or null (SL dashed line, label, or right axis badge),
  "takeProfit": number or null (TP dashed line, label, or right axis badge),
  "exitPrice": number or null,
  "profit": number or null,
  "plannedRiskReward": number or null,
  "timeframe": string or null,
  "currentPrice": number or null,
  "status": "ACTIVE" | "CLOSED" | "PLANNED",
  "notes": string
}`;

    // Prioritize ultra-fast low-latency Flash-Lite model first
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let lastError: any = null;
    let responseText = '';
    let usedModel = '';

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[AI Vision] Fast scanning with ${model} (attempt ${attempt})...`);
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
                  detected: { type: Type.BOOLEAN, description: 'True if trade setup or order lines are detected' },
                  source: { type: Type.STRING, description: 'MT5, TRADINGVIEW, or CHART' },
                  instrument: { type: Type.STRING, description: 'Clean instrument symbol, e.g. BTCUSD, EURUSD, XAUUSD, GBPUSD, USDJPY, US30, NAS100' },
                  position: { type: Type.STRING, description: 'BUY or SELL' },
                  lotSize: { type: Type.NUMBER, description: 'Lot size / volume (e.g. 0.01, 0.10, 1.00)' },
                  entryPrice: { type: Type.NUMBER, description: 'Mandatory entry execution price. Look for horizontal entry order line, ticket label, price scale tag, or TradingView middle divider line' },
                  stopLoss: { type: Type.NUMBER, description: 'Stop loss price level (red dashed line, SL label, or price axis badge)' },
                  takeProfit: { type: Type.NUMBER, description: 'Take profit price level (green/red dashed line, TP label, or price axis badge)' },
                  exitPrice: { type: Type.NUMBER, description: 'Close/exit price if trade is closed' },
                  profit: { type: Type.NUMBER, description: 'Floating or closed profit/loss amount' },
                  plannedRiskReward: { type: Type.NUMBER, description: 'Risk/Reward ratio number (e.g. 2.0 for 1:2 RR)' },
                  timeframe: { type: Type.STRING, description: 'Chart timeframe (e.g. M1, M5, M15, H1, H4, D1)' },
                  currentPrice: { type: Type.NUMBER, description: 'Current market price on the right price scale' },
                  status: { type: Type.STRING, description: 'ACTIVE, CLOSED, or PLANNED' },
                  notes: { type: Type.STRING, description: 'Brief visual observations and price readings' },
                },
                required: ['detected', 'instrument', 'position'],
              },
            },
          });

          if (response && response.text) {
            responseText = response.text;
            usedModel = model;
            console.log(`[AI Vision] Fast scan success with model: ${model}`);
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const isHighDemandOrOverload =
            errMsg.includes('503') ||
            errMsg.includes('high demand') ||
            errMsg.includes('overloaded') ||
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('500');

          console.warn(`[AI Vision] ${model} attempt ${attempt} error: ${errMsg}`);

          if (isHighDemandOrOverload && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          break;
        }
      }
      if (responseText) break;
    }

    if (!responseText) {
      throw (
        lastError ||
        new Error(
          'Model AI sedang mengalami lonjakan antrean sementara. Silakan klik Scan AI sekali lagi.'
        )
      );
    }

    const parsedData = parseAiJsonResponse(responseText);

    // Normalize instrument name & strip broker suffixes
    const cleanInstrument = normalizeInstrument(parsedData.instrument);

    // Normalize position
    let cleanPosition: 'BUY' | 'SELL' = parsedData.position === 'SELL' ? 'SELL' : 'BUY';

    // Source detection
    const source: 'MT5' | 'TRADINGVIEW' | 'CHART' =
      parsedData.source === 'MT5'
        ? 'MT5'
        : parsedData.source === 'TRADINGVIEW'
        ? 'TRADINGVIEW'
        : 'CHART';

    // Lifecycle status detection
    const status: 'PLANNED' | 'ACTIVE' | 'CLOSED' =
      parsedData.status === 'CLOSED'
        ? 'CLOSED'
        : parsedData.status === 'ACTIVE'
        ? 'ACTIVE'
        : 'PLANNED';

    // Normalize numeric values with robust parseNumericValue
    let entryPrice = parseNumericValue(parsedData.entryPrice);
    let stopLoss = parseNumericValue(parsedData.stopLoss);
    let takeProfit = parseNumericValue(parsedData.takeProfit);
    const exitPrice = parseNumericValue(parsedData.exitPrice);
    const profit = parseNumericValue(parsedData.profit);
    const rawLotSize = parseNumericValue(parsedData.lotSize);
    // Strictly return lotSize ONLY for MT5 (for TradingView, lotSize must be null so client uses standard Equity Auto-Lot)
    const lotSize = source === 'MT5' && rawLotSize !== null && rawLotSize > 0 ? rawLotSize : null;
    let plannedRR = parseNumericValue(parsedData.plannedRiskReward);
    const currentPrice = parseNumericValue(parsedData.currentPrice);

    // Precision decimals based on instrument
    const decimals =
      cleanInstrument === 'BTCUSD' ||
      cleanInstrument === 'ETHUSD' ||
      cleanInstrument === 'XAUUSD' ||
      cleanInstrument.includes('JPY') ||
      cleanInstrument.includes('30') ||
      cleanInstrument.includes('100')
        ? 2
        : 5;

    // Mathematical Derivation Fallback 1: If entryPrice is null, but SL, TP, and plannedRR are known
    if (entryPrice === null && stopLoss !== null && takeProfit !== null && plannedRR !== null && plannedRR > 0) {
      if (cleanPosition === 'SELL') {
        entryPrice = parseFloat(((plannedRR * stopLoss + takeProfit) / (1 + plannedRR)).toFixed(decimals));
      } else {
        entryPrice = parseFloat(((takeProfit + plannedRR * stopLoss) / (1 + plannedRR)).toFixed(decimals));
      }
    }

    // Mathematical Derivation Fallback 2: If entryPrice is still null, but currentPrice lies strictly between SL and TP for an active trade
    if (entryPrice === null && currentPrice !== null && stopLoss !== null && takeProfit !== null) {
      const minBound = Math.min(stopLoss, takeProfit);
      const maxBound = Math.max(stopLoss, takeProfit);
      if (minBound < currentPrice && currentPrice < maxBound) {
        entryPrice = parseFloat(currentPrice.toFixed(decimals));
      }
    }

    // Enforce strict BUY / SELL directional consistency when Entry, SL, and TP are all present
    if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
      if (cleanPosition === 'BUY' && stopLoss > takeProfit) {
        const tmp = stopLoss;
        stopLoss = takeProfit;
        takeProfit = tmp;
      } else if (cleanPosition === 'SELL' && stopLoss < takeProfit) {
        const tmp = stopLoss;
        stopLoss = takeProfit;
        takeProfit = tmp;
      }
      if (stopLoss < entryPrice && entryPrice < takeProfit) {
        cleanPosition = 'BUY';
      } else if (takeProfit < entryPrice && entryPrice < stopLoss) {
        cleanPosition = 'SELL';
      }
    }

    // If plannedRR is missing but entry, SL, and TP are present, calculate RR automatically
    if (plannedRR === null && entryPrice !== null && stopLoss !== null && takeProfit !== null) {
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(takeProfit - entryPrice);
      if (risk > 0) {
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
        currentPrice: parsedData.currentPrice || null,
        confidence: parsedData.confidence || 0.85,
        notes: parsedData.notes || '',
        modelUsed: usedModel || 'gemini-3.1-flash-lite',
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
