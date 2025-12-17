import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GazeTrackerWrapper } from '@/components/viewer/gaze-tracker-wrapper'
import { getSessionMetadata } from '@/lib/storage'
import { Maximize2, Download, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface SessionPageProps {
  params: Promise<{ sessionId: string }>
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
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Gaze Tracker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GazeTrackerWrapper src={src} />

            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/${sessionId}/view`}>
                <Button variant="outline">
                  <Maximize2 className="w-4 h-4 mr-2" />
                  Fullscreen
                </Button>
              </Link>

              <a href={`/api/download-widget/${sessionId}`} download>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download Widget
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
