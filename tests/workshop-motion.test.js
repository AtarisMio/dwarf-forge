import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorkshopMotion, getHammerStrikePose, getTicketFocusView, getHeldSwordPose } from '../src/workshop-motion.js';
const pose = (parent, x, y=0, z=0) => ({ parent, position:new THREE.Vector3(x,y,z), quaternion:new THREE.Quaternion(), scale:new THREE.Vector3(1,1,1) });

test('transfer preserves root and starts at its old world pose, repeated sync does not restart it', () => {
  const scene=new THREE.Scene(), camera=new THREE.Group();scene.add(camera);camera.position.set(2,1,0);
  const root=new THREE.Group(); scene.add(root); const hit=new THREE.Object3D();root.add(hit);
  const motion=createWorkshopMotion({scene});motion.place('a',root,pose(scene,0),{token:'floor'});
  motion.place('a',root,pose(camera,.2),{token:'hands',animate:true});
  assert.equal(root.parent,scene);assert.equal(root.position.x,0);assert.ok(motion.isInteracting());
  motion.update(.19);const halfway=root.position.x;assert.ok(halfway>0&&halfway<2.2);
  motion.place('a',root,pose(camera,.2),{token:'hands',animate:true});motion.update(.2);
  assert.equal(root.parent,camera);assert.equal(root.position.x,.2);assert.equal(hit.parent,root);assert.equal(motion.isInteracting(),false);
  motion.dispose();
});
test('camera target follows during transfer and dropped placement finishes once', () => {
  const scene=new THREE.Scene(), camera=new THREE.Group();scene.add(camera); const root=new THREE.Group();camera.add(root);
  let completed=0;const motion=createWorkshopMotion({scene,onTransferEnd:()=>completed++});
  motion.place('a',root,pose(camera,0),{token:'hands'});motion.place('a',root,pose(scene,1,.9,2),{token:'floor',animate:true});
  motion.update(0);assert.equal(root.parent,scene);motion.update(.5);assert.equal(completed,1);assert.equal(root.position.y,.9);motion.update(.5);assert.equal(completed,1);motion.dispose();
});
test('furnace inserts, glows progressively, pauses and returns before resolving', async () => {
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
  const steel=new THREE.MeshStandardMaterial();steel.userData={respondsToHeat:true,baseEmission:new THREE.Color(0),heatIntensity:0};
  const wood=new THREE.MeshStandardMaterial();wood.userData={respondsToHeat:false};root.userData.localMaterials=[steel,wood];
  const motion=createWorkshopMotion({scene,furnacePose:pose(scene,-4,1,-2)});motion.place('a',root,pose(scene,0,1),{token:'anvil'});
  let finished=false;const promise=motion.beginHeating('a',1000).then(value=>{finished=value;return value;});
  motion.update(.25);assert.ok(root.position.distanceTo(new THREE.Vector3(-4,1,-2))<1e-6);
  motion.update(.3);const glow=steel.emissiveIntensity;assert.ok(glow>.2);assert.equal(wood.emissive.getHex(),0);
  motion.update(0);assert.equal(steel.emissiveIntensity,glow);assert.equal(finished,false);
  motion.update(.25);assert.ok(steel.emissiveIntensity>.7,'withdrawn blade remains incandescent');
  motion.update(.2);assert.equal(await promise,true);assert.equal(root.position.x,0);assert.ok(Math.abs(steel.emissiveIntensity-.72)<1e-6,'furnace heat converges toward persistent held heat without a cold flash');assert.equal(motion.isInteracting(),false);motion.dispose();steel.dispose();wood.dispose();
});

test('hammer striking face reaches the spark origin at contact for tilted portrait cameras', () => {
  const camera=new THREE.PerspectiveCamera();camera.position.set(-1,2.2,3);camera.lookAt(-1,1.5,-2);
  const origin=new THREE.Vector3(-.96,1.64,-.92),hammer=new THREE.Group();camera.add(hammer);
  const contact=getHammerStrikePose({camera,restPosition:new THREE.Vector3(.2,-.43,-.99),restQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44)),scale:.68,origin,time:.22});
  hammer.position.copy(contact.position);hammer.quaternion.copy(contact.quaternion);hammer.scale.copy(contact.scale);hammer.updateWorldMatrix(true,false);
  const strikingFace=new THREE.Vector3(-.064,.3383,0).applyMatrix4(hammer.matrixWorld);
  assert.ok(strikingFace.distanceTo(origin)<1e-6,'contact and spark source are the same world point');
});
test('heating serializes and cancellation restores pose and resolves false exactly once', async () => {
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);const motion=createWorkshopMotion({scene,furnacePose:pose(scene,-4,1,-2)});
  motion.place('a',root,pose(scene,1),{token:'hands'});const promise=motion.beginHeating('a');assert.equal(await motion.beginHeating('a'),false);
  motion.update(.3);motion.cancelHeating();assert.equal(await promise,false);assert.equal(root.position.x,1);assert.equal(motion.isInteracting(),false);
  const removed=motion.beginHeating('a');motion.forget('a');assert.equal(await removed,false);motion.dispose();
});
test('strike emits one impact at contact, never at start or while paused, and resets cleanly', () => {
  const scene=new THREE.Scene(),impacts=[];const motion=createWorkshopMotion({scene,onImpact:payload=>impacts.push(payload)});
  assert.equal(motion.strike({outcome:'great',evolved:true,position:new THREE.Vector3(1,2,3)}),true);
  assert.equal(motion.strike({outcome:'success'}),false);assert.equal(impacts.length,0);
  motion.update(.1);motion.update(0);assert.equal(impacts.length,0);
  motion.update(.13);assert.equal(impacts.length,1);assert.equal(impacts[0].outcome,'great');assert.deepEqual(impacts[0].position.toArray(),[1,2,3]);
  motion.update(.5);assert.equal(impacts.length,1);assert.equal(motion.isInteracting(),false);
  motion.strike({outcome:'break'});motion.reset();motion.update(1);assert.equal(impacts.length,1);motion.dispose();
});

test('an impact callback may reset the current run without a stale pending strike', () => {
  const scene=new THREE.Scene();let motion;
  motion=createWorkshopMotion({scene,onImpact:()=>motion.reset()});
  motion.strike({outcome:'success'});assert.doesNotThrow(()=>motion.update(.25));assert.equal(motion.isInteracting(),false);motion.dispose();
});

test('portrait ticket focus keeps full board within side margins and above the touch detail panel', () => {
  for(const [width,height] of [[390,844],[360,740]]){
    const aspect=width/height,view=getTicketFocusView(aspect),camera=new THREE.PerspectiveCamera(66,aspect,.045,60);
    camera.position.copy(view.position);camera.lookAt(view.look);camera.updateMatrixWorld();
    for(const x of [-1.9,1.9])for(const y of [1.3,3.2]){const point=new THREE.Vector3(x,y,4.96).project(camera);assert.ok(Math.abs(point.x)<.94,'horizontal board margin');assert.ok((1-point.y)/2<.54,'board clears the lower detail panel');}
    assert.ok(camera.position.z>-3.1,'focus camera remains inside room');
  }
});

test('landscape touch ticket focus clears the right panel without turning away from the board', () => {
  const width=844,height=390,aspect=width/height;
  const view=getTicketFocusView(aspect,66,true),centered=getTicketFocusView(aspect);
  const camera=new THREE.PerspectiveCamera(66,aspect,.045,60);camera.position.copy(view.position);camera.lookAt(view.look);camera.updateMatrixWorld();
  const original=new THREE.PerspectiveCamera(66,aspect,.045,60);original.position.copy(centered.position);original.lookAt(centered.look);
  assert.ok(camera.quaternion.angleTo(original.quaternion)<1e-6,'camera translates parallel to the board');
  for(const x of [-1.9,1.9])for(const y of [1.3,3.2]){
    const point=new THREE.Vector3(x,y,4.96).project(camera),screenX=(point.x+1)*width/2;
    assert.ok(screenX<548-12,'rightmost current-ticket column clears the panel');
    assert.ok(screenX>14,'left board edge remains on screen');
  }
  const desktop=getTicketFocusView(1280/720);assert.equal(desktop.position.x,0);assert.equal(desktop.look.x,0);
  const portrait=getTicketFocusView(390/844,66,true);assert.equal(portrait.position.x,0);assert.equal(portrait.look.x,0);
});

test('fastest grip and bellows cadence is never delayed by the cosmetic busy gate', () => {
  const scene=new THREE.Scene(),impacts=[];const motion=createWorkshopMotion({scene,onImpact:event=>impacts.push(event)});
  const durationMs=640/1.45;
  motion.strike({outcome:'success',durationMs});assert.ok(motion.getStrike().duration<durationMs/1000);
  motion.update(.22);assert.equal(impacts.length,1);motion.update(.19);
  assert.equal(motion.isInteracting(),false,'visual finishes before the .441s gameplay cadence');
  assert.equal(motion.strike({outcome:'success',durationMs}),true);motion.dispose();
});

test('portrait held blade moves inward with unchanged desktop pose', () => {
  const phone=getHeldSwordPose(390/844),desktop=getHeldSwordPose(1280/720);
  assert.ok(phone.position.x>-.15);assert.ok(phone.scale.x<=.42);assert.equal(desktop.position.x,-.36);assert.equal(desktop.scale.x,.46);
  const camera=new THREE.PerspectiveCamera(66,390/844,.045,60),root=new THREE.Group();camera.add(root);
  root.position.copy(phone.position);root.quaternion.copy(phone.quaternion);root.scale.copy(phone.scale);camera.updateMatrixWorld();
  for(const x of [-1.2,-.6,.3,1.4]){const point=new THREE.Vector3(x,0,0).applyMatrix4(root.matrixWorld).project(camera);assert.ok(point.x>-.95&&point.x<.95,'grip and blade spine remain within viewport');}
});
test('resize updates a heating return pose without cancelling or restarting heat', async () => {
  const scene=new THREE.Scene(),camera=new THREE.Group();scene.add(camera);const root=new THREE.Group();camera.add(root);
  const motion=createWorkshopMotion({scene,furnacePose:pose(scene,-4,1,-2)});
  motion.place('a',root,pose(camera,-.36),{token:'hands/desktop'});const pending=motion.beginHeating('a',1000);motion.update(.6);
  motion.place('a',root,pose(camera,-.12),{token:'hands/phone',animate:true});assert.equal(motion.isInteracting(),true);
  motion.update(.4);assert.equal(await pending,true);assert.equal(root.parent,camera);assert.equal(root.position.x,-.12);motion.dispose();
});
