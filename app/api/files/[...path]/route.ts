import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
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
    // Handle demo files from public directory
    if (sessionId === 'demo') {
      const demoPath = path.join(process.cwd(), 'public', 'demo', ...rest)
      if (fs.existsSync(demoPath)) {
        const fileBuffer = fs.readFileSync(demoPath)
        const contentType = getContentType(demoPath)
        return new NextResponse(new Uint8Array(fileBuffer), {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    }

    // Try local file system first (handles local sessions + development)
    const fullPath = getSessionPath(sessionId, ...rest)

    if (fs.existsSync(fullPath)) {
      const fileBuffer = fs.readFileSync(fullPath)
      const contentType = getContentType(fullPath)

      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // Fall back to Cloudflare Images CDN if configured - PROXY instead of redirect to avoid CORS
    if (useCfImages) {
      const cdnUrl = getImageUrl(sessionId, filePath)
      try {
        const cdnResponse = await fetch(cdnUrl)
        if (cdnResponse.ok) {
          const buffer = await cdnResponse.arrayBuffer()
          const contentType = cdnResponse.headers.get('content-type') || 'application/octet-stream'
          return new NextResponse(new Uint8Array(buffer), {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        }
      } catch (cdnError) {
        console.error('CDN fetch failed:', cdnError)
      }
    }

    return new NextResponse('Not found', { status: 404 })
  } catch (error) {
    console.error('Failed to serve file:', error)
    return new NextResponse('Not found', { status: 404 })
  }
}
