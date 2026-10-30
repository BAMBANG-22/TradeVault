import React, { useState, useEffect, useRef } from 'react';
import { Trade, TradeOutcome, TradePosition, TradingSession } from '../../types/trade';
import { AppSettings } from '../../types/settings';
import { calculateXauusdLot } from '../../utils/riskCalculator';
import {
  classifyNetProfitOutcome,
  computeGrossFromNet,
  computeNetFromGross,
  computeRealizedRMultiple,
} from '../../utils/calculations';
import {
  isStoragePath,
  createScreenshotSignedUrl,
  normalizeTradeDateTimeLocal,
} from '../../utils/supabaseSync';
import {
  Save,
  X,
  Upload,
  Calculator,
  AlertCircle,
  RefreshCw,
  Clock,
  Loader2,
} from 'lucide-react';

export interface TradeSaveResult {
  success: boolean;
  error?: string;
  ignored?: boolean;
  uploadedScreenshotPath?: string;
}

interface TradeFormProps {
  initialTrade?: Trade | null;
  settings: AppSettings;
  currentEquity: number;
  existingTrades?: Trade[];
  onSave: (
    trade: Trade,
    originalId?: string
  ) => Promise<TradeSaveResult | void> | TradeSaveResult | void;
  onCancel: () => void;
}

const COMMON_STRATEGIES = [
  'London Open Liquidity Sweep',
  'NY Session FVG Fill + CHoCH',
  'Order Block Retest M15',
  'Asian Range Breakout & Retest',
  'Daily Support & Demand Bounce',
  'Break of Structure (BOS) Momentum',
  'Trend Continuation Pullback',
  'Overbought / Oversold Mean Reversion',
  'News Retest & Continuation',
];

const COMMON_SESSIONS: { key: TradingSession; label: string; timeHint: string }[] = [
  { key: 'London', label: 'London', timeHint: '14:00 - 22:00 WIB' },
  { key: 'New York', label: 'New York', timeHint: '19:00 - 03:00 WIB' },
  { key: 'Overlap', label: 'London/NY Overlap', timeHint: '19:00 - 22:00 WIB (High Volatility)' },
  { key: 'Asian', label: 'Asian', timeHint: '06:00 - 14:00 WIB' },
  { key: 'Other', label: 'Lainnya', timeHint: 'Off-session / Custom' },
];

export const TradeForm: React.FC<TradeFormProps> = ({
  initialTrade,
  settings,
  currentEquity,
  existingTrades = [],
  onSave,
  onCancel,
}) => {
  // Generate random unique ID
  const generateUniqueId = () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `TRD-${randomSuffix}`;
  };

  // Form State
  const [id, setId] = useState(initialTrade?.id || generateUniqueId());
  const [dateTime, setDateTime] = useState(
    initialTrade?.dateTime
      ? normalizeTradeDateTimeLocal(initialTrade.dateTime)
      : normalizeTradeDateTimeLocal(new Date())
  );
  const [instrument, setInstrument] = useState(initialTrade?.instrument || 'XAUUSD');
  const [position, setPosition] = useState<TradePosition>(initialTrade?.position || 'BUY');
  const [strategy, setStrategy] = useState(initialTrade?.strategy || '');
  const [session, setSession] = useState<string>(initialTrade?.session || 'London');
  const [entryPrice, setEntryPrice] = useState<string>(
    initialTrade?.entryPrice !== undefined ? String(initialTrade.entryPrice) : ''
  );
  const [stopLoss, setStopLoss] = useState<string>(
    initialTrade?.stopLoss !== undefined && initialTrade.stopLoss > 0
      ? String(initialTrade.stopLoss)
      : ''
  );
  const [takeProfit, setTakeProfit] = useState<string>(
    initialTrade?.takeProfit !== undefined && initialTrade.takeProfit > 0
      ? String(initialTrade.takeProfit)
      : ''
  );
  const [exitPrice, setExitPrice] = useState<string>(
    initialTrade?.exitPrice !== undefined && initialTrade.exitPrice > 0
      ? String(initialTrade.exitPrice)
      : ''
  );
  const [lotSize, setLotSize] = useState<string>(
    initialTrade?.lotSize !== undefined ? String(initialTrade.lotSize) : '0.10'
  );
  const [riskAmount, setRiskAmount] = useState<string>(
    initialTrade?.riskAmount !== undefined
      ? String(initialTrade.riskAmount)
      : String(Math.round((currentEquity * settings.defaultRiskPercent) / 100))
  );
  const [riskPercentage, setRiskPercentage] = useState<string>(
    initialTrade?.riskPercentage !== undefined
      ? String(initialTrade.riskPercentage)
      : String(settings.defaultRiskPercent)
  );
  const [outcome, setOutcome] = useState<TradeOutcome>(initialTrade?.outcome || 'WIN');
  const [grossProfit, setGrossProfit] = useState<string>(
    initialTrade?.grossProfit !== undefined ? String(initialTrade.grossProfit) : ''
  );
  const [commission, setCommission] = useState<string>(
    initialTrade?.commission !== undefined ? String(initialTrade.commission) : '0'
  );
  const [swap, setSwap] = useState<string>(
    initialTrade?.swap !== undefined ? String(initialTrade.swap) : '0'
  );
  const [netProfit, setNetProfit] = useState<string>(
    initialTrade?.netProfit !== undefined ? String(initialTrade.netProfit) : ''
  );
  const [screenshotUrl, setScreenshotUrl] = useState<string>(
    initialTrade?.screenshotUrl || ''
  );
  const [notes, setNotes] = useState<string>(initialTrade?.notes || '');
  const [entryReason, setEntryReason] = useState<string>(initialTrade?.entryReason || '');
  const [postTradeEvaluation, setPostTradeEvaluation] = useState<string>(
    initialTrade?.postTradeEvaluation || ''
  );
  const [disciplineRating, setDisciplineRating] = useState<number>(
    initialTrade?.disciplineRating || 5
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const pnlInputModeRef = useRef<'gross' | 'net'>('gross');

  const triggerValidationError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => {
      try {
        if (errorRef.current) {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  // Storage path preview resolution state
  const [previewDisplayUrl, setPreviewDisplayUrl] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!screenshotUrl) {
      setPreviewDisplayUrl('');
      setIsPreviewLoading(false);
      return;
    }

    const trimmed = screenshotUrl.trim();
    if (
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://')
    ) {
      setPreviewDisplayUrl(trimmed);
      setIsPreviewLoading(false);
      return;
    }

    if (isStoragePath(trimmed)) {
      let isMounted = true;
      setIsPreviewLoading(true);
      createScreenshotSignedUrl(trimmed, 3600)
        .then((url) => {
          if (!isMounted) return;
          setIsPreviewLoading(false);
          setPreviewDisplayUrl((prev) => url || (prev.startsWith('data:image/') ? prev : ''));
        })
        .catch(() => {
          if (!isMounted) return;
          setIsPreviewLoading(false);
          setPreviewDisplayUrl((prev) => (prev.startsWith('data:image/') ? prev : ''));
        });
      return () => {
        isMounted = false;
      };
    }

    setPreviewDisplayUrl(trimmed);
    setIsPreviewLoading(false);
  }, [screenshotUrl]);

  // Synchronize form when initialTrade changes
  useEffect(() => {
    if (initialTrade) {
      setId(initialTrade.id);
      setDateTime(
        initialTrade.dateTime
          ? normalizeTradeDateTimeLocal(initialTrade.dateTime)
          : normalizeTradeDateTimeLocal(new Date())
      );
      setInstrument(initialTrade.instrument || 'XAUUSD');
      setPosition(initialTrade.position || 'BUY');
      setStrategy(initialTrade.strategy || '');
      setSession(initialTrade.session || 'London');
      setEntryPrice(initialTrade.entryPrice !== undefined ? String(initialTrade.entryPrice) : '');
      setStopLoss(
        initialTrade.stopLoss !== undefined && initialTrade.stopLoss > 0
          ? String(initialTrade.stopLoss)
          : ''
      );
      setTakeProfit(
        initialTrade.takeProfit !== undefined && initialTrade.takeProfit > 0
          ? String(initialTrade.takeProfit)
          : ''
      );
      setExitPrice(
        initialTrade.exitPrice !== undefined && initialTrade.exitPrice > 0
          ? String(initialTrade.exitPrice)
          : ''
      );
      setLotSize(initialTrade.lotSize !== undefined ? String(initialTrade.lotSize) : '0.10');
      setRiskAmount(
        initialTrade.riskAmount !== undefined
          ? String(initialTrade.riskAmount)
          : String(Math.round((currentEquity * settings.defaultRiskPercent) / 100))
      );
      setRiskPercentage(
        initialTrade.riskPercentage !== undefined
          ? String(initialTrade.riskPercentage)
          : String(settings.defaultRiskPercent)
      );
      setOutcome(initialTrade.outcome || 'WIN');
      setGrossProfit(
        initialTrade.grossProfit !== undefined ? String(initialTrade.grossProfit) : ''
      );
      setCommission(
        initialTrade.commission !== undefined ? String(initialTrade.commission) : '0'
      );
      setSwap(initialTrade.swap !== undefined ? String(initialTrade.swap) : '0');
      setNetProfit(initialTrade.netProfit !== undefined ? String(initialTrade.netProfit) : '');
      setScreenshotUrl(initialTrade.screenshotUrl || '');
      setNotes(initialTrade.notes || '');
      setEntryReason(initialTrade.entryReason || '');
      setPostTradeEvaluation(initialTrade.postTradeEvaluation || '');
      setDisciplineRating(initialTrade.disciplineRating || 5);
      setErrorMsg(null);
    } else {
      setId(generateUniqueId());
      setDateTime(normalizeTradeDateTimeLocal(new Date()));
      setInstrument('XAUUSD');
      setPosition('BUY');
      setStrategy('');
      setSession('London');
      setEntryPrice('');
      setStopLoss('');
      setTakeProfit('');
      setExitPrice('');
      setLotSize('0.10');
      setRiskAmount(String(Math.round((currentEquity * settings.defaultRiskPercent) / 100)));
      setRiskPercentage(String(settings.defaultRiskPercent));
      setOutcome('WIN');
      setGrossProfit('');
      setCommission('0');
      setSwap('0');
      setNetProfit('');
      setScreenshotUrl('');
      setNotes('');
      setEntryReason('');
      setPostTradeEvaluation('');
      setDisciplineRating(5);
      setErrorMsg(null);
    }
    pnlInputModeRef.current = 'gross';
  }, [initialTrade, currentEquity, settings.defaultRiskPercent]);

  // Auto calculate net profit (when in gross mode) or gross profit (when in manual net mode and fee/swap changes)
  useEffect(() => {
    const comm = Math.abs(parseFloat(commission) || 0);
    const swp = parseFloat(swap) || 0;

    if (pnlInputModeRef.current === 'net') {
      const numNet = parseFloat(netProfit);
      if (!isNaN(numNet)) {
        const syncedGross = computeGrossFromNet(numNet, comm, swp);
        setGrossProfit(syncedGross.toFixed(2));
        setOutcome(classifyNetProfitOutcome(numNet));
      }
      return;
    }

    const gross = parseFloat(grossProfit);
    if (!isNaN(gross)) {
      const net = computeNetFromGross(gross, comm, swp);
      setNetProfit(net.toFixed(2));
      setOutcome(classifyNetProfitOutcome(net));
    }
  }, [grossProfit, commission, swap]);

  const handleGrossProfitChange = (val: string) => {
    pnlInputModeRef.current = 'gross';
    setGrossProfit(val);
  };

  // If user modifies netProfit directly, synchronize grossProfit and outcome accordingly
  const handleNetProfitChange = (val: string) => {
    pnlInputModeRef.current = 'net';
    setNetProfit(val);
    const numNet = parseFloat(val);
    if (!isNaN(numNet)) {
      const comm = Math.abs(parseFloat(commission) || 0);
      const swp = parseFloat(swap) || 0;
      const syncedGross = computeGrossFromNet(numNet, comm, swp);
      setGrossProfit(syncedGross.toFixed(2));
      setOutcome(classifyNetProfitOutcome(numNet));
    }
  };

  // Quick lot calculator preview based on entry & SL
  const numEntry = parseFloat(entryPrice);
  const numSL = parseFloat(stopLoss);
  const numRisk = parseFloat(riskAmount);

  const lotCalcResult =
    !isNaN(numEntry) && !isNaN(numSL) && numEntry > 0 && numSL > 0
      ? calculateXauusdLot(
          {
            equity: currentEquity,
            riskPercent: parseFloat(riskPercentage) || 1,
            riskAmountManual: numRisk > 0 ? numRisk : undefined,
            entryPrice: numEntry,
            stopLossPrice: numSL,
            position,
          },
          settings
        )
      : null;

  // Handle image upload from computer / phone with automatic resizing & compression
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      triggerValidationError('Ukuran file gambar maksimal 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setScreenshotUrl(compressedDataUrl);
        } else {
          setScreenshotUrl(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCalculatedLot = () => {
    if (lotCalcResult?.isValid && lotCalcResult.recommendedLot > 0) {
      setLotSize(String(lotCalcResult.recommendedLot));
    }
  };

  // Outcome quick preset helpers
  const handleOutcomeChange = (newOutcome: TradeOutcome) => {
    pnlInputModeRef.current = 'gross';
    setOutcome(newOutcome);
    const riskVal = parseFloat(riskAmount) || 100;
    if (newOutcome === 'LOSS') {
      setGrossProfit((-riskVal).toFixed(2));
    } else if (newOutcome === 'BREAKEVEN') {
      setGrossProfit('0.00');
    } else if (newOutcome === 'WIN') {
      setGrossProfit((riskVal * 2).toFixed(2));
    }
  };

  const handleRegenerateId = () => {
    if (isSubmittingRef.current || isSubmitting) return;
    setId(generateUniqueId());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }
    setErrorMsg(null);

    const cleanId = id.trim();
    if (!cleanId) {
      triggerValidationError('ID Transaksi tidak boleh kosong.');
      return;
    }

    const isNewTrade = !initialTrade || initialTrade.id !== cleanId;
    if (isNewTrade) {
      const duplicateExists = existingTrades.some(
        (t) => t.id.toLowerCase() === cleanId.toLowerCase() && t.id !== initialTrade?.id
      );
      if (duplicateExists) {
        triggerValidationError(`ID Transaksi "${cleanId}" sudah digunakan oleh trade lain. Gunakan ID unik.`);
        return;
      }
    }

    if (!dateTime) {
      triggerValidationError('Tanggal dan waktu transaksi harus ditentukan.');
      return;
    }

    const cleanInstrument = instrument.trim().toUpperCase();
    if (!cleanInstrument) {
      triggerValidationError('Instrumen trading harus diisi (contoh: XAUUSD).');
      return;
    }

    if (!position || (position !== 'BUY' && position !== 'SELL')) {
      triggerValidationError('Arah transaksi (posisi) harus dipilih: Buy atau Sell.');
      return;
    }

    const parsedEntry = parseFloat(entryPrice);
    if (isNaN(parsedEntry) || parsedEntry <= 0) {
      triggerValidationError('Entry Price harus berupa angka positif yang valid.');
      return;
    }

    const parsedLot = parseFloat(lotSize);
    if (isNaN(parsedLot) || parsedLot <= 0) {
      triggerValidationError('Lot Size harus berupa angka positif lebih dari 0.');
      return;
    }

    let parsedSL: number | undefined = undefined;
    if (stopLoss.trim() !== '') {
      const num = parseFloat(stopLoss);
      if (isNaN(num) || num <= 0) {
        triggerValidationError('Stop Loss harus berupa angka positif jika diisi.');
        return;
      }
      parsedSL = num;
    }

    let parsedTP: number | undefined = undefined;
    if (takeProfit.trim() !== '') {
      const num = parseFloat(takeProfit);
      if (isNaN(num) || num <= 0) {
        triggerValidationError('Take Profit harus berupa angka positif jika diisi.');
        return;
      }
      parsedTP = num;
    }

    let parsedExit: number | undefined = undefined;
    if (exitPrice.trim() !== '') {
      const num = parseFloat(exitPrice);
      if (isNaN(num) || num <= 0) {
        triggerValidationError('Exit Price harus berupa angka positif jika diisi.');
        return;
      }
      parsedExit = num;
    }

    const parsedNet = parseFloat(netProfit);
    if (isNaN(parsedNet)) {
      triggerValidationError('Hasil bersih (Net Profit) harus berupa angka yang valid.');
      return;
    }

    const parsedGross = parseFloat(grossProfit);
    const normalizedComm = Math.abs(parseFloat(commission) || 0);
    const parsedSwp = parseFloat(swap) || 0;
    const parsedRiskAmt = parseFloat(riskAmount) || 0;
    const parsedRiskPct = parseFloat(riskPercentage) || 0;
    const normalizedNet = Number(parsedNet.toFixed(2));

    const computedR = computeRealizedRMultiple({
      netProfit: normalizedNet,
      riskAmount: parsedRiskAmt,
    });
    const rMultiple: number | undefined = computedR !== null ? computedR : undefined;

    const finalOutcome: TradeOutcome = classifyNetProfitOutcome(normalizedNet);

    const synchronizedGross =
      isNaN(parsedGross) ||
      pnlInputModeRef.current === 'net' ||
      Math.abs(computeNetFromGross(parsedGross, normalizedComm, parsedSwp) - normalizedNet) > 0.005
        ? computeGrossFromNet(normalizedNet, normalizedComm, parsedSwp)
        : Number(parsedGross.toFixed(2));

    const tradeData: Trade = {
      id: cleanId,
      dateTime,
      instrument: cleanInstrument,
      position,
      strategy: strategy.trim() || 'Umum',
      session: session.trim() || 'London',
      entryPrice: parsedEntry,
      stopLoss: parsedSL,
      takeProfit: parsedTP,
      exitPrice: parsedExit,
      lotSize: parsedLot,
      riskAmount: parsedRiskAmt,
      riskPercentage: parsedRiskPct,
      outcome: finalOutcome,
      grossProfit: synchronizedGross,
      commission: normalizedComm,
      swap: parsedSwp,
      netProfit: normalizedNet,
      rMultiple,
      screenshotUrl: screenshotUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      entryReason: entryReason.trim() || undefined,
      postTradeEvaluation: postTradeEvaluation.trim() || undefined,
      disciplineRating,
      isDemo: initialTrade?.isDemo || false,
      updatedAt: new Date().toISOString(),
    };

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const saveResult = await onSave(tradeData, initialTrade?.id);
      if (saveResult && typeof saveResult === 'object') {
        if (saveResult.uploadedScreenshotPath) {
          setScreenshotUrl(saveResult.uploadedScreenshotPath);
        }
        if (!saveResult.success && !saveResult.ignored && saveResult.error) {
          triggerValidationError(saveResult.error);
        }
      }
    } catch (err: any) {
      triggerValidationError(
        err?.message || 'Gagal menyimpan transaksi. Silakan periksa koneksi Anda dan coba lagi.'
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-[#DDE3EA] dark:border-[#252B34] bg-white dark:bg-[#11151B] p-4 sm:p-6 transition-colors duration-150">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#DDE3EA] dark:border-[#252B34]">
        <div>
          <h2 className="text-lg font-bold text-[#151D2A] dark:text-[#F2F5F9]">
            {initialTrade ? `Edit Transaksi: ${initialTrade.id}` : 'Catat Transaksi Baru'}
          </h2>
          <p className="text-xs text-[#697586] dark:text-[#929BA9]">
            Sumber data tunggal Trade Log • Tersinkronisasi otomatis ke Dashboard, Analitik &amp; Kurva Ekuitas
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg p-2 text-[#697586] dark:text-[#929BA9] hover:bg-[#EEF2F6] dark:hover:bg-[#171D26] hover:text-[#151D2A] dark:hover:text-[#F2F5F9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Tutup Form"
          aria-label="Tutup form transaksi"
        >
          <X className="h-5 w-5 stroke-[1.75]" />
        </button>
      </div>

      {/* Non-destructive Error Banner */}
      <div ref={errorRef} tabIndex={-1} className="outline-none">
        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] p-3 text-xs text-rose-600 dark:text-rose-400 animate-in fade-in duration-150">
            <AlertCircle className="h-4 w-4 stroke-[1.75] shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {/* Row 1: ID Transaksi, Tanggal/Waktu, Instrumen, Arah Transaksi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* ID Transaksi */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">ID Transaksi Unik</label>
              <button
                type="button"
                onClick={handleRegenerateId}
                disabled={isSubmitting}
                className="text-[10px] text-[#1769E8] hover:underline flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Buat ID baru secara acak"
              >
                <RefreshCw className="h-3 w-3 stroke-[1.75]" />
                <span>Acak ID</span>
              </button>
            </div>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums font-semibold"
              placeholder="TRD-XXXXXX"
              required
            />
          </div>

          {/* Tanggal & Waktu */}
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Tanggal &amp; Waktu
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              required
            />
          </div>

          {/* Instrumen */}
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Instrumen (Default: XAUUSD)
            </label>
            <input
              type="text"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value.toUpperCase())}
              placeholder="XAUUSD"
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-bold uppercase tracking-wider"
              required
            />
          </div>

          {/* Arah Transaksi */}
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Arah Transaksi (Posisi)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPosition('BUY')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                  position === 'BUY'
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-emerald-600 dark:text-emerald-400 border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                BUY / LONG
              </button>
              <button
                type="button"
                onClick={() => setPosition('SELL')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                  position === 'SELL'
                    ? 'bg-[#EEF2F6] dark:bg-[#171D26] text-rose-600 dark:text-rose-400 border-[#1769E8]'
                    : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                SELL / SHORT
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Setup Strategi & Sesi Trading */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Setup / Strategi Trading
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                placeholder="Contoh: London Open Liquidity Sweep + CHoCH"
                className="flex-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
              />
              <select
                onChange={(e) => {
                  if (e.target.value) setStrategy(e.target.value);
                }}
                className="rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#697586] dark:text-[#929BA9] focus:border-[#1769E8] focus:outline-none"
              >
                <option value="">Pilih Preset...</option>
                {COMMON_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
                Sesi Trading
              </span>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">Waktu Pasar Aktif</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COMMON_SESSIONS.map((sess) => (
                <button
                  key={sess.key}
                  type="button"
                  onClick={() => setSession(sess.key)}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-left transition-colors ${
                    session === sess.key
                      ? 'bg-[#1769E8] text-white border-[#1769E8]'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                  title={sess.timeHint}
                >
                  <span className="block font-semibold truncate">{sess.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Entry Price, Stop Loss, Take Profit, Exit Price */}
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 stroke-[1.75] text-[#697586] dark:text-[#929BA9]" />
              Tingkat Harga Transaksi (XAUUSD)
            </span>
            {lotCalcResult?.isValid && (
              <span className="text-[11px] font-mono-numbers tabular-nums text-[#697586] dark:text-[#929BA9]">
                Jarak SL:{' '}
                <span className="text-rose-600 dark:text-rose-400 font-semibold">${lotCalcResult.slDistancePrice}</span>{' '}
                ({lotCalcResult.slDistancePips} pips)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[#151D2A] dark:text-[#F2F5F9] font-medium mb-1">
                Entry Price <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="2720.50"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums font-semibold"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-rose-600 dark:text-rose-400 mb-1 font-medium">
                Stop Loss (SL) <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-normal">(opsional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="2715.00"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-rose-600 dark:text-rose-400 focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-emerald-600 dark:text-emerald-400 mb-1 font-medium">
                Take Profit (TP) <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-normal">(opsional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="2735.00"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#151D2A] dark:text-[#F2F5F9] mb-1">
                Exit Price <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-normal">(opsional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="2734.00"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Row 4: Lot Size & Risk Management */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                Lot Size <span className="text-rose-500">*</span>
              </label>
              {lotCalcResult?.isValid && (
                <button
                  type="button"
                  onClick={handleApplyCalculatedLot}
                  className="text-[10px] text-[#1769E8] hover:underline flex items-center gap-0.5"
                >
                  <Calculator className="h-3 w-3 stroke-[1.75]" />
                  Pakai Lot Rekomendasi ({lotCalcResult.recommendedLot})
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Risk Amount ({settings.currencySymbol})
            </label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={riskAmount}
              onChange={(e) => {
                const amt = e.target.value;
                setRiskAmount(amt);
                if (currentEquity > 0 && parseFloat(amt) >= 0) {
                  setRiskPercentage(((parseFloat(amt) / currentEquity) * 100).toFixed(2));
                }
              }}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">Risk (%)</label>
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={riskPercentage}
              onChange={(e) => {
                const pct = e.target.value;
                setRiskPercentage(pct);
                if (currentEquity > 0 && parseFloat(pct) >= 0) {
                  setRiskAmount(((currentEquity * parseFloat(pct)) / 100).toFixed(2));
                }
              }}
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
            />
          </div>
        </div>

        {/* Row 5: Hasil Finansial, Komisi, Swap & Net PnL */}
        <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#171D26] border border-[#DDE3EA] dark:border-[#252B34] space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
              <label className="text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9]">
                Kategori Hasil Transaksi (Otomatis dari Net P/L)
              </label>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9]">
                Net &gt; $0 = WIN • Net &lt; $0 = LOSS • Net = $0 = BREAKEVEN
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleOutcomeChange('WIN')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                  outcome === 'WIN'
                    ? 'bg-white dark:bg-[#11151B] text-emerald-600 dark:text-emerald-400 border-[#1769E8]'
                    : 'bg-white dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                WIN (Profit)
              </button>
              <button
                type="button"
                onClick={() => handleOutcomeChange('LOSS')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                  outcome === 'LOSS'
                    ? 'bg-white dark:bg-[#11151B] text-rose-600 dark:text-rose-400 border-[#1769E8]'
                    : 'bg-white dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                LOSS (Rugi)
              </button>
              <button
                type="button"
                onClick={() => handleOutcomeChange('BREAKEVEN')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors border ${
                  outcome === 'BREAKEVEN'
                    ? 'bg-white dark:bg-[#11151B] text-[#1769E8] border-[#1769E8]'
                    : 'bg-white dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                }`}
              >
                BREAKEVEN (BE)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Gross Profit ($)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={grossProfit}
                onChange={(e) => handleGrossProfitChange(e.target.value)}
                placeholder="600.00"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Komisi / Fee ($)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="4.50"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#697586] dark:text-[#929BA9] mb-1">Swap ($)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={swap}
                onChange={(e) => setSwap(e.target.value)}
                placeholder="-1.20"
                className="w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] focus:border-[#1769E8] focus:outline-none font-mono-numbers tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#151D2A] dark:text-[#F2F5F9] font-semibold mb-1">
                Net Profit Bersih ($) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={netProfit}
                onChange={(e) => handleNetProfitChange(e.target.value)}
                placeholder="594.30"
                className={`w-full rounded-lg bg-white dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs font-bold font-mono-numbers tabular-nums focus:border-[#1769E8] focus:outline-none ${
                  parseFloat(netProfit) > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : parseFloat(netProfit) < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#151D2A] dark:text-[#F2F5F9]'
                }`}
                required
              />
            </div>
          </div>
        </div>

        {/* Row 6: Screenshot Chart & Rating Disiplin */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1 flex items-center justify-between">
              <span>Screenshot Chart (Lokal / URL)</span>
              <span className="text-[10px] text-[#697586] dark:text-[#929BA9] font-normal">Kompresi otomatis</span>
            </label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] hover:border-[#1769E8] text-xs text-[#151D2A] dark:text-[#F2F5F9] cursor-pointer transition-colors">
                <Upload className="h-3.5 w-3.5 stroke-[1.75] text-[#1769E8]" />
                <span>Pilih Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <input
                type="text"
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                placeholder="Atau tempel URL gambar..."
                className="flex-1 rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] px-3 py-2 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
              />
            </div>

            {screenshotUrl && (
              <div className="mt-2 relative rounded-lg overflow-hidden border border-[#DDE3EA] dark:border-[#252B34] h-36 bg-[#F5F7FA] dark:bg-[#080A0E] flex items-center justify-center group">
                {isPreviewLoading ? (
                  <div className="flex items-center gap-2 text-[#1769E8] text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memuat pratinjau...</span>
                  </div>
                ) : previewDisplayUrl ? (
                  <img
                    src={previewDisplayUrl}
                    alt="Chart Preview"
                    width={800}
                    height={450}
                    decoding="async"
                    className="w-full h-36 object-cover"
                  />
                ) : (
                  <span className="text-xs text-[#697586] dark:text-[#929BA9]">Pratinjau tidak tersedia</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setScreenshotUrl('');
                    setPreviewDisplayUrl('');
                  }}
                  className="absolute top-1.5 right-1.5 rounded-full bg-white/90 dark:bg-[#11151B]/90 border border-[#DDE3EA] dark:border-[#252B34] p-1 text-[#151D2A] dark:text-[#F2F5F9] hover:text-rose-500 z-10"
                  title="Hapus Gambar"
                  aria-label="Hapus screenshot"
                >
                  <X className="h-3.5 w-3.5 stroke-[1.75]" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Rating Kepatuhan Disiplin (Trading Plan)
            </label>
            <div className="flex items-center gap-2 py-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setDisciplineRating(star)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    disciplineRating >= star
                      ? 'bg-[#1769E8]/15 text-[#1769E8] border-[#1769E8]/40'
                      : 'bg-[#F5F7FA] dark:bg-[#080A0E] text-[#697586] dark:text-[#929BA9] border-[#DDE3EA] dark:border-[#252B34] hover:text-[#151D2A] dark:hover:text-[#F2F5F9]'
                  }`}
                >
                  ★ {star}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#697586] dark:text-[#929BA9] mt-1">
              {disciplineRating === 5
                ? 'Sangat Disiplin: Eksekusi 100% patuh rencana tanpa emosi/FOMO.'
                : disciplineRating >= 3
                ? 'Cukup Disiplin: Ada sedikit deviasi manajemen risiko atau early exit.'
                : 'Tidak Disiplin: Terjadi overtrading, revenge trade, atau menggeser SL.'}
            </p>
          </div>
        </div>

        {/* Row 7: Alasan Entry, Evaluasi & Catatan Terstruktur */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Alasan Entry (Konfirmasi Teknikal)
            </label>
            <textarea
              rows={2}
              value={entryReason}
              onChange={(e) => setEntryReason(e.target.value)}
              placeholder="Konfirmasi apa yang memicu entry (misal: Liquidity sweep sesi London, retest FVG M15)..."
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
              Evaluasi Pasca-Trade &amp; Pelajaran
            </label>
            <textarea
              rows={2}
              value={postTradeEvaluation}
              onChange={(e) => setPostTradeEvaluation(e.target.value)}
              placeholder="Bagaimana psikologi saat floating, apakah exit tepat, apa yang bisa diperbaiki..."
              className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
            />
          </div>
        </div>

        {/* Row 8: Catatan Tambahan */}
        <div>
          <label className="block text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] mb-1">
            Catatan Tambahan
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan umum lainnya..."
            className="w-full rounded-lg bg-[#F5F7FA] dark:bg-[#080A0E] border border-[#DDE3EA] dark:border-[#252B34] p-2.5 text-xs text-[#151D2A] dark:text-[#F2F5F9] placeholder-[#697586] dark:placeholder-[#929BA9] focus:border-[#1769E8] focus:outline-none"
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DDE3EA] dark:border-[#252B34]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-[#DDE3EA] dark:border-[#252B34] bg-[#F5F7FA] dark:bg-[#171D26] text-xs font-semibold text-[#151D2A] dark:text-[#F2F5F9] hover:border-[#1769E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#1769E8] hover:bg-[#1458C4] text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{initialTrade ? 'Memperbarui...' : 'Menyimpan...'}</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4 stroke-[1.75]" />
                <span>{initialTrade ? 'Perbarui Transaksi' : 'Simpan Transaksi'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
