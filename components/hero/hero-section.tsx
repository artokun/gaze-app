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
        <GazeTrackerWrapper
          src="/api/files/demo/"
          className="h-full max-w-full"
        />
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
          Move your cursor over the image
        </p>
      </div>
    </div>
  );
}
