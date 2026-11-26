/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-side Context Collector, APK-Safe Transport, and Deterministic Offline Assistant
 * for TradeVault's Multi-Agent Office ("Tanya AI" / AI Desk).
 *
 * Quietly absorbs ALL offline journal records + online/cached market intelligence
 * without cluttering the UI with raw JSON tables, and provides an instant offline
 * fallback engine whenever Offline Mode or no-internet is active.
 */

import { Trade } from '../types/trade';
import { AppSettings } from '../types/settings';
import { calculatePerformance } from './calculations';
import { getTradeLifecycleStatus } from './tradeLifecycle';
import {
  getApiEndpointCandidates,
  isNewsCycleOfflineMode,
  nativeAwarePostJson,
} from './apiConfig';
import {
  loadLocalCachedCmeFedWatchSync,
  loadLocalCachedFundamentalGoldSnapshotSync,
  loadLocalCachedMacroSnapshotSync,
  loadOfflineActualsArchive,
} from './macroNewsEngine';
import { loadCachedPolymarketMacroSnapshot } from './polymarketMacroSentiment';
import { SMC_OFFLINE_SIGNALS_STORAGE_KEY } from './xauSmartHeatmap';
import { inspectMacroSyncConsistency } from './apkDiagnostics';
import { recordAppDiagnosticEvent } from './devDiagnosticsStore';

export type AgentChatPersona = 'casual' | 'concise' | 'mentor';

export interface AgentChatThemeConfig {
  agentName: string;
  agentSubtitle: string;
  avatarDataUrl: string | null;
  persona: AgentChatPersona;
  bgColor: string;
  wallpaperDataUrl: string | null;
  wallpaperDim: number; // 0 to 85
  userBubbleColor: string;
  agentBubbleColor: string;
  showDivisionTrace: boolean;
}

export interface AgentChatThemePreset {
  id: string;
  label: string;
  bgColor: string;
  userBubbleColor: string;
  agentBubbleColor: string;
}

export const AGENT_CHAT_THEME_STORAGE_KEY = 'tradevault_chat_theme_v1';

export const AGENT_CHAT_THEME_PRESETS: AgentChatThemePreset[] = [
  {
    id: 'vlo-light',
    label: 'VLO Light',
    bgColor: '#F5F6F8',
    userBubbleColor: '#0F172A',
    agentBubbleColor: '#FFFFFF',
  },
  {
    id: 'vlo-dark',
    label: 'VLO Dark',
    bgColor: '#0B0E13',
    userBubbleColor: '#F2F4F7',
    agentBubbleColor: '#161B24',
  },
  {
    id: 'wa-dark',
    label: 'WA Dark',
    bgColor: '#0B141A',
    userBubbleColor: '#005C4B',
    agentBubbleColor: '#202C33',
  },
  {
    id: 'wa-light',
    label: 'WA Classic',
    bgColor: '#EFEAE2',
    userBubbleColor: '#D9FDD3',
    agentBubbleColor: '#FFFFFF',
  },
  {
    id: 'ig-dm',
    label: 'IG DM',
    bgColor: '#0A0A0A',
    userBubbleColor: '#3797F0',
    agentBubbleColor: '#262626',
  },
  {
    id: 'ig-violet',
    label: 'IG Violet',
    bgColor: '#0D0C14',
    userBubbleColor: '#7C3AED',
    agentBubbleColor: '#1E1B2E',
  },
];

export function getDefaultAgentChatTheme(isDarkTheme: boolean): AgentChatThemeConfig {
  const preset = isDarkTheme ? AGENT_CHAT_THEME_PRESETS[1] : AGENT_CHAT_THEME_PRESETS[0];
  return {
    agentName: 'VLO Head Desk',
    agentSubtitle: 'Tim Riset & Jurnal',
    avatarDataUrl: null,
    persona: 'casual',
    bgColor: preset.bgColor,
    wallpaperDataUrl: null,
    wallpaperDim: 35,
    userBubbleColor: preset.userBubbleColor,
    agentBubbleColor: preset.agentBubbleColor,
    showDivisionTrace: false,
  };
}

function isValidHexColor(val: unknown): val is string {
  return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim());
}

export function loadAgentChatTheme(isDarkTheme: boolean): AgentChatThemeConfig {
  const fallback = getDefaultAgentChatTheme(isDarkTheme);
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(AGENT_CHAT_THEME_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const persona: AgentChatPersona =
      parsed.persona === 'concise' || parsed.persona === 'mentor' ? parsed.persona : 'casual';
    return {
      agentName:
        typeof parsed.agentName === 'string' && parsed.agentName.trim()
          ? parsed.agentName.trim().slice(0, 40)
          : fallback.agentName,
      agentSubtitle:
        typeof parsed.agentSubtitle === 'string' && parsed.agentSubtitle.trim()
          ? parsed.agentSubtitle.trim().slice(0, 50)
          : fallback.agentSubtitle,
      avatarDataUrl:
        typeof parsed.avatarDataUrl === 'string' && parsed.avatarDataUrl.startsWith('data:image/')
          ? parsed.avatarDataUrl
          : null,
      persona,
      bgColor: isValidHexColor(parsed.bgColor) ? parsed.bgColor.trim() : fallback.bgColor,
      wallpaperDataUrl:
        typeof parsed.wallpaperDataUrl === 'string' && parsed.wallpaperDataUrl.startsWith('data:image/')
          ? parsed.wallpaperDataUrl
          : null,
      wallpaperDim:
        typeof parsed.wallpaperDim === 'number' && Number.isFinite(parsed.wallpaperDim)
          ? Math.max(0, Math.min(85, Math.round(parsed.wallpaperDim)))
          : fallback.wallpaperDim,
      userBubbleColor: isValidHexColor(parsed.userBubbleColor)
        ? parsed.userBubbleColor.trim()
        : fallback.userBubbleColor,
      agentBubbleColor: isValidHexColor(parsed.agentBubbleColor)
        ? parsed.agentBubbleColor.trim()
        : fallback.agentBubbleColor,
      showDivisionTrace: Boolean(parsed.showDivisionTrace),
    };
  } catch {
    return fallback;
  }
}

export function saveAgentChatTheme(config: AgentChatThemeConfig): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  try {
    window.localStorage.setItem(AGENT_CHAT_THEME_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function resetAgentChatTheme(isDarkTheme: boolean): AgentChatThemeConfig {
  const defaults = getDefaultAgentChatTheme(isDarkTheme);
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(AGENT_CHAT_THEME_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return defaults;
}

/**
 * WCAG relative luminance contrast helper: returns crisp dark or light foreground colors
 * for any user-selected bubble or canvas hex color.
 */
export function getContrastPalette(hex: string): {
  text: string;
  muted: string;
  isLightSurface: boolean;
} {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '0F172A';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const isLightSurface = L > 0.42;
  return isLightSurface
    ? { text: '#0F172A', muted: 'rgba(15, 23, 42, 0.62)', isLightSurface: true }
    : { text: '#F8FAFC', muted: 'rgba(248, 250, 252, 0.68)', isLightSurface: false };
}

/**
 * Compress uploaded image file to a lightweight JPEG data URL via Canvas
 * so avatars & wallpapers stay fast and safe inside localStorage on mobile APK.
 */
export function compressImageFileToDataUrl(
  file: File,
  options: { maxDim: number; quality?: number; squareCrop?: boolean }
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (JPG, PNG, atau WEBP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas tidak tersedia.'));
            return;
          }

          if (options.squareCrop) {
            const side = Math.min(img.width, img.height);
            const sx = Math.floor((img.width - side) / 2);
            const sy = Math.floor((img.height - side) / 2);
            const target = Math.min(options.maxDim, side);
            canvas.width = target;
            canvas.height = target;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
          } else {
            const scale = Math.min(1, options.maxDim / Math.max(img.width, img.height));
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }

          const quality = options.quality ?? 0.78;
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Gagal memproses gambar.'));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export interface AgentWorkflowStepClient {
  stepNumber: number;
  role:
    | 'BOSS_DISPATCH'
    | 'BOSS_DIRECT'
    | 'DIVISI_MAKRO'
    | 'DIVISI_JURNAL'
    | 'BOSS_AUDIT'
    | 'REVISION'
    | 'BOSS_SIGNOFF'
    | 'OFFLINE_ENGINE';
  divisionName: string;
  provider: 'gemini' | 'groq' | 'openrouter' | 'system' | 'offline';
  model: string;
  action: string;
  status: 'completed' | 'revised' | 'fallback';
  summary: string;
  latencyMs: number;
}

export interface AgentDeskActionCardClient {
  directionClarity: 'BUY' | 'SELL' | 'WAIT_MIXED' | 'INFO_ONLY';
  directionLabel: string;
  spikeWarning: string;
  riskReminder: string;
}

export interface AgentDeskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  mode?: 'ONLINE_MULTI_AGENT' | 'OFFLINE_LOCAL';
  routeType?: 'DIRECT_FOLLOWUP' | 'FULL_OFFICE';
  actionCard?: AgentDeskActionCardClient;
  workflowTrace?: AgentWorkflowStepClient[];
  revisionTriggered?: boolean;
  activeProviders?: string[];
  totalLatencyMs?: number;
}

export interface AgentDeskAbsorbedSummary {
  tradesCount: number;
  closedCount: number;
  openOrPlannedCount: number;
  macroBias: string | null;
  macroMovementType: string | null;
  macroAnalyzedAt: string | null;
  fundamentalBias: string | null;
  fundamentalAnalyzedAt: string | null;
  polymarketCount: number;
  isOfflineMode: boolean;
  isNavigatorOnline: boolean;
}

export const AGENT_DESK_CHAT_STORAGE_KEY = 'tradevault_agent_desk_chat_v1';

function readLatestSmcSignalCompact(): Record<string, unknown> | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SMC_OFFLINE_SIGNALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.filter(
      (item: any) => item && typeof item === 'object' && (item.direction === 'BUY' || item.direction === 'SELL')
    );
    if (valid.length === 0) return null;
    valid.sort((a: any, b: any) => {
      const ta = new Date(a.createdAt || a.timestamp || 0).getTime() || 0;
      const tb = new Date(b.createdAt || b.timestamp || 0).getTime() || 0;
      return tb - ta;
    });
    const latest = valid[0];
    return {
      direction: latest.direction,
      status: latest.status || 'RECORDED',
      setupLabel: latest.setupLabel || latest.setup || null,
      entryPrice: latest.entryPrice ?? null,
      stopLoss: latest.stopLoss ?? null,
      takeProfit: latest.takeProfit ?? null,
      rrRatio: latest.rrRatio ?? null,
      createdAt: latest.createdAt || latest.timestamp || null,
    };
  } catch {
    return null;
  }
}

export function buildAgentDeskContext(
  trades: Trade[],
  settings: AppSettings,
  language: 'id' | 'en'
): {
  context: Record<string, unknown>;
  absorbedSummary: AgentDeskAbsorbedSummary;
} {
  const isOfflineMode = isNewsCycleOfflineMode();
  const isNavigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;

  // 1. Offline Journal & Risk Context
  const { metrics } = calculatePerformance(trades, settings);
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(b.dateTime || 0).getTime() - new Date(a.dateTime || 0).getTime()
  );

  const openOrPlannedTrades = sortedTrades
    .filter((t) => {
      const st = getTradeLifecycleStatus(t);
      return st === 'OPEN' || st === 'PLANNED';
    })
    .slice(0, 8)
    .map((t) => ({
      lifecycle: getTradeLifecycleStatus(t),
      instrument: t.instrument,
      position: t.position,
      lotSize: t.lotSize,
      entryPrice: t.entryPrice,
      stopLoss: t.stopLoss ?? null,
      takeProfit: t.takeProfit ?? null,
      riskPercentage: t.riskPercentage,
      strategy: t.strategy,
      dateTime: t.dateTime,
    }));

  const closedTrades = sortedTrades.filter((t) => getTradeLifecycleStatus(t) === 'CLOSED');
  const recentClosed = closedTrades.slice(0, 12).map((t) => ({
    dateTime: t.dateTime,
    instrument: t.instrument,
    position: t.position,
    session: t.session || 'Other',
    strategy: t.strategy,
    lotSize: t.lotSize,
    outcome: t.outcome,
    netProfit: Number((t.netProfit || 0).toFixed(2)),
    rMultiple: typeof t.rMultiple === 'number' ? Number(t.rMultiple.toFixed(2)) : null,
    emotionTag: t.emotionTag || null,
    mistakeTags: Array.isArray(t.mistakeTags) ? t.mistakeTags.slice(0, 3) : [],
    ruleCompliant: typeof t.ruleCompliant === 'boolean' ? t.ruleCompliant : null,
  }));

  // Aggregate mistakes, emotions, and sessions compactly
  const mistakeCounts: Record<string, { count: number; netImpact: number }> = {};
  const sessionStats: Record<string, { count: number; wins: number; netProfit: number }> = {};
  for (const t of closedTrades) {
    const sess = t.session || 'Other';
    if (!sessionStats[sess]) sessionStats[sess] = { count: 0, wins: 0, netProfit: 0 };
    sessionStats[sess].count += 1;
    if (t.outcome === 'WIN') sessionStats[sess].wins += 1;
    sessionStats[sess].netProfit += t.netProfit || 0;

    if (Array.isArray(t.mistakeTags)) {
      for (const m of t.mistakeTags) {
        if (!mistakeCounts[m]) mistakeCounts[m] = { count: 0, netImpact: 0 };
        mistakeCounts[m].count += 1;
        mistakeCounts[m].netImpact += t.netProfit || 0;
      }
    }
  }

  const topMistakes = Object.entries(mistakeCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([tag, st]) => ({
      tag,
      count: st.count,
      netImpact: Number(st.netImpact.toFixed(2)),
    }));

  const sessionBreakdown = Object.entries(sessionStats).map(([session, st]) => ({
    session,
    trades: st.count,
    winRatePct: st.count > 0 ? Number(((st.wins / st.count) * 100).toFixed(1)) : 0,
    netProfit: Number(st.netProfit.toFixed(2)),
  }));

  // 2. Online / Cached Market Intelligence (Macro News, Fundamental Gold, FedWatch, Polymarket, SMC)
  const macro = loadLocalCachedMacroSnapshotSync();
  const fundamental = loadLocalCachedFundamentalGoldSnapshotSync();
  const fedWatch = loadLocalCachedCmeFedWatchSync() || macro?.cmeFedWatch || null;
  const polymarket = loadCachedPolymarketMacroSnapshot();
  const recentActuals = loadOfflineActualsArchive().slice(0, 6);
  const smcSignal = readLatestSmcSignalCompact();
  const syncAudit = inspectMacroSyncConsistency();

  const macroCompact = macro
    ? {
        analyzedAt: macro.analyzedAt,
        sourceMode: macro.sourceMode,
        impactLevel: macro.impactLevel,
        dominantBias: macro.dominantBias,
        buyProbability: macro.scenarioMatrix?.buyProbability ?? null,
        sellProbability: macro.scenarioMatrix?.sellProbability ?? null,
        mixedProbability: macro.scenarioMatrix?.mixedProbability ?? null,
        primaryEvent: macro.scenarioMatrix?.primaryEvent
          ? {
              title: macro.scenarioMatrix.primaryEvent.title,
              date: macro.scenarioMatrix.primaryEvent.date,
              impact: macro.scenarioMatrix.primaryEvent.impact,
              forecast: macro.scenarioMatrix.primaryEvent.forecast,
              previous: macro.scenarioMatrix.primaryEvent.previous,
              actual: macro.scenarioMatrix.primaryEvent.actual,
              eventBiasForGold: macro.scenarioMatrix.primaryEvent.eventBiasForGold,
            }
          : null,
        institutionalDeskThesis:
          language === 'en'
            ? macro.scenarioMatrix?.institutionalDeskThesisEn || macro.scenarioMatrix?.finalTakeEn
            : macro.scenarioMatrix?.institutionalDeskThesisId || macro.scenarioMatrix?.finalTakeId,
        actionPlan:
          language === 'en'
            ? macro.scenarioMatrix?.actionPlanEn
            : macro.scenarioMatrix?.actionPlanId,
        whipsawWarning:
          language === 'en'
            ? macro.scenarioMatrix?.whipsawWarningEn
            : macro.scenarioMatrix?.whipsawWarningId,
        dynamicPivotTriggered: Boolean(macro.scenarioMatrix?.dynamicPivotTriggered),
        dynamicPivotReason:
          language === 'en'
            ? macro.scenarioMatrix?.dynamicPivotReasonEn || null
            : macro.scenarioMatrix?.dynamicPivotReasonId || null,
        dualHorizon: macro.scenarioMatrix?.dualHorizon
          ? {
              movementType: macro.scenarioMatrix.dualHorizon.movementType,
              movementBadge:
                language === 'en'
                  ? macro.scenarioMatrix.dualHorizon.movementBadgeEn
                  : macro.scenarioMatrix.dualHorizon.movementBadgeId,
              initialCatalystBias: macro.scenarioMatrix.dualHorizon.initialCatalystBias,
              initialCatalystLabel:
                language === 'en'
                  ? macro.scenarioMatrix.dualHorizon.initialCatalystLabelEn
                  : macro.scenarioMatrix.dualHorizon.initialCatalystLabelId,
              sessionPrimaryBias: macro.scenarioMatrix.dualHorizon.sessionPrimaryBias,
              sessionPrimaryProbability: macro.scenarioMatrix.dualHorizon.sessionPrimaryProbability,
              hasSpeechEvent: macro.scenarioMatrix.dualHorizon.hasSpeechEvent,
              speechEventsNearby: macro.scenarioMatrix.dualHorizon.speechEventsNearby,
              isPricedIn: macro.scenarioMatrix.dualHorizon.isPricedIn,
              phase1Minute0to5:
                language === 'en'
                  ? macro.scenarioMatrix.dualHorizon.phase1Minute0to5En
                  : macro.scenarioMatrix.dualHorizon.phase1Minute0to5Id,
              phase2Minute15Plus:
                language === 'en'
                  ? macro.scenarioMatrix.dualHorizon.phase2Minute15PlusEn
                  : macro.scenarioMatrix.dualHorizon.phase2Minute15PlusId,
              spikeTriggerReasons:
                language === 'en'
                  ? macro.scenarioMatrix.dualHorizon.spikeTriggerReasonsEn || []
                  : macro.scenarioMatrix.dualHorizon.spikeTriggerReasonsId || [],
            }
          : null,
        threeSystemEffectiveBias: macro.threeSystemState?.effectiveFundamentalBias || null,
        threeSystemActiveSource: macro.threeSystemState?.effectiveSourceSystem || null,
        intermarketPulse: {
          dxy: macro.intermarketPulse?.dxy
            ? {
                price: macro.intermarketPulse.dxy.price,
                changePct: macro.intermarketPulse.dxy.changePercent,
                effect: macro.intermarketPulse.dxy.goldCorrelationEffect,
              }
            : null,
          us02y: macro.intermarketPulse?.us02y
            ? {
                price: macro.intermarketPulse.us02y.price,
                changePct: macro.intermarketPulse.us02y.changePercent,
                effect: macro.intermarketPulse.us02y.goldCorrelationEffect,
              }
            : null,
          us10y: macro.intermarketPulse?.us10y
            ? {
                price: macro.intermarketPulse.us10y.price,
                changePct: macro.intermarketPulse.us10y.changePercent,
                effect: macro.intermarketPulse.us10y.goldCorrelationEffect,
              }
            : null,
          usoil: macro.intermarketPulse?.usoil
            ? {
                price: macro.intermarketPulse.usoil.price,
                changePct: macro.intermarketPulse.usoil.changePercent,
                effect: macro.intermarketPulse.usoil.goldCorrelationEffect,
              }
            : null,
        },
        topHeadlines: (macro.breakingNews || []).slice(0, 4).map((h) => ({
          title: h.title,
          sentiment: h.sentimentForGold,
          channel: h.channelType,
          source: h.source,
        })),
        recentArchivedActuals: recentActuals.map((a) => ({
          title: a.title,
          actual: a.actual,
          forecast: a.forecast,
          previous: a.previous,
          date: a.date,
        })),
      }
    : null;

  const fundamentalCompact = fundamental
    ? {
        analyzedAt: fundamental.analyzedAt,
        sourceMode: fundamental.sourceMode,
        overallBias: fundamental.overallBias,
        bullishProbability: fundamental.bullishProbability,
        bearishProbability: fundamental.bearishProbability,
        regime: language === 'en' ? fundamental.regimeLabelEn : fundamental.regimeLabelId,
        horizons: {
          daily1D: fundamental.horizons?.daily1D
            ? {
                bias: fundamental.horizons.daily1D.bias,
                bullishPct: fundamental.horizons.daily1D.bullishProbability,
                bearishPct: fundamental.horizons.daily1D.bearishProbability,
                headline:
                  language === 'en'
                    ? fundamental.horizons.daily1D.headlineEn
                    : fundamental.horizons.daily1D.headlineId,
              }
            : null,
          weekly1W: fundamental.horizons?.weekly1W
            ? {
                bias: fundamental.horizons.weekly1W.bias,
                bullishPct: fundamental.horizons.weekly1W.bullishProbability,
                bearishPct: fundamental.horizons.weekly1W.bearishProbability,
              }
            : null,
          monthly1M: fundamental.horizons?.monthly1M
            ? {
                bias: fundamental.horizons.monthly1M.bias,
                bullishPct: fundamental.horizons.monthly1M.bullishProbability,
                bearishPct: fundamental.horizons.monthly1M.bearishProbability,
              }
            : null,
        },
        tacticalOverlayStatus: fundamental.tacticalOverlay?.status || 'NORMAL',
        tacticalOverlayHeadline:
          language === 'en'
            ? fundamental.tacticalOverlay?.headlineEn || null
            : fundamental.tacticalOverlay?.headlineId || null,
        headlineSummary:
          language === 'en'
            ? fundamental.narrative?.en?.headlineSummary || ''
            : fundamental.narrative?.id?.headlineSummary || '',
        horizonOutlookAndRisks:
          language === 'en'
            ? fundamental.narrative?.en?.sectionD_HorizonOutlookAndRisks || ''
            : fundamental.narrative?.id?.sectionD_HorizonOutlookAndRisks || '',
      }
    : null;

  const polymarketCompact = polymarket?.events?.length
    ? {
        fetchedAt: polymarket.fetchedAt,
        source: polymarket.source,
        topEvents: polymarket.events.slice(0, 6).map((e) => ({
          category: e.category,
          title: e.title,
          topOutcome: e.outcomes?.[0]
            ? `${e.outcomes[0].label} (${e.outcomes[0].probabilityPct}%)`
            : null,
        })),
      }
    : null;

  const context: Record<string, unknown> = {
    runtime: {
      capturedAt: new Date().toISOString(),
      isOfflineMode,
      isNavigatorOnline,
      currency: settings.currency,
      currencySymbol: settings.currencySymbol,
    },
    journal: {
      summary: {
        totalRecords: trades.length,
        closedTradesCount: metrics.totalTrades,
        openOrPlannedCount: openOrPlannedTrades.length,
        winRatePct: Number(metrics.winRate.toFixed(1)),
        profitFactor: metrics.isProfitFactorInfinite
          ? 'INF'
          : Number(metrics.profitFactor.toFixed(2)),
        totalNetProfit: Number(metrics.totalNetProfit.toFixed(2)),
        currentEquity: Number(metrics.currentEquity.toFixed(2)),
        startingBalance: Number(metrics.startingBalance.toFixed(2)),
        totalGainPercent: Number(metrics.totalGainPercent.toFixed(2)),
        averageRiskReward: Number(metrics.averageRiskReward.toFixed(2)),
        maxDrawdownPercent: Number(metrics.maxDrawdownPercent.toFixed(2)),
        currentStreak: metrics.currentStreak,
        dailyLossToday: Number(metrics.dailyLossToday.toFixed(2)),
        isDailyLossExceeded: metrics.isDailyLossExceeded,
        isAccountInCriticalDrawdown: metrics.isAccountInCriticalDrawdown,
      },
      riskGuardrails: {
        defaultRiskPercent: settings.defaultRiskPercent,
        maxTradeRiskPercent: settings.maxTradeRiskPercent ?? 2,
        maxDailyLossPercent: settings.maxDailyLossPercent,
        maxDailyLossAmount: settings.maxDailyLossAmount,
        maxConsecutiveLossLimit: settings.maxConsecutiveLossLimit,
        maxDrawdownLimitPercent: settings.maxDrawdownLimitPercent ?? 10,
      },
      openOrPlannedTrades,
      recentClosedTrades: recentClosed,
      sessionBreakdown,
      topMistakes,
    },
    macroNews: macroCompact,
    fundamentalGold: fundamentalCompact,
    cmeFedWatch: fedWatch
      ? {
          dominantOutcome: fedWatch.dominantOutcome,
          fomcMeetingDate: fedWatch.fomcMeetingDate,
          cutPct: fedWatch.cutProbability,
          holdPct: fedWatch.holdProbability,
          hikePct: fedWatch.hikeProbability,
          isPricedInSaturated: fedWatch.isPricedInSaturated,
          summary: language === 'en' ? fedWatch.summaryNoteEn : fedWatch.summaryNoteId,
        }
      : null,
    polymarket: polymarketCompact,
    smcSignal,
    syncStatus: {
      status: syncAudit.status,
      note: language === 'en' ? syncAudit.noteEn : syncAudit.noteId,
    },
  };

  return {
    context,
    absorbedSummary: {
      tradesCount: trades.length,
      closedCount: metrics.totalTrades,
      openOrPlannedCount: openOrPlannedTrades.length,
      macroBias: macro?.dominantBias || null,
      macroMovementType: macro?.scenarioMatrix?.dualHorizon?.movementType || null,
      macroAnalyzedAt: macro?.analyzedAt || null,
      fundamentalBias: fundamental?.overallBias || null,
      fundamentalAnalyzedAt: fundamental?.analyzedAt || null,
      polymarketCount: polymarket?.events?.length || 0,
      isOfflineMode,
      isNavigatorOnline,
    },
  };
}

/**
 * Deterministic Offline Fallback Engine when Offline Mode is enabled or internet is unavailable.
 * Ensures the trader can still inspect journal metrics, risk guardrails, and cached macro/spike meaning locally.
 */
export function buildOfflineAgentDeskReply(params: {
  message: string;
  trades: Trade[];
  settings: AppSettings;
  language: 'id' | 'en';
  reasonNote?: string;
}): Omit<AgentDeskMessage, 'id' | 'role' | 'createdAt'> {
  const startedAt = Date.now();
  const isEn = params.language === 'en';
  const { context } = buildAgentDeskContext(params.trades, params.settings, params.language);
  const journal = (context.journal as any) || {};
  const jSum = journal.summary || {};
  const macro = (context.macroNews as any) || null;
  const fund = (context.fundamentalGold as any) || null;
  const sym = params.settings.currencySymbol || '$';

  const q = params.message.toLowerCase();
  const asksMacro =
    /\b(news|berita|makro|macro|fundamental|gold|emas|xau|spike|sweep|arah|buy|sell|ambil|fomc|cpi|nfp|dxy|bearish|bullish)\b/i.test(
      q
    );
  const asksJournal =
    /\b(jurnal|journal|trade|win|profit|loss|rugi|drawdown|lot|risiko|risk|posisi|open|planned|evaluasi|kesalahan|sesi|equity|saldo)\b/i.test(
      q
    );

  const lines: string[] = [];
  if (params.reasonNote) {
    lines.push(params.reasonNote);
  } else {
    lines.push(
      isEn
        ? 'Offline Mode active — answering directly from your local journal & last cached market snapshot on this device.'
        : 'Mode Offline aktif — menjawab langsung dari jurnal lokal & cache data pasar terakhir di perangkat ini.'
    );
  }

  let directionClarity: AgentDeskActionCardClient['directionClarity'] = 'INFO_ONLY';
  let directionLabel = isEn ? 'Local Offline Briefing' : 'Briefing Lokal (Offline)';
  let spikeWarning = '-';
  let riskReminder = jSum.isDailyLossExceeded
    ? isEn
      ? 'Daily loss limit reached — pause trading today.'
      : 'Batas rugi harian sudah tercapai — hentikan entry hari ini.'
    : isEn
    ? `Equity ${sym}${jSum.currentEquity ?? 0} · Max risk ${params.settings.defaultRiskPercent}%/trade.`
    : `Ekuitas ${sym}${jSum.currentEquity ?? 0} · Risiko standar ${params.settings.defaultRiskPercent}%/trade.`;

  if (asksMacro || !asksJournal) {
    if (macro) {
      const bias = macro.dominantBias;
      const dh = macro.dualHorizon;
      directionClarity = bias === 'BUY' ? 'BUY' : bias === 'SELL' ? 'SELL' : 'WAIT_MIXED';
      directionLabel =
        bias === 'BUY'
          ? isEn
            ? 'Cached Bias: BUY (Up)'
            : 'Bias Cache: BUY (Naik)'
          : bias === 'SELL'
          ? isEn
            ? 'Cached Bias: SELL (Down)'
            : 'Bias Cache: SELL (Turun)'
          : isEn
          ? 'Cached Bias: WAIT / MIXED'
          : 'Bias Cache: TUNGGU / 2 ARAH';

      const plainMeaning =
        bias === 'SELL'
          ? isEn
            ? 'XAUUSD leans DOWN (SELL pressure).'
            : 'XAUUSD condong TURUN (tekanan SELL).'
          : bias === 'BUY'
          ? isEn
            ? 'XAUUSD leans UP (BUY pressure).'
            : 'XAUUSD condong NAIK (tekanan BUY).'
          : isEn
          ? 'Mixed / two-way whipsaw risk — wait for clear confirmation.'
          : 'Campuran / rawan bolak-balik — lebih aman tunggu konfirmasi.';

      lines.push(
        isEn
          ? `\n**Trade News (Cached)**: Bias **${bias}** (Buy ${macro.buyProbability ?? '-'}% / Sell ${macro.sellProbability ?? '-'}%). ${plainMeaning}`
          : `\n**Trade News (Cache Perangkat)**: Bias utama **${bias}** (Buy ${macro.buyProbability ?? '-'}% / Sell ${macro.sellProbability ?? '-'}%). Artinya: ${plainMeaning}`
      );

      if (dh) {
        const isTwoWay = dh.movementType === 'TWO_WAY_SWEEP_FIRST';
        const spikeExplain =
          dh.initialCatalystBias === 'SELL'
            ? isEn
              ? 'Initial Bearish Spike = sharp initial DROP (NOT a blind buy signal).'
              : 'Bearish Spike awal artinya harga berpotensi nyentak TURUN tajam dulu (BUKAN sinyal langsung buy).'
            : dh.initialCatalystBias === 'BUY'
            ? isEn
              ? 'Initial Bullish Spike = sharp initial JUMP (do not chase blindly if main bias is SELL).'
              : 'Bullish Spike awal artinya harga berpotensi loncat NAIK dulu (jangan dikejar buta jika bias utama SELL).'
            : isEn
            ? 'Neutral initial spike — watch post-release structure.'
            : 'Katalis awal netral — tunggu struktur candle 15 menit setelah rilis.';

        spikeWarning = isTwoWay
          ? isEn
            ? `2-Way Sweep First active: ${dh.phase1Minute0to5}`
            : `Rawan 2 Arah (Sweep Dulu): ${dh.phase1Minute0to5}`
          : isEn
          ? `1-Way Direct Move: ${dh.phase1Minute0to5}`
          : `Pola 1 Arah Langsung: ${dh.phase1Minute0to5}`;

        lines.push(
          isEn
            ? `• **Spike & Phase**: ${dh.movementBadge}. ${spikeExplain}\n• **Phase 0–5m**: ${dh.phase1Minute0to5}\n• **Phase 15m+**: ${dh.phase2Minute15Plus}`
            : `• **Pola Spike**: ${dh.movementBadge}. ${spikeExplain}\n• **Fase Menit 0–5**: ${dh.phase1Minute0to5}\n• **Fase Menit 15+**: ${dh.phase2Minute15Plus}`
        );
      }
    } else {
      lines.push(
        isEn
          ? '\n**Trade News**: No cached snapshot on device yet. Go online and open Trade News once to store the latest data.'
          : '\n**Trade News**: Belum ada cache berita di perangkat. Aktifkan internet & buka menu Berita Trading sekali agar datanya tersimpan.'
      );
    }

    if (fund) {
      lines.push(
        isEn
          ? `• **Fundamental Gold (Cached)**: **${fund.overallBias}** (1D: ${fund.horizons?.daily1D?.bias || '-'}, 1W: ${fund.horizons?.weekly1W?.bias || '-'}, 1M: ${fund.horizons?.monthly1M?.bias || '-'}).`
          : `• **Fundamental Emas (Cache)**: **${fund.overallBias}** (1D: ${fund.horizons?.daily1D?.bias || '-'}, 1W: ${fund.horizons?.weekly1W?.bias || '-'}, 1M: ${fund.horizons?.monthly1M?.bias || '-'}).`
      );
    }
  }

  if (asksJournal || !asksMacro) {
    lines.push(
      isEn
        ? `\n**Offline Journal Summary**: ${jSum.closedTradesCount ?? 0} closed trades · Win Rate **${jSum.winRatePct ?? 0}%** · Profit Factor **${jSum.profitFactor ?? 0}** · Net PnL **${sym}${jSum.totalNetProfit ?? 0}** · Max DD **${jSum.maxDrawdownPercent ?? 0}%**.`
        : `\n**Ringkasan Jurnal Offline**: ${jSum.closedTradesCount ?? 0} trade selesai · Win Rate **${jSum.winRatePct ?? 0}%** · Profit Factor **${jSum.profitFactor ?? 0}** · Net PnL **${sym}${jSum.totalNetProfit ?? 0}** · Max DD **${jSum.maxDrawdownPercent ?? 0}%**.`
    );

    const openList = Array.isArray(journal.openOrPlannedTrades) ? journal.openOrPlannedTrades : [];
    if (openList.length > 0) {
      const preview = openList
        .slice(0, 3)
        .map((p: any) => `${p.lifecycle} ${p.instrument} ${p.position} (${p.lotSize} lot @ ${p.entryPrice})`)
        .join(', ');
      lines.push(
        isEn
          ? `• **Active / Planned Positions (${openList.length})**: ${preview}.`
          : `• **Posisi Aktif / Rencana (${openList.length})**: ${preview}.`
      );
    }
    if (Array.isArray(journal.topMistakes) && journal.topMistakes.length > 0) {
      const topM = journal.topMistakes[0];
      lines.push(
        isEn
          ? `• **Most Frequent Mistake**: ${topM.tag} (${topM.count}x, PnL impact ${sym}${topM.netImpact}).`
          : `• **Kesalahan Tersering**: ${topM.tag} (${topM.count}x, dampak ${sym}${topM.netImpact}).`
      );
    }
  }

  return {
    content: lines.join('\n'),
    mode: 'OFFLINE_LOCAL',
    actionCard: {
      directionClarity,
      directionLabel,
      spikeWarning,
      riskReminder,
    },
    workflowTrace: [
      {
        stepNumber: 1,
        role: 'OFFLINE_ENGINE',
        divisionName: isEn ? 'Local Offline Engine' : 'Mesin Lokal Offline',
        provider: 'offline',
        model: 'deterministic-local-v1',
        action: isEn ? 'Local Journal + Cache Synthesis' : 'Baca Jurnal Offline & Cache Lokal',
        status: 'fallback',
        summary: isEn
          ? 'Answered locally without internet using device journal & cached snapshots.'
          : 'Dijawab langsung secara lokal dari jurnal offline & cache perangkat tanpa internet.',
        latencyMs: Math.max(1, Date.now() - startedAt),
      },
    ],
    revisionTriggered: false,
    activeProviders: ['Offline Local'],
    totalLatencyMs: Math.max(1, Date.now() - startedAt),
  };
}

export async function sendAgentDeskChatMessage(params: {
  message: string;
  history: AgentDeskMessage[];
  trades: Trade[];
  settings: AppSettings;
  language: 'id' | 'en';
  persona?: AgentChatPersona;
  agentName?: string;
}): Promise<Omit<AgentDeskMessage, 'id' | 'role' | 'createdAt'>> {
  const isOfflineMode = isNewsCycleOfflineMode();
  const isNavigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;

  if (isOfflineMode || !isNavigatorOnline) {
    return buildOfflineAgentDeskReply({
      message: params.message,
      trades: params.trades,
      settings: params.settings,
      language: params.language,
    });
  }

  const { context } = buildAgentDeskContext(params.trades, params.settings, params.language);
  const compactHistory = params.history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 800),
  }));

  const payload = {
    message: params.message.trim(),
    language: params.language,
    persona: params.persona || 'casual',
    agentName: params.agentName || 'Head Desk',
    history: compactHistory,
    context,
  };

  const candidates = getApiEndpointCandidates('/api/agent-desk/chat');
  let lastErrorMsg = '';

  for (const url of candidates) {
    const res = await nativeAwarePostJson(url, payload, 38_000);
    if (res.ok && res.json?.success && typeof res.json.answer === 'string' && res.json.answer.trim()) {
      return {
        content: res.json.answer.trim(),
        mode: 'ONLINE_MULTI_AGENT',
        routeType: res.json.routeType === 'DIRECT_FOLLOWUP' ? 'DIRECT_FOLLOWUP' : 'FULL_OFFICE',
        actionCard: res.json.actionCard,
        workflowTrace: Array.isArray(res.json.workflowTrace) ? res.json.workflowTrace : [],
        revisionTriggered: Boolean(res.json.revisionTriggered),
        activeProviders: Array.isArray(res.json.activeProviders) ? res.json.activeProviders : [],
        totalLatencyMs: Number(res.json.totalLatencyMs) || 0,
      };
    }
    if (res.errorMessage) {
      lastErrorMsg = res.errorMessage;
      recordAppDiagnosticEvent('AI_DESK', `Agent chat request failed (${res.status || 'network'})`, `${url}: ${res.errorMessage}`);
    }
  }

  // Graceful fallback to local deterministic offline reader so the trader is never left stranded
  const isEn = params.language === 'en';
  const fallbackNote = isEn
    ? `Multi-Agent cloud desk is temporarily unreachable (${lastErrorMsg || 'network/deploy pending'}). Showing instant local briefing from your device data:`
    : `Server Multi-Agent AI sedang tidak terjangkau (${lastErrorMsg || 'koneksi / Edge Function belum di-redeploy'}). Berikut rangkuman langsung dari data di perangkat Anda:`;

  return buildOfflineAgentDeskReply({
    message: params.message,
    trades: params.trades,
    settings: params.settings,
    language: params.language,
    reasonNote: fallbackNote,
  });
}
