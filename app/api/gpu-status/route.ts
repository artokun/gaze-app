import { NextResponse } from 'next/server'
import axios from 'axios'
import { queueManager } from '@/lib/gpu/queue'

// This needs to import from the manager to get the current URL
// But we can't easily since the URL is mutable. For now, use env or default.
const GPU_SERVER_PORT = 8080
const GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`

export async function GET() {
  try {
    const response = await axios.get(`${GPU_SERVER_URL}/health`, {
      timeout: 5000,
    })
    return NextResponse.json({ status: 'ready', ...response.data })
  } catch {
    const isStarting = !queueManager.isGpuReady()
    return NextResponse.json({
      status: isStarting ? 'starting' : 'offline',
    })
  }
}
