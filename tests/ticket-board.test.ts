import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isMeshObject} from '../src/workshop-types.ts';
import {createTicketBoard} from '../src/ticket-board.ts';
import type {TicketSnapshot} from '../src/ticket-glyphs.ts';
type TestCanvas = Pick<HTMLCanvasElement, 'width' | 'height'> & {
  getContext(kind: '2d'): Pick<CanvasRenderingContext2D, 'clearRect' | 'drawImage'>;
};
class TestImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'auto';
  set src(_value: string) {queueMicrotask(() => this.onload?.());}
}
function dom(t: TestContext) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const documentStub = {createElement(): TestCanvas {return {width: 0, height: 0, getContext: () => ({clearRect() {}, drawImage() {}})};}};
  Object.defineProperty(globalThis, 'document', {configurable: true, writable: true, value: documentStub});
  Object.defineProperty(globalThis, 'Image', {configurable: true, writable: true, value: TestImage});
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (oldImage) Object.defineProperty(globalThis, 'Image', oldImage);
    else Reflect.deleteProperty(globalThis, 'Image');
  });
}
function boardFace(root: THREE.Object3D) {
  const mesh = root.getObjectByName('ticket-board-face');
  assert.ok(mesh && isMeshObject(mesh));
  const material = mesh.material;
  assert.ok(material instanceof THREE.MeshBasicMaterial);
  const texture = material.map;
  assert.ok(texture instanceof THREE.CanvasTexture);
  return {mesh, material, texture};
}
function svgSource(texture: THREE.Texture): string {
  const source: unknown = texture.userData.svgSource;
  assert.ok(typeof source === 'string');
  return source;
}
function textureSize(texture: THREE.Texture): [number, number] {
  const image: unknown = texture.image;
  assert.ok(typeof image === 'object' && image !== null && 'width' in image && 'height' in image);
  assert.ok(typeof image.width === 'number' && typeof image.height === 'number');
  return [image.width, image.height];
}
const snapshot={active:true,swordName:'还算好用的铁剑',rows:[{id:'success',label:'成功',base:12,added:4,relicAdded:1,mechanicAdded:3,removed:2,total:14}],temporary:[{id:'blind',label:'盲骰：下一锤大成功 +3 票'}]} satisfies TicketSnapshot & {swordName: string; temporary: {id: string; label: string}[]};
test('parchment shows gross tickets with crossed removals and an independent mechanic subrow',async t=>{
 dom(t);const board=createTicketBoard({anisotropy:4});assert.ok(board.root instanceof THREE.Group);assert.deepEqual(board.root.position.toArray(),[0,0,0]);
 const size=new THREE.Box3().setFromObject(board.root).getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-3.8)<.01);assert.ok(Math.abs(size.y-1.9)<.01);
 await board.update(snapshot);const face=boardFace(board.root),source=svgSource(face.texture);assert.equal(face.texture.anisotropy,4);
 assert.ok(source.includes('#e7cfa0'),'warm hide');assert.match(source,/data-ticket-group="success-base" data-count="12" data-removed="2" data-live="10"/);
 assert.match(source,/data-ticket-group="success-relicAdded" data-count="1" data-removed="0" data-live="1"/);
 assert.match(source,/data-ticket-group="success-mechanicAdded" data-count="3" data-removed="0" data-live="3"/);
 assert.ok(source.includes('共 32 张'));assert.ok(source.includes('强化风险体现在铁砧牌上'));assert.ok(source.includes('机制'));
 for(const oldHeading of ['DRAW TICKETS','遗物加票','机制加票','移除','基准','当前','盲骰'])assert.equal(source.includes(oldHeading),false,oldHeading);
 assert.equal(source.includes('success-removed'),false,'no duplicate removed pool');assert.equal(/<text\b[^>]*>[^<]*%/.test(source),false);board.dispose();
});
test('updates preserve texture dimensions, escape dynamic text and allocate no new meshes',async t=>{dom(t);const board=createTicketBoard(),face=boardFace(board.root),texture=face.texture,size=textureSize(texture),children=board.root.children.length;await board.update({...snapshot,swordName:'<script>&'});assert.ok(svgSource(texture).includes('&lt;script&gt;&amp;'));await board.update(null);assert.ok(svgSource(texture).includes('铁砧未放剑'));assert.equal(board.root.children.length,children);assert.deepEqual(textureSize(texture),size);board.dispose();});
test('hand-cut hide has transparent corners and a matching shaped backing instead of a rectangular slab',async t=>{
 dom(t);const board=createTicketBoard();await board.update(null);board.root.updateMatrixWorld(true);
 const face=boardFace(board.root),backing=board.root.getObjectByName('ticket-hide-backing');assert.ok(backing);
 assert.equal(face.material.transparent,true);assert.ok(face.material.alphaTest>0);
 const source=svgSource(face.texture);
 assert.ok(source.includes('clip-path="url(#ticket-wall-hide-clip)"'));assert.equal(source.includes('paper-wash'),false);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1));
 assert.ok(ray.intersectObject(backing).length>0,'hide supports its inked centre');
 for(const [x,y] of [[-1.89,.94],[1.89,.94],[1.89,-.94],[-1.89,-.94]]){
  ray.ray.origin.set(x,y,1);assert.equal(ray.intersectObject(backing).length,0,'cut corners reveal the wall');
 }
 const first=source;await board.update(snapshot);await board.update(null);
 assert.equal(svgSource(face.texture),first,'texture stays stable between ticket changes');board.dispose();
});
test('superseded and disposed parchment updates cannot publish a stale sheet',async t=>{
 dom(t);const board=createTicketBoard(),face=boardFace(board.root);
 const first=board.update({...snapshot,swordName:'旧剑'}),latest=board.update({...snapshot,swordName:'新剑'});
 assert.equal(await first,false);assert.equal(await latest,true);assert.ok(svgSource(face.texture).includes('新剑'));assert.equal(svgSource(face.texture).includes('旧剑'),false);
 const pending=board.update(null);board.dispose();assert.equal(await pending,false);assert.equal(await board.update(snapshot),false);
});
test('disposal releases every owned texture, geometry and material exactly once',async t=>{dom(t);const board=createTicketBoard(),assets=new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();board.root.traverse(node=>{if(!(isMeshObject(node)))return;assets.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){assets.add(material);if((material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) && material.map)assets.add(material.map);}});const disposed=new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();for(const asset of assets)asset.addEventListener('dispose',()=>{assert.equal(disposed.has(asset),false);disposed.add(asset);});board.dispose();board.dispose();assert.equal(disposed.size,assets.size);assert.equal(await board.update(snapshot),false);assert.equal(board.root.children.length,0);});
