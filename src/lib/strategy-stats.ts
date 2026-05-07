import type { Trade, Strategy } from './types'

export type Range = '7d' | '30d' | '90d' | 'ytd' | 'all'
export type SortKey = 'pnl' | 'winRate' | 'count' | 'pf'

export const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
  { key: '90d', label: '90 天' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: '全部' },
]

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'pnl', label: '盈虧' },
  { key: 'winRate', label: '勝率' },
  { key: 'count', label: '次數' },
  { key: 'pf', label: 'PF' },
]

export function rangeStartMs(range: Range): number {
  const now = Date.now()
  switch (range) {
    case '7d': return now - 7 * 86400000
    case '30d': return now - 30 * 86400000
    case '90d': return now - 90 * 86400000
    case 'ytd': return new Date(new Date().getFullYear(), 0, 1).getTime()
    case 'all': return 0
  }
}

// 8-color palette for strategy lines (cycles if more than 8)
export const STRATEGY_COLORS = [
  '#c89b3c', '#16a34a', '#3b82f6', '#a855f7',
  '#06b6d4', '#f59e0b', '#ec4899', '#84cc16',
]

export interface StrategyMetric {
  id: string
  name: string
  color: string
  count: number
  totalPnl: number
  winRate: number          // 0..100
  pf: number               // Infinity if no losses
  avgWin: number
  avgLoss: number          // negative number
  avgRR: number
  maxWinStreak: number
  maxLossStreak: number
  equityCurve: { time: number; equity: number }[]
  winRateCurve: { time: number; winRate: number }[]   // cumulative win rate after each trade, 0..100
}

function tradeTime(t: Trade): number {
  return new Date(t.exit_time ?? t.entry_time ?? t.created_at).getTime()
}

export function computeStrategyMetric(
  strategy: Strategy,
  trades: Trade[],
  colorIdx: number,
): StrategyMetric {
  const st = trades
    .filter(t => t.strategies?.name === strategy.name || t.strategy_id === strategy.id)
    .sort((a, b) => tradeTime(a) - tradeTime(b))

  const wins = st.filter(t => (t.pnl ?? 0) > 0)
  const losses = st.filter(t => (t.pnl ?? 0) < 0)
  const totalWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const totalLossAbs = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0)

  let maxW = 0, maxL = 0, curW = 0, curL = 0
  for (const t of st) {
    const p = t.pnl ?? 0
    if (p > 0) { curW++; curL = 0; if (curW > maxW) maxW = curW }
    else if (p < 0) { curL++; curW = 0; if (curL > maxL) maxL = curL }
  }

  let acc = 0
  let winsSoFar = 0
  let totalSoFar = 0
  const equityCurve: { time: number; equity: number }[] = [{ time: 0, equity: 0 }]
  const winRateCurve: { time: number; winRate: number }[] = [{ time: 0, winRate: 0 }]
  for (const t of st) {
    acc += t.pnl ?? 0
    equityCurve.push({ time: tradeTime(t), equity: acc })
    totalSoFar++
    if ((t.pnl ?? 0) > 0) winsSoFar++
    winRateCurve.push({ time: tradeTime(t), winRate: (winsSoFar / totalSoFar) * 100 })
  }

  const rrTrades = st.filter(t => t.rr_ratio != null)
  const avgRR = rrTrades.length
    ? rrTrades.reduce((s, t) => s + (t.rr_ratio ?? 0), 0) / rrTrades.length
    : 0

  return {
    id: strategy.id,
    name: strategy.name,
    color: STRATEGY_COLORS[colorIdx % STRATEGY_COLORS.length],
    count: st.length,
    totalPnl: st.reduce((s, t) => s + (t.pnl ?? 0), 0),
    winRate: st.length ? (wins.length / st.length) * 100 : 0,
    pf: totalLossAbs > 0 ? totalWin / totalLossAbs : (totalWin > 0 ? Infinity : 0),
    avgWin: wins.length ? totalWin / wins.length : 0,
    avgLoss: losses.length ? -totalLossAbs / losses.length : 0,
    avgRR,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
    equityCurve,
    winRateCurve,
  }
}

export function sortMetrics(metrics: StrategyMetric[], key: SortKey): StrategyMetric[] {
  const cmp: Record<SortKey, (a: StrategyMetric, b: StrategyMetric) => number> = {
    pnl: (a, b) => b.totalPnl - a.totalPnl,
    winRate: (a, b) => b.winRate - a.winRate,
    count: (a, b) => b.count - a.count,
    pf: (a, b) => {
      const av = a.pf === Infinity ? 9999 : a.pf
      const bv = b.pf === Infinity ? 9999 : b.pf
      return bv - av
    },
  }
  return [...metrics].sort(cmp[key])
}

export function fmtPF(pf: number): string {
  if (pf === Infinity) return '∞'
  if (pf === 0) return '—'
  return pf.toFixed(2)
}
