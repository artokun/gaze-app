# Repository Guidelines

## Project Structure & Module Organization
- `server.js` runs the Node/Express backend, manages uploads/queues, and relays Socket.IO progress while orchestrating gpu-cli.
- `public/` holds the client UI (PixiJS viewer), demo assets, and embeddable widget code; keep new assets in kebab-case folders.
- `lib/LivePortrait/` hosts the GPU-side Python stack (`gaze_server.py`, `generate_gaze.py`, weights, FastAPI), plus model assets.
- `scripts/` contains startup helpers for Fly/gpu-cli; deployment configs live in `Dockerfile`, `fly.toml`, and `gpu.toml`.
- Generated artifacts land in `uploads/` and `jobs/`; do not commit them.

## Build, Test, and Development Commands
- `npm install` — install Node dependencies.
- `npm start` — run the local server on `:3000`, start the job queue, and talk to gpu-cli; requires `gpu auth` and a running gpu daemon.
- `gpu daemon status` / `gpu daemon logs -f` — verify remote GPU availability when generation stalls.
- `gpu run -p 8080:8000 python gaze_server.py` (from repo root inside the GPU environment) — manually launch the GPU FastAPI server if bypassing the daemon.
- Fly deploys use `scripts/start.sh`; test the image locally with `docker build .` when touching startup logic.

## Coding Style & Naming Conventions
- JavaScript: 4-space indentation, semicolons, CommonJS modules; prefer small helpers over deeply nested callbacks.
- Client scripts favor plain JS + Socket.IO; keep front-end assets under `public/` with descriptive, kebab-case names.
- Python in `lib/LivePortrait` follows snake_case; keep weight/model paths configurable via env vars where possible.
- Secrets stay in `.env` (`RUNPOD_API_KEY`, `GPU_CLI`, etc.); never commit weights, uploads, or job outputs.

## Testing Guidelines
- No automated test suite; validate manually:
  - `npm start`, upload a sample portrait, and confirm progress events plus sprite output under `jobs/<session>/`.
  - If running the GPU server manually, `curl http://localhost:8080/health` to confirm models are loaded.
- When changing queueing or GPU calls, tail server logs to ensure `STAGE:`/`PROGRESS` markers stream correctly.

## Commit & Pull Request Guidelines
- Follow current history: short, capitalized imperative summaries (e.g., `Add Fly.io deployment configuration`).
- PRs should include a concise description, manual test notes (`npm start` + scenario), and screenshots/GIFs for UI tweaks.
- Link related issues; call out deployment/config changes explicitly (env vars, gpu-cli assumptions, port mappings).
