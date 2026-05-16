'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, RefreshCw, Wallet, ShieldCheck, AlertTriangle,
  Sparkles, ChevronRight, Plus, Check, Info, ArrowRight, BookOpen, X,
  Trash2, Star, Pause, Play, Activity, HelpCircle,
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

const STORAGE_KEY = 'halal-portfolio-v1';
const BUDGET_KEY  = 'halal-budget-v1';

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
  AVOID:      { bg: 'bg-slate-700/40',   text: 'text-slate-400',   border: 'border-slate-700',      label: 'AVOID' },
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

  // hydrate from localStorage on mount
  useEffect(() => {
    setBudget(loadBudget());
    setHoldings(loadHoldings());
    // open the guide on first visit
    if (typeof window !== 'undefined' && !window.localStorage.getItem('halal-seen-guide')) {
      setShowGuide(true);
      window.localStorage.setItem('halal-seen-guide', '1');
    }
  }, []);

  const fetchPlan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/halal/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, holdings }),
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
  }, [budget, holdings]);

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
  const addHolding = (pick: AllocationPick, units: number, costGBP: number) => {
    const next: StoredHolding[] = [
      ...holdings.filter(h => h.yahoo !== pick.yahoo),
      { yahoo: pick.yahoo, units, avgPriceGBP: pick.priceGBP, addedAt: new Date().toISOString() },
    ];
    setHoldings(next); saveHoldings(next);
    // give the user immediate feedback by deducting from the working budget too
    updateBudget(Math.max(0, +(budget - costGBP).toFixed(2)));
    setConfirming(null);
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
  const totalEquity = useMemo(() => budget + (plan?.portfolioValueGBP ?? 0), [budget, plan]);
  const pnlAbs = plan?.portfolioPnlGBP ?? 0;
  const pnlPct = plan?.portfolioPnlPct ?? 0;
  const startingCapital = useMemo(() => {
    const cost = holdings.reduce((s, h) => s + h.units * h.avgPriceGBP, 0);
    return +(budget + cost - pnlAbs).toFixed(2);
  }, [budget, holdings, pnlAbs]);

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
                <span className="text-[10px] text-slate-500">Invested {gbp(plan?.portfolioValueGBP ?? 0)}</span>
              </div>
            </div>
            <div className={`text-right ${pnlAbs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <div className="flex items-center gap-1 justify-end">
                {pnlAbs >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span className="text-sm font-bold">{pct(pnlPct)}</span>
              </div>
              <p className="text-xs mt-0.5">{pnlAbs >= 0 ? '+' : ''}{gbp(Math.abs(pnlAbs))}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">from {gbp(startingCapital || budget)}</p>
            </div>
          </div>

          {/* budget editor */}
          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <Wallet size={11} /> Cash to deploy
            </label>
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
              FX rate: 1 USD ≈ £{plan?.fxGbpPerUsd.toFixed(4) ?? '—'} · T212 ISA charges ~0.15% FX
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
          <UniverseTab plan={plan} />
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

      {/* guide modal */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

// ─────────────────── PLAN TAB ───────────────────

function PlanTab({ plan, onConfirmBuy, onPartialSell, onSellAll }: {
  plan: GamePlan;
  onConfirmBuy: (p: AllocationPick) => void;
  onPartialSell: (yahoo: string, units: number, proceeds: number) => void;
  onSellAll: (yahoo: string, proceeds: number) => void;
}) {
  const sellList = plan.holdingsVerdict.filter(v => v.action === 'SELL' || v.action === 'TRIM');
  const holdList = plan.holdingsVerdict.filter(v => v.action === 'HOLD' || v.action === 'BUY');

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

      {/* BUY section */}
      <Section icon={<Sparkles size={14} />} title={plan.buyPlan.length ? "Today's Buys" : "No buys today"} tone="emerald">
        {plan.buyPlan.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-slate-500">Nothing in the universe rated BUY right now.</p>
            <p className="text-[10px] text-slate-600 mt-1">Patience is a position. Check back tomorrow.</p>
          </div>
        ) : (
          <>
            <div className="px-3 pt-2 pb-1 text-[10px] text-slate-500 flex items-center justify-between">
              <span>Spreading {gbp(plan.buyPlan.reduce((s, p) => s + p.amountGBP, 0))} across {plan.buyPlan.length}</span>
              <span>Cash after: {gbp(Math.max(0, plan.cashAvailableGBP - plan.buyPlan.reduce((s, p) => s + p.amountGBP, 0)))}</span>
            </div>
            {plan.buyPlan.map((pick, i) => (
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

function UniverseTab({ plan }: { plan: GamePlan }) {
  return (
    <div className="space-y-2">
      {plan.snapshots.map(s => {
        const style = ACTION_STYLE[s.action];
        return (
          <div key={s.asset.yahoo} className="rounded-2xl bg-slate-900 border border-slate-800 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-sm font-bold text-white">{s.asset.ticker}</span>
              {s.asset.type === 'ETF' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold">ETF</span>
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
