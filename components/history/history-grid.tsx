'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Trash2, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface HistoryItem {
  sessionId: string
  thumbnailUrl: string
  timestamp: number
}

interface HistoryGridProps {
  initialHistory: HistoryItem[]
  onRemove: (sessionId: string) => void
}

export function HistoryGrid({ initialHistory, onRemove }: HistoryGridProps) {
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  const handleRemove = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Remove from local state
    setHistory((prev) => prev.filter((h) => h.sessionId !== sessionId))

    // Remove from localStorage
    onRemove(sessionId)

    // Close modal if viewing this session
    if (selectedSession === sessionId) {
      setSelectedSession(null)
    }
  }

  if (history.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p className="mb-2">No history yet</p>
        <p className="text-sm">Your generated gazes will appear here</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {history.map((item) => (
          <button
            key={item.sessionId}
            onClick={() => setSelectedSession(item.sessionId)}
            className="group relative aspect-[4/5] bg-muted rounded-lg overflow-hidden hover:ring-2 hover:ring-foreground/20 transition-all"
          >
            <img
              src={item.thumbnailUrl}
              alt="Session thumbnail"
              className="w-full h-full object-cover"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7"
              onClick={(e) => handleRemove(item.sessionId, e)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-xs truncate">
                {new Date(item.timestamp).toLocaleDateString()}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Modal */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <VisuallyHidden>
            <DialogHeader>
              <DialogTitle>Session Preview</DialogTitle>
              <DialogDescription>Interactive gaze tracker preview with navigation options</DialogDescription>
            </DialogHeader>
          </VisuallyHidden>
          {selectedSession && (
            <>
              <div className="aspect-[4/5] bg-muted">
                {/* @ts-expect-error - gaze-tracker is a custom web component */}
                <gaze-tracker
                  src={`/api/files/${selectedSession}/gaze_output/`}
                  hide-controls=""
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <div className="p-4 flex justify-center gap-2">
                <Link href={`/${selectedSession}`}>
                  <Button variant="outline">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Session
                  </Button>
                </Link>
                <Link href={`/${selectedSession}/view`}>
                  <Button>
                    Fullscreen
                  </Button>
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
