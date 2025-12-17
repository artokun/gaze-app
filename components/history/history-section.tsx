'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SessionHistory } from '@/types'

const HISTORY_KEY = 'gaze-tracker-history'
const MAX_HISTORY = 20

export function HistorySection() {
  const [history, setHistory] = useState<SessionHistory[]>([])
  const router = useRouter()

  useEffect(() => {
    // Load history from localStorage
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as SessionHistory[]
        setHistory(parsed.slice(0, MAX_HISTORY))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  if (history.length === 0) {
    return null
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Your Previous Gazes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
          {history.map((item) => (
            <button
              key={item.sessionId}
              onClick={() => router.push(`/${item.sessionId}`)}
              className="aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition-all"
            >
              <img
                src={item.thumbnailUrl}
                alt="Previous gaze"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Helper to add to history
export function addToHistory(sessionId: string, thumbnailUrl: string): void {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    const history: SessionHistory[] = stored ? JSON.parse(stored) : []

    // Remove if already exists
    const filtered = history.filter((h) => h.sessionId !== sessionId)

    // Add to front
    filtered.unshift({
      sessionId,
      thumbnailUrl,
      timestamp: Date.now(),
    })

    // Limit size
    const trimmed = filtered.slice(0, MAX_HISTORY)

    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore localStorage errors
  }
}
