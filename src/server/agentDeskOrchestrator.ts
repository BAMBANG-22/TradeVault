/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TradeVault Multi-Agent Office Orchestrator.
 *
 * Covers 3 Office Workflows:
 * 1. News & Fundamental Division Drafting (`runSpecialistNewsDraft`)
 *    - Trade News Division: Groq primary -> OpenRouter backup -> hands draft to Boss Gemini for ACC
 *    - Fundamental Gold Division: OpenRouter primary -> Groq backup -> hands draft to Boss Gemini for ACC
 * 2. Conversational AI Desk Chat (`runAgentDeskOrchestration`)
 *    - Smart Routing: quick follow-ups answered directly by Boss (saves quota & feels instant)
 *    - Full Office Teamwork: Macro Division [Groq] + Journal Division [OpenRouter] -> Boss Gemini Audit & Revision
 *    - Natural, human, persona-aware replies (casual / concise / mentor) — zero robotic templates
 * 3. QA / Cleaning Service Diagnostics Analyst (`runAiQaDiagnostics`)
 *    - Reads deterministic APK/Web health probe + error log and identifies exact root cause & fix.
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export type AgentProviderId = 'gemini' | 'groq' | 'openrouter' | 'system';
export type AgentChatPersona = 'casual' | 'concise' | 'mentor';

export interface AgentWorkflowStep {
  stepNumber: number;
  role:
    | 'BOSS_DISPATCH'
    | 'DIVISI_MAKRO'
    | 'DIVISI_JURNAL'
    | 'BOSS_AUDIT'
    | 'REVISION'
    | 'BOSS_SIGNOFF'
    | 'BOSS_DIRECT';
  divisionName: string;
  provider: AgentProviderId;
  model: string;
  action: string;
  status: 'completed' | 'revised' | 'fallback';
  summary: string;
  latencyMs: number;
}

export interface AgentDeskActionCard {
  directionClarity: 'BUY' | 'SELL' | 'WAIT_MIXED' | 'INFO_ONLY';
  directionLabel: string;
  spikeWarning: string;
  riskReminder: string;
}

export interface AgentDeskChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentDeskResponsePayload {
  success: boolean;
  answer: string;
  routeType?: 'DIRECT_FOLLOWUP' | 'FULL_OFFICE';
  actionCard: AgentDeskActionCard;
  workflowTrace: AgentWorkflowStep[];
  revisionTriggered: boolean;
  activeProviders: string[];
  totalLatencyMs: number;
  error?: string;
}

export interface AgentDeskEnvKeys {
  geminiKeys: string[];
  groqKeys: string[];
  openRouterKeys: string[];
}

const GEMINI_BOSS_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
const GEMINI_STAFF_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] as const;
const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-32b:free',
  'deepseek/deepseek-r1-0528:free',
] as const;

export function parseEnvKeyList(raw: string | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length >= 8)
    )
  );
}

export function resolveAgentDeskEnvKeys(): AgentDeskEnvKeys {
  const geminiKeys = Array.from(
    new Set([
      ...parseEnvKeyList(process.env.GEMINI_NEWS_API_KEY),
      ...parseEnvKeyList(process.env.GEMINI_API_KEY),
    ])
  );
  const groqKeys = parseEnvKeyList(process.env.GROQ_API_KEY);
  const openRouterKeys = parseEnvKeyList(process.env.OPENROUTER_API_KEY);
  return { geminiKeys, groqKeys, openRouterKeys };
}

function sanitizeAgentError(err: unknown): string {
  return String((err as { message?: unknown })?.message || err || 'Unknown error')
    .replace(/AIza[0-9A-Za-z\-_]{16,}/g, '[REDACTED_KEY]')
    .replace(/gsk_[0-9A-Za-z\-_]{16,}/g, '[REDACTED_KEY]')
    .replace(/sk-or-[a-zA-Z0-9\-_]{16,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function withAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    fn(controller.signal).then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function parseJsonLoose(rawText: string): Record<string, any> | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const sliced = cleaned.slice(start, end + 1);
        const parsed = JSON.parse(sliced);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

interface ProviderCallResult {
  provider: AgentProviderId;
  model: string;
  text: string;
  json: Record<string, any> | null;
  latencyMs: number;
}

async function callGeminiProvider(params: {
  keys: string[];
  models: readonly string[];
  systemInstruction: string;
  userPrompt: string;
  expectJson: boolean;
  timeoutMs: number;
}): Promise<ProviderCallResult> {
  if (params.keys.length === 0) {
    throw new Error('Gemini API key not configured');
  }
  let lastErr: unknown = new Error('Gemini call failed');

  for (const model of params.models) {
    for (const apiKey of params.keys) {
      const start = Date.now();
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
          retryOptions: { attempts: 1 },
        },
      });

      try {
        const response = await withAbortTimeout(
          (abortSignal) =>
            ai.models.generateContent({
              model,
              contents: params.userPrompt,
              config: {
                abortSignal,
                systemInstruction: params.systemInstruction,
                ...(model === 'gemini-4-hydrogen'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                ...(params.expectJson ? { responseMimeType: 'application/json' } : {}),
              },
            }),
          params.timeoutMs,
          `Gemini(${model})`
        );

        const text = (response?.text || '').trim();
        if (text) {
          const json = params.expectJson ? parseJsonLoose(text) : null;
          if (!params.expectJson || json) {
            return {
              provider: 'gemini',
              model,
              text,
              json,
              latencyMs: Date.now() - start,
            };
          }
          lastErr = new Error(`Gemini(${model}) returned non-JSON`);
        } else {
          lastErr = new Error(`Gemini(${model}) empty response`);
        }
      } catch (err) {
        lastErr = err;
      }
    }
  }

  throw new Error(sanitizeAgentError(lastErr));
}

async function callOpenAiCompatibleProvider(params: {
  provider: 'groq' | 'openrouter';
  endpoint: string;
  keys: string[];
  models: readonly string[];
  systemInstruction: string;
  userPrompt: string;
  expectJson: boolean;
  timeoutMs: number;
  temperature?: number;
}): Promise<ProviderCallResult> {
  if (params.keys.length === 0) {
    throw new Error(`${params.provider} API key not configured`);
  }
  let lastErr: unknown = new Error(`${params.provider} call failed`);

  for (const model of params.models) {
    for (const apiKey of params.keys) {
      const start = Date.now();
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        };
        if (params.provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://tradevault.app';
          headers['X-Title'] = 'TradeVault AI Desk';
        }

        const body: Record<string, unknown> = {
          model,
          messages: [
            { role: 'system', content: params.systemInstruction },
            { role: 'user', content: params.userPrompt },
          ],
          temperature: params.temperature ?? (params.expectJson ? 0.2 : 0.65),
          max_tokens: 1100,
        };
        if (params.expectJson && params.provider === 'groq') {
          body.response_format = { type: 'json_object' };
        }

        const res = await withAbortTimeout(
          (signal) =>
            fetch(params.endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal,
            }),
          params.timeoutMs,
          `${params.provider}(${model})`
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          lastErr = new Error(`HTTP ${res.status}: ${errText.slice(0, 120)}`);
          continue;
        }

        const data = (await res.json()) as any;
        const rawContent = String(data?.choices?.[0]?.message?.content || '').trim();
        if (!rawContent) {
          lastErr = new Error(`${params.provider}(${model}) empty content`);
          continue;
        }

        const json = params.expectJson ? parseJsonLoose(rawContent) : null;
        if (!params.expectJson || json) {
          return {
            provider: params.provider,
            model,
            text: rawContent,
            json,
            latencyMs: Date.now() - start,
          };
        }
        lastErr = new Error(`${params.provider}(${model}) invalid JSON`);
      } catch (err) {
        lastErr = err;
      }
    }
  }

  throw new Error(sanitizeAgentError(lastErr));
}

async function runWithProviderCascade(params: {
  order: Array<'gemini' | 'groq' | 'openrouter'>;
  keys: AgentDeskEnvKeys;
  isBoss?: boolean;
  systemInstruction: string;
  userPrompt: string;
  expectJson: boolean;
  timeoutMs: number;
  temperature?: number;
}): Promise<ProviderCallResult> {
  const errors: string[] = [];

  for (const prov of params.order) {
    try {
      if (prov === 'groq' && params.keys.groqKeys.length > 0) {
        return await callOpenAiCompatibleProvider({
          provider: 'groq',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          keys: params.keys.groqKeys,
          models: GROQ_MODELS,
          systemInstruction: params.systemInstruction,
          userPrompt: params.userPrompt,
          expectJson: params.expectJson,
          timeoutMs: params.timeoutMs,
          temperature: params.temperature,
        });
      }
      if (prov === 'openrouter' && params.keys.openRouterKeys.length > 0) {
        return await callOpenAiCompatibleProvider({
          provider: 'openrouter',
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          keys: params.keys.openRouterKeys,
          models: OPENROUTER_FREE_MODELS,
          systemInstruction: params.systemInstruction,
          userPrompt: params.userPrompt,
          expectJson: params.expectJson,
          timeoutMs: params.timeoutMs,
          temperature: params.temperature,
        });
      }
      if (prov === 'gemini' && params.keys.geminiKeys.length > 0) {
        return await callGeminiProvider({
          keys: params.keys.geminiKeys,
          models: params.isBoss ? GEMINI_BOSS_MODELS : GEMINI_STAFF_MODELS,
          systemInstruction: params.systemInstruction,
          userPrompt: params.userPrompt,
          expectJson: params.expectJson,
          timeoutMs: params.timeoutMs,
        });
      }
    } catch (err) {
      errors.push(`${prov}: ${sanitizeAgentError(err)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'No configured AI provider succeeded');
}

// ============================================================================
// 1. MULTI-AGENT STAFF DRAFTING FOR TRADE NEWS & FUNDAMENTAL GOLD (BOSS GEMINI ACC)
// ============================================================================

export interface SpecialistNewsDraftResult {
  used: boolean;
  provider: 'groq' | 'openrouter' | null;
  model: string | null;
  draftText: string;
  latencyMs: number;
}

/**
 * Offloads initial heavy research synthesis for Trade News (Groq primary -> OpenRouter backup)
 * or Fundamental Gold (OpenRouter primary -> Groq backup) before handing the memo to Boss Gemini
 * for strict verification and ACC sign-off.
 * Returns `{ used: false }` cleanly when neither GROQ_API_KEY nor OPENROUTER_API_KEY is set.
 */
export async function runSpecialistNewsDraft(params: {
  division: 'TRADE_NEWS' | 'FUNDAMENTAL_GOLD';
  dataset: Record<string, unknown>;
  keys?: AgentDeskEnvKeys;
}): Promise<SpecialistNewsDraftResult> {
  const keys = params.keys || resolveAgentDeskEnvKeys();
  const hasExternalStaff = keys.groqKeys.length > 0 || keys.openRouterKeys.length > 0;
  if (!hasExternalStaff) {
    return { used: false, provider: null, model: null, draftText: '', latencyMs: 0 };
  }

  const order: Array<'groq' | 'openrouter'> =
    params.division === 'TRADE_NEWS' ? ['groq', 'openrouter'] : ['openrouter', 'groq'];

  const systemInstruction =
    params.division === 'TRADE_NEWS'
      ? `Kamu adalah Divisi Riset Berita & Spike XAU/USD. Tugasmu menyusun DRAFT MEMO singkat dan tajam untuk diperiksa & di-ACC oleh Boss Gemini.
Fokus: (1) arah dominan XAU/USD (BUY/SELL/MIXED) & probabilitas wajar berdasarkan DXY, US02Y, US10Y, USOIL, FedWatch, dan rilis kalender, (2) deteksi jelas 1-Arah vs 2-Arah Sweep First (Fase 0-5 menit vs Fase 15+ menit), (3) peringatan jebakan pidato Fed / priced-in / whipsaw, (4) tesis singkat lintas aset.
Keluarkan memo ringkas padat (maks 280 kata) berbasis data nyata saja.`
      : `Kamu adalah Divisi Riset Fundamental Emas (XAU/USD). Tugasmu menyusun DRAFT MEMO lintas-aset untuk diperiksa & di-ACC oleh Boss Gemini.
ATURAN: DILARANG menulis kata "BUY" atau "SELL" — gunakan hanya "BULLISH", "BEARISH", atau "NEUTRAL".
Fokus: (A) rezim makro & perubahan terbaru, (B) Real Yield, US10Y, FedWatch & DXY, (C) arus modal lintas pasar (Wall Street, VIX, GLD, CFTC COT, Asia/China, Oil), (D) proyeksi 1D / 1W / 1M + pemicu invalidasi.
Keluarkan memo padat (maks 320 kata) hanya dari angka nyata di dataset.`;

  const userPrompt = `Dataset terverifikasi untuk ${params.division}:\n${JSON.stringify(params.dataset).slice(
    0,
    13_500
  )}\n\nSusun draft memo riset untuk di-review & di-ACC oleh Boss Gemini.`;

  try {
    const res = await runWithProviderCascade({
      order,
      keys,
      isBoss: false,
      systemInstruction,
      userPrompt,
      expectJson: false,
      timeoutMs: 7000,
      temperature: 0.2,
    });
    if (res.provider === 'groq' || res.provider === 'openrouter') {
      return {
        used: true,
        provider: res.provider,
        model: res.model,
        draftText: res.text.slice(0, 2600),
        latencyMs: res.latencyMs,
      };
    }
  } catch {
    // Non-blocking: Boss Gemini still completes the full analysis directly
  }
  return { used: false, provider: null, model: null, draftText: '', latencyMs: 0 };
}

// ============================================================================
// 2. CONVERSATIONAL MULTI-AGENT AI DESK (SMART ROUTING + NATURAL PERSONA)
// ============================================================================

function sanitizeIncomingPayload(raw: unknown): {
  valid: boolean;
  error?: string;
  message: string;
  language: 'id' | 'en';
  persona: AgentChatPersona;
  agentName: string;
  history: AgentDeskChatHistoryItem[];
  contextObj: Record<string, any>;
} {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  if (!message) {
    return {
      valid: false,
      error: 'Pertanyaan tidak boleh kosong.',
      message: '',
      language: 'id',
      persona: 'casual',
      agentName: 'Head Desk',
      history: [],
      contextObj: {},
    };
  }

  const language: 'id' | 'en' = body.language === 'en' ? 'en' : 'id';
  const rawPersona = String(body.persona || 'casual').toLowerCase();
  const persona: AgentChatPersona =
    rawPersona === 'concise' || rawPersona === 'mentor' ? rawPersona : 'casual';
  const agentName =
    typeof body.agentName === 'string' && body.agentName.trim()
      ? body.agentName.trim().slice(0, 40)
      : 'Head Desk';

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: AgentDeskChatHistoryItem[] = rawHistory
    .slice(-10)
    .filter(
      (item: any) =>
        item &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0
    )
    .map((item: any) => ({
      role: item.role as 'user' | 'assistant',
      content: String(item.content).trim().slice(0, 800),
    }));

  const contextObj =
    body.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? (body.context as Record<string, any>)
      : {};

  return {
    valid: true,
    message,
    language,
    persona,
    agentName,
    history,
    contextObj,
  };
}

function getPersonaStyleGuide(persona: AgentChatPersona, agentName: string, isEn: boolean): string {
  if (isEn) {
    if (persona === 'concise') {
      return `Your name is ${agentName}. Reply super crisp, direct, and concise (2-5 short lines), like a sharp trading partner texting on DM. Zero fluff or formal templates.`;
    }
    if (persona === 'mentor') {
      return `Your name is ${agentName}. Reply like a calm, experienced desk mentor on chat — sharp, honest, structured only when truly helpful, never robotic.`;
    }
    return `Your name is ${agentName}. Reply like a real, friendly trading partner chatting on WhatsApp/DM — relaxed, direct, flexible, human, and zero stiff/formal report templates.`;
  }
  if (persona === 'concise') {
    return `Namamu ${agentName}. Balas super ringkas, lugas, dan langsung ke intinya (2–5 baris pendek) seperti rekan meja trading chat lewat DM. Tanpa basa-basi atau format laporan kaku.`;
  }
  if (persona === 'mentor') {
    return `Namamu ${agentName}. Balas seperti mentor trading berpengalaman yang tegas, jujur, tapi tetap enak diajak ngobrol di chat — jelas, membumi, dan tidak kaku seperti robot.`;
  }
  return `Namamu ${agentName}. Balas dengan gaya ngobrol yang santai, akrab, lugas, dan fleksibel seperti teman/partner trading beneran di WhatsApp atau DM Instagram. Jangan pakai template kaku ("1. ... 2. ... 3. ...") kecuali benar-benar perlu; sesuaikan panjang jawaban dengan pertanyaan user.`;
}

function isLightweightFollowUp(message: string, history: AgentDeskChatHistoryItem[]): boolean {
  const q = message.trim().toLowerCase();
  if (q.length <= 28 && /^(halo|hai|hi|hey|pagi|siang|sore|malam|tes|test|oke|ok|siap|makasih|thanks|thank you|sip|mantap|paham|noted|oh gitu|ohh|hmm|haha|wkwk)[\s!?.]*$/i.test(q)) {
    return true;
  }
  if (history.length >= 2 && q.length <= 95) {
    const asksFreshAudit =
      /\b(cek ulang|audit|evaluasi jurnal|rekap|fundamental|polymarket|fedwatch|posisi aktif|win\s?rate|drawdown|profit factor|update terbaru|berita baru)\b/i.test(
        q
      );
    const isFollowUpCue =
      /^(jadi|berarti|oh|ohh|terus|trus|maksudnya|kalau gitu|kalo gitu|so|meaning|wait|tunggu|oke|ok|bener|yakin|kenapa|kok|gimana|gmn)\b/i.test(
        q
      );
    if (isFollowUpCue && !asksFreshAudit) {
      return true;
    }
  }
  return false;
}

function planDivisionDispatch(
  message: string,
  contextObj: Record<string, any>
): {
  runMacro: boolean;
  runJournal: boolean;
  intentLabelId: string;
  intentLabelEn: string;
} {
  const q = message.toLowerCase();
  const asksJournal =
    /\b(jurnal|journal|trade|trading saya|win\s?rate|profit|loss|rugi|drawdown|lot|risiko|risk|posisi|open|planned|history|riwayat|evaluasi|kesalahan|mistake|emosi|fomo|sesi|session|equity|saldo|balance|guardrail|target)\b/i.test(
      q
    );
  const asksMacro =
    /\b(news|berita|makro|macro|fundamental|gold|emas|xau|spike|sweep|arah|buy|sell|fomc|fed|cpi|ppi|nfp|pmi|dxy|yield|us10y|us02y|oil|polymarket|smc|cycle|confluence|bearish|bullish|priced|speech|pidato|rilis|entry|ambil)\b/i.test(
      q
    );

  const hasMacroData = Boolean(contextObj?.macroNews || contextObj?.fundamentalGold || contextObj?.polymarket);
  const hasJournalData = Boolean(contextObj?.journal);

  if (asksJournal && asksMacro) {
    return {
      runMacro: true,
      runJournal: true,
      intentLabelId: 'Gabungan Makro/News + Jurnal & Risiko',
      intentLabelEn: 'Combined Macro/News + Journal & Risk',
    };
  }
  if (asksJournal && !asksMacro) {
    return {
      runMacro: hasMacroData && /\b(posisi|open|planned|entry|ambil|aman|hari ini|sekarang)\b/i.test(q),
      runJournal: true,
      intentLabelId: 'Audit Jurnal, Posisi & Manajemen Risiko',
      intentLabelEn: 'Journal, Positions & Risk Audit',
    };
  }
  if (asksMacro && !asksJournal) {
    return {
      runMacro: true,
      runJournal: hasJournalData && /\b(posisi|saya|ambil|lot|risiko|akun|aman)\b/i.test(q),
      intentLabelId: 'Analisis Trade News, Spike/Sweep & Fundamental Emas',
      intentLabelEn: 'Trade News, Spike/Sweep & Gold Fundamental Analysis',
    };
  }

  return {
    runMacro: hasMacroData || true,
    runJournal: hasJournalData || true,
    intentLabelId: 'Briefing Terpadu Meja Trading (Makro + Jurnal)',
    intentLabelEn: 'Integrated Trading Desk Briefing (Macro + Journal)',
  };
}

function formatHistoryBlock(history: AgentDeskChatHistoryItem[]): string {
  if (history.length === 0) return '(Belum ada obrolan sebelumnya)';
  return history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'USER' : 'AGENT'}: ${h.content}`)
    .join('\n');
}

function buildMacroDivisionPrompt(params: {
  message: string;
  history: AgentDeskChatHistoryItem[];
  contextObj: Record<string, any>;
  language: 'id' | 'en';
  revisionInstruction?: string;
}): { system: string; user: string } {
  const macroSlice = {
    isOfflineMode: params.contextObj?.runtime?.isOfflineMode ?? false,
    generatedAt: params.contextObj?.runtime?.capturedAt ?? null,
    macroNews: params.contextObj?.macroNews ?? null,
    fundamentalGold: params.contextObj?.fundamentalGold ?? null,
    cmeFedWatch: params.contextObj?.cmeFedWatch ?? null,
    polymarket: params.contextObj?.polymarket ?? null,
    smcSignal: params.contextObj?.smcSignal ?? null,
    syncStatus: params.contextObj?.syncStatus ?? null,
  };

  const system = `Kamu adalah KEPALA DIVISI MAKRO, BERITA & FUNDAMENTAL EMAS (XAUUSD) di belakang layar TradeVault.
Susun memo fakta 100% AKURAT untuk Boss Gemini.
ATURAN MUTLAK:
1. Terjemahkan istilah ke arti arah nyata:
   - "Bearish Spike awal" = harga XAUUSD TURUN tajam dulu, BUKAN sinyal BUY langsung!
   - "Bullish Spike awal" = harga XAUUSD NAIK tajam dulu, BUKAN otomatis aman dikejar BUY kalau bias utama SELL!
   - "TWO_WAY_SWEEP_FIRST" = rawan tipuan menit 0–5, tunggu sapuan selesai lalu ikuti Fase 2 (menit 15+).
2. DILARANG mengarang angka/jadwal/harga yang tidak ada di data.
3. Jawab HANYA JSON valid:
   {"headlineVerdict":string,"plainDirection":"BUY"|"SELL"|"WAIT_MIXED"|"NO_DATA","directionExplanation":string,"spikeAnalysis":string,"alignmentCheck":string,"keyEvidence":string[],"caveats":string}`;

  const revisionSection = params.revisionInstruction
    ? `\n\n[PERINTAH REVISI DARI BOSS GEMINI]:\n${params.revisionInstruction}`
    : '';

  const user = `Bahasa: ${params.language === 'en' ? 'English' : 'Bahasa Indonesia'}
Pesan User: "${params.message}"
Riwayat obrolan:
${formatHistoryBlock(params.history)}
Data Makro/Berita/Fundamental perangkat:
${JSON.stringify(macroSlice).slice(0, 14_000)}${revisionSection}
Keluarkan HANYA JSON.`;

  return { system, user };
}

function buildJournalDivisionPrompt(params: {
  message: string;
  history: AgentDeskChatHistoryItem[];
  contextObj: Record<string, any>;
  language: 'id' | 'en';
  revisionInstruction?: string;
}): { system: string; user: string } {
  const journalSlice = {
    journal: params.contextObj?.journal ?? null,
    runtime: params.contextObj?.runtime ?? null,
  };

  const system = `Kamu adalah KEPALA DIVISI JURNAL, PSIKOLOGI & MANAJEMEN RISIKO di belakang layar TradeVault.
Susun memo fakta 100% AKURAT dari data jurnal offline trader untuk Boss Gemini.
1. Gunakan HANYA angka nyata dari data jurnal (win rate, profit factor, net profit, drawdown, daily loss, streak, open/planned positions, kesalahan/emosi).
2. Jika jurnal masih 0 trade, sampaikan apa adanya.
3. Jawab HANYA JSON valid:
   {"journalHealthVerdict":string,"riskGuardrailStatus":"SAFE"|"CAUTION"|"BREACHED"|"NO_DATA","riskDetail":string,"openPositionsCheck":string,"keyPatterns":string[],"coachingNote":string}`;

  const revisionSection = params.revisionInstruction
    ? `\n\n[PERINTAH REVISI DARI BOSS GEMINI]:\n${params.revisionInstruction}`
    : '';

  const user = `Bahasa: ${params.language === 'en' ? 'English' : 'Bahasa Indonesia'}
Pesan User: "${params.message}"
Riwayat obrolan:
${formatHistoryBlock(params.history)}
Data Jurnal Offline & Risiko:
${JSON.stringify(journalSlice).slice(0, 11_000)}${revisionSection}
Keluarkan HANYA JSON.`;

  return { system, user };
}

function buildBossAuditAndSynthesisPrompt(params: {
  message: string;
  history: AgentDeskChatHistoryItem[];
  contextObj: Record<string, any>;
  macroMemo: Record<string, any> | null;
  journalMemo: Record<string, any> | null;
  language: 'id' | 'en';
  persona: AgentChatPersona;
  agentName: string;
  allowRevisionRequest: boolean;
}): { system: string; user: string } {
  const isEn = params.language === 'en';
  const personaGuide = getPersonaStyleGuide(params.persona, params.agentName, isEn);

  const system = `Kamu adalah BOSS / HEAD OF TRADING DESK (Gemini) sekaligus teman ngobrol langsung trader di aplikasi ini.
${personaGuide}

TUGAS 1 — AUDIT FAKTA DI BELAKANG LAYAR:
- Cocokkan memo divisi dengan DATA MENTAH perangkat trader.
- Jika ada kesalahan arah BUY/SELL, salah mengartikan Bearish Spike (turun tajam awal != sinyal buy), atau angka keliru -> ${
    params.allowRevisionRequest
      ? 'set "needsRevision": true, pilih "revisionTarget" ("MACRO_NEWS" atau "JOURNAL_RISK"), dan tulis "revisionInstruction" konkret.'
      : 'Ini final sign-off; set "needsRevision": false.'
  }

TUGAS 2 — BALASAN CHAT KE TRADER (HARUS NATURAL & MANUSIAWI!):
- Balas SEPERTI ORANG BENERAN LAGI CHAT DI WHATSAPP / DM INSTAGRAM!
- DILARANG pakai format kaku yang selalu berulang ("1. Analisis ... 2. Kondisi Jurnal ... 3. Saran ..."), dilarang terdengar seperti bot atau laporan birokratis.
- Jawab langsung sesuai pertanyaan & konteks obrolan terakhir. Kalau user tanya pendek, balas padat dan enak dibaca. Kalau butuh rincian angka/spike, selipkan secara natural dalam obrolan.
- Pastikan istilah seperti Bearish Spike / Sweep First selalu dijelaskan artinya secara gamblang (turun dulu / naik dulu / tunggu) agar trader tidak salah pencet arah.

Keluarkan HANYA JSON valid:
{
  "auditPassed": boolean,
  "needsRevision": boolean,
  "revisionTarget": "NONE" | "MACRO_NEWS" | "JOURNAL_RISK",
  "auditNotes": "1 kalimat singkat catatan audit internal",
  "revisionInstruction": "Instruksi revisi jika needsRevision=true, else string kosong",
  "finalAnswer": "Balasan chat natural, luwes & manusiawi dalam ${isEn ? 'English' : 'Bahasa Indonesia'}",
  "actionCard": {
    "directionClarity": "BUY" | "SELL" | "WAIT_MIXED" | "INFO_ONLY",
    "directionLabel": "Label sangat singkat jika relevan",
    "spikeWarning": "'-' jika tidak relevan",
    "riskReminder": "'-' jika tidak relevan"
  }
}`;

  const rawFactsAnchor = {
    runtime: params.contextObj?.runtime ?? null,
    macroFacts: params.contextObj?.macroNews
      ? {
          dominantBias: params.contextObj.macroNews.dominantBias,
          buyProb: params.contextObj.macroNews.buyProbability,
          sellProb: params.contextObj.macroNews.sellProbability,
          mixedProb: params.contextObj.macroNews.mixedProbability,
          movementType: params.contextObj.macroNews.dualHorizon?.movementType,
          initialCatalystBias: params.contextObj.macroNews.dualHorizon?.initialCatalystBias,
          phase1: params.contextObj.macroNews.dualHorizon?.phase1Minute0to5,
          phase2: params.contextObj.macroNews.dualHorizon?.phase2Minute15Plus,
          hasSpeechEvent: params.contextObj.macroNews.dualHorizon?.hasSpeechEvent,
          isPricedIn: params.contextObj.macroNews.dualHorizon?.isPricedIn,
          primaryEvent: params.contextObj.macroNews.primaryEvent,
        }
      : null,
    fundamentalFacts: params.contextObj?.fundamentalGold
      ? {
          overallBias: params.contextObj.fundamentalGold.overallBias,
          bullishPct: params.contextObj.fundamentalGold.bullishProbability,
          bearishPct: params.contextObj.fundamentalGold.bearishProbability,
          daily1D: params.contextObj.fundamentalGold.horizons?.daily1D,
          weekly1W: params.contextObj.fundamentalGold.horizons?.weekly1W,
          monthly1M: params.contextObj.fundamentalGold.horizons?.monthly1M,
        }
      : null,
    journalFacts: params.contextObj?.journal?.summary ?? null,
    openPositions: params.contextObj?.journal?.openOrPlannedTrades ?? [],
  };

  const user = `Bahasa: ${isEn ? 'English' : 'Bahasa Indonesia'}
Pesan User: "${params.message}"
Riwayat Obrolan:
${formatHistoryBlock(params.history)}

FAKTA MENTAH PERANGKAT:
${JSON.stringify(rawFactsAnchor).slice(0, 7000)}

MEMO DIVISI MAKRO:
${params.macroMemo ? JSON.stringify(params.macroMemo).slice(0, 4500) : '(tidak dipanggil)'}

MEMO DIVISI JURNAL:
${params.journalMemo ? JSON.stringify(params.journalMemo).slice(0, 4500) : '(tidak dipanggil)'}

Audit & tulis balasan chat natural dalam JSON.`;

  return { system, user };
}

function normalizeActionCard(raw: any, language: 'id' | 'en'): AgentDeskActionCard {
  const dirRaw = String(raw?.directionClarity || 'INFO_ONLY').toUpperCase();
  const directionClarity: AgentDeskActionCard['directionClarity'] =
    dirRaw === 'BUY' || dirRaw === 'SELL' || dirRaw === 'WAIT_MIXED' ? dirRaw : 'INFO_ONLY';
  return {
    directionClarity,
    directionLabel: String(raw?.directionLabel || (language === 'en' ? 'Desk Chat' : 'Obrolan Desk')).slice(0, 120),
    spikeWarning: String(raw?.spikeWarning || '-').slice(0, 220),
    riskReminder: String(raw?.riskReminder || '-').slice(0, 220),
  };
}

function formatProviderDisplayName(p: AgentProviderId): string {
  if (p === 'gemini') return 'Gemini';
  if (p === 'groq') return 'Groq';
  if (p === 'openrouter') return 'OpenRouter';
  return 'System';
}

export async function runAgentDeskOrchestration(
  rawBody: unknown,
  keys: AgentDeskEnvKeys
): Promise<{ status: number; payload: AgentDeskResponsePayload }> {
  const startedAt = Date.now();
  const validated = sanitizeIncomingPayload(rawBody);
  if (!validated.valid) {
    return {
      status: 400,
      payload: {
        success: false,
        answer: '',
        actionCard: normalizeActionCard(null, 'id'),
        workflowTrace: [],
        revisionTriggered: false,
        activeProviders: [],
        totalLatencyMs: Date.now() - startedAt,
        error: validated.error || 'Payload tidak valid.',
      },
    };
  }

  const totalKeysAvailable =
    keys.geminiKeys.length + keys.groqKeys.length + keys.openRouterKeys.length;
  if (totalKeysAvailable === 0) {
    return {
      status: 503,
      payload: {
        success: false,
        answer: '',
        actionCard: normalizeActionCard(null, validated.language),
        workflowTrace: [],
        revisionTriggered: false,
        activeProviders: [],
        totalLatencyMs: Date.now() - startedAt,
        error:
          validated.language === 'en'
            ? 'No AI provider key configured on the server yet.'
            : 'Belum ada API Key AI yang aktif di server.',
      },
    };
  }

  const isEn = validated.language === 'en';
  const workflowTrace: AgentWorkflowStep[] = [];
  const providersUsed = new Set<string>();

  // Smart Routing: quick conversational follow-ups skip full office meeting (fast + saves API quota!)
  if (isLightweightFollowUp(validated.message, validated.history)) {
    const personaGuide = getPersonaStyleGuide(validated.persona, validated.agentName, isEn);
    const directSystem = `${personaGuide}
Kamu sedang membalas obrolan ringan / lanjutan di chat trading TradeVault.
- Tetap jujur terhadap fakta yang ada di riwayat obrolan & ringkasan konteks singkat ini (jangan mengarang angka baru).
- Balas natural, singkat, dan mengalir seperti chat WhatsApp/DM dengan orang sungguhan. Tidak perlu format poin kaku.`;
    const quickAnchor = {
      macroBias: validated.contextObj?.macroNews?.dominantBias ?? null,
      fundamentalBias: validated.contextObj?.fundamentalGold?.overallBias ?? null,
      tradesCount: validated.contextObj?.journal?.summary?.closedTradesCount ?? 0,
    };
    const directUser = `Riwayat obrolan:\n${formatHistoryBlock(validated.history)}\n\nRingkasan cepat konteks: ${JSON.stringify(
      quickAnchor
    )}\n\nPesan terbaru user: "${validated.message}"`;

    try {
      const directRes = await runWithProviderCascade({
        order: ['gemini', 'groq', 'openrouter'],
        keys,
        isBoss: true,
        systemInstruction: directSystem,
        userPrompt: directUser,
        expectJson: false,
        timeoutMs: 9000,
        temperature: 0.7,
      });
      providersUsed.add(formatProviderDisplayName(directRes.provider));
      workflowTrace.push({
        stepNumber: 1,
        role: 'BOSS_DIRECT',
        divisionName: `${validated.agentName} (Smart Direct)`,
        provider: directRes.provider,
        model: directRes.model,
        action: isEn ? 'Direct Conversational Reply' : 'Balasan Langsung (Hemat Kuota)',
        status: 'completed',
        summary: isEn
          ? 'Light follow-up detected — replied directly without calling full division meeting.'
          : 'Obrolan ringan / lanjutan — dibalas langsung oleh Boss tanpa rapat ulang divisi.',
        latencyMs: directRes.latencyMs,
      });
      return {
        status: 200,
        payload: {
          success: true,
          routeType: 'DIRECT_FOLLOWUP',
          answer: directRes.text.trim(),
          actionCard: normalizeActionCard(null, validated.language),
          workflowTrace,
          revisionTriggered: false,
          activeProviders: Array.from(providersUsed),
          totalLatencyMs: Date.now() - startedAt,
        },
      };
    } catch {
      // Fall through to full office pipeline if direct call fails
    }
  }

  // Full Multi-Agent Office Pipeline
  const dispatchStart = Date.now();
  const plan = planDivisionDispatch(validated.message, validated.contextObj);
  const delegatedNames = [
    plan.runMacro ? (isEn ? 'Macro & News Division' : 'Divisi Makro & Berita') : null,
    plan.runJournal ? (isEn ? 'Journal & Risk Division' : 'Divisi Jurnal & Risiko') : null,
  ].filter(Boolean);

  workflowTrace.push({
    stepNumber: 1,
    role: 'BOSS_DISPATCH',
    divisionName: isEn ? `${validated.agentName} (Boss)` : `${validated.agentName} (Boss Gemini)`,
    provider: keys.geminiKeys.length > 0 ? 'gemini' : keys.groqKeys.length > 0 ? 'groq' : 'openrouter',
    model: 'router-v2',
    action: isEn ? 'Task Delegation' : 'Pembagian Tugas Divisi',
    status: 'completed',
    summary: isEn
      ? `Focus: ${plan.intentLabelEn} -> Delegated to ${delegatedNames.join(' & ')}.`
      : `Fokus: ${plan.intentLabelId} -> Menugaskan ${delegatedNames.join(' & ')}.`,
    latencyMs: Math.max(1, Date.now() - dispatchStart),
  });

  let macroMemo: Record<string, any> | null = null;
  let journalMemo: Record<string, any> | null = null;
  let macroProviderUsed: AgentProviderId | null = null;
  let journalProviderUsed: AgentProviderId | null = null;

  const specialistTasks: Array<Promise<void>> = [];

  if (plan.runMacro) {
    specialistTasks.push(
      (async () => {
        const prompt = buildMacroDivisionPrompt({
          message: validated.message,
          history: validated.history,
          contextObj: validated.contextObj,
          language: validated.language,
        });
        try {
          const res = await runWithProviderCascade({
            order: ['groq', 'openrouter', 'gemini'],
            keys,
            isBoss: false,
            systemInstruction: prompt.system,
            userPrompt: prompt.user,
            expectJson: true,
            timeoutMs: 9000,
          });
          macroMemo = res.json || { headlineVerdict: res.text.slice(0, 300) };
          macroProviderUsed = res.provider;
          providersUsed.add(formatProviderDisplayName(res.provider));
          workflowTrace.push({
            stepNumber: workflowTrace.length + 1,
            role: 'DIVISI_MAKRO',
            divisionName: isEn ? 'Macro & News Division' : 'Divisi Makro & Berita',
            provider: res.provider,
            model: res.model,
            action: isEn ? 'Macro, Spike & Fundamental Audit' : 'Riset Berita, Spike & Fundamental',
            status: res.provider === 'groq' ? 'completed' : 'fallback',
            summary: String(
              macroMemo.headlineVerdict || macroMemo.directionExplanation || 'Memo makro dikirim ke Boss.'
            ).slice(0, 180),
            latencyMs: res.latencyMs,
          });
        } catch {
          workflowTrace.push({
            stepNumber: workflowTrace.length + 1,
            role: 'DIVISI_MAKRO',
            divisionName: isEn ? 'Macro & News Division' : 'Divisi Makro & Berita',
            provider: 'system',
            model: 'direct-context-passthrough',
            action: isEn ? 'Raw Context Escalation' : 'Eskalasi Data Langsung ke Boss',
            status: 'fallback',
            summary: isEn
              ? 'Raw macro context handed directly to Boss.'
              : 'Data makro mentah diserahkan langsung ke Boss.',
            latencyMs: 0,
          });
        }
      })()
    );
  }

  if (plan.runJournal) {
    specialistTasks.push(
      (async () => {
        const prompt = buildJournalDivisionPrompt({
          message: validated.message,
          history: validated.history,
          contextObj: validated.contextObj,
          language: validated.language,
        });
        try {
          const res = await runWithProviderCascade({
            order: ['openrouter', 'groq', 'gemini'],
            keys,
            isBoss: false,
            systemInstruction: prompt.system,
            userPrompt: prompt.user,
            expectJson: true,
            timeoutMs: 9000,
          });
          journalMemo = res.json || { journalHealthVerdict: res.text.slice(0, 300) };
          journalProviderUsed = res.provider;
          providersUsed.add(formatProviderDisplayName(res.provider));
          workflowTrace.push({
            stepNumber: workflowTrace.length + 1,
            role: 'DIVISI_JURNAL',
            divisionName: isEn ? 'Journal & Risk Division' : 'Divisi Jurnal & Risiko',
            provider: res.provider,
            model: res.model,
            action: isEn ? 'Offline Journal & Risk Audit' : 'Audit Jurnal Offline & Guardrail Risiko',
            status: res.provider === 'openrouter' ? 'completed' : 'fallback',
            summary: String(
              journalMemo.journalHealthVerdict || journalMemo.riskDetail || 'Memo jurnal dikirim ke Boss.'
            ).slice(0, 180),
            latencyMs: res.latencyMs,
          });
        } catch {
          workflowTrace.push({
            stepNumber: workflowTrace.length + 1,
            role: 'DIVISI_JURNAL',
            divisionName: isEn ? 'Journal & Risk Division' : 'Divisi Jurnal & Risiko',
            provider: 'system',
            model: 'direct-context-passthrough',
            action: isEn ? 'Raw Context Escalation' : 'Eskalasi Data Jurnal ke Boss',
            status: 'fallback',
            summary: isEn
              ? 'Raw journal stats handed directly to Boss.'
              : 'Data jurnal mentah diserahkan langsung ke Boss.',
            latencyMs: 0,
          });
        }
      })()
    );
  }

  await Promise.all(specialistTasks);

  const bossAuditPrompt = buildBossAuditAndSynthesisPrompt({
    message: validated.message,
    history: validated.history,
    contextObj: validated.contextObj,
    macroMemo,
    journalMemo,
    language: validated.language,
    persona: validated.persona,
    agentName: validated.agentName,
    allowRevisionRequest: Boolean(macroMemo || journalMemo),
  });

  let bossResult: ProviderCallResult;
  try {
    bossResult = await runWithProviderCascade({
      order: ['gemini', 'groq', 'openrouter'],
      keys,
      isBoss: true,
      systemInstruction: bossAuditPrompt.system,
      userPrompt: bossAuditPrompt.user,
      expectJson: true,
      timeoutMs: 13_000,
    });
  } catch (err) {
    return {
      status: 502,
      payload: {
        success: false,
        answer: '',
        actionCard: normalizeActionCard(null, validated.language),
        workflowTrace,
        revisionTriggered: false,
        activeProviders: Array.from(providersUsed),
        totalLatencyMs: Date.now() - startedAt,
        error: isEn
          ? `Head of Desk AI could not complete the reply: ${sanitizeAgentError(err)}`
          : `Boss AI gagal menyelesaikan balasan: ${sanitizeAgentError(err)}`,
      },
    };
  }

  providersUsed.add(formatProviderDisplayName(bossResult.provider));
  let bossJson = bossResult.json || {};
  const needsRevision =
    Boolean(bossJson.needsRevision) &&
    (bossJson.revisionTarget === 'MACRO_NEWS' || bossJson.revisionTarget === 'JOURNAL_RISK') &&
    typeof bossJson.revisionInstruction === 'string' &&
    bossJson.revisionInstruction.trim().length > 5 &&
    Date.now() - startedAt < 24_000;

  workflowTrace.push({
    stepNumber: workflowTrace.length + 1,
    role: 'BOSS_AUDIT',
    divisionName: isEn ? 'Boss Audit (Gemini)' : 'Audit Kualitas Boss (Gemini)',
    provider: bossResult.provider,
    model: bossResult.model,
    action: needsRevision
      ? isEn
        ? `Revision Ordered -> ${bossJson.revisionTarget}`
        : `Minta Revisi -> ${bossJson.revisionTarget === 'MACRO_NEWS' ? 'Divisi Makro' : 'Divisi Jurnal'}`
      : isEn
      ? 'Cross-Check Passed & ACC'
      : 'Cek Fakta Lolos & ACC',
    status: needsRevision ? 'revised' : 'completed',
    summary: String(
      bossJson.auditNotes ||
        (needsRevision
          ? bossJson.revisionInstruction
          : isEn
          ? 'Division memos verified against raw device facts.'
          : 'Laporan divisi lolos cek silang terhadap data mentah.')
    ).slice(0, 190),
    latencyMs: bossResult.latencyMs,
  });

  let revisionTriggered = false;
  if (needsRevision) {
    revisionTriggered = true;
    const target = bossJson.revisionTarget as 'MACRO_NEWS' | 'JOURNAL_RISK';
    const instruction = String(bossJson.revisionInstruction).trim().slice(0, 400);

    try {
      if (target === 'MACRO_NEWS') {
        const revOrder: Array<'gemini' | 'groq' | 'openrouter'> =
          macroProviderUsed === 'groq'
            ? ['openrouter', 'gemini', 'groq']
            : ['groq', 'openrouter', 'gemini'];
        const revPrompt = buildMacroDivisionPrompt({
          message: validated.message,
          history: validated.history,
          contextObj: validated.contextObj,
          language: validated.language,
          revisionInstruction: instruction,
        });
        const revRes = await runWithProviderCascade({
          order: revOrder,
          keys,
          isBoss: false,
          systemInstruction: revPrompt.system,
          userPrompt: revPrompt.user,
          expectJson: true,
          timeoutMs: 9000,
        });
        macroMemo = revRes.json || macroMemo;
        providersUsed.add(formatProviderDisplayName(revRes.provider));
        workflowTrace.push({
          stepNumber: workflowTrace.length + 1,
          role: 'REVISION',
          divisionName: isEn ? 'Macro Division (Revised)' : 'Revisi Divisi Makro',
          provider: revRes.provider,
          model: revRes.model,
          action: isEn ? 'Corrected Macro Memo' : 'Perbaikan Memo Makro',
          status: 'revised',
          summary: String(macroMemo?.headlineVerdict || 'Revisi selesai dikirim ke Boss.').slice(0, 180),
          latencyMs: revRes.latencyMs,
        });
      } else {
        const revOrder: Array<'gemini' | 'groq' | 'openrouter'> =
          journalProviderUsed === 'openrouter'
            ? ['groq', 'gemini', 'openrouter']
            : ['openrouter', 'groq', 'gemini'];
        const revPrompt = buildJournalDivisionPrompt({
          message: validated.message,
          history: validated.history,
          contextObj: validated.contextObj,
          language: validated.language,
          revisionInstruction: instruction,
        });
        const revRes = await runWithProviderCascade({
          order: revOrder,
          keys,
          isBoss: false,
          systemInstruction: revPrompt.system,
          userPrompt: revPrompt.user,
          expectJson: true,
          timeoutMs: 9000,
        });
        journalMemo = revRes.json || journalMemo;
        providersUsed.add(formatProviderDisplayName(revRes.provider));
        workflowTrace.push({
          stepNumber: workflowTrace.length + 1,
          role: 'REVISION',
          divisionName: isEn ? 'Journal Division (Revised)' : 'Revisi Divisi Jurnal',
          provider: revRes.provider,
          model: revRes.model,
          action: isEn ? 'Corrected Journal Memo' : 'Perbaikan Memo Jurnal',
          status: 'revised',
          summary: String(journalMemo?.journalHealthVerdict || 'Revisi selesai dikirim ke Boss.').slice(0, 180),
          latencyMs: revRes.latencyMs,
        });
      }

      const finalPrompt = buildBossAuditAndSynthesisPrompt({
        message: validated.message,
        history: validated.history,
        contextObj: validated.contextObj,
        macroMemo,
        journalMemo,
        language: validated.language,
        persona: validated.persona,
        agentName: validated.agentName,
        allowRevisionRequest: false,
      });
      const signOffRes = await runWithProviderCascade({
        order: ['gemini', 'groq', 'openrouter'],
        keys,
        isBoss: true,
        systemInstruction: finalPrompt.system,
        userPrompt: finalPrompt.user,
        expectJson: true,
        timeoutMs: 11_000,
      });
      if (signOffRes.json && signOffRes.json.finalAnswer) {
        bossJson = signOffRes.json;
      }
      providersUsed.add(formatProviderDisplayName(signOffRes.provider));
      workflowTrace.push({
        stepNumber: workflowTrace.length + 1,
        role: 'BOSS_SIGNOFF',
        divisionName: isEn ? 'Boss Sign-Off' : 'ACC Final Boss (Gemini)',
        provider: signOffRes.provider,
        model: signOffRes.model,
        action: isEn ? 'Final Verified Reply' : 'Balasan Final Disetujui',
        status: 'completed',
        summary: isEn
          ? 'Revision verified and signed off.'
          : 'Revisi sudah diverifikasi dan di-ACC Boss.',
        latencyMs: signOffRes.latencyMs,
      });
    } catch {
      // keep initial boss answer
    }
  }

  workflowTrace.forEach((step, idx) => {
    step.stepNumber = idx + 1;
  });

  return {
    status: 200,
    payload: {
      success: true,
      routeType: 'FULL_OFFICE',
      answer: String(bossJson.finalAnswer || bossResult.text || '').trim(),
      actionCard: normalizeActionCard(bossJson.actionCard, validated.language),
      workflowTrace,
      revisionTriggered,
      activeProviders: Array.from(providersUsed),
      totalLatencyMs: Date.now() - startedAt,
    },
  };
}

// ============================================================================
// 3. AI QA / CLEANING SERVICE DIAGNOSTICS ANALYST
// ============================================================================

export async function runAiQaDiagnostics(
  rawBody: unknown,
  keys: AgentDeskEnvKeys
): Promise<{
  status: number;
  payload: {
    success: boolean;
    healthGrade: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    summary: string;
    rootCauses: string[];
    recommendedActions: string[];
    providerUsed?: string;
    modelUsed?: string;
    latencyMs: number;
    error?: string;
  };
}> {
  const startedAt = Date.now();
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const language: 'id' | 'en' = body.language === 'en' ? 'en' : 'id';
  const isEn = language === 'en';

  const probePayload = body.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : null;
  if (!probePayload) {
    return {
      status: 400,
      payload: {
        success: false,
        healthGrade: 'WARNING',
        summary: '',
        rootCauses: [],
        recommendedActions: [],
        latencyMs: Date.now() - startedAt,
        error: isEn ? 'Missing diagnostics payload.' : 'Payload diagnostik kosong.',
      },
    };
  }

  const totalKeys = keys.geminiKeys.length + keys.groqKeys.length + keys.openRouterKeys.length;
  if (totalKeys === 0) {
    return {
      status: 503,
      payload: {
        success: false,
        healthGrade: 'WARNING',
        summary: '',
        rootCauses: [],
        recommendedActions: [],
        latencyMs: Date.now() - startedAt,
        error: isEn ? 'No AI key configured on server.' : 'Belum ada API key AI aktif di server.',
      },
    };
  }

  const systemInstruction = `Kamu adalah DIVISI QA / CLEANING SERVICE ENGINEER untuk aplikasi trading TradeVault (Web & Android APK Capacitor).
Analisis laporan JSON diagnostik sistem + error log perangkat secara objektif, lugas, dan akurat.
ATURAN:
1. Jangan pernah mengarang masalah yang tidak ada di JSON. Jika semua hijau (HTTP 200, cachePurgeMatchesBuild=true, OCR OK, feeds OK, errorLogs kosong), nyatakan HEALTHY dengan tegas.
2. Jika ada masalah (mis. cache mismatch, API key OFF, HTTP 404/429, OCR asset gagal, sync drift, atau error log berulang), sebutkan AKAR MASALAH paling spesifik dan langkah perbaikan konkret.
3. Keluarkan HANYA JSON valid:
   {"healthGrade":"HEALTHY"|"WARNING"|"CRITICAL","summary":string,"rootCauses":string[],"recommendedActions":string[]}`;

  const userPrompt = `Bahasa output: ${isEn ? 'English' : 'Bahasa Indonesia'}\nData Diagnostik Sistem & Log Error:\n${JSON.stringify(
    probePayload
  ).slice(0, 15_000)}\n\nKeluarkan HANYA JSON hasil audit QA.`;

  try {
    const res = await runWithProviderCascade({
      order: ['groq', 'gemini', 'openrouter'],
      keys,
      isBoss: false,
      systemInstruction,
      userPrompt,
      expectJson: true,
      timeoutMs: 11_000,
    });
    const parsed = res.json || {};
    const gradeRaw = String(parsed.healthGrade || 'WARNING').toUpperCase();
    const healthGrade: 'HEALTHY' | 'WARNING' | 'CRITICAL' =
      gradeRaw === 'HEALTHY' || gradeRaw === 'CRITICAL' ? gradeRaw : 'WARNING';

    return {
      status: 200,
      payload: {
        success: true,
        healthGrade,
        summary: String(parsed.summary || '').slice(0, 600),
        rootCauses: Array.isArray(parsed.rootCauses)
          ? parsed.rootCauses.slice(0, 6).map((x: any) => String(x).slice(0, 220))
          : [],
        recommendedActions: Array.isArray(parsed.recommendedActions)
          ? parsed.recommendedActions.slice(0, 6).map((x: any) => String(x).slice(0, 220))
          : [],
        providerUsed: formatProviderDisplayName(res.provider),
        modelUsed: res.model,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    return {
      status: 502,
      payload: {
        success: false,
        healthGrade: 'WARNING',
        summary: '',
        rootCauses: [],
        recommendedActions: [],
        latencyMs: Date.now() - startedAt,
        error: sanitizeAgentError(err),
      },
    };
  }
}
