'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Account, Strategy } from '@/lib/types'

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [strategies, setStrategies] = useState<{ [key: string]: Strategy[] }>({ bingx: [], tradovate: [] })
  const [newLabel, setNewLabel] = useState<{ [key: string]: string }>({ bingx: '', tradovate: '' })
  const [saving, setSaving] = useState(false)
  const [csvStatus, setCsvStatus] = useState('')
  const [bingxCsvStatus, setBingxCsvStatus] = useState('')

  useEffect(() => {
    supabase.from('accounts').select('*').then(({ data }) => {
      if (!data) return
      setAccounts(data as Account[])
      for (const acc of data as Account[]) {
        supabase.from('strategies').select('*').eq('account_id', acc.id).order('sort_order')
          .then(({ data: strats }) => {
            if (strats) setStrategies(p => ({ ...p, [acc.name]: strats as Strategy[] }))
          })
      }
    })
  }, [])

  async function saveAccount(acc: Account) {
    setSaving(true)
    await supabase.from('accounts').update({
      initial_capital: acc.initial_capital,
      risk_percent: acc.risk_percent,
    }).eq('id', acc.id)
    setSaving(false)
  }

  function updateAccount(id: string, field: keyof Account, value: number) {
    setAccounts(p => p.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  async function addStrategy(accName: 'bingx' | 'tradovate') {
    const name = newLabel[accName]?.trim()
    if (!name) return
    const acc = accounts.find(a => a.name === accName)
    if (!acc) return
    const maxOrder = Math.max(0, ...strategies[accName].map(s => s.sort_order))
    const { data } = await supabase.from('strategies').insert({
      account_id: acc.id, name, sort_order: maxOrder + 1,
    }).select().single()
    if (data) setStrategies(p => ({ ...p, [accName]: [...p[accName], data as Strategy] }))
    setNewLabel(p => ({ ...p, [accName]: '' }))
  }

  async function removeStrategy(accName: string, id: string) {
    await supabase.from('strategies').delete().eq('id', id)
    setStrategies(p => ({ ...p, [accName]: p[accName].filter(s => s.id !== id) }))
  }

  async function handleBingxCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBingxCsvStatus('解析中...')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/import-bingx-csv', { method: 'POST', body: form })
    const json = await res.json()
    setBingxCsvStatus(json.message ?? (res.ok ? '匯入完成' : '匯入失敗'))
    e.target.value = ''
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvStatus('解析中...')
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/import-csv', { method: 'POST', body: form })
    const json = await res.json()
    setCsvStatus(json.message ?? (res.ok ? '匯入完成' : '匯入失敗'))
    e.target.value = ''
  }

  const bingxAcc = accounts.find(a => a.name === 'bingx')
  const tvAcc = accounts.find(a => a.name === 'tradovate')

  function StrategyCard({ accName }: { accName: 'bingx' | 'tradovate' }) {
    return (
      <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>策略標籤</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {strategies[accName].map(s => (
            <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px]"
              style={{ background: 'var(--raised)', borderColor: 'var(--border)' }}>
              {s.name}
              <button onClick={() => removeStrategy(accName, s.id)}
                className="transition-colors hover:text-[var(--loss)]"
                style={{ color: 'var(--muted2)', lineHeight: 1, fontSize: '15px' }}>×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newLabel[accName] ?? ''}
            onChange={e => setNewLabel(p => ({ ...p, [accName]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addStrategy(accName)}
            placeholder="新增策略名稱..."
            className="flex-1 rounded-lg px-3 py-2 text-[13px] border outline-none"
            style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }}
          />
          <button onClick={() => addStrategy(accName)}
            className="px-4 py-2 rounded-lg text-[13px] font-medium"
            style={{ background: 'var(--accent)', color: '#08080d' }}>+</button>
        </div>
      </div>
    )
  }

  function CapitalCard({ acc }: { acc: Account }) {
    const riskAmt = (acc.initial_capital * acc.risk_percent) / 100
    return (
      <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>本金 & 風險</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--muted)' }}>起始本金 (U)</label>
            <input type="number" value={acc.initial_capital}
              onChange={e => updateAccount(acc.id, 'initial_capital', parseFloat(e.target.value))}
              className="w-full rounded-lg px-3 py-2 text-[14px] border outline-none"
              style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide mb-1.5 block" style={{ color: 'var(--muted)' }}>每筆風險 %</label>
            <input type="number" step="0.1" min="0.1" max="10" value={acc.risk_percent}
              onChange={e => updateAccount(acc.id, 'risk_percent', parseFloat(e.target.value))}
              className="w-full rounded-lg px-3 py-2 text-[14px] border outline-none"
              style={{ background: 'var(--raised)', borderColor: 'var(--border2)', color: 'var(--text)' }} />
          </div>
        </div>
        <div className="flex justify-between items-center rounded-lg px-3 py-2.5 mb-3" style={{ background: 'var(--raised)' }}>
          <span className="text-[12px]" style={{ color: 'var(--muted)' }}>每筆可虧損</span>
          <span className="text-[15px] font-semibold" style={{ color: '#f59e0b' }}>${riskAmt.toFixed(0)}</span>
        </div>
        <button onClick={() => saveAccount(acc)} disabled={saving}
          className="w-full py-2.5 rounded-lg text-[13px] font-medium disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#08080d' }}>
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-5 md:px-8 md:py-7">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <h1 className="retro-display retro-distressed fs-display md:text-[72px]">SETTINGS</h1>
          <div className="fs-meta" style={{ color: 'var(--muted)' }}>設定</div>
        </div>
        <div className="retro-divider" />
      </header>

      {/* BingX API — full width */}
      <div className="rounded-[10px] p-4 mb-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>BingX API（唯讀）</div>
        <p className="text-[12px] mb-3" style={{ color: 'var(--muted)' }}>
          API Key 存在伺服器環境變數，安全性最高。如需更換請修改 Vercel 環境變數後重新部署。
        </p>
        <div className="rounded-lg px-3 py-2.5 text-[12px]" style={{ background: 'var(--raised)', color: 'var(--muted)' }}>
          API Key：••••••••••••（已設定）
        </div>
      </div>

      {/* Desktop 2-col: BingX left | Tradovate right */}
      <div className="md:grid md:grid-cols-2 md:gap-6">
        {/* BingX column */}
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-3 font-medium" style={{ color: 'var(--accent)' }}>Crypto · BingX</div>

          {/* BingX CSV */}
          <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>歷史訂單匯入</div>
            <p className="text-[12px] mb-3" style={{ color: 'var(--muted)' }}>
              BingX App → 合約 → 訂單 → 歷史委託 → 匯出（.xlsx）。適用於 7 天外的舊交易。
            </p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-[10px] border cursor-pointer text-[13px] transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)', color: bingxCsvStatus.includes('失敗') ? 'var(--loss)' : bingxCsvStatus.includes('完成') ? 'var(--profit)' : 'var(--muted)' }}>
              <span>📂</span>
              {bingxCsvStatus || '上傳 BingX Order History'}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleBingxCsv} />
            </label>
          </div>

          <StrategyCard accName="bingx" />
          {bingxAcc && <CapitalCard acc={bingxAcc} />}
        </div>

        {/* Tradovate column */}
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-3 font-medium" style={{ color: 'var(--accent)' }}>Prop Firm · Tradovate</div>

          {/* Tradovate CSV */}
          <div className="rounded-[10px] p-4 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>CSV 匯入</div>
            <p className="text-[12px] mb-3" style={{ color: 'var(--muted)' }}>從 Tradovate 後台匯出 CSV，上傳後自動解析 FIFO 配對並扣除手續費。</p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-[10px] border cursor-pointer text-[13px] transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)', color: csvStatus.includes('失敗') ? 'var(--loss)' : csvStatus.includes('完成') ? 'var(--profit)' : 'var(--muted)' }}>
              <span>📂</span>
              {csvStatus || '上傳 CSV 檔案'}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsv} />
            </label>
          </div>

          <StrategyCard accName="tradovate" />
          {tvAcc && <CapitalCard acc={tvAcc} />}
        </div>
      </div>
    </div>
  )
}
