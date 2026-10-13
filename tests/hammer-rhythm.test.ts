import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {getHammerStrikePose,getHammerForearmPose,getAnvilFocusView} from '../src/workshop-motion.ts';
import {HAMMER_FACE,HAMMER_WRIST,hammerHeadMinimumY} from '../src/hammer-frame.ts';

function setup(aspect=1280/720,z: number | null=null,height=1.62){
  const view=getAnvilFocusView(aspect),camera=new THREE.PerspectiveCamera(66,aspect,.045,60);camera.position.copy(view.position);if(z!==null)camera.position.z=z;camera.lookAt(view.look);camera.updateMatrixWorld();
  const origin=new THREE.Vector3(-.96,height,-.92);
  const frame=(time: number)=>{
    const pose=getHammerStrikePose({camera,scale:.68,origin,time,contact:.32,duration:.56});
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

test('arm proportions stay within a normal reach and are never lengthened for a distant phone camera',()=>{
  for(const [aspect,z] of [[1280/720,.95],[360/800,4.18]]){
    const {frame}=setup(aspect,z),current=frame(.32);
    assert.ok(current.arm.length<=.4,'forearm is at most 40cm, rather than a 72cm or longer sleeve');
    assert.ok(current.arm.upperLength<=.42,'upper arm is at most 42cm');
    assert.equal(current.pose.armScale,1,'camera framing cannot scale the limbs');
  }
});

test('a forceful strike is lifted overhead before its accelerating downstroke',()=>{
  const {frame,origin}=setup();
  const raised=Math.max(...Array.from({length:32},(_,i)=>frame(i/100).face.y));
  assert.ok(raised>origin.y+.7,'hammer is visibly raised high above the blade');
});

test('the windup visibly lifts the arm out of a low guard instead of only rotating the hammer',()=>{
  for(const aspect of [1280/720,1,360/800]){
    const {frame}=setup(aspect);
    assert.ok(frame(0).wrist.distanceTo(frame(.32*.42).wrist)>.3,'the hand travels at least 30cm through the windup');
  }
});

test('the desktop windup brings the raised hand inside the frame',()=>{
  const {frame,camera}=setup(),raised=frame(.32*.42);
  const screen=raised.wrist.clone().applyMatrix4(camera.matrixWorld).project(camera);
  assert.ok(Math.abs(screen.x)<.95&&Math.abs(screen.y)<.95,'the raised hand stays visible with a small screen margin');
});

test('a heavy downstroke concentrates most of its descent in the final quarter',()=>{
  const {frame,origin}=setup(),raise=.32*.42,fall=.32-raise;
  const height=frame(raise).face.y-origin.y,remaining=frame(.32-fall*.25).face.y-origin.y;
  assert.ok(remaining/height>.6,'more than 60% of the vertical descent is driven through the last quarter');
  const middle=raise+fall*.5,midSpeed=(frame(middle).face.y-frame(middle+.001).face.y)/.001;
  const endSpeed=(frame(.319).face.y-frame(.32).face.y)/.001;
  assert.ok(endSpeed>midSpeed*3,'the hammer keeps gaining speed toward impact instead of floating down at a similar pace');
});

test('a strike accelerates into the blade and rebounds without parking on its surface',()=>{
  const {frame,origin}=setup();
  const earlySpeed=(frame(.15).face.y-frame(.151).face.y)/.001,lateSpeed=(frame(.31).face.y-frame(.311).face.y)/.001;
  assert.ok(earlySpeed>0&&lateSpeed>earlySpeed*4,'measured downward speed increases strongly after the overhead windup');
  assert.ok(frame(.32).face.distanceTo(frame(.319).face)>.001,'last millisecond still has downward impact speed');
  assert.ok(frame(.344).face.y>origin.y+.012,'the hammer has already lifted 24ms after contact');
  const liftHeight=Math.max(...Array.from({length:32},(_,i)=>frame(i/100).face.y))-origin.y;
  const reboundHeight=Math.max(...Array.from({length:24},(_,i)=>frame(.32+i/100).face.y))-origin.y;
  assert.ok(reboundHeight<liftHeight*.65,'rebound is a smaller motion than the intentional windup');
});

test('overhead forging stays in reach without the old idle-to-contact side twist',()=>{
  const {frame}=setup(),contact=frame(.32);
  for(let i=0;i<=56;i++){
    const current=frame(i/100);
    assert.ok(current.wrist.distanceTo(contact.wrist)<.35,'raised hand stays within a short working reach');
    assert.ok(current.pose.quaternion.angleTo(contact.pose.quaternion)<1.75,'large overhead arc avoids the old 120 degree side twist');
  }
});

test('desktop and portrait forge cameras keep the entire overhead stroke within the fixed shoulder reach',()=>{
  for(const aspect of [1280/720,1,360/800,390/844])for(const height of [1.61,1.7504]){
    const {frame}=setup(aspect,null,height),anchor=new THREE.Vector3(THREE.MathUtils.lerp(.21,.28,THREE.MathUtils.clamp((aspect-.9)/.65,0,1)),-.3,-.12);
    for(let i=0;i<=56;i++)assert.ok(frame(i/100).arm.shoulder.distanceTo(anchor)<1e-5,'IK never relocates the shoulder to manufacture extra reach');
  }
});

test('windups keep the aligned head ahead of the near plane without stretching the arm across window shapes',()=>{
  // Blade contacts include the thick citadel and the fish blade's offset plate.
  const origins=[new THREE.Vector3(-.96,1.60112,-.92),new THREE.Vector3(-.96,1.7504,-.92),new THREE.Vector3(-.96,1.670527,-.7664)];
  const depthAxis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  for(let step=0;step<=80;step++){
    const aspect=.4+step*.025,{camera}=setup(aspect);
    const shoulder=new THREE.Vector3(THREE.MathUtils.lerp(.21,.28,THREE.MathUtils.clamp((aspect-.9)/.65,0,1)),-.3,-.12);
    for(const origin of origins)for(const time of [...Array.from({length:57},(_,i)=>i/100),.32*.42]){
      const pose=getHammerStrikePose({camera,scale:.68,origin,time});
      const nearDepth=-pose.position.z+hammerHeadMinimumY(depthAxis.clone().multiply(pose.quaternion),pose.scale.x);
      assert.ok(nearDepth>.05,`head clears the 45mm near plane with margin, aspect=${aspect}, t=${time}`);
      const wrist=HAMMER_WRIST.clone().applyMatrix4(new THREE.Matrix4().compose(pose.position,pose.quaternion,pose.scale));
      assert.ok(getHammerForearmPose(wrist,aspect).shoulder.distanceTo(shoulder)<1e-5,'framing correction never creates extra arm reach');
    }
  }
});
