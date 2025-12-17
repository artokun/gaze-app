'use client'

import { useSocket } from '@/hooks/use-socket'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Cpu,
  Wifi,
  Download,
  Loader2,
  CheckCircle2,
  Circle,
} from 'lucide-react'

const stageIcons: Record<string, React.ReactNode> = {
  idle: <Circle className="w-4 h-4 text-muted-foreground" />,
  detecting: <Loader2 className="w-4 h-4 animate-spin" />,
  resolving: <Loader2 className="w-4 h-4 animate-spin" />,
  provisioning: <Cpu className="w-4 h-4" />,
  connecting: <Wifi className="w-4 h-4" />,
  syncing: <Download className="w-4 h-4" />,
  installing: <Download className="w-4 h-4" />,
  starting: <Loader2 className="w-4 h-4 animate-spin" />,
  weights: <Download className="w-4 h-4" />,
  loading: <Loader2 className="w-4 h-4 animate-spin" />,
  ready: <CheckCircle2 className="w-4 h-4 text-green-500" />,
}

export function GpuStatus() {
  const { gpuStatus } = useSocket()

  // Don't show if idle or ready
  if (gpuStatus.stage === 'idle' || gpuStatus.stage === 'ready') {
    return null
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-4">
        <div className="flex items-center gap-3 mb-2">
          {stageIcons[gpuStatus.stage] || (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          <span className="text-sm font-medium">{gpuStatus.message}</span>
        </div>
        <Progress value={gpuStatus.progress} className="h-2" />
      </CardContent>
    </Card>
  )
}
