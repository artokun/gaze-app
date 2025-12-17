'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
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
    <div
      className="fixed inset-0 bg-black"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Back button */}
      <Link
        href={`/${sessionId}`}
        className="absolute top-4 left-4 z-10"
        style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="bg-black/50 hover:bg-black/70 text-white rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </Link>

      {/* Gaze tracker container */}
      <div ref={containerRef} className="w-full h-full" />

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
    </div>
  )
}
