'use client'

import { useEffect, useState } from 'react'
import { loadSettings, getPositions, getAccountSummary, Position, AccountSummary } from '@/lib/t212'
import { STOCKS } from '@/lib/stocks'
import { TrendingUp, TrendingDown, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || !isFinite(n)) return (0).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
  return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const CACHE_KEY = 'hp_dash_v1'

export default function Portfolio() {
  const [mounted, setMounted] = useState(false)
  const [positions, setPositions] = useState<Position[]>([])
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const halalTickers = new Set(STOCKS.filter(s => s.musaffaStatus === 'HALAL').map(s => s.ticker))

  async function load(force = false) {
    const s = loadSettings()
    if (!s.apiKey) { setError('No API key — go to Settings'); setLoading(false); return }

    if (!force) {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const c = JSON.parse(raw)
          if (Date.now() - c.ts < 60_000) {
            setPositions(c.positions)
            setAccount(c.account ?? null)
            setLoading(false)
            return
          }
        }
      } catch { /* ignore */ }
    }

    try {
      const pos = await getPositions(s)
      await new Promise(r => setTimeout(r, 1500))
      const acc = await getAccountSummary(s)
      setPositions(pos)
      setAccount(acc)
      setError('')
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ positions: pos, account: acc, ts: Date.now() })) } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('429') ? 'T212 rate limit — wait 30 s then refresh' : msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { setMounted(true); load() }, []) // eslint-disable-line

  if (!mounted) return null

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <p className="text-red-400">{error}</p>
    </div>
  )

  // Use account summary for GBP-accurate totals
  const totalInvested = account?.cash?.invested ?? 0
  const totalPnl      = account?.cash?.ppl ?? positions.reduce((s, p) => s + p.ppl, 0)
  const totalValue    = totalInvested + totalPnl
  const pnlPct        = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Portfolio</h1>
          <p className="text-sm text-zinc-500">Live from Trading 212</p>
        </div>
        <button onClick={() => { setRefreshing(true); load(true) }} disabled={refreshing}
          className="p-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Total value</p>
          <p className="text-lg font-bold text-zinc-100 mt-0.5">£{fmt(totalValue)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Invested</p>
          <p className="text-lg font-bold text-zinc-100 mt-0.5">£{fmt(totalInvested)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Return</p>
          <p className={`text-lg font-bold mt-0.5 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}£{fmt(Math.abs(totalPnl))}
          </p>
          <p className={`text-xs ${pnlPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}%
          </p>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg font-medium">No open positions</p>
          <p className="text-sm mt-1">Your T212 portfolio is empty — go buy your first halal stock!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...positions].sort((a, b) => b.ppl - a.ppl).map(p => {
            // ppl is in GBP (account currency) — safe to display
            // P&L % derived from native-currency prices — ratio is still meaningful
            const pct     = p.averagePrice > 0 ? ((p.currentPrice - p.averagePrice) / p.averagePrice) * 100 : 0
            const isHalal = halalTickers.has(p.ticker)
            const info    = STOCKS.find(s => s.ticker === p.ticker)

            return (
              <div key={p.ticker} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-zinc-800 rounded-xl flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
                    {p.ticker.split('.')[0].slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-zinc-100">{p.ticker}</p>
                      {info && <p className="text-xs text-zinc-500 truncate hidden sm:block">{info.name}</p>}
                      {isHalal ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                          <ShieldCheck size={9} /> Halal
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-900/20 border border-orange-800/30 px-1.5 py-0.5 rounded-full">
                          <ShieldAlert size={9} /> Review
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {fmt(p.quantity, 4)} shares
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${p.ppl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.ppl >= 0 ? '+' : ''}£{fmt(Math.abs(p.ppl))}
                    </p>
                    <p className={`text-xs flex items-center gap-0.5 justify-end mt-0.5 ${p.ppl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {p.ppl >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {pct >= 0 ? '+' : ''}{fmt(pct)}%
                    </p>
                  </div>
                </div>

                {info && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                      <p className="text-zinc-500">Musaffa</p>
                      <p className={`font-bold mt-0.5 ${info.musaffaGrade.startsWith('A') ? 'text-green-400' : 'text-blue-400'}`}>
                        {info.musaffaGrade}
                      </p>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                      <p className="text-zinc-500">Interest inc.</p>
                      <p className={`font-bold mt-0.5 ${info.interestIncomeRatio <= 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {info.interestIncomeRatio}%
                      </p>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                      <p className="text-zinc-500">Score</p>
                      <p className="text-zinc-200 font-bold mt-0.5">{info.score}/100</p>
                    </div>
                  </div>
                )}

                {info && info.interestIncomeRatio > 0 && (
                  <p className="mt-2 text-[10px] text-yellow-600 bg-yellow-900/10 border border-yellow-900/20 rounded-lg px-2.5 py-1.5">
                    ☽ Purification: {info.purificationNote}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
