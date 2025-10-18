export class MalosSplashScreen {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error("[MalosSplashScreen] Canvas element not found");

        this.ctx = this.canvas.getContext("2d");
        this.images = options.images || [];
        this.duration = options.duration || 1500;
        this.fadeTime = options.fadeTime || 400;
        this.background = options.background || "#000";
        this.onFinish = options.onFinish || (() => {});
    }

    async play() {
        if (this.images.length === 0) {
            console.warn("[MalosSplashScreen] No splash images defined");
            this.onFinish();
            return;
        }

        for (let i = 0; i < this.images.length; i++) {
            await this.showImage(this.images[i]);
        }

        this.clearCanvas();
        this.onFinish();
    }

    async showImage(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.src = src;
            img.onload = async () => {
                const start = performance.now();
                const draw = (time) => {
                    const elapsed = time - start;
                    this.clearCanvas();

                    let alpha = 1;
                    if (elapsed < this.fadeTime) {
                        alpha = elapsed / this.fadeTime;
                    } else if (elapsed > this.duration - this.fadeTime) {
                        alpha = Math.max(0, 1 - (elapsed - (this.duration - this.fadeTime)) / this.fadeTime);
                    }

                    this.ctx.globalAlpha = alpha;
                    this.drawCentered(img);
                    this.ctx.globalAlpha = 1;

                    if (elapsed < this.duration) {
                        requestAnimationFrame(draw);
                    } else {
                        resolve();
                    }
                };
                requestAnimationFrame(draw);
            };
        });
    }

    drawCentered(img) {
        const { width, height } = this.canvas;
        const scale = Math.min(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (width - w) / 2;
        const y = (height - h) / 2;

        this.ctx.drawImage(img, x, y, w, h);
    }

    clearCanvas() {
        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
