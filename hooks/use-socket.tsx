'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  GpuProvisioningStatus,
  GenerationProgress,
  GenerationLogEntry,
  SessionComplete,
  UploadResponse,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

interface PendingUpload {
  sessionId: string
  file: File
  previewUrl: string
}

interface SocketContextValue {
  socket: TypedSocket | null
  isConnected: boolean
  gpuStatus: GpuProvisioningStatus
  uploadStatus: { stage: string; message: string } | null
  queuePosition: { position: number; message: string } | null
  progress: GenerationProgress | null
  logs: GenerationLogEntry[]
  completedSession: SessionComplete | null
  error: string | null
  pendingUpload: PendingUpload | null
  upload: (
    file: File,
    removeBackground: boolean,
    sessionId?: string
  ) => Promise<UploadResponse>
  startUpload: (file: File) => string // Returns sessionId immediately
  clearState: () => void
}

const defaultGpuStatus: GpuProvisioningStatus = {
  stage: 'idle',
  message: '',
  progress: 0,
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<TypedSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [gpuStatus, setGpuStatus] = useState<GpuProvisioningStatus>(defaultGpuStatus)
  const [uploadStatus, setUploadStatus] = useState<{
    stage: string
    message: string
  } | null>(null)
  const [queuePosition, setQueuePosition] = useState<{
    position: number
    message: string
  } | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [logs, setLogs] = useState<GenerationLogEntry[]>([])
  const [completedSession, setCompletedSession] = useState<SessionComplete | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)

  // Initialize socket connection
  useEffect(() => {
    const socketInstance = io() as TypedSocket

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id)
      setIsConnected(true)
    })

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected')
      setIsConnected(false)
    })

    socketInstance.on('gpu-status', (status) => {
      setGpuStatus(status)
    })

    socketInstance.on('status', (data) => {
      setUploadStatus(data)
    })

    socketInstance.on('queue', (data) => {
      setQueuePosition(data)
    })

    socketInstance.on('progress', (data) => {
      setProgress(data)
    })

    socketInstance.on('generation-log', (entry) => {
      setLogs((prev) => [...prev, entry])
    })

    socketInstance.on('complete', (data) => {
      setCompletedSession(data)
      setProgress(null)
      setQueuePosition(null)
    })

    socketInstance.on('error', (data) => {
      setError(data.message)
      setProgress(null)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  // Generate a session ID
  const generateSessionId = useCallback(() => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 11)
    return `session_${timestamp}_${random}`
  }, [])

  // Start upload - returns sessionId immediately for navigation
  const startUpload = useCallback(
    (file: File): string => {
      const sessionId = generateSessionId()
      const previewUrl = URL.createObjectURL(file)

      // Clear previous state
      setUploadStatus(null)
      setQueuePosition(null)
      setProgress(null)
      setLogs([])
      setCompletedSession(null)
      setError(null)

      // Store pending upload for session page to pick up
      setPendingUpload({ sessionId, file, previewUrl })

      return sessionId
    },
    [generateSessionId]
  )

  // Actually perform the upload (called from session page)
  const upload = useCallback(
    (file: File, removeBackground: boolean, sessionId?: string): Promise<UploadResponse> => {
      return new Promise((resolve) => {
        if (!socket) {
          resolve({
            success: false,
            error: 'Socket not connected',
          })
          return
        }

        // Clear pending upload since we're now uploading
        setPendingUpload(null)

        // Read file as ArrayBuffer
        const reader = new FileReader()
        reader.onload = (e) => {
          const fileData = e.target?.result as ArrayBuffer
          // Pass sessionId to server so it uses the same one
          socket.emit('upload', fileData, file.name, removeBackground, sessionId, (response) => {
            resolve(response)
          })
        }
        reader.onerror = () => {
          resolve({
            success: false,
            error: 'Failed to read file',
          })
        }
        reader.readAsArrayBuffer(file)
      })
    },
    [socket]
  )

  // Clear state
  const clearState = useCallback(() => {
    setUploadStatus(null)
    setQueuePosition(null)
    setProgress(null)
    setLogs([])
    setCompletedSession(null)
    setError(null)
  }, [])

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        gpuStatus,
        uploadStatus,
        queuePosition,
        progress,
        logs,
        completedSession,
        error,
        pendingUpload,
        upload,
        startUpload,
        clearState,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
