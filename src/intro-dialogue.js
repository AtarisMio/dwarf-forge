// Original Chinese summary of the opening tour; presentation state never enters a contract save.
export const INTRO_DIALOGUE = Object.freeze([
  {id:'welcome', station:'tribute', text:'欢迎来到我的工坊。你负责锻剑，我负责收贡。先听清规矩，再让你的锤子说话。', hint:'接下来会依次认识炉火、铁砧、贡台和遗物购买台。'},
  {id:'heat', station:'furnace', text:'先拾起一把剑，带到炉火前加热。冷铁可不听锤子的指挥。每把剑加热一次，就能持续锻造。', hint:'对准剑按 E 拿起 → 到炉火按 E → 点击「放入炉火」。'},
  {id:'forge', station:'anvil', text:'把热剑放上铁砧，挥锤强化。价值会随着强化上涨；你也可以及时收手，把剑留给贡台。', hint:'拿着热剑对准铁砧按 E；左键或空格挥锤，E 取剑，右键离开。'},
  {id:'frenzy', station:'anvil', text:'同一把剑普通敲击十次，蓄满入神（狂热）。下一锤才会释放；入神期间剑不会碎，抓住这几秒。', hint:'蓄满十格后再敲一锤，释放入神（狂热）。'},
  {id:'odds', station:'anvil', text:'每一锤都要抽签：碎裂、损伤、保持、成功或大成功。强化越高，风险越大；遗物能改变票数和结果。看清抽签板，再决定下一锤。', hint:'留意铁砧旁五种结果的票数与概率。'},
  {id:'tribute', station:'tribute', text:'把准备进贡的剑放上贡台，凑够当日的税。敲铃前，你还可以取回它们；我只在结算时收走贡品。', hint:'贡台显示已放剑值与当日贡税。'},
  {id:'bell', station:'tribute', text:'准备好就敲铃结算。足额进贡后继续锻造；欠贡会惹我生气。第三次欠贡，你的合约就到头了。', hint:'核对贡台总值后，再敲铃进入下一日。'},
  {id:'rack', station:'rack', text:'好剑也得有个落脚处。剑架有三格，把备用剑放好，留待下一轮锻造或进贡。', hint:'拿着剑靠近剑架，把备用剑放入空格。'},
  {id:'coins', station:'relics', text:'用不上的剑，投入购买台下方的投剑口。每把通常换一枚剑币，剑币能买遗物；红色按钮要花金币刷新商品。', hint:'手持剑对准投剑口按 E；买遗物用剑币，刷新用金币。'},
  {id:'gift', station:'relics', text:'初次开工，我送你一个选择：这三件赠礼中挑一件。它不花剑币，也不花金币。选好你的第一件遗物，然后开始干活。', hint:'对准展示格按 E 免费选一件；另外两件会被收回。'}
].map(page => Object.freeze({...page, speaker:'巨龙'})));

export const shouldStartIntro = (fresh, hasSavedContract) => Boolean(fresh || !hasSavedContract);

export class IntroDialogue {
  #active = false;
  #index = 0;
  get active() { return this.#active; }
  get current() { return this.#active ? INTRO_DIALOGUE[this.#index] : null; }
  get index() { return this.#index; }
  get total() { return INTRO_DIALOGUE.length; }
  get first() { return this.#active && this.#index === 0; }
  get last() { return this.#active && this.#index === this.total - 1; }
  start() { this.#index = 0; this.#active = true; return this.current; }
  next() {
    if (!this.#active) return null;
    if (this.last) { this.#active = false; return null; }
    this.#index++;
    return this.current;
  }
  previous() {
    if (!this.#active) return null;
    this.#index = Math.max(0, this.#index - 1);
    return this.current;
  }
  skip() { this.#active = false; return null; }
}
