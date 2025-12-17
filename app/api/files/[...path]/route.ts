import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getSessionPath, getContentType } from '@/lib/storage/local'
import { useCfImages, getImageUrl } from '@/lib/storage'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params

  if (!pathParts || pathParts.length === 0) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Extract sessionId and file path
  const [sessionId, ...rest] = pathParts
  const filePath = rest.join('/')

  try {
    if (useCfImages) {
      // Redirect to Cloudflare Images CDN
      const cdnUrl = getImageUrl(sessionId, filePath)
      return NextResponse.redirect(cdnUrl, 302)
    }

    // Read from local file system
    const fullPath = getSessionPath(sessionId, ...rest)

    if (!fs.existsSync(fullPath)) {
      return new NextResponse('Not found', { status: 404 })
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const contentType = getContentType(fullPath)

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Failed to serve file:', error)
    return new NextResponse('Not found', { status: 404 })
  }
}
