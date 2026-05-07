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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// Slide a 7-day window from startTime → now, paginating within each window.
// BingX fillHistory caps at 1000 fills per request and ~7d span per query.
async function fetchAllFills(secret: string, apiKey: string, startTime: number): Promise<Fill[]> {
  const all: Fill[] = []
  const seen = new Set<string>()
  const now = Date.now()
  let windowStart = startTime
  const MAX_WINDOWS = 100
  const MAX_PAGES_PER_WINDOW = 20

  for (let w = 0; w < MAX_WINDOWS && windowStart < now; w++) {
    const windowEnd = Math.min(windowStart + SEVEN_DAYS_MS, now)
    let cursor = windowStart

    for (let p = 0; p < MAX_PAGES_PER_WINDOW; p++) {
      const qs = sign({
        timestamp: Date.now().toString(),
        recvWindow: '5000',
        startTime: cursor.toString(),
        endTime: windowEnd.toString(),
        limit: '1000',
      }, secret)
      const res = await fetch(`${BINGX_BASE}/openApi/swap/v2/trade/fillHistory?${qs}`, {
        headers: { 'X-BX-APIKEY': apiKey },
      })
      if (!res.ok) {
        console.warn(`[bingx-sync] fetch failed: ${res.status} ${res.statusText}`)
        break
      }
      const json = await res.json()
      const batch: Fill[] = json?.data?.fill_history_orders ?? []
      if (!batch.length) break

      for (const f of batch) {
        const k = f.tradeId || f.orderId
        if (k && !seen.has(k)) { seen.add(k); all.push(f) }
      }

      if (batch.length < 1000) break
      const latestMs = Math.max(...batch.map(f => new Date(f.filledTime).getTime()))
      if (latestMs <= cursor) break
      cursor = latestMs
    }

    windowStart = windowEnd + 1
  }

  console.log(`[bingx-sync] fetched ${all.length} fills from ${new Date(startTime).toISOString()} → now`)
  return all
}

async function syncHandler() {
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

  // Start from latest known exit_time minus 7d buffer (covers cross-window opens).
  // First-time sync (no trades yet) falls back to 30 days ago.
  const { data: lastTrade } = await sb.from('trades')
    .select('exit_time')
    .eq('account_id', acc.id)
    .not('exit_time', 'is', null)
    .order('exit_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startTime = lastTrade?.exit_time
    ? new Date(lastTrade.exit_time).getTime() - SEVEN_DAYS_MS
    : Date.now() - 30 * 24 * 60 * 60 * 1000

  const fills = await fetchAllFills(secret, apiKey, startTime)

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

    // realized PnL = price PnL + commissions (commissions are negative in BingX API)
    const totalCommission =
      parseFloat(close.commission ?? '0') +
      matchingOpens.reduce((s, o) => s + parseFloat(o.commission ?? '0'), 0)

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
      pnl: parseFloat(close.realisedPNL) + totalCommission,
    })
  }

  const validRows = rows.filter(r =>
    r.symbol && (r.symbol as string).trim() !== '' &&
    r.pnl !== null && r.pnl !== undefined && !isNaN(r.pnl as number) &&
    r.entry_price !== null && r.exit_price !== null
  )

  if (!validRows.length) {
    return Response.json({
      message: '沒有可配對的交易',
      added: 0,
      fillsScanned: fills.length,
      startTime: new Date(startTime).toISOString(),
    })
  }

  // Compute newCount by diffing existing external_ids before upsert.
  const incomingIds = validRows.map(r => r.external_id as string)
  const { data: existing } = await sb.from('trades')
    .select('external_id')
    .in('external_id', incomingIds)
  const existingIds = new Set((existing ?? []).map(r => r.external_id))
  const newCount = incomingIds.filter(id => !existingIds.has(id)).length

  // Upsert: update price/pnl fields on conflict, preserve user-added notes/strategy/rr
  const { error } = await sb.from('trades')
    .upsert(validRows, { onConflict: 'external_id', ignoreDuplicates: false })
  if (error) return Response.json({ message: `寫入失敗: ${error.message}` }, { status: 500 })

  console.log(`[bingx-sync] fills=${fills.length} matched=${validRows.length} new=${newCount}`)
  return Response.json({
    message: `同步完成，新增 ${newCount} 筆（掃描 ${fills.length} 筆 fills，配對 ${validRows.length} 筆交易）`,
    added: newCount,
    fillsScanned: fills.length,
    tradesMatched: validRows.length,
    startTime: new Date(startTime).toISOString(),
  })
}

export function POST() { return syncHandler() }

export function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ message: 'Unauthorized' }, { status: 401 })
  }
  return syncHandler()
}
