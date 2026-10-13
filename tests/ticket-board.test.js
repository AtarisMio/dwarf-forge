import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTicketBoard} from '../src/ticket-board.js';
function dom(t){const oldDocument=globalThis.document,oldImage=globalThis.Image;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){}})})};globalThis.Image=class{set src(value){queueMicrotask(()=>this.onload?.());}};t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;});}
const snapshot={active:true,swordName:'还算好用的铁剑',rows:[{id:'success',label:'成功',base:12,added:4,relicAdded:1,mechanicAdded:3,removed:2,total:14}],temporary:[{id:'blind',label:'盲骰：下一锤大成功 +3 票'}]};
test('parchment shows gross tickets with crossed removals and an independent mechanic subrow',async t=>{
 dom(t);const board=createTicketBoard({anisotropy:4});assert.ok(board.root instanceof THREE.Group);assert.deepEqual(board.root.position.toArray(),[0,0,0]);
 const size=new THREE.Box3().setFromObject(board.root).getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-3.8)<.01);assert.ok(Math.abs(size.y-1.9)<.01);
 await board.update(snapshot);const face=board.root.getObjectByName('ticket-board-face'),source=face.material.map.userData.svgSource;assert.equal(face.material.map.anisotropy,4);
 assert.ok(source.includes('#ead8ae'),'cream paper');assert.match(source,/data-ticket-group="success-base" data-count="12" data-removed="2" data-live="10"/);
 assert.match(source,/data-ticket-group="success-relicAdded" data-count="1" data-removed="0" data-live="1"/);
 assert.match(source,/data-ticket-group="success-mechanicAdded" data-count="3" data-removed="0" data-live="3"/);
 assert.ok(source.includes('共 32 张'));assert.ok(source.includes('强化风险体现在铁砧牌上'));assert.ok(source.includes('机制'));
 for(const oldHeading of ['DRAW TICKETS','遗物加票','机制加票','移除','基准','当前','盲骰'])assert.equal(source.includes(oldHeading),false,oldHeading);
 assert.equal(source.includes('success-removed'),false,'no duplicate removed pool');assert.equal(source.includes('%'),false);board.dispose();
});
test('updates preserve texture dimensions, escape dynamic text and allocate no new meshes',async t=>{dom(t);const board=createTicketBoard(),face=board.root.getObjectByName('ticket-board-face'),texture=face.material.map,size=[texture.image.width,texture.image.height],children=board.root.children.length;await board.update({...snapshot,swordName:'<script>&'});assert.ok(texture.userData.svgSource.includes('&lt;script&gt;&amp;'));await board.update(null);assert.ok(texture.userData.svgSource.includes('铁砧未放剑'));assert.equal(board.root.children.length,children);assert.deepEqual([texture.image.width,texture.image.height],size);board.dispose();});
test('superseded and disposed parchment updates cannot publish a stale sheet',async t=>{
 dom(t);const board=createTicketBoard(),face=board.root.getObjectByName('ticket-board-face');
 const first=board.update({...snapshot,swordName:'旧剑'}),latest=board.update({...snapshot,swordName:'新剑'});
 assert.equal(await first,false);assert.equal(await latest,true);assert.ok(face.material.map.userData.svgSource.includes('新剑'));assert.equal(face.material.map.userData.svgSource.includes('旧剑'),false);
 const pending=board.update(null);board.dispose();assert.equal(await pending,false);assert.equal(await board.update(snapshot),false);
});
test('disposal releases every owned texture, geometry and material exactly once',async t=>{dom(t);const board=createTicketBoard(),assets=new Set();board.root.traverse(node=>{if(node.geometry)assets.add(node.geometry);for(const material of [node.material].flat().filter(Boolean)){assets.add(material);if(material.map)assets.add(material.map);}});const disposed=new Set();for(const asset of assets)asset.addEventListener('dispose',()=>{assert.equal(disposed.has(asset),false);disposed.add(asset);});board.dispose();board.dispose();assert.equal(disposed.size,assets.size);assert.equal(await board.update(snapshot),false);assert.equal(board.root.children.length,0);});
