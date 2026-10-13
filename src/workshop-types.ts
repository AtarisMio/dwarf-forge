import * as THREE from 'three';
import type {SwordState, SwordLocation, StationId, MerchantStockRow, TicketDisplay, StrikeOutcome, Position,RelicId} from './game-types.ts';
import type {LookMode} from './mouse-look.ts';
import type {getSwordForm} from './sword-evolution.ts';
import type {LedgerData} from './workshop-vector-art.ts';

export type RenderSwordId = SwordState['id'] | string;
export type SwordRenderInput = Partial<Pick<SwordState, 'level'|'appearanceLevel'|'heat'|'charge'|'name'|'value'|'location'|'position'>> & {id:RenderSwordId;typeKey?:string};
export type SwordForm = ReturnType<typeof getSwordForm>;
export interface Collision {x:number;z:number;sx:number;sz:number}
export interface ShopOffer {id:RelicId;name:string;icon?:string;color?:string;cost:number;free:boolean}
export interface ShopSnapshot {offers:(ShopOffer|null)[];coins:number;free:boolean;rerollCost:number;rerollAvailable:boolean}
export interface WorldSnapshot {swords:SwordState[];carriedId:number|null;anvilId:number|null;selectedId?:number|null;offered?:number;day:number;anger:number;merchantVisible:boolean;merchantStock:MerchantStockRow[];relics:RelicId[];shop?:ShopSnapshot;ticketDisplay?:TicketDisplay}
export type ShopAction={type:'buy';id:RelicId}|{type:'inspect-owned';id?:RelicId}|{type:'deposit'|'reroll'};
export interface StrikePayload {outcome?:StrikeOutcome;type?:StrikeOutcome;kind?:StrikeOutcome;evolved?:boolean;durationMs?:number}
export interface StrikeImpact {outcome:StrikeOutcome;evolved?:boolean;position:Position}
export interface WorkshopCallbacks {onTarget?:(target:string|null)=>void;onInteract?:(station:StationId)=>void;onStrike?:()=>void;onStrikeImpact?:(impact:StrikeImpact)=>void;onExit?:()=>void;onLookMode?:(mode:LookMode)=>void;onSword?:(id:number)=>void;onDrop?:(position:Position)=>void;onTakeAnvil?:()=>void;onShopAction?:(action:ShopAction)=>void;movementPad?:HTMLElement|null}
export interface Workshop {focus(station:StationId|null):void;setGuideView(station:StationId|null):void;setSword(sword:SwordRenderInput|null|undefined):void;setWorld(world:WorldSnapshot):void;updateBoard(data?:LedgerData):void;setDragon(anger:number):void;strike(outcome:StrikeOutcome|StrikePayload):boolean;beginHeating(id:RenderSwordId,durationMs?:number):Promise<boolean>;cancelHeating():void;isInteracting():boolean;resetInteractions():void;setPaused(paused:boolean):void;lockPointer():Promise<boolean>|boolean|void;interact():void;secondary():void;dispose():void}
export interface HeatMaterialData {baseEmission:THREE.Color;baseIntensity:number;respondsToHeat:boolean;heatIntensity?:number}
export class HeatMaterial extends THREE.MeshStandardMaterial {override userData:HeatMaterialData={baseEmission:new THREE.Color(0),baseIntensity:0,respondsToHeat:false};}
export interface RenderData {swordId?:RenderSwordId;visual?:THREE.Group;localMaterials?:HeatMaterial[];modelKey?:string;form?:SwordForm;flash?:number;sword?:SwordRenderInput;motion?:'ring'|'satellite';phase?:number;baseY?:number;station?:StationId;shopAction?:ShopAction;prompt?:string;relicId?:string;stockLabel?:boolean;resources?:{geometries:THREE.BufferGeometry[];materials:THREE.Material[];textures:THREE.Texture[]}}
export function renderData(object:THREE.Object3D):RenderData {return object.userData as RenderData;}
export function heatData(material:THREE.Material):Partial<HeatMaterialData> {return material.userData as Partial<HeatMaterialData>;}
export function isMeshObject(object:THREE.Object3D):object is THREE.Mesh<THREE.BufferGeometry,THREE.Material|THREE.Material[]> {return object instanceof THREE.Mesh;}
export function isInstancedObject(object:THREE.Object3D):object is THREE.InstancedMesh<THREE.BufferGeometry,THREE.Material|THREE.Material[]> {return object instanceof THREE.InstancedMesh;}
export class RenderGroup extends THREE.Group {override userData:RenderData={};}
export class RenderMesh<G extends THREE.BufferGeometry=THREE.BufferGeometry,M extends THREE.Material|THREE.Material[]=THREE.Material|THREE.Material[]> extends THREE.Mesh<G,M> {override userData:RenderData={};}
export interface SwordRenderData extends RenderData {localMaterials:HeatMaterial[];flash:number}
export class SwordRoot extends THREE.Group {override userData:SwordRenderData={localMaterials:[],flash:0};}
export interface PhysicalSword {mesh:SwordRoot;hit:RenderMesh<THREE.BoxGeometry,THREE.Material>;location?:SwordLocation}
export interface Pose {position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}
export interface PlacementPose extends Pose {parent:THREE.Object3D}
export interface HammerOptions {camera:THREE.PerspectiveCamera;scale:number;origin:THREE.Vector3}
export interface HammerPose extends Pose {armScale:number}
export interface HammerStrikeOptions extends HammerOptions {time:number;contact?:number;duration?:number}
export interface MotionStrike {outcome:StrikeOutcome;evolved?:boolean;durationMs?:number;position?:THREE.Vector3}
export interface Swing extends Omit<MotionStrike,'position'> {position:THREE.Vector3;time:number;poseTime:number;duration:number;contact:number;impacted:boolean}
export interface PickTarget {shopAction?:ShopAction;prompt?:string;swordId?:RenderSwordId;station?:StationId}
