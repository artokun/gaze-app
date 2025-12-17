import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { GazeTrackerWrapper } from '@/components/viewer/gaze-tracker-wrapper'
import { SessionBottomBar } from '@/components/session/session-bottom-bar'
import { getSessionMetadata } from '@/lib/storage'

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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gaze.art'
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

  // Validate session exists
  const metadata = await getSessionMetadata(sessionId)

  if (!metadata) {
    notFound()
  }

  // Use API files route which handles both local and CF Images
  // Demo has flat structure, sessions have sprites in gaze_output/ subfolder
  const src = sessionId === 'demo'
    ? `/api/files/${sessionId}/`
    : `/api/files/${sessionId}/gaze_output/`

  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area - image centered */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 flex items-center justify-center overflow-hidden">
        <GazeTrackerWrapper src={src} className="h-full max-w-full" />
      </div>

      <SessionBottomBar sessionId={sessionId} />
    </main>
  )
}
