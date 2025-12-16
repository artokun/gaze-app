# Gaze Tracker v2

An interactive web app that generates 900 gaze variations of a portrait using AI, then animates them smoothly based on cursor/touch/gyroscope input.

## Demo

Upload a portrait photo and the app will generate a 30x30 grid of images with varying gaze directions, head poses, and eyebrow positions. The result is an interactive portrait that follows your cursor.

## Prerequisites

### 1. Install gpu-cli

This app uses [gpu-cli](https://gpu.sh) to run AI models on remote GPUs.

```bash
curl -fsSL https://gpu-cli.sh | sh
```

### 2. Authenticate with gpu-cli

```bash
gpu auth
```

This will open a browser window to authenticate with your GPU provider (RunPod, etc.).

### 3. Install Node.js dependencies

```bash
npm install
```

## Usage

### Start the server

```bash
npm start
```

The app will be available at http://localhost:3000

On first run, the app will:
1. Provision a GPU pod (RTX 4090)
2. Download LivePortrait AI model weights (~500MB)
3. Pre-load models for faster generation

### Upload a portrait

1. Open http://localhost:3000 in your browser
2. Drag & drop a portrait image (or click to browse)
3. Wait for generation (~70 seconds for 900 images)
4. Move your mouse to control the gaze direction!

### Share your result

Each generated portrait gets a unique URL that you can share with others.

## How it works

1. **Upload**: Portrait is resized to 512px and sent to GPU pod
2. **Generation**: LivePortrait AI generates 900 gaze variations (30x30 grid)
3. **Sprites**: Images are packed into 4 quadrant sprite sheets (WebP)
4. **Animation**: PixiJS renders sprites with smooth interpolation

## Configuration

Edit `gpu.toml` to customize:

- `gpu_type` - GPU model (default: RTX 4090)
- `cooldown_minutes` - Pod idle timeout (default: 10 minutes)
- `provider` - GPU provider (default: runpod)

## Troubleshooting

### GPU server won't start

```bash
# Check gpu-cli daemon status
gpu daemon status

# View daemon logs
gpu daemon logs -f

# Restart daemon if needed
gpu daemon restart
```

### Port conflicts

The app automatically stops old GPU jobs before starting new ones. If you still have issues:

```bash
gpu stop --force
```

### Files not syncing

The app uses HTTP download as a fallback when daemon sync fails. Check the generation log in the UI for details.

## Deployment (Fly.io)

### 1. Create the app

```bash
fly apps create gaze-app
```

### 2. Create a volume for persistent storage

```bash
fly volumes create gaze_data --size 10 --region sjc
```

### 3. Set your RunPod API key

Get your API key from https://runpod.io/console/user/settings

```bash
fly secrets set RUNPOD_API_KEY=rpa_your_key_here
```

### 4. Deploy

```bash
fly deploy
```

The app will:
- Install gpu-cli in the container
- Generate SSH keys and configure credentials from `RUNPOD_API_KEY`
- Start the gpu daemon
- Run the Node.js server

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RUNPOD_API_KEY` | Yes | Your RunPod API key (starts with `rpa_`) |
| `PORT` | No | Server port (default: 3000) |
| `GPU_SSH_PRIVATE_KEY` | No | Pre-generated SSH private key |
| `GPU_SSH_PUBLIC_KEY` | No | Pre-generated SSH public key |

## Tech Stack

- **Frontend**: Vanilla JS, PixiJS, Socket.IO
- **Backend**: Node.js, Express, Sharp
- **AI**: LivePortrait (face retargeting)
- **GPU**: gpu-cli + RunPod

## License

MIT
