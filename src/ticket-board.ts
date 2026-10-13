import * as THREE from 'three';
import {createVectorPanel, svgText} from './vector-panels.ts';
import {ticketRows, ticketRowGlyphs} from './ticket-glyphs.ts';
import {parchmentSurface, hideContour} from './parchment.ts';

const ink='#59462c';
const hideSurface=parchmentSurface(1600,800,'ticket-wall-hide');
export type TicketBoardSnapshot=(NonNullable<Parameters<typeof ticketRows>[0]>&{swordName?:string|null;temporary?:readonly {id:string;label:string}[]})|null|undefined;
function boardArt(snapshot:TicketBoardSnapshot){
  const rows=ticketRows(snapshot),total=rows.reduce((sum,row)=>sum+row.total,0);
  const left=140,right=1460;
  let body=hideSurface;
  body+=svgText('抽签票',left,92,{size:34,color:ink,anchor:'start',weight:400});
  body+=svgText(snapshot?.active?snapshot.swordName??'铁砧上的剑':'铁砧未放剑',right,92,{size:25,color:'#826c49',anchor:'end',weight:400});
  rows.forEach((row,index)=>{
    const y=140+index*90;
    body+=svgText(row.label,left,y+25,{size:40,color:ink,anchor:'start',weight:400});
    body+=ticketRowGlyphs(row,{id:row.id,x:375,y,width:970,height:50,size:26});
    body+=svgText(row.total,right,y+25,{size:32,color:ink,anchor:'end',weight:400});
    if(row.mechanicAdded){
      body+=svgText('机制',318,y+66,{size:18,color:'#6c7146',anchor:'start',weight:400});
      body+=ticketRowGlyphs(row,{id:row.id,part:'mechanic',x:375,y:y+53,width:970,height:28,size:20});
    }
  });
  body+=`<path d="M${left} 620Q800 625 ${right} 620" fill="none" stroke="#7a6442" stroke-width="2"/>`;
  body+=svgText(`共 ${total} 张`,left,663,{size:33,color:ink,anchor:'start',weight:400});
  body+=svgText('强化风险体现在铁砧牌上',left,713,{size:25,color:'#71573a',anchor:'start',weight:400});
  return body;
}

// Origin at board centre, front faces +Z. Scene integration owns placement/rotation.
export function createTicketBoard({anisotropy=1}={}){
  const root=new THREE.Group();root.name='draw-ticket-board';
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();let disposed=false;
  const paper=new THREE.MeshStandardMaterial({color:0xa78350,roughness:1}),nail=new THREE.MeshStandardMaterial({color:0x514837,metalness:.7,roughness:.7});materials.add(paper);materials.add(nail);
  const outline=hideContour(),shape=new THREE.Shape(),world=([x,y]:readonly number[]):[number,number]=>[(x-.5)*3.8,(.5-y)*1.9];
  shape.moveTo(...world(outline[0]));
  for(const point of outline.slice(1))shape.lineTo(...world(point));
  shape.closePath();
  const backingGeometry=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false,curveSegments:3});geometries.add(backingGeometry);
  const backing=new THREE.Mesh(backingGeometry,paper);backing.name='ticket-hide-backing';backing.position.z=-.006;root.add(backing);
  const nailGeometry=new THREE.SphereGeometry(.018,6,4);geometries.add(nailGeometry);
  for(const x of [-1.73,1.73]){const mesh=new THREE.Mesh(nailGeometry,nail);mesh.position.set(x,.83,.026);mesh.scale.z=.4;root.add(mesh);}
  const panel=createVectorPanel({width:1600,height:800,resolution:3072,anisotropy});
  const material=new THREE.MeshBasicMaterial({map:panel.texture,toneMapped:false,transparent:true,alphaTest:.15});materials.add(material);
  const geometry=new THREE.PlaneGeometry(3.8,1.9);geometries.add(geometry);
  const face=new THREE.Mesh(geometry,material);face.name='ticket-board-face';face.position.z=.007;root.add(face);
  function update(snapshot:TicketBoardSnapshot){return disposed?Promise.resolve(false):panel.update(boardArt(snapshot));}
  update(null);
  function dispose(){if(disposed)return;disposed=true;panel.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();geometries.clear();materials.clear();root.removeFromParent();root.clear();}
  return {root,update,dispose};
}
