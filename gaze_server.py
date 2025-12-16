#!/usr/bin/env python3
"""
GPU-side HTTP server for gaze generation.
Runs on the pod and accepts image uploads, returning generated sprites.

Usage:
  gpu run -p 8080:8000 python gaze_server.py

Endpoints:
  GET  /health   -> {"status": "ok", "models_loaded": bool}
  POST /generate -> JSON body with image_base64, session_id, etc.
                    Returns {"session_id": ..., "metadata": {...}, "status": "complete"}
"""

import os
import sys
import base64
import json
import asyncio
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Add LivePortrait to path (relative to this file's directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LIVEPORTRAIT_PATH = os.environ.get('LIVEPORTRAIT_PATH', os.path.join(SCRIPT_DIR, 'lib', 'LivePortrait'))

# Pretrained weights path
WEIGHTS_PATH = os.path.join(LIVEPORTRAIT_PATH, 'pretrained_weights')


def ensure_liveportrait_cloned():
    """Clone LivePortrait repo if source code is not present."""
    src_path = os.path.join(LIVEPORTRAIT_PATH, 'src')
    if os.path.exists(src_path):
        print(f"LivePortrait source code already present at {LIVEPORTRAIT_PATH}", flush=True)
        return True

    print(f"Cloning LivePortrait repository to {LIVEPORTRAIT_PATH}...", flush=True)
    try:
        import subprocess
        # Create lib directory if it doesn't exist
        os.makedirs(os.path.dirname(LIVEPORTRAIT_PATH), exist_ok=True)

        # Clone if directory doesn't exist, otherwise just ensure src is there
        if not os.path.exists(LIVEPORTRAIT_PATH):
            subprocess.run([
                'git', 'clone', '--depth', '1',
                'https://github.com/KwaiVGI/LivePortrait.git',
                LIVEPORTRAIT_PATH
            ], check=True)
        else:
            # Directory exists but no src - something went wrong, re-clone
            import shutil
            shutil.rmtree(LIVEPORTRAIT_PATH)
            subprocess.run([
                'git', 'clone', '--depth', '1',
                'https://github.com/KwaiVGI/LivePortrait.git',
                LIVEPORTRAIT_PATH
            ], check=True)

        print("LivePortrait cloned successfully!", flush=True)
        return True
    except Exception as e:
        print(f"Error cloning LivePortrait: {e}", flush=True)
        return False


# Ensure LivePortrait is available before adding to path
ensure_liveportrait_cloned()
sys.path.insert(0, LIVEPORTRAIT_PATH)

# Global generator instance (loaded once)
_GENERATOR = None
_MODELS_LOADED = False

# Progress tracking for active sessions
_SESSION_PROGRESS = {}  # session_id -> {stage, current, total, message}


def ensure_weights_downloaded():
    """Download LivePortrait weights from Hugging Face if not present."""
    weights_marker = os.path.join(WEIGHTS_PATH, 'liveportrait', 'base_models')
    if os.path.exists(weights_marker):
        print(f"Weights already present at {WEIGHTS_PATH}", flush=True)
        return True

    print(f"Downloading LivePortrait weights to {WEIGHTS_PATH}...", flush=True)
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(
            'KlingTeam/LivePortrait',
            local_dir=WEIGHTS_PATH,
            ignore_patterns=['*.git*', 'README.md', 'docs/*']
        )
        print("Weights downloaded successfully!", flush=True)
        return True
    except Exception as e:
        print(f"Failed to download weights: {e}", flush=True)
        return False

app = FastAPI(title="Gaze Generator API", version="1.0.0")


class GenerateRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded input image (JPEG/PNG)")
    session_id: str = Field(..., description="Unique session identifier")
    remove_background: bool = Field(False, description="Whether to remove background")
    grid_size: int = Field(30, description="Grid size (30 = 900 images)")


class GenerateResponse(BaseModel):
    session_id: str
    output_dir: str
    metadata: dict
    status: str


def get_generator(remove_background: bool = False):
    """Get or create the generator instance."""
    global _GENERATOR, _MODELS_LOADED

    # If background removal setting changed, create new instance
    if _GENERATOR is not None:
        if _GENERATOR.remove_background != remove_background:
            _GENERATOR = None

    if _GENERATOR is None:
        print("Loading LivePortrait models...", flush=True)
        # Import here to avoid loading at startup if not needed
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from generate_gaze import GazeGridGeneratorWeb
        _GENERATOR = GazeGridGeneratorWeb(device='cuda', remove_background=remove_background)
        _MODELS_LOADED = True
        print("Models loaded successfully!", flush=True)

    return _GENERATOR


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "models_loaded": _MODELS_LOADED}


@app.get("/progress/{session_id}")
async def get_progress(session_id: str):
    """Get generation progress for a session."""
    if session_id in _SESSION_PROGRESS:
        return _SESSION_PROGRESS[session_id]
    return {"stage": "unknown", "current": 0, "total": 0, "message": "Session not found"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate gaze sprites from uploaded image."""
    global _SESSION_PROGRESS

    # Initialize progress tracking
    _SESSION_PROGRESS[req.session_id] = {
        "stage": "initializing",
        "current": 0,
        "total": req.grid_size * req.grid_size,
        "message": "Starting generation..."
    }

    # Create working directory for this session
    # Use project directory (where this script lives) so outputs sync back via gpu-cli
    work_dir = Path(SCRIPT_DIR) / "jobs" / req.session_id
    work_dir.mkdir(parents=True, exist_ok=True)

    input_path = work_dir / "input.jpg"
    output_dir = work_dir / "gaze_output"
    sprite_output = work_dir / "sprite.jpg"  # Required arg but not used in quadrant mode

    # Decode base64 image
    try:
        image_data = base64.b64decode(req.image_base64)
        input_path.write_bytes(image_data)
        print(f"Saved input image: {input_path} ({len(image_data)} bytes)", flush=True)
    except Exception as e:
        del _SESSION_PROGRESS[req.session_id]
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    # Progress callback for real-time updates
    def progress_callback(stage: str, current: int, total: int, message: str):
        _SESSION_PROGRESS[req.session_id] = {
            "stage": stage,
            "current": current,
            "total": total,
            "message": message
        }

    # Get or create generator
    try:
        progress_callback("loading", 0, 100, "Loading models...")
        generator = await asyncio.to_thread(get_generator, req.remove_background)
    except Exception as e:
        del _SESSION_PROGRESS[req.session_id]
        raise HTTPException(status_code=500, detail=f"Failed to load models: {e}")

    # Run generation
    try:
        print(f"Starting generation for session {req.session_id}...", flush=True)
        progress_callback("preparing", 0, req.grid_size * req.grid_size, "Preparing source image...")
        await asyncio.to_thread(
            generator.generate_grid,
            str(input_path),
            str(output_dir),
            str(sprite_output),
            req.grid_size,
            8,  # batch_size
            progress_callback  # Pass the callback
        )
        print(f"Generation complete for session {req.session_id}", flush=True)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR: Generation failed for {req.session_id}:\n{error_trace}", flush=True)
        del _SESSION_PROGRESS[req.session_id]
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    # Clean up progress tracking
    progress_callback("complete", req.grid_size * req.grid_size, req.grid_size * req.grid_size, "Generation complete!")
    # Keep progress for a bit so client can see completion, then clean up
    # (In practice, client will stop polling after HTTP response)

    # Read metadata
    metadata_path = output_dir / "metadata.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=500, detail="Generation failed: no metadata produced")

    try:
        metadata = json.loads(metadata_path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read metadata: {e}")

    return JSONResponse(content={
        "session_id": req.session_id,
        "output_dir": str(output_dir),
        "metadata": metadata,
        "status": "complete"
    })


@app.get("/files/{session_id}/{filename}")
async def get_file(session_id: str, filename: str):
    """Serve generated files directly (fallback for when daemon sync fails)."""
    from fastapi.responses import FileResponse

    # Security: only allow specific filenames (30x30 and 20x20 sprites)
    allowed_files = [
        'q0.webp', 'q1.webp', 'q2.webp', 'q3.webp',  # 30x30 sprites
        'q0_20.webp', 'q1_20.webp', 'q2_20.webp', 'q3_20.webp',  # 20x20 mobile sprites
        'metadata.json'
    ]
    if filename not in allowed_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = Path(SCRIPT_DIR) / "jobs" / session_id / "gaze_output" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "image/webp" if filename.endswith('.webp') else "application/json"
    return FileResponse(file_path, media_type=media_type)


@app.get("/download/{session_id}")
async def download_zip(session_id: str):
    """Download all output files as a single zip (more reliable than multiple downloads)."""
    import zipfile
    import io
    from fastapi.responses import StreamingResponse

    output_dir = Path(SCRIPT_DIR) / "jobs" / session_id / "gaze_output"
    if not output_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    # Files to include in zip
    files_to_zip = [
        'q0.webp', 'q1.webp', 'q2.webp', 'q3.webp',  # 30x30 sprites
        'q0_20.webp', 'q1_20.webp', 'q2_20.webp', 'q3_20.webp',  # 20x20 mobile sprites
        'metadata.json'
    ]

    # Create zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_STORED) as zf:  # ZIP_STORED = no compression (webp already compressed)
        for filename in files_to_zip:
            file_path = output_dir / filename
            if file_path.exists():
                zf.write(file_path, filename)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={session_id}.zip"}
    )


@app.on_event("startup")
async def startup_event():
    """Download weights if needed and pre-load models on startup."""
    # First, ensure weights are downloaded
    print("Checking for LivePortrait weights...", flush=True)
    weights_ok = await asyncio.to_thread(ensure_weights_downloaded)
    if not weights_ok:
        print("Warning: Could not download weights. Generation may fail.", flush=True)
        return

    # Pre-load models for faster first request
    print("Pre-loading LivePortrait models on startup...", flush=True)
    try:
        await asyncio.to_thread(get_generator)
        print("Models pre-loaded successfully!", flush=True)
    except Exception as e:
        print(f"Warning: Failed to pre-load models: {e}", flush=True)
        print("Models will be loaded on first request.", flush=True)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run Gaze Generator HTTP server")
    parser.add_argument("--host", default="0.0.0.0", help="Listen host")
    parser.add_argument("--port", type=int, default=8000, help="Listen port")
    args = parser.parse_args()

    uvicorn.run(
        "gaze_server:app",
        host=args.host,
        port=args.port,
        reload=False,
        workers=1,
        log_level="info",
    )


if __name__ == "__main__":
    main()
