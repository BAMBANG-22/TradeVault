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
  Sparkles,
  Info,
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
  triggerHighImpactMacroNotification,
  formatTimestampWib,
} from '../../utils/macroNewsEngine';
import { executeClientSideMacroAnalysis } from '../../utils/clientSideMacroAnalyzer';
import { isSupabaseConfigured } from '../../utils/supabaseClient';

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
      <div className="min-h-[65vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#0F1419] border border-white/[0.08] flex items-center justify-center mb-4 shadow-xl">
          <RefreshCw className="w-5 h-5 text-[#22D3EE] animate-spin" />
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-[#FFFFFF] tracking-tight">
          {tr(
            'Memuat Snapshot Macro & Trade News...',
            'Loading Macro & Trade News Snapshot...'
          )}
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1.5 max-w-sm leading-relaxed">
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
      className="space-y-4 pb-14 text-[#FFFFFF]"
    >
      {/* 1. TOP EXECUTIVE HEADER (High-End Monochrome Black & White with Subtle Cyan Precision) */}
      <div className="rounded-2xl bg-[#0F1419] border border-white/[0.08] p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase px-2.5 py-0.5 rounded-full bg-white text-black">
                XAU/USD
              </span>

              <span
                data-testid="macro-quota-isolation-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#141923] border border-white/[0.08] text-[11px] text-[#94A3B8] font-medium"
              >
                {snapshot.sourceMode === 'SUPABASE_CACHE' ? (
                  <>
                    <Database className="w-3 h-3 text-[#22D3EE]" />
                    <span>{tr('Cache Supabase (0 Token)', 'Supabase Cache (0 Token)')}</span>
                  </>
                ) : snapshot.sourceMode === 'GEMINI_AI' ? (
                  <>
                    <Cpu className="w-3 h-3 text-[#22D3EE]" />
                    <span>{tr(`Gemini Live (${snapshot.modelUsed || '2.5 Flash'})`, `Gemini Live (${snapshot.modelUsed || '2.5 Flash'})`)}</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 text-[#94A3B8]" />
                    <span>{tr('Rule Engine Playbook', 'Rule Engine Playbook')}</span>
                  </>
                )}
              </span>

              {snapshot.impactLevel === 'HIGH' && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase tracking-wider">
                  HIGH IMPACT
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-[#FFFFFF] tracking-tight">
              Trade News &amp; Macro Bias
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#94A3B8]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>{tr('Pembaruan:', 'Updated:')}</span>
                <span className="text-[#FFFFFF] font-mono tabular-nums font-medium">
                  {formatTimestampWib(snapshot.analyzedAt, language)}
                </span>
              </span>
              <span className="text-white/20 hidden sm:inline">•</span>
              <span className="text-[11px] text-[#94A3B8]">
                {tr('Model Analisis Fundamental 3 Pilar FOMC', '3 FOMC Pillars Fundamental Analysis')}
              </span>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setShowPlaybookGuide((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-[#141923] hover:bg-[#1A202C] border border-white/[0.08] text-xs font-semibold text-[#D1D5DB] hover:text-[#FFFFFF] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Info className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>{tr('Panduan Playbook', 'Playbook Guide')}</span>
            </button>

            <button
              type="button"
              data-testid="macro-news-refresh-btn"
              disabled={isRefreshing}
              onClick={() => runLiveAnalysis(true, snapshot, selectedEventId)}
              className="px-4 py-2 rounded-xl bg-[#FFFFFF] hover:bg-neutral-200 text-[#080A0E] font-bold text-xs tracking-wide transition-all shadow-md active:scale-[0.98] disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
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
                ? 'bg-[#141923] border-[#22D3EE]/40 text-[#FFFFFF]'
                : supabaseFeedback.type === 'warning'
                ? 'bg-[#141923] border-amber-400/40 text-amber-200'
                : 'bg-[#141923] border-rose-400/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {supabaseFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#22D3EE] shrink-0" />
              ) : supabaseFeedback.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="truncate leading-relaxed">{supabaseFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSupabaseFeedback(null)}
              className="text-[11px] font-semibold text-[#94A3B8] hover:text-[#FFFFFF] underline shrink-0 cursor-pointer"
            >
              {tr('Tutup', 'Dismiss')}
            </button>
          </div>
        )}

        {/* Collapsible Playbook Reference */}
        {showPlaybookGuide && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#94A3B8]">
            <div className="p-3.5 rounded-xl bg-[#141923] border border-white/[0.06] space-y-1">
              <div className="font-bold text-[#FFFFFF] text-xs">
                {tr('1. 3 Pilar FOMC & Klaim Terbalik', '1. Three FOMC Pillars & Inverse Claims')}
              </div>
              <p className="leading-relaxed text-[11px] text-[#94A3B8]">
                {tr(
                  'Growth (GDP & ISM PMI > 50 ekspansi), Labor (Unemployment Claims Actual < Forecast = USD Bullish / SELL Gold), & Inflation (CPI, PPI, Core PCE).',
                  'Growth (GDP & ISM PMI > 50 expansion), Labor (Unemployment Claims Actual < Forecast = Bullish USD / SELL Gold), & Inflation (CPI, PPI, Core PCE).'
                )}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141923] border border-white/[0.06] space-y-1">
              <div className="font-bold text-[#FFFFFF] text-xs">
                {tr('2. Dual-Channel USOIL & Yield', '2. Dual-Channel USOIL & Yield')}
              </div>
              <p className="leading-relaxed text-[11px] text-[#94A3B8]">
                {tr(
                  'Saat lonjakan minyak mendorong inflasi energi, Inflation Channel mendominasi (Hawkish Fed -> SELL Gold). Wajib dikonfirmasi oleh tren naik DXY & US10Y.',
                  'When oil spikes drive energy inflation, the Inflation Channel dominates (Hawkish Fed -> SELL Gold). Validated by rising DXY & 10Y Yields.'
                )}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141923] border border-white/[0.06] space-y-1">
              <div className="font-bold text-[#FFFFFF] text-xs">
                {tr('3. Pindah Haluan & Whipsaw', '3. Dynamic Pivot & Whipsaw')}
              </div>
              <p className="leading-relaxed text-[11px] text-[#94A3B8]">
                {tr(
                  'Jika data CPI mendingin namun pejabat Fed mendukung kenaikan suku bunga + NFP kuat -> Pindah Haluan menjadi SELL 1 Arah. Rilis ganda berlawanan memicu whipsaw.',
                  'If CPI cools but Fed officials advocate rate hike + strong NFP -> Dynamic Pivot to 1-Way SELL. Conflicting simultaneous releases trigger whipsaws.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. BREAKING SENTIMENT (Clean Structured Block with Left Hairline Accent) */}
      {topBreaking && (
        <div
          data-testid="macro-breaking-sentiment-card"
          className="rounded-2xl bg-[#0F1419] border border-white/[0.08] p-5 shadow-lg"
        >
          <div className="border-l-2 border-[#22D3EE] pl-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#22D3EE]">
                  {tr('Sentimen Berita Terkini', 'Breaking Headline Sentiment')}
                </span>

                <span
                  data-testid="breaking-impact-badge"
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#141923] border border-white/[0.08] text-[#D1D5DB]"
                >
                  {topBreaking.impact === 'HIGH' ? 'HIGH IMPACT' : 'LOW IMPACT'}
                </span>

                <span
                  data-testid="breaking-sentiment-badge"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    topBreaking.sentimentForGold === 'BULLISH'
                      ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20'
                      : topBreaking.sentimentForGold === 'BEARISH'
                      ? 'text-rose-300 bg-rose-500/10 border border-rose-500/20'
                      : 'text-neutral-300 bg-neutral-800'
                  }`}
                >
                  XAU/USD: {topBreaking.sentimentForGold}
                </span>
              </div>

              <span className="text-[11px] font-mono text-[#94A3B8]">
                {topBreaking.source}
              </span>
            </div>

            <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF] leading-snug">
              {topBreaking.title}
            </h2>

            <div className="p-3.5 rounded-xl bg-[#141923] border border-white/[0.06] text-xs text-[#D1D5DB] leading-relaxed">
              <strong className="text-[#FFFFFF] font-semibold mr-1.5">
                {tr('Evaluasi Makro:', 'Macro Evaluation:')}
              </strong>
              {isEn ? topBreaking.aiEvaluationEn : topBreaking.aiEvaluationId}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {topBreaking.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[10px] font-mono text-[#94A3B8] bg-[#141923] px-2 py-0.5 rounded border border-white/[0.06]"
                  >
                    #{kw}
                  </span>
                ))}
              </div>

              {snapshot.breakingNews.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllHeadlines((prev) => !prev)}
                  className="text-xs font-semibold text-[#22D3EE] hover:underline inline-flex items-center gap-1 cursor-pointer"
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
            <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-2.5">
              {snapshot.breakingNews.slice(1, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#141923] border border-white/[0.06] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                    <span className="font-semibold text-[#FFFFFF]">{item.source}</span>
                    <span
                      className={`font-semibold ${
                        item.sentimentForGold === 'BULLISH'
                          ? 'text-emerald-300'
                          : item.sentimentForGold === 'BEARISH'
                          ? 'text-rose-300'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {item.sentimentForGold}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#FFFFFF] leading-snug">{item.title}</p>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    {isEn ? item.aiEvaluationEn : item.aiEvaluationId}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. INTERMARKET PULSE (Luxury Tabular 3-Column Financial Grid) */}
      <div
        data-testid="macro-intermarket-pulse-grid"
        className="rounded-2xl bg-[#0F1419] border border-white/[0.08] p-5 shadow-lg"
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#22D3EE]" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FFFFFF]">
              {tr('Intermarket Pulse Real-Time', 'Real-Time Intermarket Pulse')}
            </h2>
          </div>
          <span className="text-[11px] text-[#94A3B8]">
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
                className="rounded-xl bg-[#141923] border border-white/[0.06] p-3.5 sm:p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-semibold text-[#94A3B8] uppercase tracking-wide truncate">
                      {item.symbol === 'USOIL'
                        ? 'US OIL (WTI)'
                        : item.symbol === 'US10Y'
                        ? 'US10Y YIELD'
                        : 'DXY'}
                    </span>
                    <span
                      className={`inline-flex items-center font-mono tabular-nums text-[11px] font-bold ${
                        isUp
                          ? 'text-emerald-400'
                          : isDown
                          ? 'text-rose-400'
                          : 'text-[#94A3B8]'
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

                  <div className="mt-2 text-lg sm:text-2xl font-black text-[#FFFFFF] font-mono tabular-nums tracking-tight">
                    {item.symbol === 'USOIL'
                      ? `$${item.price.toFixed(2)}`
                      : item.symbol === 'US10Y'
                      ? `${item.price.toFixed(2)}%`
                      : item.price.toFixed(2)}
                  </div>
                </div>

                <p className="mt-2.5 pt-2 border-t border-white/[0.06] text-[11px] text-[#94A3B8] leading-snug line-clamp-2">
                  {isEn ? item.summaryEn : item.summaryId}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. PRE-NEWS SCENARIO MATRIX (Flagship Aesthetic Layout) */}
      <div
        data-testid="macro-scenario-matrix-card"
        className="rounded-2xl bg-[#0F1419] border border-white/[0.08] p-5 sm:p-6 shadow-xl space-y-5"
      >
        {/* Matrix Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#22D3EE]" />
              <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF] uppercase tracking-wide">
                {tr('Pre-News Scenario Matrix (XAU/USD)', 'Pre-News Scenario Matrix (XAU/USD)')}
              </h2>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              {tr(
                'Komparasi kalender ekonomi USD, estimasi probabilitas skenario, & evaluasi 3 Pilar FOMC',
                'USD economic calendar comparison, scenario probabilities, & 3 FOMC Pillars argument matrix'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full bg-[#141923] border border-white/[0.08] text-[11px] font-semibold text-[#FFFFFF]">
              {pillarBadgeLabel(primaryEv.pillar)}
            </span>
          </div>
        </div>

        {/* Economic Calendar Event Selector (Segmented Minimalist Horizontal Track) */}
        {snapshot.calendarEvents.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#94A3B8] flex items-center justify-between">
              <span>{tr('Pilih Jadwal Rilis USD:', 'Select USD Release:')}</span>
              <span className="font-mono text-[11px] text-[#94A3B8]">
                {snapshot.calendarEvents.length} {tr('Jadwal Aktif', 'Active Events')}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
              {snapshot.calendarEvents.map((ev) => {
                const isSelected =
                  (selectedEventId && ev.id === selectedEventId) ||
                  (!selectedEventId && ev.id === primaryEv.id);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? 'bg-[#FFFFFF] text-[#080A0E] font-bold shadow-md'
                        : 'bg-[#141923] text-[#94A3B8] border border-white/[0.06] hover:text-[#FFFFFF] hover:border-white/[0.14]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ev.impact === 'High'
                          ? isSelected
                            ? 'bg-rose-600'
                            : 'bg-rose-400'
                          : isSelected
                          ? 'bg-amber-600'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span>{ev.title}</span>
                    {ev.actual && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-black/10 text-[#080A0E] font-bold'
                            : 'bg-[#0B0E14] text-[#D1D5DB]'
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

        {/* Dynamic Alerts: Pivot or Simultaneous Release */}
        {(activeMatrix.dynamicPivotTriggered || activeMatrix.isSimultaneousRelease) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeMatrix.dynamicPivotTriggered && (
              <div className="p-3.5 rounded-xl bg-[#141923] border border-rose-500/30 border-l-2 border-l-rose-500 text-xs text-rose-200 leading-relaxed">
                <div className="font-bold text-rose-300 mb-0.5">
                  {tr(
                    'Aturan Dinamis "Pindah Haluan" Aktif (1-Way SELL)',
                    'Dynamic Pivot Rule Active (1-Way SELL)'
                  )}
                </div>
                {isEn ? activeMatrix.dynamicPivotReasonEn : activeMatrix.dynamicPivotReasonId}
              </div>
            )}

            {activeMatrix.isSimultaneousRelease && (
              <div
                className={`p-3.5 rounded-xl bg-[#141923] border text-xs leading-relaxed ${
                  activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? 'border-amber-400/30 border-l-2 border-l-amber-400 text-amber-200'
                    : 'border-emerald-400/30 border-l-2 border-l-emerald-400 text-emerald-200'
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
                {tr(
                  'Harap verifikasi keselarasan seluruh sub-komponen pada jam rilis yang sama.',
                  'Please verify alignment across all sub-components at this exact release time.'
                )}
              </div>
            )}
          </div>
        )}

        {/* Focused Numbers Grid: Previous | Forecast | Actual (Readable in 2 Seconds) */}
        <div className="rounded-xl bg-[#141923] border border-white/[0.06] p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wide">
                {primaryEv.title}
              </div>
              <div className="text-xs text-[#94A3B8] mt-0.5">
                {primaryEv.impact} Impact • {formatTimestampWib(primaryEv.date, language)}
              </div>
            </div>
            {primaryEv.isInverseIndicator && (
              <span className="text-[11px] font-semibold text-amber-300">
                {tr('Aturan Terbalik: Actual < Forecast = USD Menguat (SELL Gold)', 'Inverse Rule: Actual < Forecast = Strong USD (SELL Gold)')}
              </span>
            )}
          </div>

          <div
            data-testid="macro-event-numbers-grid"
            className="grid grid-cols-3 gap-3 pt-1"
          >
            <div className="rounded-xl bg-[#0B0E14] border border-white/[0.06] p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Previous
              </div>
              <div className="mt-1 text-base sm:text-xl font-black text-[#D1D5DB] font-mono tabular-nums">
                {primaryEv.previous || '—'}
              </div>
            </div>

            <div className="rounded-xl bg-[#0B0E14] border border-[#22D3EE]/30 p-3.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#22D3EE]">
                Forecast
              </div>
              <div className="mt-1 text-base sm:text-xl font-black text-[#22D3EE] font-mono tabular-nums">
                {primaryEv.forecast || '—'}
              </div>
            </div>

            <div className="rounded-xl bg-[#0B0E14] border border-white/[0.06] p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Actual
              </div>
              <div className="mt-1 text-base sm:text-xl font-black text-[#FFFFFF] font-mono tabular-nums">
                {primaryEv.actual || (
                  <span className="text-xs text-[#94A3B8] font-normal">
                    {tr('Menunggu Rilis', 'Pending')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Minimalist Monochrome Probability Bar */}
        <div
          data-testid="macro-probability-bar"
          className="rounded-xl bg-[#141923] border border-white/[0.06] p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
              {tr('Distribusi Probabilitas Skenario', 'Scenario Probability Distribution')}
            </span>
            <span
              data-testid="macro-dominant-bias-badge"
              className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FFFFFF] text-[#080A0E] shadow-sm"
            >
              {tr('Bias Utama:', 'Dominant Bias:')} {activeMatrix.dominantBias}
            </span>
          </div>

          {/* Clean Thin Single Bar */}
          <div className="w-full h-2.5 rounded-full bg-[#0B0E14] border border-white/[0.08] overflow-hidden flex">
            <div
              style={{ width: `${activeMatrix.buyProbability}%` }}
              className="bg-[#22D3EE] h-full"
              title={`BUY XAU/USD: ${activeMatrix.buyProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.sellProbability}%` }}
              className="bg-[#FFFFFF] h-full"
              title={`SELL XAU/USD: ${activeMatrix.sellProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.mixedProbability}%` }}
              className="bg-[#475569] h-full"
              title={`MIXED / WHIPSAW: ${activeMatrix.mixedProbability}%`}
            />
          </div>

          {/* Clean Numerical Stats Row */}
          <div className="grid grid-cols-3 gap-3 text-center font-mono tabular-nums">
            <div className="p-3 rounded-xl bg-[#0B0E14] border border-white/[0.06]">
              <div className="text-[10px] font-semibold text-[#94A3B8] uppercase">BUY XAU/USD</div>
              <div className="text-base sm:text-lg font-black text-[#22D3EE] mt-0.5">
                {activeMatrix.buyProbability}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0B0E14] border border-white/[0.06]">
              <div className="text-[10px] font-semibold text-[#94A3B8] uppercase">SELL XAU/USD</div>
              <div className="text-base sm:text-lg font-black text-[#FFFFFF] mt-0.5">
                {activeMatrix.sellProbability}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0B0E14] border border-white/[0.06]">
              <div className="text-[10px] font-semibold text-[#94A3B8] uppercase">MIXED / WHIPSAW</div>
              <div className="text-base sm:text-lg font-black text-[#94A3B8] mt-0.5">
                {activeMatrix.mixedProbability}%
              </div>
            </div>
          </div>
        </div>

        {/* Adu Argumen Fundamental (Clean Segmented Tabs) */}
        <div
          data-testid="macro-arguments-section"
          className="rounded-xl bg-[#141923] border border-white/[0.06] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
              {tr(
                'Adu Argumen Fundamental (3 Pilar FOMC)',
                'Fundamental Arguments (3 FOMC Pillars)'
              )}
            </span>

            {/* Segmented Controls in Crisp Monochrome */}
            <div className="inline-flex rounded-xl bg-[#0B0E14] p-1 border border-white/[0.08] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setArgumentTab('BOTH')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'BOTH'
                    ? 'bg-[#FFFFFF] text-[#080A0E] shadow-sm'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF]'
                }`}
              >
                {tr('Semua', 'Both')}
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('BUY')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'BUY'
                    ? 'bg-[#FFFFFF] text-[#080A0E] shadow-sm'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF]'
                }`}
              >
                BUY ({activeMatrix.buyArguments.length})
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('SELL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  argumentTab === 'SELL'
                    ? 'bg-[#FFFFFF] text-[#080A0E] shadow-sm'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF]'
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
              <div className="rounded-xl bg-[#0B0E14] border border-white/[0.06] p-4 space-y-3">
                <div className="flex items-center gap-2 text-[#22D3EE] font-bold text-xs uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4" />
                  <span>{tr('Argumen Pendukung BUY', 'Arguments Supporting BUY')}</span>
                </div>
                <div className="space-y-2.5">
                  {activeMatrix.buyArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#141923] border border-white/[0.06] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#FFFFFF]">{arg.tag}</span>
                        <span className="text-[10px] text-[#94A3B8] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#D1D5DB] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(argumentTab === 'BOTH' || argumentTab === 'SELL') && (
              <div className="rounded-xl bg-[#0B0E14] border border-white/[0.06] p-4 space-y-3">
                <div className="flex items-center gap-2 text-[#FFFFFF] font-bold text-xs uppercase tracking-wider">
                  <TrendingDown className="w-4 h-4 text-[#94A3B8]" />
                  <span>{tr('Argumen Pendukung SELL', 'Arguments Supporting SELL')}</span>
                </div>
                <div className="space-y-2.5">
                  {activeMatrix.sellArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#141923] border border-white/[0.06] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#FFFFFF]">{arg.tag}</span>
                        <span className="text-[10px] text-[#94A3B8] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#D1D5DB] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Plan & Final Take (Executive Block with Left Cyan Accent) */}
        <div
          data-testid="macro-final-take-box"
          className="rounded-xl bg-[#141923] border border-white/[0.08] p-5 space-y-3.5"
        >
          <div className="border-l-2 border-[#22D3EE] pl-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#22D3EE]">
                {tr('Kesimpulan & Rencana Aksi', 'Final Take & Action Plan')}
              </h3>
              <span className="text-[11px] font-mono text-[#94A3B8]">
                XAU/USD • {activeMatrix.dominantBias}
              </span>
            </div>

            <p className="text-sm font-bold text-[#FFFFFF] leading-relaxed">
              {isEn ? activeMatrix.finalTakeEn : activeMatrix.finalTakeId}
            </p>
          </div>

          {/* Action Plan Details */}
          <div className="p-4 rounded-xl bg-[#0B0E14] border border-white/[0.06] text-xs text-[#D1D5DB] leading-relaxed whitespace-pre-line">
            <strong className="text-[#FFFFFF] block mb-1.5 uppercase text-[10px] tracking-wider">
              {tr('Taktik Eksekusi:', 'Execution Tactics:')}
            </strong>
            {isEn ? activeMatrix.actionPlanEn : activeMatrix.actionPlanId}
          </div>

          {/* Whipsaw Warning */}
          <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-amber-400/20 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[#D1D5DB] leading-relaxed">
              <strong className="text-amber-300 font-semibold uppercase text-[10px] tracking-wider mr-1.5">
                {tr('Peringatan Whipsaw:', 'Whipsaw Warning:')}
              </strong>
              {isEn ? activeMatrix.whipsawWarningEn : activeMatrix.whipsawWarningId}
            </div>
          </div>
        </div>
      </div>

      {/* 5. USD ECONOMIC CALENDAR TABLE (Sleek Institutional Financial Table) */}
      <div className="rounded-2xl bg-[#0F1419] border border-white/[0.08] p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FFFFFF]">
            {tr(
              'Jadwal Kalender Ekonomi USD Minggu Ini',
              'This Week USD Economic Calendar'
            )}
          </h3>
          <span className="text-[11px] text-[#94A3B8]">ForexFactory Open Feed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-[#94A3B8]">
                <th className="py-3 pr-3 font-semibold">{tr('Waktu (WIB)', 'Time (WIB)')}</th>
                <th className="py-3 pr-3 font-semibold">{tr('Event USD', 'USD Event')}</th>
                <th className="py-3 pr-3 font-semibold">{tr('Pilar FOMC', 'FOMC Pillar')}</th>
                <th className="py-3 pr-3 text-right font-semibold">Prev</th>
                <th className="py-3 pr-3 text-right font-semibold text-[#22D3EE]">Forecast</th>
                <th className="py-3 pr-3 text-right font-semibold">Actual</th>
                <th className="py-3 text-right font-semibold">{tr('Bias XAU/USD', 'XAU/USD Bias')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {snapshot.calendarEvents.map((ev: MacroCalendarEvent) => (
                <tr
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="py-3 pr-3 font-mono text-[11px] text-[#94A3B8] whitespace-nowrap">
                    {formatTimestampWib(ev.date, language)}
                  </td>
                  <td className="py-3 pr-3 font-semibold text-[#FFFFFF]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          ev.impact === 'High' ? 'bg-rose-400' : 'bg-amber-400'
                        }`}
                      />
                      <span>{ev.title}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="text-[10px] font-mono text-[#94A3B8] bg-[#141923] px-2 py-0.5 rounded border border-white/[0.06]">
                      {ev.pillar}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-[#94A3B8]">
                    {ev.previous || '—'}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums font-bold text-[#22D3EE]">
                    {ev.forecast || '—'}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums font-bold text-[#FFFFFF]">
                    {ev.actual || '—'}
                  </td>
                  <td className="py-3 text-right font-mono">
                    <span
                      className={`text-[11px] font-bold ${
                        ev.eventBiasForGold === 'BUY'
                          ? 'text-emerald-300'
                          : ev.eventBiasForGold === 'SELL'
                          ? 'text-rose-300'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {ev.eventBiasForGold}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
