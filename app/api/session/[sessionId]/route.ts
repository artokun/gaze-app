import { NextRequest, NextResponse } from 'next/server'
import { getSessionMetadata } from '@/lib/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  try {
    const metadata = await getSessionMetadata(sessionId)

    if (!metadata) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Use API files route which handles both local and CF Images
    const basePath = `/api/files/${sessionId}/`

    return NextResponse.json({
      sessionId,
      basePath,
      metadataPath: `${basePath}metadata.json`,
      isReady: true,
      ...metadata,
    })
  } catch (error) {
    console.error('Failed to read session metadata:', error)
    return NextResponse.json(
      { error: 'Failed to read session metadata' },
      { status: 500 }
    )
  }
}
