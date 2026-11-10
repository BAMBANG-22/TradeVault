import { TradePosition } from '../types/trade';
import { CHART_PREFS_STORAGE_KEY } from '../components/chart/MarketChartView';

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
  XAUUSD: { min: 1500, max: 6500, decimals: 2, defaultPipStep: 10 },
  XAGUSD: { min: 15, max: 90, decimals: 3, defaultPipStep: 0.4 },
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

const REMOTE_SCAN_API_ENDPOINTS = [
  '/api/extract-trade-screenshot',
  'https://ais-pre-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/extract-trade-screenshot',
  'https://ais-dev-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/extract-trade-screenshot',
];

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
  timeoutMs = 11000
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
 * Prepares a clean, uncorrupted high-resolution image for OCR AND a 2x-upscaled Right-Axis Price Scale strip
 * so small price badge digits on the Y-axis are never destroyed or missed.
 */
async function buildCleanOcrImages(
  dataUrl: string,
  maxDim = 1600
): Promise<{
  fullOcrDataUrl: string;
  rightAxisCropDataUrl: string | null;
  rightAxisScaleFactor: number;
  rightAxisOffsetX: number;
  width: number;
  height: number;
}> {
  if (typeof document === 'undefined') {
    return {
      fullOcrDataUrl: dataUrl,
      rightAxisCropDataUrl: null,
      rightAxisScaleFactor: 2,
      rightAxisOffsetX: 750,
      width: 1000,
      height: 600,
    };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () =>
      resolve({
        fullOcrDataUrl: dataUrl,
        rightAxisCropDataUrl: null,
        rightAxisScaleFactor: 2,
        rightAxisOffsetX: 750,
        width: 1000,
        height: 600,
      });
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
        resolve({
          fullOcrDataUrl: dataUrl,
          rightAxisCropDataUrl: null,
          rightAxisScaleFactor: 2,
          rightAxisOffsetX: Math.floor(w * 0.72),
          width: w,
          height: h,
        });
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      // Build a 2x-upscaled Right-Axis Price Scale crop (rightmost 28% of image) so small badge digits are 2x larger for OCR
      let rightAxisCropDataUrl: string | null = null;
      const scaleFactor = 2;
      const cropX = Math.floor(w * 0.72);
      const cropW = Math.max(1, w - cropX);
      try {
        const axisCanvas = document.createElement('canvas');
        axisCanvas.width = cropW * scaleFactor;
        axisCanvas.height = h * scaleFactor;
        const axisCtx = axisCanvas.getContext('2d');
        if (axisCtx) {
          axisCtx.imageSmoothingEnabled = true;
          axisCtx.imageSmoothingQuality = 'high';
          axisCtx.drawImage(img, Math.floor(img.width * 0.72), 0, Math.max(1, img.width - Math.floor(img.width * 0.72)), img.height, 0, 0, axisCanvas.width, axisCanvas.height);
          rightAxisCropDataUrl = axisCanvas.toDataURL('image/jpeg', 0.92);
        }
      } catch {
        // ignore crop error
      }

      resolve({
        fullOcrDataUrl: canvas.toDataURL('image/jpeg', 0.9),
        rightAxisCropDataUrl,
        rightAxisScaleFactor: scaleFactor,
        rightAxisOffsetX: cropX,
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
  medianLeftX?: number;
  medianRightX?: number;
}

function extractContiguousSegments(
  rowScores: Float32Array,
  minY: number,
  maxY: number,
  maxGapRows = 4,
  rowLeftX?: Int16Array,
  rowRightX?: Int16Array
): VerticalSegment[] {
  const rawSegments: VerticalSegment[] = [];
  let curTop = -1;
  let curBottom = -1;
  let curSum = 0;
  let gapCount = 0;

  const finalizeSegment = (top: number, bottom: number, sum: number) => {
    const h = bottom - top + 1;
    if (h < 5) return;
    let medianLeftX = 0;
    let medianRightX = 0;
    if (rowLeftX && rowRightX) {
      const lefts: number[] = [];
      const rights: number[] = [];
      for (let y = top; y <= bottom; y++) {
        if (rowScores[y] > 0 && rowRightX[y] > rowLeftX[y]) {
          lefts.push(rowLeftX[y]);
          rights.push(rowRightX[y]);
        }
      }
      if (lefts.length > 0) {
        lefts.sort((a, b) => a - b);
        rights.sort((a, b) => a - b);
        medianLeftX = lefts[Math.floor(lefts.length / 2)];
        medianRightX = rights[Math.floor(rights.length / 2)];
      }
    }
    rawSegments.push({
      top,
      bottom,
      height: h,
      avgScore: sum / h,
      medianLeftX,
      medianRightX,
    });
  };

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
        finalizeSegment(curTop, curBottom, curSum);
        curTop = -1;
        curBottom = -1;
        curSum = 0;
        gapCount = 0;
      }
    }
  }
  if (curTop !== -1) {
    finalizeSegment(curTop, curBottom, curSum);
  }
  return rawSegments;
}

/**
 * 2D Rectangle-Aware Canvas Geometry Analyzer:
 * 1) Finds TradingView Long/Short Position Tool by matching vertically adjacent Green Profit Zone & Red Risk Zone
 *    rectangles that share the SAME horizontal [leftX, rightX] span (filtering out narrow candlesticks & volume bars).
 * 2) Refines the exact TP, Entry dividing line, and SL Y-coordinates strictly within [boxLeftX, boxRightX].
 * 3) Scans the Right-Hand Price Scale (x = 76%..99%) for Green (TP), Red (SL), and Blue/Slate (Entry) price badges.
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

      const plotMinX = Math.floor(sampleW * 0.06);
      const plotMaxX = Math.floor(sampleW * 0.78);
      const plotMinY = Math.floor(sampleH * 0.06);
      const plotMaxY = Math.floor(sampleH * 0.88);

      const isGreenZonePixel = (r: number, g: number, b: number): boolean => {
        const isDarkGreenZone = g > r + 10 && g >= 26 && b >= 20 && r < 145;
        const isLightGreenZone = g > r + 9 && g >= 180 && r < 238 && b >= 170;
        return isDarkGreenZone || isLightGreenZone;
      };

      const isRedZonePixel = (r: number, g: number, b: number): boolean => {
        const isDarkRedZone = r > g + 12 && r > b + 10 && r >= 34 && g < 135;
        const isLightRedZone = r > g + 11 && r > b + 9 && r >= 195 && g < 235;
        return isDarkRedZone || isLightRedZone;
      };

      // Helper to find the longest horizontal run of matching pixels on row y (bridging small 1-4px candle gaps)
      const findLongestHorizontalRun = (
        y: number,
        minX: number,
        maxX: number,
        predicate: (r: number, g: number, b: number) => boolean
      ): { width: number; leftX: number; rightX: number; matchCount: number } => {
        let bestW = 0;
        let bestL = 0;
        let bestR = 0;
        let bestMatches = 0;

        let curL = -1;
        let curR = -1;
        let curMatches = 0;
        let gap = 0;

        for (let x = minX; x <= maxX; x++) {
          const idx = (y * sampleW + x) * 4;
          if (predicate(imgData[idx], imgData[idx + 1], imgData[idx + 2])) {
            if (curL === -1) {
              curL = x;
              curMatches = 0;
            }
            curR = x;
            curMatches++;
            gap = 0;
          } else if (curL !== -1) {
            gap++;
            if (gap > 5) {
              const w = curR - curL + 1;
              if (w > bestW && curMatches >= w * 0.58) {
                bestW = w;
                bestL = curL;
                bestR = curR;
                bestMatches = curMatches;
              }
              curL = -1;
              curR = -1;
              curMatches = 0;
              gap = 0;
            }
          }
        }
        if (curL !== -1) {
          const w = curR - curL + 1;
          if (w > bestW && curMatches >= w * 0.58) {
            bestW = w;
            bestL = curL;
            bestR = curR;
            bestMatches = curMatches;
          }
        }
        return { width: bestW, leftX: bestL, rightX: bestR, matchCount: bestMatches };
      };

      const greenRowScore = new Float32Array(sampleH);
      const greenRowLeftX = new Int16Array(sampleH);
      const greenRowRightX = new Int16Array(sampleH);

      const redRowScore = new Float32Array(sampleH);
      const redRowLeftX = new Int16Array(sampleH);
      const redRowRightX = new Int16Array(sampleH);

      const horizLineScore = new Float32Array(sampleH);

      // Minimum horizontal box width: 42px out of 600px (7% of image width) — eliminates narrow 3-10px candlesticks!
      const minBoxRunWidth = 42;

      for (let y = plotMinY; y <= plotMaxY; y++) {
        const gRun = findLongestHorizontalRun(y, plotMinX, plotMaxX, isGreenZonePixel);
        if (gRun.width >= minBoxRunWidth) {
          greenRowScore[y] = gRun.matchCount;
          greenRowLeftX[y] = gRun.leftX;
          greenRowRightX[y] = gRun.rightX;
        }

        const rRun = findLongestHorizontalRun(y, plotMinX, plotMaxX, isRedZonePixel);
        if (rRun.width >= minBoxRunWidth) {
          redRowScore[y] = rRun.matchCount;
          redRowLeftX[y] = rRun.leftX;
          redRowRightX[y] = rRun.rightX;
        }

        let lineColoredPixels = 0;
        for (let x = plotMinX; x <= plotMaxX; x++) {
          const idx = (y * sampleW + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          if (maxC - minC >= 35 && maxC >= 75) {
            lineColoredPixels++;
          }
        }
        if (lineColoredPixels >= 95) horizLineScore[y] = lineColoredPixels;
      }

      // 2. Scan Right-Hand Price Axis (x: 77% to 99%) for Colored Price Badges (TP = Green, SL = Red, Entry = Blue/Slate)
      const axisMinX = Math.floor(sampleW * 0.77);
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

          if (g > r + 22 && g >= 75 && r < 135) gBadge++;
          if (r > g + 25 && r > b + 18 && r >= 95 && g < 125) rBadge++;
          if (b > r + 22 && b > g + 10 && b >= 90 && r < 125) bBadge++;
        }
        if (gBadge >= 12) axisGreenRows[y] = gBadge;
        if (rBadge >= 12) axisRedRows[y] = rBadge;
        if (bBadge >= 12) axisBlueRows[y] = bBadge;
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

      const horizSegs = extractContiguousSegments(horizLineScore, plotMinY, plotMaxY, 2).filter(
        (s) => s.height >= 1 && s.height <= 8
      );
      const horizontalLineYRatios = horizSegs.map((s) => (s.top + s.bottom) / 2 / sampleH);

      // 3. Match Adjacent Green & Red Vertical Segments that share the SAME horizontal [leftX, rightX] span!
      const greenSegs = extractContiguousSegments(
        greenRowScore,
        plotMinY,
        plotMaxY,
        5,
        greenRowLeftX,
        greenRowRightX
      ).filter((s) => s.height >= 8);

      const redSegs = extractContiguousSegments(
        redRowScore,
        plotMinY,
        plotMaxY,
        5,
        redRowLeftX,
        redRowRightX
      ).filter((s) => s.height >= 8);

      let bestPair: {
        g: VerticalSegment;
        r: VerticalSegment;
        isLong: boolean;
        boxLeftX: number;
        boxRightX: number;
        score: number;
      } | null = null;

      for (const g of greenSegs) {
        for (const r of redSegs) {
          const gL = g.medianLeftX ?? plotMinX;
          const gR = g.medianRightX ?? plotMaxX;
          const rL = r.medianLeftX ?? plotMinX;
          const rR = r.medianRightX ?? plotMaxX;

          const overlapL = Math.max(gL, rL);
          const overlapR = Math.min(gR, rR);
          const overlapW = Math.max(0, overlapR - overlapL);
          const minSpanW = Math.max(1, Math.min(gR - gL, rR - rL));
          const horizOverlapRatio = overlapW / minSpanW;

          // Both Green and Red rectangles of a TradingView Position Tool MUST overlap horizontally by >= 55%
          if (horizOverlapRatio < 0.55 || overlapW < minBoxRunWidth) continue;

          // Case 1: BUY (Long) -> Green Profit Zone is directly ABOVE Red Risk Zone (g.bottom ~= r.top)
          const gapBuy = Math.abs(r.top - g.bottom);
          if (gapBuy <= sampleH * 0.045 && g.top < r.bottom) {
            const score =
              ((g.height + r.height) * (g.avgScore + r.avgScore) * horizOverlapRatio) /
              (1 + gapBuy * 2.5);
            if (!bestPair || score > bestPair.score) {
              bestPair = {
                g,
                r,
                isLong: true,
                boxLeftX: overlapL,
                boxRightX: overlapR,
                score,
              };
            }
          }

          // Case 2: SELL (Short) -> Red Risk Zone is directly ABOVE Green Profit Zone (r.bottom ~= g.top)
          const gapSell = Math.abs(g.top - r.bottom);
          if (gapSell <= sampleH * 0.045 && r.top < g.bottom) {
            const score =
              ((g.height + r.height) * (g.avgScore + r.avgScore) * horizOverlapRatio) /
              (1 + gapSell * 2.5);
            if (!bestPair || score > bestPair.score) {
              bestPair = {
                g,
                r,
                isLong: false,
                boxLeftX: overlapL,
                boxRightX: overlapR,
                score,
              };
            }
          }
        }
      }

      if (bestPair) {
        const { g, r, isLong, boxLeftX, boxRightX } = bestPair;
        const boxW = Math.max(1, boxRightX - boxLeftX);

        // Refine exact top/bottom of Green & Red zones strictly inside [boxLeftX, boxRightX]
        let refinedGreenTop = g.top;
        let refinedGreenBottom = g.bottom;
        for (let y = Math.max(plotMinY, g.top - 4); y <= Math.min(plotMaxY, g.bottom + 4); y++) {
          let cnt = 0;
          for (let x = boxLeftX; x <= boxRightX; x++) {
            const idx = (y * sampleW + x) * 4;
            if (isGreenZonePixel(imgData[idx], imgData[idx + 1], imgData[idx + 2])) cnt++;
          }
          if (cnt >= boxW * 0.55) {
            if (y < refinedGreenTop) refinedGreenTop = y;
            if (y > refinedGreenBottom) refinedGreenBottom = y;
          }
        }

        let refinedRedTop = r.top;
        let refinedRedBottom = r.bottom;
        for (let y = Math.max(plotMinY, r.top - 4); y <= Math.min(plotMaxY, r.bottom + 4); y++) {
          let cnt = 0;
          for (let x = boxLeftX; x <= boxRightX; x++) {
            const idx = (y * sampleW + x) * 4;
            if (isRedZonePixel(imgData[idx], imgData[idx + 1], imgData[idx + 2])) cnt++;
          }
          if (cnt >= boxW * 0.55) {
            if (y < refinedRedTop) refinedRedTop = y;
            if (y > refinedRedBottom) refinedRedBottom = y;
          }
        }

        const greenH = Math.max(4, refinedGreenBottom - refinedGreenTop);
        const redH = Math.max(4, refinedRedBottom - refinedRedTop);
        const inferredPosition: TradePosition = isLong ? 'BUY' : 'SELL';
        const inferredRR = Math.max(0.15, Math.min(30, Number((greenH / redH).toFixed(2))));

        const entryY = isLong
          ? (refinedGreenBottom + refinedRedTop) / 2
          : (refinedRedBottom + refinedGreenTop) / 2;
        const tpY = isLong ? refinedGreenTop : refinedGreenBottom;
        const slY = isLong ? refinedRedBottom : refinedRedTop;

        resolve({
          hasPositionBox: true,
          inferredPosition,
          inferredRR,
          entryYRatio: entryY / sampleH,
          tpYRatio: tpY / sampleH,
          slYRatio: slY / sampleH,
          boxTopYRatio: Math.min(refinedGreenTop, refinedRedTop) / sampleH,
          boxBottomYRatio: Math.max(refinedGreenBottom, refinedRedBottom) / sampleH,
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

async function runOcrSpaceOnDataUrl(
  base64DataUrl: string,
  scaleDownDivisor = 1,
  offsetX = 0
): Promise<{
  fullText: string;
  lines: Array<{ text: string; centerY: number; minX: number; maxX: number }>;
  words: OcrWordBox[];
}> {
  const words: OcrWordBox[] = [];
  const lines: Array<{ text: string; centerY: number; minX: number; maxX: number }> = [];
  let fullText = '';

  try {
    const formData = new FormData();
    formData.append('apikey', 'helloworld');
    formData.append('base64Image', base64DataUrl);
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('isOverlayRequired', 'true');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9500);
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
                const left = (Number(w.Left) || 0) / scaleDownDivisor + offsetX;
                const top = (Number(w.Top) || 0) / scaleDownDivisor;
                const width = (Number(w.Width) || 0) / scaleDownDivisor;
                const height = (Number(w.Height) || 0) / scaleDownDivisor;
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
    // ignore OCR network errors
  }

  return { fullText, lines, words };
}

/**
 * Runs OCR on both the clean full chart AND the 2x-upscaled Right-Hand Price Axis strip
 * so small TP / Entry / SL badge numbers on the Y-axis are captured with 1:1 vertical Y-coordinate accuracy.
 */
async function extractChartOcrText(dataUrl: string, imageUrl?: string): Promise<{
  ocr: OcrExtractionResult;
  ocrImageWidth: number;
  ocrImageHeight: number;
}> {
  const prepared = await buildCleanOcrImages(dataUrl, 1600);

  const [fullOcr, axisOcr] = await Promise.all([
    runOcrSpaceOnDataUrl(prepared.fullOcrDataUrl, 1, 0),
    prepared.rightAxisCropDataUrl
      ? runOcrSpaceOnDataUrl(
          prepared.rightAxisCropDataUrl,
          prepared.rightAxisScaleFactor,
          prepared.rightAxisOffsetX
        )
      : Promise.resolve({ fullText: '', lines: [], words: [] }),
  ]);

  const words = [...fullOcr.words, ...axisOcr.words];
  const lines = [...fullOcr.lines, ...axisOcr.lines];
  let fullText = [fullOcr.fullText, axisOcr.fullText].filter(Boolean).join('\n');

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
    ocrImageWidth: prepared.width,
    ocrImageHeight: prepared.height,
  };
}

function getActiveChartSymbolFallback(): string {
  if (typeof window === 'undefined') return 'XAUUSD';
  try {
    const rawPrefs = window.localStorage.getItem(CHART_PREFS_STORAGE_KEY);
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs);
      if (prefs?.symbol) {
        return normalizeScanInstrument(prefs.symbol);
      }
    }
  } catch {
    // ignore
  }
  return 'XAUUSD';
}

/**
 * Fits a robust Theil-Sen linear price-scale model P(y) = slope * y + intercept
 * from right-axis OCR price numbers (where price decreases as pixel Y increases downward).
 */
function buildRobustPriceAxisModel(
  axisCandidates: Array<{ val: number; y: number }>,
  decimals: number
): {
  priceAtY: (y: number) => number;
  findClosestBadgePriceAtY: (targetY: number, maxPixelDist: number) => number | null;
  minAxisPrice: number;
  maxAxisPrice: number;
} | null {
  if (axisCandidates.length < 2) return null;

  const sorted = axisCandidates.slice().sort((a, b) => a.y - b.y);
  const slopes: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dy = sorted[j].y - sorted[i].y;
      const dp = sorted[j].val - sorted[i].val;
      // On a chart Y-axis, lower on screen (larger Y) means lower price (dp < 0)
      if (dy >= 10 && dp < 0) {
        slopes.push(dp / dy);
      }
    }
  }

  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const medianSlope = slopes[Math.floor(slopes.length / 2)];

  const intercepts = sorted.map((pt) => pt.val - medianSlope * pt.y).sort((a, b) => a - b);
  const medianIntercept = intercepts[Math.floor(intercepts.length / 2)];

  const priceAtY = (y: number): number => {
    const raw = medianSlope * y + medianIntercept;
    return Number(raw.toFixed(decimals));
  };

  const findClosestBadgePriceAtY = (targetY: number, maxPixelDist: number): number | null => {
    let best: { price: number; dist: number } | null = null;
    const expectedPrice = priceAtY(targetY);
    const maxAllowedPriceDiff = Math.abs(medianSlope) * maxPixelDist * 2.5;

    for (const cand of sorted) {
      const dist = Math.abs(cand.y - targetY);
      if (
        dist <= maxPixelDist &&
        Math.abs(cand.val - expectedPrice) <= Math.max(maxAllowedPriceDiff, 1e-4)
      ) {
        if (!best || dist < best.dist) {
          best = { price: Number(cand.val.toFixed(decimals)), dist };
        }
      }
    }
    return best ? best.price : null;
  };

  const allVals = sorted.map((c) => c.val);
  const minAxisPrice = Math.min(...allVals);
  const maxAxisPrice = Math.max(...allVals);

  return { priceAtY, findClosestBadgePriceAtY, minAxisPrice, maxAxisPrice };
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
  let mt5CurrentFromArrow: number | null = null;
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

    // Match MT5 Trade/History Tab "<entryPrice> -> <currentPrice>" arrow syntax (e.g. "3320.50 -> 3328.10")
    const arrowMatch = t.match(
      /\b([0-9]{1,6}(?:[ ,][0-9]{3})*\.[0-9]{1,5})\s*(?:->|→|-›|=>)\s*([0-9]{1,6}(?:[ ,][0-9]{3})*\.[0-9]{1,5})\b/
    );
    if (arrowMatch) {
      const p1 = parseFloat(arrowMatch[1].replace(/[ ,]/g, ''));
      const p2 = parseFloat(arrowMatch[2].replace(/[ ,]/g, ''));
      if (!isNaN(p1) && p1 > 0) mt5EntryFromText = p1;
      if (!isNaN(p2) && p2 > 0) mt5CurrentFromArrow = p2;
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

  if (mt5EntryFromText === null) {
    const fullArrowMatch = combinedText.match(
      /\b([0-9]{1,6}(?:[ ,][0-9]{3})*\.[0-9]{1,5})\s*(?:->|→|-›|=>)\s*([0-9]{1,6}(?:[ ,][0-9]{3})*\.[0-9]{1,5})\b/
    );
    if (fullArrowMatch) {
      const p1 = parseFloat(fullArrowMatch[1].replace(/[ ,]/g, ''));
      const p2 = parseFloat(fullArrowMatch[2].replace(/[ ,]/g, ''));
      if (!isNaN(p1) && p1 > 0) mt5EntryFromText = p1;
      if (!isNaN(p2) && p2 > 0) mt5CurrentFromArrow = p2;
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

  if (!instrument) {
    instrument = getActiveChartSymbolFallback();
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
    if (priceSpec.decimals === 5 && (t.raw === '1.00' || t.raw === '1.0')) return false;
    return true;
  });

  // 5. Build Robust Linear Y-Axis Price Model P(y) = slope * y + intercept FIRST
  // so we know the visible viewport price bounds [minAxisPrice, maxAxisPrice]
  const rightAxisTokens = validPriceTokens.filter((t) => t.isRightAxis && t.y > 0);
  const axisModel = buildRobustPriceAxisModel(
    rightAxisTokens.length >= 2 ? rightAxisTokens : validPriceTokens.filter((t) => t.y > 0),
    priceSpec.decimals
  );

  const isWithinVisibleAxisRange = (val: number): boolean => {
    if (val < priceSpec.min || val > priceSpec.max) return false;
    if (!axisModel) return true;
    const span = Math.max(priceSpec.defaultPipStep * 4, (axisModel.maxAxisPrice - axisModel.minAxisPrice) * 1.25);
    return val >= axisModel.minAxisPrice - span && val <= axisModel.maxAxisPrice + span;
  };

  // 6. Extract Explicit Labeled Prices (Target/TP, Stop/SL, Entry)
  // NOTE: Do NOT match bare `\bopen` because TradingView labels say "Open P&L: -1520.00" and chart headers say "Open 4012.50"!
  let explicitEntry: number | null =
    mt5EntryFromText !== null && isWithinVisibleAxisRange(mt5EntryFromText)
      ? mt5EntryFromText
      : null;
  let explicitSL: number | null = null;
  let explicitTP: number | null = null;
  let explicitRR: number | null = null;
  let explicitProfit: number | null = null;

  const entryMatch = combinedText.match(
    /(?:entry\s*price|open\s*price|harga\s*entry|\bentry\s*[:=@])\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (entryMatch?.[1] && explicitEntry === null) {
    const v = parseFloat(entryMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && isWithinVisibleAxisRange(v)) explicitEntry = v;
  }

  const slMatch = combinedText.match(
    /(?:stop\s*loss|\bstop\s*[:=]|\bs\/l\s*[:=]?|\bsl\s*[:=])\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (slMatch?.[1]) {
    const v = parseFloat(slMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && isWithinVisibleAxisRange(v)) explicitSL = v;
  }

  const tpMatch = combinedText.match(
    /(?:take\s*profit|\btarget\s*[:=]|\bt\/p\s*[:=]?|\btp\s*[:=])\s*([0-9][0-9, ]*\.[0-9]{1,5})/i
  );
  if (tpMatch?.[1]) {
    const v = parseFloat(tpMatch[1].replace(/[ ,]/g, ''));
    if (!isNaN(v) && isWithinVisibleAxisRange(v)) explicitTP = v;
  }

  const rrMatch = combinedText.match(
    /(?:risk\/reward(?:\s*ratio)?|r:r|\brr\b|1\s*:)\s*[:=]?\s*(\d+(?:\.\d{1,2})?)/i
  );
  if (rrMatch?.[1]) {
    const v = parseFloat(rrMatch[1]);
    if (!isNaN(v) && v >= 0.15 && v <= 30) explicitRR = v;
  }

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
    position =
      canvasGeom.rightAxisGreenBadgeYRatio < canvasGeom.rightAxisRedBadgeYRatio ? 'BUY' : 'SELL';
  } else if (mt5TpLineY !== null && mt5SlLineY !== null && mt5TpLineY !== mt5SlLineY) {
    position = mt5TpLineY < mt5SlLineY ? 'BUY' : 'SELL';
  } else if (/\b(SHORT|SELL)\b/i.test(combinedText) && !/\b(LONG|BUY)\b/i.test(combinedText)) {
    position = 'SELL';
  }

  // 8. Resolve Entry, TP, and SL Prices using Y-Coordinate Badge Alignment + Theil-Sen Linear Scale Model
  let entryPrice = explicitEntry;
  let takeProfit = explicitTP;
  let stopLoss = explicitSL;

  const badgeTolerancePx = Math.max(14, imgH * 0.028);

  const resolvePriceAtTargetY = (targetY: number | null): number | null => {
    if (targetY === null || !Number.isFinite(targetY)) return null;
    if (axisModel) {
      const directBadge = axisModel.findClosestBadgePriceAtY(targetY, badgeTolerancePx);
      if (directBadge !== null) return directBadge;
      const interpolated = axisModel.priceAtY(targetY);
      if (interpolated >= priceSpec.min && interpolated <= priceSpec.max) {
        return interpolated;
      }
    } else {
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

  if (takeProfit === null) takeProfit = resolvePriceAtTargetY(targetTpY);
  if (stopLoss === null) stopLoss = resolvePriceAtTargetY(targetSlY);
  if (entryPrice === null) entryPrice = resolvePriceAtTargetY(targetEntryY);

  // Case B: If TradingView Position Box is detected and TP & SL are known, verify Entry against the exact Green/Red dividing line!
  if (
    canvasGeom.hasPositionBox &&
    takeProfit !== null &&
    stopLoss !== null &&
    Math.abs(takeProfit - stopLoss) > 0 &&
    canvasGeom.tpYRatio !== null &&
    canvasGeom.slYRatio !== null &&
    canvasGeom.entryYRatio !== null &&
    Math.abs(canvasGeom.slYRatio - canvasGeom.tpYRatio) > 0.02
  ) {
    const entryFraction =
      (canvasGeom.entryYRatio - canvasGeom.tpYRatio) /
      (canvasGeom.slYRatio - canvasGeom.tpYRatio);
    if (entryFraction > 0.05 && entryFraction < 0.95) {
      const geomEntry = Number(
        (takeProfit - entryFraction * (takeProfit - stopLoss)).toFixed(priceSpec.decimals)
      );
      if (
        entryPrice === null ||
        Math.abs(entryPrice - geomEntry) > Math.abs(takeProfit - stopLoss) * 0.16
      ) {
        entryPrice = geomEntry;
      }
    }
  }

  // Case C: If MT5 horizontal lines were detected on Canvas and some level is still missing
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

  // Case D: If exactly 3 price badges were read on the screenshot (e.g. TP, Entry, SL badges), assign by vertical/price order
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

  // 10. Enforce Strict Directional Consistency & Populate Missing SL / TP
  if (stopLoss !== null && takeProfit !== null && stopLoss !== takeProfit) {
    if (!canvasGeom.hasPositionBox && !mt5OrderDirection) {
      position = takeProfit > stopLoss ? 'BUY' : 'SELL';
    } else if (
      (position === 'BUY' && takeProfit < stopLoss) ||
      (position === 'SELL' && takeProfit > stopLoss)
    ) {
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

  // 11. Strict Lot Size Rule:
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
    currentPrice: mt5CurrentFromArrow ?? entryPrice,
    confidence: 0.94,
    notes: `Terdeteksi otomatis (${summaryParts.join(' · ')})`,
    modelUsed: 'hybrid-apk-vision-v3',
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

  // Step 1: Resolve image into Data URL if needed and run fast (~15ms) 2D Canvas Geometry Analysis first
  // so both the Gemini Vision Server AND the On-Device Scanner receive exact Position Box Y-coordinates!
  let dataUrlToAnalyze: string | null = isDataUrl ? trimmed : null;
  let pageTitle = '';
  let pageDescription = '';

  if (!isDataUrl) {
    const fetched = await fetchImageUrlAsDataUrl(trimmed);
    dataUrlToAnalyze = fetched.dataUrl;
    pageTitle = fetched.pageTitle;
    pageDescription = fetched.pageDescription;
  }

  const canvasGeom: CanvasZoneAnalysis = dataUrlToAnalyze
    ? await analyzeChartCanvasGeometry(dataUrlToAnalyze)
    : {
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
      };

  // Step 2: Try Server-Side Gemini 3 Vision API (both relative `/api/...` for Web and Cloud Run URLs for Android APK)
  const payload: {
    imageBase64?: string;
    imageUrl?: string;
    canvasHints?: CanvasZoneAnalysis;
  } = {
    canvasHints: canvasGeom,
  };
  if (dataUrlToAnalyze) {
    payload.imageBase64 = dataUrlToAnalyze;
  } else {
    payload.imageUrl = tvResolved.directImageUrl || trimmed;
  }

  for (const endpoint of REMOTE_SCAN_API_ENDPOINTS) {
    const serverRes = await safeFetchApiJson(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      12000
    );

    if (serverRes.ok && serverRes.json?.success && serverRes.json?.data) {
      const d = serverRes.json.data as ExtractedTradeScanData;
      if (d.entryPrice !== null && d.entryPrice > 0) {
        const isMt5 = d.source === 'MT5';
        return {
          ...d,
          lotSize: isMt5 ? d.lotSize : null,
          resolvedImageUrl: !isDataUrl ? tvResolved.directImageUrl : undefined,
        };
      }
    }
  }

  // Step 3: Standalone Android APK Offline / Fallback Multi-Pass OCR + 2D Canvas Geometry Scanner
  const ocrPack = dataUrlToAnalyze
    ? await extractChartOcrText(dataUrlToAnalyze, tvResolved.directImageUrl)
    : {
        ocr: { fullText: '', lines: [], words: [] },
        ocrImageWidth: 1000,
        ocrImageHeight: 600,
      };

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
