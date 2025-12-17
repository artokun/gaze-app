import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { getSessionPath } from '@/lib/storage/local'
import { useCfImages, getImageUrl } from '@/lib/storage'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const outputDir = getSessionPath(sessionId, 'gaze_output')
  const localExists = fs.existsSync(outputDir)

  // Session must exist either locally or on CDN
  if (!localExists && !useCfImages) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  try {
    // Create ZIP in memory
    const chunks: Buffer[] = []

    const archive = archiver('zip', { zlib: { level: 5 } })
    archive.on('data', (chunk) => chunks.push(chunk))

    // Add sprite files - from local storage or CDN
    const spriteFiles = [
      'q0.webp',
      'q1.webp',
      'q2.webp',
      'q3.webp',
      'q0_20.webp',
      'q1_20.webp',
      'q2_20.webp',
      'q3_20.webp',
    ]

    for (const file of spriteFiles) {
      const localPath = path.join(outputDir, file)

      if (localExists && fs.existsSync(localPath)) {
        // File exists locally - use it
        archive.file(localPath, { name: file })
      } else if (useCfImages) {
        // Fetch from CDN - images are stored as {sessionId}/q0, not {sessionId}/gaze_output/q0
        try {
          const cdnUrl = getImageUrl(sessionId, file)
          const response = await fetch(cdnUrl)
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer())
            archive.append(buffer, { name: file })
          }
        } catch (err) {
          console.error(`Failed to fetch ${file} from CDN:`, err)
        }
      }
    }

    // Add demo HTML files
    const publicDir = path.join(process.cwd(), 'public')
    const demoFullscreenPath = path.join(publicDir, 'widget', 'demo-fullscreen.html')
    const demoResizablePath = path.join(publicDir, 'widget', 'demo-resizable.html')

    if (fs.existsSync(demoFullscreenPath)) {
      archive.file(demoFullscreenPath, { name: 'demo-fullscreen.html' })
    }
    if (fs.existsSync(demoResizablePath)) {
      archive.file(demoResizablePath, { name: 'demo-resizable.html' })
    }

    // Generate README
    const readme = generateReadme(sessionId)
    archive.append(readme, { name: 'README.md' })

    await archive.finalize()

    const zipBuffer = Buffer.concat(chunks)

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="gaze-widget-${sessionId}.zip"`,
      },
    })
  } catch (error) {
    console.error('Failed to create download:', error)
    return NextResponse.json(
      { error: 'Failed to create download' },
      { status: 500 }
    )
  }
}

function generateReadme(sessionId: string): string {
  return `# Your Gaze Tracker Widget

## Quick Start

Due to browser security restrictions, you need to run a local server:

\`\`\`bash
cd /path/to/this/folder
npx serve
\`\`\`

Then open **http://localhost:3000** and click on a demo file.

## Files Included

- \`q0.webp\`, \`q1.webp\`, \`q2.webp\`, \`q3.webp\` - Desktop sprites (30x30 grid, 4 quadrants)
- \`q0_20.webp\`, \`q1_20.webp\`, \`q2_20.webp\`, \`q3_20.webp\` - Mobile sprites (20x20 grid)
- \`demo-fullscreen.html\` - Full-screen demo
- \`demo-resizable.html\` - Resizable container demo

## Embedding in Your Website

\`\`\`html
<!-- Add the widget script -->
<script src="https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@v1.0.6/gaze-tracker.js" defer></script>

<!-- Use the widget -->
<gaze-tracker
  src="q0.webp,q1.webp,q2.webp,q3.webp"
  mode="quadrants"
  width="512"
  height="640"
></gaze-tracker>
\`\`\`

## Live Version

View your gaze tracker online:
https://gaze.fly.dev/${sessionId}

Generated with Gaze Tracker - https://gaze.fly.dev
`
}
