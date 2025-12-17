"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GazeTrackerWrapper } from "@/components/viewer/gaze-tracker-wrapper";
import {
  ArrowRight,
  Sparkles,
  Code,
  Zap,
  Users,
  Smartphone,
  Menu,
  Terminal,
  Copy,
  Check,
  Shield,
  DollarSign,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
// GPU status bar moved to session page - provisions on-demand after upload
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { History } from "lucide-react";
import Link from "next/link";

// Feature data for consistent rendering
const features = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Uses machine learning to generate 900 gaze variations",
  },
  {
    icon: Code,
    title: "Easy to Embed",
    description: "Just 2 lines: CDN script + web component.",
  },
  {
    icon: Zap,
    title: "Instant Results",
    description: "Generate in ~60 seconds with GPU acceleration",
  },
  {
    icon: Users,
    title: "Multi-Portrait",
    description: "Up to 16 portraits on one page.",
    link: { href: "/demo/multi", text: "See demo", external: false },
  },
  {
    icon: Smartphone,
    title: "Mobile Gyroscope",
    description: "On mobile, tilt your phone to control the gaze",
  },
  {
    icon: Terminal,
    title: "gpu-cli Powered",
    description: "Remote GPU execution made simple",
    modal: true,
    gradient: true,
  },
];

function GpuCliModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const installCommand = 'curl -fsSL https://gpu-cli.sh | sh';

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <a href="https://github.com/gpu-cli/gpu-cli" target="_blank" rel="noopener noreferrer">
                <SiGithub className="w-4 h-4 mr-2" />
                View on GitHub
              </a>
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarContent({
  handleUploadClick,
  isProcessing,
  showUploadButton,
  historyCount,
  isCompact,
}: {
  handleUploadClick: () => void;
  isProcessing: boolean;
  showUploadButton: boolean;
  historyCount: number;
  isCompact: boolean;
}) {
  const [gpuCliModalOpen, setGpuCliModalOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <GpuCliModal open={gpuCliModalOpen} onOpenChange={setGpuCliModalOpen} />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
        <div className="mb-6">
          <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-3">
            Gaze Tracker
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight mb-3">
            Bring your portraits to life
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Transform any portrait into an animated headshot that follows your
            visitors' cursor. Perfect for personal sites, portfolios, and team
            pages.
          </p>
        </div>

        {/* Features - compact 2x3 cards or full list */}
        {isCompact ? (
          <div className="grid grid-cols-2 gap-2">
            {features.map((feature) => {
              const Icon = feature.icon;
              const isClickable = feature.link || feature.modal;
              const handleClick = feature.modal ? () => setGpuCliModalOpen(true) : undefined;

              if (feature.link) {
                return (
                  <a
                    key={feature.title}
                    href={feature.link.href}
                    target={feature.link.external ? '_blank' : undefined}
                    rel={feature.link.external ? 'noopener noreferrer' : undefined}
                    className={`rounded-lg px-2 py-3 block hover:bg-secondary/70 transition-colors ${
                      feature.gradient
                        ? 'bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-blue-500/10 border border-purple-500/20'
                        : 'bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${feature.gradient ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500' : 'bg-secondary'}`}>
                        <Icon className={`w-3 h-3 ${feature.gradient ? 'text-white' : ''}`} />
                      </div>
                      <p className={`font-medium text-xs leading-tight ${feature.gradient ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent' : ''}`}>
                        {feature.title}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{feature.description}</p>
                  </a>
                );
              }

              return (
                <button
                  key={feature.title}
                  onClick={handleClick}
                  className={`rounded-lg px-2 py-3 block text-left ${
                    feature.gradient
                      ? 'bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-blue-500/10 border border-purple-500/20'
                      : 'bg-secondary/50'
                  } ${isClickable ? 'hover:bg-secondary/70 transition-colors cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${feature.gradient ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500' : 'bg-secondary'}`}>
                      <Icon className={`w-3 h-3 ${feature.gradient ? 'text-white' : ''}`} />
                    </div>
                    <p className={`font-medium text-xs leading-tight ${feature.gradient ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent' : ''}`}>
                      {feature.title}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{feature.description}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              const isClickable = feature.modal;
              const Wrapper = isClickable ? 'button' : 'div';
              const wrapperProps = isClickable ? {
                onClick: () => setGpuCliModalOpen(true),
                type: 'button' as const,
              } : {};

              return (
                <Wrapper
                  key={feature.title}
                  {...wrapperProps}
                  className={`flex items-start gap-3 w-full text-left ${isClickable ? 'hover:bg-secondary/50 -mx-2 px-2 py-1 -my-1 rounded-lg transition-colors cursor-pointer' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      feature.gradient
                        ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500'
                        : 'bg-secondary'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${feature.gradient ? 'text-white' : ''}`} />
                  </div>
                  <div>
                    <p className={`font-medium text-sm ${feature.gradient ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent' : ''}`}>
                      {feature.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {feature.description}
                      {feature.link && (
                        <>
                          {" "}
                          <a
                            href={feature.link.href}
                            target={feature.link.external ? "_blank" : undefined}
                            rel={feature.link.external ? "noopener noreferrer" : undefined}
                            className="underline hover:text-foreground"
                          >
                            {feature.link.text}
                          </a>
                        </>
                      )}
                      {feature.modal && (
                        <>
                          {" "}
                          <span className="underline hover:text-foreground">
                            Learn more
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        )}
      </div>

      {/* Pinned bottom section */}
      <div className="shrink-0 space-y-3 pt-4 border-t border-border/50">
        {/* Upload button - always available, GPU provisions on session page */}
        {showUploadButton && (
          <>
            <div className="flex gap-2">
              <Button
                size="lg"
                onClick={handleUploadClick}
                disabled={isProcessing}
                className={`font-medium ${historyCount > 0 ? 'flex-1' : 'w-full'}`}
              >
                Create Your Own
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              {historyCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/history">
                      <Button
                        size="lg"
                        variant="outline"
                        className="aspect-square px-0"
                      >
                        <History className="w-5 h-5" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View {historyCount} generated {historyCount === 1 ? 'gaze' : 'gazes'}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">
              or drag & drop anywhere
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const COMPACT_HEIGHT_THRESHOLD = 770;

export function HeroSection() {
  const router = useRouter();
  const { startUpload, progress } = useSocket();
  const [isDragging, setIsDragging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = progress !== null;
  // Always allow uploads - GPU provisioning happens on session page after user commits
  const showUploadButton = !isProcessing;

  // Detect viewport height for compact mode
  useEffect(() => {
    const checkHeight = () => {
      setIsCompact(window.innerHeight < COMPACT_HEIGHT_THRESHOLD);
    };

    checkHeight();
    window.addEventListener('resize', checkHeight);
    return () => window.removeEventListener('resize', checkHeight);
  }, []);

  // Load history count on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('gazeHistory');
      if (stored) {
        const history = JSON.parse(stored);
        setHistoryCount(Array.isArray(history) ? history.length : 0);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Warn user when closing during generation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (progress !== null) {
        e.preventDefault();
        e.returnValue = 'Generation in progress. Are you sure you want to leave? This will cancel the generation.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [progress]);

  // Global drop zone handlers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFileSelect(file);
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleFileSelect = (file: File) => {
    setSheetOpen(false);

    // Get sessionId immediately and navigate
    const sessionId = startUpload(file);

    // Navigate IMMEDIATELY - upload happens on session page
    // History is saved in session-viewer after upload completes
    router.push(`/${sessionId}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const sidebarProps = {
    handleUploadClick,
    isProcessing,
    showUploadButton,
    historyCount,
    isCompact,
  };

  return (
    <TooltipProvider>
      <div className="flex-1 flex min-h-0">
        {/* Hidden file input - kept at root level so ref is always attached */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />

        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-black/5 border-2 border-dashed border-foreground/20 flex items-center justify-center backdrop-blur-sm">
            <p className="text-xl font-medium tracking-tight">Drop your photo</p>
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden md:flex w-72 lg:w-80 shrink-0 border-r border-border/50 p-6 lg:p-8 flex-col">
          <SidebarContent {...sidebarProps} />
        </div>

        {/* Mobile menu button */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden absolute top-4 left-4 z-20"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 flex flex-col p-6">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation menu</SheetTitle>
            </SheetHeader>
            <SidebarContent {...sidebarProps} />
          </SheetContent>
        </Sheet>

        {/* Right side - Demo */}
        <div className="flex-1 p-4 pb-12 min-h-0 relative bg-secondary/30 flex items-center justify-center overflow-hidden">
          <div className="relative h-full max-w-full">
            <GazeTrackerWrapper
              src="/api/files/demo/"
              className="h-full max-w-full rounded-lg overflow-hidden"
            />
            <a
              href="https://www.instagram.com/miew4939/"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-all text-xs"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="url(#instagram-gradient)">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFDC80" />
                    <stop offset="25%" stopColor="#F77737" />
                    <stop offset="50%" stopColor="#E1306C" />
                    <stop offset="75%" stopColor="#C13584" />
                    <stop offset="100%" stopColor="#833AB4" />
                  </linearGradient>
                </defs>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span>@miew4939</span>
            </a>
          </div>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
            Move your cursor over the image
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
