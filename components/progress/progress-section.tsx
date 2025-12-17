'use client'

import { useState } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function ProgressSection() {
  const { uploadStatus, queuePosition, progress, logs, error } = useSocket()
  const [logsOpen, setLogsOpen] = useState(false)

  // Don't show if nothing is happening
  if (!uploadStatus && !queuePosition && !progress && !error) {
    return null
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Generation Progress
          {queuePosition && (
            <Badge variant="secondary">#{queuePosition.position} in queue</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {progress?.message ||
                    uploadStatus?.message ||
                    queuePosition?.message ||
                    'Preparing...'}
                </span>
                <span>{Math.round(progress?.progress || 0)}%</span>
              </div>
              <Progress value={progress?.progress || 0} className="h-2" />
            </div>

            {logs.length > 0 && (
              <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  {logsOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  View detailed logs ({logs.length} entries)
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 bg-muted rounded-lg max-h-48 overflow-y-auto font-mono text-xs">
                    {logs.map((log, i) => (
                      <div key={i} className="text-muted-foreground">
                        [{new Date(log.timestamp).toLocaleTimeString()}]{' '}
                        <span className="text-foreground">
                          {log.type}: {log.message || log.stage || `${log.percent}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
