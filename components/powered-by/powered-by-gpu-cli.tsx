'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { SiGithub } from 'react-icons/si'
import { Copy, Check, Zap, Shield, DollarSign, Terminal } from 'lucide-react'

export function PoweredByGpuCli() {
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const installCommand = 'curl -fsSL https://gpu-cli.sh | sh'

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-start gap-3 w-full group cursor-pointer hover:bg-secondary/50 rounded-lg p-2 -m-2 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <Terminal className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-left">
          <p className="font-medium text-sm bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent group-hover:from-pink-400 group-hover:via-purple-400 group-hover:to-blue-400">
            Powered by gpu-cli
          </p>
          <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            Remote GPU execution made simple
          </p>
        </div>
      </button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              gpu-cli
            </DialogTitle>
            <DialogDescription>
              Run code on remote GPUs as if it were local
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This app uses <span className="font-medium text-foreground">gpu-cli</span> to
              seamlessly deploy and run AI workloads on RunPod GPUs. One command handles
              file sync, execution, and result retrieval.
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">46x Faster</p>
                  <p className="text-xs text-muted-foreground">Startup in 8ms</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Zero Trust</p>
                  <p className="text-xs text-muted-foreground">Keychain + LUKS2</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">60-98% Savings</p>
                  <p className="text-xs text-muted-foreground">Auto-stop idle pods</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Terminal className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">One Command</p>
                  <p className="text-xs text-muted-foreground">gpu run python train.py</p>
                </div>
              </div>
            </div>

            {/* Install command */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Install in seconds:</p>
              <div className="relative">
                <pre className="bg-muted p-3 pr-12 rounded-lg text-xs font-mono">
                  {installCommand}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 -translate-y-1/2 right-1 h-8 w-8"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* CTA */}
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <a href="https://github.com/gpu-cli/gpu-cli" target="_blank" rel="noopener noreferrer">
                  <SiGithub className="w-4 h-4 mr-2" />
                  View on GitHub
                </a>
              </Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
