export type AccountName = 'bingx' | 'tradovate'

export interface Account {
  id: string
  name: AccountName
  initial_capital: number
  risk_percent: number
}

export interface Strategy {
  id: string
  account_id: string
  name: string
  sort_order: number
}

export interface Trade {
  id: string
  account_id: string
  external_id?: string
  symbol: string
  direction: 'long' | 'short'
  entry_price?: number
  exit_price?: number
  entry_time?: string
  exit_time?: string
  quantity?: number
  pnl?: number
  risk_used?: number
  rr_ratio?: number
  strategy_id?: string
  notes?: string
  chart_image_url?: string
  created_at: string
  strategies?: Strategy
}

export type Database = {
  public: {
    Tables: {
      accounts: { Row: Account; Insert: Omit<Account, 'id'>; Update: Partial<Account> }
      strategies: { Row: Strategy; Insert: Omit<Strategy, 'id'>; Update: Partial<Strategy> }
      trades: { Row: Trade; Insert: Omit<Trade, 'id' | 'created_at'>; Update: Partial<Trade> }
    }
  }
}

export function durationLabel(entry?: string, exit?: string): string {
  if (!entry || !exit) return '—'
  const ms = new Date(exit).getTime() - new Date(entry).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function fmtPrice(n?: number): string {
  if (n == null) return '—'
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : n.toFixed(4).replace(/\.?0+$/, '')
}

export function fmtPnl(n?: number): string {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + '$' + Math.abs(n).toFixed(1)
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
