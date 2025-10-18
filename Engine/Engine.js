import { decideGraphicsAPI } from '../Render/RendererChoice.js';
import { CANVASAPI } from '../Render/RendererCANVAS.js';
import { WEBGLAPI } from '../Render/RendererWEBGL.js';
import { WEBGL2API } from '../Render/RendererWEBGL2.js';
import { WEBGPUAPI } from '../Render/RendererWEBGPU.js';
import { MalosClock } from '../Core/Clock.js';
import { ShermanAudio } from '../Audio/AudioEngine.js';

export class Malos {
    constructor(config) {
        this.config = config;
        this.loaded = [];
        this.ready = this.init();
    }

    async init() {
        let chosen = null;

        if (this.config.forceGraphics) {
            chosen = this.config.forceGraphics;
            console.log(`Force graphics API: ${chosen}`);
        } else {
            const result = await decideGraphicsAPI();
            chosen = result.chosenAPI;
            console.log(`Auto-detected graphics API: ${chosen}`);
        }

        let graphics_api = null;
        if (chosen === "Canvas2D") { graphics_api = CANVASAPI;
        } else if (chosen === "WebGPU") { graphics_api = WEBGPUAPI;
        } else if (chosen === "WebGL2") { graphics_api = WEBGL2API;
        } else if (chosen === "WebGL") { graphics_api = WEBGLAPI;
        } else { console.warn("No supported graphics API chosen:", chosen);}

        const modules = {
            Graphics: graphics_api,
            Audio: ShermanAudio,
            Time: MalosClock
        };

        for (const [key, value] of Object.entries(this.config)) {
            if (value === true && typeof modules[key] === "function") {
                if (key === "Graphics") {
                    if (!this.config.id) {
                        throw new Error("Graphics enabled but no canvas id provided in config.");
                    }
                    this[key] = new modules[key](this, this.config.id);
                } else if (key === "Audio") {
                    this[key] = new modules[key](this, this.config.audioConfig || {});
                } else if (key === "Time") {
                    this[key] = new modules[key](this.config.targetFPS || 60);
                } else {
                    this[key] = new modules[key](this);
                }
                this.loaded.push(key);
                console.log(`${key} module loaded (${chosen})`);
            }
        }
    }
}