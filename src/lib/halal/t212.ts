export interface T212Settings {
  apiKey: string
  accountType: 'live' | 'demo'
  weeklyBudget: number
  dcaDay: number // 0=Mon, 4=Fri
}

export interface T212Position {
  ticker: string
  quantity: number
  averagePrice: number
  currentPrice: number
  ppl: number // profit/loss in account currency
  fxPpl: number
  initialFillDate: string
  maxBuy: number
  maxSell: number
}

export interface T212Order {
  id: string
  ticker: string
  type: string
  quantity: number
  filledQuantity: number
  limitPrice: number | null
  stopPrice: number | null
  filledPrice: number | null
  filledValue: number | null
  status: string
  dateCreated: string
  dateExecuted: string | null
}

export interface T212AccountSummary {
  cash: {
    free: number
    total: number
    ppl: number
    result: number
    invested: number
    pieCash: number
  }
}

const DEFAULT_SETTINGS: T212Settings = {
  apiKey: '',
  accountType: 'live',
  weeklyBudget: 50,
  dcaDay: 0,
}

export function loadSettings(): T212Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem('halal_settings')
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: T212Settings) {
  localStorage.setItem('halal_settings', JSON.stringify(s))
}

async function t212Fetch<T>(path: string, settings: T212Settings): Promise<T> {
  const res = await fetch(`/api/t212/${path}`, {
    headers: {
      'x-t212-key': settings.apiKey,
      'x-t212-account': settings.accountType,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`T212 API error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function getPositions(settings: T212Settings): Promise<T212Position[]> {
  const data = await t212Fetch<{ items?: T212Position[] } | T212Position[]>('equity/portfolio', settings)
  // T212 returns { items: [...] } or directly an array depending on version
  if (Array.isArray(data)) return data
  return (data as { items?: T212Position[] }).items ?? []
}

export async function getAccountSummary(settings: T212Settings): Promise<T212AccountSummary> {
  return t212Fetch<T212AccountSummary>('equity/account/summary', settings)
}

export async function getOrderHistory(settings: T212Settings, limit = 50): Promise<T212Order[]> {
  const data = await t212Fetch<{ items?: T212Order[] }>(`equity/history/orders?limit=${limit}`, settings)
  return data.items ?? []
}
