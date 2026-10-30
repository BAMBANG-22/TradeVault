import { Trade, TradeOutcome, TradePosition } from '../types/trade';
import {
  classifyNetProfitOutcome,
  computeGrossFromNet,
  computeRealizedRMultiple,
} from './calculations';
import { normalizeTradeDateTimeLocal } from './supabaseSync';

export function exportTradesToCsv(trades: Trade[]): string {
  const headers = [
    'ID',
    'Tanggal & Waktu',
    'Instrumen',
    'Posisi',
    'Setup / Strategi',
    'Entry Price',
    'Stop Loss',
    'Take Profit',
    'Exit Price',
    'Lot Size',
    'Risk Amount',
    'Risk %',
    'Hasil (Outcome)',
    'Gross Profit',
    'Komisi',
    'Swap',
    'Net Profit',
    'R-Multiple',
    'Rating Disiplin',
    'Catatan',
  ];

  const escapeCell = (val: any) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = trades.map((t) => [
    escapeCell(t.id),
    escapeCell(t.dateTime),
    escapeCell(t.instrument),
    escapeCell(t.position),
    escapeCell(t.strategy),
    escapeCell(t.entryPrice),
    escapeCell(t.stopLoss),
    escapeCell(t.takeProfit),
    escapeCell(t.exitPrice ?? ''),
    escapeCell(t.lotSize),
    escapeCell(t.riskAmount),
    escapeCell(t.riskPercentage),
    escapeCell(t.outcome),
    escapeCell(t.grossProfit),
    escapeCell(t.commission),
    escapeCell(t.swap),
    escapeCell(t.netProfit),
    escapeCell(t.rMultiple ?? ''),
    escapeCell(t.disciplineRating ?? ''),
    escapeCell(t.notes ?? ''),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  return csvContent;
}

export function downloadCsvFile(csvContent: string, filename: string = 'TradeVault_Journal.csv') {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface CsvImportResult {
  success: boolean;
  validTrades: Trade[];
  errors: string[];
  totalRows: number;
}

export function parseCsvToTrades(csvText: string): CsvImportResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      success: false,
      validTrades: [],
      errors: ['File CSV kosong atau tidak memiliki baris data.'],
      totalRows: 0,
    };
  }

  // Parse header line respecting quotes
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headerRow = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const findIndex = (keywords: string[]) => {
    return headerRow.findIndex((h) => keywords.some((k) => h.includes(k)));
  };

  const idxId = findIndex(['id', 'tradeid']);
  const idxDate = findIndex(['date', 'tanggal', 'waktu', 'time']);
  const idxInstrument = findIndex(['instrument', 'instrumen', 'symbol', 'pair']);
  const idxPosition = findIndex(['posisi', 'position', 'type', 'arah', 'side']);
  const idxStrategy = findIndex(['setup', 'strategy', 'strategi', 'alasan']);
  const idxEntry = findIndex(['entry', 'open', 'buyprice', 'sellprice']);
  const idxSl = findIndex(['sl', 'stoploss', 'stop']);
  const idxTp = findIndex(['tp', 'takeprofit', 'target']);
  const idxExit = findIndex(['exit', 'closeprice', 'close']);
  const idxLot = findIndex(['lot', 'lotsize', 'volume', 'size']);
  const idxRisk = findIndex(['risk', 'riskamount', 'risiko']);
  const idxRiskPct = findIndex(['riskpercent', 'riskpct', 'persen']);
  const idxOutcome = findIndex(['hasil', 'outcome', 'result', 'status']);
  const idxNet = findIndex(['netprofit', 'profit', 'pnl', 'net', 'cuan', 'rugi']);
  const idxNotes = findIndex(['catatan', 'notes', 'evaluasi', 'comment']);

  const validTrades: Trade[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = parseRow(rawLine);
    if (cols.length === 0 || cols.every((c) => c === '')) continue;

    const rowNum = i + 1;
    const cleanNum = (val: string | undefined, defaultVal: number = 0) => {
      if (!val) return defaultVal;
      const cleaned = val.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? defaultVal : parsed;
    };

    const id = idxId !== -1 && cols[idxId] ? cols[idxId] : `CSV-${Date.now()}-${i}`;
    const dateRaw = idxDate !== -1 && cols[idxDate] ? cols[idxDate] : new Date().toISOString();
    const dateTime = normalizeTradeDateTimeLocal(dateRaw);

    const instrument = (idxInstrument !== -1 && cols[idxInstrument]) ? cols[idxInstrument].toUpperCase() : 'XAUUSD';

    let position: TradePosition = 'BUY';
    if (idxPosition !== -1 && cols[idxPosition]) {
      const p = cols[idxPosition].trim().toLowerCase();
      if (p.includes('sell') || p.includes('jual') || p.includes('short')) {
        position = 'SELL';
      } else if (p.includes('buy') || p.includes('beli') || p.includes('long')) {
        position = 'BUY';
      }
    }

    const strategy = idxStrategy !== -1 && cols[idxStrategy] ? cols[idxStrategy] : 'Umum / Standard';
    const entryPrice = cleanNum(idxEntry !== -1 ? cols[idxEntry] : undefined, 0);
    const stopLoss = cleanNum(idxSl !== -1 ? cols[idxSl] : undefined, 0);
    const takeProfit = cleanNum(idxTp !== -1 ? cols[idxTp] : undefined, 0);
    const exitPrice = idxExit !== -1 && cols[idxExit] ? cleanNum(cols[idxExit], entryPrice) : undefined;
    const lotSize = Math.max(0.01, cleanNum(idxLot !== -1 ? cols[idxLot] : undefined, 0.1));
    const riskAmount = cleanNum(idxRisk !== -1 ? cols[idxRisk] : undefined, 100);
    const riskPercentage = cleanNum(idxRiskPct !== -1 ? cols[idxRiskPct] : undefined, 1.0);
    const netProfit = Number(cleanNum(idxNet !== -1 ? cols[idxNet] : undefined, 0).toFixed(2));
    const outcome: TradeOutcome = classifyNetProfitOutcome(netProfit);
    const grossProfit = computeGrossFromNet(netProfit, 0, 0);
    const realizedR = computeRealizedRMultiple({
      netProfit,
      grossProfit,
      commission: 0,
      swap: 0,
      riskAmount,
    });

    const notes = idxNotes !== -1 ? cols[idxNotes] : '';

    if (entryPrice <= 0) {
      errors.push(`Baris ${rowNum}: Entry Price tidak valid (${cols[idxEntry] || 'kosong'}).`);
      continue;
    }

    validTrades.push({
      id,
      dateTime,
      instrument,
      position,
      strategy,
      entryPrice,
      stopLoss,
      takeProfit,
      exitPrice,
      lotSize,
      riskAmount,
      riskPercentage,
      outcome,
      grossProfit,
      commission: 0,
      swap: 0,
      netProfit,
      rMultiple: realizedR !== null ? realizedR : undefined,
      notes,
    });
  }

  return {
    success: validTrades.length > 0,
    validTrades,
    errors,
    totalRows: lines.length - 1,
  };
}
