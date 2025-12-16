# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start the server (runs on port 3000, auto-starts GPU pod)
npm start

# Manual GPU commands (if needed)
gpu run python gaze_server.py          # Start pod server manually
gpu status                             # Check pod status
gpu stop                               # Stop the pod
```

## Architecture

This is a gaze-tracking face animation app that generates sprite sheets of face images looking in different directions, then animates them smoothly based on cursor/touch/gyroscope input.

### Remote GPU Architecture (gpu-cli)

```
Local (port 3000)              Remote GPU Pod (port 8000)
┌─────────────────┐            ┌─────────────────────────┐
│   server.js     │ ──HTTP──▶  │   gaze_server.py        │
│   (Express +    │            │   (FastAPI + LivePortrait)
│    Socket.IO)   │ ◀──JSON──  │                         │
└─────────────────┘            └─────────────────────────┘
         │                                │
         ▼                                ▼
    uploads/                        /workspace/jobs/
    (local storage)                 (pod storage, syncs back)
```

### Data Flow

1. **Upload**: User uploads portrait via web interface → saved to `uploads/{sessionId}/`
2. **GPU Transfer**: server.js sends base64 image to pod's FastAPI server
3. **Generation**: Pod runs LivePortrait ML models → generates 900 gaze variations
4. **Sync**: `gpu sync from` pulls outputs from pod to local `jobs/` directory
5. **Copy**: Results copied from `jobs/{sessionId}/` to `uploads/{sessionId}/`
6. **Viewing**: `<gaze-tracker>` web component loads sprites and animates

### Key Components

**server.js** - Express + Socket.IO + gpu-cli integration
- Handles image uploads and resizing via Sharp (max 512px)
- Manages processing queue with real-time progress via Socket.IO
- Starts GPU pod on server startup (warm mode)
- Sends HTTP requests to pod's FastAPI server for generation
- Syncs results back via `gpu sync from`

**gaze_server.py** - FastAPI server running on GPU pod
- `/health` - Health check endpoint
- `/generate` - Accepts base64 image, runs generation, returns metadata
- Pre-loads LivePortrait models on startup for faster requests

**generate_gaze.py** - Python ML processing (called by gaze_server.py)
- Uses LivePortrait models for face retargeting
- Generates 900 images with varying pupil position, head pitch/yaw, eyebrow
- Outputs 4 quadrant sprite sheets (15x15 each) as WebP
- Optional background removal via rembg

**gpu.toml** - gpu-cli configuration
- Configures RunPod provider with RTX 4090
- Installs LivePortrait and dependencies on pod
- Defines output sync patterns (`jobs/*/gaze_output/`)

**public/widget/gaze-tracker.js** - Web component
- Custom `<gaze-tracker>` element with Shadow DOM
- Loads PixiJS dynamically, renders sprite frames
- Supports quadrant mode (4 sprites) or single sprite mode
- Input: mouse, touch, and device gyroscope

### Web Component Usage

```html
<!-- Quadrant mode (default for generated content) -->
<gaze-tracker
  src="q0.webp,q1.webp,q2.webp,q3.webp"
  mode="quadrants"
  grid="30"
  width="512"
  height="640">
</gaze-tracker>
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `GPU_CLI` - Path to gpu-cli binary (default: `gpu`)
- `LIVEPORTRAIT_PATH` - Path to LivePortrait on pod (default: `/workspace/LivePortrait`)

### Session Storage

- Generated sessions stored in `uploads/{sessionId}/`
- GPU working files synced to `jobs/{sessionId}/`
- User history persisted in localStorage (last 20 sessions)
- Sessions are shareable via URL
