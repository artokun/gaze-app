'use client'

import { Card, CardContent } from '@/components/ui/card'
import { GazeTrackerWrapper } from '@/components/viewer/gaze-tracker-wrapper'

export function DemoSection() {
  // Use /api/files/demo/ which redirects to Cloudflare Images CDN
  // This saves egress since CF Images serves from their CDN
  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold mb-1">Try it out!</h2>
          <p className="text-sm text-muted-foreground">
            Move your cursor over the image - the eyes will follow
          </p>
        </div>
        <GazeTrackerWrapper src="/api/files/demo/" />
      </CardContent>
    </Card>
  )
}
