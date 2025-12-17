/**
 * Unified storage interface.
 * Uses Cloudflare R2 when configured, falls back to local storage.
 */

import * as r2 from './r2'
import * as local from './local'
import type { SessionMetadata } from '@/types'

// Check which storage backend to use
export const useR2 = r2.isR2Configured
// Alias for backward compatibility
export const useCfImages = useR2

// Initialize storage
export function initStorage(): void {
  if (!useR2) {
    console.log('Cloudflare R2 not configured, using local file storage')
    local.ensureDirectories()
  } else {
    console.log('Using Cloudflare R2 for storage')
  }

  // Recover any orphaned jobs from previous server crashes
  const { recovered, errors } = local.recoverOrphanedJobs()
  if (recovered.length > 0) {
    console.log(`Recovered ${recovered.length} orphaned job(s): ${recovered.join(', ')}`)
  }
  if (errors.length > 0) {
    console.error(`Failed to recover ${errors.length} job(s):`, errors)
  }
}

// Save an image
export async function saveImage(
  sessionId: string,
  filename: string,
  buffer: Buffer
): Promise<void> {
  // Always save locally (for GPU processing and as fallback)
  await local.saveFileLocal(sessionId, filename, buffer)

  // Also upload to R2 if configured (for input.jpg specifically)
  if (useR2 && filename === 'input.jpg') {
    await r2.uploadToR2(`${sessionId}/${filename}`, buffer)
  }
}

// Get image URL
export function getImageUrl(
  sessionId: string,
  filename: string,
): string {
  if (useR2) {
    return r2.getR2PublicUrl(`${sessionId}/${filename}`)
  }
  // Local URL
  return `/uploads/${sessionId}/${filename}`
}

// Get sprite src for gaze-tracker (comma-separated URLs)
export function getSpriteSrc(sessionId: string, mobile = false): string {
  if (useR2) {
    // R2 version - use public URLs
    // Note: mobile suffix not currently used with R2, but could be added
    return r2.getR2SpriteSrc(sessionId)
  }
  // Local paths
  const suffix = mobile ? '_20' : ''
  const basePath = `/uploads/${sessionId}/gaze_output`
  return [0, 1, 2, 3].map((i) => `${basePath}/q${i}${suffix}.webp`).join(',')
}

// Get base path for sprites
export function getBasePath(sessionId: string): string {
  if (useR2) {
    return r2.getR2BasePath(sessionId)
  }
  return `/uploads/${sessionId}/gaze_output`
}

// Get thumbnail URL
export function getThumbnailUrl(sessionId: string): string {
  if (useR2) {
    return r2.getR2PublicUrl(`${sessionId}/input.jpg`)
  }
  return `/uploads/${sessionId}/input.jpg`
}

// Delete session
export async function deleteSession(sessionId: string): Promise<void> {
  if (useR2) {
    await r2.deleteSession(sessionId)
  }
  await local.deleteSessionLocal(sessionId)
}

// Check if session exists
export async function sessionExists(sessionId: string): Promise<boolean> {
  // Check local first (faster)
  if (local.sessionExists(sessionId)) {
    return true
  }
  // Then check R2
  if (useR2) {
    return r2.existsInR2(`${sessionId}/input.jpg`)
  }
  return false
}

// Get session metadata
export async function getSessionMetadata(
  sessionId: string
): Promise<SessionMetadata | null> {
  // Try local first
  const localMetadata = await local.getSessionMetadataLocal(sessionId)
  if (localMetadata) return localMetadata

  // Try R2
  if (useR2) {
    return r2.getSessionMetadata(sessionId)
  }

  return null
}

// List sessions (from local storage primarily, R2 as supplement)
export async function listSessions(): Promise<
  { sessionId: string; lastModified: Date }[]
> {
  const localSessions = local.listSessionsLocal()

  if (useR2) {
    // Merge R2 sessions (may have sessions not on this server)
    const r2Sessions = await r2.listSessions()
    const localIds = new Set(localSessions.map(s => s.sessionId))

    for (const session of r2Sessions) {
      if (!localIds.has(session.sessionId)) {
        localSessions.push(session)
      }
    }

    // Re-sort by sessionId (descending)
    localSessions.sort((a, b) => b.sessionId.localeCompare(a.sessionId))
  }

  return localSessions
}

// Get R2 credentials for GPU server to upload directly
export function getR2Credentials() {
  return r2.getR2Credentials()
}

// Re-export local utilities for direct file access when needed
export { getSessionPath, getJobsPath, copyFromJobsToUploads, ensureDirectories, recoverOrphanedJobs } from './local'

// Export for type checking
export { useR2 as useCloudStorage }
