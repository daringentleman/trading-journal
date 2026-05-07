'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trade, Account } from '@/lib/types'
import { fmtPnl } from '@/lib/types'
import TradeItem from '@/components/TradeItem'
import EquityChart from '@/components/EquityChart'

const ACCOUNT_ORDER = ['tradovate', 'bingx'] as const
const ACCOUNT_LABEL: Record<string, string> = { tradovate: 'Prop Firm', bingx: 'Crypto' }

function currentMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return parseInt(y) !== new Date().getFullYear()
    ? `${y}/${parseInt(m)}月`
    : `${parseInt(m)}月`
}

export default function Dashboard() {
  const [account, setAccount] = useState<'bingx' | 'tradovate'>('tradovate')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [allPnl, setAllPnl] = useState<Record<string, number>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr)
  const [loading, setLoading] = useState(true)

  const current = accounts.find(a => a.name === account)
  const riskAmount = current ? (current.initial_capital * current.risk_percent) / 100 : 0

  // Derive available months from loaded trades
  const availableMonths = [...new Set(trades.map(t => {
    const d = new Date(t.entry_time ?? t.created_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }))].sort().reverse()

  const monthTrades = trades.filter(t => {
    const d = new Date(t.entry_time ?? t.created_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth
  })

  const wins = monthTrades.filter(t => (t.pnl ?? 0) > 0)
  const winRate = monthTrades.length ? Math.round((wins.length / monthTrades.length) * 100) : 0
  const monthPnl = monthTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const rrTrades = monthTrades.filter(t => t.rr_ratio)
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + (t.rr_ratio ?? 0), 0) / rrTrades.length : 0

  useEffect(() => {
    supabase.from('accounts').select('*').then(({ data }) => {
      setLoading(false)
      if (!data) return
      setAccounts(data as Account[])
      data.forEach((acc: Account) => {
        supabase.from('trades').select('pnl').eq('account_id', acc.id)
          .then(({ data: td }) => {
            const sum = td?.reduce((s, t) => s + (t.pnl ?? 0), 0) ?? 0
            setAllPnl(prev => ({ ...prev, [acc.name]: sum }))
          })
      })
    })
  }, [])

  useEffect(() => {
    const acc = accounts.find(a => a.name === account)
    if (!acc) return
    setSelectedMonth(currentMonthStr())
    supabase
      .from('trades')
      .select('*, strategies(name)')
      .eq('account_id', acc.id)
      .order('entry_time', { ascending: false })
      .then(({ data }) => data && setTrades(data as Trade[]))
  }, [account, accounts])

  async function syncBingX() {
    setSyncing(true)
    setSyncMsg('')
    const res = await fetch('/api/bingx-sync', { method: 'POST' })
    const json = await res.json()
    setSyncMsg(json.message ?? (res.ok ? '同步完成' : '同步失敗'))
    setSyncing(false)
    if (res.ok) {
      const acc = accounts.find(a => a.name === 'bingx')
      if (!acc) return
      const { data } = await supabase
        .from('trades')
        .select('*, strategies(name)')
        .eq('account_id', acc.id)
        .order('entry_time', { ascending: false })
      if (data) {
        if (account === 'bingx') setTrades(data as Trade[])
        const sum = data.reduce((s, t) => s + ((t as { pnl?: number }).pnl ?? 0), 0)
        setAllPnl(prev => ({ ...prev, bingx: sum }))
      }
    }
  }

  const [y, m] = selectedMonth.split('-')
  const monthDisplay = `${y}年${parseInt(m)}月`

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      {/* Header — newspaper masthead */}
      <header className="mb-6">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <h1 className="retro-display retro-distressed fs-display md:text-[72px]">DASHBOARD</h1>
          <div className="fs-meta" style={{ color: 'var(--muted)' }}>
            交易日誌 · {monthDisplay}
          </div>
        </div>
        <div className="retro-divider" />
      </header>

      {/* Account equity overview */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {loading ? (
          // Loading skeleton
          [0, 1].map(i => (
            <div key={i} className="rounded-[10px] p-3 border animate-pulse" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="h-2.5 w-16 rounded mb-2" style={{ background: 'var(--raised)' }} />
              <div className="h-5 w-24 rounded" style={{ background: 'var(--raised)' }} />
            </div>
          ))
        ) : (
          ACCOUNT_ORDER.map(name => accounts.find(a => a.name === name)).filter((a): a is Account => !!a).map(acc => {
            const pnl = allPnl[acc.name] ?? 0
            const equity = acc.initial_capital + pnl
            const label = ACCOUNT_LABEL[acc.name] ?? acc.name
            return (
              <div key={acc.name} className="rounded-[10px] p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>{label} · 帳戶資金</div>
                <div className="text-[18px] font-semibold" style={{ color: pnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Account tabs */}
      <div className="flex gap-1.5 p-1 rounded-lg mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {ACCOUNT_ORDER.map(name => (
          <button key={name} onClick={() => setAccount(name)}
            className="flex-1 py-1.5 rounded-md text-[13px] transition-colors"
            style={{ background: account === name ? 'var(--raised)' : 'transparent', color: account === name ? 'var(--text)' : 'var(--muted)' }}>
            {ACCOUNT_LABEL[name]}
          </button>
        ))}
      </div>

      {/* Sync bar */}
      {account === 'bingx' && (
        <div className="flex justify-between items-center rounded-[10px] px-3.5 py-2.5 mb-3 border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5" style={{ background: 'var(--profit)' }} />
            {syncMsg || 'BingX 已連線'}
          </div>
          <button onClick={syncBingX} disabled={syncing}
            className="text-[12px] px-3.5 py-1.5 rounded-[7px] font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#08080d' }}>
            {syncing ? '同步中...' : '↻ 同步'}
          </button>
        </div>
      )}

      {/* Desktop: risk card + equity chart side by side, equal height */}
      <div className="md:grid md:grid-cols-2 md:gap-4 md:mb-4">
        {/* Risk card */}
        {loading ? (
          <div className="rounded-[10px] p-4 mb-3 md:mb-0 border animate-pulse" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="h-2 w-12 rounded mb-3" style={{ background: 'var(--raised)' }} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-3 border h-28" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }} />
              <div className="grid grid-rows-2 gap-2">
                <div className="rounded-lg border h-[52px]" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }} />
                <div className="rounded-lg border h-[52px]" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }} />
              </div>
            </div>
          </div>
        ) : current ? (
          <div className="rounded-[10px] p-4 mb-3 md:mb-0 border flex flex-col" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>風險管理</div>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <div className="rounded-lg p-3 border" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>
                  {ACCOUNT_LABEL[account]}
                </div>
                <div className="text-[17px] font-semibold mb-2">${current.initial_capital.toLocaleString()}</div>
                <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: 'var(--muted)' }}>風險比例</span>
                    <span>{current.risk_percent}%</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: 'var(--muted)' }}>每筆可虧</span>
                    <span className="text-[15px] font-semibold" style={{ color: '#f59e0b' }}>${riskAmount.toFixed(0)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-rows-2 gap-2">
                <div className="rounded-lg p-3 border" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--muted)' }}>本月損益</div>
                  <div className="text-[19px] font-semibold mt-1" style={{ color: monthPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {fmtPnl(monthPnl)}
                  </div>
                </div>
                <div className="rounded-lg p-3 border" style={{ background: 'var(--raised)', borderColor: 'var(--border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--muted)' }}>勝率</div>
                  <div className="text-[19px] font-semibold mt-1" style={{ color: 'var(--accent)' }}>
                    {winRate}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Equity chart */}
        <div className="rounded-[10px] p-4 mb-3 md:mb-0 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>資產走勢</div>
          <EquityChart
            trades={trades}
            initialCapital={(current?.initial_capital ?? 10000) + (account === 'tradovate' ? (allPnl.bingx ?? 0) : 0)}
          />
        </div>
      </div>

      {/* Month trade list */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          交易紀錄
        </span>
        <a href="/log" className="text-[12px]" style={{ color: 'var(--accent)' }}>全部 →</a>
      </div>

      {/* Month tabs */}
      {availableMonths.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {availableMonths.map(ym => (
            <button key={ym} onClick={() => setSelectedMonth(ym)}
              className="px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap border transition-colors"
              style={{
                background: selectedMonth === ym ? 'var(--raised)' : 'transparent',
                borderColor: selectedMonth === ym ? 'var(--border2)' : 'var(--border)',
                color: selectedMonth === ym ? 'var(--text)' : 'var(--muted)',
              }}>
              {fmtMonthLabel(ym)}
            </button>
          ))}
        </div>
      )}

      {monthTrades.length === 0 ? (
        <div className="rounded-[10px] p-8 border text-center text-[13px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
          {trades.length === 0
            ? (account === 'bingx' ? '按「同步」載入 BingX 交易記錄' : '在設定頁上傳 CSV')
            : `${fmtMonthLabel(selectedMonth)} 無交易紀錄`}
        </div>
      ) : (
        monthTrades.map(t => <TradeItem key={t.id} trade={t} />)
      )}
    </div>
  )
}
