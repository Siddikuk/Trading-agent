'use client'

import { useState } from 'react'
import { STOCKS, DCA_ROTATION } from '@/lib/stocks'
import { ShieldCheck, RotateCcw, ExternalLink } from 'lucide-react'

export default function StocksPage() {
  const [filter, setFilter] = useState<'all' | 'rotation'>('all')

  const list = filter === 'rotation'
    ? STOCKS.filter(s => DCA_ROTATION.includes(s.ticker))
    : STOCKS

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Halal Stocks</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          All verified on{' '}
          <a href="https://musaffa.com" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-400 inline-flex items-center gap-0.5">
            Musaffa <ExternalLink size={10} />
          </a>
          {' '}under AAOIFI methodology. Grades change quarterly — always re-check before investing.
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'rotation'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              filter === f
                ? 'bg-green-900/50 border-green-600/50 text-green-300 font-medium'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
            }`}>
            {f === 'all' ? `All stocks (${STOCKS.length})` : `DCA rotation (${DCA_ROTATION.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {list.sort((a, b) => b.score - a.score).map(stock => (
          <div key={stock.ticker} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-sm font-bold text-zinc-300 shrink-0">
                {stock.ticker.split('.')[0].slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-zinc-100">{stock.ticker}</p>
                  <p className="text-xs text-zinc-400 truncate">{stock.name}</p>
                  <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 border border-green-800/30 px-1.5 py-0.5 rounded-full shrink-0">
                    <ShieldCheck size={9} /> AAOIFI
                  </span>
                  {DCA_ROTATION.includes(stock.ticker) && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-900/20 border border-blue-800/30 px-1.5 py-0.5 rounded-full shrink-0">
                      <RotateCcw size={9} /> DCA
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{stock.exchange} · {stock.country} · {stock.sector}</p>
                <p className="text-xs text-zinc-400 mt-1 italic">{stock.description}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${
                  stock.musaffaGrade.startsWith('A') ? 'text-green-300 bg-green-900/30'
                  : 'text-blue-300 bg-blue-900/30'
                }`}>{stock.musaffaGrade}</span>
                <p className="text-xs text-zinc-600 mt-1">{stock.score}/100</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <p className="text-zinc-500">Interest income ratio</p>
                <p className={`font-semibold mt-0.5 ${stock.interestIncomeRatio <= 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {stock.interestIncomeRatio}% of revenue
                </p>
                <p className="text-zinc-600 text-[10px] mt-0.5">AAOIFI limit: 5%</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <p className="text-zinc-500">Debt assessment</p>
                <p className="text-green-400 font-semibold mt-0.5">Passes</p>
                <p className="text-zinc-600 text-[10px] mt-0.5">{stock.debtRatioNote.slice(0, 40)}</p>
              </div>
            </div>

            {stock.interestIncomeRatio > 0 && (
              <div className="mt-2 text-[10px] text-yellow-600 bg-yellow-900/10 border border-yellow-900/20 rounded-lg px-2.5 py-1.5">
                ☽ {stock.purificationNote}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl p-4 text-xs text-zinc-500 space-y-1">
        <p className="font-medium text-zinc-400">About the screening</p>
        <p>All stocks are verified halal on <strong className="text-zinc-300">Musaffa</strong> (musaffa.com) using the AAOIFI standard: debt/assets ≤ 33%, interest income/revenue ≤ 5%, and no forbidden business sectors (alcohol, tobacco, weapons, conventional banking, pork, gambling).</p>
        <p>Halal status changes quarterly as new financial reports come in. Always verify before investing, especially for B-grade stocks.</p>
        <p className="text-yellow-600">Stocks removed from this list due to screening failures: SMMT/SITM (interest income &gt;7%), MSFT (gaming content), GOOGL (interest income borderline), META (doubtful), LSCC (doubtful), GAW.L (violent IP), NEDAP (doubtful).</p>
      </div>
    </div>
  )
}
