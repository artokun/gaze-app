import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/storage'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  // Validate session ID format
  if (!sessionId.startsWith('session_')) {
    return NextResponse.json(
      { error: 'Invalid session ID' },
      { status: 400 }
    )
  }

  try {
    await deleteSession(sessionId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete session:', error)
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    )
  }
}
