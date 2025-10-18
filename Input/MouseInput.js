export class MalosMouseInput {
    constructor() {
        this.position = { x: 0, y: 0 };
        this.buttons = new Set();
        this.listeners = [];
    }

    attach(target = window) {
        this.moveHandler = e => {
            this.position = { x: e.clientX, y: e.clientY };
            this._emit('mousemove', this.position);
        };

        this.downHandler = e => {
            this.buttons.add(e.button);
            this._emit('mousedown', e.button);
        };

        this.upHandler = e => {
            this.buttons.delete(e.button);
            this._emit('mouseup', e.button);
        };

        this.wheelHandler = e => this._emit('wheel', e.deltaY);

        target.addEventListener('mousemove', this.moveHandler);
        target.addEventListener('mousedown', this.downHandler);
        target.addEventListener('mouseup', this.upHandler);
        target.addEventListener('wheel', this.wheelHandler);
    }

    detach(target = window) {
        target.removeEventListener('mousemove', this.moveHandler);
        target.removeEventListener('mousedown', this.downHandler);
        target.removeEventListener('mouseup', this.upHandler);
        target.removeEventListener('wheel', this.wheelHandler);
    }

    isButtonDown(button) {
        return this.buttons.has(button);
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