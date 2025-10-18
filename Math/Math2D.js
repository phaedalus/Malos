export const MalosMath2D = {
    vec2(x = 0, y = 0) {
        return { x, y };
    },

    add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    },

    sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    },

    scale(v, s) {
        return { x: v.x * s, y: v.y * s };
    },

    dot(a, b) {
        return a.x * b.x + a.y * b.y;
    },

    length(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    },

    normalize(v) {
        const len = this.length(v);
        return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
    },

    distance(a, b) {
        return this.length(this.sub(a, b));
    },

    rotate(v, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
    }
};