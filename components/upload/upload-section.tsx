'use client'

import { useState, useCallback, useRef } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, Image as ImageIcon, X } from 'lucide-react'

export function UploadSection() {
  const { upload, gpuStatus, progress } = useSocket()
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isProcessing = progress !== null || isUploading

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file)
    }
  }, [])

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    try {
      const response = await upload(selectedFile, removeBackground)
      if (!response.success) {
        console.error('Upload failed:', response.error)
        // TODO: Show error toast
      }
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleClear = () => {
    setSelectedFile(null)
    setPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-6">
        {!preview ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">
              Drop your portrait photo here
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse (JPG, PNG, WebP up to 10MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInputChange}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Select Image
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative inline-block">
              <img
                src={preview}
                alt="Preview"
                className="max-h-64 rounded-lg mx-auto"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleClear}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center justify-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeBackground}
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Remove background</span>
              </label>
            </div>

            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={
                  isProcessing || gpuStatus.stage !== 'ready' && gpuStatus.stage !== 'idle'
                }
              >
                {isUploading ? 'Uploading...' : 'Generate Gaze Tracker'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
