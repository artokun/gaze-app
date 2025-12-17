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
from typing import Optional, Dict, List
import aiohttp
import boto3
from botocore.config import Config as BotoConfig

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
# Each session has: {stage, current, total, message, quadrants: [{status: pending|stitching|uploading|done}]}
_SESSION_PROGRESS: Dict[str, dict] = {}

# Quadrant status constants
QUADRANT_PENDING = "pending"
QUADRANT_STITCHING = "stitching"
QUADRANT_UPLOADING = "uploading"
QUADRANT_DONE = "done"

# File names for each quadrant (8 total: 4 desktop + 4 mobile)
QUADRANT_FILES = [
    "q0.webp", "q1.webp", "q2.webp", "q3.webp",           # desktop 30x30
    "q0_20.webp", "q1_20.webp", "q2_20.webp", "q3_20.webp"  # mobile 20x20
]


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


class CloudflareConfig(BaseModel):
    account_id: str
    api_token: str
    account_hash: str

class R2Config(BaseModel):
    bucket: str
    account_id: str
    access_key_id: str
    secret_access_key: str
    public_url: str

class GenerateRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded input image (JPEG/PNG)")
    session_id: str = Field(..., description="Unique session identifier")
    remove_background: bool = Field(False, description="Whether to remove background")
    grid_size: int = Field(30, description="Grid size (30 = 900 images)")
    cloudflare: Optional[CloudflareConfig] = Field(None, description="Cloudflare Images credentials (legacy)")
    r2: Optional[R2Config] = Field(None, description="Cloudflare R2 credentials for direct upload")


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


async def upload_to_cloudflare(
    session_id: str,
    file_path: str,
    filename: str,
    cf_config: CloudflareConfig
) -> bool:
    """Upload a file directly to Cloudflare Images from the GPU pod (legacy)."""
    api_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_config.account_id}/images/v1"

    # Remove extension for image ID
    base_name = filename.replace('.webp', '').replace('.jpg', '').replace('.jpeg', '')
    image_id = f"{session_id}/{base_name}"

    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()

        # Determine content type
        content_type = "image/webp" if filename.endswith('.webp') else "image/jpeg"

        # Create form data for aiohttp
        form = aiohttp.FormData()
        form.add_field('file', file_data, filename=filename, content_type=content_type)
        form.add_field('id', image_id)

        async with aiohttp.ClientSession() as session:
            async with session.post(
                api_url,
                data=form,
                headers={'Authorization': f'Bearer {cf_config.api_token}'}
            ) as resp:
                if resp.status == 200 or resp.status == 409:  # 409 = already exists
                    print(f"CDN upload success: {image_id}", flush=True)
                    return True
                else:
                    text = await resp.text()
                    print(f"CDN upload failed for {image_id}: {resp.status} - {text}", flush=True)
                    return False
    except Exception as e:
        print(f"CDN upload error for {image_id}: {e}", flush=True)
        return False


def get_r2_client(r2_config: R2Config):
    """Create an S3 client configured for Cloudflare R2."""
    return boto3.client(
        's3',
        endpoint_url=f"https://{r2_config.account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=r2_config.access_key_id,
        aws_secret_access_key=r2_config.secret_access_key,
        config=BotoConfig(
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        ),
        region_name='auto'
    )


async def upload_to_r2(
    session_id: str,
    file_path: str,
    filename: str,
    r2_config: R2Config
) -> bool:
    """Upload a file directly to Cloudflare R2 from the GPU pod."""
    # Build the key: session_id/gaze_output/filename for sprites, session_id/filename for input
    if filename == 'input.jpg':
        key = f"{session_id}/{filename}"
    else:
        key = f"{session_id}/gaze_output/{filename}"

    try:
        # Determine content type
        content_type = "image/webp" if filename.endswith('.webp') else "image/jpeg"
        if filename.endswith('.json'):
            content_type = "application/json"

        # Use boto3 in a thread to avoid blocking
        def do_upload():
            client = get_r2_client(r2_config)
            with open(file_path, 'rb') as f:
                client.put_object(
                    Bucket=r2_config.bucket,
                    Key=key,
                    Body=f,
                    ContentType=content_type
                )
            return True

        result = await asyncio.to_thread(do_upload)
        print(f"R2 upload success: {key}", flush=True)
        return result
    except Exception as e:
        print(f"R2 upload error for {key}: {e}", flush=True)
        return False


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

    # Initialize progress tracking with per-quadrant status
    _SESSION_PROGRESS[req.session_id] = {
        "stage": "initializing",
        "current": 0,
        "total": req.grid_size * req.grid_size,
        "message": "Starting generation...",
        "quadrants": [{"status": QUADRANT_PENDING} for _ in range(8)]
    }

    # Create working directory for this session
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

    # Track upload tasks and their completion
    upload_tasks: List[asyncio.Task] = []
    loop = asyncio.get_event_loop()

    # Progress callback for real-time updates
    def progress_callback(stage: str, current: int, total: int, message: str):
        progress_data = _SESSION_PROGRESS.get(req.session_id, {})
        progress_data.update({
            "stage": stage,
            "current": current,
            "total": total,
            "message": message
        })
        # Update quadrant status for stitching stage
        if stage == "stitching" and total == 8:
            progress_data["quadrant"] = current
            # Mark this quadrant as stitching
            if "quadrants" in progress_data and current < 8:
                progress_data["quadrants"][current]["status"] = QUADRANT_STITCHING
        _SESSION_PROGRESS[req.session_id] = progress_data

    # Callback when a quadrant file is ready - starts async upload
    def quadrant_ready_callback(quadrant_idx: int, file_path: str):
        """Called from generate_grid thread when a quadrant is saved."""
        progress_data = _SESSION_PROGRESS.get(req.session_id, {})

        # R2 takes precedence over CF Images
        if req.r2:
            # Mark as uploading
            if "quadrants" in progress_data and quadrant_idx < 8:
                progress_data["quadrants"][quadrant_idx]["status"] = QUADRANT_UPLOADING
                _SESSION_PROGRESS[req.session_id] = progress_data

            # Schedule async upload to R2
            filename = QUADRANT_FILES[quadrant_idx]
            future = asyncio.run_coroutine_threadsafe(
                upload_quadrant_to_r2(req.session_id, quadrant_idx, file_path, filename, req.r2),
                loop
            )
            upload_tasks.append(future)
        elif req.cloudflare:
            # Legacy: Cloudflare Images
            if "quadrants" in progress_data and quadrant_idx < 8:
                progress_data["quadrants"][quadrant_idx]["status"] = QUADRANT_UPLOADING
                _SESSION_PROGRESS[req.session_id] = progress_data

            filename = QUADRANT_FILES[quadrant_idx]
            future = asyncio.run_coroutine_threadsafe(
                upload_quadrant_to_cf(req.session_id, quadrant_idx, file_path, filename, req.cloudflare),
                loop
            )
            upload_tasks.append(future)
        else:
            # No CDN upload, mark as done immediately
            if "quadrants" in progress_data and quadrant_idx < 8:
                progress_data["quadrants"][quadrant_idx]["status"] = QUADRANT_DONE
                _SESSION_PROGRESS[req.session_id] = progress_data

    async def upload_quadrant_to_r2(session_id: str, quadrant_idx: int, file_path: str, filename: str, r2_config: R2Config):
        """Upload a quadrant to R2 and update its status."""
        success = await upload_to_r2(session_id, file_path, filename, r2_config)
        progress_data = _SESSION_PROGRESS.get(session_id, {})
        if "quadrants" in progress_data and quadrant_idx < 8:
            progress_data["quadrants"][quadrant_idx]["status"] = QUADRANT_DONE if success else "error"
            _SESSION_PROGRESS[session_id] = progress_data
        return success

    async def upload_quadrant_to_cf(session_id: str, quadrant_idx: int, file_path: str, filename: str, cf_config: CloudflareConfig):
        """Upload a quadrant to CF Images and update its status (legacy)."""
        success = await upload_to_cloudflare(session_id, file_path, filename, cf_config)
        progress_data = _SESSION_PROGRESS.get(session_id, {})
        if "quadrants" in progress_data and quadrant_idx < 8:
            progress_data["quadrants"][quadrant_idx]["status"] = QUADRANT_DONE if success else "error"
            _SESSION_PROGRESS[session_id] = progress_data
        return success

    # Get or create generator
    try:
        progress_callback("loading", 0, 100, "Loading models...")
        generator = await asyncio.to_thread(get_generator, req.remove_background)
    except Exception as e:
        del _SESSION_PROGRESS[req.session_id]
        raise HTTPException(status_code=500, detail=f"Failed to load models: {e}")

    # Run generation with quadrant callback
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
            progress_callback,
            quadrant_ready_callback  # New callback for async uploads
        )
        print(f"Generation complete for session {req.session_id}", flush=True)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR: Generation failed for {req.session_id}:\n{error_trace}", flush=True)
        del _SESSION_PROGRESS[req.session_id]
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    # Wait for any remaining uploads to complete (using asyncio.wrap_future to avoid blocking)
    if upload_tasks:
        progress_callback("uploading", 0, len(upload_tasks), "Finishing CDN uploads...")
        print(f"Waiting for {len(upload_tasks)} CDN uploads to complete...", flush=True)

        # Wrap concurrent.futures.Future objects as awaitable asyncio Futures
        # This is critical - using future.result() would block the event loop
        # and prevent the scheduled coroutines from actually running!
        async_futures = [asyncio.wrap_future(f) for f in upload_tasks]
        results = await asyncio.gather(*async_futures, return_exceptions=True)

        # Log any errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                print(f"Upload task {i} error: {result}", flush=True)

        print("All CDN uploads complete!", flush=True)

    # Upload input image and metadata to storage
    uploaded_to_r2 = False
    uploaded_to_cdn = False

    if req.r2:
        # R2: Upload input image and metadata
        await upload_to_r2(req.session_id, str(input_path), "input.jpg", req.r2)
        metadata_path = output_dir / "metadata.json"
        if metadata_path.exists():
            await upload_to_r2(req.session_id, str(metadata_path), "metadata.json", req.r2)
        uploaded_to_r2 = True
    elif req.cloudflare:
        # Legacy CF Images: Upload input image
        await upload_to_cloudflare(req.session_id, str(input_path), "input.jpg", req.cloudflare)
        uploaded_to_cdn = True

    # Clean up progress tracking
    progress_callback("complete", req.grid_size * req.grid_size, req.grid_size * req.grid_size, "Generation complete!")

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
        "status": "complete",
        "r2_uploaded": uploaded_to_r2,
        "cdn_uploaded": uploaded_to_cdn or uploaded_to_r2  # Keep cdn_uploaded for backward compat
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
