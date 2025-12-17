'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'

interface MultiViewProps {
  sessionId: string
  basePath: string
}

export function MultiView({ sessionId, basePath }: MultiViewProps) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const containers = containerRefs.current.filter(Boolean)

    containers.forEach((container) => {
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
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area - 3x2 grid */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 flex items-center justify-center overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl w-full h-fit py-4">
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

      {/* Fixed bottom bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3">
        <div className="flex items-center justify-center max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
