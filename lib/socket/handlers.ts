/**
 * Socket.IO event handlers.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  GpuProvisioningStatus,
  UploadResponse,
} from '@/types'
import { queueManager } from '../gpu/queue'
import {
  getProvisioningStatus,
  setBroadcastCallback,
  setEmitToSocketCallback,
} from '../gpu/manager'
import {
  processImage,
  saveSessionImage,
  generateSessionId,
  validateUpload,
} from '../upload/processor'

type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents>
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>

let io: TypedServer | null = null

// Get the Socket.IO server instance
export function getIO(): TypedServer | null {
  return io
}

// Emit to a specific socket by ID
function emitToSocket(socketId: string, event: string, data: unknown): void {
  if (io) {
    io.to(socketId).emit(event as keyof ServerToClientEvents, data as never)
  }
}

// Setup Socket.IO event handlers
export function setupSocketHandlers(server: TypedServer): void {
  io = server

  // Set up GPU manager callbacks
  setBroadcastCallback((status: GpuProvisioningStatus) => {
    io?.emit('gpu-status', status)
  })

  setEmitToSocketCallback(emitToSocket)

  // Set up queue event handlers
  queueManager.on('item-added', ({ socketId, position, inQueue }) => {
    if (socketId && inQueue) {
      emitToSocket(socketId, 'queue', {
        position,
        message: `You are #${position} in queue`,
      })
    }
  })

  queueManager.on('position-updated', ({ socketId, position }) => {
    if (socketId) {
      emitToSocket(socketId, 'queue', {
        position,
        message: `You are #${position} in queue`,
      })
    }
  })

  // Handle client connections
  io.on('connection', (socket: TypedSocket) => {
    console.log('Client connected:', socket.id)

    // Send current GPU status to newly connected client
    socket.emit('gpu-status', getProvisioningStatus())

    // Handle file upload
    socket.on('upload', async (fileData, filename, removeBackground, clientSessionId, callback) => {
      try {
        // Validate queue capacity
        if (queueManager.isFull()) {
          const response: UploadResponse = {
            success: false,
            error: 'Server is currently overloaded. Please try again later.',
            overloaded: true,
            queueLength: queueManager.length,
          }
          callback(response)
          return
        }

        // Validate file
        const validation = validateUpload({
          size: fileData.byteLength,
          name: filename,
        })

        if (!validation.valid) {
          callback({
            success: false,
            error: validation.error,
          })
          return
        }

        // Use client's session ID if provided, otherwise generate one
        const sessionId = clientSessionId || generateSessionId()

        // Process image
        const buffer = Buffer.from(fileData)
        const processed = await processImage(buffer)

        // Save image
        const { inputPath, sessionDir } = await saveSessionImage(
          sessionId,
          processed.buffer
        )

        // Notify client of successful upload
        socket.emit('status', { stage: 'uploaded', message: 'Image uploaded' })
        callback({ success: true, sessionId })

        // Add to queue
        const { position, inQueue } = queueManager.add({
          sessionId,
          socketId: socket.id,
          removeBackground,
          inputPath,
          sessionDir,
        })

        // Send queue position if not immediately processing
        if (inQueue) {
          socket.emit('queue', {
            position,
            message: `You are #${position} in queue`,
          })
        }
      } catch (error) {
        console.error('Upload error:', error)
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        })
      }
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
      // Note: We don't remove from queue on disconnect to allow reconnection
      // The session will complete regardless of socket connection
    })
  })
}

// Broadcast to all connected clients
export function broadcast(event: keyof ServerToClientEvents, data: unknown): void {
  if (io) {
    io.emit(event, data as never)
  }
}
