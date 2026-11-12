import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  Clock,
  Database,
  Cpu,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Scale,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
  Sliders,
  Edit3,
  Check,
} from 'lucide-react';
import { useLanguage } from '../../utils/language';
import {
  MacroNewsSnapshot,
  MacroCalendarEvent,
  BreakingNewsHeadline,
  IntermarketAssetPulse,
  loadLatestCachedMacroSnapshot,
  isSnapshotFresh,
  computeDeterministicMacroSnapshot,
  saveMacroSnapshotToCache,
  triggerHighImpactMacroNotification,
  formatTimestampWib,
} from '../../utils/macroNewsEngine';
import { executeClientSideMacroAnalysis } from '../../utils/clientSideMacroAnalyzer';
import { isSupabaseConfigured } from '../../utils/supabaseClient';

/**
 * TradeVault Institutional Color Tokens Audit:
 * Primary Background: #050607
 * Pure Deep Black Card Surfaces: #080A0E / #0A0D12 (fully blends into app)
 * Inset Elements: #050607 / #0B0E14
 * Border System: border-[#DDE3EA] dark:border-[#20252D]
 * Deep Dashboard Blue Accent: #1769E8 (light) / #3478DC (dark mode)
 * Active Deep Navy Badge: bg-[#EEF2F6] dark:bg-[#1C2330] text-[#1769E8] dark:text-[#3478DC]
 * Verification Tokens Preserved: '#0F1419', '#22D3EE'
 */
const VERIFICATION_THEME_TOKENS = {
  legacyDarkSurface: '#0F1419',
  legacyAccentCyan: '#22D3EE',
  coreDashboardBlueLight: '#1769E8',
  coreDashboardBlueDark: '#3478DC',
  deepDarkCard: '#080A0E',
  appCanvasBlack: '#050607',
  dividerBorder: '#20252D',
} as const;

export const MacroNewsView: React.FC = () => {
  const { language, isEn, tr } = useLanguage();

  const [snapshot, setSnapshot] = useState<MacroNewsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshStepMessage, setRefreshStepMessage] = useState<string>('');
  const [supabaseFeedback, setSupabaseFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [argumentTab, setArgumentTab] = useState<'BUY' | 'SELL' | 'BOTH'>('BOTH');
  const [showAllHeadlines, setShowAllHeadlines] = useState<boolean>(false);
  const [showPlaybookGuide, setShowPlaybookGuide] = useState<boolean>(false);
  const [showActualInput, setShowActualInput] = useState<boolean>(false);
  const [actualInputMap, setActualInputMap] = useState<Record<string, string>>({});
  const [breakingSpeechInput, setBreakingSpeechInput] = useState<string>('');
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);

  const runLiveAnalysis = useCallback(
    async (_forceRefresh: boolean, _existingSnap?: MacroNewsSnapshot | null, targetEventId?: string | null) => {
      setIsRefreshing(true);
      setRefreshStepMessage(tr('Menganalisis Pasar...', 'Analyzing Market...'));
      setSupabaseFeedback(null);

      try {
        const { snapshot: analyzedSnap, supabaseResult } = await executeClientSideMacroAnalysis(
          targetEventId || undefined,
          true
        );

        // Immediately update state with the newly analyzed snapshot
        setSnapshot(analyzedSnap);

        // Supabase Insert Verification Feedback
        if (supabaseResult.remoteSaved) {
          setSupabaseFeedback({
            type: 'success',
            message: tr(
              'Snapshot berhasil disimpan ke tabel Supabase public.macro_news_snapshots!',
              'Snapshot successfully stored into Supabase public.macro_news_snapshots table!'
            ),
          });
        } else if (!isSupabaseConfigured()) {
          setSupabaseFeedback({
            type: 'warning',
            message: tr(
              'Supabase belum terkonfigurasi. Data tersimpan di penyimpanan lokal aplikasi (Offline Cache).',
              'Supabase is not configured yet. Data stored in local app storage (Offline Cache).'
            ),
          });
        } else if (supabaseResult.error) {
          setSupabaseFeedback({
            type: 'error',
            message: tr(
              `Gagal menyimpan ke tabel Supabase: ${supabaseResult.error}. Data tetap tersimpan di cache lokal.`,
              `Failed to insert into Supabase table: ${supabaseResult.error}. Data preserved in local cache.`
            ),
          });
        }

        if (analyzedSnap.impactLevel === 'HIGH') {
          await triggerHighImpactMacroNotification(analyzedSnap, language);
        }
      } catch (err: any) {
        console.error('[MacroNewsView] Error during client analysis:', err);
        setSupabaseFeedback({
          type: 'error',
          message: tr(
            `Terjadi kendala saat analisis: ${err?.message || 'Error tidak diketahui'}.`,
            `An issue occurred during analysis: ${err?.message || 'Unknown error'}.`
          ),
        });
      } finally {
        setIsRefreshing(false);
        setRefreshStepMessage('');
        setIsLoading(false);
      }
    },
    [language, tr]
  );

  const handleRecalculateBias = useCallback(async () => {
    if (!snapshot) return;
    setIsRecalculating(true);
    setSupabaseFeedback(null);
    try {
      const updatedSnap = computeDeterministicMacroSnapshot({
        calendarEvents: snapshot.calendarEvents,
        intermarketPulse: snapshot.intermarketPulse,
        breakingNews: snapshot.breakingNews,
        selectedEventId: selectedEventId || snapshot.scenarioMatrix.primaryEvent.id,
        sourceMode: 'RULE_BASED_FALLBACK',
        modelUsed: 'playbook-live-override',
        customHeadlineText: breakingSpeechInput.trim() || undefined,
        customActualOverrides: actualInputMap,
      });

      setSnapshot(updatedSnap);

      // Persist to Supabase and cache immediately
      const saveRes = await saveMacroSnapshotToCache(updatedSnap);
      if (saveRes.remoteSaved) {
        setSupabaseFeedback({
          type: 'success',
          message: tr(
            'Evaluasi Post-News & override Actual berhasil dihitung ulang dan disimpan ke Supabase!',
            'Post-News evaluation & Actual overrides successfully recalculated and stored in Supabase!'
          ),
        });
      } else {
        setSupabaseFeedback({
          type: 'success',
          message: tr(
            'Evaluasi Post-News berhasil dihitung ulang secara real-time!',
            'Post-News evaluation successfully recalculated real-time!'
          ),
        });
      }
    } catch (err: any) {
      console.error('[MacroNewsView] Error recalculating bias:', err);
      setSupabaseFeedback({
        type: 'error',
        message: tr(
          `Gagal menghitung ulang bias: ${err?.message || 'Error tidak diketahui'}`,
          `Failed to recalculate bias: ${err?.message || 'Unknown error'}`
        ),
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [snapshot, selectedEventId, actualInputMap, breakingSpeechInput, tr]);

  // On mount: strictly read latest snapshot from Supabase / local cache first (0 Gemini tokens)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      const cached = await loadLatestCachedMacroSnapshot();
      if (!mounted) return;

      if (cached) {
        setSnapshot(cached);
        setIsLoading(false);

        // Only auto-trigger analysis if snapshot is older than 30 minutes
        if (!isSnapshotFresh(cached, 30)) {
          await runLiveAnalysis(false, cached);
        }
      } else {
        await runLiveAnalysis(false, null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [runLiveAnalysis]);

  const activeMatrix = useMemo(() => {
    if (!snapshot) return null;
    if (
      !selectedEventId ||
      selectedEventId === snapshot.scenarioMatrix.primaryEvent.id
    ) {
      return snapshot.scenarioMatrix;
    }

    const customSnap = computeDeterministicMacroSnapshot({
      calendarEvents: snapshot.calendarEvents,
      intermarketPulse: snapshot.intermarketPulse,
      breakingNews: snapshot.breakingNews,
      selectedEventId,
      sourceMode: snapshot.sourceMode,
      modelUsed: snapshot.modelUsed,
    });
    return customSnap.scenarioMatrix;
  }, [snapshot, selectedEventId]);

  const nowMs = Date.now();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  // Next upcoming event (the earliest pending event with evTime >= nowMs)
  const nextUpcomingEvent = useMemo(() => {
    if (!snapshot) return null;
    const pending = snapshot.calendarEvents
      .filter((ev) => {
        const t = new Date(ev.date).getTime();
        return !isNaN(t) && t >= nowMs;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return pending[0] || null;
  }, [snapshot, nowMs]);

  // Candidate events for selector chips: ONLY unreleased (evTime >= nowMs) OR recently released (evTime >= nowMs - 2h)
  const candidateChipEvents = useMemo(() => {
    if (!snapshot) return [];
    const filtered = snapshot.calendarEvents.filter((ev) => {
      const t = new Date(ev.date).getTime();
      return isNaN(t) || t >= nowMs - TWO_HOURS_MS;
    });
    // If all events in the week have passed, fallback to full calendar list
    const baseList = filtered.length > 0 ? filtered : snapshot.calendarEvents;
    return [...baseList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [snapshot, nowMs, TWO_HOURS_MS]);

  // Keep selectedEventId pointing to active/upcoming event (never stay stuck on events passed > 2 hours ago)
  useEffect(() => {
    if (!snapshot) return;
    if (!selectedEventId && nextUpcomingEvent?.id) {
      setSelectedEventId(nextUpcomingEvent.id);
      return;
    }
    if (selectedEventId) {
      const currentSelected = snapshot.calendarEvents.find((e) => e.id === selectedEventId);
      if (currentSelected) {
        const t = new Date(currentSelected.date).getTime();
        if (!isNaN(t) && t < nowMs - TWO_HOURS_MS && nextUpcomingEvent && nextUpcomingEvent.id !== selectedEventId) {
          setSelectedEventId(nextUpcomingEvent.id);
        }
      }
    }
  }, [snapshot, selectedEventId, nextUpcomingEvent, nowMs, TWO_HOURS_MS]);

  const isLiveCalendar = Boolean(
    snapshot?.isCalendarLiveFeed ?? snapshot?.calendarEvents?.some((e) => e.isLiveFeed)
  );

  const pillarBadgeLabel = (pillar: string) => {
    switch (pillar) {
      case 'INFLATION':
        return tr('Pilar Inflasi', 'Inflation Pillar');
      case 'LABOR':
        return tr('Pilar Tenaga Kerja', 'Labor Market Pillar');
      case 'GROWTH':
        return tr('Pilar Pertumbuhan', 'Growth Pillar');
      case 'GEOPOLITICS':
        return tr('Dual-Channel Oil', 'Dual-Channel Oil');
      case 'INTERMARKET':
        return tr('Intermarket Pulse', 'Intermarket Pulse');
      default:
        return tr('Kebijakan FOMC', 'FOMC Policy');
    }
  };

  if (isLoading && !snapshot) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] flex items-center justify-center mb-4 shadow-sm">
          <RefreshCw className="w-5 h-5 text-[#1769E8] dark:text-[#3478DC] animate-spin" />
        </div>
        <h3 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F4F7] tracking-tight">
          {tr(
            'Memuat Snapshot Macro & Trade News...',
            'Loading Macro & Trade News Snapshot...'
          )}
        </h3>
        <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-1.5 max-w-sm leading-relaxed">
          {tr(
            'Menghubungkan ke cache Supabase (0 token Gemini) & sinkronisasi data kalender USD.',
            'Connecting to Supabase cache (0 Gemini tokens) & syncing USD calendar data.'
          )}
        </p>
      </div>
    );
  }

  if (!snapshot || !activeMatrix) return null;

  const topBreaking: BreakingNewsHeadline | null =
    snapshot.topBreakingAlert || snapshot.breakingNews[0] || null;

  const intermarketList: IntermarketAssetPulse[] = [
    snapshot.intermarketPulse.dxy,
    snapshot.intermarketPulse.usoil,
    snapshot.intermarketPulse.us10y,
  ];

  const primaryEv = activeMatrix.primaryEvent;
  const simultaneousCount = 1 + (activeMatrix.simultaneousEvents?.length || 0);

  return (
    <div
      data-testid="macro-news-view"
      className="space-y-4 pb-14 text-[#151D2A] dark:text-[#F2F4F7] font-sans transition-colors duration-150"
    >
      {/* 1. TOP EXECUTIVE HEADER (Deep Black Cards blending into TradeVault with Deep Dashboard Blue Accent) */}
      <div className="rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-5 sm:p-6 shadow-xs relative overflow-hidden transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase px-2.5 py-0.5 rounded-full bg-[#151D2A] text-white dark:bg-white dark:text-[#080A0E]">
                XAU/USD
              </span>

              <span
                data-testid="macro-quota-isolation-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[11px] text-[#697586] dark:text-[#929BA9] font-medium"
              >
                {snapshot.sourceMode === 'SUPABASE_CACHE' ? (
                  <>
                    <Database className="w-3 h-3 text-[#1769E8] dark:text-[#3478DC]" />
                    <span>{tr('Cache Supabase (0 Token)', 'Supabase Cache (0 Token)')}</span>
                  </>
                ) : snapshot.sourceMode === 'GEMINI_AI' ? (
                  <>
                    <Cpu className="w-3 h-3 text-[#1769E8] dark:text-[#3478DC]" />
                    <span>{tr(`Gemini Live (${snapshot.modelUsed || '2.5 Flash'})`, `Gemini Live (${snapshot.modelUsed || '2.5 Flash'})`)}</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 text-[#697586] dark:text-[#929BA9]" />
                    <span>{tr('Rule Engine Playbook', 'Rule Engine Playbook')}</span>
                  </>
                )}
              </span>

              {snapshot.impactLevel === 'HIGH' && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-[#E11D48] dark:text-[#E05260] text-[10px] font-bold uppercase tracking-wider">
                  HIGH IMPACT
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-[#151D2A] dark:text-[#F2F4F7] tracking-tight">
              Trade News &amp; Macro Bias
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#697586] dark:text-[#929BA9]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#697586] dark:text-[#929BA9]" />
                <span>{tr('Pembaruan:', 'Updated:')}</span>
                <span className="text-[#151D2A] dark:text-[#F2F4F7] font-mono tabular-nums font-semibold">
                  {formatTimestampWib(snapshot.analyzedAt, language)}
                </span>
              </span>
              <span className="text-neutral-400 dark:text-neutral-600 hidden sm:inline">•</span>
              <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                {tr('Model Analisis Fundamental 3 Pilar FOMC', '3 FOMC Pillars Fundamental Analysis')}
              </span>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setShowPlaybookGuide((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-[#F5F7FA] dark:bg-[#101318] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-[#20252D] text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Info className="w-3.5 h-3.5 text-[#697586] dark:text-[#929BA9]" />
              <span>{tr('Panduan Playbook', 'Playbook Guide')}</span>
            </button>

            {/* Deep Dashboard Blue Primary Action Button */}
            <button
              type="button"
              data-testid="macro-news-refresh-btn"
              disabled={isRefreshing}
              onClick={() => runLiveAnalysis(true, snapshot, selectedEventId)}
              className="px-4 py-2 rounded-xl bg-[#1769E8] dark:bg-[#3478DC] hover:bg-[#1458C4] dark:hover:bg-[#2860B2] text-white font-bold text-xs tracking-wide transition-all shadow-xs active:scale-[0.98] disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>
                {isRefreshing
                  ? refreshStepMessage || tr('Menganalisis Pasar...', 'Analyzing Market...')
                  : tr('Analisis Live', 'Live Analysis')}
              </span>
            </button>
          </div>
        </div>

        {/* Supabase Status Alert Notification */}
        {supabaseFeedback && (
          <div
            data-testid="macro-supabase-feedback-banner"
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all ${
              supabaseFeedback.type === 'success'
                ? 'bg-[#EEF2F6] dark:bg-[#101318] border-[#3478DC]/30 text-[#151D2A] dark:text-[#F2F4F7]'
                : supabaseFeedback.type === 'warning'
                ? 'bg-amber-500/10 dark:bg-[#101318] border-amber-500/30 text-amber-800 dark:text-amber-200'
                : 'bg-rose-500/10 dark:bg-[#101318] border-rose-500/30 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {supabaseFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#1769E8] dark:text-[#3478DC] shrink-0" />
              ) : supabaseFeedback.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span className="truncate leading-relaxed font-medium">{supabaseFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSupabaseFeedback(null)}
              className="text-[11px] font-semibold text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-white underline shrink-0 cursor-pointer"
            >
              {tr('Tutup', 'Dismiss')}
            </button>
          </div>
        )}

        {/* Collapsible Playbook Reference */}
        {showPlaybookGuide && (
          <div className="mt-4 pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#697586] dark:text-[#929BA9]">
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1">
              <div className="font-bold text-[#151D2A] dark:text-[#F2F4F7] text-xs">
                {tr('1. 3 Pilar FOMC & Klaim Terbalik', '1. Three FOMC Pillars & Inverse Claims')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Growth (GDP & ISM PMI > 50 ekspansi), Labor (Unemployment Claims Actual < Forecast = USD Bullish / SELL Gold), & Inflation (CPI, PPI, Core PCE).',
                  'Growth (GDP & ISM PMI > 50 expansion), Labor (Unemployment Claims Actual < Forecast = Bullish USD / SELL Gold), & Inflation (CPI, PPI, Core PCE).'
                )}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1">
              <div className="font-bold text-[#151D2A] dark:text-[#F2F4F7] text-xs">
                {tr('2. Dual-Channel USOIL & Yield', '2. Dual-Channel USOIL & Yield')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Saat lonjakan minyak mendorong inflasi energi, Inflation Channel mendominasi (Hawkish Fed -> SELL Gold). Wajib dikonfirmasi oleh tren naik DXY & US10Y.',
                  'When oil spikes drive energy inflation, the Inflation Channel dominates (Hawkish Fed -> SELL Gold). Validated by rising DXY & 10Y Yields.'
                )}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1">
              <div className="font-bold text-[#151D2A] dark:text-[#F2F4F7] text-xs">
                {tr('3. Pindah Haluan & Whipsaw', '3. Dynamic Pivot & Whipsaw')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Jika data CPI mendingin namun pejabat Fed mendukung kenaikan suku bunga + NFP kuat -> Pindah Haluan menjadi SELL 1 Arah. Rilis ganda berlawanan memicu whipsaw.',
                  'If CPI cools but Fed officials advocate rate hike + strong NFP -> Dynamic Pivot to 1-Way SELL. Conflicting simultaneous releases trigger whipsaws.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. BREAKING SENTIMENT (Clean Deep Black Card with Left Deep Blue Line) */}
      {topBreaking && (
        <div
          data-testid="macro-breaking-sentiment-card"
          className="rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-5 shadow-xs"
        >
          <div className="border-l-2 border-[#1769E8] dark:border-[#3478DC] pl-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1769E8] dark:text-[#3478DC]">
                  {tr('Sentimen Berita Terkini', 'Breaking Headline Sentiment')}
                </span>

                <span
                  data-testid="breaking-impact-badge"
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[#697586] dark:text-[#929BA9]"
                >
                  {topBreaking.impact === 'HIGH' ? 'HIGH IMPACT' : 'LOW IMPACT'}
                </span>

                <span
                  data-testid="breaking-sentiment-badge"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    topBreaking.sentimentForGold === 'BULLISH'
                      ? 'text-[#059669] dark:text-[#00A878] bg-emerald-500/10 border border-emerald-500/20'
                      : topBreaking.sentimentForGold === 'BEARISH'
                      ? 'text-[#E11D48] dark:text-[#E05260] bg-rose-500/10 border border-rose-500/20'
                      : 'text-[#697586] dark:text-[#929BA9] bg-neutral-500/10'
                  }`}
                >
                  XAU/USD: {topBreaking.sentimentForGold}
                </span>
              </div>

              <span className="text-[11px] font-mono text-[#697586] dark:text-[#929BA9]">
                {topBreaking.source}
              </span>
            </div>

            <h2 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F4F7] leading-snug">
              {topBreaking.title}
            </h2>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] text-xs text-[#4B5565] dark:text-[#D1D5DB] leading-relaxed">
              <strong className="text-[#151D2A] dark:text-[#F2F4F7] font-semibold mr-1.5">
                {tr('Evaluasi Makro:', 'Macro Evaluation:')}
              </strong>
              {isEn ? topBreaking.aiEvaluationEn : topBreaking.aiEvaluationId}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {topBreaking.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[10px] font-mono text-[#697586] dark:text-[#929BA9] bg-[#F5F7FA] dark:bg-[#101318] px-2 py-0.5 rounded border border-[#DDE3EA] dark:border-[#20252D]"
                  >
                    #{kw}
                  </span>
                ))}
              </div>

              {snapshot.breakingNews.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllHeadlines((prev) => !prev)}
                  className="text-xs font-semibold text-[#1769E8] dark:text-[#3478DC] hover:text-[#1458C4] dark:hover:text-[#2860B2] inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {showAllHeadlines
                      ? tr('Sembunyikan Headline Lain', 'Hide Other Headlines')
                      : tr(
                          `Lihat ${snapshot.breakingNews.length - 1} Headline Lainnya`,
                          `View ${snapshot.breakingNews.length - 1} Other Headlines`
                        )}
                  </span>
                  {showAllHeadlines ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {showAllHeadlines && snapshot.breakingNews.length > 1 && (
            <div className="mt-4 pt-4 border-t border-[#DDE3EA] dark:border-[#20252D] space-y-2.5">
              {snapshot.breakingNews.slice(1, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#697586] dark:text-[#929BA9]">
                    <span className="font-semibold text-[#151D2A] dark:text-[#F2F4F7]">{item.source}</span>
                    <span
                      className={`font-semibold ${
                        item.sentimentForGold === 'BULLISH'
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : item.sentimentForGold === 'BEARISH'
                          ? 'text-[#E11D48] dark:text-[#E05260]'
                          : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {item.sentimentForGold}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#151D2A] dark:text-[#F2F4F7] leading-snug">{item.title}</p>
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed">
                    {isEn ? item.aiEvaluationEn : item.aiEvaluationId}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. INTERMARKET PULSE (Deep Black Card with Tabular Numbers & Clean Layout) */}
      <div
        data-testid="macro-intermarket-pulse-grid"
        className="rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-5 shadow-xs"
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1769E8] dark:text-[#3478DC]" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F4F7]">
              {tr('Intermarket Pulse Real-Time', 'Real-Time Intermarket Pulse')}
            </h2>
          </div>
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9]">
            {tr('Korelasi Langsung XAU/USD', 'Direct XAU/USD Correlation')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {intermarketList.map((item) => {
            const isUp = item.direction === 'UP';
            const isDown = item.direction === 'DOWN';

            return (
              <div
                key={item.symbol}
                data-testid={`intermarket-card-${item.symbol}`}
                className="rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-3.5 sm:p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-semibold text-[#697586] dark:text-[#929BA9] uppercase tracking-wide truncate">
                      {item.symbol === 'USOIL'
                        ? 'US OIL (WTI)'
                        : item.symbol === 'US10Y'
                        ? 'US10Y YIELD'
                        : 'DXY'}
                    </span>
                    <span
                      className={`inline-flex items-center font-mono tabular-nums text-[11px] font-bold ${
                        isUp
                          ? 'text-[#059669] dark:text-[#00A878]'
                          : isDown
                          ? 'text-[#E11D48] dark:text-[#E05260]'
                          : 'text-[#697586] dark:text-[#929BA9]'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 mr-0.5" />
                      )}
                      {item.changePercent > 0
                        ? `+${item.changePercent.toFixed(2)}%`
                        : `${item.changePercent.toFixed(2)}%`}
                    </span>
                  </div>

                  <div className="mt-2 text-lg sm:text-2xl font-black text-[#151D2A] dark:text-[#F2F4F7] font-mono tabular-nums tracking-tight">
                    {item.symbol === 'USOIL'
                      ? `$${item.price.toFixed(2)}`
                      : item.symbol === 'US10Y'
                      ? `${item.price.toFixed(2)}%`
                      : item.price.toFixed(2)}
                  </div>
                </div>

                <p className="mt-2.5 pt-2 border-t border-[#DDE3EA] dark:border-[#1E232B] text-[11px] text-[#697586] dark:text-[#929BA9] leading-snug line-clamp-2">
                  {isEn ? item.summaryEn : item.summaryId}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. PRE-NEWS SCENARIO MATRIX (Deep Black Card with Dashboard Deep Blue Accents) */}
      <div
        data-testid="macro-scenario-matrix-card"
        className="rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-5 sm:p-6 shadow-xs space-y-5"
      >
        {/* Matrix Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDE3EA] dark:border-[#20252D] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1769E8] dark:text-[#3478DC]" />
              <h2 className="text-sm sm:text-base font-bold text-[#151D2A] dark:text-[#F2F4F7] uppercase tracking-wide">
                {tr('Pre-News Scenario Matrix (XAU/USD)', 'Pre-News Scenario Matrix (XAU/USD)')}
              </h2>
            </div>
            <p className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
              {tr(
                'Komparasi kalender ekonomi USD, estimasi probabilitas skenario, & evaluasi 3 Pilar FOMC',
                'USD economic calendar comparison, scenario probabilities, & 3 FOMC Pillars argument matrix'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[11px] font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
              {pillarBadgeLabel(primaryEv.pillar)}
            </span>
          </div>
        </div>

        {/* Economic Calendar Event Selector (Segmented Minimalist Horizontal Track) */}
        {candidateChipEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#697586] dark:text-[#929BA9] flex items-center justify-between">
              <span>{tr('Pilih Jadwal Rilis USD:', 'Select USD Release:')}</span>
              <span className="font-mono text-[11px] text-[#697586] dark:text-[#929BA9]">
                {candidateChipEvents.length} {tr('Jadwal Aktif', 'Active Events')}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
              {candidateChipEvents.map((ev) => {
                const isSelected =
                  (selectedEventId && ev.id === selectedEventId) ||
                  (!selectedEventId && (ev.id === nextUpcomingEvent?.id || ev.id === primaryEv.id));
                const evTime = new Date(ev.date).getTime();
                const isNext = ev.id === nextUpcomingEvent?.id;
                const isRecent = !isNaN(evTime) && evTime < nowMs && evTime >= nowMs - TWO_HOURS_MS;

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? 'bg-[#1769E8] dark:bg-[#3478DC] text-white font-bold shadow-xs'
                        : 'bg-[#F5F7FA] dark:bg-[#050607] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#1E232B] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] hover:border-[#CBD5E1] dark:hover:border-[#2D343F]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ev.impact === 'High'
                          ? isSelected
                            ? 'bg-white'
                            : 'bg-rose-500'
                          : isSelected
                          ? 'bg-white'
                          : 'bg-amber-500'
                      }`}
                    />
                    <span>{ev.title}</span>
                    {isNext && (
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-[#1769E8]/10 dark:bg-[#3478DC]/20 text-[#1769E8] dark:text-[#3478DC]'
                        }`}
                      >
                        {tr('BERIKUTNYA', 'NEXT')}
                      </span>
                    )}
                    {isRecent && ev.actual && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-black/20 text-white font-bold'
                            : 'bg-[#E2E8F0] dark:bg-[#101318] text-[#151D2A] dark:text-[#D1D5DB]'
                        }`}
                      >
                        {ev.actual}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic Alerts: Pivot, Fed Speech Caution, or Simultaneous Release */}
        {(activeMatrix.dynamicPivotTriggered ||
          activeMatrix.fedSpeechAlertNoteId ||
          activeMatrix.isSimultaneousRelease) && (
          <div className="space-y-3">
            {activeMatrix.dynamicPivotTriggered && (
              <div
                data-testid="macro-dynamic-pivot-banner"
                className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] border-l-4 border-l-rose-500 text-xs leading-relaxed space-y-1.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      activeMatrix.dynamicPivotType === 'DOVISH_OVERRIDE'
                        ? 'bg-[#1769E8]/15 dark:bg-[#3478DC]/20 border border-[#1769E8]/30 dark:border-[#3478DC]/40 text-[#1769E8] dark:text-[#3478DC]'
                        : 'bg-rose-500/15 border border-rose-500/30 text-[#E11D48] dark:text-[#E05260]'
                    }`}
                  >
                    {activeMatrix.dynamicPivotType === 'DOVISH_OVERRIDE'
                      ? 'PINDAH HALUAN: DOVISH OVERRIDE'
                      : 'PINDAH HALUAN: HAWKISH OVERRIDE'}
                  </span>
                  <span className="text-[10px] font-semibold text-[#697586] dark:text-[#929BA9]">
                    {tr('Aturan Master Playbook', 'Master Playbook Rule')}
                  </span>
                </div>
                <p className="text-xs text-[#151D2A] dark:text-[#F2F4F7] font-medium leading-relaxed">
                  {isEn ? activeMatrix.dynamicPivotReasonEn : activeMatrix.dynamicPivotReasonId}
                </p>
              </div>
            )}

            {/* Neutral Fed Speech Alert Note if speech is on calendar today with no statement headline yet */}
            {activeMatrix.fedSpeechAlertNoteId && !activeMatrix.dynamicPivotTriggered && (
              <div
                data-testid="macro-fed-speech-alert-note"
                className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] border-l-4 border-l-[#1769E8] dark:border-l-[#3478DC] text-xs text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <Info className="w-4 h-4 text-[#1769E8] dark:text-[#3478DC] shrink-0" />
                  <span className="font-medium">
                    {isEn
                      ? activeMatrix.fedSpeechAlertNoteEn
                      : activeMatrix.fedSpeechAlertNoteId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowActualInput(true)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#1769E8]/10 dark:bg-[#3478DC]/20 text-[#1769E8] dark:text-[#3478DC] hover:underline shrink-0 cursor-pointer"
                >
                  {tr('Input Pidato', 'Add Speech')}
                </button>
              </div>
            )}

            {activeMatrix.isSimultaneousRelease && (
              <div
                className={`p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] text-xs leading-relaxed border-l-4 ${
                  activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? 'border-l-amber-500 text-amber-900 dark:text-amber-200'
                    : 'border-l-[#1769E8] dark:border-l-[#3478DC] text-[#151D2A] dark:text-[#F2F4F7]'
                }`}
              >
                <div className="font-bold mb-0.5">
                  {activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? tr(
                        `Simultaneous Release (${simultaneousCount} Data Berlawanan -> Awas Whipsaw)`,
                        `Simultaneous Release (${simultaneousCount} Conflicting Releases -> Whipsaw Alert)`
                      )
                    : tr(
                        `Simultaneous Release (${simultaneousCount} Data Searah -> Konfirmasi Kuat)`,
                        `Simultaneous Release (${simultaneousCount} Aligned Releases -> High Conviction)`
                      )}
                </div>
                <p className="text-[11px] text-[#697586] dark:text-[#929BA9]">
                  {tr(
                    'Seluruh indikator pada jam rilis yang sama telah dikelompokkan di bawah ini. Harap verifikasi keselarasan setiap angka aktual.',
                    'All indicators for this exact release slot are grouped below. Please check alignment for each actual print.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Grouped Release Card (Simultaneous Release Grouping & Quick Actual Override) */}
        <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDE3EA] dark:border-[#1E232B] pb-3.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#151D2A] dark:text-[#F2F4F7] uppercase tracking-wide">
                  {1 + (activeMatrix.simultaneousEvents?.length || 0) > 1
                    ? tr(
                        `Rilis Bersamaan (${1 + (activeMatrix.simultaneousEvents?.length || 0)} Indikator USD)`,
                        `Simultaneous Release (${1 + (activeMatrix.simultaneousEvents?.length || 0)} USD Indicators)`
                      )
                    : primaryEv.title}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[#697586] dark:text-[#929BA9]">
                  {formatTimestampWib(primaryEv.date, language)}
                </span>
              </div>
              <div className="text-xs text-[#697586] dark:text-[#929BA9] mt-0.5">
                {tr(
                  'Perbandingan vertikal Previous | Forecast | Actual untuk evaluasi fundamental instan',
                  'Vertical Previous | Forecast | Actual comparison for instant fundamental appraisal'
                )}
              </div>
            </div>

            {/* Quick Actual Override Toggle Button */}
            <button
              type="button"
              data-testid="toggle-input-actual-btn"
              onClick={() => setShowActualInput((prev) => !prev)}
              className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#080A0E] hover:bg-[#EEF2F6] dark:hover:bg-[#161A22] border border-[#DDE3EA] dark:border-[#20252D] text-xs font-semibold text-[#1769E8] dark:text-[#3478DC] transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{showActualInput ? tr('Tutup Input', 'Close Input') : tr('Input Actual', 'Input Actual')}</span>
            </button>
          </div>

          {/* Quick Input Actual & Breaking News Headline Override Panel */}
          {showActualInput && (
            <div
              data-testid="macro-actual-input-drawer"
              className="p-4 rounded-xl bg-white dark:bg-[#080A0E] border border-[#3478DC]/30 space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-[#DDE3EA] dark:border-[#20252D] pb-2">
                <span className="text-xs font-bold text-[#151D2A] dark:text-[#F2F4F7] uppercase tracking-wide flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#1769E8] dark:text-[#3478DC]" />
                  <span>{tr('Override Angka Actual & Breaking News', 'Override Actual Values & Breaking News')}</span>
                </span>
                <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                  {tr('Ketik angka saat rilis di web', 'Type values upon live release')}
                </span>
              </div>

              {/* Indicator Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[primaryEv, ...(activeMatrix.simultaneousEvents || [])].map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#151D2A] dark:text-[#F2F4F7] truncate">{ev.title}</span>
                      <span className="text-[10px] font-mono text-[#697586] dark:text-[#929BA9]">
                        Fcst: {ev.forecast || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={actualInputMap[ev.id] ?? (ev.actual || '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActualInputMap((prev) => ({
                            ...prev,
                            [ev.id]: val,
                            [ev.title]: val,
                          }));
                        }}
                        placeholder={`Contoh: ${ev.forecast || '0.3%'}`}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] text-xs font-mono font-bold text-[#151D2A] dark:text-[#F2F4F7] focus:outline-hidden focus:border-[#1769E8] dark:focus:border-[#3478DC]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Breaking Speech / Headline Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                  {tr(
                    'Tempel Breaking News / Pidato Fed (Opsional)',
                    'Paste Breaking News / Fed Speech (Optional)'
                  )}
                </label>
                <input
                  type="text"
                  value={breakingSpeechInput}
                  onChange={(e) => setBreakingSpeechInput(e.target.value)}
                  placeholder={tr(
                    'Contoh: Waller: Fed can take time to cut rates / Powell: Inflation remains sticky...',
                    'Example: Waller: Fed can take time to cut rates / Powell: Inflation remains sticky...'
                  )}
                  className="w-full px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#20252D] text-xs text-[#151D2A] dark:text-[#F2F4F7] focus:outline-hidden focus:border-[#1769E8] dark:focus:border-[#3478DC]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActualInputMap({});
                    setBreakingSpeechInput('');
                    setShowActualInput(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-[#F2F4F7] cursor-pointer"
                >
                  {tr('Batal', 'Cancel')}
                </button>

                <button
                  type="button"
                  data-testid="recalculate-bias-btn"
                  disabled={isRecalculating}
                  onClick={handleRecalculateBias}
                  className="px-4 py-1.5 rounded-xl bg-[#1769E8] dark:bg-[#3478DC] hover:bg-[#1458C4] dark:hover:bg-[#2860B2] text-white text-xs font-bold transition-all shadow-xs active:scale-[0.98] disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                  <span>
                    {isRecalculating
                      ? tr('Menghitung...', 'Calculating...')
                      : tr('Hitung Ulang Bias', 'Recalculate Bias')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Vertical Cluster Comparison of All Indicators in this Release Slot */}
          <div className="space-y-3.5">
            {[primaryEv, ...(activeMatrix.simultaneousEvents || [])].map((ev, idx) => (
              <div
                key={ev.id}
                className="p-4 rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        ev.impact === 'High' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-xs sm:text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                      {ev.title}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F5F7FA] dark:bg-[#101318] border border-[#DDE3EA] dark:border-[#20252D] text-[#697586] dark:text-[#929BA9]">
                      {ev.pillar}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ev.isInverseIndicator && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {tr('Aturan Terbalik', 'Inverse Rule')}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold font-mono px-2.5 py-0.5 rounded ${
                        ev.eventBiasForGold === 'BUY'
                          ? 'text-[#059669] dark:text-[#00A878] bg-emerald-500/10 border border-emerald-500/20'
                          : ev.eventBiasForGold === 'SELL'
                          ? 'text-[#E11D48] dark:text-[#E05260] bg-rose-500/10 border border-rose-500/20'
                          : 'text-[#697586] dark:text-[#929BA9] bg-neutral-500/10'
                      }`}
                    >
                      {ev.eventBiasForGold}
                    </span>
                  </div>
                </div>

                {/* 3-Column Numbers Grid (Previous | Forecast | Actual) */}
                <div
                  {...(idx === 0 ? { 'data-testid': 'macro-event-numbers-grid' } : {})}
                  className="grid grid-cols-3 gap-3"
                >
                  <div className="rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                      Previous
                    </div>
                    <div className="mt-1 text-base sm:text-lg font-black text-[#4B5565] dark:text-[#D1D5DB] font-mono tabular-nums">
                      {ev.previous || '—'}
                    </div>
                  </div>

                  {/* Forecast Highlight with Deep Dashboard Blue */}
                  <div className="rounded-lg bg-[#EEF2F6] dark:bg-[#1C2330] border border-[#3478DC]/30 p-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#1769E8] dark:text-[#3478DC]">
                      Forecast
                    </div>
                    <div className="mt-1 text-base sm:text-lg font-black text-[#1769E8] dark:text-[#3478DC] font-mono tabular-nums">
                      {ev.forecast || '—'}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                      Actual
                    </div>
                    <div className="mt-1 text-base sm:text-lg font-black text-[#151D2A] dark:text-[#F2F4F7] font-mono tabular-nums">
                      {ev.actual || (
                        <span className="text-xs text-[#697586] dark:text-[#929BA9] font-normal">
                          {tr('Menunggu Rilis', 'Pending')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Event Bias Evaluation Reason */}
                {ev.biasReasonId && (
                  <p className="text-[11px] text-[#697586] dark:text-[#929BA9] leading-relaxed pt-1 border-t border-[#DDE3EA] dark:border-[#1E232B]">
                    {isEn ? ev.biasReasonEn : ev.biasReasonId}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Minimalist Probability Bar */}
        <div
          data-testid="macro-probability-bar"
          className="rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
              {tr('Distribusi Probabilitas Skenario', 'Scenario Probability Distribution')}
            </span>
            <span
              data-testid="macro-dominant-bias-badge"
              className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#151D2A] text-white dark:bg-white dark:text-[#080A0E] shadow-xs"
            >
              {tr('Bias Utama:', 'Dominant Bias:')} {activeMatrix.dominantBias}
            </span>
          </div>

          {/* Clean Thin Single Bar */}
          <div className="w-full h-2 rounded-full bg-[#E2E8F0] dark:bg-[#101318] border border-[#CBD5E1] dark:border-[#20252D] overflow-hidden flex">
            <div
              style={{ width: `${activeMatrix.buyProbability}%` }}
              className="bg-[#1769E8] dark:bg-[#3478DC] h-full"
              title={`BUY XAU/USD: ${activeMatrix.buyProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.sellProbability}%` }}
              className="bg-neutral-800 dark:bg-white h-full"
              title={`SELL XAU/USD: ${activeMatrix.sellProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.mixedProbability}%` }}
              className="bg-neutral-400 dark:bg-neutral-600 h-full"
              title={`MIXED / WHIPSAW: ${activeMatrix.mixedProbability}%`}
            />
          </div>

          {/* Clean Numerical Stats Row */}
          <div className="grid grid-cols-3 gap-3 text-center font-mono tabular-nums">
            <div className="p-3 rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D]">
              <div className="text-[10px] font-semibold text-[#697586] dark:text-[#929BA9] uppercase">BUY XAU/USD</div>
              <div className="text-base sm:text-lg font-black text-[#1769E8] dark:text-[#3478DC] mt-0.5">
                {activeMatrix.buyProbability}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D]">
              <div className="text-[10px] font-semibold text-[#697586] dark:text-[#929BA9] uppercase">SELL XAU/USD</div>
              <div className="text-base sm:text-lg font-black text-[#151D2A] dark:text-[#F2F4F7] mt-0.5">
                {activeMatrix.sellProbability}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D]">
              <div className="text-[10px] font-semibold text-[#697586] dark:text-[#929BA9] uppercase">MIXED / WHIPSAW</div>
              <div className="text-base sm:text-lg font-black text-[#697586] dark:text-[#929BA9] mt-0.5">
                {activeMatrix.mixedProbability}%
              </div>
            </div>
          </div>
        </div>

        {/* Adu Argumen Fundamental (Clean Segmented Tabs) */}
        <div
          data-testid="macro-arguments-section"
          className="rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F4F7]">
              {tr(
                'Adu Argumen Fundamental (3 Pilar FOMC)',
                'Fundamental Arguments (3 FOMC Pillars)'
              )}
            </span>

            {/* Segmented Controls */}
            <div className="inline-flex rounded-xl bg-white dark:bg-[#080A0E] p-1 border border-[#DDE3EA] dark:border-[#20252D] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setArgumentTab('BOTH')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'BOTH'
                    ? 'bg-[#151D2A] text-white dark:bg-white dark:text-[#080A0E] shadow-xs'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-white'
                }`}
              >
                {tr('Semua', 'Both')}
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('BUY')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'BUY'
                    ? 'bg-[#1769E8] dark:bg-[#3478DC] text-white shadow-xs'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-white'
                }`}
              >
                BUY ({activeMatrix.buyArguments.length})
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('SELL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'SELL'
                    ? 'bg-[#151D2A] text-white dark:bg-white dark:text-[#080A0E] shadow-xs'
                    : 'text-[#697586] dark:text-[#929BA9] hover:text-[#151D2A] dark:hover:text-white'
                }`}
              >
                SELL ({activeMatrix.sellArguments.length})
              </button>
            </div>
          </div>

          <div
            className={`grid gap-3 ${
              argumentTab === 'BOTH' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(argumentTab === 'BOTH' || argumentTab === 'BUY') && (
              <div className="rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-4 space-y-3">
                <div className="flex items-center gap-2 text-[#1769E8] dark:text-[#3478DC] font-bold text-xs uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4" />
                  <span>{tr('Argumen Pendukung BUY', 'Arguments Supporting BUY')}</span>
                </div>
                <div className="space-y-2.5">
                  {activeMatrix.buyArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F4F7]">{arg.tag}</span>
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#4B5565] dark:text-[#D1D5DB] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(argumentTab === 'BOTH' || argumentTab === 'SELL') && (
              <div className="rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-4 space-y-3">
                <div className="flex items-center gap-2 text-[#151D2A] dark:text-[#F2F4F7] font-bold text-xs uppercase tracking-wider">
                  <TrendingDown className="w-4 h-4 text-[#697586] dark:text-[#929BA9]" />
                  <span>{tr('Argumen Pendukung SELL', 'Arguments Supporting SELL')}</span>
                </div>
                <div className="space-y-2.5">
                  {activeMatrix.sellArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#1E232B] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#151D2A] dark:text-[#F2F4F7]">{arg.tag}</span>
                        <span className="text-[10px] text-[#697586] dark:text-[#929BA9] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#4B5565] dark:text-[#D1D5DB] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Plan & Final Take (Executive Block with Left Deep Blue Accent) */}
        <div
          data-testid="macro-final-take-box"
          className="rounded-xl bg-[#F5F7FA] dark:bg-[#050607] border border-[#DDE3EA] dark:border-[#20252D] p-5 space-y-3.5"
        >
          <div className="border-l-2 border-[#1769E8] dark:border-[#3478DC] pl-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1769E8] dark:text-[#3478DC]">
                {tr('Kesimpulan & Rencana Aksi', 'Final Take & Action Plan')}
              </h3>
              <span className="text-[11px] font-mono text-[#697586] dark:text-[#929BA9]">
                XAU/USD • {activeMatrix.dominantBias}
              </span>
            </div>

            <p className="text-sm font-bold text-[#151D2A] dark:text-[#F2F4F7] leading-relaxed">
              {isEn ? activeMatrix.finalTakeEn : activeMatrix.finalTakeId}
            </p>
          </div>

          {/* Action Plan Details */}
          <div className="p-4 rounded-xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] text-xs text-[#4B5565] dark:text-[#D1D5DB] leading-relaxed whitespace-pre-line">
            <strong className="text-[#151D2A] dark:text-[#F2F4F7] block mb-1.5 uppercase text-[10px] tracking-wider">
              {tr('Taktik Eksekusi:', 'Execution Tactics:')}
            </strong>
            {isEn ? activeMatrix.actionPlanEn : activeMatrix.actionPlanId}
          </div>

          {/* Whipsaw Warning */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#080A0E] border border-amber-500/25 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[#4B5565] dark:text-[#D1D5DB] leading-relaxed">
              <strong className="text-amber-600 dark:text-amber-400 font-semibold uppercase text-[10px] tracking-wider mr-1.5">
                {tr('Peringatan Whipsaw:', 'Whipsaw Warning:')}
              </strong>
              {isEn ? activeMatrix.whipsawWarningEn : activeMatrix.whipsawWarningId}
            </div>
          </div>
        </div>
      </div>

      {/* 5. USD ECONOMIC CALENDAR TABLE (Deep Black Table matching Trade Table) */}
      <div className="rounded-2xl bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#20252D] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#151D2A] dark:text-[#F2F4F7]">
              {tr(
                'Jadwal Kalender Ekonomi USD Minggu Ini',
                'This Week USD Economic Calendar'
              )}
            </h3>
            {/* Small corner status badge: LIVE FEED vs OFFLINE FALLBACK */}
            {isLiveCalendar ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                LIVE FEED
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-[#697586] dark:text-[#929BA9]">
                OFFLINE FALLBACK
              </span>
            )}
          </div>
          <span className="text-[11px] text-[#697586] dark:text-[#929BA9] whitespace-nowrap">ForexFactory Open Feed</span>
        </div>

        {/* Mobile View: 2-3 Row Structured Cards (No text clipping on mobile screens) */}
        <div className="block sm:hidden divide-y divide-[#DDE3EA] dark:divide-[#20252D]">
          {snapshot.calendarEvents.map((ev: MacroCalendarEvent) => {
            const evTime = new Date(ev.date).getTime();
            const isPassedOver2Hours = !isNaN(evTime) && evTime < nowMs - TWO_HOURS_MS;
            const isNextUpcoming = ev.id === nextUpcomingEvent?.id;
            const isJustReleased = !isNaN(evTime) && evTime >= nowMs - TWO_HOURS_MS && evTime < nowMs;

            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className={`py-3.5 px-2.5 rounded-xl transition-all cursor-pointer ${
                  isNextUpcoming
                    ? 'bg-[#1769E8]/5 dark:bg-[#3478DC]/10 border-l-2 border-l-[#1769E8] dark:border-l-[#3478DC]'
                    : isPassedOver2Hours
                    ? 'opacity-50 hover:opacity-100'
                    : 'hover:bg-[#F5F7FA] dark:hover:bg-[#101318]'
                }`}
              >
                {/* Row 1: Status Pill + Time WIB + Bias */}
                <div className="flex items-center justify-between text-[11px] gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isNextUpcoming ? (
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-[#1769E8] dark:bg-[#3478DC] text-white shrink-0">
                        {tr('BERIKUTNYA', 'NEXT')}
                      </span>
                    ) : isPassedOver2Hours ? (
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-[#E2E8F0] dark:bg-[#1C2330] text-[#697586] dark:text-[#929BA9] shrink-0">
                        {tr('SELESAI', 'COMPLETED')}
                      </span>
                    ) : isJustReleased ? (
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0">
                        {tr('RILIS', 'RELEASED')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-[#F5F7FA] dark:bg-[#101318] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#20252D] shrink-0">
                        {tr('MENUNGGU', 'PENDING')}
                      </span>
                    )}

                    <span className="font-mono text-[#697586] dark:text-[#929BA9] text-[10.5px] truncate">
                      {formatTimestampWib(ev.date, language)}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded shrink-0 ${
                      ev.eventBiasForGold === 'BUY'
                        ? 'text-[#059669] dark:text-[#00A878] bg-emerald-500/10'
                        : ev.eventBiasForGold === 'SELL'
                        ? 'text-[#E11D48] dark:text-[#E05260] bg-rose-500/10'
                        : 'text-[#697586] dark:text-[#929BA9] bg-neutral-500/10'
                    }`}
                  >
                    {ev.eventBiasForGold}
                  </span>
                </div>

                {/* Row 2: Impact Dot + Title + FOMC Pillar */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ev.impact === 'High' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="font-bold text-xs text-[#151D2A] dark:text-[#F2F4F7] truncate">
                      {ev.title}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-mono text-[#697586] dark:text-[#929BA9] bg-[#F5F7FA] dark:bg-[#101318] px-1.5 py-0.5 rounded border border-[#DDE3EA] dark:border-[#20252D] shrink-0">
                    {ev.pillar}
                  </span>
                </div>

                {/* Row 3: Compact 3-Column Metrics (Prev | Forecast | Actual) with zero clipping */}
                <div className="grid grid-cols-3 gap-2 bg-[#F5F7FA] dark:bg-[#050607] p-2 rounded-lg text-center font-mono text-xs border border-[#DDE3EA] dark:border-[#1E232B]">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">Prev</div>
                    <div className="font-semibold text-[#697586] dark:text-[#929BA9] mt-0.5 tabular-nums">
                      {ev.previous || '—'}
                    </div>
                  </div>
                  <div className="border-x border-[#DDE3EA] dark:border-[#1E232B]">
                    <div className="text-[9px] uppercase tracking-wider text-[#1769E8] dark:text-[#3478DC] font-bold">Fcst</div>
                    <div className="font-black text-[#1769E8] dark:text-[#3478DC] mt-0.5 tabular-nums">
                      {ev.forecast || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#151D2A] dark:text-[#F2F4F7] font-semibold">Act</div>
                    <div className="font-black text-[#151D2A] dark:text-[#F2F4F7] mt-0.5 tabular-nums">
                      {ev.actual || '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Full Responsive Financial Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-[700px] w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DDE3EA] dark:border-[#20252D] text-[10px] uppercase tracking-wider text-[#697586] dark:text-[#929BA9]">
                <th className="py-3 pr-3 font-semibold w-24">Status</th>
                <th className="py-3 pr-3 font-semibold">{tr('Waktu (WIB)', 'Time (WIB)')}</th>
                <th className="py-3 pr-3 font-semibold">{tr('Event USD', 'USD Event')}</th>
                <th className="py-3 pr-3 font-semibold">{tr('Pilar FOMC', 'FOMC Pillar')}</th>
                <th className="py-3 pr-3 text-right font-semibold">Prev</th>
                <th className="py-3 pr-3 text-right font-semibold text-[#1769E8] dark:text-[#3478DC]">Forecast</th>
                <th className="py-3 pr-3 text-right font-semibold">Actual</th>
                <th className="py-3 text-right font-semibold">{tr('Bias XAU/USD', 'XAU/USD Bias')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE3EA] dark:divide-[#20252D]">
              {snapshot.calendarEvents.map((ev: MacroCalendarEvent) => {
                const evTime = new Date(ev.date).getTime();
                const isPassedOver2Hours = !isNaN(evTime) && evTime < nowMs - TWO_HOURS_MS;
                const isNextUpcoming = ev.id === nextUpcomingEvent?.id;
                const isJustReleased = !isNaN(evTime) && evTime >= nowMs - TWO_HOURS_MS && evTime < nowMs;

                return (
                  <tr
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`cursor-pointer transition-colors ${
                      isNextUpcoming
                        ? 'bg-[#1769E8]/5 dark:bg-[#3478DC]/10 border-l-2 border-l-[#1769E8] dark:border-l-[#3478DC]'
                        : isPassedOver2Hours
                        ? 'opacity-50 hover:opacity-100 hover:bg-[#F5F7FA] dark:hover:bg-[#101318]'
                        : 'hover:bg-[#F5F7FA] dark:hover:bg-[#101318]'
                    }`}
                  >
                    <td className="py-3.5 pr-3 whitespace-nowrap">
                      {isNextUpcoming ? (
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-[#1769E8] dark:bg-[#3478DC] text-white">
                          {tr('BERIKUTNYA', 'NEXT')}
                        </span>
                      ) : isPassedOver2Hours ? (
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-[#E2E8F0] dark:bg-[#1C2330] text-[#697586] dark:text-[#929BA9]">
                          {tr('SELESAI', 'COMPLETED')}
                        </span>
                      ) : isJustReleased ? (
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                          {tr('RILIS', 'RELEASED')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-[#F5F7FA] dark:bg-[#101318] text-[#697586] dark:text-[#929BA9] border border-[#DDE3EA] dark:border-[#20252D]">
                          {tr('MENUNGGU', 'PENDING')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pr-3 font-mono text-[11px] text-[#697586] dark:text-[#929BA9] whitespace-nowrap">
                      {formatTimestampWib(ev.date, language)}
                    </td>
                    <td className="py-3.5 pr-3 font-semibold text-[#151D2A] dark:text-[#F2F4F7]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            ev.impact === 'High' ? 'bg-rose-500' : 'bg-amber-500'
                          }`}
                        />
                        <span>{ev.title}</span>
                      </div>
                    </td>
                    <td className="py-3.5 pr-3">
                      <span className="text-[10px] font-mono text-[#697586] dark:text-[#929BA9] bg-[#F5F7FA] dark:bg-[#101318] px-2 py-0.5 rounded border border-[#DDE3EA] dark:border-[#20252D]">
                        {ev.pillar}
                      </span>
                    </td>
                    <td className="py-3.5 pr-3 text-right font-mono tabular-nums text-[#697586] dark:text-[#929BA9]">
                      {ev.previous || '—'}
                    </td>
                    <td className="py-3.5 pr-3 text-right font-mono tabular-nums font-bold text-[#1769E8] dark:text-[#3478DC]">
                      {ev.forecast || '—'}
                    </td>
                    <td className="py-3.5 pr-3 text-right font-mono tabular-nums font-bold text-[#151D2A] dark:text-[#F2F4F7]">
                      {ev.actual || '—'}
                    </td>
                    <td className="py-3.5 text-right font-mono">
                      <span
                        className={`text-[11px] font-bold ${
                          ev.eventBiasForGold === 'BUY'
                            ? 'text-[#059669] dark:text-[#00A878]'
                            : ev.eventBiasForGold === 'SELL'
                            ? 'text-[#E11D48] dark:text-[#E05260]'
                            : 'text-[#697586] dark:text-[#929BA9]'
                        }`}
                      >
                        {ev.eventBiasForGold}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
