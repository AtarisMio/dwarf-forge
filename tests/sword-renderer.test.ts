import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {isMeshObject, isInstancedObject} from '../src/workshop-types.ts';
import { createSwordRenderer } from '../src/sword-renderer.ts';
import type {SwordRenderInput} from '../src/workshop-types.ts';

const normal = ['citadel', 'holy', 'sawblade', 'dragonfang', 'runeblade', 'splitblade'];
const families = [...normal, 'worldtree', 'fishblade', 'funerary'];
const sword = (typeKey: string, level: number, extra: Partial<SwordRenderInput> = {}): SwordRenderInput => ({ id: 'test', typeKey, level, heat: 0, ...extra });
function silhouette(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const hash = createHash('sha256');
  root.traverse(mesh => {
    if (!(isMeshObject(mesh))) return;
    const positions = mesh.geometry.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      assert.ok([p.x, p.y, p.z].every(Number.isFinite), 'finite transformed geometry');
      hash.update([p.x, p.y, p.z].map(n => n.toFixed(5)).join(','));
    }
  });
  return hash.digest('hex');
}

test('normal early forms share geometry without exposing the hidden final family', () => {
  const renderer = createSwordRenderer({});
  try {
    for (const level of [0, 2, 4]) {
      const roots = normal.map(type => renderer.create(sword(type, level)));
      assert.equal(new Set(roots.map(silhouette)).size, 1, `shared +${level} geometry`);
      assert.equal(roots[0].userData.modelKey, `basic/${level / 2}`);
      roots.forEach(renderer.disposeInstance);
    }
  } finally { renderer.dispose(); }
});

test('every even stage changes actual geometry and remains finite across all nine families', () => {
  const renderer = createSwordRenderer({});
  try {
    for (const type of families) {
      const hashes: string[] = [];
      for (let level = 0; level <= 20; level += 2) {
        const root = renderer.create(sword(type, level));
        hashes.push(silhouette(root));
        const bounds = new THREE.Box3().setFromObject(root);
        assert.ok(bounds.getSize(new THREE.Vector3()).length() < 4.5, `${type} fits first-person framing`);
        renderer.disposeInstance(root);
      }
      assert.equal(new Set(hashes).size, 11, `${type} has 11 materially different forms`);
    }
  } finally { renderer.dispose(); }
});

test('evolution preserves root, physics pose, attached hit target and peak form after damage', () => {
  const renderer = createSwordRenderer({});
  const root = renderer.create(sword('splitblade', 8));
  const hit = new THREE.Object3D(); root.add(hit); root.position.set(2, 3, 4);
  root.rotation.set(.2, .3, .4); root.scale.setScalar(.78);
  const pose = root.matrix.clone(); root.updateMatrix(); pose.copy(root.matrix);
  const before = silhouette(root);
  assert.equal(renderer.update(root, sword('splitblade', 14, { appearanceLevel: 14 })), root);
  assert.notEqual(silhouette(root), before);
  assert.equal(hit.parent, root);
  root.updateMatrix(); assert.deepEqual(root.matrix.elements, pose.elements);
  const peak = root.userData.modelKey;
  renderer.update(root, sword('splitblade', 2, { appearanceLevel: 14 }));
  assert.equal(root.userData.modelKey, peak);
  renderer.disposeInstance(root); renderer.dispose();
});

test('instance replacement disposes local materials; final disposal releases all geometries', () => {
  const renderer = createSwordRenderer({});
  const root = renderer.create(sword('fishblade', 18));
  let oldDisposed = 0;
  const oldMaterials = root.userData.localMaterials;
  oldMaterials.forEach(m => m.addEventListener('dispose', () => oldDisposed++));
  const geometries = new Set<THREE.BufferGeometry>(); root.traverse(m => { if (isMeshObject(m)) geometries.add(m.geometry); });
  let instancedDisposed = 0;
  root.traverse(m => { if (isInstancedObject(m)) m.addEventListener('dispose', () => instancedDisposed++); });
  let geometryDisposed = 0; geometries.forEach(g => g.addEventListener('dispose', () => geometryDisposed++));
  renderer.update(root, sword('fishblade', 20));
  assert.equal(oldDisposed, oldMaterials.length);
  assert.equal(instancedDisposed, 1, 'old sucker instance buffer is released');
  renderer.disposeInstance(root); renderer.dispose();
  assert.equal(geometryDisposed, geometries.size);
});

test('split +10 uses detached wide plates and +14 adds a floating companion sword', () => {
  const renderer = createSwordRenderer({});
  const early = renderer.create(sword('splitblade', 10));
  const later = renderer.create(sword('splitblade', 14));
  const earlyCompanions: THREE.Object3D[] = [], laterCompanions: THREE.Object3D[] = [];
  early.traverse(m => { if (m.userData.motion === 'satellite') earlyCompanions.push(m); });
  later.traverse(m => { if (m.userData.motion === 'satellite') laterCompanions.push(m); });
  assert.equal(earlyCompanions.length, 0); assert.equal(laterCompanions.length, 1);
  assert.ok(early.userData.visual);
  const plateBounds = early.userData.visual.children.filter(m => isMeshObject(m) && m.geometry.type === 'ExtrudeGeometry').map(m => new THREE.Box3().setFromObject(m));
  const plates = plateBounds.filter(b => b.min.x > -.57 && b.max.x < 1 && b.getSize(new THREE.Vector3()).z > .25).sort((a,b)=>a.min.x-b.min.x);
  assert.equal(plates.length, 2); assert.ok(plates[1].min.x - plates[0].max.x > .015, 'visible gap between bevels');
  const y = laterCompanions[0].position.y;
  renderer.animate(0); assert.equal(laterCompanions[0].position.y, y, 'paused game freezes orbit');
  renderer.animate(.1); assert.notEqual(laterCompanions[0].position.y, y);
  renderer.disposeInstance(early); renderer.disposeInstance(later); renderer.dispose();
});

test('full heating makes ferrous blades visibly incandescent while preserving natural and magic materials', () => {
  const renderer = createSwordRenderer({});
  const protectedColors = new Set(['77503e', '61724c', '70b693', 'c9bc92', 'c3a35d', '953e42', 'afd7da', 'c1addd']);
  const metalColors = new Set(['b5c6c9', '45535a', '80513b']);
  const seen = new Set();
  try {
    for (const [typeKey, level] of [['worldtree', 20], ['fishblade', 20], ['runeblade', 20], ['funerary', 0]] as const) {
      const root = renderer.create(sword(typeKey, level));
      const before = root.userData.localMaterials.map(m => ({ m, color: m.color.clone(), emission: m.emissive.clone(), intensity: m.emissiveIntensity }));
      renderer.update(root, sword(typeKey, level, { heat: 100 }));
      for (const { m, color, emission, intensity } of before) {
        const hex = color.getHexString(); seen.add(hex);
        assert.ok(m.color.equals(color), 'heat does not overwrite the lit surface color');
        if (protectedColors.has(hex)) {
          assert.ok(m.emissive.equals(emission), `${hex} retains its own emission hue`);
          assert.equal(m.emissiveIntensity, intensity, `${hex} receives no heat glow`);
        } else if (metalColors.has(hex)) {
          assert.ok(m.emissive.r >= .8 && m.emissive.r <= 1, 'steel retains a clear red-orange heat glow after withdrawal');
          assert.ok(m.emissiveIntensity >= .65 && m.emissiveIntensity < 1, 'heat is readable without bleaching the blade');
        }
      }
      renderer.disposeInstance(root);
    }
    for (const hex of ['77503e', '61724c', '70b693', 'c9bc92', 'c3a35d', 'afd7da', 'c1addd', ...metalColors]) assert.ok(seen.has(hex), `actual material ${hex} was exercised`);
  } finally { renderer.dispose(); }
});
