import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionMetadata } from '@/lib/storage'
import { FullscreenView } from './fullscreen-view'

interface ViewPageProps {
  params: Promise<{ sessionId: string }>
}

export default async function ViewPage({ params }: ViewPageProps) {
  const { sessionId } = await params

  // Validate session exists
  const metadata = await getSessionMetadata(sessionId)

  if (!metadata) {
    notFound()
  }

  // Detect mobile
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || ''
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent)

  // Use API files route which handles both local and CF Images
  // Demo has flat structure, sessions have sprites in gaze_output/ subfolder
  const basePath = sessionId === 'demo'
    ? `/api/files/${sessionId}/`
    : `/api/files/${sessionId}/gaze_output/`

  return (
    <FullscreenView
      sessionId={sessionId}
      basePath={basePath}
      isMobile={isMobile}
    />
  )
}
