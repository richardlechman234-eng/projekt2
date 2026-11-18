import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------
   Služby: anchor = značka z Blendera (alebo výpočet), normal = smer,
   z ktorého je bod viditeľný, view = kam sa postaví kamera pri detaile.
   Súradnice v priestore auta: +Z = predok, +X = ľavý bok auta.
------------------------------------------------------------------- */
const SERVICES = [
  {
    id: 'pneuservis', name: 'Pneuservis', anchor: 'hs_pneuservis',
    normal: [1, 0, 0.2], view: [1.9, 0.35, 0.55],
    desc: 'Sezónne prezutie, vyváženie a oprava defektov.',
    items: ['Prezutie letných / zimných pneumatík', 'Vyváženie kolies', 'Oprava defektu', '[doplniť: uskladnenie pneumatík?]'],
    price: 'od [doplniť] €'
  },
  {
    id: 'brzdy', name: 'Brzdy', anchor: null, normal: [1, 0, -0.1], view: [1.8, 0.3, -0.45],
    desc: 'Kontrola a výmena brzdových dielov, aby ste zastavili vždy včas.',
    items: ['Výmena brzdových platničiek', 'Výmena brzdových kotúčov', 'Výmena brzdovej kvapaliny', 'Kontrola brzdovej sústavy'],
    price: 'od [doplniť] €'
  },
  {
    id: 'motor', name: 'Motor a olej', anchor: 'hs_motor', normal: [0, 1, 0.3], view: [1.0, 1.7, 1.6],
    desc: 'Pravidelný servis motora podľa predpisu výrobcu.',
    items: ['Výmena oleja a filtrov', 'Servisná prehliadka', 'Výmena rozvodov', 'Opravy motora'],
    price: 'od [doplniť] €'
  },
  {
    id: 'svetla', name: 'Svetlá a elektrika', anchor: 'hs_svetla', normal: [0.4, 0.15, 1], view: [1.0, 0.25, 1.75],
    desc: 'Osvetlenie, batéria a elektroinštalácia vozidla.',
    items: ['Nastavenie svetlometov', 'Výmena žiaroviek', 'Kontrola a výmena autobatérie', 'Opravy elektroinštalácie'],
    price: 'od [doplniť] €'
  },
  {
    id: 'klimatizacia', name: 'Klimatizácia', anchor: 'hs_klimatizacia', normal: [0, 0.1, 1], view: [0.35, 0.3, 2.1],
    desc: 'Plnenie a dezinfekcia klimatizácie pre čistý vzduch v kabíne.',
    items: ['Plnenie klimatizácie', 'Dezinfekcia a čistenie', 'Výmena kabínového filtra', 'Kontrola tesnosti'],
    price: 'od [doplniť] €'
  },
  {
    id: 'diagnostika', name: 'Diagnostika', anchor: 'hs_karoseria', normal: [1, 0.1, 0], view: [2.3, 0.5, 0.3],
    desc: 'Počítačová diagnostika porúch a vyčítanie chybových kódov.',
    items: ['Diagnostika riadiacich jednotiek', 'Vyčítanie a mazanie chýb', 'Kontrola pred kúpou auta', '[doplniť]'],
    price: 'od [doplniť] €'
  },
  {
    id: 'vyfuk', name: 'Výfuk', anchor: null, normal: [0.2, 0, -1], view: [1.1, 0.3, -1.9],
    desc: 'Opravy a výmeny výfukového systému.',
    items: ['Výmena tlmičov výfuku', 'Opravy výfukového potrubia', 'Kontrola úniku spalín', '[doplniť]'],
    price: 'od [doplniť] €'
  }
];

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
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  $('nogl').hidden = false;
  $('loader').classList.add('done');
  servicesUI.classList.add('show');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = new THREE.Color('#0c0d0f');
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 9, 26);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight('#ffb27a', 1.2);
rim.position.set(-5, 2, -6);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

/* ground: dark floor with a faint grid so the drive is visible */
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#101114'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.85, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

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

/* ---------------- load model ---------------- */
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load('assets/car.glb', (gltf) => {
  const model = gltf.scene;
  car.add(model);
  model.traverse((o) => {
    if (o.name.startsWith('Wheel_')) wheels.push({ obj: o, base: o.rotation.x });
    if (o.name.startsWith('hs_')) anchorsLocal[o.name] = o.position.clone();
  });
  const bl = model.getObjectByName('Wheel_BL');
  const vy = anchorsLocal.hs_vyfuk;
  for (const s of SERVICES) {
    if (s.id === 'brzdy') s.local = bl ? bl.position.clone().add(new THREE.Vector3(0.23, 0.08, 0.1)) : new THREE.Vector3(1, 0.42, -1.25);
    else if (s.id === 'vyfuk') s.local = vy ? new THREE.Vector3(Math.abs(vy.x), vy.y, vy.z) : new THREE.Vector3(0.77, 0.36, -2.36);
    else s.local = anchorsLocal[s.anchor]?.clone() ?? new THREE.Vector3(0, 0.6, 0);
    s.normalV = new THREE.Vector3(...s.normal).normalize();
  }
  $('loader').classList.add('done');
}, (xhr) => {
  if (xhr.total) {
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    $('loader-fill').style.width = pct + '%';
    $('loader-text').textContent = `Načítavam 3D model… ${pct} %`;
  }
}, () => {
  $('loader-text').textContent = 'Model sa nepodarilo načítať.';
});

/* ---------------- scroll timeline ---------------- */
const DRIVE = 2.6;                 // how far the car drives toward the viewer
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

let fitScale = 1;
function cameraFromScroll(p, outPos, outLook) {
  const d = ease(seg(p, 0, 0.55));
  const o = ease(seg(p, 0.55, 0.9));
  const carZ = DRIVE * d;
  // A: front view, car drives towards us (camera backs off slower than the car comes)
  const posA = v3(0, 0.85, 5.2).lerp(v3(0, 0.78, 6.2), d);
  const lookA = v3(0, 0.62, carZ);
  // B: orbit to a 3/4 front-left view for the services
  const posB = v3(5.1, 2.05, DRIVE + 5.3);
  const lookB = v3(0, 0.3, DRIVE + 0.25);
  outLook.copy(lookA).lerp(lookB, o);
  outPos.copy(posA).lerp(posB, o);
  // keep the car filling the frame on narrow (portrait) screens
  outPos.sub(outLook).multiplyScalar(fitScale).add(outLook);
  return carZ;
}

function scrollProgress() {
  const total = experience.offsetHeight - window.innerHeight;
  return clamp01(-experience.getBoundingClientRect().top / total);
}

/* ---------------- resize ---------------- */
let W = 0, H = 0;
function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  fitScale = Math.max(1, Math.pow(1.5 / camera.aspect, 0.72));
}
window.addEventListener('resize', resize);
resize();

/* ---------------- render loop ---------------- */
const camPos = v3(0, 0.85, 5.2), camLook = v3(0, 0.62, 0);
const tgtPos = v3(), tgtLook = v3();
let carZ = 0, lastCarZ = 0, shiftX = 0, shiftY = 0;
const tmp = v3(), toCam = v3();
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const p = scrollProgress();
  const k = 1 - Math.exp(-dt * 5);

  const targetCarZ = cameraFromScroll(p, tgtPos, tgtLook);
  carZ += (targetCarZ - carZ) * k;
  car.position.z = carZ;
  const roll = (carZ - lastCarZ) / WHEEL_R;
  for (const w of wheels) w.obj.rotation.x += roll;
  lastCarZ = carZ;

  if (focused && focused.local) {
    const a = car.localToWorld(tmp.copy(focused.local));
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
  const wantY = focused && !desk ? Math.min(H * 0.58, panel.offsetHeight || H * 0.5) / 2 : 0;
  shiftX += (wantX - shiftX) * k;
  shiftY += (wantY - shiftY) * k;
  if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) camera.setViewOffset(W, H, shiftX, shiftY, W, H);
  else camera.clearViewOffset();
  camera.updateMatrixWorld();

  // UI overlays
  intro.style.opacity = String(1 - seg(p, 0.03, 0.2));
  const inServices = p > 0.86 && !focused;
  servicesUI.classList.toggle('show', inServices);
  for (const s of SERVICES) {
    if (!s.local) continue;
    const world = car.localToWorld(tmp.copy(s.local));
    toCam.copy(camera.position).sub(world).normalize();
    const facing = s.normalV.dot(toCam) > 0.05;
    world.project(camera);
    const x = (world.x * 0.5 + 0.5) * W;
    const y = (-world.y * 0.5 + 0.5) * H;
    const show = inServices && facing && world.z < 1;
    s.el.classList.toggle('hidden', !show);
    s.el.tabIndex = show ? 0 : -1;
    s.el.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
