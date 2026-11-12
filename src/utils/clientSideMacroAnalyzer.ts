import {
  MacroNewsSnapshot,
  MacroCalendarEvent,
  IntermarketAssetPulse,
  BreakingNewsHeadline,
  XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION,
  computeDeterministicMacroSnapshot,
  saveMacroSnapshotToCache,
} from './macroNewsEngine';
import {
  fetchClientForexFactoryCalendar,
  fetchClientYahooAsset,
  fetchClientBreakingHeadlines,
} from './macroFeedFetcher';

/**
 * Executes direct client-side Gemini 2.5 Flash request using Google AI REST API.
 * Uses VITE_GEMINI_NEWS_API_KEY || VITE_GEMINI_API_KEY.
 * Falls back deterministically if quota is exhausted or key is missing.
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
}): Promise<MacroNewsSnapshot> {
  const { calendarEvents, intermarketPulse, breakingNews, selectedEventId } = params;

  // 1. Calculate the baseline deterministic snapshot first
  const baselineSnapshot = computeDeterministicMacroSnapshot({
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
    sourceMode: 'RULE_BASED_FALLBACK',
    modelUsed: 'deterministic-playbook-v1',
  });

  // 2. Read client-side Gemini key
  let apiKey = '';
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      apiKey = (
        (import.meta as any).env.VITE_GEMINI_NEWS_API_KEY ||
        (import.meta as any).env.VITE_GEMINI_API_KEY ||
        (import.meta as any).env.GEMINI_NEWS_API_KEY ||
        (import.meta as any).env.GEMINI_API_KEY ||
        ''
      ).trim();
    }
  } catch {
    // ignore
  }

  if (!apiKey && typeof process !== 'undefined' && process.env) {
    apiKey = (
      process.env.VITE_GEMINI_NEWS_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_NEWS_API_KEY ||
      process.env.GEMINI_API_KEY ||
      ''
    ).trim();
  }

  // If no Gemini API key available on client, immediately return the deterministic snapshot
  if (!apiKey) {
    return baselineSnapshot;
  }

  const promptPayload = {
    primaryEvent: baselineSnapshot.scenarioMatrix.primaryEvent,
    simultaneousEvents: baselineSnapshot.scenarioMatrix.simultaneousEvents,
    intermarketPulse: {
      dxy: {
        price: intermarketPulse.dxy.price,
        changePercent: intermarketPulse.dxy.changePercent,
        direction: intermarketPulse.dxy.direction,
      },
      usoil: {
        price: intermarketPulse.usoil.price,
        changePercent: intermarketPulse.usoil.changePercent,
        direction: intermarketPulse.usoil.direction,
      },
      us10y: {
        price: intermarketPulse.us10y.price,
        changePercent: intermarketPulse.us10y.changePercent,
        direction: intermarketPulse.us10y.direction,
      },
    },
    breakingHeadlines: breakingNews.slice(0, 5).map((h) => ({
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analyze this real-time XAU/USD macro dataset and return the structured JSON Scenario Matrix in both Bahasa Indonesia (Id) and English (En):\n${JSON.stringify(
              promptPayload
            )}`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: XAUUSD_MACRO_MASTER_PLAYBOOK_SYSTEM_INSTRUCTION,
        },
      ],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          impactLevel: { type: 'STRING', description: 'HIGH, MEDIUM, or LOW' },
          dominantBias: { type: 'STRING', description: 'BUY, SELL, or MIXED' },
          buyProbability: { type: 'INTEGER', description: '0-100' },
          sellProbability: { type: 'INTEGER', description: '0-100' },
          mixedProbability: { type: 'INTEGER', description: '0-100' },
          dynamicPivotTriggered: { type: 'BOOLEAN' },
          topBreakingEvalId: { type: 'STRING' },
          topBreakingEvalEn: { type: 'STRING' },
          finalTakeId: { type: 'STRING' },
          finalTakeEn: { type: 'STRING' },
          actionPlanId: { type: 'STRING' },
          actionPlanEn: { type: 'STRING' },
          whipsawWarningId: { type: 'STRING' },
          whipsawWarningEn: { type: 'STRING' },
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
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[MacroClient] Gemini API returned status ${res.status}, using baseline`);
      return baselineSnapshot;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return baselineSnapshot;
    }

    const aiParsed = JSON.parse(rawText);

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

    return {
      ...baselineSnapshot,
      sourceMode: 'GEMINI_AI',
      modelUsed: 'gemini-2.5-flash',
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
      },
    };
  } catch (err) {
    console.warn('[MacroClient] Direct Gemini API call failed or timed out:', err);
    return baselineSnapshot;
  }
}

/**
 * End-to-end client-side workflow:
 * 1. Parallel fetch of ForexFactory + Yahoo Finance + Breaking News RSS (with CORS proxy & 8s timeout).
 * 2. Analyze with Gemini 2.5 Flash direct REST API or deterministic engine.
 * 3. Save to Supabase `macro_news_snapshots` table with full error reporting.
 */
export async function executeClientSideMacroAnalysis(selectedEventId?: string): Promise<{
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

  // Step 2: Analyze with Gemini 2.5 Flash
  const analyzedSnapshot = await analyzeMacroWithGeminiClient({
    calendarEvents,
    intermarketPulse,
    breakingNews,
    selectedEventId,
  });

  // Step 3: Insert directly into Supabase `macro_news_snapshots`
  const supabaseResult = await saveMacroSnapshotToCache(analyzedSnapshot);

  return {
    snapshot: analyzedSnapshot,
    supabaseResult,
  };
}
