export interface Settings {
  apiKey: string
  privateKey: string
  accountType: 'live' | 'demo'
  weeklyBudget: number
  dcaDay: number // 0=Mon 4=Fri
}

export interface Position {
  ticker: string
  quantity: number
  averagePrice: number
  currentPrice: number
  ppl: number
  fxPpl: number
  initialFillDate: string
  maxBuy: number
  maxSell: number
}

export interface AccountSummary {
  cash: { free: number; total: number; ppl: number; result: number; invested: number }
}

export interface Order {
  id: string
  ticker: string
  type: string
  quantity: number
  filledQuantity: number
  filledPrice: number | null
  filledValue: number | null
  status: string
  dateCreated: string
  dateExecuted: string | null
}

const DEFAULTS: Settings = {
  apiKey: '', privateKey: '', accountType: 'live', weeklyBudget: 50, dcaDay: 0,
}

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem('hp_settings')
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { return DEFAULTS }
}

export function saveSettings(s: Settings) {
  localStorage.setItem('hp_settings', JSON.stringify(s))
}

async function apiFetch<T>(path: string, s: Settings): Promise<T> {
  const res = await fetch(`/api/t212/${path}`, {
    headers: {
      'x-t212-key': s.apiKey.trim(),
      'x-t212-private-key': s.privateKey.trim(),
      'x-t212-account': s.accountType,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`T212 ${res.status}: ${err}`)
  }
  return res.json()
}

export async function getPositions(s: Settings): Promise<Position[]> {
  const data = await apiFetch<{ items?: Position[] } | Position[]>('equity/portfolio', s)
  if (Array.isArray(data)) return data
  return (data as { items?: Position[] }).items ?? []
}

export async function getAccountSummary(s: Settings): Promise<AccountSummary> {
  return apiFetch<AccountSummary>('equity/account/summary', s)
}

export async function getOrderHistory(s: Settings, limit = 50): Promise<Order[]> {
  const data = await apiFetch<{ items?: Order[] }>(`equity/history/orders?limit=${limit}`, s)
  return data.items ?? []
}
