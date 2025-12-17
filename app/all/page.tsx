import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { listSessions } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface GalleryPageProps {
  searchParams: Promise<{ admin?: string }>
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const params = await searchParams
  const isAdmin = params.admin === 'true'
  const sessions = await listSessions()

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">
              Gallery
              <span className="text-muted-foreground ml-2 text-lg font-normal">
                ({sessions.length} sessions)
              </span>
            </h1>
          </div>
        </div>

        <GalleryGrid sessions={sessions} isAdmin={isAdmin} />
      </div>
    </main>
  )
}
