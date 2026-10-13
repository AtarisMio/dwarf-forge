import type {SwordTypeId,SwordLane,SwordFamily} from './game-types.ts';
export interface SwordFormInput {id?:number|string;heat?:number;typeKey?:string;level?:number;appearanceLevel?:number}
export interface SwordForm {key:`${SwordFamily}/${number}`;family:SwordFamily;stage:number;level:number;name:string;route:SwordLane|'worldtree'|'fishblade'|'funerary'}
export interface SwordRoute {id:SwordLane;families:readonly SwordTypeId[]}
// Community-reported original routes; names are concise Chinese adaptations.
export const SWORD_FORM_LEVELS = Object.freeze(Array.from({length:11}, (_, stage) => stage * 2));
export const SWORD_ROUTES: readonly SwordRoute[] = Object.freeze(([
  {id:'heavy', families:['citadel','holy']},
  {id:'serrated', families:['sawblade','dragonfang']},
  {id:'arcane', families:['runeblade','splitblade']}
] satisfies SwordRoute[]).map(route => Object.freeze({...route, families:Object.freeze(route.families)})));
const BASIC_NAMES = ['破旧剑','精炼剑','还算好用的铁剑'];
const LANE_NAMES: Record<SwordLane,string[]> = {heavy:['厚重铁剑','便携铁门'], serrated:['暴躁铁块','噬咬刃'], arcane:['魔力碎片','觉醒之剑']};
const FINAL_NAMES: Partial<Record<SwordTypeId,string[]>> = {
  citadel:['异常巨剑','双层重剑','城门巨刃','带柄要塞','摧山铁城','裂洲铁城'],
  holy:['银光剑','祝福之刃','黎明之刃','王者之剑','约定晨光','誓约胜利之剑'],
  sawblade:['锯齿长剑','噬甲锯刃','联动钢锯','磨钢绞碎机','断山锯','毁灭齿轮'],
  dragonfang:['幼龙之牙','龙鳞之刃','棘刺龙剑','飞翼龙刃','龙王吐息','屠龙魔刃'],
  runeblade:['铭文之刃','觉醒符文剑','过载之刃','大法师引擎','裂界之刃','创世之刃'],
  splitblade:['断了也不散的剑','不愿独行之刃','统御群剑之剑','无耻之刃','千剑之主','万刃君王']
};
const SPECIAL_NAMES = {
  worldtree:['落枝','坚韧树枝','不折木棒','迟开的木棒','苏醒种子','树枝蜕变','芽中森林','千年古树','源泉之树','承世之树','世界树'],
  fishblade:['海藻断刃','墨鱼骨刀','蟹壳锯刃','冰冻金枪鱼','鱼串','烤鱼串','河豚钉锤','珊瑚祭刃','鲸颚之刃','克拉肯触腕','利维坦之牙'],
  funerary:['锈棺钉','裹布墓刀','掘墓铲','断碑巨剑','棺盖巨剑','唤亡之铃','游魂火炬','守墓镰','拔起之墓','亡者墓园','冥界之钥']
};
export function getSwordForm(sword: SwordFormInput | null = {}): SwordForm {
  const typeKey = sword?.typeKey;
  const current = typeof sword?.level==='number'&&Number.isFinite(sword.level) ? sword.level : 0;
  const peak = typeof sword?.appearanceLevel==='number'&&Number.isFinite(sword.appearanceLevel) ? Math.max(current, sword.appearanceLevel) : current;
  const stage = Math.floor(Math.max(0, Math.min(20, peak)) / 2);
  const level = SWORD_FORM_LEVELS[stage];
  if (typeKey==='worldtree'||typeKey==='fishblade'||typeKey==='funerary') return {key:`${typeKey}/${stage}`, family:typeKey, stage, level, name:SPECIAL_NAMES[typeKey][stage], route:typeKey};
  const lane = SWORD_ROUTES.find(route => route.families.some(family=>family===typeKey)) ?? SWORD_ROUTES[2];
  const finalFamily = lane.families.find(family=>family===typeKey) ?? 'splitblade';
  const family = stage < 3 ? 'basic' : stage < 5 ? lane.id : finalFamily;
  const name = stage < 3 ? BASIC_NAMES[stage] : stage < 5 ? LANE_NAMES[lane.id][stage-3] : FINAL_NAMES[finalFamily]![stage-5];
  return {key:`${family}/${stage}`, family, stage, level, name, route:lane.id};
}
