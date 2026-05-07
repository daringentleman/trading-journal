'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Trade, Account, Strategy } from '@/lib/types'
import TradeItem from '@/components/TradeItem'

const ACCOUNT_ORDER = ['tradovate', 'bingx'] as const
const ACCOUNT_LABEL: Record<string, string> = { tradovate: 'Prop Firm', bingx: 'Crypto' }

const emptyForm = {
  symbol: '', direction: 'long' as 'long' | 'short',
  entry_price: '', exit_price: '',
  entry_time: '', exit_time: '',
  quantity: '', pnl: '',
}

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

export default function LogPage() {
  const [account, setAccount] = useState<'bingx' | 'tradovate'>('tradovate')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'best' | 'worst'>('newest')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('accounts').select('*').then(({ data }) => data && setAccounts(data as Account[]))
  }, [])

  useEffect(() => {
    const acc = accounts.find(a => a.name === account)
    if (!acc) return
    setShowForm(false)
    setFilter('all')
    setSelectedMonth(currentMonthStr())
    supabase.from('strategies').select('*').eq('account_id', acc.id).order('sort_order')
      .then(({ data }) => data && setStrategies(data as Strategy[]))
    supabase.from('trades').select('*, strategies(name)')
      .eq('account_id', acc.id)
      .order('entry_time', { ascending: false })
      .then(({ data }) => data && setTrades(data as Trade[]))
  }, [account, accounts])

  // Derive available months from all trades
  const availableMonths = [...new Set(trades.map(t => {
    const d = new Date(t.entry_time ?? t.created_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }))].sort().reverse()

  // Month filter → strategy filter → sort
  const monthFiltered = trades.filter(t => {
    const d = new Date(t.entry_time ?? t.created_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth
  })

  const filtered = (filter === 'all' ? monthFiltered : monthFiltered.filter(t => t.strategies?.name === filter))
    .slice()
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.exit_time ?? b.created_at).getTime() - new Date(a.exit_time ?? a.created_at).getTime()
      if (sort === 'oldest') return new Date(a.exit_time ?? a.created_at).getTime() - new Date(b.exit_time ?? b.created_at).getTime()
      if (sort === 'best') return (b.pnl ?? 0) - (a.pnl ?? 0)
      return (a.pnl ?? 0) - (b.pnl ?? 0)
    })

  function setField(k: keyof typeof emptyForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function applyStrategyLocal(ids: Set<string>, strategyId: string | null) {
    const target = strategyId ? strategies.find(s => s.id === strategyId) : undefined
    setTrades(prev => prev.map(t => ids.has(t.id)
      ? { ...t, strategy_id: strategyId ?? undefined, strategies: target ? { ...target } : undefined }
      : t,
    ))
  }

  async function handleAssignSingle(tradeId: string, strategyId: string | null) {
    const { error } = await supabase.from('trades')
      .update({ strategy_id: strategyId }).eq('id', tradeId)
    if (!error) applyStrategyLocal(new Set([tradeId]), strategyId)
  }

  async function handleBatchAssign(strategyId: string | null) {
    if (!selectedIds.size) return
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('trades')
      .update({ strategy_id: strategyId }).in('id', ids)
    if (!error) {
      applyStrategyLocal(selectedIds, strategyId)
      setSelectedIds(new Set())
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(t => t.id)))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const acc = accounts.find(a => a.name === 'tradovate')
    if (!acc) return
    setSaving(true)
    const { data, error } = await supabase.from('trades').insert({
      account_id: acc.id,
      external_id: `manual-${Date.now()}`,
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      entry_price: parseFloat(form.entry_price) || null,
      exit_price: parseFloat(form.exit_price) || null,
      entry_time: form.entry_time ? new Date(form.entry_time).toISOString() : null,
      exit_time: form.exit_time ? new Date(form.exit_time).toISOString() : null,
      quantity: parseFloat(form.quantity) || null,
      pnl: parseFloat(form.pnl) || null,
    }).select('*, strategies(name)').single()
    setSaving(false)
    if (!error && data) {
      setTrades(p => [data as Trade, ...p])
      setForm(emptyForm)
      setShowForm(false)
    }
  }

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[17px] font-semibold">交易記錄</h1>
          <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{filtered.length} 筆</p>
        </div>
        <button
          onClick={() => { setBatchMode(b => !b); setSelectedIds(new Set()) }}
          disabled={strategies.length === 0}
          title={strategies.length === 0 ? '請先到設定頁建立策略' : ''}
          className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: batchMode ? 'var(--accent)' : 'var(--surface)',
            borderColor: batchMode ? 'var(--accent)' : 'var(--accent)',
            color: batchMode ? '#08080d' : 'var(--accent)',
          }}>
          {batchMode ? '✕ 結束批次' : '☑ 批次標策略'}
        </button>
      </div>

      {/* Account tabs */}
      <div className="flex gap-1.5 p-1 rounded-lg mb-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {ACCOUNT_ORDER.map(name => (
          <button key={name} onClick={() => setAccount(name)}
            className="flex-1 py-1.5 rounded-md text-[13px] transition-colors"
            style={{ background: account === name ? 'var(--raised)' : 'transparent', color: account === name ? 'var(--text)' : 'var(--muted)' }}>
            {ACCOUNT_LABEL[name]}
          </button>
        ))}
      </div>

      {/* Month tabs */}
      {availableMonths.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {availableMonths.map(ym => (
            <button key={ym} onClick={() => setSelectedMonth(ym)}
              className="px-3 py-1 rounded-full text-[11px] whitespace-nowrap border transition-colors"
              style={{
                background: selectedMonth === ym ? 'var(--accent)' : 'var(--surface)',
                borderColor: selectedMonth === ym ? 'var(--accent)' : 'var(--border)',
                color: selectedMonth === ym ? '#08080d' : 'var(--muted)',
              }}>
              {fmtMonthLabel(ym)}
            </button>
          ))}
        </div>
      )}

      {/* Strategy filter pills */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {['all', ...strategies.map(s => s.name)].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 rounded-full text-[11px] whitespace-nowrap border transition-colors"
            style={{
              background: filter === s ? 'var(--raised)' : 'var(--surface)',
              borderColor: filter === s ? 'var(--border2)' : 'var(--border)',
              color: filter === s ? 'var(--text)' : 'var(--muted)',
            }}>
            {s === 'all' ? '全部' : s}
          </button>
        ))}
        {account === 'tradovate' && (
          <button onClick={() => setShowForm(v => !v)}
            className="ml-auto px-3 py-1 rounded-full text-[11px] whitespace-nowrap border transition-colors"
            style={{ background: showForm ? 'var(--accent)' : 'var(--surface)', borderColor: showForm ? 'var(--accent)' : 'var(--border)', color: showForm ? '#08080d' : 'var(--muted)' }}>
            + 新增
          </button>
        )}
      </div>

      {/* Sort bar + batch toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px]" style={{ color: 'var(--muted)' }}>排序</span>
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'newest', label: '新→舊' },
            { key: 'oldest', label: '舊→新' },
            { key: 'best',   label: '盈利↓' },
            { key: 'worst',  label: '虧損↓' },
          ] as const).map(opt => (
            <button key={opt.key} onClick={() => setSort(opt.key)}
              className="px-2.5 py-0.5 rounded-full text-[11px] border transition-colors"
              style={{
                background: sort === opt.key ? 'var(--raised)' : 'transparent',
                borderColor: sort === opt.key ? 'var(--border2)' : 'var(--border)',
                color: sort === opt.key ? 'var(--text)' : 'var(--muted)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>

      </div>

      {/* Batch toolbar */}
      {batchMode && (
        <div className="rounded-[10px] p-3 mb-4 border flex items-center gap-2 flex-wrap"
          style={{ background: 'var(--raised)', borderColor: 'var(--border2)' }}>
          <button onClick={toggleSelectAll}
            className="text-[11px] px-2.5 py-1 rounded-md border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            {selectedIds.size === filtered.length && filtered.length > 0 ? '取消全選' : '全選本頁'}
          </button>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>已選 {selectedIds.size} 筆</span>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>套用：</span>
            {strategies.map(s => (
              <button key={s.id} onClick={() => handleBatchAssign(s.id)}
                disabled={selectedIds.size === 0}
                className="text-[11px] px-2.5 py-1 rounded-md border disabled:opacity-40"
                style={{
                  background: 'rgba(200,155,60,.12)',
                  borderColor: 'rgba(200,155,60,.25)',
                  color: 'var(--accent)',
                }}>
                {s.name}
              </button>
            ))}
            <button onClick={() => handleBatchAssign(null)}
              disabled={selectedIds.size === 0}
              className="text-[11px] px-2.5 py-1 rounded-md border disabled:opacity-40"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
              清除
            </button>
          </div>
        </div>
      )}

      {/* Manual add form */}
      {showForm && account === 'tradovate' && (
        <form onSubmit={handleAdd} className="rounded-[10px] p-4 mb-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>新增交易</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>合約</label>
              <input required value={form.symbol} onChange={e => setField('symbol', e.target.value)}
                placeholder="NQ, ES..."
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>方向</label>
              <select value={form.direction} onChange={e => setField('direction', e.target.value as 'long' | 'short')}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }}>
                <option value="long">多 Long</option>
                <option value="short">空 Short</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>開倉均價</label>
              <input type="number" step="any" value={form.entry_price} onChange={e => setField('entry_price', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>平倉均價</label>
              <input type="number" step="any" value={form.exit_price} onChange={e => setField('exit_price', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>開倉時間</label>
              <input type="datetime-local" value={form.entry_time} onChange={e => setField('entry_time', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>平倉時間</label>
              <input type="datetime-local" value={form.exit_time} onChange={e => setField('exit_time', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>數量</label>
              <input type="number" step="any" value={form.quantity} onChange={e => setField('quantity', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--muted)' }}>已實現盈虧 (USD)</label>
              <input type="number" step="any" value={form.pnl} onChange={e => setField('pnl', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] border outline-none"
                style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-lg text-[13px] font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#08080d' }}>
            {saving ? '新增中...' : '新增交易'}
          </button>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-[10px] p-8 border text-center text-[13px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
          {trades.length === 0
            ? (account === 'bingx' ? '回總覽頁按「同步」載入記錄' : '按「+ 新增」手動新增，或在設定頁上傳 CSV')
            : `${fmtMonthLabel(selectedMonth)} 此策略無交易記錄`}
        </div>
      ) : (
        filtered.map(t => batchMode ? (
          <div key={t.id}
            onClick={() => toggleSelect(t.id)}
            className="cursor-pointer relative"
            style={{
              borderRadius: '10px',
              outline: selectedIds.has(t.id) ? '2px solid var(--accent)' : 'none',
              outlineOffset: '-1px',
            }}>
            {selectedIds.has(t.id) && (
              <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold z-10"
                style={{ background: 'var(--accent)', color: '#08080d' }}>✓</div>
            )}
            <div className="pointer-events-none">
              <TradeItem trade={t} />
            </div>
          </div>
        ) : (
          <TradeItem key={t.id} trade={t}
            strategies={strategies}
            onAssignStrategy={handleAssignSingle} />
        ))
      )}
    </div>
  )
}
