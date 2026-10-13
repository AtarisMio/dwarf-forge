import * as THREE from 'three';
import {createVectorPanel, svgText} from './vector-panels.js';
import {ticketRows, ticketRowGlyphs} from './ticket-glyphs.js';

const ink='#59462c';
function boardArt(snapshot){
  const rows=ticketRows(snapshot),total=rows.reduce((sum,row)=>sum+row.total,0);
  let body='<defs><linearGradient id="paper-wash" x2="1" y2="1"><stop stop-color="#ead8ae"/><stop offset=".53" stop-color="#e3cea0"/><stop offset="1" stop-color="#dac293"/></linearGradient></defs>';
  body+='<rect width="1600" height="800" fill="url(#paper-wash)"/><path d="M28 23Q650 7 1570 24M30 777Q780 790 1573 775" fill="none" stroke="#8b7044" stroke-opacity=".15" stroke-width="4"/>';
  body+=svgText('抽签票',68,49,{size:34,color:ink,anchor:'start',weight:400});
  body+=svgText(snapshot?.active?snapshot.swordName??'铁砧上的剑':'铁砧未放剑',1518,49,{size:25,color:'#826c49',anchor:'end',weight:400});
  rows.forEach((row,index)=>{
    const y=103+index*104;
    body+=svgText(row.label,68,y+25,{size:40,color:ink,anchor:'start',weight:400});
    body+=ticketRowGlyphs(row,{id:row.id,x:310,y,width:1050,height:50,size:26});
    body+=svgText(row.total,1518,y+25,{size:32,color:ink,anchor:'end',weight:400});
    if(row.mechanicAdded){
      body+=svgText('机制',253,y+66,{size:18,color:'#6c7146',anchor:'start',weight:400});
      body+=ticketRowGlyphs(row,{id:row.id,part:'mechanic',x:310,y:y+53,width:1050,height:28,size:20});
    }
  });
  body+='<path d="M68 652Q800 657 1518 653" fill="none" stroke="#7a6442" stroke-width="2"/>';
  body+=svgText(`共 ${total} 张`,68,693,{size:33,color:ink,anchor:'start',weight:400});
  body+=svgText('强化风险体现在铁砧牌上',68,748,{size:25,color:'#8b7451',anchor:'start',weight:400});
  return body;
}

// Origin at board centre, front faces +Z. Scene integration owns placement/rotation.
export function createTicketBoard({anisotropy=1}={}){
  const root=new THREE.Group();root.name='draw-ticket-board';
  const geometries=new Set(),materials=new Set();let disposed=false;
  const paper=new THREE.MeshStandardMaterial({color:0xc3a977,roughness:1}),nail=new THREE.MeshStandardMaterial({color:0x514837,metalness:.7,roughness:.7});materials.add(paper);materials.add(nail);
  function box(width,height,depth,x,y,z,material){const geometry=new THREE.BoxGeometry(width,height,depth);geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);root.add(mesh);return mesh;}
  box(3.8,1.9,.012,0,0,0,paper);
  const nailGeometry=new THREE.SphereGeometry(.018,6,4);geometries.add(nailGeometry);
  for(const x of [-1.73,1.73]){const mesh=new THREE.Mesh(nailGeometry,nail);mesh.position.set(x,.83,.026);mesh.scale.z=.4;root.add(mesh);}
  const panel=createVectorPanel({width:1600,height:800,resolution:3072,anisotropy});
  const material=new THREE.MeshBasicMaterial({map:panel.texture,toneMapped:false});materials.add(material);
  const geometry=new THREE.PlaneGeometry(3.8,1.9);geometries.add(geometry);
  const face=new THREE.Mesh(geometry,material);face.name='ticket-board-face';face.position.z=.007;root.add(face);
  function update(snapshot){return disposed?Promise.resolve(false):panel.update(boardArt(snapshot));}
  update(null);
  function dispose(){if(disposed)return;disposed=true;panel.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();geometries.clear();materials.clear();root.removeFromParent();root.clear();}
  return {root,update,dispose};
}
