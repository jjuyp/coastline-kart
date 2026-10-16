import * as THREE from 'three';

// All of the little mechanical details are baked into material batches. A whole
// kart is eleven draws, including its four independently animated wheels.
// The optional distant model keeps every assembly, with 70% fewer triangles.
const Y = new THREE.Vector3(0, 1, 0);
const _direction = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();
const paintedMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.36,
  metalness: 0.22,
});
const metalMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.43,
  metalness: 0.72,
});
const softMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.77,
  metalness: 0.02,
});
const driverMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.34,
  metalness: 0.09,
});
const wheelMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.66,
  metalness: 0.18,
});
const C = {
  cream: 0xfff4d6,
  ink: 0x18303b,
  dark: 0x162127,
  rubber: 0x1c2428,
  silver: 0xc7d7d5,
  teal: 0x258f8c,
  gold: 0xf4c76e,
};

function roundedBox(w, h, d, r = 0.1, lowDetail = false) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = lowDetail
    ? new THREE.BoxGeometry(w, h, d, 2, 2, 2)
    : new THREE.BoxGeometry(w, h, d, 5, 4, 5);
  const p = g.attributes.position,
    n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const cx = THREE.MathUtils.clamp(x, -w / 2 + r, w / 2 - r);
    const cy = THREE.MathUtils.clamp(y, -h / 2 + r, h / 2 - r);
    const cz = THREE.MathUtils.clamp(z, -d / 2 + r, d / 2 - r);
    _direction.set(x - cx, y - cy, z - cz).normalize();
    p.setXYZ(i, cx + _direction.x * r, cy + _direction.y * r, cz + _direction.z * r);
    n.setXYZ(i, _direction.x, _direction.y, _direction.z);
  }
  return g;
}

class Batch {
  constructor(lowDetail = false) {
    this.parts = [];
    this.lowDetail = lowDetail;
  }
  add(geometry, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    _position.set(x, y, z);
    _quaternion.setFromEuler(new THREE.Euler(rx, ry, rz));
    _matrix.compose(_position, _quaternion, _scale);
    g.applyMatrix4(_matrix);
    _color.set(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = _color.r;
      colors[i + 1] = _color.g;
      colors[i + 2] = _color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }
  box(w, h, d, color, x, y, z, r = 0.055, rx = 0, ry = 0, rz = 0) {
    this.add(roundedBox(w, h, d, r, this.lowDetail), color, x, y, z, rx, ry, rz);
  }
  rod(a, b, radius, color, segments = 8) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const g = new THREE.CylinderGeometry(
      radius,
      radius,
      start.distanceTo(end),
      this.lowDetail ? Math.min(segments, 6) : segments,
    );
    _direction.subVectors(end, start).normalize();
    _quaternion.setFromUnitVectors(Y, _direction);
    g.applyQuaternion(_quaternion);
    start.add(end).multiplyScalar(0.5);
    this.add(g, color, start.x, start.y, start.z);
  }
  tube(points, radius, color, segments = 24) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    this.add(
      new THREE.TubeGeometry(
        curve,
        this.lowDetail ? Math.max(6, Math.ceil(segments * 0.4)) : segments,
        radius,
        this.lowDetail ? 4 : 7,
        false,
      ),
      color,
    );
  }
  mesh(material, name, casts = false) {
    let count = 0;
    for (const g of this.parts) count += g.attributes.position.count;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    let offset = 0;
    for (const g of this.parts) {
      positions.set(g.attributes.position.array, offset * 3);
      normals.set(g.attributes.normal.array, offset * 3);
      colors.set(g.attributes.color.array, offset * 3);
      if (g.attributes.uv) uvs.set(g.attributes.uv.array, offset * 2);
      offset += g.attributes.position.count;
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    mesh.castShadow = casts;
    mesh.receiveShadow = false;
    return mesh;
  }
}

const wheelCache = new Map();
function wheelGeometry(width, lowDetail = false) {
  const cacheKey = `${width}:${lowDetail}`;
  if (wheelCache.has(cacheKey)) return wheelCache.get(cacheKey);
  const b = new Batch(lowDetail);
  const p = [
    [0.2, -width * 0.5],
    [0.31, -width * 0.5],
    [0.375, -width * 0.4],
    [0.4, -width * 0.2],
    [0.4, width * 0.2],
    [0.375, width * 0.4],
    [0.31, width * 0.5],
    [0.2, width * 0.5],
  ];
  b.add(
    new THREE.LatheGeometry(
      p.map(([r, y]) => new THREE.Vector2(r, y)),
      lowDetail ? 12 : 28,
    ),
    C.rubber,
    0,
    0,
    0,
    0,
    0,
    Math.PI / 2,
  );
  const treadCount = lowDetail ? 8 : 24;
  for (let i = 0; i < treadCount; i++) {
    const a = (i / treadCount) * Math.PI * 2;
    b.add(
      new THREE.BoxGeometry(width * 0.78, 0.011, 0.027),
      i % 3 ? 0x252e31 : 0x30383a,
      0,
      Math.cos(a) * 0.399,
      Math.sin(a) * 0.399,
      a,
    );
  }
  b.add(
    new THREE.CylinderGeometry(0.252, 0.252, width + 0.008, lowDetail ? 12 : 20),
    C.silver,
    0,
    0,
    0,
    0,
    0,
    Math.PI / 2,
  );
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.009);
    b.add(
      new THREE.CylinderGeometry(0.205, 0.205, 0.012, lowDetail ? 10 : 20),
      C.ink,
      x,
      0,
      0,
      0,
      0,
      Math.PI / 2,
    );
    b.add(
      new THREE.TorusGeometry(0.242, 0.017, lowDetail ? 4 : 6, lowDetail ? 12 : 24),
      0xe5e7d8,
      x,
      0,
      0,
      0,
      Math.PI / 2,
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(
        new THREE.BoxGeometry(0.023, 0.19, 0.04),
        C.silver,
        x + side * 0.012,
        Math.cos(a) * 0.105,
        Math.sin(a) * 0.105,
        a,
      );
    }
    b.add(
      new THREE.CylinderGeometry(0.075, 0.075, 0.03, lowDetail ? 8 : 12),
      C.gold,
      x + side * 0.021,
      0,
      0,
      0,
      0,
      Math.PI / 2,
    );
    b.add(
      new THREE.CylinderGeometry(0.025, 0.025, 0.034, 6),
      C.ink,
      x + side * 0.026,
      0,
      0,
      0,
      0,
      Math.PI / 2,
    );
  }
  const mesh = b.mesh(wheelMaterial, 'wheel-geometry');
  const g = mesh.geometry;
  wheelCache.set(cacheKey, g);
  return g;
}

let shadowTexture;
function contactShadow() {
  if (!shadowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(14,33,39,.75)');
    gradient.addColorStop(0.45, 'rgba(14,33,39,.42)');
    gradient.addColorStop(1, 'rgba(14,33,39,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.15, 4.05),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.61,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  shadow.name = 'soft-contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  shadow.renderOrder = 1;
  return shadow;
}

function numberDecals(number, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff3d7';
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 244, 48);
  ctx.fill();
  ctx.strokeStyle = '#18303b';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#18303b';
  ctx.font = '900 176px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(number).padStart(2, '0'), 256, 179);
  ctx.font = 'bold 24px Arial';
  ctx.fillText('COASTLINE CUP', 256, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.2,
    roughness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const parts = [];
  const top = new THREE.PlaneGeometry(0.59, 0.3);
  top.rotateX(-Math.PI / 2);
  top.translate(0, 0.855, 1.03);
  parts.push(top);
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.5, 0.25);
    g.rotateY((side * Math.PI) / 2);
    g.translate(side * 0.987, 0.53, -0.31);
    parts.push(g);
  }
  let offset = 0;
  const positions = new Float32Array(18 * 3),
    normals = new Float32Array(18 * 3),
    uvs = new Float32Array(18 * 2);
  for (const original of parts) {
    const g = original.toNonIndexed();
    positions.set(g.attributes.position.array, offset * 3);
    normals.set(g.attributes.normal.array, offset * 3);
    uvs.set(g.attributes.uv.array, offset * 2);
    offset += g.attributes.position.count;
    g.dispose();
    original.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'race-number-livery';
  return mesh;
}

function helmetPatch(r, minLat, maxLat, minYaw, maxYaw, lowDetail = false) {
  const positions = [],
    normals = [],
    uv = [];
  const rows = lowDetail ? 2 : 4,
    cols = lowDetail ? 10 : 18;
  function vertex(row, col) {
    const lat = THREE.MathUtils.lerp(minLat, maxLat, row / rows),
      yaw = THREE.MathUtils.lerp(minYaw, maxYaw, col / cols);
    const x = Math.sin(yaw) * Math.cos(lat),
      y = Math.sin(lat),
      z = Math.cos(yaw) * Math.cos(lat);
    positions.push(x * r, y * r, z * r);
    normals.push(x, y, z);
    uv.push(col / cols, row / rows);
  }
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      vertex(row, col);
      vertex(row, col + 1);
      vertex(row + 1, col + 1);
      vertex(row, col);
      vertex(row + 1, col + 1);
      vertex(row + 1, col);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function createKart(color = 0xff684c, number = 1, options = {}) {
  const lowDetail = Boolean(options.lowDetail);
  const group = new THREE.Group();
  group.name = `coastline-kart-${number}`;
  group.userData.lowDetail = lowDetail;
  const body = new THREE.Group();
  body.name = 'sprung-body';
  group.add(body);
  const paint = new Batch(lowDetail),
    metal = new Batch(lowDetail),
    soft = new Batch(lowDetail);
  paint.box(0.88, 0.46, 1.22, color, 0, 0.61, 0.86, 0.18, 0.035);
  paint.box(1.24, 0.2, 0.35, color, 0, 0.46, 1.4, 0.09);
  paint.box(0.18, 0.016, 0.96, C.cream, 0, 0.848, 0.83, 0.007);
  paint.box(0.18, 0.24, 0.016, C.cream, 0, 0.59, 1.478, 0.007);
  for (const side of [-1, 1]) {
    paint.box(0.39, 0.37, 1.62, color, side * 0.79, 0.48, -0.31, 0.13);
    paint.box(0.28, 0.018, 1.14, C.cream, side * 0.79, 0.674, -0.34, 0.008);
    paint.box(0.043, 0.032, 1.3, C.gold, side * 0.979, 0.38, -0.35, 0.015);
    paint.box(0.1, 0.025, 0.37, C.teal, side * 0.79, 0.693, -0.88, 0.01);
    metal.tube(
      [
        [side * 0.57, 0.27, 1.25],
        [side * 0.73, 0.27, 0.55],
        [side * 0.73, 0.27, -0.8],
        [side * 0.51, 0.31, -1.36],
      ],
      0.047,
      C.dark,
    );
    metal.rod([side * 0.4, 0.35, -1.1], [side * 0.91, 0.4, -1.03], 0.033, C.silver);
    metal.rod([side * 0.24, 0.38, 0.75], [side * 0.93, 0.4, 0.93], 0.035, C.silver);
    metal.rod([side * 0.4, 0.3, -1.38], [side * 0.5, 0.89, -1.4], 0.028, C.ink);
  }
  metal.tube(
    [
      [-0.72, 0.37, 1.35],
      [-0.83, 0.36, 1.6],
      [-0.58, 0.35, 1.7],
      [0.58, 0.35, 1.7],
      [0.83, 0.36, 1.6],
      [0.72, 0.37, 1.35],
    ],
    0.05,
    C.silver,
    30,
  );
  metal.tube(
    [
      [-0.9, 0.33, -1.15],
      [-0.84, 0.33, -1.53],
      [0.84, 0.33, -1.53],
      [0.9, 0.33, -1.15],
    ],
    0.045,
    C.dark,
    20,
  );
  metal.rod([-0.97, 0.4, -1.03], [0.97, 0.4, -1.03], 0.053, C.silver);
  metal.rod([0, 0.31, 0.68], [0, 0.94, 0.41], 0.034, C.silver);
  paint.box(1.7, 0.12, 0.3, color, 0, 0.93, -1.39, 0.05, -0.09);
  paint.box(0.32, 0.017, 0.26, C.cream, 0, 0.999, -1.39, 0.006);
  for (const side of [-1, 1]) paint.box(0.055, 0.24, 0.32, color, side * 0.83, 0.98, -1.39, 0.025);
  // Rear-mounted engine: stacked cooling fins, brass carburettor, pipework.
  metal.box(0.4, 0.31, 0.46, C.ink, 0.41, 0.62, -0.96, 0.05);
  for (let i = 0; i < 7; i++)
    metal.box(0.44, 0.022, 0.46, i % 2 ? 0x758e94 : C.silver, 0.41, 0.55 + i * 0.039, -0.96, 0.008);
  metal.add(
    new THREE.CylinderGeometry(0.13, 0.13, 0.12, lowDetail ? 8 : 14),
    C.gold,
    0.4,
    0.87,
    -0.96,
  );
  metal.tube(
    [
      [0.57, 0.73, -1.12],
      [0.65, 0.61, -1.33],
      [0.3, 0.47, -1.39],
      [-0.46, 0.46, -1.37],
    ],
    0.05,
    C.silver,
  );
  metal.add(
    new THREE.CylinderGeometry(0.1, 0.12, 0.52, lowDetail ? 8 : 12),
    0x778d94,
    -0.44,
    0.46,
    -1.27,
    Math.PI / 2,
  );
  metal.add(
    new THREE.CylinderGeometry(0.067, 0.067, 0.025, lowDetail ? 8 : 12),
    0x111a20,
    -0.44,
    0.46,
    -1.545,
    Math.PI / 2,
  );
  metal.box(0.15, 0.26, 0.42, C.dark, 0.67, 0.54, -0.92, 0.025);
  for (let i = 0; i < 5; i++)
    metal.box(0.012, 0.02, 0.32, 0x859b9e, 0.754, 0.45 + i * 0.044, -0.92, 0.005);
  // Sculpted bucket seat, stitched cream inset, footwell and belt.
  soft.box(0.66, 0.16, 0.65, C.ink, 0, 0.48, -0.27, 0.1);
  soft.box(0.61, 0.57, 0.17, C.ink, 0, 0.72, -0.59, 0.095, -0.16);
  soft.box(0.44, 0.42, 0.022, 0x38636a, 0, 0.75, -0.482, 0.04, -0.16);
  soft.box(0.9, 0.055, 0.96, 0x263c42, 0, 0.29, 0.3, 0.035);
  soft.box(0.46, 0.04, 0.16, 0x0b1d24, 0, 0.68, -0.26, 0.018);
  for (const side of [-1, 1])
    metal.box(0.09, 0.028, 0.23, C.silver, side * 0.19, 0.36, 0.6, 0.009, -0.18);
  body.add(paint.mesh(paintedMaterial, 'paint-and-livery', true));
  body.add(metal.mesh(metalMaterial, 'chassis-and-engine'));
  body.add(soft.mesh(softMaterial, 'seat-and-footwell'));
  body.add(numberDecals(number, color));

  const driver = new THREE.Group();
  driver.name = 'racing-driver';
  body.add(driver);
  const rider = new Batch(lowDetail);
  rider.box(0.46, 0.53, 0.34, C.teal, 0, 0.94, -0.25, 0.16, 0.16);
  rider.box(0.12, 0.4, 0.025, C.cream, 0, 0.97, -0.043, 0.008, 0.16);
  rider.box(0.31, 0.17, 0.36, C.ink, 0, 0.66, -0.18, 0.07);
  for (const side of [-1, 1]) {
    rider.rod([side * 0.24, 1.1, -0.24], [side * 0.35, 0.93, 0.01], 0.1, C.teal, 10);
    rider.rod([side * 0.35, 0.93, 0.01], [side * 0.195, 0.96, 0.42], 0.078, C.cream, 10);
    rider.add(
      new THREE.SphereGeometry(0.09, lowDetail ? 6 : 10, lowDetail ? 4 : 8),
      C.ink,
      side * 0.195,
      0.96,
      0.42,
    );
    rider.rod([side * 0.13, 0.67, -0.02], [side * 0.19, 0.49, 0.46], 0.105, C.teal, 10);
    rider.box(0.17, 0.1, 0.3, C.cream, side * 0.19, 0.44, 0.55, 0.045);
    rider.add(
      new THREE.SphereGeometry(0.1, lowDetail ? 6 : 12, lowDetail ? 4 : 8),
      C.cream,
      side * 0.24,
      1.115,
      -0.23,
    );
  }
  rider.add(
    new THREE.SphereGeometry(0.335, lowDetail ? 12 : 24, lowDetail ? 8 : 18),
    C.cream,
    0,
    1.48,
    -0.25,
  );
  rider.add(helmetPatch(0.342, -0.1, 0.4, -1.1, 1.1, lowDetail), 0x173d4a, 0, 1.48, -0.25);
  rider.add(helmetPatch(0.345, 0.34, 0.38, -0.87, 0.87, lowDetail), 0xa9d3d3, 0, 1.48, -0.25);
  rider.box(0.33, 0.1, 0.2, color, 0, 1.265, -0.006, 0.045);
  // Narrow painted stripe running from the brow over the crown.
  rider.tube(
    [
      [0, 1.6, 0.065],
      [0, 1.76, -0.08],
      [0, 1.818, -0.27],
      [0, 1.73, -0.47],
      [0, 1.51, -0.585],
    ],
    0.033,
    color,
    22,
  );
  for (const side of [-1, 1])
    rider.add(
      new THREE.CylinderGeometry(0.048, 0.048, 0.021, lowDetail ? 6 : 10),
      C.gold,
      side * 0.32,
      1.49,
      -0.25,
      0,
      0,
      Math.PI / 2,
    );
  driver.add(rider.mesh(driverMaterial, 'driver-suit-helmet-and-gloves'));

  const steering = new THREE.Group();
  steering.name = 'steering-wheel';
  steering.position.set(0, 0.94, 0.43);
  steering.rotation.x = -0.42;
  body.add(steering);
  const wheel = new Batch(lowDetail);
  wheel.add(new THREE.TorusGeometry(0.221, 0.028, lowDetail ? 4 : 7, lowDetail ? 12 : 24), C.ink);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    wheel.rod(
      [Math.sin(a) * 0.06, Math.cos(a) * 0.06, 0],
      [Math.sin(a) * 0.197, Math.cos(a) * 0.197, 0],
      0.018,
      C.silver,
    );
  }
  wheel.add(
    new THREE.CylinderGeometry(0.064, 0.064, 0.035, lowDetail ? 8 : 12),
    color,
    0,
    0,
    0,
    Math.PI / 2,
  );
  steering.add(wheel.mesh(driverMaterial, 'steering-ring-and-spokes'));

  const wheels = [],
    frontWheels = [];
  for (const z of [0.96, -1.03])
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = z > 0 ? 'front-steering-pivot' : 'rear-axle-pivot';
      pivot.position.set(side * (z > 0 ? 0.94 : 0.96), 0.405, z);
      group.add(pivot);
      const spin = new THREE.Mesh(wheelGeometry(z > 0 ? 0.29 : 0.37, lowDetail), wheelMaterial);
      spin.name = 'spinning-tire-and-rim';
      pivot.add(spin);
      wheels.push(spin);
      if (z > 0) frontWheels.push(pivot);
    }
  group.add(contactShadow());
  let spinAngle = 0,
    lean = 0;
  return {
    group,
    wheels,
    frontWheels,
    driver,
    update(dt, state = {}) {
      const speed = state.speed || 0,
        steer = state.steer || 0,
        time = state.time || 0;
      spinAngle = (spinAngle + (speed * dt) / 0.4) % (Math.PI * 2);
      for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x = spinAngle;
      for (let i = 0; i < frontWheels.length; i++) frontWheels[i].rotation.y = steer * 0.48;
      steering.rotation.z = -steer * 0.65;
      lean = THREE.MathUtils.damp(lean, -steer * Math.min(Math.abs(speed) / 23, 1) * 0.055, 10, dt);
      body.rotation.z = lean;
      body.position.y = Math.sin(time * 19) * Math.min(Math.abs(speed) * 0.0004, 0.009);
      driver.rotation.z = -lean * 0.7;
      driver.rotation.y = THREE.MathUtils.damp(
        driver.rotation.y,
        steer * (state.drift ? 0.1 : 0.035),
        7,
        dt,
      );
    },
  };
}
