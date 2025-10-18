export class MalosCollision2D {
    constructor() {
        this.collidiers = [];
    }

    addCollider(collider) {
        if (!collider || !collider.type) {
            throw new Error("Invalid collider: module include a 'type' property.");
        }
        this.collidiers.push(collider);
    }

    removeCollider(collider) {
        this.collidiers = this.collidiers.filter(c => c !== collider);
    }

    clear() {
        this.collidiers = [];
    }

    update() {
        for (let i = 0; i < this.colliders.length; i++) {
            for (let j = i + 1; j < this.colliders.length; j++) {
                const a = this.colliders[i];
                const b = this.colliders[j];

                if (this.checkCollision(a, b)) {
                    if (typeof a.onCollision === "function") a.onCollision(b);
                    if (typeof b.onCollision === "function") b.onCollision(a);
                }
            }
        }
    }

    checkCollision(a, b) {
        if (a.type === "rect" && b.type === "rect") {
            return this.rectRect(a, b);
        }
        if (a.type === "circle" && b.type === "circle") {
            return this.circleCircle(a, b);
        }
        if (a.type === "rect" && b.type === "circle") {
            return this.rectCircle(a, b);
        }
        if (a.type === "circle" && b.type === "rect") {
            return this.rectCircle(b, a);
        }
        return false;
    }

    rectRect(a, b) {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
        );
    }

    circleCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (a.radius + b.radius);
    }

    rectCircle(rect, circle) {
        const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
        const dx = circle.x - closestX;
        const dy = circle.y - closestY;
        return (dx * dx + dy * dy) < (circle.radius * circle.radius);
    }
}