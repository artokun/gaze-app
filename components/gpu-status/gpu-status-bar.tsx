'use client'

import { Progress } from '@/components/ui/progress'
import { Loader2, Rocket, Download, Play, CheckCircle, Cpu, Server } from 'lucide-react'
import type { GpuProvisioningStatus } from '@/types'

interface GpuStatusBarProps {
  status: GpuProvisioningStatus
}

const stageConfig: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
  idle: {
    icon: <Cpu className="w-5 h-5" />,
    label: 'Initializing...',
    description: 'Preparing GPU environment'
  },
  provisioning: {
    icon: <Rocket className="w-5 h-5" />,
    label: 'Provisioning GPU',
    description: 'Allocating RTX 4090 instance on RunPod'
  },
  installing: {
    icon: <Download className="w-5 h-5" />,
    label: 'Installing Dependencies',
    description: 'Setting up LivePortrait and required packages'
  },
  starting: {
    icon: <Play className="w-5 h-5" />,
    label: 'Starting Server',
    description: 'Launching the gaze generation service'
  },
  loading: {
    icon: <Server className="w-5 h-5" />,
    label: 'Loading Models',
    description: 'Loading AI models into GPU memory (~10GB)'
  },
  connecting: {
    icon: <Loader2 className="w-5 h-5 animate-spin" />,
    label: 'Connecting...',
    description: 'Establishing secure connection to GPU'
  },
  ready: {
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    label: 'Ready',
    description: 'GPU server is ready for requests'
  },
}

export function GpuStatusBar({ status }: GpuStatusBarProps) {
  // Don't show anything if idle or ready
  if (status.stage === 'idle' || status.stage === 'ready') {
    return null
  }

  const config = stageConfig[status.stage] || {
    icon: <Loader2 className="w-5 h-5 animate-spin" />,
    label: status.stage,
    description: 'Processing...'
  }

  return (
    <div className="p-4 rounded-lg bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{status.progress}%</span>
        </div>
        <Progress value={status.progress} className="h-2" />
      </div>

      {/* Status message */}
      {status.message && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground font-mono truncate">
            {status.message}
          </p>
        </div>
      )}
    </div>
  )
}
