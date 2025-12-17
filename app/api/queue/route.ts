import { NextResponse } from 'next/server'
import { queueManager } from '@/lib/gpu/queue'

export async function GET() {
  return NextResponse.json(queueManager.getStatus())
}
