import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMouseLook } from './mouse-look.js';
import { createTouchMovement } from './touch-movement.js';
import { createWorkshopMotion, getHammerReadyPose, getHammerStrikePose, getHammerForearmPose, getTicketFocusView, getHeldSwordPose } from './workshop-motion.js';
import { createShadowAvatar } from './shadow-avatar.js';
import { createTicketBoard } from './ticket-board.js';
import { createSwordRenderer } from './sword-renderer.js';
import { createSwordPhysics } from './sword-physics.js';
import { findForgeContact } from './forge-contact.js';
import { HAMMER_HEAD, HAMMER_WRIST } from './hammer-frame.js';
import { createRelicShopRenderer } from './relic-shop-renderer.js';
import { createVectorPanel, svgText } from './vector-panels.js';
import { WORKSHOP_ART, ledgerArt, calendarArt } from './workshop-vector-art.js';

export function getWorkshopRenderPolicy({ coarsePointer = false, devicePixelRatio = 1 } = {}) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    pixelRatio: Math.min(dpr, coarsePointer ? 1.5 : 2),
    antialias: !coarsePointer,
    shadowSize: coarsePointer ? 512 : 1024,
    shadowType: coarsePointer ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
    anisotropy: coarsePointer ? 8 : 16,
  };
}

// This module is deliberately a view adapter: all game outcomes are supplied by
// the caller. The workshop is entirely procedural and has no network assets.
export function createWorkshop(container, callbacks = {}) {
  const { onTarget = () => {}, onInteract = () => {}, onStrike = () => {}, onStrikeImpact = () => {}, onExit = () => {}, onLookMode = () => {}, onSword = () => {}, onDrop = () => {}, onTakeAnvil, onShopAction = () => {}, movementPad } = callbacks;
  const renderPolicy = getWorkshopRenderPolicy({ coarsePointer: !!window.matchMedia?.('(pointer: coarse)').matches, devicePixelRatio: window.devicePixelRatio });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111719');
  scene.fog = new THREE.FogExp2('#111719', 0.027);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.045, 60);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.83, 4.25);
  camera.lookAt(-0.15, 1.65, -2);
  scene.add(camera);
  // The host owns its error screen. A failed renderer must not masquerade as a
  // successfully created workshop with inert API methods.
  const renderer = new THREE.WebGLRenderer({ antialias: renderPolicy.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(renderPolicy.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = renderPolicy.shadowType;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none;';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', renderPolicy.antialias
    ? '第一人称锻造工坊。WASD 移动，按住左键拖动观察，点击设施或 E 交互。'
    : '第一人称锻造工坊。使用屏幕摇杆移动，滑动画面观察，轻点设施或交互按钮操作；铁砧轻点敲击，使用返回按钮离开。');
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const contextNotice = document.createElement('div');
  contextNotice.setAttribute('role', 'status');
  contextNotice.textContent = '3D 画面连接中断，正在等待浏览器恢复。';
  contextNotice.style.cssText = 'display:none;position:absolute;inset:45% 8% auto;padding:18px;background:#151b1de8;color:#f5dfb3;text-align:center;z-index:6;border:1px solid #77613c;';
  container.appendChild(contextNotice);
  const textures = new Set();
  const vectorPanels = new Map();
  const anisotropy = Math.min(renderPolicy.anisotropy, renderer.capabilities.getMaxAnisotropy());
  const geometries = new Set();
  const materials = new Set();
  const listeners = [];
  const stationMeshes = [];
  const collisions = [];
  let disposed = false, paused = false, contextLost = false, focused = null, guideView = false;
  let hovered = null, swordState = null, anger = 0, boardKey = '';
  let worldState = null, hoveredSword = null, merchantKey = '', calendarDay = 0;
  const physicalSwords = new Map(), swordTargets = [], merchantModels = [];
  let floorSwords = [], walking = false;
  let impactThisFrame = false;
  let elapsed = 0, strikeTime = -100, strikeKind = '', lastTime = performance.now(), frame;
  let yaw = camera.rotation.y, pitch = camera.rotation.x;
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const shopPointer = new THREE.Vector2(); let shopPointerActive = false;
  const temp = new THREE.Object3D();
  const focusPosition = new THREE.Vector3();
  const focusQuaternion = new THREE.Quaternion();
  const savedPosition = camera.position.clone();
  const savedQuaternion = camera.quaternion.clone();
  let returning = false;
  const stationViews = {
    anvil: { position: [-1.05, 2.22, 0.95], look: [-1.05, 1.51, -2.1] },
    furnace: { position: [-3.15, 1.74, 0.15], look: [-4.25, 1.15, -2.3] },
    tribute: { position: [2.78, 1.78, 0.45], look: [2.8, 1.83, -3.3] },
    relics: { position: [1.8, 1.8, -.15], look: [5.15, 1.5, -.15] },
    rack: { position: [-3.2, 1.72, 3.05], look: [-5.1, 1.55, 1.15] },
    merchant: { position: [.88, 1.78, .75], look: [.88, 1.45, -1.8] },
    tickets: { position: [0, 2.1, 1.7], look: [0, 2.25, 4.96] },
  };

  // A seeded generator makes all textures and prop positions stable across loads.
  let seed = 729184;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function geometry(g) { geometries.add(g); return g; }
  function material(options) { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; }
  function textureCanvas(width, height, paint) {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    paint(c.getContext('2d'), width, height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); textures.add(t);
    return t;
  }
  function vectorTexture(art, resolution = 1024) {
    const panel = createVectorPanel({ width: art.width, height: art.height, anisotropy, resolution });
    vectorPanels.set(panel.texture, panel); textures.add(panel.texture);
    panel.update(art.body); return panel.texture;
  }
  function disposeTexture(texture) {
    const panel = vectorPanels.get(texture);
    if (panel) { panel.dispose(); vectorPanels.delete(texture); } else texture.dispose();
    textures.delete(texture);
  }
  const stoneTexture = vectorTexture(WORKSHOP_ART.stone);
  const woodTexture = vectorTexture(WORKSHOP_ART.wood, 2048);
  const metalTexture = vectorTexture(WORKSHOP_ART.metal);
  const metalRoughness = textureCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#858585'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { const l = Math.floor(75 + random() * 85); ctx.strokeStyle = `rgb(${l},${l},${l})`; ctx.lineWidth = random() * 1.4 + .3; const x = random() * w, y = random() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + random() * 75, y + random() * 4); ctx.stroke(); }
  });
  metalRoughness.colorSpace = THREE.NoColorSpace;
  const leatherTexture = vectorTexture(WORKSHOP_ART.leather);
  const endgrainTexture = vectorTexture(WORKSHOP_ART.endgrain);
  const stone = material({ color: '#747973', map: stoneTexture, roughness: 0.96, bumpMap: stoneTexture, bumpScale: 0.045 });
  const darkStone = material({ color: '#404742', map: stoneTexture, roughness: 1, bumpMap: stoneTexture, bumpScale: 0.06 });
  const wood = material({ color: '#98714b', map: woodTexture, roughness: 0.92, bumpMap: woodTexture, bumpScale: 0.025 });
  const darkWood = material({ color: '#5f4933', map: woodTexture, roughness: 0.92 });
  const iron = material({ color: '#43494a', map: metalTexture, roughnessMap: metalRoughness, roughness: 0.85, metalness: 0.78, bumpMap: metalTexture, bumpScale: .006 });
  const polishedIron = material({ color: '#a5b0b0', map: metalTexture, roughnessMap: metalRoughness, roughness: 0.43, metalness: 0.9 });
  const leather = material({ color: '#9c7454', map: leatherTexture, bumpMap: leatherTexture, bumpScale: .012, roughness: .87 });
  const swordRenderer = createSwordRenderer({ metalTexture, woodTexture, leatherTexture });
  const stumpEndgrain = material({ color: '#997957', map: endgrainTexture, bumpMap: endgrainTexture, bumpScale: .014, roughness: .95 });
  const brass = material({ color: '#b48a45', metalness: 0.78, roughness: 0.38 });
  const coal = material({ color: '#151717', roughness: 1 });
  const orange = material({ color: '#ff832a', emissive: '#ff4211', emissiveIntensity: 3, roughness: 0.7 });
  const cyan = material({ color: '#87f5e4', emissive: '#25a5b3', emissiveIntensity: 1.8, roughness: 0.4 });
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry(new THREE.SphereGeometry(1, 20, 14));
  function bevelBox(parent, mat, x, y, z, sx, sy, sz, radius = .025) {
    const g = geometry(new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(radius, sx / 3, sy / 3, sz / 3)));
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function lathe(parent, mat, profile, segments = 24) {
    const m = new THREE.Mesh(geometry(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments)), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, mat, x, y, z, sx, sy, sz, rotation = 0) {
    const m = new THREE.Mesh(boxGeometry, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = rotation;
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function cylinder(parent, mat, top, bottom, height, x, y, z, sides = 12) {
    const m = new THREE.Mesh(geometry(new THREE.CylinderGeometry(top, bottom, height, sides)), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function sphere(parent, mat, x, y, z, sx, sy = sx, sz = sx) {
    const m = new THREE.Mesh(sphereGeometry, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }
  function group(x, y, z, angle = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = angle; scene.add(g); return g; }
  function stationBounds(name, x, y, z, sx, sy, sz) {
    const m = box(scene, material({ transparent: true, opacity: 0, depthWrite: false }), x, y, z, sx, sy, sz);
    m.userData.station = name; stationMeshes.push(m); return m;
  }
  function label(parent, text, x, y, z, width, color = '#d9c59c') {
    const characters = [...text];
    const widthUnits = characters.reduce((sum, ch) => sum + (/[^\u0000-\u00ff]/.test(ch) ? 1 : .62), 0);
    const fontSize = Math.min(104, 850 / Math.max(widthUnits, 1));
    const map = vectorTexture({ width: 1000, height: 1000 / 6,
      body: svgText(text, 500, 1000 / 12, { size: fontSize, color, weight: 600 }) }, 2048);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }); materials.add(mat);
    const m = new THREE.Mesh(geometry(new THREE.PlaneGeometry(width, width / 6)), mat); m.position.set(x, y, z); parent.add(m); return m;
  }

  // Stone masonry is instanced: depth and staggered joints catch the lighting
  // without turning a small room into hundreds of draw calls.
  box(scene, darkStone, 0, 2.1, -3.96, 12, 4.2, 0.2);
  box(scene, darkStone, 0, 2.1, 5.17, 12, 4.2, 0.2);
  box(scene, darkStone, -5.96, 2.1, 0.5, 0.2, 4.2, 9.2);
  box(scene, darkStone, 5.96, 2.1, 0.5, 0.2, 4.2, 9.2);
  const masonry = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 12; col++) masonry.push([col * 1.02 - 5.6 + (row % 2 ? 0.51 : 0), 0.28 + row * 0.53, -3.82, 0.97, 0.48, 0.27, 0]);
    for (let col = 0; col < 12; col++) masonry.push([col * 1.02 - 5.6 + (row % 2 ? .51 : 0), .28 + row * .53, 5.18, .97, .48, .27, 0]);
    for (let col = 0; col < 9; col++) {
      masonry.push([-5.84, 0.28 + row * 0.53, -3.3 + col * 1.02, 0.27, 0.48, 0.97, 0]);
      masonry.push([5.84, 0.28 + row * 0.53, -3.3 + col * 1.02, 0.27, 0.48, 0.97, 0]);
    }
  }
  const masonryGeometry = geometry(new RoundedBoxGeometry(1, 1, 1, 2, .065));
  const blocks = new THREE.InstancedMesh(masonryGeometry, stone, masonry.length); blocks.receiveShadow = true;
  masonry.forEach((b, i) => {
    temp.position.set(b[0] + (random() - .5) * .026, b[1] + (random() - .5) * .025, b[2] + (random() - .5) * .034);
    temp.scale.set(b[3] * (.97 + random() * .045), b[4] * (.91 + random() * .13), b[5] * (.93 + random() * .18)); temp.rotation.set(0, (random() - .5) * .012, (random() - .5) * .027); temp.updateMatrix();
    blocks.setMatrixAt(i, temp.matrix); blocks.setColorAt(i, new THREE.Color().setHSL(0.12, 0.07, 0.7 + random() * 0.25));
  }); scene.add(blocks);
  const tiles = new THREE.InstancedMesh(boxGeometry, darkStone, 120); tiles.receiveShadow = true;
  let tileIndex = 0;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 10; z++) {
    temp.position.set(x - 5.5, -0.04, z - 4); temp.rotation.set(0, 0, 0); temp.scale.set(0.98, 0.08, 0.98); temp.updateMatrix();
    tiles.setMatrixAt(tileIndex, temp.matrix); tiles.setColorAt(tileIndex++, new THREE.Color().setHSL(0.12, 0.06, 0.56 + random() * 0.26));
  } scene.add(tiles);
  box(scene, darkWood, 0, 4.35, 0, 12, 0.15, 10);
  for (let z = -3.4; z < 6; z += 2.6) {
    box(scene, wood, 0, 4.13, z, 12, 0.36, 0.32);
    for (const x of [-5.7, 5.7]) box(scene, darkWood, x, 2.1, z, 0.27, 4.1, 0.3);
  }
  box(scene, darkWood, 0, 0.2, -3.54, 12, 0.16, 0.16);

  const hemi = new THREE.HemisphereLight('#b1c5c3', '#453322', 1.35); scene.add(hemi);
  const key = new THREE.SpotLight('#f5d9a1', 65, 18, 0.85, 0.65, 1.7); key.position.set(-1, 3.95, 1.5); key.target.position.set(-0.6, 0.9, -1.5);
  key.castShadow = true; key.shadow.mapSize.set(renderPolicy.shadowSize, renderPolicy.shadowSize); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.045;
  scene.add(key, key.target);
  // A downward cone follows the body without including the roof in its
  // shadow projection, keeping the silhouette readable on the open floor.
  const bodyLight = new THREE.SpotLight('#d2b991', 32, 12, .65, .45, 1.6);
  bodyLight.castShadow = true; bodyLight.shadow.mapSize.set(renderPolicy.shadowSize / 2, renderPolicy.shadowSize / 2);
  bodyLight.shadow.camera.near = .1; bodyLight.shadow.camera.far = 12; bodyLight.shadow.bias = -.00035; bodyLight.shadow.normalBias = .025;
  bodyLight.shadow.camera.updateProjectionMatrix();
  scene.add(bodyLight, bodyLight.target);
  const coolFill = new THREE.PointLight('#77bac2', 10, 12, 1.6); coolFill.position.set(4.5, 3, 2.3); scene.add(coolFill);
  // A quiet procedural room reflection gives forged metal broad highlights,
  // rather than a plastic diffuse surface. No image assets are fetched.
  const reflectionFaces = Array.from({ length: 6 }, (_, face) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#292e2d'; ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#565f59'); g.addColorStop(.55, '#252c2b'); g.addColorStop(1, '#191b19'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = face === 1 ? '#ad7850' : face === 0 ? '#6a9093' : '#858a7d'; ctx.fillRect(22, 15, 11, 53); ctx.fillRect(38, 15, 7, 53);
    if (face === 2) { ctx.fillStyle = '#bdb69c'; ctx.fillRect(46, 48, 37, 27); }
    return c;
  });
  const environment = new THREE.CubeTexture(reflectionFaces); environment.colorSpace = THREE.SRGBColorSpace; environment.needsUpdate = true; textures.add(environment); scene.environment = environment; scene.environmentIntensity = .42;

  // A wide, block-built hearth with a dark chimney and incandescent coal bed.
  const hearth = group(-4.28, 0, -2.42);
  bevelBox(hearth, darkStone, 0, 0.25, 0, 2.2, 0.5, 1.7, .075);
  bevelBox(hearth, darkStone, 0, 0.64, -0.46, 1.9, 0.42, 1.2, .035);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) bevelBox(hearth, stone, side * 0.87, 0.85 + i * 0.4, -0.24, 0.43, 0.38, 1.12, .038);
  }
  bevelBox(hearth, darkStone, 0, 2.66, -0.38, 1.88, 1.05, 1.04, .045);
  bevelBox(hearth, stone, 0, 3.16, -.38, 2.03, .16, 1.16, .035);
  bevelBox(hearth, darkStone, 0, 3.7, -0.49, 1.34, 1.1, 0.86, .055);
  box(hearth, coal, 0, 1.34, -0.64, 1.35, 1.34, 0.18);
  const sootStone = material({ color: '#645447', map: stoneTexture, roughness: 1, bumpMap: stoneTexture, bumpScale: .065 });
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI + .013, b = (i + 1) / 11 * Math.PI - .013;
    const archStone = new THREE.Shape(); archStone.moveTo(Math.cos(a) * .69, 1.54 + Math.sin(a) * .69);
    archStone.lineTo(Math.cos(a) * 1.04, 1.54 + Math.sin(a) * 1.04); archStone.lineTo(Math.cos(b) * 1.04, 1.54 + Math.sin(b) * 1.04); archStone.lineTo(Math.cos(b) * .69, 1.54 + Math.sin(b) * .69); archStone.closePath();
    const block = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(archStone, { depth: .4, bevelEnabled: true, bevelSize: .018, bevelThickness: .024, bevelSegments: 2 })), i % 3 === 0 ? sootStone : stone);
    block.position.z = -.04; block.castShadow = true; block.receiveShadow = true; hearth.add(block);
  }
  box(hearth, iron, 0, 0.7, 0.28, 1.64, 0.12, 1.25);
  for (let i = 0; i < 17; i++) sphere(hearth, i % 3 ? coal : orange, (random() - 0.5) * 1.3, 0.83 + random() * 0.13, (random() - 0.5) * 0.7, 0.13 + random() * 0.1, 0.09, 0.12);
  for (let i = 0; i < 7; i++) box(hearth, iron, -0.64 + i * 0.21, 0.73, 0.13, 0.03, 0.04, 1.3);
  const fireLight = new THREE.PointLight('#ff792b', 27, 9, 1.55); fireLight.position.set(-4.2, 1.25, -1.8); scene.add(fireLight);
  const flameMap = textureCanvas(128, 256, (ctx, w, h) => {
    // Curved, broad-bottomed tongues, with a soft halo and a short bright core.
    // This avoids a row of identical vertical glow rods across the grate.
    const halo = ctx.createRadialGradient(64, 191, 8, 64, 173, 93); halo.addColorStop(0, 'rgba(255,99,18,.85)'); halo.addColorStop(1, 'rgba(220,30,0,0)'); ctx.fillStyle = halo; ctx.fillRect(0, 64, w, h);
    const gradient = ctx.createLinearGradient(0, 34, 0, 233); gradient.addColorStop(0, 'rgba(255,82,16,0)'); gradient.addColorStop(.28, 'rgba(255,116,25,.55)'); gradient.addColorStop(.63, '#ffbc39'); gradient.addColorStop(1, '#fff2b6');
    ctx.fillStyle = gradient; ctx.shadowColor = '#ff811c'; ctx.shadowBlur = 11;
    ctx.beginPath(); ctx.moveTo(22, 225); ctx.bezierCurveTo(5, 171, 74, 151, 58, 85); ctx.bezierCurveTo(48, 57, 77, 42, 87, 18); ctx.bezierCurveTo(64, 97, 103, 107, 91, 152); ctx.bezierCurveTo(119, 131, 111, 183, 108, 207); ctx.quadraticCurveTo(89, 250, 22, 225); ctx.fill();
    ctx.shadowBlur = 8; ctx.fillStyle = '#fff6c6'; ctx.beginPath(); ctx.moveTo(43, 226); ctx.quadraticCurveTo(28, 190, 65, 164); ctx.quadraticCurveTo(53, 199, 89, 216); ctx.quadraticCurveTo(75, 241, 43, 226); ctx.fill();
  });
  const flameMaterial = new THREE.SpriteMaterial({ map: flameMap, color: '#ffab63', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }); materials.add(flameMaterial);
  const flames = [];
  for (let i = 0; i < 7; i++) {
    const layerMaterial = flameMaterial.clone(); layerMaterial.rotation = (random() - .5) * .33; layerMaterial.opacity = .65 + random() * .3; materials.add(layerMaterial);
    const sprite = new THREE.Sprite(layerMaterial); sprite.position.set(-4.27 + (random() - .5) * 1.12, 1.2, -2.49 + random() * .65); sprite.scale.set(.31 + random() * .29, .85, 1); scene.add(sprite); flames.push(sprite);
  }
  label(hearth, 'THE HEARTH · 炉火', 0, 2.78, 0.17, 1.7);
  stationBounds('furnace', -4.25, 1.1, -2.3, 2.1, 2.4, 1.7);
  collisions.push({ x: -4.28, z: -2.3, sx: 2.2, sz: 1.9 });
  // Bucket, tongs and billets make the station feel used rather than pristine.
  cylinder(scene, iron, 0.32, 0.24, 0.46, -3, 0.24, -2.1);
  const water = material({ color: '#334c51', metalness: 0.5, roughness: 0.18 }); cylinder(scene, water, 0.285, 0.285, 0.025, -3, 0.455, -2.1);
  for (let i = 0; i < 5; i++) box(scene, iron, -3.05 + i * 0.15, 0.23, -3.05, 0.12, 0.22, 0.54, -0.1);

  // Chunky blacksmith's anvil, forged from a shaped extruded silhouette.
  const anvil = group(-1.05, 0, -0.92);
  lathe(anvil, darkWood, [[.59, 0], [.59, .06], [.56, .16], [.54, .42], [.5, .66], [.5, .77]], 28);
  cylinder(anvil, stumpEndgrain, .5, .5, .026, 0, .778, 0, 28);
  for (const y of [0.2, 0.62]) {
    cylinder(anvil, iron, y < .3 ? .561 : .517, y < .3 ? .561 : .517, .055, 0, y, 0, 28);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; sphere(anvil, polishedIron, Math.sin(a) * (y < .3 ? .565 : .522), y, Math.cos(a) * (y < .3 ? .565 : .522), .02); }
  }
  const anvilShape = new THREE.Shape();
  anvilShape.moveTo(-.57, 0); anvilShape.lineTo(.53, 0); anvilShape.lineTo(.49, .095);
  anvilShape.bezierCurveTo(.27, .12, .19, .19, .2, .3); anvilShape.bezierCurveTo(.22, .43, .34, .48, .5, .49);
  anvilShape.lineTo(.68, .49); anvilShape.lineTo(.68, .67); anvilShape.lineTo(-.5, .67); anvilShape.lineTo(-.5, .49);
  anvilShape.bezierCurveTo(-.35, .47, -.22, .4, -.22, .3); anvilShape.bezierCurveTo(-.22, .17, -.32, .12, -.51, .095); anvilShape.closePath();
  const body = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(anvilShape, { depth: 0.46, bevelEnabled: true, bevelSegments: 3, curveSegments: 8, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 })), iron);
  body.position.set(0, 0.75, -0.23); body.castShadow = true; body.receiveShadow = true; anvil.add(body);
  bevelBox(anvil, polishedIron, .085, 1.465, 0, 1.22, .085, .535, .018);
  const horn = lathe(anvil, polishedIron, [[0, 0], [.014, .02], [.055, .18], [.105, .39], [.166, .66], [.205, .8]], 28);
  horn.rotation.z = -Math.PI / 2; horn.position.set(-1.3, 1.28, 0); horn.scale.z = .91;
  bevelBox(anvil, polishedIron, -.45, 1.39, 0, .19, .13, .44, .025);
  for (const x of [-.37, .35]) for (const z of [-.27, .27]) {
    bevelBox(anvil, iron, x, .8, z, .28, .1, .28, .025);
    sphere(anvil, polishedIron, x, .861, z, .04, .02, .04);
  }
  // The hardy hole is recessed into a black, bevelled sleeve. Worn strikes
  // on the face live in a single texture, rather than dozens of tiny meshes.
  bevelBox(anvil, iron, .5, 1.51, -.11, .135, .018, .135, .015);
  box(anvil, coal, .5, 1.521, -.11, .094, .005, .094);
  const anvilWearMap = vectorTexture(WORKSHOP_ART.anvil, 2048);
  const anvilFaceMaterial = material({ color: '#cad0c9', map: anvilWearMap, bumpMap: anvilWearMap, bumpScale: .004, roughness: .43, metalness: .88 });
  const wornFace = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1.16, .48)), anvilFaceMaterial); wornFace.rotation.x = -Math.PI / 2; wornFace.position.set(.04, 1.509, 0); anvil.add(wornFace);
  stationBounds('anvil', -1.05, 1, -0.92, 2.2, 1.65, 1.55);
  collisions.push({ x: -1.05, z: -0.92, sx: 1.8, sz: 1.35 });
  const swordGroup = new THREE.Group(); swordGroup.position.set(-1.08, 1.58, -0.92); scene.add(swordGroup);
  const bladeMaterial = material({ color: '#c7d4d9', map: metalTexture, roughnessMap: metalRoughness, roughness: .44, metalness: .92, emissive: '#000000' });
  const gemMaterial = material({ color: '#7adaca', emissive: '#236660', emissiveIntensity: 1, metalness: 0.25, roughness: 0.2 });
  const edgeMaterial = material({ color: '#e1e8e6', metalness: .95, roughness: .25, emissive: '#000000' });
  const fullerMaterial = material({ color: '#708387', map: metalTexture, metalness: .91, roughness: .44, emissive: '#000000' });
  // A real cross-section creates long bevel highlights, recessed fullers and
  // a pointed distal taper. Flat strips glued onto a box do not read as steel.
  const bladeSections = [[-.56, .115], [-.43, .112], [.5, .091], [.87, .077], [1.24, .002]];
  const bladeProfile = [[-1, 0], [-.7, .032], [-.29, .045], [-.16, .028], [0, .026], [.16, .028], [.29, .045], [.7, .032], [1, 0], [.6, -.019], [0, -.027], [-.6, -.019]];
  const bladePositions = [], bladeUVs = [], bladeGeometry = geometry(new THREE.BufferGeometry());
  const bladeParts = Array.from({ length: 3 }, () => ({ positions: [], uvs: [] }));
  function bladePoint(section, facet) { const [x, width] = bladeSections[section], [z, y] = bladeProfile[facet]; return [x, y * Math.min(1, width / .077), z * width]; }
  function bladeTriangle(a, b, c, kind) { for (const p of [a, b, c]) { bladeParts[kind].positions.push(...p); bladeParts[kind].uvs.push((p[0] + .56) / 1.8, (p[2] + .115) / .23); } }
  for (let section = 0; section < bladeSections.length - 1; section++) {
    for (let facet = 0; facet < bladeProfile.length; facet++) {
      const next = (facet + 1) % bladeProfile.length;
      const a = bladePoint(section, facet), b = bladePoint(section + 1, facet), c = bladePoint(section + 1, next), d = bladePoint(section, next);
      const edge = facet === 0 || facet === 7 || facet >= 8;
      const kind = edge ? 1 : facet >= 2 && facet <= 5 ? 2 : 0;
      bladeTriangle(a, c, b, kind); bladeTriangle(a, d, c, kind);
    }
  }
  bladeParts.forEach((part, kind) => { bladeGeometry.addGroup(bladePositions.length / 3, part.positions.length / 3, kind); bladePositions.push(...part.positions); bladeUVs.push(...part.uvs); });
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladePositions, 3)); bladeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(bladeUVs, 2)); bladeGeometry.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeometry, [bladeMaterial, edgeMaterial, fullerMaterial]); blade.castShadow = true; blade.receiveShadow = true; swordGroup.add(blade);
  const guardShape = new THREE.Shape();
  guardShape.moveTo(-.11, -.31); guardShape.bezierCurveTo(-.055, -.22, -.048, -.1, -.05, 0);
  guardShape.bezierCurveTo(-.048, .1, -.055, .22, -.11, .31); guardShape.quadraticCurveTo(-.045, .35, -.018, .3);
  guardShape.bezierCurveTo(.04, .18, .06, .1, .06, 0); guardShape.bezierCurveTo(.06, -.1, .04, -.18, -.018, -.3); guardShape.quadraticCurveTo(-.045, -.35, -.11, -.31); guardShape.closePath();
  const guard = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(guardShape, { depth: .042, bevelEnabled: true, bevelSize: .012, bevelThickness: .015, bevelSegments: 3, curveSegments: 10 })), brass);
  guard.rotation.x = -Math.PI / 2; guard.position.set(-.62, -.006, 0); guard.castShadow = true; swordGroup.add(guard);
  const swordHandle = lathe(swordGroup, leather, [[.048, 0], [.062, .025], [.066, .09], [.058, .23], [.063, .34], [.048, .45]], 24);
  swordHandle.rotation.z = -Math.PI / 2; swordHandle.position.set(-1.15, .016, 0); swordHandle.scale.z = .86;
  const gripSeam = [];
  for (let i = 0; i <= 100; i++) { const t = i / 100, a = t * Math.PI * 2 * 7; gripSeam.push(new THREE.Vector3(-1.12 + t * .39, .016 + Math.cos(a) * .064, Math.sin(a) * .056)); }
  const seam = new THREE.Mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gripSeam), 100, .0045, 4, false)), darkWood); swordGroup.add(seam);
  for (const x of [-.71, -1.14]) { const ferrule = cylinder(swordGroup, brass, .065, .065, .036, x, .016, 0, 24); ferrule.rotation.z = Math.PI / 2; }
  sphere(swordGroup, brass, -1.2, .016, 0, .102, .049, .108);
  const pommelRim = new THREE.Mesh(geometry(new THREE.TorusGeometry(.091, .012, 8, 28)), polishedIron); pommelRim.rotation.x = Math.PI / 2; pommelRim.position.set(-1.2, .043, 0); swordGroup.add(pommelRim);
  const pommelGem = new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.05, 1)), gemMaterial); pommelGem.position.set(-1.2, .065, 0); pommelGem.scale.y = .5; swordGroup.add(pommelGem);
  const swordLight = new THREE.PointLight('#ff722d', 0, 2.4, 1.8); swordLight.position.set(0, 0.22, 0); swordGroup.add(swordLight);
  swordGroup.visible = false;

  // SVG source for the ledger, decoded only when its displayed values change.
  const boardTexture = vectorTexture(ledgerArt(), 3072);
  const board = group(-1.55, 2.43, -3.47);
  board.scale.setScalar(.89);
  box(board, darkWood, 0, 0, 0, 3.48, 1.78, 0.16);
  for (const y of [-0.84, 0.84]) box(board, wood, 0, y, 0.07, 3.54, 0.09, 0.11);
  for (const x of [-1.71, 1.71]) box(board, wood, x, 0, 0.07, 0.09, 1.72, 0.11);
  const boardMaterial = material({ map: boardTexture, roughness: 1, emissive: '#ffffff', emissiveMap: boardTexture, emissiveIntensity: 0.2 });
  const boardFace = new THREE.Mesh(geometry(new THREE.PlaneGeometry(3.33, 1.63)), boardMaterial); boardFace.position.z = 0.091; board.add(boardFace);
  for (const x of [-1.5, 1.5]) {
    cylinder(board, iron, 0.024, 0.024, 0.77, x, 1.22, -0.04, 6);
    for (const y of [-0.75, 0.75]) sphere(board, brass, x * 1.07, y, 0.14, 0.03);
  }
  function updateBoard(data = {}) {
    const key = JSON.stringify(data); if (key === boardKey) return; boardKey = key;
    vectorPanels.get(boardTexture).update(ledgerArt(data).body);
  }
  updateBoard();
  const calendarMap = vectorTexture(calendarArt(1), 1536);
  const calendarMat = material({ map: calendarMap, roughness: 1 });
  // The old hook behind the hearth hid half the page. Hang it in the clear
  // wall bay between the ledger and tribute grate; keep true scene depth.
  const calendar = new THREE.Mesh(geometry(new THREE.PlaneGeometry(0.94, 1.42)), calendarMat); calendar.position.set(.64, 2.5, -3.51); calendar.rotation.z = 0.035; scene.add(calendar);
  sphere(scene, iron, .64, 3.15, -3.49, 0.03);

  // Dragon eye in a deep black recess, behind a heavy iron grate.
  const dragon = group(2.94, 0, -3.45);
  const black = material({ color: '#050908', roughness: 1 });
  box(dragon, black, 0, 2.2, -0.1, 2.77, 2.55, 0.22);
  for (const x of [-1.4, 1.4]) box(dragon, darkStone, x, 2.18, 0.03, 0.35, 2.74, 0.42);
  for (const y of [0.84, 3.53]) box(dragon, darkStone, 0, y, 0.03, 3.12, 0.32, 0.42);
  const eyeMap = vectorTexture(WORKSHOP_ART.eye, 2048);
  const eyeMaterial = new THREE.MeshBasicMaterial({ map: eyeMap, transparent: true, depthWrite: false, color: '#ffffff' }); materials.add(eyeMaterial);
  const eye = new THREE.Mesh(geometry(new THREE.PlaneGeometry(2.25, 1.05)), eyeMaterial); eye.position.set(0, 2.42, 0.035); dragon.add(eye);
  for (let x = -1.18; x <= 1.2; x += 0.3) cylinder(dragon, iron, 0.047, 0.047, 2.45, x, 2.2, 0.33, 8);
  for (const y of [1.23, 2.05, 3.22]) box(dragon, iron, 0, y, 0.37, 2.71, 0.1, 0.12);
  for (const x of [-1.35, 1.35]) {
    box(dragon, iron, x, 2.19, 0.36, 0.15, 2.63, 0.12);
    for (let y = 1.1; y <= 3.4; y += 0.45) sphere(dragon, polishedIron, x, y, 0.44, 0.048, 0.048, 0.027);
  }
  const dragonLight = new THREE.PointLight('#e85020', 5, 4, 1.7); dragonLight.position.set(2.94, 2.4, -3.1); scene.add(dragonLight);
  const counter = group(2.94, 0, -2.12);
  for (const x of [-1.2, 1.2]) box(counter, darkWood, x, 0.57, 0, 0.19, 1.14, 0.77);
  box(counter, darkWood, 0, 0.55, 0.28, 2.75, 0.86, 0.12);
  box(counter, wood, 0, 1.08, 0, 2.96, 0.18, 1.22);
  for (const x of [-1.35, 1.35]) for (const y of [.23, .87]) sphere(counter, iron, x, y, .365, .035);
  label(counter, 'TRIBUTE · 龙之贡台', 0, 0.55, 0.357, 2.1);
  cylinder(counter, iron, .23, .23, .07, -.82, 1.225, .13);
  const bellProfile = [new THREE.Vector2(.02, 0), new THREE.Vector2(.08, .06), new THREE.Vector2(.11, .19), new THREE.Vector2(.2, .28), new THREE.Vector2(.25, .3)];
  const bell = new THREE.Mesh(geometry(new THREE.LatheGeometry(bellProfile, 24)), brass); bell.rotation.z = Math.PI; bell.position.set(-.82, 1.53, .13); bell.castShadow = true; counter.add(bell);
  sphere(counter, iron, -.82, 1.57, .13, .055);
  box(counter, darkWood, .53, 1.205, -.08, .81, .04, .5);
  for (let i = 0; i < 7; i++) cylinder(counter, brass, .05, .05, .025, .21 + random() * .5, 1.24 + (i % 3) * .023, -.2 + random() * .2);
  stationBounds('tribute', 2.94, 1.25, -2.3, 3.2, 2.5, 1.7);
  collisions.push({ x: 2.94, z: -2.12, sx: 3, sz: 1.35 });

  // The purchase machine is permanent; collected relics live on a separate
  // eight-slot shelf farther along the wall, independent of merchant visits.
  const relicShop = createRelicShopRenderer({ woodTexture, metalTexture, anisotropy }); scene.add(relicShop.root);
  const ghost = group(.9, .12, -1.8, -.05); ghost.visible = false;
  const clothMap = vectorTexture(WORKSHOP_ART.cloth);
  const cloak = material({ color: '#6fb5b0', map: clothMap, bumpMap: clothMap, bumpScale: .004, roughness: .94, emissive: '#2b7479', emissiveIntensity: .34, transparent: true, opacity: .36, depthWrite: false, side: THREE.DoubleSide });
  const innerCloth = material({ color: '#336d70', map: clothMap, roughness: 1, emissive: '#24585e', emissiveIntensity: .2, transparent: true, opacity: .29, depthWrite: false, side: THREE.DoubleSide });
  const clothTrim = material({ color: '#89c8ba', roughness: .84, metalness: .08, emissive: '#38817c', emissiveIntensity: .3, transparent: true, opacity: .65, depthWrite: false });
  const spectralSkin = material({ color: '#6eaaa6', roughness: .78, emissive: '#275d61', emissiveIntensity: .28 });
  // Lofted cloth rings give the robe shoulders, a waist and a weighted hem.
  // Folds change depth as they fall, so the silhouette is not a perfect cone.
  function drapedCloth(rings, mat, opening = .14, foldCount = 10) {
    const positions = [], uv = [], indices = [], steps = 48;
    rings.forEach(([y, radius, depth, fold], row) => {
      for (let col = 0; col <= steps; col++) {
        const a = opening + col / steps * (Math.PI * 2 - opening * 2);
        const ripple = Math.cos(a * foldCount + y * 1.6) * fold + Math.sin(a * 3 + y * 2) * fold * .35;
        const hem = row === 0 ? Math.sin(a * 5) * .018 + Math.sin(a * 11) * .012 : 0;
        positions.push(Math.sin(a) * (radius + ripple), y + hem, Math.cos(a) * (depth + ripple)); uv.push(col / steps, y / 1.4);
        if (row && col) { const n = row * (steps + 1) + col; indices.push(n - 1, n - steps - 2, n - steps - 1, n - 1, n - steps - 1, n); }
      }
    });
    const g = geometry(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; ghost.add(mesh); return mesh;
  }
  drapedCloth([[.17, .29, .19, .025], [.45, .27, .17, .022], [.87, .2, .15, .014], [1.18, .25, .16, .012], [1.35, .16, .13, .008]], innerCloth, 0, 9);
  drapedCloth([[.13, .36, .235, .037], [.35, .32, .205, .032], [.7, .255, .175, .027], [1.05, .25, .18, .015], [1.24, .325, .18, .015], [1.38, .16, .12, .007]], cloak);
  drapedCloth([[1.08, .33, .21, .017], [1.18, .37, .2, .015], [1.32, .285, .17, .013], [1.43, .15, .11, .008]], cloak, .3, 7);

  // The cowl is a hollow shell, swept backward from a pointed face opening.
  // A thick rim exposes the shadowed lining rather than a black ball-head.
  const hoodPositions = [], hoodUV = [], hoodIndices = [], hoodSteps = 40;
  const hoodRings = [[.26, .23, .295, 1.685], [.12, .255, .295, 1.685], [-.09, .205, .255, 1.69], [-.19, .075, .15, 1.7], [-.205, .003, .004, 1.7]];
  function hoodPoint(a, width, height, y, z) {
    const topPoint = Math.pow(Math.max(0, Math.cos(a)), 9) * .033;
    const jaw = Math.cos(a) < -.25 ? .86 : 1;
    return [Math.sin(a) * width * jaw, y + Math.cos(a) * height + topPoint, z];
  }
  hoodRings.forEach(([z, width, height, y], row) => {
    for (let col = 0; col <= hoodSteps; col++) {
      const a = col / hoodSteps * Math.PI * 2; hoodPositions.push(...hoodPoint(a, width, height, y, z)); hoodUV.push(col / hoodSteps, row / 4);
      if (row && col) { const n = row * (hoodSteps + 1) + col; hoodIndices.push(n - 1, n, n - hoodSteps - 1, n - 1, n - hoodSteps - 1, n - hoodSteps - 2); }
    }
  });
  const hoodGeometry = geometry(new THREE.BufferGeometry()); hoodGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hoodPositions, 3)); hoodGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(hoodUV, 2)); hoodGeometry.setIndex(hoodIndices); hoodGeometry.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeometry, cloak); hood.castShadow = true; ghost.add(hood);
  const rimPositions = [], rimIndices = [], openingPoints = [];
  for (let col = 0; col <= hoodSteps; col++) {
    const a = col / hoodSteps * Math.PI * 2;
    const outer = hoodPoint(a, .23, .295, 1.685, .261), inner = hoodPoint(a, .177, .232, 1.691, .28);
    rimPositions.push(...outer, ...inner); openingPoints.push(new THREE.Vector3(...inner));
    if (col) { const n = col * 2; rimIndices.push(n - 2, n - 1, n, n - 1, n + 1, n); }
  }
  const rimGeometry = geometry(new THREE.BufferGeometry()); rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rimPositions, 3)); rimGeometry.setIndex(rimIndices); rimGeometry.computeVertexNormals();
  ghost.add(new THREE.Mesh(rimGeometry, innerCloth));
  const rim = new THREE.Mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(openingPoints, true), 64, .011, 6, true)), clothTrim); ghost.add(rim);
  const facePositions = [0, 1.69, .15], faceIndices = [];
  for (let col = 0; col <= hoodSteps; col++) { const a = col / hoodSteps * Math.PI * 2; facePositions.push(...hoodPoint(a, .177, .232, 1.691, .235)); if (col) faceIndices.push(0, col, col + 1); }
  const faceGeometry = geometry(new THREE.BufferGeometry()); faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3)); faceGeometry.setIndex(faceIndices); faceGeometry.computeVertexNormals();
  const faceShadow = material({ color: '#071b1e', roughness: 1, side: THREE.DoubleSide }); ghost.add(new THREE.Mesh(faceGeometry, faceShadow));
  for (const side of [-1, 1]) {
    const sleevePath = new THREE.CatmullRomCurve3([new THREE.Vector3(side * .26, 1.265, .015), new THREE.Vector3(side * .37, 1.14, .13), new THREE.Vector3(side * .28, 1.06, .285), new THREE.Vector3(side * -.13, 1.15 + side * .025, .34)]);
    const sleeveGeometry = geometry(new THREE.TubeGeometry(sleevePath, 18, 1, 16, false)); const attr = sleeveGeometry.attributes.position;
    for (let row = 0; row <= 18; row++) {
      const t = row / 18, center = sleevePath.getPointAt(t), r = .132 - t * .035;
      for (let col = 0; col <= 16; col++) { const i = row * 17 + col, ripple = 1 + Math.cos(col / 16 * Math.PI * 12 + t) * .065; attr.setXYZ(i, center.x + (attr.getX(i) - center.x) * r * ripple, center.y + (attr.getY(i) - center.y) * r * ripple, center.z + (attr.getZ(i) - center.z) * r * ripple); }
    } sleeveGeometry.computeVertexNormals(); const sleeve = new THREE.Mesh(sleeveGeometry, cloak); sleeve.castShadow = true; ghost.add(sleeve);
    const cuff = new THREE.Mesh(geometry(new THREE.TorusGeometry(.096, .012, 6, 20)), clothTrim); cuff.position.copy(sleevePath.getPointAt(1)); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sleevePath.getTangentAt(1)); ghost.add(cuff);
    const palm = bevelBox(ghost, spectralSkin, side * -.17, 1.15 + side * .025, .34, .086, .047, .032, .015); palm.rotation.z = side * -.15;
    for (let finger = 0; finger < 4; finger++) {
      const y = 1.145 + side * .025 + (finger - 1.5) * .01;
      const fingerCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * -.19, y, .354), new THREE.Vector3(side * -.215, y, .355), new THREE.Vector3(side * -.23, y - .009, .334)]);
      ghost.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(fingerCurve, 6, .008, 6, false)), spectralSkin));
    }
    const thumbCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * -.15, 1.174 + side * .025, .35), new THREE.Vector3(side * -.18, 1.184 + side * .025, .36), new THREE.Vector3(side * -.195, 1.164 + side * .025, .367)]);
    ghost.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(thumbCurve, 7, .011, 6, false)), spectralSkin));
  }
  const auraMap = textureCanvas(128, 64, (ctx, w, h) => { const g = ctx.createRadialGradient(64, 32, 0, 64, 32, 62); g.addColorStop(0, 'rgba(113,220,215,.35)'); g.addColorStop(1, 'rgba(40,134,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
  const auraMaterial = new THREE.SpriteMaterial({ map: auraMap, transparent: true, opacity: .24, blending: THREE.AdditiveBlending, depthWrite: false }); materials.add(auraMaterial);
  const aura = new THREE.Sprite(auraMaterial); aura.position.y = .17; aura.scale.set(.95, .3, 1); ghost.add(aura);
  ghost.traverse(mesh => { mesh.castShadow = false; });
  const merchantGoods = group(.9, .12, -1.8); merchantGoods.visible = false;
  const merchantTarget = stationBounds('merchant', .9, 1.35, -1.8, 2.8, 2.5, 1.1); merchantTarget.visible = false;
  const displayRingMaterial = new THREE.MeshBasicMaterial({ color: '#66b9ac', transparent: true, opacity: .52, depthWrite: false }); materials.add(displayRingMaterial);
  const displayRingGeometry = geometry(new THREE.TorusGeometry(.32, .008, 4, 36));
  stationBounds('relics', 5.15, 1.4, -.15, 1.1, 2.8, 3.15);
  collisions.push({ x: 5.15, z: -.15, sx: 1.12, sz: 3.15 }, { x: 5.35, z: 2.24, sx: .65, sz: 1.13 });

  const rack = group(-5.22, 0, 1.16, Math.PI / 2);
  for (const x of [-.75, .75]) box(rack, darkWood, x, 1.05, 0, .14, 2.1, .24);
  for (const y of [.35, 1.55, 2.06]) box(rack, wood, 0, y, 0, 1.65, .12, .3);
  label(rack, 'SWORD RACK · 剑架', 0, 2.33, .05, 1.7);
  stationBounds('rack', -5.05, 1.15, 1.15, .95, 2.3, 2);
  collisions.push({ x: -5.05, z: 1.15, sx: 1.05, sz: 2 });
  // Small clutter stays at the edges of the walkable room.
  function barrel(x, z) {
    const b = group(x, 0, z); cylinder(b, wood, .36, .36, .85, 0, .43, 0, 12);
    for (const y of [.15, .68]) cylinder(b, iron, .375, .375, .07, 0, y, 0, 12);
    cylinder(b, darkWood, .35, .35, .04, 0, .87, 0, 12); collisions.push({ x, z, sx: .8, sz: .8 });
  } barrel(-4.95, 3.24); barrel(5.04, 3.28);
  box(scene, darkWood, -4.03, .29, 3.25, .79, .58, .75, .14);
  for (let i = 0; i < 6; i++) { const log = cylinder(scene, darkWood, .105, .105, .63, -5.1 + (i % 3) * .21, .13 + Math.floor(i / 3) * .2, -1.2); log.rotation.x = Math.PI / 2; }
  // A lantern overhead gives the central metal a pale warm specular edge.
  const lantern = group(-.3, 3.44, -.48);
  cylinder(lantern, iron, .016, .016, .9, 0, .6, 0, 6);
  box(lantern, brass, 0, .07, 0, .32, .065, .32); box(lantern, iron, 0, .43, 0, .32, .06, .32);
  for (const x of [-.14, .14]) for (const z of [-.14, .14]) box(lantern, iron, x, .25, z, .018, .36, .018);
  sphere(lantern, orange, 0, .25, 0, .08, .14, .08);

  // The hammer is camera-local: it reads as a hand-held tool in every view.
  const hammer = new THREE.Group(); camera.add(hammer);
  const hammerHandle = lathe(hammer, wood, [[.043, 0], [.047, .035], [.04, .22], [.034, .54], [.038, .69], [.044, .78]], 24);
  hammerHandle.position.set(.035, -.39, 0); hammerHandle.rotation.z = -.12; hammerHandle.scale.z = .78;
  const headAssembly = new THREE.Group(); headAssembly.position.fromArray(HAMMER_HEAD.position); headAssembly.rotation.z = HAMMER_HEAD.roll; headAssembly.scale.setScalar(HAMMER_HEAD.scale); hammer.add(headAssembly);
  bevelBox(headAssembly, iron, -.01, 0, 0, .36, .235, .245, .044);
  bevelBox(headAssembly, polishedIron, -.22, 0, 0, .13, .22, .232, .032);
  bevelBox(headAssembly, iron, .205, 0, 0, .15, .14, .175, .042);
  // A forged cross-peen tapers to a rounded edge on the back of the head.
  const peenShape = new THREE.Shape(); peenShape.moveTo(.205, -.075); peenShape.lineTo(.365, -.024); peenShape.quadraticCurveTo(.39, 0, .365, .024); peenShape.lineTo(.205, .075); peenShape.closePath();
  const peen = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(peenShape, { depth: .17, bevelEnabled: true, bevelSize: .014, bevelThickness: .015, bevelSegments: 3 })), iron); peen.position.z = -.085; headAssembly.add(peen);
  bevelBox(headAssembly, darkWood, 0, .125, 0, .078, .014, .065, .007);
  bevelBox(headAssembly, polishedIron, -.01, -.115, 0, .125, .025, .21, .014);
  const neckCollar = cylinder(hammer, iron, .054, .048, .09, -.04, .265, 0, 24); neckCollar.rotation.z = -.12;
  const hammerGrip = lathe(hammer, leather, [[.048, 0], [.052, .03], [.052, .21], [.044, .3]], 24); hammerGrip.position.set(.018, -.34, 0);
  const handleSeam = [];
  for (let i = 0; i <= 72; i++) { const t = i / 72, a = t * Math.PI * 2 * 7; handleSeam.push(new THREE.Vector3(.018 + Math.cos(a) * .051, -.325 + t * .27, Math.sin(a) * .048)); }
  hammer.add(new THREE.Mesh(geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handleSeam), 72, .003, 4, false)), darkWood));
  // Palm, curled fingers and opposing thumb form a grip, rather than the old
  // single oval. The forearm angles down naturally out of the viewport.
  const glove = material({ color: '#71513c', map: leatherTexture, roughness: .92, bumpMap: leatherTexture, bumpScale: .005 });
  const palm = bevelBox(hammer, glove, .055, -.205, .067, .125, .185, .085, .034); palm.rotation.z = -.13;
  for (let finger = 0; finger < 4; finger++) {
    const y = -.126 - finger * .045;
    const curl = new THREE.CatmullRomCurve3([new THREE.Vector3(.104, y, .056), new THREE.Vector3(.068, y + .007, -.015), new THREE.Vector3(.005, y + .005, -.052), new THREE.Vector3(-.033, y, -.015), new THREE.Vector3(-.024, y, .025)]);
    const fingerMesh = new THREE.Mesh(geometry(new THREE.TubeGeometry(curl, 10, .021 - finger * .0015, 8, false)), glove); hammer.add(fingerMesh);
  }
  const thumb = sphere(hammer, glove, -.019, -.17, .071, .034, .074, .029); thumb.rotation.z = -.7;
  const wristMarker = new THREE.Object3D(); wristMarker.position.copy(HAMMER_WRIST); hammer.add(wristMarker);
  const forearmGroup = new THREE.Group(); camera.add(forearmGroup);
  const wrist = cylinder(forearmGroup, glove, .069 * .68, .073 * .68, 1, 0, 0, 0, 20);
  const sleeve = material({ color: '#353b38', map: woodTexture, roughness: 1 });
  const cuff = cylinder(forearmGroup, sleeve, .082 * .68, .104 * .68, 1, 0, 0, 0, 20);
  const wristBand = cylinder(forearmGroup, leather, .086 * .68, .087 * .68, 1, 0, 0, 0, 20);
  const upperArmGroup = new THREE.Group(); camera.add(upperArmGroup);
  const upperSleeve = cylinder(upperArmGroup, sleeve, .104 * .68, .13 * .68, 1, 0, 0, 0, 20);
  const elbowJoint = sphere(upperArmGroup, sleeve, 0, 0, 0, .104 * .68); elbowJoint.castShadow = true; elbowJoint.receiveShadow = true;
  const wristPosition = new THREE.Vector3();
  let hammerReadyBlend = 0, readyContact = null;
  hammer.position.set(.56, -.47, -.82); hammer.rotation.set(.1, -.3, -.44); hammer.scale.setScalar(.68);
  const toolFill = new THREE.PointLight('#dcc6a3', 1.5, 2.3, 1.8); toolFill.position.set(-.15, .2, -.15); camera.add(toolFill);

  const sparkCount = 100, sparkPositions = new Float32Array(sparkCount * 3), sparkColors = new Float32Array(sparkCount * 3);
  const sparkVelocity = new Float32Array(sparkCount * 3), sparkLife = new Float32Array(sparkCount);
  const sparkGeometry = geometry(new THREE.BufferGeometry()); sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3)); sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
  const particleMap = textureCanvas(32, 32, (ctx, w, h) => { const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'white'); g.addColorStop(.25, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
  const sparkMaterial = new THREE.PointsMaterial({ size: .072, map: particleMap, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }); materials.add(sparkMaterial);
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; scene.add(sparks);
  for (let i = 0; i < sparkCount; i++) sparkPositions[i * 3 + 1] = -10;
  const trailCount = renderPolicy.antialias ? 32 : 16, trailPositions = new Float32Array(trailCount * 6), trailColors = new Float32Array(trailCount * 6);
  const trailGeometry = geometry(new THREE.BufferGeometry()); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3)); trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); materials.add(trailMaterial);
  const sparkTrails = new THREE.LineSegments(trailGeometry, trailMaterial); sparkTrails.frustumCulled = false; sparkTrails.visible = false; scene.add(sparkTrails);
  const impactMaterial = new THREE.SpriteMaterial({ map: particleMap, color: '#ffe4a5', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); materials.add(impactMaterial);
  const impactFlare = new THREE.Sprite(impactMaterial); impactFlare.visible = false; impactFlare.scale.set(.25, .25, 1); scene.add(impactFlare);
  const impactLight = new THREE.PointLight('#ffad43', 0, 1.9, 2); scene.add(impactLight);
  let impactFlashLife = 0;
  const avatar = createShadowAvatar(); scene.add(avatar.root);
  const ticketBoard = createTicketBoard({ anisotropy }); ticketBoard.root.position.set(0, 2.25, 4.96); ticketBoard.root.rotation.y = Math.PI; scene.add(ticketBoard.root);
  stationBounds('tickets', 0, 2.25, 4.94, 3.8, 1.9, .18);
  const motion = createWorkshopMotion({
    scene,
    furnacePose: { parent: scene, position: new THREE.Vector3(-4.18, 1.18, -1.72), quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), scale: new THREE.Vector3(.75, .75, .75) },
    onTransferEnd: id => { const entry = physicalSwords.get(id); if (entry) entry.hit.visible = !['hands', 'anvil'].includes(entry.location); syncFloorPhysics(); },
    onImpact: emitImpact,
  });
  function syncFloorPhysics() { swordPhysics.sync(floorSwords.filter(sword => !motion.isTransferring(sword.id))); }
  const dustCount = 90, dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) { dustPositions[i * 3] = random() * 11 - 5.5; dustPositions[i * 3 + 1] = random() * 4; dustPositions[i * 3 + 2] = random() * 9 - 3.6; }
  const dustGeometry = geometry(new THREE.BufferGeometry()); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({ color: '#d7c197', opacity: .32, transparent: true, map: particleMap, size: .016, depthWrite: false }); materials.add(dustMat);
  const dust = new THREE.Points(dustGeometry, dustMat); scene.add(dust);
  const emberPositions = new Float32Array(32 * 3), emberGeometry = geometry(new THREE.BufferGeometry()); emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const emberMat = new THREE.PointsMaterial({ color: '#ff9a36', size: .035, map: particleMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); materials.add(emberMat);
  const embers = new THREE.Points(emberGeometry, emberMat); scene.add(embers);

  const swordHitMaterial = material({ transparent: true, opacity: 0, depthWrite: false });
  const swordPhysics = createSwordPhysics(collisions);
  const warningMap = vectorTexture(WORKSHOP_ART.warning, 512);
  const dragonWarnings = [];
  for (let i = 0; i < 3; i++) { const m = new THREE.MeshBasicMaterial({ map: warningMap, transparent: true, color: '#706652', opacity: .36, depthWrite: false }); materials.add(m); const glyph = new THREE.Mesh(geometry(new THREE.PlaneGeometry(.3, .3)), m); glyph.position.set(.38 + i * .39, 3.73, -3.48); scene.add(glyph); dragonWarnings.push(glyph); }
  function updateCalendar(day) {
    if (calendarDay === day) return; calendarDay = day;
    vectorPanels.get(calendarMap).update(calendarArt(day).body);
  }

  function clearMerchantGoods() {
    merchantModels.forEach(m => swordRenderer.disposeInstance(m)); merchantModels.length = 0;
    for (const child of [...merchantGoods.children]) {
      const resources = child.userData.resources;
      resources?.geometries.forEach(g => { geometries.delete(g); g.dispose(); });
      resources?.materials.forEach(m => { materials.delete(m); m.dispose(); });
      resources?.textures.forEach(disposeTexture);
      child.removeFromParent();
    }
  }
  function updateMerchant(stock = []) {
    const key = JSON.stringify(stock.map(s => [s.id, s.remaining, s.name, s.price, s.kind, s.typeKey])); if (key === merchantKey) return; merchantKey = key; clearMerchantGoods();
    stock.filter(row => row.remaining > 0).forEach((row, i) => {
      const before = { geometries: new Set(geometries), materials: new Set(materials), textures: new Set(textures) };
      // Four spaced tiers flank the cowl; extra stock forms a separate bank
      // forward of the first, rather than sharing the upper two slots.
      const slot = i % 8, bank = Math.floor(i / 8);
      const product = new THREE.Group(); product.position.set(slot % 2 ? .88 : -.88, .55 + Math.floor(slot / 2) * .65, .1 + bank * .95); merchantGoods.add(product);
      const ring = new THREE.Mesh(displayRingGeometry, displayRingMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = -.09; ring.scale.set(1.18, 1, .72); product.add(ring);
      if (row.kind === 'sword' || row.typeKey) { const sword = swordRenderer.create({ id: row.id, typeKey: row.typeKey || 'funerary', level: row.level || 0, heat: 0 }); sword.scale.setScalar(.4); sword.rotation.set(0, -.2, i % 2 ? -.3 : .3); sword.position.y = .14; sword.traverse(m => { m.castShadow = false; }); product.add(sword); merchantModels.push(sword); }
      else if (/undo|rewind|clock|watch/i.test(row.itemId || row.id)) { const watch = cylinder(product, brass, .16, .16, .05, 0, .15, 0, 24); watch.rotation.x = Math.PI / 2; box(product, iron, 0, .15, .04, .014, .2, .01); }
      else if (/order|book|contract/i.test(row.itemId || row.id)) { const book = bevelBox(product, darkWood, 0, .14, 0, .25, .32, .11, .017); book.rotation.z = -.15; box(product, brass, .015, .14, .063, .025, .26, .014); }
      else { const bottle = lathe(product, cyan, [[.07, 0], [.11, .03], [.11, .19], [.043, .25], [.043, .33]], 16); cylinder(product, darkWood, .05, .05, .05, 0, .345, 0, 12); }
      const tag = label(product, `${row.name || row.id} · ${row.price || 0} G ×${row.remaining}`, 0, -.23, .17, .88, '#9dc4b7'); tag.userData.stockLabel = true;
      product.userData.resources = { geometries: [...geometries].filter(g => !before.geometries.has(g)), materials: [...materials].filter(m => !before.materials.has(m)), textures: [...textures].filter(t => !before.textures.has(t)) };
    });
  }
  function setWorld(payload) {
    if (!payload || disposed) return;
    worldState = payload; swordGroup.visible = false; swordState = payload.swords?.find(s => s.id === payload.anvilId) || null;
    updateCalendar(Math.max(1, Number(payload.day) || 1)); setDragon(payload.anger || 0);
    const visit = !!payload.merchantVisible; ghost.visible = visit; merchantGoods.visible = visit; merchantTarget.visible = visit;
    if (!visit && focused === 'merchant') focus(null);
    updateMerchant(visit ? payload.merchantStock || [] : []);
    relicShop.update(payload.shop, payload.relics || []);
    if (payload.ticketDisplay) ticketBoard.update(payload.ticketDisplay);
    const ids = new Set((payload.swords || []).map(s => s.id));
    for (const [id, entry] of physicalSwords) if (!ids.has(id)) { motion.forget(id); swordRenderer.disposeInstance(entry.mesh); const index = swordTargets.indexOf(entry.hit); if (index >= 0) swordTargets.splice(index, 1); physicalSwords.delete(id); }
    let rackIndex = 0, tributeIndex = 0;
    const floor = [];
    for (const sword of payload.swords || []) {
      const location = sword.id === payload.carriedId ? 'hands' : sword.id === payload.anvilId ? 'anvil' : sword.location || 'floor';
      let entry = physicalSwords.get(sword.id);
      const created = !entry;
      if (!entry) {
        const mesh = swordRenderer.create(sword), hit = new THREE.Mesh(boxGeometry, swordHitMaterial); hit.scale.set(2.6, .23, .7); hit.userData.swordId = sword.id; mesh.add(hit); swordTargets.push(hit); entry = { mesh, hit }; physicalSwords.set(sword.id, entry);
      } else swordRenderer.update(entry.mesh, sword);
      entry.location = location;
      entry.mesh.traverse(m => { if (m.isMesh) m.castShadow = ['hands','anvil','rack','tribute'].includes(location) && m !== entry.hit; });
      const destination = { parent: location === 'hands' ? camera : scene, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3().setScalar(location === 'hands' ? .46 : location === 'anvil' ? .96 : location === 'floor' ? .78 : .65) };
      if (location === 'hands') { const held = getHeldSwordPose(camera.aspect); destination.position.copy(held.position); destination.quaternion.copy(held.quaternion); destination.scale.copy(held.scale); }
      else if (location === 'anvil') destination.position.set(-1.08, 1.58, -.92);
      else if (location === 'rack') { destination.position.set(-4.94, 1.1, .43 + (rackIndex % 8) * .21); destination.quaternion.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)); rackIndex++; }
      else if (location === 'tribute') { destination.position.set(2.85, 1.24 + tributeIndex * .05, -2.12 + (tributeIndex % 3 - 1) * .19); destination.quaternion.setFromEuler(new THREE.Euler(0, tributeIndex % 2 ? .18 : -.18, 0)); tributeIndex++; }
      else { const hash = String(sword.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0), p = sword.position || { x: -2.8 + hash % 4 * .61, y: .11, z: .9 + Math.floor(hash / 4) % 3 * .42 }; destination.position.set(p.x, Math.max(.085, p.y ?? .11), p.z); floor.push({ ...sword, position: p }); }
      const token = `${location}/${destination.position.toArray().join('/')}/${destination.quaternion.toArray().join('/')}`;
      motion.place(sword.id, entry.mesh, destination, { token, animate: !created });
      entry.hit.visible = !['hands','anvil'].includes(location) && !motion.isTransferring(sword.id);
    }
    floorSwords = floor; syncFloorPhysics();
  }

  function setSword(sword) {
    if (worldState) { swordGroup.visible = false; return; }
    swordState = sword ? { ...sword } : null; swordGroup.visible = !!sword;
    if (!sword) { swordLight.intensity = 0; return; }
    const level = sword.level || 0, heat = THREE.MathUtils.clamp((sword.heat || 0) / 100, 0, 1);
    bladeMaterial.color.set(level >= 12 ? '#d9c6ff' : level >= 6 ? '#b9dde9' : '#b8c2c7');
    bladeMaterial.emissive.set(heat > .2 ? '#ff5719' : level >= 12 ? '#8052bb' : '#09232b');
    bladeMaterial.emissiveIntensity = heat * 1.8 + Math.min(level, 20) * .012;
    edgeMaterial.emissive.copy(bladeMaterial.emissive); edgeMaterial.emissiveIntensity = bladeMaterial.emissiveIntensity * .65;
    fullerMaterial.emissive.copy(bladeMaterial.emissive); fullerMaterial.emissiveIntensity = bladeMaterial.emissiveIntensity * .8;
    gemMaterial.color.set(level >= 12 ? '#b48afa' : level >= 6 ? '#78d9ed' : '#73c9b4');
    swordLight.intensity = heat * 2.4; swordLight.color.set(heat > .2 ? '#ff7326' : '#99bdff');
    swordGroup.scale.set(1 + Math.min(level, 20) * .004, 1, 1 + Math.min(level, 20) * .008);
  }
  function setDragon(value) { anger = Math.max(0, Number(value) || 0); dragonLight.intensity = 5 + anger * 4; eyeMaterial.color.set(anger >= 2 ? '#ff775c' : '#ffffff'); dragonWarnings.forEach((glyph, i) => { glyph.material.color.set(i < anger ? '#b86b47' : '#706652'); glyph.material.opacity = i < anger ? .9 : .36; }); }
  function strike(outcome) {
    if (disposed || paused || contextLost) return false;
    const kind = typeof outcome === 'string' ? outcome : (outcome?.type || outcome?.kind || outcome?.outcome || 'success');
    const anvilSword = physicalSwords.get(worldState?.anvilId)?.mesh;
    const surface = findForgeContact(anvilSword || swordGroup, { bladeMaterials: anvilSword ? null : [bladeMaterial, edgeMaterial, fullerMaterial] });
    const position = surface?.position || wornFace.getWorldPosition(new THREE.Vector3());
    if (!motion.strike({ outcome: kind, evolved: !!outcome?.evolved, durationMs: outcome?.durationMs, position })) return false;
    if (anvilSword && outcome?.evolved) anvilSword.userData.flash = 0;
    strikeTime = elapsed; strikeKind = kind; return true;
  }
  function emitImpact(impact) {
    const pendingSwing = motion.getStrike();
    onStrikeImpact({ outcome: impact.outcome, evolved: impact.evolved, position: { x: impact.position.x, y: impact.position.y, z: impact.position.z } });
    if (disposed || contextLost || motion.getStrike() !== pendingSwing) return { position: impact.position };
    // The callback commits the new form. Keep break sparks at the old contact,
    // but align surviving swords and the hammer with the new rendered surface.
    const anvilSword = physicalSwords.get(worldState?.anvilId)?.mesh;
    if (impact.outcome !== 'break') {
      const surface = findForgeContact(anvilSword || (!worldState && swordState ? swordGroup : null), { bladeMaterials: anvilSword ? null : [bladeMaterial, edgeMaterial, fullerMaterial] });
      if (surface) impact.position.copy(surface.position);
    }
    impactThisFrame = true;
    strikeKind = impact.outcome;
    impactFlashLife = .08; impactFlare.position.copy(impact.position); impactFlare.position.y += .035; impactFlare.visible = true; impactMaterial.opacity = .92;
    impactLight.position.copy(impact.position); impactLight.position.y += .15; impactLight.intensity = 16;
    sparkTrails.visible = true;
    for (let i = 0; i < sparkCount; i++) {
      const color = new THREE.Color(strikeKind === 'great' && i % 5 === 0 ? '#c995ff' : i % 3 === 0 ? '#ffe494' : '#ff9d2f');
      sparkPositions[i * 3] = impact.position.x + (random() - .5) * .11; sparkPositions[i * 3 + 1] = impact.position.y; sparkPositions[i * 3 + 2] = impact.position.z + (random() - .5) * .08;
      const fan = random() * Math.PI * 2, speed = 1.2 + random() * 3;
      sparkVelocity[i * 3] = Math.cos(fan) * speed; sparkVelocity[i * 3 + 1] = 1.4 + random() * 3.7; sparkVelocity[i * 3 + 2] = Math.sin(fan) * speed * .7;
      sparkLife[i] = .28 + random() * .5; sparkColors[i * 3] = color.r; sparkColors[i * 3 + 1] = color.g; sparkColors[i * 3 + 2] = color.b;
    } sparkGeometry.attributes.position.needsUpdate = true; sparkGeometry.attributes.color.needsUpdate = true;
    // The host commits the new rendered form in the contact callback. Apply
    // the flash to those new instance materials, rather than the old blade.
    if (anvilSword && impact.evolved) { anvilSword.userData.flash = .225; anvilSword.userData.localMaterials?.forEach(m => { m.emissiveIntensity = (m.userData.heatIntensity ?? m.userData.baseIntensity) + .22; }); }
    return { position: impact.position };
  }
  function beginHeating(id, durationMs = 1400) { if (disposed || paused || contextLost) return Promise.resolve(false); return motion.beginHeating(id, durationMs); }
  function cancelHeating() { motion.cancelHeating(); }
  function isInteracting() { return motion.isInteracting(); }
  function resetInteractions() { motion.reset(); strikeTime = -100; sparkLife.fill(0); for (let i = 0; i < sparkCount; i++) sparkPositions[i * 3 + 1] = -10; sparkGeometry.attributes.position.needsUpdate = true; impactFlashLife = 0; impactFlare.visible = false; impactLight.intensity = 0; sparkTrails.visible = false; syncFloorPhysics(); }
  function changeTarget(name) { if (name !== hovered) { hovered = name; onTarget(name); } }
  function pickTarget(pointer = center, reach = 5.1) {
    raycaster.setFromCamera(pointer, camera);
    const item = raycaster.intersectObjects(swordTargets.filter(t => t.visible && t.parent?.visible), false)[0];
    const station = raycaster.intersectObjects(stationMeshes.filter(t => t.visible), false)[0];
    const shop = raycaster.intersectObjects(relicShop.targets.filter(t => t.visible), false)[0];
    if (shop && shop.distance < reach && (!item || shop.distance < item.distance) && (!station || shop.distance < station.distance + .85)) return { shopAction: shop.object.userData.shopAction, prompt: shop.object.userData.prompt };
    if (item && item.distance < reach && (!station || item.distance < station.distance + .85)) return { swordId: item.object.userData.swordId };
    return station && station.distance < reach ? { station: station.object.userData.station } : null;
  }
  function activateTarget(target) { if (target?.shopAction) onShopAction({ ...target.shopAction }); else if (target?.swordId) onSword(target.swordId); else if (target?.station) onInteract(target.station); }
  function dropPoint() {
    const direction = camera.getWorldDirection(new THREE.Vector3()); direction.y = 0; direction.normalize();
    const safe = (x, z) => x >= -4.35 && x <= 4.35 && z >= -2.45 && z <= 3.9 && !collisions.some(c => Math.abs(x - c.x) < c.sx / 2 + .95 && Math.abs(z - c.z) < c.sz / 2 + .3);
    for (const turn of [0, .7, -.7, 1.6, -1.6, Math.PI]) for (const distance of [.95, .5, 1.4]) {
      const d = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn), x = camera.position.x + d.x * distance, z = camera.position.z + d.z * distance;
      if (safe(x, z)) return { x, y: 1.15, z };
    }
    return { x: THREE.MathUtils.clamp(camera.position.x, -2, 2), y: 1.15, z: 2.5 };
  }
  function releasePointer() { lookInput.release(); touchInput.reset(); }
  function lockPointer() { return lookInput.requestLock(); }
  function focus(name) {
    if (name !== null && !stationViews[name]) return;
    if (name === 'merchant' && !worldState?.merchantVisible) return;
    keys.clear(); releasePointer(); shopPointerActive = false;
    if (name) {
      if (!focused) { savedPosition.copy(camera.position); savedQuaternion.copy(camera.quaternion); }
      focused = name; returning = false;
      refreshFocusView();
      changeTarget(name);
    } else {
      focused = null; returning = true; focusPosition.copy(savedPosition); focusQuaternion.copy(savedQuaternion); changeTarget(null);
    }
  }
  function refreshFocusView() {
    if (!focused) return;
    focusPosition.fromArray(stationViews[focused].position);
    // Preserve the readable board at desktop sizes, but give the near-field
    // sword breathing room when the Codex side panel is square or portrait.
    if (focused === 'anvil') focusPosition.z += THREE.MathUtils.clamp(1.32 / camera.aspect - 1, 0, 1.7) * 1.9;
    const target = new THREE.Vector3(...stationViews[focused].look);
    if (focused === 'tickets') {
      const view = getTicketFocusView(camera.aspect, camera.fov); focusPosition.copy(view.position); target.copy(view.look);
    }
    const lookCamera = new THREE.PerspectiveCamera(); lookCamera.position.copy(focusPosition); lookCamera.lookAt(target); focusQuaternion.copy(lookCamera.quaternion);
  }
  function setPaused(value) { paused = !!value; keys.clear(); touchInput.reset(); if (paused) { releasePointer(); changeTarget(null); } }
  // The introduction moves only the camera while input, physics and clocks stay paused.
  function setGuideView(name) {
    guideView = name !== null;
    focus(name);
    if(!guideView) {
      camera.position.copy(savedPosition); camera.quaternion.copy(savedQuaternion);
      returning = false; yaw = camera.rotation.y; pitch = camera.rotation.x;
    }
  }
  function listen(target, type, fn, options) { target.addEventListener(type, fn, options); listeners.push(() => target.removeEventListener(type, fn, options)); }
  function interact() {
    if (paused || contextLost || disposed) return;
    if (focused === 'anvil' && onTakeAnvil) { onTakeAnvil(); return; }
    const target = pickTarget(focused === 'relics' && shopPointerActive ? shopPointer : center);
    if (target?.shopAction) { activateTarget(target); return; }
    if (target?.swordId) { onSword(target.swordId); return; }
    if (focused === 'relics') return;
    if (focused) { onExit(); return; }
    activateTarget(target);
  }
  function secondary() {
    if (paused || contextLost || disposed) return;
    if (focused) onExit(); else if (worldState?.carriedId) onDrop(dropPoint());
  }
  listen(document, 'keydown', event => {
    if (event.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
      if (!paused) { keys.add(event.code); event.preventDefault(); }
    }
    if (event.code === 'KeyE' && !event.repeat && !paused) { interact(); event.preventDefault(); }
  });
  listen(document, 'keyup', event => keys.delete(event.code));
  listen(window, 'blur', () => { keys.clear(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) { keys.clear(); releasePointer(); shopPointerActive = false; } });
  const touchInput = createTouchMovement(movementPad, { enabled: () => !paused && !contextLost && !disposed && !focused && !returning });
  const lookInput = createMouseLook(canvas, {
    enabled: () => !paused && !contextLost && !disposed,
    canLook: () => !focused && !returning,
    onMode: onLookMode,
    onLook: (dx, dy, pointerType) => {
      const sensitivity = pointerType === 'touch' ? .0045 : .0021;
      yaw -= dx * sensitivity; pitch = THREE.MathUtils.clamp(pitch - dy * sensitivity, -1.25, 1.25);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },
    onSecondary: secondary,
    onClick: event => {
      if (returning) return;
      if (focused === 'anvil') { onStrike(); return; }
      if (document.pointerLockElement === canvas) { activateTarget(pickTarget()); return; }
      const rect = canvas.getBoundingClientRect(); center.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const target = pickTarget(center, 9); center.set(0, 0);
      if (target) activateTarget(target); else if (focused) onInteract(focused); else if (event.pointerType !== 'touch') lockPointer();
    },
  });
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointermove', event => {
    if (focused !== 'relics' || paused || contextLost) return;
    const rect = canvas.getBoundingClientRect(); shopPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); shopPointerActive = true;
  });
  listen(canvas, 'pointerleave', () => { shopPointerActive = false; });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); contextLost = true; keys.clear(); releasePointer(); resetInteractions(); contextNotice.style.display = 'block'; });
  listen(canvas, 'webglcontextrestored', () => { contextLost = false; contextNotice.style.display = 'none'; });
  const resize = () => { const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); refreshFocusView(); if (worldState) setWorld(worldState); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const moveVector = new THREE.Vector3();
  function validPosition(x, z) {
    if (x < -5.35 || x > 5.35 || z < -3.1 || z > 4.85) return false;
    return !collisions.some(c => Math.abs(x - c.x) < c.sx / 2 + .23 && Math.abs(z - c.z) < c.sz / 2 + .23);
  }
  function animate(now) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const viewDt = contextLost ? 0 : Math.min((now - lastTime) / 1000, .05);
    const dt = paused ? 0 : viewDt; lastTime = now; elapsed += dt;
    walking = false;
    if (guideView && !contextLost) {
      const ease = 1 - Math.exp(-viewDt * 6.5);
      camera.position.lerp(focusPosition, ease); camera.quaternion.slerp(focusQuaternion, ease);
    } else if (!paused) {
      if (focused || returning) {
        const ease = 1 - Math.exp(-dt * 6.5); camera.position.lerp(focusPosition, ease); camera.quaternion.slerp(focusQuaternion, ease);
        if (returning && camera.position.distanceToSquared(focusPosition) < .0003 && camera.quaternion.angleTo(focusQuaternion) < .005) { returning = false; camera.position.copy(focusPosition); camera.quaternion.copy(focusQuaternion); yaw = camera.rotation.y; pitch = camera.rotation.x; }
        if (focused === 'relics') { const target = pickTarget(shopPointerActive ? shopPointer : center); changeTarget(target?.prompt || 'relics'); }
      } else {
        const axis = touchInput.read();
        const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - axis.y;
        const sideways = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + axis.x;
        if (forward || sideways) {
          walking = true;
          moveVector.set(sideways, 0, -forward); if (moveVector.lengthSq() > 1) moveVector.normalize();
          moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(dt * 2.55);
          const x = camera.position.x + moveVector.x, z = camera.position.z + moveVector.z;
          if (validPosition(x, camera.position.z)) camera.position.x = x;
          if (validPosition(camera.position.x, z)) camera.position.z = z;
          camera.position.y = 1.83 + Math.sin(elapsed * 11) * .015;
        } else camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.83, dt * 8);
        const target = pickTarget(); hoveredSword = target?.swordId || null; changeTarget(target?.prompt || (target?.swordId ? 'sword' : target?.station || null));
      }
    }
    swordPhysics.update(dt, physicalSwords);
    swordRenderer.animate(dt);
    const t = elapsed - strikeTime;
    swordGroup.position.y = 1.58 + (t > .22 && t < .46 ? Math.sin((t - .22) * 47) * .012 * Math.exp(-(t - .22) * 14) : 0);
    if (worldState?.anvilId && !motion.isTransferring(worldState.anvilId)) { const anvilSword = physicalSwords.get(worldState.anvilId); if (anvilSword) anvilSword.mesh.position.y = swordGroup.position.y; }
    motion.update(dt);
    hammer.visible = !guideView && (focused === 'anvil' || (!focused && !worldState?.carriedId));
    const toolX = THREE.MathUtils.lerp(.2, .43, THREE.MathUtils.clamp((camera.aspect - .9) / .65, 0, 1));
    hammer.position.set(toolX, -.43, -.99); hammer.rotation.set(.1, -.3, -.44);
    const swing = motion.getStrike();
    if (swing && swing.outcome !== 'break' && swing.time >= swing.contact && swing.time <= swing.contact + .025) {
      const anvilSword = physicalSwords.get(worldState?.anvilId)?.mesh;
      const surface = findForgeContact(anvilSword || (!worldState && swordState ? swordGroup : null), { bladeMaterials: anvilSword ? null : [bladeMaterial, edgeMaterial, fullerMaterial] });
      if (surface) swing.position.copy(surface.position);
    }
    const forgeMode = focused === 'anvil';
    hammerReadyBlend = forgeMode ? Math.min(1, hammerReadyBlend + dt / .18) : 0;
    if (!forgeMode) readyContact = null;
    let armScale = 1;
    if (swing || forgeMode) {
      const anvilSword = physicalSwords.get(worldState?.anvilId)?.mesh;
      let readyPosition;
      if (!swing && anvilSword) {
        // Static solid geometry changes only when its visual is replaced. Cache
        // the local surface during ready frames; every strike still raycasts fresh.
        if (readyContact?.root !== anvilSword || readyContact.visual !== anvilSword.userData.visual) {
          const surface = findForgeContact(anvilSword);
          readyContact = { root: anvilSword, visual: anvilSword.userData.visual, localPoint: surface?.localPoint };
        }
        if (readyContact.localPoint) { anvilSword.updateWorldMatrix(true, false); readyPosition = anvilSword.localToWorld(readyContact.localPoint.clone()); }
      } else if (!swing && !worldState && swordState) readyPosition = findForgeContact(swordGroup, { bladeMaterials: [bladeMaterial, edgeMaterial, fullerMaterial] })?.position;
      const origin = swing?.position || readyPosition || wornFace.getWorldPosition(new THREE.Vector3());
      const pose = swing ? getHammerStrikePose({ camera, scale: .68, origin, time: swing.time, contact: swing.contact, duration: swing.duration }) : getHammerReadyPose({ camera, scale: .68, origin });
      const entryBlend = forgeMode ? hammerReadyBlend : 1;
      hammer.position.lerp(pose.position, entryBlend); hammer.quaternion.slerp(pose.quaternion, entryBlend);
      armScale = pose.armScale ?? 1;
      if (swing) { swing.armScale ??= armScale; armScale = swing.armScale; }
    }
    forearmGroup.visible = upperArmGroup.visible = hammer.visible;
    if (forearmGroup.visible) {
      hammer.updateWorldMatrix(true, true); wristMarker.getWorldPosition(wristPosition); camera.worldToLocal(wristPosition);
      const forearm = getHammerForearmPose(wristPosition, camera.aspect, armScale), gloveLength = Math.min(.11, forearm.length), sleeveLength = Math.max(.001, forearm.length - gloveLength);
      const radiusScale = Math.min(1.12, armScale);
      forearmGroup.position.copy(forearm.wrist); forearmGroup.quaternion.copy(forearm.quaternion);
      wrist.position.y = -gloveLength / 2; wrist.scale.set(radiusScale, gloveLength, radiusScale);
      cuff.position.y = -gloveLength - sleeveLength / 2; cuff.scale.set(radiusScale, sleeveLength, radiusScale);
      wristBand.position.y = -gloveLength; wristBand.scale.set(radiusScale, .042 * .68, radiusScale);
      upperArmGroup.position.copy(forearm.elbow); upperArmGroup.quaternion.copy(forearm.upperQuaternion);
      upperSleeve.position.y = -forearm.upperLength / 2; upperSleeve.scale.set(radiusScale, forearm.upperLength, radiusScale);
      elbowJoint.scale.setScalar(.104 * .68 * radiusScale);
    }
    avatar.update({ camera, heldRoot: physicalSwords.get(worldState?.carriedId)?.mesh, hammerRoot: hammer, time: elapsed, walking });
    bodyLight.position.set(THREE.MathUtils.clamp(camera.position.x + (camera.position.x > 0 ? 1.7 : -1.7), -5.5, 5.5), 3.7, THREE.MathUtils.clamp(camera.position.z + (camera.position.z > .5 ? 1.7 : -1.7), -3.45, 4.99)); bodyLight.target.position.set(camera.position.x, .65, camera.position.z);
    fireLight.intensity = 27 + Math.sin(elapsed * 7.6) * 3 + Math.sin(elapsed * 15.7) * 1.5;
    flames.forEach((flame, i) => { flame.scale.y = .72 + Math.sin(elapsed * (5 + i * .4) + i * 1.7) * .22; flame.position.y = 1.12 + flame.scale.y * .18; });
    ghost.position.y = .13 + Math.sin(elapsed * 1.4) * .065;
    merchantGoods.position.y = ghost.position.y; merchantGoods.children.forEach((product, i) => { product.rotation.y = Math.sin(elapsed * .4 + i) * .09; });
    eye.scale.y = 1 - Math.pow(Math.max(0, Math.sin(elapsed * .22)), 35) * .9;
    eye.position.x = Math.sin(elapsed * .35) * .055;
    dragonLight.intensity = (5 + anger * 4) * (1 + Math.sin(elapsed * 1.8) * .09);
    for (let i = 0; i < sparkCount; i++) {
      if (sparkLife[i] <= 0 || impactThisFrame) continue; sparkLife[i] -= dt;
      if (sparkLife[i] <= 0) { sparkPositions[i * 3 + 1] = -10; continue; }
      sparkVelocity[i * 3 + 1] -= dt * 5.8;
      for (let axis = 0; axis < 3; axis++) sparkPositions[i * 3 + axis] += sparkVelocity[i * 3 + axis] * dt;
    } sparkGeometry.attributes.position.needsUpdate = true;
    let liveTrails = 0;
    for (let i = 0; i < trailCount; i++) {
      const particle = i * 2, alive = sparkLife[particle] > 0; if (alive) liveTrails++;
      for (let axis = 0; axis < 3; axis++) {
        const index = particle * 3 + axis, out = i * 6 + axis;
        trailPositions[out] = alive ? sparkPositions[index] : axis === 1 ? -10 : 0;
        trailPositions[out + 3] = alive ? sparkPositions[index] - sparkVelocity[index] * .034 : axis === 1 ? -10 : 0;
        trailColors[out] = sparkColors[index]; trailColors[out + 3] = sparkColors[index] * .12;
      }
    }
    trailGeometry.attributes.position.needsUpdate = true; trailGeometry.attributes.color.needsUpdate = true; sparkTrails.visible = liveTrails > 0;
    if (impactFlashLife > 0) { if (!impactThisFrame) impactFlashLife = Math.max(0, impactFlashLife - dt); const flash = impactFlashLife / .08; impactMaterial.opacity = flash * .92; impactLight.intensity = flash * 16; impactFlare.visible = flash > 0; }
    impactThisFrame = false;
    for (let i = 0; i < dustCount; i++) { dustPositions[i * 3 + 1] += dt * .018; dustPositions[i * 3] += Math.sin(elapsed * .2 + i) * dt * .008; if (dustPositions[i * 3 + 1] > 4) dustPositions[i * 3 + 1] = .1; } dustGeometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < 32; i++) {
      const phase = (elapsed * (.27 + (i % 4) * .08) + i / 32) % 1;
      emberPositions[i * 3] = -4.27 + Math.sin(i * 15.1 + phase * 5) * .55;
      emberPositions[i * 3 + 1] = .95 + phase * 1.75;
      emberPositions[i * 3 + 2] = -2.07 + Math.cos(i * 8.1 + phase * 3) * .3;
    } emberGeometry.attributes.position.needsUpdate = true;
    if (!contextLost) renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); lookInput.dispose(); touchInput.dispose(); observer.disconnect(); listeners.forEach(remove => remove());
    readyContact = null;
    motion.dispose(); avatar.dispose(); ticketBoard.dispose(); bodyLight.shadow.map?.dispose(); key.shadow.map?.dispose();
    swordPhysics.dispose(); physicalSwords.forEach(entry => swordRenderer.disposeInstance(entry.mesh)); clearMerchantGoods(); swordRenderer.dispose(); relicShop.dispose();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(disposeTexture); renderer.dispose(); canvas.remove(); contextNotice.remove();
  }
  return { focus, setGuideView, setSword, setWorld, updateBoard, setDragon, strike, beginHeating, cancelHeating, isInteracting, resetInteractions, setPaused, lockPointer, interact, secondary, dispose };
}
