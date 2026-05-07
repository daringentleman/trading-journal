'use client'

import Link from 'next/link'
import type { Trade, Strategy } from '@/lib/types'
import { durationLabel, fmtPrice, fmtPnl, fmtTime, fmtDate } from '@/lib/types'

interface Props {
  trade: Trade
  strategies?: Strategy[]
  onAssignStrategy?: (tradeId: string, strategyId: string | null) => void | Promise<void>
}

export default function TradeItem({ trade, strategies, onAssignStrategy }: Props) {
  const pnl = trade.pnl ?? 0
  const isProfit = pnl >= 0
  const showPicker = strategies && strategies.length > 0 && onAssignStrategy

  return (
    <Link href={`/trade/${trade.id}`} className="block">
      <div
        className="rounded-[10px] p-3.5 mb-2 border transition-colors hover:border-[var(--accent)]"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
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

        <div className="flex items-center gap-1.5 flex-wrap">
          {showPicker ? (
            <StrategySelect
              currentName={trade.strategies?.name}
              strategies={strategies!}
              onSelect={(sid) => onAssignStrategy!(trade.id, sid)}
            />
          ) : trade.strategies?.name ? (
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
          ) : null}
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

function StrategySelect({
  currentName, strategies, onSelect,
}: {
  currentName?: string
  strategies: Strategy[]
  onSelect: (strategyId: string | null) => void | Promise<void>
}) {
  const tagged = !!currentName

  // stop propagation so click/mousedown on the select don't trigger the parent Link
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation()
    const v = e.target.value
    onSelect(v === '__clear__' ? null : v)
  }

  return (
    <div onClick={stop} onMouseDown={stop} className="relative inline-flex">
      <select
        value=""  // controlled to "" so onChange fires every selection
        onChange={handleChange}
        onClick={stop}
        className="appearance-none cursor-pointer text-[10px] px-2 py-0.5 rounded font-medium border outline-none pr-5"
        style={
          tagged
            ? {
                background: 'rgba(200,155,60,.12)',
                borderColor: 'rgba(200,155,60,.25)',
                color: 'var(--accent)',
              }
            : {
                background: 'var(--raised)',
                borderColor: 'var(--border)',
                color: 'var(--muted)',
              }
        }
      >
        <option value="" disabled hidden>{tagged ? currentName : '+ 標策略'}</option>
        {strategies.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        {tagged && <option value="__clear__">— 清除 —</option>}
      </select>
      <span
        className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px]"
        style={{ color: tagged ? 'var(--accent)' : 'var(--muted)' }}
      >▾</span>
    </div>
  )
}
