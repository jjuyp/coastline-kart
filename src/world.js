import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Hand-built, batched Mediterranean circuit. No fetched artwork or models. */
export function createWorld(scene, track) {
  const root = new THREE.Group();
  root.name = 'Tangerine Coast · procedural environment';
  scene.add(root);
  let seed = 17131;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + (b - a) * random();
  const batches = new Map();
  const cellSize = 64;
  let batchScope = '';
  const textures = [];
  const seaColor = scene.fog?.color?.clone() || new THREE.Color('#b8dbd9');
  const materials = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
    stucco: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }),
    leaves: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      side: THREE.DoubleSide,
    }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.39, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.32 }),
    fabric: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    sand: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const unitRock = new THREE.DodecahedronGeometry(1, 0);
  const unitBall = new THREE.IcosahedronGeometry(1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const v = new THREE.Vector3();
  function transform(pos = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    quat.setFromEuler(euler.set(...rotation));
    return mat.compose(v.set(...pos), quat, new THREE.Vector3(...scale)).clone();
  }
  function put(geometry, color, matrix, key = 'matte') {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix || new THREE.Matrix4());
    if (key !== 'paving' && key !== 'garden') g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    function append(part, x, z) {
      const cellX = Math.floor(x / cellSize),
        cellZ = Math.floor(z / cellSize);
      const id = `${batchScope}${key}:${cellX},${cellZ}`;
      if (!batches.has(id))
        batches.set(id, { key, scope: batchScope, cellX, cellZ, geometries: [] });
      batches.get(id).geometries.push(part);
    }
    g.computeBoundingBox();
    const bounds = g.boundingBox;
    if (bounds.max.x - bounds.min.x <= cellSize && bounds.max.z - bounds.min.z <= cellSize) {
      append(g, (bounds.min.x + bounds.max.x) * 0.5, (bounds.min.z + bounds.max.z) * 0.5);
    } else {
      // Road berms span the whole circuit. Partition their triangles as well,
      // rather than giving one nominal cell a circuit-sized bounding sphere.
      const pieces = new Map();
      const positions = g.getAttribute('position').array,
        normals = g.getAttribute('normal').array;
      const uv = g.getAttribute('uv')?.array;
      for (let offset = 0; offset < positions.length; offset += 9) {
        const x = (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3;
        const z = (positions[offset + 2] + positions[offset + 5] + positions[offset + 8]) / 3;
        const id = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
        if (!pieces.has(id)) pieces.set(id, { x, z, p: [], n: [], c: [], u: [] });
        const piece = pieces.get(id);
        for (let j = 0; j < 9; j++) {
          piece.p.push(positions[offset + j]);
          piece.n.push(normals[offset + j]);
          piece.c.push(colors[offset + j]);
        }
        if (uv) for (let j = 0; j < 6; j++) piece.u.push(uv[(offset / 3) * 2 + j]);
      }
      for (const piece of pieces.values()) {
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', new THREE.Float32BufferAttribute(piece.p, 3));
        part.setAttribute('normal', new THREE.Float32BufferAttribute(piece.n, 3));
        part.setAttribute('color', new THREE.Float32BufferAttribute(piece.c, 3));
        if (uv) part.setAttribute('uv', new THREE.Float32BufferAttribute(piece.u, 2));
        append(part, piece.x, piece.z);
      }
      g.dispose();
    }
  }
  function box(pos, scale, color, yaw = 0, key = 'matte') {
    put(unitBox, color, transform(pos, scale, [0, yaw, 0]), key);
  }
  function cylinder(pos, radius, height, color, key = 'matte', yaw = 0) {
    put(unitCylinder, color, transform(pos, [radius, height, radius], [0, yaw, 0]), key);
  }
  function rod(a, b, radius, color, key = 'matte') {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const q = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
    put(
      unitCylinder,
      color,
      new THREE.Matrix4().compose(
        start.add(end).multiplyScalar(0.5),
        q,
        new THREE.Vector3(radius, delta.length(), radius),
      ),
      key,
    );
  }
  function localBuilder(origin, yaw = 0) {
    const base = transform(origin, [1, 1, 1], [0, yaw, 0]);
    return (geometry, color, pos, scale = [1, 1, 1], rotation = [0, 0, 0], key = 'matte') =>
      put(geometry, color, base.clone().multiply(transform(pos, scale, rotation)), key);
  }
  function makeGeometry(positions, indices = null, uvs = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (indices) g.setIndex(indices);
    if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }
  function mesh(geometry, material, name, shadows = false) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.receiveShadow = true;
    m.castShadow = shadows;
    root.add(m);
    return m;
  }
  function canvasTexture(w, h, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  }
  const asphalt = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3b4850';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12500; i++) {
      const n = 40 + random() * 80;
      ctx.fillStyle = `rgba(${n},${n + 9},${n + 14},${range(0.08, 0.22)})`;
      ctx.fillRect(random() * w, random() * h, range(0.5, 1.8), range(0.5, 1.5));
    }
    ctx.strokeStyle = 'rgba(15,25,30,.04)';
    ctx.lineWidth = 14;
    for (const x of [64, 192]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.anisotropy = 4;
  const roadMaterial = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.91 });
  const landscapeSeed = seed;
  const pavingTexture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b6ab88';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 8; col++) {
        const offset = (row % 2) * 16,
          light = 78 + random() * 7;
        ctx.fillStyle = `hsl(42,30%,${light}%)`;
        ctx.fillRect(col * 32 + offset + 0.7, row * 32 + 0.7, 30.6, 30.6);
        ctx.fillStyle = 'rgba(255,248,221,.18)';
        ctx.fillRect(col * 32 + offset + 2, row * 32 + 2, 27, 1.3);
      }
    for (let i = 0; i < 1700; i++) {
      ctx.fillStyle = 'rgba(117,105,75,.07)';
      ctx.fillRect(random() * w, random() * h, 1, 1);
    }
  });
  const gardenTexture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a4b779';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(99,139,74,.18)' : 'rgba(218,211,153,.24)';
      ctx.fillRect(random() * w, random() * h, range(1, 3), range(1, 4));
    }
  });
  seed = landscapeSeed;
  for (const texture of [pavingTexture, gardenTexture]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  materials.paving = new THREE.MeshStandardMaterial({
    map: pavingTexture,
    vertexColors: true,
    roughness: 0.96,
  });
  materials.garden = new THREE.MeshStandardMaterial({
    map: gardenTexture,
    vertexColors: true,
    roughness: 1,
  });
  const roadSegments = Math.max(560, Math.ceil(track.length / 1.6));
  function strip(a, b, height = 0, segments = roadSegments, start = 0, end = 1, uvScale = 1) {
    const p = [],
      indices = [],
      uv = [];
    for (let i = 0; i <= segments; i++) {
      const t = start + ((end - start) * i) / segments;
      const f = track.sample(t);
      for (const offset of [a, b]) {
        const point = f.position.clone().addScaledVector(f.normal, offset);
        p.push(point.x, point.y + height, point.z);
        uv.push((offset + 8) / 16, (t * track.length) / uvScale);
      }
      if (i < segments) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    return makeGeometry(p, indices, uv);
  }
  mesh(strip(-8, 8, 0.015, roadSegments, 0, 1, 14), roadMaterial, 'Continuous fine-grain asphalt');
  const edge = new THREE.MeshStandardMaterial({ color: '#fff1cd', roughness: 0.85 });
  mesh(strip(-7.66, -7.48, 0.034), edge, 'Paint · outer line');
  mesh(strip(7.48, 7.66, 0.034), edge, 'Paint · inner line');
  // A continuous shoulder and side slopes hold the elevated tarmac naturally.
  for (const side of [-1, 1]) {
    const shoulder = strip(side > 0 ? 8 : -11.7, side > 0 ? 11.7 : -8, -0.055);
    put(shoulder, '#d6c69c', null, 'sand');
    shoulder.dispose();
    const p = [],
      ix = [];
    for (let i = 0; i <= roadSegments; i++) {
      const f = track.sample(i / roadSegments);
      for (const [off, yy] of [
        [11.7 * side, f.position.y - 0.05],
        [18 * side, -0.18],
      ]) {
        p.push(f.position.x + f.normal.x * off, yy, f.position.z + f.normal.z * off);
      }
      if (i < roadSegments) {
        const k = i * 2;
        if (side > 0) ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        else ix.push(k + 1, k, k + 2, k + 3, k + 1, k + 2);
      }
    }
    const slope = makeGeometry(p, ix);
    put(slope, '#c6b78e', null, 'sand');
    slope.dispose();
  }
  const curbCount = Math.ceil(track.length / 3.25);
  for (let i = 0; i < curbCount; i++) {
    for (const side of [-1, 1]) {
      const g = strip(
        side > 0 ? 8.05 : -9.08,
        side > 0 ? 9.08 : -8.05,
        0.065,
        3,
        i / curbCount,
        (i + 1) / curbCount,
      );
      put(g, i % 2 ? '#f5edda' : '#e6604c');
      g.dispose();
    }
  }
  const roadFrames = Array.from({ length: 260 }, (_, i) => track.sample(i / 260).position);
  function roadDistance(x, z) {
    let distance = Infinity;
    for (const p of roadFrames) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < distance) distance = d;
    }
    return Math.sqrt(distance);
  }
  function safe(x, z, margin = 17) {
    return roadDistance(x, z) > margin;
  }
  function islandRadius(angle) {
    return 155 + 8 * Math.sin(angle * 3 + 0.4) + 9 * Math.cos(angle * 5 - 0.3);
  }
  const islandP = [],
    islandC = [],
    islandI = [];
  const ringN = 192,
    rings = [0, 0.55, 0.76, 0.84, 0.91, 1, 1.035];
  const heights = [-0.18, -0.18, -0.17, -0.3, -0.65, -2.7, -4.2];
  const ringColors = ['#c8c398', '#c7c28e', '#cec599', '#ead6a3', '#f5e2ad', '#d2c992', '#6cc5bc'];
  for (let r = 0; r < rings.length; r++) {
    const color = new THREE.Color(ringColors[r]);
    for (let i = 0; i <= ringN; i++) {
      const angle = (i / ringN) * Math.PI * 2,
        radius = islandRadius(angle) * rings[r];
      islandP.push(6 + Math.cos(angle) * radius, heights[r], -7 + Math.sin(angle) * radius);
      const noise = r > 1 ? range(0.96, 1.04) : 1;
      islandC.push(color.r * noise, color.g * noise, color.b * noise);
      if (r && i < ringN) {
        const k = r * (ringN + 1) + i;
        islandI.push(k, k - ringN - 1, k + 1, k + 1, k - ringN - 1, k - ringN);
      }
    }
  }
  const island = makeGeometry(islandP, islandI);
  island.setAttribute('color', new THREE.Float32BufferAttribute(islandC, 3));
  mesh(island, materials.sand, 'Sunbleached island and pale sand beaches');
  const waterGeometry = new THREE.PlaneGeometry(1800, 1800, 80, 80);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, fogColor: { value: seaColor } },
    vertexShader: `varying vec3 worldP; uniform float time;
      void main(){vec3 p=position;p.y+=sin(p.x*.047+time*.55)*.16+sin(p.z*.063-time*.39)*.12;
      vec4 w=modelMatrix*vec4(p,1.);worldP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `precision highp float; varying vec3 worldP; uniform float time;uniform vec3 fogColor;
      void main(){vec2 p=worldP.xz;float d=length((p-vec2(6.,-7.))/vec2(1.,1.));
      float wave=sin(p.x*.37+p.y*.17+time*.7)+sin(p.y*.51-p.x*.12-time*.49);
      float glint=pow(max(0.,sin(p.x*.24+p.y*.36+wave*.34+time*.32)),24.);
      vec3 c=mix(vec3(.10,.68,.70),vec3(.055,.39,.57),smoothstep(150.,390.,d));
      c+=vec3(.09,.12,.1)*glint*.5;c+=vec3(.012,.022,.02)*wave;
      float horizon=smoothstep(230.,780.,distance(cameraPosition,worldP));
      gl_FragColor=vec4(mix(c,fogColor,horizon),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const sea = mesh(waterGeometry, waterMaterial, 'Animated turquoise water');
  sea.position.y = -2.65;
  sea.receiveShadow = false;
  // The white shoreline is deliberately broken into little foam scallops.
  const foamP = [],
    foamI = [];
  for (let i = 0; i < 190; i++) {
    const a = (i / 190) * Math.PI * 2,
      b = ((i + 0.84) / 190) * Math.PI * 2;
    const k = foamP.length / 3;
    for (const [angle, factor] of [
      [a, 0.995],
      [a, 1.012],
      [b, 0.995],
      [b, 1.012],
    ]) {
      foamP.push(
        6 + Math.cos(angle) * islandRadius(angle) * factor,
        -2.39,
        -7 + Math.sin(angle) * islandRadius(angle) * factor,
      );
    }
    foamI.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  mesh(
    makeGeometry(foamP, foamI),
    new THREE.MeshBasicMaterial({
      color: '#e8f8e2',
      transparent: true,
      opacity: 0.53,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    'Foam lace around the island',
  );

  // Sculpted Jersey barriers: bevels read well from the chase camera.
  const barrier = makeGeometry(
    [
      -0.55, 0, -1.4, 0.55, 0, -1.4, -0.26, 0.9, -1.4, 0.26, 0.9, -1.4, -0.55, 0, 1.4, 0.55, 0, 1.4,
      -0.26, 0.9, 1.4, 0.26, 0.9, 1.4,
    ],
    [
      0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5, 2, 6, 3, 3, 6, 7, 0,
      1, 4, 1, 5, 4,
    ],
  );
  const barrierCount = Math.ceil(track.length / 3.05);
  for (let i = 0; i < barrierCount; i++) {
    const t = i / barrierCount,
      f = track.sample(t);
    for (const side of [-1, 1]) {
      // Open the start apron and alternate open coastal guardrail sections.
      if (t > 0.96 && side > 0) continue;
      const p = f.position.clone().addScaledVector(f.normal, side * track.barrierOffset);
      const color = Math.floor(i / 4) % 5 === 0 ? '#269eaa' : i % 8 < 4 ? '#f1e9cf' : '#e96b4d';
      put(barrier, color, transform([p.x, p.y - 0.08, p.z], [1, 1, 0.98], [0, f.yaw, 0]));
    }
  }
  // Fine transverse grid hatching and checkerboard finish.
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 16; col++) {
      const g = strip(
        -8 + col,
        -7 + col,
        0.054,
        2,
        (row * 1.05) / track.length,
        ((row + 1) * 1.05) / track.length,
      );
      put(g, (row + col) % 2 ? '#fff5d8' : '#202d37');
      g.dispose();
    }
  for (let i = 0; i < 6; i++) {
    const t = 1 - (7 + i * 4.2) / track.length,
      f = track.sample(t);
    const side = i % 2 ? 1 : -1;
    const g = strip(side * 3.2 - 1.4, side * 3.2 + 1.4, 0.057, 1, t, t + 0.14 / track.length);
    put(g, '#e8e4cc');
    g.dispose();
    for (const edgeOff of [-1.4, 1.4]) {
      const h = strip(
        side * 3.2 + edgeOff - 0.065,
        side * 3.2 + edgeOff + 0.065,
        0.058,
        2,
        t,
        t + 2.6 / track.length,
      );
      put(h, '#e8e4cc');
      h.dispose();
    }
  }
  // Speed pads match the gameplay trigger fractions in main.js.
  for (const t of [0.22, 0.57, 0.85]) {
    const g = strip(-4.6, 4.6, 0.061, 7, t - 3.2 / track.length, t + 3.2 / track.length);
    put(g, '#258f99');
    g.dispose();
    const f = track.sample(t);
    const base = transform(f.position.toArray(), [1, 1, 1], [0, f.yaw, 0]);
    for (const z of [-1.8, 0.1, 2])
      for (const side of [-1, 1]) {
        const arrow = makeGeometry(
          [
            0,
            0.077,
            z + 1.3,
            side * 3.5,
            0.077,
            z - 0.3,
            side * 3.5,
            0.077,
            z - 1.1,
            0,
            0.077,
            z + 0.5,
          ],
          [0, 1, 2, 0, 2, 3],
        );
        put(arrow, '#fff0ac', base);
        arrow.dispose();
      }
  }

  const signRows = [
    ['COASTLINE CUP', '#fff3d2', '#143e48'],
    ['TANGERINE COAST', '#ed744b', '#fff4d6'],
    ['SUNLINE  /  RACING', '#146c79', '#f7ead1'],
    ['CHASE THE SUN', '#f4db9b', '#224b50'],
    ['COAST • RACE • REPEAT', '#ed744b', '#fff5d8'],
    ['APEX  /  COASTLINE', '#123f49', '#f8e7bb'],
    ['TANGERINE  /  2026', '#f8eccb', '#ce603e'],
    ['COASTLINE CUP', '#0c6776', '#fff3d2'],
  ];
  const signAtlas = canvasTexture(1024, 1024, (ctx, w, h) => {
    for (let i = 0; i < signRows.length; i++) {
      const [text, background, ink] = signRows[i];
      const y = i * 128;
      ctx.fillStyle = background;
      ctx.fillRect(0, y, w, 128);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(60, y + 64, 29, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(26, y + 70, 68, 6);
      ctx.fillRect(36, y + 84, 48, 5);
      ctx.font = `800 ${i === 4 ? 47 : 64}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 566, y + 66);
      ctx.fillRect(119, y + 30, 3, 68);
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.6;
      for (let k = 0; k < 3; k++) ctx.fillRect(963 + k * 15, y + 32 + k * 12, 7, 64 - k * 20);
      ctx.globalAlpha = 1;
    }
  });
  const signMaterial = new THREE.MeshStandardMaterial({
    map: signAtlas,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const signGeometries = [];
  function sign(origin, yaw, w, h, row) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, (7 - row + uv.getY(i)) / 8);
    g.applyMatrix4(transform(origin, [1, 1, 1], [0, yaw, 0]));
    signGeometries.push(g);
  }
  const arch = track.sample(0.014),
    archBuild = localBuilder(arch.position.toArray(), arch.yaw);
  for (const side of [-1, 1]) {
    archBuild(unitBox, '#f4e9cb', [side * 10.2, 4.2, 0], [1.15, 8.4, 1.25]);
    archBuild(unitBox, '#e96845', [side * 10.2, 4.5, -0.68], [1.2, 5.7, 0.12]);
    archBuild(unitBox, '#244e56', [side * 10.2, 0.45, 0], [1.55, 0.9, 1.65]);
    archBuild(unitBox, '#f7ebcc', [side * 10.2, 8.65, 0], [1.5, 0.65, 1.6]);
  }
  archBuild(unitBox, '#f2e8c9', [0, 8.5, 0], [21.7, 2.55, 1.1]);
  archBuild(unitBox, '#e36643', [0, 9.93, 0], [23.3, 0.24, 1.55]);
  const archSign = new THREE.Vector3(0, 8.55, -0.575).applyMatrix4(
    transform(arch.position.toArray(), [1, 1, 1], [0, arch.yaw, 0]),
  );
  sign(archSign.toArray(), arch.yaw + Math.PI, 20.4, 2.3, 0);
  // Five working start lamps are visual architecture; UI handles the countdown.
  for (let i = -2; i <= 2; i++)
    archBuild(
      unitCylinder,
      '#1d343c',
      [i * 0.62, 6.72, -0.63],
      [0.19, 0.14, 0.19],
      [Math.PI / 2, 0, 0],
      'metal',
    );

  // Roadside sponsor boards are oriented toward approaching traffic.
  for (let i = 0; i < 20; i++) {
    const t = (i + 0.6) / 20,
      f = track.sample(t);
    const side = i % 2 ? 1 : -1;
    const point = f.position.clone().addScaledVector(f.normal, side * 13.3);
    const yaw = f.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    box([point.x, point.y + 1.4, point.z], [6.3, 1.38, 0.24], '#f1ead3', yaw);
    for (const offset of [-2.5, 2.5]) {
      const x = point.x + Math.cos(yaw) * offset,
        z = point.z - Math.sin(yaw) * offset;
      cylinder([x, point.y + 0.7, z], 0.075, 1.4, '#3d585b', 'metal');
    }
    sign(
      [point.x + Math.sin(yaw) * 0.14, point.y + 1.4, point.z + Math.cos(yaw) * 0.14],
      yaw,
      6.05,
      1.18,
      (i + 1) % 8,
    );
  }

  // Low polygon coastal rocks with hand-varied mineral colours.
  function rock(x, y, z, sx, sy, sz, shade = '#bd9876') {
    put(
      unitRock,
      shade,
      transform([x, y, z], [sx, sy, sz], [range(-0.4, 0.4), random() * 6.28, range(-0.3, 0.3)]),
    );
  }
  for (let i = 0; i < 95; i++) {
    const angle = range(0, Math.PI * 2),
      radius = islandRadius(angle) * range(0.86, 0.98);
    const x = 6 + Math.cos(angle) * radius,
      z = -7 + Math.sin(angle) * radius;
    if (safe(x, z, 22))
      rock(
        x,
        range(-1.1, 0.6),
        z,
        range(2.4, 7.5),
        range(1.6, 5.5),
        range(2.5, 6.5),
        ['#bd9876', '#caaa81', '#d4b18c', '#ad8e72'][i % 4],
      );
  }
  for (let i = 0; i < 26; i++) {
    const x = range(-63, 17),
      z = range(-60, -27);
    if (safe(x, z, 23))
      rock(
        x,
        range(1, 3.4),
        z,
        range(3, 8),
        range(4, 9),
        range(3, 6),
        ['#bd9673', '#cfa983', '#d7b38a'][i % 3],
      );
  }
  function palm(x, z, height = 12, lean = 0.4, yaw = 0) {
    if (!safe(x, z, 15)) return;
    const base = [x, -0.1, z];
    let last = base;
    for (let i = 1; i <= 6; i++) {
      const y = (i / 6) * height;
      const bend = Math.pow(i / 6, 1.65) * lean;
      const next = [x + Math.sin(yaw) * bend, y, z + Math.cos(yaw) * bend];
      rod(last, next, 0.34 - i * 0.022, i % 2 ? '#a28d5e' : '#b39a65');
      last = next;
    }
    put(unitBall, '#5a824b', transform(last, [0.6, 0.54, 0.6]));
    const crown = last;
    for (let leaf = 0; leaf < 9; leaf++) {
      const angle = yaw + (leaf / 9) * Math.PI * 2;
      const length = range(4.1, 5.8),
        positions = [],
        ix = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6,
          r = length * t;
        const yy = crown[1] + Math.sin(t * Math.PI) * 1.45 - t * t * 1.7;
        const width = Math.sin(t * Math.PI) * 0.66 + 0.025;
        for (const side of [-1, 1])
          positions.push(
            crown[0] + Math.sin(angle) * r + Math.cos(angle) * width * side,
            yy - Math.abs(side) * 0.09,
            crown[2] + Math.cos(angle) * r - Math.sin(angle) * width * side,
          );
        if (j < 6) {
          const k = j * 2;
          ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = makeGeometry(positions, ix);
      put(g, ['#477b48', '#66904e', '#709b54', '#5a8a4d'][leaf % 4], null, 'leaves');
      g.dispose();
      const tip = [
        crown[0] + Math.sin(angle) * length * 0.8,
        crown[1] - 0.5,
        crown[2] + Math.cos(angle) * length * 0.8,
      ];
      rod(crown, tip, 0.037, '#7a9b50', 'leaves');
    }
    for (let i = 0; i < 3; i++)
      put(
        unitBall,
        '#93704e',
        transform(
          [
            crown[0] + Math.sin(i * 2.1) * 0.36,
            crown[1] - 0.4,
            crown[2] + Math.cos(i * 2.1) * 0.36,
          ],
          [0.28, 0.36, 0.28],
        ),
      );
  }
  for (let i = 0; i < 48; i++) {
    const f = track.sample((i + 0.3) / 48);
    const side = i % 3 ? -1 : 1;
    const p = f.position.clone().addScaledVector(f.normal, side * range(18.5, 25));
    palm(p.x, p.z, range(10, 15), range(0.4, 1.5), random() * 6.28);
  }
  for (let i = 0; i < 12; i++)
    palm(range(-27, 44), range(-8, 47), range(9, 14), 0.8, random() * 6.28);
  // Rosemary, agave and flowering cushions make the verge feel planted.
  for (let i = 0; i < 170; i++) {
    const t = random(),
      f = track.sample(t),
      side = random() > 0.5 ? 1 : -1;
    const p = f.position.clone().addScaledVector(f.normal, side * range(15.8, 25.5));
    if (!safe(p.x, p.z, 15.5)) continue;
    const size = range(0.45, 1.4);
    put(
      unitBall,
      ['#8a9b66', '#6e8c59', '#9ca675'][i % 3],
      transform([p.x, 0.25, p.z], [size, size * 0.65, size * 0.8]),
    );
    if (i % 4 === 0)
      for (let j = 0; j < 3; j++)
        put(
          unitBall,
          i % 8 ? '#d8959c' : '#e8b96d',
          transform(
            [p.x + range(-0.5, 0.5), size * 0.55, p.z + range(-0.5, 0.5)],
            [0.22, 0.18, 0.22],
          ),
        );
  }

  function roofGeometry(w, d, rise) {
    return makeGeometry(
      [
        -w / 2,
        0,
        -d / 2,
        w / 2,
        0,
        -d / 2,
        0,
        rise,
        -d / 2,
        -w / 2,
        0,
        d / 2,
        w / 2,
        0,
        d / 2,
        0,
        rise,
        d / 2,
      ],
      [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3],
    );
  }
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.5, 0);
  archShape.lineTo(-0.5, 1.3);
  archShape.absarc(0, 1.3, 0.5, Math.PI, 0, true);
  archShape.lineTo(0.5, 0);
  archShape.closePath();
  const archGeometry = new THREE.ShapeGeometry(archShape, 10);
  function house(x, z, w, d, h, yaw, variant) {
    if (!safe(x, z, Math.max(w, d) * 0.6 + 14)) return;
    const build = localBuilder([x, -0.05, z], yaw);
    const wall = ['#f3e3bb', '#faf0d2', '#ecdfb9', '#e9d0aa'][variant % 4];
    const shutter = ['#4a8e90', '#3e747b', '#608885', '#638a7e'][variant % 4];
    build(unitBox, wall, [0, h / 2, 0], [w, h, d], [0, 0, 0], 'stucco');
    build(unitBox, '#d4bd91', [0, 0.27, 0], [w + 0.22, 0.55, d + 0.22]);
    build(unitBox, '#fbefd0', [0, h - 0.15, 0], [w + 0.32, 0.3, d + 0.32]);
    const roof = roofGeometry(w + 0.9, d + 0.8, 1.65);
    build(roof, ['#cc7852', '#be694d', '#d28155'][variant % 3], [0, h, 0]);
    roof.dispose();
    // Rounded terracotta ridge and eave courses catch the afternoon light.
    build(unitCylinder, '#d68a5c', [0, h + 1.68, 0], [0.15, d + 1, 0.15], [Math.PI / 2, 0, 0]);
    for (const side of [-1, 1])
      build(
        unitCylinder,
        '#e29b6e',
        [side * (w / 2 + 0.35), h + 0.02, 0],
        [0.12, d + 0.9, 0.12],
        [Math.PI / 2, 0, 0],
      );
    const floors = Math.max(1, Math.round(h / 3.35)),
      cols = Math.max(1, Math.floor(w / 2.4));
    for (let floor = 0; floor < floors; floor++)
      for (let col = 0; col < cols; col++) {
        const xx = (col - (cols - 1) / 2) * 2.45,
          yy = 1.6 + floor * 3.15;
        if (yy + 0.9 > h) continue;
        for (const side of [-1, 1]) {
          const zz = side * (d / 2 + 0.035);
          build(unitBox, '#f9edcf', [xx, yy, zz], [1.35, 1.85, 0.15]);
          build(
            unitBox,
            '#31515a',
            [xx, yy, zz + side * 0.09],
            [0.85, 1.4, 0.07],
            [0, 0, 0],
            'glass',
          );
          for (const shutterSide of [-1, 1]) {
            build(
              unitBox,
              shutter,
              [xx + shutterSide * 0.65, yy, zz + side * 0.14],
              [0.33, 1.48, 0.16],
            );
            for (let slat = 0; slat < 4; slat++)
              build(
                unitBox,
                '#a9b8a0',
                [xx + shutterSide * 0.65, yy - 0.5 + slat * 0.33, zz + side * 0.23],
                [0.27, 0.035, 0.035],
              );
          }
          build(unitBox, '#e6d0aa', [xx, yy - 0.9, zz], [1.55, 0.19, 0.5]);
          if (floor === 1 && variant % 3 === 0 && side < 0) {
            build(unitBox, '#e0d2af', [xx, yy - 0.93, zz - 0.45], [2.2, 0.18, 1.15]);
            build(
              unitBox,
              '#36585a',
              [xx, yy - 0.35, zz - 0.95],
              [2.1, 0.06, 0.06],
              [0, 0, 0],
              'metal',
            );
            for (let r = -2; r <= 2; r++)
              build(
                unitBox,
                '#36585a',
                [xx + r * 0.42, yy - 0.62, zz - 0.95],
                [0.035, 0.58, 0.035],
                [0, 0, 0],
                'metal',
              );
          }
        }
      }
    build(archGeometry, '#664f3f', [0, 0.03, -d / 2 - 0.09], [1.45, 1.45, 1], [0, Math.PI, 0]);
    build(unitBox, '#f6e8bf', [0, 0.1, -d / 2 - 0.5], [2.2, 0.2, 1]);
    if (variant % 2 === 0) {
      for (let stripe = 0; stripe < 8; stripe++)
        build(
          unitBox,
          stripe % 2 ? '#f6ead2' : '#db805d',
          [(stripe - 3.5) * 0.44, 2.8, -d / 2 - 0.72],
          [0.44, 0.12, 1.55],
          [-0.2, 0, 0],
          'fabric',
        );
      for (const side of [-1, 1])
        build(unitCylinder, '#c29469', [side * 1.85, 1.35, -d / 2 - 1.2], [0.045, 2.7, 0.045]);
    }
    // Chimney and little pottery on the roof terrace.
    build(unitBox, '#ead7ac', [w * 0.24, h + 0.85, d * 0.18], [0.65, 1.8, 0.7]);
    build(unitBox, '#b87850', [w * 0.24, h + 1.8, d * 0.18], [0.85, 0.16, 0.9]);
    for (const side of [-1, 1]) {
      build(unitCylinder, '#b97651', [side * (w * 0.36), 0.4, -d / 2 - 0.6], [0.37, 0.75, 0.37]);
      build(unitBall, '#7a9864', [side * (w * 0.36), 0.98, -d / 2 - 0.6], [0.63, 0.66, 0.63]);
    }
  }
  // A genuinely modelled village: roof ridges, shutters, arches, awnings, balconies.
  const village = [
    [-48, -4, 8, 7, 9, 0.1],
    [-33, 2, 8, 7, 11, -0.05],
    [-18, 8, 7, 7, 7, 0.1],
    [2, 9, 8, 7, 10, -0.12],
    [20, 1, 8, 8, 8, 0.2],
    [-52, -24, 8, 7, 8, 0.12],
    [-37, -22, 9, 7, 12, -0.1],
    [-21, -25, 7, 8, 13, 0],
    [-4, -27, 8, 7, 9, 0.13],
    [15, -23, 9, 7, 10, -0.18],
    [-44, -42, 7, 7, 11, 0.1],
    [-26, -45, 8, 7, 13, -0.1],
    [-9, -48, 8, 7, 12, 0.12],
    [10, -45, 7, 8, 14, -0.1],
    [30, -40, 8, 7, 8, -0.4],
    [35, -21, 7, 7, 8, -0.3],
    [33, 12, 7, 6, 7, -0.2],
    [-14, 26, 7, 6, 6, 0.05],
    [5, 28, 7, 7, 7, -0.12],
  ];
  village.forEach((a, i) => house(...a, i));
  // Keep the new town furnishings in their own cells: a bench or olive near a
  // cell edge must not enlarge the bounds of thousands of existing house parts.
  batchScope = 'town ';
  // Flush ground decals and tiled pedestrian lanes knit the houses into a town.
  function groundPatch(x, z, w, d, key, yaw = 0, color = '#ffffff', y = -0.11) {
    const shape = new THREE.Shape(),
      r = Math.min(w, d) * 0.18;
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2);
    shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    shape.lineTo(w / 2, d / 2 - r);
    shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    shape.lineTo(-w / 2 + r, d / 2);
    shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    shape.lineTo(-w / 2, -d / 2 + r);
    shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const g = new THREE.ShapeGeometry(shape, 5);
    const positions = g.getAttribute('position'),
      uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / 5, positions.getY(i) / 5);
    put(g, color, transform([x, y, z], [1, 1, 1], [-Math.PI / 2, 0, yaw]), key);
    g.dispose();
  }
  for (const [x, z, w, d, angle] of [
    [-42, 17, 20, 14, 0.12],
    [-46, -12, 17, 9, -0.08],
    [-23, -13, 19, 10, 0.1],
    [18, -7, 22, 13, -0.08],
    [29, -30, 16, 11, -0.1],
    [-29, -36, 21, 10, 0.08],
    [18, 29, 24, 14, -0.12],
  ]) {
    groundPatch(x, z, w, d, 'garden', angle);
  }
  groundPatch(-6, -6, 29, 24, 'paving', 0, '#fff9df', -0.075);
  groundPatch(-13, -10, 87, 3.7, 'paving', 0.06, '#f7efcf', -0.062);
  groundPatch(-10, -15, 3.8, 75, 'paving', -0.03, '#f7efcf', -0.057);
  groundPatch(-13, -34, 81, 2.8, 'paving', -0.03, '#f5edcd', -0.052);
  groundPatch(-35, -11, 2.5, 47, 'paving', 0.035, '#f4ebcc', -0.048);
  groundPatch(20, -9, 2.6, 51, 'paving', -0.08, '#f4ebcc', -0.044);
  // Small town-square fountain and cobbled cross streets.
  cylinder([-7, 0.18, -5], 3.6, 0.44, '#b9aa84');
  cylinder([-7, 0.4, -5], 3.08, 0.16, '#68ada8', 'glass');
  cylinder([-7, 1.3, -5], 0.48, 2, '#e6d4a8');
  cylinder([-7, 2.4, -5], 1.55, 0.19, '#e9d8b4');
  cylinder([-7, 2.55, -5], 1.32, 0.08, '#78b7ae', 'glass');
  put(unitBall, '#e8d3a7', transform([-7, 2.94, -5], [0.38, 0.43, 0.38]));
  const flowerHead = new THREE.IcosahedronGeometry(1, 0);
  const flowerPot = new THREE.CylinderGeometry(0.4, 0.27, 0.66, 10);
  const flowerRim = new THREE.TorusGeometry(0.39, 0.045, 4, 12);
  function planter(x, z, shade = '#dd7657') {
    put(flowerPot, '#b9744d', transform([x, 0.22, z]));
    put(flowerRim, '#d38b5a', transform([x, 0.55, z], [1, 1, 1], [Math.PI / 2, 0, 0]));
    put(unitBall, '#708f50', transform([x, 0.68, z], [0.47, 0.3, 0.47]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(
        flowerHead,
        i % 3 ? shade : '#f1c759',
        transform(
          [x + Math.cos(a) * 0.31, 0.83 + (i % 2) * 0.07, z + Math.sin(a) * 0.31],
          [0.16, 0.12, 0.16],
        ),
      );
    }
  }
  [
    [-20, -12],
    [-20, 5],
    [7, -12],
    [7, 5],
    [-35, -16],
    [-32, -16],
    [-48, -11],
    [-45, -11],
    [-20, 1],
    [-17, 1],
    [12, -28],
    [15, -28],
    [-7, -34],
    [-4, -34],
    [17, -7],
    [20, -7],
  ].forEach(([x, z], i) => planter(x, z, ['#e37c63', '#de9ead', '#f1c454', '#e4dfc0'][i % 4]));
  flowerHead.dispose();
  flowerPot.dispose();
  flowerRim.dispose();
  function olive(x, z, height = 4.6) {
    if (!safe(x, z, 19)) return;
    rod([x, -0.15, z], [x + 0.2, height * 0.62, z - 0.12], 0.19, '#938060');
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      const px = x + Math.cos(angle) * 0.9,
        pz = z + Math.sin(angle) * 0.9;
      rod([x + 0.1, height * 0.4, z], [px, height * 0.82, pz], 0.1, '#9a8969');
      put(
        unitBall,
        ['#7b9668', '#8ea176', '#9aab7f'][i],
        transform([px, height * 0.86, pz], [1.5, 1.25, 1.5]),
      );
    }
    put(unitBall, '#8d9f73', transform([x, height + 0.5, z], [1.6, 1.15, 1.6]));
  }
  [
    [-43, 18],
    [-34, 15],
    [19, 24],
    [25, 30],
    [28, -30],
    [-48, -15],
  ].forEach(([x, z], i) => olive(x, z, 4.1 + (i % 3) * 0.4));
  for (const [x, z] of [
    [-37, 22],
    [-39, 20],
    [-31, 18],
    [14, 30],
    [21, 34],
    [29, -24],
    [33, -28],
    [-28, -38],
    [-22, -38],
    [-48, -17],
  ]) {
    put(unitBall, '#829b63', transform([x, 0.35, z], [1.2, 0.65, 1.0]));
  }
  function bench(x, z, yaw = 0) {
    const b = localBuilder([x, -0.1, z], yaw);
    for (const zz of [-0.26, 0, 0.26]) b(unitBox, '#b18b60', [0, 0.68, zz], [2.6, 0.13, 0.19]);
    for (const yy of [1.02, 1.31]) b(unitBox, '#b18b60', [0, yy, 0.36], [2.6, 0.17, 0.11]);
    for (const xx of [-1, 1]) {
      b(unitBox, '#3e6663', [xx, 0.35, 0], [0.1, 0.7, 0.56], [0, 0, 0], 'metal');
      b(unitBox, '#3e6663', [xx, 1.0, 0.36], [0.08, 0.8, 0.08], [0, 0, 0], 'metal');
    }
  }
  bench(-19, -6, Math.PI / 2);
  bench(6, -6, -Math.PI / 2);
  bench(-7, 5, 0);
  bench(-7, -16, Math.PI);
  bench(-37, 18, 0.15);
  bench(23, 26, -0.2);
  // Cafe seats, crockery and standing visitors give the plaza a lived-in scale.
  for (const [i, x, z] of [
    [0, -17, -1],
    [1, 1, 1],
    [2, 4, -12],
  ]) {
    umbrella(x, z, i % 2 ? '#4f9995' : '#dd8b65', 1.75);
    cylinder([x, 0.86, z], 0.68, 0.12, '#eee0ba');
    cylinder([x, 0.36, z], 0.065, 0.9, '#52736a', 'metal');
    for (let j = 0; j < 3; j++) {
      const angle = (j / 3) * Math.PI * 2;
      const cx = x + Math.cos(angle) * 1.15,
        cz = z + Math.sin(angle) * 1.15;
      const chair = localBuilder([cx, -0.1, cz], -angle + Math.PI / 2);
      chair(unitBox, '#63968d', [0, 0.54, 0], [0.56, 0.12, 0.55]);
      chair(unitBox, '#63968d', [0, 0.88, 0.25], [0.56, 0.62, 0.08]);
      for (const sx of [-1, 1]) chair(unitBox, '#8e9a7d', [sx * 0.2, 0.25, 0], [0.065, 0.5, 0.45]);
      cylinder(
        [x + Math.cos(angle) * 0.38, 0.98, z + Math.sin(angle) * 0.38],
        0.075,
        0.15,
        '#f7e9c8',
      );
    }
  }
  for (const [i, x, z] of [
    [0, -14, -13],
    [1, -2, 7],
    [2, -30, -10],
    [3, 15, -34],
  ]) {
    cylinder([x, 0.79, z], 0.22, 1.1, ['#e4aa6b', '#6c9e9b', '#d17e5e', '#e2d1a7'][i]);
    put(unitBall, '#c7956b', transform([x, 1.55, z], [0.23, 0.27, 0.23]));
    for (const side of [-1, 1]) box([x + side * 0.1, 0.2, z], [0.12, 0.6, 0.16], '#738078');
  }
  batchScope = '';
  // Campanile silhouette makes the village unmistakable from the far side.
  const tower = localBuilder([-5, -0.1, -31]);
  tower(unitBox, '#f2dfb2', [0, 9.9, 0], [4.8, 19.8, 4.8], [0, 0, 0], 'stucco');
  for (const y of [4.7, 13.7, 19.8]) tower(unitBox, '#e4c794', [0, y, 0], [5.35, 0.4, 5.35]);
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    tower(
      archGeometry,
      '#5d6258',
      [Math.sin(a) * 2.42, 15.8, Math.cos(a) * 2.42],
      [2.15, 1.9, 1],
      [0, a, 0],
    );
    tower(
      unitCylinder,
      '#f2dfb4',
      [Math.sin(a) * 2.43, 12.4, Math.cos(a) * 2.43],
      [0.83, 0.08, 0.83],
      [Math.PI / 2, 0, -a],
    );
    tower(
      unitBox,
      '#5b6559',
      [Math.sin(a) * 2.49, 12.62, Math.cos(a) * 2.49],
      [0.06, 0.53, 0.08],
      [0, a, 0],
    );
  }
  const towerRoof = new THREE.ConeGeometry(4.1, 4.1, 4);
  tower(towerRoof, '#c8794f', [0, 22.1, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
  towerRoof.dispose();
  tower(unitCylinder, '#d1ad71', [0, 24.65, 0], [0.065, 1.7, 0.065], [0, 0, 0], 'metal');

  // Coastal lighthouse with gallery railing, glazed lantern, and striped masonry.
  const lx = 138,
    lz = -30;
  rock(lx, -1, lz, 9, 2.9, 8, '#c8b28a');
  cylinder([lx, 0.5, lz], 5.1, 1.2, '#e8d5aa');
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(2.35 - i * 0.1, 2.45 - i * 0.1, 3.0, 20);
    put(g, i % 2 ? '#e77852' : '#f8e9c6', transform([lx, 2.6 + i * 3, lz]));
    g.dispose();
  }
  cylinder([lx, 19.55, lz], 3.1, 0.35, '#f4dfb8');
  cylinder([lx, 20.9, lz], 1.65, 2.6, '#88bfc0', 'glass');
  cylinder([lx, 22.3, lz], 2.3, 0.23, '#274e56', 'metal');
  const lighthouseCap = new THREE.ConeGeometry(2.55, 1.5, 20);
  put(lighthouseCap, '#e77c51', transform([lx, 23.1, lz]));
  lighthouseCap.dispose();
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    cylinder(
      [lx + Math.cos(a) * 2.83, 20.15, lz + Math.sin(a) * 2.83],
      0.045,
      1.1,
      '#3c6060',
      'metal',
    );
  }
  const rail = new THREE.TorusGeometry(2.83, 0.045, 4, 40);
  put(rail, '#36585b', transform([lx, 20.7, lz], [1, 1, 1], [Math.PI / 2, 0, 0]), 'metal');
  rail.dispose();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cylinder(
      [lx + Math.cos(a) * 1.66, 20.9, lz + Math.sin(a) * 1.66],
      0.06,
      2.6,
      '#284e53',
      'metal',
    );
  }
  house(130, -8, 7, 6, 4.2, -0.25, 3);

  function umbrella(x, z, color, r = 2.5) {
    cylinder([x, 1.6, z], 0.06, 3.2, '#e5c396');
    const g = new THREE.ConeGeometry(r, 0.8, 10, 1, true);
    put(g, color, transform([x, 3.15, z]), 'fabric');
    g.dispose();
    cylinder([x, 3.65, z], 0.09, 0.22, '#e6c58f');
    for (let i = 0; i < 10; i += 2) {
      const a = (i / 10) * Math.PI * 2,
        b = ((i + 1) / 10) * Math.PI * 2;
      const panel = makeGeometry(
        [
          x,
          3.55,
          z,
          x + Math.cos(a) * r,
          2.75,
          z + Math.sin(a) * r,
          x + Math.cos(b) * r,
          2.75,
          z + Math.sin(b) * r,
        ],
        [0, 1, 2],
      );
      put(panel, '#faedcb', null, 'fabric');
      panel.dispose();
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 113 + (i % 3) * 9,
      z = 67 + Math.floor(i / 3) * 9;
    if (!safe(x, z, 17)) continue;
    umbrella(x, z, i % 2 ? '#dd7755' : '#439e9d', 2.7);
    for (const side of [-1, 1]) {
      box([x + side * 1.3, 0.45, z + 0.4], [0.8, 0.25, 2.4], '#f1e2b7');
      box([x + side * 1.3, 0.73, z - 0.6], [0.8, 0.85, 0.15], '#e1a07c', -0.2);
    }
  }

  // Start-line grandstand: tiered deck, individual seats, fabric canopy.
  const standFrame = track.sample(0.97),
    standCenter = standFrame.position.clone().addScaledVector(standFrame.normal, -26);
  const stand = localBuilder([standCenter.x, -0.1, standCenter.z], standFrame.yaw + Math.PI / 2);
  stand(unitBox, '#d8c6a0', [0, 0.55, 0], [24, 1.2, 11]);
  for (let row = 0; row < 4; row++) {
    stand(unitBox, '#e4d6b3', [0, 1.05 + row * 0.72, row * 1.7 - 2.8], [23.2, 0.45, 1.7]);
    for (let col = 0; col < 19; col++) {
      const x = (col - 9) * 1.1,
        y = 1.48 + row * 0.72,
        z = row * 1.7 - 2.8;
      const color = (row + col) % 3 ? '#e77c55' : '#40999b';
      stand(unitBox, color, [x, y, z], [0.8, 0.18, 0.78]);
      stand(unitBox, color, [x, y + 0.4, z + 0.35], [0.8, 0.68, 0.12]);
      // A light-touch crowd of colourful low-cost figures.
      if ((row * 19 + col) % 4 !== 0) {
        stand(
          unitCylinder,
          ['#e4aa6c', '#306d7a', '#e3cc8c', '#b35f4a', '#f3e8c8'][(row + col) % 5],
          [x, y + 0.59, z - 0.09],
          [0.22, 0.65, 0.22],
        );
        stand(
          unitBall,
          ['#c58e66', '#d9a477', '#ad7757'][(row + col) % 3],
          [x, y + 1.1, z - 0.1],
          [0.22, 0.25, 0.22],
        );
      }
    }
  }
  for (const x of [-11.4, 0, 11.4])
    for (const z of [-4.9, 4.7])
      stand(unitCylinder, '#526e6d', [x, 3.8, z], [0.09, 7.6, 0.09], [0, 0, 0], 'metal');
  stand(unitBox, '#f2dbaa', [0, 7.58, -0.2], [25.5, 0.22, 12.4], [0, 0, -0.025], 'fabric');
  stand(unitBox, '#dd7854', [0, 7.3, -6.4], [25.5, 0.7, 0.12], [0, 0, 0], 'fabric');
  // The village-side pit promenade has cafe awnings and service kiosks.
  for (let i = 0; i < 4; i++) {
    const f = track.sample(0.962 + i * 0.009),
      p = f.position.clone().addScaledVector(f.normal, 23);
    const b = localBuilder([p.x, -0.1, p.z], f.yaw);
    b(unitBox, '#f7e7bf', [0, 1.4, 0], [4.3, 2.8, 4.5]);
    b(unitBox, '#437c80', [0, 1.5, -2.28], [3.4, 1.6, 0.07]);
    const roof = roofGeometry(5.4, 5.3, 1.1);
    b(roof, i % 2 ? '#d17954' : '#73a5a0', [0, 2.8, 0]);
    roof.dispose();
    b(unitBox, '#e9d4a6', [0, 0.18, -2.9], [4.9, 0.3, 1.2]);
  }

  // Strings of pennants sweep above the road at scenic sectors.
  for (const t of [0.102, 0.39, 0.685, 0.935]) {
    const f = track.sample(t),
      base = transform(f.position.toArray(), [1, 1, 1], [0, f.yaw, 0]);
    const p0 = new THREE.Vector3(-12.4, 8.2, 0).applyMatrix4(base),
      p1 = new THREE.Vector3(12.4, 8.2, 0).applyMatrix4(base);
    for (const p of [p0, p1]) cylinder([p.x, f.position.y + 4, p.z], 0.09, 8, '#dcbd8e');
    for (let i = 0; i < 22; i++) {
      const xx = -12.4 + (i / 21) * 24.8,
        sag = Math.sin((i / 21) * Math.PI) * 1.2;
      const nextX = -12.4 + ((i + 1) / 21) * 24.8;
      if (i < 21) {
        const a = new THREE.Vector3(xx, 8.2 - sag, 0).applyMatrix4(base),
          b = new THREE.Vector3(
            nextX,
            8.2 - Math.sin(((i + 1) / 21) * Math.PI) * 1.2,
            0,
          ).applyMatrix4(base);
        rod(a.toArray(), b.toArray(), 0.022, '#9d9d79');
      }
      const g = makeGeometry(
        [xx - 0.34, 8.15 - sag, 0, xx + 0.34, 8.15 - sag, 0, xx + 0.1, 7.1 - sag, 0.13],
        [0, 1, 2],
      );
      put(g, ['#e77952', '#f8e4aa', '#469e9e', '#da9f68'][i % 4], base, 'fabric');
      g.dispose();
    }
  }

  // A timber jetty and moored sailboats give the ocean a human scale.
  for (let i = 0; i < 14; i++)
    box([153 + i * 1.1, -0.1, 48], [1.0, 0.25, 4.2], i % 2 ? '#ae926b' : '#b9a07a');
  for (const x of [153, 160, 167])
    for (const z of [46.1, 49.9]) cylinder([x, -1.0, z], 0.18, 3.5, '#9b825f');
  function boat(x, z, yaw, sail = true) {
    const b = localBuilder([x, -2.2, z], yaw);
    const hull = makeGeometry(
      [
        -1.5, 0.55, -3.3, 1.5, 0.55, -3.3, -1.6, 0.55, 1.8, 1.6, 0.55, 1.8, 0, 0.55, 4.2, -0.8,
        -0.5, -2.8, 0.8, -0.5, -2.8, 0, -0.5, 2.9,
      ],
      [
        0, 5, 1, 1, 5, 6, 0, 2, 5, 2, 7, 5, 1, 6, 3, 3, 6, 7, 2, 4, 7, 3, 7, 4, 0, 1, 2, 1, 3, 2, 2,
        3, 4,
      ],
    );
    b(hull, '#f3e6c5', [0, 0, 0]);
    hull.dispose();
    b(unitBox, '#cf865e', [0, 0.6, -0.1], [2.3, 0.08, 4.9]);
    b(unitBox, '#f4e5c2', [0, 1.1, -0.8], [1.7, 0.85, 2.1]);
    b(unitBox, '#4b8b93', [0, 1.55, -0.8], [1.75, 0.08, 2.2]);
    if (sail) {
      b(unitCylinder, '#b5b5a1', [0, 5.0, 0.5], [0.06, 9.3, 0.06], [0, 0, 0], 'metal');
      const a = makeGeometry([0, 1.6, 0.5, 0, 9.4, 0.5, 0, 1.8, -3.2], [0, 1, 2]);
      b(a, '#fff0d1', [0, 0, 0], [1, 1, 1], [0, 0.28, 0], 'fabric');
      a.dispose();
      const c = makeGeometry([0, 2, 0.65, 0, 8.8, 0.65, 0, 2, 3.7], [0, 1, 2]);
      b(c, '#de865d', [0, 0, 0], [1, 1, 1], [0, -0.2, 0], 'fabric');
      c.dispose();
    }
  }
  boat(175, 57, -0.8);
  boat(186, 24, 0.24);
  boat(-160, 34, -0.3);
  boat(129, 137, -0.8, false);
  // Distant headlands and layered islands keep every horizon composed.
  for (let i = 0; i < 11; i++) {
    const a = 0.15 + i * 0.54,
      r = 340 + (i % 3) * 45;
    rock(
      Math.cos(a) * r,
      -8,
      Math.sin(a) * r,
      range(35, 66),
      range(11, 25),
      range(30, 60),
      '#8da9a0',
    );
    rock(
      Math.cos(a) * r + 6,
      -8,
      Math.sin(a) * r + 9,
      range(25, 50),
      range(17, 35),
      range(26, 52),
      '#a1b7a8',
    );
  }

  // Shared materials are batched within 64 m cells so chase views can cull
  // the village, vegetation, and circuit furniture behind the camera.
  for (const { key, scope, cellX, cellZ, geometries } of batches.values()) {
    const combined = mergeGeometries(geometries, false);
    if (combined) {
      combined.computeBoundingBox();
      combined.computeBoundingSphere();
      mesh(
        combined,
        materials[key],
        `Environment ${scope}${key} · ${cellX},${cellZ}`,
        !['sand', 'leaves', 'paving', 'garden'].includes(key),
      );
    }
    geometries.forEach((g) => g.dispose());
  }
  if (signGeometries.length) {
    mesh(mergeGeometries(signGeometries, false), signMaterial, 'Typography · shared sponsor atlas');
    signGeometries.forEach((g) => g.dispose());
  }
  for (const g of [unitBox, unitCylinder, unitRock, unitBall, barrier, archGeometry]) g.dispose();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh) {
      object.matrixAutoUpdate = false;
      object.updateMatrix();
    }
  });
  return {
    root,
    update(dt, time) {
      waterMaterial.uniforms.time.value = time;
    },
    heroCamera: {
      position: new THREE.Vector3(-112, 71, 149),
      target: new THREE.Vector3(0, 4, -11),
    },
    dispose() {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      const used = new Set();
      root.traverse((o) => {
        if (o.material) used.add(o.material);
      });
      used.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      scene.remove(root);
    },
  };
}
