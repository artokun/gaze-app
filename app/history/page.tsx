'use client'

import { useEffect, useState } from 'react'
import { HistoryGrid } from '@/components/history/history-grid'
import { Button } from '@/components/ui/button'
import { Home, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface HistoryItem {
  sessionId: string
  thumbnailUrl: string
  timestamp: number
}

const HISTORY_KEY = 'gazeHistory'

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch {
      // Ignore localStorage errors
    }
    setLoaded(true)
  }, [])

  const handleRemove = (sessionId: string) => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) {
        const current: HistoryItem[] = JSON.parse(stored)
        const updated = current.filter((h) => h.sessionId !== sessionId)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
        setHistory(updated)
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  const handleClearAll = () => {
    if (!confirm('Are you sure you want to clear all history?')) {
      return
    }
    try {
      localStorage.removeItem(HISTORY_KEY)
      setHistory([])
    } catch {
      // Ignore localStorage errors
    }
  }

  if (!loaded) {
    return (
      <main className="h-dvh flex flex-col overflow-hidden bg-background">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 overflow-auto">
        <div className="max-w-6xl mx-auto py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">
              Your History
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                ({history.length} {history.length === 1 ? 'gaze' : 'gazes'})
              </span>
            </h1>
            {history.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          <HistoryGrid initialHistory={history} onRemove={handleRemove} />
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3">
        <div className="flex items-center justify-center max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
