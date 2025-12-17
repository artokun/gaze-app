# GEMINI.md: Gaze Tracker v2

This document provides a comprehensive overview of the Gaze Tracker v2 project, its architecture, and development practices, intended to serve as a guide for future development and maintenance.

## 1. Project Overview

Gaze Tracker v2 is an interactive web application that uses AI to generate a large set of gaze and head pose variations from a single portrait image. The result is an interactive portrait that animates smoothly based on user input (cursor, touch, or gyroscope).

The application is architecturally split into three main parts:
1.  **Frontend**: A vanilla JavaScript client that handles the user interface, image upload, and renders the final interactive animation using PixiJS.
2.  **Node.js Backend**: An Express.js server that acts as the primary orchestrator. It manages user sessions, handles file uploads, maintains a job queue for generation requests, and communicates with both the frontend (via Socket.IO) and the GPU backend (via HTTP).
3.  **Python GPU Backend**: A FastAPI server that runs on a remote GPU pod managed by `gpu-cli`. This server exposes endpoints to perform the computationally expensive AI inference using the `LivePortrait` model.

## 2. Key Technologies

-   **Frontend**: Vanilla JavaScript, [PixiJS](https://pixijs.com/) (for rendering), [Socket.IO-client](https://socket.io/docs/v4/client-api/) (for real-time communication)
-   **Backend (Orchestrator)**: [Node.js](https://nodejs.org/), [Express.js](https://expressjs.com/), [Socket.IO](https://socket.io/), [Sharp](https://sharp.pixelplumbing.com/) (for image processing)
-   **Backend (AI)**: [Python](https://www.python.org/), [FastAPI](https://fastapi.tiangolo.com/) (for the GPU server), [PyTorch](https://pytorch.org/), [LivePortrait](https://github.com/KwaiVGI/LivePortrait) (for AI face retargeting), [rembg](https://github.com/danielgatis/rembg) (for background removal)
-   **GPU Orchestration**: [gpu-cli](https://gpu.sh/)
-   **Deployment**: Docker, [Fly.io](https://fly.io/)

## 3. Core Components

### `server.js` (Node.js Backend)

This is the main entry point of the application (`npm start`). Its key responsibilities include:
-   Serving the frontend application and static assets.
-   Handling image uploads from the client.
-   Managing a job queue (`processingQueue`) to ensure that generation requests are processed one at a time.
-   Using `gpu-cli` to start, manage, and communicate with the Python GPU server on a remote pod.
-   Proxying requests from the client to the GPU server. It sends the image to be processed and then polls for progress.
-   Receiving the final generated assets (sprite sheets) from the GPU server and making them available to the client.
-   Providing real-time progress updates to the client using Socket.IO.

### `gaze_server.py` (Python GPU Backend)

This FastAPI server runs on the remote GPU and handles the AI-related tasks.
-   It exposes several endpoints, including `/health`, `/generate`, and `/progress/{session_id}`.
-   On startup, it automatically downloads the required `LivePortrait` model weights from Hugging Face.
-   The main `/generate` endpoint receives an image, saves it, and calls the `generate_grid` function from `generate_gaze.py`.
-   It tracks the generation progress in memory, which is exposed via the `/progress` endpoint for the Node.js server to poll.
-   After generation, it creates a zip archive of the resulting sprite sheets and provides a download endpoint.

### `generate_gaze.py` (Python AI Logic)

This script contains the core logic for the AI image generation.
-   It uses the `LivePortrait` library to prepare a source image (face detection, cropping, feature extraction).
-   The `generate_grid` function creates a 30x30 grid of target parameters (head pitch/yaw, pupil position, etc.).
-   It processes these parameters in batches, calling the `LivePortrait` model to generate a new image for each set of parameters.
-   It reports progress by printing `STAGE:` and `PROGRESS:` messages to standard output, which are captured by the parent `server.js` process.
-   After generating all 900 images, it uses `ffmpeg` to stitch them into four quadrant-based sprite sheets for efficient loading and rendering on the frontend. It creates both a 30x30 version for desktop and a downsampled 20x20 version for mobile.
-   Finally, it saves a `metadata.json` file containing information about the generated assets.

## 4. How It Works: The Generation Flow

1.  A user uploads a portrait image in the browser.
2.  The frontend sends the image to the `server.js` backend via a Socket.IO event.
3.  The Node.js server adds the job to a queue. When the job reaches the front of the queue, the server processes it.
4.  `server.js` ensures that a remote GPU pod is running via `gpu-cli`. If not, it starts one.
5.  The server sends the image (as base64) to the `/generate` endpoint of the `gaze_server.py` on the GPU pod.
6.  The Python server starts the generation process using `generate_gaze.py`.
7.  While the generation is in progress, the Node.js server periodically polls the `/progress/{session_id}` endpoint on the Python server to get status updates.
8.  These progress updates are relayed back to the client in real-time via Socket.IO and displayed in the UI.
9.  Once `generate_gaze.py` completes, the Python server creates a zip file of the output sprites.
10. The Node.js server downloads and extracts this zip file.
11. Finally, `server.js` sends a `complete` message to the client with the path to the newly generated sprites, and the interactive portrait is displayed.

## 5. Building and Running

### Prerequisites

1.  **Install `gpu-cli`**:
    ```bash
    curl -fsSL https://gpu-cli.sh | sh
    ```
2.  **Authenticate `gpu-cli`**:
    ```bash
    gpu auth
    ```
3.  **Install Node.js dependencies**:
    ```bash
    npm install
    ```

### Running the Application

```bash
npm start
```
This command starts the Node.js server, which will then automatically provision and start the remote GPU server on the first request. The application will be available at `http://localhost:3000`.

## 6. Development Conventions

-   **Modular Architecture**: The project is well-structured, with clear separation of concerns between the frontend, the Node.js orchestrator, and the Python AI backend.
-   **Real-time Feedback**: Progress reporting is a key feature. The chain of communication (`generate_gaze.py` -> `gaze_server.py` -> `server.js` -> frontend) is designed to provide granular, real-time feedback to the user.
-   **Configuration**: The `gpu.toml` file is used to configure `gpu-cli` parameters like GPU type and cooldown times. Environment variables (via `.env` files) are used for other configurations like the server port.
-   **Error Handling**: The code includes mechanisms for graceful shutdowns (to stop GPU pods and save costs) and fallbacks (e.g., using PIL for sprite generation if `ffmpeg` is not available).
-   **Dependency Management**: Python dependencies (`LivePortrait`, `huggingface_hub`) are dynamically cloned or downloaded by the `gaze_server.py` script, simplifying the setup on the remote pod. Node.js dependencies are managed with `npm`.
-   **API Design**: The backend exposes a clear RESTful and Socket.IO API for the frontend to consume. The Python server also has a clean, well-defined API for the Node.js server.
