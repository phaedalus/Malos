export class MalosKeyboardInput {
    constructor() {
        this.keys = new Set();
        this.listeners = [];
    }

    attach(target = window) {
        this.keydownHandler = e => {
            this.keys.add(e.key.toLowerCase());
            this._emit('keydown', e.key.toLowerCase());
        };

        this.keyupHandler = e => {
            this.keys.delete(e.key.toLowerCase());
            this._emit('keyup', e.key.toLowerCase());
        };

        target.addEventListener('keydown', this.keydownHandler);
        target.addEventListener('keyup', this.keyupHandler);
    }

    detach(target = window) {
        target.removeEventListener('keydown', this.keydownHandler);
        target.removeEventListener('keyup', this.keyupHandler);
    }

    isDown(key) {
        return this.keys.has(key.toLowerCase());
    }

    on(eventType, callback) {
        this.listeners.push({ eventType, callback });
    }

    _emit(eventType, data) {
        for (const l of this.listeners) {
            if (l.eventType === eventType) l.callback(data);
        }
    }
}