import { notFound } from 'next/navigation'
import { getSessionMetadata } from '@/lib/storage'
import { MultiView } from './multi-view'

interface MultiPageProps {
  params: Promise<{ sessionId: string }>
}

export default async function MultiPage({ params }: MultiPageProps) {
  const { sessionId } = await params

  // Validate session exists
  const metadata = await getSessionMetadata(sessionId)

  if (!metadata) {
    notFound()
  }

  // Use API files route which handles both local and CF Images
  // Demo has flat structure, sessions have sprites in gaze_output/ subfolder
  const basePath = sessionId === 'demo'
    ? `/api/files/${sessionId}/`
    : `/api/files/${sessionId}/gaze_output/`

  return <MultiView sessionId={sessionId} basePath={basePath} />
}
