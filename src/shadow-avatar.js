import * as THREE from 'three';

// Layer masking would also exclude objects from Three's shadow pass (it tests
// the view camera's layers). A color/depth-silent material with a real custom
// depth material keeps the body invisible while preserving its silhouette.
export function createShadowAvatar() {
  const root=new THREE.Group(),geometries=new Set();root.name='protagonist-shadow';
  const material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  const sphere=own(new THREE.SphereGeometry(1,10,8)),cylinder=own(new THREE.CylinderGeometry(1,1,1,8)),box=own(new THREE.BoxGeometry(1,1,1));
  function own(g){geometries.add(g);return g;}
  function mesh(name,geometry,x,y,z,sx,sy,sz){const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.customDepthMaterial=depth;root.add(m);return m;}
  mesh('head',sphere,0,1.72,.07,.145,.175,.15);mesh('neck',cylinder,0,1.5,.05,.075,.12,.075);
  mesh('torso',sphere,0,1.22,.05,.26,.34,.155);mesh('apron',box,0,.94,-.03,.4,.4,.13);
  const legs=[mesh('left-leg',cylinder,-.13,.47,.055,.095,.78,.11),mesh('right-leg',cylinder,.13,.47,.055,.095,.78,.11)];
  mesh('left-foot',box,-.13,.075,-.04,.19,.14,.31);mesh('right-foot',box,.13,.075,-.04,.19,.14,.31);
  const arms={};for(const [side,x] of [['left',-.27],['right',.27]]){arms[side]={upper:mesh(`${side}-upper-arm`,cylinder,x,1.2,.02,.07,.35,.07),lower:mesh(`${side}-forearm`,cylinder,x,.92,-.04,.065,.36,.065),hand:mesh(`${side}-hand`,sphere,x,.74,-.08,.075,.08,.065)};}
  const tool=new THREE.Group();root.add(tool);const shaft=new THREE.Mesh(cylinder,material);shaft.name='tool-shaft';shaft.scale.set(.035,.72,.035);shaft.position.y=.02;tool.add(shaft);
  const head=new THREE.Mesh(box,material);head.name='tool-head';head.position.set(-.058,.405,0);head.scale.set(.29,.14,.15);tool.add(head);
  tool.traverse(m=>{if(m.isMesh){m.castShadow=true;m.customDepthMaterial=depth;}});
  const local=new THREE.Vector3(),handWorld=new THREE.Vector3(),parentInverse=new THREE.Matrix4();
  function segment(part,a,b,radius){part.position.copy(a).add(b).multiplyScalar(.5);const direction=b.clone().sub(a);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());part.scale.set(radius,direction.length(),radius);}
  function arm(side,hand){const shoulder=new THREE.Vector3(side==='left'?-.27:.27,1.39,.04),elbow=shoulder.clone().lerp(hand,.5);elbow.x+=(side==='left'?-.08:.08);elbow.z+=.06;segment(arms[side].upper,shoulder,elbow,.074);segment(arms[side].lower,elbow,hand,.065);arms[side].hand.position.copy(hand);}
  function update({camera,heldRoot=null,hammerRoot=null,time=0,walking=false}){
    root.position.set(camera.position.x,0,camera.position.z);const heading=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');root.rotation.y=heading.y;root.updateWorldMatrix(true,true);parentInverse.copy(root.matrixWorld).invert();
    legs.forEach((leg,i)=>{leg.rotation.x=walking?Math.sin(time*10+i*Math.PI)*.21:0;});
    if(heldRoot){heldRoot.updateWorldMatrix(true,false);handWorld.set(-1.02,.01,0).applyMatrix4(heldRoot.matrixWorld).applyMatrix4(parentInverse);arm('left',handWorld);}else arm('left',local.set(-.31,.83,-.02));
    tool.visible=!!hammerRoot?.visible;
    if(tool.visible){hammerRoot.updateWorldMatrix(true,false);const matrix=new THREE.Matrix4().multiplyMatrices(parentInverse,hammerRoot.matrixWorld);matrix.decompose(tool.position,tool.quaternion,tool.scale);handWorld.set(.04,-.2,.06).applyMatrix4(hammerRoot.matrixWorld).applyMatrix4(parentInverse);arm('right',handWorld);}else arm('right',local.set(.31,.83,-.02));
  }
  function dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());material.dispose();depth.dispose();}
  return {root,update,dispose};
}
