const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const sharp = require('sharp');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 50e6 // 50 MB max
});

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Queue system
const MAX_QUEUE_SIZE = 20;
let processingQueue = [];
let currentlyProcessing = null;

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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
        maxQueueSize: MAX_QUEUE_SIZE
    });
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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

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

            socket.emit('status', { stage: 'uploaded', message: 'Image uploaded (high-res mode)' });
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

function generateGazeGrid(socket, sessionId, inputPath, sessionDir, removeBackground = false) {
    const outputDir = path.join(sessionDir, 'gaze_output');
    const spriteOutput = path.join(sessionDir, 'sprite.jpg'); // Not used in v2 but required arg

    const pythonScript = path.join(__dirname, 'generate_gaze.py');

    // Always 30x30 for v2 high fidelity
    const args = [
        pythonScript,
        '--input', inputPath,
        '--output', outputDir,
        '--sprite-output', spriteOutput,
        '--grid-size', '30',
        '--socket-id', socket.id
    ];

    if (removeBackground) {
        args.push('--remove-background');
    }

    const proc = spawn('python3', args, {
        cwd: '/workspace/LivePortrait'
    });

    let lastProgress = 0;
    let lastBgProgress = 0;
    let lastSaveProgress = 0;

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.startsWith('PROGRESS:')) {
                const progress = parseInt(line.split(':')[1]);
                if (progress !== lastProgress) {
                    lastProgress = progress;
                    socket.emit('progress', {
                        stage: 'generating',
                        progress,
                        message: `Generating gaze images: ${progress}%`
                    });
                }
            } else if (line.startsWith('PROGRESS_BG:')) {
                const progress = parseInt(line.split(':')[1]);
                if (progress !== lastBgProgress) {
                    lastBgProgress = progress;
                    socket.emit('progress', {
                        stage: 'removing_bg',
                        progress,
                        message: `Removing backgrounds: ${progress}%`
                    });
                }
            } else if (line.startsWith('PROGRESS_SAVE:')) {
                const progress = parseInt(line.split(':')[1]);
                if (progress !== lastSaveProgress) {
                    lastSaveProgress = progress;
                    socket.emit('progress', {
                        stage: 'saving',
                        progress,
                        message: `Saving images: ${progress}%`
                    });
                }
            } else if (line.startsWith('STAGE:')) {
                const stage = line.split(':')[1];
                socket.emit('status', { stage, message: line.split(':').slice(2).join(':') || stage });
            } else if (line.startsWith('COMPLETE:')) {
                // v2 - output is a directory with individual images
                const outputPath = line.split(':')[1];

                // Read metadata
                const metadataPath = path.join(outputDir, 'metadata.json');
                let metadata = { gridSize: 30, imageWidth: 512, imageHeight: 640 };
                try {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } catch (e) {
                    console.error('Could not read metadata:', e);
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
                    message: 'High-fidelity gaze generation complete!'
                });
            } else if (line.trim()) {
                console.log(`[${sessionId}]`, line);
            }
        }
    });

    proc.stderr.on('data', (data) => {
        console.error(`[${sessionId}] stderr:`, data.toString());
    });

    proc.on('close', (code) => {
        // Clear current processing and process next in queue
        currentlyProcessing = null;

        if (code !== 0) {
            socket.emit('error', { message: `Generation failed with code ${code}` });
        }

        // Process next item in queue
        processQueue();
    });
}

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Gaze Tracker v2 (High Fidelity) running on http://0.0.0.0:${PORT}`);
});
