'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',         icon: '▣', label: '總覽' },
  { href: '/log',      icon: '≡', label: '記錄' },
  { href: '/stats',    icon: '◎', label: '統計' },
  { href: '/settings', icon: '◧', label: '設定' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile: bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex"
        style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}
      >
        {links.map(l => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex-1 flex flex-col items-center py-2 text-[10px] gap-1"
              style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
            >
              <span className="text-xl leading-none">{l.icon}</span>
              {l.label}
            </Link>
          )
        })}
      </nav>

      {/* Desktop: left sidebar */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-56 z-50 py-6 px-4"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        <div className="mb-8 px-2">
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--text)' }}>交易日誌</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>Trading Journal</div>
        </div>
        <div className="flex flex-col gap-1">
          {links.map(l => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={{
                  background: active ? 'var(--raised)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                <span className="text-lg leading-none">{l.icon}</span>
                {l.label}
              </Link>
            )
          })}
        </div>
      </aside>
    </>
  )
}
