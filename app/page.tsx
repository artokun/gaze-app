import { HeroSection } from '@/components/hero/hero-section'
import { ProgressSection } from '@/components/progress/progress-section'
import { ViewerSection } from '@/components/viewer/viewer-section'

export default function HomePage() {
  return (
    <main className="h-dvh flex flex-col overflow-hidden bg-background">
      <HeroSection />
      <ProgressSection />
      <ViewerSection />
    </main>
  )
}
