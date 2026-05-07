'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trade, Account, Strategy } from '@/lib/types'
import { fmtPnl } from '@/lib/types'
import EquityChart from '@/components/EquityChart'
import StrategyCard from '@/components/StrategyCard'
import StrategyEquityChart from '@/components/StrategyEquityChart'
import {
  RANGE_OPTIONS, SORT_OPTIONS, rangeStartMs,
  computeStrategyMetric, sortMetrics,
  type Range, type SortKey,
} from '@/lib/strategy-stats'

export default function StatsPage() {
  const [account, setAccount] = useState<'bingx' | 'tradovate'>('tradovate')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [month, setMonth] = useState(() => {
    const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }
  })

  const [stratRange, setStratRange] = useState<Range>('30d')
  const [sortKey, setSortKey] = useState<SortKey>('pnl')

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

  const monthlyData = useMemo(() => {
    const cap = current?.initial_capital ?? 10000
    const grouped: Record<string, number> = {}
    for (const t of trades) {
      const d = new Date(t.entry_time ?? t.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      grouped[key] = (grouped[key] ?? 0) + (t.pnl ?? 0)
    }
    return Object.entries(grouped).sort().map(([key, pnl]) => {
      const m = key.split('-')[1]
      return { label: `${m}月`, pnl, initial: cap }
    })
  }, [trades, current])

  const strategyMetrics = useMemo(() => {
    const startMs = rangeStartMs(stratRange)
    const rangeTrades = trades.filter(t => {
      const ts = new Date(t.exit_time ?? t.entry_time ?? t.created_at).getTime()
      return ts >= startMs
    })
    const metrics = strategies.map((s, i) => computeStrategyMetric(s, rangeTrades, i))
      .filter(m => m.count > 0)
    return sortMetrics(metrics, sortKey)
  }, [trades, strategies, stratRange, sortKey])

  const monthLabel = `${month.y}年${month.m + 1}月`

  return (
    <div className="retro-theme min-h-screen px-4 py-5 md:px-8 md:py-7">
      {/* Headline — newspaper masthead */}
      <header className="mb-6">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <h1 className="retro-display retro-shadow text-[44px] md:text-[64px]">STATS</h1>
          <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
            交易日誌 · {new Date().toLocaleDateString('zh-TW')}
          </div>
        </div>
        <div className="retro-divider" />
      </header>

      {/* Account + month nav */}
      <div className="md:flex md:items-center md:gap-4 md:mb-5">
        <div className="flex gap-1.5 p-1 mb-3 md:mb-0 md:w-60 shrink-0 retro-card">
          {(['tradovate', 'bingx'] as const).map(name => (
            <button key={name} onClick={() => setAccount(name)}
              className="flex-1 py-1.5 text-[12px] uppercase tracking-wider font-bold transition-colors"
              style={{
                background: account === name ? 'var(--accent)' : 'transparent',
                color: 'var(--border)',
                borderRadius: 4,
              }}>
              {name === 'tradovate' ? 'Prop Firm' : 'Crypto'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4 md:mb-0">
          <button onClick={() => setMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            className="w-8 h-8 retro-card flex items-center justify-center text-[16px] font-bold">‹</button>
          <span className="retro-display text-[18px] px-3 py-1.5 retro-card min-w-[110px] text-center">{monthLabel}</span>
          <button onClick={() => setMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            className="w-8 h-8 retro-card flex items-center justify-center text-[16px] font-bold">›</button>
        </div>

        <div className="hidden md:grid grid-cols-3 gap-2 flex-1">
          {[
            { label: '損益', val: fmtPnl(monthPnl), color: monthPnl >= 0 ? 'var(--profit)' : 'var(--loss)' },
            { label: '勝率', val: `${winRate}%`, color: 'var(--accent2)' },
            { label: '次數', val: `${monthTrades.length}`, color: 'var(--text)' },
          ].map(s => (
            <div key={s.label} className="retro-card px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>{s.label}</span>
              <span className="retro-display retro-mono text-[20px]" style={{ color: s.color }}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile summary */}
      <div className="grid grid-cols-3 gap-2 mb-4 md:hidden">
        {[
          { label: '損益', val: fmtPnl(monthPnl), color: monthPnl >= 0 ? 'var(--profit)' : 'var(--loss)' },
          { label: '勝率', val: `${winRate}%`, color: 'var(--accent2)' },
          { label: '次數', val: `${monthTrades.length}`, color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} className="retro-card p-3">
            <div className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="retro-display retro-mono text-[19px]" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Equity chart */}
      <section className="retro-card p-4 mb-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="retro-display text-[20px]">資產走勢</h2>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>EQUITY</span>
        </div>
        <EquityChart trades={trades} initialCapital={current?.initial_capital ?? 10000} />
      </section>

      {/* ===== Strategy overview ===== */}
      <section className="retro-card mb-5 overflow-hidden">
        {/* Section masthead */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ background: 'var(--accent)', borderBottom: '1.5px solid var(--border)' }}>
          <h2 className="retro-display text-[22px]" style={{ color: 'var(--border)' }}>策略總覽</h2>
          <span className="retro-display text-[11px] tracking-[0.2em]" style={{ color: 'var(--border)' }}>STRATEGY · OVERVIEW</span>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--raised)' }}>
          <div className="flex gap-1.5 flex-wrap">
            {RANGE_OPTIONS.map(r => (
              <button key={r.key} onClick={() => setStratRange(r.key)}
                data-active={stratRange === r.key}
                className="retro-pill retro-pill-orange px-3 py-1 text-[11px] uppercase tracking-wider font-bold transition-colors">
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>排序</span>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1 outline-none text-[11px] uppercase tracking-wider font-bold cursor-pointer"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--border)', borderRadius: 4 }}>
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Strategy chart with legend */}
        <div className="p-4" style={{ borderBottom: '1.5px solid var(--border)' }}>
          {strategyMetrics.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
              {strategyMetrics.map(m => (
                <div key={m.id} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold">
                  <span className="w-2.5 h-2.5" style={{ background: m.color, border: '1px solid var(--border)' }} />
                  <span style={{ color: 'var(--text)' }}>{m.name}</span>
                </div>
              ))}
            </div>
          )}
          <StrategyEquityChart metrics={strategyMetrics} rangeStartMs={rangeStartMs(stratRange)} />
        </div>

        {/* Strategy cards grid */}
        <div className="p-4">
          {strategyMetrics.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {strategyMetrics.map(m => <StrategyCard key={m.id} metric={m} />)}
            </div>
          ) : (
            <div className="p-8 text-center text-[12px] uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>
              此時間範圍內無策略資料
            </div>
          )}
        </div>
      </section>

      {/* Monthly compound table */}
      {monthlyData.length > 0 && (
        <section className="retro-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ background: 'var(--accent2)', borderBottom: '1.5px solid var(--border)' }}>
            <h2 className="retro-display text-[20px]" style={{ color: '#fff' }}>月度損益追蹤</h2>
            <span className="retro-display text-[11px] tracking-[0.2em]" style={{ color: '#fff' }}>MONTHLY · LEDGER</span>
          </div>
          <table className="w-full text-[13px] border-collapse retro-mono">
            <thead>
              <tr style={{ background: 'var(--raised)', borderBottom: '1.5px solid var(--border)' }}>
                {['月份', '起始', '損益', '結餘'].map(h => (
                  <th key={h} className="text-left py-2 px-3 font-bold uppercase tracking-widest" style={{ color: 'var(--border)', fontSize: '10px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((row, i) => (
                <tr key={i} style={{ borderBottom: i < monthlyData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="py-2.5 px-3 font-bold">{row.label}</td>
                  <td className="py-2.5 px-3">${row.initial.toLocaleString()}</td>
                  <td className="py-2.5 px-3 font-bold" style={{ color: row.pnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(0)}
                  </td>
                  <td className="py-2.5 px-3 font-bold" style={{ color: (row.initial + row.pnl) >= row.initial ? 'var(--profit)' : 'var(--loss)' }}>
                    ${(row.initial + row.pnl).toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
