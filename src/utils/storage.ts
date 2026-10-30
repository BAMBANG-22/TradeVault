import { Trade } from '../types/trade';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { DEMO_TRADES } from './demoData';

export const GUEST_TRADES_STORAGE_KEY = 'tradevault_trades_guest';
export const USER_TRADES_STORAGE_KEY_PREFIX = 'tradevault_trades_user_';
export const SETTINGS_STORAGE_KEY = 'tradevault_settings_v1';
export const USER_SETTINGS_STORAGE_KEY_PREFIX = 'tradevault_settings_user_';

/**
 * Returns the exact localStorage key scoped to the user, or the guest key if unauthenticated.
 * Format: tradevault_trades_user_<userId> for verified users, or tradevault_trades_guest for guests.
 */
export function getTradesStorageKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim() !== '') {
    return `${USER_TRADES_STORAGE_KEY_PREFIX}${userId.trim()}`;
  }
  return GUEST_TRADES_STORAGE_KEY;
}

/**
 * Returns the exact settings localStorage key scoped to the user, or the guest settings key if unauthenticated.
 * Format: tradevault_settings_user_<userId> for verified users, or tradevault_settings_v1 for guests.
 */
export function getSettingsStorageKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim() !== '') {
    return `${USER_SETTINGS_STORAGE_KEY_PREFIX}${userId.trim()}`;
  }
  return SETTINGS_STORAGE_KEY;
}

/**
 * Atomically removes a trade by ID from the latest tradesRef.current array and updates the ref synchronously.
 * Prevents stale closure race conditions when a trade is deleted right after an adjacent state update.
 */
export function removeTradeFromLatestList(
  tradesRef: { current: Trade[] },
  deletedId: string
): Trade[] {
  const cleanId = String(deletedId || '').trim();
  const currentList = Array.isArray(tradesRef?.current) ? tradesRef.current : [];
  const filtered = currentList.filter((t) => t.id !== cleanId);
  if (tradesRef) {
    tradesRef.current = filtered;
  }
  return filtered;
}

/**
 * Loads trades stored in localStorage.
 * - When userId is provided: strictly returns only trades from that user's scoped cache.
 *   Returns an empty array if no cache exists for that user (never falls back to guest/demo data).
 * - When userId is null/undefined (guest mode): returns guest trades, initializing with DEMO_TRADES
 *   on very first launch only.
 */
export function loadStoredTrades(userId?: string | null): Trade[] {
  try {
    const key = getTradesStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (raw === null) {
      // If user is authenticated and has no cache yet, return empty list!
      // Do NOT load demo trades or pollute user's profile with guest data.
      if (userId && typeof userId === 'string' && userId.trim() !== '') {
        return [];
      }

      // Guest / unauthenticated initial launch: initialize guest storage with DEMO_TRADES
      saveStoredTrades(DEMO_TRADES, null);
      return DEMO_TRADES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('Failed to load trades from storage:', error);
    return [];
  }
}

/**
 * Saves trades array to user-scoped or guest localStorage key.
 */
export function saveStoredTrades(
  trades: Trade[],
  userId?: string | null
): { success: boolean; error?: string } {
  try {
    const key = getTradesStorageKey(userId);
    const serialized = JSON.stringify(trades);
    localStorage.setItem(key, serialized);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save trades to storage:', error);
    const msg =
      error?.name === 'QuotaExceededError'
        ? 'Penyimpanan lokal browser penuh. Jika Anda menyimpan banyak screenshot gambar, kurangi ukuran screenshot atau hapus trade lama.'
        : 'Gagal menyimpan data ke penyimpanan lokal browser.';
    return { success: false, error: msg };
  }
}

/**
 * Explicitly clears the local cache for a specific user.
 */
export function clearUserCache(userId: string): void {
  try {
    if (userId && typeof userId === 'string' && userId.trim() !== '') {
      localStorage.removeItem(getTradesStorageKey(userId));
      localStorage.removeItem(getSettingsStorageKey(userId));
    }
  } catch (error) {
    console.error('Failed to clear user cache:', error);
  }
}

/**
 * Checks whether cached trades exist for a given user.
 */
export function hasUserCache(userId: string): boolean {
  try {
    if (!userId) return false;
    return localStorage.getItem(getTradesStorageKey(userId)) !== null;
  } catch {
    return false;
  }
}

export function mergeWithExistingSettings(
  baseSettings: AppSettings,
  incomingSettings?: Partial<AppSettings> | null
): AppSettings {
  const safeBase: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(baseSettings || {}),
  };

  if (!incomingSettings || typeof incomingSettings !== 'object') {
    return safeBase;
  }

  const result: AppSettings = { ...safeBase };

  if (typeof incomingSettings.currency === 'string' && incomingSettings.currency.trim() !== '') {
    result.currency = incomingSettings.currency.trim() as AppSettings['currency'];
  }
  if (
    typeof incomingSettings.currencySymbol === 'string' &&
    incomingSettings.currencySymbol.trim() !== ''
  ) {
    result.currencySymbol = incomingSettings.currencySymbol.trim();
  }
  if (
    typeof incomingSettings.resetTimezone === 'string' &&
    incomingSettings.resetTimezone.trim() !== ''
  ) {
    result.resetTimezone = incomingSettings.resetTimezone.trim();
  }

  const numericKeys: Array<
    Exclude<keyof AppSettings, 'currency' | 'currencySymbol' | 'resetTimezone'>
  > = [
    'startingBalance',
    'xauusdContractSize',
    'xauusdPointValue',
    'xauusdTickSize',
    'xauusdTickValue',
    'xauusdMinLot',
    'xauusdLotStep',
    'defaultLeverage',
    'brokerCommissionPerLot',
    'defaultRiskPercent',
    'maxTradeRiskPercent',
    'maxTradeRiskAmount',
    'maxDailyLossPercent',
    'maxDailyLossAmount',
    'maxConsecutiveLossLimit',
    'maxDrawdownLimitPercent',
    'targetMonthlyReturnPercent',
  ];

  for (const key of numericKeys) {
    const rawVal = incomingSettings[key];
    if (rawVal !== undefined && rawVal !== null && rawVal !== ('' as any)) {
      const numVal = Number(rawVal);
      if (Number.isFinite(numVal)) {
        (result as any)[key] = numVal;
      }
    }
  }

  return result;
}

export function loadStoredSettings(userId?: string | null): AppSettings {
  try {
    const key = getSettingsStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return mergeWithExistingSettings(DEFAULT_SETTINGS, parsed);
  } catch (error) {
    console.error('Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveStoredSettings(
  settings: AppSettings,
  userId?: string | null
): { success: boolean; error?: string } {
  try {
    const key = getSettingsStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(settings));
    return { success: true };
  } catch (error) {
    console.error('Failed to save settings:', error);
    return { success: false, error: 'Gagal menyimpan pengaturan ke browser.' };
  }
}

export function generateBackupJson(trades: Trade[], settings: AppSettings): string {
  const payload = {
    appName: 'TradeVault Journal',
    version: '1.0',
    exportDate: new Date().toISOString(),
    settings,
    trades,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseAndRestoreBackup(
  jsonString: string,
  currentSettings: AppSettings = DEFAULT_SETTINGS
): {
  success: boolean;
  message: string;
  trades?: Trade[];
  settings?: AppSettings;
} {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      return { success: false, message: 'Format file backup tidak valid.' };
    }

    if (!Array.isArray(data.trades)) {
      return { success: false, message: 'Data trades tidak ditemukan dalam backup.' };
    }

    // Validate trade items lightly
    const validTrades: Trade[] = data.trades.filter(
      (t: any) => t && typeof t.id === 'string' && typeof t.dateTime === 'string'
    );

    const mergedSettings: AppSettings = mergeWithExistingSettings(
      currentSettings,
      data.settings
    );

    return {
      success: true,
      message: `Berhasil memulihkan ${validTrades.length} trade dan konfigurasi akun.`,
      trades: validTrades,
      settings: mergedSettings,
    };
  } catch (err: any) {
    return { success: false, message: `Gagal membaca file JSON: ${err.message}` };
  }
}
