'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TradeDetailContent from '@/components/TradeDetailContent'

export default function TradeModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [router])

  return (
    <div
      className="flex items-center justify-center p-4 md:p-8"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100,
        background: 'rgba(26, 20, 16, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={() => router.back()}
    >
      <div
        className="retro-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 relative"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={() => router.back()}
          className="absolute top-3 right-3 w-8 h-8 retro-card flex items-center justify-center fs-body font-bold leading-none"
          aria-label="關閉"
        >
          ✕
        </button>
        <TradeDetailContent id={id} mode="modal" onSaved={() => router.back()} />
      </div>
    </div>
  )
}
