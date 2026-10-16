const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
export const RACERS = [
  { name: '你', tag: 'YOU', color: 0xff674d, hex: '#ff674d' },
  { name: 'LUNA', tag: '02', color: 0x48b8bc, hex: '#48b8bc' },
  { name: 'ENZO', tag: '03', color: 0xffcb53, hex: '#ffcb53' },
  { name: 'MILO', tag: '04', color: 0x6589df, hex: '#6589df' },
  { name: 'NOVA', tag: '05', color: 0xad80bb, hex: '#ad80bb' },
  { name: 'RIO', tag: '06', color: 0xb2ce70, hex: '#b2ce70' },
];

export class Race {
  constructor(track) {
    this.track = track;
    this.events = [];
    this.reset();
  }
  reset() {
    this.state = 'ready';
    this.elapsed = 0;
    this.countdown = 3.6;
    this.finishOrder = [];
    this.events.length = 0;
    this.penalty = 0;
    this.lastBeep = 4;
    this.collisions = 0;
    this.cars = RACERS.map((r, i) => {
      const s = -8 - Math.floor(i / 2) * 5.2,
        lane = (i % 2 === 0 ? -1 : 1) * 2.1,
        f = this.track.sampleDistance(s);
      return {
        ...r,
        id: i,
        x: f.position.x + f.normal.x * lane,
        z: f.position.z + f.normal.z * lane,
        y: f.position.y,
        yaw: f.yaw,
        vx: 0,
        vz: 0,
        speed: 0,
        steer: 0,
        angular: 0,
        offset: lane,
        progress: s,
        prevFraction: (((s / this.track.length) % 1) + 1) % 1,
        index: Math.floor(((((s / this.track.length) % 1) + 1) % 1) * this.track.count),
        gate: 1,
        lap: 1,
        lapTimes: [],
        lastLap: 0,
        finished: false,
        finishTime: null,
        driftCharge: 0,
        drifting: false,
        boost: 0,
        padCooldown: 0,
        wallCooldown: 0,
        wallContact: 0,
        slip: 0,
        aiLane: lane,
        travel: 0,
        drifts: 0,
      };
    });
  }
  start() {
    this.reset();
    this.state = 'countdown';
    this.events.push({ type: 'start' });
  }
  pause() {
    if (['racing', 'countdown'].includes(this.state)) {
      this.previousState = this.state;
      this.state = 'paused';
      return true;
    }
    return false;
  }
  resume() {
    if (this.state === 'paused') this.state = this.previousState;
  }
  rescue() {
    const c = this.cars[0];
    if (this.state !== 'racing' || c.finished) return;
    const f = this.track.sampleDistance(c.progress);
    c.x = f.position.x;
    c.z = f.position.z;
    c.y = f.position.y;
    c.yaw = f.yaw;
    c.vx = 0;
    c.vz = 0;
    c.speed = 0;
    c.angular = 0;
    c.driftCharge = 0;
    c.drifting = false;
    c.wallContact = 0;
    this.penalty += 2;
    this.events.push({ type: 'rescue' });
  }
  project(c) {
    const samples = this.track.samples,
      n = this.track.count;
    let best = Infinity,
      idx = c.index,
      fx = 0;
    for (let k = -24; k <= 24; k++) {
      const i = (c.index + k + n) % n,
        a = samples[i].position,
        b = samples[i + 1].position;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const q = clamp(((c.x - a.x) * dx + (c.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const dd = (c.x - a.x - dx * q) ** 2 + (c.z - a.z - dz * q) ** 2;
      if (dd < best) {
        best = dd;
        idx = i;
        fx = q;
      }
    }
    c.index = idx;
    const a = samples[idx],
      b = samples[idx + 1];
    const px = a.position.x + (b.position.x - a.position.x) * fx,
      pz = a.position.z + (b.position.z - a.position.z) * fx;
    const dx = b.position.x - a.position.x,
      dz = b.position.z - a.position.z,
      segmentLength = Math.hypot(dx, dz),
      nx = -dz / segmentLength,
      nz = dx / segmentLength;
    const offset = (c.x - px) * nx + (c.z - pz) * nz;
    return {
      fraction: (idx + fx) / n,
      offset,
      y: a.position.y + (b.position.y - a.position.y) * fx,
      nx,
      nz,
      px,
      pz,
      yaw: Math.atan2(dx, dz),
      curvature: a.curvature,
    };
  }
  aiInput(c) {
    const look = 9 + Math.abs(c.speed) * 0.62,
      f = this.track.sampleDistance(c.progress + look);
    let lane = c.aiLane * 0.6 + Math.sin(c.progress * 0.012 + c.id) * 0.7;
    for (const o of this.cars) {
      if (o === c) continue;
      const gap = o.progress - c.progress;
      if (gap > 0 && gap < 14 && Math.abs(o.offset - lane) < 2.8)
        lane = clamp(o.offset + (c.id % 2 ? 3.2 : -3.2), -5.2, 5.2);
    }
    const dx = f.position.x + f.normal.x * lane - c.x,
      dz = f.position.z + f.normal.z * lane - c.z;
    const error = wrapAngle(Math.atan2(dx, dz) - c.yaw);
    const near = this.track.sampleDistance(c.progress + 16);
    const desired = clamp(31.5 - c.id * 0.55 - Math.abs(near.curvature) * 235, 17, 32);
    return {
      throttle: c.speed < desired ? 1 : 0.1,
      brake: c.speed > desired + 1 ? 0.55 : 0,
      steer: clamp(error * 1.65, -1, 1),
      drift: false,
    };
  }
  step(dt, input = {}) {
    if (this.state === 'results') {
      if (this.finishOrder.length < this.cars.length) {
        this.elapsed += dt;
        for (const c of this.cars) this.move(c, dt, this.aiInput(c));
      }
      return;
    }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep && n > 0 && n <= 3) {
        this.events.push({ type: 'countdown', value: n });
        this.lastBeep = n;
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.events.push({ type: 'go' });
      }
      return;
    }
    if (this.state !== 'racing') return;
    this.elapsed += dt;
    for (const c of this.cars) {
      const controls = c.id === 0 ? input : this.aiInput(c);
      this.move(c, dt, c.finished ? this.aiInput(c) : controls);
    }
    // Soft wheel-to-wheel contact gives both drivers room without launching either kart.
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i],
          b = this.cars[j],
          dx = a.x - b.x,
          dz = a.z - b.z,
          dd = dx * dx + dz * dz;
        if (dd < 5.3 && dd > 0.0001) {
          const d = Math.sqrt(dd),
            q = (2.31 - d) * 0.5,
            nx = dx / d,
            nz = dz / d;
          a.x += nx * q;
          a.z += nz * q;
          b.x -= nx * q;
          b.z -= nz * q;
          const impulse = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (impulse < 0) {
            a.vx -= nx * impulse * 0.48;
            a.vz -= nz * impulse * 0.48;
            b.vx += nx * impulse * 0.48;
            b.vz += nz * impulse * 0.48;
          }
          if ((i === 0 || j === 0) && a.wallCooldown <= 0) {
            this.events.push({ type: 'collision' });
            a.wallCooldown = 0.5;
            this.collisions++;
          }
        }
      }
    if (this.cars[0].finished) {
      this.state = 'results';
      this.events.push({ type: 'finish' });
    }
  }
  move(c, dt, input) {
    const throttle = clamp(input.throttle || 0, 0, 1),
      brake = clamp(input.brake || 0, 0, 1);
    c.steer += (clamp(input.steer || 0, -1, 1) - c.steer) * (1 - Math.exp(-dt * 9));
    c.boost = Math.max(0, c.boost - dt);
    c.padCooldown = Math.max(0, c.padCooldown - dt);
    c.wallCooldown = Math.max(0, c.wallCooldown - dt);
    c.wallContact = Math.max(0, c.wallContact - dt);
    const drifting = !!input.drift && c.speed > 10 && Math.abs(c.steer) > 0.12;
    if (drifting) {
      c.driftCharge = Math.min(2.8, c.driftCharge + dt);
    } else if (c.drifting) {
      if (c.driftCharge > 0.55) {
        c.boost = Math.max(c.boost, c.driftCharge > 1.5 ? 2.1 : 1.15);
        c.drifts++;
        if (c.id === 0) this.events.push({ type: 'boost', tier: c.driftCharge > 1.5 ? 2 : 1 });
      }
      c.driftCharge = 0;
    }
    c.drifting = drifting;
    const v = Math.hypot(c.vx, c.vz),
      maxSpeed = c.boost > 0 ? 43 : 33.5;
    let accel = throttle * (c.boost > 0 ? 22 : 13) - brake * 25 - (v > 0.1 ? 1.8 + v * 0.052 : 0);
    if (v > maxSpeed) accel -= (v - maxSpeed) * 7;
    const facingX = Math.sin(c.yaw),
      facingZ = Math.cos(c.yaw);
    const forward = c.vx * facingX + c.vz * facingZ;
    if (forward < 0) accel += 5;
    // A powered kart can steer out of contact even after a head-on stop.
    const steeringSpeed = c.wallContact > 0 && throttle > 0 && !brake ? Math.max(v, 11) : v;
    const targetAngular =
      c.steer *
      ((clamp(steeringSpeed, 0, 40) * 0.083) / (1 + steeringSpeed * 0.026)) *
      (drifting ? 1.25 : 1);
    c.angular += (targetAngular - c.angular) * (1 - Math.exp(-dt * (drifting ? 6 : 10)));
    c.yaw = wrapAngle(c.yaw + c.angular * dt);
    const dirX = Math.sin(c.yaw),
      dirZ = Math.cos(c.yaw);
    c.vx += dirX * accel * dt;
    c.vz += dirZ * accel * dt;
    const lateral = c.vx * dirZ - c.vz * dirX,
      grip = drifting ? 1.8 : 10.5;
    const gripFactor = 1 - Math.exp(-grip * dt);
    c.vx -= dirZ * lateral * gripFactor;
    c.vz += dirX * lateral * gripFactor;
    if (brake && v < 0.8 && throttle === 0) {
      c.vx = 0;
      c.vz = 0;
    }
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.slip = lateral;
    const p = this.project(c);
    c.offset = p.offset;
    c.y = p.y;
    // Match the visible barrier and account for the kart's rotated footprint.
    const innerEdge = this.track.barrierOffset - this.track.barrierHalfWidth - 0.04;
    let relativeYaw = wrapAngle(c.yaw - p.yaw);
    let limit =
      innerEdge - (1.2 * Math.abs(Math.cos(relativeYaw)) + 1.75 * Math.abs(Math.sin(relativeYaw)));
    if (Math.abs(p.offset) > limit) {
      const sign = Math.sign(p.offset);
      c.wallContact = 0.15;
      const outward = (c.vx * p.nx + c.vz * p.nz) * sign;
      if (outward > 0) {
        // Remove only velocity into the wall. Time-based drag preserves sliding
        // instead of multiplying the entire velocity down 120 times per second.
        const drag = Math.exp(-0.45 * dt);
        c.vx = (c.vx - p.nx * outward * sign) * drag;
        c.vz = (c.vz - p.nz * outward * sign) * drag;
      }
      const noseIntoWall = (Math.sin(c.yaw) * p.nx + Math.cos(c.yaw) * p.nz) * sign;
      if (c.id === 0 && v < 7.5 && throttle > 0 && !brake && noseIntoWall > 0.15) {
        // Gentle bumper deflection frees automatic-throttle players as well.
        // Preserve reverse-facing travel, but choose forward for a square hit.
        const tangentYaw = p.yaw + (Math.cos(relativeYaw) < -0.25 ? Math.PI : 0);
        c.yaw = wrapAngle(c.yaw + clamp(wrapAngle(tangentYaw - c.yaw), -1.1 * dt, 1.1 * dt));
        relativeYaw = wrapAngle(c.yaw - p.yaw);
        limit =
          innerEdge -
          (1.2 * Math.abs(Math.cos(relativeYaw)) + 1.75 * Math.abs(Math.sin(relativeYaw)));
      }
      // Correct penetration along the normal only; rebuilding from a sampled
      // center point introduced a sideways/tangential creep at every contact.
      const penetration = Math.max(0, Math.abs(p.offset) - limit);
      c.x -= p.nx * penetration * sign;
      c.z -= p.nz * penetration * sign;
      c.offset = p.offset - penetration * sign;
      if (c.wallCooldown <= 0 && outward > 2 && v > 7) {
        c.wallCooldown = 0.65;
        if (c.id === 0) {
          this.events.push({ type: 'collision' });
          this.collisions++;
        }
      }
    }
    c.speed = Math.hypot(c.vx, c.vz);
    const delta = p.fraction - c.prevFraction,
      wrapped = delta > 0.5 ? delta - 1 : delta < -0.5 ? delta + 1 : delta;
    c.progress += wrapped * this.track.length;
    c.prevFraction = p.fraction;
    c.travel += Math.abs(wrapped * this.track.length);
    // A lap requires all 12 sequential gates. Reverse driving cannot award a gate twice.
    if (!c.finished && c.progress >= (c.gate * this.track.length) / 12 && wrapped > 0) {
      c.gate++;
      if ((c.gate - 1) % 12 === 0) {
        c.lapTimes.push(this.elapsed - c.lastLap);
        c.lastLap = this.elapsed;
        const laps = (c.gate - 1) / 12;
        if (laps >= 3) {
          c.finished = true;
          c.finishTime = this.elapsed + (c.id === 0 ? this.penalty : 0);
          this.finishOrder.push(c.id);
        } else {
          c.lap = laps + 1;
          if (c.id === 0) this.events.push({ type: 'lap', lap: c.lap, time: c.lapTimes.at(-1) });
        }
      }
    }
    if (
      c.padCooldown === 0 &&
      [0.22, 0.57, 0.85].some((t) => Math.abs(p.fraction - t) < 0.004) &&
      Math.abs(p.offset) < 5.8
    ) {
      c.boost = Math.max(c.boost, 1.05);
      c.padCooldown = 2;
      if (c.id === 0) this.events.push({ type: 'pad' });
    }
  }
  order() {
    return [...this.cars].sort((a, b) =>
      a.finished && b.finished
        ? a.finishTime - b.finishTime
        : a.finished
          ? -1
          : b.finished
            ? 1
            : b.progress - a.progress,
    );
  }
  drainEvents() {
    const e = this.events.splice(0);
    return e;
  }
}
