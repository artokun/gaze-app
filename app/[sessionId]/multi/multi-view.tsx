'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface MultiViewProps {
  sessionId: string
  basePath: string
}

export function MultiView({ sessionId, basePath }: MultiViewProps) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    containerRefs.current.forEach((container) => {
      if (container) {
        container.innerHTML = ''
        const tracker = document.createElement('gaze-tracker')
        tracker.setAttribute('src', basePath)
        tracker.style.width = '100%'
        tracker.style.height = '100%'
        container.appendChild(tracker)
      }
    })
  }, [basePath])

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Back button */}
      <div className="mb-4">
        <Link href={sessionId === 'demo' ? '/' : `/${sessionId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      {/* 3x2 Grid */}
      <div className="grid grid-cols-3 gap-4 max-w-6xl mx-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              containerRefs.current[i] = el
            }}
            className="aspect-[4/5] bg-muted rounded-lg overflow-hidden"
          />
        ))}
      </div>
    </div>
  )
}
