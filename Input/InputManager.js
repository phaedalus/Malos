import { MalosKeyboardInput } from './KeyboardInput.js';
import { MalosMouseInput } from './MouseInput.js';
import { MalosTouchInput } from './TouchInput.js';
import { MalosControllerInput } from './ControllerInput.js';

export class MalosInputManager {
    constructor(engine) {
        this.engine = engine;
        this.keyboard = new MalosKeyboardInput();
        this.mouse = new MalosMouseInput();
        this.touch = new MalosTouchInput();
        this.controller = new MalosControllerInput();

        this.listeners = [];
    }

    attach(target = window) {
        this.keyboard.attach(target);
        this.mouse.attach(target);
        this.touch.attach(target);
    }

    detach(target = window) {
        this.keyboard.detach(target);
        this.mouse.detach(target);
        this.touch.detach(target);
    }

    on(eventType, callback) {
        this.listeners.push({ eventType, callback });
    }

    emit(eventType, data) {
        for (const listener of this.listeners) {
            if (listener.eventType === eventType) listener.callback(data);
        }
    }

    update() {
        this.keyboard.update?.();
        this.mouse.update?.();
        this.touch.update?.();
    }
}