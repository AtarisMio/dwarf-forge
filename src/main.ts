import './style.css';
import {ticketReadout,ticketMechanisms} from './ticket-glyphs.ts';
import {parchmentBackground} from './parchment.ts';
import './mobile.css';
import {ForgeGame, RELICS, ITEMS, SWORD_TYPES, money} from './simulation.ts';
import {createWorkshop} from './workshop.ts';
import {ForgeAudio} from './audio.ts';
import {SaveSlots} from './save-slots.ts';
import {IntroDialogue, shouldStartIntro} from './intro-dialogue.ts';
import {getSwordForm, SWORD_ROUTES, SWORD_FORM_LEVELS} from './sword-evolution.ts';

import { element as $ } from './dom.ts';
import type { SwordState, StrikeOutcome, RelicId, StationId } from './game-types.ts';
type Station = StationId;
type ModalKind = 'settlement' | 'ending' | 'ticket-sheet' | 'shop' | 'owned' | 'blades' | 'tribute-blades' | 'facilities' | 'confirm-tax' | 'codex' | 'saves' | 'overwrite' | 'help' | 'pause' | 'free';
type StrikeSuccess = Extract<ReturnType<ForgeGame['strike']>, {ok: true}>;
type TargetId = string | number | null;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
function hasKey<T extends object>(object: T, key: PropertyKey): key is keyof T { return Object.hasOwn(object, key); }
const labels = {anvil:'铁砧', furnace:'炉火', tribute:'贡台', relics:'遗物购买台', rack:'剑架', tickets:'抽签票看板', merchant:'幽灵商人'};
const locations = {hands:'手中', anvil:'铁砧', rack:'剑架', floor:'地面', tribute:'贡台'};
const audio = new ForgeAudio();
const intro = new IntroDialogue();
const saves = new SaveSlots({getItem:key => localStorage.getItem(key), setItem:(key,value) => localStorage.setItem(key,value)}, ForgeGame.restore);
let game = saves.load() ?? new ForgeGame();
let scene: Awaited<ReturnType<typeof createWorkshop>>;
let started = false, station: Station | null = null, modalKind: ModalKind | null = null, target: TargetId = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined, outcomeTimer: ReturnType<typeof setTimeout> | undefined;
let pendingOutcome: {r: StrikeSuccess; evolved: boolean; nextForm: ReturnType<typeof getSwordForm>} | null = null;
let heating = false, heatingRun = 0, lastHit = -Infinity, introVoiceKey = '';
let selectedItem = 0, lastFrenzy = false, storageWarned = false, lastBusy: boolean | null = null;
const usableItems = ITEMS.filter(i => !i.instant && !/delivery|incense/i.test(i.id));
const byId = (id: number | null) => game.state.swords.find(s => s.id === id);
const held = () => byId(game.state.carriedId);
const anvil = () => byId(game.state.anvilId);
const active = () => held() ?? anvil() ?? game.current;
const running = () => started && game.state.status === 'running';
const interactionBusy = () => heating || !!scene?.isInteracting?.();
function interactionReady() {
  if(!interactionBusy()) return true;
  toast(heating?'剑正在炉火中加热，离开炉火可以取消。':'请等手中的动作完成。'); return false;
}
const touchLayout = window.matchMedia('(pointer: coarse), (max-width: 760px)');
const isTouchUI = () => touchLayout.matches;
function syncTouchUI() {
  $('hud').dataset.station = station ?? 'roam';
  const exploring = running() && !station && !modalKind && !intro.active;
  $('touch-move-pad').classList.toggle('hidden', !exploring);
  $('touch-actions').classList.toggle('hidden', !exploring);
  $('touch-secondary').classList.toggle('hidden', !held());
  $('touch-travel').disabled = !running() || !!modalKind || intro.active || interactionBusy();
  $('touch-secondary').disabled = interactionBusy();
}
function syncInteractionUI() {
  const busy=interactionBusy(), blade=anvil(); if(busy===lastBusy) return; lastBusy=busy;
  $('strike').disabled=busy || !blade || blade.heat<=0 || !running();
  $('take-anvil').disabled=busy;
  $('reheat').disabled=busy;
  $('use-item').disabled=busy || !(game.state.items?.[usableItems[selectedItem]?.id]>0) || !anvil();
  $('undo').disabled=busy || !game.canUndo;
  syncTouchUI(); renderTarget(target);
}
function setTouchLayout() {
  document.documentElement.classList.toggle('touch-ui', isTouchUI());
  $('forge-items').open = !isTouchUI();
  $('roam-hint').innerHTML = isTouchUI() ? '左侧摇杆移动 · 滑动画面观察' : 'WASD 移动 <i>·</i> <span id="look-mode">按住左键拖动观察</span> <i>·</i> 点击设施 / E 交互';
  syncTouchUI();
  if(intro.active) renderIntro();
  if(started) update();
}
setTouchLayout();
touchLayout.addEventListener('change', setTouchLayout);

function save() {
  try { saves.save(saves.activeSlot, game.state); }
  catch(error) { console.error('Save validation failed', error); }
  if(saves.unavailable && !storageWarned) { storageWarned = true; toast('浏览器存储不可用，本局可继续游玩，关闭后无法保存。'); }
}
function toast(message: string) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}
function syncPause() { scene?.setPaused(!started || !!modalKind || intro.active); syncTouchUI(); }
function cancelHeating() { heatingRun++; heating = false; scene?.cancelHeating?.(); }
function closeModal() {
  if(modalKind && ['settlement','ending'].includes(modalKind)) audio.stopDragon();
  modalKind = null; $('modal-layer').classList.add('hidden'); $('hud').inert = intro.active;
  syncPause(); if(station) renderStation(); renderTarget(target);
}
function showModal(kind: ModalKind, content: string) {
  cancelHeating(); audio.stopDragon(); modalKind = kind; $('hud').inert = true;
  $('modal').classList.toggle('ticket-sheet-modal',kind==='ticket-sheet');
  $('modal').innerHTML = content; $('modal-layer').classList.remove('hidden'); syncPause();
  renderTarget(target);
  $('modal').querySelector('button')?.focus({preventScroll:true});
}
function modalHeader(kicker: string, title: string, intro = '', closable = true) {
  return `${closable ? '<button class="modal-close" data-action="close" aria-label="关闭">×</button>' : ''}<p class="modal-eyebrow">${kicker}</p><h2>${title}</h2>${intro ? `<p class="intro">${intro}</p>` : ''}`;
}
function result<T extends {ok: true; message?: string} | {ok: false; message: string}>(action: () => T, successMessage?: string, close = false) {
  if(!interactionReady()) return {ok:false as const,message:'正在完成动作。'};
  const r = action();
  if(!r?.ok) { toast(r?.message ?? '现在无法进行这个操作。'); return r; }
  if(close) closeModal(); update(); save();
  if(successMessage || r.message) toast(successMessage ?? r.message ?? '');
  return r;
}
function update() {
  const s = game.state, w = anvil();
  $('day').textContent = String(s.day).padStart(2,'0'); $('contract-length').textContent = s.day > 21 ? '无尽' : '/ 21';
  const date = new Date(Date.UTC(2026,3,14 + s.day));
  $('calendar-date').textContent = `${date.getUTCMonth()+1}月${date.getUTCDate()}日${game.merchantAvailable ? ' · 商人到访' : ''}`;
  $('due').textContent = money(s.due); $('offered').textContent = money(s.offered); $('gold').textContent = money(s.gold);
  $('sword-coins').textContent = String(game.swordCoins);
  $('tribute-fill').style.width = `${Math.min(100,s.offered/s.due*100)}%`;
  $('anger').innerHTML = [0,1,2].map(i => `<span class="${i<s.anger?'angry':''}">◆</span>`).join('');
  $('anger').title = `龙的愤怒 ${s.anger}/3`;
  $('sword-count').textContent = String(s.swords.filter(s => s.location !== 'tribute').length);
  $('relic-count').textContent = `${s.relics.length}/8`;
  const carried=held();
  $('held-label').textContent = carried ? `手中 · ${carried.name} +${carried.level}` : w ? `铁砧 · ${w.name} +${w.level}` : isTouchUI()?'空手 · 点「剑」选取':'空手 · 对准剑按 E 拿起';
  $('held-label').classList.toggle('hidden', !started);
  const odds = game.odds(), oddsNames = {break:'碎裂',damage:'损伤',hold:'保持',success:'成功',great:'大成功'};
  $('forge-readout').innerHTML = w ? `<strong>${esc(w.name)} <b>+${w.level}</b></strong><span>${money(w.value)} G</span>` : '<strong>铁砧上没有剑</strong>';
  $('odds-summary').textContent = `抽签概率 · 碎裂 ${(odds.break*100).toFixed(1)}%`;
  $('odds-grid').innerHTML = Object.entries(odds).map(([id,p])=>`<span>${hasKey(oddsNames,id)?oddsNames[id]:id}<b>${(p*100).toFixed(1)}%</b></span>`).join('');
  $('heat-fill').style.width = `${w?.heat ?? 0}%`; $('heat-label').textContent = w ? (w.heat > 0 ? '已加热' : '未加热') : '无剑';
  $('strike').disabled = interactionBusy() || !w || w.heat <= 0 || !running();
  $('reheat').classList.toggle('hidden', !w || w.heat > 0);
  scene?.setWorld?.({day:s.day, swords:s.swords, selectedId:s.selected, carriedId:s.carriedId, anvilId:s.anvilId, ticketDisplay:game.ticketDisplay?.(w??null), merchantVisible:game.merchantAvailable, merchantStock:game.merchantStock, relics:s.relics, offered:s.offered, anger:s.anger, shop:{offers:game.relicOffers.map(r => r?({id:r.id,name:r.name,icon:r.icon,color:r.color,cost:s.freeRelic?0:r.cost,free:s.freeRelic}):null),coins:game.swordCoins,free:s.freeRelic,rerollCost:game.rerollCost,rerollAvailable:!s.freeRelic && s.day>1}});
  scene?.setSword(w); scene?.updateBoard({name:w?.name ?? '铁砧上没有剑', level:w?.level ?? 0, value:w?.value ?? 0, odds, charge:w?.charge ?? 0, frenzy:game.isFrenzy});
  scene?.setDragon(s.anger); frenzyDisplay(); renderItems();
  if(station && station !== 'anvil') renderStation();
  renderTarget(target);
  $('merchant-shortcut')?.classList.toggle('hidden', !game.merchantAvailable);
  syncTouchUI();
  lastBusy=null; syncInteractionUI();
}
function frenzyDisplay() {
  const w = anvil() ?? game.current;
  $('frenzy-label').classList.toggle('active', game.isFrenzy);
  $('frenzy-label').textContent = game.isFrenzy ? `狂热 · 无碎裂 ${Math.max(0,(game.state.frenzyUntil-game.state.clock)/1000).toFixed(1)}s` : (w?.charge ?? 0) >= 10 ? '狂热已蓄满 · 下一锤释放' : `狂热蓄能 ${w?.charge ?? 0} / 10`;
}
function renderItems() {
  $('item-toolbar').innerHTML = usableItems.map((i,n) => `<button class="item-slot ${n===selectedItem?'selected':''}" data-item-select="${n}" title="${esc(i.name)}：${esc(i.description)}" aria-label="${esc(i.name)} 数量 ${game.state.items?.[i.id] ?? 0}"><kbd>${n+1}</kbd><span>${i.icon ?? '◇'}</span><small>${esc(i.name)}</small><b>${game.state.items?.[i.id] ?? 0}</b></button>`).join('');
  $('use-item').textContent = `${isTouchUI()?'':'Q '}使用 · ${usableItems[selectedItem]?.name ?? '消耗品'}`;
  $('undo').textContent = `${isTouchUI()?'':'R '}回溯上一锤`;
  $('use-item').disabled = !(game.state.items?.[usableItems[selectedItem]?.id] > 0) || !anvil();
  $('undo').disabled = !game.canUndo;
}
function begin(fresh = false) {
  cancelHeating(); scene?.resetInteractions?.(); pendingOutcome=null; audio.stopDragon();
  const loaded = fresh ? null : saves.load();
  const introduce = shouldStartIntro(fresh, !!loaded);
  intro.skip();
  if(introduce) { game = new ForgeGame(); game.state = saves.withCollections(game.state); }
  else if(loaded) game = loaded;
  audio.start(); started = true; closeModal(); station = null;
  $('title-screen').classList.add('hidden'); $('hud').classList.remove('hidden');
  syncPause(); update(); save();
  if(game.state.status !== 'running') showEnding();
  else if(introduce) startIntro();
  else enterWorkshop();
}
function enterWorkshop() {
  if(game.state.freeRelic) { openStation('relics'); toast(isTouchUI()?'首日赠礼：点击「查看赠礼」，免费选一件。':'首日赠礼：对准展示格按 E，免费选一件。其余两件会收回。'); }
  else toast(isTouchUI()?'点右上角「剑」拿起剑，再从「设施」前往炉火和铁砧。':'对准剑按 E 拿起。先去炉火加热，再把剑放到铁砧。');
}
function renderIntro() {
  const page = intro.current;
  if(!page) return;
  $('intro-speaker').textContent = page.speaker;
  $('intro-text').textContent = page.text;
  const touchHints: Partial<Record<string, string>> = {heat:'点「剑」拿起一把剑 →「设施」→ 炉火 →「放入炉火」。',forge:'从「设施」前往铁砧，点击敲击按钮挥锤；「取剑」收手。',coins:'在购买台打开商品说明，投入手中的剑换剑币，再选择遗物。',gift:'点击「查看赠礼」免费选一件；另外两件会被收回。'};
  $('intro-hint').textContent = isTouchUI() ? touchHints[page.id] ?? page.hint : page.hint;
  $('intro-progress').textContent = `${String(intro.index+1).padStart(2,'0')} / ${intro.total}`;
  $('intro-previous').disabled = intro.first;
  $('intro-next').innerHTML = `${intro.last?'开始锻造':'继续'} <span aria-hidden="true">→</span>`;
  scene?.setGuideView(page.station);
  if(introVoiceKey!==page.id) {
    introVoiceKey=page.id; audio.dragonSpeak({text:page.text,anger:0});
  }
}
function startIntro() {
  cancelHeating(); introVoiceKey=''; intro.start();
  $('hud').inert = true; $('hud').classList.add('intro-active');
  $('intro-layer').classList.remove('hidden'); syncPause(); renderIntro();
  $('intro-next').focus({preventScroll:true});
}
function finishIntro() {
  audio.stopDragon(); introVoiceKey='';
  intro.skip(); $('intro-layer').classList.add('hidden');
  $('hud').inert = false; $('hud').classList.remove('intro-active');
  scene?.setGuideView(null); syncPause(); update(); save(); enterWorkshop();
  $('pause').focus({preventScroll:true});
}
function nextIntro() {
  if(!intro.active) return;
  if(intro.next()) renderIntro(); else finishIntro();
}
function pickup(id: number) {
  if(!running() || modalKind) return;
  const r = result(() => game.pickupSword(id));
  if(r?.ok) toast(`拿起 ${held()?.name ?? '剑'}。${isTouchUI()?'点「设施」前往炉火或铁砧。':'右键放下；对准设施按 E 使用。'}`);
}
function drop(position: SwordState['position']) {
  const blade=held();
  if(!running() || modalKind || !blade) return;
  result(() => game.placeSword(blade.id, 'floor', position), '剑已放下。');
}
function takeAnvil() {
  if(!running() || modalKind || station !== 'anvil' || !interactionReady()) return;
  if(!anvil() && game.canUndo) { toast(isTouchUI()?'剑已碎裂。展开「消耗品与回溯」可回溯上一锤，也可留下剑离开。':'剑已碎裂，按 R 回溯上一锤，或右键离开铁砧。'); return; }
  if(anvil()) result(() => game.takeAnvil(), '已从铁砧取走剑。');
  leaveStation();
}
function openStation(next: Station) {
  if(!running() || modalKind || !interactionReady()) return;
  if(next === 'merchant' && !game.merchantAvailable) { toast('今天幽灵商人没有到访。留意日历上的天平。'); return; }
  cancelHeating();
  const carried=held(), forging=anvil();
  if(next === 'anvil') {
    if(carried) {
      const r = game.placeSword(carried.id, 'anvil');
      if(!r.ok) { toast(r.message); return; }
    } else if(forging) game.select(forging.id);
  }
  if(next === 'rack' && carried) {
    result(() => game.placeSword(carried.id, 'rack'), '剑已存放在剑架。'); return;
  }
  station = next; scene.focus(next === 'rack' ? null : next);
  $('target-prompt').classList.remove('visible'); $('roam-hint').classList.toggle('hidden', !!station);
  $('reticle').classList.toggle('hidden', !!station && station !== 'relics'); $('forge-controls').classList.toggle('hidden', station !== 'anvil');
  if(next === 'rack') { station = null; showBlades(); return; }
  update(); renderStation(); save();
}
function leaveStation() {
  if(modalKind) { if(!['free','ending','settlement'].includes(modalKind)) closeModal(); return; }
  if(station === 'anvil') { game.touch(); save(); }
  cancelHeating(); station = null; scene?.focus(null);
  $('station-panel').classList.add('hidden'); $('forge-controls').classList.add('hidden');
  $('shop-target-info').classList.add('hidden');
  $('reticle').classList.remove('hidden'); $('roam-hint').classList.remove('hidden');
  syncTouchUI();
}
function selectedBlade(w = held()) {
  return w ? `<div class="selected-blade"><span>${esc(w.name)} <small>+${w.level}</small></span><span>${money(w.value)} G</span></div>` : '<div class="selected-blade">空手 · 先拿起一把剑</div>';
}
function renderStation() {
  const p = $('station-panel'), s = game.state, w = held();
  p.classList.toggle('shop-station', station === 'relics');
  p.classList.toggle('ticket-station',station==='tickets');
  if(!station || station === 'anvil') { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  const heading = `<div class="station-heading"><h2>${labels[station]}</h2><button data-action="leave" aria-label="离开设施">×</button></div>`;
  if(station === 'furnace') {
    p.innerHTML = heading + `<p class="station-kicker">THE HEARTH</p><p>将手中的剑加热，再放到铁砧。<br>加热一次后，就能持续锻造这把剑。</p>${selectedBlade(w)}${heating?'<div class="heat-active"><i></i></div><button class="wide" disabled>正在加热…</button>':`<button class="wide primary" data-action="heat" ${!w || w.heat>0?'disabled':''}>${(w?.heat ?? 0)>0?'剑刃已经加热':'放入炉火'}</button>`}${!heating && (w?.heat ?? 0)>0?'<button class="wide primary" data-travel="anvil">转移到铁砧</button>':''}<button class="wide" data-action="leave">拿着剑离开炉火</button>`;
  } else if(station === 'tribute') {
    const ready = s.offered >= s.due;
    p.innerHTML = heading + `<p class="station-kicker">THE DRAGON IS WAITING</p><p>将剑留在贡台，敲铃结束今天。<br>敲铃前仍可以取回贡台上的剑。</p><div class="big-value">${money(s.offered)} <small>/ ${money(s.due)} G</small></div>${selectedBlade(w)}<button class="wide primary" data-action="offer" ${!w?'disabled':''}>放上当前剑${w?` · ${money(w.value)} G`:''}</button><button class="wide" data-action="tribute-blades">查看／取回贡品</button><button class="wide" data-action="settle">敲钟结算${ready?' · 贡税已满足':''}</button><p class="note ${ready?'':'danger-text'}">贡值结算后转为金币。${ready?'':`欠缺 ${money(Math.max(0,s.due-s.offered))} G；欠税增加愤怒。`}</p>`;
  } else if(station === 'relics') {
    p.innerHTML = heading + `<p>${s.freeRelic?(isTouchUI()?'首日赠礼 · 免费三选一。':'首日赠礼 · 指向展示格，E 免费三选一。'):game.availableRelics.length?(isTouchUI()?'投入手中的剑换剑币，再选择商品。':'手持剑 → 投剑口 → 剑币。<br>指向商品 E 购买，红钮用 G 刷新。'):s.day===1?'首日赠礼已领取，明日补货。':'本轮已售完，可用红钮刷新。'}</p>${isTouchUI()?`<button class="wide primary" data-action="shop">${s.freeRelic?'查看赠礼':'查看商品'}</button>`:''}<details class="shop-assist"><summary>商品说明／辅助操作</summary><button class="wide" data-action="shop">查看商品说明</button><button class="wide" data-action="deposit" ${!w?'disabled':''}>投入手中的剑</button><button class="wide" data-action="reroll" ${s.freeRelic || s.day===1?'disabled':''}>刷新 · ${game.rerollCost===0?'免费':money(game.rerollCost)+' G'}</button><button class="wide" data-action="owned">查看已持有遗物</button><p>${isTouchUI()?'点 × 离开购买台':'右键离开购买台'}</p></details>`;
  } else if(station === 'merchant') {
    p.innerHTML = heading + `<p class="station-kicker">THE WANDERING GHOST</p><p>今天到访的货物数量有限。<br>下次到访：第 ${s.day+3} 日。</p><div class="merchant-list">${game.merchantStock.map(i => `<button class="merchant-row" data-merchant="${i.id}" ${i.remaining<=0 || s.gold<i.price?'disabled':''}><span>${esc(i.name)}<small>${i.remaining>0?`剩余 ${i.remaining}`:'售罄'}</small></span><b>${money(i.price)} G</b></button>`).join('')}</div>`;
  } else if(station === 'tickets') {
    const ticketData=game.ticketDisplay(anvil()??null);
    p.innerHTML = `${isTouchUI()?'<button data-action="ticket-sheet">放大票纸</button>':''}${ticketData.sources.some(source=>source.kind==='mechanic')?'<button data-action="ticket-sources">加票来源</button>':''}<button data-action="leave">返回工坊</button>`;
  }
}
function showTicketSheet(sources=false) {
  const data=game.ticketDisplay(anvil()??null);
  $('modal').style.setProperty('--ticket-hide-background',parchmentBackground);
  showModal('ticket-sheet',modalHeader('','抽签票')+ticketReadout(data)+(data.sources.some(source=>source.kind==='mechanic')?ticketMechanisms(data.sources):''));
  if(sources){const details=$('modal').querySelector<HTMLDetailsElement>('.ticket-mechanisms');if(details)details.open=true;}
}
async function heatBlade() {
  const blade=held();
  if(!running() || modalKind || station!=='furnace' || !blade || blade.heat>0 || !interactionReady()) return;
  audio.start(); heating=true; const id=blade.id, run=++heatingRun; renderStation();
  const complete=await scene.beginHeating(id,1400);
  if(run!==heatingRun) return;
  heating=false;
  if(complete && held()?.id===id && station==='furnace' && running()) {
    result(()=>game.heat(),'剑刃已烧红。把它放到铁砧，就能持续锻造。');
    audio.tone(185,.3,.08,'triangle');
  }
  renderStation();
}
function hit() {
  if(!running() || modalKind || station !== 'anvil' || !interactionReady()) return;
  const now = performance.now();
  if(now - lastHit < (game.hammerInterval ?? 550)) return;
  const previousForm = getSwordForm(anvil() ?? undefined);
  lastHit = now; const r = game.strike();
  if(!r.ok) { toast(r.message); return; }
  const nextForm = getSwordForm(r.sword);
  const evolved = r.outcome !== 'break' && previousForm.key !== nextForm.key;
  pendingOutcome={r,evolved,nextForm};
  if(!scene.strike({outcome:r.outcome,evolved,durationMs:game.hammerInterval})) strikeImpact({outcome:r.outcome});
  save();
}
function strikeImpact({outcome}: {outcome: StrikeOutcome}) {
  audio.hammer(outcome);
  const pending=pendingOutcome; pendingOutcome=null; if(!pending) return;
  const {r,evolved,nextForm}=pending;
  update();
  const names = {break:'剑刃碎裂', damage:'损伤 −1', hold:'保持', success:'成功 +1', great:'大成功', saved:'免于碎裂'};
  const o = $('outcome'); o.className = r.outcome;
  o.innerHTML = `${names[r.outcome] ?? r.outcome}<small>${r.outcome==='break'?`${money(r.value)} G 化为碎片`:r.delta>0?`+ ${money(r.delta)} G`:`${money(r.value)} G`}</small>${evolved?`<span class="evolution-result">形态进化 · ${esc(nextForm.name)}</span>`:''}`;
  o.classList.add('show'); clearTimeout(outcomeTimer); outcomeTimer = setTimeout(() => o.classList.remove('show'),evolved?1800:1000);
  if(r.frenzyStarted) { toast('狂热！短暂免于碎裂，挥锤速度由遗物决定。'); audio.reward(); }
}
function relicCard(r: (typeof RELICS)[number], mode: 'shop' | 'owned' = 'shop') {
  const owned = game.has(r.id);
  const button = mode==='owned' ? `<button data-discard="${r.id}">弃置遗物 <kbd>X</kbd></button>` : `<button data-relic="${r.id}" ${owned || game.state.relics.length>=8?'disabled':''}>${owned?'已拥有':game.state.freeRelic?'首日免费领取':`⚔ ${r.cost} 剑币`}</button>`;
  return `<article class="relic-card"><div class="relic-icon" style="color:${r.color ?? '#c9b38c'}">${r.icon ?? '⟐'}</div><h3>${esc(r.name)}</h3><span class="relic-subtitle">${esc(r.subtitle ?? r.id)}</span><p>${esc(r.description)}</p>${button}</article>`;
}
function showShop() {
  showModal('shop',modalHeader('THE RELIC MACHINE',game.state.freeRelic?'首日赠礼 · 免费三选一':'展示格中的遗物',`剑币 ${game.swordCoins} · 遗物 ${game.state.relics.length}/8。${game.state.freeRelic?'任选一件，其他两件会收回。':'先向投剑口投入手中的剑，再用剑币购买。金币只用于刷新。'}`) + `<div class="relic-grid">${game.availableRelics.map(r => relicCard(r)).join('') || '<p>这一轮的货物已售完。</p>'}</div><div class="inventory-bottom"><span>金币 ${money(game.state.gold)} G</span><button data-action="reroll" ${game.state.freeRelic || game.state.day===1 || game.state.gold<(game.rerollCost ?? 0)?'disabled':''}>刷新 · ${game.rerollCost===0?'免费':money(game.rerollCost)+' G'}</button><button data-action="close">回到购买台</button></div>`);
}
function showOwned() {
  showModal('owned',modalHeader('YOUR RELIC BUILD','已有遗物',`已占 ${game.state.relics.length}/8 槽。弃置不退款；已获得的局内永久票数仍保留。`) + `<div class="relic-grid">${RELICS.filter(r => game.has(r.id)).map(r => relicCard(r,'owned')).join('') || '<p class="intro">还没有遗物。</p>'}</div>`);
}
function bladeCard(w: SwordState, mode: 'blades' | 'tribute-blades') {
  return `<button class="sword-card" data-blade="${w.id}" data-mode="${mode}"><span class="sword-symbol">⚔</span><span class="sword-level">+${w.level}</span><strong>${esc(w.name)}</strong><small>${money(w.value)} G</small><span class="state">${locations[w.location] ?? '地面'} · ${w.heat>0?'已加热':'未加热'} · 狂热 ${w.charge}/10</span></button>`;
}
function showBlades(mode: 'blades' | 'tribute-blades' = 'blades') {
  const blades = game.state.swords.filter(w => mode==='tribute-blades' ? w.location==='tribute' : w.location!=='tribute');
  showModal(mode,modalHeader('THE SWORDS IN YOUR FORGE',mode==='tribute-blades'?'贡台上的剑':'工坊中的剑',isTouchUI()?'点击拿起剑，再从「设施」前往炉火或铁砧。也可以轻点场景中的剑。':'点击拿起剑。也可以直接在场景中对准剑按 E；右键放下。') + `<div class="inventory-grid">${blades.map(w => bladeCard(w,mode)).join('') || '<p class="intro">这里没有剑。</p>'}</div><div class="inventory-bottom"><span>${blades.length} 把剑</span><button data-action="close">回到工坊</button></div>`);
}
function purchaseRelic(id: string) {
  if(!running()) return;
  const relic = game.availableRelics.find(r => r.id === id);
  if(!relic) return;
  if(game.state.relics.length >= 8) { toast('遗物槽已满，先弃置一件遗物。'); return; }
  const gift=game.state.freeRelic;
  if(!gift && game.swordCoins<relic.cost) { toast(`需要 ${relic.cost} 剑币。先拿起剑，投入购买台下方的投剑口。`); return; }
  const r=result(() => gift?game.claimFreeRelic(relic.id):game.buyRelic(relic.id),`获得 ${relic.name}${gift?' · 其余赠礼已收回':''}`);
  if(r?.ok) { audio.reward(); if(modalKind==='shop') showShop(); }
}
function depositHeldSword() {
  if(!running()) return;
  const blade=held();
  if(!blade) { toast('先拿起一把剑，再投入投剑口。'); return; }
  const before=game.swordCoins;
  const r=result(() => game.depositSword(blade.id));
  if(r?.ok) { audio.tone(450,.15,.08); toast(`剑已投入 · +${game.swordCoins-before} 剑币 · 余额 ${game.swordCoins}`); }
}
function rerollShop() {
  const r=result(() => game.rerollShop());
  if(r?.ok) { toast(`展示格已刷新 · 花费 ${money(r.cost)} G`); if(modalKind==='shop') showShop(); }
}
function shopAction(action: {type: 'buy'; id: RelicId} | {type: 'deposit' | 'reroll' | 'inspect-owned'}) {
  if(!running() || modalKind) return;
  const {type} = action;
  if(type==='deposit') depositHeldSword();
  else if(type==='buy') purchaseRelic(action.id);
  else if(type==='reroll') rerollShop();
  else if(type==='inspect-owned') showOwned();
}
function renderTarget(id: TargetId) {
  let text=(typeof id==='string' && hasKey(labels,id)?labels[id]:undefined) ?? (id==='sword' || typeof id==='number' || typeof id==='string' && id.startsWith('sword:')?'拿起剑':'');
  const info=$('shop-target-info'); info.classList.add('hidden');
  if(typeof id==='string' && id.startsWith('relic:')) {
    const relic=game.availableRelics.find(r=>r.id===id.slice(6));
    if(relic) {
      text=game.state.freeRelic?`免费领取 ${relic.name}`:`购买 ${relic.name} · ${relic.cost} 剑币`;
      info.innerHTML=`<b>${esc(relic.name)}</b><p>${esc(relic.description)}</p>`;
      info.classList.toggle('hidden',!started || !!modalKind);
    }
  } else if(id==='relic-deposit') text=held()?`投入 ${held()?.name} · 换成剑币`:'投剑口 · 先拿起一把剑';
  else if(id==='relic-reroll') text=game.state.freeRelic || game.state.day===1?'首日赠礼不能刷新':`刷新展示格 · ${money(game.rerollCost)} G`;
  else if(typeof id==='string' && id.startsWith('owned-relic:')) text='查看已持有遗物';
  const promptLabel=$('target-prompt').querySelector('span'); if(promptLabel) promptLabel.textContent=text;
  $('target-prompt').classList.toggle('visible',!!text && (!station || station==='relics') && !modalKind && started);
  $('touch-interact').textContent = text === '拿起剑' ? '拿起剑' : '交互';
  $('touch-interact').disabled = !text || !running() || !!modalKind || interactionBusy();
}
function showFacilities() {
  if(!interactionReady()) return;
  showModal('facilities',modalHeader('THE WORKSHOP','工坊设施','选一处前往。手中的剑会一起带过去。') + `<div class="facility-grid">${Object.entries(labels).filter(([id])=>id!=='merchant' || game.merchantAvailable).map(([id,label])=>`<button data-travel="${id}"><span>${label}</span><small>${{furnace:'为手中的剑加热',anvil:'敲击与强化',tribute:'进贡与敲钟',relics:'剑币与遗物',rack:'存放备用剑',tickets:'查看当前抽签票增减',merchant:'限量货物'}[id]}</small></button>`).join('')}</div><div class="menu-actions"><button data-action="blades">查看工坊中的剑</button><button data-action="close">返回工坊</button></div>`);
}
function ringBell(force = false) {
  if(!running() || !interactionReady()) return;
  if(game.state.offered < game.state.due && !force) {
    showModal('confirm-tax',modalHeader('THE DRAGON WILL REMEMBER','贡品还不够',`欠缺 ${money(game.state.due-game.state.offered)} G。敲铃会收走贡品并增加愤怒，第三阶段会致死。`) + '<div class="menu-actions"><button class="primary" data-action="close">继续锻造</button><button data-action="force-settle">仍然敲钟</button></div>'); return;
  }
  audio.bell(); const r = game.settle(); update(); save();
  if(!r.ok) { toast(r.message); return; }
  if(game.state.status !== 'running') { showEnding(); return; }
  if(r.paid) audio.reward(); else audio.danger();
  showModal('settlement',`<div class="settlement"><p class="modal-eyebrow">DAY ${r.day} · SETTLEMENT</p><div class="symbol">${r.paid?'✧':'♟'}</div><h2>${r.paid?'龙收下了贡品':'龙的怒气加深了'}</h2><p class="result-line">贡品已结算。明日仍会送来三把基础剑。${r.paid?'':`<br>愤怒 ${game.state.anger}/3，别让龙失去最后的耐心。`}</p><div class="result-values"><div><small>本次贡值</small><strong>${money(r.offered)}</strong></div><div><small>明日龙税</small><strong>${money(game.state.due)}</strong></div></div><button class="primary" data-action="next-day">迎接第 ${game.state.day} 日 →</button></div>`);
  audio.dragonSpeak({text:r.paid?'龙收下了贡品。':'龙的怒气加深了。',anger:game.state.anger,duration:r.paid?1.6:2.5});
}
function showEnding() {
  const won = game.state.status === 'won';
  showModal('ending',`<div class="settlement"><p class="modal-eyebrow">${won?'CONTRACT COMPLETE':'THE FORGE FALLS SILENT'}</p><div class="symbol">${won?'✧':'♟'}</div><h2>${won?'合约期满，你活下来了':'龙的怒火吞没了工坊'}</h2><p class="result-line">${won?'从 4 月 15 日到 5 月 5 日，你撑过了二十一天。<br>可以继续锻造，后续贡税还会增加。':'下一份合约仍在等待，已发现的图鉴与解锁会保留。'}</p><div class="result-values"><div><small>存活天数</small><strong>${game.state.day}</strong></div><div><small>最高剑值</small><strong>${money(game.state.stats.peak)}</strong></div></div><div class="menu-actions">${won?'<button class="primary" data-action="endless">继续无尽锻造</button>':''}<button data-action="restart">新合约</button><button data-action="saves">查看存档</button></div></div>`);
  audio.dragonSpeak({text:won?'你的合约已完成。':'龙的怒火吞没了工坊。',anger:won?0:3,duration:2.8});
}
function useItem() {
  if(!running() || modalKind || station!=='anvil') return;
  const item = usableItems[selectedItem]; if(item) result(() => game.useItem(item.id),`使用 ${item.name}`);
}
function rewind() {
  if(!running() || modalKind || station!=='anvil') return;
  const r = result(() => game.undoStrike(),'锻造结果已回溯。');
  if(r?.ok) { lastHit=-Infinity; $('outcome').classList.remove('show'); }
}
function showCodex(tab: 'swords' | 'relics' | 'items' = 'swords') {
  const known = new Set(game.state.discoveries ?? []);
  const pool = tab==='swords' ? SWORD_TYPES : tab==='relics' ? RELICS : ITEMS;
  const prefix = tab==='swords'?'sword':tab==='relics'?'relic':'item';
  const formSeen = (form: ReturnType<typeof getSwordForm>,id: string) => known.has(`sword:${form.family}:${form.level}`) || known.has(`sword:${id}:${form.level}`);
  const earlyForms = tab === 'swords' ? [0,2,4].map(level=>getSwordForm({typeKey:'citadel',level})).concat(SWORD_ROUTES.flatMap(route=>[6,8].map(level=>getSwordForm({typeKey:route.families[0],level})))) : [];
  const earlySeen = (form: ReturnType<typeof getSwordForm>) => known.has(`sword:${form.family}:${form.level}`) || SWORD_TYPES.some(type=>!type.merchant && getSwordForm({typeKey:type.id,level:form.level}).key===form.key && known.has(`sword:${type.id}:${form.level}`));
  const routes = tab === 'swords' ? `<details class="evolution-routes"><summary>剑的进化路线</summary><p>普通剑在 +2、+4 改变形态，+6 显露方向，+10 显露剑系；此后每两级进化，+20 达到最终外观。损伤不退回外观，回溯会撤回上一锤的进化。</p><ul>${SWORD_ROUTES.map(route=>{const blade={typeKey:route.families[0]};return `<li><b>${esc(getSwordForm({...blade,level:6}).name)}</b> → ${esc(getSwordForm({...blade,level:8}).name)} → ${route.families.map(id=>esc(SWORD_TYPES.find(t=>t.id===id)?.name)).join(' / ')}</li>`;}).join('')}</ul><p>世界树、海兽与葬送三条商人路线，从 +0 开始拥有各自形态。普通剑的最终分支在送达时确定，敲击和读档不会重抽。</p><details class="codex-forms"><summary>已发现的初始形态</summary><ol>${earlyForms.map(form=>`<li class="${earlySeen(form)?'discovered':''}"><b>+${form.level}</b> ${earlySeen(form)?esc(form.name):'???'}</li>`).join('')}</ol></details></details>` : '';
  showModal('codex',modalHeader('CODEX','工坊图鉴','看见商品即可记录发现，跨合约与三个存档共享。') + `<div class="codex-tabs"><button data-codex="swords" class="${tab==='swords'?'active':''}">剑系</button><button data-codex="relics" class="${tab==='relics'?'active':''}">遗物</button><button data-codex="items" class="${tab==='items'?'active':''}">物品</button></div>${routes}<div class="codex-grid">${pool.map(entry => {
    const id = entry.id; const discovered = known.has(`${prefix}:${id}`);
    const forms = tab==='swords' && discovered ? `<details class="codex-forms"><summary>已发现的形态</summary><ol>${SWORD_FORM_LEVELS.map(level=>{const form=getSwordForm({typeKey:id,level});const seen=formSeen(form,id);return `<li class="${seen?'discovered':''}"><b>+${level}</b> ${seen?esc(form.name):'???'}</li>`;}).join('')}</ol></details>` : '';
    return `<article class="codex-entry ${discovered?'':'undiscovered'}"><span>${discovered?('icon' in entry ? entry.icon : (tab==='swords'?'⚔':'◇')):'?'}</span><h3>${discovered?esc(entry.name):'???'}</h3><p>${discovered?esc('description' in entry ? entry.description : (tab==='swords'?'强化到 +20 达到最终外观。':'')):esc('在工坊中发现这件物品。')}</p>${forms}</article>`;
  }).join('')}</div>`);
}
function showSaves() {
  if(started) save();
  showModal('saves',modalHeader('SAVED CONTRACTS','三个合约存档','每个存档独立保存进度；图鉴与解锁共用。') + `<div class="save-grid">${saves.summaries().map(s => `<article class="save-card"><small>SLOT ${s.slot+1}${s.slot===saves.activeSlot?' · 当前':''}</small><h3>${s.empty?'空存档':`第 ${s.day} 日`}</h3><p>${s.empty?'开始一份新的合约':`${s.status==='won'?'已完成合约':s.status==='lost'?'合约失败':'锻造中'} · ${money(s.gold)} G · ${s.swordCount} 把剑`}</p><button data-save-load="${s.slot}">${s.empty?'开始新合约':'载入合约'}</button>${!s.empty?`<button class="subtle" data-save-new="${s.slot}">在此开始新合约</button>`:''}</article>`).join('')}</div>`);
}
function switchSave(slot: number, fresh = false) {
  const load = () => { closeModal(); leaveStation(); saves.select(slot); game = fresh ? new ForgeGame() : (saves.load(slot) ?? new ForgeGame()); game.state=saves.withCollections(game.state); begin(fresh); };
  if(fresh && !saves.summaries()[slot].empty) {
    showModal('overwrite',modalHeader('NEW CONTRACT','替换这个存档',`这会覆盖存档 ${slot+1} 的合约进度。已发现的图鉴与解锁会保留。`) + `<div class="menu-actions"><button data-action="saves">保留进度</button><button class="primary" data-overwrite="${slot}">替换并开始</button></div>`);
  } else load();
}
function showHelp() {
  if(isTouchUI()) {
    showModal('help',modalHeader('SMITH’S FIELD NOTES','触屏操作','拿起剑 → 加热一次 → 放到铁砧锻造 → 留存／交易／交税。') + '<div class="controls-grid touch-help"><div class="control"><b>左侧摇杆</b><span>移动；松手停止</span></div><div class="control"><b>滑动画面</b><span>转动第一人称视角</span></div><div class="control"><b>轻点目标／交互</b><span>拿起剑或打开设施</span></div><div class="control"><b>设施</b><span>快速前往炉火、铁砧等</span></div><div class="control"><b>敲击铁砧</b><span>每次点击挥锤一次</span></div><div class="control"><b>消耗品与回溯</b><span>在铁砧展开选择和使用</span></div></div><p class="intro">横屏能看到更多工坊；竖屏也能完成全部操作。购买台的「查看商品」可打开大字说明。暂停、切到后台或打开菜单时，移动与狂热计时会停止。</p><button class="primary" data-action="close" style="padding:11px 24px">回到工坊</button>');
    return;
  }
  showModal('help',modalHeader('SMITH’S FIELD NOTES','工坊操作','拿起剑 → 加热一次 → 放到铁砧锻造 → 留存／交易／交税。') + `<div class="controls-grid"><div class="control"><kbd>WASD</kbd>移动</div><div class="control"><kbd>鼠标</kbd>转动视角</div><div class="control"><kbd>E</kbd>拿起／设施交互／铁砧取剑</div><div class="control"><kbd>右键</kbd>放下／离开设施</div><div class="control"><kbd>左键</kbd>点击／挥锤</div><div class="control"><kbd>Space</kbd>挥锤</div><div class="control"><kbd>1–5</kbd>选择消耗品</div><div class="control"><kbd>Q</kbd>使用消耗品</div><div class="control"><kbd>R</kbd>回溯上一锤</div><div class="control"><kbd>Tab</kbd>查看工坊中的剑</div><div class="control"><kbd>Esc</kbd>释放鼠标／暂停</div><div class="control"><kbd>X</kbd>弃置所选遗物</div></div><p class="intro">浏览器允许时，点击空白画面后可直接移动鼠标；不支持捕获时按住左键拖动观察。<br>遗物购买台在工坊右侧：首日展示格免费三选一；之后拿起剑，投入下方投剑口兑换剑币，再对准展示格购买。每把剑通常兑换 1 剑币，与强化价值无关。红色按钮用金币刷新。持有遗物另放在旁边的八格架。<br>同一把剑敲击十次蓄满，下一击进入狂热。幽灵商人从第 3 日起每三日到访，货物有限；日历上天平代表到访。敲铃结算并结束当天，三次龙怒会致死。</p><button class="primary" data-action="close" style="padding:11px 24px">回到工坊</button>`);
}
function showPause() {
  save(); showModal('pause',modalHeader('THE FIRE CAN WAIT','炉火暂歇',`存档 ${saves.activeSlot+1} · 第 ${game.state.day} 日。暂停期间狂热计时停止。`) + '<div class="menu-actions"><button class="primary" data-action="close">继续锻造</button><button data-action="saves">三个存档</button><button data-action="codex">图鉴</button><button data-action="help">操作说明</button><button data-action="confirm-restart">新合约</button></div>' + `<label class="settings-check"><input type="checkbox" id="sound-check" ${audio.enabled?'checked':''}> 工坊环境、锤击与巨龙低吼</label><details class="assist-controls"><summary>设施快捷操作</summary><div class="menu-actions">${Object.entries(labels).filter(([id]) => id!=='merchant' || game.merchantAvailable).map(([id,label]) => `<button data-travel="${id}">${label}</button>`).join('')}</div></details><div class="project-footer"><span>Dwarf Forge · MIT 开源</span><a class="project-link" href="https://github.com/AtarisMio/dwarf-forge" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 Dwarf Forge 源码（新标签页）"><span aria-hidden="true">&lt;/&gt;</span><span>GitHub · 源码 / Star</span><span class="project-link-arrow" aria-hidden="true">↗</span></a></div><p class="footer-note">独立网页实现 · 原作 <a href="https://store.steampowered.com/app/5245810/ForgeTax/" target="_blank" rel="noopener noreferrer">ForgeTax</a>。部分精确数据仍参考实玩资料；自制模型与音效。</p>`);
}
const actions = {
  'ticket-sheet':()=>showTicketSheet(), 'ticket-sources':()=>showTicketSheet(true),
  close:closeModal, leave:leaveStation, heat:heatBlade, blades:() => showBlades(), shop:showShop, owned:showOwned,
  offer:() => {const blade=held(); if(blade) result(() => game.offer(blade.id),'剑已放在贡台，敲铃前可取回。');},
  'tribute-blades':() => showBlades('tribute-blades'), settle:() => ringBell(), 'force-settle':() => ringBell(true),
  deposit:depositHeldSword, reroll:rerollShop,
  'next-day':() => { closeModal(); leaveStation(); update(); toast(`第 ${game.state.day} 日 · 新的三把剑已经送到供剑处。${game.merchantAvailable?'幽灵商人来了。':''}`); },
  restart:() => { closeModal(); leaveStation(); begin(true); },
  endless:() => { const r=result(() => game.continueContract(), '合约已经完成，继续向更高的贡税挑战。',true); if(r?.ok) leaveStation(); },
  help:showHelp, saves:showSaves, codex:() => showCodex(), undo:rewind, 'use-item':useItem,
  'confirm-restart':() => switchSave(saves.activeSlot,true)
};
document.addEventListener('click', event => {
  const b=event.target instanceof Element ? event.target.closest('button') : null; if(!b) return; audio.start();
  if(b.dataset.action) { if(hasKey(actions,b.dataset.action)) actions[b.dataset.action](); return; }
  if(b.dataset.travel && hasKey(labels,b.dataset.travel)) { const next=b.dataset.travel; closeModal(); openStation(next); return; }
  if(b.dataset.station && hasKey(labels,b.dataset.station)) { openStation(b.dataset.station); return; }
  if(b.dataset.relic) { purchaseRelic(b.dataset.relic); return; }
  if(b.dataset.discard) { const relic=RELICS.find(relic=>relic.id===b.dataset.discard); if(!relic) return; const r=result(() => game.discardRelic(relic.id),'遗物已弃置。'); if(r?.ok) showOwned(); return; }
  if(b.dataset.merchant) { const stock=game.merchantStock.find(row=>row.id===b.dataset.merchant); if(!stock) return; const r=result(() => game.buyMerchant(stock.id)); if(r?.ok) { toast(held()?'交易完成，剑已拿在手中。':'交易完成，物品已收好。'); audio.reward(); } return; }
  if(b.dataset.itemSelect!==undefined) { selectedItem=Number(b.dataset.itemSelect); renderItems(); return; }
  if(b.dataset.codex==='swords' || b.dataset.codex==='relics' || b.dataset.codex==='items') { showCodex(b.dataset.codex); return; }
  if(b.dataset.saveLoad!==undefined) { switchSave(Number(b.dataset.saveLoad)); return; }
  if(b.dataset.saveNew!==undefined) { switchSave(Number(b.dataset.saveNew),true); return; }
  if(b.dataset.overwrite!==undefined) { const slot=Number(b.dataset.overwrite); closeModal(); leaveStation(); saves.select(slot); begin(true); return; }
  if(b.dataset.blade) {
    const id=Number(b.dataset.blade);
    const r=result(() => game.pickupSword(id),'剑已拿在手中。',true); if(r?.ok && station==='anvil') leaveStation();
  }
});
$('start').onclick = () => saves.summaries()[saves.activeSlot].empty ? begin(true) : switchSave(saves.activeSlot,true);
$('continue').onclick = () => begin(); $('save-picker').onclick = showSaves;
$('strike').onclick = hit; $('reheat').onclick = () => { if(!interactionReady()) return; if(anvil()) game.takeAnvil(); openStation('furnace'); };
$('leave-anvil').onclick = leaveStation; $('take-anvil').onclick = takeAnvil;
$('bag').onclick = () => showBlades(); $('relic-bag').onclick = showOwned; $('codex').onclick = () => showCodex();
$('help').onclick = showHelp; $('pause').onclick = showPause; $('undo').onclick = rewind; $('use-item').onclick = useItem;
$('sound').onclick = () => { audio.start(); audio.setEnabled(!audio.enabled); $('sound').textContent=audio.enabled?'♫':'♩'; $('sound').setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音'); };
$('intro-next').onclick = nextIntro;
$('intro-previous').onclick = () => { intro.previous(); renderIntro(); };
$('intro-skip').onclick = finishIntro;
$('touch-interact').onclick = () => { if(running() && !modalKind && !intro.active) scene?.interact(); };
$('touch-secondary').onclick = () => { if(running() && !modalKind && !intro.active) scene?.secondary(); };
$('touch-travel').onclick = showFacilities;
// Capture tutorial keys before either the game or the workshop can act on them.
document.addEventListener('keydown', e => {
  if(!intro.active) return;
  e.stopImmediatePropagation();
  if(e.code==='Tab') {
    e.preventDefault();
    const buttons = [...$('intro-layer').querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.findIndex(button=>button===document.activeElement);
    buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
    return;
  }
  e.preventDefault();
  if(e.repeat) return;
  if(e.code==='Escape') finishIntro();
  else if(e.code==='ArrowLeft') { intro.previous(); renderIntro(); }
  else if(e.code==='ArrowRight' || e.code==='KeyE') nextIntro();
  else if(e.code==='Enter' || e.code==='Space') {
    const button = document.activeElement;
    if($('intro-layer').contains(button) && button instanceof HTMLButtonElement) button.click();
    else nextIntro();
  }
}, true);
document.addEventListener('change', e => { if(e.target instanceof HTMLInputElement && e.target.id==='sound-check') { audio.setEnabled(e.target.checked); $('sound').textContent=audio.enabled?'♫':'♩'; } });
document.addEventListener('keydown', e => {
  if(!started || e.repeat || (e.target instanceof Element && ['INPUT','TEXTAREA'].includes(e.target.tagName))) return;
  if(e.code==='Tab' && (!modalKind || modalKind==='blades')) { e.preventDefault(); if(modalKind) closeModal(); else showBlades(); return; }
  if(e.code==='Escape') { if(modalKind) { if(!['free','ending','settlement'].includes(modalKind)) closeModal(); } else if(!document.pointerLockElement) showPause(); return; }
  if(e.code==='KeyX' && modalKind==='owned') { const button=document.activeElement; if(button instanceof HTMLButtonElement && button.dataset.discard) button.click(); return; }
  if(modalKind) return;
  if(e.code==='Space') { e.preventDefault(); hit(); }
  if(e.code==='KeyR') { e.preventDefault(); rewind(); }
  if(e.code==='KeyQ') { e.preventDefault(); useItem(); }
  const n=Number(e.key); if(n>=1 && n<=usableItems.length) { selectedItem=n-1; renderItems(); }
});
document.addEventListener('keydown', e => {
  if(e.key!=='Tab' || !modalKind) return;
  e.preventDefault(); const nodes=[...$('modal').querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],summary')];
  if(!nodes.length) return; const index=nodes.findIndex(node=>node===document.activeElement), next=(index+(e.shiftKey?-1:1)+nodes.length)%nodes.length; nodes[next].focus();
});
document.addEventListener('visibilitychange', () => { if(document.hidden) { audio.stopDragon(); if(started && !modalKind && !intro.active) showPause(); } });
window.addEventListener('beforeunload', () => { if(started) save(); });

try {
  scene=await createWorkshop($('world'),{
    movementPad:$('touch-move-pad'),
    onTarget:id => { target=id; renderTarget(id); },
    onInteract:id => { if(!modalKind && started) openStation(id); },
    onSword:pickup, onDrop:drop, onTakeAnvil:takeAnvil, onStrike:hit, onExit:leaveStation, onShopAction:shopAction,
    onStrikeImpact:strikeImpact,
    onLookMode:mode => { const modeLabel=document.getElementById('look-mode'); if(modeLabel) modeLabel.textContent=mode==='locked'?'移动鼠标观察 · Esc 释放':'按住左键拖动观察'; }
  });
  scene.setPaused(true); update(); $('boot').classList.add('hidden'); $('title-screen').classList.remove('hidden');
  if(saves.load()) { $('continue').classList.remove('hidden'); $('start').textContent='新合约 →'; }
  let last=performance.now(), uiClock=0, saveClock=0;
  function frame(now: number) {
    const dt=Math.min(now-last,100); last=now;
    if(started && !modalKind && !intro.active) { game.tick(dt); uiClock+=dt; saveClock+=dt;
      if(uiClock>=80) { uiClock=0; if(!pendingOutcome) frenzyDisplay(); syncInteractionUI(); if(!pendingOutcome && lastFrenzy!==game.isFrenzy) { lastFrenzy=game.isFrenzy; update(); } }
      if(saveClock>5000) { saveClock=0; save(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch(error) {
  console.error('Workshop could not start',error); $('boot').classList.add('hidden');
  $('world').innerHTML='<div class="error-screen"><h2>炉火尚未点燃</h2><p>请使用支持 WebGL 的新版浏览器，并开启硬件加速。</p><button id="reload-game" class="primary">重新点燃炉火</button></div>';
  $('reload-game').onclick=() => location.reload();
}
