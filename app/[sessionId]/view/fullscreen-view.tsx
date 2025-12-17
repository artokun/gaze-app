'use client'

import { useState } from 'react'
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

  // Show tracker on desktop always, on mobile only after gyro mode selected
  const showTracker = !isMobile || gyroMode !== null

  return (
    <main className="h-dvh w-full overflow-hidden bg-black relative">
      {/* Full screen widget */}
      {showTracker && (
        <div className="w-full h-full">
          {/* @ts-expect-error - gaze-tracker is a custom web component */}
          <gaze-tracker
            src={basePath}
            hide-controls=""
            data-gyro={gyroMode === 'tilt' ? 'true' : undefined}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}

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
