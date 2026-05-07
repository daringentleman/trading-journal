'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string                // YYYY-MM-DD
  onChange: (s: string) => void
  min?: string
  max?: string
  className?: string
}

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = [
  '1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
  '7 月', '8 月', '9 月', '10 月', '11 月', '12 月',
]

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDisplay(s: string): string {
  if (!s) return '選擇日期'
  const [y, m, d] = s.split('-').map(Number)
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

export default function RetroDatePicker({ value, onChange, min, max, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState(() => (value ? fromISO(value) : new Date()))

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    function clickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', clickOut)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', clickOut)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  // Recenter the calendar on the selected date when opening
  useEffect(() => {
    if (open && value) setView(fromISO(value))
  }, [open, value])

  const minDate = min ? fromISO(min) : null
  const maxDate = max ? fromISO(max) : null
  const todayIso = toISO(new Date())

  const year = view.getFullYear()
  const month = view.getMonth()
  const startDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 6×7 = 42 cells
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ date: new Date(year, month, i - startDayOfWeek + 1), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date
    const next = new Date(last)
    next.setDate(next.getDate() + 1)
    cells.push({ date: next, inMonth: false })
  }

  function isDisabled(d: Date): boolean {
    if (minDate && d.getTime() < minDate.getTime()) return true
    if (maxDate && d.getTime() > maxDate.getTime()) return true
    return false
  }

  function pick(d: Date) {
    onChange(toISO(d))
    setOpen(false)
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="px-2 py-1 outline-none cursor-pointer fs-meta font-bold"
        style={{
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          color: '#000',
          borderRadius: 4,
          minWidth: 120,
          textAlign: 'left',
        }}>
        {fmtDisplay(value)}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 p-3 retro-card"
          style={{ minWidth: 252, boxShadow: '3px 3px 0 var(--border)' }}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}
              className="w-7 h-7 flex items-center justify-center retro-pill fs-meta">‹</button>
            <span className="retro-display fs-body font-bold flex-1 text-center" style={{ color: '#000' }}>
              {year} · {MONTH_NAMES[month]}
            </span>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}
              className="w-7 h-7 flex items-center justify-center retro-pill fs-meta">›</button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEK_DAYS.map(d => (
              <div key={d} className="text-center fs-tiny font-bold py-1" style={{ color: 'var(--muted)' }}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, inMonth }, i) => {
              const iso = toISO(date)
              const selected = iso === value
              const today = iso === todayIso
              const disabled = isDisabled(date)
              return (
                <button key={i} type="button" disabled={disabled}
                  onClick={() => pick(date)}
                  className="retro-day-cell fs-tiny font-bold py-1.5"
                  data-selected={selected || undefined}
                  data-today={today || undefined}
                  data-out={!inMonth || undefined}
                  data-disabled={disabled || undefined}>
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
