import * as THREE from 'three';

export function createTrack() {
  const points = [
    [-55, 2, 55],
    [-95, 2.8, 8],
    [-90, 4, -60],
    [-48, 6, -100],
    [10, 8, -90],
    [62, 6, -116],
    [108, 3, -70],
    [112, 2, -5],
    [70, 2, 35],
    [50, 3, 87],
    [-10, 2, 95],
  ];
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 3000;
  const length = curve.getLength(),
    count = 900;
  const samples = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count,
      position = curve.getPointAt(t),
      tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const a = curve.getTangentAt((t - 0.002 + 1) % 1),
      b = curve.getTangentAt((t + 0.002) % 1);
    const curvature = Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z) / (0.004 * length);
    samples.push({ position, tangent, normal, yaw: Math.atan2(tangent.x, tangent.z), curvature });
  }
  function sample(t) {
    t = ((t % 1) + 1) % 1;
    const f = t * count,
      i = Math.floor(f),
      q = f - i,
      a = samples[i],
      b = samples[i + 1];
    const position = a.position.clone().lerp(b.position, q),
      tangent = a.tangent.clone().lerp(b.tangent, q).normalize();
    return {
      position,
      tangent,
      normal: new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(),
      yaw: Math.atan2(tangent.x, tangent.z),
      curvature: THREE.MathUtils.lerp(a.curvature, b.curvature, q),
    };
  }
  return {
    curve,
    length,
    width: 16,
    samples,
    count,
    sample,
    sampleDistance: (s) => sample(s / length),
  };
}
