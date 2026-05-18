'use client'

import { useState } from 'react'
import { HALAL_STOCKS, SECTOR_COLORS, T212_BADGE, HalalStock } from '@/lib/halal/stocks'
import { ShieldCheck, ChevronDown, ChevronUp, Info } from 'lucide-react'

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-orange-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-zinc-300 w-8 text-right">{score}</span>
    </div>
  )
}

function RatioBar({ value, max, label, good }: { value: number; max: number; label: string; good: boolean }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={good ? 'text-green-400' : 'text-red-400'}>{value}%</span>
      </div>
      <div className="bg-zinc-800 rounded-full h-1.5">
        <div
          className={`${good ? 'bg-green-500' : 'bg-red-500'} h-1.5 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function StockCard({ stock }: { stock: HalalStock }) {
  const [expanded, setExpanded] = useState(false)
  const badge = T212_BADGE[stock.t212]
  const sectorCls = SECTOR_COLORS[stock.sector] ?? 'bg-zinc-700/30 text-zinc-300'

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
            {stock.ticker.replace(/\..+/, '').slice(0, 3)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-100">{stock.ticker}</span>
              <span className="text-sm text-zinc-400 truncate">{stock.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full ${sectorCls}`}>{stock.sector}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <ShieldCheck size={10} /> AAOIFI ✓
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 truncate">{stock.why}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-sm font-bold text-zinc-200">{stock.score}/100</span>
            {expanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </div>
        </div>

        <div className="mt-3">
          <ScoreBar score={stock.score} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800/50 p-4 space-y-4">
          {/* AAOIFI Compliance */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              AAOIFI Compliance (biggest scholars standard)
            </p>
            <div className="space-y-3">
              <div>
                <RatioBar
                  value={stock.debtRatio}
                  max={33}
                  label="Debt / Total assets (max 33%)"
                  good={stock.debtRatio <= 33}
                />
              </div>
              <div>
                <RatioBar
                  value={stock.interestRatio}
                  max={5}
                  label="Interest income / Revenue (max 5%)"
                  good={stock.interestRatio <= 5}
                />
              </div>
            </div>
            {stock.interestRatio > 0 && stock.interestRatio <= 5 && (
              <div className="mt-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2">
                <p className="text-xs text-yellow-400">
                  <strong>Purification:</strong> Donate {stock.interestRatio.toFixed(1)}% of your profit from this stock to charity.
                </p>
              </div>
            )}
          </div>

          {/* Growth fundamentals */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Fundamentals
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <p className="text-xs text-zinc-500">Revenue growth</p>
                <p className={`font-medium mt-0.5 ${stock.revenueGrowth >= 10 ? 'text-green-400' : stock.revenueGrowth >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {stock.revenueGrowth > 0 ? '+' : ''}{stock.revenueGrowth}%
                </p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <p className="text-xs text-zinc-500">Gross margin</p>
                <p className={`font-medium mt-0.5 ${stock.grossMargin >= 40 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {stock.grossMargin}%
                </p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <p className="text-xs text-zinc-500">Market cap</p>
                <p className="text-zinc-200 font-medium mt-0.5 capitalize">{stock.marketCap}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <p className="text-xs text-zinc-500">Country</p>
                <p className="text-zinc-200 font-medium mt-0.5">{stock.country}</p>
              </div>
            </div>
          </div>

          {/* T212 instructions */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-green-400 mb-1 flex items-center gap-1">
              <Info size={12} /> How to buy on T212
            </p>
            <p className="text-xs text-zinc-400">{stock.t212Search}</p>
            {stock.t212 === 'likely' && (
              <p className="text-xs text-yellow-400 mt-1">
                ⚠ Search first on T212 to confirm it&apos;s available before planning to buy.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StocksPage() {
  const [filter, setFilter] = useState<'all' | 'mega' | 'large' | 'mid' | 'small'>('all')
  const [country, setCountry] = useState<string>('all')

  const countries = ['all', ...Array.from(new Set(HALAL_STOCKS.map(s => s.country)))]

  const filtered = HALAL_STOCKS
    .filter(s => filter === 'all' || s.marketCap === filter)
    .filter(s => country === 'all' || s.country === country)
    .sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Halal Stocks</h1>
        <p className="text-sm text-zinc-500">AAOIFI-screened · Debt ≤33% · Interest income ≤5%</p>
      </div>

      {/* Info banner */}
      <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={16} className="text-green-400 mt-0.5 shrink-0" />
          <div className="text-xs text-zinc-400 space-y-1">
            <p><strong className="text-green-300">AAOIFI Standard</strong> — used by MSCI Islamic Index, Dow Jones Islamic Market, and BlackRock Islamic funds. The most widely accepted standard by major Islamic scholars globally.</p>
            <p>Rules: no forbidden sectors (banking, alcohol, tobacco, gambling, weapons), debt/assets ≤33%, interest income/revenue ≤5%.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'mega', 'large', 'mid', 'small'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-green-900/50 border-green-700/50 text-green-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {f === 'all' ? 'All sizes' : f.charAt(0).toUpperCase() + f.slice(1) + ' cap'}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {countries.map(c => (
          <button
            key={c}
            onClick={() => setCountry(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              country === c
                ? 'bg-blue-900/50 border-blue-700/50 text-blue-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {c === 'all' ? 'All countries' : c}
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-500">{filtered.length} stocks</p>

      <div className="space-y-3">
        {filtered.map(stock => (
          <StockCard key={stock.ticker} stock={stock} />
        ))}
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/30 rounded-xl p-4 text-xs text-zinc-500 space-y-1">
        <p><strong className="text-zinc-400">Disclaimer:</strong> This is for educational purposes only, not financial advice.</p>
        <p>Always verify current ratios before investing — company finances change. For the most accurate Halal screening, consult IslamicFinanceGuru.com or a qualified Islamic finance scholar.</p>
      </div>
    </div>
  )
}
