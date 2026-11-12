import {
  MacroCalendarEvent,
  IntermarketAssetPulse,
  BreakingNewsHeadline,
  classifyFomcPillar,
  isInverseUsdIndicator,
  isRelevantUsdMacroEvent,
  evaluateSingleEventForGold,
  filterAndScoreBreakingHeadlines,
  parseMacroNumeric,
} from './macroNewsEngine';

/**
 * Robust CORS proxy fetcher.
 * Automatically tries local proxy, corsproxy.io, api.allorigins.win, and direct fetch,
 * with strict timeout abort (max 8 seconds per feed) so the UI never hangs.
 */
export async function fetchWithCorsProxy(
  targetUrl: string,
  timeoutMs = 8000,
  acceptHeader = 'application/json, text/plain, */*'
): Promise<string> {
  // Strategy 1: Local server proxy endpoint (fastest and 100% reliable in browser dev & cloud run)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(3000, timeoutMs));
    const localProxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(localProxyUrl, {
      headers: { Accept: acceptHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 10 && !text.trim().startsWith('<!doctype') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch {
    // Proceed to next proxy strategy
  }

  // Strategy 2: corsproxy.io
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(4000, timeoutMs));
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, {
      headers: { Accept: acceptHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 10 && !text.trim().startsWith('<!doctype') && !text.includes('keyless_legacy_url')) {
        return text;
      }
    }
  } catch {
    // try next proxy
  }

  // Strategy 3: api.allorigins.win raw proxy
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, {
      headers: { Accept: acceptHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 10 && !text.trim().startsWith('<!doctype')) {
        return text;
      }
    }
  } catch {
    // try direct fetch
  }

  // Strategy 4: Direct fetch
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(3000, timeoutMs));
    const res = await fetch(targetUrl, {
      headers: {
        Accept: acceptHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 10 && !text.trim().startsWith('<!doctype')) {
        return text;
      }
    }
  } catch {
    // all strategies failed
  }

  throw new Error(`Semua jalur proxy gagal mengunduh data dari: ${targetUrl}`);
}

export function getClientFallbackCalendarEvents(): MacroCalendarEvent[] {
  const now = new Date();
  // Distribute fallback events realistically across the current week (Monday to Friday)
  const currentDay = now.getUTCDay(); // 0 = Sun, 1 = Mon ...
  const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  monday.setUTCHours(12, 0, 0, 0);

  // If Friday 13:30 UTC of this week has already passed, roll schedule forward to next week
  // so there are always upcoming Pre-News release slots available.
  const fridayCheck = new Date(monday);
  fridayCheck.setUTCDate(monday.getUTCDate() + 4);
  fridayCheck.setUTCHours(13, 30, 0, 0);
  if (fridayCheck.getTime() <= now.getTime()) {
    monday.setUTCDate(monday.getUTCDate() + 7);
  }

  const getWeekDayIso = (dayOffset: number, utcHour: number, utcMinute: number): string => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + dayOffset);
    d.setUTCHours(utcHour, utcMinute, 0, 0);
    return d.toISOString();
  };

  const rawSchedule = [
    {
      title: 'US ISM Manufacturing PMI',
      country: 'USD',
      date: getWeekDayIso(0, 15, 0), // Monday 15:00 UTC (22:00 WIB)
      impact: 'High' as const,
      previous: '48.5',
      forecast: '49.2',
      actual: '49.0',
    },
    {
      title: 'US JOLTS Job Openings',
      country: 'USD',
      date: getWeekDayIso(1, 15, 0), // Tuesday 15:00 UTC (22:00 WIB)
      impact: 'High' as const,
      previous: '7.74M',
      forecast: '7.62M',
      actual: '',
    },
    {
      title: 'US Core CPI m/m',
      country: 'USD',
      date: getWeekDayIso(2, 13, 30), // Wednesday 13:30 UTC (20:30 WIB)
      impact: 'High' as const,
      previous: '0.3%',
      forecast: '0.2%',
      actual: '',
    },
    {
      title: 'US CPI m/m',
      country: 'USD',
      date: getWeekDayIso(2, 13, 30), // Wednesday 13:30 UTC (20:30 WIB)
      impact: 'High' as const,
      previous: '0.4%',
      forecast: '0.3%',
      actual: '',
    },
    {
      title: 'US Initial Jobless Claims',
      country: 'USD',
      date: getWeekDayIso(3, 13, 30), // Thursday 13:30 UTC (20:30 WIB)
      impact: 'High' as const,
      previous: '221K',
      forecast: '215K',
      actual: '',
    },
    {
      title: 'US ISM Services PMI',
      country: 'USD',
      date: getWeekDayIso(3, 15, 0), // Thursday 15:00 UTC (22:00 WIB)
      impact: 'High' as const,
      previous: '56.0',
      forecast: '54.2',
      actual: '',
    },
    {
      title: 'FOMC Member Waller Speaks',
      country: 'USD',
      date: getWeekDayIso(3, 18, 0), // Thursday 18:00 UTC (01:00 WIB)
      impact: 'High' as const,
      previous: '-',
      forecast: '-',
      actual: '',
    },
    {
      title: 'US Core PPI m/m',
      country: 'USD',
      date: getWeekDayIso(4, 13, 30), // Friday 13:30 UTC (20:30 WIB)
      impact: 'High' as const,
      previous: '0.2%',
      forecast: '0.3%',
      actual: '',
    },
    {
      title: 'US PPI m/m',
      country: 'USD',
      date: getWeekDayIso(4, 13, 30), // Friday 13:30 UTC (20:30 WIB)
      impact: 'High' as const,
      previous: '0.1%',
      forecast: '0.2%',
      actual: '',
    },
    {
      title: 'US Non-Farm Employment Change (NFP)',
      country: 'USD',
      date: getWeekDayIso(4, 15, 0), // Friday 15:00 UTC (22:00 WIB)
      impact: 'High' as const,
      previous: '185K',
      forecast: '190K',
      actual: '',
    },
    {
      title: 'US Unemployment Rate',
      country: 'USD',
      date: getWeekDayIso(4, 15, 0), // Friday 15:00 UTC (22:00 WIB)
      impact: 'High' as const,
      previous: '4.1%',
      forecast: '4.1%',
      actual: '',
    },
    {
      title: 'US Average Hourly Earnings m/m',
      country: 'USD',
      date: getWeekDayIso(4, 15, 0), // Friday 15:00 UTC (22:00 WIB)
      impact: 'Medium' as const,
      previous: '0.3%',
      forecast: '0.3%',
      actual: '',
    },
  ];

  return rawSchedule.map((item, idx) => {
    const prevParsed = parseMacroNumeric(item.previous);
    const fcstParsed = parseMacroNumeric(item.forecast);
    const actParsed = parseMacroNumeric(item.actual);
    const evalResult = evaluateSingleEventForGold(
      item.title,
      actParsed.value,
      fcstParsed.value,
      prevParsed.value
    );
    return {
      id: `ff-usd-${idx + 1}`,
      title: item.title,
      country: item.country,
      date: item.date,
      impact: item.impact,
      previous: item.previous,
      forecast: item.forecast,
      actual: item.actual,
      previousNum: prevParsed.value,
      forecastNum: fcstParsed.value,
      actualNum: actParsed.value,
      unit: fcstParsed.unit || prevParsed.unit || '',
      pillar: classifyFomcPillar(item.title),
      isInverseIndicator: isInverseUsdIndicator(item.title),
      eventBiasForGold: evalResult.bias,
      biasReasonId: evalResult.reasonId,
      biasReasonEn: evalResult.reasonEn,
      isLiveFeed: false,
    };
  });
}

export async function fetchClientForexFactoryCalendar(): Promise<MacroCalendarEvent[]> {
  try {
    const jsonStr = await fetchWithCorsProxy(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      8000,
      'application/json'
    );
    const rawList = JSON.parse(jsonStr);
    if (!Array.isArray(rawList)) {
      return getClientFallbackCalendarEvents();
    }

    const filtered = rawList.filter((item: any) => isRelevantUsdMacroEvent(item));
    if (filtered.length === 0) {
      return getClientFallbackCalendarEvents();
    }

    return filtered.slice(0, 18).map((item: any, idx: number) => {
      const title = String(item.title || 'USD Economic Release').trim();
      const previous = String(item.previous ?? '').trim();
      const forecast = String(item.forecast ?? '').trim();
      const actual = String(item.actual ?? '').trim();

      const prevParsed = parseMacroNumeric(previous);
      const fcstParsed = parseMacroNumeric(forecast);
      const actParsed = parseMacroNumeric(actual);

      const evalResult = evaluateSingleEventForGold(
        title,
        actParsed.value,
        fcstParsed.value,
        prevParsed.value
      );

      const rawImpact = String(item.impact || 'Medium');
      const impact: 'High' | 'Medium' | 'Low' =
        rawImpact === 'High' ? 'High' : rawImpact === 'Low' ? 'Low' : 'Medium';

      // Parse date accurately into ISO UTC timestamp
      let isoDate = new Date().toISOString();
      if (item.date) {
        try {
          const parsed = new Date(item.date);
          if (!isNaN(parsed.getTime())) {
            isoDate = parsed.toISOString();
          }
        } catch {
          isoDate = String(item.date);
        }
      }

      return {
        id: `ff-${idx + 1}-${title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
        title,
        country: 'USD',
        date: isoDate,
        impact,
        previous: previous || '-',
        forecast: forecast || '-',
        actual: actual || '',
        previousNum: prevParsed.value,
        forecastNum: fcstParsed.value,
        actualNum: actParsed.value,
        unit: fcstParsed.unit || prevParsed.unit || actParsed.unit || '',
        pillar: classifyFomcPillar(title),
        isInverseIndicator: isInverseUsdIndicator(title),
        eventBiasForGold: evalResult.bias,
        biasReasonId: evalResult.reasonId,
        biasReasonEn: evalResult.reasonEn,
        isLiveFeed: true,
      };
    });
  } catch (err) {
    console.warn('[MacroClient] ForexFactory feed fallback triggered:', err);
    return getClientFallbackCalendarEvents();
  }
}

export async function fetchClientYahooAsset(
  symbol: 'DXY' | 'USOIL' | 'US10Y',
  yahooTicker: string,
  name: string,
  fallbackPrice: number,
  fallbackPrevClose: number
): Promise<IntermarketAssetPulse> {
  let price = fallbackPrice;
  let previousClose = fallbackPrevClose;

  try {
    const encodedTicker = encodeURIComponent(yahooTicker);
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=15m&range=5d`;
    const jsonStr = await fetchWithCorsProxy(targetUrl, 8000, 'application/json');
    const json = JSON.parse(jsonStr);
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta) {
      const regPrice = Number(meta.regularMarketPrice);
      const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
      if (Number.isFinite(regPrice) && regPrice > 0) {
        price = regPrice;
      }
      if (Number.isFinite(prev) && prev > 0) {
        previousClose = prev;
      }
    }
  } catch (err) {
    console.warn(`[MacroClient] Yahoo ticker ${yahooTicker} fallback:`, err);
  }

  const change = Number((price - previousClose).toFixed(3));
  const changePercent =
    previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;

  const direction: 'UP' | 'DOWN' | 'FLAT' =
    changePercent > 0.03 ? 'UP' : changePercent < -0.03 ? 'DOWN' : 'FLAT';

  let goldCorrelationEffect: IntermarketAssetPulse['goldCorrelationEffect'] = 'NEUTRAL';
  let summaryId = '';
  let summaryEn = '';

  if (symbol === 'DXY') {
    goldCorrelationEffect =
      direction === 'UP' ? 'BEARISH_GOLD' : direction === 'DOWN' ? 'BULLISH_GOLD' : 'NEUTRAL';
    summaryId =
      direction === 'UP'
        ? 'Dolar AS menguat → Tekanan korelasi negatif (SELL XAU/USD)'
        : direction === 'DOWN'
        ? 'Dolar AS melemah → Dukungan korelasi positif (BUY XAU/USD)'
        : 'DXY bergerak mendatar menjelang rilis data';
    summaryEn =
      direction === 'UP'
        ? 'US Dollar strengthening → Inverse headwind (SELL XAU/USD)'
        : direction === 'DOWN'
        ? 'US Dollar softening → Inverse tailwind (BUY XAU/USD)'
        : 'DXY consolidating ahead of macro release';
  } else if (symbol === 'US10Y') {
    goldCorrelationEffect =
      direction === 'UP' ? 'BEARISH_GOLD' : direction === 'DOWN' ? 'BULLISH_GOLD' : 'NEUTRAL';
    summaryId =
      direction === 'UP'
        ? 'Imbal hasil Treasury 10Y naik → Konfirmasi tekanan SELL XAU/USD'
        : direction === 'DOWN'
        ? 'Imbal hasil Treasury 10Y turun → Konfirmasi dorongan BUY XAU/USD'
        : 'Yield 10Y stabil menunggu katalis Fed';
    summaryEn =
      direction === 'UP'
        ? '10Y Treasury Yield rising → Confirms SELL XAU/USD pressure'
        : direction === 'DOWN'
        ? '10Y Treasury Yield falling → Confirms BUY XAU/USD support'
        : '10Y Yield flat awaiting Fed catalyst';
  } else {
    goldCorrelationEffect =
      changePercent >= 1.0
        ? 'BEARISH_GOLD'
        : changePercent <= -1.0
        ? 'BULLISH_GOLD'
        : 'NEUTRAL';
    summaryId =
      changePercent >= 1.0
        ? 'Oil melonjak → Inflation Channel (Fed Hawkish / Tekanan SELL Gold)'
        : changePercent <= -1.0
        ? 'Oil melandai → Tekanan inflasi energi mereda (Dukungan BUY Gold)'
        : 'Harga WTI stabil; pantau eskalasi Selat Hormuz / Timur Tengah';
    summaryEn =
      changePercent >= 1.0
        ? 'Oil surging → Inflation Channel active (Hawkish Fed / SELL Gold)'
        : changePercent <= -1.0
        ? 'Oil cooling → Energy inflation pressure eases (BUY Gold support)'
        : 'WTI Crude stable; monitor Strait of Hormuz / Middle East headlines';
  }

  return {
    symbol,
    yahooTicker,
    name,
    price: Number(price.toFixed(2)),
    previousClose: Number(previousClose.toFixed(2)),
    change,
    changePercent,
    direction,
    goldCorrelationEffect,
    summaryId,
    summaryEn,
    updatedAt: new Date().toISOString(),
  };
}

function parseRssXml(
  xmlText: string,
  sourceName: string
): Array<{ title: string; source: string; pubDate: string; link?: string }> {
  const items: Array<{ title: string; source: string; pubDate: string; link?: string }> = [];
  if (!xmlText) return items;

  const itemMatches = xmlText.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemMatches.slice(0, 35)) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pubDateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (titleMatch && titleMatch[1]) {
      items.push({
        title: titleMatch[1],
        source: sourceName,
        pubDate: pubDateMatch?.[1]?.trim() || new Date().toISOString(),
        link: linkMatch?.[1]?.trim(),
      });
    }
  }
  return items;
}

export function getClientFallbackBreakingHeadlines(): BreakingNewsHeadline[] {
  return filterAndScoreBreakingHeadlines([
    {
      title:
        'Fed Governor Waller: Sticky core inflation and strong NFP labor data mean Fed is in no rush to cut rates; upside inflation risks remain on the table',
      source: 'FinancialJuice Macro Wire',
      pubDate: new Date().toISOString(),
    },
    {
      title:
        'Strait of Hormuz geopolitical tensions push US Oil WTI above $74 as tanker tracking confirms transit risk',
      source: 'FXStreet Live Desk',
      pubDate: new Date().toISOString(),
    },
    {
      title:
        'US Core CPI inflation expectations remain firm ahead of key FOMC interest rate decision and forward guidance',
      source: 'Macro Desk',
      pubDate: new Date().toISOString(),
    },
  ]);
}

export async function fetchClientBreakingHeadlines(): Promise<BreakingNewsHeadline[]> {
  const feeds = [
    { url: 'https://www.financialjuice.com/feed.ashx?xy=rss', source: 'FinancialJuice' },
    { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet' },
  ];

  try {
    const results = await Promise.allSettled(
      feeds.map(async (f) => {
        const xml = await fetchWithCorsProxy(f.url, 8000, 'application/rss+xml, text/xml');
        return parseRssXml(xml, f.source);
      })
    );

    const combined: Array<{ title: string; source: string; pubDate: string; link?: string }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        combined.push(...r.value);
      }
    }

    const filtered = filterAndScoreBreakingHeadlines(combined);
    if (filtered.length > 0) {
      return filtered;
    }
    return getClientFallbackBreakingHeadlines();
  } catch (err) {
    console.warn('[MacroClient] Breaking headlines fallback triggered:', err);
    return getClientFallbackBreakingHeadlines();
  }
}
