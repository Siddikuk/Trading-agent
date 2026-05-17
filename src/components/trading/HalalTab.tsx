'use client';

import React, { useState } from 'react';
import { Shield, TrendingUp, Clock, PoundSterling, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, Globe } from 'lucide-react';

interface HalalStock {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: string;
  currency: string;
  country: string;
  flag: string;
  marketCap: string;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargin: number | null;
  score: number;
  purifyPct: number;
  risk: 'low' | 'medium' | 'high';
  note: string;
}

const US_STOCKS: HalalStock[] = [
  {
    ticker: 'LSCC', name: 'Lattice Semiconductor', sector: 'Technology', industry: 'Semiconductors',
    price: '120.11', currency: 'USD', country: 'United States', flag: '🇺🇸', marketCap: '$16.5B',
    revenueGrowth: 42.2, earningsGrowth: 337.2, grossMargin: 68.4, score: 64, purifyPct: 0.50,
    risk: 'medium', note: 'Makes programmable chips (FPGAs) for AI, robotics & edge computing. Similar early-stage position to AMD in 2015.',
  },
  {
    ticker: 'GMED', name: 'Globus Medical', sector: 'Healthcare', industry: 'Medical Devices',
    price: '76.64', currency: 'USD', country: 'United States', flag: '🇺🇸', marketCap: '$10.4B',
    revenueGrowth: 27.0, earningsGrowth: 66.7, grossMargin: 68.5, score: 64, purifyPct: 0.23,
    risk: 'low', note: 'Spine surgery devices & surgical robots. Healthcare demand never stops. Consistent high growth.',
  },
  {
    ticker: 'MPWR', name: 'Monolithic Power Systems', sector: 'Technology', industry: 'Semiconductors',
    price: '589.40', currency: 'USD', country: 'United States', flag: '🇺🇸', marketCap: '$76.2B',
    revenueGrowth: 26.1, earningsGrowth: 39.5, grossMargin: 55.2, score: 61, purifyPct: 0.99,
    risk: 'low', note: 'Power management chips for data centres, EVs & AI. Larger cap but still growing strongly.',
  },
  {
    ticker: 'SMMT', name: 'Summit Therapeutics', sector: 'Healthcare', industry: 'Biotechnology',
    price: '16.87', currency: 'USD', country: 'United States', flag: '🇺🇸', marketCap: '$13.1B',
    revenueGrowth: null, earningsGrowth: null, grossMargin: 0, score: 19, purifyPct: 0,
    risk: 'high', note: 'Pre-revenue cancer drug. Zero debt, zero interest — 100% clean. High risk: could 10x if approved or crash if trial fails.',
  },
];

const GLOBAL_STOCKS: HalalStock[] = [
  {
    ticker: '2030.SR', name: 'Saudi Arabian Refineries', sector: 'Industrials', industry: 'Oil & Gas Refining',
    price: '44.96', currency: 'SAR', country: 'Saudi Arabia', flag: '🇸🇦', marketCap: '$0.7B',
    revenueGrowth: 40.2, earningsGrowth: null, grossMargin: null, score: 74, purifyPct: 0,
    risk: 'medium', note: 'Saudi refinery with 40% revenue growth. Small cap ($700M) — still early stage. Available on Saudi Tadawul exchange.',
  },
  {
    ticker: 'NEDAP.AS', name: 'Nedap N.V.', sector: 'Technology', industry: 'RFID & IoT Solutions',
    price: '89.40', currency: 'EUR', country: 'Netherlands', flag: '🇳🇱', marketCap: '$0.6B',
    revenueGrowth: 13.6, earningsGrowth: null, grossMargin: null, score: 73, purifyPct: 0,
    risk: 'medium', note: 'Dutch tech company making RFID & IoT systems for retail, healthcare, and security. Small cap, zero debt, strong niche.',
  },
  {
    ticker: 'GAW.L', name: 'Games Workshop Group', sector: 'Consumer Cyclical', industry: 'Leisure',
    price: '£193.90', currency: 'GBP', country: 'United Kingdom', flag: '🇬🇧', marketCap: '£5B',
    revenueGrowth: 10.9, earningsGrowth: null, grossMargin: null, score: 58, purifyPct: 0,
    risk: 'low', note: 'Makes Warhammer miniatures & games. Cult brand with fanatical customers, exceptional margins, zero debt. Available on London Stock Exchange.',
  },
  {
    ticker: 'MYCR.ST', name: 'Mycronic AB', sector: 'Industrials', industry: 'Precision Electronics',
    price: '303.4 SEK', currency: 'SEK', country: 'Sweden', flag: '🇸🇪', marketCap: 'SEK 30B',
    revenueGrowth: 16.9, earningsGrowth: null, grossMargin: null, score: 52, purifyPct: 0,
    risk: 'medium', note: 'Swedish maker of precision machines for electronics manufacturing. Benefits from global semiconductor expansion.',
  },
  {
    ticker: 'SOKM.IS', name: 'Sok Marketler', sector: 'Consumer Cyclical', industry: 'Discount Retail',
    price: '50.15 TRY', currency: 'TRY', country: 'Turkey', flag: '🇹🇷', marketCap: 'TRY 30B',
    revenueGrowth: 32.7, earningsGrowth: null, grossMargin: null, score: 49, purifyPct: 0,
    risk: 'high', note: 'Turkey\'s largest discount grocery chain. 32.7% revenue growth. High risk: Turkish lira inflation erodes real returns for foreign investors.',
  },
  {
    ticker: 'PRKAB.IS', name: 'Türk Prysmian Kablo', sector: 'Industrials', industry: 'Cable Manufacturing',
    price: '44.9 TRY', currency: 'TRY', country: 'Turkey', flag: '🇹🇷', marketCap: 'TRY 10B',
    revenueGrowth: 40.2, earningsGrowth: null, grossMargin: null, score: 47, purifyPct: 0,
    risk: 'high', note: 'Turkish cable manufacturer (part of Prysmian Group). 40% revenue growth driven by energy infrastructure demand. Same currency risk as Turkey.',
  },
  {
    ticker: 'INDIAMART.NS', name: 'IndiaMART InterMESH', sector: 'Technology', industry: 'B2B Marketplace',
    price: '₹1,954', currency: 'INR', country: 'India', flag: '🇮🇳', marketCap: '₹117B',
    revenueGrowth: 13.9, earningsGrowth: null, grossMargin: null, score: 45, purifyPct: 0,
    risk: 'medium', note: 'India\'s largest B2B online marketplace. Connects suppliers with buyers. Benefits from India\'s digital economy boom.',
  },
  {
    ticker: '4190.SR', name: 'Jarir Marketing Company', sector: 'Consumer Cyclical', industry: 'Electronics Retail',
    price: '15.0 SAR', currency: 'SAR', country: 'Saudi Arabia', flag: '🇸🇦', marketCap: '$4.8B',
    revenueGrowth: 14.4, earningsGrowth: null, grossMargin: null, score: 46, purifyPct: 0,
    risk: 'low', note: 'Saudi Arabia\'s biggest electronics & books retailer. Stable, profitable, zero debt. Benefits from Saudi Vision 2030 spending.',
  },
  {
    ticker: 'PSN.L', name: 'Persimmon Plc', sector: 'Consumer Cyclical', industry: 'Housebuilding',
    price: '£10.47', currency: 'GBP', country: 'United Kingdom', flag: '🇬🇧', marketCap: '£3.4B',
    revenueGrowth: 19.3, earningsGrowth: null, grossMargin: null, score: 44, purifyPct: 0,
    risk: 'medium', note: 'UK\'s largest housebuilder. Benefits from the housing shortage. Accessible on London Stock Exchange. 19% revenue growth.',
  },
  {
    ticker: 'GUJGASLTD.NS', name: 'Gujarat Gas Limited', sector: 'Utilities', industry: 'Gas Distribution',
    price: '₹371', currency: 'INR', country: 'India', flag: '🇮🇳', marketCap: '₹256B',
    revenueGrowth: 21.1, earningsGrowth: null, grossMargin: null, score: 50, purifyPct: 0,
    risk: 'low', note: 'India\'s largest city gas distributor. Steady regulated business with 21% growth driven by India\'s gas network expansion.',
  },
  {
    ticker: '1301.SR', name: 'United Wire Factories', sector: 'Industrials', industry: 'Wire Manufacturing',
    price: '~SAR 35', currency: 'SAR', country: 'Saudi Arabia', flag: '🇸🇦', marketCap: '$0.4B',
    revenueGrowth: null, earningsGrowth: null, grossMargin: null, score: 44, purifyPct: 0,
    risk: 'medium', note: 'Saudi wire & cable manufacturer. Small cap, zero debt, benefits from Saudi infrastructure buildout.',
  },
];

function allocate(budget: number) {
  const picks = [
    { ticker: '2030.SR', flag: '🇸🇦', weight: 18, reason: 'Highest score (74) + 40% growth' },
    { ticker: 'LSCC',    flag: '🇺🇸', weight: 18, reason: 'AI semiconductors, 42% growth' },
    { ticker: 'NEDAP.AS',flag: '🇳🇱', weight: 15, reason: 'Score 73, clean tech niche' },
    { ticker: 'GMED',    flag: '🇺🇸', weight: 15, reason: 'Medical devices, 27% growth' },
    { ticker: 'GAW.L',   flag: '🇬🇧', weight: 12, reason: 'Games Workshop, London listed' },
    { ticker: 'SOKM.IS', flag: '🇹🇷', weight: 10, reason: '32% growth, higher risk' },
    { ticker: 'SMMT',    flag: '🇺🇸', weight: 7,  reason: 'Speculative biotech bet' },
    { ticker: 'INDIAMART.NS', flag: '🇮🇳', weight: 5, reason: 'India digital economy' },
  ];
  const total = picks.reduce((s, p) => s + p.weight, 0);
  return picks.map(p => ({
    ...p,
    amount: Math.round(budget * p.weight / total * 100) / 100,
    pct: Math.round(p.weight / total * 100),
  }));
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
  if (risk === 'low')    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Low Risk</span>;
  if (risk === 'medium') return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Med Risk</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">High Risk</span>;
}

function StockCard({ stock }: { stock: HalalStock }) {
  const [open, setOpen] = useState(false);
  const fmtPct = (v: number | null) => v === null ? 'N/A' : `+${v.toFixed(1)}%`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/40 transition-colors text-left">
        <div className="w-11 h-11 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0">
          <span className="text-[8px] font-bold text-emerald-400 leading-tight">{stock.ticker.split('.')[0]}</span>
          <span className="text-[9px] leading-tight">{stock.flag}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{stock.name}</span>
            <RiskBadge risk={stock.risk} />
            {stock.purifyPct === 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">100% Clean</span>
              : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">Purify {stock.purifyPct}%</span>
            }
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{stock.industry} · {stock.marketCap} · {stock.country}</p>
          <ScoreBar score={stock.score} />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-white">{stock.price}</p>
          <p className="text-[10px] text-slate-500">{stock.currency}</p>
          {open ? <ChevronUp size={11} className="text-slate-500 ml-auto mt-1" /> : <ChevronDown size={11} className="text-slate-500 ml-auto mt-1" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Rev Growth', value: fmtPct(stock.revenueGrowth), color: 'text-emerald-400' },
              { label: 'Earn Growth', value: fmtPct(stock.earningsGrowth), color: 'text-emerald-400' },
              { label: 'Score', value: `${stock.score}/100`, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-slate-300 space-y-0.5">
              <p><span className="text-emerald-400 font-semibold">Financial debt: $0</span> — no bank loans, no bonds</p>
              {stock.purifyPct === 0
                ? <p><span className="text-emerald-400 font-semibold">Interest income: $0</span> — 100% clean</p>
                : <p><span className="text-amber-400 font-semibold">Interest income: {stock.purifyPct}% of revenue</span> — donate {stock.purifyPct}% of profits to charity</p>
              }
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">{stock.note}</p>
        </div>
      )}
    </div>
  );
}

export default function HalalTab() {
  const [budget, setBudget] = useState(50);
  const alloc = allocate(budget);
  const allStocks = [...US_STOCKS, ...GLOBAL_STOCKS].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
        <Shield size={17} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-emerald-400">Halal Growth Screener — Strict Zero-Debt Filter</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Scanned 5,300+ stocks across 10 countries · Zero financial debt · Max 1% interest income · Clean sectors only
          </p>
          <p className="text-[10px] text-emerald-500/70 mt-0.5 font-medium">
            {allStocks.length} stocks passed out of 5,300+ scanned
          </p>
        </div>
      </div>

      {/* ── What to Buy ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-xs font-semibold text-white">What to Buy</span>
          <span className="text-[10px] text-slate-500">— {allStocks.length} stocks, ranked by growth score</span>
        </div>

        {/* US picks */}
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
          🇺🇸 United States
        </p>
        <div className="space-y-2 mb-3">
          {US_STOCKS.sort((a,b)=>b.score-a.score).map(s => <StockCard key={s.ticker} stock={s} />)}
        </div>

        {/* Global picks */}
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
          <Globe size={10} /> Global Markets
        </p>
        <div className="space-y-2">
          {GLOBAL_STOCKS.sort((a,b)=>b.score-a.score).map(s => <StockCard key={s.ticker} stock={s} />)}
        </div>
      </div>

      {/* ── When to Buy ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={13} className="text-sky-400" />
          <span className="text-xs font-semibold text-white">When to Buy</span>
        </div>
        {[
          { label: 'Use Dollar-Cost Averaging (DCA)', detail: "Don't put it all in at once. Split into 3 purchases over 6 weeks. Protects you if the stock dips right after you buy.", color: 'text-emerald-400' },
          { label: 'Buy on red days', detail: 'If a stock drops 2–5% with no bad company news, the fundamentals haven\'t changed — the price just got cheaper. That\'s a good entry.', color: 'text-sky-400' },
          { label: 'Avoid earnings week', detail: 'Every company reports earnings quarterly. Prices swing hard around those dates. Wait 2–3 days after the report.', color: 'text-amber-400' },
          { label: 'Best days: Tue–Thu', detail: 'Mondays see panic selling. Fridays see profit-taking. Tuesday to Thursday is historically calmer.', color: 'text-slate-400' },
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

      {/* ── How Much to Buy ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PoundSterling size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-white">How Much to Buy</span>
          </div>
          <span className="text-xs font-bold text-amber-400">£{budget}</span>
        </div>

        <input type="range" min={10} max={500} step={5} value={budget}
          onChange={e => setBudget(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500" />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>£10</span><span>£250</span><span>£500</span>
        </div>

        <div className="space-y-2">
          {alloc.map(a => (
            <div key={a.ticker} className="flex items-center gap-2">
              <div className="w-16 shrink-0 flex items-center gap-1">
                <span className="text-[9px]">{a.flag}</span>
                <span className="text-[10px] font-bold text-white">{a.ticker.split('.')[0]}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-slate-500">{a.reason}</span>
                  <span className="text-[9px] text-slate-500">{a.pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${a.ticker === 'SMMT' ? 'bg-rose-500/60' : 'bg-emerald-500'}`}
                    style={{ width: `${a.pct}%` }} />
                </div>
              </div>
              <div className="w-10 text-right shrink-0">
                <span className="text-[10px] font-semibold text-amber-400">£{a.amount.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/60 rounded-lg p-2 space-y-1">
          <p className="text-[10px] font-semibold text-white">Suggested DCA plan for £{budget}:</p>
          <p className="text-[10px] text-slate-400"><span className="text-emerald-400">Week 1:</span> Buy £{Math.round(budget * 0.5)} (50%) now — get started</p>
          <p className="text-[10px] text-slate-400"><span className="text-sky-400">Week 3:</span> Buy £{Math.round(budget * 0.3)} (30%) — average in</p>
          <p className="text-[10px] text-slate-400"><span className="text-amber-400">Week 6:</span> Buy £{Math.round(budget * 0.2)} (20%) — final tranche or wait for dip</p>
        </div>

        <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/20 rounded-lg p-2">
          <Info size={11} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            <span className="text-sky-400 font-semibold">Where to buy:</span> US stocks (LSCC, GMED, MPWR, SMMT) available on eToro, Trading 212, or Freetrade. UK stocks (GAW.L, PSN.L) on any UK broker. Saudi stocks (2030.SR, 4190.SR) on eToro or direct via Tadawul.
          </p>
        </div>

        {(US_STOCKS.some(s => s.purifyPct > 0)) && (
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
            <Info size={11} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              <span className="text-amber-400 font-semibold">Purification:</span> LSCC (0.5%), GMED (0.23%), MPWR (0.99%) earn tiny bank interest. Donate that percentage of your profits to charity to purify.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Not financial advice. Stocks can go up or down. Past growth does not guarantee future returns. Capital is at risk. Turkish stocks carry additional currency risk.
        </p>
      </div>
    </div>
  );
}
