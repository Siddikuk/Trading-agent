'use client';

import React, { useState } from 'react';
import { Shield, TrendingUp, Clock, PoundSterling, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react';

// ── Screener results (last scan: May 2026) ───────────────────────────────────

interface HalalStock {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  currency: string;
  marketCap: string;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargin: number | null;
  score: number;
  purifyPct: number;       // % of profits to donate to charity (0 = none needed)
  debtFree: true;
  risk: 'low' | 'medium' | 'high';
  note: string;
  website: string;
}

const STOCKS: HalalStock[] = [
  {
    ticker: 'LSCC',
    name: 'Lattice Semiconductor',
    sector: 'Technology',
    industry: 'Semiconductors',
    price: 120.11,
    currency: 'USD',
    marketCap: '$16.5B',
    revenueGrowth: 42.2,
    earningsGrowth: 337.2,
    grossMargin: 68.4,
    score: 64,
    purifyPct: 0.50,
    debtFree: true,
    risk: 'medium',
    note: 'Makes programmable chips (FPGAs) for AI, robotics & edge computing. Similar early-stage position to AMD in 2015. Fastest-growing semiconductor in our scan.',
    website: 'https://www.latticesemi.com',
  },
  {
    ticker: 'GMED',
    name: 'Globus Medical',
    sector: 'Healthcare',
    industry: 'Medical Devices',
    price: 76.64,
    currency: 'USD',
    marketCap: '$10.4B',
    revenueGrowth: 27.0,
    earningsGrowth: 66.7,
    grossMargin: 68.5,
    score: 64,
    purifyPct: 0.23,
    debtFree: true,
    risk: 'low',
    note: 'Spine surgery devices & surgical robots. Healthcare demand never stops. Consistent growth, high margins, zero financial debt.',
    website: 'https://www.globusmedical.com',
  },
  {
    ticker: 'MPWR',
    name: 'Monolithic Power Systems',
    sector: 'Technology',
    industry: 'Semiconductors',
    price: 589.40,
    currency: 'USD',
    marketCap: '$76.2B',
    revenueGrowth: 26.1,
    earningsGrowth: 39.5,
    grossMargin: 55.2,
    score: 61,
    purifyPct: 0.99,
    debtFree: true,
    risk: 'low',
    note: 'Power management chips for data centres, EVs & AI servers. Larger cap but still growing strongly. Very close to 1% interest income limit — verify before investing.',
    website: 'https://www.monolithicpower.com',
  },
  {
    ticker: 'SMMT',
    name: 'Summit Therapeutics',
    sector: 'Healthcare',
    industry: 'Biotechnology',
    price: 16.87,
    currency: 'USD',
    marketCap: '$13.1B',
    revenueGrowth: null,
    earningsGrowth: null,
    grossMargin: 0,
    score: 19,
    purifyPct: 0,
    debtFree: true,
    risk: 'high',
    note: 'Pre-revenue cancer drug company. Zero debt, zero interest income — genuinely clean. High risk: could 10x if drug gets approved, or drop sharply if it fails trials.',
    website: 'https://www.smmttx.com',
  },
];

// ── Allocation logic ─────────────────────────────────────────────────────────

function allocate(budget: number) {
  // Weighted by score, exclude high-risk from main allocation
  // SMMT gets a small speculative slice only if budget allows
  const core = [
    { ticker: 'LSCC', weight: 50 },
    { ticker: 'GMED', weight: 35 },
    { ticker: 'MPWR', weight: 15 },
  ];
  const speculativeSlice = budget >= 40 ? Math.min(budget * 0.10, 5) : 0;
  const corebudget = budget - speculativeSlice;

  const result: { ticker: string; amount: number; shares: string; reason: string }[] = [];
  for (const c of core) {
    const stock = STOCKS.find(s => s.ticker === c.ticker)!;
    const amount = Math.round((corebudget * c.weight) / 100 * 100) / 100;
    const shares = (amount / (stock.price * 0.79)).toFixed(4); // approx GBP→USD at 0.79
    result.push({
      ticker: c.ticker,
      amount,
      shares: `~${shares} shares`,
      reason: c.ticker === 'LSCC' ? 'Highest growth signals' : c.ticker === 'GMED' ? 'Stable growth, low risk' : 'Diversification',
    });
  }
  if (speculativeSlice > 0) {
    const stock = STOCKS.find(s => s.ticker === 'SMMT')!;
    const shares = (speculativeSlice / (stock.price * 0.79)).toFixed(4);
    result.push({ ticker: 'SMMT', amount: speculativeSlice, shares: `~${shares} shares`, reason: 'High-risk speculative bet' });
  }
  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 w-10 text-right">{score}/100</span>
    </div>
  );
}

function RiskBadge({ risk }: { risk: HalalStock['risk'] }) {
  if (risk === 'low') return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Low Risk</span>;
  if (risk === 'medium') return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Med Risk</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">High Risk</span>;
}

function StockCard({ stock }: { stock: HalalStock }) {
  const [open, setOpen] = useState(false);
  const fmtPct = (v: number | null) => v === null ? 'N/A' : `+${v.toFixed(1)}%`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/40 transition-colors text-left"
      >
        {/* Ticker badge */}
        <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-emerald-400">{stock.ticker}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{stock.name}</span>
            <RiskBadge risk={stock.risk} />
            {stock.purifyPct === 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">100% Clean</span>
              : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">Purify {stock.purifyPct}%</span>
            }
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{stock.industry} · {stock.marketCap}</p>
          <ScoreBar score={stock.score} />
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-white">${stock.price.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500">{stock.currency}</p>
          {open ? <ChevronUp size={12} className="text-slate-500 ml-auto mt-1" /> : <ChevronDown size={12} className="text-slate-500 ml-auto mt-1" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-slate-800 p-3 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Rev Growth', value: fmtPct(stock.revenueGrowth), color: 'text-emerald-400' },
              { label: 'Earn Growth', value: fmtPct(stock.earningsGrowth), color: 'text-emerald-400' },
              { label: 'Gross Margin', value: fmtPct(stock.grossMargin), color: 'text-sky-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Halal status */}
          <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-slate-300 space-y-0.5">
              <p><span className="text-emerald-400 font-semibold">Financial debt: $0</span> — no bank loans, no bonds</p>
              {stock.purifyPct === 0
                ? <p><span className="text-emerald-400 font-semibold">Interest income: $0</span> — completely clean</p>
                : <p><span className="text-amber-400 font-semibold">Interest income: {stock.purifyPct}% of revenue</span> — donate {stock.purifyPct}% of your profits to charity to purify</p>
              }
            </div>
          </div>

          {/* Note */}
          <p className="text-[10px] text-slate-400 leading-relaxed">{stock.note}</p>

          <a href={stock.website} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300">
            Visit website →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function HalalTab() {
  const [budget, setBudget] = useState(50);
  const allocation = allocate(budget);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
        <Shield size={18} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-emerald-400">Halal Growth Screener — Option 1 (Strict)</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Zero financial debt · Max 1% interest income (purify by donating that % of profits to charity) · Clean business sectors only · Scanned 4,400+ US stocks
          </p>
        </div>
      </div>

      {/* ── Section 1: What to buy ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-xs font-semibold text-white">What to Buy</span>
          <span className="text-[10px] text-slate-500">— ranked by growth score</span>
        </div>
        <div className="space-y-2">
          {STOCKS.map(s => <StockCard key={s.ticker} stock={s} />)}
        </div>
      </div>

      {/* ── Section 2: When to buy ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={13} className="text-sky-400" />
          <span className="text-xs font-semibold text-white">When to Buy</span>
        </div>

        {[
          {
            label: 'Use Dollar-Cost Averaging (DCA)',
            detail: "Don't invest all £50 at once. Split it into 2–3 purchases over 4–6 weeks. This protects you if the stock dips right after you buy.",
            color: 'text-emerald-400',
          },
          {
            label: 'Buy on red days',
            detail: 'If the stock drops 2–5% in a week with no bad company news, that\'s often a good entry point. The fundamentals haven\'t changed — the price just got cheaper.',
            color: 'text-sky-400',
          },
          {
            label: 'Avoid earnings week',
            detail: 'Each company reports earnings quarterly. Prices swing hard around those dates. Wait 2–3 days after the report before buying — once the dust settles.',
            color: 'text-amber-400',
          },
          {
            label: 'Best days: Tue–Thu',
            detail: 'Mondays often see panic selling. Fridays see profit-taking. Tuesday to Thursday is historically calmer.',
            color: 'text-slate-400',
          },
        ].map((rule, i) => (
          <div key={i} className="flex gap-2">
            <span className={`text-[10px] font-bold ${rule.color} shrink-0 pt-0.5`}>{i + 1}.</span>
            <div>
              <p className={`text-[10px] font-semibold ${rule.color}`}>{rule.label}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">{rule.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Section 3: How much to buy ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PoundSterling size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-white">How Much to Buy</span>
          </div>
          {/* Budget slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Budget:</span>
            <span className="text-xs font-bold text-amber-400">£{budget}</span>
          </div>
        </div>

        {/* Slider */}
        <input
          type="range"
          min={10}
          max={500}
          step={5}
          value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>£10</span><span>£250</span><span>£500</span>
        </div>

        {/* Allocation */}
        <div className="space-y-2">
          {allocation.map(a => {
            const stock = STOCKS.find(s => s.ticker === a.ticker)!;
            const pct = Math.round((a.amount / budget) * 100);
            return (
              <div key={a.ticker} className="flex items-center gap-2">
                <div className="w-10 shrink-0">
                  <span className="text-[10px] font-bold text-white">{a.ticker}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] text-slate-500">{a.reason}</span>
                    <span className="text-[9px] text-slate-400">{a.shares}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${a.ticker === 'SMMT' ? 'bg-rose-500/60' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="w-12 text-right shrink-0">
                  <span className="text-[10px] font-semibold text-amber-400">£{a.amount.toFixed(0)}</span>
                  <span className="text-[9px] text-slate-600 ml-0.5">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* DCA plan */}
        <div className="bg-slate-800/60 rounded-lg p-2 space-y-1">
          <p className="text-[10px] font-semibold text-white">Suggested DCA plan for £{budget}:</p>
          <div className="space-y-0.5">
            <p className="text-[10px] text-slate-400">
              <span className="text-emerald-400">Week 1:</span> Buy £{Math.round(budget * 0.5)} now (50%) — get your position started
            </p>
            <p className="text-[10px] text-slate-400">
              <span className="text-sky-400">Week 3:</span> Buy £{Math.round(budget * 0.3)} more (30%) — average in
            </p>
            <p className="text-[10px] text-slate-400">
              <span className="text-amber-400">Week 6:</span> Buy £{Math.round(budget * 0.2)} (20%) — final tranche, or wait for a dip
            </p>
          </div>
        </div>

        {/* Purification reminder */}
        <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/20 rounded-lg p-2">
          <Info size={11} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            <span className="text-sky-400 font-semibold">Purification reminder:</span> LSCC and GMED earn tiny amounts of bank interest (~0.23–0.5% of revenue). When you profit, donate that same percentage to charity to purify your returns.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          This is not financial advice. Stocks can go up or down. Past growth does not guarantee future returns. Always do your own research before investing. Capital is at risk.
        </p>
      </div>

    </div>
  );
}
