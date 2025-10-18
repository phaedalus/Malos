import { MalosCollision2D } from './Collision2D.js';
import { MalosPhysicsMath } from '../Math/PhysicsMath.js';

export class MalosPhysics2D {
    constructor(engine) {
        this.engine = engine;
        this.bodies = [];
        this.gravity = { x: 0, y: 9.81 };
        this.timeStep = 1 / 60;
        this.damping = 0.98;
        console.log("[MalosPhysics2D] Physics module initialized.");
    }

    addBody(body) {
        if (!body.position || !body.velocity || !body.mass) {
            throw new Error("Invalid body: must contain position, velocity, and mass.");
        }
        this.bodies.push(body);
        console.log(`[MalosPhysics2D] Added body with mass ${body.mass}`);
        return body;
    }

    removeBody(body) {
        this.bodies = this.bodies.filter(b => b !== body);
    }

    step(deltaTime = this.timeStep) {
        for (const body of this.bodies) {
            if (body.static) continue;

            body.velocity = MalosPhysicsMath.applyGravity(body.velocity, this.gravity, deltaTime);

            body.velocity = MalosPhysicsMath.applyDamping(body.velocity, this.damping);

            body.position.x += body.velocity.x * deltaTime;
            body.position.y += body.velocity.y * deltaTime;
        }

        if (this.engine.Collision instanceof MalosCollision2D) {
            this.engine.Collision.resolve(this.bodies);
        }
    }

    resolveElasticCollisions(restitution = 1.0) {
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];
                MalosPhysicsMath.resolveElasticCollision(a, b, restitution);
            }
        }
    }

    clear() {
        this.bodies.length = 0;
    }
}