import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { ensureValidUuid, parseTradeDateTime } from '../utils/supabaseSync';
import {
  IStorageSnapshotProvider,
  LOCAL_DB_SCHEMA_VERSION,
  LocalSettingsRow,
  LocalStorageSnapshotDigest,
  LocalTradeRow,
  MigrationStateRow,
  MigrationStatus,
  PHASE_1_TEST_DB_NAME,
  PreparedMigrationScreenshot,
  PreparedMigrationTrade,
  QuarantinedRecordRow,
  ShadowMigrationOptions,
  ShadowMigrationReport,
} from './databaseTypes';
import {
  mapLocalRowToSettings,
  mapLocalRowToTrade,
  validateAndNormalizeSettingsRecord,
  validateAndNormalizeTradeRecord,
} from './idbAdapter';
import {
  computeCanonicalSettingsDigest,
  computeCanonicalTradeDigest,
  computeSha256Hex,
  decodeBase64DataUrlToBinary,
} from './utf8Base64Url';

/**
 * Creates a strictly isolated, synthetic in-memory snapshot provider for testing.
 * Never accesses window.localStorage.
 */
export function createInMemorySnapshotProvider(
  initialData: Record<string, string>
): IStorageSnapshotProvider & {
  mutateKey(key: string, value: string): void;
  deleteKey(key: string): void;
} {
  const store = new Map<string, string>(Object.entries(initialData));

  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    keys(): string[] {
      return Array.from(store.keys()).sort();
    },
    mutateKey(key: string, value: string): void {
      store.set(key, value);
    },
    deleteKey(key: string): void {
      store.delete(key);
    },
  };
}

/**
 * Enumerates every key in window.localStorage and calculates a deterministic SHA-256 digest
 * of the complete snapshot for AT-17 isolation verification.
 * Does NOT copy user data to IndexedDB or expose user trade contents in UI test output.
 */
export async function captureWindowLocalStorageSnapshotDigest(): Promise<LocalStorageSnapshotDigest> {
  const entries: Record<string, string> = {};
  const sortedKeys: string[] = [];

  if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
    const storage = globalThis.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null) {
        sortedKeys.push(k);
      }
    }
    sortedKeys.sort();
    for (const k of sortedKeys) {
      entries[k] = storage.getItem(k) ?? '';
    }
  }

  const orderedPairs = sortedKeys.map((k) => [k, entries[k]]);
  const serialized = JSON.stringify(orderedPairs);
  const sha256Digest = await computeSha256Hex(serialized);

  return {
    keyCount: sortedKeys.length,
    sortedKeys,
    entries,
    sha256Digest,
  };
}

function safeSerializeCorruptValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  try {
    return JSON.stringify(val, (_key, v) => {
      if (typeof v === 'number') {
        if (Number.isNaN(v)) return '__NON_FINITE_NaN__';
        if (v === Number.POSITIVE_INFINITY) return '__NON_FINITE_POS_INFINITY__';
        if (v === Number.NEGATIVE_INFINITY) return '__NON_FINITE_NEG_INFINITY__';
      }
      return v;
    });
  } catch {
    return String(val);
  }
}

async function computeSourceSnapshotChecksum(
  provider: IStorageSnapshotProvider,
  tradesKey: string,
  settingsKey: string,
  inMemoryOverride?: unknown[]
): Promise<string> {
  const rawTrades = provider.getItem(tradesKey);
  const rawSettings = provider.getItem(settingsKey);
  const overrideSerialized =
    inMemoryOverride !== undefined ? safeSerializeCorruptValue(inMemoryOverride) : null;

  const payload = JSON.stringify([
    ['tradesKey', tradesKey],
    ['tradesRaw', rawTrades],
    ['settingsKey', settingsKey],
    ['settingsRaw', rawSettings],
    ['inMemoryOverride', overrideSerialized],
  ]);

  return computeSha256Hex(payload);
}

/**
 * Executes the 11-step isolated Shadow Migration & Verification pipeline.
 * Strictly requires target adapter dbName === 'tradevault_idb_test' in Phase 1.
 */
export async function runShadowMigration(
  options: ShadowMigrationOptions
): Promise<ShadowMigrationReport> {
  const {
    adapter,
    snapshotProvider,
    ownerScope,
    tradesStorageKey,
    settingsStorageKey,
    inMemoryTradeObjectsOverride,
  } = options;

  if (adapter.dbName !== PHASE_1_TEST_DB_NAME) {
    throw new Error(
      `ERR_PRODUCTION_MIGRATION_BLOCKED_IN_PHASE_1: Shadow migration is restricted to "${PHASE_1_TEST_DB_NAME}".`
    );
  }

  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cleanScope = String(ownerScope).trim();

  await adapter.open();

  // STEP 1 & 2: Read initial source snapshot & compute snapshotChecksumStart
  const rawTradesStr = snapshotProvider.getItem(tradesStorageKey);
  const rawSettingsStr = snapshotProvider.getItem(settingsStorageKey);
  const snapshotChecksumStart = await computeSourceSnapshotChecksum(
    snapshotProvider,
    tradesStorageKey,
    settingsStorageKey,
    inMemoryTradeObjectsOverride
  );

  // Record initial IN_PROGRESS migration state (is_active_source_of_truth = 0)
  const initialState: MigrationStateRow = {
    owner_scope: cleanScope,
    status: 'IN_PROGRESS',
    schema_version: LOCAL_DB_SCHEMA_VERSION,
    is_active_source_of_truth: 0,
    source_trades_key: tradesStorageKey,
    source_settings_key: settingsStorageKey,
    snapshot_checksum_start: snapshotChecksumStart,
    snapshot_checksum_end: null,
    migrated_trades_count: 0,
    migrated_screenshots_count: 0,
    quarantined_count: 0,
    failure_reason: null,
    started_at: nowMs,
    completed_at: null,
  };
  await adapter.setMigrationState(initialState);

  const quarantinedRows: QuarantinedRecordRow[] = [];
  const preparedTrades: PreparedMigrationTrade[] = [];

  // STEP 3: Parse and validate trade records
  let candidateTradeItems: unknown[] = [];

  if (inMemoryTradeObjectsOverride !== undefined) {
    candidateTradeItems = inMemoryTradeObjectsOverride;
  } else if (rawTradesStr !== null && rawTradesStr.trim() !== '') {
    try {
      const parsed = JSON.parse(rawTradesStr);
      if (!Array.isArray(parsed)) {
        quarantinedRows.push({
          quarantine_id: crypto.randomUUID(),
          owner_scope: cleanScope,
          source_storage_key: tradesStorageKey,
          corruption_scope: 'TOP_LEVEL_JSON',
          record_index: null,
          record_local_id: null,
          reason_code: 'ROOT_JSON_NOT_ARRAY',
          diagnostic_detail: 'Top-level trades JSON is valid JSON but not an Array.',
          raw_payload: rawTradesStr,
          created_at: nowMs,
        });
      } else {
        candidateTradeItems = parsed;
      }
    } catch (err: unknown) {
      // AT-06: Top-level malformed JSON string
      const msg = err instanceof Error ? err.message : 'Invalid JSON syntax';
      quarantinedRows.push({
        quarantine_id: crypto.randomUUID(),
        owner_scope: cleanScope,
        source_storage_key: tradesStorageKey,
        corruption_scope: 'TOP_LEVEL_JSON',
        record_index: null,
        record_local_id: null,
        reason_code: 'INVALID_TOP_LEVEL_JSON_SYNTAX',
        diagnostic_detail: `Failed to parse top-level JSON document: ${msg}`,
        raw_payload: rawTradesStr,
        created_at: nowMs,
      });
    }
  }

  // Validate individual trade records & prepare screenshots outside IDB transaction (Step 4)
  const seenLocalIdsInBatch = new Set<string>();

  for (let idx = 0; idx < candidateTradeItems.length; idx++) {
    const rawItem = candidateTradeItems[idx];
    const validation = validateAndNormalizeTradeRecord(rawItem, cleanScope);

    if (!validation.isValid || !validation.normalizedTrade) {
      const rawId =
        rawItem && typeof rawItem === 'object' && 'id' in rawItem
          ? String((rawItem as Record<string, unknown>).id ?? '')
          : null;
      quarantinedRows.push({
        quarantine_id: crypto.randomUUID(),
        owner_scope: cleanScope,
        source_storage_key: tradesStorageKey,
        corruption_scope: 'ARRAY_ITEM_RECORD',
        record_index: idx,
        record_local_id: rawId || null,
        reason_code: validation.reasonCode || 'INVALID_TRADE_RECORD',
        diagnostic_detail: validation.detail || 'Trade record failed validation.',
        raw_payload: safeSerializeCorruptValue(rawItem),
        created_at: nowMs,
      });
      continue;
    }

    let tradeObj = validation.normalizedTrade;

    if (seenLocalIdsInBatch.has(tradeObj.id)) {
      quarantinedRows.push({
        quarantine_id: crypto.randomUUID(),
        owner_scope: cleanScope,
        source_storage_key: tradesStorageKey,
        corruption_scope: 'ARRAY_ITEM_RECORD',
        record_index: idx,
        record_local_id: tradeObj.id,
        reason_code: 'DUPLICATE_LOCAL_ID_IN_SNAPSHOT',
        diagnostic_detail: `Duplicate local trade ID "${tradeObj.id}" within the same owner_scope.`,
        raw_payload: safeSerializeCorruptValue(rawItem),
        created_at: nowMs,
      });
      continue;
    }
    seenLocalIdsInBatch.add(tradeObj.id);

    // STEP 4: Prepare Blob and SHA-256 hashing of Base64 screenshots OUTSIDE the IDB transaction
    let preparedScreenshot: PreparedMigrationScreenshot | undefined;
    if (tradeObj.screenshotUrl && tradeObj.screenshotUrl.startsWith('data:image/')) {
      try {
        const decodedImg = await decodeBase64DataUrlToBinary(tradeObj.screenshotUrl);
        const screenshotId = crypto.randomUUID();
        preparedScreenshot = {
          screenshotId,
          ownerScope: cleanScope,
          tradeLocalId: tradeObj.id,
          blob: decodedImg.blob,
          mimeType: decodedImg.mimeType,
          sizeBytes: decodedImg.sizeBytes,
          sha256Hex: decodedImg.sha256Hex,
          createdAt: nowMs,
        };
        // Strip inline Base64 from LocalTradeRow.screenshotUrl so binary lives in screenshot_files
        tradeObj = {
          ...tradeObj,
          screenshotUrl: undefined,
        };
      } catch (imgErr: unknown) {
        // AT-12: Corrupted Base64 screenshot -> quarantine the screenshot ONLY, preserve the valid Trade!
        const detail =
          imgErr instanceof Error ? imgErr.message : 'Corrupted Base64 screenshot payload.';
        quarantinedRows.push({
          quarantine_id: crypto.randomUUID(),
          owner_scope: cleanScope,
          source_storage_key: tradesStorageKey,
          corruption_scope: 'SCREENSHOT_DECODE_FAILURE',
          record_index: idx,
          record_local_id: tradeObj.id,
          reason_code: 'CORRUPTED_BASE64_SCREENSHOT',
          diagnostic_detail: detail,
          raw_payload: String(tradeObj.screenshotUrl ?? ''),
          created_at: nowMs,
        });
        tradeObj = {
          ...tradeObj,
          screenshotUrl: undefined,
        };
      }
    }

    const createdAtIso = tradeObj.createdAt ?? nowIso;
    const updatedAtIso = tradeObj.updatedAt ?? nowIso;
    const normalizedForDigest = {
      ...tradeObj,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    };

    const expectedDigest = await computeCanonicalTradeDigest(normalizedForDigest);
    const parsedDate = parseTradeDateTime(normalizedForDigest.dateTime) || new Date(nowMs);

    const row: LocalTradeRow = {
      canonical_uuid: crypto.randomUUID(),
      owner_scope: cleanScope,
      id: normalizedForDigest.id,
      legacy_candidate_uuid: ensureValidUuid(normalizedForDigest.id),
      is_cloud_bound: 0,
      dateTime: normalizedForDigest.dateTime,
      dateTime_utc_ms: parsedDate.getTime(),
      wall_clock_datetime: normalizedForDigest.dateTime,
      iana_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      tz_offset_minutes: parsedDate.getTimezoneOffset(),
      instrument: normalizedForDigest.instrument,
      position: normalizedForDigest.position,
      strategy: normalizedForDigest.strategy,
      session: normalizedForDigest.session ?? null,
      entryPrice: normalizedForDigest.entryPrice,
      stopLoss: normalizedForDigest.stopLoss ?? null,
      takeProfit: normalizedForDigest.takeProfit ?? null,
      exitPrice: normalizedForDigest.exitPrice ?? null,
      lotSize: normalizedForDigest.lotSize,
      riskAmount: normalizedForDigest.riskAmount,
      riskPercentage: normalizedForDigest.riskPercentage,
      outcome: normalizedForDigest.outcome,
      grossProfit: normalizedForDigest.grossProfit,
      commission: normalizedForDigest.commission,
      swap: normalizedForDigest.swap,
      netProfit: normalizedForDigest.netProfit,
      rMultiple: normalizedForDigest.rMultiple ?? null,
      screenshotUrl: normalizedForDigest.screenshotUrl ?? null,
      screenshot_id: preparedScreenshot ? preparedScreenshot.screenshotId : null,
      notes: normalizedForDigest.notes ?? null,
      entryReason: normalizedForDigest.entryReason ?? null,
      postTradeEvaluation: normalizedForDigest.postTradeEvaluation ?? null,
      disciplineRating: normalizedForDigest.disciplineRating ?? null,
      executionNotes: normalizedForDigest.executionNotes ?? null,
      isDemo: normalizedForDigest.isDemo ? 1 : 0,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
      sync_status: 'LOCAL_ONLY',
      sync_revision: 1,
      last_mutation_id: crypto.randomUUID(),
      canonical_digest: expectedDigest,
    };

    preparedTrades.push({
      row,
      expectedDigest,
      preparedScreenshot,
    });
  }

  // Validate and prepare Settings (all 20 properties)
  let settingsToStore: AppSettings = { ...DEFAULT_SETTINGS };
  if (rawSettingsStr !== null && rawSettingsStr.trim() !== '') {
    try {
      const parsedSettings = JSON.parse(rawSettingsStr);
      const settingsVal = validateAndNormalizeSettingsRecord(parsedSettings);
      if (settingsVal.isValid && settingsVal.normalizedSettings) {
        settingsToStore = settingsVal.normalizedSettings;
      } else {
        quarantinedRows.push({
          quarantine_id: crypto.randomUUID(),
          owner_scope: cleanScope,
          source_storage_key: settingsStorageKey,
          corruption_scope: 'SETTINGS_RECORD',
          record_index: null,
          record_local_id: null,
          reason_code: settingsVal.reasonCode || 'INVALID_SETTINGS_RECORD',
          diagnostic_detail: settingsVal.detail || 'Settings validation failed; using defaults.',
          raw_payload: rawSettingsStr,
          created_at: nowMs,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid settings JSON';
      quarantinedRows.push({
        quarantine_id: crypto.randomUUID(),
        owner_scope: cleanScope,
        source_storage_key: settingsStorageKey,
        corruption_scope: 'SETTINGS_RECORD',
        record_index: null,
        record_local_id: null,
        reason_code: 'INVALID_SETTINGS_JSON_SYNTAX',
        diagnostic_detail: msg,
        raw_payload: rawSettingsStr,
        created_at: nowMs,
      });
    }
  }

  const expectedSettingsDigest = await computeCanonicalSettingsDigest(settingsToStore);
  const settingsRow: LocalSettingsRow = {
    owner_scope: cleanScope,
    currency: settingsToStore.currency,
    currencySymbol: settingsToStore.currencySymbol,
    startingBalance: settingsToStore.startingBalance,
    xauusdContractSize: settingsToStore.xauusdContractSize,
    xauusdPointValue: settingsToStore.xauusdPointValue,
    xauusdTickSize: settingsToStore.xauusdTickSize ?? 0.01,
    xauusdTickValue: settingsToStore.xauusdTickValue ?? 1.0,
    xauusdMinLot: settingsToStore.xauusdMinLot ?? 0.01,
    xauusdLotStep: settingsToStore.xauusdLotStep ?? 0.01,
    defaultLeverage: settingsToStore.defaultLeverage ?? 500,
    brokerCommissionPerLot: settingsToStore.brokerCommissionPerLot,
    defaultRiskPercent: settingsToStore.defaultRiskPercent,
    maxTradeRiskPercent: settingsToStore.maxTradeRiskPercent ?? 2.0,
    maxTradeRiskAmount: settingsToStore.maxTradeRiskAmount ?? 200,
    maxDailyLossPercent: settingsToStore.maxDailyLossPercent,
    maxDailyLossAmount: settingsToStore.maxDailyLossAmount,
    maxConsecutiveLossLimit: settingsToStore.maxConsecutiveLossLimit,
    maxDrawdownLimitPercent: settingsToStore.maxDrawdownLimitPercent ?? 10.0,
    resetTimezone: settingsToStore.resetTimezone ?? 'WIB (UTC+7)',
    targetMonthlyReturnPercent: settingsToStore.targetMonthlyReturnPercent,
    updated_at: nowIso,
    sync_status: 'LOCAL_ONLY',
    sync_revision: 1,
    canonical_digest: expectedSettingsDigest,
  };

  const failMigration = async (
    reason: string,
    cleanupShadowRows = true
  ): Promise<ShadowMigrationReport> => {
    let finalReason = reason;

    // Post-write verification failures require scoped cleanup. Atomic batch-write failures
    // already rolled back their transaction and must preserve any pre-existing scope rows.
    if (cleanupShadowRows) {
      try {
        await adapter.rollbackShadowMigrationScope(cleanScope);
      } catch (cleanupErr: unknown) {
        const cleanupMessage =
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        finalReason = `${reason}; ERR_SHADOW_ROLLBACK_FAILED: ${cleanupMessage}`;
      }
    }

    const failedState: MigrationStateRow = {
      ...initialState,
      status: 'FAILED',
      failure_reason: finalReason,
      completed_at: Date.now(),
    };
    await adapter.setMigrationState(failedState);
    return {
      status: 'FAILED',
      ownerScope: cleanScope,
      migratedTradesCount: 0,
      migratedScreenshotsCount: 0,
      quarantinedCount: 0,
      snapshotChecksumStart,
      snapshotChecksumEnd: null,
      isActiveSourceOfTruth: false,
      failureReason: finalReason,
    };
  };

  // STEP 5: Controlled atomic batch write to test IndexedDB
  try {
    await adapter.writeShadowMigrationBatchAtomically({
      ownerScope: cleanScope,
      trades: preparedTrades,
      settingsRow,
      quarantinedRows,
      nowMs,
      simulateWriteFailureOnTradeIndex: options.simulateWriteFailureOnTradeIndex,
    });
  } catch (writeErr: unknown) {
    const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
    return failMigration(`ERR_ATOMIC_BATCH_WRITE_FAILED: ${msg}`, false);
  }

  let verifiedScreenshotsCount = 0;
  let snapshotChecksumEnd: string | null = null;

  try {
    // Optional test hook for AT-09 (simulating source mutation during migration)
    if (options.onBeforeFinalSnapshotCheck) {
      await options.onBeforeFinalSnapshotCheck();
    }

    // STEP 6, 7, 8: Read back all written records and compare canonical digests 1-by-1
    const readBackTrades = await adapter.getTradesByOwner(cleanScope);
    if (readBackTrades.length !== preparedTrades.length) {
      return failMigration(
        `ERR_READBACK_COUNT_MISMATCH: Expected ${preparedTrades.length} trades, read back ${readBackTrades.length}.`
      );
    }

    const readBackByLocalId = new Map<string, LocalTradeRow>(
      readBackTrades.map((r) => [r.id, r])
    );

    for (const expectedItem of preparedTrades) {
      const storedRow = readBackByLocalId.get(expectedItem.row.id);
      if (!storedRow) {
        return failMigration(
          `ERR_MISSING_READBACK_RECORD: Trade "${expectedItem.row.id}" missing on read-back.`
        );
      }

      const reconstructedTrade = mapLocalRowToTrade(storedRow);
      let recomputedDigest = await computeCanonicalTradeDigest(reconstructedTrade);
      if (options.simulateReadBackDigestMismatch) {
        recomputedDigest =
          '0000000000000000000000000000000000000000000000000000000000000000';
      }

      if (
        recomputedDigest !== expectedItem.expectedDigest ||
        storedRow.canonical_digest !== expectedItem.expectedDigest
      ) {
        return failMigration(
          `ERR_CANONICAL_DIGEST_MISMATCH: Digest mismatch on trade "${expectedItem.row.id}".`
        );
      }

      // Verify screenshot metadata and binary Blob SHA-256 if trade had a screenshot
      if (expectedItem.preparedScreenshot) {
        const scId = expectedItem.preparedScreenshot.screenshotId;
        const metaRow = await adapter.getScreenshotMetadata(scId);
        const fileRow = await adapter.getScreenshotFile(scId);

        if (!metaRow || !fileRow || !fileRow.blob_data) {
          return failMigration(
            `ERR_MISSING_SCREENSHOT_READBACK: Screenshot "${scId}" missing on read-back.`
          );
        }

        const buf = await fileRow.blob_data.arrayBuffer();
        const actualBlobHash = await computeSha256Hex(buf);
        if (
          actualBlobHash !== expectedItem.preparedScreenshot.sha256Hex ||
          metaRow.sha256_hash !== expectedItem.preparedScreenshot.sha256Hex ||
          fileRow.size_bytes !== expectedItem.preparedScreenshot.sizeBytes
        ) {
          return failMigration(
            `ERR_SCREENSHOT_SHA256_MISMATCH: Binary hash mismatch for screenshot "${scId}".`
          );
        }
        verifiedScreenshotsCount++;
      }
    }

    // Verify settings read-back and canonical digest
    const readBackSettingsRow = await adapter.getSettingsByOwner(cleanScope);
    if (!readBackSettingsRow) {
      return failMigration('ERR_MISSING_SETTINGS_READBACK: Settings row missing on read-back.');
    }
    const reconstructedSettings = mapLocalRowToSettings(readBackSettingsRow);
    const recomputedSettingsDigest = await computeCanonicalSettingsDigest(reconstructedSettings);
    if (recomputedSettingsDigest !== expectedSettingsDigest) {
      return failMigration('ERR_SETTINGS_DIGEST_MISMATCH: Settings canonical digest mismatch.');
    }

    // STEP 9 & 10: Re-verify source snapshot checksum to detect mid-migration mutation (AT-09)
    snapshotChecksumEnd = await computeSourceSnapshotChecksum(
      snapshotProvider,
      tradesStorageKey,
      settingsStorageKey,
      inMemoryTradeObjectsOverride
    );

    if (snapshotChecksumStart !== snapshotChecksumEnd) {
      return failMigration('ERR_SOURCE_SNAPSHOT_MUTATED_DURING_MIGRATION');
    }
  } catch (verificationErr: unknown) {
    const msg =
      verificationErr instanceof Error ? verificationErr.message : String(verificationErr);
    return failMigration(`ERR_SHADOW_VERIFICATION_FAILED: ${msg}`);
  }
  // STEP 11: Finalize status -> VERIFIED_SHADOW (if 0 quarantined) or COMPLETED_WITH_QUARANTINE
  const finalStatus: MigrationStatus =
    quarantinedRows.length === 0 ? 'VERIFIED_SHADOW' : 'COMPLETED_WITH_QUARANTINE';

  const completedState: MigrationStateRow = {
    owner_scope: cleanScope,
    status: finalStatus,
    schema_version: LOCAL_DB_SCHEMA_VERSION,
    is_active_source_of_truth: 0,
    source_trades_key: tradesStorageKey,
    source_settings_key: settingsStorageKey,
    snapshot_checksum_start: snapshotChecksumStart,
    snapshot_checksum_end: snapshotChecksumEnd,
    migrated_trades_count: preparedTrades.length,
    migrated_screenshots_count: verifiedScreenshotsCount,
    quarantined_count: quarantinedRows.length,
    failure_reason: null,
    started_at: nowMs,
    completed_at: Date.now(),
  };

  await adapter.setMigrationState(completedState);

  return {
    status: finalStatus,
    ownerScope: cleanScope,
    migratedTradesCount: preparedTrades.length,
    migratedScreenshotsCount: verifiedScreenshotsCount,
    quarantinedCount: quarantinedRows.length,
    snapshotChecksumStart,
    snapshotChecksumEnd,
    isActiveSourceOfTruth: false,
  };
}
