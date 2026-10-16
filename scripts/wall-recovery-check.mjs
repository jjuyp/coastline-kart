import { createTrack } from '../src/track.js';
import { Race, wrapAngle } from '../src/race.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const baseline = process.argv.includes('--baseline');
const RaceClass = baseline ? (await import('../output/race-before-wall-fix.mjs')).Race : Race;
const track = createTrack();
const results = [];
function fixture(fraction, side, degrees, speed = 0, lane = 8.65) {
  const race = new RaceClass(track);
  race.start();
  race.state = 'racing';
  const car = race.cars[0],
    s = fraction * track.length,
    frame = track.sampleDistance(s);
  Object.assign(car, {
    x: frame.position.x + frame.normal.x * lane * side,
    z: frame.position.z + frame.normal.z * lane * side,
    yaw: frame.yaw - (side * degrees * Math.PI) / 180,
    index: Math.floor(fraction * track.count),
    prevFraction: fraction,
    progress: s,
    gate: Math.floor(fraction * 12) + 1,
  });
  car.vx = Math.sin(car.yaw) * speed;
  car.vz = Math.cos(car.yaw) * speed;
  car.speed = speed;
  return { race, car, s };
}
function run(label, fixture, seconds, controls) {
  const { race, car, s } = fixture;
  const gate = car.gate;
  let inside = true;
  for (let i = 0; i < seconds * 120; i++) {
    race.elapsed += 1 / 120;
    race.move(car, 1 / 120, typeof controls === 'function' ? controls(i / 120) : controls);
    const frame = race.project(car),
      relative = wrapAngle(car.yaw - frame.yaw);
    const extent = 1.2 * Math.abs(Math.cos(relative)) + 1.75 * Math.abs(Math.sin(relative));
    inside &&= Math.abs(frame.offset) + extent <= 9.85 + 0.08;
  }
  const report = {
    label,
    speed: car.speed,
    forwardMetres: car.progress - s,
    offset: race.project(car).offset,
    penalty: race.penalty,
    gates: car.gate - gate,
    insideBarrier: inside,
  };
  results.push(report);
  return report;
}
for (const side of [-1, 1]) {
  for (const fraction of [0.08, 0.31, 0.58, 0.8]) {
    for (const degrees of [25, 60, 90]) {
      const placed = fixture(fraction, side, degrees);
      const report = run(
        `head-on recovery side=${side} sector=${fraction} angle=${degrees}`,
        placed,
        5,
        () =>
          side * placed.car.offset > 7.1
            ? { throttle: 1, steer: side * 0.8 }
            : placed.race.aiInput(placed.car),
      );
      if (!baseline) {
        assert(report.forwardMetres > 8 && report.speed > 5, JSON.stringify(report));
        assert(report.insideBarrier && report.penalty === 0, JSON.stringify(report));
      }
    }
  }
  const passive = run(`automatic throttle unpins side=${side}`, fixture(0.3, side, 90), 5, {
    throttle: 1,
  });
  if (!baseline)
    assert(
      passive.forwardMetres > 6 && passive.speed > 4 && passive.penalty === 0,
      JSON.stringify(passive),
    );
  const graze = run(
    `glancing impact preserves slide side=${side}`,
    fixture(0.15, side, 12, 24),
    0.6,
    { throttle: 1 },
  );
  if (!baseline)
    assert(
      graze.forwardMetres > 8 && graze.speed > 8 && graze.insideBarrier,
      JSON.stringify(graze),
    );
  const stopped = fixture(0.3, side, 90);
  const initial = { x: stopped.car.x, z: stopped.car.z, yaw: stopped.car.yaw };
  run(`braking stays still side=${side}`, stopped, 2, { brake: 1 });
  if (!baseline) {
    assert.equal(stopped.car.speed, 0);
    assert(Math.abs(wrapAngle(stopped.car.yaw - initial.yaw)) < 1e-9);
    assert(
      Math.hypot(stopped.car.x - initial.x, stopped.car.z - initial.z) < 1,
      'no powered recovery while braking',
    );
  }
  const shoulder = run(
    `visible shoulder remains driveable side=${side}`,
    fixture(0.15, side, 0, 0, 7.8),
    1 / 120,
    {},
  );
  if (!baseline)
    assert(Math.abs(shoulder.offset) > 7.5, 'invisible wall still clamps at road edge');
}
mkdirSync('output', { recursive: true });
const report = { pass: !baseline, baseline, cases: results.length, results };
writeFileSync(
  `output/wall-${baseline ? 'before' : 'after'}-report.json`,
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      pass: report.pass,
      baseline,
      cases: results.length,
      minimumRecoverySpeed: Math.min(
        ...results.filter((r) => r.label.startsWith('head-on')).map((r) => r.speed),
      ),
      passive: results.filter((r) => r.label.startsWith('automatic')),
      grazing: results.filter((r) => r.label.startsWith('glancing')),
    },
    null,
    2,
  ),
);
