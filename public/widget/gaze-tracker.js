/**
 * Gaze Tracker Web Component
 * A self-contained widget that displays an animated face following the cursor
 *
 * Usage (quadrant sprites - 4 files, recommended):
 *   <gaze-tracker
 *     src="q0.webp,q1.webp,q2.webp,q3.webp"
 *     mode="quadrants"
 *     grid="30">
 *   </gaze-tracker>
 *
 * With explicit dimensions (optional - auto-detected from sprite if omitted):
 *   <gaze-tracker src="q0.webp,q1.webp,q2.webp,q3.webp" grid="30" width="512" height="640"></gaze-tracker>
 *
 * Usage (single sprite, legacy):
 *   <gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"></gaze-tracker>
 */

// Remote logger for widget
const widgetLog = (level, msg) => {
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message: `[Widget] ${msg}`, userAgent: navigator.userAgent })
    }).catch(() => {});
};

class GazeTracker extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        widgetLog('info', 'constructor called');

        // State
        this.app = null;
        this.sprite = null;
        this.frames = [];
        this.quadrantTextures = {};
        this.gridSize = 30;
        this.quadrantSize = 15;
        this.imageWidth = 512;
        this.imageHeight = 640;
        this.currentCol = 15;
        this.currentRow = 15;
        this.targetCol = 15;
        this.targetRow = 15;
        this.smoothing = 0.12;
        this.isInitialized = false;
        this.resizeObserver = null;
        this.mode = 'single';
        this.textureCache = {};
        this.gyroEnabled = false;
        this.isTouching = false;
    }

    static get observedAttributes() {
        return ['src', 'grid', 'width', 'height', 'smoothing', 'mode'];
    }

    connectedCallback() {
        widgetLog('info', 'connectedCallback');
        this.render();
        this.init().catch(err => {
            widgetLog('error', `init failed: ${err.message}`);
            console.error('GazeTracker init failed:', err);
        });
    }

    disconnectedCallback() {
        this.cleanup();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        switch (name) {
            case 'grid':
                this.gridSize = parseInt(newValue) || 30;
                this.quadrantSize = Math.floor(this.gridSize / 2);
                break;
            case 'width':
                this.imageWidth = parseInt(newValue) || 512;
                break;
            case 'height':
                this.imageHeight = parseInt(newValue) || 640;
                break;
            case 'smoothing':
                this.smoothing = parseFloat(newValue) || 0.12;
                break;
            case 'mode':
                this.mode = newValue || 'single';
                break;
            case 'src':
                if (this.isInitialized) {
                    // Re-read all attributes in case they were set together
                    this.mode = this.getAttribute('mode') || 'single';
                    this.gridSize = parseInt(this.getAttribute('grid')) || 30;
                    this.quadrantSize = Math.floor(this.gridSize / 2);
                    this.imageWidth = parseInt(this.getAttribute('width')) || 512;
                    this.imageHeight = parseInt(this.getAttribute('height')) || 640;
                    this.loadSprite(newValue);
                }
                break;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    position: relative;
                }

                .gaze-container {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: transparent;
                    overflow: hidden;
                    position: relative;
                }

                .gaze-container canvas {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }

                canvas {
                    display: block;
                }

                .loading {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: #888;
                    font-family: system-ui, sans-serif;
                    font-size: 14px;
                }

                .error {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: #ff4444;
                    font-family: system-ui, sans-serif;
                    font-size: 14px;
                    text-align: center;
                    padding: 20px;
                }

                .controls {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    display: flex;
                    gap: 8px;
                    z-index: 100;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                }

                :host(:hover) .controls,
                .controls:focus-within {
                    opacity: 1;
                }

                @media (pointer: coarse) {
                    .controls {
                        opacity: 1;
                    }
                }

                .ctrl-btn {
                    background: rgba(0, 0, 0, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    padding: 8px 12px;
                    font-size: 1.2rem;
                    color: #fff;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .ctrl-btn:hover {
                    background: rgba(0, 0, 0, 0.8);
                    border-color: #ff6b6b;
                }

                .ctrl-btn.active {
                    background: rgba(255, 107, 107, 0.6);
                    border-color: #ff6b6b;
                }

                :host(:fullscreen),
                :host(:-webkit-full-screen) {
                    width: 100vw !important;
                    height: 100vh !important;
                }

                :host(:fullscreen) .gaze-container,
                :host(:-webkit-full-screen) .gaze-container {
                    background: #000;
                }

                :host(:fullscreen) .controls,
                :host(:-webkit-full-screen) .controls {
                    opacity: 1;
                }
            </style>
            <div class="controls">
                <button class="ctrl-btn gyro-btn" title="Toggle gyroscope control">&#x1F4F1;</button>
                <button class="ctrl-btn fullscreen-btn" title="Toggle fullscreen">&#x26F6;</button>
            </div>
            <div class="gaze-container">
                <div class="loading">Loading...</div>
            </div>
        `;
    }

    async init() {
        widgetLog('info', 'init started');

        if (typeof PIXI === 'undefined') {
            widgetLog('info', 'loading PixiJS');
            await this.loadPixiJS();
            widgetLog('info', 'PixiJS loaded');
        }

        const container = this.shadowRoot.querySelector('.gaze-container');
        const loading = this.shadowRoot.querySelector('.loading');

        try {
            widgetLog('info', 'creating PIXI app');
            this.app = new PIXI.Application();
            await this.app.init({
                width: this.imageWidth,
                height: this.imageHeight,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                resolution: 1,
                autoDensity: false
            });
            widgetLog('info', 'PIXI app created');

            loading.remove();
            container.appendChild(this.app.canvas);

            this.mode = this.getAttribute('mode') || 'single';
            this.quadrantSize = Math.floor(this.gridSize / 2);

            const src = this.getAttribute('src');
            if (src) {
                widgetLog('info', `loading sprite: ${src.substring(0, 50)}...`);
                await this.loadSprite(src);
                widgetLog('info', 'sprite loaded');
            }

            widgetLog('info', 'setting up tracking');
            this.setupMouseTracking();
            this.setupTouchTracking();
            this.setupGyroscope();
            this.setupFullscreenButton();
            this.setupGyroButton();
            this.setupResizeObserver();
            this.isInitialized = true;
            widgetLog('info', 'init complete');

        } catch (error) {
            widgetLog('error', `init error: ${error.message}`);
            console.error('Gaze Tracker init error:', error);
            loading.className = 'error';
            loading.textContent = 'Failed to initialize: ' + error.message;
        }
    }

    async loadPixiJS() {
        return new Promise((resolve, reject) => {
            if (typeof PIXI !== 'undefined') {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://pixijs.download/v8.6.6/pixi.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load PixiJS'));
            document.head.appendChild(script);
        });
    }

    async loadSprite(src) {
        if (!this.app) return;

        try {
            if (this.sprite) {
                this.app.stage.removeChild(this.sprite);
                this.sprite.destroy();
                this.sprite = null;
            }
            this.frames = [];
            this.quadrantTextures = {};
            this.textureCache = {};

            // Auto-detect quadrants mode if src contains commas
            const isQuadrantMode = this.mode === 'quadrants' || src.includes(',');

            if (isQuadrantMode) {
                await this.loadQuadrantSprites(src);
            } else {
                await this.loadSingleSprite(src);
            }

            this.sprite = new PIXI.Sprite();
            this.sprite.anchor.set(0, 0);
            this.app.stage.addChild(this.sprite);

            // Scale sprite to fill canvas initially
            this.updateSpriteScale();

            const centerFrame = Math.floor(this.gridSize / 2);
            this.updateFrame(centerFrame, centerFrame);

            this.app.ticker.add(this.animate.bind(this));

        } catch (error) {
            console.error('Failed to load sprite:', error);
        }
    }

    async loadSingleSprite(src) {
        const texture = await PIXI.Assets.load(src);
        const baseTexture = texture.source;

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const frame = new PIXI.Rectangle(
                    col * this.imageWidth,
                    row * this.imageHeight,
                    this.imageWidth,
                    this.imageHeight
                );
                this.frames.push(new PIXI.Texture({ source: baseTexture, frame }));
            }
        }
    }

    async loadQuadrantSprites(src) {
        const urls = src.split(',').map(s => s.trim());
        if (urls.length !== 4) {
            throw new Error('Quadrant mode requires 4 sprite URLs');
        }

        const loaded = await PIXI.Assets.load(urls);
        this.quadrantTextures = {
            q0: loaded[urls[0]],
            q1: loaded[urls[1]],
            q2: loaded[urls[2]],
            q3: loaded[urls[3]]
        };

        // Auto-detect frame dimensions from first quadrant if not explicitly set
        const firstTexture = this.quadrantTextures.q0;
        if (firstTexture && (!this.getAttribute('width') || !this.getAttribute('height'))) {
            // Each quadrant is half the grid, so frame size = texture size / quadrantSize
            const detectedWidth = Math.round(firstTexture.width / this.quadrantSize);
            const detectedHeight = Math.round(firstTexture.height / this.quadrantSize);

            if (!this.getAttribute('width')) {
                this.imageWidth = detectedWidth;
            }
            if (!this.getAttribute('height')) {
                this.imageHeight = detectedHeight;
            }

            // Resize the PIXI app to match detected dimensions
            this.app.renderer.resize(this.imageWidth, this.imageHeight);
            widgetLog('info', `Auto-detected frame size: ${this.imageWidth}x${this.imageHeight}`);
        }
    }

    updateSpriteScale() {
        if (!this.sprite || !this.app) return;

        const canvasWidth = this.app.renderer.width;
        const canvasHeight = this.app.renderer.height;

        // Calculate scale to fit image inside canvas while maintaining aspect ratio
        const scaleX = canvasWidth / this.imageWidth;
        const scaleY = canvasHeight / this.imageHeight;
        const scale = Math.min(scaleX, scaleY);

        // Apply scale
        this.sprite.scale.set(scale, scale);

        // Center the sprite in the canvas
        this.sprite.x = (canvasWidth - this.imageWidth * scale) / 2;
        this.sprite.y = (canvasHeight - this.imageHeight * scale) / 2;
    }

    getTextureForCell(row, col) {
        // Auto-detect mode based on what's loaded
        const isQuadrantMode = Object.keys(this.quadrantTextures).length > 0;

        if (isQuadrantMode) {
            const half = this.quadrantSize;
            let quadrant, localRow, localCol;

            if (row < half && col < half) {
                quadrant = this.quadrantTextures.q0;
                localRow = row;
                localCol = col;
            } else if (row < half && col >= half) {
                quadrant = this.quadrantTextures.q1;
                localRow = row;
                localCol = col - half;
            } else if (row >= half && col < half) {
                quadrant = this.quadrantTextures.q2;
                localRow = row - half;
                localCol = col;
            } else {
                quadrant = this.quadrantTextures.q3;
                localRow = row - half;
                localCol = col - half;
            }

            if (!quadrant) return null;

            const key = `${row}_${col}`;
            if (!this.textureCache[key]) {
                const cellX = localCol * this.imageWidth;
                const cellY = localRow * this.imageHeight;
                const frame = new PIXI.Rectangle(cellX, cellY, this.imageWidth, this.imageHeight);
                this.textureCache[key] = new PIXI.Texture({ source: quadrant.source, frame });
            }
            return this.textureCache[key];
        } else {
            const frameIndex = row * this.gridSize + col;
            return this.frames[frameIndex];
        }
    }

    updateFrame(row, col) {
        if (!this.sprite) return;
        const texture = this.getTextureForCell(row, col);
        if (texture) {
            this.sprite.texture = texture;
        }
    }

    setupMouseTracking() {
        this.mouseMoveHandler = (e) => {
            if (this.gyroEnabled) return;
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            this.targetCol = x * (this.gridSize - 1);
            this.targetRow = y * (this.gridSize - 1);
        };

        document.addEventListener('mousemove', this.mouseMoveHandler);
    }

    setupTouchTracking() {
        this.touchStartHandler = (e) => {
            this.isTouching = true;
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const x = touch.clientX / window.innerWidth;
                const y = touch.clientY / window.innerHeight;
                this.targetCol = x * (this.gridSize - 1);
                this.targetRow = y * (this.gridSize - 1);
            }
        };

        this.touchMoveHandler = (e) => {
            if (e.touches.length > 0) {
                this.isTouching = true;
                const touch = e.touches[0];
                const x = touch.clientX / window.innerWidth;
                const y = touch.clientY / window.innerHeight;
                this.targetCol = x * (this.gridSize - 1);
                this.targetRow = y * (this.gridSize - 1);
            }
        };

        this.touchEndHandler = () => {
            this.isTouching = false;
        };

        document.addEventListener('touchstart', this.touchStartHandler, { passive: true });
        document.addEventListener('touchmove', this.touchMoveHandler, { passive: true });
        document.addEventListener('touchend', this.touchEndHandler, { passive: true });
    }

    setupGyroscope() {
        if (!window.DeviceOrientationEvent) return;

        this.deviceOrientationHandler = (e) => {
            if (!this.gyroEnabled || this.isTouching) return;

            // Check if we have valid data
            if (e.beta === null || e.gamma === null) return;

            const beta = e.beta;   // -180 to 180 (front/back tilt)
            const gamma = e.gamma; // -90 to 90 (left/right tilt)

            // Normalize: assume phone held at ~45 degrees
            const neutralBeta = 45;
            const betaNorm = Math.max(0, Math.min(1, (beta - neutralBeta + 30) / 60));
            const gammaNorm = Math.max(0, Math.min(1, (gamma + 30) / 60));

            this.targetCol = gammaNorm * (this.gridSize - 1);
            this.targetRow = betaNorm * (this.gridSize - 1);
        };
    }

    async enableGyro() {
        // iOS 13+ requires permission request from user gesture
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    console.log('Gyro permission denied');
                    return false;
                }
            } catch (e) {
                console.error('Gyro permission error:', e);
                return false;
            }
        }

        // Add listener only after permission granted
        if (this.deviceOrientationHandler) {
            window.addEventListener('deviceorientation', this.deviceOrientationHandler, true);
        }
        return true;
    }

    setupGyroButton() {
        const btn = this.shadowRoot.querySelector('.gyro-btn');
        if (!btn) return;

        // Show on touch devices (mobile/tablet)
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (!hasTouch) {
            btn.style.display = 'none';
            return;
        }

        btn.addEventListener('click', async () => {
            if (!this.gyroEnabled) {
                // Turning on - request permission if needed
                const success = await this.enableGyro();
                if (success) {
                    this.gyroEnabled = true;
                    btn.classList.add('active');
                }
            } else {
                // Turning off
                this.gyroEnabled = false;
                btn.classList.remove('active');
                if (this.deviceOrientationHandler) {
                    window.removeEventListener('deviceorientation', this.deviceOrientationHandler);
                }
            }
        });
    }

    setupFullscreenButton() {
        const btn = this.shadowRoot.querySelector('.fullscreen-btn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            // Check various fullscreen states
            const isFullscreen = document.fullscreenElement === this ||
                                 document.webkitFullscreenElement === this;

            if (isFullscreen) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } else {
                // Try standard first, then webkit
                if (this.requestFullscreen) {
                    this.requestFullscreen().catch(err => {
                        console.error('Fullscreen error:', err);
                    });
                } else if (this.webkitRequestFullscreen) {
                    this.webkitRequestFullscreen();
                }
            }
        });

        // Update button icon when fullscreen changes
        const updateIcon = () => {
            const isFullscreen = document.fullscreenElement === this ||
                                 document.webkitFullscreenElement === this;
            btn.innerHTML = isFullscreen ? '&#x2715;' : '&#x26F6;';
        };

        document.addEventListener('fullscreenchange', updateIcon);
        document.addEventListener('webkitfullscreenchange', updateIcon);
    }

    animate() {
        if (!this.sprite) return;

        this.currentCol += (this.targetCol - this.currentCol) * this.smoothing;
        this.currentRow += (this.targetRow - this.currentRow) * this.smoothing;

        const col = Math.round(Math.max(0, Math.min(this.gridSize - 1, this.currentCol)));
        const row = Math.round(Math.max(0, Math.min(this.gridSize - 1, this.currentRow)));

        this.updateFrame(row, col);
    }

    setupResizeObserver() {
        try {
            this.resizeObserver = new ResizeObserver((entries) => {
                try {
                    if (!this.app || !this.app.canvas) return;

                    const entry = entries[0];
                    const { width, height } = entry.contentRect;

                    if (width === 0 || height === 0) return;

                    // Make canvas fill the entire container
                    const canvasWidth = width;
                    const canvasHeight = height;

                    // Update PixiJS renderer size to match container
                    this.app.renderer.resize(Math.floor(canvasWidth), Math.floor(canvasHeight));

                    // Update canvas display size (CSS) - let it fill container
                    this.app.canvas.style.width = '100%';
                    this.app.canvas.style.height = '100%';

                    // Scale sprite to fill the entire canvas
                    this.updateSpriteScale();
                } catch (e) {
                    console.error('ResizeObserver callback error:', e);
                }
            });
            this.resizeObserver.observe(this);
        } catch (e) {
            console.error('setupResizeObserver error:', e);
        }
    }

    cleanup() {
        if (this.mouseMoveHandler) {
            document.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.touchStartHandler) {
            document.removeEventListener('touchstart', this.touchStartHandler);
        }
        if (this.touchMoveHandler) {
            document.removeEventListener('touchmove', this.touchMoveHandler);
        }
        if (this.touchEndHandler) {
            document.removeEventListener('touchend', this.touchEndHandler);
        }
        if (this.deviceOrientationHandler) {
            window.removeEventListener('deviceorientation', this.deviceOrientationHandler);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.app) {
            this.app.destroy(true, { children: true, texture: true });
            this.app = null;
        }
    }
}

if (!customElements.get('gaze-tracker')) {
    customElements.define('gaze-tracker', GazeTracker);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GazeTracker;
}
