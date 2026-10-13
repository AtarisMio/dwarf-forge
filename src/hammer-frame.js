import * as THREE from 'three';

// Rendered head assembly and its polished striking cap share this frame.
export const HAMMER_HEAD={position:[-.058,.405,0],roll:.12,scale:.58};
const headRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),HAMMER_HEAD.roll);
// All shaft parts share the head eye's axis. Independent tilt signs used to
// put the wooden handle through the peen and leave its collar floating aside.
const shaftPart=distance=>({position:new THREE.Vector3(0,distance,0).applyQuaternion(headRotation).add(new THREE.Vector3(...HAMMER_HEAD.position)).toArray(),roll:HAMMER_HEAD.roll});
export const HAMMER_HANDLE={...shaftPart(-.8),length:.87};
export const HAMMER_COLLAR=shaftPart(-.1);
export const HAMMER_LEATHER=shaftPart(-.75);
export const HAMMER_FACE=new THREE.Vector3(-.285,0,0).multiplyScalar(HAMMER_HEAD.scale).applyQuaternion(headRotation).add(new THREE.Vector3(...HAMMER_HEAD.position));
export const HAMMER_FACE_NORMAL=new THREE.Vector3(-1,0,0).applyQuaternion(headRotation);
export const HAMMER_GRIP=new THREE.Vector3(.055,-.205,.067);
export const HAMMER_WRIST=new THREE.Vector3(.067,-.27,.065);
const headBoxes=[
  {center:[-.01,0,0],size:[.36,.235,.245],radius:.044},
  {center:[-.22,0,0],size:[.13,.22,.232],radius:.032},
  {center:[.205,0,0],size:[.15,.14,.175],radius:.042},
  // Conservative envelope around the rounded cross-peen.
  {center:[.298,0,0],size:[.216,.178,.20],radius:0},
  {center:[0,.125,0],size:[.12,.014,.095],radius:.0046667},
  {center:[-.01,-.115,0],size:[.125,.025,.21],radius:.0083333}
];

// Support of each rounded box along world Y, including rotation and bevels.
export function hammerHeadMinimumY(quaternion,scale){
  const q=quaternion.clone().multiply(headRotation),axis=new THREE.Vector3(0,1,0).applyQuaternion(q.clone().invert());
  const offset=new THREE.Vector3(...HAMMER_HEAD.position).applyQuaternion(quaternion).y;
  return scale*(offset+HAMMER_HEAD.scale*Math.min(...headBoxes.map(({center,size,radius})=>{
    const extent=axis.toArray().reduce((sum,value,i)=>sum+Math.abs(value)*(size[i]/2-radius),radius);
    return new THREE.Vector3(...center).dot(axis)-extent;
  })));
}
