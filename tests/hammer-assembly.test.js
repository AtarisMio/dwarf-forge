import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HAMMER_HEAD,HAMMER_HANDLE,HAMMER_COLLAR,HAMMER_LEATHER} from '../src/hammer-frame.js';

const rotation=roll=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll);
const shaftAxis=new THREE.Vector3(0,1,0).applyQuaternion(rotation(HAMMER_HANDLE.roll));
const base=new THREE.Vector3(...HAMMER_HANDLE.position);
const distanceToShaft=position=>new THREE.Vector3(...position).sub(base).cross(shaftAxis).length();

test('wooden shaft passes through the head eye and meets the head at a right angle',()=>{
  assert.ok(distanceToShaft(HAMMER_HEAD.position)<.005,'shaft centerline passes through the central eye, not the peen');
  const headAxis=new THREE.Vector3(1,0,0).applyQuaternion(rotation(HAMMER_HEAD.roll));
  assert.ok(Math.abs(headAxis.dot(shaftAxis))<1e-6,'head and handle are perpendicular');
  const eyeDistance=new THREE.Vector3(...HAMMER_HEAD.position).sub(base).dot(shaftAxis);
  assert.ok(eyeDistance>0&&HAMMER_HANDLE.length>=eyeDistance,'wood reaches through the head instead of stopping short');
});

test('collar and leather wrap surround the same wooden shaft',()=>{
  for(const part of [HAMMER_COLLAR,HAMMER_LEATHER]){
    assert.ok(distanceToShaft(part.position)<.005,'no separate floating collar or grip axis');
    assert.ok(Math.abs(part.roll-HAMMER_HANDLE.roll)<1e-6,'collar and grip follow the shaft tilt');
  }
});
