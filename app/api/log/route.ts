import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { level, message, stack, userAgent } = body
    const timestamp = new Date().toISOString()

    console.log(`[CLIENT ${(level || 'info').toUpperCase()}] [${timestamp}] ${message}`)
    if (stack) console.log(`  Stack: ${stack}`)
    if (userAgent) console.log(`  UA: ${userAgent}`)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
