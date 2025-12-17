import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { listSessions } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'

interface GalleryPageProps {
  searchParams: Promise<{ admin?: string }>
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const params = await searchParams
  const isAdmin = params.admin === 'true'
  const sessions = await listSessions()

  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      {/* Main content area */}
      <div className="flex-1 p-4 pb-0 min-h-0 relative bg-secondary/30 overflow-auto">
        <div className="max-w-6xl mx-auto py-4">
          <h1 className="text-xl font-semibold mb-4">
            Gallery
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              ({sessions.length} sessions)
            </span>
          </h1>
          <GalleryGrid sessions={sessions} isAdmin={isAdmin} />
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3">
        <div className="flex items-center justify-center max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
