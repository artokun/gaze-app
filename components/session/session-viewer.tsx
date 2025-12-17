'use client'

import { useEffect, useState, useRef } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, Cpu, Image, Layers, Download, Package, Check, Rocket, Server, Wifi } from 'lucide-react'

interface SessionViewerProps {
  sessionId: string
  isReady: boolean
  spriteSrc?: string  // CDN sprite src (comma-separated URLs) from server
}

// Stage configuration with user-friendly info
const stageConfig: Record<string, {
  icon: React.ReactNode
  title: string
  description: string
  estimate: string
}> = {
  // GPU provisioning stages (cold start)
  gpu_idle: {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Starting GPU',
    description: 'Initializing GPU server...',
    estimate: '~1-2 min for cold start',
  },
  gpu_detecting: {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Detecting',
    description: 'Detecting project configuration...',
    estimate: '~1-2 min for cold start',
  },
  gpu_resolving: {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Resolving',
    description: 'Finding available GPU pod...',
    estimate: '~1-2 min for cold start',
  },
  gpu_provisioning: {
    icon: <Rocket className="w-5 h-5" />,
    title: 'Provisioning GPU',
    description: 'Allocating RTX 4090 on RunPod',
    estimate: '~30-60s',
  },
  gpu_connecting: {
    icon: <Wifi className="w-5 h-5" />,
    title: 'Connecting',
    description: 'Establishing secure tunnel to GPU',
    estimate: '~10s',
  },
  gpu_syncing: {
    icon: <Download className="w-5 h-5" />,
    title: 'Syncing',
    description: 'Uploading code to GPU pod',
    estimate: '~15s',
  },
  gpu_installing: {
    icon: <Download className="w-5 h-5" />,
    title: 'Installing',
    description: 'Installing Python dependencies',
    estimate: '~30s',
  },
  gpu_starting: {
    icon: <Server className="w-5 h-5" />,
    title: 'Starting Server',
    description: 'Launching gaze generation service',
    estimate: '~10s',
  },
  gpu_weights: {
    icon: <Download className="w-5 h-5" />,
    title: 'Downloading Models',
    description: 'Fetching AI model weights (~2GB)',
    estimate: '~30s (first time only)',
  },
  gpu_loading: {
    icon: <Server className="w-5 h-5" />,
    title: 'Loading Models',
    description: 'Loading AI models into GPU memory',
    estimate: '~15s',
  },
  // Upload/generation stages
  uploading: {
    icon: <Upload className="w-5 h-5" />,
    title: 'Uploading',
    description: 'Sending your image to the GPU server',
    estimate: '~2s',
  },
  preparing: {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Preparing',
    description: 'Analyzing face and setting up generation',
    estimate: '~3s',
  },
  loading: {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Loading Models',
    description: 'Loading AI models into GPU memory',
    estimate: '~5s',
  },
  generating: {
    icon: <Image className="w-5 h-5" />,
    title: 'Generating Gazes',
    description: 'Creating 900 gaze variations with LivePortrait AI',
    estimate: '~15s',
  },
  removing_bg: {
    icon: <Layers className="w-5 h-5" />,
    title: 'Removing Backgrounds',
    description: 'Processing transparency for each image',
    estimate: '~20s',
  },
  saving: {
    icon: <Package className="w-5 h-5" />,
    title: 'Creating Sprite Sheets',
    description: 'Stitching 900 images into 8 optimized quadrant sheets',
    estimate: '~60s (slowest step)',
  },
  stitching: {
    icon: <Package className="w-5 h-5" />,
    title: 'Creating Sprite Sheets',
    description: 'Stitching 900 images into 8 optimized quadrant sheets',
    estimate: '~60s (slowest step)',
  },
  encoding: {
    icon: <Package className="w-5 h-5" />,
    title: 'Compressing',
    description: 'Encoding sprite sheets to WebP format',
    estimate: '~10s',
  },
  compressing: {
    icon: <Package className="w-5 h-5" />,
    title: 'Compressing',
    description: 'Encoding sprite sheets to WebP format',
    estimate: '~10s',
  },
  uploading_r2: {
    icon: <Upload className="w-5 h-5" />,
    title: 'Uploading to R2',
    description: 'Distributing sprites globally',
    estimate: '~5s',
  },
  uploading_cdn: {
    icon: <Upload className="w-5 h-5" />,
    title: 'Uploading to CDN',
    description: 'Distributing sprites globally',
    estimate: '~5s',
  },
  complete: {
    icon: <Check className="w-5 h-5" />,
    title: 'Finalizing',
    description: 'Almost done...',
    estimate: '~2s',
  },
  downloading: {
    icon: <Download className="w-5 h-5" />,
    title: 'Downloading',
    description: 'Transferring sprite sheets from GPU',
    estimate: '~5s',
  },
  extracting: {
    icon: <Package className="w-5 h-5" />,
    title: 'Extracting',
    description: 'Unpacking and verifying sprite sheets',
    estimate: '~2s',
  },
  cdn_upload: {
    icon: <Upload className="w-5 h-5" />,
    title: 'CDN Upload',
    description: 'Distributing sprites globally for fast loading',
    estimate: '~5s',
  },
  done: {
    icon: <Check className="w-5 h-5" />,
    title: 'Complete!',
    description: 'Your gaze tracker is ready',
    estimate: '',
  },
}

// Get stage info with fallback
function getStageInfo(stage: string | undefined) {
  if (!stage) return stageConfig.preparing
  return stageConfig[stage] || {
    icon: <Cpu className="w-5 h-5" />,
    title: stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, ' '),
    description: 'Processing...',
    estimate: '',
  }
}

export function SessionViewer({ sessionId, isReady: initialReady, spriteSrc: serverSpriteSrc }: SessionViewerProps) {
  const { progress, completedSession, logs, pendingUpload, upload, gpuStatus } = useSocket()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadStarted, setUploadStarted] = useState(false)
  const uploadStartedRef = useRef(false)

  // Handle pending upload - show preview and start upload
  useEffect(() => {
    if (pendingUpload && pendingUpload.sessionId === sessionId && !uploadStartedRef.current) {
      uploadStartedRef.current = true
      setUploadStarted(true)
      setPreviewUrl(pendingUpload.previewUrl)

      // Start the actual upload - pass sessionId so server uses the same one
      upload(pendingUpload.file, false, sessionId).then((response) => {
        if (!response.success) {
          console.error('Upload failed:', response.error)
        } else {
          // Save to history now that image is uploaded
          saveToHistory(sessionId)
        }
      })
    }
  }, [pendingUpload, sessionId, upload])

  // Warn user when closing during upload or generation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadStarted || progress !== null) {
        e.preventDefault();
        e.returnValue = 'Upload/generation in progress. Closing will cancel it. Are you sure?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploadStarted, progress]);

  // Check if this session is currently generating or has completed
  const isUploading = uploadStarted && progress === null && !initialReady
  const isGenerating = progress !== null
  const isComplete = initialReady || (completedSession?.sessionId === sessionId)

  // Use preview URL if available, otherwise server URL
  const imageUrl = previewUrl || `/api/files/${sessionId}/input.jpg`

  // Save to localStorage when generation completes
  useEffect(() => {
    if (completedSession?.sessionId === sessionId) {
      saveToHistory(sessionId)
    }
  }, [completedSession, sessionId])

  // Fallback: Poll for completion when stuck at "complete" stage
  // This handles cases where the socket event doesn't arrive (reconnection, etc)
  const [pollingComplete, setPollingComplete] = useState(false)
  useEffect(() => {
    // Only poll if we're at "complete" stage but haven't received completedSession
    if (progress?.stage === 'complete' && !completedSession && !pollingComplete) {
      let attempts = 0
      const maxAttempts = 10
      const pollInterval = setInterval(async () => {
        attempts++
        try {
          const response = await fetch(`/api/session/${sessionId}`)
          if (response.ok) {
            const data = await response.json()
            if (data.isReady) {
              // Session is ready! Trigger a page transition
              console.log('Polling detected session complete, refreshing...')
              setPollingComplete(true)
              clearInterval(pollInterval)
              // Force refresh to get the server-rendered ready state
              window.location.reload()
            }
          }
        } catch (err) {
          console.error('Polling error:', err)
        }
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
        }
      }, 2000) // Poll every 2 seconds

      return () => clearInterval(pollInterval)
    }
  }, [progress?.stage, completedSession, sessionId, pollingComplete])

  // Also save to history on mount if ready
  useEffect(() => {
    if (initialReady) {
      saveToHistory(sessionId)
    }
  }, [initialReady, sessionId])

  const saveToHistory = (id: string) => {
    try {
      const history = JSON.parse(localStorage.getItem('gazeHistory') || '[]')
      const exists = history.some((h: { sessionId: string }) => h.sessionId === id)
      if (!exists) {
        const newEntry = {
          sessionId: id,
          thumbnailUrl: `/api/files/${id}/input.jpg`,
          timestamp: Date.now(),
        }
        const updated = [newEntry, ...history].slice(0, 20) // Keep last 20
        localStorage.setItem('gazeHistory', JSON.stringify(updated))
      }
    } catch {
      // localStorage not available
    }
  }

  // Show the gaze tracker if ready
  if (isComplete && !isGenerating) {
    // Use CDN spriteSrc: from completion event, from server props, or fall back to local API path
    const src = completedSession?.spriteSrc  // From fresh generation completion
      || serverSpriteSrc  // From server (page reload with CDN configured)
      || (sessionId === 'demo'
        ? `/api/files/${sessionId}/`
        : `/api/files/${sessionId}/gaze_output/`)

    return (
      <div className="w-full h-full flex items-center justify-center">
        {/* @ts-expect-error - gaze-tracker is a custom web component */}
        <gaze-tracker
          src={src}
          style={{ width: '100%', height: '100%', maxWidth: '100%' }}
        />
      </div>
    )
  }

  // Show input image with generation progress overlay
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Input image as background */}
      <div className="relative aspect-[4/5] h-full max-w-full">
        <img
          src={imageUrl}
          alt="Your uploaded portrait"
          className="w-full h-full object-contain rounded-lg"
        />

        {/* Progress overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center p-6">
          {(() => {
            // Determine what stage to show
            // Priority: progress > GPU provisioning > uploading
            let stageInfo
            let showGpuProgress = false

            if (progress) {
              // Active generation progress
              stageInfo = getStageInfo(progress.stage)
            } else if (isUploading && gpuStatus.stage !== 'ready' && gpuStatus.stage !== 'idle') {
              // GPU is provisioning during upload - show GPU status
              stageInfo = stageConfig[`gpu_${gpuStatus.stage}`] || {
                icon: <Cpu className="w-5 h-5" />,
                title: gpuStatus.message || 'Starting GPU',
                description: 'Preparing GPU server for generation',
                estimate: '~1-2 min for cold start',
              }
              showGpuProgress = true
            } else if (isUploading) {
              stageInfo = stageConfig.uploading
            } else {
              stageInfo = getStageInfo(undefined)
            }

            return (
              <>
                {/* Icon with spinner ring */}
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white">
                    {stageInfo.icon}
                  </div>
                  <Loader2 className="w-16 h-16 text-white/30 animate-spin absolute inset-0" />
                </div>

                {/* Stage title */}
                <h3 className="text-white text-lg font-semibold mb-1">
                  {stageInfo.title}
                </h3>

                {/* Description */}
                <p className="text-white/70 text-sm mb-1 text-center max-w-xs">
                  {stageInfo.description}
                </p>

                {/* Time estimate */}
                {stageInfo.estimate && (
                  <p className="text-white/50 text-xs mb-4">
                    {stageInfo.estimate}
                  </p>
                )}

                {/* Progress bar - show for GPU progress or generation progress */}
                {(showGpuProgress || progress) && (
                  <div className="w-full max-w-xs space-y-2">
                    <Progress value={showGpuProgress ? gpuStatus.progress : (progress?.progress || 0)} className="h-2" />
                    <div className="flex justify-between text-xs text-white/60">
                      <span>
                        {showGpuProgress
                          ? gpuStatus.message || 'Starting GPU...'
                          : progress?.stage === 'generating' && progress?.current && progress?.total
                            ? `${progress.current} / ${progress.total} images`
                            : progress?.stage === 'saving' && progress?.message
                              ? progress.message
                              : progress?.message || 'Processing...'}
                      </span>
                      <span>{Math.round(showGpuProgress ? gpuStatus.progress : (progress?.progress || 0))}%</span>
                    </div>
                  </div>
                )}

                {/* Quadrant progress visualization for stitching stage */}
                {(progress?.stage === 'saving' || progress?.stage === 'stitching' || progress?.stage === 'uploading') && (
                  <div className="mt-4 w-full max-w-xs">
                    {(() => {
                      // Get quadrant statuses from progress data
                      const quadrants = progress?.quadrants
                      const hasQuadrantData = quadrants && quadrants.length === 8

                      // Helper to get color class based on status
                      const getQuadrantClass = (q: number) => {
                        if (!hasQuadrantData) {
                          return 'bg-white/5 border-white/10 animate-pulse'
                        }
                        const status = quadrants[q]?.status
                        switch (status) {
                          case 'done':
                            return 'bg-green-500/60 border-green-400'
                          case 'uploading':
                            return 'bg-orange-500/60 border-orange-400 animate-pulse'
                          case 'stitching':
                            return 'bg-blue-500/60 border-blue-400 animate-pulse'
                          case 'error':
                            return 'bg-red-500/60 border-red-400'
                          case 'pending':
                          default:
                            return 'bg-white/10 border-white/20'
                        }
                      }

                      return (
                        <>
                          <div className="flex items-center justify-center gap-4 mb-3">
                            {/* Desktop quadrants (larger) */}
                            <div className="text-center">
                              <div className="grid grid-cols-2 gap-1 mb-1">
                                {[0, 1, 2, 3].map((q) => (
                                  <div
                                    key={q}
                                    className={`w-8 h-8 rounded border-2 transition-all duration-300 ${getQuadrantClass(q)}`}
                                  />
                                ))}
                              </div>
                              <p className="text-white/50 text-[10px]">Desktop 30×30</p>
                            </div>

                            {/* Mobile quadrants (smaller) */}
                            <div className="text-center">
                              <div className="grid grid-cols-2 gap-1 mb-1">
                                {[4, 5, 6, 7].map((q) => (
                                  <div
                                    key={q}
                                    className={`w-6 h-6 rounded border-2 transition-all duration-300 ${getQuadrantClass(q)}`}
                                  />
                                ))}
                              </div>
                              <p className="text-white/50 text-[10px]">Mobile 20×20</p>
                            </div>
                          </div>

                          {/* Legend */}
                          <div className="flex items-center justify-center gap-3 mb-2 text-[10px]">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded bg-blue-500/60 border border-blue-400"></span>
                              <span className="text-white/50">Stitching</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded bg-orange-500/60 border border-orange-400"></span>
                              <span className="text-white/50">Uploading</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded bg-green-500/60 border border-green-400"></span>
                              <span className="text-white/50">Done</span>
                            </span>
                          </div>

                          <p className="text-white/40 text-[10px] text-center leading-relaxed">
                            Uploading directly to CDN as each sprite is generated
                          </p>
                        </>
                      )
                    })()}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
