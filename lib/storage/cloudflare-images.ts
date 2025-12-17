/**
 * Cloudflare Images storage client.
 *
 * Upload: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1
 * Delivery: https://imagedelivery.net/{account_hash}/{image_id}/{variant_name}
 */

import type { SessionMetadata } from '@/types'

// Configuration from environment
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_HASH = process.env.CF_ACCOUNT_HASH

const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`
const DELIVERY_BASE = `https://imagedelivery.net/${CF_ACCOUNT_HASH}`

// Check if Cloudflare Images is configured
export const isCfImagesConfigured = Boolean(
  CF_ACCOUNT_ID && CF_API_TOKEN && CF_ACCOUNT_HASH
)

// Image naming convention: {sessionId}/{filename}
// e.g., session_123_abc/input, session_123_abc/q0, etc.

/**
 * Upload an image to Cloudflare Images
 */
export async function uploadImage(
  sessionId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  if (!isCfImagesConfigured) {
    throw new Error('Cloudflare Images not configured')
  }

  // Create form data
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], { type: getContentType(filename) })
  formData.append('file', blob, filename)

  // Use sessionId/filename as the custom ID for easy retrieval
  const imageId = `${sessionId}/${filename.replace(/\.[^.]+$/, '')}` // Remove extension
  formData.append('id', imageId)

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to upload image: ${error}`)
  }

  const data = await response.json()

  if (!data.success) {
    throw new Error(`Upload failed: ${data.errors?.[0]?.message || 'Unknown error'}`)
  }

  return data.result.id
}

/**
 * Get the delivery URL for an image
 * Using 'full' variant to preserve original quality (no resize/compression)
 */
export function getImageUrl(
  sessionId: string,
  filename: string,
  variant = 'full'
): string {
  const imageId = `${sessionId}/${filename.replace(/\.[^.]+$/, '')}`
  return `${DELIVERY_BASE}/${imageId}/${variant}`
}

/**
 * Delete an image from Cloudflare Images
 */
export async function deleteImage(
  sessionId: string,
  filename: string
): Promise<void> {
  if (!isCfImagesConfigured) return

  const imageId = `${sessionId}/${filename.replace(/\.[^.]+$/, '')}`

  const response = await fetch(`${API_BASE}/${imageId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
    },
  })

  // Ignore 404 errors (image might not exist)
  if (!response.ok && response.status !== 404) {
    console.error(`Failed to delete image ${imageId}:`, await response.text())
  }
}

/**
 * Delete all images for a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const files = [
    'input',
    'q0', 'q1', 'q2', 'q3',
    'q0_20', 'q1_20', 'q2_20', 'q3_20',
  ]

  await Promise.all(
    files.map((file) => deleteImage(sessionId, file).catch(() => {}))
  )
}

/**
 * Check if a session exists (by checking if input image exists)
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  if (!isCfImagesConfigured) return false

  const imageId = `${sessionId}/input`

  const response = await fetch(`${API_BASE}/${imageId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
    },
  })

  return response.ok
}

/**
 * Get session metadata (derived from image, no stored metadata needed)
 */
export function getSessionMetadata(): SessionMetadata {
  // These are always the same for our app
  return {
    gridSize: 30,
    quadrantSize: 15,
    mobileGridSize: 20,
    mobileQuadrantSize: 10,
    imageWidth: 512, // Default, actual size derived from sprite
    imageHeight: 640, // Default, actual size derived from sprite
    mode: 'quadrants',
  }
}

/**
 * Get base path for sprites (CDN URL pattern)
 */
export function getBasePath(sessionId: string, variant = 'full'): string {
  return `${DELIVERY_BASE}/${sessionId}`
}

/**
 * Get sprite URLs for a session
 */
export function getSpriteUrls(
  sessionId: string,
  mobile = false,
  variant = 'full'
): string[] {
  const suffix = mobile ? '_20' : ''
  return [0, 1, 2, 3].map(
    (i) => `${DELIVERY_BASE}/${sessionId}/q${i}${suffix}/${variant}`
  )
}

/**
 * Get sprite src string for gaze-tracker component
 */
export function getSpriteSrc(
  sessionId: string,
  mobile = false,
  variant = 'full'
): string {
  return getSpriteUrls(sessionId, mobile, variant).join(',')
}

/**
 * Get thumbnail URL for a session
 */
export function getThumbnailUrl(sessionId: string, variant = 'full'): string {
  return `${DELIVERY_BASE}/${sessionId}/input/${variant}`
}

function getContentType(filename: string): string {
  if (filename.endsWith('.webp')) return 'image/webp'
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg'
  if (filename.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

// List sessions is not directly supported by CF Images API
// We'll need to track sessions separately (localStorage on client, or a simple KV store)
// For now, we'll rely on localStorage history for the gallery
export async function listSessions(): Promise<{ sessionId: string; lastModified: Date }[]> {
  // CF Images doesn't have a "list by prefix" feature
  // Sessions will be tracked client-side in localStorage
  // The /all gallery can fetch from localStorage or we can add a simple metadata store later
  return []
}
