import * as THREE from 'three';
import {HeatMaterial,SwordRoot,renderData,isMeshObject,isInstancedObject} from './workshop-types.ts';
import type {SwordRenderInput,SwordForm} from './workshop-types.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getSwordForm } from './sword-evolution.ts';

// Original procedural interpretations of the published sword families. The
// exact hidden +0–20 meshes are unavailable; these are distinct evolving views.
export function createSwordRenderer({ metalTexture = null, leatherTexture = null, woodTexture = null }:{metalTexture?:THREE.Texture|null;leatherTexture?:THREE.Texture|null;woodTexture?:THREE.Texture|null} = {}) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<HeatMaterial>(), templates = new Map<string,THREE.Group>(), instances = new Set<SwordRoot>();
  let elapsed = 0;
  const ownGeometry = <G extends THREE.BufferGeometry>(g:G) => (geometries.add(g), g);
  const mat = (options:THREE.MeshStandardMaterialParameters) => { const m = new HeatMaterial(options); materials.add(m); return m; };
  const steel = mat({ color: '#b5c6c9', map: metalTexture, metalness: .88, roughness: .32, emissiveIntensity: 0 });
  const darkSteel = mat({ color: '#45535a', map: metalTexture, metalness: .84, roughness: .48, emissiveIntensity: 0 });
  const gold = mat({ color: '#c3a35d', metalness: .78, roughness: .35 });
  const bone = mat({ color: '#c9bc92', metalness: .14, roughness: .62 });
  const bark = mat({ color: '#61724c', map: woodTexture, roughness: .88 });
  const flesh = mat({ color: '#953e42', roughness: .5, metalness: .12 });
  const leaf = mat({ color: '#70b693', emissive: '#1b563f', emissiveIntensity: .23, roughness: .6 });
  const leather = mat({ color: '#77503e', map: leatherTexture, roughness: .84 });
  const glow = mat({ color: '#afd7da', emissive: '#4cabb8', emissiveIntensity: .65, metalness: .32, roughness: .3 });
  const violet = mat({ color: '#c1addd', emissive: '#7940b7', emissiveIntensity: .5, metalness: .55, roughness: .28 });
  const rust = mat({ color: '#80513b', map: metalTexture, metalness: .55, roughness: .83, emissiveIntensity: 0 });
  const heatMaterials = new Set([steel, darkSteel, rust]);
  const sphere = ownGeometry(new THREE.SphereGeometry(1, 14, 10));
  const ring = ownGeometry(new THREE.TorusGeometry(.038, .012, 6, 12));
  const boxCache = new Map<string,RoundedBoxGeometry>();
  function box(parent:THREE.Object3D, material:HeatMaterial, x:number, y:number, z:number, sx:number, sy:number, sz:number, rotation = 0) {
    const key = [sx, sy, sz].join('/'); let g = boxCache.get(key);
    if (!g) { g = ownGeometry(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(.018, sx / 4, sy / 4, sz / 4))); boxCache.set(key, g); }
    const m = new THREE.Mesh(g, material); m.position.set(x, y, z); m.rotation.y = rotation; parent.add(m); return m;
  }
  function ball(parent:THREE.Object3D, material:HeatMaterial, x:number, y:number, z:number, sx:number, sy = sx, sz = sx) { const m = new THREE.Mesh(sphere, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; }
  function shape(parent:THREE.Object3D, points:readonly (readonly [number,number])[], material:HeatMaterial, depth = .035) {
    const s = new THREE.Shape(); points.forEach(([x, z], i) => i ? s.lineTo(x, z) : s.moveTo(x, z)); s.closePath();
    const g = ownGeometry(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .012, bevelThickness: .009, bevelSegments: 2, curveSegments: 10 }));
    const mesh = new THREE.Mesh(g, material); mesh.rotation.x = -Math.PI / 2; parent.add(mesh); return mesh;
  }
  function tube(parent:THREE.Object3D, points:readonly (readonly [number,number,number])[], radius:number, material:HeatMaterial, segments = 32) { const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); const m = new THREE.Mesh(ownGeometry(new THREE.TubeGeometry(curve, segments, radius, 8, false)), material); parent.add(m); return { mesh: m, curve }; }
  function facetedBlade(parent:THREE.Object3D, length:number, width:number, material = steel) {
    const sections:[number,number][] = [[-.56, width], [-.43, width], [.72, width * .8], [length, .001]];
    const cross:[number,number][] = [[-1,0],[-.72,.025],[-.3,.043],[-.17,.025],[0,.022],[.17,.025],[.3,.043],[.72,.025],[1,0],[.6,-.014],[0,-.021],[-.6,-.014]], positions:number[] = [], uv:number[] = [];
    const point = (s:number, c:number):[number,number,number] => [sections[s][0], cross[c][1] * Math.min(1, sections[s][1] / .07), cross[c][0] * sections[s][1]];
    for (let s = 0; s < sections.length - 1; s++) for (let c = 0; c < cross.length; c++) {
      const n = (c + 1) % cross.length, a = point(s,c), b = point(s+1,c), d = point(s,n), e = point(s+1,n);
      for (const p of [a,e,b,a,d,e]) { positions.push(...p); uv.push((p[0]+.56)/(length+.56),(p[2]+width)/(width*2)); }
    }
    const g = ownGeometry(new THREE.BufferGeometry()); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); parent.add(new THREE.Mesh(g,material));
  }
  function handle(parent:THREE.Object3D, stage:number, family:SwordForm['family']) {
    const g = ownGeometry(new THREE.LatheGeometry([[.048, 0], [.062, .04], [.057, .22], [.061, .38], [.045, .44]].map(([x,y]) => new THREE.Vector2(x,y)), 18));
    const grip = new THREE.Mesh(g, leather); grip.rotation.z = -Math.PI / 2; grip.position.set(-1.14, .015, 0); parent.add(grip);
    for (const x of [-1.14, -.71]) { const collar = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(.065, .065, .028, 18)), gold); collar.rotation.z = Math.PI / 2; collar.position.set(x, .015, 0); parent.add(collar); }
    ball(parent, family === 'funerary' ? bone : gold, -1.2, .02, 0, .086, .047, .083);
    if (stage) ball(parent, glow, -1.2, .064, 0, .042, .022, .04);
    shape(parent, [[-.7, -.25], [-.64, -.29], [-.59, -.19], [-.58, .19], [-.64, .29], [-.7, .25], [-.665, .1], [-.665, -.1]], family === 'funerary' ? darkSteel : gold, .055);
  }
  // Blades lie along X, their broad face along XZ, with real bevels in Y.
  // Template geometry is shared; each visible instance owns its heat materials.
  function teeth(parent:THREE.Object3D, count:number, from:number, to:number, width:number, height:number, material = steel, both = false) {
    for (let i = 0; i < count; i++) {
      const x = from + (to - from) * i / count, step = (to - from) / count;
      for (const side of both ? [-1, 1] : [1]) shape(parent, [[x, side * width], [x + step * .28, side * (width + height)], [x + step * .78, side * width]], material, .025);
    }
  }
  function energyRing(parent:THREE.Object3D, x:number, radius:number, material = glow, phase = 0) {
    const mesh = new THREE.Mesh(ownGeometry(new THREE.TorusGeometry(radius, .009, 5, 32)), material);
    mesh.position.set(x, .09, 0); mesh.rotation.set(Math.PI / 2, .5, .15 + phase); mesh.scale.set(1.7, 1, 1);
    renderData(mesh).motion = 'ring'; renderData(mesh).phase = phase; parent.add(mesh); return mesh;
  }
  function gear(parent:THREE.Object3D, x:number, z:number, radius:number, count = 12) {
    const points:[number,number][] = [];
    for (let i = 0; i < count * 4; i++) { const a = i / (count * 4) * Math.PI * 2, r = radius * (i % 4 < 2 ? 1 : .78); points.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    const disk = shape(parent, points, darkSteel, .045); disk.position.y = .055;
    const hub = ball(parent, gold, x, .12, z, radius * .3, .026); return { disk, hub };
  }
  function runeMarks(parent:THREE.Object3D, count:number, from = -.35, to = .95, material = glow) {
    for (let i = 0; i < count; i++) { const x = from + i * (to - from) / Math.max(1, count - 1); const m = shape(parent, [[x - .034, 0], [x, -.045], [x + .034, 0], [x, .045]], material, .006); m.position.y = .065; }
  }
  function wings(parent:THREE.Object3D, x:number, span:number, material:HeatMaterial, feathers = 3) {
    for (const side of [-1, 1]) for (let i = 0; i < feathers; i++) {
      const z = side * (.08 + i * span / feathers);
      shape(parent, [[x, z], [x + .12 + i * .018, z + side * .12], [x + .3 + i * .025, z + side * .06], [x + .14, z - side * .045]], material, .028);
    }
  }
  function segmentedBlade(parent:THREE.Object3D, count:number, length = 1.25, width = .15) {
    const gap = .046, from = -.54, span = (length - .23 - from) / count;
    for (let i = 0; i < count; i++) {
      const x = from + i * span;
      shape(parent, [[x, -width], [x + span - gap, -width], [x + span - gap, width], [x, width]], steel, .045);
      for (const z of [-width * .5, width * .5]) box(parent, gold, x + (span - gap) / 2, .061, z, span - gap - .04, .008, .011);
    }
    shape(parent, [[length - .21, -width], [length + .05, 0], [length - .21, width]], steel, .042);
  }
  function satellite(parent:THREE.Object3D, x:number, y:number, z:number, scale:number, phase:number) {
    const small = new THREE.Group(); facetedBlade(small, 1.15, .09); handle(small, 0, 'basic');
    small.scale.setScalar(scale); small.position.set(x, y, z); renderData(small).motion = 'satellite'; renderData(small).phase = phase; renderData(small).baseY = y; parent.add(small);
  }
  function fish(parent:THREE.Object3D, x:number, size:number, cooked = false) {
    const body = shape(parent, [[x - size * .8, 0], [x - size * .42, -size * .32], [x + size * .38, -size * .25], [x + size * .78, 0], [x + size * .38, size * .25], [x - size * .42, size * .32]], cooked ? rust : steel, size * .13);
    shape(parent, [[x - size * .75, 0], [x - size * 1.05, -size * .27], [x - size * 1.05, size * .27]], darkSteel, .025);
    shape(parent, [[x - .1, -size * .22], [x + .05, -size * .48], [x + .2, -size * .22]], cooked ? rust : darkSteel, .02);
    ball(parent, darkSteel, x + size * .47, size * .17, -size * .08, .022, .012);
    if (cooked) for (let i = 0; i < 3; i++) box(parent, darkSteel, x - size * .22 + i * .14, .09, 0, .027, .008, size * .45, -.28);
    return body;
  }
  function grave(parent:THREE.Object3D, x:number, z:number, size:number, material = darkSteel) {
    const m = shape(parent, [[x - size * .3, z - size * .4], [x + size * .27, z - size * .4], [x + size * .3, z + size * .25], [x + size * .18, z + size * .43], [x - size * .15, z + size * .46], [x - size * .3, z + size * .28]], material, .06);
    box(parent, bone, x, .085, z, size * .12, .008, size * .45); box(parent, bone, x, .085, z + size * .08, size * .32, .008, size * .08); return m;
  }
  function template(family:SwordForm['family'], stage:number) {
    const cacheKey = `${family}/${stage}`; if (templates.has(cacheKey)) return templates.get(cacheKey)!;
    const root = new THREE.Group(), late = Math.max(0, stage - 5);
    handle(root, stage, family);
    if (family === 'basic') {
      if (!stage) shape(root, [[-.56,-.074],[.42,-.075],[.5,-.036],[.63,-.07],[.93,-.04],[1.06,0],[.92,.065],[.31,.072],[.24,.034],[.15,.078],[-.56,.08]], darkSteel, .035);
      else { facetedBlade(root, stage === 1 ? 1.11 : 1.23, stage === 1 ? .083 : .105); box(root, darkSteel, .11, .028, 0, 1.21, .007, .019); }
      if (stage === 2) { box(root, steel, -.48, .043, 0, .15, .02, .17); for (const z of [-.18,.18]) box(root, darkSteel, -.65, .045, z, .07,.025,.07); }
    } else if (family === 'heavy') {
      if (stage === 3) { facetedBlade(root, 1.18, .17, darkSteel); box(root, steel, .25,.055,0,1.45,.05,.07); }
      else { shape(root, [[-.56,-.25],[1.08,-.25],[1.3,-.15],[1.3,.15],[1.08,.25],[-.56,.25]], darkSteel,.09); for(const x of [-.37,.15,.72])box(root,steel,x,.11,0,.09,.025,.43); for(const z of [-.18,.18])box(root,steel,.27,.112,z,1.5,.021,.034); }
    } else if (family === 'serrated') {
      if (stage === 3) { shape(root,[[-.56,-.12],[.82,-.12],[1.19,-.03],[.84,.14],[-.56,.14]],darkSteel,.06); teeth(root,5,-.4,.87,.13,.105); }
      else { shape(root,[[-.56,-.12],[1.21,-.12],[1.3,0],[1.07,.13],[-.56,.13]],steel,.05); teeth(root,9,-.48,1.11,.13,.15); teeth(root,5,-.25,.93,.12,.07,darkSteel,true); box(root,darkSteel,.22,.06,0,1.5,.022,.046); }
    } else if (family === 'arcane') {
      if (stage === 3) { shape(root,[[-.56,-.08],[-.23,-.17],[.3,-.09],[.48,-.14],[1.22,0],[.45,.14],[.08,.095],[-.3,.17],[-.56,.08]],steel,.05); runeMarks(root,3); }
      else { facetedBlade(root,1.26,.145); runeMarks(root,5); for(let i=0;i<3;i++)energyRing(root,-.22+i*.47,.18,glow,i*.7); }
    } else if (family === 'splitblade') {
      const counts = [2,3,5,6,7,8]; segmentedBlade(root,counts[late],1.21 + late*.035,.14 + late*.006);
      // The reference uses a conventional crossguard below detached blade plates.
      box(root,gold,-.64,.06,0,.075,.055,.62);
      if (late >= 2) satellite(root,.3,.25,0,.28,0);
      if (late >= 3) for(const side of [-1,1])satellite(root,.31,.16,side*.34,.22,side*1.5);
      if (late >= 4) for(const side of [-1,1])satellite(root,.72,.21,side*.47,.18,side*2.7);
      if (late === 5) { satellite(root,-.08,.3,0,.16,3.7); energyRing(root,.4,.38,violet); }
    } else if (family === 'citadel') {
      const width = [.22,.245,.29,.31,.34,.36][late];
      shape(root,[[-.56,-width],[1.12,-width],[1.34,-width*.55],[1.34,width*.55],[1.12,width],[-.56,width]],darkSteel,.09 + late*.006);
      for(const z of [-width*.78,width*.78])box(root,steel,.31,.12,z,1.6,.04,.04);
      for(let i=0;i<3+late;i++) { const x=-.43+i*1.62/(3+late); box(root,steel,x,.13,0,.085,.04,width*1.65); for(const z of [-width*.57,width*.57])ball(root,gold,x,.163,z,.016,.012); }
      if(late>=1)box(root,darkSteel,.34,.155,0,1.42,.045,width*.9);
      if(late>=2)for(const side of [-1,1])for(let i=0;i<3;i++)box(root,steel,.45+i*.27,.07,side*(width+.045),.15,.11,.1);
      if(late>=3)for(const x of [-.35,.3,.95]) { box(root,darkSteel,x,.21,0,.2,.13,.22); box(root,gold,x,.285,0,.12,.014,.1); }
      if(late>=4)wings(root,-.55,.3,darkSteel,3);
      if(late===5) { shape(root,[[.89,-.3],[1.36,-.43],[1.48,0],[1.36,.43],[.89,.3]],steel,.045); runeMarks(root,3,-.3,.7,gold); }
    } else if (family === 'holy') {
      facetedBlade(root,1.23+late*.036,.11+late*.007); box(root,gold,.13,.045,0,1.27,.012,.025);
      box(root,gold,-.65,.068,0,.072,.06,.55+late*.036);
      if(late>=1) { box(root,gold,-.28,.062,0,.036,.021,.22); box(root,gold,-.28,.062,0,.3,.021,.035); }
      if(late>=2)wings(root,-.63,.3+late*.015,gold,late-0);
      if(late>=3) { runeMarks(root,4,-.18,.82,gold); energyRing(root,-.55,.28,gold); }
      if(late>=4)for(const side of [-1,1])shape(root,[[-.42,side*.065],[.2,side*.095],[.42,side*.19],[.15,side*.14],[-.43,side*.11]],gold,.018);
      if(late===5) { energyRing(root,.5,.23,glow,.6); ball(root,glow,-.65,.12,0,.072,.035,.1); }
    } else if (family === 'sawblade') {
      const width=.115+late*.013; shape(root,[[-.56,-width],[1.22,-width],[1.34,0],[1.16,width],[-.56,width]],steel,.052);
      teeth(root,10+late*2,-.48,1.21,width,.08+late*.008,steel,late>=2);
      box(root,darkSteel,.2,.069,0,1.55,.028,.045);
      if(late>=1)gear(root,-.35,0,.16);
      if(late>=2)gear(root,.53,0,.17);
      if(late>=3) { gear(root,1.14,0,.24,16); for(const z of [-.065,.065])box(root,gold,.4,.143,z,1.5,.01,.017); }
      if(late>=4)for(const side of [-1,1])tube(root,[[-.38,.11,side*.15],[.12,.12,side*.23],[.89,.1,side*.18]],.022,darkSteel,14);
      if(late===5) { gear(root,.17,0,.31,18); teeth(root,4,-.45,.74,.24,.12,darkSteel,true); }
    } else if (family === 'dragonfang') {
      const material=late>=4?darkSteel:bone, bend=.11+late*.025;
      shape(root,[[-.56,-.11],[.03,-.13],[.73,-.2],[1.36,-bend-.19],[1.14,-.055],[.55,.12],[-.56,.12]],material,.065);
      teeth(root,5+late,-.44,1.12,.105,.09+late*.01,material);
      tube(root,[[-.51,.09,0],[.07,.09,-.02],[.78,.07,-.12],[1.24,.025,-bend-.1]],.024,late>=4?flesh:darkSteel,20);
      if(late>=1)for(let i=0;i<4;i++)shape(root,[[-.3+i*.27,-.12],[-.2+i*.27,-.2],[-.06+i*.27,-.11]],darkSteel,.025);
      if(late>=2)teeth(root,4,-.38,.61,.11,.14,darkSteel,true);
      if(late>=3)wings(root,-.62,.34,late>=4?flesh:darkSteel,3);
      if(late>=4)ball(root,flesh,-.48,.12,0,.095,.042,.065);
      if(late===5) { for(const side of [-1,1])tube(root,[[-.61,.08,side*.1],[-.92,.1,side*.27],[-.78,.11,side*.42]],.037,darkSteel,16); runeMarks(root,4,-.22,.8,violet); }
    } else if (family === 'runeblade') {
      if(late<3) { facetedBlade(root,1.26,.13+late*.018); runeMarks(root,4+late*2); }
      else segmentedBlade(root,late===3?3:late===4?4:6,1.35,.15);
      if(late>=1)for(const side of [-1,1])tube(root,[[-.5,.08,side*.12],[-.31,.08,side*.26],[.1,.08,side*.17]],.018,glow,12);
      if(late>=2)energyRing(root,.12,.25,violet);
      if(late>=3) { gear(root,-.35,0,.23,8); ball(root,glow,-.35,.16,0,.09,.04); energyRing(root,-.35,.3); }
      if(late>=4)for(const side of [-1,1])shape(root,[[-.46,side*.23],[.63,side*.29],[1.34,side*.07],[.7,side*.19],[-.37,side*.17]],violet,.016);
      if(late===5) { energyRing(root,.65,.36,violet,1); satellite(root,.45,.2,-.37,.24,1.7); satellite(root,.45,.2,.37,.24,3.4); }
    } else if (family === 'worldtree') {
      const radius=[.022,.033,.045,.049,.058,.064,.072,.077,.083,.088,.095][stage];
      tube(root,[[-.6,.015,0],[-.13,.04,.03],[.4,.055,-.025],[1.17,.1,.08]],radius,bark,20);
      if(stage===0)tube(root,[[.22,.04,0],[.42,.05,-.14],[.56,.06,-.17]],.014,bark,8);
      if(stage>=1)for(let i=0;i<Math.min(stage+1,7);i++) { const x=-.22+i*.2, side=i%2?1:-1; tube(root,[[x,.05,0],[x+.12,.09,side*.16],[x+.24,.1,side*(.21+stage*.012)]],radius*.33,bark,9); if(stage>=3)ball(root,leaf,x+.24,.12,side*(.21+stage*.012),.026+(stage-3)*.012,.025,.04); }
      if(stage>=4)ball(root,stage<6?gold:leaf,1.16,.12,.08,.075+(stage-4)*.012,.07,.09);
      if(stage>=5)for(const side of [-1,1])shape(root,[[.92,side*.07],[1.2,side*.32],[1.35,side*.22],[1.13,side*.05]],leaf,.016);
      if(stage>=6)for(let i=0;i<stage-3;i++) { const x=.15+i*.15, side=i%2?1:-1; shape(root,[[x,side*.14],[x+.13,side*.39],[x+.32,side*.28],[x+.1,side*.12]],leaf,.015); }
      if(stage>=7)tube(root,[[-.5,.08,-.08],[-.14,.12,.18],[.41,.15,-.07],[.95,.16,.14]],.021,gold,18);
      if(stage>=8)energyRing(root,.66,.32,leaf);
      if(stage>=9)for(const side of [-1,1])tube(root,[[-.65,.02,0],[-.71,.03,side*.28],[-.4,.05,side*.45]],.035,bark,10);
      if(stage===10) { ball(root,glow,.65,.2,0,.13,.08,.15); energyRing(root,.36,.42,gold,.7); }
    } else if (family === 'fishblade') {
      if(stage===0) { shape(root,[[-.56,-.06],[-.16,-.1],[.12,-.035],[.36,-.12],[.68,-.02],[1.18,-.08],[.92,.06],[.58,.1],[.31,.06],[.08,.13],[-.56,.06]],leaf,.018); tube(root,[[-.5,.04,0],[.25,.04,0],[1,.03,-.02]],.015,bark,12); }
      if(stage===1) { shape(root,[[-.56,0],[-.25,-.15],[.69,-.19],[1.2,0],[.69,.19],[-.25,.15]],bone,.06); for(let i=0;i<7;i++)box(root,steel,-.12+i*.15,.079,0,.024,.01,.21-i*.009); }
      if(stage===2) { shape(root,[[-.56,-.1],[-.06,-.21],[.79,-.25],[1.25,0],[.79,.25],[-.06,.21],[-.56,.1]],rust,.07); teeth(root,6,-.23,1.12,.21,.065,bone,true); for(const side of [-1,1])tube(root,[[-.42,.055,side*.1],[-.25,.1,side*.37],[.14,.08,side*.4]],.035,rust,10); }
      if(stage===3)fish(root,.36,1.05);
      if(stage===4||stage===5) { tube(root,[[-.55,.025,0],[.18,.025,0],[1.35,.025,0]],.023,bark,8); fish(root,-.06,.47,stage===5); fish(root,.77,.5,stage===5); }
      if(stage===6) { tube(root,[[-.54,.02,0],[.65,.03,0]],.05,bark,8); ball(root,bone,.77,.07,0,.39,.17,.3); for(let i=0;i<12;i++) { const a=i*Math.PI/6; shape(root,[[.77+Math.cos(a)*.31,Math.sin(a)*.24],[.77+Math.cos(a)*.49,Math.sin(a)*.43],[.77+Math.cos(a+.16)*.31,Math.sin(a+.16)*.24]],bone,.025); } ball(root,darkSteel,.93,.22,-.12,.033,.014); }
      if(stage===7) { tube(root,[[-.55,.02,0],[.38,.07,0],[1.18,.1,.08]],.045,bone,18); for(let i=0;i<7;i++) { const x=-.05+i*.17,side=i%2?1:-1; tube(root,[[x,.06,0],[x+.1,.08,side*.2],[x+.07,.11,side*.36]],.029,i%3?flesh:bone,9); tube(root,[[x+.07,.11,side*.27],[x+.22,.12,side*.35],[x+.31,.11,side*.3]],.018,flesh,7); } }
      if(stage===8) { for(const side of [-1,1])tube(root,[[-.53,.03,side*.09],[.03,.05,side*.2],[.72,.05,side*.24],[1.31,.02,0]],.07,bone,24); teeth(root,7,-.3,1.14,.13,.08,bone,true); }
      if(stage===9) { const {curve}=tube(root,[[-.54,.02,0],[-.03,.05,-.05],[.61,.09,.015],[1.08,.08,.27],[1.01,.07,.48],[.8,.06,.49]],.105,flesh,36); const count=16,suckers=new THREE.InstancedMesh(ring,bone,count),dummy=new THREE.Object3D(); for(let i=0;i<count;i++){dummy.position.copy(curve.getPointAt((i+.3)/count));dummy.position.y+=.104;dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();suckers.setMatrixAt(i,dummy.matrix);}root.add(suckers);tube(root,[[.42,.04,0],[.73,.07,-.3],[.51,.06,-.43]],.047,flesh,15); }
      if(stage===10) { shape(root,[[-.56,-.12],[.2,-.22],[.77,-.35],[1.4,-.15],[1.02,.12],[.35,.22],[-.56,.12]],bone,.07); teeth(root,7,-.4,1.02,.15,.13,bone); wings(root,-.58,.34,darkSteel,3); for(const side of [-1,1])tube(root,[[-.46,.09,side*.08],[.15,.09,side*.13],[.78,.08,-.1],[1.3,.04,-.16]],.022,glow,18); }
    } else if (family === 'funerary') {
      if(stage===0) { shape(root,[[-.56,-.06],[-.25,-.046],[1.18,0],[-.25,.046],[-.56,.06]],rust,.035); box(root,rust,-.5,.045,0,.14,.04,.16); }
      if(stage===1) { facetedBlade(root,1.13,.095,darkSteel); for(let i=0;i<7;i++)box(root,bone,-.52+i*.075,.06,0,.036,.012,.19-i*.013,-.2); }
      if(stage===2) { tube(root,[[-.55,.02,0],[.72,.02,0]],.037,bark,9); shape(root,[[.52,-.21],[1.1,-.23],[1.35,0],[1.1,.23],[.52,.21]],darkSteel,.04); box(root,steel,.82,.06,0,.5,.014,.07); }
      if(stage===3) { grave(root,.35,0,1.38); shape(root,[[.96,-.3],[1.27,-.19],[1.11,.12],[.88,.06]],rust,.065); }
      if(stage===4) { shape(root,[[-.5,-.14],[-.25,-.26],[1.08,-.26],[1.28,-.12],[1.28,.12],[1.08,.26],[-.25,.26],[-.5,.14]],bark,.07); for(const z of [-.19,.19])box(root,darkSteel,.35,.09,z,1.5,.025,.04); box(root,bone,.36,.11,0,.075,.014,.34);box(root,bone,.36,.11,0,.56,.014,.075); }
      if(stage===5) { tube(root,[[-.56,.02,0],[.57,.02,0]],.04,bark,8); shape(root,[[.39,-.14],[.81,-.19],[1.15,-.34],[1.22,.34],[.81,.19],[.39,.14]],gold,.045); box(root,darkSteel,1.15,.1,0,.07,.055,.66); ball(root,bone,1.16,.09,0,.07,.045);energyRing(root,.85,.28,bone); }
      if(stage===6) { tube(root,[[-.56,.02,0],[.92,.04,0]],.05,bark,12); for(const side of [-1,1])shape(root,[[.58,side*.05],[.73,side*.2],[1.26,side*.12],[1.4,0],[.94,side*.045]],glow,.025); ball(root,bone,.79,.08,0,.14,.07,.12); }
      if(stage===7) { tube(root,[[-.56,.02,0],[1.02,.02,0]],.035,darkSteel,10); shape(root,[[.72,-.05],[1.2,-.15],[1.45,-.55],[1.17,-.4],[.81,-.25],[.64,-.14]],steel,.035);tube(root,[[.72,.07,-.05],[1.12,.07,-.2],[1.38,.04,-.48]],.018,bone,12); }
      if(stage===8) { grave(root,.5,0,1.17); for(const side of [-1,1])tube(root,[[-.46,.02,0],[-.15,.04,side*.12],[.18,.04,side*.39],[.5,.05,side*.46]],.035,bark,10); box(root,bark,.24,.03,0,1.4,.055,.51); }
      if(stage===9) { box(root,bark,.32,.03,0,1.75,.07,.64); for(let i=0;i<5;i++)grave(root,-.32+i*.33,i%2?.11:-.11,.36+i*.02); for(const side of [-1,1])tube(root,[[-.51,.09,side*.27],[.29,.12,side*.31],[1.14,.08,side*.25]],.016,darkSteel,9); }
      if(stage===10) { tube(root,[[-.56,.02,0],[1.25,.02,0]],.047,darkSteel,10); energyRing(root,1.08,.23,gold); energyRing(root,1.08,.14,violet,.8); for(const x of [-.35,-.06,.23])box(root,bone,x,.05,.15,.085,.065,.3); shape(root,[[.82,-.19],[1.09,-.3],[1.36,-.19],[1.36,.19],[1.09,.3],[.82,.19]],darkSteel,.035); runeMarks(root,3,-.34,.35,violet); }
    } else facetedBlade(root,1.2,.1);
    root.traverse(m=>{if(isMeshObject(m)){m.castShadow=true;m.receiveShadow=true;}});
    templates.set(cacheKey,root); return root;
  }
  const hotColor = new THREE.Color('#ff5217');
  function disposeVisual(root:SwordRoot) {
    root.userData.localMaterials?.forEach(m => m.dispose());
    const visual = root.userData.visual;
    visual?.traverse(mesh => { if (isInstancedObject(mesh)) mesh.dispose(); });
    visual?.removeFromParent();
    root.userData.localMaterials = [];
  }
  function replaceVisual(root:SwordRoot, form:SwordForm, flash:boolean) {
    disposeVisual(root);
    const visual=template(form.family,form.stage).clone(true), clones=new Map<HeatMaterial,HeatMaterial>();
    visual.traverse(mesh=>{if(!isMeshObject(mesh))return; const source=mesh.material;if(!(source instanceof HeatMaterial))return;if(!clones.has(source)){const m=source.clone();m.userData.baseEmission=m.emissive.clone();m.userData.baseIntensity=m.emissiveIntensity;m.userData.respondsToHeat=heatMaterials.has(source);clones.set(source,m);}mesh.material=clones.get(source)!;});
    root.add(visual);root.userData.visual=visual;root.userData.localMaterials=[...clones.values()];root.userData.modelKey=form.key;root.userData.form=form;root.userData.flash=flash?.45:0;
  }
  function create(sword:SwordRenderInput) { const root=new SwordRoot();instances.add(root);replaceVisual(root,getSwordForm(sword),false);return update(root,sword); }
  function update(root:SwordRoot,sword:SwordRenderInput) {
    const form=getSwordForm(sword);if(root.userData.modelKey!==form.key)replaceVisual(root,form,true);
    const heat=THREE.MathUtils.clamp((sword.heat||0)/100,0,1);
    root.userData.localMaterials.forEach(m => {
      m.emissive.copy(m.userData.baseEmission);
      m.emissiveIntensity = m.userData.baseIntensity;
      if (m.userData.respondsToHeat) {
        m.emissive.lerp(hotColor, heat * .85);
        m.emissiveIntensity += heat * .72;
      }
      m.userData.heatIntensity = m.emissiveIntensity;
    });
    root.userData.swordId=sword.id;root.userData.sword={...sword};return root;
  }
  function animate(dt:number) {
    if(!(dt>0))return;elapsed+=dt;
    for(const root of instances){const visual=root.userData.visual;if(!visual)continue;root.userData.flash=Math.max(0,(root.userData.flash||0)-dt);const pulse=Math.sin(root.userData.flash/.45*Math.PI)*.22;
      root.userData.localMaterials.forEach(m=>{m.emissiveIntensity=(m.userData.heatIntensity??m.userData.baseIntensity)+pulse;});
      visual.traverse(m=>{if(renderData(m).motion==='satellite')m.position.y=renderData(m).baseY!+Math.sin(elapsed*1.8+(renderData(m).phase||0))*.025;else if(renderData(m).motion==='ring')m.rotation.y=.5+Math.sin(elapsed*.8+(renderData(m).phase||0))*.23;});
    }
  }
  function key(sword:SwordRenderInput) { return getSwordForm(sword).key; }
  function disposeInstance(root:SwordRoot) { if(!instances.delete(root))return;disposeVisual(root);root.removeFromParent(); }
  function dispose() { [...instances].forEach(disposeInstance);templates.forEach(root=>root.traverse(mesh=>{if(isInstancedObject(mesh))mesh.dispose();}));geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());templates.clear();geometries.clear();materials.clear(); }
  return { create, update, key, animate, disposeInstance, dispose };
}
