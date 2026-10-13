import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketSquares,ticketReadout,ticketMechanisms,ticketRowGlyphs} from '../src/ticket-glyphs.ts';

function paintedTickets(svg:string){
 const steps=new Map([...svg.matchAll(/<pattern id="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/g)].map(match=>[match[1],Number(match[2])*Number(match[3])]));
 const ink=svg.replace(/<defs>.*?<\/defs>/gs,'');let live=0,crossed=0;
 for(const match of ink.matchAll(/<rect[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*fill="url\(#([^)]*)\)"/g)){
  const count=Number(match[1])*Number(match[2])/steps.get(match[3])!;
  if(match[3].endsWith('-crossed'))crossed+=count;else live+=count;
 }
 return {live,crossed};
}

test('mobile parchment conserves base and both additions when removal crosses into mechanism tickets',()=>{
 const markup=ticketReadout({active:true,rows:[{id:'break',label:'碎裂',base:9,relicAdded:2,mechanicAdded:4,removed:12,total:3}]});
 for(const [field,count,removed,live] of [['base',9,9,0],['relicAdded',2,2,0],['mechanicAdded',4,1,3]])
  assert.match(markup,new RegExp(`data-ticket-group="touch-break-${field}" data-count="${count}" data-removed="${removed}" data-live="${live}"`));
 assert.ok(markup.includes('ticket-sheet-mechanic'));assert.ok(markup.includes('共 24 张'),'other four baseline outcomes remain visible');
 assert.equal(/<table|<th\b|<thead|ticket-readout/.test(markup),false);assert.equal(markup.includes('touch-break-removed'),false);
});
test('large pools keep every tile and constant SVG node budget rather than truncate counts',()=>{
 const small=ticketSquares(12,{id:'small',removed:2,width:400,height:60});
 const large=ticketSquares(1207,{id:'large',removed:1013,width:400,height:60});
 assert.match(large,/data-count="1207" data-removed="1013" data-live="194"/);
 assert.ok((large.match(/<(?:rect|path|pattern)\b/g)||[]).length<=18);
 assert.ok(large.length<small.length+1800,'pattern geometry is independent of ticket quantity');
 assert.ok(!/NaN|Infinity/.test(large));assert.ok(small.includes('fill="none"'),'baseline tickets hollow');
 const coverage=paintedTickets(large);assert.ok(Math.abs(coverage.crossed-1013)<1e-8);assert.ok(Math.abs(coverage.live-194)<1e-8);
});
test('painted grids conserve tickets through every baseline, relic and mechanism removal boundary',()=>{
 for(let removed=0;removed<=20;removed++){
  const row={id:'success' as const,base:9,relicAdded:4,mechanicAdded:7,removed,total:20-removed};
  const main=ticketRowGlyphs(row,{width:180,height:34,size:16}),mechanic=ticketRowGlyphs(row,{part:'mechanic',width:180,height:20,size:16});
  const a=paintedTickets(main),b=paintedTickets(mechanic);
  assert.ok(Math.abs(a.live+b.live-row.total)<1e-8,`uncrossed total for removal ${removed}`);
  assert.ok(Math.abs(a.crossed+b.crossed-removed)<1e-8,`crossed pool for removal ${removed}`);
  assert.ok(Math.abs(a.crossed-Math.min(13,removed))<1e-8,'mechanism row remains intact until baseline and relic exhausted');
 }
});
test('each pool places live tickets before its crossed tail and uses the reference hold label',()=>{
 const svg=ticketSquares(9,{id:'tail',removed:2,width:300,height:40}),ink=svg.replace(/<defs>.*?<\/defs>/gs,'');
 const fills=[...ink.matchAll(/fill="url\(#([^)]*)\)"/g)].map(match=>match[1]);
 assert.deepEqual(fills,['ticket-tail','ticket-tail-crossed']);
 const sheet=ticketReadout({active:true,rows:[{id:'hold',label:'保持',base:5,removed:0,total:5}]});
 assert.ok(sheet.includes('维持'));assert.equal(sheet.includes('保持'),false);
});
test('ordinary mobile rows use readable fifteen-unit squares on a 240-unit sheet grid',()=>{
 const sheet=ticketReadout(null);
 assert.match(sheet,/width="240" height="24" viewBox="0 0 240 24"/);
 assert.match(sheet,/<pattern id="ticket-touch-break-base"[^>]*><rect[^>]*width="15" height="15"/);
});
test('compact parchment escapes labels and source text and supports baseline empty-anvil state',()=>{
 const markup=ticketReadout({active:true,rows:[{id:'success',label:'<img onerror="evil">&',base:12,added:5,mechanicAdded:2,removed:0,total:17}]});
 assert.ok(markup.includes('&lt;img onerror=&quot;evil&quot;&gt;&amp;'));assert.equal(markup.includes('<img'),false);
 assert.match(markup,/data-ticket-group="touch-success-relicAdded" data-count="3"/,'legacy added includes mechanisms');
 const baseline=ticketReadout(null);assert.ok(baseline.includes('共 30 张'));assert.equal((baseline.match(/class="ticket-sheet-row"/g)||[]).length,5);
 const sources=ticketMechanisms([{id:'fixture',kind:'mechanic',label:'<b>&',outcome:'great',added:3,removed:0}]);assert.ok(sources.includes('&lt;b&gt;&amp;'));assert.ok(sources.includes('data-count="3"'));
});
