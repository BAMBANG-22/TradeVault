import {
  MacroNewsSnapshot,
  MacroCalendarEvent,
  IntermarketAssetPulse,
  BreakingNewsHeadline,
  computeDeterministicMacroSnapshot,
  saveMacroSnapshotToCache,
} from './macroNewsEngine';
import {
  fetchClientForexFactoryCalendar,
  fetchClientYahooAsset,
  fetchClientBreakingHeadlines,
} from './macroFeedFetcher';

const REMOTE_MACRO_API_ENDPOINTS = [
  '/api/macro-news/analyze',
  'https://ais-pre-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/analyze',
  'https://ais-dev-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/analyze',
];

async function safeFetchJson(
  url: string,
  options: RequestInit,
  timeoutMs = 15000
): Promise<{ ok: boolean; json: any | null }> {
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
      return { ok: false, json: null };
    }

    try {
      const json = JSON.parse(rawText);
      return { ok: res.ok, json };
    } catch {
      return { ok: false, json: null };
    }
  } catch {
    return { ok: false, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes server-side Gemini 2.5 Flash analysis via /api/macro-news/analyze proxy.
 * Eliminates browser-side Gemini API calls so the application functions for every user.
 * Falls back deterministically to Master Playbook rules if server or quota is unavailable.
 */
export async function analyzeMacroWithGeminiClient(params: {
  calendarEvents: MacroCalendarEvent[];
  intermarketPulse: {
    dxy: IntermarketAssetPulse;
    usoil: IntermarketAssetPulse;
    us10y: IntermarketAssetPulse;
  };
  breakingNews: BreakingNewsHeadline[];
  selectedEventId?: string;
  forceRefresh?: boolean;
}): Promise<MacroNewsSnapshot> {
  const { calendarEvents, intermarketPulse, breakingNews, selectedEventId, forceRefresh = false } = params;

  // 1. Calculate the baseline deterministic snapshot first as fallback
  const baselineSnapshot = computeDeterministicMacroSnapshot({
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
    sourceMode: 'RULE_BASED_FALLBACK',
    modelUsed: 'deterministic-playbook-v1',
  });

  const requestPayload = {
    forceRefresh,
    selectedEventId,
    clientFeeds: {
      calendarEvents,
      intermarketPulse,
      breakingNews,
    },
  };

  // 2. Call server-side Gemini proxy (with remote URLs for Android APK)
  for (const endpoint of REMOTE_MACRO_API_ENDPOINTS) {
    const res = await safeFetchJson(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      },
      15000
    );

    if (res.ok && res.json?.success && res.json?.snapshot) {
      return res.json.snapshot as MacroNewsSnapshot;
    }
  }

  // 3. Resilient fallback to deterministic Master Playbook rules if server is unreachable
  return baselineSnapshot;
}

/**
 * End-to-end client-side workflow:
 * 1. Parallel fetch of ForexFactory + Yahoo Finance + Breaking News RSS (with CORS proxy & 8s timeout).
 * 2. Analyze via server-side Gemini proxy (/api/macro-news/analyze).
 * 3. Save to Supabase `macro_news_snapshots` table with full error reporting.
 */
export async function executeClientSideMacroAnalysis(
  selectedEventId?: string,
  forceRefresh = false
): Promise<{
  snapshot: MacroNewsSnapshot;
  supabaseResult: { success: boolean; error?: string; remoteSaved: boolean };
}> {
  // Step 1: Pull all live public feeds in parallel (never hangs even if one fails)
  const [calendarEvents, dxy, usoil, us10y, breakingNews] = await Promise.all([
    fetchClientForexFactoryCalendar(),
    fetchClientYahooAsset('DXY', 'DX-Y.NYB', 'US Dollar Index (DXY)', 104.85, 104.42),
    fetchClientYahooAsset('USOIL', 'CL=F', 'US Oil WTI Crude', 73.4, 71.95),
    fetchClientYahooAsset('US10Y', '^TNX', 'US 10Y Treasury Yield', 4.38, 4.31),
    fetchClientBreakingHeadlines(),
  ]);

  const intermarketPulse = { dxy, usoil, us10y };

  // Step 2: Analyze with server-side Gemini proxy
  const analyzedSnapshot = await analyzeMacroWithGeminiClient({
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
    forceRefresh,
  });

  // Preserve isCalendarLiveFeed metadata
  analyzedSnapshot.isCalendarLiveFeed = calendarEvents.some((e) => e.isLiveFeed);
  if (calendarEvents.length > 0) {
    analyzedSnapshot.calendarEvents = calendarEvents;
  }

  // Step 3: Insert directly into Supabase `macro_news_snapshots`
  const supabaseResult = await saveMacroSnapshotToCache(analyzedSnapshot);

  return {
    snapshot: analyzedSnapshot,
    supabaseResult,
  };
}
