'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Maximize } from 'lucide-react'
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

  useEffect(() => {
    const container = containerRef.current
    if (!container || (isMobile && !gyroMode)) return

    // Clear container
    container.innerHTML = ''

    // Create gaze-tracker element
    const tracker = document.createElement('gaze-tracker')
    // Widget expects base path, it appends q0.webp, q1.webp, etc. internally
    tracker.setAttribute('src', basePath)
    tracker.setAttribute('hide-controls', '')
    tracker.style.width = '100%'
    tracker.style.height = '100%'

    if (gyroMode === 'tilt') {
      tracker.setAttribute('data-gyro', 'true')
    }

    container.appendChild(tracker)

    // Cleanup on unmount
    return () => {
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [gyroMode, isMobile, basePath])

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

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  return (
    <main className="h-dvh w-full overflow-hidden bg-black relative">
      {/* Full screen widget */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Desktop only: Floating controls */}
      {!isMobile && (
        <>
          {/* Back button - top left */}
          <Link href={`/${sessionId}`} className="absolute top-4 left-4 z-10">
            <Button variant="ghost" size="icon" className="bg-black/50 hover:bg-black/70 text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>

          {/* Fullscreen button - top right */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white"
            onClick={handleFullscreen}
          >
            <Maximize className="w-5 h-5" />
          </Button>
        </>
      )}

      {/* Mobile: Gyro mode dialog */}
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
