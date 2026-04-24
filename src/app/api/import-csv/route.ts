import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

// Lucid prop firm implied commission per contract per side
const FEE_PER_LOT_PER_SIDE = 0.5248

// Micro/mini futures point values (USD per point)
const POINT_VALUES: Record<string, number> = {
  MNQ: 2,    // Micro Nasdaq-100
  MES: 5,    // Micro S&P 500
  MGC: 10,   // Micro Gold
  MYM: 0.5,  // Micro Dow
  NQ:  20,   // Full Nasdaq-100
  ES:  50,   // Full S&P 500
  GC:  100,  // Full Gold
  YM:  5,    // Full Dow
}

function getPointValue(symbol: string): number {
  for (const [prefix, val] of Object.entries(POINT_VALUES)) {
    if (symbol.toUpperCase().startsWith(prefix)) return val
  }
  return 1
}

// This route is TRADOVATE ONLY — FIFO logic, dedup, and $0.5248 fee apply exclusively here.
// BingX trades are managed by /api/bingx-sync; never run BingX CSVs through this route.
export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return Response.json({ message: '沒有收到檔案' }, { status: 400 })

  const text = await file.text()
  const { data, errors } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })

  if (errors.length && data.length === 0) {
    return Response.json({ message: 'CSV 解析失敗' }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: acc } = await sb.from('accounts').select('id').eq('name', 'tradovate').single()
  if (!acc) return Response.json({ message: '找不到 Tradovate 帳戶' }, { status: 500 })

  const cols = data.length > 0 ? Object.keys(data[0]) : []
  const isTradovateFills = cols.includes('B/S') && cols.includes('Contract') && cols.includes('Fill Time')

  if (!isTradovateFills) {
    const foundCols = cols.join(', ')
    return Response.json({ message: `CSV 格式不符。找到欄位：${foundCols}。需要 B/S, Contract, Fill Time 欄位。` }, { status: 400 })
  }

  // ── 1. Filter filled rows ───────────────────────────────────────────────────
  const filled = data.filter(row => {
    const status = (row['Status'] ?? '').trim().toLowerCase()
    const qty = parseFloat(row['filledQty'] ?? row['Filled Qty'] ?? '0')
    return status === 'filled' && qty > 0
  })

  if (filled.length === 0) {
    return Response.json({ message: 'CSV 內沒有 Status=filled 的成交紀錄' }, { status: 400 })
  }

  // ── 2. Deduplicate: same contract+BS+time(to second)+price → sum qty ────────
  type Fill = { contract: string; bs: string; time: Date; price: number; qty: number; timeIso: string }
  const dedupMap = new Map<string, Fill>()

  for (const row of filled) {
    const contract = (row['Contract'] ?? '').trim()
    if (!contract) continue
    const bs = (row['B/S'] ?? '').trim().toUpperCase()
    const timeStr = row['Fill Time'] ?? ''
    const price = parseFloat(row['avgPrice'] ?? row['Avg Fill Price'] ?? '0')
    const qty = parseFloat(row['filledQty'] ?? row['Filled Qty'] ?? '0')
    if (!timeStr || !price || !qty) continue

    const t = new Date(timeStr)
    // Round to nearest second for dedup key
    const secKey = `${contract}|${bs}|${Math.round(t.getTime() / 1000)}|${price}`
    const existing = dedupMap.get(secKey)
    if (existing) {
      existing.qty += qty
    } else {
      dedupMap.set(secKey, { contract, bs, time: t, price, qty, timeIso: t.toISOString() })
    }
  }

  const fills = [...dedupMap.values()].sort((a, b) => a.time.getTime() - b.time.getTime())

  // ── 3. Group by contract ────────────────────────────────────────────────────
  const byContract = new Map<string, Fill[]>()
  for (const f of fills) {
    if (!byContract.has(f.contract)) byContract.set(f.contract, [])
    byContract.get(f.contract)!.push(f)
  }

  // ── 4. FIFO matching per contract ───────────────────────────────────────────
  type TradeRow = {
    account_id: string; external_id: string; symbol: string; direction: string
    entry_price: number; exit_price: number; entry_time: string; exit_time: string
    quantity: number; pnl: number
  }
  const trades: TradeRow[] = []

  for (const [contract, contractFills] of byContract) {
    const pv = getPointValue(contract)
    type Lot = { price: number; qty: number; time: string }
    const openLots: Lot[] = []
    let position: 'flat' | 'long' | 'short' = 'flat'

    for (const fill of contractFills) {
      const isLongSide = fill.bs === 'B' || fill.bs === 'BUY'

      if (position === 'flat') {
        openLots.push({ price: fill.price, qty: fill.qty, time: fill.timeIso })
        position = isLongSide ? 'long' : 'short'
        continue
      }

      const addingToPosition = (position === 'long' && isLongSide) || (position === 'short' && !isLongSide)

      if (addingToPosition) {
        openLots.push({ price: fill.price, qty: fill.qty, time: fill.timeIso })
        continue
      }

      // Closing (or reversing) the position
      let remaining = fill.qty
      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0]
        const closedQty = Math.min(remaining, lot.qty)

        const entryPrice = position === 'long' ? lot.price : fill.price
        const exitPrice  = position === 'long' ? fill.price : lot.price
        const entryTime  = position === 'long' ? lot.time   : fill.timeIso
        const exitTime   = position === 'long' ? fill.timeIso : lot.time

        const grossPnl = (position === 'long' ? 1 : -1) * (exitPrice - entryPrice) * closedQty * pv
        const fee      = closedQty * FEE_PER_LOT_PER_SIDE * 2
        const netPnl   = Math.round((grossPnl - fee) * 100) / 100

        // Stable external_id: contract + entry_time_ms + exit_time_ms + side + qty
        const extId = `tv4-${contract}-${new Date(entryTime).getTime()}-${new Date(exitTime).getTime()}-${position}-${Math.round(closedQty * 1000)}`

        trades.push({
          account_id: acc.id,
          external_id: extId,
          symbol: contract,
          direction: position,
          entry_price: entryPrice,
          exit_price: exitPrice,
          entry_time: entryTime,
          exit_time: exitTime,
          quantity: closedQty,
          pnl: netPnl,
        })

        lot.qty -= closedQty
        if (lot.qty <= 0) openLots.shift()
        remaining -= closedQty
      }

      if (remaining > 0) {
        // Reversal: start new position in opposite direction
        position = position === 'long' ? 'short' : 'long'
        openLots.length = 0
        openLots.push({ price: fill.price, qty: remaining, time: fill.timeIso })
      } else if (openLots.length === 0) {
        position = 'flat'
      }
    }
  }

  const validTrades = trades.filter(t =>
    t.symbol && t.symbol.trim() !== '' &&
    t.pnl !== null && t.pnl !== undefined && !isNaN(t.pnl)
  )

  if (validTrades.length === 0) {
    return Response.json({ message: 'CSV 有讀到資料，但沒有配對到完整的開倉＋平倉紀錄' }, { status: 400 })
  }

  const { data: inserted, error } = await sb.from('trades')
    .upsert(validTrades, { onConflict: 'external_id', ignoreDuplicates: true })
    .select()

  if (error) return Response.json({ message: `寫入失敗: ${error.message}` }, { status: 500 })

  const newCount = inserted?.length ?? 0
  const totalGross = validTrades.reduce((s, t) => s + t.pnl, 0)
  return Response.json({
    message: `匯入完成，新增 ${newCount} 筆（共 ${validTrades.length} 筆配對，淨利 $${totalGross.toFixed(2)}，已含手續費扣除）`
  })
}
