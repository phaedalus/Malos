import { decideGraphicsAPI } from '../Render/RendererChoice.js';
import { CANVASAPI } from '../Render/RendererCANVAS.js';
import { WEBGLAPI } from '../Render/RendererWEBGL.js';
import { WEBGL2API } from '../Render/RendererWEBGL2.js';
import { WEBGPUAPI } from '../Render/RendererWEBGPU.js';
import { MalosClock } from '../Core/Clock.js';
import { ShermanAudio } from '../Audio/AudioEngine.js';
import { MalosDebugger } from '../Debug/Debugger.js';
import { MalosUIManager } from '../UI/UIManager.js';
import { MalosInputManager } from '../Input/InputManager.js';
import { MalosCollision2D } from '../Physics/Collision2D.js';
import { MalosPhysics2D } from '../Physics/Physics2D.js';
import { MalosPhysicsMath } from '../Math/PhysicsMath.js';
import { MalosMath2D } from '../Math/Math2D.js';
import { MalosRayMath } from '../Math/RayMath.js';
import { MalosSplashScreen } from '../Core/SplashScreen.js';

export class Malos {
    constructor(config) {
        this.config = config;
        this.loaded = [];
        this.ready = this.init();

        return {
            chosenAPI: chosen,
            loadedModules: this.loaded
        }
    }

    async init() {
        let chosen = null;

        if (this.config.SplashScreen && this.config.SplashScreen.enabled) {
            const splash = new MalosSplashScreen(this.config.id, {
                images: this.config.SplashScreen.images || [],
                duration: this.config.SplashScreen.duration || 1500,
                fadeTime: this.config.SplashScreen.fadeTime || 400,
                background: this.config.SplashScreen.background || "#000",
            });
            await splash.play();
        }

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
            Time: MalosClock,
            UI: MalosUIManager,
            Input: MalosInputManager,
            Collision: MalosCollision2D,
            Physics: MalosPhysics2D,
            Math2D: MalosMath2D,
            PhysicsMath: MalosPhysicsMath,
            RayMath: MalosRayMath
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
                } else if (key === "UI") {
                    this[key] = new modules[key](this);
                    this[key].attachInput();
                } else if (key === "Input") {
                    this[key] = new modules[key](this);
                    this[key].attach();
                } else {
                    this[key] = new modules[key](this);
                }
                this.loaded.push(key);
                console.log(`${key} module loaded (${chosen})`);
            }
        }

        if (this.config.Debug === true) {
            if (!this.Time) {
                console.warn("[MalosDebugger] Time module not found — cannot attach debugger.");
            } else {
                this.Debugger = new MalosDebugger(this, {
                    showPerformance: true,
                    trackModules: true
                });

                this.Time.setTimer(1 / (this.config.targetFPS || 60), () => {
                    this.Debugger.update();
                }, true);

                this.Debugger.success("Debugger attached to Malos engine");
            }
        }
    }
}