// October 2026 rules. Provenance/confidence is documented in docs/rules-evidence.md.
// Official announcements override the community extraction tables (notably the starter pool).
export const RULES = Object.freeze({contractDays:21,maxLevel:99,baseValue:320,specialBase:640,frenzyMs:4000,strikeMs:640,slots:8,rackSlots:3,tickets:1000,valueCap:9e14,goldCap:Number.MAX_SAFE_INTEGER,startingGold:0,rerollQuotaRate:.15,rerollGrowth:2.5,merchantRepeat:3,endlessGrowth:1.2});
export const TAX = [1800,2100,2600,3350,4350,5700,7500,9800,12800,16700,21500,27750,35700,45800,58650,74650,94550,119350,149950,186850,232000];
export const BREAK_CURVE = [0,.018,.059,.129,.248,.297,.347,.383,.418,.443,.467,.491,.505,.519,.532,.545,.558,.576,.594,.612,.63,.639,.648,.657,.666,.675,.684,.693,.702,.711,.72];
export const BASE_TICKETS = {break:9,damage:2,hold:5,success:12,great:2} as const;
export const quota = (day: number): number => {if(day<=21)return TAX[day-1];let n=TAX[20];for(let i=21;i<day&&n<RULES.valueCap;i++)n=Math.min(RULES.valueCap,Math.round(n*RULES.endlessGrowth));return n;};
export const SWORD_TYPES = [
 {id:'splitblade',typeKey:'splitblade',name:'裂刃',base:320,merchant:false},
 {id:'runeblade',typeKey:'runeblade',name:'符文剑',base:320,merchant:false},
 {id:'holy',typeKey:'holy',name:'圣剑',base:320,merchant:false},
 {id:'dragonfang',typeKey:'dragonfang',name:'龙牙剑',base:320,merchant:false},
 {id:'sawblade',typeKey:'sawblade',name:'锯刃',base:320,merchant:false},
 {id:'citadel',typeKey:'citadel',name:'堡垒剑',base:320,merchant:false},
 {id:'worldtree',typeKey:'worldtree',name:'世界树之剑',base:640,merchant:true},
 {id:'fishblade',typeKey:'fishblade',name:'海兽之刃',base:640,merchant:true},
 {id:'funerary',typeKey:'funerary',name:'葬送之剑',base:640,merchant:true}
] as const;
const ITEM_ROWS = [
 {id:'scale',name:'破裂龙鳞',icon:'◈',description:'保护下一次普通敲击免于碎裂；无论结果都会消耗。',minDay:3,stock:3,rate:.42,minPrice:700},
 {id:'rewind',name:'悔恨钟表',icon:'↶',description:'回溯当前铁砧的上一锤，包括碎裂；离开或交易后失效。',minDay:3,stock:1,rate:1.53,minPrice:1800},
 {id:'chalk',name:'红粉笔',icon:'✎',description:'下一锤的大成功抽签票翻倍。',minDay:6,stock:3,rate:.56,minPrice:1000},
 {id:'powder',name:'火药袋',icon:'✦',description:'下一普通锤：成功与大成功变大成功，其余变碎裂。',minDay:6,stock:1,rate:.9,minPrice:1800},
 {id:'star',name:'寒星碎片',icon:'❄',description:'增加三格狂热；狂热期间不可使用。',minDay:6,stock:3,rate:.7,minPrice:1200},
 {id:'delivery',name:'幽灵配送单',icon:'✉',description:'购买后预订下一次供给额外两把基础剑。',minDay:6,stock:3,rate:.91,minPrice:1400,instant:true},
 {id:'incense',name:'遗忘之香',icon:'♨',description:'购买即减少一格愤怒；每局一次。',minDay:9,stock:1,rate:2.16,minPrice:3000,instant:true}
] as const;
export type ItemId = typeof ITEM_ROWS[number]['id'];
export interface ItemDefinition {id:ItemId;name:string;icon:string;description:string;minDay:number;stock:number;rate:number;minPrice:number;instant?:boolean}
export const ITEMS: readonly ItemDefinition[] = ITEM_ROWS;
// minDay/cost from community code-analysis; achievement gates from official October announcements.
const rows = [
 ['bent','弯钉','Bent Nail',1,2,'成功票 +4。'],['knot','黑结','Black Knot',1,2,'碎裂概率降低 10%。'],
 ['stamp','检验印章','Inspection Stamp',1,2,'成功或大成功，固定加值 +100 G（再受倍率影响）。'],['coal','幸运煤','Lucky Coal',1,2,'大成功票 +1。'],
 ['stone','封印石','Sealing Stone',1,2,'保持票 +2；连续两次保持额外 +1 等级。'],['chalice','掘墓人之杯',"Undertaker’s Chalice",1,2,'碎裂时，最高价值的 30% 自动作废料贡品。'],
 ['leather','皮革环','Leather Loop',1,2,'普通锻造速度 +20%；狂热不受此加成。'],['mallet','钝木槌','Blunt Mallet',1,2,'一张损伤票转换为成功票。'],
 ['whetstone','旧磨石','Worn Whetstone',1,2,'两张保持票转换为成功票。'],['weight','耐心砝码','Patient Weight',1,2,'保持票 +3。'],
 ['die','盲骰','Blind Die',1,3,'损伤或保持后，下一锤的大成功票 +3。'],['nail','黄金钉','Golden Nail',2,3,'大成功票 +2。'],
 ['hoop','铁箍','Iron Hoop',1,3,'碎裂票 −2。'],['holy-sword','破碎圣剑','Broken Holy Sword',1,3,'未锻造剑继承碎剑 30% 等级和 3 格狂热，可与剑鞘叠加。'],
 ['splice','破裂接头','Cracked Splice',2,3,'每次损伤降低该剑碎裂概率 15%，最多 60%。'],['scorched','焦黑护符','Scorched Charm',1,3,'普通成功/大成功叠加 3% 碎裂减免，最多 18%。'],
 ['heart','封印之心','Sealed Heart',2,3,'每次保持使下次大成功额外 +1 等级，最多 +4。'],['mourning','哀悼结','Mourning Knot',1,3,'每次欠贡永久增加一张大成功票，丢弃后保留。'],
 ['voucher','旧凭证','Worn Voucher',2,3,'每轮一次免费遗物刷新。'],['grudge','怨钉','Grudge Nail',2,3,'碎剑等级兑换为下一锤的一次性大成功票。'],
 ['watch','破裂腕表','Cracked Wristwatch',1,3,'普通损伤额外蓄一格狂热。'],['chained','锁链沙漏','Chained Hourglass',1,3,'普通保持有 50% 概率额外蓄一格狂热。'],
 ['mark','闪电印记','Lightning Mark',1,4,'狂热之外大成功后，下一锤碎裂概率降低 40%。'],['grip','旧握柄','Worn Grip',2,4,'挥锤速度 +15%。'],
 ['wire','缠线剑鞘','Wirebound Scabbard',2,4,'每轮第一次碎裂变成损伤。'],['sleeping','沉睡余烬','Sleeping Ember',3,4,'保持有 70% 概率增加一等级。'],
 ['oath','不折誓言','Unbroken Oath',2,4,'损伤有 70% 概率额外增加一等级。'],['kingseal','败王印章',"Defeated King’s Seal",3,4,'每次损伤使下一大成功额外增加一等级。'],
 ['tongs','龙鳞钳','Dragonscale Tongs',2,5,'达到 +6 后，碎裂概率降低 25%。'],['glass','玻璃沙漏','Glass Hourglass',2,5,'狂热大成功额外增加三等级。'],
 ['rebate','封印退税','Sealed Rebate',2,5,'每日贡税减少 10%。'],['tally','税筹','Tax Tally',3,5,'足额缴贡时获得一份遗物剑额度。'],
 ['scabbard','曙光剑鞘','Dawn Scabbard',3,6,'未锻造剑继承碎剑 40% 等级和 4 格狂热，可与破碎圣剑叠加。'],
 ['ash','凤凰灰烬','Phoenix Ash',3,6,'每把剑一次免于碎裂，代价为当前价值降低 40%。'],
 ['hourglass','红沙漏','Red Hourglass',2,6,'狂热延长一秒。'],['bell','铃项圈','Bell Collar',2,6,'每次狂热敲击，剑值增加 5%。'],
 ['pardon','龙之宽恕',"Dragon’s Pardon",4,6,'免死一次，怒气降一格并消耗遗物。','pardon'],
 ['butterfingers','笨手笨脚','Butterfingers',3,6,'碎裂票 +3，大成功票 +5。','butterfingers'],
 ['sickle','镰刀与锤','Sickle and Hammer',4,6,'每种结果的基础抽签票均改为五张。','sickle'],
 ['ghost-ledger','游魂账簿',"Wandering Ghost’s Ledger",3,6,'下一次商人到访起多两项商品。','ghost-ledger'],
 ['supply-writ','白银供给令','Silver Supply Writ',2,6,'下一次商人到访起多两把基础剑。'],
 ['mana','完美魔力核','Perfect Mana Core',4,7,'狂热时大成功票 +6。'],['bellows','附身风箱','Possessed Bellows',3,7,'狂热挥锤速度 +30%。'],
 ['pearl','深渊珍珠','Abyssal Pearl',4,7,'损伤票 +3；每剑前两次损伤不降等级，但仍触发效果。'],
 ['royal-change','王室找零','Royal Change',4,7,'超额贡值的 30% 抵扣下次税，抵扣最多下次税 30%。','royal-change'],
 ['ledger','殡葬账簿',"Undertaker’s Ledger",4,8,'+7 以上碎剑预约次日额外一把剑，每日最多两把。','ledger'],
 ['ember','不灭灯芯','Undying Wick',4,8,'狂热持续时间增加两秒。','ember'],

 ['idol','缚神像','Bound Idol',1,2,'首次跨过每个四级里程碑，剑值增加 15%。'],
 ['charcoal','木炭袋','Charcoal Pouch',1,2,'基础价值 +80 G。'],
 ['brand','初次烙印','First Brand',1,2,'每剑首锤成功或大成功，额外 +2 等级。'],
 ['paperweight','沉重纸镇','Heavy Paperweight',1,2,'每次保持，固定加值 +180 G。'],
 ['signet','铁印戒','Iron Signet',1,2,'架上持有时剑值增加 15%。'],
 ['apron','补丁围裙','Patched Apron',1,2,'每次损伤，固定加值 +140 G。'],
 ['red-thread','红线','Red Thread',1,2,'保持后，下一锤碎裂概率降低 20%。'],
 ['wax','蜡像','Wax Effigy',1,2,'每两个连续相同结果，固定加值 +150 G。'],
 ['third-eye','闭合第三眼','Closed Third Eye',1,3,'保持后，下一锤成功票 +4。'],
 ['teacup','冷茶杯','Cold Teacup',1,3,'每次保持，剑值增加 6%。'],
 ['double-knot','双结','Double Knot',1,3,'每两个连续成功或大成功，剑值增加 10%。'],
 ['molar','饥饿臼齿','Hungry Molar',1,3,'+4 以上碎剑让下一把未锻造 +0 剑终身获得四张成功票。'],
 ['comb','铁梳','Iron Comb',1,3,'损伤时，损伤前等级基础价值的 5% 转为固定加值。'],
 ['windbell','小风铃','Little Wind Bell',1,3,'保持让下一次普通成功额外 +1 等级，最多 +2。'],
 ['thorn','荆棘砝码','Thorn Weight',1,3,'剑值增加 10%；两张保持票转为损伤票。'],
 ['crown','裂冠','Cracked Crown',1,3,'损伤失去的等级基础价值保留 50% 为固定加值。'],
 ['third-hand','第三只手','Third Hand',2,3,'每两个连续成功或大成功，额外 +1 等级。'],
 ['hook','收藏家钩','Collector’s Hook',2,4,'刷新后，当日首把未锻造 +0 剑存入机台时值两份额度。'],
 ['cracked-bell','破裂铃','Cracked Bell',1,4,'每次大成功，剑值额外增加 20%。'],
 ['locket','余烬吊坠','Ember Locket',2,4,'每剑第一次普通锤额外蓄两格狂热。'],
 ['interlock','交错砝码','Interlocking Weights',2,4,'损伤后的成功或大成功额外 +2 等级。'],
 ['badge','熟练工徽章','Journeyman Badge',2,4,'缴清贡品后的下一批剑至少从 +2 开始。'],
 ['tuning','银音叉','Silver Tuning Fork',2,4,'狂热之外的大成功额外 +1 等级。'],
 ['censer','煤灰香炉','Soot Censer',2,4,'与上一结果不同，基础剑值 +20 G。'],
 ['blackstone','黑铁石','Black Iron Stone',2,5,'架上持有时，+8 以上剑值增加 30%。'],
 ['bronze','青铜齿轮','Bronze Cog',3,5,'每次普通成功，该剑终身成功票 +1。'],
 ['echo','回声锤','Echo Hammer',2,5,'成功或大成功有 25% 概率额外 +1 等级。'],
 ['spine','巨人脊骨','Giant’s Spine',2,5,'每两次损伤储存一次碎裂转损伤，保护产生的损伤不计数。'],
 ['golden','金齿轮','Golden Cog',2,5,'每次普通成功，基础剑值 +30 G。'],
 ['testament','铁匠遗嘱','Smith’s Testament',2,5,'含 +10 以上剑的足额贡品，让下一批一把剑继承其 30% 等级。'],
 ['headless','无头铃','Headless Bell',2,6,'狂热计时结束时，铁砧上的剑 +1 等级。'],
 ['obsidian','黑曜眼','Obsidian Eye',2,6,'+8 以上，两张成功票转为大成功票。'],
 ['spike','王室尖钉','Royal Spike',2,6,'成功票 +6。'],
 ['mirror','裂开的双镜','Split Twin Mirror',3,6,'每两个连续相同结果，重复该锤最后一个遗物加值。'],
 ['hearth','口袋炉','Pocket Hearth',3,7,'基础剑值增加本局足额缴贡次数 ×20 G。'],
 ['permit','供给许可证','Supply Permit',4,8,'下一批起，每批额外提供一把剑。'],
 ['dragon-signet','龙印戒','Dragon Signet',3,9,'架上持有时，+12 以上剑值增加 50%。'],
 ['sieve','灰烬筛','Ash Sieve',1,2,'真实碎裂时获得 500 G。'],
 ['ossuary','尸骨王剑鞘',"Ossuary King’s Scabbard",3,5,'+7 以上剑碎裂时，本局永久获得一张该剑上一结果的票，丢弃后保留。'],
 ['kingcup','国王空杯',"King’s Empty Cup",3,6,'每次保持，为该剑永久增加一张大成功票。'],
 ['cornerstone','不屈基石','Unyielding Cornerstone',4,7,'每把剑第一次碎裂变为损伤。','cornerstone'],
 ['driveshaft','无尽传动轴','Ceaseless Driveshaft',4,7,'每两次普通成功额外增加一等级。','driveshaft'],
 ['dragon-heart','龙之心','Dragon Heart',4,8,'+7 以上成功或大成功，剑值再增加 15%。','dragon-heart'],
 ['twins','双子封印','Seal of Twins',4,8,'每次幸存敲击有 2% 概率复制该剑。','twins'],
 ['seed','永恒之种','Eternal Seed',4,7,'保持票 +6；每次保持基础剑值增加 40 G。','seed'],
 ['oracle','神谕骰','Oracle Die',3,9,'大成功票 +4。'],
 ['lifetime','终身合约','Lifetime Contract',5,9,'供给剑从 +7 开始，所有剑无需加热。','lifetime']
] as const;
export type RelicId = typeof rows[number][0];
export type RelicRarity = 'common' | 'rare' | 'legendary';
export interface RelicDefinition {id:RelicId;name:string;subtitle:string;cost:number;minDay:number;description:string;unlock?:RelicId;rarity:RelicRarity;icon:string;color:string}
export const RELICS: RelicDefinition[] = rows.map((row,i)=>{const [id,name,subtitle,cost,minDay,description]=row;const unlock=row.length===7?row[6]:undefined;return ({id,name,subtitle,cost,minDay,description,unlock,rarity:cost===1?'common':cost===2?'rare':'legendary',icon:['⟐','⚄','♜','†','⌁','♨','ϟ','❈'][i%8],color:['#91afa0','#c5a6d5','#d8ba70','#dd7d4d'][i%4]});});
for(const id of ['scabbard','mana','pearl'] as const)RELICS.find(r=>r.id===id)!.unlock=id;
export const STARTER_POOL: readonly RelicId[] = ['bent','knot','stamp','stone','splice','heart','chalice','coal'];
export const EVIDENCE = {official:['contractDays','maxLevel','greatMultiplier','dailySwords','inheritance','recoveryRelics','starterRandom','noFrenzySpeedup'],firstHandGuide:['persistentHeat','frenzyMs','slots','credits','refundAllTribute','merchantCadence'],communityExtraction:['swordEvolution','supplyLanes','TAX','BREAK_CURVE','merchantPrices','relicMinDays','swordBase','itemEffects'],provisional:['startingGold','merchantSwordDistribution','otherDayRarityWeights','merchantMinPrices','effectOrder']};

// Day 6 rarity ratios are community-reported. Other-day ratios remain provisional.
export const SHOP_WEIGHTS={common:.7,rare:.25,legendary:.05,earlyDefense:1.75};
const commons=['bent','knot','stamp','coal','stone','leather','mallet','whetstone','weight','die','hoop','watch','chained','sieve','idol','charcoal','brand','paperweight','signet','apron','red-thread','wax','third-eye','teacup','double-knot','molar','comb','windbell','thorn'];
for(const r of RELICS)r.rarity=commons.includes(r.id)?'common':(['ash','kingcup','mirror','hearth','permit','dragon-signet','oracle'].includes(r.id)||r.unlock?'legendary':'rare');
