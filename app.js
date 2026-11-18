import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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

const GW = 28, GD = 44, GH = 7, GZ = 4;          // garage width, depth, height, centre z
function buildGarage() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
    g.add(m); return m;
  };

  // polished concrete floor with 4 m slab seams
  const floorTex = canvasTex(512, 512, (c, w, h) => {
    speckle(c, w, h, '#2b2525', 0.06, 9000);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
  }, [GW / 4, GD / 4]);
  add(new THREE.PlaneGeometry(GW, GD), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }), 0, 0, GZ, -Math.PI / 2);

  // floor markings: white drive lanes + blue service bay
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
  const blueLine = new THREE.MeshBasicMaterial({ color: BLUE });
  for (const x of [-1.75, 1.75]) add(new THREE.PlaneGeometry(0.1, 20), white, x, 0.004, 2, -Math.PI / 2);
  const bayZ = 2.6, bw = 3.0, bl = 6.0;
  add(new THREE.PlaneGeometry(bw, 0.14), blueLine, 0, 0.005, bayZ + bl / 2, -Math.PI / 2);
  add(new THREE.PlaneGeometry(bw, 0.14), blueLine, 0, 0.005, bayZ - bl / 2, -Math.PI / 2);
  for (const x of [-bw / 2, bw / 2]) add(new THREE.PlaneGeometry(0.14, bl), blueLine, x, 0.005, bayZ, -Math.PI / 2);

  // walls + ceiling
  // light grey painted walls (#D6D4D4) with a little texture so they don't look flat
  const wallTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d6d4d4'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = `rgba(60,50,50,${Math.random() * 0.06})`;
      c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, [6, 2]);
  const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  add(new THREE.PlaneGeometry(GW, GH), wall, 0, GH / 2, GZ - GD / 2);                      // back
  add(new THREE.PlaneGeometry(GW, GH), wall, 0, GH / 2, GZ + GD / 2, 0, Math.PI);          // front
  add(new THREE.PlaneGeometry(GD, GH), wall, -GW / 2, GH / 2, GZ, 0, Math.PI / 2);         // left
  add(new THREE.PlaneGeometry(GD, GH), wall, GW / 2, GH / 2, GZ, 0, -Math.PI / 2);         // right
  add(new THREE.PlaneGeometry(GW, GD), new THREE.MeshStandardMaterial({ color: '#0d0606', roughness: 1 }), 0, GH, GZ, Math.PI / 2);

  // blue band around the walls
  const band = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.55, emissive: BLUE, emissiveIntensity: 0.25 });
  add(new THREE.PlaneGeometry(GW, 0.7), band, 0, 1.25, GZ - GD / 2 + 0.01);
  add(new THREE.PlaneGeometry(GW, 0.7), band, 0, 1.25, GZ + GD / 2 - 0.01, 0, Math.PI);
  add(new THREE.PlaneGeometry(GD, 0.7), band, -GW / 2 + 0.01, 1.25, GZ, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(GD, 0.7), band, GW / 2 - 0.01, 1.25, GZ, 0, -Math.PI / 2);

  // roller doors on back and front wall
  const doorTex = canvasTex(64, 256, (c, w, h) => {
    c.fillStyle = '#4a4547'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, y + 3, w, 2); }
  });
  const door = new THREE.MeshStandardMaterial({ map: doorTex, metalness: 0.55, roughness: 0.45 });
  const frame = new THREE.MeshStandardMaterial({ color: '#2a2224', roughness: 0.6 });
  for (const x of [-8.5, 0, 8.5]) {
    for (const [z, ry] of [[GZ - GD / 2 + 0.02, 0], [GZ + GD / 2 - 0.02, Math.PI]]) {
      add(new THREE.PlaneGeometry(4.6, 4.3), door, x, 2.15, z, 0, ry);
      add(new THREE.BoxGeometry(5.0, 0.3, 0.2), frame, x, 4.45, z);
      for (const dx of [-2.45, 2.45]) add(new THREE.BoxGeometry(0.2, 4.6, 0.2), frame, x + dx, 2.3, z);
    }
  }

  // pillars along the side walls
  const pillar = new THREE.MeshStandardMaterial({ color: '#bdbaba', roughness: 0.85 });
  for (const z of [-14, -6, 2, 10, 18]) for (const x of [-GW / 2 + 0.3, GW / 2 - 0.3]) add(new THREE.BoxGeometry(0.6, GH, 0.6), pillar, x, GH / 2, z);

  // LED strip lights (HDR white so the car paint reflects them)
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) });
  for (const x of [-7.5, -2.5, 2.5, 7.5]) for (const z of [-14, -6, 2, 10, 18]) add(new THREE.BoxGeometry(0.14, 0.05, 5), led, x, GH - 0.03, z);

  // blue tool cabinets on the left wall
  const cabTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#0c2a78'; c.fillRect(0, 0, w, h);          // darker shade of the brand blue
    for (let i = 1; i < 5; i++) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, (h / 5) * i - 2, w, 3); }
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 5; i++) c.fillRect(w / 2 - 30, (h / 5) * i + h / 10 - 2, 60, 4);
  });
  const cab = new THREE.MeshStandardMaterial({ map: cabTex, metalness: 0.4, roughness: 0.4 });
  const top = new THREE.MeshStandardMaterial({ color: '#2b2626', metalness: 0.6, roughness: 0.35 });
  for (let z = -11; z <= 9; z += 2.2) {
    add(new THREE.BoxGeometry(0.7, 1.05, 2.0), cab, -GW / 2 + 0.75, 0.525, z);
    add(new THREE.BoxGeometry(0.76, 0.05, 2.06), top, -GW / 2 + 0.75, 1.075, z);
  }

  // stacked tyres on the right wall
  const tyre = new THREE.MeshStandardMaterial({ color: '#111010', roughness: 0.85 });
  const tyreGeo = new THREE.TorusGeometry(0.33, 0.13, 12, 28);
  for (const z of [-12, -10.9, -9.8, 12, 13.1]) for (let i = 0; i < 4; i++) add(tyreGeo, tyre, GW / 2 - 0.8, 0.13 + i * 0.27, z, Math.PI / 2);

  // painted name on the left wall
  const nameTex = canvasTex(1024, 160, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.font = '700 120px "Space Grotesk", Arial, sans-serif';
    c.textBaseline = 'middle'; c.fillText('AUTO MM SERVIS', 10, h / 2);
  });
  nameTex.wrapS = nameTex.wrapT = THREE.ClampToEdgeWrapping;
  add(new THREE.PlaneGeometry(10, 1.56), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, opacity: 0.9 }), -GW / 2 + 0.02, 4.4, 0, 0, Math.PI / 2);
  return g;
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

/* ---------------- load model ---------------- */
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
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
    else if (s.id === 'vyfuk') s.local = vy ? new THREE.Vector3(Math.abs(vy.x), vy.y, vy.z) : new THREE.Vector3(0.77, 0.36, -2.36);
    else s.local = anchorsLocal[s.anchor]?.clone() ?? new THREE.Vector3(0, 0.6, 0);
    s.normalV = new THREE.Vector3(...s.normal).normalize();
  }
  $('loader').classList.add('done');
}, (xhr) => {
  if (xhr.total) {
    const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
    $('loader-fill').style.width = pct + '%';
    $('loader-text').textContent = `Načítavam 3D model… ${pct} %`;
  }
}, () => {
  const t = $('loader-text');
  if (t) t.textContent = 'Model sa nepodarilo načítať. Služby nájdete v zozname nižšie.';
  servicesUI.classList.add('show');
});

/* ---------------- scroll timeline ---------------- */
const DRIVE = 2.6;                 // how far the car drives toward the viewer
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

let fitScale = 1, fitIntro = 1;
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
  // portrait screens: the intro shows the car lower in the frame, under the title
  lookA.y += (fitIntro - 1) * 0.55;
  outLook.copy(lookA).lerp(lookB, o);
  outPos.copy(posA).lerp(posB, o);
  // keep the car filling the frame on narrow (portrait) screens
  const fit = fitIntro + (fitScale - fitIntro) * o;
  outPos.sub(outLook).multiplyScalar(fit).add(outLook);
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
  fitIntro = Math.max(1, Math.pow(1.5 / camera.aspect, 0.42));
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
  const placed = [];
  for (const s of SERVICES) {
    if (!s.local) continue;
    const world = car.localToWorld(tmp.copy(s.local));
    toCam.copy(camera.position).sub(world).normalize();
    const facing = s.normalV.dot(toCam) > 0.05;
    world.project(camera);
    const show = inServices && facing && world.z < 1;
    s.el.classList.toggle('hidden', !show);
    s.el.tabIndex = show ? 0 : -1;
    s.sx = (world.x * 0.5 + 0.5) * W - 22;
    s.sy = (-world.y * 0.5 + 0.5) * H - 22;
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
