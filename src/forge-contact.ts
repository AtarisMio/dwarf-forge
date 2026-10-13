import * as THREE from 'three';
import {renderData,heatData,isMeshObject,isInstancedObject} from './workshop-types.ts';

// The procedural sword contract puts the blade along local +X, beyond the
// crossguard at -.6. Raycast the solid visual, never its broad pickup volume.
export function findForgeContact(root:THREE.Object3D|null|undefined,{preferredPoint=new THREE.Vector3(.125,0,0),bladeMaterials=null}:{preferredPoint?:THREE.Vector3;bladeMaterials?:THREE.Material[]|null}={}){
  if(!root)return null;
  root.updateWorldMatrix(true,true);
  const visual=renderData(root).visual??root,allowed=bladeMaterials?new Set(bladeMaterials):null;
  const inverse=root.matrixWorld.clone().invert(),meshes:THREE.Mesh[]=[],bounds=new THREE.Box3();
  visual.traverse(mesh=>{
    if(!isMeshObject(mesh)||renderData(mesh).swordId)return;
    for(let node:THREE.Object3D|null=mesh;node;node=node.parent){
      if(!node.visible||renderData(node).motion==='satellite'||renderData(node).motion==='ring')return;
      if(node===visual)break;
    }
    const materials=[mesh.material].flat();
    if(!materials.some(material=>{
      if(!material?.visible||material.opacity<.99||material.colorWrite===false)return false;
      if(allowed)return allowed.has(material);
      // Glow rings, leaves and runes are visual effects above the body. Heat
      // emission is separate metadata and must not make hot steel ineligible.
      const base=heatData(material).baseEmission;
      return heatData(material).respondsToHeat||!base||base.getHex()===0;
    }))return;
    const geometry=mesh.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
    const localBounds=geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
    if(localBounds.max.x<=-.5)return; // handle, collars, pommel and crossguard
    meshes.push(mesh);bounds.expandByObject(mesh);
  });
  if(!meshes.length)return null;
  const offsets=[0,.04,-.04,.08,-.08,.12,-.12,.16,-.16];
  const samples=offsets.flatMap(x=>offsets.map(z=>({x,z,distance:x*x+z*z}))).sort((a,b)=>a.distance-b.distance);
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(const sample of samples){
    const target=preferredPoint.clone().add(new THREE.Vector3(sample.x,0,sample.z)).applyMatrix4(root.matrixWorld);
    ray.set(new THREE.Vector3(target.x,bounds.max.y+.1,target.z),down);ray.far=bounds.max.y-bounds.min.y+.2;
    const hit=ray.intersectObjects(meshes,false)[0];if(!hit)continue;
    const localPoint=hit.point.clone().applyMatrix4(inverse);if(localPoint.x<=-.5)continue;
    const normalMatrix=hit.object.matrixWorld.clone();
    if(hit.instanceId!==undefined && isInstancedObject(hit.object)){const instance=new THREE.Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);normalMatrix.multiply(instance);}
    const normal=(hit.face?.normal??new THREE.Vector3(0,1,0)).clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(normalMatrix));
    return {position:hit.point.clone(),localPoint,normal,mesh:hit.object};
  }
  return null;
}
