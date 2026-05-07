'use client'

import type { StrategyMetric } from '@/lib/strategy-stats'
import { fmtPF } from '@/lib/strategy-stats'
import { fmtPnl } from '@/lib/types'

interface Props {
  metric: StrategyMetric
}

export default function StrategyCard({ metric }: Props) {
  const m = metric
  const pnlColor = m.totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)'

  return (
    <div className="retro-card p-3.5">
      {/* Header: name + color swatch */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 shrink-0" style={{ background: m.color, border: '1px solid var(--border)' }} />
        <span className="retro-display fs-stat truncate">{m.name}</span>
      </div>

      {/* Top row: total PnL (big) + win rate + PF */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="fs-tiny font-bold" style={{ color: 'var(--muted)' }}>總盈虧</div>
          <div className="retro-display retro-mono fs-stat-big leading-tight" style={{ color: pnlColor }}>
            {fmtPnl(m.totalPnl)}
          </div>
        </div>
        <div className="text-right">
          <div className="fs-tiny font-bold" style={{ color: 'var(--muted)' }}>勝率 / PF</div>
          <div className="retro-mono fs-stat font-bold leading-tight">
            <span style={{ color: 'var(--accent2)' }}>{Math.round(m.winRate)}%</span>
            <span style={{ color: 'var(--muted)' }}> · </span>
            <span>{fmtPF(m.pf)}</span>
          </div>
        </div>
      </div>

      <div className="mb-3" style={{ borderTop: '1px solid var(--border)' }} />

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-y-1 gap-x-3 fs-meta retro-mono">
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>次數</span>
          <span>{m.count}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>RR</span>
          <span>{m.avgRR > 0 ? m.avgRR.toFixed(2) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>均盈</span>
          <span style={{ color: 'var(--profit)' }}>{m.avgWin > 0 ? '+$' + m.avgWin.toFixed(1) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>均虧</span>
          <span style={{ color: 'var(--loss)' }}>{m.avgLoss < 0 ? '-$' + Math.abs(m.avgLoss).toFixed(1) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>連勝</span>
          <span style={{ color: 'var(--profit)' }}>{m.maxWinStreak || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold" style={{ color: 'var(--muted)' }}>連虧</span>
          <span style={{ color: 'var(--loss)' }}>{m.maxLossStreak || '—'}</span>
        </div>
      </div>
    </div>
  )
}
