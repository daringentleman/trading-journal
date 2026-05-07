import type { Metadata } from 'next'
import { Archivo_Black, Inter, Space_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'

const archivoBlack = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--font-display' })
const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: '交易日誌',
  description: '日內交易記錄與分析',
}

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html lang="zh-TW" className={`${archivoBlack.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 md:ml-56 pb-16 md:pb-0">
            {children}
          </main>
        </div>
        {modal}
      </body>
    </html>
  )
}
