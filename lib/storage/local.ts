import fs from 'fs'
import path from 'path'
import type { SessionMetadata } from '@/types'

// Base directories
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const JOBS_DIR = path.join(process.cwd(), 'jobs')

// Ensure directories exist
export function ensureDirectories(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
  if (!fs.existsSync(JOBS_DIR)) {
    fs.mkdirSync(JOBS_DIR, { recursive: true })
  }
}

// Get full path for a session file
export function getSessionPath(sessionId: string, ...subPath: string[]): string {
  return path.join(UPLOAD_DIR, sessionId, ...subPath)
}

// Get full path for a jobs file
export function getJobsPath(sessionId: string, ...subPath: string[]): string {
  return path.join(JOBS_DIR, sessionId, ...subPath)
}

// Check if session exists locally
export function sessionExists(sessionId: string): boolean {
  return fs.existsSync(getSessionPath(sessionId))
}

// Check if file exists locally
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

// Save file locally
export async function saveFileLocal(
  sessionId: string,
  filename: string,
  content: Buffer
): Promise<string> {
  const sessionDir = getSessionPath(sessionId)

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true })
  }

  const filePath = path.join(sessionDir, filename)
  fs.writeFileSync(filePath, content)

  return filePath
}

// Read file locally
export async function readFileLocal(filePath: string): Promise<Buffer> {
  return fs.readFileSync(filePath)
}

// Delete session locally
export async function deleteSessionLocal(sessionId: string): Promise<void> {
  const sessionDir = getSessionPath(sessionId)

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true })
  }

  // Also delete from jobs if exists
  const jobsDir = getJobsPath(sessionId)
  if (fs.existsSync(jobsDir)) {
    fs.rmSync(jobsDir, { recursive: true })
  }
}

// Get session metadata from local storage
export async function getSessionMetadataLocal(
  sessionId: string
): Promise<SessionMetadata | null> {
  const metadataPath = getSessionPath(sessionId, 'gaze_output', 'metadata.json')

  if (!fs.existsSync(metadataPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(metadataPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

// List all sessions from local storage
export async function listSessionsLocal(): Promise<
  { sessionId: string; lastModified: Date }[]
> {
  ensureDirectories()

  const entries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
  const sessions: { sessionId: string; lastModified: Date }[] = []

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('session_')) {
      const sessionId = entry.name
      const metadataPath = getSessionPath(sessionId, 'gaze_output', 'metadata.json')

      // Only include completed sessions
      if (fs.existsSync(metadataPath)) {
        const stats = fs.statSync(getSessionPath(sessionId))
        sessions.push({
          sessionId,
          lastModified: stats.mtime,
        })
      }
    }
  }

  // Sort by modification time (newest first)
  return sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
}

// List files in a session
export async function listSessionFilesLocal(sessionId: string): Promise<string[]> {
  const sessionDir = getSessionPath(sessionId)

  if (!fs.existsSync(sessionDir)) {
    return []
  }

  const files: string[] = []

  function walkDir(dir: string, prefix: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), relativePath)
      } else {
        files.push(relativePath)
      }
    }
  }

  walkDir(sessionDir)
  return files
}

// Copy from jobs to uploads
export async function copyFromJobsToUploads(sessionId: string): Promise<void> {
  const jobsOutput = getJobsPath(sessionId, 'gaze_output')
  const uploadsOutput = getSessionPath(sessionId, 'gaze_output')

  if (!fs.existsSync(jobsOutput)) {
    throw new Error(`Jobs output not found for session ${sessionId}`)
  }

  // Create uploads output directory
  if (!fs.existsSync(uploadsOutput)) {
    fs.mkdirSync(uploadsOutput, { recursive: true })
  }

  // Copy all files
  const files = fs.readdirSync(jobsOutput)
  for (const file of files) {
    const src = path.join(jobsOutput, file)
    const dest = path.join(uploadsOutput, file)
    fs.copyFileSync(src, dest)
  }
}

// Get content type for a file
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.html': 'text/html',
  }
  return contentTypes[ext] || 'application/octet-stream'
}

// Recover orphaned jobs - copy gaze_output from jobs to uploads
export function recoverOrphanedJobs(): { recovered: string[]; errors: string[] } {
  const recovered: string[] = []
  const errors: string[] = []

  if (!fs.existsSync(JOBS_DIR)) {
    return { recovered, errors }
  }

  const jobSessions = fs.readdirSync(JOBS_DIR).filter((name) =>
    name.startsWith('session_') && fs.statSync(path.join(JOBS_DIR, name)).isDirectory()
  )

  for (const sessionId of jobSessions) {
    const jobsOutput = getJobsPath(sessionId, 'gaze_output')
    const uploadsOutput = getSessionPath(sessionId, 'gaze_output')
    const uploadsInput = getSessionPath(sessionId, 'input.jpg')

    // Skip if jobs doesn't have gaze_output
    if (!fs.existsSync(jobsOutput)) {
      continue
    }

    // Skip if uploads already has gaze_output
    if (fs.existsSync(uploadsOutput)) {
      continue
    }

    // Only recover if uploads has input.jpg (session was started properly)
    if (!fs.existsSync(uploadsInput)) {
      // Could also copy input.jpg from jobs if it exists there
      const jobsInput = getJobsPath(sessionId, 'input.jpg')
      if (fs.existsSync(jobsInput)) {
        try {
          const sessionDir = getSessionPath(sessionId)
          if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true })
          }
          fs.copyFileSync(jobsInput, uploadsInput)
        } catch (err) {
          errors.push(`${sessionId}: Failed to copy input.jpg - ${err}`)
          continue
        }
      } else {
        continue // Can't recover without input.jpg
      }
    }

    // Copy gaze_output
    try {
      fs.mkdirSync(uploadsOutput, { recursive: true })
      const files = fs.readdirSync(jobsOutput)
      for (const file of files) {
        const src = path.join(jobsOutput, file)
        const dest = path.join(uploadsOutput, file)
        fs.copyFileSync(src, dest)
      }
      recovered.push(sessionId)
      console.log(`Recovered orphaned job: ${sessionId}`)
    } catch (err) {
      errors.push(`${sessionId}: ${err}`)
    }
  }

  return { recovered, errors }
}

export { UPLOAD_DIR, JOBS_DIR }
