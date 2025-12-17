/**
 * In-memory store for tracking generation progress.
 * Used for REST API polling when Socket.IO is not available.
 */

import type { GenerationProgress, GenerationLogEntry } from '@/types'

interface SessionProgress {
  progress: GenerationProgress
  logs: GenerationLogEntry[]
  updatedAt: number
}

class ProgressStore {
  private store: Map<string, SessionProgress> = new Map()
  private readonly maxAge = 60 * 60 * 1000 // 1 hour

  // Update progress for a session
  update(sessionId: string, progress: Partial<GenerationProgress>): void {
    const existing = this.store.get(sessionId)
    const currentProgress = existing?.progress || {
      stage: 'queued',
      progress: 0,
      message: 'Waiting to start...',
    }

    this.store.set(sessionId, {
      progress: { ...currentProgress, ...progress },
      logs: existing?.logs || [],
      updatedAt: Date.now(),
    })

    this.cleanup()
  }

  // Add a log entry
  addLog(sessionId: string, entry: GenerationLogEntry): void {
    const existing = this.store.get(sessionId)
    const logs = existing?.logs || []

    this.store.set(sessionId, {
      progress: existing?.progress || {
        stage: 'queued',
        progress: 0,
        message: 'Waiting to start...',
      },
      logs: [...logs, entry],
      updatedAt: Date.now(),
    })
  }

  // Get progress for a session
  get(sessionId: string): GenerationProgress | null {
    return this.store.get(sessionId)?.progress || null
  }

  // Get logs for a session
  getLogs(sessionId: string): GenerationLogEntry[] {
    return this.store.get(sessionId)?.logs || []
  }

  // Remove a session
  remove(sessionId: string): void {
    this.store.delete(sessionId)
  }

  // Mark session as complete
  complete(sessionId: string): void {
    this.update(sessionId, {
      stage: 'complete',
      progress: 100,
      message: 'Generation complete!',
    })
  }

  // Mark session as failed
  fail(sessionId: string, error: string): void {
    this.update(sessionId, {
      stage: 'error',
      progress: 0,
      message: error,
    })
  }

  // Cleanup old entries
  private cleanup(): void {
    const now = Date.now()
    for (const [sessionId, data] of this.store.entries()) {
      if (now - data.updatedAt > this.maxAge) {
        this.store.delete(sessionId)
      }
    }
  }
}

export const progressStore = new ProgressStore()
