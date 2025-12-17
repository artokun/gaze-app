import { Metadata } from 'next'
import { SessionViewer } from '@/components/session/session-viewer'
import { SessionBottomBar } from '@/components/session/session-bottom-bar'
import { getSessionMetadata, sessionExists, getSpriteSrc, useCfImages } from '@/lib/storage'

interface SessionPageProps {
  params: Promise<{ sessionId: string }>
}

export async function generateMetadata({ params }: SessionPageProps): Promise<Metadata> {
  const { sessionId } = await params
  const metadata = await getSessionMetadata(sessionId)

  if (!metadata) {
    return {
      title: 'Session Not Found | Gaze Tracker',
      description: 'This gaze tracking session could not be found.',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gaze.artokun.io'
  const ogImageUrl = `${baseUrl}/api/files/${sessionId}/input.jpg`
  const pageUrl = `${baseUrl}/${sessionId}`

  const title = sessionId === 'demo'
    ? 'Live Demo - Interactive Portrait | Gaze Tracker'
    : 'Your Animated Portrait | Gaze Tracker'

  const description = sessionId === 'demo'
    ? 'Experience the magic of AI-powered gaze tracking. Watch this interactive portrait follow your cursor, touch, or device motion in real-time. Try it yourself!'
    : 'Watch this AI-generated portrait come alive! An interactive animated face that follows your cursor, responds to touch, and tracks device motion. Powered by cutting-edge machine learning.'

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
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
      creator: '@artokun',
    },
    alternates: {
      canonical: pageUrl,
    },
    keywords: [
      'gaze tracking',
      'AI portrait',
      'animated face',
      'interactive portrait',
      'machine learning',
      'face animation',
      'LivePortrait',
      'eye tracking',
      'cursor tracking',
    ],
  }
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params

  // Check if session exists (either completed with metadata, or in-progress with input.jpg)
  const metadata = await getSessionMetadata(sessionId)
  const exists = await sessionExists(sessionId)

  // Allow page to render if session folder exists (even without gaze_output yet)
  // The client component will handle showing progress vs completed state
  if (!metadata && !exists) {
    // Session doesn't exist at all - but allow client to handle
    // This is needed for immediate navigation after upload
  }

  // Session is "ready" if it has complete metadata (gaze_output exists)
  const isReady = !!metadata

  // Get CDN sprite src if using Cloudflare Images
  const spriteSrc = isReady && useCfImages ? getSpriteSrc(sessionId) : undefined

  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area - image centered */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 flex items-center justify-center overflow-hidden">
        <SessionViewer sessionId={sessionId} isReady={isReady} spriteSrc={spriteSrc} />
      </div>

      <SessionBottomBar sessionId={sessionId} isReady={isReady} />
    </main>
  )
}
