'use client'

import { useEffect, useRef } from 'react'

interface GazeTrackerWrapperProps {
  src?: string
  basePath?: string
  hideControls?: boolean
  className?: string
}

export function GazeTrackerWrapper({
  src,
  basePath,
  hideControls = false,
  className = '',
}: GazeTrackerWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear any existing content
    container.innerHTML = ''

    // Create the web component
    const tracker = document.createElement('gaze-tracker')

    // Use base-path if provided, otherwise fall back to src
    if (basePath) {
      tracker.setAttribute('base-path', basePath)
    } else if (src) {
      tracker.setAttribute('src', src)
    }

    if (hideControls) {
      tracker.setAttribute('hide-controls', '')
    }
    tracker.style.width = '100%'
    tracker.style.height = '100%'

    container.appendChild(tracker)

    // Cleanup on unmount
    return () => {
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [src, basePath, hideControls])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ aspectRatio: '4/5' }}
    />
  )
}
