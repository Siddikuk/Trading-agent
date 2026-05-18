'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadSettings, getPositions, getAccountSummary, Position, AccountSummary } from '@/lib/t212'
import { getRecommendation, getRotationPlan, portfolioSummary, projectedValue } from '@/lib/recommendation'
import { Settings, RefreshCw, TrendingUp, TrendingDown, ShoppingCart, Zap, Calendar, AlertCircle } from 'lucide-react'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const CACHE_KEY = 'hp_dash_v1'
const CACHE_TTL = 60_000

export default function Dashboard() {
  const [mounted, setMounted] = useState(false)
  const [hasKey, setHasKey]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]     = useState('')
  const [positions, setPositions] = useState<Position[]>([])
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [cacheAge, setCacheAge] = useState<number | null>(null)
  const [budget, setBudget]   = useState(50)
  const [dcaDay, setDcaDay]   = useState(0)

  async function load(force = false) {
    const s = loadSettings()
    if (!s.apiKey) return

    if (!force) {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const c = JSON.parse(raw)
          if (Date.now() - c.ts < CACHE_TTL) {
            setPositions(c.positions)
            setAccount(c.account)
            setCacheAge(Math.round((Date.now() - c.ts) / 1000))
            setLoading(false)
            setRefreshing(false)
            return
          }
        }
      } catch { /* ignore */ }
    }

    setError('')
    try {
      const pos = await getPositions(s)
      await new Promise(r => setTimeout(r, 1500)) // respect T212 rate limit
      const acc = await getAccountSummary(s)
      setPositions(pos)
      setAccount(acc)
      setCacheAge(0)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ positions: pos, account: acc, ts: Date.now() })) } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('429') ? 'T212 rate limit — wait 30 s then click Refresh' : msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    const s = loadSettings()
    setBudget(s.weeklyBudget)
    setDcaDay(s.dcaDay)
    if (!s.apiKey) { setHasKey(false); setLoading(false) }
    else { setHasKey(true); load() }
  }, []) // eslint-disable-line

  if (!mounted) return null

  // ── No key ─────────────────────────────────────────────────────────────────
  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
        <div className="w-16 h-16 bg-green-900/30 rounded-2xl flex items-center justify-center">
          <Settings size={28} className="text-green-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-100">Connect Trading 212</p>
          <p className="text-sm text-zinc-400 mt-1">Add your API keys to see your live portfolio and get recommendations</p>
        </div>
        <Link href="/settings"
          className="bg-green-700 hover:bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Go to Settings →
        </Link>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-400">Connecting to T212…</p>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="text-red-400" size={32} />
        <p className="text-zinc-200 font-medium">Connection failed</p>
        <p className="text-sm text-zinc-500 max-w-sm">{error}</p>
        <div className="flex gap-3">
          <button onClick={() => { setRefreshing(true); setLoading(true); load(true) }}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
            Retry
          </button>
          <Link href="/settings"
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Settings
          </Link>
        </div>
      </div>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  const rec = getRecommendation(positions, budget, dcaDay)
  const plan = getRotationPlan(budget, positions)
  const summary = portfolioSummary(positions)
  const proj10 = projectedValue(budget, 10, 15)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {cacheAge !== null && (
              <span className="ml-2 text-zinc-600 text-xs">
                · {cacheAge === 0 ? 'just refreshed' : `data ${cacheAge}s old`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); setLoading(true); load(true) }}
          disabled={refreshing}
          className="p-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
          title="Refresh live data (max once per minute)"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'Portfolio value', value: `£${fmt(summary.totalValue)}`, sub: account ? `Cash: £${fmt(account.cash.free)}` : `${summary.positions} stocks` },
          { label: 'Invested', value: `£${fmt(summary.totalInvested)}`, sub: `${summary.positions} positions` },
          {
            label: 'Total return',
            value: `${summary.totalPnl >= 0 ? '+' : ''}£${fmt(Math.abs(summary.totalPnl))}`,
            sub: `${summary.pnlPct >= 0 ? '+' : ''}${fmt(summary.pnlPct)}%`,
            colour: summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400',
          },
          { label: 'In 10 years*', value: `£${Math.round(proj10).toLocaleString()}`, sub: '£50/wk · 15%/yr estimate' },
        ].map(({ label, value, sub, colour }) => (
          <div key={label} className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className={`text-base font-bold mt-0.5 ${colour ?? 'text-zinc-100'}`}>{value}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* THIS WEEK'S BUY */}
      <div className="rounded-2xl overflow-hidden border-2 border-green-700/60 bg-gradient-to-br from-green-950/80 to-zinc-900/90">
        <div className="bg-green-700/25 px-5 py-2.5 flex items-center gap-2">
          <Zap size={13} className="text-green-300" />
          <span className="text-sm font-black text-green-200 uppercase tracking-widest">
            This week — {rec.daysUntil === 0 ? '🟢 Buy today' : `Buy on ${rec.dcaDayName} (in ${rec.daysUntil} day${rec.daysUntil !== 1 ? 's' : ''})`}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Stock identity */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-green-900/50 border border-green-600/30 rounded-2xl flex items-center justify-center text-xl font-black text-green-200 shrink-0 select-none">
              {rec.stock.ticker.split('.')[0].slice(0, 3)}
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-white leading-tight">{rec.stock.name}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{rec.stock.ticker} · {rec.stock.exchange} · {rec.stock.sector}</p>
              <p className="text-sm text-green-300 mt-1 italic">&ldquo;{rec.stock.description}&rdquo;</p>
            </div>
          </div>

          {/* WHAT / HOW MUCH / WHEN */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-black/50 rounded-xl p-3 text-center border border-zinc-800/50">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">WHAT</p>
              <p className="text-lg font-black text-zinc-100 mt-1">{rec.stock.ticker.split('.')[0]}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{rec.stock.exchange}</p>
            </div>
            <div className="bg-black/50 rounded-xl p-3 text-center border border-green-700/40">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">HOW MUCH</p>
              <p className="text-3xl font-black text-green-400 mt-1">£{budget}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">fractional OK</p>
            </div>
            <div className="bg-black/50 rounded-xl p-3 text-center border border-zinc-800/50">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">WHEN</p>
              <p className="text-lg font-black text-zinc-100 mt-1">
                {rec.daysUntil === 0 ? 'TODAY' : `${rec.dcaDayName.slice(0, 3)}`}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {rec.daysUntil === 0 ? 'right now' : `in ${rec.daysUntil} day${rec.daysUntil !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          {/* WHY */}
          <div className="bg-black/40 rounded-xl p-4 space-y-2.5">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Why this stock this week</p>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">AAOIFI Halal</strong> · Musaffa grade <strong className="text-green-300">{rec.stock.musaffaGrade}</strong> · {rec.stock.debtRatioNote}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">Why own it:</strong> {rec.stock.description}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">DCA:</strong> {rec.reason}
                </span>
              </div>
              {rec.stock.interestIncomeRatio > 0 && (
                <div className="flex gap-2">
                  <span className="text-yellow-400 shrink-0 mt-0.5">☽</span>
                  <span className="text-zinc-300">
                    <strong className="text-yellow-300">Purification:</strong> {rec.stock.purificationNote}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* How to buy */}
          <div className="bg-green-950/50 rounded-xl p-4 border border-green-800/30">
            <p className="text-[10px] font-semibold text-green-400 uppercase tracking-widest mb-2">How to buy on Trading 212</p>
            <ol className="space-y-1 text-sm text-zinc-300 list-decimal list-inside">
              <li>Open the <strong className="text-white">Trading 212</strong> app</li>
              <li>Tap <strong className="text-white">Invest</strong> → search <strong className="text-green-300">&ldquo;{rec.stock.ticker}&rdquo;</strong></li>
              <li>Tap <strong className="text-white">Buy</strong> → select <strong className="text-white">By value</strong></li>
              <li>Enter <strong className="text-green-400">£{budget}</strong> → confirm</li>
            </ol>
          </div>

          <a href="https://www.trading212.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-colors">
            <ShoppingCart size={15} />
            Open Trading 212
          </a>
        </div>
      </div>

      {/* 12-week rotation */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
          <Calendar size={14} className="text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-300">12-week rotation plan</p>
          <span className="text-xs text-zinc-600 ml-auto">£{budget}/week · every {rec.dcaDayName}</span>
        </div>
        <div className="divide-y divide-zinc-800/40">
          {plan.map(({ stock, held, weeksFromNow, isThisWeek }) => (
            <div key={stock.ticker}
              className={`flex items-center gap-3 px-4 py-2.5 ${isThisWeek ? 'bg-green-900/20' : ''}`}>
              <div className="w-10 shrink-0 text-center">
                {isThisWeek
                  ? <span className="text-[10px] font-bold text-green-400 bg-green-900/40 px-1.5 py-0.5 rounded-full">NOW</span>
                  : <span className="text-xs text-zinc-600">+{weeksFromNow}w</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isThisWeek ? 'text-green-300' : 'text-zinc-200'}`}>
                    {stock.ticker}
                  </span>
                  <span className="text-xs text-zinc-500 truncate hidden sm:block">{stock.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                    stock.musaffaGrade.startsWith('A') ? 'text-green-400 bg-green-900/20 border-green-800/40'
                    : 'text-blue-400 bg-blue-900/20 border-blue-800/40'
                  }`}>{stock.musaffaGrade}</span>
                </div>
                <p className="text-[10px] text-zinc-600 truncate">{stock.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-bold ${isThisWeek ? 'text-green-400' : 'text-zinc-300'}`}>£{budget}</p>
                {held ? (
                  <p className={`text-xs ${held.ppl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {held.ppl >= 0 ? '+' : ''}£{fmt(held.ppl, 0)}
                  </p>
                ) : (
                  <p className="text-[10px] text-zinc-700">not held</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-zinc-800/50 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700">*10yr projection assumes 15%/yr — not a guarantee</p>
          <Link href="/stocks" className="text-xs text-green-500 hover:text-green-400 transition-colors">
            See all stocks →
          </Link>
        </div>
      </div>

      {/* Top positions */}
      {positions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-300">Your positions</p>
            <Link href="/portfolio" className="text-xs text-green-500 hover:text-green-400">All positions →</Link>
          </div>
          <div className="space-y-2.5">
            {[...positions].sort((a, b) => b.ppl - a.ppl).slice(0, 5).map(p => (
              <div key={p.ticker} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                  {p.ticker.split('.')[0].slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{p.ticker}</p>
                  <p className="text-xs text-zinc-600">{fmt(p.quantity, 4)} × £{fmt(p.averagePrice)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-zinc-200">£{fmt(p.currentPrice * p.quantity)}</p>
                  <p className={`text-xs flex items-center gap-0.5 justify-end ${p.ppl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {p.ppl >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {p.ppl >= 0 ? '+' : ''}£{fmt(Math.abs(p.ppl))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
