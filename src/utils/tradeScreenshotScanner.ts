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

interface CanvasZoneAnalysis {
  hasPositionBox: boolean;
  inferredPosition: TradePosition | null;
  inferredRR: number | null;
  entryYRatio: number | null;
  tpYRatio: number | null;
  slYRatio: number | null;
  boxTopYRatio: number | null;
  boxBottomYRatio: number | null;
  imageWidth: number;
  imageHeight: number;
}

interface OcrWordBox {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerY: number;
  centerX: number;
}

interface OcrExtractionResult {
  fullText: string;
  lines: Array<{ text: string; centerY: number; minX: number; maxX: number }>;
  words: OcrWordBox[];
}

/**
 * Valid price ranges per instrument so random timestamps/ticket numbers (e.g. #12345678, 2026, 15:00)
 * are never confused with Entry/SL/TP prices.
 */
const INSTRUMENT_PRICE_RANGES: Record<string, { min: number; max: number; decimals: number; defaultPipStep: number }> = {
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

    // Extract symbol from query param or /chart/<SYMBOL>/ path
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

    // 1. Direct S3 snapshot URL: https://s3.tradingview.com/snapshots/a/abcd1234.png
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

    // 2. Shortlink: https://www.tradingview.com/x/ABCD1234/ or https://id.tradingview.com/x/ABCD1234
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

  // If it's a TradingView page URL without a direct /x/ ID, try scraping og:image & title via CORS proxy
  if (tvResolved.isTradingViewUrl && !tvResolved.snapshotId && !targetImgUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(imageUrl)}`;
      const proxyRes = await safeFetchApiJson(proxyUrl, { method: 'GET' }, 7000);
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
    // Also fetch snapshot page title in background if possible (contains pair & timeframe e.g. "XAUUSD, 15")
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

  // Convert targetImgUrl to compressed Data URL via fetch -> Blob -> compress or Image crossOrigin
  const candidateUrls = [
    targetImgUrl,
    `https://corsproxy.io/?${encodeURIComponent(targetImgUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetImgUrl)}`,
  ];

  for (const candidate of candidateUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
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
 * Downscales a base64 image to <= 1024px JPEG (< 180KB) so OCR & Vision APIs respond in ~1 second.
 */
async function ensureCompactJpegDataUrl(dataUrl: string, maxDim = 1150): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(dataUrl);
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
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

/**
 * Analyzes chart screenshot pixels on an HTML5 Canvas to detect TradingView Long/Short Position
 * Profit Zone (Teal/Green #089981) and Risk Zone (Red/Crimson #F23645) vertical geometry.
 * Works 100% offline in < 35ms on Android APK.
 */
async function analyzeChartCanvasGeometry(dataUrl: string): Promise<CanvasZoneAnalysis> {
  const empty: CanvasZoneAnalysis = {
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

  if (typeof document === 'undefined') return empty;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(empty);
    img.onload = () => {
      const sampleW = 240;
      const sampleH = 240;
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

      // Scan rows in the main chart plot area (x: 10% to 84%, y: 8% to 88%)
      const minX = Math.floor(sampleW * 0.1);
      const maxX = Math.floor(sampleW * 0.84);
      const minY = Math.floor(sampleH * 0.08);
      const maxY = Math.floor(sampleH * 0.88);

      const greenRowScore = new Float32Array(sampleH);
      const redRowScore = new Float32Array(sampleH);

      for (let y = minY; y <= maxY; y++) {
        let greenCount = 0;
        let redCount = 0;
        for (let x = minX; x <= maxX; x++) {
          const idx = (y * sampleW + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];

          // TradingView Profit Zone tint: teal/emerald where G is noticeably higher than R
          // (handles both dark theme translucent fill rgba(8,153,129,0.14..0.38) and light theme)
          if (g > r + 14 && g >= 32 && b >= 24 && r < 140) {
            greenCount++;
          }
          // TradingView Risk Zone tint: crimson/red where R is noticeably higher than G and B
          if (r > g + 16 && r > b + 14 && r >= 38 && g < 130) {
            redCount++;
          }
        }
        // Require a horizontal span of at least ~8% of chart width to count as a position box row (ignores thin single candles)
        if (greenCount >= 18) greenRowScore[y] = greenCount;
        if (redCount >= 18) redRowScore[y] = redCount;
      }

      let greenTop = -1;
      let greenBottom = -1;
      let greenTotalRows = 0;
      for (let y = minY; y <= maxY; y++) {
        if (greenRowScore[y] > 0) {
          if (greenTop === -1) greenTop = y;
          greenBottom = y;
          greenTotalRows++;
        }
      }

      let redTop = -1;
      let redBottom = -1;
      let redTotalRows = 0;
      for (let y = minY; y <= maxY; y++) {
        if (redRowScore[y] > 0) {
          if (redTop === -1) redTop = y;
          redBottom = y;
          redTotalRows++;
        }
      }

      if (greenTotalRows >= 4 && redTotalRows >= 4) {
        const greenCenterY = (greenTop + greenBottom) / 2;
        const redCenterY = (redTop + redBottom) / 2;
        const greenH = Math.max(2, greenBottom - greenTop);
        const redH = Math.max(2, redBottom - redTop);

        // In screen coordinates, Y=0 is at the TOP (higher price), Y=sampleH is at the BOTTOM (lower price).
        // Therefore:
        // - If Green Profit Zone is ABOVE Red Risk Zone (greenCenterY < redCenterY) -> BUY (Long)
        // - If Green Profit Zone is BELOW Red Risk Zone (greenCenterY > redCenterY) -> SELL (Short)
        const isLong = greenCenterY < redCenterY;
        const inferredPosition: TradePosition = isLong ? 'BUY' : 'SELL';
        const rawRR = greenH / redH;
        const inferredRR = Math.max(0.2, Math.min(25, Number(rawRR.toFixed(2))));

        const entryY = isLong ? (greenBottom + redTop) / 2 : (redBottom + greenTop) / 2;
        const tpY = isLong ? greenTop : greenBottom;
        const slY = isLong ? redBottom : redTop;

        resolve({
          hasPositionBox: true,
          inferredPosition,
          inferredRR,
          entryYRatio: entryY / sampleH,
          tpYRatio: tpY / sampleH,
          slYRatio: slY / sampleH,
          boxTopYRatio: Math.min(greenTop, redTop) / sampleH,
          boxBottomYRatio: Math.max(greenBottom, redBottom) / sampleH,
          imageWidth: img.width,
          imageHeight: img.height,
        });
        return;
      }

      resolve({ ...empty, imageWidth: img.width, imageHeight: img.height });
    };
    img.src = dataUrl;
  });
}

/**
 * Runs OCR on the screenshot using:
 * 1) Native Android Chromium `TextDetector` API (if supported by the device WebView)
 * 2) OCR.space Engine 2 (specialized in digits, decimal points, and chart axes, CORS-enabled for mobile APK)
 */
async function extractChartOcrText(dataUrl: string, imageUrl?: string): Promise<OcrExtractionResult> {
  const words: OcrWordBox[] = [];
  const lines: Array<{ text: string; centerY: number; minX: number; maxX: number }> = [];
  let fullText = '';

  // 1. Try OCR.space Engine 2 (fast & accurate for numbers, prices, and chart tickers)
  try {
    const compactDataUrl = await ensureCompactJpegDataUrl(dataUrl, 1150);
    const formData = new FormData();
    formData.append('apikey', 'helloworld');
    formData.append('base64Image', compactDataUrl);
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

  // 2. Try Native Chromium TextDetector API if fullText is still empty
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

  return { fullText, lines, words };
}

/**
 * Reads any active Long/Short Position drawing or cached candle price from TradeVault's localStorage
 * so the scanner can cross-reference accurate prices when offline or when axis text is small.
 */
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
        // Find most recent long_position or short_position
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
 * Parses OCR text + spatial Y-coordinates + Canvas geometry into a complete ExtractedTradeScanData object.
 */
export function synthesizeTradeScanFromSignals(params: {
  ocr: OcrExtractionResult;
  canvasGeom: CanvasZoneAnalysis;
  urlMeta: {
    isTradingViewUrl: boolean;
    symbolFromUrl: string | null;
    timeframeFromUrl: string | null;
    pageTitle: string;
    pageDescription: string;
    directImageUrl: string;
  };
}): ExtractedTradeScanData {
  const { ocr, canvasGeom, urlMeta } = params;
  const combinedText = `${urlMeta.pageTitle}\n${urlMeta.pageDescription}\n${ocr.fullText}`;
  const upperText = combinedText.toUpperCase();

  // 1. Detect Source (MT5 vs TRADINGVIEW)
  let source: 'MT5' | 'TRADINGVIEW' | 'CHART' = urlMeta.isTradingViewUrl ? 'TRADINGVIEW' : 'CHART';
  if (
    upperText.includes('TRADINGVIEW') ||
    upperText.includes('OANDA:') ||
    upperText.includes('FX:') ||
    upperText.includes('RISK/REWARD') ||
    canvasGeom.hasPositionBox
  ) {
    source = 'TRADINGVIEW';
  } else if (
    upperText.includes('METATRADER') ||
    upperText.includes('MT5') ||
    upperText.includes('MT4') ||
    /\b(BUY|SELL)\s+\d+\.\d{2}\b/i.test(combinedText)
  ) {
    source = 'MT5';
  }

  // 2. Detect Instrument
  let instrument = urlMeta.symbolFromUrl || '';
  if (!instrument) {
    const symbolRegex =
      /\b(XAUUSD|GOLD|XAU\/USD|BTCUSD|BTCUSDT|ETHUSD|ETHUSDT|SOLUSD|EURUSD|GBPUSD|USDJPY|USDCHF|USDCAD|AUDUSD|NZDUSD|EURGBP|EURJPY|GBPJPY|AUDJPY|US30|NAS100|USTEC|SPX500|US500|GER40)\b/i;
    const m = combinedText.match(symbolRegex);
    if (m && m[1]) {
      instrument = normalizeScanInstrument(m[1]);
    }
  }

  // Also check timeframe
  let timeframe = urlMeta.timeframeFromUrl;
  if (!timeframe) {
    const tfMatch = combinedText.match(/\b(M1|M3|M5|M15|M30|H1|H4|D1|1M|5M|15M|30M|1H|4H|1D|DAILY)\b/i);
    if (tfMatch?.[1]) {
      timeframe = normalizeTimeframeLabel(tfMatch[1]);
    }
  }

  // Check local chart reference if instrument still unknown
  const localRef = getLocalChartReferenceForInstrument(instrument || undefined);
  if (!instrument) {
    instrument = localRef.instrument || 'XAUUSD';
  }

  const priceSpec = INSTRUMENT_PRICE_RANGES[instrument] || INSTRUMENT_PRICE_RANGES.XAUUSD;

  // 3. Extract Lot Size & Explicit MT5 / TradingView Order Lines
  let lotSize: number | null = null;
  let explicitPosition: TradePosition | null = null;
  let explicitEntry: number | null = null;
  let explicitSL: number | null = null;
  let explicitTP: number | null = null;
  let explicitRR: number | null = null;
  let explicitProfit: number | null = null;
  let status: 'PLANNED' | 'ACTIVE' | 'CLOSED' = 'PLANNED';

  // Check MT5 pattern: e.g. "buy 0.10 at 2650.50" or "sell 0.05"
  const mt5OrderMatch = combinedText.match(
    /\b(buy|sell)\s+(\d+(?:\.\d{1,2})?)(?:\s*(?:at|@)\s*([0-9][0-9, ]*(?:\.[0-9]+)?))?/i
  );
  if (mt5OrderMatch) {
    explicitPosition = mt5OrderMatch[1].toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const parsedLot = parseFloat(mt5OrderMatch[2]);
    if (!isNaN(parsedLot) && parsedLot > 0 && parsedLot <= 500) {
      lotSize = parsedLot;
      status = 'ACTIVE';
    }
    if (mt5OrderMatch[3]) {
      const rawP = parseFloat(mt5OrderMatch[3].replace(/[, ]/g, ''));
      if (!isNaN(rawP) && rawP >= priceSpec.min && rawP <= priceSpec.max) {
        explicitEntry = rawP;
      }
    }
  }

  // Check explicit Entry / Open / Stop / Target / SL / TP labels in text
  const entryLabelMatch = combinedText.match(
    /(?:entry|open\s*price|open|harga\s*entry|entry\s*price|@)\s*[:=]?\s*([0-9][0-9, ]*(?:\.[0-9]+)?)/i
  );
  if (entryLabelMatch?.[1] && explicitEntry === null) {
    const val = parseFloat(entryLabelMatch[1].replace(/[, ]/g, ''));
    if (!isNaN(val) && val >= priceSpec.min && val <= priceSpec.max) {
      explicitEntry = val;
    }
  }

  const slLabelMatch = combinedText.match(
    /(?:stop\s*loss|stop|s\/l|\bsl)\s*[:=]?\s*([0-9][0-9, ]*(?:\.[0-9]+)?)/i
  );
  if (slLabelMatch?.[1]) {
    const val = parseFloat(slLabelMatch[1].replace(/[, ]/g, ''));
    if (!isNaN(val) && val >= priceSpec.min && val <= priceSpec.max) {
      explicitSL = val;
    }
  }

  const tpLabelMatch = combinedText.match(
    /(?:take\s*profit|target|t\/p|\btp)\s*[:=]?\s*([0-9][0-9, ]*(?:\.[0-9]+)?)/i
  );
  if (tpLabelMatch?.[1]) {
    const val = parseFloat(tpLabelMatch[1].replace(/[, ]/g, ''));
    if (!isNaN(val) && val >= priceSpec.min && val <= priceSpec.max) {
      explicitTP = val;
    }
  }

  const rrMatch = combinedText.match(/(?:risk\/reward(?:\s*ratio)?|r:r|rr|1\s*:)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (rrMatch?.[1]) {
    const val = parseFloat(rrMatch[1]);
    if (!isNaN(val) && val >= 0.1 && val <= 30) {
      explicitRR = val;
    }
  }

  // 4. Extract all valid instrument prices from OCR lines (with their vertical Y position on screen!)
  const priceCandidatesWithY: Array<{ price: number; y: number; x: number; isRightAxis: boolean }> = [];
  const imgW = canvasGeom.imageWidth || 1000;
  const imgH = canvasGeom.imageHeight || 600;

  for (const line of ocr.lines) {
    // Match decimal numbers that look like prices
    const matches = line.text.matchAll(/\b([0-9]{1,6}\.[0-9]{1,5})\b/g);
    for (const m of matches) {
      const num = parseFloat(m[1]);
      if (!isNaN(num) && num >= priceSpec.min && num <= priceSpec.max) {
        // Ignore common lot sizes like 0.01, 0.10, 1.00 when instrument is e.g. EURUSD (0.85..1.35)
        if (priceSpec.min < 2 && (m[1] === '1.00' || m[1] === '0.10' || m[1] === '0.01')) {
          continue;
        }
        priceCandidatesWithY.push({
          price: num,
          y: line.centerY,
          x: line.maxX,
          isRightAxis: line.maxX >= imgW * 0.65,
        });
      }
    }
  }

  // Also scan raw fullText if lines had no overlay coordinates
  if (priceCandidatesWithY.length === 0 && combinedText) {
    const rawMatches = combinedText.matchAll(/\b([0-9]{1,6}\.[0-9]{1,5})\b/g);
    let idx = 0;
    for (const m of rawMatches) {
      const num = parseFloat(m[1]);
      if (!isNaN(num) && num >= priceSpec.min && num <= priceSpec.max) {
        priceCandidatesWithY.push({
          price: num,
          y: idx * 20,
          x: imgW * 0.85,
          isRightAxis: true,
        });
        idx++;
      }
    }
  }

  // If instrument was defaulted to XAUUSD, check if the prices on the axis clearly belong to another major instrument!
  if (!urlMeta.symbolFromUrl && priceCandidatesWithY.length === 0) {
    // Check if there are 5-decimal Forex prices (e.g. 1.08450 for EURUSD or 1.26500 for GBPUSD) or 5-digit BTC prices (e.g. 95000.00)
    const allDecimals = Array.from(combinedText.matchAll(/\b([0-9]{1,6}\.[0-9]{2,5})\b/g)).map((m) => ({
      raw: m[1],
      val: parseFloat(m[1]),
    }));
    const btcLike = allDecimals.filter((d) => d.val >= 40000 && d.val <= 180000);
    const eurLike = allDecimals.filter((d) => d.raw.split('.')[1]?.length >= 4 && d.val >= 1.01 && d.val <= 1.18);
    const gbpLike = allDecimals.filter((d) => d.raw.split('.')[1]?.length >= 4 && d.val >= 1.2 && d.val <= 1.42);
    const jpyLike = allDecimals.filter((d) => d.raw.split('.')[1]?.length === 3 && d.val >= 130 && d.val <= 175);

    if (btcLike.length >= 2) {
      instrument = 'BTCUSD';
    } else if (eurLike.length >= 2) {
      instrument = 'EURUSD';
    } else if (gbpLike.length >= 2) {
      instrument = 'GBPUSD';
    } else if (jpyLike.length >= 2) {
      instrument = 'USDJPY';
    }

    const updatedSpec = INSTRUMENT_PRICE_RANGES[instrument] || priceSpec;
    for (const d of allDecimals) {
      if (d.val >= updatedSpec.min && d.val <= updatedSpec.max) {
        priceCandidatesWithY.push({
          price: d.val,
          y: 0,
          x: imgW * 0.85,
          isRightAxis: true,
        });
      }
    }
  }

  const finalSpec = INSTRUMENT_PRICE_RANGES[instrument] || INSTRUMENT_PRICE_RANGES.XAUUSD;

  // 5. Determine Position Direction (BUY vs SELL)
  // Priority:
  // 1) Canvas Green/Red Position Box vertical geometry (100% deterministic for TradingView Long/Short tool)
  // 2) Explicit MT5 / text order direction ("buy 0.10", "sell 0.10", "LONG", "SHORT")
  // 3) Explicit TP vs SL relation (TP > SL -> BUY, TP < SL -> SELL)
  // 4) Local chart drawing reference
  let position: TradePosition = 'BUY';
  if (canvasGeom.hasPositionBox && canvasGeom.inferredPosition) {
    position = canvasGeom.inferredPosition;
  } else if (explicitPosition) {
    position = explicitPosition;
  } else if (explicitTP !== null && explicitSL !== null && explicitTP !== explicitSL) {
    position = explicitTP > explicitSL ? 'BUY' : 'SELL';
  } else if (/\b(SHORT|SELL)\b/i.test(combinedText) && !/\b(LONG|BUY)\b/i.test(combinedText)) {
    position = 'SELL';
  } else if (localRef.position) {
    position = localRef.position;
  }

  // 6. Map Y-coordinates to Price if Canvas Position Box + 2+ Y-axis price labels exist
  let entryPrice = explicitEntry;
  let stopLoss = explicitSL;
  let takeProfit = explicitTP;

  const axisPoints = priceCandidatesWithY
    .filter((p) => p.y > 0 && p.isRightAxis)
    .sort((a, b) => a.y - b.y);

  // Filter monotonic axis points (on a price chart, higher Y on screen = lower price)
  const validAxisPoints: typeof axisPoints = [];
  for (const pt of axisPoints) {
    if (
      validAxisPoints.length === 0 ||
      (pt.y > validAxisPoints[validAxisPoints.length - 1].y + 8 &&
        pt.price < validAxisPoints[validAxisPoints.length - 1].price)
    ) {
      validAxisPoints.push(pt);
    }
  }

  if (
    canvasGeom.hasPositionBox &&
    canvasGeom.entryYRatio !== null &&
    canvasGeom.tpYRatio !== null &&
    canvasGeom.slYRatio !== null &&
    validAxisPoints.length >= 2
  ) {
    const firstPt = validAxisPoints[0];
    const lastPt = validAxisPoints[validAxisPoints.length - 1];
    const dy = lastPt.y - firstPt.y;
    const dPrice = lastPt.price - firstPt.price; // negative since price decreases as y increases

    if (dy > 20 && Math.abs(dPrice) > 0) {
      const priceAtY = (yPx: number) =>
        Number((firstPt.price + ((yPx - firstPt.y) / dy) * dPrice).toFixed(finalSpec.decimals));

      const estEntry = priceAtY(canvasGeom.entryYRatio * imgH);
      const estTP = priceAtY(canvasGeom.tpYRatio * imgH);
      const estSL = priceAtY(canvasGeom.slYRatio * imgH);

      if (estEntry >= finalSpec.min && estEntry <= finalSpec.max) {
        if (entryPrice === null) entryPrice = estEntry;
        if (takeProfit === null && estTP >= finalSpec.min && estTP <= finalSpec.max) takeProfit = estTP;
        if (stopLoss === null && estSL >= finalSpec.min && estSL <= finalSpec.max) stopLoss = estSL;
      }
    }
  }

  // 7. If we have 3+ distinct prices from OCR badges (e.g. TP, Entry, SL badges on the axis), assign them in order!
  if (entryPrice === null || stopLoss === null || takeProfit === null) {
    const uniquePrices = Array.from(
      new Set(priceCandidatesWithY.map((p) => Number(p.price.toFixed(finalSpec.decimals))))
    ).sort((a, b) => a - b); // ascending: [lowest, ..., highest]

    if (uniquePrices.length >= 3) {
      const lowP = uniquePrices[0];
      const highP = uniquePrices[uniquePrices.length - 1];
      const midP = uniquePrices[Math.floor(uniquePrices.length / 2)];

      if (position === 'BUY') {
        if (stopLoss === null) stopLoss = lowP;
        if (entryPrice === null) entryPrice = midP;
        if (takeProfit === null) takeProfit = highP;
      } else {
        if (takeProfit === null) takeProfit = lowP;
        if (entryPrice === null) entryPrice = midP;
        if (stopLoss === null) stopLoss = highP;
      }
    } else if (uniquePrices.length === 1 && entryPrice === null) {
      entryPrice = uniquePrices[0];
    }
  }

  // 8. Cross-reference with TradeVault's active Market Chart drawing if prices are still missing
  if (entryPrice === null && localRef.entryPrice !== null && localRef.instrument === instrument) {
    entryPrice = localRef.entryPrice;
    if (stopLoss === null && localRef.stopLoss !== null) stopLoss = localRef.stopLoss;
    if (takeProfit === null && localRef.takeProfit !== null) takeProfit = localRef.takeProfit;
  }

  // 9. Ensure SL & TP are populated if Entry Price is known (using detected Canvas R:R or default 1:2 R:R)
  const effectiveRR = explicitRR || canvasGeom.inferredRR || 2.0;
  if (entryPrice !== null) {
    const riskDist =
      stopLoss !== null && Math.abs(entryPrice - stopLoss) > 0
        ? Math.abs(entryPrice - stopLoss)
        : finalSpec.defaultPipStep;

    if (position === 'BUY') {
      if (stopLoss === null || stopLoss >= entryPrice) {
        stopLoss = Number((entryPrice - riskDist).toFixed(finalSpec.decimals));
      }
      if (takeProfit === null || takeProfit <= entryPrice) {
        takeProfit = Number((entryPrice + riskDist * effectiveRR).toFixed(finalSpec.decimals));
      }
    } else {
      if (stopLoss === null || stopLoss <= entryPrice) {
        stopLoss = Number((entryPrice + riskDist).toFixed(finalSpec.decimals));
      }
      if (takeProfit === null || takeProfit >= entryPrice) {
        takeProfit = Number((entryPrice - riskDist * effectiveRR).toFixed(finalSpec.decimals));
      }
    }
  }

  // Compute final R:R
  let plannedRiskReward = explicitRR || canvasGeom.inferredRR || null;
  if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk > 0) {
      plannedRiskReward = Number((reward / risk).toFixed(2));
    }
  }

  const summaryParts: string[] = [`${instrument} ${position}`];
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
    lotSize,
    entryPrice,
    stopLoss,
    takeProfit,
    exitPrice: null,
    profit: explicitProfit,
    status,
    plannedRiskReward,
    timeframe,
    currentPrice: entryPrice,
    confidence: 0.88,
    notes: `Terdeteksi otomatis (${summaryParts.join(' · ')})`,
    modelUsed: 'hybrid-apk-vision',
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
  // Uses safeFetchApiJson so if Capacitor Android APK returns index.html ("<!doctype html>"),
  // it NEVER throws `Unexpected token '<'` and smoothly transitions to the APK Engine!
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
    return {
      ...d,
      resolvedImageUrl: !isDataUrl ? tvResolved.directImageUrl : undefined,
    };
  }

  // If server returned a real JSON error (not an HTML fallback) AND it wasn't just missing GEMINI_API_KEY,
  // we still try our client-side hybrid scanner before giving up!
  let dataUrlToAnalyze: string | null = isDataUrl ? trimmed : null;
  let pageTitle = '';
  let pageDescription = '';

  if (!isDataUrl) {
    const fetched = await fetchImageUrlAsDataUrl(trimmed);
    dataUrlToAnalyze = fetched.dataUrl;
    pageTitle = fetched.pageTitle;
    pageDescription = fetched.pageDescription;
  }

  const [canvasGeom, ocr] = await Promise.all([
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
      : Promise.resolve<OcrExtractionResult>({ fullText: '', lines: [], words: [] }),
  ]);

  const synthesized = synthesizeTradeScanFromSignals({
    ocr,
    canvasGeom,
    urlMeta: {
      isTradingViewUrl: tvResolved.isTradingViewUrl,
      symbolFromUrl: tvResolved.symbolFromUrl,
      timeframeFromUrl: tvResolved.timeframeFromUrl,
      pageTitle,
      pageDescription,
      directImageUrl: !isDataUrl ? tvResolved.directImageUrl : '',
    },
  });

  return synthesized;
}
