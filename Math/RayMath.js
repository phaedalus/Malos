export class MalosRayMath {
    static shootRay(origin, direction, length = 1000, hitCheck = null, step = 1) {
        const pos = { x: origin.x, y: origin.y };
        const dir = { x: direction.x, y: direction.y };
        const traveled = { x: 0, y: 0 };

        for (let i = 0; i < length; i += step) {
            pos.x += dir.x * step;
            pos.y += dir.y * step;
            traveled.x += dir.x * step;
            traveled.y += dir.y * step;

            if (hitCheck && hitCheck(pos)) {
                return {
                    hit: true,
                    position: { x: pos.x, y: pos.y },
                    distance: Math.sqrt(traveled.x ** 2 + traveled.y ** 2)
                };
            }
        }

        return {
            hit: false,
            position: { x: pos.x, y: pos.y },
            distance: length
        };
    }

    static projectPoint(origin, direction, distance) {
        return {
            x: origin.x + direction.x * distance,
            y: origin.y + direction.y * distance
        };
    }
}