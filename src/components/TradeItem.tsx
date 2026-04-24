import Link from 'next/link'
import type { Trade } from '@/lib/types'
import { durationLabel, fmtPrice, fmtPnl, fmtTime, fmtDate } from '@/lib/types'

export default function TradeItem({ trade }: { trade: Trade }) {
  const pnl = trade.pnl ?? 0
  const isProfit = pnl >= 0

  return (
    <Link href={`/trade/${trade.id}`} className="block">
      <div
        className="rounded-[10px] p-3.5 mb-2 border transition-colors hover:border-[var(--accent)]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Top row */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px]" style={{ color: 'var(--text)' }}>
              {trade.symbol}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={
                trade.direction === 'long'
                  ? { background: 'rgba(22,163,74,.12)', color: 'var(--profit)' }
                  : { background: 'rgba(185,28,28,.12)', color: 'var(--loss)' }
              }
            >
              {trade.direction === 'long' ? '多' : '空'}
            </span>
          </div>
          <span
            className="font-semibold text-[15px]"
            style={{ color: isProfit ? 'var(--profit)' : 'var(--loss)' }}
          >
            {fmtPnl(pnl)}
          </span>
        </div>

        {/* Price / time grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            進 <b className="font-medium" style={{ color: '#a0a0b8' }}>${fmtPrice(trade.entry_price)}</b>
          </span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            出 <b className="font-medium" style={{ color: '#a0a0b8' }}>${fmtPrice(trade.exit_price)}</b>
          </span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            進 <b className="font-medium" style={{ color: '#a0a0b8' }}>{fmtDate(trade.entry_time)} {fmtTime(trade.entry_time)}</b>
          </span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            出 <b className="font-medium" style={{ color: '#a0a0b8' }}>{fmtTime(trade.exit_time)}</b>
          </span>
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {trade.strategies?.name && (
            <span
              className="text-[10px] px-2 py-0.5 rounded font-medium border"
              style={{
                background: 'rgba(200,155,60,.12)',
                borderColor: 'rgba(200,155,60,.25)',
                color: 'var(--accent)',
              }}
            >
              {trade.strategies.name}
            </span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded border"
            style={{ background: 'var(--raised)', borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            {trade.rr_ratio != null ? `RR 1:${trade.rr_ratio}` : 'RR —'}
          </span>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--muted)' }}>
            {durationLabel(trade.entry_time, trade.exit_time)}
          </span>
        </div>
      </div>
    </Link>
  )
}
