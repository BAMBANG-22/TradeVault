/**
 * Offline On-Device MT5 / Chart OCR Engine powered by locally bundled Tesseract.js LSTM assets (`public/ocr/`).
 * - Zero external CDN calls (works 100% offline in both Web browser and Capacitor Android APK).
 * - Chromatic channel-max preprocessing preserves thin red '-' minus signs and blue profit digits in Dark Mode.
 * - Coordinate-aware Y-band reconstruction keeps split left/right MT5 columns aligned on the same row.
 */

import type { Worker, Word } from 'tesseract.js';

export interface OfflineOcrWordBox {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerY: number;
  centerX: number;
}

export interface OfflineOcrLine {
  text: string;
  centerY: number;
  minX: number;
  maxX: number;
}

export interface OfflineOcrResult {
  fullText: string;
  lines: OfflineOcrLine[];
  words: OfflineOcrWordBox[];
  confidence: number;
}

let cachedWorkerPromise: Promise<Worker> | null = null;
let workerQueuePromise: Promise<void> = Promise.resolve();
let lastPsmApplied: string | null = null;

function isBrowserLikeEnv(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function resolveBrowserAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  try {
    return new URL(clean, window.location.href).href;
  } catch {
    return `/${clean}`;
  }
}

async function createOfflineTesseractWorker(): Promise<Worker> {
  const tesseractMod = await import('tesseract.js');
  const { createWorker, OEM, PSM } = tesseractMod;
  lastPsmApplied = null;

  if (isBrowserLikeEnv()) {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: resolveBrowserAssetUrl('ocr/worker.min.js'),
      corePath: resolveBrowserAssetUrl('ocr'),
      langPath: resolveBrowserAssetUrl('ocr'),
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    lastPsmApplied = String(PSM.SINGLE_BLOCK);
    return worker;
  }

  // Node.js execution path (used in automated verification scripts)
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '.';
  const localLangDir = `${cwd.replace(/[\\/]+$/, '')}/public/ocr`;
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: localLangDir,
    cacheMethod: 'none',
    gzip: true,
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  lastPsmApplied = String(PSM.SINGLE_BLOCK);
  return worker;
}

async function getOfflineWorker(): Promise<Worker> {
  if (!cachedWorkerPromise) {
    cachedWorkerPromise = createOfflineTesseractWorker().catch((err) => {
      cachedWorkerPromise = null;
      lastPsmApplied = null;
      throw err;
    });
  }
  return cachedWorkerPromise;
}

/**
 * Starts initializing the local WASM + LSTM eng.traineddata worker in the background
 * so offline OCR starts immediately when a screenshot is chosen.
 */
export function prewarmOfflineTesseractWorker(): void {
  if (!isBrowserLikeEnv()) return;
  void getOfflineWorker().catch(() => {
    // Ignore warmup failures; actual scan handles errors cleanly
  });
}

export async function terminateOfflineTesseractWorker(): Promise<void> {
  const existing = cachedWorkerPromise;
  cachedWorkerPromise = null;
  lastPsmApplied = null;
  if (existing) {
    try {
      const worker = await existing;
      await worker.terminate();
    } catch {
      // ignore termination failure
    }
  }
}

/**
 * Reconstructs clean horizontal rows from word bounding boxes so left-column labels/prices
 * and right-column timestamps/profits remain paired even when MT5 renders wide whitespace gaps.
 */
export function reconstructStructuredLinesFromWords(
  words: OfflineOcrWordBox[]
): OfflineOcrLine[] {
  if (!Array.isArray(words) || words.length === 0) return [];

  const heights = words
    .map((w) => w.height)
    .filter((h) => Number.isFinite(h) && h >= 8)
    .sort((a, b) => a - b);
  const fallbackHeights = words
    .map((w) => w.height)
    .filter((h) => Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  const activeHeights = heights.length > 0 ? heights : fallbackHeights;
  const medianH =
    activeHeights.length > 0 ? activeHeights[Math.floor(activeHeights.length / 2)] : 18;
  const rowTolerance = Math.max(9, medianH * 0.68);

  const sortedByY = [...words].sort((a, b) => a.centerY - b.centerY || a.left - b.left);
  const bands: Array<{ meanY: number; items: OfflineOcrWordBox[] }> = [];

  for (const w of sortedByY) {
    let targetBand: { meanY: number; items: OfflineOcrWordBox[] } | null = null;
    let bestDist = Infinity;
    for (const band of bands) {
      const dist = Math.abs(w.centerY - band.meanY);
      if (dist <= rowTolerance && dist < bestDist) {
        bestDist = dist;
        targetBand = band;
      }
    }
    if (targetBand) {
      targetBand.items.push(w);
      targetBand.meanY =
        targetBand.items.reduce((acc, item) => acc + item.centerY, 0) /
        targetBand.items.length;
    } else {
      bands.push({ meanY: w.centerY, items: [w] });
    }
  }

  bands.sort((a, b) => a.meanY - b.meanY);

  const lines: OfflineOcrLine[] = [];
  for (const band of bands) {
    band.items.sort((a, b) => a.left - b.left);
    let lineText = '';
    let prevRight = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const item of band.items) {
      const cleanToken = item.text.trim();
      if (!cleanToken) continue;
      if (item.left < minX) minX = item.left;
      const itemRight = item.left + item.width;
      if (itemRight > maxX) maxX = itemRight;

      if (!lineText) {
        lineText = cleanToken;
      } else {
        const gap = item.left - prevRight;
        lineText += gap > medianH * 1.35 ? `   ${cleanToken}` : ` ${cleanToken}`;
      }
      prevRight = itemRight;
    }

    if (lineText) {
      lines.push({
        text: lineText,
        centerY: band.meanY,
        minX: Number.isFinite(minX) ? minX : 0,
        maxX: Number.isFinite(maxX) ? maxX : 0,
      });
    }
  }

  return lines;
}

/**
 * Generates high-precision Black-on-White OCR image variants from a Data URL in the browser:
 * - Variant 0 (Primary): Upscaled + 24px white padding + Chromatic Contrast Extraction
 *   (uses max RGB channel delta from background so red '-' losses, blue profits, and muted grey S/L & T/P labels become crisp black).
 * - Variant 1 (Soft Fallback): Upscaled soft grayscale inversion with boosted contrast for tricky anti-aliased screens.
 */
export type PrecisionOcrVariantMode = 'chromatic_sharp' | 'soft_luma';

function renderCanvasOcrVariant(
  img: HTMLImageElement,
  mode: PrecisionOcrVariantMode,
  fallbackUrl: string
): string {
  const srcW = img.width;
  const srcH = img.height;
  if (!srcW || !srcH) return fallbackUrl;

  // Target optimal Tesseract LSTM character height (~20-28px) within an ultra-fast ~1.15MP mobile budget
  const maxOcrWidth = 860;
  let scale = srcW < 720 ? Math.min(1.35, maxOcrWidth / srcW) : srcW > maxOcrWidth ? maxOcrWidth / srcW : 1;
  const maxPixelBudget = 1_150_000;
  if (srcW * scale * (srcH * scale) > maxPixelBudget) {
    scale = Math.max(0.45, Math.sqrt(maxPixelBudget / (srcW * srcH)));
  }
  const innerW = Math.round(srcW * scale);
  const innerH = Math.round(srcH * scale);
  const pad = 16;
  const outW = innerW + pad * 2;
  const outH = innerH + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallbackUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, pad, pad, innerW, innerH);

  const imgData = ctx.getImageData(pad, pad, innerW, innerH);
  const pixels = imgData.data;

  // Estimate background RGB median from sparse grid
  const rSamples: number[] = [];
  const gSamples: number[] = [];
  const bSamples: number[] = [];
  const step = Math.max(16, Math.floor(pixels.length / 3000) * 4);
  for (let i = 0; i < pixels.length; i += step) {
    rSamples.push(pixels[i]);
    gSamples.push(pixels[i + 1]);
    bSamples.push(pixels[i + 2]);
  }
  rSamples.sort((a, b) => a - b);
  gSamples.sort((a, b) => a - b);
  bSamples.sort((a, b) => a - b);
  const mid = Math.floor(rSamples.length / 2);
  const bgR = rSamples[mid] ?? 18;
  const bgG = gSamples[mid] ?? 22;
  const bgB = bSamples[mid] ?? 28;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const isDarkBg = bgLum < 128;

  // Precomputed LUT for fast branchless-style intensity mapping on millions of pixels
  if (mode === 'chromatic_sharp') {
    const lut = new Uint8ClampedArray(256);
    for (let s = 0; s < 256; s++) {
      if (s <= 10) {
        lut[s] = 255;
      } else {
        const normalized = Math.min(1, (s - 10) / 88);
        lut[s] = Math.round(255 * (1 - Math.pow(normalized, 0.62)));
      }
    }
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const deltaR = isDarkBg ? r - bgR : bgR - r;
      const deltaG = isDarkBg ? g - bgG : bgG - g;
      const deltaB = isDarkBg ? b - bgB : bgB - b;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const deltaLuma = isDarkBg ? luma - bgLum : bgLum - luma;
      const inkStrength = Math.max(0, deltaR, deltaG, deltaB, deltaLuma) | 0;
      const v = lut[inkStrength > 255 ? 255 : inkStrength];
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  } else {
    for (let i = 0; i < pixels.length; i += 4) {
      let lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      if (isDarkBg) lum = 255 - lum;
      const stretched = Math.max(0, Math.min(255, Math.round((lum - 128) * 1.55 + 128)));
      pixels[i] = stretched;
      pixels[i + 1] = stretched;
      pixels[i + 2] = stretched;
      pixels[i + 3] = 255;
    }
  }

  ctx.putImageData(imgData, pad, pad);
  // WebP q=0.88 compresses several times faster than PNG on multi-megapixel screenshots
  let url = canvas.toDataURL('image/webp', 0.88);
  if (!url.startsWith('data:image/webp')) {
    url = canvas.toDataURL('image/png');
  }
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/**
 * Generates a single Black-on-White OCR image variant on demand (avoids wasting CPU encoding unused variants).
 */
export async function preparePrecisionOcrVariant(
  dataUrl: string,
  mode: PrecisionOcrVariantMode = 'chromatic_sharp'
): Promise<string> {
  if (!isBrowserLikeEnv() || typeof Image === 'undefined') {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      try {
        resolve(renderCanvasOcrVariant(img, mode, dataUrl));
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

/**
 * Generates high-precision Black-on-White OCR image variants from a Data URL in the browser.
 */
export async function preparePrecisionOcrVariants(dataUrl: string): Promise<string[]> {
  if (!isBrowserLikeEnv() || typeof Image === 'undefined') {
    return [dataUrl];
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve([dataUrl]);
    img.onload = () => {
      try {
        const primary = renderCanvasOcrVariant(img, 'chromatic_sharp', dataUrl);
        const soft = renderCanvasOcrVariant(img, 'soft_luma', dataUrl);
        resolve(primary === soft ? [primary] : [primary, soft]);
      } catch {
        resolve([dataUrl]);
      }
    };
    img.src = dataUrl;
  });
}

function collectWordsFromTesseractData(data: any): OfflineOcrWordBox[] {
  const words: OfflineOcrWordBox[] = [];
  if (!data || !Array.isArray(data.blocks)) return words;

  for (const block of data.blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const para of paragraphs) {
      const lines = Array.isArray(para?.lines) ? para.lines : [];
      for (const line of lines) {
        const lineWords: Word[] = Array.isArray(line?.words) ? line.words : [];
        for (const w of lineWords) {
          const text = String(w?.text || '').trim();
          if (!text || !w?.bbox) continue;
          const x0 = Number(w.bbox.x0) || 0;
          const y0 = Number(w.bbox.y0) || 0;
          const x1 = Number(w.bbox.x1) || x0;
          const y1 = Number(w.bbox.y1) || y0;
          const width = Math.max(1, x1 - x0);
          const height = Math.max(1, y1 - y0);
          words.push({
            text,
            left: x0,
            top: y0,
            width,
            height,
            centerX: x0 + width / 2,
            centerY: y0 + height / 2,
          });
        }
      }
    }
  }
  return words;
}

function fastDataUrlToRecognizeInput(input: string | Buffer): string | Buffer | Blob {
  if (
    typeof input !== 'string' ||
    !input.startsWith('data:image/') ||
    !isBrowserLikeEnv() ||
    typeof Blob === 'undefined' ||
    typeof atob !== 'function'
  ) {
    return input;
  }
  try {
    const commaIdx = input.indexOf(',');
    if (commaIdx === -1) return input;
    const header = input.slice(0, commaIdx);
    const mimeMatch = header.match(/^data:([^;]+)/i);
    const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
    const binStr = atob(input.slice(commaIdx + 1));
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return input;
  }
}

/**
 * Runs 100% offline on-device OCR on an image Data URL / Buffer / image source.
 * Serialized through `workerQueuePromise` so concurrent callers safely share one lightweight WASM worker.
 */
export async function runOfflineTesseractOcr(
  imageInput: string | Buffer,
  options?: { psm?: '3' | '4' | '6' | '11' }
): Promise<OfflineOcrResult> {
  let resultResolve!: (val: OfflineOcrResult) => void;
  let resultReject!: (err: unknown) => void;
  const outPromise = new Promise<OfflineOcrResult>((res, rej) => {
    resultResolve = res;
    resultReject = rej;
  });

  workerQueuePromise = workerQueuePromise.then(async () => {
    try {
      const { PSM } = await import('tesseract.js');
      const worker = await getOfflineWorker();
      const targetPsm = options?.psm
        ? (options.psm as unknown as typeof PSM.SINGLE_BLOCK)
        : PSM.SINGLE_BLOCK;
      if (lastPsmApplied !== String(targetPsm)) {
        await worker.setParameters({
          tessedit_pageseg_mode: targetPsm,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        lastPsmApplied = String(targetPsm);
      }

      const recognizeTarget = fastDataUrlToRecognizeInput(imageInput);
      const recognized = await worker.recognize(
        recognizeTarget as any,
        {},
        { text: true, blocks: true }
      );
      const words = collectWordsFromTesseractData(recognized?.data);
      const reconstructed = reconstructStructuredLinesFromWords(words);
      const rawText = String(recognized?.data?.text || '');
      const structuredText =
        reconstructed.length > 0
          ? reconstructed.map((l) => l.text).join('\n')
          : rawText;

      resultResolve({
        fullText: structuredText,
        lines: reconstructed,
        words,
        confidence: Number(recognized?.data?.confidence || 0),
      });
    } catch (err) {
      // Reset cached worker if WASM threw so subsequent offline scans recover cleanly
      cachedWorkerPromise = null;
      lastPsmApplied = null;
      resultReject(err);
    }
  });

  return outPromise;
}
