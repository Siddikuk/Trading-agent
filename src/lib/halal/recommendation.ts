import { HALAL_STOCKS, DCA_ROTATION, HalalStock } from './stocks'
import { T212Position } from './t212'

export interface Recommendation {
  stock: HalalStock
  amount: number
  shares: number
  reason: string
  urgency: 'buy-now' | 'buy-this-week' | 'wait'
  dcaWeek: number
}

export interface PortfolioSummary {
  totalValue: number
  totalInvested: number
  totalPnl: number
  totalPnlPct: number
  positions: number
  halalPositions: number
  nonHalalPositions: number
}

export function getWeekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

export function getRecommendation(
  positions: T212Position[],
  weeklyBudget: number,
  dcaDay: number
): Recommendation {
  const heldTickers = new Set(positions.map(p => p.ticker))
  const positionMap = new Map(positions.map(p => [p.ticker, p]))

  const weekNum = getWeekNumber()
  const rotationIndex = weekNum % DCA_ROTATION.length
  const rotationTicker = DCA_ROTATION[rotationIndex]

  // Find the rotation stock, falling back to first unheld stock if not found
  let target = HALAL_STOCKS.find(s => s.ticker === rotationTicker)
  if (!target) {
    target = HALAL_STOCKS.find(s => !heldTickers.has(s.ticker)) ?? HALAL_STOCKS[0]
  }

  // Calculate how many shares we can buy
  // For stocks we don't have price data on, estimate at £0 = fractional
  const pos = positionMap.get(target.ticker)
  const currentPrice = pos?.currentPrice ?? 0
  const shares = currentPrice > 0 ? weeklyBudget / currentPrice : 0

  // Determine urgency based on day of week
  const today = new Date().getDay() // 0=Sun, 1=Mon...
  const targetDay = dcaDay + 1 // 0=Mon → 1 in JS
  const urgency =
    today === targetDay
      ? 'buy-now'
      : today < targetDay || (today === 0 && targetDay > 0)
      ? 'buy-this-week'
      : 'wait'

  const alreadyHeld = heldTickers.has(target.ticker)
  const reason = alreadyHeld
    ? `Adding to your ${target.name} position — week ${weekNum} in DCA rotation`
    : `Start your ${target.name} position — week ${weekNum} in DCA rotation, score ${target.score}/100`

  return { stock: target, amount: weeklyBudget, shares, reason, urgency, dcaWeek: weekNum }
}

export function summarisePortfolio(positions: T212Position[]): PortfolioSummary {
  const halalTickers = new Set(HALAL_STOCKS.map(s => s.ticker))
  let totalValue = 0
  let totalInvested = 0
  let totalPnl = 0
  let halalPositions = 0
  let nonHalalPositions = 0

  for (const p of positions) {
    const value = p.currentPrice * p.quantity
    const invested = p.averagePrice * p.quantity
    totalValue += value
    totalInvested += invested
    totalPnl += p.ppl
    if (halalTickers.has(p.ticker)) halalPositions++
    else nonHalalPositions++
  }

  return {
    totalValue,
    totalInvested,
    totalPnl,
    totalPnlPct: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
    positions: positions.length,
    halalPositions,
    nonHalalPositions,
  }
}

export function getWeeksUntilDcaDay(dcaDay: number): number {
  const today = new Date().getDay()
  const target = dcaDay + 1
  const diff = target - today
  return diff <= 0 ? diff + 7 : diff
}

export function formatDcaDay(dcaDay: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][dcaDay]
}

export function projectValue(weeklyAmount: number, years: number, annualReturn: number): number {
  const weeks = years * 52
  const weeklyRate = Math.pow(1 + annualReturn / 100, 1 / 52) - 1
  return weeklyAmount * ((Math.pow(1 + weeklyRate, weeks) - 1) / weeklyRate)
}
