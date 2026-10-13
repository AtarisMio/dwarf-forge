import * as THREE from 'three';
import {HAMMER_HEAD,HAMMER_FACE,HAMMER_GRIP,hammerHeadMinimumY} from './hammer-frame.js';

const ease = t => { const v=THREE.MathUtils.clamp(t,0,1);return v*v*(3-2*v); };
function copyPose(pose) { return { parent:pose.parent, position:pose.position.clone(),quaternion:pose.quaternion.clone(),scale:pose.scale.clone() }; }
function worldPose(pose) {
  pose.parent.updateWorldMatrix(true,false);
  const matrix=new THREE.Matrix4().compose(pose.position,pose.quaternion,pose.scale).premultiply(pose.parent.matrixWorld);
  const result={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3()};matrix.decompose(result.position,result.quaternion,result.scale);return result;
}
function currentPose(root) { root.updateWorldMatrix(true,false);const p={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3()};root.matrixWorld.decompose(p.position,p.quaternion,p.scale);return p; }
function attach(root, target) { target.parent.add(root);root.position.copy(target.position);root.quaternion.copy(target.quaternion);root.scale.copy(target.scale); }
function blend(root, from, to, progress, arc=0) {
  const t=ease(progress);root.position.lerpVectors(from.position,to.position,t);root.position.y+=Math.sin(Math.PI*t)*arc;
  root.quaternion.slerpQuaternions(from.quaternion,to.quaternion,t);root.scale.lerpVectors(from.scale,to.scale,t);
}

function hammerContactFrame(camera,origin,scale){
  const toPlayer=camera.getWorldPosition(new THREE.Vector3()).sub(origin);toPlayer.y=0;toPlayer.normalize();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));right.y=0;right.normalize();
  const toGrip=toPlayer.clone().addScaledVector(right,.85).normalize();
  const yaw=Math.atan2(-toGrip.z,toGrip.x),contactQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2-HAMMER_HEAD.roll));
  const contactPosition=origin.clone().sub(HAMMER_FACE.clone().multiplyScalar(scale).applyQuaternion(contactQuaternion));
  const contactWrist=contactPosition.clone().add(HAMMER_GRIP.clone().multiplyScalar(scale).applyQuaternion(contactQuaternion));
  return {toGrip,contactQuaternion,contactWrist,armScale:1};
}

function hammerWorkingPose({camera,scale,origin},angle,reach,lift){
  const frame=hammerContactFrame(camera,origin,scale),axis=new THREE.Vector3(0,1,0).cross(frame.toGrip);
  const quaternion=new THREE.Quaternion().setFromAxisAngle(axis,angle).multiply(frame.contactQuaternion);
  const wrist=frame.contactWrist.addScaledVector(frame.toGrip,reach);wrist.y+=lift;
  const position=wrist.sub(HAMMER_GRIP.clone().multiplyScalar(scale).applyQuaternion(quaternion));
  // Protect the whole head envelope without flattening the stroke into a slide.
  const head=position.clone().add(new THREE.Vector3(...HAMMER_HEAD.position).multiplyScalar(scale).applyQuaternion(quaternion));
  const nearBlade=ease((.55-Math.hypot(head.x-origin.x,head.z-origin.z))/.2);
  position.y+=nearBlade*Math.max(0,origin.y-position.y-hammerHeadMinimumY(quaternion,scale));
  camera.updateWorldMatrix(true,false);const matrix=new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3().setScalar(scale)).premultiply(camera.matrixWorld.clone().invert());
  const result={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3(),armScale:frame.armScale};matrix.decompose(result.position,result.quaternion,result.scale);return result;
}

export function getHammerReadyPose(options){return hammerWorkingPose(options,.45,.03,.03);}

export function getHammerStrikePose({camera,scale,origin,time,contact=.32,duration=.56}){
  const options={camera,scale,origin};let angle,reach,lift;
  const raise=contact*.42;
  if(time<raise){const t=ease(time/raise);angle=.45+1.05*t;reach=.03+.12*t;lift=.03+.21*t;}
  else if(time<contact){
    // Acceleration into contact, rather than a smoothstep that stops before impact.
    const t=THREE.MathUtils.clamp((time-raise)/(contact-raise),0,1),remaining=1-Math.pow(t,1.8);
    angle=1.5*remaining;reach=.15*remaining;lift=.24*remaining;
  }else{
    const rebound=Math.min(.09,(duration-contact)*.4);
    if(time<contact+rebound){const t=THREE.MathUtils.clamp((time-contact)/rebound,0,1),up=1-(1-t)*(1-t);angle=.55*up;reach=.04*up;lift=.04*up;}
    else {const t=ease((time-contact-rebound)/(duration-contact-rebound));angle=.55-.1*t;reach=.04-.01*t;lift=.04-.01*t;}
  }
  return hammerWorkingPose(options,angle,reach,lift);
}

export function getHammerForearmPose(wristPosition,aspect){
  // Keep anatomical proportions independent of framing. The forge camera moves
  // into reach; limbs are never scaled to bridge an arbitrary camera distance.
  const x=THREE.MathUtils.lerp(.21,.28,THREE.MathUtils.clamp((aspect-.9)/.65,0,1));
  const shoulder=new THREE.Vector3(x,-.3,-.12),length=.34,upperLength=.38;
  const delta=wristPosition.clone().sub(shoulder),distance=delta.length(),axis=delta.clone().normalize();
  const reach=THREE.MathUtils.clamp(distance,Math.abs(upperLength-length)+1e-5,upperLength+length-1e-5);
  if(distance!==reach)shoulder.addScaledVector(axis,distance-reach);
  const along=(upperLength*upperLength-length*length+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  const pole=new THREE.Vector3(1,-.08,.3);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,height);
  const forearmAxis=wristPosition.clone().sub(elbow).normalize(),upperAxis=elbow.clone().sub(shoulder).normalize(),up=new THREE.Vector3(0,1,0);
  return {wrist:wristPosition.clone(),elbow,shoulder,length,upperLength,
    quaternion:new THREE.Quaternion().setFromUnitVectors(up,forearmAxis),upperQuaternion:new THREE.Quaternion().setFromUnitVectors(up,upperAxis)};
}

export function getAnvilFocusView(aspect){
  const wide=THREE.MathUtils.clamp((aspect-.6)/.7,0,1);
  return {position:new THREE.Vector3(THREE.MathUtils.lerp(-.12,-1.05,wide),1.92,THREE.MathUtils.lerp(-.7,-.1,wide)),
    look:new THREE.Vector3(THREE.MathUtils.lerp(-1.1,-1,wide),THREE.MathUtils.lerp(1.63,1.64,wide),THREE.MathUtils.lerp(-.96,-1.3,wide))};
}

export function getTicketFocusView(aspect, fov=66, sidePanel=false) {
  const portrait=aspect<.8;
  const distance=portrait?Math.min(7.85,Math.max(3.26,4.35/(2*Math.tan(THREE.MathUtils.degToRad(fov/2))*Math.max(.1,aspect)))):3.26;
  const x=sidePanel&&aspect>1?-1.5:0;
  return {position:new THREE.Vector3(x,2.1,4.96-distance),look:new THREE.Vector3(x,portrait?1.55:2.25,4.96)};
}

export function getHeldSwordPose(aspect) {
  const width = THREE.MathUtils.clamp((aspect - .7) / .7, 0, 1);
  return {position:new THREE.Vector3(THREE.MathUtils.lerp(-.12,-.36,width),-.26,-1.06),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,-.14,Math.PI/2-.22)),scale:new THREE.Vector3().setScalar(THREE.MathUtils.lerp(.42,.46,width))};
}

// Cosmetic timelines never mutate ownership or game heat. World-space motion
// tracks camera-local destinations without rebuilding meshes or rigid bodies.
export function createWorkshopMotion({ scene, furnacePose, onImpact=()=>{}, onTransferEnd=()=>{} }) {
  const placements=new Map(),transfers=new Map();let heating=null, swing=null, disposed=false;
  function place(id,root,target,{token='',animate=false,duration=.38}={}) {
    const previous=placements.get(id);if(previous?.token===token&&previous.root===root)return;
    const entry={root,target:copyPose(target),token};placements.set(id,entry);
    if(heating?.id===id&&previous?.root===root&&previous.target.parent===target.parent&&previous.token.split('/')[0]===token.split('/')[0]){heating.entry=entry;return;}
    if(heating?.id===id)cancelHeating();
    if(animate&&previous&&!disposed){const from=currentPose(root);scene.attach(root);transfers.set(id,{...entry,from,time:0,duration});blend(root,from,from,0);}
    else {transfers.delete(id);attach(root,entry.target);}
  }
  function restoreHeat(state) { state.entry.root.userData.localMaterials?.forEach(m=>{if(!m.userData.respondsToHeat)return;m.emissive.copy(m.userData.baseEmission||new THREE.Color(0));m.emissiveIntensity=m.userData.heatIntensity??0;}); }
  function finishHeating(completed) { const state=heating;if(!state)return;heating=null;attach(state.entry.root,state.entry.target);if(!completed)restoreHeat(state);state.resolve(completed); }
  function beginHeating(id,durationMs=1400) {
    const entry=placements.get(id);if(disposed||!entry||!furnacePose||isInteracting())return Promise.resolve(false);
    const from=currentPose(entry.root);scene.attach(entry.root);
    return new Promise(resolve=>{heating={id,entry,from,time:0,duration:Math.max(.4,Number(durationMs)/1000||1.4),resolve};});
  }
  function cancelHeating() { finishHeating(false); }
  function strike(payload) {
    if(disposed||heating||swing||transfers.size)return false;
    const cadence=Number(payload.durationMs);
    const duration=Number.isFinite(cadence)&&cadence>0?Math.max(.28,Math.min(.56,cadence/1000*.92)):.56;
    swing={...payload,position:payload.position?.clone()||new THREE.Vector3(),time:0,duration,contact:Math.min(.32,duration*.58),impacted:false};return true;
  }
  function update(dt) {
    if(disposed||!(dt>0))return;
    for(const [id,transfer] of transfers){transfer.time+=dt;blend(transfer.root,transfer.from,worldPose(transfer.target),transfer.time/transfer.duration,.13);if(transfer.time>=transfer.duration){attach(transfer.root,transfer.target);transfers.delete(id);onTransferEnd(id);}}
    if(heating){const state=heating;state.time+=dt;const t=THREE.MathUtils.clamp(state.time/state.duration,0,1),furnace=worldPose(furnacePose),destination=worldPose(state.entry.target);
      if(t<.25)blend(state.entry.root,state.from,furnace,t/.25,.08);else if(t<.72)blend(state.entry.root,furnace,furnace,0);else blend(state.entry.root,furnace,destination,(t-.72)/.28,.08);
      const intensity=t<.25?0:t<.72?ease((t-.25)/.47):1,withdrawal=t<.72?0:ease((t-.72)/.28);
      // The furnace is brighter than a held blade. Withdrawal cools only to
      // the persistent hot-metal target, never through a cold frame.
      const brightness=t<.72?intensity*1.25:THREE.MathUtils.lerp(1.25,.72,withdrawal);
      state.entry.root.userData.localMaterials?.forEach(m=>{if(!m.userData.respondsToHeat)return;m.emissive.copy(m.userData.baseEmission||new THREE.Color(0)).lerp(new THREE.Color('#ff5217'),intensity*THREE.MathUtils.lerp(.92,.85,withdrawal));m.emissiveIntensity=Math.max(m.userData.heatIntensity??0,brightness);});
      if(t>=1)finishHeating(true);
    }
    if(swing){const state=swing;state.time+=dt;if(!state.impacted&&state.time>=state.contact){state.impacted=true;const corrected=onImpact({...state,position:state.position.clone()});if(swing===state&&corrected?.position)state.position.copy(corrected.position);}if(swing===state&&state.time>=state.duration)swing=null;}
  }
  function forget(id) { if(heating?.id===id)cancelHeating();transfers.delete(id);placements.delete(id); }
  function reset() { cancelHeating();for(const transfer of transfers.values())attach(transfer.root,transfer.target);transfers.clear();swing=null; }
  function isInteracting() { return !!heating||!!swing||transfers.size>0; }
  function isTransferring(id) { return transfers.has(id)||heating?.id===id; }
  return {place,update,beginHeating,cancelHeating,strike,forget,reset,isInteracting,isTransferring,
    getStrike:()=>swing,dispose(){reset();disposed=true;placements.clear();}};
}
