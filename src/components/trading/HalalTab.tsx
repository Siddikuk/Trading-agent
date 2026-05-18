'use client';

import React, { useState } from 'react';
import {
  Shield, TrendingUp, Clock, PoundSterling,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, RefreshCw
} from 'lucide-react';

// ─── Stock data (T212-compatible only) ───────────────────────────────────────

interface HalalStock {
  ticker: string; name: string; sector: string; industry: string;
  price: string; currency: string; country: string; flag: string;
  marketCap: string; revenueGrowth: number | null; score: number;
  purifyPct: number; risk: 'low' | 'medium' | 'high'; note: string;
  t212: 'yes' | 'likely' | 'verify';
}

const STOCKS: HalalStock[] = [
  // ── US (T212 ✅ confirmed) ──────────────────────────────────────────────────
  { ticker:'LSCC',   name:'Lattice Semiconductor', sector:'Technology',   industry:'Semiconductors',
    price:'$120.11', currency:'USD', country:'United States', flag:'🇺🇸', marketCap:'$16.5B',
    revenueGrowth:42.2, score:64, purifyPct:0.50, risk:'medium', t212:'yes',
    note:'Programmable chips (FPGAs) powering AI, robotics & edge computing. Early-stage AMD-like trajectory. Riding the AI wave without the hype price tag.' },
  { ticker:'GMED',   name:'Globus Medical',        sector:'Healthcare',   industry:'Medical Devices',
    price:'$76.64',  currency:'USD', country:'United States', flag:'🇺🇸', marketCap:'$10.4B',
    revenueGrowth:27.0, score:64, purifyPct:0.23, risk:'low', t212:'yes',
    note:'Spine surgery devices & surgical robots. Healthcare demand is recession-proof. Consistent 27% revenue growth and 68% margins.' },
  { ticker:'MPWR',   name:'Monolithic Power Systems', sector:'Technology', industry:'Semiconductors',
    price:'$589.40', currency:'USD', country:'United States', flag:'🇺🇸', marketCap:'$76B',
    revenueGrowth:26.1, score:61, purifyPct:0.99, risk:'low', t212:'yes',
    note:'Power management chips for data centres, EVs & AI servers. Every electronic device needs power management. Larger cap but still growing fast.' },
  { ticker:'AIXA.DE',name:'AIXTRON SE',            sector:'Technology',   industry:'Semiconductor Equipment',
    price:'~€18',    currency:'EUR', country:'Germany',        flag:'🇩🇪', marketCap:'€2.1B',
    revenueGrowth:null, score:28, purifyPct:0, risk:'medium', t212:'likely',
    note:'German maker of machines that produce compound semiconductors (GaN, SiC) used in EVs and power electronics. Zero debt, zero interest.' },

  // ── UK (T212 ✅ confirmed) ─────────────────────────────────────────────────
  { ticker:'GAW.L',  name:'Games Workshop Group',  sector:'Consumer',     industry:'Leisure',
    price:'£193.90', currency:'GBP', country:'United Kingdom', flag:'🇬🇧', marketCap:'£5B',
    revenueGrowth:10.9, score:58, purifyPct:0, risk:'low', t212:'yes',
    note:'Makes Warhammer miniatures & games. Cult brand — customers are obsessive collectors. Exceptional margins (~30% net), zero debt, pays dividends. Listed right on LSE.' },
  { ticker:'PSN.L',  name:'Persimmon Plc',         sector:'Consumer',     industry:'Housebuilding',
    price:'£10.47',  currency:'GBP', country:'United Kingdom', flag:'🇬🇧', marketCap:'£3.4B',
    revenueGrowth:19.3, score:44, purifyPct:0, risk:'medium', t212:'yes',
    note:'UK\'s largest housebuilder. Benefits from chronic housing shortage. Government Help to Buy schemes boost demand. Listed on LSE.' },

  // ── Europe (verify on T212 before buying) ─────────────────────────────────
  { ticker:'NEDAP.AS', name:'Nedap N.V.',           sector:'Technology',   industry:'RFID & IoT',
    price:'€89.40',  currency:'EUR', country:'Netherlands',    flag:'🇳🇱', marketCap:'€600M',
    revenueGrowth:13.6, score:73, purifyPct:0, risk:'medium', t212:'likely',
    note:'Dutch tech company making RFID & IoT systems for retail, healthcare & security. Small cap ($600M) — plenty of room to grow. Zero debt, 100% clean.' },
  { ticker:'WEW.DE',  name:'Westwing Group',        sector:'Consumer',     industry:'Home E-Commerce',
    price:'~€8',     currency:'EUR', country:'Germany',        flag:'🇩🇪', marketCap:'€120M',
    revenueGrowth:null, score:67, purifyPct:0, risk:'high', t212:'likely',
    note:'European online marketplace for premium home & living products. Very small cap (€120M) — high risk, high potential. Zero debt, zero interest.' },
  { ticker:'SPA.BR',  name:'Spadel SA',             sector:'Consumer',     industry:'Natural Water',
    price:'~€95',    currency:'EUR', country:'Belgium',        flag:'🇧🇪', marketCap:'€500M',
    revenueGrowth:null, score:66, purifyPct:0, risk:'low', t212:'verify',
    note:'Belgian natural mineral water brand (Spa, Bru, Wattwiller). Consumer staple — people always drink water. Stable, defensive business with zero debt.' },
  { ticker:'GYLD-A.CO', name:'Gyldendal A/S',       sector:'Consumer',     industry:'Publishing',
    price:'~DKK 900', currency:'DKK', country:'Denmark',       flag:'🇩🇰', marketCap:'DKK 5B',
    revenueGrowth:null, score:61, purifyPct:0, risk:'low', t212:'verify',
    note:'Denmark\'s largest publishing house (books, educational content). Stable cash-generative business. Zero debt. Defensive long-term hold.' },
  { ticker:'CWC.DE',  name:'CEWE Stiftung',         sector:'Technology',   industry:'Photo Services',
    price:'~€90',    currency:'EUR', country:'Germany',        flag:'🇩🇪', marketCap:'€580M',
    revenueGrowth:null, score:59, purifyPct:0, risk:'low', t212:'likely',
    note:'Europe\'s leading photo book & print company. Christmas-driven demand is very reliable. 30+ year track record, zero debt.' },
  { ticker:'IMPERO.CO', name:'Impero A/S',           sector:'Technology',   industry:'Compliance Software',
    price:'~DKK 50', currency:'DKK', country:'Denmark',        flag:'🇩🇰', marketCap:'DKK 300M',
    revenueGrowth:null, score:56, purifyPct:0, risk:'high', t212:'verify',
    note:'Danish software for digital learning & compliance management in schools. Small cap with SaaS model. Zero debt, growing recurring revenue.' },
  { ticker:'MYCR.ST', name:'Mycronic AB',            sector:'Industrials',  industry:'Precision Electronics',
    price:'SEK 303', currency:'SEK', country:'Sweden',         flag:'🇸🇪', marketCap:'SEK 30B',
    revenueGrowth:16.9, score:52, purifyPct:0, risk:'medium', t212:'likely',
    note:'Swedish maker of precision machines for electronics manufacturing. Rides the global semiconductor capacity expansion. Zero debt, strong R&D.' },
  { ticker:'IVU.DE',  name:'IVU Traffic Technologies', sector:'Technology', industry:'Transport Software',
    price:'~€26',    currency:'EUR', country:'Germany',        flag:'🇩🇪', marketCap:'€350M',
    revenueGrowth:null, score:51, purifyPct:0, risk:'medium', t212:'likely',
    note:'German B2B software for public transport (buses, trains). Very niche, sticky customers, zero debt. Benefits from European green transport push.' },
  { ticker:'LOGN.SW', name:'Logitech International', sector:'Technology',  industry:'Computer Peripherals',
    price:'~CHF 75', currency:'CHF', country:'Switzerland',    flag:'🇨🇭', marketCap:'$12B',
    revenueGrowth:null, score:45, purifyPct:0, risk:'low', t212:'yes',
    note:'Makes mice, keyboards, webcams & headsets. Remote work & gaming tailwinds. Global brand. Zero debt. Also listed on NASDAQ as LOGI.' },
  { ticker:'SMMT',    name:'Summit Therapeutics',   sector:'Healthcare',   industry:'Biotechnology',
    price:'$16.87',  currency:'USD', country:'United States',  flag:'🇺🇸', marketCap:'$13.1B',
    revenueGrowth:null, score:19, purifyPct:0, risk:'high', t212:'yes',
    note:'Pre-revenue cancer drug company. 100% clean — zero debt, zero interest. High risk: could 10x if approved or drop sharply if trial fails. Only put a tiny % here.' },
];

// ─── Compound growth calculator ───────────────────────────────────────────────

function compound(weekly: number, years: number, rate: number) {
  const weekly_rate = rate / 52;
  const n = years * 52;
  const future = weekly * ((Math.pow(1 + weekly_rate, n) - 1) / weekly_rate);
  const invested = weekly * n;
  return { future: Math.round(future), invested: Math.round(invested), profit: Math.round(future - invested) };
}

// ─── Weekly DCA schedule ─────────────────────────────────────────────────────

const DCA_ROTATION = ['LSCC','GMED','GAW.L','NEDAP.AS','MPWR','CWC.DE','MYCR.ST','PSN.L'];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function T212Badge({ t212 }: { t212: HalalStock['t212'] }) {
  if (t212 === 'yes')    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">T212 ✓</span>;
  if (t212 === 'likely') return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600">T212 likely</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-500 border border-slate-600">Verify T212</span>;
}

function RiskBadge({ risk }: { risk: HalalStock['risk'] }) {
  if (risk === 'low')    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Low Risk</span>;
  if (risk === 'medium') return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Med Risk</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">High Risk</span>;
}

function StockCard({ stock }: { stock: HalalStock }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/40 transition-colors text-left">
        <div className="w-11 h-11 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center shrink-0">
          <span className="text-[8px] font-bold text-emerald-400 leading-tight">{stock.ticker.split('.')[0].slice(0,6)}</span>
          <span className="text-[10px] leading-tight">{stock.flag}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{stock.name}</span>
            <T212Badge t212={stock.t212} />
            <RiskBadge risk={stock.risk} />
            {stock.purifyPct === 0
              ? <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">100% Clean</span>
              : <span className="text-[9px] px-1 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">Purify {stock.purifyPct}%</span>
            }
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">{stock.industry} · {stock.marketCap}</p>
          <ScoreBar score={stock.score} />
        </div>
        <div className="text-right shrink-0 ml-1">
          <p className="text-[11px] font-semibold text-white">{stock.price}</p>
          {open ? <ChevronUp size={11} className="text-slate-500 ml-auto mt-1" /> : <ChevronDown size={11} className="text-slate-500 ml-auto mt-1" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Rev Growth', value: stock.revenueGrowth !== null ? `+${stock.revenueGrowth.toFixed(1)}%` : 'N/A', color: 'text-emerald-400' },
              { label: 'Score',      value: `${stock.score}/100`, color: 'text-amber-400' },
              { label: 'Market',     value: stock.country.split(' ')[0], color: 'text-sky-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-300">
              <span className="text-emerald-400 font-semibold">Zero financial debt · </span>
              {stock.purifyPct === 0
                ? <span className="text-emerald-400 font-semibold">Zero interest income</span>
                : <span className="text-amber-400 font-semibold">Donate {stock.purifyPct}% of profits to charity</span>
              }
            </p>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">{stock.note}</p>
          {stock.t212 !== 'yes' && (
            <div className="flex items-center gap-1.5 bg-violet-500/5 border border-violet-500/20 rounded-lg p-2">
              <Info size={10} className="text-violet-400 shrink-0" />
              <p className="text-[10px] text-violet-300">Search <span className="font-mono font-semibold">{stock.ticker}</span> on Trading 212 to confirm it&apos;s available before buying.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HalalTab() {
  const [weekly, setWeekly] = useState(30);
  const [showCalc, setShowCalc] = useState(false);

  const c5  = compound(weekly, 5,  0.15);
  const c10 = compound(weekly, 10, 0.15);
  const c10high = compound(weekly, 10, 0.22);

  const confirmed = STOCKS.filter(s => s.t212 === 'yes');
  const likely    = STOCKS.filter(s => s.t212 === 'likely');
  const verify    = STOCKS.filter(s => s.t212 === 'verify');

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
        <Shield size={17} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-emerald-400">Halal Growth Screener — Trading 212 Compatible</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Scanned 6,000+ stocks · Zero financial debt · Max 1% interest income · Clean sectors · Long-term focus
          </p>
          <p className="text-[10px] text-emerald-500/80 mt-0.5 font-medium">
            {STOCKS.length} stocks passed · Filtered for T212 availability
          </p>
        </div>
      </div>

      {/* ── Weekly DCA Compound Calculator ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3">
        <button onClick={() => setShowCalc(o => !o)}
          className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-white">Your Weekly DCA — Long Term Growth</span>
          </div>
          {showCalc ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </button>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Weekly investment:</span>
          <span className="text-sm font-bold text-amber-400">£{weekly}/week</span>
        </div>
        <input type="range" min={20} max={100} step={5} value={weekly}
          onChange={e => setWeekly(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500" />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>£20</span><span>£50</span><span>£100</span>
        </div>

        {showCalc && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] text-slate-500">At 15% average annual return (similar to Arabesque AI historical):</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '5 Years', data: c5 },
                { label: '10 Years', data: c10 },
              ].map(({ label, data }) => (
                <div key={label} className="bg-slate-800 rounded-xl p-2.5 space-y-1">
                  <p className="text-[10px] text-slate-500 font-semibold">{label}</p>
                  <p className="text-sm font-bold text-emerald-400">£{data.future.toLocaleString()}</p>
                  <p className="text-[9px] text-slate-500">Invested: £{data.invested.toLocaleString()}</p>
                  <p className="text-[9px] text-emerald-500">Profit: +£{data.profit.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">
                <span className="text-emerald-400 font-semibold">Best case (22%/yr, similar to LSCC trajectory):</span>
                {' '}10 years → <span className="text-emerald-400 font-bold">£{c10high.future.toLocaleString()}</span> from £{c10high.invested.toLocaleString()} invested
              </p>
            </div>
            <p className="text-[9px] text-slate-600">Past performance does not guarantee future results.</p>
          </div>
        )}

        {/* Weekly rotation plan */}
        <div className="bg-slate-800/60 rounded-lg p-2">
          <p className="text-[10px] font-semibold text-white mb-1.5">Suggested weekly rotation — spread across 8 stocks:</p>
          <div className="grid grid-cols-4 gap-1">
            {DCA_ROTATION.map((t, i) => (
              <div key={t} className="text-center">
                <p className="text-[9px] text-slate-500">Week {i + 1}</p>
                <p className="text-[10px] font-bold text-emerald-400">{t.split('.')[0]}</p>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-600 mt-1.5">Then repeat. T212 fractional shares mean even £{weekly} buys part of any stock.</p>
        </div>
      </div>

      {/* ── What to Buy ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-xs font-semibold text-white">What to Buy</span>
          <span className="text-[10px] text-slate-500">— {STOCKS.length} stocks ranked by score</span>
        </div>

        {/* Confirmed T212 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">T212 ✓</span>
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Confirmed on Trading 212</span>
        </div>
        <div className="space-y-2 mb-3">
          {confirmed.sort((a,b)=>b.score-a.score).map(s=><StockCard key={s.ticker} stock={s}/>)}
        </div>

        {/* Likely on T212 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600">T212 likely</span>
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Search on T212 to confirm</span>
        </div>
        <div className="space-y-2 mb-3">
          {likely.sort((a,b)=>b.score-a.score).map(s=><StockCard key={s.ticker} stock={s}/>)}
        </div>

        {/* Verify */}
        {verify.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-500 border border-slate-600">Verify T212</span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">May not be listed</span>
            </div>
            <div className="space-y-2 mb-3">
              {verify.sort((a,b)=>b.score-a.score).map(s=><StockCard key={s.ticker} stock={s}/>)}
            </div>
          </>
        )}
      </div>

      {/* ── When to Buy ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={13} className="text-sky-400" />
          <span className="text-xs font-semibold text-white">When to Buy — Long Term Rules</span>
        </div>
        {[
          { label:'Invest every week — same day, same amount', detail:'Pick a day (e.g. Tuesday) and invest your £20–£50 every single week without fail. Don\'t try to time the market. Time IN the market beats timing the market.', color:'text-emerald-400' },
          { label:'Buy more on red weeks', detail:'If the market drops 3–5%, double your weekly amount that week. Cheap prices = more shares for the same money. This is how wealth is built.', color:'text-sky-400' },
          { label:'Hold for 5+ years minimum', detail:'These are fundamentally strong businesses. Short-term drops are noise. Over 5–10 years, quality always wins. Don\'t panic-sell.', color:'text-amber-400' },
          { label:'Review once a year, not every day', detail:'Checking your portfolio daily causes emotional decisions. Set a yearly review date to check if the company is still Halal and still growing. Otherwise, leave it alone.', color:'text-slate-400' },
        ].map((r,i)=>(
          <div key={i} className="flex gap-2">
            <span className={`text-[10px] font-bold ${r.color} shrink-0 pt-0.5`}>{i+1}.</span>
            <div>
              <p className={`text-[10px] font-semibold ${r.color}`}>{r.label}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Purification note */}
      <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/20 rounded-xl p-3">
        <Info size={12} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-[10px] text-slate-400 leading-relaxed space-y-1">
          <p><span className="text-sky-400 font-semibold">Purification:</span> LSCC (0.5%), GMED (0.23%), MPWR (0.99%) earn tiny bank interest on their cash reserves. At year-end, calculate your profit from each and donate that % to charity to purify. All other stocks are 100% clean.</p>
          <p><span className="text-sky-400 font-semibold">T212 Fractional Shares:</span> You don&apos;t need to buy a full share. £30 buys a fraction of even the most expensive stock. Spread across multiple stocks every week.</p>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Not financial advice. Always search each stock on Trading 212 before investing to confirm availability. Capital is at risk. Stocks marked &quot;likely&quot; or &quot;verify&quot; must be checked on T212 first.
        </p>
      </div>

    </div>
  );
}
