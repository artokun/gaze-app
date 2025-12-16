# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the server (runs on port 3000)
npm start
```

The Python script `generate_gaze.py` is invoked automatically by the server as a subprocess - it requires LivePortrait installed at `/workspace/LivePortrait`.

## Architecture

This is a gaze-tracking face animation app that generates sprite sheets of face images looking in different directions, then animates them smoothly based on cursor/touch/gyroscope input.

### Data Flow

1. **Upload**: User uploads a portrait image via the web interface
2. **Processing Queue**: Server queues the job (max 20 concurrent)
3. **Generation**: Python subprocess runs LivePortrait ML models to generate 900 face variations (30x30 grid of gaze directions)
4. **Output**: 4 quadrant WebP sprite sheets (q0.webp-q3.webp) saved to `uploads/{sessionId}/gaze_output/`
5. **Viewing**: `<gaze-tracker>` web component loads sprites and interpolates between frames

### Key Components

**server.js** - Express + Socket.IO server
- Handles image uploads and resizing via Sharp (max 512px)
- Manages processing queue with real-time progress via Socket.IO
- Spawns Python subprocess for gaze generation
- Serves session URLs (`/{sessionId}`) for sharing

**generate_gaze.py** - Python ML processing
- Uses LivePortrait models for face retargeting
- Generates 900 images with varying pupil position, head pitch/yaw, and eyebrow movement
- Outputs 4 quadrant sprite sheets (15x15 each) as WebP
- Optional background removal via rembg

**public/widget/gaze-tracker.js** - Web component
- Custom `<gaze-tracker>` element with Shadow DOM
- Loads PixiJS dynamically, renders sprite frames
- Supports quadrant mode (4 sprites) or single sprite mode
- Input: mouse, touch, and device gyroscope
- Smoothing via linear interpolation between target and current frame

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

<!-- Single sprite mode -->
<gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"></gaze-tracker>
```

### Session Storage

- Generated sessions stored in `uploads/{sessionId}/`
- User history persisted in localStorage (last 20 sessions)
- Sessions are shareable via URL
