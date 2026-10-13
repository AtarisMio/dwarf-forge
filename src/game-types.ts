import type {ItemId, RelicId, RelicDefinition} from './rules.ts';
export type {ItemId, RelicId, RelicDefinition};
export type SwordTypeId = 'splitblade'|'runeblade'|'holy'|'dragonfang'|'sawblade'|'citadel'|'worldtree'|'fishblade'|'funerary';
export type SwordLane = 'heavy'|'serrated'|'arcane';
export type SwordFamily = SwordTypeId|SwordLane|'basic';
export type Outcome = 'break'|'damage'|'hold'|'success'|'great';
export type StrikeOutcome = Outcome|'saved';
export type SwordLocation = 'hands'|'anvil'|'rack'|'floor'|'tribute';
export type StationId = 'furnace'|'anvil'|'tribute'|'rack'|'relics'|'tickets'|'merchant';
export type ContractStatus = 'running'|'won'|'lost';
export type SwordBonusKind = 'base'|'flat'|'multiplier';
export interface Position {x:number;y:number;z:number}
export interface SwordBonus {kind:SwordBonusKind;amount:number}
export interface SwordState {
 id:number;typeKey:SwordTypeId;name:string;base:number;value:number;peak:number;level:number;appearanceLevel:number;
 heat:number;charge:number;ward:boolean;forged:boolean;location:SwordLocation;position?:Position;
 flat:number;multiplier:number;ashUsed:boolean;damageCount:number;holdStreak:number;successStreak:number;blind:number;
 splice:number;scorched:number;heartBonus:number;sealBonus:number;previous:StrikeOutcome|null;successTickets:number;windBonus:number;
 matchStreak:number;idolStages:number[];lastBonus:SwordBonus|null;spineCount:number;spineShield:boolean;locketUsed:boolean;
 greatTickets:number;cornerUsed:boolean;successCount:number;scale:boolean;chalk:boolean;powder:boolean;
}
export interface StockBase {id:string;name:string;price:number;remaining:number;purchased:number}
export interface MerchantSword extends StockBase {kind:'sword';typeKey:SwordTypeId|'random';level:number}
export interface MerchantItem extends StockBase {kind:'item'|'instant';itemId:ItemId}
export type MerchantStockRow = MerchantSword|MerchantItem;
export interface ShopState {ids:RelicId[];displayIds:RelicId[];rerolls:number;freeRerolls:number;voucherClaimed?:boolean}
export interface Settlement {ok:true;paid:boolean;day:number;offered:number;due:number;surplus:number}
export interface GameStats {strikes:number;broken:number;great:number;paid:number;peak:number;frenzies:number;merchantBuys:number;endlessPaid:number}
export type TicketPile = Record<Outcome,number>;
export interface GameState {
 version:2;day:number;status:ContractStatus;contractCleared:boolean;due:number;offered:number;scrapOffered:number;gold:number;anger:number;
 swords:SwordState[];selected:number|null;carriedId:number|null;anvilId:number|null;nextId:number;relics:RelicId[];swordCredits:number;
 shop:ShopState;merchant:{day:number;stock:MerchantStockRow[]};items:Record<ItemId,number>;discoveries:string[];unlocks:RelicId[];
 clock:number;frenzyUntil:number;frenzySwordId:number|null;nextStrikeAt:number;inheritance:number;inheritanceCharge:number;
 nextSupply:number;ledgerSupply:number;inheritanceTickets:number;supplyLevel:number;testamentLevel:number;hookReady:boolean;hookUsed:boolean;
 incenseUsed:boolean;wireUsed:boolean;freeRelic:boolean;startingRelics:RelicId[];runTickets:TicketPile;grudgeTickets:number;stats:GameStats;
 history:(Omit<Settlement,'ok'>&{ok?:true})[];taxCredit?:number;nextTaxCredit?:number;migratedFrom?:1;
}
export interface ActionFailure {ok:false;message:string}
export type ActionResult<T extends object = Record<never,never>> = ({ok:true}&T)|ActionFailure;
export interface StrikeSuccess {ok:true;outcome:StrikeOutcome;value:number;delta:number;frenzyStarted:boolean;sword:SwordState;first?:boolean}
export type StrikeResult = StrikeSuccess|ActionFailure;
export interface TicketSource {id:string;label:string;kind:'relic'|'mechanic';outcome:Outcome;added:number;removed:number}
export interface TicketRow {id:Outcome;label:string;base:number;added:number;removed:number;total:number;relicAdded:number;relicRemoved:number;mechanicAdded:number;mechanicRemoved:number}
export interface TicketEffect {id:string;label:string}
export interface TicketDisplay {active:boolean;swordId:number|null;swordName:string|null;rows:TicketRow[];sources:TicketSource[];temporary:TicketEffect[]}
export interface RawTicketData {base:TicketPile;t:TicketPile;added:TicketPile;removed:TicketPile;relicAdded:TicketPile;relicRemoved:TicketPile;mechanicAdded:TicketPile;mechanicRemoved:TicketPile;sources:TicketSource[];protectedHit:boolean}
export const OUTCOMES: readonly Outcome[] = ['break','damage','hold','success','great'];
export function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
export function isOutcome(value:unknown):value is Outcome{return typeof value==='string'&&OUTCOMES.some(key=>key===value);}
