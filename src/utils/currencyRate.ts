import { AppSettings } from '../types/settings';

export const USD_IDR_CACHE_KEY = 'tradevault_usd_idr_rate_v1';
export const PRIVACY_MODE_STORAGE_KEY = 'tradevault_privacy_mode';

export interface UsdIdrRateRecord {
  /** 1 USD in IDR (e.g., 16250) */
  rate: number;
  /** ISO 8601 timestamp when the rate was fetched from the live provider */
  updatedAt: string;
  /** Source provider identifier */
  provider: string;
  /** Whether the current state is from live network fetch, cached localStorage, or uninitialized offline state */
  status: 'LIVE' | 'CACHED_OFFLINE' | 'UNAVAILABLE';
}

export interface DualBalancePresentation {
  primaryCurrency: 'USD' | 'IDR';
  secondaryCurrency: 'USD' | 'IDR';
  primaryAmount: number | null;
  secondaryAmount: number | null;
  primaryFormatted: string;
  secondaryFormatted: string;
  isRateAvailable: boolean;
  rateStatus: UsdIdrRateRecord['status'];
  rateValue: number | null;
  updatedAt: string | null;
}

export interface CapitalGrowthBreakdown {
  startingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  /** Net external capital contributed = startingBalance + totalDeposits - totalWithdrawals */
  netContributedCapital: number;
  /** Realized net profit purely from trading (excludes deposits/withdrawals) */
  netTradingProfit: number;
  /** Total account balance = netContributedCapital + netTradingProfit */
  currentBalance: number;
  /** Equity change vs starting balance = currentBalance - startingBalance */
  equityChangeFromInitial: number;
  /** Pure trading balance growth (%) = (netTradingProfit / netContributedCapital) * 100 */
  balanceGrowthPercent: number;
  /** Total equity change (%) vs initial startingBalance */
  equityChangePercent: number;
}

function roundToTwo(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function isValidRate(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 1000 && val <= 100000;
}

/**
 * Reads the last verified USD/IDR rate cached in localStorage.
 * Never fabricates a fake live rate if no rate has been cached yet.
 */
export function getCachedUsdIdrRate(): UsdIdrRateRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(USD_IDR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UsdIdrRateRecord>;
    if (!isValidRate(parsed.rate) || typeof parsed.updatedAt !== 'string') {
      return null;
    }
    return {
      rate: parsed.rate,
      updatedAt: parsed.updatedAt,
      provider: typeof parsed.provider === 'string' ? parsed.provider : 'open.er-api.com',
      status: 'CACHED_OFFLINE',
    };
  } catch {
    return null;
  }
}

export function saveCachedUsdIdrRate(rate: number, updatedAt: string, provider: string): UsdIdrRateRecord {
  const record: UsdIdrRateRecord = {
    rate: roundToTwo(rate),
    updatedAt,
    provider,
    status: 'LIVE',
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USD_IDR_CACHE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore quota errors
  }
  return record;
}

/**
 * Fetches live USD -> IDR rate from trusted public FX APIs:
 * Primary: ExchangeRate-API Open Access (https://open.er-api.com/v6/latest/USD)
 * Secondary fallback: Frankfurter ECB API (https://api.frankfurter.app/latest?from=USD&to=IDR)
 * If offline or both fail, returns cached rate with status 'CACHED_OFFLINE' or 'UNAVAILABLE'.
 */
export async function fetchLiveUsdIdrRate(signal?: AbortSignal): Promise<UsdIdrRateRecord> {
  // 1. Primary provider: open.er-api.com
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      const idrRate = data?.rates?.IDR;
      if (isValidRate(idrRate)) {
        const updatedAt =
          typeof data?.time_last_update_utc === 'string'
            ? new Date(data.time_last_update_utc).toISOString()
            : new Date().toISOString();
        return saveCachedUsdIdrRate(idrRate, updatedAt, 'ExchangeRate-API');
      }
    }
  } catch {
    // Fall through to secondary provider
  }

  // 2. Secondary provider: api.frankfurter.app (European Central Bank reference rates)
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      const idrRate = data?.rates?.IDR;
      if (isValidRate(idrRate)) {
        const updatedAt = new Date().toISOString();
        return saveCachedUsdIdrRate(idrRate, updatedAt, 'ECB / Frankfurter');
      }
    }
  } catch {
    // Fall through to cached offline fallback
  }

  // 3. Cached offline rate
  const cached = getCachedUsdIdrRate();
  if (cached) {
    return {
      ...cached,
      status: 'CACHED_OFFLINE',
    };
  }

  return {
    rate: 0,
    updatedAt: '',
    provider: 'Unavailable',
    status: 'UNAVAILABLE',
  };
}

export function formatExactCurrency(amount: number, currency: 'USD' | 'IDR' | 'EUR'): string {
  const safeVal = Number.isFinite(amount) ? amount : 0;
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(safeVal));
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeVal);
}

/**
 * Computes the Dashboard dual-currency presentation (strictly USD and IDR).
 * - If user currency is IDR: Primary = IDR, Secondary = USD.
 * - If user currency is USD (or EUR): Primary = USD, Secondary = IDR.
 * - Never mutates underlying stored values.
 * - Masks both values with '******' when isPrivacyMode is true.
 */
export function computeDualCurrencyDisplay(
  amountInBaseCurrency: number,
  baseCurrency: AppSettings['currency'],
  rateRecord: UsdIdrRateRecord | null,
  isPrivacyMode: boolean = false
): DualBalancePresentation {
  const safeBaseAmount = Number.isFinite(amountInBaseCurrency) ? amountInBaseCurrency : 0;
  const hasValidRate = Boolean(rateRecord && isValidRate(rateRecord.rate));
  const rate = hasValidRate && rateRecord ? rateRecord.rate : null;

  const isIdrPrimary = baseCurrency === 'IDR';
  const primaryCurrency: 'USD' | 'IDR' = isIdrPrimary ? 'IDR' : 'USD';
  const secondaryCurrency: 'USD' | 'IDR' = isIdrPrimary ? 'USD' : 'IDR';

  let primaryAmount: number = safeBaseAmount;
  let secondaryAmount: number | null = null;

  if (isIdrPrimary) {
    primaryAmount = Math.round(safeBaseAmount);
    secondaryAmount = rate ? roundToTwo(safeBaseAmount / rate) : null;
  } else {
    // Base is USD (or EUR displayed in USD/IDR pair without adding a 3rd row)
    primaryAmount = roundToTwo(safeBaseAmount);
    secondaryAmount = rate ? Math.round(safeBaseAmount * rate) : null;
  }

  if (isPrivacyMode) {
    return {
      primaryCurrency,
      secondaryCurrency,
      primaryAmount,
      secondaryAmount,
      primaryFormatted: '******',
      secondaryFormatted: '******',
      isRateAvailable: hasValidRate,
      rateStatus: rateRecord?.status ?? 'UNAVAILABLE',
      rateValue: rate,
      updatedAt: rateRecord?.updatedAt || null,
    };
  }

  const primaryFormatted = formatExactCurrency(primaryAmount, primaryCurrency);
  const secondaryFormatted =
    secondaryAmount !== null
      ? `≈ ${formatExactCurrency(secondaryAmount, secondaryCurrency)}`
      : `Kurs ${secondaryCurrency} belum tersedia (Offline)`;

  return {
    primaryCurrency,
    secondaryCurrency,
    primaryAmount,
    secondaryAmount,
    primaryFormatted,
    secondaryFormatted,
    isRateAvailable: hasValidRate,
    rateStatus: rateRecord?.status ?? 'UNAVAILABLE',
    rateValue: rate,
    updatedAt: rateRecord?.updatedAt || null,
  };
}

/**
 * Calculates Balance Growth (%) while strictly separating:
 * 1. Net Trading Profit (pure realized P/L from trades)
 * 2. Net Contributed Capital (startingBalance + totalDeposits - totalWithdrawals)
 * 3. Balance Growth % = (netTradingProfit / netContributedCapital) * 100
 * Deposits are never treated as trading profit, and withdrawals are never treated as trading losses.
 */
export function calculateCapitalGrowthBreakdown(
  settings: AppSettings,
  netTradingProfit: number
): CapitalGrowthBreakdown {
  const startingBalance =
    Number.isFinite(settings.startingBalance) && settings.startingBalance >= 0
      ? settings.startingBalance
      : 0;
  const totalDeposits =
    Number.isFinite(settings.totalDeposits) && (settings.totalDeposits as number) >= 0
      ? (settings.totalDeposits as number)
      : 0;
  const totalWithdrawals =
    Number.isFinite(settings.totalWithdrawals) && (settings.totalWithdrawals as number) >= 0
      ? (settings.totalWithdrawals as number)
      : 0;
  const safeNetProfit = Number.isFinite(netTradingProfit) ? roundToTwo(netTradingProfit) : 0;

  const netContributedCapital = roundToTwo(startingBalance + totalDeposits - totalWithdrawals);
  const currentBalance = roundToTwo(netContributedCapital + safeNetProfit);
  const equityChangeFromInitial = roundToTwo(currentBalance - startingBalance);

  const capitalDenominator = netContributedCapital > 0 ? netContributedCapital : startingBalance;
  const balanceGrowthPercent =
    capitalDenominator > 0 ? roundToTwo((safeNetProfit / capitalDenominator) * 100) : 0;

  const equityChangePercent =
    startingBalance > 0 ? roundToTwo((equityChangeFromInitial / startingBalance) * 100) : 0;

  return {
    startingBalance,
    totalDeposits,
    totalWithdrawals,
    netContributedCapital,
    netTradingProfit: safeNetProfit,
    currentBalance,
    equityChangeFromInitial,
    balanceGrowthPercent,
    equityChangePercent,
  };
}
