import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findForgeContact} from '../src/forge-contact.ts';
import {createSwordRenderer} from '../src/sword-renderer.ts';

test('contact lands on the actual scaled blade top, ignoring guard, invisible hitbox and floating swords',()=>{
 const root=new THREE.Group(),visual=new THREE.Group();root.add(visual);root.userData.visual=visual;
 const steel=new THREE.MeshStandardMaterial();steel.userData.respondsToHeat=true;steel.userData.baseEmission=new THREE.Color(0);
 const blade=new THREE.Mesh(new THREE.BoxGeometry(1.5,.18,.24),steel);blade.position.x=.25;visual.add(blade);
 const guard=new THREE.Mesh(new THREE.BoxGeometry(.2,1,.7),steel);guard.position.set(-.65,.8,0);visual.add(guard);
 const hit=new THREE.Mesh(new THREE.BoxGeometry(3,3,3),new THREE.MeshBasicMaterial({opacity:0,transparent:true}));hit.userData.swordId='a';root.add(hit);
 const floating=new THREE.Group();floating.userData.motion='satellite';visual.add(floating);const floatingBlade=blade.clone();floatingBlade.position.y=.9;floating.add(floatingBlade);
 root.position.set(-1.08,1.58,-.92);root.scale.setScalar(.96);root.rotation.y=.31;
 const contact=findForgeContact(root);assert.ok(contact);assert.equal(contact.mesh,blade);
 assert.ok(Math.abs(contact.position.y-(1.58+.09*.96))<1e-7,'scaled blade height, rather than fixed .06 offset');
 assert.ok(contact.normal.y>.99);assert.ok(Math.abs(contact.localPoint.x-.125)<1e-6);
});
test('split gaps choose nearby real plate surface instead of empty space',()=>{
 const root=new THREE.Group(),visual=new THREE.Group();root.add(visual);root.userData.visual=visual;
 const material=new THREE.MeshStandardMaterial();material.userData.respondsToHeat=true;
 for(const x of [-.075,.325]){const blade=new THREE.Mesh(new THREE.BoxGeometry(.3,.06,.2),material);blade.position.x=x;visual.add(blade);}
 root.position.set(-1,1.58,-1);const contact=findForgeContact(root);assert.ok(contact);assert.ok(Math.abs(contact.localPoint.x-.125)>.01);
 const ray=new THREE.Raycaster(contact.position.clone().add(new THREE.Vector3(0,.01,0)),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(contact.mesh,false)[0];assert.ok(hit.point.distanceTo(contact.position)<1e-6);
});
test('legacy material identity and unrefreshed floor/ancestor transforms produce exact surface coordinates',()=>{
 const parent=new THREE.Group(),root=new THREE.Group();parent.add(root);parent.position.set(3,1,-2);parent.rotation.y=.4;parent.scale.set(2,1.3,.8);
 root.position.set(-1.08,.11,-.92);root.scale.setScalar(.78);
 const bladeMaterial=new THREE.MeshStandardMaterial({emissive:'#ff5217',emissiveIntensity:1.8});
 const blade=new THREE.Mesh(new THREE.BoxGeometry(1.5,.2,.24),bladeMaterial);blade.position.x=.25;root.add(blade);
 const decoration=new THREE.Mesh(new THREE.BoxGeometry(.6,1,.3),new THREE.MeshStandardMaterial());root.add(decoration);
 const contact=findForgeContact(root,{bladeMaterials:[bladeMaterial]});assert.ok(contact);assert.equal(contact.mesh,blade);
 const expected=new THREE.Vector3(.125,.1,0).applyMatrix4(root.matrixWorld);assert.ok(expected.distanceTo(contact.position)<1e-7);
 assert.deepEqual(root.position.toArray(),[-1.08,.11,-.92],'query never changes placement');
});
test('contact follows a same-root form replacement and then the current blade vibration',()=>{
 const renderer=createSwordRenderer(),root=renderer.create({id:'evolving',typeKey:'citadel',level:4,heat:100});
 root.position.set(-1.08,1.58,-.92);root.scale.setScalar(.96);const before=findForgeContact(root);assert.ok(before);
 renderer.update(root,{id:'evolving',typeKey:'citadel',level:8,heat:100});const evolved=findForgeContact(root);assert.ok(evolved);
 assert.ok(evolved.position.y-before.position.y>.05,'new thick geometry determines contact immediately');assert.notEqual(evolved.mesh,before.mesh);
 root.position.y+=.007;const vibrating=findForgeContact(root);assert.ok(vibrating);assert.ok(Math.abs(vibrating.position.y-evolved.position.y-.007)<1e-7);
 renderer.disposeInstance(root);renderer.dispose();
});
test('all 99 sword family stages return finite contact on rendered geometry with form-dependent heights',()=>{
 const renderer=createSwordRenderer(),heights=new Set();
 for(const typeKey of ['splitblade','runeblade','holy','dragonfang','sawblade','citadel','worldtree','fishblade','funerary'])for(let level=0;level<=20;level+=2){
  const root=renderer.create({id:`${typeKey}-${level}`,typeKey,level,heat:100});root.position.set(-1.08,1.58,-.92);root.scale.setScalar(.96);
  const contact=findForgeContact(root);assert.ok(contact,`${typeKey}+${level} has a real blade surface`);assert.ok(contact.position.toArray().every(Number.isFinite));
  const hit=new THREE.Raycaster(contact.position.clone().add(new THREE.Vector3(0,.01,0)),new THREE.Vector3(0,-1,0)).intersectObject(contact.mesh,false)[0];
  assert.ok(hit&&hit.point.distanceTo(contact.position)<1e-5,`${typeKey}+${level} point lies on selected geometry`);
  heights.add(contact.position.y.toFixed(4));renderer.disposeInstance(root);
 }
 assert.ok(heights.size>10,'real evolving blade thickness changes contact height');renderer.dispose();
});
