/**
 * GPU server management - spawns and manages the remote GPU pod.
 */

import { spawn, ChildProcess } from 'child_process'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import unzipper from 'unzipper'
import type { GpuProvisioningStatus, SessionComplete } from '@/types'
import { queueManager } from './queue'
import { progressStore } from './progress-store'
import { getSessionPath } from '../storage/local'
import { saveImage, useR2, getBasePath, getSpriteSrc, getR2Credentials } from '../storage'

// GPU server configuration
let GPU_SERVER_PORT = 8080
let GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`
const GPU_CLI = process.env.GPU_CLI || 'gpu'

// GPU pod state
let gpuServerProcess: ChildProcess | null = null
let gpuServerReady = false
let gpuServerStarting = false
let gpuProvisioningStatus: GpuProvisioningStatus = {
  stage: 'idle',
  message: '',
  progress: 0,
}

// Callback for broadcasting status
let broadcastCallback: ((status: GpuProvisioningStatus) => void) | null = null
let emitToSocketCallback:
  | ((socketId: string, event: string, data: unknown) => void)
  | null = null

// Set broadcast callback
export function setBroadcastCallback(
  callback: (status: GpuProvisioningStatus) => void
): void {
  broadcastCallback = callback
}

// Set emit to socket callback
export function setEmitToSocketCallback(
  callback: (socketId: string, event: string, data: unknown) => void
): void {
  emitToSocketCallback = callback
}

// Broadcast GPU status
function broadcastGpuStatus(
  stage: GpuProvisioningStatus['stage'],
  message: string,
  progress = 0
): void {
  gpuProvisioningStatus = { stage, message, progress }
  if (broadcastCallback) {
    broadcastCallback(gpuProvisioningStatus)
  }

  if (stage === 'ready') {
    gpuServerReady = true
    gpuServerStarting = false
    queueManager.setGpuServerReady(true)
  }
}

// Get current provisioning status
export function getProvisioningStatus(): GpuProvisioningStatus {
  return gpuProvisioningStatus
}

// Parse GPU CLI output for status updates
function parseGpuOutput(output: string): void {
  if (output.includes('Detecting project')) {
    broadcastGpuStatus('detecting', 'Detecting project...', 5)
  } else if (output.includes('Resolving')) {
    broadcastGpuStatus('resolving', 'Resolving pod configuration...', 10)
  } else if (output.includes('reprovisioning')) {
    broadcastGpuStatus('provisioning', 'Provisioning new GPU pod...', 15)
  } else if (output.includes('Using pod')) {
    const podMatch = output.match(/Using pod (\w+)/)
    const podId = podMatch ? podMatch[1].substring(0, 8) : ''
    broadcastGpuStatus('connecting', `Connecting to pod ${podId}...`, 20)
  } else if (output.includes('Connecting') && !output.includes('GPU server')) {
    broadcastGpuStatus('connecting', 'Establishing connection...', 25)
  } else if (output.includes('Syncing')) {
    const syncMatch = output.match(/Syncing (\d+)\/(\d+) files/)
    if (syncMatch) {
      const current = parseInt(syncMatch[1])
      const total = parseInt(syncMatch[2])
      const syncProgress =
        30 + Math.min(20, (current / Math.max(total, 1)) * 20)
      broadcastGpuStatus('syncing', `Syncing files (${current}/${total})...`, syncProgress)
    } else {
      broadcastGpuStatus('syncing', 'Syncing workspace...', 30)
    }
  } else if (
    output.includes('Installing dependencies') ||
    output.includes('Installing Python deps')
  ) {
    broadcastGpuStatus('installing', 'Installing dependencies...', 55)
  } else if (output.includes('Downloading') || output.includes('Downloaded')) {
    broadcastGpuStatus('installing', 'Downloading packages...', 60)
  } else if (output.includes('Running:')) {
    broadcastGpuStatus('starting', 'Starting GPU server...', 70)
  } else if (output.includes('Downloading LivePortrait weights')) {
    broadcastGpuStatus('weights', 'Downloading AI model weights...', 75)
  } else if (output.includes('Fetching') && output.includes('files')) {
    const fetchMatch = output.match(/(\d+)%/)
    if (fetchMatch) {
      const pct = parseInt(fetchMatch[1])
      const progress = 75 + pct * 0.15
      broadcastGpuStatus('weights', `Downloading model weights (${pct}%)...`, progress)
    }
  } else if (
    output.includes('Loading LivePortrait models') ||
    output.includes('STAGE:loading')
  ) {
    broadcastGpuStatus('loading', 'Loading AI models...', 90)
  } else if (
    output.includes('Models loaded successfully') ||
    output.includes('STAGE:models_loaded')
  ) {
    broadcastGpuStatus('ready', 'GPU server ready!', 100)
  }
}

// Start the GPU server
export async function startGpuServer(): Promise<void> {
  if (gpuServerReady || gpuServerStarting) {
    return
  }

  gpuServerStarting = true
  console.log('Starting GPU server on remote pod...')

  try {
    gpuServerProcess = spawn(
      GPU_CLI,
      [
        'run',
        '--force-sync',
        '--publish',
        `${GPU_SERVER_PORT}:8000`,
        'python',
        'gaze_server.py',
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    gpuServerProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('[GPU]', output.trim())
      parseGpuOutput(output)

      // Check for port remapping
      const portMatch = output.match(/Remote \d+ -> http:\/\/localhost:(\d+)/)
      if (portMatch) {
        const newPort = parseInt(portMatch[1])
        if (newPort !== GPU_SERVER_PORT) {
          console.log(`GPU server port remapped: ${GPU_SERVER_PORT} -> ${newPort}`)
          GPU_SERVER_PORT = newPort
          GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`
        }
      }

      // Check for server ready
      if (
        output.includes('Uvicorn running') ||
        output.includes('Application startup complete')
      ) {
        gpuServerReady = true
        gpuServerStarting = false
        console.log('GPU server is ready!')
        broadcastGpuStatus('ready', 'GPU server ready!', 100)
      }
    })

    gpuServerProcess.stderr?.on('data', (data) => {
      const output = data.toString()

      // Filter out noisy warnings
      const isNoise =
        output.includes('Unknown RunPod GPU') ||
        output.includes('not found in database') ||
        output.includes('WARN') ||
        output.includes('forward_connection') ||
        output.includes('output supervisor lookup failed')

      if (!isNoise) {
        console.error('[GPU stderr]', output.trim())
      }

      parseGpuOutput(output)

      // Check stderr for port remapping too
      const portMatch = output.match(/Remote \d+ -> http:\/\/localhost:(\d+)/)
      if (portMatch) {
        const newPort = parseInt(portMatch[1])
        if (newPort !== GPU_SERVER_PORT) {
          console.log(`GPU server port remapped: ${GPU_SERVER_PORT} -> ${newPort}`)
          GPU_SERVER_PORT = newPort
          GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`
        }
      }
    })

    gpuServerProcess.on('close', (code) => {
      console.log(`GPU server process exited with code ${code}`)
      gpuServerReady = false
      gpuServerStarting = false
      gpuServerProcess = null
      queueManager.setGpuServerReady(false)
    })

    // Wait for server to be ready
    await waitForGpuServer()
  } catch (error) {
    console.error('Failed to start GPU server:', error)
    gpuServerStarting = false
    throw error
  }
}

// Wait for GPU server to be ready
async function waitForGpuServer(
  maxAttempts = 120,
  intervalMs = 5000
): Promise<void> {
  console.log('Waiting for GPU server to be ready...')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${GPU_SERVER_URL}/health`, {
        timeout: 5000,
      })
      if (response.data.status === 'ok') {
        gpuServerReady = true
        gpuServerStarting = false
        queueManager.setGpuServerReady(true)
        console.log(`GPU server ready after ${attempt} attempts`)
        return
      }
    } catch {
      // Server not ready yet
    }

    if (attempt % 12 === 0) {
      console.log(
        `Still waiting for GPU server... (${(attempt * intervalMs) / 1000}s elapsed)`
      )
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('GPU server failed to start within timeout')
}

// Ensure GPU server is running
export async function ensureGpuServer(): Promise<void> {
  if (gpuServerReady) {
    try {
      await axios.get(`${GPU_SERVER_URL}/health`, { timeout: 5000 })
      return
    } catch {
      console.log('GPU server health check failed, restarting...')
      gpuServerReady = false
      queueManager.setGpuServerReady(false)
    }
  }

  await startGpuServer()
}

// Generate gaze grid
export async function generateGazeGrid(
  sessionId: string,
  socketId: string | null,
  inputPath: string,
  sessionDir: string,
  removeBackground: boolean
): Promise<SessionComplete> {
  const outputDir = path.join(sessionDir, 'gaze_output')

  const emitStatus = (stage: string, message: string) => {
    if (socketId && emitToSocketCallback) {
      emitToSocketCallback(socketId, 'status', { stage, message })
    }
    progressStore.update(sessionId, { stage, message })
  }

  const emitProgress = (
    stage: string,
    progress: number,
    message: string,
    current?: number,
    total?: number,
    quadrants?: Array<{ status: string }>
  ) => {
    if (socketId && emitToSocketCallback) {
      emitToSocketCallback(socketId, 'progress', {
        stage,
        progress,
        message,
        current,
        total,
        quadrants,
      })
    }
    progressStore.update(sessionId, { stage, progress, message, current, total, quadrants })
  }

  const emitLog = (data: unknown) => {
    if (socketId && emitToSocketCallback) {
      emitToSocketCallback(socketId, 'generation-log', data)
    }
  }

  try {
    // Ensure GPU server is running
    emitStatus('preparing', 'Connecting to GPU server...')
    await ensureGpuServer()

    // Read and encode image
    emitStatus('uploading', 'Sending image to GPU...')
    const imageBuffer = fs.readFileSync(inputPath)
    const imageBase64 = imageBuffer.toString('base64')

    // Poll progress with timing
    let progressInterval: NodeJS.Timeout | null = null
    const startTime = Date.now()
    let lastStage = ''
    let stageStartTime = Date.now()
    const stageTimes: Record<string, number> = {}
    let lastQuadrant = -1
    let quadrantStartTime = Date.now()
    const quadrantTimes: number[] = []

    progressInterval = setInterval(async () => {
      try {
        const progressResponse = await axios.get(
          `${GPU_SERVER_URL}/progress/${sessionId}`,
          { timeout: 2000 }
        )
        const { stage, current, total, message, quadrant, quadrants } = progressResponse.data

        if (stage !== 'unknown') {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

          // Track stage transitions
          if (stage !== lastStage && lastStage) {
            const stageDuration = ((Date.now() - stageStartTime) / 1000).toFixed(1)
            stageTimes[lastStage] = parseFloat(stageDuration)
            console.log(`[TIMING] Stage "${lastStage}" completed in ${stageDuration}s (total elapsed: ${elapsed}s)`)
          }
          if (stage !== lastStage) {
            lastStage = stage
            stageStartTime = Date.now()
            console.log(`[TIMING] Starting stage "${stage}" at ${elapsed}s elapsed`)
          }

          let overallProgress = 5
          let displayMessage = message

          if (stage === 'loading' || stage === 'preparing') {
            overallProgress = 5
            displayMessage = message || 'Analyzing face and preparing generation...'
          } else if (stage === 'generating') {
            // Image generation: 5% - 25% (fast step)
            if (current !== undefined && total !== undefined && total > 0) {
              overallProgress = 5 + (current / total) * 20
              displayMessage = `Generating gaze ${current}/${total}...`
            } else {
              overallProgress = 10
              displayMessage = message || 'Generating gaze variations...'
            }
          } else if (stage === 'removing_bg') {
            // Background removal: 25% - 45% (medium step)
            if (current !== undefined && total !== undefined && total > 0) {
              overallProgress = 25 + (current / total) * 20
              displayMessage = `Removing background ${current}/${total}...`
            } else {
              overallProgress = 30
              displayMessage = 'Removing backgrounds from images...'
            }
          } else if (stage === 'saving' || stage === 'stitching') {
            // Sprite stitching: 45% - 85% (SLOWEST step - give it most range)
            if (quadrant !== undefined) {
              // Track quadrant timing
              if (quadrant !== lastQuadrant) {
                if (lastQuadrant >= 0) {
                  const qDuration = (Date.now() - quadrantStartTime) / 1000
                  quadrantTimes[lastQuadrant] = qDuration
                  const qType = lastQuadrant < 4 ? 'desktop' : 'mobile'
                  console.log(`[TIMING] Quadrant ${lastQuadrant} (${qType}) completed in ${qDuration.toFixed(1)}s`)
                }
                lastQuadrant = quadrant
                quadrantStartTime = Date.now()
                const qType = quadrant < 4 ? 'desktop' : 'mobile'
                console.log(`[TIMING] Starting quadrant ${quadrant} (${qType})...`)
              }

              // 8 total: q0-q3 desktop (30x30) + q0_20-q3_20 mobile (20x20)
              const quadrantProgress = ((quadrant + 1) / 8) * 40
              overallProgress = 45 + quadrantProgress
              const isDesktop = quadrant < 4
              const quadrantNum = quadrant % 4
              const size = isDesktop ? '15×15 desktop' : '10×10 mobile'
              displayMessage = `Creating sprite sheet ${quadrant + 1}/8 (Q${quadrantNum} ${size})...`
              // Pass quadrant as current for client visualization, and quadrants array for status
              emitProgress(stage, overallProgress, displayMessage, quadrant, 8, quadrants)
              emitLog({
                type: 'progress',
                stage,
                quadrant,
                quadrants,
                percent: Math.round(((quadrant + 1) / 8) * 100),
                timestamp: Date.now(),
              })
              return // Already emitted
            } else if (current !== undefined && total !== undefined && total > 0) {
              overallProgress = 45 + (current / total) * 40
              displayMessage = `Stitching images into sprite sheets (${current}/${total})...`
            } else {
              overallProgress = 50
              displayMessage = 'Stitching images into sprite sheets...'
            }
          } else if (stage === 'encoding' || stage === 'compressing') {
            // WebP encoding: 85% - 90%
            overallProgress = 85
            displayMessage = 'Compressing sprite sheets to WebP...'
          } else if (stage === 'uploading') {
            // CDN upload in progress: 90% - 95%
            overallProgress = 92
            displayMessage = 'Uploading to CDN...'
          } else if (stage === 'complete') {
            // GPU complete: 95%
            overallProgress = 95
            displayMessage = 'Generation complete!'
          }

          emitProgress(stage, overallProgress, displayMessage, current, total)
          emitLog({
            type: stage === 'generating' ? 'progress' : 'stage',
            stage,
            percent: current && total ? Math.round((current / total) * 100) : 0,
            timestamp: Date.now(),
          })
        }
      } catch {
        // Progress endpoint not available yet
      }
    }, 500) // Poll more frequently for better UX

    // Build request with optional R2 credentials for direct upload
    const generatePayload: {
      session_id: string
      image_base64: string
      remove_background: boolean
      r2?: {
        bucket: string
        account_id: string
        access_key_id: string
        secret_access_key: string
        public_url: string
      }
    } = {
      session_id: sessionId,
      image_base64: imageBase64,
      remove_background: removeBackground,
    }

    // Add R2 credentials if configured - GPU will upload directly to R2
    const r2Creds = getR2Credentials()
    if (r2Creds) {
      generatePayload.r2 = {
        bucket: r2Creds.bucket,
        account_id: r2Creds.accountId,
        access_key_id: r2Creds.accessKeyId,
        secret_access_key: r2Creds.secretAccessKey,
        public_url: r2Creds.publicUrl,
      }
      console.log('[GPU] R2 credentials included - GPU will upload directly to R2')
    }

    // Send generation request
    const generateResponse = await axios.post(
      `${GPU_SERVER_URL}/generate`,
      generatePayload,
      { timeout: 20 * 60 * 1000 } // 20 minute timeout
    )

    // Stop progress polling
    if (progressInterval) {
      clearInterval(progressInterval)
    }

    // Log final GPU stage timing
    if (lastStage) {
      const stageDuration = ((Date.now() - stageStartTime) / 1000).toFixed(1)
      stageTimes[lastStage] = parseFloat(stageDuration)
      console.log(`[TIMING] Stage "${lastStage}" completed in ${stageDuration}s`)
    }
    const gpuTotalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[TIMING] GPU generation total: ${gpuTotalTime}s`)

    if (generateResponse.data.status !== 'complete') {
      throw new Error(generateResponse.data.message || 'Generation failed')
    }

    // Check if GPU already uploaded to R2
    const r2UploadedByGpu = generateResponse.data.r2_uploaded === true || generateResponse.data.cdn_uploaded === true

    if (r2UploadedByGpu) {
      // GPU uploaded directly to R2 - no need to download/extract/re-upload!
      console.log('[TIMING] GPU uploaded directly to R2 - skipping download/extract/upload')
      emitProgress('complete', 95, 'Sprites uploaded to R2!')

      // Still need to save input image and metadata locally for thumbnails/history
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // Copy input image to session directory for local serving
      const inputDest = path.join(sessionDir, 'input.jpg')
      if (!fs.existsSync(inputDest)) {
        fs.copyFileSync(inputPath, inputDest)
      }

      // Save metadata locally
      const metadata = generateResponse.data.metadata
      if (metadata) {
        fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
      }
    } else {
      // Traditional flow: Download ZIP from GPU
      const downloadStart = Date.now()
      emitStatus('downloading', 'Downloading sprite sheets from GPU...')
      emitProgress('downloading', 91, 'Downloading sprite sheets from GPU...')

      const zipResponse = await axios.get(
        `${GPU_SERVER_URL}/download/${sessionId}`,
        {
          responseType: 'arraybuffer',
          timeout: 5 * 60 * 1000,
        }
      )

      const downloadTime = ((Date.now() - downloadStart) / 1000).toFixed(1)
      console.log(`[TIMING] Download completed in ${downloadTime}s`)
      emitProgress('downloading', 94, 'Download complete!')

      // Extract ZIP (95-97%)
      const extractStart = Date.now()
      emitStatus('extracting', 'Extracting sprite sheets...')
      emitProgress('extracting', 95, 'Extracting sprite sheets...')

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const zipBuffer = Buffer.from(zipResponse.data)
      await new Promise<void>((resolve, reject) => {
        const stream = require('stream')
        const readable = new stream.Readable()
        readable._read = () => {}
        readable.push(zipBuffer)
        readable.push(null)

        readable
          .pipe(unzipper.Extract({ path: outputDir }))
          .on('close', resolve)
          .on('error', reject)
      })

      const extractTime = ((Date.now() - extractStart) / 1000).toFixed(1)
      console.log(`[TIMING] Extract completed in ${extractTime}s`)
      emitProgress('extracting', 97, 'Verifying sprite sheets...')

      // Verify files exist
      const requiredFiles = ['q0.webp', 'q1.webp', 'q2.webp', 'q3.webp']
      for (const file of requiredFiles) {
        const filePath = path.join(outputDir, file)
        if (!fs.existsSync(filePath)) {
          throw new Error(`Missing required file: ${file}`)
        }
      }

      // Upload to R2 if configured (98-99%)
      if (useR2) {
        const cdnStart = Date.now()
        emitStatus('r2_upload', 'Uploading to R2...')
        emitProgress('r2_upload', 98, 'Uploading sprites to R2 for fast global delivery...')

        // Upload input image
        const inputBuffer = fs.readFileSync(inputPath)
        await saveImage(sessionId, 'input.jpg', inputBuffer)

        // Upload all sprite files
        const spriteFiles = [
          'q0.webp', 'q1.webp', 'q2.webp', 'q3.webp',
          'q0_20.webp', 'q1_20.webp', 'q2_20.webp', 'q3_20.webp',
        ]

        for (const file of spriteFiles) {
          const filePath = path.join(outputDir, file)
          if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath)
            await saveImage(sessionId, file, buffer)
          }
        }

        const cdnTime = ((Date.now() - cdnStart) / 1000).toFixed(1)
        console.log(`[TIMING] R2 upload completed in ${cdnTime}s`)
      }
    }

    // Build completion data - use R2 URLs if configured
    const basePath = getBasePath(sessionId)
    const spriteSrc = useR2 ? getSpriteSrc(sessionId) : undefined

    const completeData: SessionComplete = {
      sessionId,
      basePath,
      spriteSrc, // Full CDN URLs for widget (comma-separated)
      metadataPath: '', // No longer needed
      gridSize: 30,
      quadrantSize: 15,
      mobileGridSize: 20,
      mobileQuadrantSize: 10,
      imageWidth: 512,
      imageHeight: 640,
      mode: 'quadrants',
      message: 'Generation complete!',
    }

    // Log final quadrant timing if we were tracking
    if (lastQuadrant >= 0) {
      const qDuration = (Date.now() - quadrantStartTime) / 1000
      quadrantTimes[lastQuadrant] = qDuration
      const qType = lastQuadrant < 4 ? 'desktop' : 'mobile'
      console.log(`[TIMING] Quadrant ${lastQuadrant} (${qType}) completed in ${qDuration.toFixed(1)}s`)
    }

    // Final timing summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[TIMING] ========== SUMMARY ==========`)
    console.log(`[TIMING] Session: ${sessionId}`)
    console.log(`[TIMING] GPU stages:`)
    for (const [stage, duration] of Object.entries(stageTimes)) {
      console.log(`[TIMING]   ${stage}: ${duration}s`)
    }
    if (quadrantTimes.length > 0) {
      console.log(`[TIMING] Quadrant breakdown:`)
      const desktopTotal = quadrantTimes.slice(0, 4).reduce((a, b) => a + (b || 0), 0)
      const mobileTotal = quadrantTimes.slice(4, 8).reduce((a, b) => a + (b || 0), 0)
      for (let i = 0; i < quadrantTimes.length; i++) {
        if (quadrantTimes[i]) {
          const qType = i < 4 ? 'desktop' : 'mobile'
          console.log(`[TIMING]   Q${i} (${qType}): ${quadrantTimes[i].toFixed(1)}s`)
        }
      }
      console.log(`[TIMING]   Desktop total: ${desktopTotal.toFixed(1)}s`)
      console.log(`[TIMING]   Mobile total: ${mobileTotal.toFixed(1)}s`)
    }
    console.log(`[TIMING] Total time: ${totalTime}s`)
    console.log(`[TIMING] ==============================`)

    emitProgress('complete', 100, 'Generation complete!')
    progressStore.complete(sessionId)

    if (socketId && emitToSocketCallback) {
      emitToSocketCallback(socketId, 'complete', completeData)
    }

    return completeData
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed'
    console.error(`Generation failed for ${sessionId}:`, message)

    progressStore.fail(sessionId, message)

    if (socketId && emitToSocketCallback) {
      emitToSocketCallback(socketId, 'error', { message })
    }

    throw error
  } finally {
    queueManager.complete(sessionId)
  }
}

// Graceful shutdown
export function gracefulShutdown(): void {
  console.log('Shutting down GPU manager...')

  if (gpuServerProcess) {
    gpuServerProcess.kill()
    gpuServerProcess = null
  }

  // Try to stop the remote pod
  try {
    const { execSync } = require('child_process')
    execSync(`${GPU_CLI} stop --force --no-sync`, { timeout: 30000 })
  } catch {
    // Ignore errors during shutdown
  }
}

// Initialize GPU manager (called on server startup)
export async function initGpuManager(): Promise<void> {
  console.log('Initializing GPU manager (on-demand mode - GPU starts when generation requested)...')

  // Set up queue event handlers
  queueManager.on('process-start', async (data) => {
    const { sessionId, socketId, inputPath, sessionDir, removeBackground } = data
    try {
      await generateGazeGrid(
        sessionId,
        socketId,
        inputPath,
        sessionDir,
        removeBackground
      )
    } catch (error) {
      console.error(`Failed to process ${sessionId}:`, error)
    }
  })

  // Don't start GPU server on init - provision on-demand when user requests generation
  // This saves costs when there's traffic but no actual generations
  console.log('GPU will provision when first generation is requested')
}

// Export for direct access
export { GPU_SERVER_URL, gpuServerReady }
