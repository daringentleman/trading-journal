import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: '交易日誌',
  description: '日內交易記錄與分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        {/* Desktop: sidebar + content */}
        <div className="flex min-h-screen">
          <Nav />
          {/* Main content: left margin on desktop for sidebar, bottom padding on mobile for nav */}
          <main className="flex-1 md:ml-56 pb-16 md:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
