import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'stream'
import type { SessionMetadata } from '@/types'

// R2 Configuration
const R2_BUCKET = process.env.R2_BUCKET
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL // e.g., https://pub-xxx.r2.dev or custom domain

// Check if R2 is configured (needs public URL for serving)
export const isR2Configured = Boolean(
  R2_BUCKET && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL
)

// Create S3 client for R2 (lazy initialization)
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!isR2Configured) {
    throw new Error('R2 is not configured. Set R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.')
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  }

  return s3Client
}

// Infer content type from file extension
function inferContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    json: 'application/json',
    zip: 'application/zip',
    html: 'text/html',
  }
  return contentTypes[ext || ''] || 'application/octet-stream'
}

// Upload file to R2
export async function uploadToR2(
  key: string,
  body: Buffer | Readable,
  contentType?: string
): Promise<void> {
  const client = getS3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || inferContentType(key),
    })
  )
}

// Download file from R2
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getS3Client()

  const response = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  )

  const stream = response.Body as Readable
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

// Check if file exists in R2
export async function existsInR2(key: string): Promise<boolean> {
  try {
    const client = getS3Client()
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

// Get presigned URL for direct browser download
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getS3Client()

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn })
}

// Get presigned URL for direct browser upload
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const client = getS3Client()

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(client, command, { expiresIn })
}

// Delete a single file from R2
export async function deleteFromR2(key: string): Promise<void> {
  const client = getS3Client()

  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  )
}

// Delete all files in a session
export async function deleteSession(sessionId: string): Promise<void> {
  const client = getS3Client()

  // List all objects with the session prefix
  const listResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: `${sessionId}/`,
    })
  )

  // Delete each object
  if (listResponse.Contents) {
    await Promise.all(
      listResponse.Contents.map((obj) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: obj.Key!,
          })
        )
      )
    )
  }
}

// Get session metadata from R2
export async function getSessionMetadata(
  sessionId: string
): Promise<SessionMetadata | null> {
  try {
    const buffer = await downloadFromR2(
      `${sessionId}/gaze_output/metadata.json`
    )
    return JSON.parse(buffer.toString('utf-8'))
  } catch {
    return null
  }
}

// List all sessions from R2
export async function listSessions(): Promise<
  { sessionId: string; lastModified: Date }[]
> {
  const client = getS3Client()

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Delimiter: '/',
    })
  )

  const sessions: { sessionId: string; lastModified: Date }[] = []

  for (const prefix of response.CommonPrefixes || []) {
    const sessionId = prefix.Prefix?.replace('/', '')
    if (sessionId?.startsWith('session_')) {
      // Check if session has completed generation (has metadata.json)
      const hasMetadata = await existsInR2(
        `${sessionId}/gaze_output/metadata.json`
      )
      if (hasMetadata) {
        sessions.push({
          sessionId,
          lastModified: new Date(), // R2 doesn't return this in prefix list
        })
      }
    }
  }

  // Sort by session ID (which includes timestamp)
  return sessions.sort((a, b) => b.sessionId.localeCompare(a.sessionId))
}

// Get public URL for a file
export function getR2PublicUrl(key: string): string {
  if (!R2_PUBLIC_URL) {
    throw new Error('R2_PUBLIC_URL is not configured')
  }
  return `${R2_PUBLIC_URL}/${key}`
}

// Get base path for a session (public URL)
export function getR2BasePath(sessionId: string): string {
  return getR2PublicUrl(`${sessionId}/gaze_output/`)
}

// Get sprite src for widget (comma-separated CDN URLs)
export function getR2SpriteSrc(sessionId: string): string {
  const baseUrl = `${R2_PUBLIC_URL}/${sessionId}/gaze_output`
  return [
    `${baseUrl}/q0.webp`,
    `${baseUrl}/q1.webp`,
    `${baseUrl}/q2.webp`,
    `${baseUrl}/q3.webp`,
  ].join(',')
}

// Get R2 credentials for GPU server to upload directly
export function getR2Credentials() {
  if (!isR2Configured) {
    return null
  }
  return {
    bucket: R2_BUCKET!,
    accountId: R2_ACCOUNT_ID!,
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    publicUrl: R2_PUBLIC_URL!,
  }
}

// List files in a session
export async function listSessionFiles(
  sessionId: string
): Promise<string[]> {
  const client = getS3Client()

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: `${sessionId}/`,
    })
  )

  return (response.Contents || [])
    .map((obj) => obj.Key!)
    .filter(Boolean)
}
