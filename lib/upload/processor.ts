/**
 * Image upload processing with Sharp.
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { saveImage } from '../storage'
import { getSessionPath } from '../storage/local'

const MAX_DIMENSION = 512

interface ProcessedImage {
  buffer: Buffer
  width: number
  height: number
}

// Process uploaded image
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(buffer).metadata()

  // EXIF orientations 5-8 involve 90-degree rotation, swapping width/height
  const needsSwap =
    metadata.orientation !== undefined &&
    metadata.orientation >= 5 &&
    metadata.orientation <= 8
  const effectiveWidth = needsSwap ? metadata.height : metadata.width
  const effectiveHeight = needsSwap ? metadata.width : metadata.height

  let resizeOpts: sharp.ResizeOptions = {}

  if (
    effectiveWidth !== undefined &&
    effectiveHeight !== undefined &&
    (effectiveWidth > MAX_DIMENSION || effectiveHeight > MAX_DIMENSION)
  ) {
    if (effectiveWidth > effectiveHeight) {
      resizeOpts = { width: MAX_DIMENSION }
    } else {
      resizeOpts = { height: MAX_DIMENSION }
    }
  }

  let sharpInstance = sharp(buffer).rotate() // Auto-rotate based on EXIF

  if (resizeOpts.width || resizeOpts.height) {
    sharpInstance = sharpInstance.resize(resizeOpts)
  }

  const processedBuffer = await sharpInstance.jpeg({ quality: 95 }).toBuffer()
  const processedMetadata = await sharp(processedBuffer).metadata()

  return {
    buffer: processedBuffer,
    width: processedMetadata.width || MAX_DIMENSION,
    height: processedMetadata.height || MAX_DIMENSION,
  }
}

// Save processed image for a session
export async function saveSessionImage(
  sessionId: string,
  buffer: Buffer
): Promise<{ inputPath: string; sessionDir: string }> {
  const sessionDir = getSessionPath(sessionId)

  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true })
  }

  const inputPath = path.join(sessionDir, 'input.jpg')
  fs.writeFileSync(inputPath, buffer)

  // Also save to cloud storage if configured
  try {
    await saveImage(sessionId, 'input.jpg', buffer)
  } catch {
    // Local storage is the fallback, so this is fine
  }

  return { inputPath, sessionDir }
}

// Generate unique session ID
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Validate file upload
export function validateUpload(
  file: { size: number; name?: string; type?: string } | null
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' }
  }

  // Max 10MB
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large (max 10MB)' }
  }

  // Check file type if available
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (file.type && !allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Please upload a JPG, PNG, or WebP image.' }
  }

  // Check extension if name is available
  if (file.name) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp']
    if (ext && !allowedExtensions.includes(ext)) {
      return { valid: false, error: 'Invalid file extension. Please upload a JPG, PNG, or WebP image.' }
    }
  }

  return { valid: true }
}
