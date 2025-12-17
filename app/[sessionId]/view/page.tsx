import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionMetadata, getBasePath } from '@/lib/storage'
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

  const basePath = getBasePath(sessionId)

  return (
    <FullscreenView
      sessionId={sessionId}
      basePath={basePath}
      isMobile={isMobile}
    />
  )
}
