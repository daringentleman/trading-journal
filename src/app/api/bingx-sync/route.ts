import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const BINGX_BASE = 'https://open-api.bingx.com'

function sign(params: Record<string, string>, secret: string) {
  const query = Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&')
  const sig = crypto.createHmac('sha256', secret).update(query).digest('hex')
  return `${query}&signature=${sig}`
}

type Fill = {
  symbol: string; side: string; positionSide: string
  price: string; qty: string; realisedPNL: string
  commission: string; filledTime: string; tradeId: string; orderId: string
}

function isOpenFill(f: Fill) {
  return (f.side === 'BUY' && f.positionSide === 'LONG') ||
    (f.side === 'SELL' && f.positionSide === 'SHORT')
}
function isCloseFill(f: Fill) {
  return (f.side === 'SELL' && f.positionSide === 'LONG') ||
    (f.side === 'BUY' && f.positionSide === 'SHORT')
}

async function fetchFills(secret: string, apiKey: string): Promise<Fill[]> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const qs = sign({ timestamp: Date.now().toString(), recvWindow: '5000', startTime: startOfMonth.toString(), limit: '100' }, secret)
  const res = await fetch(`${BINGX_BASE}/openApi/swap/v2/trade/fillHistory?${qs}`, {
    headers: { 'X-BX-APIKEY': apiKey },
  })
  if (!res.ok) return []
  const json = await res.json()
  return json?.data?.fill_history_orders ?? []
}

export async function POST() {
  const apiKey = process.env.BINGX_API_KEY
  const secret = process.env.BINGX_SECRET_KEY

  if (!apiKey || !secret) {
    return Response.json({ message: '尚未設定 BingX API Key' }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: acc } = await sb.from('accounts').select('id').eq('name', 'bingx').single()
  if (!acc) return Response.json({ message: '找不到 BingX 帳戶' }, { status: 500 })

  const fills = await fetchFills(secret, apiKey)

  const opens = fills.filter(isOpenFill).sort((a, b) =>
    new Date(a.filledTime).getTime() - new Date(b.filledTime).getTime()
  )
  const closes = fills.filter(isCloseFill).sort((a, b) =>
    new Date(a.filledTime).getTime() - new Date(b.filledTime).getTime()
  )

  // FIFO match: each close finds its open fills by symbol + positionSide + time order
  const usedOpenOrderIds = new Set<string>()
  const rows: Record<string, unknown>[] = []

  for (const close of closes) {
    const closeTimeMs = new Date(close.filledTime).getTime()
    const matchingOpens = opens.filter(o =>
      o.symbol === close.symbol &&
      o.positionSide === close.positionSide &&
      new Date(o.filledTime).getTime() <= closeTimeMs &&
      !usedOpenOrderIds.has(o.orderId)
    )
    if (!matchingOpens.length) continue

    let totalQty = 0, weightedSum = 0
    for (const o of matchingOpens) {
      const q = parseFloat(o.qty)
      totalQty += q
      weightedSum += parseFloat(o.price) * q
      usedOpenOrderIds.add(o.orderId)
    }

    // Use orderId (= Excel Order No.) as external_id — matches xlsx import format exactly.
    // upsert will skip this row if it was already imported via xlsx.
    rows.push({
      account_id: acc.id,
      external_id: `xlsx-${close.orderId}`,
      symbol: close.symbol.replace('-', '/'),
      direction: close.positionSide === 'LONG' ? 'long' : 'short',
      entry_price: Math.round(weightedSum / totalQty * 100000) / 100000,
      exit_price: parseFloat(close.price),
      entry_time: new Date(matchingOpens[0].filledTime).toISOString(),
      exit_time: new Date(close.filledTime).toISOString(),
      quantity: parseFloat(close.qty),
      pnl: Math.round(parseFloat(close.realisedPNL) * 100) / 100,
    })
  }

  const validRows = rows.filter(r =>
    r.symbol && (r.symbol as string).trim() !== '' &&
    r.pnl !== null && r.pnl !== undefined && !isNaN(r.pnl as number) &&
    r.entry_price !== null && r.exit_price !== null
  )

  if (!validRows.length) {
    return Response.json({ message: '沒有新交易', added: 0 })
  }

  // Incremental upsert: existing xlsx-{orderId} records are skipped automatically
  const { data: inserted, error } = await sb.from('trades')
    .upsert(validRows, { onConflict: 'external_id', ignoreDuplicates: true })
    .select()
  if (error) return Response.json({ message: `寫入失敗: ${error.message}` }, { status: 500 })

  const newCount = inserted?.length ?? 0
  return Response.json({ message: `同步完成，新增 ${newCount} 筆`, added: newCount })
}
