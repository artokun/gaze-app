import { notFound } from 'next/navigation'
import { getSessionMetadata, getBasePath } from '@/lib/storage'
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

  const basePath = getBasePath(sessionId)

  return <MultiView sessionId={sessionId} basePath={basePath} />
}
