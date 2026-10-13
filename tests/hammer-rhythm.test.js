import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getHammerStrikePose,getHammerForearmPose} from '../src/workshop-motion.js';
import {HAMMER_FACE,HAMMER_WRIST} from '../src/hammer-frame.js';

function setup(aspect=1280/720,z=.95){
  const camera=new THREE.PerspectiveCamera(66,aspect,.045,60);camera.position.set(-1.05,2.22,z);camera.lookAt(-1.05,1.51,-2.1);camera.updateMatrixWorld();
  const origin=new THREE.Vector3(-.96,1.62,-.92);
  const frame=time=>{
    const pose=getHammerStrikePose({camera,restPosition:new THREE.Vector3(.43,-.43,-.99),restQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44)),scale:.68,origin,time});
    const local=new THREE.Matrix4().compose(pose.position,pose.quaternion,pose.scale);
    const wrist=HAMMER_WRIST.clone().applyMatrix4(local),face=HAMMER_FACE.clone().applyMatrix4(local).applyMatrix4(camera.matrixWorld);
    return {pose,wrist,face,arm:getHammerForearmPose(wrist,aspect,pose.armScale)};
  };
  return {frame,origin,camera};
}

test('forging forearm keeps its length instead of stretching as the hand reaches the blade',()=>{
  for(const [aspect,z] of [[1280/720,.95],[360/800,4.18]]){
    const {frame}=setup(aspect,z),lengths=Array.from({length:49},(_,i)=>frame(i/100).arm.length);
    assert.ok(Math.max(...lengths)-Math.min(...lengths)<1e-5,'forearm is a rigid segment throughout the swing');
  }
});

test('a strike accelerates into the blade and rebounds without parking on its surface',()=>{
  const {frame,origin}=setup();
  assert.ok(frame(.22).face.distanceTo(frame(.219).face)>.001,'last millisecond still has downward impact speed');
  assert.ok(frame(.244).face.y>origin.y+.012,'the hammer has already lifted 24ms after contact');
  const liftHeight=Math.max(...Array.from({length:22},(_,i)=>frame(i/100).face.y))-origin.y;
  const reboundHeight=Math.max(...Array.from({length:26},(_,i)=>frame(.22+i/100).face.y))-origin.y;
  assert.ok(reboundHeight<liftHeight*.65,'rebound is a smaller motion than the intentional windup');
});

test('forging stays in the working reach with no large idle-to-contact twist',()=>{
  const {frame}=setup(),contact=frame(.22);
  for(let i=0;i<=48;i++){
    const current=frame(i/100);
    assert.ok(current.wrist.distanceTo(contact.wrist)<.19,'hand moves locally rather than lunging out of the lower right corner');
    assert.ok(current.pose.quaternion.angleTo(contact.pose.quaternion)<1.2,'hammer swings through a compact stroke instead of rotating 120 degrees');
  }
});
