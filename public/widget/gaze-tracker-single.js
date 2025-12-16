/**
 * Gaze Tracker Web Component
 * A self-contained widget that displays an animated face following the cursor
 *
 * Usage (quadrant sprites - 4 files, recommended):
 *   <gaze-tracker
 *     src="q0.webp,q1.webp,q2.webp,q3.webp"
 *     mode="quadrants"
 *     grid="30"
 *     width="512"
 *     height="640">
 *   </gaze-tracker>
 *
 * Usage (single sprite, legacy):
 *   <gaze-tracker src="sprite.jpg" grid="30" width="512" height="640"></gaze-tracker>
 */

class GazeTracker extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

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
    }

    static get observedAttributes() {
        return ['src', 'grid', 'width', 'height', 'smoothing', 'mode'];
    }

    connectedCallback() {
        this.render();
        this.init();
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
                }

                canvas {
                    display: block;
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
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
            </style>
            <div class="gaze-container">
                <div class="loading">Loading...</div>
            </div>
        `;
    }

    async init() {
        if (typeof PIXI === 'undefined') {
            await this.loadPixiJS();
        }

        const container = this.shadowRoot.querySelector('.gaze-container');
        const loading = this.shadowRoot.querySelector('.loading');

        try {
            this.app = new PIXI.Application();
            await this.app.init({
                width: this.imageWidth,
                height: this.imageHeight,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                antialias: true
            });

            this.app.canvas.style.maxWidth = '100%';
            this.app.canvas.style.maxHeight = '100%';
            this.app.canvas.style.objectFit = 'contain';

            loading.remove();
            container.appendChild(this.app.canvas);

            this.mode = this.getAttribute('mode') || 'single';
            this.quadrantSize = Math.floor(this.gridSize / 2);

            const src = this.getAttribute('src');
            if (src) {
                await this.loadSprite(src);
            }

            this.setupMouseTracking();
            this.setupResizeObserver();
            this.isInitialized = true;

        } catch (error) {
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

            if (this.mode === 'quadrants') {
                await this.loadQuadrantSprites(src);
            } else {
                await this.loadSingleSprite(src);
            }

            this.sprite = new PIXI.Sprite();
            this.sprite.anchor.set(0, 0);
            this.app.stage.addChild(this.sprite);

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
    }

    getTextureForCell(row, col) {
        if (this.mode === 'quadrants') {
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
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            this.targetCol = x * (this.gridSize - 1);
            this.targetRow = y * (this.gridSize - 1);
        };

        this.touchMoveHandler = (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const x = touch.clientX / window.innerWidth;
                const y = touch.clientY / window.innerHeight;
                this.targetCol = x * (this.gridSize - 1);
                this.targetRow = y * (this.gridSize - 1);
            }
        };

        document.addEventListener('mousemove', this.mouseMoveHandler);
        document.addEventListener('touchmove', this.touchMoveHandler, { passive: true });
    }

    setupResizeObserver() {
        this.resizeObserver = new ResizeObserver(() => {});
        this.resizeObserver.observe(this);
    }

    animate() {
        if (!this.sprite) return;

        this.currentCol += (this.targetCol - this.currentCol) * this.smoothing;
        this.currentRow += (this.targetRow - this.currentRow) * this.smoothing;

        const col = Math.round(Math.max(0, Math.min(this.gridSize - 1, this.currentCol)));
        const row = Math.round(Math.max(0, Math.min(this.gridSize - 1, this.currentRow)));

        this.updateFrame(row, col);
    }

    cleanup() {
        if (this.mouseMoveHandler) {
            document.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.touchMoveHandler) {
            document.removeEventListener('touchmove', this.touchMoveHandler);
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
