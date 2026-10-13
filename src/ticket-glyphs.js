// Each pattern tile contains exactly one ticket. Full rows and a partial last
// row keep even accumulated tickets exact without creating thousands of nodes.
export const TICKET_COLORS={base:'#c6c3ac',added:'#a2cba7',mechanic:'#a5c7dc',removed:'#da927b',total:'#e4c686'};
export const ticketCount=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const ticketEffectLabel=label=>String(label).replace(/\s*\+\d+\s*票/gu,'加票');

export function ticketSquares(value,{id,x=0,y=0,width=250,height=56,size=22,mode='base',columns}={}){
  const count=ticketCount(value),color=TICKET_COLORS[mode]??TICKET_COLORS.base;
  const key=String(id??'tickets').replace(/[^a-zA-Z0-9_-]/g,'_'),patternId=`ticket-${key}`;
  let body=`<g data-ticket-group="${xml(id??'tickets')}" data-count="${count}">`;
  if(!count)return body+`<path d="M${x+width/2-8} ${y+height/2}h16" stroke="#657060" stroke-width="2"/></g>`;
  let step=size/0.76;
  let cols=columns??Math.max(1,Math.floor(width/step));
  if(!columns&&count>cols*Math.max(1,Math.floor(height/step)))cols=Math.ceil(Math.sqrt(count*width/height));
  cols=Math.max(1,Math.min(count,cols));
  const rows=Math.ceil(count/cols);
  step=Math.min(step,width/cols,height/rows);
  const square=step*.76,gap=(step-square)/2;
  const left=x+(width-cols*step)/2,top=y+(height-rows*step)/2;
  const fullRows=Math.floor(count/cols),remaining=count%cols;
  const tile=mode==='removed'
    ?`<rect x="${gap}" y="${gap}" width="${square}" height="${square}" fill="none" stroke="${color}" stroke-width="${step*.075}"/><path d="M${gap} ${gap}l${square} ${square}M${gap+square} ${gap}l${-square} ${square}" stroke="${color}" stroke-width="${step*.075}"/>`
    :`<rect x="${gap}" y="${gap}" width="${square}" height="${square}" fill="${color}"/>`;
  body+=`<defs><pattern id="${patternId}" x="${left}" y="${top}" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>`;
  if(fullRows)body+=`<rect x="${left}" y="${top}" width="${cols*step}" height="${fullRows*step}" fill="url(#${patternId})"/>`;
  if(remaining)body+=`<rect x="${left}" y="${top+fullRows*step}" width="${remaining*step}" height="${step}" fill="url(#${patternId})"/>`;
  return body+'</g>';
}

export function ticketCell(value,{id,mode='base'}={}){
  const count=ticketCount(value),height=Math.max(10,Math.ceil(count/5)*10);
  return `<span class="ticket-square-scroll"><svg class="ticket-squares" xmlns="http://www.w3.org/2000/svg" width="50" height="${height}" viewBox="0 0 50 ${height}" role="img" aria-label="${count?`${count}票${mode==='removed'?'，划销移除':''}`:'无票'}">${ticketSquares(count,{id,width:50,height,size:7.6,mode,columns:5})}</svg></span>`;
}

const outcomeLabels={break:'碎裂',damage:'损伤',hold:'保持',success:'成功',great:'大成功'};
export function ticketReadout(snapshot){
  return `<table class="ticket-readout"><caption>一格一票 · 蓝色为机制加票 · 划销表示移除</caption><thead><tr><th>结果</th><th>基准</th><th>遗物</th><th>机制</th><th>移除</th><th>当前</th></tr></thead><tbody>${snapshot.rows.map(row=>`<tr data-ticket-outcome="${xml(row.id)}"><th scope="row">${xml(row.label)}</th>${[['base',row.base,'base'],['relicAdded',row.relicAdded??row.added,'added'],['mechanicAdded',row.mechanicAdded??0,'mechanic'],['removed',row.removed,'removed'],['total',row.total,'total']].map(([field,value,mode])=>`<td>${ticketCell(value,{id:`touch-${row.id}-${field}`,mode})}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export function ticketMechanisms(sources=[]){
  const mechanisms=sources.filter(source=>source.kind==='mechanic'&&(source.added||source.removed));
  return `<details class="ticket-mechanisms"><summary>机制与临时加票来源</summary>${mechanisms.length?mechanisms.map((source,index)=>`<div class="ticket-source"><div><b>${xml(source.label)}</b><small>${xml(outcomeLabels[source.outcome]??source.outcome)} · ${source.removed?'移除':'增加'}</small></div>${ticketCell(source.removed||source.added,{id:`mechanism-${index}`,mode:source.removed?'removed':'mechanic'})}</div>`).join(''):'<p class="note">当前没有机制加票。累积与下一锤效果会在这里单独列出。</p>'}</details>`;
}
