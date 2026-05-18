import { STOCKS, DCA_ROTATION, Stock } from './stocks'
import { Position } from './t212'

export interface Recommendation {
  stock: Stock
  weeklyBudget: number
  dcaDayName: string
  daysUntil: number    // 0 = buy today
  reason: string
  weekNum: number
  rotationIndex: number
}

export function getIsoWeekNumber(): number {
  const d = new Date()
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diff = d.getTime() - startOfWeek1.getTime()
  return Math.floor(diff / (7 * 24 * 3600 * 1000)) + 1
}

export function getDcaDayName(dcaDay: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][dcaDay] ?? 'Monday'
}

export function getDaysUntilDca(dcaDay: number): number {
  const today = new Date().getDay() // 0=Sun 1=Mon ... 6=Sat
  const target = dcaDay + 1         // 0=Mon → 1 in JS
  let diff = target - today
  if (diff < 0) diff += 7
  return diff
}

export function getRecommendation(
  positions: Position[],
  weeklyBudget: number,
  dcaDay: number,
): Recommendation {
  const weekNum = getIsoWeekNumber()
  const idx = ((weekNum - 1) % DCA_ROTATION.length + DCA_ROTATION.length) % DCA_ROTATION.length
  const ticker = DCA_ROTATION[idx]
  const stock = STOCKS.find(s => s.ticker === ticker) ?? STOCKS[0]

  const held = positions.find(p => p.ticker === ticker)
  const reason = held
    ? `Adding to your ${stock.name} position — DCA rotation week ${weekNum}, ${ticker} is position ${idx + 1} of ${DCA_ROTATION.length} in the cycle`
    : `Starting your ${stock.name} position — DCA rotation week ${weekNum}, score ${stock.score}/100`

  return {
    stock,
    weeklyBudget,
    dcaDayName: getDcaDayName(dcaDay),
    daysUntil: getDaysUntilDca(dcaDay),
    reason,
    weekNum,
    rotationIndex: idx,
  }
}

export function getRotationPlan(weeklyBudget: number, positions: Position[]) {
  const posMap = new Map(positions.map(p => [p.ticker, p]))
  const weekNum = getIsoWeekNumber()
  const currentIdx = ((weekNum - 1) % DCA_ROTATION.length + DCA_ROTATION.length) % DCA_ROTATION.length

  return DCA_ROTATION.map((ticker, i) => {
    const stock = STOCKS.find(s => s.ticker === ticker)!
    const held = posMap.get(ticker)
    const weeksFromNow = (i - currentIdx + DCA_ROTATION.length) % DCA_ROTATION.length
    return { stock, held, weeksFromNow, isThisWeek: weeksFromNow === 0, budget: weeklyBudget }
  }).sort((a, b) => a.weeksFromNow - b.weeksFromNow)
}

export function portfolioSummary(positions: Position[]) {
  const halalTickers = new Set(STOCKS.map(s => s.ticker))
  let totalValue = 0, totalInvested = 0, totalPnl = 0

  for (const p of positions) {
    totalValue += p.currentPrice * p.quantity
    totalInvested += p.averagePrice * p.quantity
    totalPnl += p.ppl
  }

  const halalCount = positions.filter(p => halalTickers.has(p.ticker)).length
  return {
    totalValue,
    totalInvested,
    totalPnl,
    pnlPct: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
    positions: positions.length,
    halalCount,
    reviewCount: positions.length - halalCount,
  }
}

export function projectedValue(weeklyAmount: number, years: number, annualReturn = 15): number {
  const weeks = years * 52
  const r = Math.pow(1 + annualReturn / 100, 1 / 52) - 1
  return weeklyAmount * ((Math.pow(1 + r, weeks) - 1) / r)
}
