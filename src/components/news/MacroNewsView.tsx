import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  ShieldAlert,
  Clock,
  Database,
  Cpu,
  Bell,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Zap,
  Scale,
  Radio,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useLanguage } from '../../utils/language';
import {
  MacroNewsSnapshot,
  MacroCalendarEvent,
  BreakingNewsHeadline,
  IntermarketAssetPulse,
  loadLatestCachedMacroSnapshot,
  saveMacroSnapshotToCache,
  isSnapshotFresh,
  computeDeterministicMacroSnapshot,
  triggerHighImpactMacroNotification,
  formatTimestampWib,
} from '../../utils/macroNewsEngine';

const ANALYZE_ENDPOINTS = [
  '/api/macro-news/analyze',
  'https://ais-pre-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/analyze',
  'https://ais-dev-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/analyze',
];

const FEEDS_ENDPOINTS = [
  '/api/macro-news/feeds',
  'https://ais-pre-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/feeds',
  'https://ais-dev-qmgrbl6vkm3qzsovjavbgc-342426605045.asia-southeast1.run.app/api/macro-news/feeds',
];

const DEFAULT_FALLBACK_INTERMARKET: {
  dxy: IntermarketAssetPulse;
  usoil: IntermarketAssetPulse;
  us10y: IntermarketAssetPulse;
} = {
  dxy: {
    symbol: 'DXY',
    yahooTicker: 'DX-Y.NYB',
    name: 'US Dollar Index (DXY)',
    price: 104.85,
    previousClose: 104.42,
    change: 0.43,
    changePercent: 0.41,
    direction: 'UP',
    goldCorrelationEffect: 'BEARISH_GOLD',
    summaryId: 'DXY menguat (+0.41%), memberi tekanan korelasi terbalik pada XAU/USD.',
    summaryEn: 'DXY rising (+0.41%), exerting inverse bearish pressure on XAU/USD.',
    updatedAt: new Date().toISOString(),
  },
  usoil: {
    symbol: 'USOIL',
    yahooTicker: 'CL=F',
    name: 'US Oil WTI Crude',
    price: 73.4,
    previousClose: 71.95,
    change: 1.45,
    changePercent: 2.02,
    direction: 'UP',
    goldCorrelationEffect: 'BEARISH_GOLD',
    summaryId: 'US Oil WTI naik (+2.02%): risiko rambatan inflasi energi (Inflation Channel -> Fed Hawkish).',
    summaryEn: 'US Oil WTI higher (+2.02%): energy inflation pass-through risk (Inflation Channel -> Hawkish Fed).',
    updatedAt: new Date().toISOString(),
  },
  us10y: {
    symbol: 'US10Y',
    yahooTicker: '^TNX',
    name: 'US 10Y Treasury Yield',
    price: 4.38,
    previousClose: 4.31,
    change: 0.07,
    changePercent: 1.62,
    direction: 'UP',
    goldCorrelationEffect: 'BEARISH_GOLD',
    summaryId: 'Imbal hasil US10Y naik (+1.62%), mengonfirmasi tekanan SELL pada emas tanpa imbal hasil.',
    summaryEn: 'US10Y Yield rising (+1.62%), confirming SELL pressure on non-yielding gold.',
    updatedAt: new Date().toISOString(),
  },
};

export const MacroNewsView: React.FC = () => {
  const { language, isEn, tr } = useLanguage();

  const [snapshot, setSnapshot] = useState<MacroNewsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [argumentTab, setArgumentTab] = useState<'BUY' | 'SELL' | 'BOTH'>('BOTH');
  const [showAllHeadlines, setShowAllHeadlines] = useState<boolean>(false);
  const [showPlaybookGuide, setShowPlaybookGuide] = useState<boolean>(false);

  const runLiveAnalysis = useCallback(
    async (forceRefresh: boolean, existingSnap?: MacroNewsSnapshot | null, targetEventId?: string | null) => {
      setIsRefreshing(true);
      try {
        let analyzedSnap: MacroNewsSnapshot | null = null;

        for (const endpoint of ANALYZE_ENDPOINTS) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 14000);
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                forceRefresh,
                selectedEventId: targetEventId || undefined,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.ok) {
              const json = await res.json();
              if (json?.snapshot && json.snapshot.scenarioMatrix) {
                analyzedSnap = json.snapshot as MacroNewsSnapshot;
                break;
              }
            }
          } catch {
            // Try next endpoint
          }
        }

        // If analyze endpoint wasn't reachable, try passive feeds endpoint (0 Gemini tokens)
        if (!analyzedSnap) {
          for (const feedUrl of FEEDS_ENDPOINTS) {
            try {
              const res = await fetch(feedUrl);
              if (res.ok) {
                const feedJson = await res.json();
                if (feedJson?.snapshot && feedJson.snapshot.scenarioMatrix) {
                  analyzedSnap = feedJson.snapshot as MacroNewsSnapshot;
                  break;
                }
              }
            } catch {
              // ignore
            }
          }
        }

        // Final offline deterministic fallback
        if (!analyzedSnap) {
          analyzedSnap = computeDeterministicMacroSnapshot({
            calendarEvents: existingSnap?.calendarEvents || [],
            intermarketPulse: existingSnap?.intermarketPulse || DEFAULT_FALLBACK_INTERMARKET,
            breakingNews: existingSnap?.breakingNews || [],
            selectedEventId: targetEventId || undefined,
            sourceMode: 'RULE_BASED_FALLBACK',
            modelUsed: 'deterministic-playbook-v1',
          });
        }

        setSnapshot(analyzedSnap);
        await saveMacroSnapshotToCache(analyzedSnap);

        if (analyzedSnap.impactLevel === 'HIGH') {
          await triggerHighImpactMacroNotification(analyzedSnap, language);
        }
      } finally {
        setIsRefreshing(false);
        setIsLoading(false);
      }
    },
    [language]
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
        return tr('PILAR 3: INFLASI', 'PILLAR 3: INFLATION');
      case 'LABOR':
        return tr('PILAR 2: TENAGA KERJA', 'PILLAR 2: LABOR MARKET');
      case 'GROWTH':
        return tr('PILAR 1: PERTUMBUHAN', 'PILLAR 1: ECONOMIC GROWTH');
      case 'GEOPOLITICS':
        return tr('DUAL-CHANNEL: GEOPOLITIK & OIL', 'DUAL-CHANNEL: GEOPOLITICS & OIL');
      case 'INTERMARKET':
        return tr('KONFIRMASI INTERMARKET', 'INTERMARKET CONFIRMATION');
      default:
        return tr('KEBIJAKAN FOMC', 'FOMC POLICY');
    }
  };

  if (isLoading && !snapshot) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#0F1419] border border-[#22D3EE]/40 flex items-center justify-center mb-4 shadow-lg">
          <RefreshCw className="w-6 h-6 text-[#22D3EE] animate-spin" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {tr(
            'Memuat Snapshot Macro & Trade News (XAU/USD)...',
            'Loading Macro & Trade News (XAU/USD) Snapshot...'
          )}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
          {tr(
            'Membaca cache Supabase terlebih dahulu (0 token kuota Gemini) & menyinkronkan data kalender USD.',
            'Reading Supabase snapshot cache first (0 Gemini tokens) & syncing USD calendar data.'
          )}
        </p>
      </div>
    );
  }

  if (!snapshot || !activeMatrix) return null;

  const topBreaking: BreakingNewsHeadline | null =
    snapshot.topBreakingAlert || snapshot.breakingNews[0] || null;
  const hasHighImpactBreaking =
    (topBreaking && topBreaking.impact === 'HIGH') ||
    snapshot.breakingNews.some((h) => h.impact === 'HIGH');

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
      className="space-y-4 pb-10 text-slate-900 dark:text-slate-100"
    >
      {/* 1. HEADER & LIVE REFRESH BAR (#0F1419 & CYAN #22D3EE PALETTE) */}
      <div className="rounded-2xl bg-[#0F1419] border border-slate-800/90 p-4 sm:p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-[#22D3EE]/5 blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 relative z-10">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#22D3EE]/15 border border-[#22D3EE]/40 text-[#22D3EE] text-[10px] font-bold tracking-wider uppercase">
                <Radio className="w-3 h-3 animate-pulse" />
                XAU/USD MACRO DESK
              </span>

              <span
                data-testid="macro-quota-isolation-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300 text-[10px] font-medium"
              >
                {snapshot.sourceMode === 'SUPABASE_CACHE' ? (
                  <>
                    <Database className="w-3 h-3 text-[#22D3EE]" />
                    {tr('Supabase Cache (0 Token)', 'Supabase Cache (0 Tokens)')}
                  </>
                ) : snapshot.sourceMode === 'GEMINI_AI' ? (
                  <>
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    {tr(`Gemini Live (${snapshot.modelUsed})`, `Gemini Live (${snapshot.modelUsed})`)}
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 text-amber-400" />
                    {tr('Rule-Based Playbook Engine', 'Rule-Based Playbook Engine')}
                  </>
                )}
              </span>

              {snapshot.impactLevel === 'HIGH' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold uppercase">
                  <Bell className="w-3 h-3" />
                  HIGH IMPACT ALERT
                </span>
              )}
            </div>

            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              Macro &amp; Trade News (XAU/USD)
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#22D3EE]" />
                {tr('Update Terakhir:', 'Last Update:')}{' '}
                <strong className="text-slate-200 font-mono">
                  {formatTimestampWib(snapshot.analyzedAt, language)}
                </strong>
              </span>
              <span className="text-slate-500 hidden sm:inline">•</span>
              <span className="text-slate-400">
                {tr(
                  'Terisolasi 100% dari kuota Scan Kilat',
                  '100% Isolated from Rapid Scan quota'
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setShowPlaybookGuide((prev) => !prev)}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>{tr('Master Playbook', 'Master Playbook')}</span>
            </button>

            <button
              type="button"
              data-testid="macro-news-refresh-btn"
              disabled={isRefreshing}
              onClick={() => runLiveAnalysis(true, snapshot, selectedEventId)}
              className="px-4 py-2 rounded-xl bg-[#22D3EE] hover:bg-[#06B6D4] disabled:opacity-60 text-[#0F1419] font-extrabold text-xs tracking-wide transition-all shadow-md shadow-[#22D3EE]/10 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>
                {isRefreshing
                  ? tr('Menganalisis...', 'Analyzing...')
                  : tr('🔄 Analisis Live', '🔄 Live Analysis')}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Master Playbook Reference */}
        {showPlaybookGuide && (
          <div className="mt-4 pt-3.5 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] text-slate-300">
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="font-bold text-[#22D3EE] mb-1">
                {tr('1. Tiga Pilar FOMC & Klaim Terbalik', '1. Three FOMC Pillars & Inverse Claims')}
              </div>
              <p className="text-slate-400 leading-relaxed">
                {tr(
                  'Growth (GDP, ISM PMI > 50 ekspansi; < 55 rawan spike; GDP Price Index masuk Inflasi), Labor (Unemployment Claims Actual < Forecast = USD Kuat / SELL Gold; JOLTS Hiring < 50 = Slow Hire Slow Fire), & Inflation (CPI, PPI, Core PCE, ISM Prices > 70).',
                  'Growth (GDP, ISM PMI > 50 expansion; < 55 spike risk; GDP Price Index in Inflation), Labor (Unemployment Claims Actual < Forecast = Strong USD / SELL Gold; JOLTS Hiring < 50 = Slow Hire Slow Fire), & Inflation (CPI, PPI, Core PCE, ISM Prices > 70).'
                )}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="font-bold text-[#22D3EE] mb-1">
                {tr('2. Dual-Channel Oil & Konfirmasi Yield', '2. Dual-Channel Oil & Yield Confirmation')}
              </div>
              <p className="text-slate-400 leading-relaxed">
                {tr(
                  'Jika konflik Timur Tengah/Hormuz memicu USOIL melonjak saat inflasi > 2%, Inflation Channel mendominasi (Fed Hawkish -> SELL Gold). Konfirmasi SELL valid wajib diikuti kenaikan US10Y Yield & DXY.',
                  'When Middle East/Hormuz conflict spikes USOIL while inflation > 2%, the Inflation Channel dominates (Hawkish Fed -> SELL Gold). Valid SELL confirmation requires rising US10Y Yield & DXY.'
                )}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="font-bold text-[#22D3EE] mb-1">
                {tr('3. Aturan Pindah Haluan & Rilis Bersamaan', '3. Dynamic Pivot & Simultaneous Release')}
              </div>
              <p className="text-slate-400 leading-relaxed">
                {tr(
                  'Jika CPI melambat (bias awal BUY) namun Breaking News pejabat Fed (Waller/Warsh) dukung hike 25-50 bps + NFP kuat -> Balikkan menjadi SELL 1 Arah. Jika 2-3 data rilis bersamaan berlawanan -> Awas WHIPSAW.',
                  'If CPI cools (initial BUY) but Fed official (Waller/Warsh) backs 25-50 bps hike + strong NFP -> Flip to 1-Way SELL. If 2-3 simultaneous data releases conflict -> WHIPSAW warning.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. KARTU BREAKING SENTIMENT (TOP FED / GEOPOLITICS ALERT CARD) */}
      {topBreaking && (
        <div
          data-testid="macro-breaking-sentiment-card"
          className={`rounded-2xl bg-[#0F1419] border p-4 shadow-lg transition-all ${
            hasHighImpactBreaking
              ? 'border-[#22D3EE]/50 ring-1 ring-[#22D3EE]/20'
              : 'border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[#22D3EE]">
                <Flame className="w-3.5 h-3.5" />
                {tr('Breaking Sentiment Filter', 'Breaking Sentiment Filter')}
              </span>

              {/* Impact Badge */}
              <span
                data-testid="breaking-impact-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                  topBreaking.impact === 'HIGH'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {topBreaking.impact === 'HIGH' ? 'HIGH IMPACT' : 'LOW IMPACT'}
              </span>

              {/* Sentiment Badge for XAU/USD */}
              <span
                data-testid="breaking-sentiment-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                  topBreaking.sentimentForGold === 'BULLISH'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : topBreaking.sentimentForGold === 'BEARISH'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                XAU/USD: {topBreaking.sentimentForGold}
              </span>
            </div>

            <span className="text-[11px] text-slate-400 font-mono">
              {topBreaking.source}
            </span>
          </div>

          <h2 className="text-sm sm:text-base font-bold text-white leading-snug mb-2">
            {topBreaking.title}
          </h2>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/90 border border-slate-800/90 rounded-xl p-3">
            <strong className="text-[#22D3EE] mr-1.5">
              {tr('Evaluasi AI:', 'AI Evaluation:')}
            </strong>
            {isEn ? topBreaking.aiEvaluationEn : topBreaking.aiEvaluationId}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                {tr('Kata Kunci Terdeteksi:', 'Matched Keywords:')}
              </span>
              {topBreaking.matchedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE] text-[10px] font-semibold"
                >
                  #{kw}
                </span>
              ))}
            </div>

            {snapshot.breakingNews.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllHeadlines((prev) => !prev)}
                className="text-[11px] font-semibold text-[#22D3EE] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>
                  {showAllHeadlines
                    ? tr('Sembunyikan Headline Lain', 'Hide Other Headlines')
                    : tr(
                        `Lihat ${snapshot.breakingNews.length - 1} Headline Terfilter Lainnya`,
                        `View ${snapshot.breakingNews.length - 1} Other Filtered Headlines`
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

          {showAllHeadlines && snapshot.breakingNews.length > 1 && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              {snapshot.breakingNews.slice(1, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                          item.impact === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.impact === 'HIGH' ? 'HIGH IMPACT' : 'LOW IMPACT'}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                          item.sentimentForGold === 'BULLISH'
                            ? 'text-emerald-400'
                            : item.sentimentForGold === 'BEARISH'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {item.sentimentForGold}
                      </span>
                      <span className="text-[10px] text-slate-500">{item.source}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200">{item.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {isEn ? item.aiEvaluationEn : item.aiEvaluationId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. KARTU INTERMARKET PULSE (3 KOLOM RINGKAS: DXY | US OIL WTI | US10Y YIELD) */}
      <div
        data-testid="macro-intermarket-pulse-grid"
        className="rounded-2xl bg-[#0F1419] border border-slate-800 p-4 shadow-lg"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#22D3EE]" />
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white">
              {tr('Intermarket Pulse Real-Time', 'Real-Time Intermarket Pulse')}
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {tr('Korelasi Langsung XAU/USD', 'Direct XAU/USD Correlation')}
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
                className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-2.5 sm:p-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] sm:text-xs font-extrabold text-slate-300 tracking-wide truncate">
                      {item.symbol === 'USOIL'
                        ? 'US OIL (WTI)'
                        : item.symbol === 'US10Y'
                        ? 'US10Y YIELD'
                        : 'DXY'}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold font-mono ${
                        isUp
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isDown
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />
                      ) : null}
                      {item.changePercent > 0
                        ? `+${item.changePercent.toFixed(2)}%`
                        : `${item.changePercent.toFixed(2)}%`}
                    </span>
                  </div>

                  <div className="mt-1.5 text-base sm:text-xl font-black text-white font-mono tracking-tight">
                    {item.symbol === 'USOIL'
                      ? `$${item.price.toFixed(2)}`
                      : item.symbol === 'US10Y'
                      ? `${item.price.toFixed(2)}%`
                      : item.price.toFixed(2)}
                  </div>
                </div>

                <p className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] sm:text-[11px] text-slate-400 leading-snug line-clamp-2">
                  {isEn ? item.summaryEn : item.summaryId}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. KARTU PRE-NEWS SCENARIO MATRIX (INTI FITUR) */}
      <div
        data-testid="macro-scenario-matrix-card"
        className="rounded-2xl bg-[#0F1419] border border-slate-800 p-4 sm:p-5 shadow-xl space-y-4"
      >
        {/* Top Matrix Header + Pillar Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#22D3EE]" />
              <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wide">
                {tr('Pre-News Scenario Matrix (XAU/USD)', 'Pre-News Scenario Matrix (XAU/USD)')}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {tr(
                'Komparasi angka kalender USD, probabilitas skenario, & adu argumen 3 Pilar FOMC',
                'USD calendar number comparison, scenario probabilities, & 3 FOMC Pillars argument matrix'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#22D3EE]/15 border border-[#22D3EE]/40 text-[#22D3EE] text-[10px] font-extrabold uppercase">
              {pillarBadgeLabel(primaryEv.pillar)}
            </span>
          </div>
        </div>

        {/* USD High/Medium Impact Event Selector Bar */}
        {snapshot.calendarEvents.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>
                {tr(
                  'Pilih Jadwal Kalender Ekonomi USD (High / Medium Impact):',
                  'Select USD Economic Calendar Event (High / Medium Impact):'
                )}
              </span>
              <span className="text-[10px] text-[#22D3EE] font-mono">
                {snapshot.calendarEvents.length} {tr('Jadwal USD', 'USD Events')}
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
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#22D3EE] text-[#0F1419] border-[#22D3EE] shadow-sm'
                        : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
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
                        className={`text-[10px] px-1 rounded ${
                          isSelected
                            ? 'bg-[#0F1419]/20 text-[#0F1419]'
                            : 'bg-slate-800 text-[#22D3EE]'
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

        {/* Dynamic Pivot ("Pindah Haluan") or Simultaneous Release Alert Banner */}
        {(activeMatrix.dynamicPivotTriggered || activeMatrix.isSimultaneousRelease) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeMatrix.dynamicPivotTriggered && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-200 leading-relaxed">
                  <div className="font-extrabold uppercase tracking-wider text-rose-300 mb-0.5">
                    {tr(
                      '⚡ Aturan Dinamis "Pindah Haluan" Aktif (1-Way SELL)',
                      '⚡ Dynamic Pivot Rule Active (1-Way SELL)'
                    )}
                  </div>
                  {isEn ? activeMatrix.dynamicPivotReasonEn : activeMatrix.dynamicPivotReasonId}
                </div>
              </div>
            )}

            {activeMatrix.isSimultaneousRelease && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <div className="font-extrabold uppercase tracking-wider mb-0.5">
                    {activeMatrix.simultaneousAlignment === 'CONFLICTING_WHIPSAW'
                      ? tr(
                          `⚠️ Simultaneous Release (${simultaneousCount} Data Berlawanan -> WHIPSAW)`,
                          `⚠️ Simultaneous Release (${simultaneousCount} Conflicting Data -> WHIPSAW)`
                        )
                      : tr(
                          `✅ Simultaneous Release (${simultaneousCount} Data Searah -> Eksekusi Kuat)`,
                          `✅ Simultaneous Release (${simultaneousCount} Aligned Data -> High-Conviction Execution)`
                        )}
                  </div>
                  {tr(
                    'Periksa keselarasan seluruh sub-komponen yang rilis pada jam yang sama sebelum entry.',
                    'Verify alignment across all sub-components releasing at the exact same timestamp before entry.'
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Event Header & Previous | Forecast | Actual Comparison Box */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#22D3EE]">
                {tr('Event Utama Terpilih', 'Focused Main Event')} • {primaryEv.impact} Impact
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                {primaryEv.title}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-slate-400">
                {formatTimestampWib(primaryEv.date, language)}
              </span>
              {primaryEv.isInverseIndicator && (
                <div className="text-[10px] font-bold text-amber-400 mt-0.5">
                  {tr(
                    'Aturan Terbalik: Actual < Forecast = USD Bullish (SELL Gold)',
                    'Inverse Rule: Actual < Forecast = Bullish USD (SELL Gold)'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3-Column Comparison: Previous | Forecast | Actual */}
          <div
            data-testid="macro-event-numbers-grid"
            className="grid grid-cols-3 gap-2.5 pt-1"
          >
            <div className="rounded-xl bg-[#0F1419] border border-slate-800 p-2.5 sm:p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Previous
              </div>
              <div className="mt-1 text-sm sm:text-lg font-extrabold text-slate-200 font-mono">
                {primaryEv.previous || '—'}
              </div>
            </div>

            <div className="rounded-xl bg-[#0F1419] border border-[#22D3EE]/30 p-2.5 sm:p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#22D3EE]">
                Forecast
              </div>
              <div className="mt-1 text-sm sm:text-lg font-extrabold text-[#22D3EE] font-mono">
                {primaryEv.forecast || '—'}
              </div>
            </div>

            <div className="rounded-xl bg-[#0F1419] border border-slate-800 p-2.5 sm:p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Actual
              </div>
              <div className="mt-1 text-sm sm:text-lg font-extrabold text-white font-mono">
                {primaryEv.actual ? (
                  <span className="text-emerald-400">{primaryEv.actual}</span>
                ) : (
                  <span className="text-slate-500 text-xs font-semibold">
                    {tr('Menunggu Rilis', 'Pending Release')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* VISUAL PROBABILITY BAR: BUY (%) | SELL (%) | MIXED/WHIPSAW (%) */}
        <div
          data-testid="macro-probability-bar"
          className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 sm:p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-white">
              {tr('Visual Probability Matrix (XAU/USD)', 'Visual Probability Matrix (XAU/USD)')}
            </span>
            <span
              data-testid="macro-dominant-bias-badge"
              className={`px-2.5 py-0.5 rounded-md text-xs font-black uppercase tracking-wider ${
                activeMatrix.dominantBias === 'BUY'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : activeMatrix.dominantBias === 'SELL'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {tr('BIAS UTAMA:', 'DOMINANT BIAS:')} {activeMatrix.dominantBias}
            </span>
          </div>

          {/* Horizontal Stacked Progress Bar */}
          <div className="w-full h-4 rounded-full bg-[#0F1419] border border-slate-800 overflow-hidden flex">
            <div
              style={{ width: `${activeMatrix.buyProbability}%` }}
              className="bg-emerald-500 h-full transition-all duration-500"
              title={`BUY XAU/USD: ${activeMatrix.buyProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.sellProbability}%` }}
              className="bg-rose-500 h-full transition-all duration-500"
              title={`SELL XAU/USD: ${activeMatrix.sellProbability}%`}
            />
            <div
              style={{ width: `${activeMatrix.mixedProbability}%` }}
              className="bg-amber-500 h-full transition-all duration-500"
              title={`MIXED / WHIPSAW: ${activeMatrix.mixedProbability}%`}
            />
          </div>

          {/* 3 Probability Metric Pills */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="text-[10px] font-bold text-emerald-300 uppercase">
                BUY XAU/USD
              </div>
              <div className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                {activeMatrix.buyProbability}%
              </div>
            </div>

            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <div className="text-[10px] font-bold text-rose-300 uppercase">
                SELL XAU/USD
              </div>
              <div className="text-base sm:text-lg font-black text-rose-400 font-mono">
                {activeMatrix.sellProbability}%
              </div>
            </div>

            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="text-[10px] font-bold text-amber-300 uppercase">
                MIXED / WHIPSAW
              </div>
              <div className="text-base sm:text-lg font-black text-amber-400 font-mono">
                {activeMatrix.mixedProbability}%
              </div>
            </div>
          </div>
        </div>

        {/* ADU ARGUMEN (2 TABS / ACCORDION: PENDUKUNG BUY VS PENDUKUNG SELL) */}
        <div
          data-testid="macro-arguments-section"
          className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 sm:p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-white">
              {tr(
                'Adu Argumen Fundamental (3 Pilar FOMC & Korelasi)',
                'Fundamental Argument Clash (3 FOMC Pillars & Correlation)'
              )}
            </span>

            <div className="inline-flex rounded-xl bg-[#0F1419] p-1 border border-slate-800 self-start">
              <button
                type="button"
                onClick={() => setArgumentTab('BOTH')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  argumentTab === 'BOTH'
                    ? 'bg-[#22D3EE] text-[#0F1419]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr('Semua (Split)', 'Both Sides')}
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('BUY')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  argumentTab === 'BUY'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                {tr('Pendukung BUY', 'Pro-BUY')} ({activeMatrix.buyArguments.length})
              </button>
              <button
                type="button"
                onClick={() => setArgumentTab('SELL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  argumentTab === 'SELL'
                    ? 'bg-rose-500 text-white'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                {tr('Pendukung SELL', 'Pro-SELL')} ({activeMatrix.sellArguments.length})
              </button>
            </div>
          </div>

          <div
            className={`grid gap-3 ${
              argumentTab === 'BOTH' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(argumentTab === 'BOTH' || argumentTab === 'BUY') && (
              <div className="rounded-xl bg-[#0F1419] border border-emerald-500/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4" />
                  <span>
                    {tr(
                      'Argumen Pendukung BUY XAU/USD (Dovish USD)',
                      'Arguments Supporting BUY XAU/USD (Dovish USD)'
                    )}
                  </span>
                </div>
                <div className="space-y-2">
                  {activeMatrix.buyArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-emerald-300">
                          {arg.tag}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase shrink-0">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(argumentTab === 'BOTH' || argumentTab === 'SELL') && (
              <div className="rounded-xl bg-[#0F1419] border border-rose-500/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-rose-400 font-extrabold text-xs uppercase tracking-wider">
                  <TrendingDown className="w-4 h-4" />
                  <span>
                    {tr(
                      'Argumen Pendukung SELL XAU/USD (Hawkish USD)',
                      'Arguments Supporting SELL XAU/USD (Hawkish USD)'
                    )}
                  </span>
                </div>
                <div className="space-y-2">
                  {activeMatrix.sellArguments.map((arg, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-rose-300">
                          {arg.tag}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[9px] font-bold uppercase shrink-0">
                          {arg.pillar}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {isEn ? arg.textEn : arg.textId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FINAL TAKE & ACTION PLAN (DENGAN PERINGATAN WHIPSAW / FAKE MOVE) */}
        <div
          data-testid="macro-final-take-box"
          className="rounded-xl bg-gradient-to-br from-[#0F1419] via-slate-900 to-[#0F1419] border border-[#22D3EE]/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#22D3EE]" />
              <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#22D3EE]">
                {tr(
                  'Final Take & Action Plan (Taktik Eksekusi)',
                  'Final Take & Action Plan (Execution Tactics)'
                )}
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              XAU/USD • {activeMatrix.dominantBias}
            </span>
          </div>

          <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
            {isEn ? activeMatrix.finalTakeEn : activeMatrix.finalTakeId}
          </p>

          <div className="p-3 rounded-xl bg-[#0F1419]/90 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            <strong className="text-[#22D3EE] block mb-1 uppercase text-[10px] tracking-wider">
              {tr('Rencana Eksekusi:', 'Action Plan:')}
            </strong>
            {isEn ? activeMatrix.actionPlanEn : activeMatrix.actionPlanId}
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-200 leading-relaxed">
              <strong className="text-amber-300 uppercase tracking-wider mr-1.5">
                {tr('Peringatan Whipsaw / Fake Move:', 'Whipsaw / Fake Move Warning:')}
              </strong>
              {isEn ? activeMatrix.whipsawWarningEn : activeMatrix.whipsawWarningId}
            </div>
          </div>
        </div>
      </div>

      {/* 5. TABEL RINGKAS JADWAL KALENDER EKONOMI USD MINGGU INI */}
      <div className="rounded-2xl bg-[#0F1419] border border-slate-800 p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white">
            {tr(
              'Kalender Ekonomi USD (High & Medium Impact — 3 Pilar FOMC)',
              'USD Economic Calendar (High & Medium Impact — 3 FOMC Pillars)'
            )}
          </h3>
          <span className="text-[10px] text-slate-400">ForexFactory Open Feed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-3">{tr('Waktu (WIB)', 'Time (WIB)')}</th>
                <th className="py-2 pr-3">{tr('Event USD', 'USD Event')}</th>
                <th className="py-2 pr-3">{tr('Pilar FOMC', 'FOMC Pillar')}</th>
                <th className="py-2 pr-3 text-right">Prev</th>
                <th className="py-2 pr-3 text-right text-[#22D3EE]">Forecast</th>
                <th className="py-2 pr-3 text-right">Actual</th>
                <th className="py-2 text-right">{tr('Bias XAU/USD', 'XAU/USD Bias')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {snapshot.calendarEvents.map((ev: MacroCalendarEvent) => (
                <tr
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className="hover:bg-slate-900/80 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {formatTimestampWib(ev.date, language)}
                  </td>
                  <td className="py-2.5 pr-3 font-bold text-white">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          ev.impact === 'High' ? 'bg-rose-500' : 'bg-amber-400'
                        }`}
                      />
                      <span>{ev.title}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                      {ev.pillar}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-slate-300">
                    {ev.previous || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-bold text-[#22D3EE]">
                    {ev.forecast || '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-bold text-white">
                    {ev.actual || '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        ev.eventBiasForGold === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : ev.eventBiasForGold === 'SELL'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-400'
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
