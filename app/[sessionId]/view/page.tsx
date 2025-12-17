import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { getSessionMetadata } from '@/lib/storage'
import { FullscreenView } from './fullscreen-view'

interface ViewPageProps {
  params: Promise<{ sessionId: string }>
}

export async function generateMetadata({ params }: ViewPageProps): Promise<Metadata> {
  const { sessionId } = await params
  const metadata = await getSessionMetadata(sessionId)

  if (!metadata) {
    return {
      title: 'Session Not Found | Gaze Tracker',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gaze.artokun.io'
  const ogImageUrl = `${baseUrl}/api/files/${sessionId}/input.jpg`
  const pageUrl = `${baseUrl}/${sessionId}/view`

  const title = sessionId === 'demo'
    ? 'Live Demo - Fullscreen | Gaze Tracker'
    : 'Animated Portrait - Fullscreen | Gaze Tracker'

  const description = 'Watch this AI-generated portrait follow your every move. An immersive fullscreen experience with cursor tracking, touch control, and gyroscope support.'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'Gaze Tracker',
      images: [
        {
          url: ogImageUrl,
          width: 512,
          height: 640,
          alt: 'Interactive animated portrait',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
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
