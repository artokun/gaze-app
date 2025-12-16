require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const sharp = require('sharp');
const axios = require('axios');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 50e6 // 50 MB max
});

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const JOBS_DIR = path.join(__dirname, 'jobs');
const PUBLIC_DIR = path.join(__dirname, 'public');

// GPU server configuration
let GPU_SERVER_PORT = 8080;  // Default, may be remapped by gpu-cli
let GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`;
const GPU_CLI = process.env.GPU_CLI || 'gpu';

// Queue system
const MAX_QUEUE_SIZE = 20;
let processingQueue = [];
let currentlyProcessing = null;

// GPU pod state
let gpuServerProcess = null;
let gpuServerReady = false;
let gpuServerStarting = false;
let gpuProvisioningStatus = { stage: 'idle', message: '', progress: 0 };

// Broadcast GPU status to all connected clients
function broadcastGpuStatus(stage, message, progress = 0) {
    gpuProvisioningStatus = { stage, message, progress };
    io.emit('gpu-status', gpuProvisioningStatus);
}

// Parse GPU CLI output for status updates
function parseGpuOutput(output) {
    // Detecting project
    if (output.includes('Detecting project')) {
        broadcastGpuStatus('detecting', 'Detecting project...', 5);
    }
    // Resolving
    else if (output.includes('Resolving')) {
        broadcastGpuStatus('resolving', 'Resolving pod configuration...', 10);
    }
    // Pod unreachable, reprovisioning
    else if (output.includes('reprovisioning')) {
        broadcastGpuStatus('provisioning', 'Provisioning new GPU pod...', 15);
    }
    // Using pod
    else if (output.includes('Using pod')) {
        const podMatch = output.match(/Using pod (\w+)/);
        const podId = podMatch ? podMatch[1].substring(0, 8) : '';
        broadcastGpuStatus('connecting', `Connecting to pod ${podId}...`, 20);
    }
    // Connecting
    else if (output.includes('Connecting') && !output.includes('GPU server')) {
        broadcastGpuStatus('connecting', 'Establishing connection...', 25);
    }
    // Syncing files
    else if (output.includes('Syncing')) {
        const syncMatch = output.match(/Syncing (\d+)\/(\d+) files/);
        if (syncMatch) {
            const current = parseInt(syncMatch[1]);
            const total = parseInt(syncMatch[2]);
            const syncProgress = 30 + Math.min(20, (current / Math.max(total, 1)) * 20);
            broadcastGpuStatus('syncing', `Syncing files (${current}/${total})...`, syncProgress);
        } else {
            broadcastGpuStatus('syncing', 'Syncing workspace...', 30);
        }
    }
    // Installing dependencies
    else if (output.includes('Installing dependencies') || output.includes('Installing Python deps')) {
        broadcastGpuStatus('installing', 'Installing dependencies...', 55);
    }
    // pip download progress
    else if (output.includes('Downloading') || output.includes('Downloaded')) {
        broadcastGpuStatus('installing', 'Downloading packages...', 60);
    }
    // Running command
    else if (output.includes('Running:')) {
        broadcastGpuStatus('starting', 'Starting GPU server...', 70);
    }
    // Downloading weights
    else if (output.includes('Downloading LivePortrait weights')) {
        broadcastGpuStatus('weights', 'Downloading AI model weights...', 75);
    }
    // Fetching files (HuggingFace)
    else if (output.includes('Fetching') && output.includes('files')) {
        const fetchMatch = output.match(/(\d+)%/);
        if (fetchMatch) {
            const pct = parseInt(fetchMatch[1]);
            const progress = 75 + (pct * 0.15);
            broadcastGpuStatus('weights', `Downloading model weights (${pct}%)...`, progress);
        }
    }
    // Loading models
    else if (output.includes('Loading LivePortrait models') || output.includes('STAGE:loading')) {
        broadcastGpuStatus('loading', 'Loading AI models...', 90);
    }
    // Models loaded
    else if (output.includes('Models loaded successfully') || output.includes('STAGE:models_loaded')) {
        broadcastGpuStatus('ready', 'GPU server ready!', 100);
    }

    // Parse generation progress messages from generate_gaze.py
    // These are emitted during image generation and should be sent to the processing socket
    parseGenerationProgress(output);
}

// Parse generation-specific progress from generate_gaze.py output
function parseGenerationProgress(output) {
    if (!currentlyProcessing) return;

    const socket = currentlyProcessing.socket;
    const lines = output.split('\n');

    for (const line of lines) {
        // STAGE messages
        const stageMatch = line.match(/STAGE:(\w+):(.+)/);
        if (stageMatch) {
            const [, stage, message] = stageMatch;
            socket.emit('generation-log', { type: 'stage', stage, message, timestamp: Date.now() });

            // Also update main progress based on stage
            if (stage === 'preparing') {
                socket.emit('progress', { stage: 'generating', progress: 10, message: 'Preparing source image...' });
            } else if (stage === 'generating') {
                socket.emit('progress', { stage: 'generating', progress: 15, message });
            } else if (stage === 'removing_bg') {
                socket.emit('progress', { stage: 'generating', progress: 70, message: 'Removing backgrounds...' });
            } else if (stage === 'saving') {
                socket.emit('progress', { stage: 'generating', progress: 85, message: 'Creating sprite sheets...' });
            }
        }

        // PROGRESS messages (main generation)
        const progressMatch = line.match(/PROGRESS:(\d+)/);
        if (progressMatch) {
            const pct = parseInt(progressMatch[1]);
            // Map 0-100 to 15-70 range (after preparing, before bg removal/saving)
            const mappedProgress = 15 + (pct * 0.55);
            socket.emit('progress', { stage: 'generating', progress: mappedProgress, message: `Generating images (${pct}%)...` });
            socket.emit('generation-log', { type: 'progress', percent: pct, timestamp: Date.now() });
        }

        // PROGRESS_BG messages (background removal)
        const bgMatch = line.match(/PROGRESS_BG:(\d+)/);
        if (bgMatch) {
            const pct = parseInt(bgMatch[1]);
            const mappedProgress = 70 + (pct * 0.15);
            socket.emit('progress', { stage: 'generating', progress: mappedProgress, message: `Removing backgrounds (${pct}%)...` });
            socket.emit('generation-log', { type: 'bg_progress', percent: pct, timestamp: Date.now() });
        }

        // PROGRESS_SAVE messages
        const saveMatch = line.match(/PROGRESS_SAVE:(\d+)/);
        if (saveMatch) {
            const pct = parseInt(saveMatch[1]);
            const mappedProgress = 85 + (pct * 0.10);
            socket.emit('progress', { stage: 'saving', progress: mappedProgress, message: `Saving sprites (${pct}%)...` });
            socket.emit('generation-log', { type: 'save_progress', percent: pct, timestamp: Date.now() });
        }

        // COMPLETE message
        if (line.includes('COMPLETE:')) {
            socket.emit('generation-log', { type: 'complete', timestamp: Date.now() });
        }

        // Also capture model loading messages
        if (line.includes('Load ') && line.includes(' done.')) {
            const modelMatch = line.match(/Load (\w+) from/);
            if (modelMatch) {
                socket.emit('generation-log', { type: 'model', model: modelMatch[1], timestamp: Date.now() });
            }
        }
    }
}

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// API endpoint for client-side error logging
app.post('/api/log', express.json(), (req, res) => {
    const { level, message, stack, userAgent } = req.body;
    const timestamp = new Date().toISOString();
    console.log(`[CLIENT ${level.toUpperCase()}] [${timestamp}] ${message}`);
    if (stack) console.log(`  Stack: ${stack}`);
    if (userAgent) console.log(`  UA: ${userAgent}`);
    res.json({ ok: true });
});

// API endpoint to get session metadata
app.get('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const metadataPath = path.join(UPLOAD_DIR, sessionId, 'gaze_output', 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json({
            sessionId,
            basePath: `/uploads/${sessionId}/gaze_output`,
            metadataPath: `/uploads/${sessionId}/gaze_output/metadata.json`,
            ...metadata
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read session metadata' });
    }
});

// API endpoint to get queue status
app.get('/api/queue', (req, res) => {
    res.json({
        queueLength: processingQueue.length,
        isProcessing: currentlyProcessing !== null,
        maxQueueSize: MAX_QUEUE_SIZE,
        gpuServerReady
    });
});

// API endpoint to get GPU server status
app.get('/api/gpu-status', async (req, res) => {
    try {
        const response = await axios.get(`${GPU_SERVER_URL}/health`, { timeout: 5000 });
        res.json({ status: 'ready', ...response.data });
    } catch (e) {
        res.json({ status: gpuServerStarting ? 'starting' : 'offline' });
    }
});

// Serve index.html for session routes (SPA routing)
app.get('/:sessionId', (req, res, next) => {
    // Skip if it looks like a file request
    if (req.params.sessionId.includes('.')) {
        return next();
    }
    // Check if session exists
    const sessionDir = path.join(UPLOAD_DIR, req.params.sessionId);
    if (fs.existsSync(sessionDir)) {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    } else {
        next();
    }
});

// Serve static files
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// Start the GPU server on the pod
async function startGpuServer() {
    if (gpuServerReady || gpuServerStarting) {
        return;
    }

    gpuServerStarting = true;
    console.log('Starting GPU server on remote pod...');

    try {
        // First, try to stop any existing jobs to free up port 8000
        console.log('Stopping any existing GPU jobs...');
        broadcastGpuStatus('stopping', 'Stopping old GPU jobs...', 2);
        try {
            execSync(`${GPU_CLI} stop --force --no-sync`, { cwd: __dirname, timeout: 60000, stdio: 'pipe' });
            console.log('Old jobs stopped');
        } catch (e) {
            // Ignore errors - might not have any running jobs
            console.log('No running jobs to stop (or stop failed):', e.message);
        }

        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start the GPU server with port forwarding and force-sync to ensure latest code
        gpuServerProcess = spawn(GPU_CLI, [
            'run',
            '--force-sync',
            '--publish', `${GPU_SERVER_PORT}:8000`,
            'python', 'gaze_server.py'
        ], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        gpuServerProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('[GPU]', output.trim());

            // Parse for status updates
            parseGpuOutput(output);

            // Check for port remapping (e.g., "Remote 8000 -> http://localhost:54321 (remapped)")
            const portMatch = output.match(/Remote \d+ -> http:\/\/localhost:(\d+)/);
            if (portMatch) {
                const newPort = parseInt(portMatch[1]);
                if (newPort !== GPU_SERVER_PORT) {
                    console.log(`GPU server port remapped: ${GPU_SERVER_PORT} -> ${newPort}`);
                    GPU_SERVER_PORT = newPort;
                    GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`;
                }
            }

            // Check for server ready message
            if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                gpuServerReady = true;
                gpuServerStarting = false;
                console.log('GPU server is ready!');
                broadcastGpuStatus('ready', 'GPU server ready!', 100);
            }
        });

        gpuServerProcess.stderr.on('data', (data) => {
            const output = data.toString();

            // Filter out noisy warnings that aren't actual errors
            const isNoise = output.includes('Unknown RunPod GPU') ||
                           output.includes('not found in database') ||
                           output.includes('WARN') ||
                           output.includes('forward_connection') ||
                           output.includes('output supervisor lookup failed');

            if (!isNoise) {
                console.error('[GPU stderr]', output.trim());
            }

            // Parse for status updates (gpu-cli outputs to stderr too)
            parseGpuOutput(output);

            // Also check stderr for port remapping (gpu-cli may output there)
            const portMatch = output.match(/Remote \d+ -> http:\/\/localhost:(\d+)/);
            if (portMatch) {
                const newPort = parseInt(portMatch[1]);
                if (newPort !== GPU_SERVER_PORT) {
                    console.log(`GPU server port remapped: ${GPU_SERVER_PORT} -> ${newPort}`);
                    GPU_SERVER_PORT = newPort;
                    GPU_SERVER_URL = `http://localhost:${GPU_SERVER_PORT}`;
                }
            }
        });

        gpuServerProcess.on('close', (code) => {
            console.log(`GPU server process exited with code ${code}`);
            gpuServerReady = false;
            gpuServerStarting = false;
            gpuServerProcess = null;
        });

        // Wait for server to be ready (poll health endpoint)
        await waitForGpuServer();

    } catch (error) {
        console.error('Failed to start GPU server:', error);
        gpuServerStarting = false;
        throw error;
    }
}

// Wait for GPU server to be ready
async function waitForGpuServer(maxAttempts = 120, intervalMs = 5000) {
    console.log('Waiting for GPU server to be ready...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.get(`${GPU_SERVER_URL}/health`, { timeout: 5000 });
            if (response.data.status === 'ok') {
                gpuServerReady = true;
                gpuServerStarting = false;
                console.log(`GPU server ready after ${attempt} attempts`);
                return;
            }
        } catch (e) {
            // Server not ready yet
        }

        if (attempt % 12 === 0) {
            console.log(`Still waiting for GPU server... (${attempt * intervalMs / 1000}s elapsed)`);
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('GPU server failed to start within timeout');
}

// Ensure GPU server is running before processing
async function ensureGpuServer() {
    if (gpuServerReady) {
        // Verify it's still responding
        try {
            await axios.get(`${GPU_SERVER_URL}/health`, { timeout: 5000 });
            return;
        } catch (e) {
            console.log('GPU server health check failed, restarting...');
            gpuServerReady = false;
        }
    }

    await startGpuServer();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current GPU status to newly connected client
    socket.emit('gpu-status', gpuProvisioningStatus);

    socket.on('upload', async (fileData, filename, removeBackground, callback) => {
        try {
            // Check queue capacity
            const totalInQueue = processingQueue.length + (currentlyProcessing ? 1 : 0);
            if (totalInQueue >= MAX_QUEUE_SIZE) {
                callback({
                    success: false,
                    error: 'Server is currently overloaded. Please try again later.',
                    overloaded: true,
                    queueLength: totalInQueue
                });
                return;
            }

            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const sessionDir = path.join(UPLOAD_DIR, sessionId);
            fs.mkdirSync(sessionDir, { recursive: true });

            // Save uploaded file - keep high resolution for v2
            const inputPath = path.join(sessionDir, 'input.jpg');
            const buffer = Buffer.from(fileData);

            // Keep original size or resize to max 512p for mobile compatibility
            // Use .rotate() to auto-orient based on EXIF data
            const metadata = await sharp(buffer).metadata();
            const maxDim = 512;

            // EXIF orientations 5-8 involve 90-degree rotation, swapping width/height
            const needsSwap = metadata.orientation >= 5 && metadata.orientation <= 8;
            const effectiveWidth = needsSwap ? metadata.height : metadata.width;
            const effectiveHeight = needsSwap ? metadata.width : metadata.height;

            let resizeOpts = {};
            if (effectiveWidth > maxDim || effectiveHeight > maxDim) {
                if (effectiveWidth > effectiveHeight) {
                    resizeOpts = { width: maxDim };
                } else {
                    resizeOpts = { height: maxDim };
                }
            }

            const sharpInstance = sharp(buffer).rotate(); // Auto-rotate based on EXIF
            if (resizeOpts.width || resizeOpts.height) {
                sharpInstance.resize(resizeOpts);
            }
            await sharpInstance.jpeg({ quality: 95 }).toFile(inputPath);

            socket.emit('status', { stage: 'uploaded', message: 'Image uploaded' });
            callback({ success: true, sessionId });

            // Add to queue
            const queueItem = { socket, sessionId, inputPath, sessionDir, removeBackground };
            processingQueue.push(queueItem);

            // Send queue position
            const position = processingQueue.length;
            if (position > 1 || currentlyProcessing) {
                socket.emit('queue', {
                    position: position + (currentlyProcessing ? 1 : 0),
                    message: `You are #${position + (currentlyProcessing ? 1 : 0)} in queue`
                });
            }

            // Start processing if nothing is currently processing
            processQueue();

        } catch (error) {
            console.error('Upload error:', error);
            callback({ success: false, error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

function processQueue() {
    // If already processing or queue is empty, do nothing
    if (currentlyProcessing || processingQueue.length === 0) {
        return;
    }

    // Get next item from queue
    const item = processingQueue.shift();
    currentlyProcessing = item;

    // Update queue positions for remaining clients
    processingQueue.forEach((queuedItem, index) => {
        queuedItem.socket.emit('queue', {
            position: index + 2, // +1 for currently processing, +1 for 1-indexed
            message: `You are #${index + 2} in queue`
        });
    });

    // Start processing
    generateGazeGrid(item.socket, item.sessionId, item.inputPath, item.sessionDir, item.removeBackground);
}

async function generateGazeGrid(socket, sessionId, inputPath, sessionDir, removeBackground = false) {
    const outputDir = path.join(sessionDir, 'gaze_output');

    try {
        // Ensure GPU server is running
        socket.emit('status', { stage: 'preparing', message: 'Connecting to GPU server...' });
        await ensureGpuServer();

        // Read input image and encode as base64
        socket.emit('status', { stage: 'uploading', message: 'Sending image to GPU...' });
        const imageBuffer = fs.readFileSync(inputPath);
        const imageBase64 = imageBuffer.toString('base64');

        // Send to GPU server with real-time progress polling
        const startTime = Date.now();
        let progressInterval;
        let lastStage = 'generating';
        const totalImages = 900; // 30x30 grid

        // Poll the progress endpoint to get real generation progress
        progressInterval = setInterval(async () => {
            try {
                const progressResponse = await axios.get(
                    `${GPU_SERVER_URL}/progress/${sessionId}`,
                    { timeout: 2000 }
                );
                const { stage, current, total, message } = progressResponse.data;

                if (stage !== 'unknown') {
                    lastStage = stage;

                    // Calculate overall progress based on stage
                    let overallProgress = 5;
                    let displayMessage = message;

                    if (stage === 'loading' || stage === 'preparing') {
                        overallProgress = 10;
                        displayMessage = message || 'Preparing source image...';
                    } else if (stage === 'generating') {
                        // Map 0-total to 15-70% range
                        const genProgress = total > 0 ? (current / total) : 0;
                        overallProgress = 15 + (genProgress * 55);
                        displayMessage = `Generated ${current}/${total} images (${Math.round(genProgress * 100)}%)`;
                    } else if (stage === 'removing_bg') {
                        // Map 0-total to 70-85% range
                        const bgProgress = total > 0 ? (current / total) : 0;
                        overallProgress = 70 + (bgProgress * 15);
                        displayMessage = `Removing background ${current}/${total} (${Math.round(bgProgress * 100)}%)`;
                    } else if (stage === 'saving') {
                        // Map 0-4 quadrants to 85-95% range
                        const saveProgress = total > 0 ? (current / total) : 0;
                        overallProgress = 85 + (saveProgress * 10);
                        displayMessage = `Saving sprite sheets (${current}/${total})`;
                    } else if (stage === 'complete') {
                        overallProgress = 95;
                        displayMessage = 'Generation complete, syncing files...';
                    }

                    socket.emit('progress', {
                        stage: lastStage,
                        progress: overallProgress,
                        message: displayMessage
                    });

                    // Emit detailed log
                    socket.emit('generation-log', {
                        type: 'progress',
                        stage,
                        current,
                        total,
                        message: displayMessage,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                // Progress endpoint not available yet or timeout - show elapsed time fallback
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                socket.emit('progress', {
                    stage: 'generating',
                    progress: 5,
                    message: `Starting generation... (${timeStr})`
                });
            }
        }, 1000); // Poll every second for responsive updates

        socket.emit('progress', {
            stage: 'generating',
            progress: 5,
            message: 'Starting generation on GPU...'
        });

        console.log(`[${sessionId}] Sending to GPU server...`);

        let response;
        try {
            response = await axios.post(`${GPU_SERVER_URL}/generate`, {
                image_base64: imageBase64,
                session_id: sessionId,
                remove_background: removeBackground,
                grid_size: 30
            }, {
                timeout: 600000, // 10 minute timeout
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
        } finally {
            clearInterval(progressInterval);
        }

        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        console.log(`[${sessionId}] GPU generation completed in ${totalTime}s:`, response.data.status);

        socket.emit('generation-log', {
            type: 'stage',
            stage: 'generation_complete',
            message: `Generation completed in ${totalTime}s`,
            timestamp: Date.now()
        });

        // Sync outputs back from pod - try daemon sync first, then HTTP fallback
        socket.emit('progress', {
            stage: 'syncing',
            progress: 88,
            message: 'Syncing sprite files from GPU pod...'
        });

        const syncedOutputDir = path.join(JOBS_DIR, sessionId, 'gaze_output');
        const expectedFiles = ['q0.webp', 'q1.webp', 'q2.webp', 'q3.webp', 'metadata.json'];
        let syncSuccess = false;

        // First, try daemon-managed sync for 30 seconds
        socket.emit('generation-log', {
            type: 'stage',
            stage: 'syncing',
            message: 'Waiting for daemon sync...',
            timestamp: Date.now()
        });

        const daemonSyncTimeout = 30000;
        let waited = 0;
        while (waited < daemonSyncTimeout) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            waited += 2000;

            let filesFound = 0;
            for (const file of expectedFiles) {
                if (fs.existsSync(path.join(syncedOutputDir, file))) {
                    filesFound++;
                }
            }

            if (filesFound === expectedFiles.length) {
                syncSuccess = true;
                console.log(`[${sessionId}] Daemon sync succeeded after ${waited/1000}s`);
                break;
            }

            socket.emit('progress', {
                stage: 'syncing',
                progress: 88 + (waited / daemonSyncTimeout) * 5,
                message: `Waiting for daemon sync... (${filesFound}/${expectedFiles.length} files)`
            });
        }

        // If daemon sync failed, fall back to HTTP download
        if (!syncSuccess) {
            console.log(`[${sessionId}] Daemon sync timeout, falling back to HTTP download`);
            socket.emit('generation-log', {
                type: 'stage',
                stage: 'downloading',
                message: 'Downloading files directly from GPU pod...',
                timestamp: Date.now()
            });

            fs.mkdirSync(outputDir, { recursive: true });

            for (let i = 0; i < expectedFiles.length; i++) {
                const file = expectedFiles[i];
                const fileUrl = `${GPU_SERVER_URL}/files/${sessionId}/${file}`;
                const filePath = path.join(outputDir, file);

                try {
                    socket.emit('progress', {
                        stage: 'downloading',
                        progress: 93 + (i / expectedFiles.length) * 5,
                        message: `Downloading ${file}... (${i + 1}/${expectedFiles.length})`
                    });

                    const fileResponse = await axios.get(fileUrl, {
                        responseType: 'arraybuffer',
                        timeout: 60000
                    });
                    fs.writeFileSync(filePath, fileResponse.data);
                    console.log(`[${sessionId}] Downloaded ${file} (${fileResponse.data.length} bytes)`);
                } catch (e) {
                    console.error(`[${sessionId}] Failed to download ${file}:`, e.message);
                    throw new Error(`Failed to download ${file}: ${e.message}`);
                }
            }
            syncSuccess = true;
            console.log(`[${sessionId}] HTTP download completed`);
        } else {
            // Daemon sync succeeded, copy to uploads
            fs.mkdirSync(outputDir, { recursive: true });
            fs.cpSync(syncedOutputDir, outputDir, { recursive: true });
            console.log(`[${sessionId}] Copied outputs from ${syncedOutputDir} to ${outputDir}`);
        }

        socket.emit('generation-log', {
            type: 'stage',
            stage: 'sync_complete',
            message: 'Files downloaded successfully',
            timestamp: Date.now()
        });

        // Read metadata
        const metadataPath = path.join(outputDir, 'metadata.json');
        let metadata = { gridSize: 30, imageWidth: 512, imageHeight: 640 };
        try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (e) {
            console.error(`[${sessionId}] Could not read metadata:`, e);
        }

        socket.emit('complete', {
            sessionId,
            basePath: `/uploads/${sessionId}/gaze_output`,
            metadataPath: `/uploads/${sessionId}/gaze_output/metadata.json`,
            gridSize: metadata.gridSize,
            quadrantSize: metadata.quadrantSize || 15,
            imageWidth: metadata.imageWidth,
            imageHeight: metadata.imageHeight,
            mode: metadata.mode || 'quadrants',
            message: 'Generation complete!'
        });

    } catch (error) {
        console.error(`[${sessionId}] Generation error:`, error.message);
        socket.emit('error', {
            message: `Generation failed: ${error.message}`
        });
    } finally {
        // Clear current processing and process next in queue
        currentlyProcessing = null;
        processQueue();
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    if (gpuServerProcess) {
        console.log('Stopping GPU server...');
        gpuServerProcess.kill();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    if (gpuServerProcess) {
        gpuServerProcess.kill();
    }
    process.exit(0);
});

// Start the server
httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Gaze Tracker running on http://0.0.0.0:${PORT}`);
    console.log('Starting GPU server in background...');

    // Start GPU server in background (don't block server startup)
    startGpuServer().catch(err => {
        console.error('GPU server startup failed:', err.message);
        console.log('GPU server will be started on first request.');
    });
});
