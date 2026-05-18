'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadSettings, getPositions, getAccountSummary, T212Position, T212AccountSummary } from '@/lib/halal/t212'
import { getRecommendation, summarisePortfolio, projectValue, formatDcaDay, Recommendation } from '@/lib/halal/recommendation'
import { HALAL_STOCKS, SECTOR_COLORS } from '@/lib/halal/stocks'
import { TrendingUp, TrendingDown, ShoppingCart, AlertCircle, Settings, Zap, Calendar, Target, RefreshCw } from 'lucide-react'
import Link from 'next/link'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function UrgencyBadge({ urgency }: { urgency: Recommendation['urgency'] }) {
  if (urgency === 'buy-now')
    return <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">BUY TODAY</span>
  if (urgency === 'buy-this-week')
    return <span className="bg-yellow-500/80 text-black text-xs font-bold px-2 py-0.5 rounded-full">THIS WEEK</span>
  return <span className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded-full">NEXT WEEK</span>
}

const CACHE_KEY = 'halal_dashboard_cache'
const CACHE_TTL_MS = 60_000 // 1 minute

function loadCache(): { positions: T212Position[]; account: T212AccountSummary; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (Date.now() - c.ts > CACHE_TTL_MS) return null
    return c
  } catch {
    return null
  }
}

function saveCache(positions: T212Position[], account: T212AccountSummary) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ positions, account, ts: Date.now() }))
}

export default function DashboardPage() {
  const [positions, setPositions] = useState<T212Position[]>([])
  const [account, setAccount] = useState<T212AccountSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheAge, setCacheAge] = useState<number | null>(null)
  const settings = typeof window !== 'undefined' ? loadSettings() : null

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!settings?.apiKey) { setLoading(false); return }

    // Use cache if fresh enough and not forced
    if (!forceRefresh) {
      const cached = loadCache()
      if (cached) {
        setPositions(cached.positions)
        setAccount(cached.account)
        setCacheAge(Math.round((Date.now() - cached.ts) / 1000))
        setLoading(false)
        return
      }
    }

    setError(null)
    try {
      // Sequential calls with 1.5s gap to respect T212 rate limits
      const pos = await getPositions(settings)
      await new Promise(r => setTimeout(r, 1500))
      const acc = await getAccountSummary(settings)
      setPositions(pos)
      setAccount(acc)
      setCacheAge(0)
      saveCache(pos, acc)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('429')) {
        setError('T212 rate limit hit — please wait 30 seconds then click Refresh')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [settings?.apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRefresh() {
    setRefreshing(true)
    loadData(true)
  }

  if (!settings?.apiKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
          <Settings size={28} className="text-green-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-200">Connect your Trading 212 account</p>
          <p className="text-sm text-zinc-400 mt-1">Enter your API key to see your live portfolio and recommendations</p>
        </div>
        <Link href="/halal/settings" className="bg-green-700 hover:bg-green-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Go to Settings →
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Loading your portfolio…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <AlertCircle className="text-red-400" size={32} />
        <p className="text-zinc-300 font-medium">Connection failed</p>
        <p className="text-sm text-zinc-500 max-w-sm">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Retrying…' : 'Retry'}
          </button>
          <Link href="/halal/settings" className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Settings
          </Link>
        </div>
      </div>
    )
  }

  const summary = summarisePortfolio(positions)
  const rec = getRecommendation(positions, settings.weeklyBudget, settings.dcaDay)
  const recStock = HALAL_STOCKS.find(s => s.ticker === rec.stock.ticker) ?? rec.stock
  const sectorCls = SECTOR_COLORS[recStock.sector] ?? 'bg-zinc-700/30 text-zinc-300'

  const proj5_15 = projectValue(settings.weeklyBudget, 5, 15)
  const proj10_15 = projectValue(settings.weeklyBudget, 10, 15)
  const proj5_22 = projectValue(settings.weeklyBudget, 5, 22)
  const proj10_22 = projectValue(settings.weeklyBudget, 10, 22)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {cacheAge !== null && (
              <span className="ml-2 text-zinc-600 text-xs">· data {cacheAge === 0 ? 'just refreshed' : `${cacheAge}s old`}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh from T212 (max once per minute)"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link href="/halal/settings" className="text-zinc-500 hover:text-zinc-300 transition-colors p-2">
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Portfolio summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Portfolio value</p>
          <p className="text-xl font-bold text-zinc-100">£{fmt(summary.totalValue)}</p>
          {account && (
            <p className="text-xs text-zinc-500 mt-0.5">Cash: £{fmt(account.cash.free)}</p>
          )}
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Total invested</p>
          <p className="text-xl font-bold text-zinc-100">£{fmt(summary.totalInvested)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{summary.positions} positions</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Total return</p>
          <p className={`text-xl font-bold ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.totalPnl >= 0 ? '+' : ''}£{fmt(Math.abs(summary.totalPnl))}
          </p>
          <p className={`text-xs mt-0.5 ${summary.totalPnlPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {summary.totalPnlPct >= 0 ? '+' : ''}{fmt(summary.totalPnlPct)}%
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Halal stocks</p>
          <p className="text-xl font-bold text-green-400">{summary.halalPositions}</p>
          {summary.nonHalalPositions > 0 && (
            <p className="text-xs text-orange-400 mt-0.5">⚠ {summary.nonHalalPositions} to review</p>
          )}
        </div>
      </div>

      {/* THIS WEEK'S RECOMMENDATION */}
      <div className="bg-gradient-to-br from-green-950/60 to-zinc-900/60 border border-green-800/40 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-green-400" />
          <span className="text-sm font-semibold text-green-300">This week&apos;s recommendation</span>
          <UrgencyBadge urgency={rec.urgency} />
        </div>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-green-900/40 border border-green-700/30 rounded-xl flex items-center justify-center text-xl font-bold text-green-300 shrink-0">
            {rec.stock.ticker.slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-bold text-zinc-100">{rec.stock.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${sectorCls}`}>
                {rec.stock.sector}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mt-1">{rec.reason}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{rec.stock.why}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <p className="text-xs text-zinc-500">Invest</p>
            <p className="text-xl font-bold text-green-400">£{settings.weeklyBudget}</p>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <p className="text-xs text-zinc-500">Score</p>
            <p className="text-xl font-bold text-zinc-200">{rec.stock.score}<span className="text-xs text-zinc-500">/100</span></p>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <p className="text-xs text-zinc-500">Debt ratio</p>
            <p className="text-xl font-bold text-zinc-200">{rec.stock.debtRatio}<span className="text-xs text-zinc-500">%</span></p>
          </div>
        </div>

        <div className="mt-4 bg-black/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={14} className="text-zinc-400" />
            <span className="text-zinc-400">
              Your DCA day is <strong className="text-zinc-200">{formatDcaDay(settings.dcaDay)}</strong>.
              {rec.urgency === 'buy-now'
                ? ' That\'s today — time to buy!'
                : rec.urgency === 'buy-this-week'
                ? ` Buy before end of week on T212.`
                : ` Next buy day coming up.`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <Target size={14} className="text-zinc-400" />
            <span className="text-zinc-400">
              Search <strong className="text-green-300">&ldquo;{rec.stock.ticker}&rdquo;</strong> on T212 — {rec.stock.t212Search}
            </span>
          </div>
        </div>
      </div>

      {/* Current positions quick view */}
      {positions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-300">Open positions</p>
            <Link href="/halal/portfolio" className="text-xs text-green-400 hover:text-green-300 transition-colors">
              See all →
            </Link>
          </div>
          <div className="space-y-2">
            {positions.slice(0, 5).map(p => (
              <div key={p.ticker} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                  {p.ticker.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{p.ticker}</p>
                  <p className="text-xs text-zinc-500">{p.quantity.toFixed(4)} shares</p>
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

      {/* Growth projector */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-green-400" />
          <p className="text-sm font-semibold text-zinc-300">
            If you invest £{settings.weeklyBudget}/week
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
              Conservative (15%/yr)
            </p>
            <p className="text-sm text-zinc-400">5 years: <span className="text-green-400 font-semibold">£{Math.round(proj5_15).toLocaleString()}</span></p>
            <p className="text-sm text-zinc-400 mt-1">10 years: <span className="text-green-300 font-bold text-base">£{Math.round(proj10_15).toLocaleString()}</span></p>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block" />
              Optimistic (22%/yr)
            </p>
            <p className="text-sm text-zinc-400">5 years: <span className="text-emerald-400 font-semibold">£{Math.round(proj5_22).toLocaleString()}</span></p>
            <p className="text-sm text-zinc-400 mt-1">10 years: <span className="text-emerald-300 font-bold text-base">£{Math.round(proj10_22).toLocaleString()}</span></p>
          </div>
        </div>
        <p className="text-xs text-zinc-600 mt-2">Past performance doesn&apos;t guarantee future returns. For information only.</p>
      </div>

      {/* Quick buy button */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-center gap-3">
        <ShoppingCart size={20} className="text-green-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-200">Ready to buy?</p>
          <p className="text-xs text-zinc-500">Open T212, search <strong className="text-green-400">{rec.stock.ticker}</strong>, invest £{settings.weeklyBudget}</p>
        </div>
        <a
          href="https://www.trading212.com"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          Open T212
        </a>
      </div>
    </div>
  )
}
