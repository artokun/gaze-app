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
    // The web component is loaded via script tag in layout.tsx
    // We need to create and configure it manually for React
    if (containerRef.current) {
      // Clear any existing content
      containerRef.current.innerHTML = ''

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

      containerRef.current.appendChild(tracker)
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
