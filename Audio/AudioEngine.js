export class ShermanAudio {
    constructor(engine, config = {}) {
        this.engine = engine;
        this.config = config;

        this.context = null;
        this.masterGain = null;
        this.layers = new Map();
        this.buffers = new Map();
        this.activeSources = new Map();
        this.queues = new Map();

        this.defaultConfig = {
            volume: 1.0,
            layers: ["music", "sfx"]
        };

        this.locked = true;
        this.pendingActions = [];

        this.init();
    }

    init() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.config.volume ?? this.defaultConfig.volume;
        this.masterGain.connect(this.context.destination);

        const layerList = this.config.layers ?? this.defaultConfig.layers;
        for (const l of layerList) this.addLayer(l);

        this.unlockOnGesture();

        console.log("ShermanAudio initialized, waiting for user gesture.");
    }

    unlockOnGesture() {
        const unlock = () => {
            if (this.context.state === "suspended") {
                this.context.resume();
            }
            this.locked = false;
            console.log("ShermanAudio unlocked by user gesture.");
            while (this.pendingActions.length > 0) {
                const fn = this.pendingActions.shift();
                fn();
            }
            window.removeEventListener("click", unlock);
            window.removeEventListener("keydown", unlock);
            window.removeEventListener("touchstart", unlock);
        };

        window.addEventListener("click", unlock);
        window.addEventListener("keydown", unlock);
        window.addEventListener("touchstart", unlock);
    }

    addLayer(name) {
        if (this.layers.has(name)) return;
        const gain = this.context.createGain();
        gain.gain.value = 1.0;
        gain.connect(this.masterGain);
        this.layers.set(name, gain);
        this.activeSources.set(name, new Map());
        this.queues.set(name, []);
        console.log(`Layer "${name}" created.`);
    }

    async load(name, url) {
        if (this.buffers.has(name)) return this.buffers.get(name);
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const audioBuf = await this.context.decodeAudioData(buf);
        this.buffers.set(name, audioBuf);
        return audioBuf;
    }

    play(name, { layer = "sfx", loop = false, volume = 1.0 } = {}) {
        const action = () => {
            const buffer = this.buffers.get(name);
            if (!buffer) return console.warn(`Audio "${name}" not loaded.`);
            if (!this.layers.has(layer)) this.addLayer(layer);

            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.loop = loop;

            const gainNode = this.context.createGain();
            gainNode.gain.value = volume;
            source.connect(gainNode);
            gainNode.connect(this.layers.get(layer));
            source.start(0);

            this.activeSources.get(layer).set(name, { source, gainNode });
            source.onended = () => this.activeSources.get(layer).delete(name);
        };

        if (this.locked) {
            console.warn(`ShermanAudio locked: queued play("${name}")`);
            this.pendingActions.push(action);
        } else {
            action();
        }
    }

    enqueue(layer, track) {
        this.queues.get(layer).push(track);
        if (this.activeSources.get(layer).size === 0) {
            this._nextInQueue(layer);
        }
    }

    _nextInQueue(layer) {
        const next = this.queues.get(layer).shift();
        if (!next) return;
        this.play(next, { layer });
    }

    setLayerVolume(layer, v) {
        if (this.layers.has(layer)) this.layers.get(layer).gain.value = v;
    }
    setMasterVolume(v) {
        this.masterGain.gain.value = v;
    }

    stopAll() {
        for (const [layer, sources] of this.activeSources.entries()) {
            for (const { source } of sources.values()) source.stop();
            sources.clear();
        }
    }
}