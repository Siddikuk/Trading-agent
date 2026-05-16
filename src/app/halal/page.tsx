'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, RefreshCw, Wallet, ShieldCheck, AlertTriangle,
  Sparkles, Plus, Minus, Check, Info, BookOpen, X,
  Trash2, Pause, Play, Activity, HelpCircle, Link as LinkIcon, Settings,
  Eye, EyeOff,
} from 'lucide-react';

// ───── types (mirror the API) ─────

type Action = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'TRIM' | 'SELL' | 'AVOID';

interface HalalAsset {
  yahoo: string; ticker: string; name: string;
  type: 'ETF' | 'STOCK'; sector: string;
  currency: 'GBP' | 'GBp' | 'USD';
  isaEligible: boolean;
  status: 'certified' | 'screened';
  note: string;
}

interface AssetSnapshot {
  asset: HalalAsset;
  priceNative: number; priceCurrency: string; priceGBP: number; changePct1d: number;
  rsi: number; sma20: number; sma50: number; ema9: number;
  macdHist: number; atrPct: number; pctFrom52wHigh: number; momentum20d: number;
  score: number; action: Action; reasons: string[];
}

interface AllocationPick {
  yahoo: string; ticker: string; name: string;
  amountGBP: number; estUnits: number; priceGBP: number;
  score: number; reasons: string[];
}

interface HoldingVerdict {
  yahoo: string; units: number; avgPriceGBP: number;
  currentPriceGBP: number; valueGBP: number;
  pnlGBP: number; pnlPct: number;
  action: Action;
  unitsToSell?: number; proceedsGBP?: number;
  reasons: string[];
}

interface GamePlan {
  asOf: string;
  budgetGBP: number; cashAvailableGBP: number; fxGbpPerUsd: number;
  snapshots: AssetSnapshot[];
  buyPlan: AllocationPick[];
  holdingsVerdict: HoldingVerdict[];
  portfolioValueGBP: number; portfolioPnlGBP: number; portfolioPnlPct: number;
  warnings: string[];
}

interface StoredHolding {
  yahoo: string; units: number; avgPriceGBP: number; addedAt: string;
}

interface Deposit {
  id: string;
  amountGBP: number; // positive = deposit, negative = withdrawal
  at: string;        // ISO timestamp
  note?: string;
}

const STORAGE_KEY   = 'halal-portfolio-v1';
const BUDGET_KEY    = 'halal-budget-v1';
const DEPOSITS_KEY  = 'halal-deposits-v1';
const CERTIFIED_ONLY_KEY = 'halal-certified-only-v1';
// Trading 212 API key is stored only in localStorage on this device.
// It never gets persisted on the server.
const T212_KEY      = 'halal-t212-key-v1';
const T212_MODE_KEY = 'halal-t212-mode-v1'; // "live" | "demo"

// ───── helpers ─────

const gbp = (n: number) => `£${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

// Match what Trading 212 shows on the price tile. T212 displays
// LSE-listed USD share classes with a £ sign but the USD value
// (no conversion), so we mirror that to avoid confusion. For genuine
// GBp tickers Yahoo gives pence — we already divided by 100 in priceGBP.
function formatT212Price(priceNative: number, currency: string): string {
  if (currency === 'USD') return `£${priceNative.toFixed(2)}`;
  if (currency === 'GBp' || currency === 'GBX') return `£${(priceNative / 100).toFixed(2)}`;
  return `£${priceNative.toFixed(2)}`;
}

// True £ value after FX — what £1 of your ISA actually buys.
function formatRealGBP(priceGBP: number, priceNative: number, currency: string): string | null {
  if (currency === 'USD') return `≈ £${priceGBP.toFixed(2)} after FX`;
  return null;
}

const ACTION_STYLE: Record<Action, { bg: string; text: string; border: string; label: string }> = {
  STRONG_BUY: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/40', label: 'STRONG BUY' },
  BUY:        { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30', label: 'BUY' },
  HOLD:       { bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/30',   label: 'HOLD' },
  TRIM:       { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/40',   label: 'TRIM HALF' },
  SELL:       { bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-500/40',    label: 'SELL' },
  // "WAIT" — chart says don't buy right now (overbought, downtrend, etc).
  // NOT a halal verdict — every asset in the universe is Sharia-screened.
  AVOID:      { bg: 'bg-slate-700/40',   text: 'text-slate-400',   border: 'border-slate-700',      label: 'WAIT' },
};

function loadHoldings(): StoredHolding[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveHoldings(h: StoredHolding[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch { /* ignore */ }
}
function loadBudget(): number {
  if (typeof window === 'undefined') return 50;
  const raw = window.localStorage.getItem(BUDGET_KEY);
  const n = raw ? parseFloat(raw) : 50;
  return isFinite(n) && n >= 0 ? n : 50;
}
function saveBudget(b: number) {
  try { window.localStorage.setItem(BUDGET_KEY, String(b)); } catch { /* ignore */ }
}
function loadDeposits(): Deposit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEPOSITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveDeposits(d: Deposit[]) {
  try { window.localStorage.setItem(DEPOSITS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ───── page ─────

export default function HalalPage() {
  const [budget, setBudget] = useState<number>(50);
  const [holdings, setHoldings] = useState<StoredHolding[]>([]);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'plan' | 'holdings' | 'universe'>('plan');
  const [showGuide, setShowGuide] = useState(false);
  const [confirming, setConfirming] = useState<{ pick: AllocationPick; snap?: AssetSnapshot } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositModal, setDepositModal] = useState(false);
  // T212 connection — key + mode kept in localStorage on this device only.
  const [t212Key, setT212Key] = useState<string>('');
  const [t212Mode, setT212Mode] = useState<'live' | 'demo'>('live');
  const [t212Modal, setT212Modal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // hydrate from localStorage on mount
  useEffect(() => {
    setBudget(loadBudget());
    setHoldings(loadHoldings());
    setDeposits(loadDeposits());
    if (typeof window !== 'undefined') {
      setCertifiedOnly(window.localStorage.getItem(CERTIFIED_ONLY_KEY) === '1');
      setT212Key(window.localStorage.getItem(T212_KEY) || '');
      const m = window.localStorage.getItem(T212_MODE_KEY);
      if (m === 'demo' || m === 'live') setT212Mode(m);
    }
    // open the guide on first visit
    if (typeof window !== 'undefined' && !window.localStorage.getItem('halal-seen-guide')) {
      setShowGuide(true);
      window.localStorage.setItem('halal-seen-guide', '1');
    }
  }, []);

  const toggleCertifiedOnly = (v: boolean) => {
    setCertifiedOnly(v);
    try { window.localStorage.setItem(CERTIFIED_ONLY_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  };

  const fetchPlan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/halal/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, holdings, certifiedOnly }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlan(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [budget, holdings, certifiedOnly]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchPlan, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchPlan]);

  // ── budget & holdings mutators ──

  const updateBudget = (next: number) => {
    setBudget(next); saveBudget(next);
  };

  const saveT212Settings = (key: string, mode: 'live' | 'demo') => {
    setT212Key(key); setT212Mode(mode);
    try {
      if (key) window.localStorage.setItem(T212_KEY, key);
      else window.localStorage.removeItem(T212_KEY);
      window.localStorage.setItem(T212_MODE_KEY, mode);
    } catch { /* ignore */ }
  };

  // Pull cash + positions from T212. Replaces local budget & holdings with
  // the authoritative values from the broker. Manual "I bought this" still
  // works for users without a key; the two paths coexist.
  const handleT212Sync = async (): Promise<void> => {
    if (!t212Key) { setT212Modal(true); return; }
    setSyncing(true); setSyncResult(null); setError(null);
    try {
      const res = await fetch('/api/t212/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: t212Key, isDemo: t212Mode === 'demo' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      // Cash overwrites budget (T212 is the source of truth).
      // Holdings are replaced with whatever T212 says we own — the merge
      // logic we use for manual buys doesn't apply here.
      updateBudget(data.cashGBP);
      const nextHoldings: StoredHolding[] = data.positions.map((p: { yahoo: string; units: number; avgPriceGBP: number }) => ({
        yahoo: p.yahoo,
        units: p.units,
        avgPriceGBP: p.avgPriceGBP,
        addedAt: new Date().toISOString(),
      }));
      setHoldings(nextHoldings); saveHoldings(nextHoldings);

      const skipped = (data.warnings ?? []).length;
      setSyncResult(
        `Synced — £${data.cashGBP.toFixed(2)} cash, ${nextHoldings.length} position${nextHoldings.length === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped — not in universe)` : ''}.`
      );
    } catch (e) {
      setError(`T212 sync failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setSyncing(false);
    }
  };
  const addHolding = (pick: AllocationPick, units: number, costGBP: number) => {
    // If the user already holds this asset, MERGE with a weighted-average
    // cost basis rather than replacing — otherwise a second buy silently
    // wipes the first one and the cash deducted before is unaccounted for.
    const existing = holdings.find(h => h.yahoo === pick.yahoo);
    const merged: StoredHolding = existing
      ? {
          yahoo: pick.yahoo,
          units: +(existing.units + units).toFixed(4),
          avgPriceGBP: +(((existing.units * existing.avgPriceGBP) + (units * pick.priceGBP)) / (existing.units + units)).toFixed(4),
          addedAt: existing.addedAt,
        }
      : { yahoo: pick.yahoo, units, avgPriceGBP: pick.priceGBP, addedAt: new Date().toISOString() };

    const next: StoredHolding[] = [
      ...holdings.filter(h => h.yahoo !== pick.yahoo),
      merged,
    ];
    setHoldings(next); saveHoldings(next);
    updateBudget(Math.max(0, +(budget - costGBP).toFixed(2)));
    setConfirming(null);
  };

  // Reset everything: clear holdings, deposits, set a fresh cash balance.
  // Optionally records the new cash as a fresh initial deposit so future
  // P/L calculations have a baseline to measure against.
  const resetAll = (newCash: number, asInitialDeposit: boolean) => {
    setHoldings([]); saveHoldings([]);
    updateBudget(newCash);
    if (asInitialDeposit && newCash > 0) {
      const d: Deposit[] = [{
        id: `init-${Date.now()}`,
        amountGBP: +newCash.toFixed(2),
        at: new Date().toISOString(),
        note: 'Starting balance',
      }];
      setDeposits(d); saveDeposits(d);
    } else {
      setDeposits([]); saveDeposits([]);
    }
  };

  // Add a weekly contribution (or any deposit / withdrawal).
  // Positive amount = top up; negative = withdrawal. Increments cash and
  // appends a row to the deposit log.
  const addDeposit = (amountGBP: number, note?: string) => {
    if (!isFinite(amountGBP) || amountGBP === 0) return;
    const d: Deposit = {
      id: `d-${Date.now()}`,
      amountGBP: +amountGBP.toFixed(2),
      at: new Date().toISOString(),
      note: note?.trim() || undefined,
    };
    const next = [d, ...deposits];
    setDeposits(next); saveDeposits(next);
    updateBudget(+(budget + amountGBP).toFixed(2));
    setDepositModal(false);
  };

  const removeDeposit = (id: string) => {
    const target = deposits.find(d => d.id === id);
    if (!target) return;
    if (!window.confirm(`Remove this deposit of ${gbp(target.amountGBP)}? Cash will be adjusted.`)) return;
    const next = deposits.filter(d => d.id !== id);
    setDeposits(next); saveDeposits(next);
    updateBudget(Math.max(0, +(budget - target.amountGBP).toFixed(2)));
  };
  const removeHolding = (yahoo: string, addBackProceeds?: number) => {
    setHoldings(prev => {
      const next = prev.filter(h => h.yahoo !== yahoo);
      saveHoldings(next);
      return next;
    });
    if (addBackProceeds && addBackProceeds > 0) {
      updateBudget(+(budget + addBackProceeds).toFixed(2));
    }
  };
  const partialSell = (yahoo: string, units: number, proceeds: number) => {
    setHoldings(prev => {
      const next = prev.map(h => h.yahoo === yahoo
        ? { ...h, units: +(h.units - units).toFixed(4) }
        : h
      ).filter(h => h.units > 0.0001);
      saveHoldings(next);
      return next;
    });
    updateBudget(+(budget + proceeds).toFixed(2));
  };

  // ── derived ──
  // Compute portfolio value LOCALLY from the holdings list, using the
  // freshest known prices from the plan snapshots when available and the
  // cost basis as a fallback. This keeps Total Equity = cash + invested
  // consistent across the brief window between "I bought this" updating
  // holdings/budget and the server returning a re-fetched plan.
  const portfolio = useMemo(() => {
    let valueGBP = 0;
    let costGBP = 0;
    for (const h of holdings) {
      const snap = plan?.snapshots.find(s => s.asset.yahoo === h.yahoo);
      const currentPrice = snap?.priceGBP ?? h.avgPriceGBP;
      valueGBP += h.units * currentPrice;
      costGBP += h.units * h.avgPriceGBP;
    }
    const pnlGBP = valueGBP - costGBP;
    const pnlPct = costGBP > 0 ? (pnlGBP / costGBP) * 100 : 0;
    return {
      valueGBP: +valueGBP.toFixed(2),
      costGBP: +costGBP.toFixed(2),
      pnlGBP: +pnlGBP.toFixed(2),
      pnlPct: +pnlPct.toFixed(2),
    };
  }, [holdings, plan]);

  const totalEquity = +(budget + portfolio.valueGBP).toFixed(2);
  const netDeposits = +deposits.reduce((s, d) => s + d.amountGBP, 0).toFixed(2);
  // "True" P/L = lifetime gain on everything you put in (including realised
  // gains from closed positions, which currently sit in cash). Falls back to
  // unrealised holdings P/L when no deposits have been logged yet.
  const truePnlGBP = netDeposits > 0
    ? +(totalEquity - netDeposits).toFixed(2)
    : portfolio.pnlGBP;
  const truePnlPct = netDeposits > 0
    ? +((truePnlGBP / netDeposits) * 100).toFixed(2)
    : portfolio.pnlPct;
  const pnlAbs = truePnlGBP;
  const pnlPct = truePnlPct;

  // ───────── render ─────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      {/* sticky top bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight">Halal ISA Coach</h1>
            <p className="text-[10px] text-slate-500 leading-tight">Trading 212 · Sharia-screened</p>
          </div>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`p-2 rounded-lg border ${autoRefresh ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-slate-800 text-slate-500'}`}
            aria-label="Toggle auto refresh"
          >
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={fetchPlan}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-800 text-slate-300 disabled:opacity-50"
            aria-label="Refresh now"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setT212Modal(true)}
            className={`p-2 rounded-lg border ${t212Key ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'border-slate-800 text-slate-500'}`}
            aria-label="T212 connection settings"
            title={t212Key ? 'T212 connected — tap to manage' : 'Connect Trading 212'}
          >
            <LinkIcon size={14} />
          </button>
          <button
            onClick={() => setShowGuide(true)}
            className="p-2 rounded-lg border border-slate-800 text-slate-300"
            aria-label="Open guide"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">

        {/* Total equity / portfolio card */}
        <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Equity</p>
              <p className="text-3xl font-bold text-white mt-1">{gbp(totalEquity)}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500">Cash {gbp(budget)}</span>
                <span className="text-[10px] text-slate-700">·</span>
                <span className="text-[10px] text-slate-500">Invested {gbp(portfolio.valueGBP)}</span>
              </div>
            </div>
            <div className={`text-right ${pnlAbs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <div className="flex items-center gap-1 justify-end">
                {pnlAbs >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span className="text-sm font-bold">{pct(pnlPct)}</span>
              </div>
              <p className="text-xs mt-0.5">{pnlAbs >= 0 ? '+' : ''}{gbp(Math.abs(pnlAbs))}</p>
              {netDeposits > 0 ? (
                <p className="text-[10px] text-slate-600 mt-0.5">on {gbp(netDeposits)} deposited</p>
              ) : portfolio.costGBP > 0 && (
                <p className="text-[10px] text-slate-600 mt-0.5">on {gbp(portfolio.costGBP)} invested</p>
              )}
            </div>
          </div>

          {/* budget editor */}
          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                <Wallet size={11} /> Cash to deploy
              </label>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={handleT212Sync}
                  disabled={syncing}
                  className="text-[10px] text-sky-300 hover:text-sky-200 flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/10 border border-sky-500/30 disabled:opacity-50"
                  title={t212Key ? 'Pull live cash & positions from Trading 212' : 'Connect T212 first'}
                >
                  <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
                  Sync T212
                </button>
                <button
                  onClick={() => setDepositModal(true)}
                  className="text-[10px] text-emerald-300 hover:text-emerald-200 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30"
                >
                  <Plus size={10} /> Add cash
                </button>
                <button
                  onClick={() => {
                    const v = window.prompt(
                      'Reset — clear tracked holdings and set cash to:',
                      String(budget || 50),
                    );
                    if (v === null) return;
                    const n = parseFloat(v);
                    if (!isFinite(n) || n < 0) return;
                    const treatAsDeposit = window.confirm(
                      `Clear all tracked holdings + deposits and set cash to £${n.toFixed(2)}.\n\nOK = log £${n.toFixed(2)} as your starting deposit (recommended)\nCancel = clear deposits too, start completely fresh`,
                    );
                    resetAll(n, treatAsDeposit);
                  }}
                  className="text-[10px] text-slate-500 hover:text-rose-300 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-rose-500/10"
                >
                  <Trash2 size={10} /> Reset
                </button>
              </div>
            </div>
            {syncResult && (
              <div className="mb-2 px-2 py-1.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-[10px] text-sky-200 flex items-start gap-1.5">
                <Check size={11} className="flex-shrink-0 mt-0.5" />
                <span>{syncResult}</span>
                <button onClick={() => setSyncResult(null)} className="ml-auto text-sky-300/60 hover:text-sky-200">
                  <X size={11} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-slate-500 text-lg">£</span>
              <input
                type="number"
                inputMode="decimal"
                value={budget}
                onChange={e => updateBudget(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-lg font-mono focus:border-emerald-500/50 focus:outline-none"
              />
              {[10, 25, 50, 100].map(v => (
                <button
                  key={v}
                  onClick={() => updateBudget(v)}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-800 text-slate-400 active:bg-slate-800"
                >{v}</button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5">
              {netDeposits > 0 && (
                <>Deposited {gbp(netDeposits)} lifetime · </>
              )}
              FX 1 USD ≈ £{plan?.fxGbpPerUsd.toFixed(4) ?? '—'} · T212 ISA charges ~0.15% FX
            </p>
          </div>
        </section>

        {/* tabs */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
          {(['plan', 'holdings', 'universe'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition-all ${
                tab === t ? 'bg-slate-800 text-white shadow' : 'text-slate-500'
              }`}
            >
              {t === 'plan' ? 'Game Plan' : t === 'holdings' ? `My Stocks${holdings.length ? ` (${holdings.length})` : ''}` : 'Universe'}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        )}

        {/* ── PLAN TAB ── */}
        {tab === 'plan' && plan && (
          <PlanTab
            plan={plan}
            certifiedOnly={certifiedOnly}
            onToggleCertified={toggleCertifiedOnly}
            onConfirmBuy={(pick) => {
              const snap = plan.snapshots.find(s => s.asset.yahoo === pick.yahoo);
              setConfirming({ pick, snap });
            }}
            onPartialSell={partialSell}
            onSellAll={(yahoo, proceeds) => removeHolding(yahoo, proceeds)}
          />
        )}

        {/* ── HOLDINGS TAB ── */}
        {tab === 'holdings' && plan && (
          <HoldingsTab
            plan={plan}
            onRemove={(yahoo) => removeHolding(yahoo)}
          />
        )}

        {/* ── UNIVERSE TAB ── */}
        {tab === 'universe' && plan && (
          <UniverseTab plan={plan} certifiedOnly={certifiedOnly} onToggleCertified={toggleCertifiedOnly} />
        )}

        {loading && !plan && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
            <RefreshCw size={20} className="animate-spin text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Reading the markets…</p>
          </div>
        )}

        <p className="text-[10px] text-slate-700 text-center px-2 leading-relaxed">
          Educational tool, not financial advice. Sharia status of any stock can change quarterly —
          re-verify before each trade. Trading 212 ISA fees apply (0% commission, 0.15% FX on USD).
        </p>
      </main>

      {/* confirm-buy modal */}
      {confirming && (
        <BuyConfirmModal
          pick={confirming.pick}
          snap={confirming.snap}
          maxBudget={budget}
          onCancel={() => setConfirming(null)}
          onConfirm={(units, costGBP) => addHolding(confirming.pick, units, costGBP)}
        />
      )}

      {/* deposit modal */}
      {depositModal && (
        <DepositModal
          deposits={deposits}
          onClose={() => setDepositModal(false)}
          onAdd={addDeposit}
          onRemove={removeDeposit}
        />
      )}

      {/* T212 connection modal */}
      {t212Modal && (
        <T212Modal
          apiKey={t212Key}
          mode={t212Mode}
          syncing={syncing}
          onClose={() => setT212Modal(false)}
          onSave={(k, m) => { saveT212Settings(k, m); setT212Modal(false); }}
          onClear={() => { saveT212Settings('', t212Mode); }}
          onSyncNow={() => { setT212Modal(false); handleT212Sync(); }}
        />
      )}

      {/* guide modal */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

// ─────────────────── PLAN TAB ───────────────────

function PlanTab({ plan, certifiedOnly, onToggleCertified, onConfirmBuy, onPartialSell, onSellAll }: {
  plan: GamePlan;
  certifiedOnly: boolean;
  onToggleCertified: (v: boolean) => void;
  onConfirmBuy: (p: AllocationPick) => void;
  onPartialSell: (yahoo: string, units: number, proceeds: number) => void;
  onSellAll: (yahoo: string, proceeds: number) => void;
}) {
  const sellList = plan.holdingsVerdict.filter(v => v.action === 'SELL' || v.action === 'TRIM');
  const holdList = plan.holdingsVerdict.filter(v => v.action === 'HOLD' || v.action === 'BUY');

  // Server already applies the certified-only filter to the buyPlan and
  // re-runs the allocator on the filtered universe — so the £ amounts
  // properly fill the cash budget.
  const visibleBuys = plan.buyPlan;

  return (
    <div className="space-y-4">
      {/* SELL section — most urgent */}
      {sellList.length > 0 && (
        <Section icon={<AlertTriangle size={14} />} title="Sell / Trim Today" tone="rose">
          {sellList.map(v => {
            const asset = plan.snapshots.find(s => s.asset.yahoo === v.yahoo)?.asset;
            return (
              <SellCard
                key={v.yahoo}
                verdict={v}
                asset={asset}
                onSell={() => {
                  if (v.action === 'TRIM' && v.unitsToSell && v.proceedsGBP) {
                    onPartialSell(v.yahoo, v.unitsToSell, v.proceedsGBP);
                  } else if (v.proceedsGBP) {
                    onSellAll(v.yahoo, v.proceedsGBP);
                  }
                }}
              />
            );
          })}
        </Section>
      )}

      {/* Certified-only toggle — most users land on the Plan tab, so put it here too */}
      <label className="rounded-2xl bg-slate-900 border border-slate-800 p-3 flex items-center justify-between gap-3 cursor-pointer">
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-400" />
            Certified-only mode
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Only buy stocks that currently sit in an Islamic index. Hides screened-but-not-indexed names.
          </p>
        </div>
        <input
          type="checkbox"
          checked={certifiedOnly}
          onChange={e => onToggleCertified(e.target.checked)}
          className="w-5 h-5 accent-emerald-500"
        />
      </label>

      {/* BUY section */}
      <Section icon={<Sparkles size={14} />} title={visibleBuys.length ? "Today's Buys" : "No buys today"} tone="emerald">
        {visibleBuys.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-slate-500">
              {certifiedOnly
                ? 'No certified-index stocks rate BUY today.'
                : 'Nothing in the universe rated BUY right now.'}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">Patience is a position. Check back tomorrow.</p>
          </div>
        ) : (
          <>
            <div className="px-3 pt-2 pb-1 text-[10px] text-slate-500 flex items-center justify-between">
              <span>Spreading {gbp(visibleBuys.reduce((s, p) => s + p.amountGBP, 0))} across {visibleBuys.length}</span>
              <span>Cash after: {gbp(Math.max(0, plan.cashAvailableGBP - visibleBuys.reduce((s, p) => s + p.amountGBP, 0)))}</span>
            </div>
            {visibleBuys.map((pick, i) => (
              <BuyCard
                key={pick.yahoo}
                pick={pick}
                snap={plan.snapshots.find(s => s.asset.yahoo === pick.yahoo)}
                rank={i + 1}
                onBuy={() => onConfirmBuy(pick)}
              />
            ))}
          </>
        )}
      </Section>

      {/* HOLD section */}
      {holdList.length > 0 && (
        <Section icon={<Activity size={14} />} title="Keep Holding" tone="slate">
          {holdList.map(v => {
            const asset = plan.snapshots.find(s => s.asset.yahoo === v.yahoo)?.asset;
            return <HoldRow key={v.yahoo} verdict={v} asset={asset} />;
          })}
        </Section>
      )}
    </div>
  );
}

// ─── BUY card ───

function BuyCard({ pick, snap, rank, onBuy }: {
  pick: AllocationPick; snap?: AssetSnapshot; rank: number; onBuy: () => void;
}) {
  const asset = snap?.asset;
  return (
    <div className="border-t border-slate-800/60 p-3">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-emerald-300">{rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-white">{pick.ticker}</span>
            {asset?.type === 'ETF' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold">ETF</span>
            )}
            {asset?.status === 'certified' ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-0.5">
                <ShieldCheck size={9} /> CERTIFIED
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold">SCREENED</span>
            )}
            <span className="ml-auto text-right">
              <span className="block text-xs font-mono text-slate-300">
                {snap ? formatT212Price(snap.priceNative, snap.priceCurrency) : gbp(pick.priceGBP)}
              </span>
              {snap && formatRealGBP(snap.priceGBP, snap.priceNative, snap.priceCurrency) && (
                <span className="block text-[9px] text-slate-600 font-mono">
                  {formatRealGBP(snap.priceGBP, snap.priceNative, snap.priceCurrency)}
                </span>
              )}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">{pick.name}</p>

          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
            <ScoreBar score={pick.score} />
            {snap && <span>RSI {snap.rsi.toFixed(0)}</span>}
            {snap && (
              <span className={snap.changePct1d >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {pct(snap.changePct1d)}
              </span>
            )}
          </div>

          <ul className="mt-2 space-y-0.5">
            {pick.reasons.slice(0, 2).map((r, i) => (
              <li key={i} className="text-[10px] text-slate-500 flex gap-1">
                <span className="text-emerald-500">·</span>{r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* allocation block */}
      <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">Invest</p>
            <p className="text-2xl font-bold text-white mt-0.5">{gbp(pick.amountGBP)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">≈ shares</p>
            <p className="text-base font-mono text-slate-200">{pick.estUnits.toFixed(4)}</p>
          </div>
        </div>
        <button
          onClick={onBuy}
          className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <Check size={14} /> I bought this in T212
        </button>
      </div>
    </div>
  );
}

// ─── SELL card ───

function SellCard({ verdict, asset, onSell }: {
  verdict: HoldingVerdict; asset?: HalalAsset; onSell: () => void;
}) {
  const style = ACTION_STYLE[verdict.action];
  return (
    <div className="border-t border-slate-800/60 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-bold text-white">{asset?.ticker ?? verdict.yahoo}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border} font-bold`}>
          {style.label}
        </span>
        <span className={`ml-auto text-sm font-bold ${verdict.pnlGBP >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {pct(verdict.pnlPct)}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 truncate">{asset?.name}</p>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Held" value={`${verdict.units.toFixed(4)}`} />
        <Stat label="Value" value={gbp(verdict.valueGBP)} />
        <Stat label="P/L" value={`${verdict.pnlGBP >= 0 ? '+' : ''}${gbp(Math.abs(verdict.pnlGBP))}`}
              valueClass={verdict.pnlGBP >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
      </div>

      <ul className="mt-2 space-y-0.5">
        {verdict.reasons.map((r, i) => (
          <li key={i} className="text-[10px] text-slate-400 flex gap-1">
            <span className="text-rose-400">·</span>{r}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-xl bg-rose-500/8 border border-rose-500/20 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] text-rose-300 uppercase tracking-wider font-semibold">
              {verdict.action === 'TRIM' ? 'Sell' : 'Sell all'}
            </p>
            <p className="text-2xl font-bold text-white mt-0.5">{gbp(verdict.proceedsGBP ?? 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">shares</p>
            <p className="text-base font-mono text-slate-200">{(verdict.unitsToSell ?? 0).toFixed(4)}</p>
          </div>
        </div>
        <button
          onClick={onSell}
          className="mt-3 w-full bg-rose-500 hover:bg-rose-400 text-rose-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <Check size={14} /> I sold this in T212
        </button>
      </div>
    </div>
  );
}

// ─── HOLD row ───

function HoldRow({ verdict, asset }: { verdict: HoldingVerdict; asset?: HalalAsset }) {
  return (
    <div className="border-t border-slate-800/60 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-white">{asset?.ticker ?? verdict.yahoo}</span>
          <span className="text-[10px] text-slate-500">{verdict.units.toFixed(4)} sh</span>
        </div>
        <p className="text-[10px] text-slate-500 truncate">{verdict.reasons[0]}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${verdict.pnlGBP >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {pct(verdict.pnlPct)}
        </p>
        <p className="text-[10px] text-slate-500">{gbp(verdict.valueGBP)}</p>
      </div>
    </div>
  );
}

// ─────────────────── HOLDINGS TAB ───────────────────

function HoldingsTab({ plan, onRemove }: { plan: GamePlan; onRemove: (yahoo: string) => void }) {
  if (plan.holdingsVerdict.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Wallet size={24} className="text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400 font-semibold">No holdings yet</p>
        <p className="text-xs text-slate-600 mt-1">Tap a Buy card on the Game Plan tab and confirm — your holdings show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {plan.holdingsVerdict.map(v => {
        const asset = plan.snapshots.find(s => s.asset.yahoo === v.yahoo)?.asset;
        const style = ACTION_STYLE[v.action];
        return (
          <div key={v.yahoo} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-sm font-bold text-white">{asset?.ticker ?? v.yahoo}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border} font-bold`}>
                {style.label}
              </span>
              <button
                onClick={() => {
                  if (confirm(`Remove ${asset?.ticker ?? v.yahoo} from tracking? This doesn't sell in T212.`)) onRemove(v.yahoo);
                }}
                className="ml-auto p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"
                aria-label="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 truncate">{asset?.name}</p>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <Stat label="Shares" value={v.units.toFixed(4)} />
              <Stat label="Avg" value={gbp(v.avgPriceGBP)} />
              <Stat label="Now" value={gbp(v.currentPriceGBP)} />
              <Stat
                label="P/L"
                value={pct(v.pnlPct)}
                valueClass={v.pnlGBP >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>Value {gbp(v.valueGBP)}</span>
              <span className={v.pnlGBP >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {v.pnlGBP >= 0 ? '+' : ''}{gbp(Math.abs(v.pnlGBP))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────── UNIVERSE TAB ───────────────────

function UniverseTab({ plan, certifiedOnly, onToggleCertified }: {
  plan: GamePlan; certifiedOnly: boolean; onToggleCertified: (v: boolean) => void;
}) {
  const visible = certifiedOnly
    ? plan.snapshots.filter(s => s.asset.status === 'certified')
    : plan.snapshots;

  return (
    <div className="space-y-3">
      {/* explainer + filter */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3 space-y-3">
        <div className="text-[11px] text-slate-400 leading-relaxed">
          <p>
            <b className="text-emerald-300">All assets here are halal-screened.</b> The colored badges
            mean two different things:
          </p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex gap-2 items-start">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold mt-0.5">CERTIFIED</span>
              <span>sits in a major Islamic index today (Wahed / MSCI Islamic)</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold mt-0.5">SCREENED</span>
              <span>passes quantitative Sharia screens — re-verify each quarter</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 font-semibold mt-0.5">WAIT</span>
              <span>chart signal — overbought or downtrend, don&apos;t buy <i>today</i>. <b>Not</b> a halal verdict.</span>
            </li>
          </ul>
        </div>
        <label className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800 cursor-pointer">
          <span className="text-[11px] text-slate-300">
            Show <b>certified-only</b> (hide screened-but-not-yet-indexed names)
          </span>
          <input
            type="checkbox"
            checked={certifiedOnly}
            onChange={e => onToggleCertified(e.target.checked)}
            className="w-5 h-5 accent-emerald-500"
          />
        </label>
      </div>

      {visible.map(s => {
        const style = ACTION_STYLE[s.action];
        return (
          <div key={s.asset.yahoo} className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-white">{s.asset.ticker}</span>
              {s.asset.type === 'ETF' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold">ETF</span>
              )}
              {s.asset.status === 'certified' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-0.5">
                  <ShieldCheck size={9} /> CERTIFIED
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold">SCREENED</span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border} font-bold`}>
                {style.label}
              </span>
              <span className="ml-auto text-right">
                <span className="block text-xs font-mono text-slate-300">
                  {formatT212Price(s.priceNative, s.priceCurrency)}
                </span>
                {formatRealGBP(s.priceGBP, s.priceNative, s.priceCurrency) && (
                  <span className="block text-[9px] text-slate-600 font-mono">
                    {formatRealGBP(s.priceGBP, s.priceNative, s.priceCurrency)}
                  </span>
                )}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">{s.asset.name}</p>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
              <ScoreBar score={s.score} />
              <span>RSI {s.rsi.toFixed(0)}</span>
              <span className={s.changePct1d >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{pct(s.changePct1d)}</span>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500 italic">{s.asset.note}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────── shared widgets ───────────────────

function Section({ icon, title, tone, children }: {
  icon: React.ReactNode; title: string; tone: 'emerald' | 'rose' | 'slate'; children: React.ReactNode;
}) {
  const ring = tone === 'emerald' ? 'border-emerald-500/20'
    : tone === 'rose' ? 'border-rose-500/20' : 'border-slate-800';
  const titleColor = tone === 'emerald' ? 'text-emerald-300'
    : tone === 'rose' ? 'text-rose-300' : 'text-slate-400';
  return (
    <section className={`rounded-2xl bg-slate-900 border ${ring} overflow-hidden`}>
      <header className={`px-3 py-2.5 flex items-center gap-1.5 ${titleColor} bg-slate-950/30`}>
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-wider">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-mono font-semibold mt-0.5 ${valueClass ?? 'text-slate-200'}`}>{value}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-400' : score >= 55 ? 'bg-emerald-500/70'
    : score >= 35 ? 'bg-slate-500' : 'bg-rose-500/70';
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
        <span className={`block h-full ${color}`} style={{ width: `${score}%` }} />
      </span>
      <span className="font-mono text-slate-400">{score.toFixed(0)}</span>
    </span>
  );
}

// ─────────────────── BUY confirm modal ───────────────────

function BuyConfirmModal({ pick, snap, maxBudget, onCancel, onConfirm }: {
  pick: AllocationPick; snap?: AssetSnapshot; maxBudget: number;
  onCancel: () => void;
  onConfirm: (units: number, costGBP: number) => void;
}) {
  const [amount, setAmount] = useState<number>(Math.min(pick.amountGBP, maxBudget));
  const units = +(amount / pick.priceGBP).toFixed(4);
  const isUSD = snap?.priceCurrency === 'USD';
  const t212Display = snap ? formatT212Price(snap.priceNative, snap.priceCurrency) : gbp(pick.priceGBP);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Confirm buy</p>
            <p className="text-lg font-bold text-white mt-0.5">{pick.ticker}</p>
            <p className="text-[11px] text-slate-400 truncate">{pick.name}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase">Spending</span>
            <span className="text-[10px] text-slate-500">≈ {units.toFixed(4)} shares @ {t212Display}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-lg">£</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(Math.min(maxBudget, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="flex-1 bg-transparent text-2xl font-mono font-bold text-white focus:outline-none"
            />
          </div>
        </div>

        {isUSD && (
          <div className="mt-2 rounded-xl bg-amber-500/8 border border-amber-500/20 p-2.5 text-[10px] text-amber-200 leading-relaxed flex gap-1.5">
            <Info size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              <b>{pick.ticker}</b> is USD-priced. T212 may show the price as <b>{t212Display}</b> (it&apos;s
              the USD number with a £ symbol). Your <b>{gbp(amount)}</b> still buys the same ~{units.toFixed(4)} shares
              — T212 just adds a ~0.15% FX fee on top.
            </span>
          </div>
        )}

        <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3 text-[11px] text-slate-300 leading-relaxed">
          <p className="font-semibold text-emerald-300 mb-1 flex items-center gap-1"><BookOpen size={11} /> How to do this in T212</p>
          <ol className="space-y-0.5 list-decimal list-inside text-slate-400">
            <li>Open Trading 212 → Stocks ISA</li>
            <li>Search <b className="text-white">{pick.ticker}</b></li>
            <li>Tap <b className="text-white">Buy</b> → switch to <b className="text-white">Value</b></li>
            <li>Enter <b className="text-emerald-300">{gbp(amount)}</b> → confirm</li>
          </ol>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 font-semibold">Cancel</button>
          <button
            onClick={() => onConfirm(units, amount)}
            disabled={amount <= 0 || amount > maxBudget}
            className="flex-1 py-3 rounded-xl bg-emerald-500 text-emerald-950 font-bold disabled:opacity-40"
          >
            Done — track it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Deposit modal ───────────────────

function DepositModal({ deposits, onClose, onAdd, onRemove }: {
  deposits: Deposit[];
  onClose: () => void;
  onAdd: (amount: number, note?: string) => void;
  onRemove: (id: string) => void;
}) {
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const numericAmount = parseFloat(amount);
  const isValid = isFinite(numericAmount) && numericAmount !== 0;
  const netDeposits = deposits.reduce((s, d) => s + d.amountGBP, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Deposits</h2>
            {netDeposits > 0 && (
              <span className="text-[10px] text-slate-500">· {gbp(netDeposits)} total</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Add form */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Log a new deposit
            </p>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-lg">£</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="10.00"
                value={amount}
                autoFocus
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-2xl font-mono font-bold text-white focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[5, 10, 20, 50, 100].map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800"
                >£{v}</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Note (optional) — e.g. Week 3"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-transparent border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={() => isValid && onAdd(numericAmount, note)}
              disabled={!isValid}
              className="w-full py-3 rounded-xl bg-emerald-500 text-emerald-950 font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Plus size={14} />
              {isValid && numericAmount < 0
                ? `Log withdrawal ${gbp(Math.abs(numericAmount))}`
                : `Add ${isValid ? gbp(numericAmount) : '£0.00'} to cash`}
            </button>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Adds to your <i>Cash to deploy</i> and records the date. Use a negative amount
              (e.g. -20) to log a withdrawal from the ISA.
            </p>
          </div>

          {/* Log */}
          {deposits.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                History ({deposits.length})
              </p>
              <div className="space-y-1.5">
                {deposits.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      d.amountGBP >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                    }`}>
                      {d.amountGBP >= 0 ? <Plus size={12} /> : <Minus size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-white">
                        {d.amountGBP >= 0 ? '+' : ''}{gbp(d.amountGBP)}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {formatRelativeDate(d.at)}{d.note ? ` · ${d.note}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemove(d.id)}
                      className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-md"
                      aria-label="Remove deposit"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── T212 connection modal ───────────────────

function T212Modal({ apiKey, mode, syncing, onClose, onSave, onClear, onSyncNow }: {
  apiKey: string;
  mode: 'live' | 'demo';
  syncing: boolean;
  onClose: () => void;
  onSave: (key: string, mode: 'live' | 'demo') => void;
  onClear: () => void;
  onSyncNow: () => void;
}) {
  const [key, setKey] = useState(apiKey);
  const [curMode, setCurMode] = useState<'live' | 'demo'>(mode);
  const [reveal, setReveal] = useState(false);
  const trimmed = key.trim();
  const isConnected = apiKey.length > 0;
  const dirty = trimmed !== apiKey || curMode !== mode;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LinkIcon size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold text-white">Trading 212 connection</h2>
            {isConnected && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold">CONNECTED</span>}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* How to get a key */}
          <div className="rounded-xl bg-sky-500/8 border border-sky-500/20 p-3 text-[11px] text-slate-300 leading-relaxed">
            <p className="font-semibold text-sky-300 mb-1.5 flex items-center gap-1"><BookOpen size={11} /> Get your API key (1 min)</p>
            <ol className="space-y-1 text-slate-400 list-decimal list-inside">
              <li>Open Trading 212 on web or mobile</li>
              <li>Tap your avatar → <b className="text-white">Settings → API Generated Keys</b></li>
              <li>Tap <b className="text-white">Generate API key</b></li>
              <li>Tick <b className="text-emerald-300">read-only</b> scopes:
                <span className="text-slate-300"> Account, Personal portfolio, Historical orders</span></li>
              <li>Copy the key and paste it below</li>
            </ol>
          </div>

          {/* Mode toggle */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Account type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCurMode('live')}
                className={`py-2 rounded-lg text-xs font-bold border ${curMode === 'live' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-slate-800 text-slate-500'}`}
              >LIVE (real money)</button>
              <button
                onClick={() => setCurMode('demo')}
                className={`py-2 rounded-lg text-xs font-bold border ${curMode === 'demo' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'border-slate-800 text-slate-500'}`}
              >DEMO (practice)</button>
            </div>
          </div>

          {/* Key input */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">API key</p>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <input
                type={reveal ? 'text' : 'password'}
                placeholder="Paste from T212…"
                value={key}
                onChange={e => setKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-sm font-mono text-white placeholder-slate-600 focus:outline-none"
              />
              <button
                onClick={() => setReveal(r => !r)}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                aria-label={reveal ? 'Hide key' : 'Show key'}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Trust note */}
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-3 text-[11px] text-slate-400 leading-relaxed">
            <p className="font-semibold text-slate-200 mb-1 flex items-center gap-1">
              <ShieldCheck size={11} className="text-emerald-400" /> How your key is handled
            </p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Stored only in <b className="text-slate-300">this device&apos;s browser</b> (localStorage)</li>
              <li>Sent to the coach&apos;s server only when you tap Sync, used once, then dropped</li>
              <li>Never logged, never persisted server-side, never echoed back</li>
              <li>Read-only — the coach can&apos;t place or cancel orders</li>
              <li>You can revoke the key any time in T212&apos;s API Settings</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={() => onSave(trimmed, curMode)}
              disabled={!trimmed || !dirty}
              className="w-full py-3 rounded-xl bg-sky-500 text-sky-950 font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Check size={14} /> Save key
            </button>
            <button
              onClick={onSyncNow}
              disabled={!trimmed || syncing}
              className="w-full py-3 rounded-xl bg-emerald-500 text-emerald-950 font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Save & sync now
            </button>
            {isConnected && (
              <button
                onClick={() => {
                  if (window.confirm('Disconnect Trading 212? The key will be removed from this device.')) onClear();
                }}
                className="w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/10"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Guide modal ───────────────────

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-400" />
            <h2 className="text-sm font-bold text-white">How this works</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 text-[12px] text-slate-300 leading-relaxed">
          <Step n={1} title="Set your cash" body="Type how much GBP you can deploy this week. £50 is fine — Trading 212 allows fractional shares from £1." />
          <Step n={2} title="Read the Game Plan" body="The coach scores ~12 Sharia-screened stocks/ETFs and tells you exactly how much to put in each. You get up to 4 picks — that's enough diversification at this size, no more than you can track." />
          <Step n={3} title="Place the order in T212" body="Stocks ISA → search the ticker → Buy → switch the order box from 'Shares' to 'Value' → enter the £ amount we show. Then tap 'I bought this' so we track it." />
          <Step n={4} title="Check daily, act when prompted" body="Open the app every morning. The coach watches your positions and flags SELL (lock in profit or stop a loss), TRIM (sell half on strength), or HOLD." />
          <Step n={5} title="Sell rules built in" body="Stop-loss at −8%. Trim half at +15% or RSI > 75. Full take-profit at +25% or RSI > 82. Trend-break also triggers an exit. You always get the £ proceeds + share count, ready to type into T212." />
          <Step n={6} title="DCA weekly with + Add cash" body="Deposit £10–20 a week in T212, then tap the + Add cash button. It tops up your budget and logs the deposit, so the P/L line shows true lifetime returns on everything you've put in — not just the last buy." />

          <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 text-[11px]">
            <p className="font-semibold text-amber-300 mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Honest disclaimers</p>
            <ul className="space-y-1 text-slate-400 list-disc list-inside">
              <li>This is an educational coach, not regulated advice.</li>
              <li>Sharia compliance can change quarterly — verify on Zoya or Wahed before each new buy.</li>
              <li>The signals use price/momentum only. They don't know about earnings, news or politics.</li>
              <li>£50 is small. Expect bumpy weeks. Time in market &gt; timing the market.</li>
            </ul>
          </div>

          <button onClick={onClose} className="w-full py-3 rounded-xl bg-emerald-500 text-emerald-950 font-bold">
            Got it, show me my plan
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-emerald-300">{n}</span>
      </div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-slate-400 mt-0.5">{body}</p>
      </div>
    </div>
  );
}
