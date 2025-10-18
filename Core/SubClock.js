export class MalosSubClock {
    constructor(duration = null, onFinish = null, id = crypto.randomUUID()) {
        this.id = id;
        this.duration = duration;
        this.remaining = duration;
        this.elapsed = 0;
        this.onFinish = onFinish;
        this.finished = false;
        this.active = true;
    }

    tick(delta) {
        if (!this.active || this.finished) return;
        this.elapsed += delta;

        if (this.duration !== null) {
            this.remaining -= delta;
            if (this.remaining <= 0) {
                this.finished = true;
                if (typeof this.onFinish === "function") this.onFinish();
            }
        }
    }

    reset(newDuration = this.duration) {
        this.duration = newDuration;
        this.remaining = newDuration;
        this.elapsed = 0;
        this.finished = false;
        this.active = true;
    }

    stop() {
        this.active = false;
    }

    resume() {
        if (!this.finished) this.active = true;
    }
}