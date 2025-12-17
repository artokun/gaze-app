'use client'

interface GazeTrackerWrapperProps {
  src?: string
  hideControls?: boolean
  className?: string
}

export function GazeTrackerWrapper({
  src,
  hideControls = false,
  className = '',
}: GazeTrackerWrapperProps) {
  return (
    <div className={className} style={{ aspectRatio: '4/5' }}>
      {/* @ts-expect-error - gaze-tracker is a custom web component */}
      <gaze-tracker
        src={src}
        hide-controls={hideControls ? '' : undefined}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
