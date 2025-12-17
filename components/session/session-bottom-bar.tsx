'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ArrowLeft, Download, Copy, Check, ExternalLink } from 'lucide-react'
import { SiReact, SiVuedotjs, SiJavascript, SiAstro, SiSolid, SiWebflow } from 'react-icons/si'
import Link from 'next/link'

interface SessionBottomBarProps {
  sessionId: string
}

const CDN_VERSION = 'v1.0.5'

type Framework = 'react' | 'vue' | 'js' | 'astro' | 'solid' | 'webflow'

const frameworkInfo: Record<Framework, { name: string; icon: React.ReactNode; instructions: React.ReactNode }> = {
  react: {
    name: 'React',
    icon: <SiReact className="w-4 h-4" />,
    instructions: (
      <>
        Add the script to your <code className="bg-muted px-1 rounded">layout.tsx</code> or use{' '}
        <code className="bg-muted px-1 rounded">next/script</code>. The web component works directly in JSX.
      </>
    ),
  },
  vue: {
    name: 'Vue',
    icon: <SiVuedotjs className="w-4 h-4" />,
    instructions: (
      <>
        Add script to <code className="bg-muted px-1 rounded">nuxt.config.ts</code> head or use{' '}
        <code className="bg-muted px-1 rounded">useHead()</code>. Works with Vue 3 and Nuxt 3.
      </>
    ),
  },
  js: {
    name: 'Vanilla JS',
    icon: <SiJavascript className="w-4 h-4" />,
    instructions: (
      <>
        Add the script tag to your HTML <code className="bg-muted px-1 rounded">&lt;head&gt;</code>, then use the{' '}
        <code className="bg-muted px-1 rounded">&lt;gaze-tracker&gt;</code> element anywhere in your page.
      </>
    ),
  },
  astro: {
    name: 'Astro',
    icon: <SiAstro className="w-4 h-4" />,
    instructions: (
      <>
        Add the script to your <code className="bg-muted px-1 rounded">Layout.astro</code> head.
        Use <code className="bg-muted px-1 rounded">is:inline</code> if needed.
      </>
    ),
  },
  solid: {
    name: 'Solid',
    icon: <SiSolid className="w-4 h-4" />,
    instructions: (
      <>
        Works like React. Add script to your root <code className="bg-muted px-1 rounded">index.html</code> and use the web component directly in JSX.
      </>
    ),
  },
  webflow: {
    name: 'Webflow',
    icon: <SiWebflow className="w-4 h-4" />,
    instructions: (
      <>
        Go to Project Settings → Custom Code → Head Code and paste the script. Then add an Embed element and paste the{' '}
        <code className="bg-muted px-1 rounded">&lt;gaze-tracker&gt;</code> component.
      </>
    ),
  },
}

export function SessionBottomBar({ sessionId }: SessionBottomBarProps) {
  const [showEmbedModal, setShowEmbedModal] = useState(false)
  const [showMobileAlert, setShowMobileAlert] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedComponent, setCopiedComponent] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [selectedFramework, setSelectedFramework] = useState<Framework>('react')

  const viewUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${sessionId}/view`
    : `/${sessionId}/view`

  const scriptCode = `<script src="https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@${CDN_VERSION}/gaze-tracker.js"><\/script>`
  const componentCode = `<gaze-tracker src="/path/to/sprites/"></gaze-tracker>`

  const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const handleDownloadClick = () => {
    // Check if mobile
    const isMobile = window.innerWidth < 640
    if (isMobile) {
      setShowMobileAlert(true)
    } else {
      triggerDownload()
      setShowEmbedModal(true)
    }
  }

  const triggerDownload = () => {
    window.location.href = `/api/download-widget/${sessionId}`
  }

  return (
    <>
      {/* Fixed bottom bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>

          {/* Mobile: Share link input */}
          <div className="flex-1 max-w-xs sm:hidden">
            <div className="flex items-center gap-1">
              <Input
                value={viewUrl}
                readOnly
                className="h-8 text-xs truncate"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-8 w-8 p-0"
                onClick={() => copyToClipboard(viewUrl, setCopiedLink)}
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Desktop: Multi and Fullscreen buttons */}
          <div className="hidden sm:flex items-center gap-2">
            <Link href={`/${sessionId}/multi`}>
              <Button variant="outline" size="sm">
                Multi
              </Button>
            </Link>
            <Link href={`/${sessionId}/view`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="w-4 h-4 mr-2" />
                Fullscreen
              </Button>
            </Link>
          </div>

          <Button size="sm" onClick={handleDownloadClick}>
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      {/* Mobile Download Alert */}
      <Dialog open={showMobileAlert} onOpenChange={setShowMobileAlert}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Download Widget</DialogTitle>
            <DialogDescription>
              For the best experience, download the widget on a desktop computer where you can easily add it to your website.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button onClick={() => { triggerDownload(); setShowMobileAlert(false) }}>
              Download Anyway
            </Button>
            <Button variant="outline" onClick={() => setShowMobileAlert(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop Embed Modal */}
      <Dialog open={showEmbedModal} onOpenChange={setShowEmbedModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Embed Your Gaze Tracker</DialogTitle>
            <DialogDescription>
              Add this interactive portrait to your website with just 2 lines of code.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Step 1: Add Script */}
            <div>
              <h3 className="text-sm font-medium mb-2">1. Add the script to your HTML head</h3>
              <div className="relative">
                <pre className="bg-muted p-3 pr-12 rounded-lg text-xs break-all" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <code>{scriptCode}</code>
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 -translate-y-1/2 right-1 h-8 w-8"
                  onClick={() => copyToClipboard(scriptCode, setCopiedScript)}
                >
                  {copiedScript ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Step 2: Add Component */}
            <div>
              <h3 className="text-sm font-medium mb-2">2. Add the web component where you want it</h3>
              <div className="relative">
                <pre className="bg-muted p-3 pr-12 rounded-lg text-xs break-all" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <code>{componentCode}</code>
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 -translate-y-1/2 right-1 h-8 w-8"
                  onClick={() => copyToClipboard(componentCode, setCopiedComponent)}
                >
                  {copiedComponent ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Framework Tips */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Framework-specific tips</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {(Object.keys(frameworkInfo) as Framework[]).map((fw) => (
                  <button
                    key={fw}
                    onClick={() => setSelectedFramework(fw)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedFramework === fw
                        ? 'bg-foreground text-background'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <span>{frameworkInfo[fw].icon}</span>
                    <span>{frameworkInfo[fw].name}</span>
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {frameworkInfo[selectedFramework].instructions}
              </p>
            </div>

            {/* Note */}
            <div className="border-l-4 border-muted-foreground/30 pl-4 text-sm text-muted-foreground">
              The web component fills 100% width and height of its container with <code className="bg-muted px-1 rounded">object-fit: contain</code>. Wrap it in a sized container to control dimensions.
            </div>

            {/* Options */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Available options</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <div><code className="bg-muted px-1 rounded">hide-controls</code> - Hide the fullscreen button</div>
                <div><code className="bg-muted px-1 rounded">smoothing="0.15"</code> - Adjust eye movement smoothing (0.05-0.3)</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setShowEmbedModal(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
