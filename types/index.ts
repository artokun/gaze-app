// Session types
export interface SessionMetadata {
  gridSize: number
  quadrantSize: number
  mobileGridSize: number
  mobileQuadrantSize: number
  imageWidth: number
  imageHeight: number
  mode: 'quadrants' | 'single'
}

export interface Session {
  sessionId: string
  basePath: string
  metadataPath: string
  metadata?: SessionMetadata
  createdAt?: Date
}

export interface SessionHistory {
  sessionId: string
  thumbnailUrl: string
  timestamp: number
}

// GPU types
export type GpuProvisioningStage =
  | 'idle'
  | 'detecting'
  | 'resolving'
  | 'provisioning'
  | 'connecting'
  | 'syncing'
  | 'installing'
  | 'starting'
  | 'weights'
  | 'loading'
  | 'ready'

export interface GpuProvisioningStatus {
  stage: GpuProvisioningStage
  message: string
  progress: number
}

export interface GpuServerStatus {
  status: 'ready' | 'starting' | 'offline'
  message?: string
}

// Queue types
export interface QueueStatus {
  queueLength: number
  isProcessing: boolean
  maxQueueSize: number
  gpuServerReady: boolean
  currentSession?: string | null
}

export interface QueueItem {
  sessionId: string
  socketId: string | null
  removeBackground: boolean
  addedAt: number
}

// Quadrant status types
export type QuadrantStatusType = 'pending' | 'stitching' | 'uploading' | 'done' | 'error'

export interface QuadrantStatus {
  status: QuadrantStatusType
}

// Progress types
export interface GenerationProgress {
  stage: string
  progress: number
  message: string
  current?: number
  total?: number
  quadrants?: QuadrantStatus[]  // Per-quadrant status for stitching/upload visualization
}

export type GenerationLogType =
  | 'stage'
  | 'progress'
  | 'bg_progress'
  | 'save_progress'
  | 'model'
  | 'complete'
  | 'heartbeat'

export interface GenerationLogEntry {
  type: GenerationLogType
  stage?: string
  message?: string
  percent?: number
  elapsed?: number
  model?: string
  timestamp: number
}

// Upload types
export interface UploadResponse {
  success: boolean
  sessionId?: string
  error?: string
  overloaded?: boolean
  queueLength?: number
}

// Session completion
export interface SessionComplete {
  sessionId: string
  basePath: string
  spriteSrc?: string // Full sprite src for widget (comma-separated URLs for CDN)
  metadataPath: string
  gridSize: number
  quadrantSize: number
  mobileGridSize: number
  mobileQuadrantSize: number
  imageWidth: number
  imageHeight: number
  mode: string
  message: string
}

// Socket.IO types
export interface ServerToClientEvents {
  'gpu-status': (status: GpuProvisioningStatus) => void
  'status': (data: { stage: string; message: string }) => void
  'queue': (data: { position: number; message: string }) => void
  'progress': (data: GenerationProgress) => void
  'generation-log': (data: GenerationLogEntry) => void
  'complete': (data: SessionComplete) => void
  'error': (data: { message: string }) => void
}

export interface ClientToServerEvents {
  'upload': (
    fileData: ArrayBuffer,
    filename: string,
    removeBackground: boolean,
    sessionId: string | undefined,
    callback: (response: UploadResponse) => void
  ) => void
}

// Web component types - extend JSX for gaze-tracker
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gaze-tracker': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          smoothing?: string
          'hide-controls'?: boolean | string
          mode?: string
          grid?: string
          width?: string
          height?: string
        },
        HTMLElement
      >
    }
  }
}
