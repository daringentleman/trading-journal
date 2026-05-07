'use client'

import { use } from 'react'
import TradeDetailContent from '@/components/TradeDetailContent'

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <TradeDetailContent id={id} mode="page" />
    </div>
  )
}
