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

interface GallerySession {
  sessionId: string
  lastModified: Date
}

interface GalleryGridProps {
  sessions: GallerySession[]
  isAdmin?: boolean
}

export function GalleryGrid({ sessions, isAdmin = false }: GalleryGridProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [deletedSessions, setDeletedSessions] = useState<Set<string>>(new Set())

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this session?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/delete/${sessionId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setDeletedSessions((prev) => new Set([...prev, sessionId]))
        if (selectedSession === sessionId) {
          setSelectedSession(null)
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const filteredSessions = sessions.filter(
    (s) => !deletedSessions.has(s.sessionId)
  )

  if (filteredSessions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No sessions found
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredSessions.map((session) => (
          <button
            key={session.sessionId}
            onClick={() => setSelectedSession(session.sessionId)}
            className="group relative aspect-[4/5] bg-muted rounded-lg overflow-hidden hover:ring-2 hover:ring-foreground/20 transition-all"
          >
            <img
              src={`/api/files/${session.sessionId}/input.jpg`}
              alt="Session thumbnail"
              className="w-full h-full object-cover"
            />
            {isAdmin && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7"
                onClick={(e) => handleDelete(session.sessionId, e)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
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
