import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createWorkshopMotion, getHammerStrikePose, getHammerForearmPose, getTicketFocusView, getHeldSwordPose } from '../src/workshop-motion.js';
import {HAMMER_HEAD,HAMMER_FACE,HAMMER_WRIST} from '../src/hammer-frame.js';
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
  const strikingFace=HAMMER_FACE.clone().applyMatrix4(hammer.matrixWorld);
  assert.ok(strikingFace.distanceTo(origin)<1e-6,'contact and spark source are the same world point');
});
test('the actual left hammer face points down at contact and the gripped hand stays above the anvil', () => {
  const camera=new THREE.PerspectiveCamera();camera.position.set(-1.05,2.22,.95);camera.lookAt(-1.05,1.51,-2.1);
  const origin=new THREE.Vector3(-.96,1.62,-.92),hammer=new THREE.Group();camera.add(hammer);
  const pose=getHammerStrikePose({camera,restPosition:new THREE.Vector3(.43,-.43,-.99),restQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44)),scale:.68,origin,time:.22});
  hammer.position.copy(pose.position);hammer.quaternion.copy(pose.quaternion);hammer.scale.copy(pose.scale);hammer.updateWorldMatrix(true,false);
  // Left polished cap from the rendered head assembly, not the head underside.
  const headRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.12);
  const cap=new THREE.Vector3(-.285,0,0).multiplyScalar(.58).applyQuaternion(headRotation).add(new THREE.Vector3(-.058,.405,0));
  const face=cap.applyMatrix4(hammer.matrixWorld),normal=new THREE.Vector3(-1,0,0).applyQuaternion(headRotation).transformDirection(hammer.matrixWorld);
  assert.ok(face.distanceTo(origin)<1e-6,'rendered striking cap lands on the sword');
  assert.ok(normal.dot(new THREE.Vector3(0,-1,0))>.999,'strike uses the flat cap, facing the blade');
  const grip=new THREE.Vector3(.055,-.205,.067).applyMatrix4(hammer.matrixWorld);
  assert.ok(grip.y>origin.y+.18,'hand and handle do not disappear into the anvil');
});
test('a thick sword does not cause the camera-held hammer to jump at the start or end of a swing',()=>{
  const camera=new THREE.PerspectiveCamera();camera.position.set(-1.05,2.22,.95);camera.lookAt(-1.05,1.51,-2.1);
  const restPosition=new THREE.Vector3(.43,-.43,-.99),restQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44));
  for(const time of [0,.48]){
    const pose=getHammerStrikePose({camera,restPosition,restQuaternion,scale:.68,origin:new THREE.Vector3(-.96,1.75,-.92),time});
    assert.ok(pose.position.distanceTo(restPosition)<1e-7,'rest pose outside the anvil retains its position');assert.ok(pose.quaternion.angleTo(restQuaternion)<1e-7);
  }
});
test('rounded hammer head and gripping hand stay clear of the anvil throughout desktop and portrait swings',()=>{
  const headFrame=new THREE.Matrix4().compose(new THREE.Vector3(...HAMMER_HEAD.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),HAMMER_HEAD.roll),new THREE.Vector3().setScalar(HAMMER_HEAD.scale));
  const parts=[
    {g:new RoundedBoxGeometry(.36,.235,.245,3,.044),p:new THREE.Vector3(-.01,0,0),head:true},
    {g:new RoundedBoxGeometry(.13,.22,.232,3,.032),p:new THREE.Vector3(-.22,0,0),head:true},
    {g:new RoundedBoxGeometry(.125,.185,.085,3,.034),p:new THREE.Vector3(.055,-.205,.067),roll:-.13}
  ];
  const point=new THREE.Vector3();
  for(const [z,toolX] of [[.95,.43],[3.3,.2]])for(const y of [1.61,1.75]){
    const camera=new THREE.PerspectiveCamera();camera.position.set(-1.05,2.22,z);camera.lookAt(-1.05,1.51,-2.1);camera.updateMatrixWorld();
    for(let frame=0;frame<=48;frame++){
      const t=frame/100,pose=getHammerStrikePose({camera,restPosition:new THREE.Vector3(toolX,-.43,-.99),restQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44)),scale:.68,origin:new THREE.Vector3(-.96,y,-.92),time:t});
      const root=new THREE.Matrix4().compose(pose.position,pose.quaternion,pose.scale).premultiply(camera.matrixWorld);
      for(const {g,p,head,roll=0} of parts){
        const local=new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll),new THREE.Vector3(1,1,1));
        if(head)local.premultiply(headFrame);const matrix=root.clone().multiply(local),positions=g.attributes.position;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
          if(point.x> -1.575&&point.x<-.355&&point.z> -1.1875&&point.z<-.6525)
            assert.ok(point.y>=1.508-1e-6,`solid anvil clearance at t=${t} camera=${z} blade=${y}`);
          if(head&&point.x> -1.575&&point.x<-.355&&Math.abs(point.z+.92)<.11)
            assert.ok(point.y>=y-1e-6,`head does not pass through the blade at t=${t}`);
        }
      }
    }
  }
  parts.forEach(part=>part.g.dispose());
});
test('independent forearm connects to the animated wrist and clears the anvil while its elbow stays offscreen',()=>{
  const sleeve=new THREE.CylinderGeometry(.082,.104,1,20),point=new THREE.Vector3();
  for(const [aspect,toolX,z] of [[1280/720,.43,.95],[360/800,.2,3.3]]){
    const camera=new THREE.PerspectiveCamera(66,aspect,.045,60);camera.position.set(-1.05,2.22,z);camera.lookAt(-1.05,1.51,-2.1);camera.updateMatrixWorld();
    for(let frame=0;frame<=48;frame++){
      const pose=getHammerStrikePose({camera,restPosition:new THREE.Vector3(toolX,-.43,-.99),restQuaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.3,-.44)),scale:.68,origin:new THREE.Vector3(-.96,1.75,-.92),time:frame/100});
      const wrist=HAMMER_WRIST.clone().applyMatrix4(new THREE.Matrix4().compose(pose.position,pose.quaternion,pose.scale)),arm=getHammerForearmPose(wrist,aspect);
      const middle=arm.wrist.clone().add(arm.elbow).multiplyScalar(.5),matrix=new THREE.Matrix4().compose(middle,arm.quaternion,new THREE.Vector3(.68,arm.length,.68));
      assert.ok(new THREE.Vector3(0,.5,0).applyMatrix4(matrix).distanceTo(wrist)<1e-6,'upper endpoint follows actual hand');
      const elbow=arm.elbow.clone().applyMatrix4(camera.matrixWorld).project(camera);assert.ok(elbow.y< -1,'sleeve end is below viewport');
      matrix.premultiply(camera.matrixWorld);
      for(let i=0;i<sleeve.attributes.position.count;i++){
        point.fromBufferAttribute(sleeve.attributes.position,i).applyMatrix4(matrix);
        if(point.x> -1.575&&point.x<-.355&&point.z> -1.1875&&point.z<-.6525)assert.ok(point.y>=1.508,'forearm stays above anvil where their volumes overlap');
      }
    }
  }
  sleeve.dispose();
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
test('an impact-time form change corrects the active hammer contact before its pose is rendered',()=>{
  const scene=new THREE.Scene(),newSurface=new THREE.Vector3(-.96,1.75,-.92);let impacts=0;
  const motion=createWorkshopMotion({scene,onImpact:()=>{impacts++;return {position:newSurface};}});
  motion.strike({outcome:'great',evolved:true,position:new THREE.Vector3(-.96,1.61,-.92)});motion.update(.22);
  assert.equal(impacts,1);assert.ok(motion.getStrike().position.distanceTo(newSurface)<1e-8,'new blade surface replaces stale thin-blade contact');
  motion.update(0);assert.equal(impacts,1);motion.dispose();
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
