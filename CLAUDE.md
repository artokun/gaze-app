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
gpu daemon status                      # Check daemon status
gpu daemon logs -f                     # View daemon logs
gpu stop --force                       # Stop the pod
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
    uploads/                        jobs/{sessionId}/
    (local storage)                 (pod storage, syncs back)
```

### Data Flow

1. **Upload**: User uploads portrait via web interface → saved to `uploads/{sessionId}/`
2. **GPU Transfer**: server.js sends base64 image to pod's FastAPI server
3. **Generation**: Pod runs LivePortrait ML models → generates 900 gaze variations
4. **Progress**: server.js polls `/progress/{sessionId}` endpoint for real-time updates
5. **Sync**: Daemon-managed sync OR HTTP fallback via `/files/{sessionId}/{filename}`
6. **Copy**: Results copied from `jobs/{sessionId}/` to `uploads/{sessionId}/`
7. **Viewing**: `<gaze-tracker>` web component loads sprites and animates

### Key Components

**server.js** - Express + Socket.IO + gpu-cli integration
- Handles image uploads and resizing via Sharp (max 512px)
- Manages processing queue with real-time progress via Socket.IO
- Starts GPU pod on server startup (warm mode)
- Sends HTTP requests to pod's FastAPI server for generation
- Polls `/progress/{sessionId}` for generation progress
- HTTP fallback for file download when daemon sync fails

**gaze_server.py** - FastAPI server running on GPU pod
- `/health` - Health check endpoint
- `/generate` - Accepts base64 image, runs generation, returns metadata
- `/progress/{session_id}` - Returns generation progress (current/total images)
- `/files/{session_id}/{filename}` - Serves generated files (HTTP fallback)
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
- Attributes: `src`, `smoothing`, `hide-controls`
- Auto-detects mobile (20x20 grid) vs desktop (30x30 grid)

**public/index.html** - Main UI
- Shows demo by default (from `/demo/` assets)
- "Make Your Own" button reveals upload form
- History section shows previous sessions (thumbnails from `input.jpg`)
- Real-time generation progress with expandable log

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

**Local Development:**
- `PORT` - Server port (default: 3000)
- `GPU_CLI` - Path to gpu-cli binary (default: `gpu`)

**Deployment (Fly.io/Docker):**
- `RUNPOD_API_KEY` - RunPod API key (required, starts with `rpa_`)
- `GPU_TEST_KEYCHAIN_FILE` - Path to keychain JSON file (for containerized deployments)
- `GPU_SSH_PRIVATE_KEY` - Optional pre-generated SSH private key
- `GPU_SSH_PUBLIC_KEY` - Optional pre-generated SSH public key

### Session Storage

- Generated sessions stored in `uploads/{sessionId}/`
- GPU working files synced to `jobs/{sessionId}/`
- User history persisted in localStorage (last 20 sessions)
- Sessions are shareable via URL
- Demo assets in `public/demo/`

### Deployment

**Fly.io deployment:**
```bash
fly apps create gaze-app
fly volumes create gaze_data --size 10 --region sjc
fly secrets set RUNPOD_API_KEY=rpa_your_key_here
fly deploy
```

**Key files:**
- `Dockerfile` - Container with Node.js + gpu-cli
- `fly.toml` - Fly.io config with persistent volume
- `scripts/setup-gpu-credentials.js` - Generates keychain from env vars
- `scripts/start.sh` - Startup script

### View Page

`/view/:sessionId` - Standalone fullscreen view page
- 100dvh height for proper mobile viewport
- `hide-controls` attribute hides widget controls
- Mobile gyro dialog: choose tilt or two-finger drag
- Safe area insets for notched phones
- Back button (top-left) returns to main session page

### CDN & Widget Distribution

The widget is distributed via jsDelivr CDN from the `artokun/gaze-widget-dist` repo.

**CDN URL format:**
```
https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@v1.0.0/gaze-tracker.js
```

**IMPORTANT: Use versioned tags, not @main**
- jsDelivr caches @main branch aggressively and updates are unreliable
- Tags are immutable and cache correctly
- Always use `@v1.0.0` (or latest version) in CDN URLs

**Creating a new widget release:**
```bash
# After pushing changes to public/widget/gaze-tracker.js
# The GitHub Action (.github/workflows/publish-widget.yml) auto-publishes to gaze-widget-dist

# Then create a new versioned release:
gh release create v1.0.1 --repo artokun/gaze-widget-dist \
  --title "v1.0.1" \
  --notes "Description of changes" \
  --target main

# Verify the new version works:
curl -s "https://cdn.jsdelivr.net/gh/artokun/gaze-widget-dist@v1.0.1/gaze-tracker.js" | head -20

# Update all CDN references in the codebase to use the new version
```

**Files using CDN:**
- `server.js` - View page and download README
- `public/index.html` - Code snippets for users
- `public/widget/demo-*.html` - Demo files
- `public/widget/README.md` - Documentation

### File Protocol Limitations

The widget does NOT work when opened from `file://` protocol due to browser security:
- WebGL "tainted canvas" errors prevent rendering
- CORS restrictions block sprite loading
- Demo files show instructions to run `npx serve`

### Known Issues & Workarounds

See `GPU-CLI-ISSUES.md` for detailed documentation of:
- Port conflicts when restarting servers (use `gpu stop --force --no-sync`)
- Daemon sync unreliability (HTTP fallback implemented)
- Shell steps in gpu.toml not executing (manual workaround)
- Pod-local downloads not persisting (download in Python code)
