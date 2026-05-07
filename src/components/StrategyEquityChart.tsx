'use client'

import { useState, useRef } from 'react'
import type { StrategyMetric } from '@/lib/strategy-stats'

interface Props {
  metrics: StrategyMetric[]   // already filtered to range and to strategies with trades
  rangeStartMs: number        // for X-axis anchor
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtMoney(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(0)
}

export default function StrategyEquityChart({ metrics, rangeStartMs }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const ML = 46, MB = 18, PT = 6, CW = 330, CH = 130
  const TW = ML + CW
  const TH = PT + CH + MB

  const usable = metrics.filter(m => m.equityCurve.length >= 2)
  if (!usable.length) {
    return (
      <div className="h-[160px] flex items-center justify-center text-[12px]" style={{ color: 'var(--muted)' }}>
        此時間範圍內無策略資料
      </div>
    )
  }

  // Build aligned series: each strategy gets [(rangeStartMs, 0), ...trades]
  const series = usable.map(m => ({
    metric: m,
    points: [{ time: rangeStartMs, equity: 0 }, ...m.equityCurve.slice(1)],
  }))

  const allEquities = series.flatMap(s => s.points.map(p => p.equity))
  allEquities.push(0)
  const dataMin = Math.min(...allEquities)
  const dataMax = Math.max(...allEquities)
  const pad = Math.max((dataMax - dataMin) * 0.15, 5)
  const minE = dataMin - pad
  const maxE = dataMax + pad
  const rngE = maxE - minE || 1

  const allTimes = series.flatMap(s => s.points.map(p => p.time))
  const minT = rangeStartMs
  const maxT = Math.max(Date.now(), ...allTimes)
  const rngT = maxT - minT || 1

  const toX = (t: number) => ML + ((t - minT) / rngT) * CW
  const toY = (e: number) => PT + CH - ((e - minE) / rngE) * (CH - 8) - 4

  const yTicks = [0, 1, 2, 3].map(i => minE + (rngE / 3) * i)
  const xTickCount = 5
  const xTicks = Array.from({ length: xTickCount }, (_, i) => minT + (rngT * i) / (xTickCount - 1))

  // Build polylines per strategy. Step the line so it stays flat between trade events.
  function buildPath(points: { time: number; equity: number }[]): string {
    const sorted = [...points].sort((a, b) => a.time - b.time)
    const segs: string[] = []
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      if (i === 0) segs.push(`M${toX(p.time).toFixed(1)},${toY(p.equity).toFixed(1)}`)
      else {
        const prev = sorted[i - 1]
        // step: horizontal at prev.equity until p.time, then jump to p.equity
        segs.push(`L${toX(p.time).toFixed(1)},${toY(prev.equity).toFixed(1)}`)
        segs.push(`L${toX(p.time).toFixed(1)},${toY(p.equity).toFixed(1)}`)
      }
    }
    // extend to maxT at last equity (so all lines reach the right edge)
    const last = sorted[sorted.length - 1]
    if (last.time < maxT) {
      segs.push(`L${toX(maxT).toFixed(1)},${toY(last.equity).toFixed(1)}`)
    }
    return segs.join(' ')
  }

  // Hover: find equity per series at hoverX time
  function equityAt(points: { time: number; equity: number }[], time: number): number {
    const sorted = [...points].sort((a, b) => a.time - b.time)
    let cur = 0
    for (const p of sorted) {
      if (p.time <= time) cur = p.equity
      else break
    }
    return cur
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * TW
    const t = minT + ((svgX - ML) / CW) * rngT
    setHoverX(Math.max(minT, Math.min(maxT, t)))
    const wRect = wrapperRef.current?.getBoundingClientRect()
    if (wRect) setTooltipPos({ x: e.clientX - wRect.left, y: e.clientY - wRect.top })
  }

  const hoverPxX = hoverX !== null ? toX(hoverX) : 0

  return (
    <div ref={wrapperRef} className="relative w-full">
      <svg
        width="100%"
        viewBox={`0 0 ${TW} ${TH}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* Y ticks */}
        {yTicks.map((v, i) => {
          const y = toY(v)
          return (
            <g key={i}>
              <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={ML - 3} y={y + 3} textAnchor="end" fontSize="7" fill="var(--muted)">
                {(v >= 0 ? '+' : '') + '$' + Math.round(v)}
              </text>
            </g>
          )
        })}

        {/* Zero line */}
        {minE < 0 && maxE > 0 && (
          <line x1={ML} y1={toY(0)} x2={ML + CW} y2={toY(0)} stroke="var(--muted)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
        )}

        {/* X ticks */}
        {xTicks.map((t, i) => (
          <text key={i} x={toX(t)} y={TH - 3} textAnchor="middle" fontSize="7" fill="var(--muted)">
            {fmtTime(t)}
          </text>
        ))}

        {/* Strategy lines */}
        {series.map(s => (
          <path key={s.metric.id} d={buildPath(s.points)} fill="none"
            stroke={s.metric.color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Hover guide */}
        {hoverX !== null && (
          <line x1={hoverPxX} y1={PT} x2={hoverPxX} y2={PT + CH}
            stroke="var(--border2)" strokeWidth="0.8" strokeDasharray="3,2" />
        )}

        {/* Hover dots */}
        {hoverX !== null && series.map(s => {
          const eq = equityAt(s.points, hoverX)
          return <circle key={s.metric.id} cx={hoverPxX} cy={toY(eq)} r="2.2" fill={s.metric.color} />
        })}
      </svg>

      {/* Tooltip */}
      {hoverX !== null && (
        <div
          className="pointer-events-none absolute rounded-lg px-2.5 py-2 border"
          style={{
            background: 'var(--raised)',
            borderColor: 'var(--border2)',
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 8,
            minWidth: 130,
            transform: tooltipPos.x > (wrapperRef.current?.clientWidth ?? 999) * 0.65
              ? 'translateX(calc(-100% - 24px))' : undefined,
          }}
        >
          <div className="text-[10px] mb-1.5" style={{ color: 'var(--muted)' }}>{fmtTime(hoverX)}</div>
          <div className="space-y-0.5">
            {series
              .map(s => ({ s, eq: equityAt(s.points, hoverX) }))
              .sort((a, b) => b.eq - a.eq)
              .map(({ s, eq }) => (
                <div key={s.metric.id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.metric.color }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{s.metric.name}</span>
                  <span className="font-medium tabular-nums" style={{ color: eq >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {fmtMoney(eq)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
