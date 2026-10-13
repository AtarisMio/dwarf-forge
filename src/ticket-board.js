import * as THREE from 'three';
import {createVectorPanel, svgText} from './vector-panels.js';
import {ticketSquares, ticketEffectLabel} from './ticket-glyphs.js';

const CATEGORIES = [
  {id:'break',label:'碎裂',base:9}, {id:'damage',label:'损伤',base:2},
  {id:'hold',label:'保持',base:5}, {id:'success',label:'成功',base:12},
  {id:'great',label:'大成功',base:2}
];
const ink='#d8d0b5', brass='#cbb578', green='#92b59b';
const safeNumber=value=>Number.isFinite(value)&&value>=0?value:0;
function boardArt(snapshot){
  const active=!!snapshot?.active;
  let body='<rect width="1600" height="765" fill="#151d19"/><rect x="14" y="14" width="1572" height="737" rx="3" fill="none" stroke="#83764e" stroke-width="3"/>';
  body+=svgText('DRAW TICKETS',800,47,{size:26,color:brass,weight:500})+svgText('抽签票数',800,93,{size:48,color:ink});
  body+=svgText(active?snapshot.swordName??'当前铁砧剑':'铁砧未放剑',800,143,{size:29,color:'#b0b4a1',weight:400});
  for(const [text,x] of [['结果',180],['基准',450],['遗物加票',660],['机制加票',875],['移除',1090],['当前',1390]])body+=svgText(text,x,201,{size:29,color:brass});
  CATEGORIES.forEach((category,index)=>{
    const row=active?snapshot.rows?.find(r=>r.id===category.id):null,y=257+index*70;
    const base=row?safeNumber(row.base):category.base,relicAdded=row?safeNumber(row.relicAdded??row.added):0,mechanicAdded=row?safeNumber(row.mechanicAdded):0,removed=row?safeNumber(row.removed):0,total=row?safeNumber(row.total):base;
    body+=`<path d="M60 ${y+35}H1540" stroke="#4b5140" stroke-width="1"/>`;
    body+=svgText(category.label,180,y,{size:40,color:ink});
    for(const [field,value,center,width,mode] of [['base',base,450,170,'base'],['relicAdded',relicAdded,660,188,'added'],['mechanicAdded',mechanicAdded,875,188,'mechanic'],['removed',removed,1090,188,'removed'],['total',total,1390,232,'total']]){
      body+=ticketSquares(value,{id:`${category.id}-${field}`,x:center-width/2,y:y-28,width,height:56,mode});
    }
  });
  body+=svgText('一格一票 · 蓝色为机制加票 · 划销表示移除',800,621,{size:26,color:'#aaae99',weight:400});
  const notes=active?(snapshot.temporary??[]).map(effect=>ticketEffectLabel(effect.label)).join(' · '):'将剑放到铁砧，查看该剑的加票、移票与下一锤效果';
  // SVG wrapping is explicit to preserve Chinese spacing across browser fonts.
  const lines=Array.from(notes.matchAll(/.{1,53}/gu),match=>match[0]);
  lines.slice(0,4).forEach((line,index)=>{body+=svgText(line,800,660+index*26,{size:24,color:index===0?green:'#b0b4a1',weight:400});});
  return body;
}

// Origin at board centre, front faces +Z. Scene integration owns placement/rotation.
export function createTicketBoard({anisotropy=1}={}){
  const root=new THREE.Group();root.name='draw-ticket-board';
  const geometries=new Set(),materials=new Set();let disposed=false;
  const wood=new THREE.MeshStandardMaterial({color:0x222920,roughness:.93}),frame=new THREE.MeshStandardMaterial({color:0x9b824e,metalness:.62,roughness:.45});materials.add(wood);materials.add(frame);
  function box(width,height,depth,x,y,z,material){const geometry=new THREE.BoxGeometry(width,height,depth);geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);root.add(mesh);return mesh;}
  box(3.8,1.9,.09,0,0,0,wood);
  box(3.8,.055,.045,0,.9225,.055,frame);box(3.8,.055,.045,0,-.9225,.055,frame);
  box(.055,1.79,.045,-1.8725,0,.055,frame);box(.055,1.79,.045,1.8725,0,.055,frame);
  const panel=createVectorPanel({width:1600,height:765,resolution:3072,anisotropy});
  const material=new THREE.MeshBasicMaterial({map:panel.texture,toneMapped:false});materials.add(material);
  const geometry=new THREE.PlaneGeometry(3.64,1.740375);geometries.add(geometry);
  const face=new THREE.Mesh(geometry,material);face.name='ticket-board-face';face.position.z=.06;root.add(face);
  function update(snapshot){return disposed?Promise.resolve(false):panel.update(boardArt(snapshot));}
  update(null);
  function dispose(){if(disposed)return;disposed=true;panel.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();geometries.clear();materials.clear();root.removeFromParent();root.clear();}
  return {root,update,dispose};
}
