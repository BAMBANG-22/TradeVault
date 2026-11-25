/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VelaWorkspace, type VelaWorkspaceOptions } from '@luxalgo/vela/workspace';
import { AlertTriangle, Cpu, Layers, RotateCcw, Sparkles } from 'lucide-react';
import { isNativeAndroidOrIos } from '../../utils/apiConfig';
import {
  mapTradeVaultIntervalToVela,
  mapTradeVaultSymbolToVela,
  TradeVaultVelaProvider,
  type VelaFeedStatus,
} from '../../utils/velaTradeVaultProvider';

const VELA_BACKEND_STORAGE_KEY = 'tradevault_vela_beta_backend_v1';
const VELA_WORKSPACE_PERSIST_KEY = 'tradevault_vela_beta_workspace_v1';

type VelaNativeBackend = NonNullable<VelaWorkspaceOptions['nativeBackend']>;
type QuickLayoutId = '1' | '2h' | '4';

export interface VelaBetaChartViewProps {
  symbol: string;
  interval: string;
  isDark: boolean;
  isEn: boolean;
  onExitBeta: () => void;
}

function loadInitialBackend(): VelaNativeBackend {
  const defaultBackend: VelaNativeBackend = isNativeAndroidOrIos() ? 'canvas2d' : 'auto';
  if (typeof window === 'undefined') return defaultBackend;
  try {
    const raw = window.localStorage.getItem(VELA_BACKEND_STORAGE_KEY);
    if (raw === 'canvas2d' || raw === 'webgl2' || raw === 'auto') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return defaultBackend;
}

function saveBackend(backend: VelaNativeBackend): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VELA_BACKEND_STORAGE_KEY, backend);
  } catch {
    // ignore storage errors
  }
}

const VelaBetaChartView: React.FC<VelaBetaChartViewProps> = ({
  symbol,
  interval,
  isDark,
  isEn,
  onExitBeta,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<VelaWorkspace | null>(null);

  const [backend, setBackend] = useState<VelaNativeBackend>(() => loadInitialBackend());
  const [activeLayout, setActiveLayout] = useState<string>('1');
  const [feedStatus, setFeedStatus] = useState<VelaFeedStatus | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const initialVelaSymbol = useMemo(() => mapTradeVaultSymbolToVela(symbol), [symbol]);
  const initialVelaTimeframe = useMemo(() => mapTradeVaultIntervalToVela(interval), [interval]);
  const isNativeApk = useMemo(() => isNativeAndroidOrIos(), []);

  const tr = (idText: string, enText: string) => (isEn ? enText : idText);

  const handleSelectBackend = (next: VelaNativeBackend) => {
    setInitError(null);
    saveBackend(next);
    setBackend(next);
  };

  const handleSelectLayout = (layoutId: QuickLayoutId) => {
    const ws = workspaceRef.current;
    if (!ws) return;
    try {
      ws.setLayout(layoutId);
      setActiveLayout(layoutId);
    } catch (err) {
      console.warn('[VelaBeta] setLayout failed:', err);
    }
  };

  // Mount & recreate VelaWorkspace when renderer backend or manual reload changes
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unsubLayout: (() => void) | null = null;

    setInitError(null);
    host.innerHTML = '';

    try {
      const provider = new TradeVaultVelaProvider({
        onStatus: (status) => {
          if (!disposed) {
            setFeedStatus(status);
          }
        },
      });

      const workspace = new VelaWorkspace(host, {
        layout: '1',
        symbol: initialVelaSymbol,
        timeframe: initialVelaTimeframe,
        live: true,
        theme: isDark ? 'dark' : 'light',
        nativeBackend: backend,
        providers: {
          tradevault: () => provider,
        },
        persist: VELA_WORKSPACE_PERSIST_KEY,
        autofocus: false,
        symbolMenuFromKey: true,
        layoutMode: 'auto',
      });

      workspaceRef.current = workspace;
      setActiveLayout(workspace.layout?.id || '1');

      unsubLayout = workspace.on('layout:changed', (payload) => {
        if (!disposed && payload?.layout) {
          setActiveLayout(payload.layout);
        }
      });

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!disposed && workspaceRef.current) {
            try {
              workspaceRef.current.resize();
            } catch {
              // ignore resize race during teardown
            }
          }
        });
        resizeObserver.observe(host);
      }
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : String(err || 'Vela initialization error');
      console.error('[VelaBeta] Workspace initialization failed:', err);
      setInitError(message);
    }

    return () => {
      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (unsubLayout) {
        try {
          unsubLayout();
        } catch {
          // ignore
        }
      }
      if (workspaceRef.current) {
        try {
          workspaceRef.current.destroy();
        } catch {
          // ignore teardown errors
        }
        workspaceRef.current = null;
      }
      if (host) {
        host.innerHTML = '';
      }
    };
    // Theme updates are synced live in the dedicated effect below to avoid rebuilding the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, reloadNonce]);

  // Live theme sync without tearing down the Vela workspace
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    try {
      ws.setTheme(isDark ? 'dark' : 'light');
    } catch {
      // ignore if workspace is mid-transition
    }
  }, [isDark]);

  const sourceBadge = useMemo(() => {
    if (!feedStatus) {
      return {
        label: tr('Memuat feed...', 'Loading feed...'),
        tone: 'text-[#868993] bg-[#1E222D] border-white/[0.08]',
      };
    }
    if (feedStatus.source === 'binance') {
      return {
        label: `Live · Binance (${feedStatus.barCount})`,
        tone: 'text-[#089981] bg-[#089981]/10 border-[#089981]/30',
      };
    }
    if (feedStatus.source === 'twelvedata') {
      return {
        label: `Live · TwelveData (${feedStatus.barCount})`,
        tone: 'text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/30',
      };
    }
    if (feedStatus.source === 'cache') {
      return {
        label: tr(
          `Cache Offline (${feedStatus.barCount})`,
          `Offline Cache (${feedStatus.barCount})`
        ),
        tone: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30',
      };
    }
    return {
      label: tr('Offline / Data Kosong', 'Offline / No Data'),
      tone: 'text-[#F23645] bg-[#F23645]/10 border-[#F23645]/30',
    };
  }, [feedStatus, isEn]);

  return (
    <div
      data-testid="vela-beta-chart-overlay"
      className="absolute inset-0 z-15 flex flex-col w-full h-full min-h-0 min-w-0 bg-[#0B0E14] text-[#D1D4DC] overflow-hidden"
      style={{ touchAction: 'auto' }}
    >
      {/* Compact Experimental Control Bar */}
      <div
        data-testid="vela-beta-control-strip"
        className="shrink-0 min-h-8 px-2 sm:px-3 py-1 bg-[#131722] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-1.5 text-[10px] select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 font-semibold tracking-tight shrink-0">
            <Sparkles className="h-2.5 w-2.5" />
            <span>Vela Beta</span>
          </span>

          <span
            data-testid="vela-beta-feed-status"
            className={`inline-flex items-center px-1.5 py-0.5 rounded border font-medium truncate max-w-[170px] sm:max-w-[220px] ${sourceBadge.tone}`}
            title={
              feedStatus
                ? `${feedStatus.ticker} (${feedStatus.timeframe}) — ${sourceBadge.label}`
                : undefined
            }
          >
            {sourceBadge.label}
          </span>

          {isNativeApk && backend === 'canvas2d' && (
            <span className="hidden md:inline text-[9px] text-[#787B86]">
              {tr('Mode aman Android WebView', 'Android WebView safe mode')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Multi-Chart Layout Switcher */}
          <div
            className="hidden sm:flex items-center bg-[#0B0E14] p-0.5 rounded border border-white/[0.08]"
            title={tr('Tata Letak Multi-Chart Vela', 'Vela Multi-Chart Layout')}
          >
            <Layers className="h-2.5 w-2.5 text-[#787B86] mx-1" />
            {(['1', '2h', '4'] as QuickLayoutId[]).map((layoutId) => {
              const label = layoutId === '1' ? '1' : layoutId === '2h' ? '2H' : '4';
              const isSelected = activeLayout === layoutId;
              return (
                <button
                  key={layoutId}
                  type="button"
                  onClick={() => handleSelectLayout(layoutId)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#2A2E39] text-white'
                      : 'text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Renderer Backend Switcher (Canvas2D default on APK, WebGL2 optional benchmark) */}
          <div
            data-testid="vela-beta-backend-switcher"
            className="flex items-center bg-[#0B0E14] p-0.5 rounded border border-white/[0.08]"
            title={tr(
              'Pilih engine render: Canvas2D paling stabil di APK Android, WebGL2 lebih cepat bila GPU mendukung',
              'Choose renderer backend: Canvas2D is safest on Android APK, WebGL2 is faster when supported'
            )}
          >
            <Cpu className="h-2.5 w-2.5 text-[#787B86] mx-1" />
            {(
              [
                { id: 'canvas2d', label: '2D' },
                { id: 'webgl2', label: 'WebGL2' },
                { id: 'auto', label: 'Auto' },
              ] as Array<{ id: VelaNativeBackend; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`vela-backend-${opt.id}`}
                onClick={() => handleSelectBackend(opt.id)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors cursor-pointer touch-manipulation ${
                  backend === opt.id
                    ? 'bg-[#2A2E39] text-white'
                    : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            title={tr('Muat ulang Vela Workspace', 'Reload Vela Workspace')}
            className="inline-flex items-center justify-center h-6 w-6 rounded bg-[#1E222D] hover:bg-[#2A2E39] border border-white/[0.08] text-[#B2B5BE] cursor-pointer touch-manipulation"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Main Vela Workspace Mount Surface */}
      <div className="relative flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden">
        {initError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0B0E14] z-20">
            <div className="max-w-sm rounded-xl bg-[#131722] border border-white/10 p-5 shadow-xl space-y-3">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-[#F23645]/15 text-[#F23645] mx-auto">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-white">
                {tr('Vela Beta Gagal Dimuat', 'Vela Beta Failed to Initialize')}
              </h3>
              <p className="text-xs text-[#9CA3AF] leading-relaxed break-words">
                {initError}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {backend !== 'canvas2d' && (
                  <button
                    type="button"
                    onClick={() => handleSelectBackend('canvas2d')}
                    className="px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    {tr('Coba Mode Canvas2D', 'Try Canvas2D Mode')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExitBeta}
                  className="px-3 py-1.5 rounded-md bg-[#2A2E39] hover:bg-[#363A45] text-white text-xs font-semibold cursor-pointer"
                >
                  {tr('Kembali ke Replay Chart', 'Back to Replay Chart')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={hostRef}
          data-testid="vela-workspace-host"
          className="w-full h-full min-h-0 min-w-0 overflow-hidden"
        />
      </div>
    </div>
  );
};

export default VelaBetaChartView;
