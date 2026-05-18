'use client'

import { useEffect, useState } from 'react'
import { loadSettings, getPositions, T212Position } from '@/lib/halal/t212'
import { HALAL_STOCKS } from '@/lib/halal/stocks'
import { TrendingUp, TrendingDown, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<T212Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const halalTickers = new Set(HALAL_STOCKS.map(s => s.ticker))

  async function load() {
    const settings = loadSettings()
    if (!settings.apiKey) {
      setError('No API key — go to Settings first')
      setLoading(false)
      return
    }
    try {
      const pos = await getPositions(settings)
      setPositions(pos)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleRefresh() {
    setRefreshing(true)
    load()
  }

  const totalValue = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0)
  const totalPnl = positions.reduce((s, p) => s + p.ppl, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">My Portfolio</h1>
          <p className="text-sm text-zinc-500">Live from Trading 212</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total value</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">£{fmt(totalValue)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total return</p>
          <p className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}£{fmt(Math.abs(totalPnl))}
          </p>
        </div>
      </div>

      {/* Positions */}
      {positions.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg font-medium">No open positions</p>
          <p className="text-sm mt-1">Your T212 portfolio is empty — go buy your first Halal stock!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {positions
            .sort((a, b) => b.currentPrice * b.quantity - a.currentPrice * a.quantity)
            .map(p => {
              const value = p.currentPrice * p.quantity
              const invested = p.averagePrice * p.quantity
              const pnlPct = invested > 0 ? (p.ppl / invested) * 100 : 0
              const isHalal = halalTickers.has(p.ticker)
              const stockInfo = HALAL_STOCKS.find(s => s.ticker === p.ticker)

              return (
                <div
                  key={p.ticker}
                  className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
                      {p.ticker.replace(/\..+/, '').slice(0, 3)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-zinc-100">{p.ticker}</p>
                        {stockInfo && (
                          <p className="text-xs text-zinc-400 truncate hidden sm:block">{stockInfo.name}</p>
                        )}
                        {isHalal ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-2 py-0.5 rounded-full">
                            <ShieldCheck size={10} /> Halal
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-900/20 border border-orange-800/40 px-2 py-0.5 rounded-full">
                            <ShieldAlert size={10} /> Review
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                        <span>{fmt(p.quantity, 4)} shares</span>
                        <span>Avg £{fmt(p.averagePrice)}</span>
                        <span>Now £{fmt(p.currentPrice)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-semibold text-zinc-100">£{fmt(value)}</p>
                      <p className={`text-sm flex items-center gap-0.5 justify-end mt-0.5 ${p.ppl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {p.ppl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {p.ppl >= 0 ? '+' : ''}£{fmt(Math.abs(p.ppl))}
                      </p>
                      <p className={`text-xs ${pnlPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}%
                      </p>
                    </div>
                  </div>

                  {stockInfo && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <p className="text-zinc-500">Score</p>
                        <p className="text-zinc-200 font-medium mt-0.5">{stockInfo.score}/100</p>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <p className="text-zinc-500">Debt ratio</p>
                        <p className={`font-medium mt-0.5 ${stockInfo.debtRatio <= 33 ? 'text-green-400' : 'text-red-400'}`}>
                          {stockInfo.debtRatio}%
                        </p>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <p className="text-zinc-500">Interest</p>
                        <p className={`font-medium mt-0.5 ${stockInfo.interestRatio <= 5 ? 'text-green-400' : 'text-red-400'}`}>
                          {stockInfo.interestRatio}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
