import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Služby, ceny a hodiny sú v data.js (spoločné pre 3D balóny, cenník aj formulár).
   anchor = značka z Blendera, normal = smer, z ktorého je bod viditeľný,
   view = kam sa postaví kamera pri detaile. +Z = predok auta, +X = ľavý bok. */
const SERVICES = window.AUTO_MM.services.map((s) => ({ ...s }));
const tyreService = SERVICES.find((s) => s.anchor === 'wheelset');   // balloon on the tyre set, not on the car

const $ = (id) => document.getElementById(id);
const experience = $('experience');
const canvas = $('scene');
const intro = $('intro');
const servicesUI = $('services-ui');
const hotspotLayer = $('hotspots');
const chipsEl = $('chips');
const panel = $('panel');

/* ---------------- contact bubble ---------------- */
const contactBtn = $('contact-btn');
const contactPop = $('contact-pop');
function setContact(open) {
  contactPop.hidden = !open;
  contactBtn.setAttribute('aria-expanded', String(open));
}
contactBtn.addEventListener('click', (e) => { e.stopPropagation(); setContact(contactPop.hidden); });
document.addEventListener('click', (e) => { if (!contactPop.hidden && !contactPop.contains(e.target)) setContact(false); });

/* ---------------- service panel (works even without WebGL) ---------------- */
let focused = null;
function openService(s) {
  focused = s;
  $('panel-title').textContent = s.name;
  $('panel-desc').textContent = s.desc;
  $('panel-list').replaceChildren(...s.items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  $('panel-price').textContent = s.price;
  panel.hidden = false;
  document.body.classList.add('locked');
  chipsEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === s.id)));
  $('panel-close').focus({ preventScroll: true });
}
function closeService() {
  if (!focused) return;
  const id = focused.id;
  focused = null;
  panel.hidden = true;
  document.body.classList.remove('locked');
  chipsEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  chipsEl.querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: true });
}
$('panel-close').addEventListener('click', closeService);

// "Objednať túto službu": close the panel, preselect the service in the form, scroll to it
$('panel-book').addEventListener('click', (e) => {
  e.preventDefault();
  const id = focused?.id;
  closeService();
  window.dispatchEvent(new CustomEvent('automm:book', { detail: { id } }));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeService(); setContact(false); }
});

for (const s of SERVICES) {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.dataset.id = s.id;
  chip.textContent = s.name;
  chip.setAttribute('role', 'listitem');
  chip.setAttribute('aria-pressed', 'false');
  chip.addEventListener('click', () => openService(s));
  chipsEl.append(chip);

  const hs = document.createElement('button');
  hs.className = 'hotspot hidden';
  hs.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="label"></span>';
  hs.querySelector('.label').textContent = s.name;
  hs.setAttribute('aria-label', `${s.name} – zobraziť detail`);
  hs.tabIndex = -1;
  hs.addEventListener('click', () => openService(s));
  hotspotLayer.append(hs);
  s.el = hs;
}

/* ---------------- three.js scene ---------------- */
/* If 3D can't run (no WebGL, model fails, too slow), site.js shows plain service buttons instead. */
const D3 = window.AUTO_MM;
let dead = false;
function fail3d(reason) {
  if (dead) return;
  dead = true;
  D3.failed3d = reason;
  D3.no3d?.(reason);
}
D3.progress3d = performance.now();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  fail3d('webgl');
  throw err;
}
canvas.addEventListener('webglcontextlost', () => fail3d('lost'));
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const DARK = '#0a0202';
const BLUE = '#1441b5';
const scene = new THREE.Scene();
scene.background = new THREE.Color(DARK);
scene.fog = new THREE.Fog(DARK, 24, 50);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);

/* ---------------- garage ---------------- */
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, base, alpha, count) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// small workshop: back wall + two side walls, open towards the viewer.
// Walls and ceiling are one-sided, so when the camera is outside (phones) they simply disappear.
const GW = 14, GH = 4.6, BACK = -5.5, FRONT = 12;
const GD = FRONT - BACK, GZ = (FRONT + BACK) / 2;
const DRIVE = 2.6;                 // how far the car drives toward the viewer (= lift position)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // stable "random" layout

function buildGarage() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry);

  // polished concrete floor (bigger than the room, the fog hides its edges)
  const floorTex = canvasTex(512, 512, (c, w, h) => {
    speckle(c, w, h, '#2b2525', 0.06, 9000);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
  }, [10, 10]);
  add(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }), 0, 0, 6, -Math.PI / 2);

  // blue service bay around the lift
  const blueLine = new THREE.MeshBasicMaterial({ color: BLUE });
  const bw = 4.6, bl = 6.6;
  add(new THREE.PlaneGeometry(bw, 0.12), blueLine, 0, 0.005, DRIVE + bl / 2, -Math.PI / 2);
  add(new THREE.PlaneGeometry(bw, 0.12), blueLine, 0, 0.005, DRIVE - bl / 2, -Math.PI / 2);
  for (const x of [-bw / 2, bw / 2]) add(new THREE.PlaneGeometry(0.12, bl), blueLine, x, 0.005, DRIVE, -Math.PI / 2);

  // light grey painted walls (#D6D4D4) with a little texture so they don't look flat
  const wallTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d6d4d4'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = `rgba(60,50,50,${Math.random() * 0.06})`;
      c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, [3, 1]);
  const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  add(new THREE.PlaneGeometry(GW, GH), wall, 0, GH / 2, BACK);                               // back
  add(new THREE.PlaneGeometry(GD, GH), wall, -GW / 2, GH / 2, GZ, 0, Math.PI / 2);           // left
  add(new THREE.PlaneGeometry(GD, GH), wall, GW / 2, GH / 2, GZ, 0, -Math.PI / 2);           // right
  add(new THREE.PlaneGeometry(GW, GD), new THREE.MeshStandardMaterial({ color: '#141010', roughness: 1 }), 0, GH, GZ, Math.PI / 2);

  // blue band around the walls
  const band = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.55, emissive: BLUE, emissiveIntensity: 0.25 });
  add(new THREE.PlaneGeometry(GW, 0.6), band, 0, 1.25, BACK + 0.01);
  add(new THREE.PlaneGeometry(GD, 0.6), band, -GW / 2 + 0.01, 1.25, GZ, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(GD, 0.6), band, GW / 2 - 0.01, 1.25, GZ, 0, -Math.PI / 2);

  // roller door behind the car (where it drove in)
  const doorTex = canvasTex(64, 256, (c, w, h) => {
    c.fillStyle = '#4a4547'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, y + 3, w, 2); }
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2224', roughness: 0.6 });
  add(new THREE.PlaneGeometry(3.6, 3.3), new THREE.MeshStandardMaterial({ map: doorTex, metalness: 0.55, roughness: 0.45 }), 0, 1.65, BACK + 0.02);
  box(4.0, 0.26, 0.16, dark, 0, 3.43, BACK + 0.08);
  for (const dx of [-1.92, 1.92]) box(0.16, 3.4, 0.16, dark, dx, 1.7, BACK + 0.08);

  // ceiling: LED light bars (HDR white so the car paint reflects them)
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) });
  for (const x of [-1.1, 1.1]) box(0.14, 0.05, 4.6, led, x, GH - 0.03, DRIVE);
  for (const x of [-4.6, 4.6]) box(0.14, 0.05, 3.6, led, x, GH - 0.03, 0.5);

  const steelTop = new THREE.MeshStandardMaterial({ color: '#2b2626', metalness: 0.6, roughness: 0.35 });
  const cabTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#0c2a78'; c.fillRect(0, 0, w, h);          // darker shade of the brand blue
    for (let i = 1; i < 5; i++) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, (h / 5) * i - 2, w, 3); }
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 5; i++) c.fillRect(w / 2 - 30, (h / 5) * i + h / 10 - 2, 60, 4);
  });
  const cab = new THREE.MeshStandardMaterial({ map: cabTex, metalness: 0.4, roughness: 0.4 });
  const cabSide = new THREE.MeshStandardMaterial({ color: '#0c2a78', metalness: 0.4, roughness: 0.45 });
  // box with the drawer texture only on the front (+Z of the box)
  const drawers = (w, h, d, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [cabSide, cabSide, steelTop, cabSide, cab, cabSide]);
    m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
  };

  // shelving unit with tools and boxes on the back wall (left of the door)
  {
    const sx = -4.4, sz = BACK + 0.3, sw = 2.4, sd = 0.5;
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3a3436', metalness: 0.5, roughness: 0.5 });
    for (const dx of [-sw / 2, sw / 2]) for (const dz of [-sd / 2, sd / 2]) box(0.05, 2.3, 0.05, frameMat, sx + dx, 1.15, sz + dz);
    const boxMats = ['#1441b5', '#0c2a78', '#ffffff', '#3a3436', '#d6d4d4'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    const canGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.24, 10);
    for (const y of [0.12, 0.72, 1.32, 1.92]) {
      box(sw + 0.04, 0.03, sd, steelTop, sx, y, sz);
      let x = sx - sw / 2 + 0.08;
      while (x < sx + sw / 2 - 0.25) {
        if (rnd() < 0.3) {                       // a row of oil cans
          const n = 2 + Math.floor(rnd() * 3);
          const mat = boxMats[Math.floor(rnd() * 3)];
          for (let i = 0; i < n; i++) add(canGeo, mat, x + 0.08 + i * 0.16, y + 0.135, sz);
          x += n * 0.16 + 0.08;
        } else {                                  // storage box / toolbox
          const w = 0.3 + rnd() * 0.35, h = 0.18 + rnd() * 0.3;
          box(w, h, 0.38, boxMats[Math.floor(rnd() * boxMats.length)], x + w / 2, y + 0.015 + h / 2, sz);
          x += w + 0.06;
        }
      }
    }
  }

  // tall tool cabinet on the back wall, right of the door
  drawers(1.4, 1.2, 0.6, 3.6, 0.6, BACK + 0.32, 0);
  box(1.44, 0.04, 0.64, steelTop, 3.6, 1.22, BACK + 0.32);

  // workbench with a pegboard of tools on the left wall
  {
    const wx = -GW / 2 + 0.4, wz = 1.8, wl = 2.6;
    box(0.75, 0.06, wl, steelTop, wx, 0.92, wz);
    drawers(0.65, 0.84, 0.9, wx, 0.44, wz - wl / 2 + 0.5, Math.PI / 2);
    for (const dz of [0.2, wl - 0.1]) box(0.06, 0.9, 0.6, steelTop, wx, 0.45, wz - wl / 2 + dz);
    box(0.7, 0.04, wl - 1.0, steelTop, wx, 0.16, wz + 0.45);
    // vice + a toolbox on the bench
    box(0.18, 0.14, 0.26, new THREE.MeshStandardMaterial({ color: '#1441b5', metalness: 0.5, roughness: 0.4 }), wx + 0.12, 1.02, wz + 0.9);
    box(0.32, 0.2, 0.55, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), wx - 0.05, 1.05, wz - 0.5);
    const pegTex = canvasTex(512, 220, (c, w, h) => {
      c.fillStyle = '#3a3436'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      for (let x = 8; x < w; x += 16) for (let y = 8; y < h; y += 16) c.fillRect(x, y, 3, 3);
      c.fillStyle = '#c9c9cc'; c.strokeStyle = '#c9c9cc'; c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {                              // spanners, small to big
        const x = 30 + i * 22, len = 60 + i * 9;
        c.lineWidth = 6; c.beginPath(); c.moveTo(x, 30); c.lineTo(x, 30 + len); c.stroke();
        c.beginPath(); c.arc(x, 26, 9, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#1441b5';                                     // screwdrivers
      for (let i = 0; i < 5; i++) { c.fillRect(220 + i * 22, 30, 12, 40); c.fillStyle = '#c9c9cc'; c.fillRect(224 + i * 22, 70, 4, 50 + i * 6); c.fillStyle = '#1441b5'; }
      c.fillStyle = '#ffffff'; c.fillRect(360, 40, 70, 18); c.fillStyle = '#c9c9cc'; c.fillRect(390, 58, 10, 90);   // hammer
      c.fillStyle = '#1441b5'; c.beginPath(); c.arc(470, 110, 34, 0, Math.PI * 2); c.fill();                       // tape / cable reel
      c.fillStyle = '#3a3436'; c.beginPath(); c.arc(470, 110, 14, 0, Math.PI * 2); c.fill();
    });
    pegTex.wrapS = pegTex.wrapT = THREE.ClampToEdgeWrapping;
    add(new THREE.PlaneGeometry(wl, 1.1), new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.8 }), -GW / 2 + 0.03, 1.75, wz, 0, Math.PI / 2);
    // pendant lamp over the bench
    box(0.3, 0.04, 1.4, led, wx + 0.3, GH - 1.2, wz);
    box(0.36, 0.08, 1.46, steelTop, wx + 0.3, GH - 1.15, wz);
    for (const dz of [-0.6, 0.6]) box(0.02, 1.15, 0.02, steelTop, wx + 0.3, GH - 0.57, wz + dz);
  }

  // rolling tool cart
  {
    const cx = -5.4, cz = 4.6, ry = 0.4;
    const cart = new THREE.Group();
    cart.position.set(cx, 0, cz); cart.rotation.y = ry; g.add(cart);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); cart.add(m); };
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.5), [cabSide, cabSide, steelTop, cabSide, cab, cabSide]);
    front.position.y = 0.48; cart.add(front);
    part(new THREE.BoxGeometry(0.86, 0.04, 0.54), steelTop, 0, 0.81, 0);
    part(new THREE.BoxGeometry(0.03, 0.03, 0.54), steelTop, 0.47, 0.95, 0);     // handle
    for (const z of [-0.25, 0.25]) part(new THREE.BoxGeometry(0.05, 0.03, 0.03), steelTop, 0.45, 0.95, z);
    for (const z of [-0.25, 0.25]) part(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), steelTop, 0.45, 0.88, z);
    const wheelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10);
    for (const x of [-0.33, 0.33]) for (const z of [-0.2, 0.2]) {
      const w = new THREE.Mesh(wheelGeo, steelTop); w.position.set(x, 0.07, z); w.rotation.x = Math.PI / 2; cart.add(w);
    }
    // a few tools on top
    part(new THREE.BoxGeometry(0.3, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: '#c9c9cc', metalness: 0.9, roughness: 0.3 }), -0.15, 0.855, 0.1);
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#1441b5', roughness: 0.4 }), 0.18, 0.93, -0.12);
  }

  // painted name on the left wall
  const nameTex = canvasTex(1024, 160, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.font = '700 120px "Space Grotesk", Arial, sans-serif';
    c.textBaseline = 'middle'; c.fillText('AUTO MM SERVIS', 10, h / 2);
  });
  nameTex.wrapS = nameTex.wrapT = THREE.ClampToEdgeWrapping;
  add(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, opacity: 0.9 }), -GW / 2 + 0.02, 3.35, -1.2, 0, Math.PI / 2);
  return mergeStatic(g);
}

// fewer draw calls for phones: merge all static meshes that share a material into one mesh
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const out = new THREE.Group();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (Array.isArray(o.material)) { out.add(new THREE.Mesh(geo, o.material)); return; }   // keeps its groups
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
  });
  for (const [mat, geos] of byMat) out.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
  return out;
}

const pmrem = new THREE.PMREMGenerator(renderer);
const garage = buildGarage();
// reflections: render the lit garage into an environment map (car paint reflects the LED strips)
{
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(DARK);
  envScene.add(new THREE.AmbientLight('#ffffff', 1.6));
  garage.position.y = -1.1;                       // capture from roughly car height
  envScene.add(garage);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  garage.position.y = 0;
}
scene.add(garage);
scene.environmentIntensity = 1.0;

scene.add(new THREE.HemisphereLight('#ffffff', DARK, 0.9));
const key = new THREE.DirectionalLight('#ffffff', 1.4);
key.position.set(2, 7, 4);
scene.add(key);
const fill = new THREE.DirectionalLight('#dfe6ff', 0.7);
fill.position.set(-5, 3, -4);
scene.add(fill);

/* soft contact shadow under the car */
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 128, 10, 64, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  return new THREE.CanvasTexture(c);
}

const car = new THREE.Group();
scene.add(car);
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.7, 5.6),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.005;
car.add(shadow);

const wheels = [];
const WHEEL_R = 0.337;
const anchorsLocal = {};

// soft pool of light from the ceiling onto the lift (no shadow map = cheap on phones)
const ceilingSpot = new THREE.SpotLight('#ffffff', 28, 12, 0.75, 0.7, 1.4);
ceilingSpot.position.set(0, GH - 0.1, DRIVE);
ceilingSpot.target.position.set(0, 0, DRIVE);
scene.add(ceilingSpot, ceilingSpot.target);

/* ---------------- two-post lift (simple boxes + cylinders) ----------------
   Intro: arms swung out of the way, car drives in. Services: arms swing under the car and lift it. */
const LIFT_H = 0.6;                       // how high the car goes up
const POST_X = 1.75;
const lift = new THREE.Group();
lift.position.z = DRIVE;
scene.add(lift);
const liftArms = [];
const liftCarriage = new THREE.Group();
{
  const liftBlue = new THREE.MeshStandardMaterial({ color: BLUE, metalness: 0.35, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: '#a7a7ad', metalness: 0.85, roughness: 0.3 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#2b2626', metalness: 0.6, roughness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
  const postGrey = new THREE.MeshStandardMaterial({ color: '#4a4a52', metalness: 0.5, roughness: 0.45 });
  const part = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  for (const side of [-1, 1]) {
    part(lift, new THREE.BoxGeometry(0.3, 3.7, 0.4), postGrey, side * POST_X, 1.85, 0);           // post
    part(lift, new THREE.BoxGeometry(0.62, 0.05, 0.75), darkSteel, side * POST_X, 0.025, 0);      // base plate
    part(lift, new THREE.BoxGeometry(0.04, 3.2, 0.12), darkSteel, side * (POST_X - 0.16), 1.85, 0); // slide rail
    part(liftCarriage, new THREE.BoxGeometry(0.16, 0.6, 0.44), steel, side * (POST_X - 0.24), 0.36, 0);
    for (const zs of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (POST_X - 0.28), 0.1, zs * 0.14);
      liftCarriage.add(pivot);
      const L = 1.3;
      const armGeo = new THREE.BoxGeometry(L, 0.07, 0.13).translate(L / 2, 0, 0);
      pivot.add(new THREE.Mesh(armGeo, steel));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), darkSteel);
      pad.position.set(L - 0.08, 0.06, 0);
      pivot.add(pad);
      // swung in: towards the lifting point under the sill; swung out: along the post, clear of the wheels
      const tx = side * 0.62 - pivot.position.x, tz = zs * 1.0 - pivot.position.z;
      liftArms.push({ pivot, out: Math.atan2(-zs, 0), in: Math.atan2(-tz, tx) });
    }
  }
  lift.add(liftCarriage);
  part(lift, new THREE.BoxGeometry(POST_X * 2 + 0.3, 0.18, 0.3), liftBlue, 0, 3.62, 0);           // top beam
  part(lift, new THREE.BoxGeometry(0.06, 0.3, 0.22), yellow, POST_X + 0.18, 1.3, 0.05);           // control box
  part(lift, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), new THREE.MeshBasicMaterial({ color: '#1441b5' }), POST_X + 0.215, 1.36, 0.05).rotation.z = Math.PI / 2;
}

/* ---------------- set of 4 wheels leaning on a tyre stand next to the car ----------------
   Hover/tap highlights them; click opens the "Prezúvanie pneumatík" service like the balloons. */
const wheelSet = new THREE.Group();
scene.add(wheelSet);          // placed in resize(): beside the car on wide screens, in front of it on phones
const wheelSetMeshes = [];
const tyreMat = new THREE.MeshStandardMaterial({ color: '#141212', roughness: 0.85, emissive: BLUE, emissiveIntensity: 0 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#c9cbd0', metalness: 0.9, roughness: 0.28, emissive: BLUE, emissiveIntensity: 0 });
{
  const rimTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#c9cbd0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1818'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d8dade'; c.lineCap = 'round';
    for (let i = 0; i < 5; i++) {                      // 5 double spokes
      const a = (i / 5) * Math.PI * 2;
      for (const da of [-0.12, 0.12]) {
        c.lineWidth = 9; c.beginPath();
        c.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14);
        c.lineTo(64 + Math.cos(a + da) * 58, 64 + Math.sin(a + da) * 58); c.stroke();
      }
    }
    c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 59, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#d8dade'; c.beginPath(); c.arc(64, 64, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1441b5'; c.beginPath(); c.arc(64, 64, 9, 0, Math.PI * 2); c.fill();
  });
  const rimFace = new THREE.MeshStandardMaterial({ map: rimTex, metalness: 0.8, roughness: 0.3, emissive: BLUE, emissiveIntensity: 0 });
  const tyreGeo = new THREE.TorusGeometry(0.255, 0.09, 10, 28).scale(1, 1, 1.3);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20).rotateX(Math.PI / 2);
  const stand = new THREE.MeshStandardMaterial({ color: '#2b2626', metalness: 0.6, roughness: 0.4 });
  // 4 wheels standing in a row on a tyre stand, all leaning towards its end frame (-Z)
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group();
    w.position.set(0, 0.36, (i - 1.5) * 0.28 + 0.06);
    w.rotation.x = -0.16;
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    const rim = new THREE.Mesh(rimGeo, [rimMat, rimFace, rimFace]);
    w.add(tyre, rim);
    wheelSet.add(w);
    wheelSetMeshes.push(tyre, rim);
  }
  const rail = (geo, x, y, z) => { const m = new THREE.Mesh(geo, stand); m.position.set(x, y, z); wheelSet.add(m); };
  for (const x of [-0.2, 0.2]) {
    rail(new THREE.BoxGeometry(0.04, 0.04, 1.45), x, 0.02, 0);                // floor rails
    rail(new THREE.BoxGeometry(0.04, 0.62, 0.04), x, 0.31, -0.7);            // end frame
  }
  rail(new THREE.BoxGeometry(0.44, 0.04, 0.04), 0, 0.6, -0.7);
  rail(new THREE.BoxGeometry(0.44, 0.04, 0.04), 0, 0.3, -0.7);
  // invisible, slightly bigger box so the whole set is easy to hit with a finger
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.42, 0);
  wheelSet.add(hit);
  wheelSetMeshes.push(hit);
}
const wheelGlowMats = [rimMat, wheelSetMeshes[1].material[1]];   // tyres stay black, only the rims light up

/* ---------------- load model ---------------- */
const draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load('assets/car.glb', (gltf) => {
  const model = gltf.scene;
  car.add(model);
  // blue metallic paint: metal base with fine flakes + smooth clear coat on top
  const flakes = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 128 + (Math.random() - 0.5) * 110;
      img.data[i + 1] = 128 + (Math.random() - 0.5) * 110;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(24, 24);
    return t;
  })();
  const paintProps = {
    color: BLUE, metalness: 0.75, roughness: 0.33, envMapIntensity: 2.2,
    clearcoat: 1.0, clearcoatRoughness: 0.06
  };
  const paint = new THREE.MeshPhysicalMaterial(paintProps);
  const paintFlakes = new THREE.MeshPhysicalMaterial({ ...paintProps, normalMap: flakes, normalScale: new THREE.Vector2(0.35, 0.35) });
  model.traverse((o) => {
    if (o.isMesh) {
      const mat = o.geometry.attributes.uv ? paintFlakes : paint;   // flakes need UVs
      if (Array.isArray(o.material)) o.material = o.material.map((m) => (m.name === 'Paint' ? mat : m));
      else if (o.material.name === 'Paint') o.material = mat;
    }
    if (o.name.startsWith('Wheel_')) wheels.push({ obj: o, base: o.rotation.x });
    if (o.name.startsWith('hs_')) anchorsLocal[o.name] = o.position.clone();
  });
  const bl = model.getObjectByName('Wheel_BL');
  const vy = anchorsLocal.hs_vyfuk;
  for (const s of SERVICES) {
    if (s.id === 'brzdy') s.local = bl ? bl.position.clone().add(new THREE.Vector3(0.23, 0.08, 0.1)) : new THREE.Vector3(1, 0.42, -1.25);
    else if (s.id === 'vyfuk') {
      // the exhaust itself faces backwards and is hidden in the services view, so the balloon
      // sits on the visible rear-left corner of the bumper; the camera still flies to the exhaust
      s.focus = vy ? new THREE.Vector3(Math.abs(vy.x), vy.y, vy.z) : new THREE.Vector3(0.77, 0.36, -2.36);
      s.local = new THREE.Vector3(0.86, 0.5, s.focus.z + 0.18);
    }
    else if (s.anchor === 'wheelset') { s.obj = wheelSet; s.local = new THREE.Vector3(0.05, 0.78, 0); }
    else s.local = anchorsLocal[s.anchor]?.clone() ?? new THREE.Vector3(0, 0.6, 0);
    s.normalV = new THREE.Vector3(...s.normal).normalize();
  }
  $('loader').classList.add('done');
  D3.ready3d = true;
}, (xhr) => {
  D3.progress3d = performance.now();
  if (xhr.total) {
    const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
    $('loader-fill').style.width = pct + '%';
    $('loader-text').textContent = `Načítavam 3D model… ${pct} %`;
  }
}, () => fail3d('model'));

/* ---------------- scroll timeline ---------------- */

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

let fitScale = 1, fitIntro = 1, portrait = 0;
function cameraFromScroll(p, outPos, outLook) {
  const d = ease(seg(p, 0, 0.55));
  const o = ease(seg(p, 0.55, 0.9));
  const carZ = DRIVE * d;
  // A: front view, car drives towards us (camera backs off slower than the car comes)
  const posA = v3(0, 0.85, 5.2).lerp(v3(0, 0.78, 6.2), d);
  const lookA = v3(0, 0.62, carZ);
  // B: orbit to a 3/4 front-left view for the services
  // on portrait phones look more from the front (the car is narrower on screen) and
  // raise the car in the frame so it sits above the services list at the bottom
  const posB = v3(5.1, 2.05 + LIFT_H * 0.5, DRIVE + 5.3).lerp(v3(3.0, 2.4 + LIFT_H * 0.5, DRIVE + 6.2), portrait);
  const lookB = v3(0, 0.3 + LIFT_H * 0.7 - 0.15 * portrait, DRIVE + 0.25);
  // wide screens: pan a little so the car sits right of centre and the tyre set has room on the left
  const pan = v3(-0.45, 0, 0.45).multiplyScalar(1 - portrait);
  posB.add(pan); lookB.add(pan);
  // portrait screens: the intro shows the car lower in the frame, under the title
  lookA.y += (fitIntro - 1) * 0.55;
  outLook.copy(lookA).lerp(lookB, o);
  outPos.copy(posA).lerp(posB, o);
  // keep the car filling the frame on narrow (portrait) screens
  const fit = fitIntro + (fitScale - fitIntro) * o;
  outPos.sub(outLook).multiplyScalar(fit).add(outLook);
  return carZ;
}

/* ---------------- one-gesture transition: intro <-> services ----------------
   One scroll / swipe / key press plays the whole drive automatically.
   Normal page scrolling only starts once the services view is reached. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DURATION = reduceMotion ? 700 : 2600;
let stageState = window.scrollY > 10 ? 'services' : 'intro';
let progress = stageState === 'services' ? 1 : 0;
let anim = null;

function goTo(state) {
  if (anim || state === stageState || focused) return;
  stageState = state;
  anim = { from: progress, to: state === 'services' ? 1 : 0, start: performance.now() };
}
function stepAnim(now) {
  if (!anim) return;
  const t = clamp01((now - anim.start) / DURATION);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // ease in-out
  progress = anim.from + (anim.to - anim.from) * e;
  if (t >= 1) anim = null;
}
const atTop = () => window.scrollY <= 2;

window.addEventListener('wheel', (e) => {
  if (focused || dead) return;
  if (anim || stageState === 'intro') e.preventDefault();
  if (anim) return;
  if (stageState === 'intro' && e.deltaY > 0) goTo('services');
  else if (stageState === 'services' && e.deltaY < 0 && atTop()) { e.preventDefault(); goTo('intro'); }
}, { passive: false });

let touchY = null;
window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (focused || dead || touchY === null) return;
  const dy = touchY - e.touches[0].clientY;          // > 0: finger moves up = scroll down
  if (anim || stageState === 'intro') e.preventDefault();
  if (anim) return;
  if (stageState === 'intro' && dy > 12) { goTo('services'); touchY = null; }
  else if (stageState === 'services' && dy < -12 && atTop()) { e.preventDefault(); goTo('intro'); touchY = null; }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (focused || dead || e.target.closest('input, textarea, [contenteditable]')) return;
  const down = ['ArrowDown', 'PageDown', ' '].includes(e.key);
  const up = ['ArrowUp', 'PageUp'].includes(e.key);
  if (anim && (down || up)) { e.preventDefault(); return; }
  if (stageState === 'intro' && down) { e.preventDefault(); goTo('services'); }
  else if (stageState === 'services' && up && atTop()) { e.preventDefault(); goTo('intro'); }
});

// dragging the scrollbar past the stage: jump straight to the services view
window.addEventListener('scroll', () => {
  if (stageState === 'intro' && !anim && window.scrollY > 40) { stageState = 'services'; progress = 1; }
}, { passive: true });

$('go-services').addEventListener('click', () => goTo('services'));

/* ---------------- title flies into the top-left corner ---------------- */
const heroTitle = $('hero-title');
const brand = $('brand');
const brandText = $('brand-text');
const fadeEls = [...document.querySelectorAll('.intro .fade')];
let titleMove = null;
function measureTitle() {
  heroTitle.style.transform = 'none';
  const a = heroTitle.getBoundingClientRect();
  const b = brandText.getBoundingClientRect();
  // fit by text height so the glyphs land on the small label
  const s = b.height / a.height;
  titleMove = { dx: b.left - a.left, dy: b.top - a.top - (a.height * s - b.height) / 2, s };
}
document.fonts?.ready.then(measureTitle);
window.addEventListener('resize', measureTitle);
measureTitle();

brand.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function updateTitle(p) {
  const t = ease(seg(p, 0.04, 0.62));
  if (titleMove) {
    const sc = 1 + (titleMove.s - 1) * t;
    heroTitle.style.transform = `translate(${titleMove.dx * t}px, ${titleMove.dy * t}px) scale(${sc})`;
  }
  const docked = t > 0.985;
  heroTitle.classList.toggle('hidden', docked);
  brand.classList.toggle('show', docked);
  brand.tabIndex = docked ? 0 : -1;
  const fade = String(1 - seg(p, 0.03, 0.2));
  for (const el of fadeEls) el.style.opacity = fade;
}

/* the tyre set must stay in free space of the services view: left of the car on wide screens,
   on the empty floor in front of the car on phones (rims turned towards the camera) */
const WS_WIDE = { pos: v3(-3.05, 0, 4.3), ry: 0.39, view: [3.7, 1.7, 2.0] };
const WS_TALL = { pos: v3(1.35, 0, 7.0), ry: -0.26, view: [2.6, 2.6, 4.6] };
function placeWheelSet() {
  const t = portrait;
  wheelSet.position.copy(WS_WIDE.pos).lerp(WS_TALL.pos, t);
  wheelSet.rotation.y = WS_WIDE.ry + (WS_TALL.ry - WS_WIDE.ry) * t;
  wheelSet.updateMatrixWorld();
  if (tyreService) tyreService.view = WS_WIDE.view.map((v, i) => v + (WS_TALL.view[i] - v) * t);
}

/* ---------------- resize ---------------- */
let W = 0, H = 0;
function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  fitScale = Math.max(1, Math.pow(1.5 / camera.aspect, 0.82));
  fitIntro = Math.max(1, Math.pow(1.5 / camera.aspect, 0.42));
  portrait = clamp01((1 - camera.aspect) / 0.5);          // 0 = landscape, 1 = tall phone
  placeWheelSet();
}
window.addEventListener('resize', resize);
resize();

/* ---------------- tyre set: hover, tap, click ---------------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let wheelHover = false, balloonHover = false, glow = 0;
const canPick = () => !!tyreService && stageState === 'services' && !anim && progress > 0.86 && !focused;
function overWheels(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(wheelSetMeshes, false).length > 0;
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  wheelHover = canPick() && overWheels(e);
  canvas.style.cursor = wheelHover ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => { wheelHover = false; canvas.style.cursor = ''; });
canvas.addEventListener('click', (e) => {
  if (canPick() && overWheels(e)) { wheelHover = false; canvas.style.cursor = ''; openService(tyreService); }
});
if (tyreService) {
  tyreService.el.addEventListener('pointerenter', () => { balloonHover = true; });
  tyreService.el.addEventListener('pointerleave', () => { balloonHover = false; });
}

/* ---------------- weak devices: lower the resolution, give up on 3D if it is still a slideshow ---------------- */
const perf = { t: 0, n: 0, stage: 0 };
function watchSpeed(raw) {
  if (!D3.ready3d || perf.stage > 1 || document.hidden) return;
  perf.t += raw; perf.n++;
  if (perf.t < 3) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  if (perf.stage === 0 && fps < 24) { renderer.setPixelRatio(1); resize(); perf.stage = 1; }
  else if (perf.stage === 1 && fps < 7) fail3d('slow');
  else perf.stage = 2;                 // fast enough, stop measuring
}

/* ---------------- render loop ---------------- */
const camPos = v3(0, 0.85, 5.2), camLook = v3(0, 0.62, 0);
const tgtPos = v3(), tgtLook = v3();
let carZ = 0, lastCarZ = 0, shiftX = 0, shiftY = 0;
const tmp = v3(), toCam = v3();
const clock = new THREE.Clock();

function frame() {
  if (D3.failed3d) dead = true;          // site.js may switch to the fallback (timeout)
  if (dead) return;
  const raw = clock.getDelta();
  watchSpeed(raw);
  const dt = Math.min(raw, 0.05);
  stepAnim(performance.now());
  const p = progress;
  const k = 1 - Math.exp(-dt * 5);

  const targetCarZ = cameraFromScroll(p, tgtPos, tgtLook);
  carZ += (targetCarZ - carZ) * k;
  car.position.z = carZ;
  const roll = (carZ - lastCarZ) / WHEEL_R;
  for (const w of wheels) w.obj.rotation.x += roll;
  lastCarZ = carZ;

  // lift: arms swing under the parked car, then it goes up
  const swing = ease(seg(p, 0.56, 0.7));
  const up = ease(seg(p, 0.68, 0.97));
  for (const a of liftArms) a.pivot.rotation.y = a.out + (a.in - a.out) * swing;
  liftCarriage.position.y = car.position.y = LIFT_H * up;
  shadow.position.y = 0.005 - car.position.y;          // the shadow stays on the floor
  shadow.material.opacity = 1 - 0.45 * up;
  shadow.scale.setScalar(1 + 0.15 * up);

  // tyre set highlight (mouse over the wheels or the balloon, or while its panel is open)
  const glowTarget = ((wheelHover && canPick()) || balloonHover) ? 1 : (tyreService && focused === tyreService) ? 0.2 : 0;
  glow += (glowTarget - glow) * Math.min(1, k * 2.5);
  for (const m of wheelGlowMats) m.emissiveIntensity = glow * 0.6;
  wheelSet.scale.setScalar(1 + 0.04 * glow);
  if (tyreService?.el) tyreService.el.classList.toggle('active', wheelHover);

  if (focused && focused.local) {
    const a = (focused.obj ?? car).localToWorld(tmp.copy(focused.focus ?? focused.local));
    tgtLook.copy(a);
    tgtPos.copy(a).add(v3(...focused.view));
  }
  camPos.lerp(tgtPos, k);
  camLook.lerp(tgtLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // shift the picture so the focused part is not hidden behind the panel
  const desk = W > 760;
  const wantX = focused ? (desk ? (Math.min(400, W * 0.4) + 24) / 2 : 0) : 0;
  // phones: in the services view, centre the car in the space above the services list
  const listShift = !desk && !focused ? (servicesUI.offsetHeight * 0.5 - 30) * seg(p, 0.55, 0.9) : 0;
  const wantY = focused && !desk ? Math.min(H * 0.58, panel.offsetHeight || H * 0.5) / 2 : Math.max(0, listShift);
  shiftX += (wantX - shiftX) * k;
  shiftY += (wantY - shiftY) * k;
  if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) camera.setViewOffset(W, H, shiftX, shiftY, W, H);
  else camera.clearViewOffset();
  camera.updateMatrixWorld();

  // UI overlays
  updateTitle(p);
  intro.classList.toggle('gone', p > 0.2);
  const inServices = p > 0.86 && !focused;
  servicesUI.classList.toggle('show', inServices);
  document.body.classList.toggle('stage-services', p > 0.86);
  const placed = [];
  for (const s of SERVICES) {
    if (!s.local) continue;
    const world = (s.obj ?? car).localToWorld(tmp.copy(s.local));
    toCam.copy(camera.position).sub(world).normalize();
    const facing = s.normalV.dot(toCam) > 0.05;
    world.project(camera);
    const show = inServices && facing && world.z < 1;
    s.el.classList.toggle('hidden', !show);
    s.el.tabIndex = show ? 0 : -1;
    // keep every balloon fully on screen (below the top bar)
    const bw = W <= 640 ? 44 : (s.el.offsetWidth || 44);
    s.sx = Math.min(Math.max((world.x * 0.5 + 0.5) * W - 22, 4), W - bw - 4);
    s.sy = Math.min(Math.max((-world.y * 0.5 + 0.5) * H - 22, 76), H - 48);
    if (show) placed.push(s);
  }
  // keep the balloons from covering each other: push overlapping ones down
  // (on phones only the dots are shown, so they need much less room)
  const small = W <= 640;
  const rowH = small ? 26 : 50;
  placed.sort((a, b) => a.sy - b.sy);
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    const aw = small ? 26 : (a.el.offsetWidth || 44);
    for (let j = 0; j < i; j++) {
      const b = placed[j];
      const bw = small ? 26 : (b.el.offsetWidth || 44);
      const ax = a.sx + (small ? 9 : 0), bx = b.sx + (small ? 9 : 0);
      const overlapX = ax < bx + bw + 4 && bx < ax + aw + 4;
      if (overlapX && a.sy < b.sy + rowH) a.sy = b.sy + rowH;
    }
  }
  for (const s of SERVICES) if (s.el) s.el.style.transform = `translate(${s.sx ?? -100}px, ${s.sy ?? -100}px)`;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
