import { Trade } from '../types/trade';
import { AppSettings } from '../types/settings';
import { getSupabase } from './supabaseClient';
import { isDemoTrade } from './demoData';
import { mergeWithExistingSettings, loadStoredSettings, saveStoredSettings } from './storage';
import {
  classifyNetProfitOutcome,
  computeGrossFromNet,
  computeRealizedRMultiple,
  computeTradeNetProfit,
} from './calculations';

export interface SyncResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Translates Supabase / Postgres database errors into informative Indonesian messages
 * without leaking secret tokens or credentials.
 */
export function translateDatabaseError(error: any): string {
  if (!error) return 'Terjadi kesalahan database yang tidak diketahui.';

  const message = (error.message || error.error_description || String(error)).toLowerCase();
  const code = error.code || '';

  // Row Level Security (RLS) violation
  if (
    message.includes('row-level security') ||
    message.includes('violates row-level security policy') ||
    code === '42501'
  ) {
    return 'Izin akses ditolak oleh Row Level Security (RLS). Pastikan Anda telah login dengan akun yang valid dan kebijakan RLS di Supabase mengizinkan operasi ini.';
  }

  // Foreign key violation (auth.users foreign key)
  if (
    message.includes('violates foreign key constraint') ||
    message.includes('trades_user_id_fkey') ||
    code === '23503'
  ) {
    return 'User ID tidak terdaftar dalam tabel otentikasi auth.users. Silakan logout lalu login kembali.';
  }

  // Schema cache / Column mismatch
  if (
    message.includes('schema cache') ||
    message.includes('could not find the') ||
    code === 'PGRST204'
  ) {
    return `Struktur kolom database tidak cocok: ${error.message}. Periksa skema tabel "trades" di Supabase.`;
  }

  // Check constraint violation (e.g. position Buy/Sell or outcome WIN/LOSS/BREAKEVEN)
  if (message.includes('violates check constraint') || code === '23514') {
    if (message.includes('trades_direction_check') || message.includes('direction')) {
      return 'Nilai arah transaksi tidak sesuai aturan database (hanya menerima "Buy" atau "Sell").';
    }
    return `Format data tidak sesuai dengan aturan tabel database: ${error.message}.`;
  }

  // Not-null constraint violation
  if (message.includes('violates not-null constraint') || code === '23502') {
    return `Field wajib tidak boleh bernilai kosong: ${error.message}.`;
  }

  // Network / server connection error
  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  ) {
    return 'Gagal terhubung ke database Supabase. Periksa koneksi internet Anda atau status project Supabase.';
  }

  // Session / JWT expired
  if (
    message.includes('jwt expired') ||
    message.includes('invalid claim') ||
    message.includes('auth session missing') ||
    code === 'PGRST301'
  ) {
    return 'Sesi login Anda telah kedaluwarsa. Silakan keluar dan masuk kembali.';
  }

  return error.message || 'Terjadi kesalahan saat memproses data di database Supabase.';
}

/**
 * Normalizes and strictly validates trade direction for Supabase database constraints.
 * The PostgreSQL table public.trades expects exact title case values: 'Buy' or 'Sell'.
 *
 * Supported user & form variations:
 * - Buy, BUY, Beli, Long -> 'Buy'
 * - Sell, SELL, Jual, Short -> 'Sell'
 *
 * Throws an explicit Error if input is empty, null, undefined, or unrecognized.
 * Will NEVER silently default invalid data.
 */
export function normalizeTradeDirection(input: unknown): 'Buy' | 'Sell' {
  if (input === null || input === undefined) {
    throw new Error('Arah transaksi (direction/posisi) wajib diisi.');
  }

  const rawStr = String(input).trim();
  if (rawStr === '') {
    throw new Error('Arah transaksi (direction/posisi) tidak boleh kosong.');
  }

  const lower = rawStr.toLowerCase();

  // Buy mappings: Buy, BUY, Beli, Long
  if (lower === 'buy' || lower === 'beli' || lower === 'long') {
    return 'Buy';
  }

  // Sell mappings: Sell, SELL, Jual, Short
  if (lower === 'sell' || lower === 'jual' || lower === 'short') {
    return 'Sell';
  }

  throw new Error(
    `Arah transaksi "${rawStr}" tidak valid. Sistem hanya menerima Buy (Beli/Long) atau Sell (Jual/Short).`
  );
}

/**
 * Maps a database direction value ('Buy', 'Sell', etc.) back to application TradePosition ('BUY' | 'SELL').
 * Case-insensitive and supports DB variations.
 */
export function mapDatabaseDirectionToApp(rawDirection: unknown): 'BUY' | 'SELL' {
  if (!rawDirection) return 'BUY';
  const str = String(rawDirection).trim().toLowerCase();
  if (str === 'sell' || str === 'jual' || str === 'short') {
    return 'SELL';
  }
  return 'BUY';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * In-memory registry mapping non-UUID local trade IDs (from [LocalID: ...])
 * to their actual primary key UUID in Supabase public.trades.
 * Ensures that any previously synced trade (even with a legacy >16-char ID)
 * retains its exact primary key UUID across updates, deletes, and re-syncs.
 */
const knownSyncedUuidByLocalId = new Map<string, string>();

export function registerKnownTradeUuid(localId: string, dbUuid: string): void {
  if (!localId || !dbUuid) return;
  const cleanLocal = String(localId).trim();
  const cleanUuid = String(dbUuid).trim().toLowerCase();
  if (cleanLocal && UUID_REGEX.test(cleanUuid)) {
    knownSyncedUuidByLocalId.set(cleanLocal, cleanUuid);
  }
}

export function unregisterKnownTradeUuid(localId: string): void {
  if (!localId) return;
  knownSyncedUuidByLocalId.delete(String(localId).trim());
}

export function clearKnownTradeUuids(): void {
  knownSyncedUuidByLocalId.clear();
}

/**
 * Legacy hex-based UUID generator used for standard short IDs (<= 16 chars, e.g. "TRD-123456", "DEMO-XAU-101").
 * Preserved 100% so existing short IDs statelessly map to the exact same UUID in Supabase.
 */
export function legacyAsciiEnsureValidUuid(clean: string): string {
  let hex = '';
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i).toString(16);
    hex += code.length === 1 ? '0' + code : code;
  }
  while (hex.length < 32) {
    hex += 'a';
  }
  hex = hex.slice(0, 32);

  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = '4' + hex.slice(13, 16);
  const p4 = '8' + hex.slice(17, 20);
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Full-string 128-bit deterministic UUID v4 generator for long non-UUID IDs (> 16 chars).
 * Incorporates every character of the input string so IDs sharing the same 16-character prefix
 * (e.g. "CSV-1746800000000-1" vs "CSV-1746800000000-2" or "XAUUSD-2026-10-28-001" vs "XAUUSD-2026-10-28-002")
 * never collide.
 */
function hashFullStringToUuidV4(clean: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b);
    h3 = Math.imul(h3 ^ (code ^ (i << 3)), 0xc2b2ae35);
    h4 = Math.imul(h4 ^ (code + i * 31), 0x27d4eb2f);
  }

  const mix32 = (h: number): number => {
    let x = h >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  };

  const w1 = mix32(h1 ^ h4).toString(16).padStart(8, '0');
  const w2 = mix32(h2 ^ h1).toString(16).padStart(8, '0');
  const w3 = mix32(h3 ^ h2).toString(16).padStart(8, '0');
  const w4 = mix32(h4 ^ h3).toString(16).padStart(8, '0');

  const rawHex = `${w1}${w2}${w3}${w4}`;
  const p1 = rawHex.slice(0, 8);
  const p2 = rawHex.slice(8, 12);
  const p3 = '4' + rawHex.slice(13, 16);
  const variantNibble = ((parseInt(rawHex[16], 16) & 0x3) | 0x8).toString(16);
  const p4 = variantNibble + rawHex.slice(17, 20);
  const p5 = rawHex.slice(20, 32);

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Ensures any trade ID is safely converted into a valid UUID format for PostgreSQL UUID column.
 * 1. If the ID is already a valid UUID, returns it as-is (lowercased).
 * 2. If the ID is already bound to an existing Supabase row UUID (via mapDatabaseRowToTrade),
 *    returns that exact bound UUID to preserve primary key compatibility.
 * 3. If the ID is <= 16 characters (e.g. "TRD-123456", "DEMO-XAU-101"), uses the legacy ASCII hex mapping
 *    so all existing standard IDs statelessly produce their original UUID.
 * 4. If the ID is > 16 characters and unbound, uses a 128-bit full-string deterministic hash so long IDs
 *    sharing the same prefix never collide.
 */
export function ensureValidUuid(id: string): string {
  if (!id) return '00000000-0000-4000-8000-000000000000';
  const clean = String(id).trim();
  if (!clean) return '00000000-0000-4000-8000-000000000000';

  if (UUID_REGEX.test(clean)) {
    return clean.toLowerCase();
  }

  const boundUuid = knownSyncedUuidByLocalId.get(clean);
  if (boundUuid) {
    return boundUuid;
  }

  if (clean.length <= 16) {
    return legacyAsciiEnsureValidUuid(clean);
  }

  return hashFullStringToUuidV4(clean);
}

/**
 * Parses a trade date/time value accurately:
 * - Local datetime-local strings without timezone offset ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm:ss")
 *   are interpreted in the user's local timezone.
 * - Database UTC / timezone-qualified strings ("...Z", "...+00:00", "...+00", "...+07:00")
 *   are parsed as exact instants in time.
 */
export function parseTradeDateTime(rawDate: unknown): Date | null {
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate;
  }
  if (typeof rawDate !== 'string') return null;

  const clean = rawDate.trim();
  if (!clean) return null;

  // Case 1: Date-only string "YYYY-MM-DD" -> interpret as local midnight
  const dateOnlyMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10) - 1;
    const day = parseInt(dateOnlyMatch[3], 10);
    const d = new Date(year, month, day, 0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Case 2: Local datetime string without timezone offset ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm[:ss[.SSS]]")
  const localMatch = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/
  );
  if (localMatch) {
    const year = parseInt(localMatch[1], 10);
    const month = parseInt(localMatch[2], 10) - 1;
    const day = parseInt(localMatch[3], 10);
    const hour = parseInt(localMatch[4], 10);
    const minute = parseInt(localMatch[5], 10);
    const second = localMatch[6] ? parseInt(localMatch[6], 10) : 0;
    const ms = localMatch[7] ? parseInt(localMatch[7].slice(0, 3).padEnd(3, '0'), 10) : 0;
    const d = new Date(year, month, day, hour, minute, second, ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // Case 3: Timezone-qualified timestamp from Postgres / ISO 8601 (e.g. "2025-05-09 20:30:00+00" or "2025-05-09T20:30:00.000Z")
  let normalizedIso = clean.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
  normalizedIso = normalizedIso.replace(/([+-]\d{2})$/, '$1:00');
  normalizedIso = normalizedIso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

  const parsed = new Date(normalizedIso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a Date or timestamp string (including UTC timestamps from Supabase TIMESTAMPTZ)
 * into the local "YYYY-MM-DDTHH:mm" format required by <input type="datetime-local" />,
 * TradeTable, Analytics date filter, and PerformanceCalendar.
 * Preserves the exact instant in time instead of slicing UTC ISO strings.
 */
export function normalizeTradeDateTimeLocal(rawDate: unknown): string {
  const parsed = parseTradeDateTime(rawDate);
  const d = parsed || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts an application trade.dateTime (typically local "YYYY-MM-DDTHH:mm")
 * into an explicit UTC ISO 8601 timestamp string for PostgreSQL TIMESTAMPTZ column.
 */
export function formatTradeDateTimeForDatabase(rawDate: unknown): string {
  const parsed = parseTradeDateTime(rawDate);
  if (parsed) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Maps an application Trade object to the exact database columns of public.trades
 * Columns in user database: id (UUID), user_id (UUID), trade_date (TIMESTAMPTZ),
 * instrument (TEXT), direction (TEXT), setup (TEXT), entry_price (NUMERIC),
 * stop_loss (NUMERIC), take_profit (NUMERIC), exit_price (NUMERIC), lot_size (NUMERIC),
 * outcome (TEXT), net_pnl (NUMERIC), commission (NUMERIC), swap (NUMERIC),
 * screenshot_url (TEXT), notes (TEXT), trading_session (TEXT), created_at, updated_at
 */
export function mapTradeToDatabasePayload(trade: Trade, userId: string) {
  const dbUuid = ensureValidUuid(trade.id);

  // Format trade_date properly for Postgres TIMESTAMPTZ preserving the exact local instant
  const formattedTradeDate = formatTradeDateTimeForDatabase(trade.dateTime);

  // Validate and normalize direction ('Buy' | 'Sell') strictly matching trades_direction_check
  const direction: 'Buy' | 'Sell' = normalizeTradeDirection(trade.position);

  // Validate outcome strictly from normalized Net Profit ($0.01 threshold)
  const normalizedNetPnl = computeTradeNetProfit(trade);
  const normalizedComm = Math.abs(Number(trade.commission) || 0);
  const normalizedSwp = Number(trade.swap) || 0;
  const outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' = classifyNetProfitOutcome(normalizedNetPnl);

  // Preserve local non-UUID ID and extra app attributes inside notes
  const metaObj: Record<string, any> = {};
  if (trade.riskAmount) metaObj.riskAmount = trade.riskAmount;
  if (trade.riskPercentage) metaObj.riskPercentage = trade.riskPercentage;
  const realizedR = computeRealizedRMultiple(trade);
  if (realizedR !== null) metaObj.rMultiple = realizedR;
  if (trade.disciplineRating !== undefined && trade.disciplineRating !== null) metaObj.disciplineRating = trade.disciplineRating;
  if (isDemoTrade(trade)) metaObj.isDemo = true;

  let combinedNotes = trade.notes ? trade.notes.trim() : '';
  if (trade.id !== dbUuid) {
    // Strip existing [LocalID: ...] tags to avoid repetitive duplication
    combinedNotes = combinedNotes.replace(/\[LocalID:\s*[^\]]+\]\s*/g, '').trim();
    combinedNotes = `[LocalID: ${trade.id}] ${combinedNotes}`.trim();
  }
  if (Object.keys(metaObj).length > 0) {
    // Strip existing [Meta: ...] tags to avoid repetitive duplication
    combinedNotes = combinedNotes.replace(/\[Meta:\s*\{[^}]*\}\]\s*/g, '').trim();
    combinedNotes = `${combinedNotes} [Meta: ${JSON.stringify(metaObj)}]`.trim();
  }

  const rawScreenshotUrl = trade.screenshotUrl ? String(trade.screenshotUrl).trim() : '';
  if (rawScreenshotUrl.startsWith('data:image/')) {
    throw new Error(
      `Screenshot untuk transaksi "${trade.id}" masih berupa Base64 dan harus diunggah ke Supabase Storage terlebih dahulu sebelum disimpan ke database.`
    );
  }

  return {
    id: dbUuid,
    user_id: userId,
    trade_date: formattedTradeDate, // EXACT COLUMN in public.trades
    instrument: (trade.instrument || 'XAUUSD').toUpperCase().trim(),
    direction, // maps from trade.position
    setup: (trade.strategy || 'Umum').trim(), // maps from trade.strategy
    entry_price: Number(trade.entryPrice) || 0,
    stop_loss:
      trade.stopLoss !== undefined && trade.stopLoss !== null && !isNaN(Number(trade.stopLoss))
        ? Number(trade.stopLoss)
        : 0,
    take_profit:
      trade.takeProfit !== undefined && trade.takeProfit !== null && !isNaN(Number(trade.takeProfit))
        ? Number(trade.takeProfit)
        : 0,
    exit_price:
      trade.exitPrice !== undefined && trade.exitPrice !== null && !isNaN(Number(trade.exitPrice))
        ? Number(trade.exitPrice)
        : null,
    lot_size: Number(trade.lotSize) || 0.01,
    outcome,
    net_pnl: normalizedNetPnl, // maps from trade.netProfit
    commission: normalizedComm,
    swap: normalizedSwp,
    screenshot_url: rawScreenshotUrl ? rawScreenshotUrl : null,
    notes: combinedNotes ? combinedNotes : null,
    trading_session: (trade.session || 'London').trim(), // maps from trade.session
    created_at: trade.createdAt ? new Date(trade.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Maps a database row from public.trades back into an application Trade object
 */
export function mapDatabaseRowToTrade(row: any): Trade {
  // Extract local ID from notes tag if present, e.g. [LocalID: TRD-123456]
  let displayId = String(row.id);
  let cleanNotes = row.notes ? String(row.notes) : undefined;
  if (cleanNotes) {
    const match = cleanNotes.match(/\[LocalID:\s*([^\]]+)\]/);
    if (match && match[1]) {
      displayId = match[1].trim();
      cleanNotes = cleanNotes.replace(/\[LocalID:\s*[^\]]+\]\s*/, '').trim() || undefined;
    }
  }

  // Bind displayId to the actual row.id UUID from Supabase so existing rows
  // (including legacy long IDs) always keep their exact database primary key
  if (row?.id && displayId) {
    registerKnownTradeUuid(displayId, String(row.id));
  }

  // Extract extra metadata if stored in notes tag (e.g. riskAmount, rMultiple, disciplineRating, isDemo)
  let riskAmount = 0;
  let riskPercentage = 1;
  let rMultiple: number | undefined = undefined;
  let disciplineRating: number | undefined = undefined;
  let isDemo = false;

  if (cleanNotes) {
    const metaMatch = cleanNotes.match(/\[Meta:\s*([^\]]+)\]/);
    if (metaMatch && metaMatch[1]) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        if (meta.riskAmount !== undefined) riskAmount = Number(meta.riskAmount);
        if (meta.riskPercentage !== undefined) riskPercentage = Number(meta.riskPercentage);
        if (meta.rMultiple !== undefined) rMultiple = Number(meta.rMultiple);
        if (meta.disciplineRating !== undefined) disciplineRating = Number(meta.disciplineRating);
        if (meta.isDemo !== undefined) isDemo = Boolean(meta.isDemo);
        cleanNotes = cleanNotes.replace(/\[Meta:\s*[^\]]+\]\s*/, '').trim() || undefined;
      } catch {
        // ignore parse issue
      }
    }
  }
  if (isDemoTrade({ id: displayId, isDemo })) {
    isDemo = true;
  }

  const rawNet = Number(row.net_pnl !== undefined ? row.net_pnl : row.net_profit) || 0;
  const netPnl = Number(rawNet.toFixed(2));
  const commission = Math.abs(Number(row.commission) || 0);
  const swap = Number(row.swap) || 0;
  const grossProfit = computeGrossFromNet(netPnl, commission, swap);

  const resolvedR = computeRealizedRMultiple({
    netProfit: netPnl,
    grossProfit,
    commission,
    swap,
    riskAmount,
    rMultiple,
  });
  rMultiple = resolvedR !== null ? resolvedR : undefined;

  const position: 'BUY' | 'SELL' = mapDatabaseDirectionToApp(row.direction || row.position);
  const strategy = String(row.setup || row.strategy || 'Umum');
  const session = row.trading_session || row.session || 'London';
  const rawDateStr = row.trade_date || row.date_time || row.created_at || new Date();
  const dateStr = normalizeTradeDateTimeLocal(rawDateStr);

  return {
    id: displayId,
    dateTime: dateStr,
    instrument: row.instrument || 'XAUUSD',
    position,
    strategy,
    session,
    entryPrice: Number(row.entry_price) || 0,
    stopLoss:
      row.stop_loss !== null && row.stop_loss !== undefined && Number(row.stop_loss) > 0
        ? Number(row.stop_loss)
        : undefined,
    takeProfit:
      row.take_profit !== null && row.take_profit !== undefined && Number(row.take_profit) > 0
        ? Number(row.take_profit)
        : undefined,
    exitPrice:
      row.exit_price !== null && row.exit_price !== undefined && Number(row.exit_price) > 0
        ? Number(row.exit_price)
        : undefined,
    lotSize: Number(row.lot_size) || 0.01,
    riskAmount,
    riskPercentage,
    outcome: classifyNetProfitOutcome(netPnl),
    grossProfit,
    commission,
    swap,
    netProfit: netPnl,
    rMultiple,
    screenshotUrl: row.screenshot_url || undefined,
    notes: cleanNotes,
    disciplineRating,
    isDemo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all trades belonging to the authenticated user from Supabase.
 * Strictly filters by authenticated user_id and ensures complete deduplication.
 */
export async function fetchTradesFromSupabase(userId: string): Promise<SyncResult<Trade[]>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client belum terkonfigurasi.' };
  }

  if (!userId) {
    return { success: false, error: 'User ID tidak valid. Silakan login terlebih dahulu.' };
  }

  try {
    const { data, error } = await client
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: false });

    if (error) {
      console.error('Supabase fetch trades error:', error);
      return { success: false, error: translateDatabaseError(error) };
    }

    const rawRows = data || [];
    const seenIds = new Set<string>();
    const deduplicatedTrades: Trade[] = [];

    for (const row of rawRows) {
      const trade = mapDatabaseRowToTrade(row);
      // Ensure zero duplicate trade IDs are loaded into the journal
      if (!seenIds.has(trade.id)) {
        seenIds.add(trade.id);
        deduplicatedTrades.push(trade);
      }
    }

    return { success: true, data: deduplicatedTrades };
  } catch (err: any) {
    console.error('Unexpected error in fetchTradesFromSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Update an existing trade in Supabase public.trades table.
 * Strictly uses .update(...) filtered by id and authenticated user_id,
 * and verifies that the database returned the updated row.
 */
export async function updateTradeInSupabase(
  trade: Trade,
  userId: string,
  originalId?: string
): Promise<SyncResult<Trade>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia. Periksa konfigurasi URL dan Key.' };
  }

  if (!userId) {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk memperbarui database cloud.' };
  }

  try {
    const targetId = originalId || trade.id;
    const targetUuid = ensureValidUuid(targetId);

    // Ensure Base64 screenshot is uploaded to Supabase Storage before building DB payload
    const screenshotSync = await ensureTradeScreenshotSynced(trade, userId);
    if (!screenshotSync.success || !screenshotSync.data) {
      return {
        success: false,
        error:
          screenshotSync.error ||
          `Gagal mengunggah screenshot untuk transaksi "${trade.id}" ke Supabase Storage.`,
      };
    }
    const tradeWithSyncedScreenshot = screenshotSync.data.trade;

    // Map trade to database columns
    const fullPayload = mapTradeToDatabasePayload(tradeWithSyncedScreenshot, userId);

    // Prepare fields to update (exclude created_at, update updated_at timestamp)
    const updatePayload: Record<string, any> = {
      trade_date: fullPayload.trade_date,
      instrument: fullPayload.instrument,
      direction: fullPayload.direction,
      setup: fullPayload.setup,
      entry_price: fullPayload.entry_price,
      stop_loss: fullPayload.stop_loss,
      take_profit: fullPayload.take_profit,
      exit_price: fullPayload.exit_price,
      lot_size: fullPayload.lot_size,
      outcome: fullPayload.outcome,
      net_pnl: fullPayload.net_pnl,
      commission: fullPayload.commission,
      swap: fullPayload.swap,
      screenshot_url: fullPayload.screenshot_url,
      notes: fullPayload.notes,
      trading_session: fullPayload.trading_session,
      updated_at: new Date().toISOString(),
    };

    // If ID was changed in form, update the primary key id column as well
    if (originalId && originalId !== trade.id) {
      updatePayload.id = ensureValidUuid(trade.id);
    }

    // Execute .update(...) with exact target ID and user_id filters
    // RLS policy: (auth.uid() = user_id)
    const { data, error } = await client
      .from('trades')
      .update(updatePayload)
      .eq('id', targetUuid)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Supabase update trade error:', error);
      return { success: false, error: translateDatabaseError(error) };
    }

    // Verify database result: Ensure at least 1 existing row was actually updated
    if (!data || data.length === 0) {
      return {
        success: false,
        error: `Gagal memperbarui transaksi: baris dengan ID "${targetId}" tidak ditemukan di database cloud atau Anda tidak memiliki hak akses (RLS).`,
      };
    }

    if (originalId && originalId !== trade.id) {
      unregisterKnownTradeUuid(originalId);
    }
    const updatedTrade = mapDatabaseRowToTrade(data[0]);
    return { success: true, data: updatedTrade };
  } catch (err: any) {
    console.error('Unexpected error in updateTradeInSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Insert a brand new trade into Supabase public.trades table.
 * Strictly uses .insert(...) and verifies that the new row was created.
 */
export async function insertTradeToSupabase(
  trade: Trade,
  userId: string
): Promise<SyncResult<Trade>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia. Periksa konfigurasi URL dan Key.' };
  }

  if (!userId) {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk mencatat transaksi cloud.' };
  }

  try {
    // Ensure Base64 screenshot is uploaded to Supabase Storage before building DB payload
    const screenshotSync = await ensureTradeScreenshotSynced(trade, userId);
    if (!screenshotSync.success || !screenshotSync.data) {
      return {
        success: false,
        error:
          screenshotSync.error ||
          `Gagal mengunggah screenshot untuk transaksi "${trade.id}" ke Supabase Storage.`,
      };
    }
    const tradeWithSyncedScreenshot = screenshotSync.data.trade;

    const payload = mapTradeToDatabasePayload(tradeWithSyncedScreenshot, userId);

    const { data, error } = await client
      .from('trades')
      .insert(payload)
      .select();

    if (error) {
      console.error('Supabase insert trade error:', error);
      return { success: false, error: translateDatabaseError(error) };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Database tidak mengembalikan data transaksi baru yang disimpan.',
      };
    }

    const insertedTrade = mapDatabaseRowToTrade(data[0]);
    return { success: true, data: insertedTrade };
  } catch (err: any) {
    console.error('Unexpected error in insertTradeToSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Save or update a trade in Supabase.
 * If originalId is specified, performs an explicit .update(...) on the existing row.
 * Otherwise, performs an .insert(...) for the new trade.
 */
export async function saveTradeToSupabase(
  trade: Trade,
  userId: string,
  originalId?: string
): Promise<SyncResult<Trade>> {
  if (originalId) {
    return updateTradeInSupabase(trade, userId, originalId);
  }
  return insertTradeToSupabase(trade, userId);
}

/**
 * Idempotently upsert a trade into Supabase public.trades table using verified session userId.
 * - If the trade contains a Base64 screenshot ('data:image/...'), uploads it to Supabase Storage first.
 * - If screenshot upload fails, aborts before writing to public.trades so Base64 is never stored in DB
 *   and the trade is not falsely marked as synced.
 * - If the row ID already exists for this user, updates the record in-place.
 * - If the row ID is new, inserts the record.
 */
export async function upsertTradeToSupabase(
  trade: Trade,
  userId: string
): Promise<SyncResult<Trade>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia. Periksa konfigurasi URL dan Key.' };
  }

  if (!userId) {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk menyinkronkan transaksi.' };
  }

  try {
    // Step 1: Ensure Base64 screenshot is uploaded to Supabase Storage first
    const screenshotSync = await ensureTradeScreenshotSynced(trade, userId);
    if (!screenshotSync.success || !screenshotSync.data) {
      return {
        success: false,
        error:
          screenshotSync.error ||
          `Gagal mengunggah screenshot untuk transaksi "${trade.id}" ke Supabase Storage.`,
      };
    }
    const tradeWithSyncedScreenshot = screenshotSync.data.trade;

    // Step 2: Map to DB payload (which strictly rejects raw Base64) and upsert
    const payload = mapTradeToDatabasePayload(tradeWithSyncedScreenshot, userId);

    const { data, error } = await client
      .from('trades')
      .upsert(payload, { onConflict: 'id' })
      .select();

    if (error) {
      console.error('Supabase upsert trade error:', error);
      return { success: false, error: translateDatabaseError(error) };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Database tidak mengembalikan data transaksi yang disimpan.',
      };
    }

    const savedTrade = mapDatabaseRowToTrade(data[0]);
    return { success: true, data: savedTrade };
  } catch (err: any) {
    console.error('Unexpected error in upsertTradeToSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Delete trade from Supabase (enforcing authenticated user_id and verifying result)
 */
export async function deleteTradeFromSupabase(tradeId: string, userId: string): Promise<SyncResult> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia.' };
  }

  if (!userId) {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk menghapus dari database cloud.' };
  }

  try {
    const dbUuid = ensureValidUuid(tradeId);
    const { data, error } = await client
      .from('trades')
      .delete()
      .eq('id', dbUuid)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Supabase delete trade error:', error);
      return { success: false, error: translateDatabaseError(error) };
    }

    // Verify database result: Ensure at least 1 existing row was actually deleted
    if (!data || data.length === 0) {
      return {
        success: false,
        error: `Transaksi "${tradeId}" tidak ditemukan di database cloud atau Anda tidak memiliki izin akses (RLS).`,
      };
    }

    unregisterKnownTradeUuid(tradeId);
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected error in deleteTradeFromSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Strict validator for Supabase Storage paths:
 * Pattern: <userId>/<filename>.<ext>
 * Disallows data URLs (Base64) and external HTTP(S) links.
 */
export function isStoragePath(path: unknown): path is string {
  if (!path || typeof path !== 'string') return false;
  const clean = path.trim();
  if (
    clean.startsWith('data:image/') ||
    clean.startsWith('http://') ||
    clean.startsWith('https://')
  ) {
    return false;
  }
  // Must match <userId>/<tradeId>_<timestamp>.jpg pattern
  const STORAGE_PATH_REGEX = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/i;
  return STORAGE_PATH_REGEX.test(clean);
}

/**
 * Shared in-memory cache mapping (userId, tradeId, Base64 signature) -> uploaded Supabase Storage path.
 * Prevents duplicate uploads when a database write fails after the screenshot was already uploaded
 * and the user retries (compatible across TradeForm save, local migration, and JSON backup restore).
 */
const screenshotUploadCache = new Map<string, string>();

/**
 * Bounded in-memory cache mapping storagePath -> Base64 Data URL ('data:image/...;base64,...').
 * Allows:
 * 1. Re-uploading a screenshot if a user deletes a trade (which removes the Storage object) and
 *    subsequently restores a legacy JSON backup that only stored the relative storage path.
 * 2. Embedding self-contained Base64 screenshots when exporting a JSON backup while logged into Cloud
 *    without redundant network downloads.
 */
const MAX_BASE64_PATH_CACHE_ENTRIES = 50;
const base64ByStoragePathCache = new Map<string, string>();

export function getCachedBase64ForStoragePath(
  storagePath: string,
  expectedUserId?: string | null
): string | undefined {
  if (!storagePath || typeof storagePath !== 'string') return undefined;
  const cleanPath = storagePath.trim();
  if (expectedUserId && typeof expectedUserId === 'string' && expectedUserId.trim() !== '') {
    const cleanExpectedUser = expectedUserId.trim();
    const pathOwnerId = cleanPath.split('/')[0];
    if (pathOwnerId && pathOwnerId !== cleanExpectedUser) {
      return undefined;
    }
  }
  return base64ByStoragePathCache.get(cleanPath);
}

export function setCachedBase64ForStoragePath(storagePath: string, base64DataUrl: string): void {
  if (!storagePath || !base64DataUrl) return;
  const cleanPath = storagePath.trim();
  const cleanDataUrl = base64DataUrl.trim();
  if (!isStoragePath(cleanPath) || !cleanDataUrl.startsWith('data:image/')) return;

  if (!base64ByStoragePathCache.has(cleanPath) && base64ByStoragePathCache.size >= MAX_BASE64_PATH_CACHE_ENTRIES) {
    const oldestKey = base64ByStoragePathCache.keys().next().value;
    if (oldestKey) {
      base64ByStoragePathCache.delete(oldestKey);
    }
  }
  base64ByStoragePathCache.set(cleanPath, cleanDataUrl);
}

export function buildScreenshotUploadCacheKey(
  userId: string,
  tradeId: string,
  base64DataUrl: string
): string {
  const cleanUser = String(userId).trim();
  const cleanTrade = String(tradeId).trim();
  const raw = String(base64DataUrl).trim();
  return `${cleanUser}::${cleanTrade}::${raw.length}::${raw.slice(0, 64)}::${raw.slice(-64)}`;
}

export function getCachedUploadedScreenshotPath(
  userId: string,
  tradeId: string,
  base64DataUrl: string
): string | undefined {
  if (!userId || !tradeId || !base64DataUrl) return undefined;
  return screenshotUploadCache.get(buildScreenshotUploadCacheKey(userId, tradeId, base64DataUrl));
}

export function setCachedUploadedScreenshotPath(
  userId: string,
  tradeId: string,
  base64DataUrl: string,
  storagePath: string
): void {
  if (!userId || !tradeId || !base64DataUrl || !storagePath) return;
  if (isStoragePath(storagePath)) {
    const cleanPath = storagePath.trim();
    screenshotUploadCache.set(
      buildScreenshotUploadCacheKey(userId, tradeId, base64DataUrl),
      cleanPath
    );
    setCachedBase64ForStoragePath(cleanPath, base64DataUrl);
  }
}

/**
 * Evicts any cached upload entries pointing to a storage path that has been deleted or invalidated.
 */
export function evictScreenshotUploadCacheByPath(storagePath: string): void {
  if (!storagePath || typeof storagePath !== 'string') return;
  const target = storagePath.trim();
  if (!target) return;
  for (const [key, val] of screenshotUploadCache.entries()) {
    if (val === target) {
      screenshotUploadCache.delete(key);
    }
  }
}

export function clearScreenshotUploadCache(): void {
  screenshotUploadCache.clear();
  base64ByStoragePathCache.clear();
}

/**
 * Clears all in-memory session caches (uploaded screenshot paths, Base64 path cache, and bound trade UUIDs).
 * Must be called on logout or when switching between user accounts to prevent cross-account cache leakage.
 */
export function clearSessionSyncCaches(): void {
  clearScreenshotUploadCache();
  clearKnownTradeUuids();
}

/**
 * Converts a Blob into a normalized 'data:image/...;base64,...' string.
 * Compatible with both browser (FileReader) and Node/test environments (arrayBuffer).
 */
export async function encodeBlobToBase64DataUrl(
  blob: Blob,
  fallbackMime = 'image/jpeg'
): Promise<string | null> {
  if (!blob || !(blob instanceof Blob)) return null;
  const mime = blob.type && blob.type.startsWith('image/') ? blob.type : fallbackMime;

  try {
    if (typeof FileReader !== 'undefined') {
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            let res = reader.result;
            if (!res.startsWith('data:image/')) {
              const commaIdx = res.indexOf(',');
              const b64 = commaIdx !== -1 ? res.slice(commaIdx + 1) : res;
              res = `data:${mime};base64,${b64}`;
            }
            resolve(res);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Verifies whether a private storage object path exists and is accessible by the active session.
 */
async function verifyStorageObjectAccessible(filePath: string): Promise<boolean> {
  if (!filePath || !isStoragePath(filePath)) return false;
  const client = getSupabase();
  if (!client) return false;

  const cleanPath = filePath.trim();
  try {
    const { data, error } = await client.storage
      .from('trade-screenshots')
      .createSignedUrl(cleanPath, 60);

    if (!error && data?.signedUrl) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Decodes a Base64 Data URL ('data:image/...;base64,...') into a typed Blob and file extension
 * without relying on network fetch().
 */
export function decodeBase64DataUrlToBlob(
  base64DataUrl: string
): { success: boolean; blob?: Blob; contentType?: string; ext?: 'jpg' | 'png' | 'webp'; error?: string } {
  if (!base64DataUrl || typeof base64DataUrl !== 'string') {
    return { success: false, error: 'Data gambar Base64 tidak valid.' };
  }
  const trimmed = base64DataUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
  if (!match) {
    return { success: false, error: 'Format Data URL Base64 gambar tidak dikenali.' };
  }

  const rawMime = match[1].toLowerCase();
  const base64Payload = match[2].replace(/\s+/g, '');
  if (!base64Payload) {
    return { success: false, error: 'Isi data gambar Base64 kosong.' };
  }

  try {
    const binaryStr = atob(base64Payload);
    if (binaryStr.length === 0) {
      return { success: false, error: 'Data biner gambar Base64 kosong (0 byte).' };
    }
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let ext: 'jpg' | 'png' | 'webp' = 'jpg';
    let contentType = 'image/jpeg';
    if (rawMime.includes('png')) {
      ext = 'png';
      contentType = 'image/png';
    } else if (rawMime.includes('webp')) {
      ext = 'webp';
      contentType = 'image/webp';
    }

    const blob = new Blob([bytes], { type: contentType });
    return { success: true, blob, contentType, ext };
  } catch {
    return { success: false, error: 'Data Base64 gambar rusak dan tidak dapat didekode.' };
  }
}

/**
 * Uploads a Base64 screenshot to the private Supabase Storage bucket ('trade-screenshots')
 * and returns the relative object path: "<userId>/<tradeId>_<timestamp>_<suffix>.<ext>".
 * Does NOT return a public URL or Base64.
 * Reuses cached storage path ONLY if the exact same Base64 image for the same user & trade
 * is cached AND still exists in Supabase Storage.
 */
export async function uploadScreenshotToSupabase(
  base64DataUrl: string,
  tradeId: string,
  userId: string
): Promise<SyncResult<string>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia. Periksa konfigurasi URL dan Key.' };
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk mengunggah screenshot.' };
  }

  if (!base64DataUrl || typeof base64DataUrl !== 'string') {
    return { success: false, error: 'Data gambar tidak valid.' };
  }

  const trimmedUrl = base64DataUrl.trim();
  const cleanUserId = userId.trim();

  // If not a Base64 data URL (e.g. already a valid storage path or external URL), do not re-upload
  if (!trimmedUrl.startsWith('data:image/')) {
    return { success: true, data: trimmedUrl };
  }

  // Check shared upload cache first to prevent duplicate uploads on retry
  const cachedPath = getCachedUploadedScreenshotPath(cleanUserId, tradeId, trimmedUrl);
  if (cachedPath && cachedPath.startsWith(`${cleanUserId}/`)) {
    const stillExists = await verifyStorageObjectAccessible(cachedPath);
    if (stillExists) {
      setCachedBase64ForStoragePath(cachedPath, trimmedUrl);
      return { success: true, data: cachedPath };
    }
    // Cached object was deleted from Storage; evict stale cache entry and re-upload
    evictScreenshotUploadCacheByPath(cachedPath);
  }

  try {
    const decoded = decodeBase64DataUrlToBlob(trimmedUrl);
    if (!decoded.success || !decoded.blob || !decoded.contentType || !decoded.ext) {
      return { success: false, error: decoded.error || 'Gagal memproses data gambar Base64.' };
    }

    const cleanTradeId = String(tradeId).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'trade';
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filePath = `${cleanUserId}/${cleanTradeId}_${Date.now()}_${randomSuffix}.${decoded.ext}`;

    const { error: uploadError } = await client.storage
      .from('trade-screenshots')
      .upload(filePath, decoded.blob, {
        contentType: decoded.contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return { success: false, error: translateDatabaseError(uploadError) };
    }

    // Cache and return the relative storage object path (NOT public URL and NOT base64)
    setCachedUploadedScreenshotPath(cleanUserId, tradeId, trimmedUrl, filePath);
    return { success: true, data: filePath };
  } catch (err: any) {
    console.error('Unexpected error in uploadScreenshotToSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

/**
 * Ensures a trade's screenshotUrl is synced to Supabase Storage before saving to public.trades:
 * - If screenshotUrl is empty or an external HTTP(S) URL: returns as-is without uploading.
 * - If screenshotUrl is a Storage path ('<userId>/<file>.<ext>'):
 *   - If accessible in Storage under active userId, preserves the path without re-uploading.
 *   - If the object was deleted from Storage (or belonged to another user) and its Base64 data
 *     is available in base64ByStoragePathCache, automatically re-uploads it to Storage under userId.
 * - If screenshotUrl is a Base64 Data URL ('data:image/...'): uploads to Supabase Storage (or reuses
 *   verified cached path) and returns a cloned Trade with screenshotUrl set to the storage path.
 * - If upload fails: returns { success: false, error } without mutating or deleting the source trade's screenshotUrl.
 */
export async function ensureTradeScreenshotSynced(
  trade: Trade,
  userId: string
): Promise<SyncResult<{ trade: Trade; uploadedStoragePath?: string; wasUploaded: boolean }>> {
  const rawRef = trade.screenshotUrl ? String(trade.screenshotUrl).trim() : '';
  if (!rawRef) {
    return {
      success: true,
      data: {
        trade: { ...trade, screenshotUrl: undefined },
        wasUploaded: false,
      },
    };
  }

  const cleanUserId = userId.trim();

  // Handle existing storage paths (e.g. from cloud trades or JSON backup restore)
  if (!rawRef.startsWith('data:image/')) {
    if (isStoragePath(rawRef)) {
      const isOwnedByActiveUser = rawRef.startsWith(`${cleanUserId}/`);
      const isAccessible = isOwnedByActiveUser ? await verifyStorageObjectAccessible(rawRef) : false;

      if (isAccessible) {
        return {
          success: true,
          data: {
            trade: { ...trade, screenshotUrl: rawRef },
            wasUploaded: false,
          },
        };
      }

      // Object is missing in Storage (e.g. deleted before restoring JSON backup) or from another user:
      // Check if we have its Base64 image data cached in memory to re-upload cleanly
      const cachedBase64 = getCachedBase64ForStoragePath(rawRef);
      if (cachedBase64) {
        evictScreenshotUploadCacheByPath(rawRef);
        const reuploadRes = await uploadScreenshotToSupabase(cachedBase64, trade.id, cleanUserId);
        if (!reuploadRes.success || !reuploadRes.data) {
          return {
            success: false,
            error:
              reuploadRes.error ||
              `Gagal mengunggah ulang screenshot untuk transaksi "${trade.id}" ke Supabase Storage.`,
          };
        }
        return {
          success: true,
          data: {
            trade: { ...trade, screenshotUrl: reuploadRes.data },
            uploadedStoragePath: reuploadRes.data,
            wasUploaded: true,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        trade: { ...trade, screenshotUrl: rawRef },
        wasUploaded: false,
      },
    };
  }

  const existingCachedPath = getCachedUploadedScreenshotPath(cleanUserId, trade.id, rawRef);
  const wasAlreadyCached = Boolean(
    existingCachedPath &&
      existingCachedPath.startsWith(`${cleanUserId}/`) &&
      (await verifyStorageObjectAccessible(existingCachedPath))
  );

  const uploadRes = await uploadScreenshotToSupabase(rawRef, trade.id, cleanUserId);
  if (!uploadRes.success || !uploadRes.data) {
    return {
      success: false,
      error:
        uploadRes.error ||
        `Gagal mengunggah screenshot untuk transaksi "${trade.id}" ke Supabase Storage.`,
    };
  }

  return {
    success: true,
    data: {
      trade: {
        ...trade,
        screenshotUrl: uploadRes.data,
      },
      uploadedStoragePath: uploadRes.data,
      wasUploaded: !wasAlreadyCached,
    },
  };
}

/**
 * Uploads a raw Blob screenshot to the private Supabase Storage bucket ('trade-screenshots')
 * under the active authenticated user's directory: "<userId>/<tradeId>_<timestamp>_<random>.<ext>".
 * Strictly uses the active user's ID and never trusts user IDs or paths from external backups.
 */
export async function uploadScreenshotBlobToSupabase(
  blob: Blob,
  tradeId: string,
  userId: string,
  preferredExt?: string
): Promise<SyncResult<string>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia. Periksa konfigurasi URL dan Key.' };
  }
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk mengunggah screenshot.' };
  }
  if (!blob || !(blob instanceof Blob)) {
    return { success: false, error: 'File gambar Blob tidak valid.' };
  }

  try {
    const cleanTradeId = String(tradeId).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'trade';
    const cleanExt = (preferredExt || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filePath = `${userId.trim()}/${cleanTradeId}_${Date.now()}_${randomSuffix}.${cleanExt}`;

    let contentType = blob.type;
    if (!contentType || contentType === 'application/octet-stream' || !contentType.startsWith('image/')) {
      if (cleanExt === 'png') contentType = 'image/png';
      else if (cleanExt === 'webp') contentType = 'image/webp';
      else contentType = 'image/jpeg';
    }

    // CRITICAL: Ensure the Blob instance itself has the detected image contentType
    // to prevent Supabase Storage from rejecting it as application/octet-stream
    const typedBlob = blob.type === contentType ? blob : new Blob([blob], { type: contentType });

    const { error: uploadError } = await client.storage
      .from('trade-screenshots')
      .upload(filePath, typedBlob, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage blob upload error:', uploadError);
      return { success: false, error: translateDatabaseError(uploadError) };
    }

    encodeBlobToBase64DataUrl(typedBlob, contentType)
      .then((b64) => {
        if (b64) setCachedBase64ForStoragePath(filePath, b64);
      })
      .catch(() => {});

    return { success: true, data: filePath };
  } catch (err: any) {
    console.error('Unexpected error in uploadScreenshotBlobToSupabase:', err);
    return { success: false, error: translateDatabaseError(err) };
  }
}

export interface SignedUrlDiagnosticResult {
  url: string | null;
  errorReason?: 'invalid_path' | 'not_authenticated' | 'wrong_user_folder' | 'not_found' | 'storage_error';
  errorMessage?: string;
}

/**
 * Resolves a displayable URL (signed URL or authenticated download Data URL fallback)
 * for a private storage path, along with accurate diagnostic information if loading fails.
 */
export async function resolveScreenshotSignedUrlWithDiagnostics(
  filePath: string,
  expiresIn = 3600
): Promise<SignedUrlDiagnosticResult> {
  if (!filePath || !isStoragePath(filePath)) {
    return {
      url: null,
      errorReason: 'invalid_path',
      errorMessage: 'Format tautan screenshot tidak dikenali.',
    };
  }

  const cleanPath = filePath.trim();
  const pathOwnerId = cleanPath.split('/')[0];
  const client = getSupabase();
  if (!client) {
    const cachedFallback = getCachedBase64ForStoragePath(cleanPath);
    if (cachedFallback) {
      return { url: cachedFallback };
    }
    return {
      url: null,
      errorReason: 'not_authenticated',
      errorMessage: 'Gagal memuat screenshot dari Storage privat. Pastikan sesi login aktif.',
    };
  }

  let activeUserId: string | null = null;
  let hasSessionCheck = false;
  try {
    if (client.auth && typeof client.auth.getSession === 'function') {
      hasSessionCheck = true;
      const { data: sessionData } = await client.auth.getSession();
      activeUserId = sessionData?.session?.user?.id || null;
    }
  } catch {
    // continue to storage call even if getSession is unavailable in mock tests
  }

  // Strictly block cross-account access if activeUserId belongs to a different user than pathOwnerId
  if (activeUserId && pathOwnerId && pathOwnerId !== activeUserId) {
    return {
      url: null,
      errorReason: 'wrong_user_folder',
      errorMessage:
        'Gagal memuat screenshot: Path gambar berasal dari folder akun pengguna lain dan dibatasi oleh privasi Storage.',
    };
  }

  const canUseMemoryCacheFallback =
    !hasSessionCheck || (Boolean(activeUserId) && pathOwnerId === activeUserId);

  try {
    // 1. Primary path: create temporary signed URL via Supabase Storage
    const { data, error } = await client.storage
      .from('trade-screenshots')
      .createSignedUrl(cleanPath, expiresIn);

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl };
    }

    // 2. Fallback path: try authenticated blob download (in case signed URL endpoint failed transiently)
    try {
      if (typeof client.storage.from('trade-screenshots').download === 'function') {
        const { data: blobData, error: dlError } = await client.storage
          .from('trade-screenshots')
          .download(cleanPath);
        if (!dlError && blobData) {
          const dataUrl = await encodeBlobToBase64DataUrl(blobData, blobData.type || 'image/jpeg');
          if (dataUrl) {
            setCachedBase64ForStoragePath(cleanPath, dataUrl);
            return { url: dataUrl };
          }
        }
      }
    } catch {
      // ignore download fallback error
    }

    // 3. In-memory Base64 cache fallback (strictly isolated to the owning user session)
    if (canUseMemoryCacheFallback) {
      const cachedFallback = getCachedBase64ForStoragePath(cleanPath, activeUserId);
      if (cachedFallback) {
        return { url: cachedFallback };
      }
    }

    // 4. Determine accurate error reason for UI reporting
    const rawErrMsg = (error?.message || '').toLowerCase();

    if (!activeUserId && (rawErrMsg.includes('jwt') || rawErrMsg.includes('unauthorized') || rawErrMsg.includes('not authenticated'))) {
      return {
        url: null,
        errorReason: 'not_authenticated',
        errorMessage: 'Gagal memuat screenshot dari Storage privat. Pastikan sesi login aktif.',
      };
    }

    if (activeUserId && pathOwnerId && pathOwnerId !== activeUserId) {
      return {
        url: null,
        errorReason: 'wrong_user_folder',
        errorMessage:
          'Gagal memuat screenshot: Path gambar berasal dari folder akun pengguna lain dan dibatasi oleh privasi Storage.',
      };
    }

    if (
      rawErrMsg.includes('object not found') ||
      rawErrMsg.includes('not found') ||
      rawErrMsg.includes('does not exist') ||
      (error as any)?.statusCode === '404' ||
      (error as any)?.statusCode === 404 ||
      (error as any)?.status === 400
    ) {
      if (!activeUserId) {
        return {
          url: null,
          errorReason: 'not_authenticated',
          errorMessage: 'Gagal memuat screenshot dari Storage privat. Pastikan sesi login aktif.',
        };
      }
      return {
        url: null,
        errorReason: 'not_found',
        errorMessage:
          'File screenshot tidak ditemukan di Supabase Storage. Hal ini terjadi jika Backup JSON lama hanya menyimpan path referensi dan objek gambar di Storage sudah terhapus.',
      };
    }

    if (error) {
      console.warn('Gagal membuat signed URL untuk:', cleanPath, error.message);
    }

    return {
      url: null,
      errorReason: activeUserId ? 'storage_error' : 'not_authenticated',
      errorMessage: activeUserId
        ? `Gagal memuat screenshot dari Storage privat (${error?.message || 'akses ditolak atau objek tidak ditemukan'}).`
        : 'Gagal memuat screenshot dari Storage privat. Pastikan sesi login aktif.',
    };
  } catch (err: any) {
    console.error('Error saat membuat signed URL:', err);
    if (canUseMemoryCacheFallback) {
      const cachedFallback = getCachedBase64ForStoragePath(cleanPath, activeUserId);
      if (cachedFallback) {
        return { url: cachedFallback };
      }
    }
    return {
      url: null,
      errorReason: 'storage_error',
      errorMessage: 'Gagal memuat screenshot dari Storage privat. Pastikan sesi login aktif.',
    };
  }
}

/**
 * Creates a temporary signed URL for a private storage object path.
 * Returns null if path is invalid or creation fails.
 */
export async function createScreenshotSignedUrl(
  filePath: string,
  expiresIn = 3600
): Promise<string | null> {
  const result = await resolveScreenshotSignedUrlWithDiagnostics(filePath, expiresIn);
  return result.url;
}

/**
 * Deletes a screenshot file from the private storage bucket.
 * Strictly verifies that the path is a valid storage path before calling remove,
 * evicts the path from screenshotUploadCache so subsequent restores never reuse a deleted path,
 * and caches the image in base64ByStoragePathCache prior to removal so same-session JSON restores can re-upload it.
 */
export async function deleteScreenshotFromSupabase(
  filePath: string
): Promise<SyncResult> {
  if (!filePath || !isStoragePath(filePath)) {
    return { success: true };
  }

  const cleanPath = filePath.trim();
  // Always evict from upload cache immediately so deleted paths are never reused
  evictScreenshotUploadCacheByPath(cleanPath);

  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia.' };
  }

  try {
    // Best-effort: cache Base64 in memory before deleting from Storage so if the user
    // immediately restores a legacy JSON backup (containing only cleanPath), it can be re-uploaded
    if (!getCachedBase64ForStoragePath(cleanPath)) {
      try {
        if (typeof client.storage.from('trade-screenshots').download === 'function') {
          const { data: blobData } = await client.storage
            .from('trade-screenshots')
            .download(cleanPath);
          if (blobData) {
            const b64 = await encodeBlobToBase64DataUrl(blobData, blobData.type || 'image/jpeg');
            if (b64) {
              setCachedBase64ForStoragePath(cleanPath, b64);
            }
          }
        }
      } catch {
        // non-blocking
      }
    }

    const { error } = await client.storage
      .from('trade-screenshots')
      .remove([cleanPath]);

    if (error) {
      console.warn('Gagal menghapus file dari storage:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error saat menghapus screenshot dari storage:', err);
    return { success: false, error: err?.message || 'Gagal menghapus file storage.' };
  }
}

/**
 * Safely downloads a screenshot Blob from the private 'trade-screenshots' bucket.
 * Strictly verifies that the user is authenticated and the path begins with the user's ID
 * to prevent accessing or traversing other users' directories.
 */
export async function downloadScreenshotBlob(
  filePath: string,
  activeUserId: string
): Promise<{ success: boolean; blob?: Blob; contentType?: string; error?: string }> {
  if (!activeUserId || typeof activeUserId !== 'string' || activeUserId.trim() === '') {
    return { success: false, error: 'User ID tidak valid. Sesi login diperlukan untuk mengunduh dari storage privat.' };
  }

  if (!filePath || !isStoragePath(filePath)) {
    return { success: false, error: `Path storage tidak valid: "${filePath}"` };
  }

  // Strictly enforce folder ownership: must match activeUserId/
  const trimmedUserId = activeUserId.trim();
  const cleanPath = filePath.trim();
  const pathParts = cleanPath.split('/');
  if (pathParts[0] !== trimmedUserId) {
    return {
      success: false,
      error: `Izin akses ditolak: Path storage "${cleanPath}" bukan milik folder pengguna aktif (${trimmedUserId}).`,
    };
  }

  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Koneksi Supabase belum diinisialisasi.' };
  }

  try {
    const { data, error } = await client.storage
      .from('trade-screenshots')
      .download(cleanPath);

    if (error || !data) {
      console.warn(`Gagal mengunduh screenshot "${cleanPath}":`, error?.message);
      return { success: false, error: error?.message || 'File tidak ditemukan di storage.' };
    }

    return {
      success: true,
      blob: data,
      contentType: data.type || 'image/jpeg',
    };
  } catch (err: any) {
    console.error(`Error downloadScreenshotBlob for "${cleanPath}":`, err);
    return { success: false, error: err?.message || 'Gagal mengunduh screenshot dari Supabase Storage.' };
  }
}

/**
 * Prepares a cloned array of trades for JSON backup export by resolving private Storage paths
 * into self-contained 'data:image/...;base64,...' strings whenever possible.
 * Does NOT mutate the live trades array or database rows.
 * Ensures that if a user exports a JSON backup while logged into Cloud, deletes their trades
 * (which deletes the Storage files), and later restores the JSON backup, all screenshots are
 * preserved and re-uploaded to Supabase Storage.
 */
export async function prepareTradesForJsonBackup(
  trades: Trade[],
  activeUserId?: string | null
): Promise<Trade[]> {
  let resolvedUserId = activeUserId ? String(activeUserId).trim() : '';
  if (!resolvedUserId) {
    const client = getSupabase();
    if (client?.auth && typeof client.auth.getSession === 'function') {
      try {
        const { data } = await client.auth.getSession();
        resolvedUserId = data?.session?.user?.id || '';
      } catch {
        // ignore
      }
    }
  }

  const prepared: Trade[] = [];
  for (const t of trades) {
    const rawUrl = t.screenshotUrl ? String(t.screenshotUrl).trim() : '';
    if (!rawUrl || !isStoragePath(rawUrl)) {
      prepared.push({ ...t });
      continue;
    }

    // 1. Check in-memory Base64 cache first
    const cachedB64 = getCachedBase64ForStoragePath(rawUrl);
    if (cachedB64) {
      prepared.push({ ...t, screenshotUrl: cachedB64 });
      continue;
    }

    // 2. Download from private Storage if user session is active and owns the folder
    if (resolvedUserId && rawUrl.startsWith(`${resolvedUserId}/`)) {
      const dl = await downloadScreenshotBlob(rawUrl, resolvedUserId);
      if (dl.success && dl.blob) {
        const b64 = await encodeBlobToBase64DataUrl(dl.blob, dl.contentType || 'image/jpeg');
        if (b64) {
          setCachedBase64ForStoragePath(rawUrl, b64);
          prepared.push({ ...t, screenshotUrl: b64 });
          continue;
        }
      }
    }

    prepared.push({ ...t });
  }

  return prepared;
}

/**
 * Resolves any screenshot URL or path for display:
 * - If Base64 or external HTTP(S) URL: returns as-is immediately.
 * - If private Storage path: requests a fresh signed URL from Supabase Storage.
 * - Otherwise returns null.
 */
export async function resolveScreenshotDisplayUrl(
  urlOrPath: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!urlOrPath) return null;
  const clean = urlOrPath.trim();
  if (
    clean.startsWith('data:image/') ||
    clean.startsWith('http://') ||
    clean.startsWith('https://')
  ) {
    return clean;
  }
  if (isStoragePath(clean)) {
    return createScreenshotSignedUrl(clean, expiresIn);
  }
  return null;
}

/**
 * Fetch user account settings from Supabase
 */
export async function fetchSettingsFromSupabase(userId: string): Promise<AppSettings | null> {
  const client = getSupabase();
  if (!client || !userId || typeof userId !== 'string' || !userId.trim()) return null;
  const cleanUserId = userId.trim();

  try {
    const { data, error } = await client
      .from('user_settings')
      .select('*')
      .eq('user_id', cleanUserId)
      .single();

    if (error || !data) return null;

    return mergeWithExistingSettings(loadStoredSettings(cleanUserId), {
      currency: data.currency,
      currencySymbol: data.currency_symbol,
      startingBalance: Number(data.starting_balance),
      xauusdContractSize: Number(data.xauusd_contract_size),
      xauusdPointValue: Number(data.xauusd_point_value),
      brokerCommissionPerLot: Number(data.broker_commission_per_lot),
      defaultRiskPercent: Number(data.default_risk_percent),
      maxDailyLossPercent: Number(data.max_daily_loss_percent),
      maxDailyLossAmount: Number(data.max_daily_loss_amount),
      maxConsecutiveLossLimit: Number(data.max_consecutive_loss_limit),
      targetMonthlyReturnPercent: Number(data.target_monthly_return_percent),
    });
  } catch (err) {
    console.error('Failed to fetch settings from Supabase:', err);
    return null;
  }
}

/**
 * Loads settings for the active user on login or account switch:
 * - For guests (userId null/empty): returns guest settings from localStorage.
 * - For authenticated users: starts from that user's isolated local settings cache
 *   (`tradevault_settings_user_<userId>`, defaulting to DEFAULT_SETTINGS so another account's
 *   settings never leak), fetches cloud settings from `user_settings`, merges them while
 *   preserving valid optional fields via `mergeWithExistingSettings`, and saves back to the
 *   user's isolated local cache.
 */
export async function loadUserSettingsWithFallback(
  userId?: string | null,
  fetchCloudFn: (uid: string) => Promise<AppSettings | null> = fetchSettingsFromSupabase
): Promise<{ settings: AppSettings; source: 'cloud' | 'local_fallback' | 'local' }> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return {
      settings: loadStoredSettings(null),
      source: 'local',
    };
  }

  const cleanUserId = userId.trim();
  const localUserSettings = loadStoredSettings(cleanUserId);

  try {
    const cloudSettings = await fetchCloudFn(cleanUserId);
    if (cloudSettings) {
      const merged = mergeWithExistingSettings(localUserSettings, cloudSettings);
      saveStoredSettings(merged, cleanUserId);
      return {
        settings: merged,
        source: 'cloud',
      };
    }
  } catch {
    // fallback to isolated user local settings
  }

  return {
    settings: localUserSettings,
    source: 'local_fallback',
  };
}

/**
 * Save user account settings to Supabase
 */
export async function saveSettingsToSupabase(settings: AppSettings, userId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const payload = {
      user_id: userId,
      currency: settings.currency,
      currency_symbol: settings.currencySymbol,
      starting_balance: settings.startingBalance,
      xauusd_contract_size: settings.xauusdContractSize,
      xauusd_point_value: settings.xauusdPointValue,
      broker_commission_per_lot: settings.brokerCommissionPerLot,
      default_risk_percent: settings.defaultRiskPercent,
      max_daily_loss_percent: settings.maxDailyLossPercent,
      max_daily_loss_amount: settings.maxDailyLossAmount,
      max_consecutive_loss_limit: settings.maxConsecutiveLossLimit,
      target_monthly_return_percent: settings.targetMonthlyReturnPercent,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' });

    return !error;
  } catch (err) {
    console.error('Failed to save settings to Supabase:', err);
    return false;
  }
}

/**
 * Batch migrate / sync local trades to Supabase with idempotent upsert and progress callback.
 * - Uploads any Base64 screenshots ('data:image/...') to Supabase Storage before upserting to public.trades.
 * - Preserves existing valid storage paths and external URLs without redundant uploads.
 * - If a screenshot upload or DB upsert fails for a trade, preserves the original trade (including its
 *   source Base64 screenshot) in syncedTrades and increments failedCount so it can be retried safely.
 */
export async function migrateLocalTradesToSupabase(
  localTrades: Trade[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{
  success: boolean;
  count: number;
  failedCount: number;
  syncedTrades: Trade[];
  error?: string;
}> {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      count: 0,
      failedCount: localTrades.length,
      syncedTrades: localTrades.map((t) => ({ ...t })),
      error: 'Koneksi Supabase belum aktif.',
    };
  }

  let successCount = 0;
  let failedCount = 0;
  const total = localTrades.length;
  const syncedTrades: Trade[] = [];
  let firstError = '';

  try {
    for (let i = 0; i < total; i++) {
      const trade = localTrades[i];
      const res = await upsertTradeToSupabase(trade, userId);
      if (res.success && res.data) {
        successCount++;
        // Preserve all local trade fields while adopting the synced storage path in screenshotUrl
        syncedTrades.push({
          ...trade,
          screenshotUrl: res.data.screenshotUrl || undefined,
        });
      } else {
        failedCount++;
        // Preserve original trade (including source Base64 screenshot) untouched so data is never lost
        syncedTrades.push({ ...trade });
        if (!firstError) {
          firstError = res.error || `Gagal menyinkronkan transaksi "${trade.id}".`;
        }
      }
      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    if (successCount === total) {
      return {
        success: true,
        count: successCount,
        failedCount: 0,
        syncedTrades,
      };
    } else {
      return {
        success: successCount > 0 && failedCount === 0,
        count: successCount,
        failedCount,
        syncedTrades,
        error:
          firstError ||
          `Berhasil menyinkronkan ${successCount} dari ${total} transaksi (${failedCount} gagal).`,
      };
    }
  } catch (err: any) {
    // If an unexpected exception occurs mid-loop, preserve remaining trades untouched
    for (let j = syncedTrades.length; j < total; j++) {
      syncedTrades.push({ ...localTrades[j] });
    }
    return {
      success: false,
      count: successCount,
      failedCount: total - successCount,
      syncedTrades,
      error: translateDatabaseError(err),
    };
  }
}

/**
 * Merges or replaces an existing trades dataset with an incoming trades dataset
 * using canonical UUID matching (case-insensitive and deterministic via ensureValidUuid).
 * - In 'replace' mode: deduplicates incomingTrades by canonical key and identifies obsolete existing trades.
 * - In 'merge' mode: updates matching trades (preserving existing screenshotUrl if incoming trade has none),
 *   adds new incoming trades, and preserves all unchanged existing trades.
 */
export function mergeTradesDatasets(
  existingTrades: Trade[],
  incomingTrades: Trade[],
  mode: 'replace' | 'merge'
): {
  finalTrades: Trade[];
  obsoleteTrades: Trade[];
  addedCount: number;
  updatedCount: number;
  keptCount: number;
} {
  const existingByLowerId = new Map<string, Trade>();
  const existingByUuid = new Map<string, Trade>();

  for (const ex of existingTrades) {
    if (!ex || !ex.id) continue;
    const lowerId = String(ex.id).trim().toLowerCase();
    const uuid = ensureValidUuid(ex.id);
    if (!existingByLowerId.has(lowerId)) {
      existingByLowerId.set(lowerId, ex);
    }
    if (!existingByUuid.has(uuid)) {
      existingByUuid.set(uuid, ex);
    }
  }

  // Deduplicate incoming trades by case-insensitive ID and canonical UUID (first occurrence wins)
  const deduplicatedIncoming: Trade[] = [];
  const incomingLowerIds = new Set<string>();
  const incomingUuids = new Set<string>();

  for (const inc of incomingTrades) {
    if (!inc || !inc.id) continue;
    const lowerId = String(inc.id).trim().toLowerCase();
    const uuid = ensureValidUuid(inc.id);
    if (!incomingLowerIds.has(lowerId) && !incomingUuids.has(uuid)) {
      incomingLowerIds.add(lowerId);
      incomingUuids.add(uuid);
      deduplicatedIncoming.push({ ...inc });
    }
  }

  const isMatchedByIncoming = (ex: Trade): boolean => {
    const lowerId = String(ex.id).trim().toLowerCase();
    const uuid = ensureValidUuid(ex.id);
    return incomingLowerIds.has(lowerId) || incomingUuids.has(uuid);
  };

  if (mode === 'replace') {
    const obsoleteTrades = existingTrades.filter(
      (ex) => ex && ex.id && !isMatchedByIncoming(ex)
    );
    return {
      finalTrades: deduplicatedIncoming,
      obsoleteTrades,
      addedCount: deduplicatedIncoming.length,
      updatedCount: 0,
      keptCount: 0,
    };
  }

  // Mode: 'merge'
  let addedCount = 0;
  let updatedCount = 0;
  const mergedIncoming: Trade[] = [];

  for (const inc of deduplicatedIncoming) {
    const lowerId = String(inc.id).trim().toLowerCase();
    const uuid = ensureValidUuid(inc.id);
    const existingMatch = existingByLowerId.get(lowerId) || existingByUuid.get(uuid);

    if (existingMatch) {
      updatedCount++;
      const incomingHasScreenshot = Boolean(
        inc.screenshotUrl && String(inc.screenshotUrl).trim() !== ''
      );
      const existingHasScreenshot = Boolean(
        existingMatch.screenshotUrl && String(existingMatch.screenshotUrl).trim() !== ''
      );
      mergedIncoming.push({
        ...inc,
        // Preserve existingMatch.id so deterministic UUID in Supabase public.trades stays identical
        id: existingMatch.id,
        screenshotUrl: incomingHasScreenshot
          ? inc.screenshotUrl
          : existingHasScreenshot
          ? existingMatch.screenshotUrl
          : undefined,
      });
    } else {
      addedCount++;
      mergedIncoming.push({ ...inc });
    }
  }

  const unchangedExisting = existingTrades.filter(
    (ex) => ex && ex.id && !isMatchedByIncoming(ex)
  );

  return {
    finalTrades: [...mergedIncoming, ...unchangedExisting],
    obsoleteTrades: [],
    addedCount,
    updatedCount,
    keptCount: unchangedExisting.length,
  };
}

/**
 * Deletes a specific list of trades from Supabase public.trades (and removes their private storage
 * screenshots if not in keepScreenshotPaths).
 * Ignores rows that do not exist in cloud (0 rows affected without PostgREST error), while reporting
 * any genuine database or RLS errors.
 */
export async function deleteTradesListFromSupabase(
  tradesToDelete: Trade[],
  userId: string,
  keepScreenshotPaths: Set<string> = new Set()
): Promise<SyncResult<{ deletedCount: number }>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia.' };
  }
  if (!userId) {
    return {
      success: false,
      error: 'User ID tidak valid. Sesi login diperlukan untuk menghapus data dari cloud.',
    };
  }

  let deletedCount = 0;
  const seenUuids = new Set<string>();

  try {
    for (const trade of tradesToDelete) {
      if (!trade || !trade.id) continue;
      const dbUuid = ensureValidUuid(trade.id);
      if (seenUuids.has(dbUuid)) continue;
      seenUuids.add(dbUuid);

      const rawScreenshot = trade.screenshotUrl ? String(trade.screenshotUrl).trim() : '';
      if (rawScreenshot && isStoragePath(rawScreenshot) && !keepScreenshotPaths.has(rawScreenshot)) {
        await deleteScreenshotFromSupabase(rawScreenshot);
      }

      const { data, error } = await client
        .from('trades')
        .delete()
        .eq('id', dbUuid)
        .eq('user_id', userId)
        .select();

      if (error) {
        console.error(`Supabase delete error for trade "${trade.id}":`, error);
        return {
          success: false,
          error: translateDatabaseError(error),
        };
      }

      if (data && data.length > 0) {
        deletedCount += data.length;
      }
      unregisterKnownTradeUuid(trade.id);
    }

    return { success: true, data: { deletedCount } };
  } catch (err: any) {
    console.error('Unexpected error in deleteTradesListFromSupabase:', err);
    return {
      success: false,
      error: translateDatabaseError(err),
    };
  }
}

/**
 * Deletes all obsolete cloud trades for a user whose canonical UUID is NOT in keepTrades.
 * Also removes orphaned private Storage screenshots that belonged to deleted or overwritten trades.
 * Used by Replace mode (JSON Restore, ZIP Restore, CSV Replace) and Clear All (where keepTrades = []).
 */
export async function deleteObsoleteTradesFromSupabase(
  keepTrades: Trade[],
  previousLocalTrades: Trade[],
  userId: string
): Promise<SyncResult<{ deletedCount: number }>> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Supabase client tidak tersedia.' };
  }
  if (!userId) {
    return {
      success: false,
      error: 'User ID tidak valid. Sesi login diperlukan untuk menyinkronkan penghapusan cloud.',
    };
  }

  try {
    const keepUuids = new Set<string>();
    const keepScreenshotPaths = new Set<string>();

    for (const t of keepTrades) {
      if (!t || !t.id) continue;
      keepUuids.add(ensureValidUuid(t.id));
      const rawUrl = t.screenshotUrl ? String(t.screenshotUrl).trim() : '';
      if (rawUrl && isStoragePath(rawUrl)) {
        keepScreenshotPaths.add(rawUrl);
      }
    }

    // Collect candidate trades from both previousLocalTrades and live cloud rows
    const candidateByUuid = new Map<string, Trade>();
    for (const prev of previousLocalTrades) {
      if (!prev || !prev.id) continue;
      candidateByUuid.set(ensureValidUuid(prev.id), prev);
    }

    const cloudRes = await fetchTradesFromSupabase(userId);
    if (cloudRes.success && cloudRes.data) {
      for (const cloudTrade of cloudRes.data) {
        if (!cloudTrade || !cloudTrade.id) continue;
        const uuid = ensureValidUuid(cloudTrade.id);
        if (!candidateByUuid.has(uuid)) {
          candidateByUuid.set(uuid, cloudTrade);
        } else {
          // If cloud row had a storage screenshot not recorded in local copy, preserve reference for cleanup
          const existing = candidateByUuid.get(uuid)!;
          if (!existing.screenshotUrl && cloudTrade.screenshotUrl) {
            candidateByUuid.set(uuid, {
              ...existing,
              screenshotUrl: cloudTrade.screenshotUrl,
            });
          }
        }
      }
    }

    // Clean up orphaned screenshots for trades that ARE kept, but whose screenshot path changed
    for (const [uuid, prevTrade] of candidateByUuid.entries()) {
      if (keepUuids.has(uuid)) {
        const oldPath = prevTrade.screenshotUrl ? String(prevTrade.screenshotUrl).trim() : '';
        if (oldPath && isStoragePath(oldPath) && !keepScreenshotPaths.has(oldPath)) {
          await deleteScreenshotFromSupabase(oldPath);
        }
      }
    }

    // Filter trades whose UUID is not in keepUuids
    const obsoleteTrades: Trade[] = [];
    for (const [uuid, trade] of candidateByUuid.entries()) {
      if (!keepUuids.has(uuid)) {
        obsoleteTrades.push(trade);
      }
    }

    if (obsoleteTrades.length === 0) {
      return { success: true, data: { deletedCount: 0 } };
    }

    return await deleteTradesListFromSupabase(obsoleteTrades, userId, keepScreenshotPaths);
  } catch (err: any) {
    console.error('Unexpected error in deleteObsoleteTradesFromSupabase:', err);
    return {
      success: false,
      error: translateDatabaseError(err),
    };
  }
}


