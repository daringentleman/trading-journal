'use client'

import { useState, useRef } from 'react'
import type { Trade } from '@/lib/types'

interface Props {
  trades: Trade[]
  initialCapital: number
}

type Range = '7d' | '30d' | '60d' | '90d'
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: '7d',  label: '7天',  days: 7 },
  { key: '30d', label: '30天', days: 30 },
  { key: '60d', label: '60天', days: 60 },
  { key: '90d', label: '90天', days: 90 },
]

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

export default function EquityChart({ trades, initialCapital }: Props) {
  const [range, setRange] = useState<Range>('90d')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const rangeDays = RANGES.find(r => r.key === range)!.days
  const cutoffMs = Date.now() - rangeDays * 86400000

  // Sort all trades by exit/entry time
  const allSorted = [...trades]
    .filter(t => t.exit_time || t.entry_time)
    .sort((a, b) =>
      new Date(a.exit_time ?? a.entry_time!).getTime() -
      new Date(b.exit_time ?? b.entry_time!).getTime()
    )

  // Equity at start of range = initialCapital + PnL from all prior trades
  const startEquity = initialCapital + allSorted
    .filter(t => new Date(t.exit_time ?? t.entry_time!).getTime() < cutoffMs)
    .reduce((s, t) => s + (t.pnl ?? 0), 0)

  const rangeTrades = allSorted.filter(
    t => new Date(t.exit_time ?? t.entry_time!).getTime() >= cutoffMs
  )

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
  points.push({ day: 'now', equity, delta: 0 })

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

    const polyPoints = points.map((p, i) => `${toX(i)},${toY(p.equity)}`).join(' ')
    const fillPath =
      `M${toX(0)},${toY(points[0].equity)} ` +
      points.map((p, i) => `L${toX(i)},${toY(p.equity)}`).join(' ') +
      ` L${toX(n - 1)},${PT + CH} L${toX(0)},${PT + CH} Z`

    const lastEquity = points[n - 1].equity
    const isUp = lastEquity >= initialCapital
    const color = isUp ? 'var(--profit)' : 'var(--loss)'

    const hx = hoverIdx !== null ? toX(hoverIdx) : 0
    const hy = hoverIdx !== null ? toY(points[hoverIdx].equity) : 0

    return { toX, toY, yTicks, xIndices, polyPoints, fillPath, lastEquity, isUp, color, hx, hy, n }
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
      <div className="flex gap-1.5 mb-3">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => { setRange(r.key); setHoverIdx(null) }}
            className="px-2.5 py-0.5 rounded-full text-[11px] border transition-colors"
            style={{
              background: range === r.key ? 'var(--raised)' : 'transparent',
              borderColor: range === r.key ? 'var(--border2)' : 'var(--border)',
              color: range === r.key ? 'var(--text)' : 'var(--muted)',
            }}>
            {r.label}
          </button>
        ))}
      </div>

      {!chartContent ? (
        <div className="h-20 flex items-center justify-center text-[12px]" style={{ color: 'var(--muted)' }}>
          此時間範圍內無交易記錄
        </div>
      ) : (
        <div ref={wrapperRef} className="relative w-full">
          <svg
            width="100%"
            viewBox={`0 0 ${TW} ${TH}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartContent.isUp ? '#16a34a' : '#b91c1c'} stopOpacity="0.18" />
                <stop offset="100%" stopColor={chartContent.isUp ? '#16a34a' : '#b91c1c'} stopOpacity="0" />
              </linearGradient>
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

            {/* Chart fill + line */}
            <path d={chartContent.fillPath} fill="url(#eq-grad)" clipPath="url(#chart-clip)" />
            <polyline points={chartContent.polyPoints} fill="none" stroke={chartContent.color}
              strokeWidth="1.5" strokeLinejoin="round" clipPath="url(#chart-clip)" />

            {/* Hover guide + dot */}
            {hoverIdx !== null && (
              <>
                <line x1={chartContent.hx} y1={PT} x2={chartContent.hx} y2={PT + CH}
                  stroke="var(--border2)" strokeWidth="0.8" strokeDasharray="3,2" />
                <circle cx={chartContent.hx} cy={chartContent.hy} r="3" fill={chartContent.color} />
              </>
            )}

            {/* End dot + label when not hovering */}
            {hoverIdx === null && (() => {
              const { toX, toY, lastEquity, color, n } = chartContent
              const ex = toX(n - 1)
              const ey = toY(lastEquity)
              const above = ey < PT + CH / 2
              return (
                <>
                  <circle cx={ex} cy={ey} r="3" fill={color} />
                  <rect x={ex - 52} y={above ? ey + 4 : ey - 14} width={50} height={11} rx="2"
                    fill="var(--surface)" fillOpacity="0.85" />
                  <text x={ex - 2} y={above ? ey + 12 : ey - 5}
                    textAnchor="end" fontSize="8.5" fill={color}>
                    {fmtAxis(lastEquity)}
                  </text>
                </>
              )
            })()}
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
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--muted)' }}>
                {fmtDay(hp.day)}
              </div>
              <div className="text-[12px] font-semibold" style={{ color: chartContent.color }}>
                {fmtAxis(hp.equity)}
              </div>
              {hp.delta !== 0 && (
                <div className="text-[10px] mt-0.5 font-medium" style={{ color: hpColor }}>
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
