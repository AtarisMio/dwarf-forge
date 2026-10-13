import type {GameState,SwordState,SwordLocation,SwordTypeId,SwordBonusKind,RelicId,RelicDefinition,TicketPile,TicketSource,TicketEffect,TicketDisplay,RawTicketData,Outcome,StrikeOutcome,StrikeResult,ActionFailure,Position} from './game-types.ts';
import {OUTCOMES,isRecord,isOutcome} from './game-types.ts';
import {getSwordForm,SWORD_ROUTES} from './sword-evolution.ts';
import {RULES,quota,BREAK_CURVE,BASE_TICKETS,STARTER_POOL,SHOP_WEIGHTS,RELICS,ITEMS,SWORD_TYPES} from './rules.ts';
export {RELICS,ITEMS,SWORD_TYPES};
export const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
const clone=<T,>(x:T):T=>structuredClone(x),clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n)),cap=(n:number)=>Math.min(RULES.valueCap,Math.max(0,Math.round(n))),fail=(message:string):ActionFailure=>({ok:false,message});
const locations=['hands','anvil','rack','floor','tribute'],unique=(a:unknown):a is unknown[]=>Array.isArray(a)&&new Set(a).size===a.length;
export class ForgeGame {
 state:GameState;random:()=>number;undo:GameState|null;
 constructor(saved?:GameState,random:()=>number=Math.random){
  this.random=random;this.undo=null;
  this.state=saved??{version:2,day:1,status:'running',contractCleared:false,due:quota(1),offered:0,scrapOffered:0,gold:RULES.startingGold,anger:0,swords:[],selected:null,carriedId:null,anvilId:null,nextId:1,relics:[],swordCredits:0,shop:{ids:[],displayIds:[],rerolls:0,freeRerolls:0},merchant:{day:1,stock:[]},items:{scale:0,rewind:0,chalk:0,powder:0,star:0,delivery:0,incense:0},discoveries:[],unlocks:[],clock:0,frenzyUntil:0,frenzySwordId:null,nextStrikeAt:0,inheritance:0,inheritanceCharge:0,nextSupply:0,ledgerSupply:0,inheritanceTickets:0,supplyLevel:0,testamentLevel:0,hookReady:false,hookUsed:false,incenseUsed:false,wireUsed:false,freeRelic:true,startingRelics:[],runTickets:{break:0,damage:0,hold:0,success:0,great:0},grudgeTickets:0,stats:{strikes:0,broken:0,great:0,paid:0,peak:320,frenzies:0,merchantBuys:0,endlessPaid:0},history:[]};
  if(!saved){this.supply(3);this.state.startingRelics=this.sample(STARTER_POOL,3);this.state.shop.ids=[...this.state.startingRelics];this.state.shop.displayIds=[...this.state.shop.ids];this.discoverShop();}
 }
 get swordCoins(){return this.state.swordCredits;}
 get current(){return this.state.swords.find(w=>w.id===this.state.selected)??null;}
 get isFrenzy(){return !!this.current&&this.current.id===this.state.frenzySwordId&&this.state.frenzyUntil>this.state.clock;}
 get merchantAvailable(){return this.state.status==='running'&&this.state.day>=3&&this.state.day%3===0;}
 get relicOffers(){return this.state.shop.displayIds.map(id=>this.state.shop.ids.includes(id)?RELICS.find(r=>r.id===id)??null:null);}
 get availableRelics(){return this.state.shop.ids.map(id=>RELICS.find(r=>r.id===id)).filter((r):r is RelicDefinition=>r!==undefined);}
 get merchantStock(){return this.merchantAvailable?this.state.merchant.stock:[];}
 get rerollCost(){return this.state.shop.freeRerolls>0?0:Math.min(RULES.goldCap,Math.round(Math.max(150,quota(this.state.day)*RULES.rerollQuotaRate)*RULES.rerollGrowth**this.state.shop.rerolls));}
 get strikeInterval(){return RULES.strikeMs/(1+(this.has('grip')?.15:0)+(this.isFrenzy&&this.has('bellows')?.3:0)+(!this.isFrenzy&&this.has('leather')?.2:0));}
 get hammerInterval(){return this.strikeInterval;}
 get canUndo(){return !!this.undo&&this.state.items.rewind>0&&this.state.status==='running';}
 has(id:string){return this.state.relics.some(relic=>relic===id);}
 sample<T>(pool:readonly T[],count:number):T[]{const a=[...pool],out=[];while(a.length&&out.length<count)out.push(a.splice(Math.min(a.length-1,Math.floor(clamp(this.random(),0,.999999)*a.length)),1)[0]);return out;}
 discover(key:string){if(!this.state.discoveries.includes(key))this.state.discoveries.push(key);}
 unlock(id:RelicId){if(!this.state.unlocks.includes(id))this.state.unlocks.push(id);}
 discoverShop(){this.state.shop.ids.forEach(id=>this.discover('relic:'+id));}
 touch(){this.undo=null;}
 effectiveBase(w:SwordState){return w.base+(this.has('charcoal')?80:0)+(this.has('hearth')?20*this.state.stats.paid:0);}
 bonus(w:SwordState,kind:SwordBonusKind,amount:number){if(kind==='multiplier')w.multiplier=Math.min(RULES.valueCap,w.multiplier*amount);else w[kind]=cap(w[kind]+amount);w.lastBonus={kind,amount};}
 milestones(w:SwordState){if(this.has('idol'))for(let n=4;n<=w.level;n+=4)if(!w.idolStages.includes(n)){w.idolStages.push(n);this.bonus(w,'multiplier',1.15);}}
 recalc(w:SwordState){this.milestones(w);const shelf=(this.has('signet')?1.15:1)*(this.has('thorn')?1.1:1)*(this.has('blackstone')&&w.level>=8?1.3:1)*(this.has('dragon-signet')&&w.level>=12?1.5:1);w.value=cap((this.effectiveBase(w)*1.5**w.level+w.flat)*w.multiplier*shelf);w.peak=Math.max(w.peak,w.value);this.state.stats.peak=Math.max(this.state.stats.peak,w.value);w.appearanceLevel=Math.max(w.appearanceLevel??w.level,w.level);const form=getSwordForm(w);w.name=form.name;this.discover('sword:'+form.family);this.discover(`sword:${form.family}:${form.level}`);if(w.level>=20){const key=({citadel:'cornerstone',holy:'scabbard',sawblade:'driveshaft',dragonfang:'dragon-heart',runeblade:'mana',splitblade:'twins',worldtree:'seed',fishblade:'pearl',funerary:'ledger'} as const)[w.typeKey];if(key)this.unlock(key);}}
 createSword(typeKey:string,level=0){
  const type=SWORD_TYPES.find(t=>t.id===typeKey)??SWORD_TYPES[0];
  const w:SwordState={id:this.state.nextId++,typeKey:type.id,name:type.name,base:type.base,value:type.base,peak:type.base,level:clamp(level,0,99),appearanceLevel:clamp(level,0,99),heat:this.has('lifetime')?100:0,charge:0,ward:false,forged:false,location:'floor',position:{x:1.3+(this.state.nextId%3)*.25,y:.15,z:1.5},flat:0,multiplier:1,ashUsed:false,damageCount:0,holdStreak:0,successStreak:0,blind:0,splice:0,scorched:0,heartBonus:0,sealBonus:0,previous:null,successTickets:0,windBonus:0,matchStreak:0,idolStages:[],lastBonus:null,spineCount:0,spineShield:false,locketUsed:false,greatTickets:0,cornerUsed:false,successCount:0,scale:false,chalk:false,powder:false};
  this.applyInheritance(w);this.recalc(w);this.state.swords.push(w);if(!this.current)this.state.selected=w.id;return w;
 }
 supply(count:number){let lanes:typeof SWORD_ROUTES[number][]=[];for(let i=0;i<count;i++){if(i%3===0)lanes=this.sample(SWORD_ROUTES,3);const typeKey=this.sample(lanes[i%3].families,1)[0];this.createSword(typeKey,Math.max(this.has('lifetime')?7:0,this.state.supplyLevel??0,i===0?this.state.testamentLevel??0:0));}this.state.supplyLevel=0;this.state.testamentLevel=0;}
 applyInheritance(w:SwordState|null){if(!w||w.location==='tribute'||w.forged||w.level!==0||!(this.state.inheritance>0||this.state.inheritanceCharge>0||this.state.inheritanceTickets>0))return;w.successTickets+=this.state.inheritanceTickets;this.state.inheritanceTickets=0;w.level=Math.min(99,this.state.inheritance);w.charge=Math.min(10,w.charge+this.state.inheritanceCharge);this.state.inheritance=0;this.state.inheritanceCharge=0;this.recalc(w);}
 endFrenzy(expired=false){const w=this.state.swords.find(w=>w.id===this.state.frenzySwordId);if(expired&&w?.location==='anvil'&&this.has('headless')){w.level=Math.min(99,w.level+1);this.recalc(w);}this.state.frenzyUntil=0;this.state.frenzySwordId=null;}
 select(id:number){const w=this.state.swords.find(w=>w.id===id);if(!w)return fail('这把剑已经离开工坊。');if(this.state.status!=='running')return fail('合约已结束。');if(this.state.selected!==id){this.endFrenzy();this.touch();}this.state.selected=id;if(w.location!=='tribute')this.applyInheritance(w);return {ok:true as const};}
 pickupSword(id:number){const w=this.state.swords.find(w=>w.id===id);if(!w||this.state.status!=='running')return fail('无法取走这把剑。');this.touch();const held=this.state.swords.find(w=>w.id===this.state.carriedId);if(held&&held.id!==id){held.location='floor';held.position={x:0,y:.15,z:0};}if(w.id===this.state.anvilId){this.state.anvilId=null;this.endFrenzy();}this.select(id);w.location='hands';delete w.position;this.state.carriedId=id;this.applyInheritance(w);this.refreshOffered();return {ok:true as const,sword:w};}
 placeSword(id:number,location:SwordLocation,position?:Position){
  const w=this.state.swords.find(w=>w.id===id);if(!w||this.state.status!=='running'||!locations.includes(location))return fail('无法放置这把剑。');if(location==='hands')return this.pickupSword(id);
  if(location==='rack'&&w.location!=='rack'&&this.state.swords.filter(s=>s.location==='rack').length>=RULES.rackSlots)return fail('剑架的三格已经放满。');
  if(position&&!(['x','y','z'] as const).every(k=>Number.isFinite(position[k])&&Math.abs(position[k])<100))return fail('无效的放置位置。');
  this.touch();if(this.state.carriedId===id)this.state.carriedId=null;
  if(location==='anvil'){const old=this.state.swords.find(s=>s.id===this.state.anvilId);if(old&&old.id!==id){old.location='floor';old.position={x:0,y:.15,z:-1};}this.state.anvilId=id;this.select(id);this.applyInheritance(w);}else if(this.state.anvilId===id)this.state.anvilId=null;
  w.location=location;if(position)w.position={...position};else delete w.position;
  if(location!=='anvil'&&this.state.frenzySwordId===id)this.endFrenzy();this.refreshOffered();return {ok:true as const,sword:w};
 }
 takeAnvil(){return this.state.anvilId?this.pickupSword(this.state.anvilId):fail('铁砧上没有剑。');}
 heat(){const w=this.current;if(!w||w.location==='tribute'||this.state.status!=='running')return fail('先取一把剑到炉火。');this.touch();w.heat=100;return {ok:true as const};}
 refreshOffered(){this.state.offered=cap(this.state.scrapOffered+this.state.swords.filter(w=>w.location==='tribute').reduce((v,w)=>v+w.value,0));}
 remove(id:number){const w=this.state.swords.find(w=>w.id===id);this.state.swords=this.state.swords.filter(w=>w.id!==id);if(this.state.carriedId===id)this.state.carriedId=null;if(this.state.anvilId===id)this.state.anvilId=null;if(this.state.frenzySwordId===id)this.endFrenzy();if(!this.current){this.state.selected=this.state.swords.find(w=>w.location!=='tribute')?.id??this.state.swords[0]?.id??null;this.applyInheritance(this.current);}if(w?.location==='tribute')this.refreshOffered();}
 rawTicketData(w:SwordState|null):RawTicketData{
  const base:TicketPile={...BASE_TICKETS},t:TicketPile={...base},added:TicketPile={break:0,damage:0,hold:0,success:0,great:0},removed={...added};
  const relicAdded={...added},relicRemoved={...added},mechanicAdded={...added},mechanicRemoved={...added},sources:TicketSource[]=[];
  const labels:Record<string,string>={blind:'盲骰','run-tickets':'本局永久票','sword-success':'该剑成长与继承票','sword-great':'该剑累积大成功票'};
  const record=(outcome:Outcome,n:number,id:string,kind:TicketSource['kind'],direction:'added'|'removed')=>{
   if(!n)return;
   const counts=kind==='relic'?(direction==='added'?relicAdded:relicRemoved):(direction==='added'?mechanicAdded:mechanicRemoved);counts[outcome]+=n;
   sources.push({id,label:labels[id]??RELICS.find(r=>r.id===id)?.name??ITEMS.find(item=>item.id===id)?.name??id,kind,outcome,added:direction==='added'?n:0,removed:direction==='removed'?n:0});
  };
  const add=(key:Outcome,n:number,id:string,kind:TicketSource['kind']='relic')=>{t[key]+=n;added[key]+=n;record(key,n,id,kind,'added');},remove=(key:Outcome,n:number,id:string,kind:TicketSource['kind']='relic')=>{t[key]-=n;removed[key]+=n;record(key,n,id,kind,'removed');};
  const protectedHit=!!w&&(w.id===this.state.frenzySwordId&&this.state.frenzyUntil>this.state.clock||w.charge>=10);
  if(this.has('sickle'))for(const key of OUTCOMES){const difference=5-t[key];if(difference>=0)add(key,difference,'sickle');else remove(key,-difference,'sickle');}
  for(const key of OUTCOMES)add(key,this.state.runTickets[key]??0,'run-tickets','mechanic');
  add('success',this.has('bent')?4:0,'bent');add('success',this.has('spike')?6:0,'spike');add('success',w?.successTickets??0,'sword-success','mechanic');add('success',this.has('third-eye')&&w?.previous==='hold'?4:0,'third-eye','mechanic');
  add('great',this.has('coal')?1:0,'coal');add('great',this.has('nail')?2:0,'nail');add('great',this.has('oracle')?4:0,'oracle');add('great',protectedHit&&this.has('mana')?6:0,'mana','mechanic');add('great',w?.blind??0,'blind','mechanic');add('great',w?.greatTickets??0,'sword-great','mechanic');add('great',this.state.grudgeTickets,'grudge','mechanic');
  add('hold',this.has('seed')?6:0,'seed');add('hold',this.has('weight')?3:0,'weight');add('hold',this.has('stone')?2:0,'stone');add('damage',this.has('pearl')?3:0,'pearl');add('break',this.has('butterfingers')?3:0,'butterfingers');remove('break',this.has('hoop')?2:0,'hoop');add('great',this.has('butterfingers')?5:0,'butterfingers');
  if(this.has('thorn')){const n=Math.min(2,t.hold);remove('hold',n,'thorn');add('damage',n,'thorn');}if(this.has('obsidian')&&(w?.level??0)>=8){const n=Math.min(2,t.success);remove('success',n,'obsidian','mechanic');add('great',n,'obsidian','mechanic');}
  if(this.has('mallet')){const n=Math.min(1,t.damage);remove('damage',n,'mallet');add('success',n,'mallet');}if(this.has('whetstone')){const n=Math.min(2,t.hold);remove('hold',n,'whetstone');add('success',n,'whetstone');}if(w?.chalk)add('great',t.great,'chalk','mechanic');
  return {base,t,added,removed,relicAdded,relicRemoved,mechanicAdded,mechanicRemoved,sources,protectedHit};
 }
 ticketDisplay(sword:SwordState|null=this.current):TicketDisplay{
  const active=!!sword&&sword.location==='anvil'&&sword.id===this.state.anvilId;
  const zero:TicketPile={break:0,damage:0,hold:0,success:0,great:0};const data:RawTicketData=active?this.rawTicketData(sword):{base:{...BASE_TICKETS},t:{...BASE_TICKETS},added:{...zero},removed:{...zero},relicAdded:{...zero},relicRemoved:{...zero},mechanicAdded:{...zero},mechanicRemoved:{...zero},sources:[],protectedHit:false};
  const labels:Record<Outcome,string>={break:'碎裂',damage:'损伤',hold:'保持',success:'成功',great:'大成功'},temporary:TicketEffect[]=[];
  if(active){
   if(sword.blind)temporary.push({id:'blind',label:`盲骰：下一锤大成功 +${sword.blind} 票`});
   if(sword.greatTickets)temporary.push({id:'kingcup',label:`该剑累积大成功 +${sword.greatTickets} 票`});
   if(this.state.grudgeTickets)temporary.push({id:'grudge',label:`怨钉：下一锤大成功 +${this.state.grudgeTickets} 票`});
   if(sword.chalk)temporary.push({id:'chalk',label:'红粉笔：下一锤大成功票翻倍'});
   if(this.has('third-eye')&&sword.previous==='hold')temporary.push({id:'third-eye',label:'第三眼：下一锤成功 +4 票'});
   if(data.protectedHit)temporary.push({id:'frenzy',label:'入神：加权后碎裂归零'});
   if(sword.powder&&!data.protectedHit)temporary.push({id:'powder',label:'火药：加权后成功→大成功，损伤/保持→碎裂'});
   if(sword.scale)temporary.push({id:'scale',label:'龙鳞：下一锤碎裂结果转保持'});
   if(sword.ward&&this.has('mark'))temporary.push({id:'mark',label:'闪电印记：下一锤碎裂概率 ×0.6'});
  }
  return {active,swordId:active?sword.id:null,swordName:active?sword.name:null,rows:OUTCOMES.map(id=>({id,label:labels[id],base:data.base[id],added:data.added[id]??0,removed:data.removed[id]??0,total:data.t[id],relicAdded:data.relicAdded?.[id]??0,relicRemoved:data.relicRemoved?.[id]??0,mechanicAdded:data.mechanicAdded?.[id]??0,mechanicRemoved:data.mechanicRemoved?.[id]??0})),sources:data.sources??[],temporary};
 }
 odds(){
  const w=this.current,level=w?.level??0,{t,protectedHit}=this.rawTicketData(w);
  const b=BREAK_CURVE[Math.min(level,30)],weight=b===0?0:b*21/(9*(1-b));t.break=Math.max(0,t.break)*weight;if(protectedHit)t.break=0;
  if(w?.powder&&!protectedHit){t.break+=t.damage+t.hold;t.great+=t.success;t.damage=0;t.hold=0;t.success=0;}
  const sum=Object.values(t).reduce((a,b)=>a+b,0),p:TicketPile={...t};for(const k of OUTCOMES)p[k]=t[k]/sum;
  const original=p.break;p.break*=(this.has('knot')?.9:1)*(this.has('tongs')&&level>=6?.75:1)*(this.has('mark')&&w?.ward?.6:1)*(this.has('red-thread')&&w?.previous==='hold'?.8:1)*(1-(w?.splice??0))*(1-(w?.scorched??0));
  for(const k of ['damage','hold','success','great'] as const)p[k]*=(1-p.break)/(1-original||1);
  const ranked=OUTCOMES.map((k,i)=>({k,i,n:Math.floor(p[k]*1000),f:p[k]*1000%1}));let spare=1000-ranked.reduce((a,b)=>a+b.n,0);for(const r of [...ranked].sort((a,b)=>b.f-a.f||a.i-b.i)){if(spare--<=0)break;r.n++;}for(const r of ranked)p[r.k]=r.n/1000;return p;
 }
 strike(random:()=>number=this.random):StrikeResult{
  const s=this.state,w=this.current;if(s.status!=='running')return fail('合约已结束。');if(!w||w.location!=='anvil'||s.anvilId!==w.id)return fail('先把剑放上铁砧。');if(!w.heat&&!this.has('lifetime'))return fail('先在炉火加热；每把剑只需一次。');if(w.level>=99)return fail('这把剑已达到 +99，无法继续强化。');if(s.clock<s.nextStrikeAt)return fail('等待锤子完成这一击。');
  const roll=random();if(!Number.isFinite(roll))return fail('无效的敲击抽签。');this.undo=clone(s);const before=w.value,first=!w.forged,previous=w.previous,oldLevel=w.level;w.lastBonus=null;let frenzyStarted=false;
  if(w.charge>=10&&!this.isFrenzy){s.frenzyUntil=s.clock+RULES.frenzyMs+(this.has('hourglass')?1000:0)+(this.has('ember')?2000:0);s.frenzySwordId=w.id;w.charge=0;s.stats.frenzies++;frenzyStarted=true;if(s.stats.frenzies>=5)this.unlock('ember');}
  const frenzy=this.isFrenzy;let n=clamp(roll,0,.999999999),outcome:StrikeOutcome='great';const odds=this.odds();for(const k of OUTCOMES){n-=odds[k];if(n<0){outcome=k;break;}}
  s.nextStrikeAt=s.clock+this.strikeInterval;s.stats.strikes++;w.forged=true;w.ward=false;w.blind=0;s.grudgeTickets=0;w.chalk=false;const protectedScale=w.scale;w.scale=false;w.powder=false;if(!frenzy){w.charge=Math.min(10,w.charge+1);if(this.has('locket')&&!w.locketUsed){w.charge=Math.min(10,w.charge+2);w.locketUsed=true;}}
  let spineProtected=false;if(outcome==='break'&&this.has('spine')&&w.spineShield){w.spineShield=false;spineProtected=true;outcome='damage';}if(outcome==='break'&&protectedScale)outcome='hold';if(outcome==='break'&&this.has('wire')&&!s.wireUsed){s.wireUsed=true;outcome='damage';}if(outcome==='break'&&this.has('cornerstone')&&!w.cornerUsed){w.cornerUsed=true;outcome='damage';}if(outcome==='break'&&this.has('ash')&&!w.ashUsed){w.ashUsed=true;w.multiplier*=.6;outcome='saved';}
  if(outcome==='break'){
   if(this.has('molar')&&w.level>=4)s.inheritanceTickets+=4;if(this.has('sieve'))s.gold=Math.min(RULES.goldCap,s.gold+500);if(this.has('ossuary')&&w.level>=7&&isOutcome(w.previous))s.runTickets[w.previous]++;
   if(this.has('chalice')){s.scrapOffered=cap(s.scrapOffered+Math.floor(w.peak*.3));this.refreshOffered();}const rate=(this.has('scabbard')?.4:0)+(this.has('holy-sword')?.3:0);if(rate){s.inheritance=Math.floor(w.level*rate);s.inheritanceCharge=(this.has('scabbard')?4:0)+(this.has('holy-sword')?3:0);}if(this.has('grudge'))s.grudgeTickets+=w.level;
   if(this.has('ledger')&&w.level>=7&&s.ledgerSupply<2){s.ledgerSupply++;s.nextSupply++;}s.stats.broken++;if(s.stats.broken>=10)this.unlock('butterfingers');this.remove(w.id);this.refreshOffered();return {ok:true as const,outcome,value:before,delta:-before,frenzyStarted:false,sword:{...w}};
  }
  if(outcome==='damage'){w.damageCount++;if(this.has('apron'))this.bonus(w,'flat',140);if(this.has('comb'))this.bonus(w,'flat',this.effectiveBase(w)*1.5**oldLevel*.05);if(this.has('spine')&&!spineProtected){w.spineCount++;if(w.spineCount%2===0)w.spineShield=true;}if(!(this.has('pearl')&&w.damageCount<=2))w.level=Math.max(0,w.level-1);if(this.has('crown')&&oldLevel>w.level)this.bonus(w,'flat',this.effectiveBase(w)*(1.5**oldLevel-1.5**w.level)*.5);if(this.has('splice'))w.splice=Math.min(.6,w.splice+.15);if(this.has('kingseal'))w.sealBonus++;if(!frenzy&&this.has('watch'))w.charge=Math.min(10,w.charge+1);if(this.has('oath')&&random()<.7)w.level=Math.min(99,w.level+1);}
  if(outcome==='hold'){w.holdStreak++;if(this.has('kingcup'))w.greatTickets++;if(this.has('seed'))this.bonus(w,'base',40);if(this.has('paperweight'))this.bonus(w,'flat',180);if(this.has('teacup'))this.bonus(w,'multiplier',1.06);if(this.has('windbell'))w.windBonus=Math.min(2,w.windBonus+1);if(this.has('heart'))w.heartBonus=Math.min(4,w.heartBonus+1);if(this.has('stone')&&w.holdStreak%2===0)w.level=Math.min(99,w.level+1);if(this.has('sleeping')&&random()<.7)w.level=Math.min(99,w.level+1);if(!frenzy&&this.has('chained')&&random()<.5)w.charge=Math.min(10,w.charge+1);}else w.holdStreak=0;
  if(outcome==='success'||outcome==='great'){let levels=outcome==='great'?2:1;if(first&&this.has('brand'))levels+=2;if(previous==='damage'&&this.has('interlock'))levels+=2;if(this.has('third-hand')&&(w.successStreak+1)%2===0)levels++;if(this.has('echo')&&random()<.25)levels++;if(outcome==='success'){levels+=w.windBonus;w.windBonus=0;if(this.has('bronze'))w.successTickets++;if(this.has('golden'))this.bonus(w,'base',30);}if(outcome==='great'&&!frenzy&&this.has('tuning'))levels++;if(outcome==='success'){w.successCount++;if(this.has('driveshaft')&&w.successCount%2===0)levels++;}if(outcome==='great'){levels+=w.heartBonus+w.sealBonus+(frenzy&&this.has('glass')?3:0);w.heartBonus=0;w.sealBonus=0;w.multiplier*=2.5/2.25;s.stats.great++;}w.level=Math.min(99,w.level+levels);w.successStreak++;if(this.has('stamp'))this.bonus(w,'flat',100);if(outcome==='great'&&this.has('cracked-bell'))this.bonus(w,'multiplier',1.2);if(this.has('double-knot')&&w.successStreak%2===0)this.bonus(w,'multiplier',1.1);if(this.has('dragon-heart')&&w.level>=7)this.bonus(w,'multiplier',1.15);if(!frenzy&&this.has('scorched'))w.scorched=Math.min(.18,w.scorched+.03);if(!frenzy&&outcome==='great'&&this.has('mark'))w.ward=true;}else w.successStreak=0;
  if(this.has('die')&&(outcome==='damage'||outcome==='hold'))w.blind=3;if(this.has('censer')&&previous!==null&&previous!==outcome)this.bonus(w,'base',20);w.matchStreak=previous===outcome?w.matchStreak+1:1;if(this.has('wax')&&w.matchStreak%2===0)this.bonus(w,'flat',150);this.milestones(w);if(frenzy&&this.has('bell'))this.bonus(w,'multiplier',1.05);if(this.has('mirror')&&w.matchStreak%2===0&&w.lastBonus){const {kind,amount}=w.lastBonus;this.bonus(w,kind,amount);}w.previous=outcome;this.recalc(w);if(this.has('twins')&&random()<.02){const copy=clone(w);copy.id=s.nextId++;copy.location='floor';copy.position={x:0,y:.15,z:0};s.swords.push(copy);}return {ok:true as const,outcome,value:w.value,delta:w.value-before,frenzyStarted,sword:{...w},first};
 }
 tick(ms:number){if(this.state.status!=='running'||!Number.isFinite(ms))return;this.state.clock+=clamp(ms,0,10000);if(this.state.clock>=this.state.frenzyUntil&&this.state.frenzySwordId!==null)this.endFrenzy(true);}
 offer(id:number){const w=this.state.swords.find(w=>w.id===id);if(!w)return fail('贡台上没有这把剑。');const r=this.placeSword(id,'tribute');return r.ok?{ok:true as const,value:w.value,name:w.name}:r;}
 depositSword(id:number){const w=this.state.swords.find(w=>w.id===id);if(!w||w.location==='tribute'||this.state.status!=='running')return fail('无法把这把剑投入投剑口兑换剑币。');this.touch();this.remove(id);let credits=1;if(this.has('hook')&&this.state.hookReady&&!this.state.hookUsed&&!w.forged&&w.level===0){credits=2;this.state.hookUsed=true;this.state.hookReady=false;}this.state.swordCredits+=credits;return {ok:true as const,credits:this.state.swordCredits,coins:this.swordCoins};}
 rollShop(){const pool=RELICS.filter(r=>this.eligible(r)),out:RelicId[]=[];while(pool.length&&out.length<3){const groups=(['common','rare','legendary'] as const).filter(k=>pool.some(r=>r.rarity===k));let n=this.random()*groups.reduce((a,k)=>a+SHOP_WEIGHTS[k],0),group=groups[groups.length-1];for(const k of groups){n-=SHOP_WEIGHTS[k];if(n<0){group=k;break;}}const candidates=pool.filter(r=>r.rarity===group),weight=(r:RelicDefinition)=>this.state.day<=6&&['knot','hoop','chalice','holy-sword','splice','wire'].includes(r.id)?SHOP_WEIGHTS.earlyDefense:1;let ticket=this.random()*candidates.reduce((a,r)=>a+weight(r),0),chosen=candidates[candidates.length-1];for(const r of candidates){ticket-=weight(r);if(ticket<0){chosen=r;break;}}out.push(chosen.id);pool.splice(pool.indexOf(chosen),1);}return out;}
 eligible(r:RelicDefinition){return !this.has(r.id)&&this.state.day>=r.minDay&&(!r.unlock||this.state.unlocks.includes(r.unlock));}
 newShop(){this.state.shop={ids:this.rollShop(),displayIds:[],rerolls:0,freeRerolls:this.has('voucher')?1:0,voucherClaimed:this.has('voucher')};this.state.shop.displayIds=[...this.state.shop.ids];this.discoverShop();}
 rerollShop(){if(this.state.status!=='running'||this.state.freeRelic||this.state.day===1)return fail('初始赠礼不能刷新。');const cost=this.rerollCost;if(this.state.gold<cost)return fail(`需要 ${money(cost)} G。`);this.touch();if(this.state.shop.freeRerolls>0)this.state.shop.freeRerolls--;else{this.state.gold-=cost;this.state.shop.rerolls++;}this.state.shop.ids=this.rollShop();this.state.shop.displayIds=[...this.state.shop.ids];if(this.has('hook')&&!this.state.hookUsed)this.state.hookReady=true;this.discoverShop();return {ok:true as const,cost};}
 claimFreeRelic(id:string){const relic=RELICS.find(r=>r.id===id);if(!relic)return fail('这件遗物不在初始赠礼中。');const relicId=relic.id;if(this.state.status!=='running'||!this.state.freeRelic||!this.state.startingRelics.includes(relicId)||this.has(id))return fail('这件遗物不在初始赠礼中。');this.touch();this.state.freeRelic=false;this.state.startingRelics=[];this.state.shop.ids=[];this.state.shop.displayIds=[];this.state.relics.push(relicId);this.discover('relic:'+id);this.relicChanged();return {ok:true as const,relic};}
 buyRelic(id:string,swordIds:readonly number[]=[]){
  if(!Array.isArray(swordIds)||swordIds.length)return fail('请先把剑投入投剑口兑换剑币，再购买遗物。');
  const r=RELICS.find(r=>r.id===id),s=this.state;
  if(!r||s.status!=='running'||s.freeRelic||s.day===1||!s.shop.ids.includes(r.id)||!this.eligible(r))return fail('这件遗物当前无法购买。');
  if(s.relics.length>=RULES.slots)return fail('八格遗物架已满，先丢弃一件。');
  if(s.swordCredits<r.cost)return fail(`需要 ${r.cost} 枚剑币，当前有 ${s.swordCredits} 枚。`);
  this.touch();s.swordCredits-=r.cost;s.relics.push(r.id);s.shop.ids=s.shop.ids.filter(x=>x!==id);this.discover('relic:'+id);this.relicChanged();return {ok:true as const,relic:r};
 }
 relicChanged(){for(const w of this.state.swords)this.recalc(w);this.refreshOffered();this.state.due=cap(quota(this.state.day)*(this.has('rebate')?.9:1)-(this.state.taxCredit??0));if(this.has('voucher')&&!this.state.shop.voucherClaimed){this.state.shop.freeRerolls++;this.state.shop.voucherClaimed=true;}}
 discardRelic(id:string){if(!this.has(id)||this.state.status!=='running')return fail('没有这件遗物。');this.touch();this.state.relics=this.state.relics.filter(x=>x!==id);this.relicChanged();return {ok:true as const};}
 newMerchant(){
  const s=this.state;s.merchant={day:s.day,stock:[]};if(s.day<3||s.day%3!==0)return;const visit=s.day/3,basic=visit===1?2:visit<=3?3:visit<=7?4:5,price=(rate:number)=>Math.round(quota(s.day)*rate/10)*10;
  const type=this.sample(SWORD_TYPES.filter(t=>t.merchant),1)[0],level=s.day<9?0:s.day<15?2:4;s.merchant.stock=[{id:'basic',name:'基础剑',kind:'sword',typeKey:'random',level:0,price:Math.max(700,price(.4)),remaining:basic+(this.has('supply-writ')?2:0),purchased:0},{id:'special',name:type.name,kind:'sword',typeKey:type.id,level,price:Math.max(1100,price(.65))*1.75*1.5**level,remaining:1,purchased:0}];
  this.discover('sword:'+type.id);const count=(s.day<6?4:s.day<15?5:6)+(this.has('ghost-ledger')?2:0)-2,pool=ITEMS.filter(i=>i.minDay<=s.day&&(i.id!=='incense'||!s.incenseUsed&&s.anger>0));const selected=s.day===3?ITEMS.filter(i=>['scale','rewind'].includes(i.id)):this.sample(pool,count);
  selected.forEach(i=>{s.merchant.stock.push({id:i.id,itemId:i.id,name:i.name,kind:i.instant?'instant':'item',price:Math.max(i.minPrice,price(i.rate)),remaining:i.stock,purchased:0});this.discover('item:'+i.id);});s.merchant.stock.forEach(r=>{r.price=Math.round(r.price/10)*10;});
 }
 buyMerchant(id:string){const s=this.state,row=this.merchantStock.find(r=>r.id===id);if(!row||row.remaining<=0||!this.merchantAvailable)return fail('幽灵商人不在，或这件商品已售罄。');if(s.gold<row.price)return fail(`需要 ${money(row.price)} G。`);if(row.kind==='sword'&&s.carriedId!==null)return fail('先放下手中的剑。');this.touch();s.gold-=row.price;row.remaining--;row.purchased++;row.price=Math.min(RULES.goldCap,Math.round(row.price*RULES.merchantRepeat));s.stats.merchantBuys++;
  if(row.kind==='sword'){const type=row.typeKey==='random'?this.sample(SWORD_TYPES.filter(t=>!t.merchant),1)[0].id:row.typeKey,w=this.createSword(type,row.level);this.pickupSword(w.id);}else if(id==='delivery')s.nextSupply+=2;else if(id==='incense'){s.anger=Math.max(0,s.anger-1);s.incenseUsed=true;}else s.items[row.itemId]++;
  if(s.merchant.stock.every(r=>r.remaining===0))this.unlock('ghost-ledger');return {ok:true as const,row:{...row}};
 }
 buySword(){return this.buyMerchant('basic');}
 useItem(id:string){if(id==='rewind')return this.undoStrike();const s=this.state,w=this.current,i=ITEMS.find(i=>i.id===id);if(!i||i.instant||s.status!=='running'||!w||w.location!=='anvil'||s.items[i.id]<=0)return fail('铁砧上没有可使用的这件物品。');if(this.isFrenzy&&['scale','powder','star'].includes(id))return fail('狂热期间不能使用这件物品。');const key=i.id==='scale'||i.id==='chalk'||i.id==='powder'?i.id:null;if(key&&w[key])return fail('这件效果已准备于下一锤。');if(id==='star'&&w.charge>=10)return fail('狂热已经蓄满。');this.touch();s.items[i.id]--;if(id==='star')w.charge=Math.min(10,w.charge+3);else if(key)w[key]=true;return {ok:true as const};}
 undoStrike(){if(!this.canUndo)return fail('当前没有可回溯的敲击或钟表。');const clock=this.state.clock,rewind=this.state.items.rewind-1,discoveries=this.state.discoveries,unlocks=this.state.unlocks;this.state=clone(this.undo!);this.state.clock=clock;this.state.items.rewind=Math.min(rewind,this.state.items.rewind);this.state.discoveries=[...new Set([...this.state.discoveries,...discoveries])];this.state.unlocks=[...new Set([...this.state.unlocks,...unlocks])];this.undo=null;if(this.state.frenzyUntil<=clock)this.endFrenzy();return {ok:true as const};}
 nextDay(){const s=this.state;s.day++;s.taxCredit=Math.min(s.nextTaxCredit??0,quota(s.day)*.3);s.nextTaxCredit=0;s.due=cap(quota(s.day)*(this.has('rebate')?.9:1)-s.taxCredit);s.wireUsed=false;s.ledgerSupply=0;s.freeRelic=false;s.startingRelics=[];s.hookReady=false;s.hookUsed=false;this.supply(3+s.nextSupply+(this.has('permit')?1:0));s.nextSupply=0;this.newShop();this.newMerchant();}
 settle(){const s=this.state;if(s.status!=='running')return fail('合约已结束。');this.touch();this.refreshOffered();const paid=s.offered>=s.due,surplus=Math.max(0,s.offered-s.due),summary={ok:true as const,paid,day:s.day,offered:s.offered,due:s.due,surplus};s.history.push(summary);s.gold=Math.min(RULES.goldCap,s.gold+s.offered);
  if(paid){if(this.has('badge'))s.supplyLevel=2;if(this.has('testament'))s.testamentLevel=Math.floor(Math.max(0,...s.swords.filter(w=>w.location==='tribute'&&w.level>=10).map(w=>w.level))*.3);s.stats.paid++;if(this.has('tally'))s.swordCredits++;if(s.anger===2)this.unlock('pardon');if(surplus>=s.due*2)this.unlock('royal-change');if(s.contractCleared){s.stats.endlessPaid++;if(s.stats.endlessPaid>=3)this.unlock('lifetime');}if(this.has('royal-change'))s.nextTaxCredit=surplus*.3;}else{s.anger++;if(this.has('mourning'))s.runTickets.great++;}
  s.swords.filter(w=>w.location==='tribute').map(w=>w.id).forEach(id=>this.remove(id));s.scrapOffered=0;s.offered=0;for(const w of s.swords)this.recalc(w);this.endFrenzy();if(s.anger>=3&&this.has('pardon')){s.anger=2;s.relics=s.relics.filter(id=>id!=='pardon');}if(s.anger>=3)s.status='lost';else if(s.day===21&&!s.contractCleared){s.contractCleared=true;s.status='won';this.unlock('sickle');}else this.nextDay();return summary;
 }
 continueContract(){if(this.state.status!=='won'||!this.state.contractCleared)return fail('尚未完成合约。');this.touch();this.state.status='running';this.nextDay();return {ok:true as const};}
 static migrate(value:unknown):ForgeGame|null{
  if(!isRecord(value)||value.version!==1||!Array.isArray(value.swords)||!finiteInteger(value.day)||!num(value.gold,0,Infinity))return null;
  const oldSwords:unknown[]=value.swords;const day=value.day,gold=value.gold,s=value,g=new ForgeGame(),v=g.state;v.day=clamp(day,1,21);v.gold=Math.min(RULES.goldCap,gold);v.anger=clamp(integer(s.anger)?s.anger:0,0,3);v.status=v.anger>=3||s.status==='lost'?'lost':'running';if(v.status==='lost')v.anger=3;
  v.relics=[...new Set((Array.isArray(s.relics)?s.relics:[]).filter(isRelicId))].slice(0,8);v.freeRelic=s.freeRelic===true&&v.day===1&&v.relics.length===0;v.startingRelics=v.freeRelic?v.startingRelics:[];v.swords=[];v.selected=null;v.nextId=1;
  for(const old of oldSwords){if(!isRecord(old)||!finiteInteger(old.level)||!num(old.value,0,Infinity)||!num(old.charge??0,-Infinity,Infinity)||!num(old.heat??0,-Infinity,Infinity))return null;
   const charge=typeof old.charge==='number'?old.charge:0,heat=typeof old.heat==='number'?old.heat:0,w=g.createSword('splitblade',clamp(old.level,0,99));w.forged=old.level>0||charge>0;w.heat=heat>0?100:0;w.charge=clamp(Math.floor(charge),0,10);w.multiplier=Math.min(RULES.valueCap,Math.max(1,old.value/(w.base*1.5**w.level)));g.recalc(w);
  }
  v.scrapOffered=cap(num(s.offered,-RULES.goldCap)?s.offered:0);g.refreshOffered();v.inheritance=clamp(integer(s.inheritance,-RULES.goldCap)?s.inheritance:0,0,99);const inheritedCharge=s.inheritanceCharge??(v.inheritance?4:0);if(!num(inheritedCharge,-RULES.goldCap))return null;v.inheritanceCharge=clamp(inheritedCharge,0,10);
  g.relicChanged();if(v.day>1)g.newShop();else v.shop.ids=v.freeRelic?[...v.startingRelics]:[];v.shop.displayIds=[...v.shop.ids];g.newMerchant();v.migratedFrom=1;return g;
 }
 static restore(raw:unknown):ForgeGame|null{try{
  if(typeof raw!=='string')return null;const s:unknown=JSON.parse(raw);if(!isRecord(s))return null;if(s.version===1)return ForgeGame.migrate(s);if(s.version!==2)return null;
  if(isRecord(s.shop)&&Array.isArray(s.shop.ids)&&!Object.hasOwn(s.shop,'displayIds'))s.shop.displayIds=[...s.shop.ids];
  for(const [key,value] of Object.entries({inheritanceTickets:0,supplyLevel:0,testamentLevel:0,hookReady:false,hookUsed:false}))if(!Object.hasOwn(s,key))s[key]=value;
  if(Array.isArray(s.swords)){const savedSwords:unknown[]=s.swords;for(const w of savedSwords)if(isRecord(w)){
   if(!Object.hasOwn(w,'appearanceLevel'))w.appearanceLevel=w.level;
   for(const [key,value] of Object.entries({successTickets:0,windBonus:0,matchStreak:0,idolStages:[],lastBonus:null,spineCount:0,spineShield:false,locketUsed:false,greatTickets:0,cornerUsed:false,successCount:0}))if(!Object.hasOwn(w,key))w[key]=clone(value);
  }
  }
  if(!isGameState(s))return null;for(const w of s.swords)w.name=getSwordForm(w).name;return new ForgeGame(s);
 }catch{return null;}}
}
const finiteInteger=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x);
const num=(x:unknown,a=0,b=RULES.goldCap):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const integer=(x:unknown,a=0,b=RULES.goldCap):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=a&&x<=b;
export const isRelicId=(value:unknown):value is RelicId=>RELICS.some(r=>r.id===value);
const isSwordType=(value:unknown):value is SwordTypeId=>SWORD_TYPES.some(t=>t.id===value);
const isItemId=(value:unknown):value is import('./rules.ts').ItemId=>ITEMS.some(i=>i.id===value);
function isSword(value:unknown,nextId:number):value is SwordState{
 if(!isRecord(value))return false;const w=value;
 if(!integer(w.id,1,nextId-1)||!isSwordType(w.typeKey)||typeof w.name!=='string'||!integer(w.level,0,99)||!integer(w.appearanceLevel,w.level,99)||!num(w.base,1,RULES.valueCap)||!num(w.value,0,RULES.valueCap)||!num(w.peak,w.value,RULES.valueCap)||!(w.heat===0||w.heat===100)||!integer(w.charge,0,10)||typeof w.forged!=='boolean'||typeof w.location!=='string'||!locations.includes(w.location)||!num(w.flat,0,RULES.valueCap)||!num(w.multiplier,0,RULES.valueCap)||!integer(w.blind,0,3)||!num(w.splice,0,.6)||!num(w.scorched,0,.18))return false;
 if(!['ward','ashUsed','cornerUsed','spineShield','locketUsed','scale','chalk','powder'].every(k=>typeof w[k]==='boolean')||!['successTickets','windBonus','matchStreak','spineCount','greatTickets','successCount','damageCount','holdStreak','successStreak','heartBonus','sealBonus'].every(k=>integer(w[k])))return false;
 if(!unique(w.idolStages)||!w.idolStages.every(n=>integer(n,4,96)&&n%4===0))return false;
 if(w.lastBonus!==null&&(!isRecord(w.lastBonus)||typeof w.lastBonus.kind!=='string'||!['base','flat','multiplier'].includes(w.lastBonus.kind)||!num(w.lastBonus.amount,0,RULES.valueCap)))return false;
 if(w.position!==undefined&&(!isRecord(w.position)||!['x','y','z'].every(k=>num(w.position&&isRecord(w.position)?w.position[k]:undefined,-100,100))))return false;
 return w.previous===null||w.previous==='saved'||isOutcome(w.previous);
}
function isGameState(value:unknown):value is GameState{
 if(!isRecord(value)||value.version!==2)return false;const s=value;
 if(!integer(s.day,1,100000)||typeof s.status!=='string'||!['running','won','lost'].includes(s.status)||typeof s.contractCleared!=='boolean'||!num(s.gold)||!num(s.due,1,RULES.valueCap)||!num(s.offered,0,RULES.valueCap)||!num(s.scrapOffered,0,RULES.valueCap)||!integer(s.anger,0,3)||!integer(s.nextId,1)||!num(s.clock)||!num(s.frenzyUntil)||!num(s.nextStrikeAt)||!integer(s.swordCredits)||!integer(s.inheritance,0,99)||!integer(s.inheritanceCharge,0,10)||!integer(s.nextSupply)||!integer(s.ledgerSupply,0,2)||!integer(s.inheritanceTickets)||!integer(s.supplyLevel,0,99)||!integer(s.testamentLevel,0,99)||typeof s.hookReady!=='boolean'||typeof s.hookUsed!=='boolean')return false;
 const nextId=s.nextId;if(!Array.isArray(s.swords)||s.swords.length>2000||!s.swords.every((w:unknown):w is SwordState=>isSword(w,nextId)))return false;
 const swords:SwordState[]=s.swords;if(!unique(swords.map(w=>w.id)))return false;
 for(const [field,location] of [['carriedId','hands'],['anvilId','anvil']] as const){const list=swords.filter(w=>w.location===location);if(list.length>1||s[field]!== (list[0]?.id??null))return false;}
 if(swords.length?!swords.some(w=>w.id===s.selected):s.selected!==null)return false;if(swords.filter(w=>w.location==='rack').length>3||s.offered!==cap(s.scrapOffered+swords.filter(w=>w.location==='tribute').reduce((a,w)=>a+w.value,0)))return false;
 if(!unique(s.relics)||s.relics.length>8||!s.relics.every(isRelicId)||!unique(s.discoveries)||!s.discoveries.every(x=>typeof x==='string')||!unique(s.unlocks)||!s.unlocks.every(isRelicId))return false;
 if(!isRecord(s.items)||!ITEMS.every(i=>isRecord(s.items)&&integer(s.items[i.id]))||!isRecord(s.shop)||!unique(s.shop.ids)||s.shop.ids.length>3||!s.shop.ids.every(isRelicId)||!unique(s.shop.displayIds)||s.shop.displayIds.length>3||!s.shop.displayIds.every(isRelicId))return false;
 const shop=s.shop,shopIds=s.shop.ids;if(!shopIds.every((id:unknown)=>Array.isArray(shop.displayIds)&&shop.displayIds.includes(id))||!integer(shop.rerolls)||!integer(shop.freeRerolls)||shop.voucherClaimed!==undefined&&typeof shop.voucherClaimed!=='boolean')return false;
 if(!isRecord(s.merchant)||s.merchant.day!==s.day||!Array.isArray(s.merchant.stock)||!s.merchant.stock.every((r:unknown)=>isRecord(r)&&typeof r.id==='string'&&typeof r.kind==='string'&&['sword','item','instant'].includes(r.kind)&&num(r.price)&&integer(r.remaining,0,100)&&integer(r.purchased)&&typeof r.name==='string'&&(r.kind==='sword'?integer(r.level,0,99)&&(r.typeKey==='random'||isSwordType(r.typeKey)):isItemId(r.itemId))))return false;
 if(!unique(s.merchant.stock.map((r:unknown)=>isRecord(r)?r.id:undefined)))return false;
 if(s.migratedFrom!==undefined&&s.migratedFrom!==1)return false;
 if(s.taxCredit!==undefined&&!num(s.taxCredit,0,quota(s.day)*.3)||s.nextTaxCredit!==undefined&&!num(s.nextTaxCredit,0,RULES.valueCap))return false;
 if(!num(s.taxCredit??0,0,quota(s.day)*.3)||!num(s.nextTaxCredit??0,0,RULES.valueCap)||s.due!==cap(quota(s.day)*(s.relics.includes('rebate')?.9:1)-(num(s.taxCredit)?s.taxCredit:0)))return false;
 if(!['freeRelic','incenseUsed','wireUsed'].every(k=>typeof s[k]==='boolean')||!unique(s.startingRelics)||!s.startingRelics.every(id=>isRelicId(id)&&STARTER_POOL.includes(id))||s.freeRelic&&(s.day!==1||s.relics.length||s.startingRelics.length!==3)||!s.freeRelic&&s.startingRelics.length)return false;
 if(!isRecord(s.stats)||!['strikes','broken','great','paid','peak','frenzies','merchantBuys','endlessPaid'].every(k=>isRecord(s.stats)&&num(s.stats[k]))||!isRecord(s.runTickets)||!OUTCOMES.every(k=>isRecord(s.runTickets)&&integer(s.runTickets[k]))||!integer(s.grudgeTickets)||!Array.isArray(s.history))return false;
 const day=s.day;if(!s.history.every((h:unknown)=>isRecord(h)&&(h.ok===undefined||h.ok===true)&&typeof h.paid==='boolean'&&integer(h.day,1,day)&&num(h.offered,0,RULES.valueCap)&&num(h.due,1,RULES.valueCap)&&num(h.surplus,0,RULES.valueCap)&&h.paid===(h.offered>=h.due)))return false;
 if(s.status==='lost'&&s.anger!==3||s.status!=='lost'&&s.anger>=3||s.status==='won'&&(!s.contractCleared||s.day!==21)||s.day>21&&!s.contractCleared||s.frenzySwordId!==null&&!swords.some(w=>w.id===s.frenzySwordId&&w.location==='anvil'))return false;
 return true;
}
