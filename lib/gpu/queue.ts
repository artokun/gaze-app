/**
 * Queue management for GPU processing.
 */

import { EventEmitter } from 'events'
import type { QueueItem, QueueStatus } from '@/types'

const MAX_QUEUE_SIZE = 20

interface InternalQueueItem extends QueueItem {
  inputPath: string
  sessionDir: string
}

class QueueManager extends EventEmitter {
  private queue: InternalQueueItem[] = []
  private currentlyProcessing: InternalQueueItem | null = null
  private gpuServerReady = false

  get length(): number {
    return this.queue.length + (this.currentlyProcessing ? 1 : 0)
  }

  get maxSize(): number {
    return MAX_QUEUE_SIZE
  }

  isFull(): boolean {
    return this.length >= MAX_QUEUE_SIZE
  }

  isProcessing(): boolean {
    return this.currentlyProcessing !== null
  }

  getCurrentSession(): string | null {
    return this.currentlyProcessing?.sessionId || null
  }

  setGpuServerReady(ready: boolean): void {
    this.gpuServerReady = ready
  }

  isGpuReady(): boolean {
    return this.gpuServerReady
  }

  getStatus(): QueueStatus {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing(),
      maxQueueSize: MAX_QUEUE_SIZE,
      gpuServerReady: this.gpuServerReady,
      currentSession: this.getCurrentSession(),
    }
  }

  // Add item to queue
  add(item: {
    sessionId: string
    socketId: string | null
    removeBackground: boolean
    inputPath: string
    sessionDir: string
  }): { position: number; inQueue: boolean } {
    if (this.isFull()) {
      throw new Error('Queue is full')
    }

    const queueItem: InternalQueueItem = {
      ...item,
      addedAt: Date.now(),
    }

    this.queue.push(queueItem)

    const position = this.queue.length + (this.currentlyProcessing ? 1 : 0)
    const inQueue = position > 1 || this.currentlyProcessing !== null

    // Emit event for Socket.IO handler to broadcast
    this.emit('item-added', {
      sessionId: item.sessionId,
      socketId: item.socketId,
      position,
      inQueue,
    })

    // Try to start processing
    this.tryProcess()

    return { position, inQueue }
  }

  // Get queue position for a session
  getPosition(sessionId: string): number | null {
    if (this.currentlyProcessing?.sessionId === sessionId) {
      return 1
    }

    const index = this.queue.findIndex((item) => item.sessionId === sessionId)
    return index >= 0 ? index + 2 : null
  }

  // Try to process next item
  private tryProcess(): void {
    if (this.currentlyProcessing || this.queue.length === 0) {
      return
    }

    const item = this.queue.shift()!
    this.currentlyProcessing = item

    // Update positions for remaining items
    this.queue.forEach((queuedItem, index) => {
      const position = index + 2 // +1 for currently processing, +1 for 1-indexed
      this.emit('position-updated', {
        sessionId: queuedItem.sessionId,
        socketId: queuedItem.socketId,
        position,
      })
    })

    // Emit event to start processing
    this.emit('process-start', {
      sessionId: item.sessionId,
      socketId: item.socketId,
      inputPath: item.inputPath,
      sessionDir: item.sessionDir,
      removeBackground: item.removeBackground,
    })
  }

  // Called when processing is complete (success or failure)
  complete(sessionId: string): void {
    if (this.currentlyProcessing?.sessionId === sessionId) {
      this.currentlyProcessing = null
      this.tryProcess()
    }
  }

  // Remove item from queue (e.g., if client disconnects)
  remove(sessionId: string): boolean {
    // Can't remove currently processing item
    if (this.currentlyProcessing?.sessionId === sessionId) {
      return false
    }

    const index = this.queue.findIndex((item) => item.sessionId === sessionId)
    if (index >= 0) {
      this.queue.splice(index, 1)

      // Update positions for remaining items
      this.queue.forEach((queuedItem, i) => {
        const position = i + 2
        this.emit('position-updated', {
          sessionId: queuedItem.sessionId,
          socketId: queuedItem.socketId,
          position,
        })
      })

      return true
    }

    return false
  }

  // Get socket ID for a session (for broadcasting)
  getSocketId(sessionId: string): string | null {
    if (this.currentlyProcessing?.sessionId === sessionId) {
      return this.currentlyProcessing.socketId
    }

    const item = this.queue.find((item) => item.sessionId === sessionId)
    return item?.socketId || null
  }
}

// Singleton instance
export const queueManager = new QueueManager()
