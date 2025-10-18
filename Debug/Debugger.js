export class MalosDebugger {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.clock = engine.Time;
        this.enabled = options.enabled ?? true;
        this.showPerformance = options.showPerformance ?? true;
        this.trackModules = options.trackModules ?? true;
        this.fpsUpdateInterval = 1.0;
        this.accumulator = 0;
        this.lastFrameCount = 0;
        this.fps = 0;

        if (!this.clock) {
            console.warn("[MalosDebugger] No engine clock found — attach after engine.Time is initialized.");
            return;
        }

        console.log("%c[MalosDebugger] Initialized with existing MalosClock", "color:#66ff99;");
    }

    update() {
        if (!this.enabled || !this.clock || this.clock.paused) return;

        const delta = this.clock.delta;
        this.accumulator += delta;

        if (this.accumulator >= this.fpsUpdateInterval) {
            const frames = this.clock.frameCount - this.lastFrameCount;
            this.fps = frames / this.accumulator;
            this.lastFrameCount = this.clock.frameCount;
            this.accumulator = 0;
            if (this.showPerformance) this.displayStats();
        }
    }

    displayStats() {
        console.clear();
        console.log("%c[Malos Debugger]", "color:#66ff99; font-weight:bold;");
        console.log(`FPS: ${this.fps.toFixed(1)}`);
        console.log(`Delta: ${this.clock.delta.toFixed(4)}s`);
        console.log(`Elapsed: ${this.clock.elapsed?.toFixed(2) ?? 0}s`);
        console.log(`Frame Count: ${this.clock.frameCount}`);
        if (this.trackModules) console.log("Loaded Modules:", this.engine.loaded.join(", "));
    }

    log(message, type = "info") {
        if (!this.enabled) return;
        const colors = {
            info: "color:#99ccff",
            warn: "color:#ffcc66",
            error: "color:#ff6666",
            success: "color:#66ff99"
        };
        console.log(`%c[Debug] ${message}`, colors[type] || "color:white");
    }

    error(msg) { this.log(msg, "error"); }
    warn(msg) { this.log(msg, "warn"); }
    success(msg) { this.log(msg, "success"); }

    toggle(state) {
        this.enabled = state ?? !this.enabled;
        console.log(`[MalosDebugger] ${this.enabled ? "Enabled" : "Disabled"}`);
    }
}