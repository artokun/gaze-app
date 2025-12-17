'use client'

import { useState } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GazeTrackerWrapper } from './gaze-tracker-wrapper'
import { Share2, Download, Maximize2, Copy, Check } from 'lucide-react'

export function ViewerSection() {
  const { completedSession } = useSocket()
  const [copied, setCopied] = useState(false)

  if (!completedSession) {
    return null
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${completedSession.sessionId}`
  const viewUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${completedSession.sessionId}/view`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    window.open(`/api/download-widget/${completedSession.sessionId}`, '_blank')
  }

  const handleFullscreen = () => {
    window.open(viewUrl, '_blank')
  }

  // Use base path directly - widget auto-discovers q0.webp, q1.webp, etc.
  const basePath = completedSession.basePath.endsWith('/')
    ? completedSession.basePath
    : `${completedSession.basePath}/`

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Your Gaze Tracker</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <GazeTrackerWrapper src={basePath} />

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="w-4 h-4 mr-2" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>

          <Button variant="outline" onClick={handleFullscreen}>
            <Maximize2 className="w-4 h-4 mr-2" />
            Fullscreen
          </Button>

          <Button variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>

        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Share URL:</p>
          <code className="text-xs break-all">{shareUrl}</code>
        </div>
      </CardContent>
    </Card>
  )
}
