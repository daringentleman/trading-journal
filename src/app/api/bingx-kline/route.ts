import crypto from 'crypto'
import type { NextRequest } from 'next/server'

const BINGX_BASE = 'https://open-api.bingx.com'

function sign(params: Record<string, string>, secret: string) {
  const query = Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&')
  const sig = crypto.createHmac('sha256', secret).update(query).digest('hex')
  return `${query}&signature=${sig}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const symbol = searchParams.get('symbol')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const interval = searchParams.get('interval') ?? '5m'

  if (!symbol || !start || !end) {
    return Response.json({ error: 'missing params' }, { status: 400 })
  }

  const apiKey = process.env.BINGX_API_KEY
  const secret = process.env.BINGX_SECRET_KEY
  if (!apiKey || !secret) {
    return Response.json({ error: 'no api key' }, { status: 400 })
  }

  const bxSymbol = symbol.replace('/', '-')
  const params: Record<string, string> = {
    symbol: bxSymbol,
    interval,
    startTime: start,
    endTime: end,
    limit: '200',
    timestamp: Date.now().toString(),
  }
  const qs = sign(params, secret)

  const res = await fetch(`${BINGX_BASE}/openApi/swap/v3/quote/klines?${qs}`, {
    headers: { 'X-BX-APIKEY': apiKey },
  })

  if (!res.ok) return Response.json({ error: await res.text() }, { status: 500 })

  const json = await res.json()
  // BingX kline format: [[time, open, high, low, close, volume], ...]
  return Response.json(json?.data ?? [])
}
