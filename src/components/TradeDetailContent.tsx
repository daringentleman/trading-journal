'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Trade, Strategy, Account } from '@/lib/types'
import { durationLabel, fmtPrice, fmtPnl } from '@/lib/types'
import KLineChart from '@/components/KLineChart'

interface Props {
  id: string
  /** 'page' = full standalone route, 'modal' = rendered inside modal shell */
  mode?: 'page' | 'modal'
  /** Called after successful save in modal mode (so the modal can close) */
  onSaved?: () => void
}

export default function TradeDetailContent({ id, mode = 'page', onSaved }: Props) {
  const router = useRouter()
  const [trade, setTrade] = useState<Trade | null>(null)
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [account, setAccount] = useState<Account | null>(null)
  const [rr, setRr] = useState('')
  const [notes, setNotes] = useState('')
  const [strategyId, setStrategyId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('trades').select('*, strategies(*)').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return
        const t = data as Trade
        setTrade(t)
        setRr(t.rr_ratio?.toString() ?? '')
        setNotes(t.notes ?? '')
        setStrategyId(t.strategy_id ?? '')
        supabase.from('accounts').select('*').eq('id', t.account_id).single()
          .then(({ data: acc }) => acc && setAccount(acc as Account))
        supabase.from('strategies').select('*').eq('account_id', t.account_id).order('sort_order')
          .then(({ data: strats }) => strats && setStrategies(strats as Strategy[]))
      })
  }, [id])

  async function save() {
    if (!trade) return
    setSaving(true)
    await supabase.from('trades').update({
      rr_ratio: rr ? parseFloat(rr) : null,
      notes: notes || null,
      strategy_id: strategyId || null,
    }).eq('id', trade.id)
    setSaving(false)
    if (mode === 'modal' && onSaved) onSaved()
    else router.back()
  }

  if (!trade) return (
    <div className="flex items-center justify-center h-40 fs-meta" style={{ color: 'var(--muted)' }}>
      載入中...
    </div>
  )

  const pnl = trade.pnl ?? 0
  const isProfit = pnl >= 0
  const riskAmount = account ? (account.initial_capital * account.risk_percent) / 100 : 0

  return (
    <>
      {/* Header — different chrome depending on mode */}
      {mode === 'page' && (
        <header className="mb-6">
          <button onClick={() => router.back()} className="fs-meta retro-display mb-2 inline-flex items-center gap-1"
            style={{ color: 'var(--border)' }}>
            ← 返回
          </button>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <h1 className="retro-display retro-distressed fs-display md:text-[64px]">TRADE</h1>
            <TradeMeta trade={trade} pnl={pnl} />
          </div>
          <div className="retro-divider" />
        </header>
      )}
      {mode === 'modal' && (
        <header className="mb-5">
          <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
            <h2 className="retro-display retro-distressed fs-display">TRADE</h2>
            <TradeMeta trade={trade} pnl={pnl} />
          </div>
          <div className="retro-divider" />
        </header>
      )}

      {/* Entry / Exit */}
      <div className="retro-card p-4 mb-3">
        <div className="fs-tiny font-bold mb-3" style={{ color: 'var(--muted)' }}>進出場詳情</div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>進場</div>
            <div className="retro-mono fs-stat font-bold">${fmtPrice(trade.entry_price)}</div>
            <div className="fs-tiny mt-1 retro-mono" style={{ color: 'var(--muted)' }}>
              {trade.entry_time ? new Date(trade.entry_time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
            </div>
          </div>
          <div>
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>出場</div>
            <div className="retro-mono fs-stat font-bold" style={{ color: isProfit ? 'var(--profit)' : 'var(--loss)' }}>
              ${fmtPrice(trade.exit_price)}
            </div>
            <div className="fs-tiny mt-1 retro-mono" style={{ color: 'var(--muted)' }}>
              {trade.exit_time ? new Date(trade.exit_time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
            </div>
          </div>
          <div>
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>倉位</div>
            <div className="retro-mono fs-body font-bold">{trade.quantity ?? '—'}</div>
          </div>
          <div>
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>持倉時長</div>
            <div className="retro-mono fs-body font-bold">{durationLabel(trade.entry_time, trade.exit_time)}</div>
          </div>
        </div>
        <div className="px-3 py-2.5 flex justify-between items-center" style={{ background: 'var(--raised)', border: '1.5px solid var(--border)', borderRadius: 4 }}>
          <div>
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>風險使用</div>
            <div className="retro-mono fs-body font-bold" style={{ color: 'var(--accent2)' }}>
              {trade.risk_used != null ? `$${trade.risk_used.toFixed(0)}` : '—'}
              <span className="fs-tiny font-normal ml-1.5" style={{ color: 'var(--muted)' }}>
                / 額度 ${riskAmount.toFixed(0)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="fs-tiny font-bold mb-1" style={{ color: 'var(--muted)' }}>損益</div>
            <div className="retro-mono fs-body font-bold" style={{ color: isProfit ? 'var(--profit)' : 'var(--loss)' }}>
              {fmtPnl(pnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Strategy & RR */}
      <div className="retro-card p-4 mb-3">
        <div className="fs-tiny font-bold mb-3" style={{ color: 'var(--muted)' }}>策略 & 盈虧比</div>
        <div className="mb-4">
          <div className="fs-tiny font-bold mb-2" style={{ color: 'var(--muted)' }}>策略</div>
          <div className="flex flex-wrap gap-1.5">
            {strategies.map(s => (
              <button key={s.id} onClick={() => setStrategyId(strategyId === s.id ? '' : s.id)}
                className="px-3 py-1.5 fs-meta font-bold transition-all"
                style={{
                  background: strategyId === s.id ? 'var(--accent)' : 'var(--raised)',
                  border: '1.5px solid var(--border)',
                  color: 'var(--border)',
                  borderRadius: 4,
                }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="fs-tiny font-bold mb-2" style={{ color: 'var(--muted)' }}>實際 RR</div>
          <div className="flex items-center gap-2">
            <span className="fs-body retro-mono" style={{ color: 'var(--muted)' }}>1 :</span>
            <input
              type="number" step="0.1" min="0" placeholder="0.0"
              value={rr}
              onChange={e => setRr(e.target.value)}
              className="w-24 px-3 py-2 fs-body outline-none retro-mono font-bold"
              style={{ background: 'var(--raised)', border: '1.5px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}
            />
            {rr && trade.risk_used && (
              <span className="fs-tiny retro-mono" style={{ color: 'var(--muted)' }}>
                風險 ${trade.risk_used.toFixed(0)} → 目標 ${(trade.risk_used * parseFloat(rr)).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="retro-card p-4 mb-3">
        <div className="fs-tiny font-bold mb-3" style={{ color: 'var(--muted)' }}>K 線圖</div>
        <KLineChart trade={trade} />
      </div>

      <div className="retro-card p-4 mb-4">
        <div className="fs-tiny font-bold mb-2" style={{ color: 'var(--muted)' }}>備註</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="複盤筆記..."
          className="w-full px-3 py-2.5 fs-body outline-none resize-none"
          style={{ background: 'var(--raised)', border: '1.5px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}
        />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3 fs-section retro-display disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--border)', border: '1.5px solid var(--border)', borderRadius: 4 }}>
        {saving ? '儲存中...' : '儲存'}
      </button>
    </>
  )
}

function TradeMeta({ trade, pnl }: { trade: Trade; pnl: number }) {
  return (
    <div className="text-right">
      <div className="flex items-center gap-2 justify-end mb-1">
        <span className="retro-display fs-section">{trade.symbol}</span>
        <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase border"
          style={trade.direction === 'long'
            ? { background: 'rgba(46,125,62,.18)', color: 'var(--profit)', borderColor: 'var(--profit)' }
            : { background: 'rgba(185,28,28,.15)', color: 'var(--loss)', borderColor: 'var(--loss)' }}>
          {trade.direction === 'long' ? '多' : '空'}
        </span>
      </div>
      <p className="fs-meta retro-mono" style={{ color: 'var(--muted)' }}>
        {fmtPnl(pnl)} · {durationLabel(trade.entry_time, trade.exit_time)}
      </p>
    </div>
  )
}
