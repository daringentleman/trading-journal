'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trade, Account, Strategy } from '@/lib/types'
import { fmtPnl } from '@/lib/types'
import EquityChart from '@/components/EquityChart'

export default function StatsPage() {
  const [account, setAccount] = useState<'bingx' | 'tradovate'>('tradovate')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [month, setMonth] = useState(() => {
    const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }
  })

  const current = accounts.find(a => a.name === account)

  useEffect(() => {
    supabase.from('accounts').select('*').then(({ data }) => data && setAccounts(data as Account[]))
  }, [])

  useEffect(() => {
    const acc = accounts.find(a => a.name === account)
    if (!acc) return
    supabase.from('strategies').select('*').eq('account_id', acc.id).order('sort_order')
      .then(({ data }) => data && setStrategies(data as Strategy[]))
    supabase.from('trades').select('*, strategies(name)')
      .eq('account_id', acc.id)
      .then(({ data }) => data && setTrades(data as Trade[]))
  }, [account, accounts])

  const monthTrades = trades.filter(t => {
    const d = new Date(t.entry_time ?? t.created_at)
    return d.getFullYear() === month.y && d.getMonth() === month.m
  })

  const monthPnl = monthTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const wins = monthTrades.filter(t => (t.pnl ?? 0) > 0)
  const winRate = monthTrades.length ? Math.round((wins.length / monthTrades.length) * 100) : 0

  // Monthly history for compound table
  const monthlyData = (() => {
    const cap = current?.initial_capital ?? 10000
    const grouped: Record<string, number> = {}
    for (const t of trades) {
      const d = new Date(t.entry_time ?? t.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      grouped[key] = (grouped[key] ?? 0) + (t.pnl ?? 0)
    }
    return Object.entries(grouped).sort().map(([key, pnl]) => {
      const [y, m] = key.split('-')
      return { label: `${m}月`, pnl, initial: cap }
    })
  })()

  // Strategy stats
  const stratStats = strategies.map(s => {
    const st = monthTrades.filter(t => t.strategies?.name === s.name)
    const w = st.filter(t => (t.pnl ?? 0) > 0)
    const rr = st.filter(t => t.rr_ratio)
    return {
      name: s.name,
      count: st.length,
      winRate: st.length ? Math.round((w.length / st.length) * 100) : 0,
      avgRR: rr.length ? rr.reduce((s, t) => s + (t.rr_ratio ?? 0), 0) / rr.length : 0,
    }
  }).filter(s => s.count > 0)

  const monthLabel = `${month.y}年${month.m + 1}月`

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      {/* Header + account tabs + month nav */}
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="text-[17px] font-semibold">統計</h1>
      </div>

      <div className="md:flex md:items-center md:gap-4 md:mb-4">
        <div className="flex gap-1.5 p-1 rounded-lg mb-3 md:mb-0 md:w-56 border shrink-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          {(['tradovate', 'bingx'] as const).map(name => (
            <button key={name} onClick={() => setAccount(name)}
              className="flex-1 py-1.5 rounded-md text-[13px] transition-colors"
              style={{ background: account === name ? 'var(--raised)' : 'transparent', color: account === name ? 'var(--text)' : 'var(--muted)' }}>
              {name === 'tradovate' ? 'Prop Firm' : 'Crypto'}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-4 md:mb-0 md:gap-2">
          <button onClick={() => setMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            className="text-[18px] px-2" style={{ color: 'var(--muted)' }}>‹</button>
          <span className="text-[15px] font-semibold">{monthLabel}</span>
          <button onClick={() => setMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            className="text-[18px] px-2" style={{ color: 'var(--muted)' }}>›</button>
        </div>

        {/* Summary inline on desktop */}
        <div className="hidden md:flex gap-2 flex-1">
          {[
            { label: '損益', val: fmtPnl(monthPnl), color: monthPnl >= 0 ? 'var(--profit)' : 'var(--loss)' },
            { label: '勝率', val: `${winRate}%`, color: 'var(--accent)' },
            { label: '次數', val: `${monthTrades.length}`, color: 'var(--text)' },
          ].map(s => (
            <div key={s.label} className="rounded-[10px] px-4 py-2.5 border flex items-center gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{s.label}</span>
              <span className="text-[16px] font-semibold" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary — mobile only */}
      <div className="grid grid-cols-3 gap-2 mb-3 md:hidden">
        {[
          { label: '損益', val: fmtPnl(monthPnl), color: monthPnl >= 0 ? 'var(--profit)' : 'var(--loss)' },
          { label: '勝率', val: `${winRate}%`, color: 'var(--accent)' },
          { label: '次數', val: `${monthTrades.length}`, color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} className="rounded-[10px] p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="text-[10px] mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="text-[18px] font-semibold" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Desktop: chart left | strategy right */}
      <div className="md:grid md:grid-cols-[1fr_320px] md:gap-4 md:items-start mb-3">
        {/* Equity chart */}
        <div className="rounded-[10px] p-4 mb-3 md:mb-0 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>資產走勢</div>
          <EquityChart trades={trades} initialCapital={current?.initial_capital ?? 10000} />
        </div>

        {/* Strategy cards */}
        {stratStats.length > 0 ? (
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>策略表現</div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              {stratStats.map(s => (
                <div key={s.name} className="rounded-[10px] p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="text-[13px] font-medium mb-2.5">{s.name}</div>
                  <div className="flex justify-between mb-2">
                    <div className="text-center">
                      <div className="text-[17px] font-semibold" style={{ color: 'var(--accent)' }}>{s.winRate}%</div>
                      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>勝率</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[17px] font-semibold">{s.count}</div>
                      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>次數</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[17px] font-semibold" style={{ color: 'var(--accent)' }}>
                        {s.avgRR > 0 ? s.avgRR.toFixed(1) : '—'}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>RR</div>
                    </div>
                  </div>
                  <div className="h-0.5 rounded" style={{ background: 'var(--raised)' }}>
                    <div className="h-full rounded" style={{ width: `${s.winRate}%`, background: 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
      </div>

      {/* Monthly compound table — full width */}
      {monthlyData.length > 0 && (
        <div className="rounded-[10px] p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>月度損益追蹤</div>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['月份', '起始', '損益', '結餘'].map(h => (
                  <th key={h} className="text-left py-1.5 px-2 font-normal" style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((row, i) => (
                <tr key={i} style={{ borderBottom: i < monthlyData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="py-2 px-2">{row.label}</td>
                  <td className="py-2 px-2">${row.initial.toLocaleString()}</td>
                  <td className="py-2 px-2" style={{ color: row.pnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(0)}
                  </td>
                  <td className="py-2 px-2" style={{ color: (row.initial + row.pnl) >= row.initial ? 'var(--profit)' : 'var(--loss)' }}>
                    ${(row.initial + row.pnl).toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
