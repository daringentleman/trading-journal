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
        style={{ background: 'var(--surface)', borderTop: '1.5px solid var(--border)' }}
      >
        {links.map(l => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex-1 flex flex-col items-center py-2 fs-tiny font-bold gap-1"
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: 'var(--border)',
              }}
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
        style={{ background: 'var(--surface)', borderRight: '1.5px solid var(--border)' }}
      >
        <div className="mb-8 px-2">
          <div className="retro-display text-[20px]" style={{ color: 'var(--border)' }}>交易日誌</div>
          <div className="fs-tiny mt-1 font-bold" style={{ color: 'var(--muted)' }}>Trading Journal</div>
          <div className="retro-divider mt-3" />
        </div>
        <div className="flex flex-col gap-1">
          {links.map(l => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-3 px-3 py-2.5 fs-body transition-colors retro-display"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: 'var(--border)',
                  border: '1.5px solid',
                  borderColor: active ? 'var(--border)' : 'transparent',
                  borderRadius: 4,
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
