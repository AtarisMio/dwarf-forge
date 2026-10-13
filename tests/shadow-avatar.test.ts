import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isMeshObject} from '../src/workshop-types.ts';
import { createShadowAvatar } from '../src/shadow-avatar.ts';

test('full avatar is invisible to color/depth camera passes but casts a complete shadow silhouette', () => {
  const avatar=createShadowAvatar();const names=new Set();let count=0;
  avatar.root.traverse(mesh=>{if(!(isMeshObject(mesh)))return;count++;names.add(mesh.name);assert.equal(mesh.visible,true);assert.equal(mesh.castShadow,true);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){assert.equal(material.colorWrite,false);assert.equal(material.depthWrite,false);}assert.ok(mesh.customDepthMaterial);assert.ok(mesh.customDepthMaterial.colorWrite);});
  for(const name of ['head','torso','left-leg','right-leg','left-upper-arm','right-upper-arm','tool-head'])assert.ok(names.has(name));
  assert.ok(count<=20,'economical shadow geometry');
  const camera=new THREE.PerspectiveCamera();camera.position.set(2,1.83,3);camera.rotation.y=.7;
  avatar.update({camera,time:0,walking:false});assert.deepEqual(avatar.root.position.toArray(),[2,0,3]);
  const bounds=new THREE.Box3().setFromObject(avatar.root);assert.ok(bounds.max.y>1.7&&bounds.min.y<.1);
  avatar.dispose();
});
test('avatar follows actual held-tool pose, walking legs animate, and all resources release', () => {
  const avatar=createShadowAvatar(),camera=new THREE.PerspectiveCamera(),hammer=new THREE.Group();camera.position.set(0,1.83,0);camera.add(hammer);hammer.position.set(.4,-.5,-1);
  const shaft=avatar.root.getObjectByName('tool-shaft'),head=avatar.root.getObjectByName('tool-head');assert.ok(shaft);assert.ok(head);
  const shaftAxis=new THREE.Vector3(0,1,0).applyQuaternion(shaft.quaternion);
  assert.ok(head.position.clone().sub(shaft.position).cross(shaftAxis).length()<1e-6,'shadow handle also passes through the head center');
  avatar.update({camera,hammerRoot:hammer,time:.2,walking:true});const leg=avatar.root.getObjectByName('left-leg');assert.ok(leg);const moving=leg.rotation.x;
  avatar.update({camera,hammerRoot:hammer,time:0,walking:false});assert.notEqual(moving,leg.rotation.x);
  const resources=new Set<THREE.BufferGeometry | THREE.Material>();avatar.root.traverse(mesh=>{if(isMeshObject(mesh)){resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])resources.add(material);assert.ok(mesh.customDepthMaterial);resources.add(mesh.customDepthMaterial);}});
  let disposed=0;resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed++));avatar.dispose();assert.equal(disposed,resources.size);
});
