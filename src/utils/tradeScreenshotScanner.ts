import { TradePosition } from '../types/trade';
import { CHART_DRAWINGS_STORAGE_KEY, CHART_PREFS_STORAGE_KEY } from '../components/chart/MarketChartView';

export interface ExtractedTradeScanData {
  detected: boolean;
  source: 'MT5' | 'TRADINGVIEW' | 'CHART';
  instrument: string;
  position: TradePosition;
  lotSize: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  profit: number | null;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED';
  plannedRiskReward: number | null;
  timeframe: string | null;
  currentPrice: number | null;
  confidence: number;
  notes: string;
  modelUsed: string;
  resolvedImageUrl?: string;
}

export interface CanvasZoneAnalysis {
  hasPositionBox: boolean;
  inferredPosition: TradePosition | null;
  inferredRR: number | null;
  entryYRatio: number | null;
  tpYRatio: number | null;
  slYRatio: number | null;
  boxTopYRatio: number | null;
  boxBottomYRatio: number | null;
  rightAxisGreenBadgeYRatio?: number | null;
  rightAxisRedBadgeYRatio?: number | null;
  rightAxisBlueOrDarkBadgeYRatio?: number | null;
  horizontalLineYRatios?: number[];
  imageWidth: number;
  imageHeight: number;
}

export interface OcrWordBox {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerY: number;
  centerX: number;
}

export interface OcrExtractionResult {
  fullText: string;
  lines: Array<{ text: string; centerY: number; minX: number; maxX: number }>;
  words: OcrWordBox[];
}

/**
 * Valid price ranges per instrument so random timestamps/ticket numbers (e.g. #12345678, 2026, 15:00)
 * are never confused with Entry/SL/TP prices.
 */
export const INSTRUMENT_PRICE_RANGES: Record<
  string,
  { min: number; max: number; decimals: number; defaultPipStep: number }
> = {
  XAUUSD: { min: 1500, max: 6000, decimals: 2, defaultPipStep: 10 },
  XAGUSD: { min: 15, max: 80, decimals: 3, defaultPipStep: 0.4 },
  BTCUSD: { min: 15000, max: 250000, decimals: 2, defaultPipStep: 450 },
  ETHUSD: { min: 800, max: 12000, decimals: 2, defaultPipStep: 35 },
  SOLUSD: { min: 20, max: 1000, decimals: 2, defaultPipStep: 3 },
  EURUSD: { min: 0.85, max: 1.35, decimals: 5, defaultPipStep: 0.0025 },
  GBPUSD: { min: 1.05, max: 1.65, decimals: 5, defaultPipStep: 0.003 },
  AUDUSD: { min: 0.5, max: 0.95, decimals: 5, defaultPipStep: 0.002 },
  NZDUSD: { min: 0.45, max: 0.85, decimals: 5, defaultPipStep: 0.002 },
  USDCAD: { min: 1.15, max: 1.6, decimals: 5, defaultPipStep: 0.0025 },
  USDCHF: { min: 0.7, max: 1.2, decimals: 5, defaultPipStep: 0.0025 },
  EURGBP: { min: 0.7, max: 1.0, decimals: 5, defaultPipStep: 0.002 },
  USDJPY: { min: 95, max: 200, decimals: 3, defaultPipStep: 0.35 },
  EURJPY: { min: 110, max: 220, decimals: 3, defaultPipStep: 0.4 },
  GBPJPY: { min: 130, max: 250, decimals: 3, defaultPipStep: 0.45 },
  AUDJPY: { min: 70, max: 140, decimals: 3, defaultPipStep: 0.35 },
  US30: { min: 25000, max: 65000, decimals: 2, defaultPipStep: 120 },
  NAS100: { min: 10000, max: 35000, decimals: 2, defaultPipStep: 80 },
  SPX500: { min: 3000, max: 9000, decimals: 2, defaultPipStep: 25 },
  GER40: { min: 12000, max: 30000, decimals: 2, defaultPipStep: 60 },
};

/**
 * Resolves any TradingView share URL (e.g. https://www.tradingview.com/x/ABCD1234/)
 * into its direct S3 snapshot PNG image URL so both <img> preview and APK scanner work without a backend.
 */
export function resolveTradingViewSnapshotUrl(rawUrl: string): {
  isTradingViewUrl: boolean;
  directImageUrl: string;
  snapshotId: string | null;
  symbolFromUrl: string | null;
  timeframeFromUrl: string | null;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return {
      isTradingViewUrl: false,
      directImageUrl: trimmed,
      snapshotId: null,
      symbolFromUrl: null,
      timeframeFromUrl: null,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isTv = host.includes('tradingview.com');

    if (!isTv) {
      return {
        isTradingViewUrl: false,
        directImageUrl: trimmed,
        snapshotId: null,
        symbolFromUrl: null,
        timeframeFromUrl: null,
      };
    }

    let symbolFromUrl: string | null = null;
    const querySymbol = parsed.searchParams.get('symbol');
    if (querySymbol) {
      symbolFromUrl = normalizeScanInstrument(querySymbol);
    } else {
      const chartPathMatch = parsed.pathname.match(/\/chart\/([A-Za-z0-9_.:-]+)\//i);
      if (chartPathMatch && chartPathMatch[1] && chartPathMatch[1].length <= 15) {
        const candidate = chartPathMatch[1].toUpperCase();
        if (/[A-Z]{3,}/.test(candidate)) {
          symbolFromUrl = normalizeScanInstrument(candidate);
        }
      }
      const symbolsPathMatch = parsed.pathname.match(/\/symbols\/([A-Za-z0-9_.:-]+)\/?/i);
      if (symbolsPathMatch && symbolsPathMatch[1]) {
        symbolFromUrl = normalizeScanInstrument(symbolsPathMatch[1]);
      }
    }

    const queryInterval = parsed.searchParams.get('interval');
    let timeframeFromUrl: string | null = null;
    if (queryInterval) {
      timeframeFromUrl = normalizeTimeframeLabel(queryInterval);
    }

    const s3Match = parsed.pathname.match(/\/snapshots\/[a-z0-9]\/([A-Za-z0-9]+)\.(?:png|jpg|webp)/i);
    if (s3Match && s3Match[1]) {
      return {
        isTradingViewUrl: true,
        directImageUrl: trimmed,
        snapshotId: s3Match[1],
        symbolFromUrl,
        timeframeFromUrl,
      };
    }

    const xMatch = parsed.pathname.match(/\/x\/([A-Za-z0-9]+)\/?/i);
    if (xMatch && xMatch[1]) {
      const id = xMatch[1];
      const firstChar = id.charAt(0).toLowerCase();
      const directImageUrl = `https://s3.tradingview.com/snapshots/${firstChar}/${id}.png`;
      return {
        isTradingViewUrl: true,
        directImageUrl,
        snapshotId: id,
        symbolFromUrl,
        timeframeFromUrl,
      };
    }

    return {
      isTradingViewUrl: true,
      directImageUrl: trimmed,
      snapshotId: null,
      symbolFromUrl,
      timeframeFromUrl,
    };
  } catch {
    return {
      isTradingViewUrl: false,
      directImageUrl: trimmed,
      snapshotId: null,
      symbolFromUrl: null,
      timeframeFromUrl: null,
    };
  }
}

export function normalizeScanInstrument(raw: string | null | undefined): string {
  if (!raw) return 'XAUUSD';
  let s = raw.toUpperCase().trim();

  if (s.includes(':')) {
    s = s.split(':').pop() || s;
  }

  if (s.includes('GOLD') || s.includes('XAU/USD') || s.includes('XAUUSD') || s.startsWith('XAU')) return 'XAUUSD';
  if (s.includes('SILVER') || s.startsWith('XAG')) return 'XAGUSD';
  if (s.includes('BITCOIN') || s.includes('BTC/USD') || s.startsWith('BTC')) return 'BTCUSD';
  if (s.includes('ETHER') || s.includes('ETH/USD') || s.startsWith('ETH')) return 'ETHUSD';
  if (s.includes('SOLANA') || s.startsWith('SOL')) return 'SOLUSD';
  if (s.includes('DOW') || s.includes('DJI') || s.includes('US30')) return 'US30';
  if (s.includes('NAS100') || s.includes('USTEC') || s.includes('NDX') || s.includes('NASDAQ')) return 'NAS100';
  if (s.includes('SPX') || s.includes('US500') || s.includes('S&P')) return 'SPX500';
  if (s.includes('DAX') || s.includes('GER40') || s.includes('DE40')) return 'GER40';

  const KNOWN_FOREX = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
    'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY',
    'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'AUDCAD', 'AUDNZD',
    'CADCHF', 'NZDCAD', 'NZDCHF',
  ];
  const compact = s.replace(/[^A-Z0-9]/g, '');
  for (const pair of KNOWN_FOREX) {
    if (compact.includes(pair)) return pair;
  }

  s = s.replace(/(\.M|\.RAW|\.PRO|\.STD|\.ECN|\.B|_I|_SB|_C)$/i, '');
  if (s.length > 6 && (s.endsWith('C') || s.endsWith('M'))) {
    s = s.slice(0, -1);
  }
  s = s.replace(/[^A-Z0-9]/g, '');

  return INSTRUMENT_PRICE_RANGES[s] ? s : 'XAUUSD';
}

function normalizeTimeframeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();
  if (s === '1' || s === '1M' || s === 'M1') return 'M1';
  if (s === '3' || s === '3M' || s === 'M3') return 'M3';
  if (s === '5' || s === '5M' || s === 'M5') return 'M5';
  if (s === '15' || s === '15M' || s === 'M15') return 'M15';
  if (s === '30' || s === '30M' || s === 'M30') return 'M30';
  if (s === '60' || s === '1H' || s === 'H1') return 'H1';
  if (s === '240' || s === '4H' || s === 'H4') return 'H4';
  if (s === 'D' || s === '1D' || s === 'D1' || s === 'DAILY') return 'D1';
  return null;
}

/**
 * Safe JSON fetch that NEVER throws `Unexpected token '<', "<!doctype"... is not valid JSON`
 * when Capacitor's local Android WebView server returns `index.html` for `/api/*` routes.
 */
async function safeFetchApiJson(
  url: string,
  options: RequestInit,
  timeoutMs = 12000
): Promise<{ ok: boolean; isHtmlFallback: boolean; status: number; json: any | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    const trimmed = rawText.trim();

    if (
      contentType.includes('text/html') ||
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<')
    ) {
      return { ok: false, isHtmlFallback: true, status: res.status, json: null };
    }

    if (!trimmed) {
      return { ok: false, isHtmlFallback: false, status: res.status, json: null };
    }

    const parsed = JSON.parse(trimmed);
    return { ok: res.ok, isHtmlFallback: false, status: res.status, json: parsed };
  } catch {
    return { ok: false, isHtmlFallback: false, status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches an external image URL (including TradingView S3 snapshots) into a base64 Data URL
 * using direct CORS fetch or public CORS proxy fallback so it can be analyzed on-device in the APK.
 */
async function fetchImageUrlAsDataUrl(imageUrl: string): Promise<{
  dataUrl: string | null;
  pageTitle: string;
  pageDescription: string;
}> {
  let pageTitle = '';
  let pageDescription = '';
  const tvResolved = resolveTradingViewSnapshotUrl(imageUrl);
  let targetImgUrl = tvResolved.directImageUrl;

  if (tvResolved.isTradingViewUrl && !tvResolved.snapshotId && !targetImgUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(imageUrl)}`;
      const proxyRes = await safeFetchApiJson(proxyUrl, { method: 'GET' }, 6500);
      const html = proxyRes.json?.contents || '';
      if (typeof html === 'string' && html.length > 0) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch?.[1]) pageTitle = titleMatch[1].trim();
        const descMatch =
          html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (descMatch?.[1]) pageDescription = descMatch[1].trim();
        const ogImgMatch =
          html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
          html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
        if (ogImgMatch?.[1]) {
          targetImgUrl = ogImgMatch[1].trim();
        }
      }
    } catch {
      // Ignore metadata proxy errors
    }
  } else if (tvResolved.isTradingViewUrl && tvResolved.snapshotId) {
    try {
      const pageUrl = `https://www.tradingview.com/x/${tvResolved.snapshotId}/`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(pageUrl)}`;
      const proxyRes = await safeFetchApiJson(proxyUrl, { method: 'GET' }, 4500);
      const html = proxyRes.json?.contents || '';
      if (typeof html === 'string' && html.length > 0) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch?.[1]) pageTitle = titleMatch[1].trim();
        const descMatch =
          html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (descMatch?.[1]) pageDescription = descMatch[1].trim();
      }
    } catch {
      // Ignore optional title fetch failure
    }
  }

  const candidateUrls = [
    targetImgUrl,
    `https://corsproxy.io/?${encodeURIComponent(targetImgUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetImgUrl)}`,
  ];

  for (const candidate of candidateUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(candidate, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const cType = (res.headers.get('content-type') || '').toLowerCase();
      if (cType.includes('text/html')) continue;
      const blob = await res.blob();
      if (blob.size < 200) continue;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Read failed'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
      });
      if (dataUrl.startsWith('data:image/')) {
        return { dataUrl, pageTitle, pageDescription };
      }
    } catch {
      // Try next candidate
    }
  }

  return { dataUrl: null, pageTitle, pageDescription };
}

/**
 * Prepares an image for OCR with in-place right-axis contrast enhancement:
 * - Preserves 1:1 (x, y) coordinate mapping with the image dimensions
 * - Boosts contrast of white digits inside colored Green (#089981), Red (#F23645), and Blue (#2962FF)
 *   price badges on the right-hand Y-axis so OCR reads TP, Entry, and SL badge numbers cleanly.
 */
async function buildEnhancedOcrDataUrl(
  dataUrl: string,
  maxDim = 1280
): Promise<{ ocrDataUrl: string; width: number; height: number }> {
  if (typeof document === 'undefined') {
    return { ocrDataUrl: dataUrl, width: 1000, height: 600 };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve({ ocrDataUrl: dataUrl, width: 1000, height: 600 });
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ocrDataUrl: dataUrl, width: w, height: h });
        return;
      }
      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      try {
        // Enhance contrast in the rightmost 26% (Price Axis) so white digits inside colored TP/SL/Entry badges pop out
        const axisStartX = Math.floor(w * 0.74);
        const axisW = w - axisStartX;
        if (axisW > 10) {
          const imgData = ctx.getImageData(axisStartX, 0, axisW, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];

            const isGreenBadgeBg = g > r + 22 && g >= 70 && r < 140;
            const isRedBadgeBg = r > g + 26 && r > b + 20 && r >= 90 && g < 130;
            const isBlueBadgeBg = b > r + 26 && b > g + 15 && b >= 95 && r < 130;

            if (isGreenBadgeBg || isRedBadgeBg || isBlueBadgeBg) {
              // Darken the colored badge background so bright white text inside the badge has maximum contrast
              d[i] = 18;
              d[i + 1] = 22;
              d[i + 2] = 30;
            } else if (r > 185 && g > 185 && b > 185) {
              // Crisp white text on dark/badge background
              d[i] = 255;
              d[i + 1] = 255;
              d[i + 2] = 255;
            }
          }
          ctx.putImageData(imgData, axisStartX, 0);
        }
      } catch {
        // Ignore security/tainted canvas errors if any
      }

      resolve({
        ocrDataUrl: canvas.toDataURL('image/jpeg', 0.88),
        width: w,
        height: h,
      });
    };
    img.src = dataUrl;
  });
}

interface VerticalSegment {
  top: number;
  bottom: number;
  height: number;
  avgScore: number;
}

function extractContiguousSegments(rowScores: Float32Array, minY: number, maxY: number, maxGapRows = 4): VerticalSegment[] {
  const rawSegments: VerticalSegment[] = [];
  let curTop = -1;
  let curBottom = -1;
  let curSum = 0;
  let gapCount = 0;

  for (let y = minY; y <= maxY; y++) {
    const val = rowScores[y];
    if (val > 0) {
      if (curTop === -1) {
        curTop = y;
        curSum = 0;
      }
      curBottom = y;
      curSum += val;
      gapCount = 0;
    } else if (curTop !== -1) {
      gapCount++;
      if (gapCount > maxGapRows) {
        const h = curBottom - curTop + 1;
        if (h >= 5) {
          rawSegments.push({
            top: curTop,
            bottom: curBottom,
            height: h,
            avgScore: curSum / h,
          });
        }
        curTop = -1;
        curBottom = -1;
        curSum = 0;
        gapCount = 0;
      }
    }
  }
  if (curTop !== -1) {
    const h = curBottom - curTop + 1;
    if (h >= 5) {
      rawSegments.push({
        top: curTop,
        bottom: curBottom,
        height: h,
        avgScore: curSum / h,
      });
    }
  }
  return rawSegments;
}

/**
 * High-precision Canvas geometry analyzer:
 * 1) Finds TradingView Long/Short Position Tool by matching vertically adjacent Green Profit Zone & Red Risk Zone segments.
 * 2) Scans the Right-Hand Price Scale (x = 76%..99%) for solid Green (TP), Red (SL), and Blue/Slate (Entry) price badges.
 * 3) Scans the Chart Area for MT5 horizontal order lines (Entry, SL, TP).
 */
export async function analyzeChartCanvasGeometry(dataUrl: string): Promise<CanvasZoneAnalysis> {
  const empty: CanvasZoneAnalysis = {
    hasPositionBox: false,
    inferredPosition: null,
    inferredRR: null,
    entryYRatio: null,
    tpYRatio: null,
    slYRatio: null,
    boxTopYRatio: null,
    boxBottomYRatio: null,
    rightAxisGreenBadgeYRatio: null,
    rightAxisRedBadgeYRatio: null,
    rightAxisBlueOrDarkBadgeYRatio: null,
    horizontalLineYRatios: [],
    imageWidth: 0,
    imageHeight: 0,
  };

  if (typeof document === 'undefined') return empty;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(empty);
    img.onload = () => {
      const sampleW = 600;
      const sampleH = 800;
      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ...empty, imageWidth: img.width, imageHeight: img.height });
        return;
      }

      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;

      // 1. Scan Main Chart Plot Area (x: 8% to 78%, y: 7% to 88%) for TradingView Profit/Risk Zones & MT5 Horizontal Lines
      const plotMinX = Math.floor(sampleW * 0.08);
      const plotMaxX = Math.floor(sampleW * 0.78);
      const plotMinY = Math.floor(sampleH * 0.07);
      const plotMaxY = Math.floor(sampleH * 0.88);

      const greenRowScore = new Float32Array(sampleH);
      const redRowScore = new Float32Array(sampleH);
      const horizLineScore = new Float32Array(sampleH);

      for (let y = plotMinY; y <= plotMaxY; y++) {
        let greenCount = 0;
        let redCount = 0;
        let lineColoredPixels = 0;

        for (let x = plotMinX; x <= plotMaxX; x++) {
          const idx = (y * sampleW + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          // Dark theme & Light theme TradingView Profit Zone (Teal/Emerald/Green)
          const isDarkGreenZone = g > r + 11 && g >= 28 && b >= 22 && r < 145;
          const isLightGreenZone = g > r + 10 && g >= 185 && r < 238 && b >= 175;
          if (isDarkGreenZone || isLightGreenZone) {
            greenCount++;
          }

          // Dark theme & Light theme TradingView Risk Zone (Red/Crimson/Rose)
          const isDarkRedZone = r > g + 13 && r > b + 11 && r >= 35 && g < 135;
          const isLightRedZone = r > g + 12 && r > b + 10 && r >= 200 && g < 235;
          if (isDarkRedZone || isLightRedZone) {
            redCount++;
          }

          // Detect saturated horizontal order lines (MT5 blue/red/green/cyan dashed or solid lines)
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          if (maxC - minC >= 35 && maxC >= 75) {
            lineColoredPixels++;
          }
        }

        // Require at least ~7.5% of plot width (32 pixels out of 420) for zone box rows
        if (greenCount >= 32) greenRowScore[y] = greenCount;
        if (redCount >= 32) redRowScore[y] = redCount;
        if (lineColoredPixels >= 95) horizLineScore[y] = lineColoredPixels;
      }

      // 2. Scan Right-Hand Price Axis (x: 78% to 99%) for Colored Price Badges (TP = Green, SL = Red, Entry = Blue/Slate)
      const axisMinX = Math.floor(sampleW * 0.78);
      const axisMaxX = Math.floor(sampleW * 0.99);
      const axisGreenRows = new Float32Array(sampleH);
      const axisRedRows = new Float32Array(sampleH);
      const axisBlueRows = new Float32Array(sampleH);

      for (let y = plotMinY; y <= plotMaxY; y++) {
        let gBadge = 0;
        let rBadge = 0;
        let bBadge = 0;
        for (let x = axisMinX; x <= axisMaxX; x++) {
          const idx = (y * sampleW + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          if (g > r + 24 && g >= 80 && r < 130) gBadge++;
          if (r > g + 28 && r > b + 20 && r >= 100 && g < 120) rBadge++;
          if (b > r + 25 && b > g + 12 && b >= 95 && r < 120) bBadge++;
        }
        if (gBadge >= 14) axisGreenRows[y] = gBadge;
        if (rBadge >= 14) axisRedRows[y] = rBadge;
        if (bBadge >= 14) axisBlueRows[y] = bBadge;
      }

      const findStrongestBadgeCenterRatio = (rows: Float32Array): number | null => {
        const segs = extractContiguousSegments(rows, plotMinY, plotMaxY, 3).filter(
          (s) => s.height >= 6 && s.height <= 45
        );
        if (segs.length === 0) return null;
        segs.sort((a, b) => b.avgScore * b.height - a.avgScore * a.height);
        const best = segs[0];
        return (best.top + best.bottom) / 2 / sampleH;
      };

      const rightAxisGreenBadgeYRatio = findStrongestBadgeCenterRatio(axisGreenRows);
      const rightAxisRedBadgeYRatio = findStrongestBadgeCenterRatio(axisRedRows);
      const rightAxisBlueOrDarkBadgeYRatio = findStrongestBadgeCenterRatio(axisBlueRows);

      // Extract distinct horizontal line peaks for MT5
      const horizSegs = extractContiguousSegments(horizLineScore, plotMinY, plotMaxY, 2).filter(
        (s) => s.height >= 1 && s.height <= 8
      );
      const horizontalLineYRatios = horizSegs.map((s) => (s.top + s.bottom) / 2 / sampleH);

      // 3. Match Adjacent Green & Red Vertical Segments for TradingView Long/Short Position Tool
      const greenSegs = extractContiguousSegments(greenRowScore, plotMinY, plotMaxY, 6).filter(
        (s) => s.height >= 10
      );
      const redSegs = extractContiguousSegments(redRowScore, plotMinY, plotMaxY, 6).filter(
        (s) => s.height >= 10
      );

      let bestPair: {
        g: VerticalSegment;
        r: VerticalSegment;
        isLong: boolean;
        gap: number;
        score: number;
      } | null = null;

      for (const g of greenSegs) {
        for (const r of redSegs) {
          // Case 1: BUY (Long) -> Green Profit Zone is directly ABOVE Red Risk Zone (g.bottom ~= r.top)
          const gapBuy = Math.abs(r.top - g.bottom);
          if (gapBuy <= sampleH * 0.06 && g.top < r.bottom) {
            const score = (g.height + r.height) * (g.avgScore + r.avgScore) / (1 + gapBuy * 2);
            if (!bestPair || score > bestPair.score) {
              bestPair = { g, r, isLong: true, gap: gapBuy, score };
            }
          }
          // Case 2: SELL (Short) -> Red Risk Zone is directly ABOVE Green Profit Zone (r.bottom ~= g.top)
          const gapSell = Math.abs(g.top - r.bottom);
          if (gapSell <= sampleH * 0.06 && r.top < g.bottom) {
            const score = (g.height + r.height) * (g.avgScore + r.avgScore) / (1 + gapSell * 2);
            if (!bestPair || score > bestPair.score) {
              bestPair = { g, r, isLong: false, gap: gapSell, score };
            }
          }
        }
      }

      if (bestPair) {
        const { g, r, isLong } = bestPair;
        const greenH = Math.max(4, g.bottom - g.top);
        const redH = Math.max(4, r.bottom - r.top);
        const inferredPosition: TradePosition = isLong ? 'BUY' : 'SELL';
        const inferredRR = Math.max(0.15, Math.min(30, Number((greenH / redH).toFixed(2))));

        const entryY = isLong ? (g.bottom + r.top) / 2 : (r.bottom + g.top) / 2;
        const tpY = isLong ? g.top : g.bottom;
        const slY = isLong ? r.bottom : r.top;

        resolve({
          hasPositionBox: true,
          inferredPosition,
          inferredRR,
          entryYRatio: entryY / sampleH,
          tpYRatio: tpY / sampleH,
          slYRatio: slY / sampleH,
          boxTopYRatio: Math.min(g.top, r.top) / sampleH,
          boxBottomYRatio: Math.max(g.bottom, r.bottom) / sampleH,
          rightAxisGreenBadgeYRatio,
          rightAxisRedBadgeYRatio,
          rightAxisBlueOrDarkBadgeYRatio,
          horizontalLineYRatios,
          imageWidth: img.width,
          imageHeight: img.height,
        });
        return;
      }

      resolve({
        ...empty,
        rightAxisGreenBadgeYRatio,
        rightAxisRedBadgeYRatio,
        rightAxisBlueOrDarkBadgeYRatio,
        horizontalLineYRatios,
        imageWidth: img.width,
        imageHeight: img.height,
      });
    };
    img.src = dataUrl;
  });
}

/**
 * Runs OCR on the screenshot using:
 * 1) OCR.space Engine 2 on the contrast-enhanced image (with 1:1 coordinate mapping)
 * 2) Native Android Chromium `TextDetector` API fallback
 */
async function extractChartOcrText(dataUrl: string, imageUrl?: string): Promise<{
  ocr: OcrExtractionResult;
  ocrImageWidth: number;
  ocrImageHeight: number;
}> {
  const words: OcrWordBox[] = [];
  const lines: Array<{ text: string; centerY: number; minX: number; maxX: number }> = [];
  let fullText = '';

  const enhanced = await buildEnhancedOcrDataUrl(dataUrl, 1280);

  try {
    const formData = new FormData();
    formData.append('apikey', 'helloworld');
    formData.append('base64Image', enhanced.ocrDataUrl);
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('isOverlayRequired', 'true');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      const parsedResult = json?.ParsedResults?.[0];
      if (parsedResult) {
        fullText = String(parsedResult.ParsedText || '');
        const rawLines = parsedResult.TextOverlay?.Lines;
        if (Array.isArray(rawLines)) {
          for (const line of rawLines) {
            const lineWords: OcrWordBox[] = [];
            if (Array.isArray(line.Words)) {
              for (const w of line.Words) {
                const wt = String(w.WordText || '').trim();
                if (!wt) continue;
                const left = Number(w.Left) || 0;
                const top = Number(w.Top) || 0;
                const width = Number(w.Width) || 0;
                const height = Number(w.Height) || 0;
                const box: OcrWordBox = {
                  text: wt,
                  left,
                  top,
                  width,
                  height,
                  centerX: left + width / 2,
                  centerY: top + height / 2,
                };
                words.push(box);
                lineWords.push(box);
              }
            }
            if (lineWords.length > 0) {
              const avgY = lineWords.reduce((acc, item) => acc + item.centerY, 0) / lineWords.length;
              const minX = Math.min(...lineWords.map((item) => item.left));
              const maxX = Math.max(...lineWords.map((item) => item.left + item.width));
              lines.push({
                text: String(line.LineText || lineWords.map((item) => item.text).join(' ')).trim(),
                centerY: avgY,
                minX,
                maxX,
              });
            }
          }
        }
      }
    }
  } catch {
    // Fallback to native TextDetector if OCR.space is unreachable
  }

  if (!fullText && typeof window !== 'undefined' && 'TextDetector' in window) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = dataUrl || imageUrl || '';
      });
      const detector = new (window as any).TextDetector();
      const detectedBlocks = await detector.detect(img);
      if (Array.isArray(detectedBlocks)) {
        const blockTexts: string[] = [];
        for (const b of detectedBlocks) {
          const val = String(b.rawValue || '').trim();
          if (!val) continue;
          blockTexts.push(val);
          const rect = b.boundingBox || { x: 0, y: 0, width: 0, height: 0 };
          lines.push({
            text: val,
            centerY: (rect.y || 0) + (rect.height || 0) / 2,
            minX: rect.x || 0,
            maxX: (rect.x || 0) + (rect.width || 0),
          });
        }
        fullText = blockTexts.join('\n');
      }
    } catch {
      // Ignore native TextDetector error
    }
  }

  return {
    ocr: { fullText, lines, words },
    ocrImageWidth: enhanced.width,
    ocrImageHeight: enhanced.height,
  };
}

function getLocalChartReferenceForInstrument(preferredInstrument?: string): {
  instrument: string;
  position: TradePosition | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  timeframe: string | null;
} {
  if (typeof window === 'undefined') {
    return {
      instrument: preferredInstrument || 'XAUUSD',
      position: null,
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      timeframe: null,
    };
  }

  let activeSymbol = preferredInstrument || 'XAUUSD';
  let activeTf: string | null = null;
  try {
    const rawPrefs = window.localStorage.getItem(CHART_PREFS_STORAGE_KEY);
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs);
      if (!preferredInstrument && prefs?.symbol) {
        activeSymbol = normalizeScanInstrument(prefs.symbol);
      }
      if (prefs?.interval) {
        activeTf = normalizeTimeframeLabel(prefs.interval);
      }
    }
  } catch {
    // ignore
  }

  try {
    const rawDrawings = window.localStorage.getItem(CHART_DRAWINGS_STORAGE_KEY);
    if (rawDrawings) {
      const drawings = JSON.parse(rawDrawings);
      if (Array.isArray(drawings)) {
        const posDrawings = drawings.filter(
          (d: any) =>
            d &&
            (d.type === 'long_position' ||
              d.type === 'short_position' ||
              d.type === 'long' ||
              d.type === 'short')
        );
        if (posDrawings.length > 0) {
          const matching =
            posDrawings
              .slice()
              .reverse()
              .find((d: any) => normalizeScanInstrument(d.pair) === activeSymbol) ||
            posDrawings[posDrawings.length - 1];

          const isLong = matching.type === 'long_position' || matching.type === 'long';
          const entry = Number(matching.p1?.price);
          const sl = Number(matching.slPrice);
          const tp = Number(matching.tpPrice);
          const pair = normalizeScanInstrument(matching.pair || activeSymbol);

          if (Number.isFinite(entry) && entry > 0) {
            return {
              instrument: pair,
              position: isLong ? 'BUY' : 'SELL',
              entryPrice: entry,
              stopLoss: Number.isFinite(sl) && sl > 0 ? sl : null,
              takeProfit: Number.isFinite(tp) && tp > 0 ? tp : null,
              timeframe: activeTf,
            };
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return {
    instrument: activeSymbol,
    position: null,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    timeframe: activeTf,
  };
}

/**
 * Fits a robust Theil-Sen linear price-scale model P(y) = slope * y + intercept
 * from right-axis OCR price numbers (where price decreases as pixel Y increases downward).
 */
function buildRobustPriceAxisModel(
  axisCandidates: Array<{ price: number; y: number }>,
  decimals: number
): {
  priceAtY: (y: number) => number;
  findClosestBadgePriceAtY: (targetY: number, maxPixelDist: number) => number | null;
} | null {
  if (axisCandidates.length < 2) return null;

  const sorted = axisCandidates.slice().sort((a, b) => a.y - b.y);
  const slopes: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dy = sorted[j].y - sorted[i].y;
      const dp = sorted[j].price - sorted[i].price;
      // On a chart Y-axis, lower on screen (larger Y) means lower price (dp < 0)
      if (dy >= 12 && dp < 0) {
        slopes.push(dp / dy);
      }
    }
  }

  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const medianSlope = slopes[Math.floor(slopes.length / 2)];

  const intercepts = sorted.map((pt) => pt.price - medianSlope * pt.y).sort((a, b) => a - b);
  const medianIntercept = intercepts[Math.floor(intercepts.length / 2)];

  const priceAtY = (y: number): number => {
    const raw = medianSlope * y + medianIntercept;
    return Number(raw.toFixed(decimals));
  };

  const findClosestBadgePriceAtY = (targetY: number, maxPixelDist: number): number | null => {
    let best: { price: number; dist: number } | null = null;
    const expectedPrice = priceAtY(targetY);
    const maxAllowedPriceDiff = Math.abs(medianSlope) * maxPixelDist * 2.2;

    for (const cand of sorted) {
      const dist = Math.abs(cand.y - targetY);
      if (dist <= maxPixelDist && Math.abs(cand.price - expectedPrice) <= Math.max(maxAllowedPriceDiff, 1e-4)) {
        if (!best || dist < best.dist) {
          best = { price: Number(cand.price.toFixed(decimals)), dist };
        }
      }
    }
    return best ? best.price : null;
  };

  return { priceAtY, findClosestBadgePriceAtY };
}

/**
 * Parses OCR text + spatial Y-coordinates + Canvas geometry into a complete ExtractedTradeScanData object.
 * Strictly enforces:
 * - MT5: extracts and sets `lotSize` directly from the screenshot.
 * - TradingView: sets `lotSize = null` so the app calculates Lot automatically from Equity & Risk %.
 */
export function synthesizeTradeScanFromSignals(params: {
  ocr: OcrExtractionResult;
  canvasGeom?: CanvasZoneAnalysis | null;
  urlMeta?: {
    isTradingViewUrl: boolean;
    symbolFromUrl: string | null;
    timeframeFromUrl: string | null;
    pageTitle: string;
    pageDescription: string;
    directImageUrl: string;
  } | null;
}): ExtractedTradeScanData {
  const { ocr } = params;
  const canvasGeom: CanvasZoneAnalysis = params.canvasGeom || {
    hasPositionBox: false,
    inferredPosition: null,
    inferredRR: null,
    entryYRatio: null,
    tpYRatio: null,
    slYRatio: null,
    boxTopYRatio: null,
    boxBottomYRatio: null,
    rightAxisGreenBadgeYRatio: null,
    rightAxisRedBadgeYRatio: null,
    rightAxisBlueOrDarkBadgeYRatio: null,
    horizontalLineYRatios: [],
    imageWidth: 1000,
    imageHeight: 600,
  };
  const urlMeta = params.urlMeta || {
    isTradingViewUrl: false,
    symbolFromUrl: null,
    timeframeFromUrl: null,
    pageTitle: '',
    pageDescription: '',
    directImageUrl: '',
  };
  const combinedText = `${urlMeta.pageTitle}\n${urlMeta.pageDescription}\n${ocr.fullText}`;
  const upperText = combinedText.toUpperCase();

  const imgW = canvasGeom.imageWidth || 1000;
  const imgH = canvasGeom.imageHeight || 600;

  // 1. Detect MT5 Order Lines & Labels with their exact Y-coordinates
  let mt5OrderDirection: TradePosition | null = null;
  let mt5DetectedLot: number | null = null;
  let mt5EntryFromText: number | null = null;
  let mt5OrderLineY: number | null = null;
  let mt5SlLineY: number | null = null;
  let mt5TpLineY: number | null = null;

  for (const line of ocr.lines) {
    const t = line.text.trim();
    // Match MT5 chart order line: e.g. "#123456 buy 0.10", "sell 0.25", "buy limit 0.05 at 2650.00"
    const orderMatch = t.match(
      /\b(buy|sell)(?:\s+limit|\s+stop)?\s+(\d+(?:\.\d{1,2})?)(?:\s*(?:at|@)\s*([0-9][0-9, ]*(?:\.[0-9]+)?))?/i
    );
    if (orderMatch) {
      mt5OrderDirection = orderMatch[1].toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const parsedLot = parseFloat(orderMatch[2]);
      if (!isNaN(parsedLot) && parsedLot >= 0.01 && parsedLot <= 200) {
        mt5DetectedLot = parsedLot;
      }
      if (orderMatch[3]) {
        const p = parseFloat(orderMatch[3].replace(/[, ]/g, ''));
        if (!isNaN(p) && p > 0) mt5EntryFromText = p;
      }
      mt5OrderLineY = line.centerY;
    }

    // Match MT5 "sl" / "s/l" label on horizontal line
    if (/^(?:s\/l|sl)\b/i.test(t) || /\bsl\s*[:=]?\s*\d/i.test(t)) {
      mt5SlLineY = line.centerY;
    }
    // Match MT5 "tp" / "t/p" label on horizontal line
    if (/^(?:t\/p|tp)\b/i.test(t) || /\btp\s*[:=]?\s*\d/i.test(t)) {
      mt5TpLineY = line.centerY;
    }
  }

  // Fallback regex over fullText if lines array was not populated
  if (!mt5OrderDirection) {
    const fullOrderMatch = combinedText.match(
      /\b(buy|sell)(?:\s+limit|\s+stop)?\s+(\d+\.\d{2})(?:\s*(?:at|@)\s*([0-9][0-9, ]*(?:\.[0-9]+)?))?/i
    );
    if (fullOrderMatch) {
      mt5OrderDirection = fullOrderMatch[1].toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const parsedLot = parseFloat(fullOrderMatch[2]);
      if (!isNaN(parsedLot) && parsedLot >= 0.01 && parsedLot <= 200) {
        mt5DetectedLot = parsedLot;
      }
      if (fullOrderMatch[3]) {
        const p = parseFloat(fullOrderMatch[3].replace(/[, ]/g, ''));
        if (!isNaN(p) && p > 0) mt5EntryFromText = p;
      }
    }
  }

  // 2. Determine Source ('MT5' vs 'TRADINGVIEW')
  let source: 'MT5' | 'TRADINGVIEW' | 'CHART' = 'TRADINGVIEW';
  const hasTvMarkers =
    urlMeta.isTradingViewUrl ||
    canvasGeom.hasPositionBox ||
    upperText.includes('TRADINGVIEW') ||
    upperText.includes('OANDA:') ||
    upperText.includes('FX:') ||
    upperText.includes('RISK/REWARD') ||
    upperText.includes('OPEN P&L');

  const hasMt5Markers =
    upperText.includes('METATRADER') ||
    upperText.includes('MT5') ||
    upperText.includes('MT4') ||
    mt5DetectedLot !== null;

  if (hasMt5Markers && !canvasGeom.hasPositionBox && !urlMeta.isTradingViewUrl) {
    source = 'MT5';
  } else if (hasTvMarkers) {
    source = 'TRADINGVIEW';
  } else if (mt5DetectedLot !== null) {
    source = 'MT5';
  }

  // 3. Detect Instrument / Pair
  let instrument = urlMeta.symbolFromUrl || '';
  if (!instrument) {
    const symbolRegex =
      /\b(XAUUSD|GOLD|XAU\/USD|BTCUSD|BTCUSDT|ETHUSD|ETHUSDT|SOLUSD|EURUSD|GBPUSD|USDJPY|USDCHF|USDCAD|AUDUSD|NZDUSD|EURGBP|EURJPY|GBPJPY|AUDJPY|US30|NAS100|USTEC|SPX500|US500|GER40)\b/i;
    const m = combinedText.match(symbolRegex);
    if (m && m[1]) {
      instrument = normalizeScanInstrument(m[1]);
    }
  }

  let timeframe = urlMeta.timeframeFromUrl;
  if (!timeframe) {
    const tfMatch = combinedText.match(/\b(M1|M3|M5|M15|M30|H1|H4|D1|1M|5M|15M|30M|1H|4H|1D|DAILY)\b/i);
    if (tfMatch?.[1]) {
      timeframe = normalizeTimeframeLabel(tfMatch[1]);
    }
  }

  const localRef = getLocalChartReferenceForInstrument(instrument || undefined);
  if (!instrument) {
    instrument = localRef.instrument || 'XAUUSD';
  }

  let priceSpec = INSTRUMENT_PRICE_RANGES[instrument] || INSTRUMENT_PRICE_RANGES.XAUUSD;

  // 4. Collect all decimal numbers from OCR lines with their spatial (X, Y) coordinates
  const allDecimalTokens: Array<{
    raw: string;
    val: number;
    y: number;
    x: number;
    isRightAxis: boolean;
  }> = [];

  for (const line of ocr.lines) {
    // Handle numbers with optional space/comma thousands separator (e.g. "96 250.00" or "2650.50")
    const matches = line.text.matchAll(/\b([0-9]{1,3}(?:[ ,][0-9]{3})*\.[0-9]{1,5}|[0-9]{1,6}\.[0-9]{1,5})\b/g);
    for (const m of matches) {
      const cleaned = m[1].replace(/[ ,]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0) {
        allDecimalTokens.push({
          raw: cleaned,
          val: num,
          y: line.centerY,
          x: line.maxX,
          isRightAxis: line.maxX >= imgW * 0.65 || line.minX >= imgW * 0.6,
        });
      }
    }
  }

  if (allDecimalTokens.length === 0 && combinedText) {
    const matches = combinedText.matchAll(/\b([0-9]{1,6}\.[0-9]{1,5})\b/g);
    let idx = 0;
    for (const m of matches) {
      const num = parseFloat(m[1]);
      if (!isNaN(num) && num > 0) {
        allDecimalTokens.push({
          raw: m[1],
          val: num,
          y: idx * 25,
          x: imgW * 0.85,
          isRightAxis: true,
        });
        idx++;
      }
    }
  }

  // Auto-correct instrument if Y-axis numbers clearly belong to another instrument range
  const matchingInitialRange = allDecimalTokens.filter(
    (t) => t.val >= priceSpec.min && t.val <= priceSpec.max
  );
  if (!urlMeta.symbolFromUrl && matchingInitialRange.length < 2) {
    const btcTokens = allDecimalTokens.filter((t) => t.val >= 40000 && t.val <= 180000);
    const eurTokens = allDecimalTokens.filter(
      (t) => t.raw.split('.')[1]?.length >= 4 && t.val >= 1.01 && t.val <= 1.18
    );
    const gbpTokens = allDecimalTokens.filter(
      (t) => t.raw.split('.')[1]?.length >= 4 && t.val >= 1.2 && t.val <= 1.42
    );
    const jpyTokens = allDecimalTokens.filter(
      (t) => t.raw.split('.')[1]?.length === 3 && t.val >= 130 && t.val <= 175
    );

    if (btcTokens.length >= 2) instrument = 'BTCUSD';
    else if (eurTokens.length >= 2) instrument = 'EURUSD';
    else if (gbpTokens.length >= 2) instrument = 'GBPUSD';
    else if (jpyTokens.length >= 2) instrument = 'USDJPY';

    priceSpec = INSTRUMENT_PRICE_RANGES[instrument] || priceSpec;
  }

  const validPriceTokens = allDecimalTokens.filter((t) => {
    if (t.val < priceSpec.min || t.val > priceSpec.max) return false;
    // Exclude standard lot numbers (1.00, 0.90) on 5-decimal Forex pairs unless they have >=4 decimals
    if (priceSpec.decimals === 5 && (t.raw === '1.00' || t.raw === '1.0')) return false;
    return true;
  });

  // 5. Extract Explicit Labeled Prices (Target/TP, Stop/SL, Entry/Open)
  let explicitEntry: number | null =
    mt5EntryFromText !== null && mt5EntryFromText >= priceSpec.min && mt5EntryFromText <= priceSpec.max
      ? mt5EntryFromText
      : null;
  let explicitSL: number | null = null;
  let explicitTP: number | null = null;
  let explicitRR: number | null = null;
  let explicitProfit: number | null = null;

  const entryMatch = combinedText.match(
    /(?:entry\s*price|open\s*price|harga\s*entry|\bentry|\bopen|@)\s*[:=]?\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (entryMatch?.[1] && explicitEntry === null) {
    const v = parseFloat(entryMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && v >= priceSpec.min && v <= priceSpec.max) explicitEntry = v;
  }

  const slMatch = combinedText.match(
    /(?:stop\s*loss|\bstop|\bs\/l|\bsl)\s*[:=]?\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (slMatch?.[1]) {
    const v = parseFloat(slMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && v >= priceSpec.min && v <= priceSpec.max) explicitSL = v;
  }

  const tpMatch = combinedText.match(
    /(?:take\s*profit|\btarget|\bt\/p|\btp)\s*[:=]?\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (tpMatch?.[1]) {
    const v = parseFloat(tpMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && v >= priceSpec.min && v <= priceSpec.max) explicitTP = v;
  }

  const rrMatch = combinedText.match(
    /(?:risk\/reward(?:\s*ratio)?|r:r|\brr\b|1\s*:)\s*[:=]?\s*(\d+(?:\.\d{1,2})?)/i
  );
  if (rrMatch?.[1]) {
    const v = parseFloat(rrMatch[1]);
    if (!isNaN(v) && v >= 0.15 && v <= 30) explicitRR = v;
  }

  // 6. Build Robust Linear Y-Axis Price Model P(y) = slope * y + intercept
  const rightAxisTokens = validPriceTokens.filter((t) => t.isRightAxis && t.y > 0);
  const axisModel = buildRobustPriceAxisModel(
    rightAxisTokens.length >= 2 ? rightAxisTokens : validPriceTokens.filter((t) => t.y > 0),
    priceSpec.decimals
  );

  // 7. Determine Position Direction (BUY vs SELL)
  let position: TradePosition = 'BUY';
  if (canvasGeom.hasPositionBox && canvasGeom.inferredPosition) {
    position = canvasGeom.inferredPosition;
  } else if (mt5OrderDirection) {
    position = mt5OrderDirection;
  } else if (explicitTP !== null && explicitSL !== null && explicitTP !== explicitSL) {
    position = explicitTP > explicitSL ? 'BUY' : 'SELL';
  } else if (
    canvasGeom.rightAxisGreenBadgeYRatio !== null &&
    canvasGeom.rightAxisGreenBadgeYRatio !== undefined &&
    canvasGeom.rightAxisRedBadgeYRatio !== null &&
    canvasGeom.rightAxisRedBadgeYRatio !== undefined
  ) {
    // Smaller Y is higher on screen (higher price): Green badge above Red badge => TP > SL => BUY
    position =
      canvasGeom.rightAxisGreenBadgeYRatio < canvasGeom.rightAxisRedBadgeYRatio ? 'BUY' : 'SELL';
  } else if (mt5TpLineY !== null && mt5SlLineY !== null && mt5TpLineY !== mt5SlLineY) {
    position = mt5TpLineY < mt5SlLineY ? 'BUY' : 'SELL';
  } else if (/\b(SHORT|SELL)\b/i.test(combinedText) && !/\b(LONG|BUY)\b/i.test(combinedText)) {
    position = 'SELL';
  } else if (localRef.position) {
    position = localRef.position;
  }

  // 8. Resolve Entry, TP, and SL Prices using Y-Coordinate Badge Alignment + Theil-Sen Linear Scale Model
  let entryPrice = explicitEntry;
  let takeProfit = explicitTP;
  let stopLoss = explicitSL;

  const badgeTolerancePx = Math.max(14, imgH * 0.028);

  const resolvePriceAtTargetY = (targetY: number | null): number | null => {
    if (targetY === null || !Number.isFinite(targetY)) return null;
    if (axisModel) {
      // 1) Check if an OCR badge sits right at targetY
      const directBadge = axisModel.findClosestBadgePriceAtY(targetY, badgeTolerancePx);
      if (directBadge !== null) return directBadge;
      // 2) Otherwise evaluate the linear price axis model at targetY
      const interpolated = axisModel.priceAtY(targetY);
      if (interpolated >= priceSpec.min && interpolated <= priceSpec.max) {
        return interpolated;
      }
    } else {
      // If fewer than 2 axis ticks were available for linear model, check direct proximity
      let closest: { val: number; dist: number } | null = null;
      for (const tok of validPriceTokens) {
        const d = Math.abs(tok.y - targetY);
        if (d <= badgeTolerancePx * 1.5 && (!closest || d < closest.dist)) {
          closest = { val: Number(tok.val.toFixed(priceSpec.decimals)), dist: d };
        }
      }
      if (closest) return closest.val;
    }
    return null;
  };

  // Case A: TradingView Position Box Y-levels (or Right-Axis Badge Y-levels)
  const targetEntryY =
    canvasGeom.entryYRatio !== null && canvasGeom.entryYRatio !== undefined
      ? canvasGeom.entryYRatio * imgH
      : mt5OrderLineY !== null
      ? mt5OrderLineY
      : canvasGeom.rightAxisBlueOrDarkBadgeYRatio !== null &&
        canvasGeom.rightAxisBlueOrDarkBadgeYRatio !== undefined
      ? canvasGeom.rightAxisBlueOrDarkBadgeYRatio * imgH
      : null;

  const targetTpY =
    canvasGeom.tpYRatio !== null && canvasGeom.tpYRatio !== undefined
      ? canvasGeom.tpYRatio * imgH
      : mt5TpLineY !== null
      ? mt5TpLineY
      : canvasGeom.rightAxisGreenBadgeYRatio !== null &&
        canvasGeom.rightAxisGreenBadgeYRatio !== undefined
      ? canvasGeom.rightAxisGreenBadgeYRatio * imgH
      : null;

  const targetSlY =
    canvasGeom.slYRatio !== null && canvasGeom.slYRatio !== undefined
      ? canvasGeom.slYRatio * imgH
      : mt5SlLineY !== null
      ? mt5SlLineY
      : canvasGeom.rightAxisRedBadgeYRatio !== null &&
        canvasGeom.rightAxisRedBadgeYRatio !== undefined
      ? canvasGeom.rightAxisRedBadgeYRatio * imgH
      : null;

  if (entryPrice === null) entryPrice = resolvePriceAtTargetY(targetEntryY);
  if (takeProfit === null) takeProfit = resolvePriceAtTargetY(targetTpY);
  if (stopLoss === null) stopLoss = resolvePriceAtTargetY(targetSlY);

  // Case B: If MT5 horizontal lines were detected on Canvas and some level is still missing
  if (
    (entryPrice === null || takeProfit === null || stopLoss === null) &&
    canvasGeom.horizontalLineYRatios &&
    canvasGeom.horizontalLineYRatios.length >= 2 &&
    axisModel
  ) {
    const linePrices = canvasGeom.horizontalLineYRatios
      .map((r) => resolvePriceAtTargetY(r * imgH))
      .filter((p): p is number => p !== null && p >= priceSpec.min && p <= priceSpec.max)
      .sort((a, b) => a - b);

    if (linePrices.length >= 3) {
      const lowP = linePrices[0];
      const midP = linePrices[Math.floor(linePrices.length / 2)];
      const highP = linePrices[linePrices.length - 1];
      if (position === 'BUY') {
        if (stopLoss === null) stopLoss = lowP;
        if (entryPrice === null) entryPrice = midP;
        if (takeProfit === null) takeProfit = highP;
      } else {
        if (takeProfit === null) takeProfit = lowP;
        if (entryPrice === null) entryPrice = midP;
        if (stopLoss === null) stopLoss = highP;
      }
    }
  }

  // Case C: If exactly 3 price badges were read on the screenshot (e.g. TP, Entry, SL badges), assign by vertical/price order
  if (entryPrice === null && stopLoss === null && takeProfit === null && validPriceTokens.length >= 3) {
    const uniqueSorted = Array.from(
      new Set(validPriceTokens.map((t) => Number(t.val.toFixed(priceSpec.decimals))))
    ).sort((a, b) => a - b);

    if (uniqueSorted.length === 3) {
      if (position === 'BUY') {
        stopLoss = uniqueSorted[0];
        entryPrice = uniqueSorted[1];
        takeProfit = uniqueSorted[2];
      } else {
        takeProfit = uniqueSorted[0];
        entryPrice = uniqueSorted[1];
        stopLoss = uniqueSorted[2];
      }
    } else if (uniqueSorted.length > 3) {
      // Pick the middle cluster rather than extreme chart top/bottom grid ticks
      const midIdx = Math.floor(uniqueSorted.length / 2);
      const lowCandidate = uniqueSorted[Math.max(0, midIdx - 1)];
      const midCandidate = uniqueSorted[midIdx];
      const highCandidate = uniqueSorted[Math.min(uniqueSorted.length - 1, midIdx + 1)];
      if (position === 'BUY') {
        stopLoss = lowCandidate;
        entryPrice = midCandidate;
        takeProfit = highCandidate;
      } else {
        takeProfit = lowCandidate;
        entryPrice = midCandidate;
        stopLoss = highCandidate;
      }
    }
  } else if (entryPrice === null && validPriceTokens.length >= 1) {
    const midIdx = Math.floor(validPriceTokens.length / 2);
    entryPrice = Number(validPriceTokens[midIdx].val.toFixed(priceSpec.decimals));
  }

  // 9. Mathematical Derivation if 2 of (Entry, SL, TP) + R:R are known
  const effectiveRR = explicitRR || canvasGeom.inferredRR || 2.0;
  if (entryPrice === null && stopLoss !== null && takeProfit !== null) {
    if (takeProfit > stopLoss) {
      position = 'BUY';
      entryPrice = Number(
        ((takeProfit + effectiveRR * stopLoss) / (1 + effectiveRR)).toFixed(priceSpec.decimals)
      );
    } else if (takeProfit < stopLoss) {
      position = 'SELL';
      entryPrice = Number(
        ((effectiveRR * stopLoss + takeProfit) / (1 + effectiveRR)).toFixed(priceSpec.decimals)
      );
    }
  }

  // 10. Cross-reference with TradeVault's local Market Chart drawing if prices are still missing
  if (entryPrice === null && localRef.entryPrice !== null && localRef.instrument === instrument) {
    entryPrice = localRef.entryPrice;
    if (stopLoss === null && localRef.stopLoss !== null) stopLoss = localRef.stopLoss;
    if (takeProfit === null && localRef.takeProfit !== null) takeProfit = localRef.takeProfit;
  }

  // 11. Enforce Strict Directional Consistency & Populate Missing SL / TP
  if (stopLoss !== null && takeProfit !== null && stopLoss !== takeProfit) {
    // If both SL and TP were explicitly read, their relative order deterministically dictates BUY vs SELL
    if (!canvasGeom.hasPositionBox && !mt5OrderDirection) {
      position = takeProfit > stopLoss ? 'BUY' : 'SELL';
    } else if (
      (position === 'BUY' && takeProfit < stopLoss) ||
      (position === 'SELL' && takeProfit > stopLoss)
    ) {
      // Swap if OCR misassigned SL and TP labels against the confirmed position direction
      const temp = stopLoss;
      stopLoss = takeProfit;
      takeProfit = temp;
    }
  }

  if (entryPrice !== null) {
    const riskDist =
      stopLoss !== null && Math.abs(entryPrice - stopLoss) > 0
        ? Math.abs(entryPrice - stopLoss)
        : takeProfit !== null && Math.abs(takeProfit - entryPrice) > 0
        ? Math.abs(takeProfit - entryPrice) / effectiveRR
        : priceSpec.defaultPipStep;

    if (position === 'BUY') {
      if (stopLoss === null || stopLoss >= entryPrice) {
        stopLoss = Number((entryPrice - riskDist).toFixed(priceSpec.decimals));
      }
      if (takeProfit === null || takeProfit <= entryPrice) {
        const actualRisk = Math.abs(entryPrice - stopLoss);
        takeProfit = Number((entryPrice + actualRisk * effectiveRR).toFixed(priceSpec.decimals));
      }
    } else {
      if (stopLoss === null || stopLoss <= entryPrice) {
        stopLoss = Number((entryPrice + riskDist).toFixed(priceSpec.decimals));
      }
      if (takeProfit === null || takeProfit >= entryPrice) {
        const actualRisk = Math.abs(stopLoss - entryPrice);
        takeProfit = Number((entryPrice - actualRisk * effectiveRR).toFixed(priceSpec.decimals));
      }
    }
  }

  // 12. Strict Lot Size Rule:
  // - MT5: Use the identified MT5 lot size so it is input directly into the app.
  // - TradingView: Set lotSize = null so TradeForm calculates lot automatically from Equity & Risk %.
  const finalLotSize: number | null = source === 'MT5' ? mt5DetectedLot : null;
  const finalStatus: 'PLANNED' | 'ACTIVE' | 'CLOSED' =
    source === 'MT5' && finalLotSize !== null ? 'ACTIVE' : 'PLANNED';

  let plannedRiskReward = explicitRR || canvasGeom.inferredRR || null;
  if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk > 0) {
      plannedRiskReward = Number((reward / risk).toFixed(2));
    }
  }

  const summaryParts: string[] = [`${instrument} ${position}`];
  if (source === 'MT5' && finalLotSize !== null) summaryParts.push(`Lot ${finalLotSize}`);
  if (timeframe) summaryParts.push(`TF ${timeframe}`);
  if (entryPrice !== null) summaryParts.push(`Entry ${entryPrice}`);
  if (stopLoss !== null) summaryParts.push(`SL ${stopLoss}`);
  if (takeProfit !== null) summaryParts.push(`TP ${takeProfit}`);
  if (plannedRiskReward !== null) summaryParts.push(`R:R 1:${plannedRiskReward}`);

  return {
    detected: entryPrice !== null || canvasGeom.hasPositionBox || Boolean(urlMeta.symbolFromUrl),
    source,
    instrument,
    position,
    lotSize: finalLotSize,
    entryPrice,
    stopLoss,
    takeProfit,
    exitPrice: null,
    profit: explicitProfit,
    status: finalStatus,
    plannedRiskReward,
    timeframe,
    currentPrice: entryPrice,
    confidence: 0.92,
    notes: `Terdeteksi otomatis (${summaryParts.join(' · ')})`,
    modelUsed: 'hybrid-apk-vision-v2',
    resolvedImageUrl: urlMeta.directImageUrl || undefined,
  };
}

/**
 * Main entry point for scanning a trade screenshot (Data URL or TradingView/Chart Image URL).
 * Works seamlessly on both Full-Stack Web Server AND Standalone Capacitor Android APK.
 */
export async function scanTradeScreenshotOrUrl(inputSource: string): Promise<ExtractedTradeScanData> {
  const trimmed = (inputSource || '').trim();
  if (!trimmed) {
    throw new Error('Unggah gambar atau masukkan tautan screenshot terlebih dahulu.');
  }

  const isDataUrl = trimmed.startsWith('data:image/');
  const tvResolved = resolveTradingViewSnapshotUrl(trimmed);

  // 1. Try Server-Side AI Vision API (/api/extract-trade-screenshot) first
  const payload: { imageBase64?: string; imageUrl?: string } = {};
  if (isDataUrl) {
    payload.imageBase64 = trimmed;
  } else {
    payload.imageUrl = tvResolved.directImageUrl || trimmed;
  }

  const serverRes = await safeFetchApiJson(
    '/api/extract-trade-screenshot',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    14000
  );

  if (serverRes.ok && serverRes.json?.success && serverRes.json?.data) {
    const d = serverRes.json.data as ExtractedTradeScanData;
    const isMt5 = d.source === 'MT5';
    return {
      ...d,
      // Enforce user rule: only keep lotSize if source is MT5; for TradingView let Equity auto-lot calculate it
      lotSize: isMt5 ? d.lotSize : null,
      resolvedImageUrl: !isDataUrl ? tvResolved.directImageUrl : undefined,
    };
  }

  // 2. Standalone Android APK / Client-Side Multi-Engine Vision + OCR + Canvas Geometry Scanner
  let dataUrlToAnalyze: string | null = isDataUrl ? trimmed : null;
  let pageTitle = '';
  let pageDescription = '';

  if (!isDataUrl) {
    const fetched = await fetchImageUrlAsDataUrl(trimmed);
    dataUrlToAnalyze = fetched.dataUrl;
    pageTitle = fetched.pageTitle;
    pageDescription = fetched.pageDescription;
  }

  const [canvasGeom, ocrPack] = await Promise.all([
    dataUrlToAnalyze
      ? analyzeChartCanvasGeometry(dataUrlToAnalyze)
      : Promise.resolve<CanvasZoneAnalysis>({
          hasPositionBox: false,
          inferredPosition: null,
          inferredRR: null,
          entryYRatio: null,
          tpYRatio: null,
          slYRatio: null,
          boxTopYRatio: null,
          boxBottomYRatio: null,
          imageWidth: 0,
          imageHeight: 0,
        }),
    dataUrlToAnalyze
      ? extractChartOcrText(dataUrlToAnalyze, tvResolved.directImageUrl)
      : Promise.resolve({
          ocr: { fullText: '', lines: [], words: [] },
          ocrImageWidth: 1000,
          ocrImageHeight: 600,
        }),
  ]);

  // Ensure coordinate system of canvasGeom matches ocrImageWidth/Height
  const alignedCanvasGeom: CanvasZoneAnalysis = {
    ...canvasGeom,
    imageWidth: ocrPack.ocrImageWidth || canvasGeom.imageWidth || 1000,
    imageHeight: ocrPack.ocrImageHeight || canvasGeom.imageHeight || 600,
  };

  return synthesizeTradeScanFromSignals({
    ocr: ocrPack.ocr,
    canvasGeom: alignedCanvasGeom,
    urlMeta: {
      isTradingViewUrl: tvResolved.isTradingViewUrl,
      symbolFromUrl: tvResolved.symbolFromUrl,
      timeframeFromUrl: tvResolved.timeframeFromUrl,
      pageTitle,
      pageDescription,
      directImageUrl: !isDataUrl ? tvResolved.directImageUrl : '',
    },
  });
}
