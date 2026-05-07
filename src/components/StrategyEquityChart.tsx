'use client'

import { useState, useRef } from 'react'
import type { StrategyMetric } from '@/lib/strategy-stats'

export type ChartMode = 'pnl' | 'winRate'

interface Props {
  metric: StrategyMetric | null
  rangeStartMs: number
  rangeEndMs?: number
  mode?: ChartMode
}

function fmtPnlAxis(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US')
}

function fmtPctAxis(n: number): string {
  return Math.round(n) + '%'
}

function fmtDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtPnlDelta(delta: number): string {
  if (delta === 0) return ''
  return (delta > 0 ? '+' : '') + '$' + delta.toFixed(1)
}

function fmtPctDelta(delta: number): string {
  if (Math.abs(delta) < 0.05) return ''
  return (delta > 0 ? '+' : '') + delta.toFixed(1) + '%'
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)} L${pts[1].x.toFixed(2)},${pts[1].y.toFixed(2)}`
  const t = 6
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    let c1x = p1.x + (p2.x - p0.x) / t
    let c1y = p1.y + (p2.y - p0.y) / t
    let c2x = p2.x - (p3.x - p1.x) / t
    let c2y = p2.y - (p3.y - p1.y) / t
    // X clamp: avoid axis folding with uneven X spacing.
    // Y clamp: keep each segment monotone so transitions into a flat
    // tail (last trade → "now") have no overshoot/kink.
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

export default function StrategyEquityChart({ metric, rangeStartMs, rangeEndMs, mode = 'pnl' }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const ML = 46, MB = 20, PT = 8, CW = 330, CH = 130
  const TW = ML + CW
  const TH = PT + CH + MB

  const sourceCurve: { time: number; value: number }[] = metric
    ? (mode === 'pnl'
        ? metric.equityCurve.map(p => ({ time: p.time, value: p.equity }))
        : metric.winRateCurve.map(p => ({ time: p.time, value: p.winRate })))
    : []

  if (!metric || sourceCurve.length < 2) {
    return (
      <div className="h-[160px] flex items-center justify-center text-[12px]" style={{ color: 'var(--muted)' }}>
        此時間範圍內無交易記錄
      </div>
    )
  }

  // Right edge of the chart: custom range ⇒ user-picked end, otherwise "now".
  const endMs = rangeEndMs ?? Date.now()

  // Aggregate per day: keep last value of each calendar day
  const byDay = new Map<string, number>()
  for (const p of sourceCurve.slice(1)) {
    const k = new Date(p.time).toLocaleDateString('en-CA')
    byDay.set(k, p.value)
  }
  const sortedKeys = [...byDay.keys()].sort()

  // Per-day delta from previous day
  const points: { time: number; value: number; delta: number }[] = [
    { time: rangeStartMs, value: 0, delta: 0 },
  ]
  let prev = 0
  for (const k of sortedKeys) {
    const v = byDay.get(k)!
    const [y, m, d] = k.split('-').map(Number)
    points.push({
      time: new Date(y, m - 1, d, 23, 59).getTime(),
      value: v,
      delta: v - prev,
    })
    prev = v
  }
  const lastVal = points[points.length - 1].value
  if (points[points.length - 1].time < endMs) {
    points.push({ time: endMs, value: lastVal, delta: 0 })
  }

  const allValues = points.map(p => p.value)
  let minV: number, maxV: number
  if (mode === 'winRate') {
    // Lock the win rate axis to 0..100 so drift around 50% reads consistently
    minV = 0
    maxV = 100
  } else {
    const dataMin = Math.min(0, ...allValues)
    const dataMax = Math.max(0, ...allValues)
    const pad = Math.max((dataMax - dataMin) * 0.18, 5)
    minV = dataMin - pad
    maxV = dataMax + pad
  }
  const rng = maxV - minV || 1

  const minT = rangeStartMs
  const maxT = Math.max(endMs, ...points.map(p => p.time))
  const rngT = maxT - minT || 1

  const toX = (t: number) => ML + ((t - minT) / rngT) * CW
  const toY = (v: number) => PT + CH - ((v - minV) / rng) * (CH - 8) - 4

  const yTicks = mode === 'winRate'
    ? [0, 25, 50, 75, 100]
    : [0, 1, 2, 3].map(i => minV + (rng / 3) * i)
  const xTickCount = 5
  const xTicks = Array.from({ length: xTickCount }, (_, i) => minT + (rngT * i) / (xTickCount - 1))

  const xy = points.map(p => ({ x: toX(p.time), y: toY(p.value) }))
  const linePath = smoothPath(xy)

  const lineColor = metric.color
  const clipId = `strat-clip-${metric.id}-${mode}`

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * TW
    let best = 0, bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(toX(points[i].time) - svgX)
      if (d < bestDist) { bestDist = d; best = i }
    }
    setHoverIdx(best)
    const wRect = wrapperRef.current?.getBoundingClientRect()
    if (wRect) setTooltipPos({ x: e.clientX - wRect.left, y: e.clientY - wRect.top })
  }

  const hp = hoverIdx !== null ? points[hoverIdx] : null
  const hx = hp ? toX(hp.time) : 0
  const hy = hp ? toY(hp.value) : 0
  const hpDeltaColor = hp
    ? hp.delta > 0 ? 'var(--profit)' : hp.delta < 0 ? 'var(--loss)' : 'var(--muted)'
    : 'var(--muted)'

  const fmtAxis = mode === 'pnl' ? fmtPnlAxis : fmtPctAxis
  const fmtDelta = mode === 'pnl' ? fmtPnlDelta : fmtPctDelta
  const valueColor = mode === 'pnl'
    ? (hp && hp.value >= 0 ? 'var(--profit)' : 'var(--loss)')
    : (hp && hp.value >= 50 ? 'var(--profit)' : 'var(--loss)')

  return (
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
          <clipPath id={clipId}>
            <rect x={ML} y={PT} width={CW} height={CH} />
          </clipPath>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((v, i) => {
          const y = toY(v)
          return (
            <g key={i}>
              <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="var(--border)" strokeWidth="0.5" opacity="0.5" />
              <text x={ML - 3} y={y + 3} textAnchor="end" fontSize="7" fill="var(--muted)">
                {fmtAxis(v)}
              </text>
            </g>
          )
        })}

        {/* Mid baseline (zero PnL or 50% win rate) */}
        {mode === 'pnl' && minV < 0 && maxV > 0 && (
          <line x1={ML} y1={toY(0)} x2={ML + CW} y2={toY(0)}
            stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.7" />
        )}
        {mode === 'winRate' && (
          <line x1={ML} y1={toY(50)} x2={ML + CW} y2={toY(50)}
            stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.7" />
        )}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={toX(t)} y={TH - 3} textAnchor="middle" fontSize="7" fill="var(--muted)">
            {fmtDay(t)}
          </text>
        ))}

        {/* Line only — no fill (clean, no shadow under the curve) */}
        <path d={linePath} fill="none" stroke={lineColor}
          strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`} />

        {/* Hover crosshair + dot */}
        {hp && (
          <>
            <line x1={hx} y1={PT} x2={hx} y2={PT + CH}
              stroke="var(--border2)" strokeWidth="0.8" strokeDasharray="3,2" />
            <circle cx={hx} cy={hy} r="3.5" fill={lineColor} stroke="var(--surface)" strokeWidth="1.5" />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hp && (
        <div
          className="pointer-events-none absolute rounded-lg px-2.5 py-2 border text-center"
          style={{
            background: 'var(--raised)',
            borderColor: 'var(--border2)',
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 50,
            minWidth: 90,
            transform: tooltipPos.x > (wrapperRef.current?.clientWidth ?? 999) * 0.7
              ? 'translateX(calc(-100% - 24px))' : undefined,
          }}
        >
          <div className="fs-tiny mb-0.5" style={{ color: 'var(--muted)' }}>
            {fmtDay(hp.time)}
          </div>
          <div className="fs-body retro-mono font-bold" style={{ color: valueColor }}>
            {fmtAxis(hp.value)}
          </div>
          {hp.delta !== 0 && fmtDelta(hp.delta) && (
            <div className="fs-tiny mt-0.5 font-medium" style={{ color: hpDeltaColor }}>
              {fmtDelta(hp.delta)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
