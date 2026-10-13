// One hand-cut hide silhouette for the wall mesh and the readable DOM sheet.
// Coordinates are normalized; no texture randomness runs in the render loop.
export const HIDE_POINTS = [
  [38,30],[105,9],[168,18],[275,12],[342,18],[428,8],[460,23],
  [620,7],[754,18],[804,5],[917,16],[1035,13],[1110,23],[1175,14],
  [1300,7],[1362,30],[1434,20],[1520,23],[1567,56],[1582,130],
  [1568,240],[1593,298],[1579,397],[1590,500],[1571,575],[1587,656],
  [1574,718],[1557,762],[1482,784],[1372,770],[1285,789],[1181,781],
  [1069,798],[1007,780],[915,786],[836,776],[770,792],[678,780],
  [554,789],[433,775],[381,790],[280,772],[188,780],[139,763],
  [57,773],[16,735],[29,642],[12,572],[25,483],[6,403],[20,352],
  [13,276],[28,214],[7,146],[21,82]
].map(([x,y])=>Object.freeze([x/1600,y/800]));
Object.freeze(HIDE_POINTS);

const number=(value: number)=>Number(value.toFixed(3));
function hideCurves() {
  return HIDE_POINTS.map(([x,y],index)=>{
    const next=HIDE_POINTS[(index+1)%HIDE_POINTS.length];
    return {control:[x,y],end:[(x+next[0])/2,(y+next[1])/2]};
  });
}
const cutContour=(()=>{
  const curves=hideCurves(),points=[];let from=curves[curves.length-1].end,seed=937;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const {control,end} of curves){
    const distance=Math.hypot((end[0]-from[0])*1600,(end[1]-from[1])*800),steps=Math.max(3,Math.ceil(distance/10));
    for(let i=0;i<steps;i++){
      const t=i/steps,s=1-t,x=s*s*from[0]+2*s*t*control[0]+t*t*end[0],y=s*s*from[1]+2*s*t*control[1]+t*t*end[1];
      const tx=(s*(control[0]-from[0])+t*(end[0]-control[0]))*1600,ty=(s*(control[1]-from[1])+t*(end[1]-control[1]))*800,length=Math.hypot(tx,ty)||1;
      // Small knife nicks interrupt long uneven cuts, rather than repeat a scallop.
      const nick=(random()<.12?3+random()*4:random()*2-1);
      points.push([x-ty/length*nick/1600,y+tx/length*nick/800]);
    }
    from=end;
  }
  return points;
})();
export function hideContour(width=1,height=1): [number, number][]{return cutContour.map(([x,y])=>[x*width,y*height]);}
function hidePath(width: number,height: number) {
  return `M${hideContour(width,height).map(point=>point.map(number).join(' ')).join('L')}Z`;
}

export function parchmentSurface(width: number,height: number,id='forge-hide') {
  const path=hidePath(width,height),edge=Math.min(width,height);
  const key=id.replace(/[^a-zA-Z0-9_-]/g,'_');
  let seed=42771;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let fibres='';
  for(let i=0;i<180;i++) {
    const x=random()*width,y=random()*height,dx=(random()-.5)*edge*.018,dy=(random()-.5)*edge*.009;
    fibres+=`<path d="M${number(x)} ${number(y)}q${number(dx/2)} ${number(dy-edge*.002)} ${number(dx)} ${number(dy)}"/>`;
  }
  return `<defs>
    <clipPath id="${key}-clip"><path d="${path}"/></clipPath>
    <radialGradient id="${key}-vellum" cx=".46" cy=".36" r=".8"><stop stop-color="#e7cfa0"/><stop offset=".62" stop-color="#d1b078"/><stop offset="1" stop-color="#a17c45"/></radialGradient>
    <radialGradient id="${key}-stain"><stop stop-color="#795a33" stop-opacity=".24"/><stop offset="1" stop-color="#795a33" stop-opacity="0"/></radialGradient>
    <linearGradient id="${key}-rim" x2=".2" y2="1"><stop stop-color="#76542c"/><stop offset=".45" stop-color="#b18a50"/><stop offset="1" stop-color="#79572c"/></linearGradient>
    <filter id="${key}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${number(320/width)} ${number(240/height)}" numOctaves="2" seed="17"/><feColorMatrix type="matrix" values="0 0 0 0 .36 0 0 0 0 .24 0 0 0 0 .12 .28 .28 .28 0 -.25"/></filter>
    <filter id="${key}-cloud" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${number(5/width)} ${number(5/height)}" numOctaves="3" seed="29"/><feColorMatrix type="matrix" values="0 0 0 0 .30 0 0 0 0 .20 0 0 0 0 .08 .22 .22 .22 0 -.19"/></filter>
  </defs>
  <g clip-path="url(#${key}-clip)">
    <path d="${path}" fill="url(#${key}-vellum)"/>
    <rect width="${width}" height="${height}" filter="url(#${key}-cloud)" opacity=".62"/>
    <ellipse cx="${width*.1}" cy="${height*.67}" rx="${width*.24}" ry="${height*.43}" fill="url(#${key}-stain)"/>
    <ellipse cx="${width*.87}" cy="${height*.14}" rx="${width*.22}" ry="${height*.36}" fill="url(#${key}-stain)" opacity=".65"/>
    <rect width="${width}" height="${height}" filter="url(#${key}-grain)" opacity=".5"/>
    <g fill="none" stroke="#f7e7be" stroke-opacity=".28" stroke-width="${edge*.0009}">${fibres}</g>
    <path d="M${width*.18} 0Q${width*.24} ${height*.08} ${width*.31} ${height*.11}M${width*.84} ${height}Q${width*.72} ${height*.88} ${width*.67} ${height*.77}M${width*.5} 0Q${width*.49} ${height*.47} ${width*.52} ${height}" fill="none" stroke="#704e29" stroke-width="${edge*.0028}" stroke-opacity=".055"/>
    <path d="M${width*.181} 0Q${width*.242} ${height*.08} ${width*.312} ${height*.11}M${width*.842} ${height}Q${width*.723} ${height*.88} ${width*.674} ${height*.77}M${width*.503} 0Q${width*.492} ${height*.47} ${width*.524} ${height}" fill="none" stroke="#fff0c9" stroke-width="${edge*.004}" stroke-opacity=".13"/>
    <path d="${path}" fill="none" stroke="url(#${key}-rim)" stroke-width="${edge*.035}" stroke-opacity=".28"/>
    <path d="${path}" fill="none" stroke="#624222" stroke-width="${edge*.004}" stroke-opacity=".48" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="#fae6b3" stroke-width="${edge*.0009}" stroke-opacity=".3"/>
  </g>`;
}

// The decoration may stretch; text and ticket glyphs remain native DOM/SVG.
export const parchmentBackground = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500" preserveAspectRatio="none">${parchmentSurface(1000,1500,'ticket-overlay-hide')}</svg>`)}")`;
