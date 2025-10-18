export class MalosTouchInput {
    constructor() {
        this.touches = new Map();
        this.listeners = [];
    }

    attach(target = window) {
        this.startHandler = e => {
            for (const t of e.changedTouches) {
                this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
                this._emit('touchstart', { id: t.identifier, x: t.clientX, y: t.clientY });
            }
        };

        this.moveHandler = e => {
            for (const t of e.changedTouches) {
                this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
                this._emit('touchmove', { id: t.identifier, x: t.clientX, y: t.clientY });
            }
        };

        this.endHandler = e => {
            for (const t of e.changedTouches) {
                this.touches.delete(t.identifier);
                this._emit('touchend', { id: t.identifier, x: t.clientX, y: t.clientY });
            }
        };

        target.addEventListener('touchstart', this.startHandler);
        target.addEventListener('touchmove', this.moveHandler);
        target.addEventListener('touchend', this.endHandler);
    }

    detach(target = window) {
        target.removeEventListener('touchstart', this.startHandler);
        target.removeEventListener('touchmove', this.moveHandler);
        target.removeEventListener('touchend', this.endHandler);
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