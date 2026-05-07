import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

type Row = Record<string, string>

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return Response.json({ message: '沒有收到檔案' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  let data: Row[]
  try {
    const wb = XLSX.read(buffer, { type: 'array', raw: false, dense: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    data = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' })
  } catch {
    return Response.json({ message: '無法解析檔案，請確認是 BingX Order History 匯出格式' }, { status: 400 })
  }

  if (!data.length) return Response.json({ message: '檔案無資料' }, { status: 400 })

  // Verify it looks like BingX format
  const firstRow = data[0]
  if (!('Pair' in firstRow) || !('Type' in firstRow)) {
    return Response.json({ message: `格式不符，找到欄位：${Object.keys(firstRow).join(', ')}` }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: accData } = await sb.from('accounts').select('id').eq('name', 'bingx').single()
  if (!accData) return Response.json({ message: '找不到 BingX 帳戶' }, { status: 500 })
  const accId = (accData as { id: string }).id

  // Sort ascending by time
  const sorted = [...data].sort((a, b) =>
    new Date(a['Time(UTC+8)'] ?? '').getTime() - new Date(b['Time(UTC+8)'] ?? '').getTime()
  ).map((row, idx) => ({ row, idx }))

  const usedOpens = new Set<number>()
  const rows: Record<string, unknown>[] = []

  function matchAndBuild(
    closes: typeof sorted,
    opens: typeof sorted,
    direction: 'long' | 'short'
  ) {
    for (const { row: close } of closes) {
      const closeTime = new Date(close['Time(UTC+8)']).getTime()
      const pair = (close['Pair'] ?? '').trim()

      const candidates = opens.filter(({ row: open, idx }) => {
        if (usedOpens.has(idx)) return false
        if ((open['Pair'] ?? '').trim() !== pair) return false
        return new Date(open['Time(UTC+8)']).getTime() <= closeTime
      })
      const match = candidates[candidates.length - 1]
      if (!match) continue
      usedOpens.add(match.idx)

      // realized PnL = gross PnL (Realized PNL col) + close fee + open fee (fees are negative)
      const pnl =
        parseFloat(close['Realized PNL'] || '0') +
        parseFloat(close['Fee'] || '0') +
        parseFloat(match.row['Fee'] || '0')

      rows.push({
        account_id: accId,
        external_id: `xlsx-${close['Order No.']}`,
        symbol: pair.replace('-', '/'),
        direction,
        entry_price: parseFloat(match.row['AvgPrice'] || match.row['DealPrice'] || '0') || null,
        exit_price: parseFloat(close['AvgPrice'] || close['DealPrice'] || '0') || null,
        entry_time: new Date(match.row['Time(UTC+8)']).toISOString(),
        exit_time: new Date(close['Time(UTC+8)']).toISOString(),
        quantity: parseFloat(close['Quantity'] || '0') || null,
        pnl: pnl,
      })
    }
  }

  matchAndBuild(
    sorted.filter(({ row }) => (row['Type'] ?? '').trim() === 'Close Long'),
    sorted.filter(({ row }) => (row['Type'] ?? '').trim() === 'Open Long'),
    'long'
  )
  matchAndBuild(
    sorted.filter(({ row }) => (row['Type'] ?? '').trim() === 'Close Short'),
    sorted.filter(({ row }) => (row['Type'] ?? '').trim() === 'Open Short'),
    'short'
  )

  if (!rows.length) {
    return Response.json({ message: '找不到配對的交易（Open/Close 需在同一檔案中）' }, { status: 400 })
  }

  // ignoreDuplicates: false → update existing records (corrects wrong pnl values)
  // Only data fields are in rows — notes/strategy/rr are preserved automatically
  const { data: upserted, error } = await sb
    .from('trades')
    .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false })
    .select()
  if (error) return Response.json({ message: `寫入失敗: ${error.message}` }, { status: 500 })
  return Response.json({ message: `匯入完成，處理 ${upserted?.length ?? 0} 筆` })
}
