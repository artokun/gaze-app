"use client";

import { useState, useRef, useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GazeTrackerWrapper } from "@/components/viewer/gaze-tracker-wrapper";
import {
  ArrowRight,
  Sparkles,
  Code,
  Zap,
  Users,
  Smartphone,
  Menu,
} from "lucide-react";
import { PoweredByGpuCli } from "@/components/powered-by/powered-by-gpu-cli";

function SidebarContent({
  fileInputRef,
  handleUploadClick,
  handleInputChange,
  isProcessing,
  isUploading,
  gpuStatus,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadClick: () => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
  isUploading: boolean;
  gpuStatus: { stage: string };
}) {
  return (
    <>
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

      <div className="space-y-3 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-medium text-sm">AI-Powered</p>
            <p className="text-xs text-muted-foreground">
              Uses machine learning to generate 900 gaze variations
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Code className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-medium text-sm">Easy to Embed</p>
            <p className="text-xs text-muted-foreground">
              Just 2 lines: CDN script + web component.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-medium text-sm">Instant Results</p>
            <p className="text-xs text-muted-foreground">
              Generate in ~60 seconds with GPU acceleration
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-medium text-sm">Multi-Portrait Support</p>
            <p className="text-xs text-muted-foreground">
              Up to 16 portraits on one page.{" "}
              <a href="/demo/multi" className="underline hover:text-foreground">
                See demo
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Smartphone className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="font-medium text-sm">Mobile Gyroscope</p>
            <p className="text-xs text-muted-foreground">
              On mobile, tilt your phone to control the gaze
            </p>
          </div>
        </div>

        <PoweredByGpuCli />
      </div>

      <div className="mt-auto space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />
        <Button
          size="lg"
          onClick={handleUploadClick}
          disabled={
            isProcessing ||
            (gpuStatus.stage !== "ready" && gpuStatus.stage !== "idle")
          }
          className="w-full font-medium"
        >
          {isUploading ? "Uploading..." : "Create Your Own"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          or drag & drop anywhere
        </p>
      </div>
    </>
  );
}

export function HeroSection() {
  const { upload, gpuStatus, progress } = useSocket();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = progress !== null || isUploading;

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

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setSheetOpen(false);
    try {
      const response = await upload(file, false);
      if (!response.success) {
        console.error("Upload failed:", response.error);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
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
    fileInputRef,
    handleUploadClick,
    handleInputChange,
    isProcessing,
    isUploading,
    gpuStatus,
  };

  return (
    <div className="flex-1 flex min-h-0">
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
  );
}
