'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Trade, Strategy, Account } from '@/lib/types'
import { durationLabel, fmtPrice, fmtPnl } from '@/lib/types'
import KLineChart from '@/components/KLineChart'

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
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
    router.back()
  }

  if (!trade) return (
    <div className="flex items-center justify-center h-40 text-[13px]" style={{ color: 'var(--muted)' }}>
      載入中...
    </div>
  )

  const pnl = trade.pnl ?? 0
  const isProfit = pnl >= 0
  const riskAmount = account ? (account.initial_capital * account.risk_percent) / 100 : 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="text-[14px]" style={{ color: 'var(--accent)' }}>
          ← 返回
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold">{trade.symbol}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={trade.direction === 'long'
                ? { background: 'rgba(22,163,74,.12)', color: 'var(--profit)' }
                : { background: 'rgba(185,28,28,.12)', color: 'var(--loss)' }}>
              {trade.direction === 'long' ? '多' : '空'}
            </span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {fmtPnl(pnl)} · {durationLabel(trade.entry_time, trade.exit_time)}
          </p>
        </div>
      </div>

      {/* Entry / Exit */}
      <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>進出場詳情</div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>進場</div>
            <div className="text-[19px] font-semibold">${fmtPrice(trade.entry_price)}</div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
              {trade.entry_time ? new Date(trade.entry_time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>出場</div>
            <div className="text-[19px] font-semibold" style={{ color: isProfit ? 'var(--profit)' : 'var(--loss)' }}>
              ${fmtPrice(trade.exit_price)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
              {trade.exit_time ? new Date(trade.exit_time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>倉位</div>
            <div className="text-[15px] font-medium">{trade.quantity ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>持倉時長</div>
            <div className="text-[15px] font-medium">{durationLabel(trade.entry_time, trade.exit_time)}</div>
          </div>
        </div>
        {/* Risk bar */}
        <div className="rounded-lg px-3 py-2.5 flex justify-between items-center" style={{ background: 'var(--raised)' }}>
          <div>
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>風險使用</div>
            <div className="text-[14px] font-semibold" style={{ color: '#f59e0b' }}>
              {trade.risk_used != null ? `$${trade.risk_used.toFixed(0)}` : '—'}
              <span className="text-[11px] font-normal ml-1.5" style={{ color: 'var(--muted)' }}>
                / 額度 ${riskAmount.toFixed(0)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>損益</div>
            <div className="text-[14px] font-semibold" style={{ color: isProfit ? 'var(--profit)' : 'var(--loss)' }}>
              {fmtPnl(pnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Strategy & RR */}
      <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>策略 & 盈虧比</div>
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>策略</div>
          <div className="flex flex-wrap gap-1.5">
            {strategies.map(s => (
              <button key={s.id} onClick={() => setStrategyId(strategyId === s.id ? '' : s.id)}
                className="px-3 py-1.5 rounded-md text-[12px] border transition-all"
                style={{
                  background: strategyId === s.id ? 'rgba(200,155,60,.2)' : 'var(--raised)',
                  borderColor: strategyId === s.id ? 'var(--accent)' : 'var(--border2)',
                  color: strategyId === s.id ? 'var(--accent)' : 'var(--muted)',
                }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>實際 RR</div>
          <div className="flex items-center gap-2">
            <span className="text-[13px]" style={{ color: 'var(--muted)' }}>1 :</span>
            <input
              type="number" step="0.1" min="0" placeholder="0.0"
              value={rr}
              onChange={e => setRr(e.target.value)}
              className="w-24 rounded-lg px-3 py-2 text-[14px] border outline-none"
              style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }}
            />
            {rr && trade.risk_used && (
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                風險 ${trade.risk_used.toFixed(0)} → 目標 ${(trade.risk_used * parseFloat(rr)).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* K-line chart */}
      <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>K 線圖</div>
        <KLineChart trade={trade} />
      </div>

      {/* Notes */}
      <div className="rounded-[10px] p-4 mb-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>備註</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="複盤筆記..."
          className="w-full rounded-lg px-3 py-2.5 text-[14px] border outline-none resize-none"
          style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }}
        />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#08080d' }}>
        {saving ? '儲存中...' : '儲存'}
      </button>
    </div>
  )
}
