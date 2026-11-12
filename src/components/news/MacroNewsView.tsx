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
        return tr('Pilar 3: Inflasi', 'Pillar 3: Inflation');
      case 'LABOR':
        return tr('Pilar 2: Tenaga Kerja', 'Pillar 2: Labor Market');
      case 'GROWTH':
        return tr('Pilar 1: Pertumbuhan', 'Pillar 1: Growth');
      case 'GEOPOLITICS':
        return tr('Dual-Channel: Geopolitik & Oil', 'Dual-Channel: Geopolitics & Oil');
      case 'INTERMARKET':
        return tr('Konfirmasi Intermarket', 'Intermarket Confirmation');
      default:
        return tr('Kebijakan FOMC', 'FOMC Policy');
    }
  };

  if (isLoading && !snapshot) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-[#0F1419] border border-[#20252D] flex items-center justify-center mb-3">
          <RefreshCw className="w-4 h-4 text-[#22D3EE] animate-spin" />
        </div>
        <h3 className="text-sm font-semibold text-[#F2F4F7] tracking-tight">
          {tr(
            'Memuat Snapshot Trade News (XAU/USD)...',
            'Loading Trade News (XAU/USD) Snapshot...'
          )}
        </h3>
        <p className="text-xs text-[#929BA9] mt-1 max-w-sm">
          {tr(
            'Membaca cache snapshot Supabase (0 token Gemini) & sinkronisasi data kalender.',
            'Reading Supabase snapshot cache (0 Gemini tokens) & syncing calendar feeds.'
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
      className="space-y-4 pb-12 text-[#F2F4F7]"
    >
      {/* 1. TOP HEADER & COMPACT CONTROLS (Institutional Minimalist Layout) */}
      <div className="rounded-xl bg-[#0F1419] border border-[#20252D] p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-[#F2F4F7] tracking-tight">
                {tr('Trade News', 'Trade News')}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#161A22] border border-[#20252D] text-[#22D3EE]">
                XAU/USD
              </span>
              <span
                data-testid="macro-quota-isolation-badge"
                className="text-[11px] text-[#929BA9] font-medium hidden sm:inline"
              >
                {snapshot.sourceMode === 'SUPABASE_CACHE' ? (
                  <span className="inline-flex items-center gap-1">
                    <Database className="w-3 h-3 text-[#22D3EE]" />
                    {tr('Supabase Cache', 'Supabase Cache')}
                  </span>
                ) : snapshot.sourceMode === 'GEMINI_AI' ? (
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-[#22D3EE]" />
                    {snapshot.modelUsed || 'Gemini 2.5'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Scale className="w-3 h-3 text-[#929BA9]" />
                    {tr('Rule Engine', 'Rule Engine')}
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#929BA9]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#929BA9]" />
                <span>{tr('Update Terakhir:', 'Last Updated:')}</span>
                <span className="text-[#F2F4F7] font-mono tabular-nums">
                  {formatTimestampWib(snapshot.analyzedAt, language)}
                </span>
              </span>
              <span className="text-[#20252D] hidden sm:inline">|</span>
              <span className="text-[11px] text-[#929BA9]">
                {tr('Macro Bias & FOMC Playbook', 'Macro Bias & FOMC Playbook')}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setShowPlaybookGuide((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg bg-[#101318] hover:bg-[#161A22] border border-[#20252D] text-xs font-medium text-[#929BA9] hover:text-[#F2F4F7] transition-colors cursor-pointer"
            >
              <span>{tr('Panduan Playbook', 'Playbook Guide')}</span>
            </button>

            <button
              type="button"
              data-testid="macro-news-refresh-btn"
              disabled={isRefreshing}
              onClick={() => runLiveAnalysis(true, snapshot, selectedEventId)}
              className="px-3.5 py-1.5 rounded-lg bg-[#22D3EE] hover:bg-[#38BDF8] disabled:opacity-60 text-[#0F1419] font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
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
            className={`mt-3.5 p-3 rounded-lg border text-xs flex items-center justify-between gap-3 transition-colors ${
              supabaseFeedback.type === 'success'
                ? 'bg-[#101318] border-[#22D3EE]/40 text-[#F2F4F7]'
                : supabaseFeedback.type === 'warning'
                ? 'bg-[#101318] border-amber-500/40 text-amber-200'
                : 'bg-[#101318] border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {supabaseFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#22D3EE] shrink-0" />
              ) : supabaseFeedback.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="truncate">{supabaseFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSupabaseFeedback(null)}
              className="text-[11px] font-semibold text-[#929BA9] hover:text-[#F2F4F7] shrink-0 cursor-pointer"
            >
              {tr('Tutup', 'Dismiss')}
            </button>
          </div>
        )}

        {/* Collapsible Master Playbook Reference */}
        {showPlaybookGuide && (
          <div className="mt-4 pt-3.5 border-t border-[#20252D] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#929BA9]">
            <div className="p-3 rounded-lg bg-[#101318] border border-[#20252D]">
              <div className="font-semibold text-[#F2F4F7] mb-1">
                {tr('1. 3 Pilar FOMC & Klaim Terbalik', '1. Three FOMC Pillars & Inverse Claims')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Growth (GDP, ISM PMI > 50 ekspansi; GDP Price Index masuk Inflasi), Labor (Unemployment Claims Actual < Forecast = USD Kuat / SELL Gold), & Inflation (CPI, PPI, Core PCE).',
                  'Growth (GDP, ISM PMI > 50 expansion; GDP Price Index in Inflation), Labor (Unemployment Claims Actual < Forecast = Strong USD / SELL Gold), & Inflation (CPI, PPI, Core PCE).'
                )}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#101318] border border-[#20252D]">
              <div className="font-semibold text-[#F2F4F7] mb-1">
                {tr('2. Dual-Channel Oil & Yield 10Y', '2. Dual-Channel Oil & 10Y Yield')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Jika eskalasi Timur Tengah mendorong USOIL naik saat inflasi tinggi, Inflation Channel mendominasi (Hawkish Fed -> SELL Gold). Konfirmasi SELL valid jika US10Y & DXY naik.',
                  'When oil surges during high inflation, the Inflation Channel dominates (Hawkish Fed -> SELL Gold). Valid SELL requires rising 10Y Yield & DXY.'
                )}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#101318] border border-[#20252D]">
              <div className="font-semibold text-[#F2F4F7] mb-1">
                {tr('3. Pindah Haluan & Whipsaw', '3. Dynamic Pivot & Whipsaw')}
              </div>
              <p className="leading-relaxed text-[11px]">
                {tr(
                  'Jika forecast CPI melambat namun pejabat Fed (Waller/Warsh) dukung rate hike + NFP kuat -> Balikkan bias ke SELL 1 Arah. Rilis data jam sama berlawanan memicu whipsaw.',
                  'If CPI cools but Fed officials back rate hike + strong NFP -> Flip bias to 1-Way SELL. Conflicting simultaneous releases trigger whipsaws.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. BREAKING SENTIMENT (Clean structured card with left vertical blue accent line) */}
      {topBreaking && (
        <div
          data-testid="macro-breaking-sentiment-card"
          className="rounded-xl bg-[#0F1419] border border-[#20252D] p-4 sm:p-5"
        >
          <div className="border-l-2 border-[#22D3EE] pl-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#22D3EE] uppercase tracking-wider text-[11px]">
                  {tr('Sentimen Berita Terkini', 'Breaking News Sentiment')}
                </span>
                <span
                  data-testid="breaking-impact-badge"
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#161A22] border border-[#20252D] text-[#F2F4F7]"
                >
                  {topBreaking.impact === 'HIGH' ? 'HIGH IMPACT' : 'LOW IMPACT'}
                </span>
                <span
                  data-testid="breaking-sentiment-badge"
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    topBreaking.sentimentForGold === 'BULLISH'
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : topBreaking.sentimentForGold === 'BEARISH'
                      ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                      : 'text-slate-300 bg-slate-800'
                  }`}
                >
                  XAU/USD: {topBreaking.sentimentForGold}
                </span>
              </div>
              <span className="text-[11px] text-[#929BA9] font-mono">
                {topBreaking.source}
              </span>
            </div>

            <h2 className="text-sm sm:text-base font-semibold text-[#F2F4F7] leading-snug">
              {topBreaking.title}
            </h2>

            <p className="text-xs text-[#929BA9] leading-relaxed">
              <strong className="text-[#F2F4F7] font-semibold mr-1">
                {tr('Evaluasi Pasar:', 'Market Evaluation:')}
              </strong>
              {isEn ? topBreaking.aiEvaluationEn : topBreaking.aiEvaluationId}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {topBreaking.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[11px] font-mono text-[#929BA9] bg-[#101318] px-1.5 py-0.5 rounded border border-[#20252D]"
                  >
                    #{kw}
                  </span>
                ))}
              </div>

              {snapshot.breakingNews.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllHeadlines((prev) => !prev)}
                  className="text-xs text-[#22D3EE] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {showAllHeadlines
                      ? tr('Tutup Headline Lain', 'Hide Other Headlines')
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
            <div className="mt-4 pt-3.5 border-t border-[#20252D] space-y-2.5">
              {snapshot.breakingNews.slice(1, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-[#101318] border border-[#20252D] space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-[#929BA9]">
                    <span className="font-semibold text-[#F2F4F7]">{item.source}</span>
                    <span
                      className={`font-semibold ${
                        item.sentimentForGold === 'BULLISH'
                          ? 'text-emerald-400'
                          : item.sentimentForGold === 'BEARISH'
                          ? 'text-rose-400'
                          : 'text-[#929BA9]'
                      }`}
                    >
                      {item.sentimentForGold}
                    </span>
                  </div>
                  <p className="text-xs text-[#F2F4F7] font-medium leading-snug">{item.title}</p>
                  <p className="text-[11px] text-[#929BA9] leading-relaxed">
                    {isEn ? item.aiEvaluationEn : item.aiEvaluationId}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. INTERMARKET PULSE (Clean 3-Column Tabular Grid) */}
      <div
        data-testid="macro-intermarket-pulse-grid"
        className="rounded-xl bg-[#0F1419] border border-[#20252D] p-4 sm:p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#22D3EE]" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#F2F4F7]">
              {tr('Intermarket Pulse Real-Time', 'Real-Time Intermarket Pulse')}
            </h2>
          </div>
          <span className="text-[11px] text-[#929BA9]">
            {tr('Korelasi XAU/USD', 'XAU/USD Correlation')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {intermarketList.map((item) => {
            const isUp = item.direction === 'UP';
            const isDown = item.direction === 'DOWN';

            return (
              <div
                key={item.symbol}
                data-testid={`intermarket-card-${item.symbol}`}
                className="rounded-lg bg-[#101318] border border-[#20252D] p-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-semibold text-[#929BA9] truncate">
                      {item.symbol === 'USOIL'
                        ? 'US OIL (WTI)'
                        : item.symbol === 'US10Y'
                        ? 'US10Y YIELD'
                        : 'DXY'}
                    </span>
                    <span
                      className={`inline-flex items-center font-mono tabular-nums text-[11px] font-semibold ${
                        isUp
                          ? 'text-emerald-400'
                          : isDown
                          ? 'text-rose-400'
                          : 'text-[#929BA9]'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-3 h-3 mr-0.5" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-3 h-3 mr-0.5" />
                      ) : (
                        <Minus className="w-3 h-3 mr-0.5" />
                      )}
                      {item.changePercent > 0
                        ? `+${item.changePercent.toFixed(2)}%`
                        : `${item.changePercent.toFixed(2)}%`}
                    </span>
                  </div>

                  <div className="mt-1.5 text-base sm:text-lg font-bold text-[#F2F4F7] font-mono tabular-nums">
                    {item.symbol === 'USOIL'
                      ? `$${item.price.toFixed(2)}`
                      : item.symbol === 'US10Y'
                      ? `${item.price.toFixed(2)}%`
                      : item.price.toFixed(2)}
                  </div>
                </div>

                <p className="mt-2 pt-2 border-t border-[#20252D] text-[11px] text-[#929BA9] leading-snug line-clamp-2">
                  {isEn ? item.summaryEn : item.summaryId}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. PRE-NEWS SCENARIO MATRIX (Core Clean Analysis Card) */}
      <div
        data-testid="macro-scenario-matrix-card"
        className="rounded-xl bg-[#0F1419] border border-[#20252D] p-4 sm:p-5 space-y-4"
      >
        {/* Matrix Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#20252D] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#22D3EE]" />
              <h2 className="text-sm sm:text-base font-bold text-[#F2F4F7] uppercase tracking-wide">
                {tr('Pre-News Scenario Matrix (XAU/USD)', 'Pre-News Scenario Matrix (XAU/USD)')}
              </h2>
            </div>
            <p className="text-xs text-[#929BA9] mt-0.5">
              {tr(
                'Komparasi kalender USD, probabilitas bias, dan evaluasi 3 Pilar FOMC',
                'USD calendar comparison, bias probabilities, and 3 FOMC Pillars evaluation'
              )}
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded bg-[#161A22] border border-[#20252D] text-[11px] font-semibold text-[#22D3EE]">
              {pillarBadgeLabel(primaryEv.pillar)}
            </span>
          </div>
        </div>

        {/* Economic Calendar Event Selector (Clean Segmented Horizontal Scroll) */}
        {snapshot.calendarEvents.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[#929BA9] flex items-center justify-between">
              <span>{tr('Jadwal Kalender Terpilih:', 'Selected Calendar Release:')}</span>
              <span className="font-mono text-[11px] text-[#929BA9]">
                {snapshot.calendarEvents.length} {tr('Event', 'Events')}
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
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#22D3EE] text-[#0F1419] font-bold'
                        : 'bg-[#101318] text-[#929BA9] border border-[#20252D] hover:text-[#F2F4F7] hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ev.impact === 'High'
                          ? isSelected
                            ? 'bg-[#0F1419]'
                            : 'bg-rose-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span>{ev.title}</span>
                    {ev.actual && (
                      <span
                        className={`text-[10px] font-mono px-1 rounded ${
                          isSelected
                            ? 'bg-[#0F1419]/20 text-[#0F1419]'
                            : 'bg-[#161A22] text-[#F2F4F7]'
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeMatrix.dynamicPivotTriggered && (
              <div className="p-3 rounded-lg bg-[#101318] border border-rose-500/40 border-l-2 border-l-rose-500 text-xs text-rose-200 leading-relaxed">
                <div className="font-bold text-rose-300 mb-0.5">
                  {tr(
                    'Aturan Dinamis "Pindah Haluan" Aktif (1-Way SELL)',
                    'Dynamic Pivot Rule Triggered (1-Way SELL)'
                  )}
                </div>
                {isEn ? activeMatrix.dynamicPivotReasonEn : activeMatrix.dynamicPivotReasonId}
              </div>
            )}

            {activeMatrix.isSimultaneousRelease && (
              <div
                className={`p-3 rounded-lg bg-[#101318] border text-xs leading-relaxed ${
                  activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? 'border-amber-500/40 border-l-2 border-l-amber-400 text-amber-200'
                    : 'border-emerald-500/40 border-l-2 border-l-emerald-400 text-emerald-200'
                }`}
              >
                <div className="font-bold mb-0.5">
                  {activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? tr(
                        `Simultaneous Release (${simultaneousCount} Data Berlawanan -> Awas Whipsaw)`,
                        `Simultaneous Release (${simultaneousCount} Conflicting Releases -> Whipsaw Risk)`
                      )
                    : tr(
                        `Simultaneous Release (${simultaneousCount} Data Searah -> Konfirmasi Kuat)`,
                        `Simultaneous Release (${simultaneousCount} Aligned Releases -> High Conviction)`
                      )}
                </div>
                {tr(
                  'Periksa keselarasan sub-komponen pada jam rilis yang sama sebelum mengambil posisi.',
                  'Verify alignment across all sub-components at this exact release time before entry.'
                )}
              </div>
            )}
          </div>
        )}

        {/* High-Contrast Focused Numbers: Prev | Forecast | Actual (Scannable in 2 Seconds) */}
        <div className="rounded-lg bg-[#101318] border border-[#20252D] p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-[#22D3EE] uppercase tracking-wider">
                {primaryEv.title}
              </div>
              <div className="text-xs text-[#929BA9]">
                {primaryEv.impact} Impact • {formatTimestampWib(primaryEv.date, language)}
              </div>
            </div>
            {primaryEv.isInverseIndicator && (
              <span className="text-[11px] font-medium text-amber-400">
                {tr('Aturan Terbalik: Actual < Forecast = USD Naik / Gold Turun', 'Inverse Rule: Actual < Forecast = Strong USD / Sell Gold')}
              </span>
            )}
          </div>

          <div
            data-testid="macro-event-numbers-grid"
            className="grid grid-cols-3 gap-2.5 pt-1"
          >
            <div className="rounded-lg bg-[#0F1419] border border-[#20252D] p-3 text-center">
              <div className="text-[11px] font-medium uppercase text-[#929BA9] tracking-wider">
                Previous
              </div>
              <div className="mt-1 text-base sm:text-xl font-bold text-[#F2F4F7] font-mono tabular-nums">
                {primaryEv.previous || '—'}
              </div>
            </div>

            <div className="rounded-lg bg-[#0F1419] border border-[#20252D] p-3 text-center">
              <div className="text-[11px] font-semibold uppercase text-[#22D3EE] tracking-wider">
                Forecast
              </div>
              <div className="mt-1 text-base sm:text-xl font-bold text-[#22D3EE] font-mono tabular-nums">
                {primaryEv.forecast || '—'}
              </div>
            </div>

            <div className="rounded-lg bg-[#0F1419] border border-[#20252D] p-3 text-center">
              <div className="text-[11px] font-medium uppercase text-[#929BA9] tracking-wider">
                Actual
              </div>
              <div className="mt-1 text-base sm:text-xl font-bold text-[#F2F4F7] font-mono tabular-nums">
                {primaryEv.actual || (
                  <span className="text-xs text-[#929BA9] font-normal">
                    {tr('Menunggu Rilis', 'Pending')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Minimalist Visual Probability Bar */}
        <div
          data-testid="macro-probability-bar"
          className="rounded-lg bg-[#101318] border border-[#20252D] p-3.5 sm:p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#929BA9]">
              {tr('Distribusi Probabilitas Skenario', 'Scenario Probability Distribution')}
            </span>
            <span
              data-testid="macro-dominant-bias-badge"
              className="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-[#0F1419] border border-[#20252D] text-[#F2F4F7]"
            >
              {tr('Bias:', 'Bias:')}{' '}
              <strong
                className={
                  activeMatrix.dominantBias === 'BUY'
                    ? 'text-emerald-400'
                    : activeMatrix.dominantBias === 'SELL'
                    ? 'text-rose-400'
                    : 'text-[#22D3EE]'
                }
              >
                {activeMatrix.dominantBias}
              </strong>
            </span>
          </div>

          {/* Thin Minimal Horizontal Bar */}
          <div className="w-full h-2 rounded-full bg-[#161A22] border border-[#20252D] overflow-hidden flex">
            <div
              style={{ width: `${activeMatrix.buyProbability}%` }}
              className="bg-[#22D3EE] h-full"
              title={`BUY XAU/USD: ${activeMatrix.buyProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.sellProbability}%` }}
              className="bg-[#F2F4F7] h-full opacity-80"
              title={`SELL XAU/USD: ${activeMatrix.sellProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.mixedProbability}%` }}
              className="bg-[#929BA9] h-full opacity-40"
              title={`MIXED / WHIPSAW: ${activeMatrix.mixedProbability}%`}
            />
          </div>

          {/* Clean Numerical Stats Row (No Neon Badges) */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono tabular-nums text-xs">
            <div className="p-2 rounded bg-[#0F1419] border border-[#20252D]">
              <div className="text-[11px] font-medium text-[#929BA9]">BUY XAU/USD</div>
              <div className="text-sm font-bold text-[#22D3EE] mt-0.5">
                {activeMatrix.buyProbability}%
              </div>
            </div>

            <div className="p-2 rounded bg-[#0F1419] border border-[#20252D]">
              <div className="text-[11px] font-medium text-[#929BA9]">SELL XAU/USD</div>
              <div className="text-sm font-bold text-[#F2F4F7] mt-0.5">
                {activeMatrix.sellProbability}%
              </div>
            </div>

            <div className="p-2 rounded bg-[#0F1419] border border-[#20252D]">
              <div className="text-[11px] font-medium text-[#929BA9]">MIXED / WHIPSAW</div>
              <div className="text-sm font-bold text-[#929BA9] mt-0.5">
                {activeMatrix.mixedProbability}%
              </div>
            </div>
          </div>
        </div>

        {/* Adu Argumen Fundamental (Clean Segmented Tabs & High Legibility) */}
        <div
          data-testid="macro-arguments-section"
          className="rounded-lg bg-[#101318] border border-[#20252D] p-3.5 sm:p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#F2F4F7]">
              {tr(
                'Adu Argumen Fundamental (3 Pilar FOMC)',
                'Fundamental Arguments (3 FOMC Pillars)'
              )}
            </span>

            {/* Segmented Control */}
            <div className="inline-flex rounded-lg bg-[#0F1419] p-0.5 border border-[#20252D] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setArgumentTab('BOTH')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  argumentTab === 'BOTH'
                    ? 'bg-[#161A22] text-[#F2F4F7] font-semibold'
                    : 'text-[#929BA9] hover:text-[#F2F4F7]'
                }`}
              >
                {tr('Semua', 'Both')}
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('BUY')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  argumentTab === 'BUY'
                    ? 'bg-[#161A22] text-[#22D3EE] font-semibold'
                    : 'text-[#929BA9] hover:text-[#F2F4F7]'
                }`}
              >
                BUY ({activeMatrix.buyArguments.length})
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('SELL')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  argumentTab === 'SELL'
                    ? 'bg-[#161A22] text-[#F2F4F7] font-semibold'
                    : 'text-[#929BA9] hover:text-[#F2F4F7]'
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
              <div className="rounded-lg bg-[#0F1419] border border-[#20252D] p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[#22D3EE] font-semibold text-xs">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{tr('Argumen Pendukung BUY', 'Arguments Supporting BUY')}</span>
                </div>
                <div className="space-y-2">
                  {activeMatrix.buyArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-[#101318] border border-[#20252D] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#F2F4F7]">{arg.tag}</span>
                        <span className="text-[10px] text-[#929BA9] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#929BA9] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(argumentTab === 'BOTH' || argumentTab === 'SELL') && (
              <div className="rounded-lg bg-[#0F1419] border border-[#20252D] p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[#F2F4F7] font-semibold text-xs">
                  <TrendingDown className="w-3.5 h-3.5 text-[#929BA9]" />
                  <span>{tr('Argumen Pendukung SELL', 'Arguments Supporting SELL')}</span>
                </div>
                <div className="space-y-2">
                  {activeMatrix.sellArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-[#101318] border border-[#20252D] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#F2F4F7]">{arg.tag}</span>
                        <span className="text-[10px] text-[#929BA9] uppercase font-mono">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-xs text-[#929BA9] leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Plan & Final Take (Structured Text with Left Blue Accent Border) */}
        <div
          data-testid="macro-final-take-box"
          className="rounded-lg bg-[#101318] border border-[#20252D] p-4 space-y-3"
        >
          <div className="border-l-2 border-[#22D3EE] pl-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#22D3EE]">
                {tr('Kesimpulan & Rencana Aksi', 'Final Take & Action Plan')}
              </h3>
              <span className="text-[11px] font-mono text-[#929BA9]">
                XAU/USD • {activeMatrix.dominantBias}
              </span>
            </div>

            <p className="text-sm font-semibold text-[#F2F4F7] leading-relaxed">
              {isEn ? activeMatrix.finalTakeEn : activeMatrix.finalTakeId}
            </p>
          </div>

          {/* Action Plan Details */}
          <div className="p-3 rounded bg-[#0F1419] border border-[#20252D] text-xs text-[#929BA9] leading-relaxed whitespace-pre-line">
            <strong className="text-[#F2F4F7] block mb-1 uppercase text-[10px] tracking-wider">
              {tr('Taktik Eksekusi:', 'Execution Tactics:')}
            </strong>
            {isEn ? activeMatrix.actionPlanEn : activeMatrix.actionPlanId}
          </div>

          {/* Whipsaw Warning */}
          <div className="p-3 rounded bg-[#0F1419] border border-[#20252D] flex items-start gap-2.5 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[#929BA9] leading-relaxed">
              <strong className="text-amber-300 font-semibold uppercase text-[11px] mr-1">
                {tr('Peringatan Whipsaw:', 'Whipsaw Warning:')}
              </strong>
              {isEn ? activeMatrix.whipsawWarningEn : activeMatrix.whipsawWarningId}
            </div>
          </div>
        </div>
      </div>

      {/* 5. USD ECONOMIC CALENDAR TABLE (Clean Institutional Table) */}
      <div className="rounded-xl bg-[#0F1419] border border-[#20252D] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#F2F4F7]">
            {tr(
              'Jadwal Kalender Ekonomi USD Minggu Ini',
              'This Week USD Economic Calendar'
            )}
          </h3>
          <span className="text-[11px] text-[#929BA9]">ForexFactory Open Feed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#20252D] text-[11px] uppercase tracking-wider text-[#929BA9]">
                <th className="py-2.5 pr-3 font-semibold">{tr('Waktu (WIB)', 'Time (WIB)')}</th>
                <th className="py-2.5 pr-3 font-semibold">{tr('Event USD', 'USD Event')}</th>
                <th className="py-2.5 pr-3 font-semibold">{tr('Pilar FOMC', 'FOMC Pillar')}</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Prev</th>
                <th className="py-2.5 pr-3 text-right font-semibold text-[#22D3EE]">Forecast</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Actual</th>
                <th className="py-2.5 text-right font-semibold">{tr('Bias XAU/USD', 'XAU/USD Bias')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20252D]/60">
              {snapshot.calendarEvents.map((ev: MacroCalendarEvent) => (
                <tr
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className="hover:bg-[#101318] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-[#929BA9] whitespace-nowrap">
                    {formatTimestampWib(ev.date, language)}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-[#F2F4F7]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          ev.impact === 'High' ? 'bg-rose-400' : 'bg-amber-400'
                        }`}
                      />
                      <span>{ev.title}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="text-[10px] font-mono text-[#929BA9]">
                      {ev.pillar}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-[#929BA9]">
                    {ev.previous || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-[#22D3EE]">
                    {ev.forecast || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-[#F2F4F7]">
                    {ev.actual || '—'}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    <span
                      className={`text-[11px] font-bold ${
                        ev.eventBiasForGold === 'BUY'
                          ? 'text-emerald-400'
                          : ev.eventBiasForGold === 'SELL'
                          ? 'text-rose-400'
                          : 'text-[#929BA9]'
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
