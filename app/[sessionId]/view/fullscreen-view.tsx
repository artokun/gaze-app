'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'

interface FullscreenViewProps {
  sessionId: string
  basePath: string
  isMobile: boolean
}

export function FullscreenView({
  sessionId,
  basePath,
  isMobile,
}: FullscreenViewProps) {
  const [showGyroDialog, setShowGyroDialog] = useState(isMobile)
  const [gyroMode, setGyroMode] = useState<'tilt' | 'drag' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const spriteSrc = `${basePath}/q0.webp,${basePath}/q1.webp,${basePath}/q2.webp,${basePath}/q3.webp`

  useEffect(() => {
    if (containerRef.current && (gyroMode || !isMobile)) {
      // Clear container
      containerRef.current.innerHTML = ''

      // Create gaze-tracker element
      const tracker = document.createElement('gaze-tracker')
      tracker.setAttribute('src', spriteSrc)
      tracker.setAttribute('hide-controls', '')
      tracker.style.width = '100%'
      tracker.style.height = '100%'

      if (gyroMode === 'tilt') {
        tracker.setAttribute('data-gyro', 'true')
      }

      containerRef.current.appendChild(tracker)
    }
  }, [gyroMode, isMobile, spriteSrc])

  const handleGyroSelect = async (mode: 'tilt' | 'drag') => {
    if (mode === 'tilt') {
      // Request gyroscope permission on iOS
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        // @ts-expect-error - requestPermission is iOS-specific
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        try {
          // @ts-expect-error - requestPermission is iOS-specific
          const permission = await DeviceOrientationEvent.requestPermission()
          if (permission !== 'granted') {
            // Fall back to drag mode
            setGyroMode('drag')
            setShowGyroDialog(false)
            return
          }
        } catch {
          // Fall back to drag mode
          setGyroMode('drag')
          setShowGyroDialog(false)
          return
        }
      }
    }

    setGyroMode(mode)
    setShowGyroDialog(false)
  }

  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area - image centered */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 flex items-center justify-center overflow-hidden">
        <div ref={containerRef} className="h-full max-w-full" />
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

      {/* Gyro mode dialog */}
      {showGyroDialog && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <div className="bg-background rounded-lg p-6 max-w-xs mx-4">
            <h2 className="text-lg font-semibold mb-4 text-center">
              How would you like to control the gaze?
            </h2>
            <div className="space-y-3">
              <Button
                className="w-full"
                onClick={() => handleGyroSelect('tilt')}
              >
                Tilt Phone
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleGyroSelect('drag')}
              >
                Two-Finger Drag
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
