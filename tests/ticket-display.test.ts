import type {GameState,SwordState,RelicId,SwordTypeId,TicketDisplay,Outcome,TicketRow,StrikeSuccess} from '../src/game-types.ts';
import {isRecord,OUTCOMES} from '../src/game-types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ForgeGame,RELICS} from '../src/simulation.ts';

function current(game:ForgeGame):SwordState{const sword=game.current;assert.ok(sword,'expected a selected sword in this test phase');return sword;}
function required<T>(value:T|null|undefined):T{assert.ok(value!==null&&value!==undefined,'expected fixture to exist');return value;}
const rng=(seed:number)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function setup(){const g=new ForgeGame(undefined,rng(7));g.claimFreeRelic(g.state.startingRelics[0]);g.pickupSword(current(g).id);g.heat();g.placeSword(current(g).id,'anvil');return g;}
function oddsDigest(){const random=rng(541),g=setup(),out=[];for(let i=0;i<500;i++){g.state.relics=g.sample(RELICS.map(r=>r.id),8);const w=current(g);w.level=Math.floor(random()*100);w.charge=Math.floor(random()*11);w.previous=random()<.5?'hold':'success';w.blind=random()<.5?3:0;w.ward=random()<.5;w.chalk=random()<.5;w.powder=random()<.5;w.splice=Math.floor(random()*5)*.15;w.scorched=Math.floor(random()*7)*.03;w.successTickets=Math.floor(random()*8);w.greatTickets=Math.floor(random()*8);g.state.grudgeTickets=Math.floor(random()*8);for(const key of OUTCOMES)g.state.runTickets[key]=Math.floor(random()*5);g.state.frenzySwordId=random()<.5?w.id:null;g.state.frenzyUntil=100;out.push(g.odds());}return createHash('sha256').update(JSON.stringify(out)).digest('hex');}
test('odds remain byte-for-byte identical across 500 frozen mixed builds after raw-ticket adaptation',()=>{assert.equal(oddsDigest(),'6f309f89e1e9eeee7fc7cc2a45ef741985c1f8e9cbdb93787ca5aaf05dfbd1e1');});
test('empty anvil has no current-sword additions and display reads are pure',()=>{const g=setup();g.state.relics=['bent','hoop'];const before=JSON.stringify(g.state);const inactive=g.ticketDisplay(null);assert.equal(inactive.active,false);assert.ok(inactive.rows.every(r=>r.added===0&&r.removed===0&&r.total===r.base));assert.equal(g.ticketDisplay().active,true);assert.equal(JSON.stringify(g.state),before);g.takeAnvil();assert.equal(g.ticketDisplay().active,false);});
test('positive tickets and removals are gross components rather than normalized probabilities',()=>{const g=setup();g.state.relics=['bent','hoop','thorn','mallet','whetstone'];current(g).level=10;const data=g.ticketDisplay(),row=(id:Outcome)=>required(data.rows.find(r=>r.id===id));assert.deepEqual(Object.fromEntries((['id','label','base','added','removed','total'] as const).map(key=>[key,row('damage')[key]])),{id:'damage',label:'损伤',base:2,added:2,removed:1,total:3});assert.equal(row('success').base,12);assert.equal(row('success').added,7);assert.equal(row('break').removed,2);assert.equal(row('hold').removed,4);assert.ok(data.rows.every(r=>r.base+r.added-r.removed===r.total));assert.ok(data.rows.every(r=>Number.isInteger(r.total)));assert.notEqual(row('success').total,g.odds().success*1000);});
test('next-strike Blind Die and Chalk are visible alongside accumulated sword tickets',()=>{const g=setup();current(g).blind=3;current(g).greatTickets=4;current(g).chalk=true;const data=g.ticketDisplay(),great=required(data.rows.find(r=>r.id==='great'));assert.equal(great.total,18);assert.equal(great.added,16);assert.ok(data.temporary.some(x=>x.id==='blind'));assert.ok(data.temporary.some(x=>x.id==='chalk'));g.tick(1000);g.strike(()=>.9);assert.equal(current(g).blind,0);assert.equal(current(g).chalk,false);const next=g.ticketDisplay();assert.equal(required(next.rows.find(r=>r.id==='great')).total,6);});
test('base replacement, full charge and after-weighting transformations are explained distinctly',()=>{const g=setup();g.state.relics=['sickle','mana'];current(g).charge=10;current(g).powder=true;const data=g.ticketDisplay();assert.equal(required(data.rows.find(r=>r.id==='break')).total,5);assert.equal(required(data.rows.find(r=>r.id==='great')).total,11);assert.ok(data.temporary.some(x=>x.id==='frenzy'));assert.equal(g.odds().break,0);current(g).charge=0;const ordinary=g.ticketDisplay();assert.ok(ordinary.temporary.some(x=>x.id==='powder'));});
export {oddsDigest};

function assertSourceSums(data:TicketDisplay){
 for(const row of data.rows){
  assert.equal(row.added,row.relicAdded+row.mechanicAdded);
  assert.equal(row.removed,row.relicRemoved+row.mechanicRemoved);
  assert.equal(row.total,row.base+row.added-row.removed);
  for(const kind of ['relic','mechanic'] as const)for(const direction of ['added','removed'] as const){
   const total=data.sources.filter(source=>source.outcome===row.id&&source.kind===kind).reduce((sum,source)=>sum+source[direction],0);
   assert.equal(total,row[kind==='relic'?(direction==='added'?'relicAdded':'relicRemoved'):(direction==='added'?'mechanicAdded':'mechanicRemoved')]);
  }
 }
 for(const source of data.sources){assert.ok(source.id&&source.label);assert.ok(['relic','mechanic'].includes(source.kind));assert.ok(source.added+source.removed>0);assert.ok(Number.isInteger(source.added)&&source.added>=0);assert.ok(Number.isInteger(source.removed)&&source.removed>=0);}
}
test('source breakdown separates static relic tickets from earned and conditional mechanism tickets',()=>{
 const g=setup(),w=current(g);g.state.relics=['bent','coal','hoop','thorn','mallet','third-eye','mana','obsidian'];
 Object.assign(w,{level:8,charge:10,previous:'hold',successTickets:3,greatTickets:4,blind:3,chalk:true});
 Object.assign(g.state.runTickets,{break:1,hold:1,great:2});g.state.grudgeTickets=2;
 const before=JSON.stringify(g.state),undo=g.undo,data=g.ticketDisplay(),row=(id:Outcome)=>required(data.rows.find(r=>r.id===id));
 assert.equal(row('success').relicAdded,5);assert.equal(row('success').mechanicAdded,7);assert.equal(row('success').mechanicRemoved,2);
 assert.equal(row('great').total,44);assert.equal(row('great').relicAdded,1);assert.equal(row('great').mechanicAdded,41);
 assert.equal(row('break').relicRemoved,2);assert.equal(row('break').mechanicAdded,1);
 assert.equal(row('damage').relicAdded,2);assert.equal(row('damage').relicRemoved,1);
 assertSourceSums(data);
 assert.ok(data.sources.some(x=>x.id==='sword-success'&&x.kind==='mechanic'&&x.added===3));
 assert.ok(data.sources.some(x=>x.id==='chalk'&&x.kind==='mechanic'&&x.added===22&&x.label==='红粉笔'));assert.equal(required(data.sources.find(x=>x.id==='blind')).label,'盲骰');
 assert.deepEqual(data.sources.filter(x=>x.id==='obsidian').map(x=>[x.outcome,x.added,x.removed]),[['success',0,2],['great',2,0]]);
 assert.equal(JSON.stringify(g.state),before);assert.equal(g.undo,undo);
});
test('base replacement and unconditional transfers are relic sources with exact gross additions and removals',()=>{
 const g=setup();g.state.relics=['sickle','thorn','mallet','whetstone'];const data=g.ticketDisplay();assertSourceSums(data);
 assert.ok(data.sources.every(x=>x.kind==='relic'));
 assert.deepEqual(data.sources.filter(x=>x.id==='sickle').map(x=>[x.outcome,x.added,x.removed]),[['break',0,4],['damage',3,0],['success',0,7],['great',3,0]]);
 assert.equal(required(data.rows.find(x=>x.id==='hold')).relicRemoved,4);
});
test('inactive anvil exposes no stale source contributions or conditionals',()=>{
 const g=setup();current(g).blind=3;current(g).chalk=true;g.state.runTickets.success=4;g.state.relics=['bent'];
 for(const data of [g.ticketDisplay(null),g.ticketDisplay(required(g.state.swords.find(x=>x.id!==current(g).id)))]){
  assert.equal(data.active,false);assert.deepEqual(data.sources,[]);assert.deepEqual(data.temporary,[]);assertSourceSums(data);
  assert.ok(data.rows.every(x=>x.relicAdded+x.relicRemoved+x.mechanicAdded+x.mechanicRemoved===0));
 }
});
test('consumed Blind Die and Chalk disappear from sources while earned sword tickets remain',()=>{
 const g=setup();g.state.relics=[];Object.assign(current(g),{blind:3,chalk:true,greatTickets:4});
 const first=g.ticketDisplay();assertSourceSums(first);assert.equal(required(first.sources.find(x=>x.id==='chalk')).added,9);
 g.tick(1000);assert.equal(g.strike(()=>.9).ok,true);const next=g.ticketDisplay();assertSourceSums(next);
 assert.ok(!next.sources.some(x=>['blind','chalk'].includes(x.id)));assert.equal(required(next.sources.find(x=>x.id==='sword-great')).added,4);
});
test('inherited success tickets retain their mechanism contribution after the origin relic is discarded',()=>{
 const g=setup();g.state.inheritanceTickets=4;const successor=required(g.state.swords.find(w=>w.id!==current(g).id));g.pickupSword(successor.id);g.heat();g.placeSword(successor.id,'anvil');g.state.relics=[];
 const data=g.ticketDisplay();assertSourceSums(data);assert.equal(required(data.rows.find(x=>x.id==='success')).mechanicAdded,4);assert.equal(required(data.sources.find(x=>x.id==='sword-success')).added,4);
});
test('source accounting conserves every ticket across 500 seeded mixed builds without altering state',()=>{
 const random=rng(909),g=setup();for(let i=0;i<500;i++){
  g.state.relics=g.sample(RELICS.map(r=>r.id),8);Object.assign(current(g),{level:Math.floor(random()*100),charge:Math.floor(random()*11),previous:random()<.5?'hold':'success',blind:random()<.5?3:0,chalk:random()<.5,successTickets:Math.floor(random()*8),greatTickets:Math.floor(random()*8)});
  for(const key of OUTCOMES)g.state.runTickets[key]=Math.floor(random()*5);g.state.grudgeTickets=Math.floor(random()*8);
  const before=JSON.stringify(g.state),data=g.ticketDisplay();assertSourceSums(data);assert.equal(JSON.stringify(g.state),before);
 }
});
