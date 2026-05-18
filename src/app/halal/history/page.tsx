'use client'

import { useEffect, useState } from 'react'
import { loadSettings, getOrderHistory, T212Order } from '@/lib/halal/t212'
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase()
  if (s === 'FILLED')
    return <span className="text-xs bg-green-900/30 text-green-400 border border-green-800/40 px-2 py-0.5 rounded-full">Filled</span>
  if (s === 'CANCELLED' || s === 'REJECTED')
    return <span className="text-xs bg-red-900/30 text-red-400 border border-red-800/40 px-2 py-0.5 rounded-full">{status}</span>
  return <span className="text-xs bg-zinc-700/50 text-zinc-400 border border-zinc-600/40 px-2 py-0.5 rounded-full">{status}</span>
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<T212Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const settings = loadSettings()
    if (!settings.apiKey) {
      setError('No API key — go to Settings first')
      setLoading(false)
      return
    }
    try {
      const history = await getOrderHistory(settings, 100)
      setOrders(history)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalBought = orders
    .filter(o => (o.filledQuantity ?? 0) > 0 && (o.filledValue ?? 0) > 0)
    .reduce((s, o) => s + (o.filledValue ?? 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Order History</h1>
          <p className="text-sm text-zinc-500">Your last 100 orders from T212</p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load() }}
          disabled={refreshing}
          className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
        <p className="text-xs text-zinc-500">Total invested (filled orders)</p>
        <p className="text-2xl font-bold text-green-400 mt-1">£{fmt(totalBought)}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{orders.filter(o => (o.filledValue ?? 0) > 0).length} filled orders</p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p>No order history found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const isBuy = (o.filledQuantity ?? 0) > 0
            const value = o.filledValue ?? 0
            const price = o.filledPrice ?? 0
            const qty = o.filledQuantity ?? o.quantity

            return (
              <div key={o.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isBuy ? 'bg-green-900/40' : 'bg-red-900/40'}`}>
                    {isBuy ? <TrendingUp size={16} className="text-green-400" /> : <TrendingDown size={16} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-zinc-100">{o.ticker}</p>
                      <StatusBadge status={o.status} />
                      <span className={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {o.dateExecuted ? fmtDate(o.dateExecuted) : fmtDate(o.dateCreated)} · {fmt(qty, 4)} shares
                      {price > 0 && ` · £${fmt(price)}/share`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {value > 0 && (
                      <p className="font-semibold text-zinc-100">£{fmt(value)}</p>
                    )}
                    <p className="text-xs text-zinc-500 capitalize">{o.type.toLowerCase()}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
