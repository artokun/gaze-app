import { NextRequest, NextResponse } from 'next/server'
import { getSessionMetadata, getBasePath } from '@/lib/storage'

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

    return NextResponse.json({
      sessionId,
      basePath: getBasePath(sessionId),
      metadataPath: `${getBasePath(sessionId)}/metadata.json`,
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
