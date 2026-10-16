import { clamp } from './race.js';

const SETTINGS = Object.freeze({
  fullLockSeconds: 0.95,
  initialStrength: 0.12,
  slowSpeedLimit: 0.82,
  fastSpeedLimit: 0.68,
  responsePerSecond: 2.4,
  centeringPerSecond: 6,
});

/** Shared, time-based steering for keyboard and touch controls. */
export class ProgressiveSteering {
  constructor() {
    this.reset();
  }

  reset() {
    this.direction = 0;
    this.heldSeconds = 0;
    this.value = 0;
  }

  limit(speed, sensitivity = 1) {
    const speedRatio = clamp((Math.abs(speed) - 12) / 25, 0, 1);
    return clamp(
      (SETTINGS.slowSpeedLimit + (SETTINGS.fastSpeedLimit - SETTINGS.slowSpeedLimit) * speedRatio) *
        sensitivity,
      0,
      0.95,
    );
  }

  updateAnalog(dt, axis, speed, sensitivity = 1) {
    this.direction = Math.sign(axis);
    this.heldSeconds = 0;
    const target = clamp(axis, -1, 1) * this.limit(speed, sensitivity);
    const rate = axis === 0 ? SETTINGS.centeringPerSecond : 3.2;
    this.value += clamp(target - this.value, -rate * dt, rate * dt);
    return this.value;
  }

  update(dt, direction, speed, sensitivity = 1) {
    direction = Math.sign(direction);
    if (direction !== this.direction) {
      // A fresh tap or an opposite turn starts gently instead of inheriting full lock.
      this.heldSeconds = 0;
      if (direction !== 0) this.value = 0;
      this.direction = direction;
    }

    let target = 0;
    if (direction !== 0) {
      this.heldSeconds = Math.min(SETTINGS.fullLockSeconds, this.heldSeconds + dt);
      const hold = this.heldSeconds / SETTINGS.fullLockSeconds;
      const limit = this.limit(speed, sensitivity);
      const strength = SETTINGS.initialStrength + (1 - SETTINGS.initialStrength) * hold ** 1.15;
      target = direction * limit * strength;
    }

    const rate = direction === 0 ? SETTINGS.centeringPerSecond : SETTINGS.responsePerSecond;
    this.value += clamp(target - this.value, -rate * dt, rate * dt);
    return this.value;
  }
}
