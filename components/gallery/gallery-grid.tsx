'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GazeTrackerWrapper } from '@/components/viewer/gaze-tracker-wrapper'
import { X, Trash2 } from 'lucide-react'

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

  const handleDelete = async (sessionId: string) => {
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

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredSessions.map((session) => (
          <Card
            key={session.sessionId}
            className="group cursor-pointer hover:shadow-lg transition-shadow"
          >
            <CardContent className="p-2 relative">
              <button
                onClick={() => setSelectedSession(session.sessionId)}
                className="aspect-square w-full rounded overflow-hidden bg-muted"
              >
                <img
                  src={`/uploads/${session.sessionId}/input.jpg`}
                  alt="Session thumbnail"
                  className="w-full h-full object-cover"
                />
              </button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(session.sessionId)
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="bg-background rounded-lg p-6 max-w-lg w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => setSelectedSession(null)}
            >
              <X className="w-4 h-4" />
            </Button>

            <GazeTrackerWrapper
              src={`/uploads/${selectedSession}/gaze_output/q0.webp,/uploads/${selectedSession}/gaze_output/q1.webp,/uploads/${selectedSession}/gaze_output/q2.webp,/uploads/${selectedSession}/gaze_output/q3.webp`}
            />

            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  window.open(`/${selectedSession}`, '_blank')
                }
              >
                View Full Page
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(`/${selectedSession}/view`, '_blank')
                }
              >
                Fullscreen
              </Button>
            </div>
          </div>
        </div>
      )}

      {filteredSessions.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          No sessions found
        </div>
      )}
    </>
  )
}
