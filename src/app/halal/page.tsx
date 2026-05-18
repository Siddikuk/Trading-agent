'use client'

import { useEffect, useState } from 'react'
import { loadSettings, getPositions, getAccountSummary, T212Position, T212AccountSummary } from '@/lib/halal/t212'
import { getRecommendation, summarisePortfolio, projectValue, formatDcaDay, getWeekNumber } from '@/lib/halal/recommendation'
import { HALAL_STOCKS, DCA_ROTATION } from '@/lib/halal/stocks'
import { TrendingUp, TrendingDown, ShoppingCart, AlertCircle, Settings, Zap, Calendar, RefreshCw } from 'lucide-react'
import Link from 'next/link'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const CACHE_KEY = 'halal_dash_v1'
const CACHE_TTL = 60_000

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (Date.now() - c.ts > CACHE_TTL) return null
    return c as { positions: T212Position[]; account: T212AccountSummary; ts: number }
  } catch { return null }
}

function writeCache(positions: T212Position[], account: T212AccountSummary) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ positions, account, ts: Date.now() })) } catch { /* ignore */ }
}

export default function DashboardPage() {
  const [mounted, setMounted]     = useState(false)
  const [hasKey, setHasKey]       = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [positions, setPositions] = useState<T212Position[]>([])
  const [account, setAccount]     = useState<T212AccountSummary | null>(null)
  const [cacheAge, setCacheAge]   = useState<number | null>(null)
  const [budget, setBudget]       = useState(50)
  const [dcaDay, setDcaDay]       = useState(0)

  async function fetchData(force = false) {
    const s = loadSettings()
    if (!s.apiKey) return

    if (!force) {
      const cached = readCache()
      if (cached) {
        setPositions(cached.positions)
        setAccount(cached.account)
        setCacheAge(Math.round((Date.now() - cached.ts) / 1000))
        setLoading(false)
        return
      }
    }

    setError('')
    try {
      const pos = await getPositions(s)
      await new Promise(r => setTimeout(r, 1500))
      const acc = await getAccountSummary(s)
      setPositions(pos)
      setAccount(acc)
      setCacheAge(0)
      writeCache(pos, acc)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('429') ? 'T212 rate limit — wait 30 seconds then click Refresh' : msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    const s = loadSettings()
    setBudget(s.weeklyBudget)
    setDcaDay(s.dcaDay)
    if (!s.apiKey) {
      setHasKey(false)
      setLoading(false)
    } else {
      setHasKey(true)
      fetchData()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent any SSR/hydration mismatch — render nothing until mounted
  if (!mounted) return null

  // ── No API key ──────────────────────────────────────────────────────────────
  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
          <Settings size={28} className="text-green-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-200">Connect your Trading 212 account</p>
          <p className="text-sm text-zinc-400 mt-1">Add your API key in Settings to see your live portfolio</p>
        </div>
        <Link href="/halal/settings" className="bg-green-700 hover:bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Go to Settings →
        </Link>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Connecting to T212…</p>
        </div>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <AlertCircle className="text-red-400" size={32} />
        <p className="text-zinc-300 font-medium">Connection failed</p>
        <p className="text-sm text-zinc-500 max-w-sm">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setLoading(true); fetchData(true) }}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
          <Link href="/halal/settings" className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Settings
          </Link>
        </div>
      </div>
    )
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const settings = loadSettings()
  const summary = summarisePortfolio(positions)
  const rec = getRecommendation(positions, budget, dcaDay)
  const posMap = new Map(positions.map(p => [p.ticker, p]))

  const weekNum = getWeekNumber()
  const rotationPlan = DCA_ROTATION.map((ticker, i) => {
    const stock = HALAL_STOCKS.find(s => s.ticker === ticker) ?? HALAL_STOCKS[0]
    const held = posMap.get(ticker)
    const currentRotIdx = weekNum % DCA_ROTATION.length
    const weeksFromNow = (i - currentRotIdx + DCA_ROTATION.length) % DCA_ROTATION.length
    return { stock, held, weeksFromNow, isThisWeek: weeksFromNow === 0 }
  }).sort((a, b) => a.weeksFromNow - b.weeksFromNow)

  const proj10 = projectValue(budget, 10, 15)
  const dcaDayName = formatDcaDay(dcaDay)
  const today = new Date().getDay()
  const daysUntil = ((dcaDay + 1 - today) + 7) % 7

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {cacheAge !== null && <span className="ml-2 text-zinc-600 text-xs">· {cacheAge === 0 ? 'just refreshed' : `${cacheAge}s ago`}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); fetchData(true) }}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh (max once per minute)"
          >
            <RefreshCw size={15} />
          </button>
          <Link href="/halal/settings" className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Portfolio</p>
          <p className="text-lg font-bold text-zinc-100 mt-0.5">£{fmt(summary.totalValue)}</p>
          {account && <p className="text-xs text-zinc-500">Cash: £{fmt(account.cash.free)}</p>}
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Invested</p>
          <p className="text-lg font-bold text-zinc-100 mt-0.5">£{fmt(summary.totalInvested)}</p>
          <p className="text-xs text-zinc-500">{summary.positions} stocks</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Return</p>
          <p className={`text-lg font-bold mt-0.5 ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalPnl >= 0 ? '+' : ''}£{fmt(Math.abs(summary.totalPnl))}
          </p>
          <p className={`text-xs ${summary.totalPnlPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {summary.totalPnlPct >= 0 ? '+' : ''}{fmt(summary.totalPnlPct)}%
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">If held 10yr</p>
          <p className="text-lg font-bold text-green-300 mt-0.5">£{Math.round(proj10).toLocaleString()}</p>
          <p className="text-xs text-zinc-500">at 15%/yr</p>
        </div>
      </div>

      {/* THIS WEEK'S BUY */}
      <div className="bg-gradient-to-br from-green-950/70 to-zinc-900/80 border-2 border-green-700/50 rounded-2xl overflow-hidden">
        <div className="bg-green-700/30 px-5 py-2.5 flex items-center gap-2">
          <Zap size={14} className="text-green-300" />
          <span className="text-sm font-bold text-green-200 uppercase tracking-wide">
            This week — {daysUntil === 0 ? 'Buy today!' : `Buy on ${dcaDayName}`}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Stock identity */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-green-900/50 border border-green-600/30 rounded-2xl flex items-center justify-center text-xl font-black text-green-300 shrink-0">
              {rec.stock.ticker.replace(/\..+/, '').slice(0, 3)}
            </div>
            <div>
              <p className="text-xl font-bold text-white">{rec.stock.name}</p>
              <p className="text-sm text-zinc-400">{rec.stock.ticker} · {rec.stock.exchange} · {rec.stock.sector}</p>
              <p className="text-sm text-green-300 mt-0.5 italic">&ldquo;{rec.stock.why}&rdquo;</p>
            </div>
          </div>

          {/* What / How much / When */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/40 rounded-xl p-3 text-center border border-green-900/30">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">What</p>
              <p className="text-base font-bold text-zinc-100">{rec.stock.ticker}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{rec.stock.sector}</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 text-center border border-green-700/40">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">How much</p>
              <p className="text-2xl font-black text-green-400">£{budget}</p>
              <p className="text-xs text-zinc-400 mt-0.5">fractional ok</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 text-center border border-green-900/30">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">When</p>
              <p className="text-base font-bold text-zinc-100">{daysUntil === 0 ? 'TODAY' : `in ${daysUntil}d`}</p>
              <p className="text-xs text-zinc-400 mt-0.5">every {dcaDayName}</p>
            </div>
          </div>

          {/* Why */}
          <div className="bg-black/30 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Why this stock this week</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">AAOIFI Halal:</strong> Debt {rec.stock.debtRatio}% of assets (max 33%) · Interest income {rec.stock.interestRatio}% of revenue (max 5%)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">Growth:</strong> Revenue +{rec.stock.revenueGrowth}% last year · Gross margin {rec.stock.grossMargin}%
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">✓</span>
                <span className="text-zinc-300">
                  <strong className="text-white">Score:</strong> {rec.stock.score}/100 — #{HALAL_STOCKS.findIndex(s => s.ticker === rec.stock.ticker) + 1} of {HALAL_STOCKS.length} screened
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0">→</span>
                <span className="text-zinc-300"><strong className="text-white">DCA:</strong> {rec.reason}</span>
              </div>
              {rec.stock.interestRatio > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-yellow-400 shrink-0">☽</span>
                  <span className="text-zinc-300">
                    <strong className="text-yellow-300">Purification:</strong> Donate {rec.stock.interestRatio}% of your profit from this stock to charity
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* How to buy */}
          <div className="bg-green-950/40 rounded-xl p-4 border border-green-800/30">
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">How to buy on T212</p>
            <ol className="space-y-1 text-sm text-zinc-300 list-decimal list-inside">
              <li>Open Trading 212 app</li>
              <li>Search <strong className="text-green-300">&ldquo;{rec.stock.ticker}&rdquo;</strong></li>
              <li>Tap <strong className="text-white">Buy</strong> → choose <strong className="text-white">By value</strong></li>
              <li>Enter <strong className="text-green-400">£{budget}</strong> and confirm</li>
            </ol>
          </div>

          <a href="https://www.trading212.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-colors">
            <ShoppingCart size={16} />
            Open Trading 212 to Buy
          </a>
        </div>
      </div>

      {/* 8-week rotation plan */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2">
          <Calendar size={15} className="text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-300">8-week rotation plan</p>
          <span className="text-xs text-zinc-600 ml-auto">£{budget}/week · every {dcaDayName}</span>
        </div>

        <div className="divide-y divide-zinc-800/40">
          {rotationPlan.map(({ stock, held, weeksFromNow, isThisWeek }) => (
            <div key={stock.ticker} className={`flex items-center gap-3 px-4 py-3 ${isThisWeek ? 'bg-green-900/20' : ''}`}>
              <div className="w-12 shrink-0 text-center">
                {isThisWeek
                  ? <span className="text-xs font-bold text-green-400 bg-green-900/40 px-2 py-0.5 rounded-full">NOW</span>
                  : <span className="text-xs text-zinc-500">+{weeksFromNow}wk</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isThisWeek ? 'text-green-300' : 'text-zinc-200'}`}>{stock.ticker}</span>
                  <span className="text-xs text-zinc-500 truncate hidden sm:block">{stock.name}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{stock.why}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-bold ${isThisWeek ? 'text-green-400' : 'text-zinc-300'}`}>£{budget}</p>
                {held
                  ? <p className={`text-xs ${held.ppl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{held.ppl >= 0 ? '+' : ''}£{fmt(held.ppl, 0)}</p>
                  : <p className="text-xs text-zinc-600">not held</p>}
              </div>
              <span className="text-xs text-zinc-500 w-6 text-right shrink-0">{stock.score}</span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-zinc-800/50 flex items-center justify-between">
          <p className="text-xs text-zinc-600">Repeats every 8 weeks — equal weight across all positions</p>
          <Link href="/halal/stocks" className="text-xs text-green-400 hover:text-green-300 transition-colors">Stock details →</Link>
        </div>
      </div>

      {/* Positions quick view */}
      {positions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-300">Your positions</p>
            <Link href="/halal/portfolio" className="text-xs text-green-400 hover:text-green-300">See all →</Link>
          </div>
          <div className="space-y-2">
            {[...positions].sort((a, b) => b.ppl - a.ppl).slice(0, 5).map(p => (
              <div key={p.ticker} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                  {p.ticker.replace(/\..+/, '').slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{p.ticker}</p>
                  <p className="text-xs text-zinc-500">{p.quantity.toFixed(4)} shares @ £{fmt(p.averagePrice)}</p>
                </div>
                <div className="text-right">
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
