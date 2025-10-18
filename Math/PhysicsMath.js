import { MalosMath2D } from '../Math/Math2D.js';

export const MalosPhysicsMath = {
    applyGravity(velocity, gravity, deltaTime) {
        return MalosMath2D.add(velocity, MalosMath2D.scale(gravity, deltaTime));
    },

    kineticEnergy(mass, velocity) {
        const speed = MalosMath2D.length(velocity);
        return 0.5 * mass * speed * speed;
    },

    momentum(mass, velocity) {
        return MalosMath2D.scale(velocity, mass);
    },

    resolveElasticCollision(a, b, restitution = 1.0) {
        const normal = MalosMath2D.normalize(MalosMath2D.sub(b.position, a.position));
        const relativeVelocity = MalosMath2D.sub(b.velocity, a.velocity);
        const velocityAlongNormal = MalosMath2D.dot(relativeVelocity, normal);

        if (velocityAlongNormal > 0) return;

        const invMassA = 1 / a.mass;
        const invMassB = 1 / b.mass;
        const j = -(1 + restitution) * velocityAlongNormal / (invMassA + invMassB);

        const impulse = MalosMath2D.scale(normal, j);
        a.velocity = MalosMath2D.sub(a.velocity, MalosMath2D.scale(impulse, invMassA));
        b.velocity = MalosMath2D.add(b.velocity, MalosMath2D.scale(impulse, invMassB));
    },

    applyDamping(velocity, factor = 0.98) {
        return MalosMath2D.scale(velocity, factor);
    }
};