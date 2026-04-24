'use client'

import { useState } from 'react'
import type { Trade } from '@/lib/types'

function parseUrls(raw?: string): string[] {
  if (!raw) return []
  if (raw.trimStart().startsWith('[')) {
    try { return JSON.parse(raw) } catch { /* fall through */ }
  }
  return [raw]
}

async function getSb() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function KLineChart({ trade }: { trade: Trade }) {
  const [urls, setUrls] = useState<string[]>(() => parseUrls(trade.chart_image_url))
  const [uploading, setUploading] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setErrMsg('')
    try {
      const sb = await getSb()
      const ext = file.name.split('.').pop()
      const path = `charts/${trade.id}-${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('trade-charts').upload(path, file)
      if (upErr) throw new Error(upErr.message)
      const { data } = sb.storage.from('trade-charts').getPublicUrl(path)
      const newUrls = [...urls, data.publicUrl]
      const { error: dbErr } = await sb.from('trades')
        .update({ chart_image_url: JSON.stringify(newUrls) })
        .eq('id', trade.id)
      if (dbErr) throw new Error(dbErr.message)
      setUrls(newUrls)
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(url: string) {
    setErrMsg('')
    try {
      const sb = await getSb()
      // Extract path after bucket name: .../trade-charts/charts/xxx.jpg → charts/xxx.jpg
      const match = url.match(/\/trade-charts\/(.+?)(\?.*)?$/)
      if (match?.[1]) {
        await sb.storage.from('trade-charts').remove([match[1]])
      }
      const newUrls = urls.filter(u => u !== url)
      await sb.from('trades')
        .update({ chart_image_url: newUrls.length ? JSON.stringify(newUrls) : null })
        .eq('id', trade.id)
      setUrls(newUrls)
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '刪除失敗')
    }
  }

  return (
    <div className="space-y-3">
      {urls.map((url, i) => (
        <div key={url} className="relative">
          <img src={url} alt={`截圖 ${i + 1}`} className="w-full rounded-lg" />
          <button
            onClick={() => handleDelete(url)}
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold"
            style={{ background: 'rgba(185,28,28,.85)', color: '#fff' }}
            title="刪除此圖"
          >
            ×
          </button>
        </div>
      ))}

      <label
        className="flex items-center gap-2 px-4 py-3 rounded-[10px] border-2 border-dashed cursor-pointer"
        style={{ borderColor: 'var(--border2)', color: 'var(--muted)' }}
      >
        <span className="text-[18px]">📷</span>
        <span className="text-[12px]">
          {uploading ? '上傳中...' : urls.length > 0 ? '再新增一張截圖' : '上傳 K 線截圖'}
        </span>
        <input
          type="file" accept="image/*" className="hidden"
          onChange={handleUpload} disabled={uploading}
        />
      </label>

      {errMsg && (
        <p className="text-[11px]" style={{ color: 'var(--loss)' }}>{errMsg}</p>
      )}
    </div>
  )
}
