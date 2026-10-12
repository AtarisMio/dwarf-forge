import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getWorkshopRenderPolicy } from '../src/workshop.js';

test('mobile rendering caps retina fill and shadow work without reducing logical scene detail', () => {
  const mobile = getWorkshopRenderPolicy({ coarsePointer: true, devicePixelRatio: 3 });
  assert.equal(mobile.pixelRatio, 1.5); assert.equal(mobile.shadowSize, 512);
  assert.equal(mobile.shadowType, THREE.PCFShadowMap); assert.equal(mobile.antialias, false);
  assert.equal(mobile.anisotropy, 8);
  const lowDpr = getWorkshopRenderPolicy({ coarsePointer: true, devicePixelRatio: 1 });
  assert.equal(lowDpr.pixelRatio, 1);
});
test('desktop rendering retains its existing pixel, smooth-shadow and texture budgets', () => {
  const desktop = getWorkshopRenderPolicy({ coarsePointer: false, devicePixelRatio: 3 });
  assert.equal(desktop.pixelRatio, 2); assert.equal(desktop.shadowSize, 1024);
  assert.equal(desktop.shadowType, THREE.PCFSoftShadowMap); assert.equal(desktop.antialias, true);
  assert.equal(desktop.anisotropy, 16);
  assert.equal(getWorkshopRenderPolicy({ devicePixelRatio: NaN }).pixelRatio, 1);
});
