'use client'

import { useState, useRef } from 'react'
import type { Trade } from '@/lib/types'
import RetroDatePicker from './RetroDatePicker'

interface Props {
  trades: Trade[]
  initialCapital: number
}

type Range = '7d' | '30d' | '60d' | '90d' | 'custom'
const RANGES: { key: Range; label: string; days?: number }[] = [
  { key: '7d',  label: '7天',  days: 7 },
  { key: '30d', label: '30天', days: 30 },
  { key: '60d', label: '60天', days: 60 },
  { key: '90d', label: '90天', days: 90 },
  { key: 'custom', label: '自訂' },
]

function todayISO(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateStrToMs(s: string, edge: 'start' | 'end'): number {
  const [y, m, d] = s.split('-').map(Number)
  return edge === 'start'
    ? new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
    : new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

function fmtAxis(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtDay(day: string): string {
  if (day === 'now') return '現在'
  const parts = day.split('-')
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

function fmtDelta(delta: number): string {
  if (delta === 0) return ''
  return (delta > 0 ? '+' : '') + '$' + delta.toFixed(1)
}

// Catmull-Rom → cubic Bezier smoothing. Tension 6 = soft curve, no overshoot in equity data.
// Control points are clamped on BOTH axes to the segment range:
//   - X clamp prevents axis folding when X spacing is uneven.
//   - Y clamp keeps each segment monotone in Y, eliminating overshoot when the
//     curve approaches/leaves a horizontal section (e.g. last trade → "now" tail).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`
  const t = 6
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    let c1x = p1.x + (p2.x - p0.x) / t
    let c1y = p1.y + (p2.y - p0.y) / t
    let c2x = p2.x - (p3.x - p1.x) / t
    let c2y = p2.y - (p3.y - p1.y) / t
    if (c1x < p1.x) c1x = p1.x
    if (c1x > p2.x) c1x = p2.x
    if (c2x < p1.x) c2x = p1.x
    if (c2x > p2.x) c2x = p2.x
    const yMin = Math.min(p1.y, p2.y)
    const yMax = Math.max(p1.y, p2.y)
    if (c1y < yMin) c1y = yMin
    if (c1y > yMax) c1y = yMax
    if (c2y < yMin) c2y = yMin
    if (c2y > yMax) c2y = yMax
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return d
}

export default function EquityChart({ trades, initialCapital }: Props) {
  const [range, setRange] = useState<Range>('90d')
  const [customFrom, setCustomFrom] = useState<string>(() => todayISO(-30))
  const [customTo, setCustomTo] = useState<string>(() => todayISO(0))
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Range bounds: custom uses user-picked dates, otherwise lookback from now.
  const { startMs, endMs, isCustom } = (() => {
    if (range === 'custom') {
      return {
        startMs: dateStrToMs(customFrom, 'start'),
        endMs: dateStrToMs(customTo, 'end'),
        isCustom: true,
      }
    }
    const days = RANGES.find(r => r.key === range)!.days!
    return { startMs: Date.now() - days * 86400000, endMs: Date.now(), isCustom: false }
  })()

  // Sort all trades by exit/entry time
  const allSorted = [...trades]
    .filter(t => t.exit_time || t.entry_time)
    .sort((a, b) =>
      new Date(a.exit_time ?? a.entry_time!).getTime() -
      new Date(b.exit_time ?? b.entry_time!).getTime()
    )

  // Equity at start of range = initialCapital + PnL from all prior trades
  const startEquity = initialCapital + allSorted
    .filter(t => new Date(t.exit_time ?? t.entry_time!).getTime() < startMs)
    .reduce((s, t) => s + (t.pnl ?? 0), 0)

  const rangeTrades = allSorted.filter(t => {
    const ts = new Date(t.exit_time ?? t.entry_time!).getTime()
    return ts >= startMs && ts <= endMs
  })

  // Daily PnL map
  const dailyPnl: Record<string, number> = {}
  for (const t of rangeTrades) {
    const day = new Date(t.exit_time ?? t.entry_time!).toLocaleDateString('en-CA')
    dailyPnl[day] = (dailyPnl[day] ?? 0) + (t.pnl ?? 0)
  }

  const points: { day: string; equity: number; delta: number }[] = []
  let equity = startEquity
  const seen = new Set<string>()

  for (const t of rangeTrades) {
    const day = new Date(t.exit_time ?? t.entry_time!).toLocaleDateString('en-CA')
    if (!seen.has(day)) {
      seen.add(day)
      points.push({ day, equity, delta: dailyPnl[day] ?? 0 })
    }
    equity += t.pnl ?? 0
  }
  // Right-edge label: 'now' for relative ranges, the picked end date for custom.
  points.push({ day: isCustom ? customTo : 'now', equity, delta: 0 })

  // Layout
  const ML = 46
  const MB = 20
  const PT = 6
  const CW = 330
  const CH = 74
  const TW = ML + CW
  const TH = PT + CH + MB

  const chartContent = (() => {
    if (points.length < 2) return null

    const allEquities = points.map(p => p.equity)
    const dataMin = Math.min(...allEquities)
    const dataMax = Math.max(...allEquities)
    // Relative padding: 30% of data range, minimum 10 — keeps small accounts readable
    const pad = Math.max((dataMax - dataMin) * 0.3, 10)
    const minE = dataMin - pad
    const maxE = dataMax + pad
    const rng = maxE - minE || 1
    const n = points.length

    const toX = (i: number) => ML + (i / Math.max(n - 1, 1)) * CW
    const toY = (e: number) => PT + CH - ((e - minE) / rng) * (CH - 8) - 4

    // Ticks must span the padded range so labels don't overlap
    const yTicks = [0, 1, 2, 3].map(i => minE + (rng / 3) * i)
    const maxXLabels = Math.min(5, n)
    const xStep = Math.max(1, Math.floor((n - 1) / (maxXLabels - 1)))
    const xIndices: number[] = []
    for (let i = 0; i < n; i += xStep) xIndices.push(i)
    if (xIndices[xIndices.length - 1] !== n - 1) xIndices.push(n - 1)

    const xy = points.map((p, i) => ({ x: toX(i), y: toY(p.equity) }))
    const linePath = smoothPath(xy)

    const lastEquity = points[n - 1].equity
    const color = lastEquity >= initialCapital ? 'var(--profit)' : 'var(--loss)'

    const hx = hoverIdx !== null ? toX(hoverIdx) : 0
    const hy = hoverIdx !== null ? toY(points[hoverIdx].equity) : 0

    return { toX, toY, yTicks, xIndices, linePath, color, hx, hy, n }
  })()

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chartContent) return
    const { toX } = chartContent
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * TW
    let best = 0, bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(toX(i) - svgX)
      if (d < bestDist) { bestDist = d; best = i }
    }
    setHoverIdx(best)
    const wRect = wrapperRef.current?.getBoundingClientRect()
    if (wRect) setTooltipPos({ x: e.clientX - wRect.left, y: e.clientY - wRect.top })
  }

  const hp = hoverIdx !== null ? points[hoverIdx] : null
  const hpColor = hp
    ? hp.delta > 0 ? 'var(--profit)' : hp.delta < 0 ? 'var(--loss)' : 'var(--muted)'
    : 'var(--muted)'

  return (
    <div>
      {/* Range selector */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => { setRange(r.key); setHoverIdx(null) }}
            data-active={range === r.key}
            className="retro-pill px-3 py-1 fs-meta transition-colors">
            {r.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap fs-meta font-bold mb-3">
          <span style={{ color: 'var(--muted)' }}>從</span>
          <RetroDatePicker value={customFrom} max={customTo}
            onChange={v => { setCustomFrom(v); setHoverIdx(null) }} />
          <span style={{ color: 'var(--muted)' }}>到</span>
          <RetroDatePicker value={customTo} min={customFrom} max={todayISO(0)}
            onChange={v => { setCustomTo(v); setHoverIdx(null) }} />
        </div>
      )}

      {!chartContent ? (
        <div className="h-20 flex items-center justify-center text-[12px]" style={{ color: 'var(--muted)' }}>
          此時間範圍內無交易記錄
        </div>
      ) : (
        <div ref={wrapperRef} className="relative w-full max-w-[640px] mx-auto">
          <svg
            width="100%"
            viewBox={`0 0 ${TW} ${TH}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <clipPath id="chart-clip">
                <rect x={ML} y={PT} width={CW} height={CH} />
              </clipPath>
            </defs>

            {/* Y-axis gridlines + labels */}
            {chartContent.yTicks.map((v, i) => {
              const y = chartContent.toY(v)
              return (
                <g key={i}>
                  <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                  <text x={ML - 3} y={y + 3} textAnchor="end" fontSize="7" fill="var(--muted)">
                    {fmtAxis(v)}
                  </text>
                </g>
              )
            })}

            {/* X-axis labels */}
            {chartContent.xIndices.map(i => (
              <text key={i} x={chartContent.toX(i)} y={TH - 3} textAnchor="middle" fontSize="7" fill="var(--muted)">
                {fmtDay(points[i].day)}
              </text>
            ))}

            {/* Line only — no shaded area under the curve */}
            <path d={chartContent.linePath} fill="none" stroke={chartContent.color}
              strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#chart-clip)" />

            {/* Hover guide + dot */}
            {hoverIdx !== null && (
              <>
                <line x1={chartContent.hx} y1={PT} x2={chartContent.hx} y2={PT + CH}
                  stroke="var(--border2)" strokeWidth="0.8" strokeDasharray="3,2" />
                <circle cx={chartContent.hx} cy={chartContent.hy} r="3" fill={chartContent.color} />
              </>
            )}

          </svg>

          {/* HTML tooltip */}
          {hoverIdx !== null && hp && (
            <div
              className="pointer-events-none absolute rounded-lg px-2.5 py-2 border text-center"
              style={{
                background: 'var(--raised)',
                borderColor: 'var(--border2)',
                left: tooltipPos.x + 10,
                top: tooltipPos.y - 48,
                minWidth: 78,
                transform: tooltipPos.x > (wrapperRef.current?.clientWidth ?? 999) * 0.7
                  ? 'translateX(calc(-100% - 20px))' : undefined,
              }}
            >
              <div className="fs-tiny mb-0.5" style={{ color: 'var(--muted)' }}>
                {fmtDay(hp.day)}
              </div>
              <div className="fs-body retro-mono font-bold" style={{ color: chartContent.color }}>
                {fmtAxis(hp.equity)}
              </div>
              {hp.delta !== 0 && (
                <div className="fs-tiny mt-0.5 font-medium" style={{ color: hpColor }}>
                  {fmtDelta(hp.delta)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
