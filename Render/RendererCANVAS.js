export class CANVASAPI {
    constructor(engine, canvasId) {
        this.engine = engine;
        this.id = canvasId;

        this.display = document.getElementById(canvasId);
        if (!this.display) {
            throw new Error(`Canvas element with id "${canvasId}" not found in DOM.`);
        }

        this.displayCTX = this.display.getContext("2d");
        this.sprites = new Map();
        this._resizeHandler = null;

        this.ready = this.init();
        this._isReady = false;

        console.log("Canvas2D Renderer initializing...");
    }

    async init() {
        await Promise.resolve();
        this._isReady = true;
        this.resize();
        console.log(`Canvas2D Renderer ready on "${this.id}"`);
        return true;
    }

    #ensureReady() {
        if (!this._isReady) {
            throw new Error(
                `Canvas2D not ready yet! You must "await game.Graphics.ready;" before calling rendering functions.`
            );
        }
    }

    setAutoResize(toset) {
        this.#ensureReady();
        if (toset === true) {
            if (!this._resizeHandler) {
                this._resizeHandler = this.resize.bind(this);
                window.addEventListener("resize", this._resizeHandler);
            }
        } else if (toset === false) {
            if (this._resizeHandler) {
                window.removeEventListener("resize", this._resizeHandler);
                this._resizeHandler = null;
            }
        }
    }

    setSize(width, height) {
        this.#ensureReady();
        const dpr = window.devicePixelRatio || 1;
        this.display.width = Math.floor(width * dpr);
        this.display.height = Math.floor(height * dpr);
        this.display.style.width = width + "px";
        this.display.style.height = height + "px";
        this.displayCTX.setTransform(1, 0, 0, 1, 0, 0);
        this.displayCTX.scale(dpr, dpr);
    }

    resize() {
        this.#ensureReady();
        this.setSize(window.innerWidth, window.innerHeight);
    }

    normalizeColor(input) {
        this.#ensureReady();
        if (typeof input === "string") return input;
        if (Array.isArray(input)) {
            let [r, g, b, a = 1] = input.map(Number);
            return `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
        }
        if (typeof input === "object" && input !== null) {
            let r = (input.r ?? 0) * 255;
            let g = (input.g ?? 0) * 255;
            let b = (input.b ?? 0) * 255;
            let a = input.a ?? 1;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return "black";
    }

    clear(color = "black") {
        this.#ensureReady();
        this.displayCTX.fillStyle = this.normalizeColor(color);
        this.displayCTX.fillRect(0, 0, this.display.width, this.display.height);
    }

    beginFrame(clearColor = null) {
        this.#ensureReady();
        if (clearColor) this.clear(clearColor);
    }

    endFrame() {
        this.#ensureReady();
        
        if (this.engine?.onFrameEnd) {
            this.engine.onFrameEnd(this);
        }

        if (this.displayCTX.flush) {
            this.displayCTX.flush();
        }
    }

    drawRect(x, y, w, h, color = "white") {
        this.#ensureReady();
        this.displayCTX.fillStyle = this.normalizeColor(color);
        this.displayCTX.fillRect(x, y, w, h);
    }

    drawCircle(x, y, radius, color = "white", segments = 64) {
        this.#ensureReady();
        this.displayCTX.fillStyle = this.normalizeColor(color);
        this.displayCTX.beginPath();
        this.displayCTX.arc(x, y, radius, 0, Math.PI * 2);
        this.displayCTX.fill();
    }

    drawLine(x1, y1, x2, y2, color = "white", width = 1) {
        this.#ensureReady();
        this.displayCTX.strokeStyle = this.normalizeColor(color);
        this.displayCTX.lineWidth = width;
        this.displayCTX.beginPath();
        this.displayCTX.moveTo(x1, y1);
        this.displayCTX.lineTo(x2, y2);
        this.displayCTX.stroke();
    }

    drawText(text, x, y, color = "white", font = "16px Arial", name = null) {
        this.#ensureReady();
        this.displayCTX.fillStyle = this.normalizeColor(color);
        this.displayCTX.font = font;
        this.displayCTX.fillText(text, x, y);
        return name || `__text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    async loadSprite(name, src, overwrite = false) {
        this.#ensureReady();
        if (this.sprites.has(name) && !overwrite) {
            return this.sprites.get(name);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                this.sprites.set(name, img);
                resolve({ texture: img, width: img.width, height: img.height });
            };
            img.onerror = reject;
        });
    }

    drawSprite(name, x, y, w = null, h = null, opts = {}) {
        this.#ensureReady();
        const sprite = this.sprites.get(name);
        if (!sprite) {
            console.warn(`Sprite "${name}" not found.`);
            return;
        }

        const width  = w || sprite.width;
        const height = h || sprite.height;

        this.displayCTX.save();
        this.displayCTX.translate(x, y);

        if (opts.rotation) this.displayCTX.rotate(opts.rotation);
        if (opts.scaleX || opts.scaleY) this.displayCTX.scale(opts.scaleX ?? 1, opts.scaleY ?? 1);

        this.displayCTX.drawImage(sprite, -(opts.originX ?? 0) * width, -(opts.originY ?? 0) * height, width, height);
        this.displayCTX.restore();
    }

    destroySprite(name) {
        this.#ensureReady();
        this.sprites.delete(name);
    }
}