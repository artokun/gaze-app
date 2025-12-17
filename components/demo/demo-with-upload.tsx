'use client'

import { useState, useRef, useEffect } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { Button } from '@/components/ui/button'
import { GazeTrackerWrapper } from '@/components/viewer/gaze-tracker-wrapper'

export function DemoWithUpload() {
  const { upload, gpuStatus, progress } = useSocket()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isProcessing = progress !== null || isUploading

  // Global drop zone handlers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      if (e.relatedTarget === null) {
        setIsDragging(false)
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer?.files[0]
      if (file && file.type.startsWith('image/')) {
        handleFileSelect(file)
      }
    }

    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  const handleFileSelect = async (file: File) => {
    setIsUploading(true)
    try {
      const response = await upload(file, false)
      if (!response.success) {
        console.error('Upload failed:', response.error)
      }
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex-1 relative p-5 min-h-0">
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-5 z-50 bg-black/5 border border-border rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <p className="text-lg font-medium tracking-tight">Drop your photo</p>
          </div>
        </div>
      )}

      {/* Demo viewer - fills available space */}
      <div className="h-full relative">
        <GazeTrackerWrapper src="/api/files/demo/" className="h-full" />

        {/* Upload button overlay at bottom center */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleInputChange}
          />
          <Button
            size="lg"
            onClick={handleUploadClick}
            disabled={isProcessing || (gpuStatus.stage !== 'ready' && gpuStatus.stage !== 'idle')}
            className="text-sm font-medium tracking-tight shadow-md"
          >
            {isUploading ? 'Uploading...' : 'Upload Your Own'}
          </Button>
        </div>
      </div>
    </div>
  )
}
