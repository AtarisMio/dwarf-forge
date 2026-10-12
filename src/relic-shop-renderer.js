import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RELICS } from './rules.js';
import { createVectorPanel, svgText, SVG_FONT_FAMILY } from './vector-panels.js';

// Scene-only adapter. Prices, eligibility and purchases belong to the host.
export function createRelicShopRenderer({ woodTexture, metalTexture, anisotropy = 8 } = {}) {
  const root = new THREE.Group(), targets = [], geometries = new Set(), materials = new Set(), vectorPanels = new Set();
  const templates = new Map(), lookup = new Map(RELICS.map(r => [r.id, r]));
  let shopKey = '', ownedKey = '', disposed = false;
  const geo = g => { geometries.add(g); return g; };
  const mat = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const wood = mat({ color: '#51402b', map: woodTexture, roughness: .88, bumpMap: woodTexture, bumpScale: .011 });
  const green = mat({ color: '#354d38', map: metalTexture, metalness: .28, roughness: .76 });
  const gold = mat({ color: '#c3a55b', map: metalTexture, metalness: .72, roughness: .38 });
  const steel = mat({ color: '#8a9d8c', map: metalTexture, metalness: .58, roughness: .47 });
  const dark = mat({ color: '#111911', roughness: .9 });
  const red = mat({ color: '#a53525', metalness: .36, roughness: .42, emissive: '#45120b', emissiveIntensity: .22 });
  const lampStrip = mat({ color: '#fff0c7', emissive: '#ffdda2', emissiveIntensity: 2.4, roughness: .42 });
  const glass = mat({ color: '#a9cc9b', transparent: true, opacity: .07, roughness: .22, depthWrite: false });
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }); materials.add(invisible);
  const cube = geo(new THREE.BoxGeometry(1, 1, 1));
  const orb = geo(new THREE.SphereGeometry(1, 16, 12));
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(parent, material, x, y, z, w, h, d, bevel = 0) { const m = mesh(parent, bevel ? geo(new RoundedBoxGeometry(w, h, d, 2, bevel)) : cube, material, x, y, z); if (!bevel) m.scale.set(w, h, d); return m; }
  function ball(parent, material, x, y, z, sx, sy = sx, sz = sx) { const m = mesh(parent, orb, material, x, y, z); m.scale.set(sx, sy, sz); return m; }
  function cylinder(parent, material, r1, r2, h, x = 0, y = 0, z = 0) { return mesh(parent, geo(new THREE.CylinderGeometry(r1, r2, h, 20)), material, x, y, z); }
  function ring(parent, material, r, tube, x = 0, y = 0, z = 0) { return mesh(parent, geo(new THREE.TorusGeometry(r, tube, 8, 28)), material, x, y, z); }
  function curve(parent, material, points, radius) { return mesh(parent, geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 20, radius, 7, false)), material); }
  function lathe(parent, material, points) { return mesh(parent, geo(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), 20)), material); }
  function target(parent, type, x, y, z, w, h, d) { const hit = box(parent, invisible, x, y, z, w, h, d); hit.castShadow = false; hit.receiveShadow = false; hit.userData.shopAction = { type }; targets.push(hit); return hit; }
  function textPanel(parent, x, y, z, w, h) {
    const width = 1000, height = width * h / w;
    const vector = createVectorPanel({ width, height, anisotropy }); vectorPanels.add(vector);
    const material = new THREE.MeshBasicMaterial({ map: vector.texture, transparent: true, depthWrite: false, toneMapped: false }); materials.add(material);
    const plane = mesh(parent, geo(new THREE.PlaneGeometry(w, h)), material, x, y, z); plane.castShadow = false;
    return { vector, width, height, key: '' };
  }
  const measure = document.createElement('canvas').getContext('2d');
  const swordSymbol = 'M0-66 L16-43 L12 25 H35 V38 H10 V67 H-10 V38 H-35 V25 H-12 L-16-43 Z';
  function write(panel, text, color = '#e6e1c9', coin = false) {
    const key = `${text}|${color}|${coin}`; if (panel.key === key) return; panel.key = key;
    const { width: w, height: h } = panel, padding = w * .055, start = coin ? padding + h * .75 : padding;
    let size = h * .75; measure.font = `600 ${size}px ${SVG_FONT_FAMILY}`;
    const measured = measure.measureText(text).width, available = w - padding - start;
    if (measured > available) size *= available / measured;
    const symbol = coin ? `<path d="${swordSymbol}" transform="translate(${padding + h * .27} ${h / 2}) scale(${h * .76 / 133})" fill="${color}"/>` : '';
    panel.vector.update(symbol + svgText(text, (start + w - padding) / 2, h / 2, { size, color }));
  }
  function relicModel(id, color) {
    if (templates.has(id)) return templates.get(id).clone(true);
    const g = new THREE.Group(), body = mat({ color: new THREE.Color(color || lookup.get(id)?.color || '#94b49b').lerp(new THREE.Color('#879b78'), .55), map: metalTexture, metalness: .42, roughness: .52 });
    if (/nail|spike|bent|grudge/.test(id)) {
      curve(g, steel, [[0, -.26, 0], [0, -.08, 0], [-.07, .02, 0], [-.03, .25, 0]], .035); box(g, gold, -.03, .27, 0, .19, .045, .16, .01);
    } else if (/knot|thread|leather|chained/.test(id)) {
      mesh(g, geo(new THREE.TorusKnotGeometry(.16, .033, 56, 7, 2, 3)), id.includes('knot') ? dark : body); curve(g, body, [[-.05, -.12, 0], [-.12, -.24, .025], [-.21, -.3, .03]], .025);
    } else if (/chalice|cup|teacup|kingcup/.test(id)) {
      lathe(g, body, [[.13, -.27], [.13, -.23], [.035, -.18], [.035, -.05], [.11, .01], [.17, .1], [.18, .25], [.16, .26], [.145, .11], [.09, .055]]); ring(g, gold, .18, .015, 0, .25).rotation.x = Math.PI / 2;
    } else if (/stamp|seal|kingseal|signet|dragon-signet/.test(id)) {
      box(g, gold, 0, -.18, 0, .31, .09, .28, .018); lathe(g, body, [[.08, -.13], [.045, 0], [.1, .08], [.12, .16], [.075, .23], [0, .24]]); ring(g, gold, .07, .013, 0, -.224).rotation.x = Math.PI / 2;
    } else if (/glass|watch/.test(id)) {
      for (const y of [-.25, .25]) cylinder(g, gold, .16, .16, .045, 0, y);
      lathe(g, glass, [[.125, -.22], [.1, -.16], [.024, 0], [.1, .16], [.125, .22]]); lathe(g, body, [[.105, -.205], [.035, -.12], [0, -.08]]);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; cylinder(g, steel, .012, .012, .46, Math.cos(a) * .145, 0, Math.sin(a) * .145); }
    } else if (/heart/.test(id)) {
      const s = new THREE.Shape(); s.moveTo(0, -.26); s.bezierCurveTo(-.42, .03, -.28, .34, 0, .16); s.bezierCurveTo(.28, .34, .42, .03, 0, -.26);
      const m = mesh(g, geo(new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: true, bevelThickness: .028, bevelSize: .027, bevelSegments: 2, steps: 1 })), body); m.position.z = -.06; ring(g, gold, .085, .013, 0, .1, .095);
    } else if (/splice|hoop|ring|bell|locket/.test(id)) {
      ring(g, body, .18, .038, -.065, .02, 0); ring(g, steel, .14, .026, .08, -.045, .045).rotation.y = .55; box(g, gold, 0, -.19, .04, .045, .17, .035, .01);
    } else if (/mallet|hammer|echo/.test(id)) {
      cylinder(g, wood, .025, .035, .52, 0, -.03); box(g, body, 0, .18, 0, .34, .14, .15, .025);
    } else if (/sword|scabbard|wire|oath/.test(id)) {
      const s = new THREE.Shape(); s.moveTo(-.047, -.03); s.lineTo(-.047, .23); s.lineTo(.01, .34); s.lineTo(.05, .24); s.lineTo(.035, .09); s.lineTo(-.004, .035); s.lineTo(.043, -.03); s.closePath();
      mesh(g, geo(new THREE.ExtrudeGeometry(s, { depth: .035, bevelEnabled: true, bevelSize: .009, bevelThickness: .007, bevelSegments: 1 })), steel); box(g, gold, 0, -.06, 0, .22, .028, .07); cylinder(g, wood, .027, .027, .19, 0, -.17);
    } else if (/ledger|voucher|writ|permit|testament|contract|rebate/.test(id)) {
      box(g, wood, 0, 0, 0, .31, .43, .12, .018); box(g, body, -.16, 0, 0, .038, .43, .14, .008); box(g, gold, .065, 0, .065, .03, .35, .025, .006);
    } else if (/weight|tally|paperweight|stone|corner/.test(id)) {
      lathe(g, body, [[.18, -.21], [.19, -.15], [.12, .14], [.06, .2]]); ring(g, gold, .055, .014, 0, .245, 0); box(g, gold, 0, -.045, .163, .11, .045, .017, .006);
    } else if (/die|oracle/.test(id)) {
      box(g, body, 0, 0, 0, .33, .33, .33, .04); for (const [x, y] of [[-.085, -.085], [0, 0], [.085, .085]]) ball(g, dark, x, y, .172, .024, .024, .008);
    } else if (/coal|charcoal|ash|blackstone/.test(id)) {
      mesh(g, geo(new THREE.IcosahedronGeometry(.23, 0)), dark).scale.set(1.15, .88, .85); ring(g, gold, .14, .009, 0, 0, .07).rotation.y = .3;
    } else if (/comb|tongs|tuning|hook/.test(id)) {
      curve(g, steel, [[-.14, -.24, 0], [-.12, .12, 0], [0, .25, 0], [.12, .12, 0], [.14, -.24, 0]], .024); box(g, body, 0, -.02, 0, .22, .065, .055, .012);
    } else if (/crown|badge|king/.test(id)) {
      cylinder(g, gold, .18, .17, .11, 0, -.08); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const spike = mesh(g, geo(new THREE.ConeGeometry(.043, .22, 4)), gold, Math.cos(a) * .16, .08, Math.sin(a) * .16); spike.rotation.z = Math.cos(a) * -.15; }
    } else {
      mesh(g, geo(new THREE.DodecahedronGeometry(.2, 0)), body).scale.y = 1.25; ring(g, gold, .155, .017, 0, 0, .07).rotation.y = .5; cylinder(g, steel, .035, .075, .13, 0, -.26);
    }
    g.rotation.set(.08, -.22, -.08); g.userData.relicId = id; templates.set(id, g); return g.clone(true);
  }

  const machine = new THREE.Group(); machine.position.set(5.15, 0, -.15); machine.rotation.y = -Math.PI / 2; root.add(machine);
  box(machine, wood, 0, .56, 0, 3, 1.08, .95, .035); box(machine, dark, 0, .08, .035, 3.08, .15, 1.04, .02);
  box(machine, wood, 0, 1.13, .08, 3.15, .12, 1.13, .022);
  box(machine, green, 0, 1.96, -.21, 3, 1.6, .32, .025);
  for (const x of [-1.48, -.49, .49, 1.48]) box(machine, gold, x, 1.96, .085, .045, 1.6, .055, .008);
  for (const y of [1.18, 2.75]) box(machine, gold, 0, y, .085, 3.04, .052, .055, .008);
  const slots = [-.985, 0, .985].map(x => {
    // Individual brass shades and exposed warm strips match the three lit
    // compartments in the original machine, rather than one green floodlight.
    box(machine, gold, x, 2.81, .16, .56, .085, .38, .012);
    box(machine, dark, x, 2.785, .17, .49, .035, .31);
    box(machine, lampStrip, x, 2.761, .2, .43, .018, .25);
    const lamp = new THREE.PointLight('#ffdfab', .75, 1.6, 1.8); lamp.position.set(x, 2.7, .25); machine.add(lamp);
    box(machine, green, x, 1.97, -.015, .86, 1.33, .035, .012);
    box(machine, dark, x, 1.35, .27, .89, .32, .12, .012);
    const holder = new THREE.Group(); holder.position.set(x, 1.96, .18); machine.add(holder);
    const price = textPanel(machine, x, 1.35, .338, .8, .23), name = textPanel(machine, x, 2.59, .105, .85, .17);
    const hit = target(machine, 'buy', x, 1.97, .4, .89, 1.5, .18); hit.visible = false;
    return { holder, price, name, hit };
  });
  // Sword slot, separate sword-currency counter, and the gold reroll control.
  box(machine, gold, -.97, .79, .5, .82, .24, .08, .013); box(machine, dark, -.97, .8, .547, .65, .105, .025);
  const depositLabel = textPanel(machine, -.97, .5, .487, .88, .16); write(depositLabel, '→ ×1', '#d5d8a0', true);
  target(machine, 'deposit', -.97, .75, .62, .9, .44, .24);
  box(machine, gold, .02, .69, .493, .91, .47, .065, .012); box(machine, dark, .02, .69, .532, .82, .38, .025);
  const coinsLabel = textPanel(machine, .02, .69, .552, .79, .3);
  const button = cylinder(machine, red, .22, .22, .08, 1.02, .75, .54); button.rotation.x = Math.PI / 2;
  // Both arrows are real flat geometry, crisp even at a grazing view angle.
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: '#e4d69c', toneMapped: false }); materials.add(arrowMaterial);
  for (const start of [Math.PI * .3, Math.PI * 1.3]) {
    const end = start - Math.PI * .72, radius = .135, halfWidth = .012;
    const arc = new THREE.Shape(); arc.absarc(0, 0, radius + halfWidth, start, end, true); arc.absarc(0, 0, radius - halfWidth, end, start, false); arc.closePath();
    const x = Math.cos(end) * radius, y = Math.sin(end) * radius, tx = Math.sin(end), ty = -Math.cos(end), nx = Math.cos(end), ny = Math.sin(end);
    const tip = new THREE.Shape(); tip.moveTo(x + tx * .018, y + ty * .018); tip.lineTo(x - tx * .03 + nx * .026, y - ty * .03 + ny * .026); tip.lineTo(x - tx * .03 - nx * .026, y - ty * .03 - ny * .026); tip.closePath();
    const arrow = mesh(machine, geo(new THREE.ShapeGeometry([arc, tip], 32)), arrowMaterial, 1.02, .755, .589); arrow.castShadow = false;
  }
  const refreshPrice = textPanel(machine, 1.02, .42, .49, .9, .14);
  const refreshHit = target(machine, 'reroll', 1.02, .72, .65, .5, .54, .2);
  for (const x of [-1.36, -.5, .5, 1.36]) for (const y of [.2, 1.01]) { const rivet = cylinder(machine, gold, .022, .022, .023, x, y, .485); rivet.rotation.x = Math.PI / 2; }
  const glow = new THREE.PointLight('#bbd39d', 5, 4, 1.7); glow.position.set(0, 2.49, .62); machine.add(glow);

  const owned = new THREE.Group(); owned.position.set(5.35, 0, 2.24); owned.rotation.y = -Math.PI / 2; root.add(owned);
  box(owned, wood, 0, 1.37, 0, 1.1, 2.54, .3, .025);
  box(owned, dark, 0, 1.4, .17, .98, 2.29, .035);
  for (const x of [-.54, .54]) box(owned, gold, x, 1.38, .2, .025, 2.48, .055);
  const ownedSlots = Array.from({ length: 8 }, (_, i) => {
    const x = i % 2 ? .25 : -.25, y = .43 + Math.floor(i / 2) * .54;
    if (!(i % 2)) box(owned, gold, 0, y - .23, .25, 1.01, .035, .22);
    const holder = new THREE.Group(); holder.position.set(x, y, .28); owned.add(holder);
    const hit = target(owned, 'inspect-owned', x, y, .37, .46, .48, .2); hit.visible = false;
    return { holder, hit };
  });
  const ownedTitle = textPanel(owned, 0, 2.53, .215, .98, .16); write(ownedTitle, 'OWNED · 遗物架', '#c9c69d');

  function update(shop, relics = []) {
    if (disposed) return;
    const data = shop || { offers: [], coins: 0, free: false, rerollCost: 0, rerollAvailable: false };
    const key = JSON.stringify(data);
    if (key !== shopKey) {
      shopKey = key; const offers = data.offers || [];
      slots.forEach((slot, i) => {
        const offer = offers[i]; slot.holder.clear(); slot.hit.visible = !!offer;
        if (offer) { slot.holder.add(relicModel(offer.id, offer.color)); slot.hit.userData.shopAction = { type: 'buy', id: offer.id }; slot.hit.userData.prompt = `relic:${offer.id}`; }
        write(slot.price, offer ? (offer.free || data.free ? '0 · FREE' : String(offer.cost)) : '—', offer ? '#e5e6b9' : '#6f806e', !!offer);
        write(slot.name, offer?.name || '售罄', offer ? '#d4dbc0' : '#748272');
      });
      write(coinsLabel, String(Math.max(0, data.coins || 0)).padStart(2, '0'), '#eeeece', true);
      write(refreshPrice, data.free ? '赠礼 · 不可刷新' : !data.rerollAvailable ? '明日开放' : `${data.rerollCost || 0} G`, data.rerollAvailable ? '#e0d5b3' : '#7b8275');
      button.material = data.rerollAvailable ? red : dark; refreshHit.userData.prompt = 'relic-reroll';
    }
    const ids = JSON.stringify(relics);
    if (ids !== ownedKey) {
      ownedKey = ids; ownedSlots.forEach((slot, i) => {
        const id = relics[i]; slot.holder.clear(); slot.hit.visible = !!id;
        if (id) { const model = relicModel(id); model.scale.setScalar(.57); slot.holder.add(model); slot.hit.userData.shopAction = { type: 'inspect-owned', id }; slot.hit.userData.prompt = `owned-relic:${id}`; }
      });
    }
  }
  targets.find(t => t.userData.shopAction.type === 'deposit').userData.prompt = 'relic-deposit';
  update(null, []);
  function dispose() { if (disposed) return; disposed = true; root.removeFromParent(); templates.clear(); targets.length = 0; geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); vectorPanels.forEach(p => p.dispose()); }
  return { root, targets, update, dispose };
}
