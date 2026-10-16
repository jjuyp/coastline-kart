import * as THREE from 'three';
import { createTrack } from './track.js';
import { Race, clamp, wrapAngle, RACERS } from './race.js';
import { createWorld } from './world.js';
import { createKart } from './kart.js';
import { RaceAudio } from './audio.js';
import { ProgressiveSteering } from './steering.js';
import { createTouchControls } from './touch-controls.js';

const $ = (id) => document.getElementById(id),
  query = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches;
document.body.classList.toggle('touch-device', mobile);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem('coastline-' + key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('coastline-' + key, JSON.stringify(value));
    } catch {}
  },
};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $('game'),
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
} catch (e) {
  $('loading').classList.add('hidden');
  $('error').classList.remove('hidden');
  $('error-message').textContent = '請使用 Chrome、Edge 或 Safari，並開啟硬體加速後重新載入。';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.35 : 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa3dce5);
scene.fog = new THREE.Fog(0xb9dbd8, 170, 475);
const camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, 0.2, 650);
scene.add(new THREE.HemisphereLight(0xfff2d5, 0x5f9697, 2.15));
const sun = new THREE.DirectionalLight(0xffe0ad, 3.15);
sun.position.set(-80, 140, 75);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 350;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.06;
sun.shadow.radius = 3;
sun.shadow.autoUpdate = false;
sun.shadow.needsUpdate = true;
scene.add(sun);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(550, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 lo=vec3(.88,.87,.72);vec3 hi=vec3(.28,.67,.80);gl_FragColor=vec4(mix(lo,hi,smoothstep(-.1,.8,h)),1.);}',
  }),
);
scene.add(sky);
const track = createTrack(),
  race = new Race(track),
  audio = new RaceAudio();
$('length').textContent = `${Math.round(track.length)} m 海岸公路`;
const world = createWorld(scene, track);
const kartModels = race.cars.map((c) => {
  const model = createKart(c.color, c.id + 1);
  if (c.id !== 0) {
    model.low = createKart(c.color, c.id + 1, { lowDetail: true });
    model.low.group.visible = false;
    scene.add(model.low.group);
  }
  for (const m of [model, model.low])
    if (m) {
      m.group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
      scene.add(m.group);
    }
  return model;
});

// Recycled sparks and dust: no particle objects or geometries are created during a race.
const particleCount = 150,
  particleMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
    particleCount,
  );
particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
particleMesh.frustumCulled = false;
scene.add(particleMesh);
const particles = Array.from({ length: particleCount }, () => ({
  x: 0,
  y: -50,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 0,
  max: 1,
  size: 0.1,
  color: new THREE.Color(),
}));
let particleCursor = 0,
  particleTick = 0;
const dummy = new THREE.Object3D(),
  particleColor = new THREE.Color();
const skidCount = 340,
  skids = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.17, 0.9),
    new THREE.MeshBasicMaterial({
      color: 0x242c2c,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    skidCount,
  );
skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
skids.frustumCulled = false;
scene.add(skids);
let skidCursor = 0;
dummy.scale.set(0, 0, 0);
dummy.updateMatrix();
for (let i = 0; i < skidCount; i++) skids.setMatrixAt(i, dummy.matrix);
function emit(c, type = 'spark') {
  const p = particles[particleCursor++ % particleCount],
    side = Math.random() > 0.5 ? 1 : -1;
  const dx = Math.sin(c.yaw),
    dz = Math.cos(c.yaw);
  p.x = c.x - dx * 1.2 + dz * side * 0.85;
  p.z = c.z - dz * 1.2 - dx * side * 0.85;
  p.y = c.y + 0.15;
  p.vx = -c.vx * 0.17 + (Math.random() - 0.5) * 2;
  p.vz = -c.vz * 0.17 + (Math.random() - 0.5) * 2;
  p.vy = type === 'confetti' ? 4 + Math.random() * 4 : 1 + Math.random() * 2;
  p.life = p.max = type === 'confetti' ? 2 + Math.random() : 0.28 + Math.random() * 0.4;
  p.size = type === 'dust' ? 0.16 : 0.055 + Math.random() * 0.06;
  p.color.set(
    type === 'dust'
      ? 0xf0d8b1
      : type === 'confetti'
        ? RACERS[Math.floor(Math.random() * 6)].color
        : c.driftCharge > 1.5
          ? 0xffb855
          : 0x72efff,
  );
}
function addSkid(c) {
  for (const side of [-1, 1]) {
    dummy.position.set(
      c.x - Math.sin(c.yaw) * 0.9 + Math.cos(c.yaw) * side * 0.83,
      c.y + 0.035,
      c.z - Math.cos(c.yaw) * 0.9 - Math.sin(c.yaw) * side * 0.83,
    );
    dummy.rotation.set(-Math.PI / 2, 0, c.yaw);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    skids.setMatrixAt(skidCursor++ % skidCount, dummy.matrix);
  }
  skids.instanceMatrix.needsUpdate = true;
}
function clearEffects() {
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < skidCount; i++) skids.setMatrixAt(i, dummy.matrix);
  skids.instanceMatrix.needsUpdate = true;
  for (const p of particles) p.life = 0;
}
function updateParticles(dt) {
  for (let i = 0; i < particleCount; i++) {
    const p = particles[i];
    p.life -= dt;
    if (p.life > 0) {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y += p.vy * dt;
      p.vy -= 4.5 * dt;
      dummy.position.set(p.x, p.y, p.z);
      const size = p.size * Math.min(1, (p.life / p.max) * 3);
      dummy.scale.set(size, size, size);
      dummy.rotation.set(p.life * 3, p.life * 4, 0);
      particleMesh.setColorAt(i, p.color);
    } else dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(i, dummy.matrix);
  }
  particleMesh.instanceMatrix.needsUpdate = true;
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
}

const keys = new Set();
const steering = new ProgressiveSteering();
const preferences = {
  sensitivity: [0.8, 1, 1.15].includes(storage.get('sensitivity', 1))
    ? storage.get('sensitivity', 1)
    : 1,
  autoThrottle: storage.get('auto-throttle', mobile) === true,
  touchMode: storage.get('touch-mode', 'buttons') === 'pad' ? 'pad' : 'buttons',
};
let cameraMode = storage.get('camera', 0) === 1 ? 1 : 0,
  lowQuality = storage.get('low-quality', mobile),
  muted = storage.get('muted', false),
  screen = 'menu',
  toastTime = 0,
  goTime = 0,
  wrongTime = 0,
  autoQA = false;
const touchControls = createTouchControls(
  document.querySelector('.touch-controls'),
  () => screen === 'race',
  () => audio.init(),
);
const touch = touchControls.buttons;
const driftButton = document.querySelector('[data-control="drift"]');
function focusDriving() {
  if (screen === 'race') $('game').focus({ preventScroll: true });
}
function resetInput() {
  keys.clear();
  steering.reset();
  touchControls.reset();
}
let uiTick = 0,
  gameTime = 0,
  lastFrame = performance.now(),
  accumulator = 0,
  frames = 0,
  perfStart = performance.now(),
  avgFPS = 0,
  adaptiveScale = 1,
  slowFrames = 0;
const fpsSamples = [],
  frameTimes = [];
const camPosition = new THREE.Vector3(),
  camLook = new THREE.Vector3(),
  desiredPosition = new THREE.Vector3(),
  desiredLook = new THREE.Vector3();
audio.setMuted(muted);
function updateSoundButton() {
  $('mute').textContent = muted ? '♩' : '♫';
  $('mute').setAttribute('aria-label', muted ? '開啟音效' : '關閉音效');
  $('mute').title = muted ? '開啟音效 M' : '關閉音效 M';
}
updateSoundButton();
function applyQuality() {
  adaptiveScale = 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowQuality ? 1 : mobile ? 1.35 : 1.65));
  renderer.shadowMap.enabled = !lowQuality;
  sun.shadow.needsUpdate = true;
  renderer.setSize(innerWidth, innerHeight);
  $('quality').textContent = lowQuality ? 'ECO' : 'HQ';
  $('quality').title = lowQuality ? '省電畫質，點擊切換高畫質' : '高畫質，點擊切換省電畫質';
  storage.set('low-quality', lowQuality);
}
applyQuality();
const formatTime = (s) => {
  if (!Number.isFinite(s)) return '—';
  const ms = Math.floor(s * 1000),
    m = Math.floor(ms / 60000);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const best = storage.get('best', null);
if (best) $('best-label').textContent = 'PERSONAL BEST ' + formatTime(best);
function toast(text, seconds = 2) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  toastTime = seconds;
}
function soundCue(type) {
  audio.cue(type);
}
function setScreen(next) {
  screen = next;
  $('menu').classList.toggle('hidden', next !== 'menu');
  $('postcard').classList.toggle('hidden', next !== 'menu');
  $('hud').classList.toggle('hidden', next === 'menu');
  $('pause').classList.toggle('hidden', next === 'menu' || next === 'results');
  $('results').classList.toggle('hidden', next !== 'results');
  $('pause-screen').classList.toggle('hidden', next !== 'paused');
  document.body.classList.toggle('playing', next !== 'menu');
  document.body.classList.toggle('race-results', next === 'results');
  document.body.dataset.screen = next;
}
function startRace() {
  audio.init();
  race.start();
  autoQA = false;
  clearEffects();
  setScreen('race');
  resetInput();
  goTime = 0;
  wrongTime = 0;
  $('wrong-way').classList.add('hidden');
  $('countdown').classList.remove('hidden');
  $('countdown').querySelector('strong').textContent = '3';
  $('countdown').querySelector('span').textContent = '深呼吸，準備出發。';
  $('countdown').querySelector('small').textContent = preferences.autoThrottle
    ? '自動油門已開啟 · 輕轉方向，入彎煞車'
    : '綠燈亮起，踩下 W 或 ↑ 油門';
  updateHUD();
  focusDriving();
  cameraSnap();
}
function pauseRace() {
  if (race.pause()) {
    setScreen('paused');
    resetInput();
    $('resume').focus({ preventScroll: true });
  }
}
function resumeRace() {
  if (race.state !== 'paused') return;
  race.resume();
  audio.init();
  setScreen('race');
  focusDriving();
  accumulator = 0;
  lastFrame = performance.now();
}
function returnMenu() {
  race.reset();
  clearEffects();
  setScreen('menu');
  $('countdown').classList.add('hidden');
  $('wrong-way').classList.add('hidden');
  resetInput();
  $('start').focus({ preventScroll: true });
}
function toggleMute() {
  audio.init();
  muted = !muted;
  audio.setMuted(muted);
  storage.set('muted', muted);
  updateSoundButton();
  focusDriving();
}
$('start').onclick = startRace;
$('restart').onclick = startRace;
$('restart-pause').onclick = startRace;
$('resume').onclick = resumeRace;
$('back-menu').onclick = returnMenu;
$('results-menu').onclick = returnMenu;
$('pause').onclick = pauseRace;
function changeCamera() {
  cameraMode = 1 - cameraMode;
  storage.set('camera', cameraMode);
  $('camera-setting').value = String(cameraMode);
  toast(cameraMode ? '高位追逐視角' : '標準追逐視角', 1);
  focusDriving();
}
function rescue() {
  if (race.state !== 'racing') return;
  race.rescue();
  resetInput();
  cameraSnap();
  focusDriving();
}
$('camera-toggle').onclick = changeCamera;
$('rescue').onclick = rescue;

function syncPreferences() {
  $('sensitivity').value = String(preferences.sensitivity);
  $('auto-throttle').checked = preferences.autoThrottle;
  $('auto-toggle').setAttribute('aria-pressed', String(preferences.autoThrottle));
  $('auto-toggle').textContent = `自動油門：${preferences.autoThrottle ? '開' : '關'}`;
  $('touch-mode').value = preferences.touchMode;
  $('camera-setting').value = String(cameraMode);
  $('quality-setting').value = lowQuality ? 'eco' : 'hq';
  document.body.dataset.touchMode = preferences.touchMode;
  document.body.classList.toggle('manual-throttle', !preferences.autoThrottle);
  if (mobile) {
    document.querySelector('.menu-controls').innerHTML =
      `<span>${preferences.autoThrottle ? '自動油門' : '按住油門'} · ${preferences.touchMode === 'pad' ? '按住後左右滑動轉向' : '短按微調，長按轉彎'}</span><span>按住甩尾，蓄能後放開加速</span>`;
    $('pause-controls').textContent =
      '左右轉向 · 按住煞車減速 · 甩尾後放開加速。卡住時使用「回正」（+2 秒）。';
  }
}
function setAutoThrottle(value) {
  preferences.autoThrottle = value;
  storage.set('auto-throttle', value);
  syncPreferences();
}
$('auto-toggle').onclick = () => {
  setAutoThrottle(!preferences.autoThrottle);
  toast(preferences.autoThrottle ? '自動油門已開啟 · 按住煞車減速' : '自動油門已關閉 · W / ↑ 加速');
  focusDriving();
};
$('auto-throttle').onchange = (event) => setAutoThrottle(event.target.checked);
$('sensitivity').onchange = (event) => {
  preferences.sensitivity = Number(event.target.value);
  storage.set('sensitivity', preferences.sensitivity);
  resetInput();
};
$('touch-mode').onchange = (event) => {
  preferences.touchMode = event.target.value;
  storage.set('touch-mode', preferences.touchMode);
  resetInput();
  syncPreferences();
};
$('camera-setting').onchange = (event) => {
  cameraMode = Number(event.target.value);
  storage.set('camera', cameraMode);
  cameraSnap();
};
$('quality-setting').onchange = (event) => {
  lowQuality = event.target.value === 'eco';
  applyQuality();
};
function openDialog(id) {
  if (screen === 'race') pauseRace();
  resetInput();
  syncPreferences();
  $(id).showModal();
}
for (const id of ['settings', 'menu-settings', 'pause-settings']) {
  $(id).onclick = () => openDialog('settings-dialog');
}
$('help').onclick = () => openDialog('help-dialog');
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelectorAll('[data-close]').forEach((button) => {
    button.onclick = () => dialog.close();
  });
}
syncPreferences();
$('mute').onclick = toggleMute;
$('quality').onclick = () => {
  lowQuality = !lowQuality;
  applyQuality();
  syncPreferences();
  toast(lowQuality ? 'ECO · 省電畫質' : 'HQ · 高畫質');
  focusDriving();
};
$('fullscreen').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('此瀏覽器不支援全螢幕'));
  focusDriving();
};
document.querySelector('.brand').onclick = (e) => {
  e.preventDefault();
  if (screen === 'menu') return;
  if (screen === 'race') pauseRace();
  else if (screen === 'results') returnMenu();
};
window.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (document.querySelector('dialog[open]') || target?.closest('input, select, textarea')) return;
  if ((e.code === 'Enter' || e.code === 'Space') && target?.closest('button, a')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
    e.preventDefault();
  if (e.repeat) {
    if (screen === 'race') keys.add(e.code);
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'race') pauseRace();
    else if (screen === 'paused') resumeRace();
  } else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'Enter') {
    if (screen === 'menu' || screen === 'results') startRace();
    else if (screen === 'paused') resumeRace();
  } else if (e.code === 'KeyR' && screen === 'race') {
    rescue();
  } else if (e.code === 'KeyC') {
    changeCamera();
  }
  if (screen === 'race') keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  resetInput();
  if (screen === 'race') pauseRace();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'race') pauseRace();
});
// The kart faces local +Z: positive yaw turns toward the driver's left.
function input(dt) {
  if (autoQA) return race.aiInput(race.cars[0]);
  const direction =
    (touch.left || keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
    (touch.right || keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  if (race.state !== 'racing') steering.reset();
  const brake = touch.brake || keys.has('KeyS') || keys.has('ArrowDown');
  const steer =
    race.state !== 'racing'
      ? 0
      : touchControls.dragging && direction === 0
        ? steering.updateAnalog(dt, touchControls.axis, race.cars[0].speed, preferences.sensitivity)
        : steering.update(dt, direction, race.cars[0].speed, preferences.sensitivity);
  return {
    throttle:
      !brake &&
      (preferences.autoThrottle || touch.throttle || keys.has('KeyW') || keys.has('ArrowUp'))
        ? 1
        : 0,
    brake: brake ? 1 : 0,
    steer,
    drift: touch.drift || keys.has('Space'),
  };
}

// Track map is drawn from exactly the same centerline and car coordinates as the race.
const map = $('minimap'),
  ctx = map.getContext('2d'),
  xs = track.samples.map((f) => f.position.x),
  zs = track.samples.map((f) => f.position.z);
const minX = Math.min(...xs),
  maxX = Math.max(...xs),
  minZ = Math.min(...zs),
  maxZ = Math.max(...zs),
  mapScale = Math.min(255 / (maxX - minX), 215 / (maxZ - minZ));
const mapXY = (x, z) => [
  150 + (x - (minX + maxX) / 2) * mapScale,
  130 + (z - (minZ + maxZ) / 2) * mapScale,
];
function drawMap() {
  ctx.clearRect(0, 0, 300, 260);
  ctx.beginPath();
  for (let i = 0; i < track.samples.length; i += 3) {
    const p = track.samples[i].position,
      [x, y] = mapXY(p.x, p.z);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#16474c77';
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff1dcb0';
  ctx.stroke();
  const f = track.samples[0],
    [sx, sy] = mapXY(f.position.x, f.position.z);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-f.yaw);
  ctx.fillStyle = '#ffd4a5';
  ctx.fillRect(-9, -3, 18, 6);
  ctx.restore();
  for (let i = 5; i >= 0; i--) {
    const c = race.cars[i],
      [x, y] = mapXY(c.x, c.z);
    ctx.beginPath();
    ctx.arc(x, y, i === 0 ? 6.5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = c.hex;
    ctx.fill();
    ctx.strokeStyle = i === 0 ? '#fff5e7' : '#16474c';
    ctx.lineWidth = i === 0 ? 3 : 1.5;
    ctx.stroke();
  }
}
function updateHUD() {
  const c = race.cars[0],
    order = race.order(),
    place = order.findIndex((o) => o.id === 0) + 1;
  // Include the current bend so a straight after it does not hide the turn cue.
  let curve = 0;
  const lookStep = Math.round(8 + c.speed * 0.15);
  for (let i = 0; i < 5; i++) {
    const sample = track.samples[(c.index + i * lookStep) % track.count];
    if (Math.abs(sample.curvature) > Math.abs(curve)) curve = sample.curvature;
  }
  $('corner-arrow').textContent = Math.abs(curve) < 0.008 ? '↑' : curve > 0 ? '↰' : '↱';
  $('corner-text').textContent =
    c.boost > 0
      ? '加速中'
      : Math.abs(curve) < 0.008
        ? '前方直線'
        : Math.abs(curve) > 0.022
          ? '急彎 · 收油煞車'
          : '前方彎道';
  $('corner-hint').classList.toggle('sharp', Math.abs(curve) > 0.022);
  $('position').textContent = place;
  $('lap').textContent = c.lap;
  $('timer').textContent = formatTime(race.elapsed + race.penalty);
  $('speed').textContent = Math.round(c.speed * 3.6);
  $('speed-fill').style.width = `${Math.min(100, (c.speed / 43) * 100)}%`;
  $('drift-fill').style.width = `${(c.driftCharge / 2.8) * 100}%`;
  $('drift-fill').style.background = c.driftCharge > 1.5 ? '#ffb754' : '#75eff4';
  driftButton.classList.toggle('charged', c.driftCharge > 0.55);
  $('drift-label').textContent =
    c.boost > 0
      ? 'BOOST ↗ 加速中'
      : c.driftCharge > 1.5
        ? '超級加速就緒 · 放開甩尾'
        : c.driftCharge > 0.55
          ? '加速就緒 · 放開甩尾'
          : c.drifting
            ? 'DRIFT · 蓄能中'
            : mobile
              ? '按住甩尾，放開加速'
              : 'SPACE · 甩尾蓄能';
  if (c.lapTimes.length)
    $('best-lap').textContent = 'BEST LAP ' + formatTime(Math.min(...c.lapTimes));
  else $('best-lap').textContent = 'BEST LAP —';
  $('lap-hint').textContent = c.lap === 3 ? 'FINAL LAP · 最後一圈' : 'COASTLINE CUP';
  $('leaderboard').innerHTML = order
    .map(
      (o, i) =>
        `<div class="leader-row ${o.id === 0 ? 'player' : ''}"><span>${i + 1}</span><i style="background:${o.hex}"></i><b>${o.name}</b><span>${o.finished ? 'FIN' : o.id === 0 ? 'YOU' : Math.abs(Math.round(c.progress - o.progress)) + ' m'}</span></div>`,
    )
    .join('');
  drawMap();
}
function showResults() {
  setScreen('results');
  resetInput();
  $('countdown').classList.add('hidden');
  $('wrong-way').classList.add('hidden');
  const c = race.cars[0],
    order = race.order(),
    place = order.findIndex((o) => o.id === 0) + 1;
  $('result-place').textContent = place;
  $('result-suffix').textContent = ['', 'ST', 'ND', 'RD', 'TH', 'TH', 'TH'][place];
  $('result-kicker').textContent =
    place === 1 ? 'THE COAST IS YOURS.' : place <= 3 ? 'A PODIUM KIND OF DAY.' : 'WHAT A RIDE.';
  $('result-heading').textContent =
    place === 1 ? '海岸線，征服。' : place <= 3 ? '海風，為你喝采。' : '下一彎，更漂亮。';
  $('result-time').textContent = formatTime(c.finishTime);
  $('result-best').textContent = formatTime(Math.min(...c.lapTimes));
  $('result-drifts').textContent = c.drifts + ' 次';
  updateResultsList();
  const oldBest = storage.get('best', null);
  if (!oldBest || c.finishTime < oldBest) {
    storage.set('best', c.finishTime);
    $('new-record').textContent = '✳ NEW PERSONAL BEST · 新的個人紀錄';
    $('best-label').textContent = 'PERSONAL BEST ' + formatTime(c.finishTime);
  } else $('new-record').textContent = 'THE GOOD TIMES ARE MEASURED IN LAPS.';
  for (let i = 0; i < 80; i++) emit(c, 'confetti');
  soundCue('finish');
  $('restart').focus({ preventScroll: true });
}
function updateResultsList() {
  const order = race.order(),
    place = order.findIndex((c) => c.id === 0) + 1;
  $('result-place').textContent = place;
  $('result-suffix').textContent = ['', 'ST', 'ND', 'RD', 'TH', 'TH', 'TH'][place];
  $('results-list').innerHTML = order
    .map(
      (o, i) =>
        `<div class="result-row ${o.id === 0 ? 'player' : ''}"><span>${String(i + 1).padStart(2, '0')}</span><i style="background:${o.hex}"></i><b>${o.name}${o.id === 0 ? ' · YOU' : ''}</b><span>${o.finished ? formatTime(o.finishTime) : '距終點 ' + Math.max(0, Math.round(track.length * 3 - o.progress)) + ' m'}</span></div>`,
    )
    .join('');
}

function cameraTarget(time) {
  const c = race.cars[0];
  if (screen === 'menu') {
    const f = track.sampleDistance(-7),
      dx = f.tangent.x,
      dz = f.tangent.z,
      drift = reducedMotion ? 0 : Math.sin(time * 0.1) * 2;
    desiredPosition.set(
      c.x - dx * 19 + f.normal.x * (15 + drift),
      c.y + 11,
      c.z - dz * 19 + f.normal.z * (15 + drift),
    );
    desiredLook.set(c.x + dx * 26 - f.normal.x * 4, c.y + 3, c.z + dz * 26 - f.normal.z * 4);
  } else if (screen === 'results') {
    const angle = gameTime * 0.14;
    desiredPosition.set(c.x + Math.sin(angle) * 10, c.y + 6, c.z + Math.cos(angle) * 10);
    desiredLook.set(c.x, c.y + 0.9, c.z);
  } else {
    const velAngle = c.speed > 5 ? Math.atan2(c.vx, c.vz) : c.yaw;
    const angle = c.yaw + wrapAngle(velAngle - c.yaw) * 0.32;
    const portrait = mobile && innerHeight > innerWidth;
    const dist =
      (portrait ? 12.8 : mobile ? 11.5 : 10.2) +
      (cameraMode ? 4 : 0) +
      (c.boost > 0 && !reducedMotion ? 1.2 : 0);
    desiredPosition.set(
      c.x - Math.sin(angle) * dist,
      c.y + (cameraMode ? 8.5 : portrait ? 7.5 : mobile ? 5.8 : 4.5),
      c.z - Math.cos(angle) * dist,
    );
    const lookAhead = portrait ? 3.8 : 5;
    desiredLook.set(
      c.x + Math.sin(angle) * lookAhead,
      c.y + 1.1,
      c.z + Math.cos(angle) * lookAhead,
    );
  }
}
function cameraSnap() {
  cameraTarget(gameTime);
  camPosition.copy(desiredPosition);
  camLook.copy(desiredLook);
  camera.position.copy(camPosition);
  camera.lookAt(camLook);
}
cameraSnap();
function event(e) {
  if (e.type === 'countdown') {
    $('countdown').querySelector('strong').textContent = e.value;
    soundCue('countdown');
  } else if (e.type === 'go') {
    $('countdown').querySelector('strong').textContent = 'GO!';
    $('countdown').querySelector('span').textContent = '追著海風，出發。';
    $('countdown').querySelector('small').textContent = '';
    goTime = 1.1;
    soundCue('go');
  } else if (e.type === 'lap') {
    toast(e.lap === 3 ? 'FINAL LAP · 最後一圈！' : 'LAP 2 · 保持節奏', 2.2);
    soundCue('lap');
  } else if (e.type === 'boost') {
    toast(e.tier === 2 ? 'SUPER BOOST ↗ 超級加速' : 'DRIFT BOOST ↗ 甩尾加速', 1.3);
    soundCue('boost');
  } else if (e.type === 'pad') {
    toast('海風加速 ↗', 0.9);
    soundCue('boost');
  } else if (e.type === 'collision') soundCue('collision');
  else if (e.type === 'rescue') toast('已回正 · 完賽時間 +2 秒', 2);
  else if (e.type === 'finish') showResults();
}
const FIXED = 1 / 120;
function simulation(dt) {
  race.step(dt, input(dt));
  for (const e of race.drainEvents()) event(e);
}
function renderFrame(now) {
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(0.25, Math.max(0, raw));
  gameTime += dt;
  if (screen !== 'paused') {
    accumulator += dt;
    while (accumulator >= FIXED) {
      simulation(FIXED);
      accumulator -= FIXED;
    }
  }
  for (let i = 0; i < kartModels.length; i++) {
    const c = race.cars[i],
      near = kartModels[i],
      far = !!near.low && Math.hypot(c.x - race.cars[0].x, c.z - race.cars[0].z) > 24,
      model = far ? near.low : near;
    near.group.visible = !far;
    if (near.low) near.low.group.visible = far;
    model.group.position.set(c.x, c.y + 0.025, c.z);
    model.group.rotation.order = 'YXZ';
    model.group.rotation.y = c.yaw;
    model.group.rotation.x = -Math.asin(track.samples[c.index].tangent.y);
    model.update(screen === 'paused' ? 0 : dt, {
      speed: c.speed,
      steer: c.steer,
      drift: c.drifting ? c.driftCharge : 0,
      boost: c.boost,
      time: gameTime,
    });
  }
  if (screen !== 'paused') {
    world.update?.(dt, gameTime);
    particleTick += dt;
    if (particleTick > 0.035) {
      particleTick = 0;
      for (const c of race.cars)
        if (c.drifting && c.speed > 10) {
          emit(c);
          emit(c);
          addSkid(c);
        } else if (c.boost > 0) {
          emit(c);
        }
    }
    updateParticles(dt);
  }
  const c = race.cars[0];
  cameraTarget(gameTime);
  const blend = 1 - Math.exp(-dt * (screen === 'menu' ? 1.5 : screen === 'results' ? 2 : 7));
  camPosition.lerp(desiredPosition, blend);
  camLook.lerp(desiredLook, 1 - Math.exp(-dt * 10));
  camera.position.copy(camPosition);
  camera.lookAt(camLook);
  const baseFov = mobile && innerHeight > innerWidth ? 59 : 53;
  const desiredFov = c.boost > 0 && screen === 'race' && !reducedMotion ? baseFov + 8 : baseFov;
  camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
  $('boost-lines').style.opacity = c.boost > 0 && screen === 'race' && !reducedMotion ? '1' : '0';
  if (toastTime > 0) {
    toastTime -= dt;
    if (toastTime <= 0) $('toast').classList.remove('show');
  }
  if (goTime > 0 && screen === 'race') {
    goTime -= dt;
    if (goTime <= 0) $('countdown').classList.add('hidden');
  }
  if (screen === 'race' && race.state === 'racing') {
    const f = track.samples[c.index],
      diff = Math.abs(wrapAngle(c.yaw - f.yaw));
    wrongTime = diff > 2 && c.speed > 3 ? wrongTime + dt : 0;
    $('wrong-way').classList.toggle('hidden', wrongTime < 1.1);
  }
  audio.update(dt, {
    speed: c.speed,
    drift: c.drifting ? c.driftCharge : 0,
    boost: c.boost,
    racing: screen === 'race' && race.state === 'racing',
  });
  uiTick += dt;
  if (uiTick > 0.09) {
    uiTick = 0;
    if (screen === 'race') updateHUD();
    else if (screen === 'results') updateResultsList();
  }
  renderer.render(scene, camera);
  frames++;
  if (raw > 0 && raw < 1) frameTimes.push(raw * 1000);
  if (frameTimes.length > 240) frameTimes.shift();
  if (now - perfStart > 1000) {
    avgFPS = (frames * 1000) / (now - perfStart);
    fpsSamples.push(avgFPS);
    if (fpsSamples.length > 60) fpsSamples.shift();
    frames = 0;
    perfStart = now;
    // Keep the simulation responsive on integrated GPUs without altering track detail or UI resolution.
    if (avgFPS < 43 && gameTime > 3 && screen !== 'paused') {
      slowFrames++;
      if (slowFrames >= 2 && adaptiveScale > 0.55) {
        adaptiveScale = Math.max(0.55, adaptiveScale - 0.15);
        renderer.setPixelRatio(
          Math.min(devicePixelRatio, lowQuality ? 1 : mobile ? 1.35 : 1.65) * adaptiveScale,
        );
        slowFrames = 0;
      }
    } else slowFrames = 0;
    if (query.has('debug')) {
      $('diagnostics').classList.remove('hidden');
      $('diagnostics').textContent =
        `${avgFPS.toFixed(1)} FPS | ${renderer.info.render.calls} draws | ${renderer.info.render.triangles.toLocaleString()} tris\n${race.state} | ${Math.round(c.progress)} m | gate ${c.gate}/37`;
    }
  }
}
renderer.setAnimationLoop(renderFrame);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
$('game').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  pauseRace();
  toast('圖形連線中斷，請稍候。', 30);
});
$('game').addEventListener('webglcontextrestored', () => location.reload());

const gl = renderer.getContext(),
  gpuExtension = gl.getExtension('WEBGL_debug_renderer_info'),
  gpuName = gpuExtension ? gl.getParameter(gpuExtension.UNMASKED_RENDERER_WEBGL) : 'WebGL';
// Read-only telemetry and explicit QA controls make complete-race verification reproducible.
window.__COASTLINE = {
  get state() {
    return {
      screen,
      race: race.state,
      elapsed: race.elapsed,
      penalty: race.penalty,
      countdown: race.countdown,
      length: track.length,
      cars: race.cars.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        z: c.z,
        yaw: c.yaw,
        speed: c.speed,
        steer: c.steer,
        offset: c.offset,
        progress: c.progress,
        gate: c.gate,
        lap: c.lap,
        lapTimes: [...c.lapTimes],
        driftCharge: c.driftCharge,
        drifting: c.drifting,
        drifts: c.drifts,
        boost: c.boost,
        wallContact: c.wallContact,
        finished: c.finished,
        finishTime: c.finishTime,
      })),
      order: race.order().map((c) => c.id),
      quality: lowQuality ? 'eco' : 'hq',
      muted,
      graphics: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      fps: avgFPS,
      meanFPS: fpsSamples.reduce((a, b) => a + b, 0) / Math.max(1, fpsSamples.length),
      frameMs: frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length),
      renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
      steering: { heldSeconds: steering.heldSeconds, command: steering.value },
      controls: { ...preferences, touchAxis: touchControls.axis, touch: { ...touch }, cameraMode },
    };
  },
  start: startRace,
  pause: pauseRace,
  resume: resumeRace,
  restart: startRace,
  autoDrive(value = true) {
    autoQA = value;
  },
  simulate(seconds = 1) {
    if (!query.has('qa')) throw new Error('QA mode required');
    const n = Math.ceil(seconds / FIXED);
    for (let i = 0; i < n; i++) simulation(FIXED);
    cameraSnap();
    updateHUD();
    if (race.state !== 'countdown') {
      $('countdown').classList.add('hidden');
      goTime = 0;
    }
  },
  teleport(s, lane = 0, yawOffset = 0, speed = 0) {
    if (!query.has('qa')) throw new Error('QA mode required');
    const c = race.cars[0],
      f = track.sampleDistance(s);
    c.x = f.position.x + f.normal.x * lane;
    c.z = f.position.z + f.normal.z * lane;
    c.yaw = f.yaw + yawOffset;
    c.vx = Math.sin(c.yaw) * speed;
    c.vz = Math.cos(c.yaw) * speed;
    c.speed = speed;
    c.offset = lane;
    c.angular = 0;
    c.steer = 0;
    c.wallContact = 0;
    c.index = Math.floor(((((s / track.length) % 1) + 1) % 1) * track.count);
    c.prevFraction = (((s / track.length) % 1) + 1) % 1;
    c.progress = s;
    cameraSnap();
  },
  setInput(control, on) {
    if (!query.has('qa')) throw new Error('QA mode required');
    if (on) keys.add(control);
    else keys.delete(control);
  },
  captureView(t = 0.06) {
    if (!query.has('qa')) return;
    const f = track.sample(t);
    camera.position.set(
      f.position.x + f.normal.x * 16 - f.tangent.x * 10,
      f.position.y + 8,
      f.position.z + f.normal.z * 16 - f.tangent.z * 10,
    );
    camera.lookAt(f.position);
    renderer.render(scene, camera);
  },
};
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    $('loading').style.opacity = '0';
    setTimeout(() => $('loading').classList.add('hidden'), 550);
    window.dispatchEvent(new Event('coastline-ready'));
  }),
);
