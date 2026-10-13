import type {Outcome,TicketSource,TicketEffect} from './game-types.ts';
export type TicketMode='base'|'added'|'mechanic'|'removed'|'total';
export interface TicketRowInput {id?:Outcome;label?:string;base?:number;total?:number;added?:number;removed?:number;relicAdded?:number;mechanicAdded?:number}
export interface TicketSnapshot {swordId?:number|null;swordName?:string|null;temporary?:readonly TicketEffect[];sources?:readonly TicketSource[];active?:boolean;rows?:readonly TicketRowInput[]}
export interface TileLayout {x:number;y:number;step:number;columns:number}
export interface TileOptions {id?:string;x?:number;y?:number;width?:number;height?:number;size?:number;mode?:TicketMode;columns?:number;removed?:number;layout?:TileLayout;start?:number}
export const TICKET_COLORS={base:'#59462c',added:'#365c35',mechanic:'#365c35',removed:'#59462c',total:'#59462c'};
export const TICKET_CATEGORIES=[
  {id:'break',label:'碎裂',base:9},{id:'damage',label:'损伤',base:2},
  {id:'hold',label:'维持',base:5},{id:'success',label:'成功',base:12},{id:'great',label:'大成功',base:2}
] as const;
export const ticketCount=(value:unknown):number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
const xml=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]??c));
export const ticketEffectLabel=(label:string)=>String(label).replace(/\s*\+\d+\s*票/gu,'加票');

// Removal cancels existing tickets in order; it never creates a second pool.
export function ticketRowCounts(row: TicketRowInput){
  const base=ticketCount(row.base),mechanicAdded=ticketCount(row.mechanicAdded);
  const relicAdded=ticketCount(row.relicAdded??Math.max(0,ticketCount(row.added)-mechanicAdded));
  const removed=ticketCount(row.removed),baseRemoved=Math.min(base,removed);
  const relicRemoved=Math.min(relicAdded,removed-baseRemoved);
  const mechanicRemoved=Math.min(mechanicAdded,removed-baseRemoved-relicRemoved);
  return {base,relicAdded,mechanicAdded,removed,baseRemoved,relicRemoved,mechanicRemoved,total:base+relicAdded+mechanicAdded-removed};
}
export function ticketRows(snapshot: TicketSnapshot | null | undefined){
  return TICKET_CATEGORIES.map(category=>{
    const source=snapshot?.active?snapshot.rows?.find(row=>row.id===category.id):null;
    return {...category,...source,...ticketRowCounts(source??category),label:category.id==='hold'?category.label:source?.label??category.label};
  });
}
function tileLayout(count:number,{x=0,y=0,width=250,height=56,size=22,columns}:TileOptions={}){
  let step=size/.76,cols=columns??Math.max(1,Math.floor(width/step));
  if(!columns&&count>cols*Math.max(1,Math.floor(height/step)))cols=Math.ceil(Math.sqrt(count*width/height));
  cols=Math.max(1,Math.min(Math.max(1,count),cols));
  step=Math.min(step,width/cols,height/Math.max(1,Math.ceil(count/cols)));
  return {x,y,step,columns:cols};
}

// Patterns preserve full and partial rows without a node for every ticket.
// All pools share one grid so direct relic tiles append to baseline tickets.
export function ticketSquares(value:unknown,{id,x=0,y=0,width=250,height=56,size=22,mode='base',columns,removed=0,layout,start=0}:TileOptions={}){
  const count=ticketCount(value),crossed=mode==='removed'?count:Math.min(count,ticketCount(removed));
  const color=TICKET_COLORS[mode]??TICKET_COLORS.base;
  const key=String(id??'tickets').replace(/[^a-zA-Z0-9_-]/g,'_'),patternId=`ticket-${key}`;
  let body=`<g data-ticket-group="${xml(id??'tickets')}" data-count="${count}" data-removed="${crossed}" data-live="${count-crossed}">`;
  if(!count)return body+'</g>';
  const grid=layout??tileLayout(count,{x,y,width,height,size,columns});
  const step=grid.step,square=step*.76,gap=(step-square)/2;
  const added=mode==='added'||mode==='mechanic';
  const tile=`<rect x="${gap}" y="${gap}" width="${square}" height="${square}" fill="${added?color:'none'}"${added?'':` stroke="${color}" stroke-width="${step*.055}"`}/>`
    +(added?`<path d="M${step*.5} ${step*.28}v${step*.44}M${step*.28} ${step*.5}h${step*.44}" stroke="#f5e8c7" stroke-width="${step*.08}"/>`:'');
  const cross=`<path d="M${gap} ${gap}l${square} ${square}M${gap+square} ${gap}l${-square} ${square}" stroke="#59462c" stroke-width="${step*.085}"/>`;
  body+=`<defs><pattern id="${patternId}" x="${grid.x}" y="${grid.y}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${tile}</pattern>`
    +`<pattern id="${patternId}-crossed" x="${grid.x}" y="${grid.y}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${tile}${cross}</pattern></defs>`;
  function range(first:number,length:number,pattern:string){
    let index=first,left=length,result='';
    const rect=(column:number,row:number,n:number,rows=1)=>`<rect x="${grid.x+column*step}" y="${grid.y+row*step}" width="${n*step}" height="${rows*step}" fill="url(#${pattern})"/>`;
    const column=index%grid.columns;
    if(column&&left){const n=Math.min(left,grid.columns-column);result+=rect(column,Math.floor(index/grid.columns),n);index+=n;left-=n;}
    const fullRows=Math.floor(left/grid.columns);
    if(fullRows){result+=rect(0,Math.floor(index/grid.columns),grid.columns,fullRows);index+=fullRows*grid.columns;left-=fullRows*grid.columns;}
    if(left)result+=rect(0,Math.floor(index/grid.columns),left);
    return result;
  }
  body+=range(start,count-crossed,patternId)+range(start+count-crossed,crossed,`${patternId}-crossed`);
  return body+'</g>';
}
export function ticketRowGlyphs(row:TicketRowInput,{id=row.id,part='main',x=0,y=0,width=250,height=56,size=22}:TileOptions & {part?:'main'|'mechanic'}={}){
  const counts=ticketRowCounts(row);
  if(part==='mechanic')return ticketSquares(counts.mechanicAdded,{id:`${id}-mechanicAdded`,x,y,width,height,size,mode:'mechanic',removed:counts.mechanicRemoved});
  const layout=tileLayout(counts.base+counts.relicAdded,{x,y,width,height,size});
  return ticketSquares(counts.base,{id:`${id}-base`,mode:'base',removed:counts.baseRemoved,layout})
    +ticketSquares(counts.relicAdded,{id:`${id}-relicAdded`,mode:'added',removed:counts.relicRemoved,layout,start:counts.base});
}
export function ticketCell(value:unknown,{id,mode='base'}:TileOptions={}){
  const count=ticketCount(value),height=Math.max(16,Math.min(84,Math.ceil(count/20)*14));
  return `<svg class="ticket-squares" xmlns="http://www.w3.org/2000/svg" width="240" height="${height}" viewBox="0 0 240 ${height}" role="img" aria-label="${count}票${mode==='removed'?'，划销移除':''}">${ticketSquares(count,{id,width:240,height,size:9,mode})}</svg>`;
}
function rowSvg(row:ReturnType<typeof ticketRows>[number],part:'main'|'mechanic'){
  const count=part==='main'?row.base+row.relicAdded:row.mechanicAdded;
  const height=Math.max(24,Math.min(96,Math.ceil(count/12)*24));
  const removed=part==='main'?row.baseRemoved+row.relicRemoved:row.mechanicRemoved;
  return `<svg class="ticket-squares" xmlns="http://www.w3.org/2000/svg" width="240" height="${height}" viewBox="0 0 240 ${height}" role="img" aria-label="${count}票，划销${removed}票">${ticketRowGlyphs(row,{id:`touch-${row.id}`,part,width:240,height,size:15})}</svg>`;
}
export function ticketReadout(snapshot:TicketSnapshot | null | undefined){
  const rows=ticketRows(snapshot),total=rows.reduce((sum,row)=>sum+row.total,0);
  return `<div class="ticket-sheet">${rows.map(row=>`<div class="ticket-sheet-row" data-ticket-outcome="${xml(row.id)}"><span class="ticket-sheet-label">${xml(row.label)}</span><span class="ticket-sheet-glyphs">${rowSvg(row,'main')}</span><small class="ticket-sheet-total">${row.total}张</small></div>${row.mechanicAdded?`<div class="ticket-sheet-mechanic"><small>机制</small><span class="ticket-sheet-glyphs">${rowSvg(row,'mechanic')}</span></div>`:''}`).join('')}<div class="ticket-sheet-footer"><span>共 ${total} 张</span><small>强化风险体现在铁砧牌上</small></div></div>`;
}
const outcomeLabels=Object.fromEntries(TICKET_CATEGORIES.map(row=>[row.id,row.label]));
export function ticketMechanisms(sources:readonly TicketSource[]=[]){
  const mechanisms=sources.filter(source=>source.kind==='mechanic'&&(source.added||source.removed));
  return `<details class="ticket-mechanisms"><summary>机制与临时加票来源</summary>${mechanisms.length?mechanisms.map((source,index)=>`<div class="ticket-source"><div><b>${xml(source.label)}</b><small>${xml(outcomeLabels[source.outcome]??source.outcome)} · ${source.removed?'移除':'增加'}</small></div>${ticketCell(source.removed||source.added,{id:`mechanism-${index}`,mode:source.removed?'removed':'mechanic'})}</div>`).join(''):'<p class="note">当前没有机制加票。累积与下一锤效果会在这里单独列出。</p>'}</details>`;
}
