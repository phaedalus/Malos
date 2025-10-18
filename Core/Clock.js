import { MalosSubClock } from './SubClock.js';

export class MalosClock {
    constructor(targetFPS = 60) {
        this.targetFPS = targetFPS;
        this.delta = 0;
        this.lastTime = 0;
        this.accumulator = 0;
        this.fixedStep = 1 / targetFPS;
        this.timeScale = 1.0;
        this.paused = false;
        this.frameCount = 0;
        this.timers = [];
        this.elapsed = 0;
        this.elapsed += this.delta;
        this.childClocks = new Map();
    }

    start() {
        this.lastTime = performance.now();
    }

    tick() {
        if (this.paused) return 0;

        const now = performance.now();
        this.delta = ((now - this.lastTime) / 1000) * this.timeScale;
        this.lastTime = now;
        this.accumulator += this.delta;
        this.frameCount++;
        this._updateTimers(this.delta);
        this.elapsed += this.delta;

        return this.delta;
    }

    runRender(renderCallback) {
        if (typeof renderCallback === "function") renderCallback(this.delta);
    }

    runFixedUpdate(fixedUpdate) {
        while (this.accumulator >= this.fixedStep) {
            if (typeof fixedUpdate === "function") fixedUpdate(this.fixedStep);
            this.accumulator -= this.fixedStep;
        }
    }

    setTimer(duration, callback, repeat = false) {
        const timer = { duration, remaining: duration, callback, repeat };
        this.timers.push(timer);
        return timer;
    }

    clearTimer(timer) {
        this.timers = this.timers.filter(t => t !== timer);
    }

    _updateTimers(delta) {
        for (let i = this.timers.length - 1; i >= 0; i--) {
            const t = this.timers[i];
            t.remaining -= delta;
            if (t.remaining <= 0) {
                if (typeof t.callback === "function") t.callback();
                if (t.repeat) t.remaining = t.duration;
                else this.timers.splice(i, 1);
            }
        }
    }

    createCountdown(duration, onFinish) {
        const clock = new MalosSubClock(duration, onFinish);
        this.childClocks.set(clock.id, clock);
        return clock;
    }

    createClock() {
        const id = crypto.randomUUID();
        const subClock = new MalosSubClock(null, null, id);
        this.childClocks.set(id, subClock);
        return subClock;
    }

    updateClocks(delta) {
        for (const [id, clock] of this.childClocks) {
            clock.tick(delta);
            if (clock.finished) this.childClocks.delete(id);
        }
    }

    setFPS(fps) {
        this.targetFPS = fps;
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
        this.lastTime = performance.now();
    }

    get frameDuration() {
        return 1 / this.targetFPS;
    }

    shouldRender() {
        return this.elapsed >= this.frameDuration;
    }
}