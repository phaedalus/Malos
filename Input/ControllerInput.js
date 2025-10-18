export class MalosControllerInput {
    constructor() {
        this.gamepads = new Map();
        this.listeners = [];
    }

    attach() {
        window.addEventListener("gamepadconnected", e => this._connectHandler(e));
        window.addEventListener("gamepaddisconnected", e => this._disconnectHandler(e));
    }

    detach() {
        window.removeEventListener("gamepadconnected", this._connectHandler);
        window.removeEventListener("gamepaddisconnected", this._disconnectHandler);
    }

    _connectHandler(e) {
        console.log(`[ControllerInput] Connected: ${e.gamepad.id}`);
        this.gamepads.set(e.gamepad.index, e.gamepad);
        this._emit("connected", e.gamepad);
    }

    _disconnectHandler(e) {
        console.log(`[ControllerInput] Disconnected: ${e.gamepad.id}`);
        this.gamepads.delete(e.gamepad.index);
        this._emit("disconnected", e.gamepad);
    }

    update() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];

        for (const pad of pads) {
            if (!pad) continue;

            pad.buttons.forEach((button, index) => {
                const prev = this.gamepads.get(pad.index)?.buttons[index]?.pressed || false;
                if (button.pressed && !prev) {
                    this._emit("buttondown", { index: pad.index, button: index });
                } else if (!button.pressed && prev) {
                    this._emit("buttonup", { index: pad.index, button: index });
                }
            });

            pad.axes.forEach((value, index) => {
                this._emit("axismove", { index: pad.index, axis: index, value });
            });

            this.gamepads.set(pad.index, pad);
        }
    }

    on(eventType, callback) {
        this.listeners.push({ eventType, callback });
    }

    _emit(eventType, data) {
        for (const l of this.listeners) {
            if (l.eventType === eventType) l.callback(data);
        }
    }

    getState(index = 0) {
        return navigator.getGamepads()[index];
    }
}