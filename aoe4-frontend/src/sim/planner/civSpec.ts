// 各文明的經濟規格。每一條加成都標出「已計入 / 近似 / 未建模」與來源。
// 費用、時間一律讀目錄（aoe4world 17.0.x 資料），這裡只放目錄沒有的經濟規則。

import type { Bundle, Res, SiteKind } from './types.ts'

export const SRC = {
  off: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/',
  a4w: 'https://github.com/aoe4world/data/tree/main/civilizations',
  fandomVillager: 'https://ageofempires.fandom.com/wiki/Villager_(Age_of_Empires_IV)',
  fandomResource: 'https://ageofempires.fandom.com/wiki/Resource_(Age_of_Empires_IV)',
  fandomArabia: 'https://ageofempires.fandom.com/wiki/Dry_Arabia',
  old: '舊版模擬器的數字，17.0 資料裡查不到',
} as const

/** na = 純戰鬥或操作上的加成，不影響規劃（不算未建模） */
export type Modeled = 'yes' | 'approx' | 'no' | 'na'

export interface Bonus {
  text: string
  modeled: Modeled
  source: string
  note?: string
}

/** 食物、木材、黃金、石頭以外的資源（目錄的 other 花費鍵） */
export type Special = 'oliveoil' | 'silver' | 'vizier' | 'muster'
export const SPECIAL_ZH: Record<string, string> = { oliveoil: '橄欖油', silver: '白銀', vizier: '維齊爾點數', muster: '集結次數' }

export interface Gather {
  all: number
  sheep: number
  berry: number
  hunt: number
  farm: number
  wood: number
  gold: number
  stone: number
}

/**
 * 條件式修正：`on` 研究完成（科技、升代科技）或建造完成（建築、地標）之後生效。
 * 倍率都是乘上去；同一個效果要「升級」時（大名宅邸 +20% → 御殿 +40%），用 replaces 取消舊的那條。
 */
export interface Trigger {
  on: string
  /** 持續秒數；沒寫是永久 */
  duration?: number
  /** 取消這些 on 的修正（較高等級取代較低等級） */
  replaces?: string[]
  /** 採集倍率 */
  gather?: Partial<Gather>
  /** 工人建造速度倍率（所有建築） */
  build?: number
  /** 指定建築的建造時間倍率（拜占庭邊境聚落：房屋 ÷6） */
  buildTime?: Record<string, number>
  /** 主要工人（村民）的花費倍率 */
  villagerCost?: Partial<Record<Res, number>>
  /** 村民訓練時間倍率 */
  villagerTime?: number
  /** 工人移動速度倍率（中國元朝 +15%） */
  speed?: number
  /** 工人攜帶量增加（維京約弗薩迦 +5） */
  carry?: number
  /** 每研究完一項科技，每分鐘的收入（德里希薩學院 +12 食物） */
  perTechIncome?: Partial<Record<Res, number>>
  /** 每 every 秒多一份收入，最多 max 份（日本浮鳥居的依代）；flex = 給當下最缺的資源 */
  rampIncome?: { every: number; max: number; perMin: Partial<Record<Res | 'flex', number>>; flexRates?: Partial<Record<Res, number>> }
  /** 每名指定單位每分鐘的收入，cap = 每分鐘上限（維京邦迪伐木者） */
  unitIncome?: { unit: string; perMin: Partial<Record<Res, number>>; cap?: number }
  /** 同時套用這些科技的效果（蒙古改良經濟科技 = 一般版 + 加強部分） */
  alsoApply?: string[]
  /** 只在這個時代觸發才生效（阿拔斯軍事側翼：升封建、升城堡給的單位不同）；比的是觸發當下的時代 */
  fromAge?: number
  /** 讓這種建築也能像城鎮中心一樣訓練村民（德里村落要塞：主堡） */
  actsAsTC?: string
  /** 要擁有至少這麼多座 on 才生效（戰國大名宅邸：同氏族 3 座後才有徵兵點數），只生效一次 */
  minCount?: number
  /** 免費的軍事生產建築（金帳建築車）：之後要蓋的軍事生產建築不用錢、15 秒蓋好；ByAge = 之後升到該時代時再給 */
  freeBuildings?: number
  freeBuildingsByAge?: Record<number, number>
  /** 鑄幣（馬其頓兵工廠）：每分鐘產出累計採到的 res 的 pctPerMin */
  mint?: { res: Special; pctPerMin: number }
  /** 每位在任總督每分鐘的收入（圖格魯克希薩學院 70 食物 70 黃金） */
  perGovernor?: Partial<Record<Res, number>>
  /** 生效期間每分鐘的收入（搭配 duration，聖殿騎士團朝聖者貸款） */
  incomePerMin?: Partial<Record<Res, number>>
  /** 在軍事建築與軍隊上花費累積到門檻時免費送一支軍隊（朱熹江南塔）：第一支 first、之後每支 +step、最多 cap，最多 max 支 */
  spendArmy?: { first: number; step: number; cap: number; max: number; units: Record<string, number> }
  /** 建築周圍 radius 格內的野果、金礦、石礦每 every 秒存量 +pct（樹 +treePct），共 times 次；之後每個點一次給剩餘量的 finalPct（朱熹冥想花園） */
  bounty?: { radius: number; every: number; times: number; pct: number; treePct: number; finalPct: number }
  /**
   * 生產與研究修正：at = 生產建築（沒寫是全部）、units = 單位（沒寫是全部）、cls = 單位類別（infantry、cavalry…）；
   * time = 生產時間倍率、timeByAge = 依時代（黑暗～帝王）的生產時間倍率、cost = 花費倍率、research = 在這些建築研究的時間倍率
   */
  prod?: {
    at?: string[]
    units?: string[]
    cls?: string
    time?: number
    timeByAge?: number[]
    cost?: number
    /** 花費倍率只套這些資源（貞德祝聖只減食物） */
    costRes?: Res[]
    research?: number
    needScholar?: boolean
    /** 只套用到 at 裡最早蓋好的那一棟（艾爾斯修道院：聖物所在的一棟） */
    single?: boolean
  }[]
  /** 生效時免費送的單位（算進軍隊目標與目標後出兵） */
  units?: Record<string, number>
  /** 免費完成的鐵匠升級數（阿尤布軍事側翼・名匠），算進目標後的升級數 */
  freeUpgrades?: number
  /** 每 every 秒送一次的單位（用 every／delay／times） */
  eachUnits?: Record<string, number>
  /** 依時代的 eachUnits（羅斯克里姆林宮：城堡時代起多 1 名民兵手砲兵） */
  eachUnitsByAge?: Record<number, Record<string, number>>
  /** 每次送單位要付的錢（克里姆林宮每次徵召 30 食物）；付不起就把次數存起來，付得起時再用 */
  eachCost?: Partial<Bundle>
  /** 生效後指定項目的花費固定減少（蘭開斯特每座莊園讓城堡徵召 -25 食物／木材／黃金），每觸發一次減一次 */
  costMinus?: { ids: string[]; amount: Partial<Bundle> }
  /** 囤積（法蘭西公會廳）：每 tick 秒存一筆，第一筆 start、每分鐘 +grow、每筆上限 cap；搜尋決定多久收一次（policy.collectEvery），收的時候給當下最缺的資源（石頭減半） */
  stockpile?: { tick: number; start: number; grow: number; cap: number }
  /** 花費倍率：ids 指定項目，或 kind 指所有科技（含科技型升代）／所有建築；res 沒寫表示四種資源 */
  costMul?: { ids?: string[]; kind?: 'technology' | 'building' | 'unit'; res?: Res[]; mul: number }[]
  /** 生效時一次給的資源；flex = 給當下最缺的資源，farms = 送蓋好的農田 */
  grant?: Grant
  /** 每隔 every 秒給一次 each（第一次在生效後 delay 秒，沒寫就是 every 秒）；給滿 times 次後改給 after */
  every?: number
  delay?: number
  each?: Grant
  times?: number
  after?: Grant
  /** 新增採集點（戰國清酒釀造所的金蓆、鄂圖曼雙塔伊斯蘭學院的野果）；rate = 固定每人每秒（不吃採集科技），mul = 採集倍率，regrow = 採完幾秒後長回來 */
  site?: { id: string; label: string; kind: SiteKind; amount: number; units: number; dist: number; rate?: number; mul?: number; regrow?: number; farmLike?: boolean }
  /** 指定建築每座每分鐘的額外收入（蘭開斯特免役稅） */
  buildingIncome?: { building: string; perMin: Partial<Record<Res, number>>; max?: number }
  /** 之後在家附近完成的建築（含農田，不含地標）返還花費的比例（蘇格蘭命運之石） */
  refund?: { res: Res; pct: number }
  /** 生效時免費送的工人（出現在城鎮中心，不佔訓練時間） */
  villagers?: number
  /** 每名在農田工作的村民每秒額外收入（英格蘭圈地 1/6 黃金） */
  farmerIncome?: Partial<Record<Res, number>>
}

/** payFlex = 從「庫存減掉需求」最多的食物／木材／石頭付這麼多；付不起就整筆不給（羅斯金門的兌換） */
/** exchange = 兌換一次（羅斯金門：缺黃金時賣 100 多出來的食物／木材／石頭換 150 黃金，黃金多時花 100 黃金買 150 最缺的） */
export type Grant = Partial<Record<Res | Special | 'flex' | 'farms' | 'sheep' | 'payFlex' | 'exchange', number>>

/** 目錄缺的科技（圖格魯克工作象科技）：effectsFrom 從別的文明複製效果 */
export interface ExtraItem {
  id: string
  name: string
  age: number
  cost: Partial<Bundle>
  /** 特殊資源花費（鄂圖曼議會：vizier 1） */
  other?: Record<string, number>
  time: number
  producedBy: string[]
  effectsFrom?: { civ: string; id: string }
}

export interface Zone {
  building: string
  res: Res | 'all'
  mul: number
  radius: number
  half: number
  /** 村民另外蓋的光環建築最多幾座（蓄水池）；地標不寫 */
  max?: number
  /** 要駐紮神職人員才有效（神羅亞琛禮拜堂）：引擎每秒比較駐紮與在外激勵哪個罩到的人多 */
  garrison?: boolean
  /** 要先觸發或擁有這個 id 才能蓋（中國糧倉要宋朝） */
  requires?: string
  /** 每座都疊加（糧倉 +10%／座），而不是同種只算一次 */
  stack?: boolean
  /** 只影響農田 */
  farmOnly?: boolean
  /** 只加成副產物的特殊資源（拜占庭大酒莊：範圍內橄欖油 +60%），不加成採集本身 */
  to?: Special
  /** 範圍內每名村民每分鐘的收入（蘭開斯特莊園），同種多座只算一次；有這個欄位時不加成採集 */
  perWorker?: Partial<Record<Res, number>>
  /** 兼作投放點（大酒莊＝磨坊、倉庫／祭典／莊園收四種資源）：蓋在採集點旁時那個點不用另蓋營地；收食物的也能在周圍種田 */
  dropoff?: Res[] | 'all'
  /** 依等級的倍率（蓄水池水位 1～5）；等級 = 1 + 已完成的連接段數，不超過已完成的座數 */
  levels?: number[]
  /** 連接同種建築提升等級（拜占庭渡槽）：每格花費、時間照目錄的 building；兩座之間至少 minLen 格。搜尋決定連不連（policy.link） */
  link?: { building: string; minLen: number }
  note?: string
}

/**
 * 陸地貿易的文明加成。一般商人的收入照 Fandom Trade 頁：每到一端給 (0.008 × 速度 × 距離² + 0.1 × 距離) × 商人倍率 黃金。
 */
export interface TradeSpec {
  /** 免費商人（法蘭西、貞德商會）：擁有 building 後，techs 每完成一項送 1 名（研究在前的蓋好時補送），最多 max 名 */
  freeTraders?: { building: string; techs: string[]; max: number }
  /** 商人可以改運食物或木材（法蘭西、貞德）：每趟給當下最缺的食物／木材／黃金 */
  anyRes?: boolean
  /** 驛站（蒙古）：沿路線蓋 building，radius 格內商人移動 ×mul；搜尋決定蓋幾座（policy.yams） */
  speedAura?: { building: string; radius: number; mul: number }
  /** 研究或擁有 on 之後商人黃金 ×mul（鄂圖曼貿易袋 +40%） */
  goldMul?: { on: string; mul: number }[]
  /** 每趟另得的特殊資源（拜占庭：黃金的 20% 橄欖油） */
  other?: { to: Special; ratio: number }
  /** 同時有 n 名以上商人時，每趟另得黃金 × pct 的 res（蒙古絲路 5/10/15 名） */
  tiers?: { n: number; res: Res; pct: number }[]
  /** 在這些建築訓練商人時的花費（只改黃金）與時間倍率（蒙古銀樹：黃金 -40%、快 40%） */
  producerMods?: Record<string, { gold?: number; time?: number }>
  /**
   * 收費哨站（馬利）：沿路線每隔 spacing 格一座（光環不重疊才收滿），每經過一座抽 pct × 這趟黃金，每趟最多 maxPerLeg 次。
   * 擁有 landmark（撒哈拉貿易網）時它也算一座，在它收的稅另給等量食物，其他哨站另給 foodPct 倍食物
   */
  tolls?: { building: string; pct: number; spacing: number; maxPerLeg: number; landmark: string; foodPct: number }
  /**
   * 寶物商隊（日本烏城）：building 完成 delay 秒後從貿易站出發，之後每 every 秒一隊，以 speed 格/秒走到家，
   * 每隊給 min(cap, base + perTile × 距離) 的食物、木材、黃金，石頭用 stone* 三項
   */
  caravan?: { building: string; delay: number; every: number; speed: number; base: number; perTile: number; cap: number; stoneBase: number; stonePerTile: number; stoneCap: number }
  /**
   * 朝貢國（金朝）：使者走到貿易站、站 establish 秒建立。之後每 every 秒多 1 名佃農，rates[佃農數] = 每分鐘食物；
   * techs 每項 +techPct；同時有的使者最多 maxActive 名；free 蓋好時送 1 名；在朝貢國貿易的商人黃金 ×goldMul；每座工人上限 +workerCap
   */
  tributary?: { unit: string; at: string[]; free: string; establish: number; every: number; rates: number[]; techs: string[]; techPct: number; goldMul: number; workerCap: number; maxActive: number }
}

export interface CivSpec {
  abbr: string
  zh: string
  // ---------- 開局 ----------
  start: Bundle
  /** 開局的特殊資源（拜占庭橄欖油、馬其頓白銀） */
  startOther: Partial<Record<Special, number>>
  startNote: string
  /** 開局工人：目錄 id -> 數量（金朝 3 名鄉騎、貞德 5 名村民） */
  startWorkers: Record<string, number>
  /** 開局非工人的人口（斥候、神職人員、可汗、貞德、監工） */
  extraPop: number
  /** 開局就在城鎮中心旁的羊 */
  ownedSheep: number
  /** 開局城鎮中心旁其他可採的食物（例如金朝馴鹿），用採羊速率 */
  startFood: number
  /** 城鎮中心旁可以打獵的動物（金朝的馴鹿）的食物總量；用獵肉速率與獵肉攜帶量，在羊之前採 */
  startHunt: number
  /** 每座城鎮中心（含首都）旁另外生成的羊（蘭開斯特 4 隻）；中立動物，對局摘要不列在玩家名下 */
  tcSheep: number
  /** 第一座城鎮中心要等幾秒才能開始訓練（蒙古城鎮中心開局是收起的） */
  tcStartDelay: number
  // ---------- 工人 ----------
  /** 主要工人的目錄 id */
  worker: string
  /** 主要工人的上限（金朝鄉騎 20），之後改訓 fallbackWorker */
  workerCap: number
  fallbackWorker?: string
  /**
   * 各種工人相對本文明普通村民的採集倍率與攜帶量；speed 是移動速度（格/秒，普通村民 1.125），
   * build 是建造倍率（landmark 地標、other 其他建築）。引擎依工人組成取平均。
   */
  workerSpecs: Record<string, { gather?: Partial<Gather>; carry?: number; speed?: number; build?: { landmark?: number; other?: number } }>
  /** 城鎮中心每次訓練的工人數（金帳 2）；目錄花費乘上它，目錄時間當作整批的時間 */
  villagerBatch: number
  /** 依時代覆蓋村民訓練時間 */
  trainTimeByAge?: number[]
  /** 維京：免費自動招募，村民容量 = base + perHouse × 長屋 */
  freeVillagers?: { base: number; perHouse: number }
  // ---------- 經濟 ----------
  popModel: 'houses' | 'max'
  housePop: number
  /** 房屋以外會加人口的建築：id -> 人口 */
  popBuildings: Record<string, number>
  carry: number
  berryCarry: number
  /** 採集倍率：all 套在全部；其他再乘上去 */
  gather: Gather
  /** 磨坊附近農田依時代的額外倍率（英格蘭） */
  farmByAge?: number[]
  /** 農田區的磨坊（英格蘭磨坊範圍）：每座罩 perMill 塊田，farmByAge 只套在罩到的田；田不夠罩時引擎在農田區再蓋 */
  farmMill?: { building: string; perMill: number }
  /** 樹上的實際採集速率（含砍樹時間） */
  woodAtTree: number
  woodByAge?: number[]
  /** 木材採到就入庫（聖殿騎士團） */
  woodInstant: boolean
  noBoar: boolean
  /** 有磨坊時每叢野果的存量 */
  orchardBush: number
  /** 採集 from 時另外得到 ratio 倍的 to；hunt = 羊、鹿、野豬；berry = 野果（不含農田）；farm = 農田類；requires = 需要已完成的建築 */
  byproducts: { from: Res | 'hunt' | 'berry' | 'farm' | 'fish' | 'all'; to: Res | Special; ratio: number; requires?: string; note?: string }[]
  /** 投放時額外的比例（圖格魯克工作象經濟 1.05） */
  depositBonus?: { res: Res[]; mul: number }
  /** 打獵時另得黃金的比例（羅斯賞金） */
  huntGold: number
  landmarkCostMul: number
  /** 開局已擁有的建築（城鎮中心以外） */
  prebuilt: string[]
  /** 投放點偏好順序 */
  dropoff: Record<Res, string[]>
  /** 前 N 個投放點免費（圖格魯克開局送的工作象） */
  freeDropoffs: number
  /** 無限食物的建築：農田、橄欖園（拜占庭）、畜欄（金帳 4 人）、牧場（蒙古）；slots = 每座可容納的村民 */
  farm: { id: string; slots: number }
  /**
   * 持續被激勵的村民數與倍率（神聖羅馬神職人員）。
   * 神職人員跟著人最多的採集點走，只激勵那一處的村民（最多 villagers 名）。
   */
  inspire?: { villagers: number; mul: number }
  /**
   * 有範圍的採集加成（光環）：建築完成後，只套用到範圍內的採集點。
   * 建築蓋在哪裡由搜尋決定（policy.placeAt）：'home' = 城鎮中心旁的農田區，或某個採集點旁。
   * radius 從建築邊緣算（格），half = 建築半寬；同一種建築蓋好幾座時，同一個採集點只算一次。
   * max > 1 表示是村民另外蓋的建築（蓄水池），搜尋決定蓋幾座、各蓋在哪。
   */
  zones?: Zone[]
  /**
   * 黃金時代：範圍內建築數（近似為家附近的非農田建築）達到門檻後的加成，各階累加。
   * mul = 採集、build = 建造、research = 研究速度、prod = 生產速度（含村民）。
   */
  goldenAge?: { buildings: number; mul?: number; build?: number; research?: number; prod?: number; trade?: number }[]
  /** 研究或完成 on 之後，黃金時代的加成部分 ×mul（阿拔斯行政側翼 ×1.5） */
  goldenBoost?: { on: string; mul: number }
  /** 被動收入建築：搜尋決定何時蓋、蓋幾座（0 ~ max），完成後每分鐘的收入 */
  trickles: {
    building: string
    perMin: Partial<Record<Res | Special, number>>
    max: number
    note?: string
    as?: 'building'
    /** 每座每 every 秒免費產出 1 名 id（鄂圖曼軍事學校） */
    unit?: { id: string; every: number }
    /** 依時代的數量上限（黑暗～帝王），比 max 嚴 */
    maxByAge?: number[]
    /** 依時代的收入倍率（蒙古敖包 70/100/140/170） */
    ageMul?: number[]
    /**
     * 收入依附近的食物來源（戰國屋台）：每座每分鐘 base + 所在採集點的來源數 × per[種類]（農田要先研究 farmTech）；
     * 每座挑一個還沒被別座佔的最好採集點。trader = 每產 every 食物派一名商人回祭典，帶回 food 食物並讓祭典光環 +step（最多 max）
     */
    sources?: { base: number; per: Partial<Record<'sheep' | 'berry' | 'deer' | 'boar' | 'farm', number>>; farmTech?: string; trader?: { every: number; food: number; step: number; max: number; radius: number; at: string } }
    /** 要先擁有這棟建築才能蓋（屋台要祭典）；沒有的話引擎先蓋它 */
    requires?: string
    /** 研究或擁有 on 之後收入 ×mul（鄂圖曼貿易袋讓蘇丹客棧 +40%） */
    mulOn?: { on: string; mul: number }[]
  }[]
  /** 建築完成時一次給的資源：id -> 資源（蘇格蘭集結大廳 +1 次集結） */
  grants: Record<string, Partial<Record<Res | Special, number>>>
  // ---------- 生產 ----------
  /** 每次生產的單位數：id -> 批量（'*' 為預設）。花費 = 目錄單價 × 批量，時間 = 目錄時間（或 time）為整批 */
  batches: Record<string, { size: number; time?: number }>
  /** 目錄數字錯誤的修正（套到每個變體） */
  costOverride: Record<string, Partial<Record<Res | Special | 'time', number>>>
  /** 目錄誤標成軍隊的單位（商人、宗教、輔助單位） */
  notMilitary: string[]
  /** 目錄時代標錯的項目：id -> 最早可用的時代 */
  minAgeOverride: Record<string, number>
  // ---------- 條件式加成 ----------
  /** 研究或蓋好某項目之後才生效的修正 */
  triggers: Trigger[]
  /**
   * 文明專屬的經濟科技：加進搜尋可研究的清單（搜尋決定研不研、哪一步研）。
   * requires = 研究前要已擁有的建築或已完成的科技／升代選項；
   * tc = 允許在城鎮中心研究（會送村民的科技，佔用的時間由送的村民補回）。
   */
  /** repeat = 可以重複研究幾次（維京農莊每座長屋一個），次數由搜尋決定（policy.repeats） */
  civTechs: { id: string; requires?: string | string[]; tc?: boolean; instant?: boolean; excludes?: string[]; repeat?: number }[]
  /** 目錄缺的科技（id 和目錄相同時取代目錄的項目） */
  extraItems?: ExtraItem[]
  /** 可以買來給村民採的牲畜（馬利的牛）：在 at 訓練，每隻 food 食物、每人每秒 raw；搜尋決定買幾隻（policy.herd） */
  herd?: { at: string; label: string; cost: Partial<Bundle>; time: number; food: number; raw: number; max: number }
  /**
   * 監工（中國、朱熹）：督導非城鎮中心的建築時，那項研究或生產快 work 倍。start = 開局就有的人數；
   * at = 可以訓練的建築（不含城鎮中心，城鎮中心要一直出村民）；搜尋決定再訓練幾名（policy.officials）。
   */
  officials?: { unit: string; start: number; at: string[]; cost: Partial<Bundle>; time: number; max: number; work: number }
  /**
   * 業力（金朝山殿）：building 完成後從 start 開始，radius 格內採集（含帶著資源走回投放點）的工人每秒累積 rates[工人]；
   * 達到 threshold 時 duration 秒內套用 gather，結束後歸零（期間不累積）
   */
  karma?: { building: string; radius: number; start: number; threshold: number; duration: number; rates: Record<string, number>; gather: Partial<Gather> }
  /**
   * 慶典（馬利格里奧巴拉）：building 完成後，搜尋選的慶典（policy.festival）每次付 cost、持續 duration 秒、之後冷卻 cooldown 秒；
   * 各選項的效果用 Trigger 欄位表示
   */
  festival?: { building: string; cost: Partial<Bundle>; duration: number; cooldown: number; options: Record<string, { label: string; gather?: Partial<Gather>; villagerTime?: number; prod?: Trigger['prod'] }> }
  /**
   * 詔令（金帳）：有 requires 才能用，一次只能一種，搜尋決定用哪種（policy.edict）；
   * 選項的 requires 是要先研究的解鎖科技，bonusUnit = 每訓練一次另外免費送 1 名
   */
  edicts?: { requires: string; options: Record<string, { label: string; requires?: string; prod?: Trigger['prod']; farmerIncome?: Partial<Record<Res, number>>; bonusUnit?: string }> }
  /**
   * 草場產馬（金朝）：每座 building 每 every[時代] 秒 1 匹，每座最多 max 匹；
   * 在 at 訓練 cls 類單位時用掉 1 匹，立刻出兵、便宜 discount
   */
  horses?: { building: string; every: number[]; max: number; at: string[]; cls: string; discount: Partial<Bundle> }
  /**
   * 總督（圖格魯克）：每座 fort 完成後依 policy.governors 的順序任命（每位只能一座），等級 = 1 + 這座已研究的升級數（upgrades 依序），
   * 第 4 級要先有 level4Requires。效果依等級：villagerSpeed（城鎮中心生產 +x）、techCost（科技 -x）、perBuilding（radius 格內每座農田／房屋每分鐘食物，第 4 級另給 stonePct）
   */
  governors?: {
    fort: string
    upgrades: string[]
    level4Requires?: string
    options: Record<string, { label: string; villagerSpeed?: number[]; techCost?: number[]; perBuilding?: number[]; stonePct4?: number; radius?: number }>
  }
  /** 貸款（聖殿騎士團匯票）：研究 requires 後，缺黃金且食物真的有多時，借付得起的最大一筆：先付 food，duration 秒內每秒給 perSec 黃金（一次一筆） */
  loans?: { requires: string; options: { food: number; perSec: number; duration: number }[] }
  /**
   * 英雄（聖女貞德）：worker 是開局的英雄工人；每秒 xpPassive + 工作時 xpWork 經驗，達到 levelUp 時離開經濟（不再採集），並觸發 on
   */
  hero?: { worker: string; xpPassive: number; xpWork: number; levelUp: number; on: string }
  /** 一次產出好幾種單位的營隊（溫格德宮殿）：單位 id → 實際給的單位 */
  bundles?: Record<string, Record<string, number>>
  /** 聖物收入倍率：擁有 building 時 ×mul（神羅、龍騎士團雷格尼茨大教堂 ×2） */
  relicMul?: { building: string; mul: number }[]
  /** 寶塔（中國、朱熹）：觸發 requires（元朝）後，最多 max 座寶塔各放 1 個聖物，每分鐘 perMin（不吃什一稅倉） */
  relicPagoda?: { building: string; requires: string; perMin: Partial<Record<Res, number>>; max: number }
  /** 聖域（德里）：研究 tech 後從 fromAge 起就能佔聖地，聖地黃金 ×siteMul */
  sanctity?: { tech: string; fromAge: number; siteMul: number }
  /** 陸地貿易的文明加成（頁面「貿易」開啟時才模擬） */
  trade?: TradeSpec
  /**
   * 金角塔（拜占庭）：building 完成後依序免費產出合約（policy.contract，沒選用第一份）裡可用的傭兵；
   * 每批時間 = 目錄（傭兵屋）時間 × timeMul，批量照 batches。requires = 要先研究的合約（老兵、精英）
   */
  mercenaries?: { building: string; timeMul: number; contracts: Record<string, { label: string; units: { id: string; requires?: string }[] }> }
  /** 帕拉丁學校（拜占庭）：擁有 building 時，訓練 units 每名有 chance 機率在地標多送一名（照期望值累積） */
  bonusSpawn?: { building: string; units: string[]; chance: number }
  /** 漁船投放食物時另得的資源（馬利 10% 黃金、拜占庭 20% 橄欖油）；頁面「捕魚」開啟時才模擬 */
  fishBonus?: { to: Res | Special; ratio: number }[]
  /** 累積量達到門檻時觸發（維京約弗薩迦：村民採 2500 獵物食物）；after = 要先研究或觸發的 id */
  milestones?: { id: string; label: string; kind: 'hunt'; amount: number; after?: string }[]
  /** 朝代（中國、朱熹）：這些時代的升代地標全部蓋齊時觸發 `dynasty-<時代>`；搜尋決定要不要補蓋另一座（policy.dynasty） */
  dynasty?: number[]
  /** 維齊爾（鄂圖曼）：村民與升代給經驗，達到門檻得 1 點 vizier（每點分開算），最多 max 點 */
  vizier?: { villager: number; age: Record<number, number>; points: number[]; max: number }
  /**
   * 學者（德里）：駐紮後所有研究加速，時間 × (14/15·0.87808^n + 1/15)。
   * 搜尋決定訓練幾名（policy.scholars）；at = 訓練建築，free = 某建築第一座完成時送的學者。
   */
  scholars?: { unit: string; at: string[]; free: Record<string, number>; max: number; costAt?: Record<string, Partial<Bundle>> }
  /**
   * 有收入的輔助單位（蘇格蘭教士放魚池、日本僧侶在禪之後產金）：搜尋決定訓練幾名（policy.support[unit]），
   * 每名每分鐘 perMin；requires = 要先研究或擁有的 id
   */
  support?: { unit: string; at: string[]; max: number; perMin: Partial<Record<Res, number>>; requires?: string; maxFrom?: { base: number; per: string[] }; mulOn?: { on: string; mul: number }[] }[]
  /** 雙倍生產（蒙古敖包範圍內）：要有 requires，每批村民多出一倍，多付 stone 石頭；搜尋決定開不開（policy.double） */
  doubleProduce?: { requires: string; stone: number }
  /** 每棟建築完成返還的資源（拜占庭田野之石）：byId 指定建築，地標用 landmark，其他非農田建築用 other */
  buildRefund?: { res: Res; byId: Record<string, number>; other: number; landmark: number }
  bonuses: Bonus[]
}

const STD: Bundle = { food: 200, wood: 150, gold: 100, stone: 0 }
const DROP: Record<Res, string[]> = {
  food: ['mill'],
  wood: ['lumber-camp'],
  gold: ['mining-camp'],
  stone: ['mining-camp'],
}

/**
 * 法蘭西、貞德的商會（Fandom Chamber of Commerce 頁）：每完成一項這 16 項經濟科技送 1 名商人，陸地最多 14 名；
 * 商人可以改運食物或木材（Fandom Trade 頁）
 */
const CHAMBER_TRADE: TradeSpec = {
  freeTraders: {
    building: 'chamber-of-commerce',
    techs: [
      'horticulture', 'fertilization', 'precision-cross-breeding', 'drift-nets', 'extended-lines', 'forestry', 'double-broadax', 'lumber-preservation',
      'crosscut-saw', 'merchant-guilds', 'wheelbarrow', 'specialized-pick', 'shaft-mining', 'cupellation', 'professional-scouts', 'survival-techniques',
    ],
    max: 14,
  },
  anyRes: true,
}

function spec(abbr: string, zh: string, patch: Partial<CivSpec>): CivSpec {
  return {
    abbr,
    zh,
    start: { ...STD },
    startOther: {},
    startNote: '標準開局 200 食物、150 木材、100 黃金、6 村民、1 斥候（Fandom）。',
    startWorkers: { [patch.worker ?? 'villager']: 6 },
    extraPop: 1,
    ownedSheep: 5,
    startFood: 0,
    startHunt: 0,
    tcSheep: 0,
    tcStartDelay: 0,
    worker: 'villager',
    workerCap: 200,
    workerSpecs: {},
    villagerBatch: 1,
    popModel: 'houses',
    housePop: 10,
    popBuildings: {},
    carry: 10,
    berryCarry: 0,
    gather: { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    woodAtTree: 0.7,
    woodInstant: false,
    noBoar: false,
    orchardBush: 250,
    byproducts: [],
    huntGold: 0,
    landmarkCostMul: 1,
    prebuilt: [],
    dropoff: DROP,
    freeDropoffs: 0,
    farm: { id: 'farm', slots: 1 },
    trickles: [],
    grants: {},
    batches: {},
    costOverride: {},
    notMilitary: [],
    minAgeOverride: {},
    triggers: [],
    civTechs: [],
    bonuses: [],
    ...patch,
  }
}

const ISLAMIC_BERRY = (extra = 0.25): Bonus[] => [
  { text: `採野果 +${Math.round(extra * 100)}%、攜帶 +3`, modeled: 'yes', source: SRC.a4w },
  { text: '不能採野豬', modeled: 'yes', source: SRC.a4w },
]

const ORCHARD: Bonus = { text: '磨坊蓋在野果旁形成果園，每叢 +100 食物', modeled: 'yes', source: SRC.a4w }

const SPECS: Record<string, CivSpec> = {
  ab: spec('ab', '阿拔斯王朝', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材（比標準多 50）、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，人口 7/10；只有首都城鎮中心，智慧宮要自己蓋（aoe4world 17.0.12260 對局紀錄、Fandom）。',
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    prebuilt: [],
    // 黃金時代：一階採集 +15%、二階建造 +20%；行政側翼讓加成 ×1.5（採集 +22.5%、建造 +30%）
    // 16.2.10604 起五階（Fandom Abbasid Dynasty 頁）：10 棟採集 +15%、20 棟建造 +20%、50 棟商人收入 +20%（三、五階是戰鬥加成）
    goldenAge: [{ buildings: 10, mul: 1.15 }, { buildings: 20, build: 1.2 }, { buildings: 50, trade: 1.2 }],
    goldenBoost: { on: 'administration-wing', mul: 1.5 },
    notMilitary: ['trade-caravan', 'imam'],
    triggers: [
      // 軍事側翼：升封建送 2 長矛兵 + 2 弓箭手、升城堡 2 駱駝騎兵、升帝王 3 手砲兵
      { on: 'military-wing', fromAge: 1, units: { spearman: 2, archer: 2 } },
      { on: 'military-wing', fromAge: 2, units: { 'camel-rider': 2 } },
      { on: 'military-wing', fromAge: 3, units: { handcannoneer: 3 } },

      // 改良加工（智慧宮，帝王）：投放 +8%，近似成採集 ×1.08
      { on: 'improved-processing', gather: { all: 1.08 } },

      // 新鮮食材：村民食物 -40%（50 → 30）
      { on: 'fresh-foodstuffs', costMul: [{ ids: ['villager'], res: ['food'], mul: 0.6 }] },
      // 肥沃月彎：經濟與人口建築的木材、石頭 -30%
      { on: 'fertile-crescent', costMul: [{ ids: ['house', 'mill', 'lumber-camp', 'mining-camp', 'town-center', 'farm', 'dock'], res: ['wood', 'stone'], mul: 0.7 }] },
      // 知識保存：之後所有科技（含側翼）-20%
      { on: 'preservation-of-knowledge', costMul: [{ kind: 'technology', mul: 0.8 }] },
    ],
    civTechs: [
      { id: 'improved-processing' },
{ id: 'fresh-foodstuffs' }, { id: 'fertile-crescent', requires: 'economic-wing' }, { id: 'preservation-of-knowledge', requires: 'culture-wing' }],
    bonuses: [
      { text: '開局 200 食物、200 木材、100 黃金；6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://aoe4world.com/players/1169084/games/259194047/summary?camelize=true', note: '對局紀錄 t=0、Fandom 與職業開局（磨坊、礦場、房屋、智慧宮共 200 木）三方一致。' },
      { text: '採野果 +25%、攜帶 +3；不能採野豬', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/abbasid.json', note: '野果 0.69 → 0.8625 食物/秒；鹿和羊正常。' },
      { text: '磨坊蓋在野果旁形成果園，每叢 +100 食物', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/abbasid.json' },
      { text: '村民在黑暗時代蓋智慧宮（50 木、30 秒），之後在智慧宮研究側翼升代（每個 100 秒），不需要村民', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/House_of_Wisdom', note: '側翼 400 食 + 200 金 → 1200 + 600 → 2400 + 1200，四代可再買第 4 個（2400 + 1200，不升代），用目錄花費與時間。智慧宮不再當成開局建築，目錄要把智慧宮改成一代可蓋，否則無法升代。各側翼只能選一次、與智慧宮科技共用一條佇列，都沒檢查。' },
      { text: '黃金時代一階：智慧宮範圍內 10 棟建築，村民採集 +15%', modeled: 'approx', source: 'https://aoe4.club/en/patchs/age-of-empires-iv-patch-16-2-10475', note: '要先蓋好智慧宮；把家附近完成的非農田建築（含首都城鎮中心，不含遠處的投放點）都算在範圍內。實際只算智慧宮影響範圍內、不含農田與城牆。' },
      { text: '黃金時代其他階：20 棟建造 +20%、50 棟商隊黃金 +20%；行政側翼讓黃金時代加成 ×1.5（採集 +22.5%、建造 +30%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Abbasid_Dynasty', note: '二階（20 棟）建造 +20%、四階（50 棟）商人收入 +20%（頁面「貿易」開啟時）與行政側翼 ×1.5 都已計入。棟數近似成家附近的非農田建築。16.2.10604 起為 10/20/30/50/75 五階；三階駱駝傷害、五階近戰步兵傷害與經濟無關。' },
      { text: '新鮮食材（磨坊，二代）：村民 -40%，50 → 30 食物', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Fresh_Foodstuffs', note: '科技 50 食物 + 75 黃金、20 秒（目錄）；研究後村民 30 食物。搜尋決定研不研、哪一步研。' },
      { text: '肥沃月彎（經濟側翼，二代）：房屋、磨坊、伐木場、礦場、城鎮中心木石 -30%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Fertile_Crescent_(technology)', note: '經濟側翼研究後才能研（25 食物 + 75 黃金、30 秒）。城鎮中心 280 木 + 210 石已由第 13 季職業開局證實；農田（只有 Fandom）與碼頭（只有 aoe4world）信心中等，也一起打折。' },
      { text: '知識保存（文化側翼，二代）：之後所有科技與側翼 -20%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Preservation_of_Knowledge', note: '文化側翼研究後才能研；之後所有科技與科技型升代（側翼）-20%，城堡側翼變 960 食物 + 480 黃金。' },
      { text: '農業（經濟側翼，三代）：農田採集 +15%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/abbasid.json', note: '目錄效果 foodGatherRate ×1.15 會套到羊、野果和農田，不只農田；也沒檢查是否選了經濟側翼。' },
      { text: '代數（每項軍事科技智慧宮每分鐘 +3 食 +3 木 +2 金）、改良加工（投放 +8%）、城市規劃（相鄰同型建築效率 +8%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Algebra', note: '改良加工（帝王，300 木 700 金、90 秒，投放 +8% 近似成採集 ×1.08）已計入；代數（依軍事科技數的被動收入）與城市規劃（相鄰同型建築效率 +8%）沒有建模。' },
      { text: '貿易商隊 -33%（40 木 + 40 金）、碼頭 -50%（75 木）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/abbasid.json', note: '目錄費用已是折扣後。商隊收入照 Fandom Trade 頁：速度 1.5625、最後倍率 0.38，每分鐘黃金比一般商人少約 12%（頁面「貿易」開啟時）。商隊與伊瑪目不算軍隊。' },
      { text: '軍事側翼完成時送 2 長矛兵 + 2 弓箭手（升二代）、2 駱駝騎兵（升三代）、3 手砲兵（升四代）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Military_Wing', note: '側翼研究完成時送出，算進軍隊目標與目標後出兵。' },
      { text: '攻城專家：步兵可野戰建造衝車與攻城塔，三代起可造弩砲與投石車', modeled: 'na', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/abbasid.json', note: '「不需攻城工程」由 aoe4world 證實，時代限制只有 Fandom；目錄只有攻城工坊能造，且沒有攻城塔。' },
    ],
  }),
  ay: spec('ay', '阿尤布', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，人口 7/10；智慧宮不是開局就有，要村民自己蓋（aoe4world 對局紀錄 t=0、Fandom）。',
    // startWorkers { villager: 6 }、extraPop 1（斥候）、ownedSheep 5、tcStartDelay 0、startFood 0 都是預設值
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    // prebuilt 用預設 []：智慧宮（house-of-wisdom-1，50 木材、30 秒）由村民蓋，蓋好才能研究側翼
    // 黃金時代：一階採集 +10%、二階研究 +25%、三階生產 +20%（村民 20 → 16.7 秒）
    goldenAge: [{ buildings: 10, mul: 1.1 }, { buildings: 20, research: 1.25 }, { buildings: 30, prod: 1.2 }],
    notMilitary: ['trade-caravan', 'dervish'],
    triggers: [
      // 軍事側翼・名匠：進入的時代 4 項鐵匠攻防科技與軍事學院（軍事生產 +33%）自動免費完成（Fandom Master Smiths (House of Wisdom)）
      { on: 'feudal-military-wing-master-smiths', freeUpgrades: 4, prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 1 / 1.33 }] },
      { on: 'castle-military-wing-master-smiths', freeUpgrades: 4, prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 1 / 1.33 }], replaces: ['feudal-military-wing-master-smiths'] },
      { on: 'imperial-military-wing-master-smiths', freeUpgrades: 4, prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 1 / 1.33 }], replaces: ['feudal-military-wing-master-smiths', 'castle-military-wing-master-smiths'] },

      // 軍事側翼・援軍：完成 15 秒後起每 120 秒免費沙漠突襲者 1/3/7 名（較高階取代較低階）
      { on: 'feudal-military-wing-reinforcement', every: 120, delay: 15, eachUnits: { 'desert-raider': 1 } },
      { on: 'castle-military-wing-reinforcement', every: 120, delay: 15, eachUnits: { 'desert-raider': 3 }, replaces: ['feudal-military-wing-reinforcement'] },
      { on: 'imperial-military-wing-reinforcement', every: 120, delay: 15, eachUnits: { 'desert-raider': 7 }, replaces: ['feudal-military-wing-reinforcement', 'castle-military-wing-reinforcement'] },

      // 經濟側翼・成長：免費村民（果園加量、帝王 +10% 未計入）
      { on: 'feudal-economic-wing-growth', villagers: 3 },
      { on: 'castle-economic-wing-growth', villagers: 7 },
      { on: 'imperial-economic-wing-growth', villagers: 10 },
      // 經濟側翼・工業：資源與建造速度（較高階取代較低階的建造加成）
      { on: 'feudal-economic-wing-industry', grant: { wood: 400 }, build: 1.3 },
      { on: 'castle-economic-wing-industry', grant: { wood: 900, stone: 400 }, build: 1.4, replaces: ['feudal-economic-wing-industry'] },
      { on: 'imperial-economic-wing-industry', grant: { wood: 2000, stone: 1000 }, build: 1.5, replaces: ['feudal-economic-wing-industry', 'castle-economic-wing-industry'] },
    ],
    bonuses: [
      { text: '開局 200 食物、200 木材（比標準多 50）、100 黃金、6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://aoe4world.com/players/15218890/games/258371408', note: '兩場對局紀錄（12182、12260 版）t=0 都是 200/200/100/0，Fandom 相同；官方更新說明沒有寫這個數字。' },
      { text: '採野果 +25%、攜帶 +3；不能採野豬', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/ayyubids.json' },
      { text: '磨坊蓋在野果旁形成果園，每叢 +100 食物（350）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/ayyubids.json' },
      { text: '智慧宮要村民蓋（50 木材、30 秒、限 1 座），蓋好後研究側翼升代，不需要村民蓋地標', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/House_of_Wisdom', note: '規劃器在第一次升代前自動補一步「蓋智慧宮」，蓋好才開始研究。智慧宮不給人口，也不是投放點。' },
      { text: '側翼升代：封建 400 食物/200 黃金、城堡 1200/600、帝王 2400/1200，各 120 秒；文化側翼・晉升 200/100、850/500、1350/700，各 96 秒', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/ayyubids.json', note: '用目錄的花費與時間。四個側翼（文化、經濟、軍事、貿易）各只能用一次，規劃器還沒限制，可能同一側翼連用（例如三次晉升）。帝王時代的第四翼（2400/1200）沒有用到。' },
      { text: '黃金時代一階：智慧宮範圍內 10 棟建築，村民採集 +10%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/ayyubids.json', note: '要先蓋好智慧宮；把家附近完成的非農田建築（含城鎮中心，不含遠處的投放點）都算進去；實際只算智慧宮 9×9 範圍與相鄰連鎖的建築（農田、城牆不算），智慧宮本身算 1 棟。' },
      { text: '黃金時代二、三階：20 棟研究 +25%、30 棟生產 +20%（村民 20 → 16.7 秒）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/ayyubids.json', note: '二階研究 +25%（只套一般科技，會不會加快側翼不明）、三階生產 +20%（村民 20 → 16.7 秒）已計入；棟數近似成家附近的非農田建築。二階資料寫 1.5，說明文字與 11.1.1201、12.0.1974 更新說明都是 +25%（中等信心）。' },
      { text: '經濟側翼・成長：完成時免費 3/7/10 名村民，封建、城堡版果園每叢再 +50/+100；城堡升帝王或第四翼不加果園，改為村民工作 +10%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/ayyubids.json', note: '免費村民 3/7/10 已計入（完成時出現在城鎮中心）；果園加量與帝王 +10% 未計入。人口滿時會不會出村民不明，引擎一律送。' },
      { text: '經濟側翼・工業：完成時 +400 木材；+900 木材 +400 石頭；+2000 木材 +1000 石頭（第四翼 +2800/+900），村民建造 +30/40/50%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/ayyubids.json', note: '資源與建造速度已計入（升到較高階時取代較低階的建造加成）；第四翼（+2800/+900）未計入。15.1.6970 調整後的數字。' },
      { text: '文化側翼・後勤：免費 2/3/4 名托缽僧（常駐治療光環）；軍事側翼・援軍：完成 15 秒後起每 120 秒免費 1/3/7 名沙漠突襲者', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/ayyubids.json', note: '軍事側翼・援軍已計入（每 120 秒 1/3/7 名沙漠突襲者，算進軍隊目標與目標後出兵）；文化側翼・後勤的托缽僧是治療單位，不影響規劃。後勤數量未驗證：兩場對局紀錄出現 3 個托缽僧圖示，說明寫 2。' },
      { text: '軍事側翼・名匠：進入的時代鐵匠攻防科技（含軍事學院）自動免費完成；貿易側翼・顧問：免費 3/5/7 名阿塔貝格（0 人口）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/ayyubids.json', note: '每次免費完成該時代 4 項鐵匠攻防科技（近戰／遠程的攻擊與護甲，算進目標後的升級數）與軍事學院（軍事建築生產 +33%，只算一次），來源：Fandom「Master Smiths (House of Wisdom)」。貿易側翼・顧問的阿塔貝格是支援單位，不影響規劃。' },
      { text: '貿易側翼・市集：每 3 分鐘商隊提供 4 筆用黃金換資源或單位的交易', modeled: 'no', source: 'https://ageofempires.fandom.com/wiki/Bazaar', note: '交易內容隨機。食物、木材 150→225、350→625、425→1025 有更新說明；石頭（175/325/525）與單位數只有 Fandom（中等信心）。貝都因單位只能從這裡買。' },
      { text: '商隊便宜 33%（40 木材/40 黃金）、碼頭便宜 50%（75 木材）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/ayyubids.json', note: '目錄已折價。商隊收入照 Fandom Trade 頁（速度 1.5625、倍率 0.38），頁面「貿易」開啟時計入。' },
      { text: '步兵不需攻城工程就能在野外造攻城槌；城堡時代起可造弩砲、投石機', modeled: 'na', source: 'https://ageofempires.fandom.com/wiki/Battering_Ram_(Age_of_Empires_IV)', note: '目錄的攻城槌只能在攻城工坊（城堡時代）訓練。野外造槌 70 秒只有 Fandom；資料只有封建版，Fandom 說黑暗時代就可以（未驗證）。野外弩砲、投石機 50 秒（12.0.1974）。' },
    ],
  }),
  by: spec('by', '拜占庭', {
    start: { ...STD, stone: 100 },
    startOther: { oliveoil: 100 },
    startNote: '開局 200 食物、150 木材、100 黃金、100 石頭、100 橄欖油，6 村民、1 斥候，人口 7/10（Fandom、Patch 9.1.370、2024 對局紀錄）。',
    // startWorkers / extraPop / ownedSheep / tcStartDelay / startFood 都是預設值：6 村民 + 1 斥候、5 隻羊（羊數是全域規則，2024 對局紀錄只看到 3 隻，未定）。
    // 引擎在開局就用 100 石頭蓋這一座蓄水池；只建模一座、一級水。
    // 蓄水池：一級水 +10%，範圍 9.5 格（Fandom）；佔地 2×2 是推測
    zones: [
      // 大酒莊（升封建地標）：6.25 格內村民採集時的橄欖油 +60%（只加成橄欖油，不加成採集）
      { building: 'grand-winery', res: 'food', mul: 1.6, radius: 6.25, half: 3, to: 'oliveoil', dropoff: ['food'] },
// 水位 1～5：+10/14/18/22/24%（17.0，Fandom Cistern 頁）；渡槽每格 2 石頭、2 秒，蓄水池影響區 10×10 不能重疊，所以兩座之間至少約 8 格
{ building: 'cistern', res: 'all', mul: 1.1, radius: 9.5, half: 1, max: 5, levels: [1.1, 1.14, 1.18, 1.22, 1.24], link: { building: 'aqueduct', minLen: 8 } }],
    // 橄欖油：採野果另得 50%、橄欖園 15%（羊、打獵不產油）
    byproducts: [
      { from: 'berry', to: 'oliveoil', ratio: 0.5 },
      { from: 'farm', to: 'oliveoil', ratio: 0.15 },
      // 村民採岸邊魚另得 10%（Fandom Shore Fish 頁；頁面「捕魚」開啟、有岸邊魚時）
      { from: 'fish', to: 'oliveoil', ratio: 0.1 },
    ],
    farm: { id: 'olive-grove', slots: 1 },
    // 傭兵：目錄的 other.oliveoil 是每名單位的價格，time 是整批時間。戰象、塔象一批 1 隻，用預設值。
    batches: {
      longbowman: { size: 4 },
      'javelin-thrower': { size: 4 },
      keshik: { size: 2 },
      landsknecht: { size: 3 },
      ghulam: { size: 3 },
      streltsy: { size: 3 },
      'camel-rider': { size: 2 },
      grenadier: { size: 2 },
      // 貿易站傭兵（需要旁邊有中立貿易站）
      'royal-knight': { size: 2 },
      'camel-archer': { size: 2 },
      'desert-raider': { size: 3 },
      'horse-archer': { size: 3 },
      arbaletrier: { size: 4 },
      'zhuge-nu': { size: 5 },
      mangudai: { size: 3 },
      'musofadi-warrior': { size: 5 },
      sipahi: { size: 3 },
    },
    // 西帕希：目錄每名 155（一批 465）是舊值，13.0.4178 官方改成一批 450
    costOverride: {
      sipahi: { oliveoil: 150 },
    },
    notMilitary: ['trader', 'monk'],
    // 商人另得黃金 20% 的橄欖油（Fandom Trade 頁）
    trade: { other: { to: 'oliveoil', ratio: 0.2 } },
    // 漁船另得 20% 橄欖油（Fandom Fishing 頁，深水與岸邊魚都算）
    fishBonus: [{ to: 'oliveoil', ratio: 0.2 }],
    // 金角塔（Fandom Golden Horn Tower 頁）：免費產出已解鎖的傭兵，每批時間約傭兵屋基礎時間 × 2.93（17.0），批量同傭兵屋。
    // 合約內容照 Fandom Mercenary House 頁：封建一種，老兵、精英合約各再解鎖一種
    mercenaries: {
      building: 'golden-horn-tower',
      timeMul: 2.93,
      contracts: {
        eastern: { label: '東方合約', units: [{ id: 'keshik' }, { id: 'ghulam', requires: 'veteran-mercenaries' }, { id: 'tower-elephant', requires: 'elite-mercenaries' }] },
        western: { label: '西方合約', units: [{ id: 'longbowman' }, { id: 'landsknecht', requires: 'veteran-mercenaries' }, { id: 'streltsy', requires: 'elite-mercenaries' }] },
        silk: { label: '絲路合約', units: [{ id: 'javelin-thrower' }, { id: 'camel-rider', requires: 'veteran-mercenaries' }, { id: 'grenadier', requires: 'elite-mercenaries' }] },
      },
    },
    // 帕拉丁學校（Fandom Palatine School 頁）：訓練這 4 種單位時 30% 機率在地標多生一名
    bonusSpawn: { building: 'palatine-school', units: ['limitanei', 'varangian-guard', 'cataphract', 'cheirosiphon'], chance: 0.3 },
    triggers: [
      // 蓄水池徵兵：範圍內軍事生產每級 +20%；近似成一級水、軍事建築都在範圍內
      { on: 'cistern', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 1 / 1.2 }] },

      // 邊境聚落：房屋建造快 500%（15 → 2.5 秒）
      { on: 'border-settlements', buildTime: { house: 1 / 6 } },
    ],
    civTechs: [{ id: 'border-settlements', requires: 'house' }],
    // 田野之石：建築完成返還 2n² 石頭（n = 邊長格數）。佔地查 Fandom 各建築頁：房屋、投放點、橄欖園、蓄水池、前哨 2×2；兵營、靶場、馬廄、攻城工坊、傭兵屋 3×3；鐵匠鋪、市場、修道院、碼頭、大學、主堡、城鎮中心、地標 4×4
    buildRefund: {
      res: 'stone',
      byId: { aqueduct: 0, barracks: 18, 'archery-range': 18, stable: 18, 'siege-workshop': 18, 'mercenary-house': 18, blacksmith: 32, market: 32, monastery: 32, dock: 32, university: 32, keep: 32, 'town-center': 32 },
      other: 8,
      landmark: 32,
    },
    bonuses: [
      { text: '開局多 100 石頭與 100 橄欖油（200/150/100/100 + 100 油），6 村民 + 1 斥候', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Byzantines_(Age_of_Empires_IV)', note: 'Patch 9.1.370 把開局石頭從 50 提高到 100，之後沒有再改；2024 年的對局紀錄也吻合。石頭剛好蓋第一座蓄水池。' },
      { text: '蓄水池灌溉：範圍內村民採集依水位 +10/14/18/22/24%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Cistern', note: '範圍 9.5 格（Fandom），只算範圍內的採集點；搜尋決定蓋幾座（0～5，每座 100 石頭、15 秒）、各蓋在農田區或哪個礦／林線／野果旁，以及要不要用渡槽連起來。水位 = 1 + 已完成的渡槽段數（依蓋好的順序把相鄰兩座連起來，每格 2 石頭、2 秒，兩座之間至少 8 格，因為影響區 10×10 不能重疊），所有蓄水池同一水位。蓋在農田區時依可容納的田數折算農田。17.0 把五級水從 26% 改成 24%。用城牆接渡槽沒有建模。' },
      { text: '田野之石：每棟建築完成返還石頭（2×2 +8、3×3 +18、4×4 與地標 +32、奇觀 +72）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Byzantines_(Age_of_Empires_IV)', note: '每棟建築（含橄欖園）完成時返還 2n² 石頭（n = 邊長格數，Fandom 拜占庭頁）；各建築佔地查 Fandom：房屋、投放點、橄欖園、蓄水池 2×2（8），兵營、靶場、馬廄、攻城工坊 3×3（18），鐵匠鋪、市場、修道院、碼頭、大學、主堡、城鎮中心、地標 4×4（32）。' },
      { text: '橄欖油：採野果另得 50%、橄欖園 15%、岸邊魚 10%，漁船 20%、商人 20%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/byzantines.json', note: '野果、橄欖園的油一直有算；商人每趟另得黃金 20%（頁面「貿易」開啟時，Fandom Trade 頁）；漁船另得 20%、村民採岸邊魚另得 10%（頁面「捕魚」開啟時，Fandom Fishing、Shore Fish 頁）。' },
      { text: '大酒莊（升封建地標）：6.25 格內村民橄欖油 +60%，兼作磨坊與修道院', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Grand_Winery', note: '範圍內食物採集點產生的橄欖油 +60%（野果、農田區），搜尋決定蓋在哪；蓋在野果、鹿群旁時兼作那裡的磨坊（不用另蓋），周圍也能種田（野果採完後）。兼作修道院（聖物）沒有建模。半徑只有 Fandom。' },
      { text: '橄欖園取代農田（75 木材、6 秒，採集速率同農田）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Olive_Grove', note: '天然食物採完後蓋橄欖園，每座 1 名村民，附帶 15% 橄欖油。' },
      { text: '傭兵只花橄欖油、成批購買：長弓兵 4 名 420 油/75 秒、標槍兵 4 名 460、怯薛 2 名 380、古拉姆 3 名 420', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: '批量與單價都對（16.1.9737 長弓兵 5→4 名、420 油）。但沒有橄欖油收入，實際上買不到。合約免費、10 秒、只能選一份，老兵/精英合約的前置，以及貿易站傭兵需要旁邊有貿易站，這些都未限制。傭兵坊蓋在徵兵蓄水池旁的生產加速未建模。蘭茨克內希特 450 油只有 aoe4world 一個來源（Fandom 寫 480）。' },
      { text: '蓄水池影響範圍：徵兵（軍事生產每級 +20%）、辯證（研究每級 +30%）、守護（受傷每級 -5%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Cistern', note: '徵兵近似成蓋好第一座蓄水池後所有軍事建築生產 +20%（一級水，假設都在範圍內）；辯證（研究）與守護（受傷）沒有建模。只有 Fandom 一個來源。' },
      { text: '邊境聚落（房屋科技，封建）：40 木材、80 黃金，房屋建造快 500%（15 秒 → 2.5 秒）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/House_(Age_of_Empires_IV)', note: '房屋科技（40 木材、80 黃金、20 秒），要先有一座房屋；研究後房屋建造時間 ÷6。' },
      { text: '金角塔免費自動產出已解鎖的傭兵；帕拉丁學校讓邊防軍、瓦良格衛隊、鐵甲騎兵、希臘火噴射器 30% 機率在地標多生一名', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Golden_Horn_Tower', note: '金角塔：搜尋選一份合約（東方怯薛、西方長弓兵、絲路標槍兵；研究老兵／精英合約後再加一種），完成後依序免費產出，每批時間 = 傭兵屋時間 × 2.93（17.0，Fandom），批量同傭兵屋，人口不夠就等；遊戲是隨機挑，這裡輪流。合約本身（免費、10 秒）沒算；傭兵屋蓋在貿易站旁解鎖的兩種沒建模。帕拉丁學校：擁有時這 4 種單位每訓練 1 名累積 0.3 名，滿 1 名就多送（照期望值，Fandom Palatine School 頁）。兩座地標都不是付費生產佇列，目錄卻把它們列成這些單位的生產建築，是錯的。' },
    ],
  }),
  ch: spec('ch', '中國', {
    startNote: '標準開局 200 食物、150 木材、100 黃金、0 石頭；6 村民、1 斥候、城鎮中心旁 5 隻羊，人口 7/10，沒有監工（Fandom 中國頁、Resource 頁）。',
    // 村莊 +40 人口（100 木材、15 秒，上限 3 座）；房屋照常 +10。引擎自動補人口只蓋房屋，村莊要用「蓋 N 座村莊」目標才會蓋。
    popBuildings: { village: 40 },
    // 稅收近似：投放量的 8%（學院範圍內 16%），假設約六成投放在範圍內、再扣監工來回收稅的延遲 → 0.1；學院完成前不計。
    byproducts: [
      { from: 'all', to: 'gold', ratio: 0.1, requires: 'imperial-academy', note: '稅金 8%／學院範圍內 16%，需監工收回；近似成學院完成後全部採集的 10% 直接變黃金。' },
    ],
    notMilitary: ['imperial-official', 'trader', 'monk'],
    // 碼頭工作效率 +10%（Fandom：9.2.628 起從 +20% 改成 +10%）：漁船 30 → 27.3 秒；目錄的 25 秒是舊的 +20%
    costOverride: { 'fishing-boat': { time: 27.3 } },
    // 朝代：同時代兩座升代地標蓋齊。只有最新朝代的加成有效（replaces），解鎖的建築永久保留
    dynasty: [2, 3, 4],
    triggers: [
      { on: 'dynasty-2', villagerTime: 0.75 },
      { on: 'dynasty-3', speed: 1.15, replaces: ['dynasty-2'] },
      { on: 'dynasty-4', replaces: ['dynasty-2', 'dynasty-3'] },
    ],
    // 糧倉（宋朝解鎖）：7.5 格內農田 +10%／座，最多 3 座、4×4（Fandom Granary 頁）
    zones: [{ building: 'granary', res: 'food', mul: 1.1, radius: 7.5, half: 2, max: 3, requires: 'dynasty-2', stack: true, farmOnly: true }],
    // 監工：督導非城鎮中心的建築時研究與生產快 150%（×2.5）；只在帝國學院訓練（70 食物、35 黃金、20 秒），同時最多 4 名
    officials: { unit: 'imperial-official', start: 0, at: ['imperial-academy'], cost: { food: 70, gold: 35 }, time: 20, max: 4, work: 2.5 },
    // 寶塔（Fandom Pagoda 頁）：元朝解鎖，150 木材，最多 3 座，各放 1 個聖物，每分鐘 100 黃金、62 食物、62 木材、25 石頭；不吃什一稅倉
    relicPagoda: { building: 'pagoda', requires: 'dynasty-3', perMin: { gold: 100, food: 62, wood: 62, stone: 25 }, max: 3 },
    bonuses: [
      { text: '開局 200 食物、150 木材、100 黃金，6 村民、1 斥候、5 隻羊，沒有監工', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Chinese_(Age_of_Empires_IV)', note: '與標準開局相同；只有朱熹遺產開局帶監工。' },
      { text: '一般建築建造快 100%、防禦快 50%', modeled: 'yes', source: 'https://github.com/aoe4world/data/blob/main/civilizations/chinese.json', note: '目錄的建造時間已經是加速後的數字（房屋 7.5 秒、城鎮中心 82.5 秒、一代地標 95 秒）。' },
      { text: '村莊 +40 人口（100 木材、15 秒，上限 3 座）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Village_(Age_of_Empires_IV)', note: '用 popBuildings 計入；引擎自動補人口只蓋房屋，村莊要另外下「蓋村莊」目標，而且不限制 3 座。' },
      { text: '稅收：村民投放資源的 8% 存成稅金（漁船 4%），帝國學院範圍內加倍，由監工收回（每次 40，研究帝國科舉後 70）；生產單位 +2、研究科技 +24；城鎮中心投放不產生稅', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: '近似成學院完成後全部採集量的 10% 直接入庫黃金；學院前的稅、改用另一座一代地標升代時的稅、單位／科技稅、監工的訓練花費與收稅路程都沒算，城鎮中心投放的羊也照算。實際每分鐘收到多少稅沒有來源，0.1 是估計值。' },
      { text: '監工督導：經濟建築投放 +20%，軍事／研究建築工作效率 +150%（不能督導城鎮中心、碼頭、市場、地標，17.0 起也不能督導據點）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Imperial_Official', note: '開始一項研究或生產時，有空的監工就督導，時間 ÷2.5（不能督導城鎮中心）。其餘沒在督導研究或生產的監工各督導一種有投放建築的資源（照採集人數由多到少），那種資源投放 +20%；城鎮中心投放（羊、散樹）不算。職業對局回放（2026-11-07）顯示中國職業開局就在城鎮中心訓練監工，回放照做；一般模式城鎮中心只出村民。' },
      { text: '監工在帝國學院訓練只要 70 食物、35 黃金（城鎮中心 100／50），20 秒，同時最多 4 名', modeled: 'approx', source: 'https://github.com/aoe4world/data/blob/main/units/unified/imperial-official.json', note: '搜尋決定在帝國學院再訓練幾名（70 食物、35 黃金、20 秒，最多 4 名）；城鎮中心要一直出村民，所以不在城鎮中心訓練。' },
      { text: '朝代：蓋齊同時代兩座地標進入宋／元／明；宋朝村民 15 秒，元朝村民與監工移動 +15%，明朝軍隊生命 +15%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Dynasty', note: '搜尋決定要不要補蓋同時代的另一座地標（費用同升代）；蓋齊後進入宋（村民 20 → 15 秒）、元（工人移動 +15%）、明（軍隊生命，不影響規劃）。只有最新朝代的加成有效。朝代鎖定的寶塔、諸葛弩、火槍騎兵、擲彈兵仍沒有前置。' },
      { text: '糧倉（宋）：範圍內農田 +10%／座，最多 3 座 +30%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Granary_(Age_of_Empires_IV)', note: '宋朝後才能蓋（150 木材、18 秒，最多 3 座、4×4），7.5 格內農田採集 +10%／座（Fandom Granary 頁），搜尋決定蓋幾座、蓋在哪；兼磨坊的投放點效果沒有建模。' },
      { text: '寶塔（元）：放聖物後每分鐘 +100 黃金、62 食物、62 木材、25 石頭，最多 3 座', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Pagoda', note: '進入元朝（兩座城堡地標蓋齊）且拿到聖物後，引擎自動蓋寶塔（150 木材，最多 3 座），每座放 1 個聖物：每分鐘 100 黃金、62 食物、62 木材、25 石頭（Fandom Pagoda 頁），取代修道院的 80 黃金。聖物數量看頁面「聖物與聖地」設定與搜尋。' },
      { text: '古代技術：每進入過一個朝代，村民採集 +5%（唐朝算一個，最多 +20%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Ancient_Techniques', note: '用目錄固定 ×1.05，只對一直待在唐朝的玩家正確；加法或乘法疊加未證實（中信度）。神道研究只要 100 木材、250 黃金、36 秒，沒有建模。' },
      { text: '碼頭工作效率 +10%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Chinese_(Age_of_Empires_IV)', note: 'Fandom：9.2.628 起從 +20% 改成 +10%。目錄漁船 25 秒是舊的 +20%，改成 30 ÷ 1.1 = 27.3 秒（和朱熹相同）；捕魚只在頁面「捕魚」開啟時模擬。碼頭的其他船與研究沒有套用（引擎不模擬海戰）。' },
    ],
  }),
  de: spec('de', '德里蘇丹國', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，人口 7/10；沒有特殊開局單位或建築（官方 Patch 11963 把開局木材 250 改成 200，Fandom 與現行職業流程一致）。',
    // startWorkers { villager: 6 }、extraPop 1（斥候）、ownedSheep 5、tcStartDelay 0、startFood 0 都是預設值
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    notMilitary: ['scholar', 'trader'],
    triggers: [
      // 村落要塞（Fandom Village Fortresses 頁）：研究後主堡像城鎮中心一樣訓練村民
      { on: 'village-fortresses', actsAsTC: 'keep' },

      // 高效生產：學者駐守軍事建築時生產 +100%；近似成研究後、至少有 1 名學者時所有軍事建築 ×2
      { on: 'efficient-production', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 0.5, needScholar: true }] },

      // 蘇丹宮殿：自動產出蘇丹精英象塔，0 名學者 200 秒一隻（學者加速沒有建模）
      { on: 'palace-of-the-sultan', every: 200, eachUnits: { 'sultans-elite-tower-elephant': 1 } },

      // 希薩學院：每研究完一項科技，每分鐘 +12 食物
      { on: 'hisar-academy', perTechIncome: { food: 12 } },
{ on: 'compound-of-the-defender', costMul: [{ kind: 'building', res: ['stone'], mul: 0.75 }] }],
    // 學者：清真寺／信仰圓頂訓練，駐紮後所有研究加速；第一座清真寺送 1 名
    scholars: { unit: 'scholar', at: ['mosque', 'dome-of-the-faith'], free: { mosque: 1 }, max: 8, costAt: { 'dome-of-the-faith': { gold: 80 } } },
    minAgeOverride: { scholar: 1 },
    civTechs: [
      { id: 'sanctity', requires: 'mosque' },

      { id: 'village-fortresses', requires: 'keep' },

      { id: 'efficient-production' },
    ],
    // 聖域（Fandom Sanctity 頁）：學者從封建時代起可佔聖地，聖地黃金 +25%
    sanctity: { tech: 'sanctity', fromAge: 2, siteMul: 1.25 },
    bonuses: [
      { text: '開局 200 食物、200 木材、100 黃金（木材比標準多 50）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-11963/', note: '開局 6 村民、1 斥候、5 隻羊，沒有特殊單位。' },
      ...ISLAMIC_BERRY(),
      ORCHARD,
      { text: '所有科技免費但研究很慢（黑暗 3 倍、封建 3.5 倍、城堡 5 倍、帝王 12 倍）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/delhi.json', note: '目錄已是德里 0 學者時的時間與 0 花費（如手推車 270 秒）；少數科技是自訂時間，直接用目錄值；箭孔、前哨強化等防禦升級仍照常收黃金或石頭。' },
      { text: '學者駐守清真寺、信仰圓頂、學院、希薩學院或碼頭時，影響範圍內所有建築研究加速', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Scholar', note: '搜尋決定訓練幾名（0～8，135 黃金、30 秒、1 人口），出生後就算駐紮；研究時間 × (14/15·0.87808^n + 1/15)，套到所有研究（實際只加速影響範圍內的建築）。曲線只由 Fandom 一張帝王科技實測表擬合，中等可信度。' },
      { text: '第一座清真寺完成時免費送 1 名學者', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/delhi.json', note: '第一座清真寺（100 木材、25 秒）完成時多 1 名學者（佔 1 人口）。Fandom 說第一座碼頭也可以，沒有建模。' },
      { text: '清真寺黑暗時代就能蓋，價格減半（100 木材）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Mosque_(Age_of_Empires_IV)', note: '目錄的清真寺已是 100 木材、25 秒、黑暗時代。' },
      { text: '學者（135 黃金）與虔誠科技黑暗時代就能在清真寺使用', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Scholar', note: '學者已改成黑暗時代可訓練（minAgeOverride）；虔誠沒有經濟效果，沒有改。' },
      { text: '信仰圓頂訓練學者便宜 55 黃金（80 黃金）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Dome_of_the_Faith', note: '在信仰圓頂訓練學者 80 黃金（清真寺 135）。' },
      { text: '高效生產：學者駐守兵營、靶場、馬廄、攻城工坊時生產速度 +100%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Efficient_Production', note: '搜尋決定研不研（清真寺或信仰圓頂，免費、135 秒）；近似成研究後只要有 1 名學者，所有軍事建築生產時間 ÷2（實際每棟要各駐 1 名，駐在那裡的學者不算研究加速）。' },
      { text: '科技可以取消再繼續，進度不會消失', modeled: 'na', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/delhi.json' },
      { text: '勝利之塔可研究所有鐵匠鋪科技', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-16-2-10475/', note: '目錄的鐵匠鋪科技已列勝利之塔為研究建築；+20% 步兵攻速未建模。' },
      { text: '防衛者大院：建築與砲台石頭花費 -25%', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.2.10604.tsx', note: '蓋好後所有建築的石頭 -25%（城堡 900 → 675）；包不包含城鎮中心未經測試，引擎一律打折。' },
      { text: '學問之家「豐盛口糧」：村民攜帶 +10', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Hearty_Rations', note: '用目錄科技效果。' },
      { text: '希薩學院：每研究一項科技每分鐘 +12 食物', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Hisar_Academy', note: '帝王地標完成後，每分鐘 +12 食物 × 已研究的科技數（含之前研究的）。' },
      { text: '蘇丹宮殿：自動生產蘇丹精英象塔（0～4 名學者 200/155/126/107/93 秒）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Palace_of_the_Sultan', note: '每 200 秒免費 1 隻（0 名學者的速度），學者駐紮加速沒有建模。' },
      { text: '聖域：學者從封建時代可占領聖地，聖地黃金 +25%（每分鐘 125）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Sanctity_(Age_of_Empires_IV)', note: '搜尋決定研不研聖域（清真寺，210 秒，德里科技免費）；研究後學者從封建時代起就能佔聖地，每座每分鐘 125 黃金（Fandom Sanctity 頁）。聖地數量、距離看頁面「聖物與聖地」設定（假設），對手爭奪沒有建模。' },
      { text: '村落要塞：城堡可以像城鎮中心一樣訓練村民', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Village_Fortresses', note: '搜尋決定研不研（城堡時代，主堡或防衛者大院研究 360 秒；要先有主堡，引擎會先蓋）；研究後主堡像城鎮中心一樣訓練村民，也受「城鎮中心不中斷」規則約束。主堡提供的人口沒有建模。' },
    ],
  }),
  en: spec('en', '英格蘭', {
    start: { ...STD, wood: 200 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候（人口 7/10），羊沿用預設 5 隻（官方第一季更新：木材 150→200，至 17.0 未改回）。',
    farmByAge: [1.2, 1.25, 1.3, 1.3],
    // 磨坊範圍是磨坊旁 2 格內的農田，一座約放 9～12 塊（Fandom Mill 頁）；取 10
    farmMill: { building: 'mill', perMill: 10 },
    // 國王算支援／英雄單位，交易者、修道士是經濟／宗教單位，都不拿來自動湊軍隊
    notMilitary: ['trader', 'monk', 'king'],
    triggers: [
      // 議會廳：兼射箭場，工作快 100%，在這裡出的長弓兵便宜 5%
      { on: 'council-hall', prod: [{ at: ['council-hall'], time: 0.5, research: 0.5 }, { at: ['council-hall'], units: ['longbowman'], cost: 0.95 }] },
      // 國王修道院送 1 名國王；白塔兼主堡、工作快 75%
      { on: 'abbey-of-kings', units: { king: 1 } },
      { on: 'the-white-tower', prod: [{ at: ['the-white-tower'], time: 1 / 1.75, research: 1 / 1.75 }] },

      { on: 'campfire', gather: { hunt: 1.1 } },

      // 圈地：每名在農田工作的村民每 6 秒 +1 黃金
      { on: 'enclosures', farmerIncome: { gold: 1 / 6 } },
    ],
    civTechs: [
      { id: 'campfire', instant: true },
{ id: 'enclosures' }],
    // 營火：目錄沒有，補成封建時代、25 木材、立即放置的選項；近似成所有打獵 +10%（實際要放在獵物旁，最多 5 個）
    extraItems: [{ id: 'campfire', name: '營火', age: 2, cost: { wood: 25 }, time: 0, producedBy: [] }],
    // 溫格德宮殿營隊（Fandom Wynguard Palace 頁）：一次給好幾種單位
    bundles: {
      'wynguard-army': { spearman: 2, crossbowman: 2, 'counterweight-trebuchet': 1 },
      'wynguard-raiders': { horseman: 3, knight: 3 },
      'wynguard-rangers': { 'wynguard-ranger': 6 },
      'wynguard-footmen': { 'wynguard-footman': 6 },
    },
    bonuses: [
      { text: '開局木材 200（比標準多 50）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-season-one-update-release-notes/', note: '官方第一季更新 150→200；Fandom 與 Jockxtar 第 13 季農田開局的木材帳也對得上。' },
      { text: '農田便宜 50%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/english.json', note: '目錄農田 37 木材，磨坊維持 50 木材。' },
      { text: '磨坊附近的農田依時代 +20/25/30/30%，黑暗時代就有效', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/english/ability-mill-influence-1.json', note: '範圍是磨坊旁 2 格內的農田，一座約放 9～12 塊（Fandom Mill 頁），取 10：引擎在開始種田時於農田區蓋磨坊，田超過「10 × 農田區磨坊數」就再蓋一座，加成只套罩到的比例。Fandom 寫 +15/20/25/30%，和 aoe4world 的 +20/25/30/30% 不同，用 aoe4world。' },
      { text: '營火（斥候、兵士放置，25 木材，最多 5 個）讓附近打獵 +10%，封建時代起才能用', modeled: 'approx', source: 'https://www.aoe4.club/en/patchs/age-of-empires-iv-season-twelve-update-15-1-6970', note: '目錄沒有，補成封建時代、25 木材、立即放置；近似成所有打獵 +10%（實際每個營火只罩附近，最多 5 個）。' },
      { text: '兵士黑暗時代就能訓練，生產快 40%（16.1.9737 從 50% 下修）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: '目錄已是 14.65 秒（20.5/1.4）、1 時代。' },
      { text: '議會廳兼射箭場、工作快 100%，在這裡出的長弓兵便宜 5%（38 食物、47.5 木材）', modeled: 'yes', source: 'https://www.aoe4.club/en/civs/english/buildings/council-hall', note: '議會廳生產與研究時間 ÷2、長弓兵在這裡 -5%（目錄已把議會廳列為長弓兵生產建築）。' },
      { text: '國王修道院蓋好送 1 名國王；之後國王 100 食物／100 黃金、50 秒', modeled: 'approx', source: 'https://www.aoe4.club/en/civs/english/units/king', note: '蓋好送 1 名國王（算進軍隊目標與目標後出兵）；之後再訓練國王用目錄價格。' },
      { text: '國王宮殿兼城鎮中心，村民訓練快 10%（18.2 秒）', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: '蓋好後會當第二座城鎮中心訓練村民、當投放點，但用一般的 20 秒；+10% 沒辦法只套在王宮。王宮是否也加 10 人口查不到資料，目前不算人口。' },
      { text: '白塔兼主堡，工作快 75%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/english.json', note: '白塔生產與研究時間 ÷1.75。只有 aoe4world 原始資料一個來源。' },
      { text: '圈地（帝王時代，磨坊，150 木材／350 黃金）：每個有人耕作的農田每 6 秒 +1 黃金', modeled: 'yes', source: 'https://www.aoe4.club/en/civs/english/technologies/enclosures', note: '帝王時代磨坊科技（目錄 150 木材、350 黃金、60 秒）；每名農田村民每秒 +1/6 黃金。' },
      { text: '溫格德宮殿一次出整隊（步兵 6、遊俠 6、突襲隊 3 騎兵＋3 騎士、軍隊 2 長槍＋2 弩手＋1 投石機）', modeled: 'approx', source: 'https://www.aoe4.club/en/civs/english/buildings/wynguard-palace', note: '目錄每隊已是整隊花費和 6 人口，當成一個單位；軍隊那隊實際人口未確認。' },
    ],
  }),
  fr: spec('fr', '法蘭西', {
    // 開局資源、6 村民、1 斥候（extraPop 1）、5 隻羊都是預設值，不另寫
    startNote: '開局 200 食物、150 木材、100 黃金、0 石頭，6 村民、1 斥候，城鎮中心旁 5 隻自有羊，人口 7/10（patch 12260 的 15 場 aoe4world 對局摘要與 Fandom 一致）。',
    // 城鎮中心工作效率 +15/15/20/25%：基礎 20 秒（不是目錄的 19 秒）÷ 倍率；實測黑暗時代間隔平均 17.47 秒
    trainTimeByAge: [20 / 1.15, 20 / 1.15, 20 / 1.2, 20 / 1.25],
    popBuildings: { dock: 10 },
    // 公會廳是封建→城堡地標，不放 trickles：搜尋會把它當一般建築在封建時代另外蓋（不升代、還能和皇家學院並存）
    costOverride: {
      // 經濟科技 35% 折扣：目錄是舊的 30% 價（手推車、專業斥候甚至沒打折），改成標準價 × 0.65，保留小數
      'wheelbarrow': { wood: 32.5, gold: 97.5 },
      'survival-techniques': { wood: 16.25, gold: 48.75 },
      'forestry': { food: 16.25, gold: 32.5 },
      'professional-scouts': { wood: 97.5, gold: 195 },
      'horticulture': { wood: 32.5, gold: 65 },
      'double-broadax': { food: 32.5, gold: 65 },
      'specialized-pick': { wood: 32.5, gold: 65 },
      'extended-lines': { wood: 48.75, gold: 113.75 },
      'fertilization': { wood: 65, gold: 162.5 },
      'shaft-mining': { wood: 65, gold: 162.5 },
      'lumber-preservation': { food: 65, gold: 162.5 },
      'drift-nets': { wood: 97.5, gold: 227.5 },
      'crosscut-saw': { food: 162.5, gold: 325 },
      'cupellation': { wood: 162.5, gold: 325 },
      'precision-cross-breeding': { wood: 162.5, gold: 325 },
      // 城鎮中心的其他項目也吃工作效率：斥候 21 秒、紡織 20 秒 ÷ 1.15（封建以後的城鎮中心與馬廄會再快一點）
      'scout': { time: 21 / 1.15 },
      'textiles': { time: 20 / 1.15 },
      // 騎兵學校讓所有馬廄（含自己）生產快 20%：假設走騎兵學校升代（實測 15 場中 14 場）
      'royal-knight': { time: 35 / 1.2 },
      'horseman': { time: 22.5 / 1.2 },
      // 砲兵學院訓練快 50%；皇家砲只在砲兵學院訓練，所以直接改時間（金 -25% 目錄已含）
      'royal-cannon': { time: 45 / 1.5 },
      'royal-ribauldequin': { time: 45 / 1.5 },
    },
    notMilitary: ['trader', 'monk'],
    trade: CHAMBER_TRADE,
    triggers: [
      // 主堡／紅宮殿範圍內的靶場、馬廄訓練便宜 20%；近似成蓋好之後所有靶場、馬廄都在範圍內
      { on: 'keep', prod: [{ at: ['archery-range', 'stable'], cost: 0.8 }] },
      { on: 'red-palace', prod: [{ at: ['archery-range', 'stable'], cost: 0.8 }] },

      // 公會廳：每 20 秒存一筆，第一筆 20、每分鐘 +20、每筆上限 200；搜尋決定多久收一次，收的時候給當下最缺的資源（石頭減半）
      { on: 'guild-hall', stockpile: { tick: 20, start: 20, grow: 20, cap: 200 } },
    ],
    bonuses: [
      { text: '開局 200 食物、150 木材、100 黃金，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://aoe4world.com/players/199623/games/259189715/summary?camelize=true', note: '15 場 patch 12260 對局摘要 t=0 全部一致；沒有特殊資源，人口 7/10。' },
      { text: '城鎮中心工作效率逐代提升（+15/15/20/25%）', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-11-0-782/', note: '村民用 20 秒 ÷ 倍率：17.39、17.39、16.67、16.0 秒（實測吻合）。斥候、紡織固定用 ÷1.15（18.26、17.39 秒），城堡、帝王時代會算慢一點；開局約 1–1.6 秒的延遲沒算（第一名村民實際在 19 秒出）。' },
      { text: '投放建築便宜 50%（磨坊、伐木場、採礦場 25 木）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/french.json', note: '目錄已是 25 木；碼頭與城鎮中心不打折。' },
      { text: '經濟科技便宜 35%', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-11-1-1201/', note: '目錄是舊的 30% 價，這裡逐項改成標準價 × 0.65（保留小數）。手推車 32.5 木／97.5 金、生存技巧 16.25／48.75 已由對局資源變化證實；其他項目沒實測，專業斥候是否打折未查證。商人公會沒有非法蘭西的標準價可比，維持目錄價。' },
      { text: '碼頭 +10 人口', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Update_12.0.1974' },
      { text: '騎兵學校（黑暗→封建地標）：所有馬廄與學校本身生產快 20%', modeled: 'approx', source: 'https://aoe4world.com/players/2094304/games/259189556/summary?camelize=true', note: '皇家騎士 29.17 秒（實測每 29–30 秒一隻）、騎手 18.75 秒。直接改單位時間，等於假設一定蓋騎兵學校；走商會升代時會算太快。馬廄的科技研究沒加速。' },
      { text: '商會（黑暗→封建地標）：每完成一項經濟科技立刻送 1 名商人（陸地最多 14）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Chamber_of_Commerce', note: '頁面「貿易」開啟時才模擬：擁有商會後，16 項經濟科技每完成一項送 1 名商人（研究在前的蓋好時補送），最多 14 名，送的商人佔 1 人口、直接開始貿易。專業斥候、兩項捕魚科技、商人公會搜尋不研究，所以實際最多 12 名。商人可運食物／木材／黃金，近似成每趟給當下最缺的那種。沒開貿易時當作沒有（不佔人口）。' },
      { text: '公會廳（封建→城堡地標）：囤積所選資源，越久不收越快（每秒 1 → 10，石頭減半）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Guild_Hall', note: '搜尋決定多久收一次（40～900 秒），收的時候換成當下最缺的資源（石頭減半）。公式（每 20 秒一筆，從 20 起每分鐘 +20、上限 200）只有 Fandom 推得，信心中等。' },
      { text: '鐵匠恩典：每次升代免費、立即獲得近戰攻擊科技', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/french.json', note: '目錄的冶鐵爐、脫碳、大馬士革鋼已是 0 費用 0 秒；實際上在升代（已有鐵匠鋪）或第一座鐵匠鋪完成時自動給予。' },
      { text: '主堡便宜 10%，主堡／紅宮殿範圍內的靶場、馬廄訓練便宜 20%（徵兵獎勵再 -5%）；皇家學院研究便宜 30%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Influence_(Age_of_Empires_IV)', note: '主堡 810 石已在目錄；主堡或紅宮殿蓋好後靶場、馬廄訓練 -20%（假設都在範圍內，兩座不疊加的規則沒有建模）。皇家學院研究 -30% 沒有建模。' },
      { text: '砲兵學院（城堡→帝王地標）：訓練與研究快 50%，皇家砲金 -25%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/french.json', note: '皇家大砲、皇家多管砲改成 30 秒（45 ÷ 1.5），金 -25% 目錄已含；學院內的科技研究沒加速。50% 只有 aoe4world 說明文字一個來源。' },
    ],
  }),
  gol: spec('gol', '金帳汗國', {
    start: { food: 200, wood: 200, gold: 150, stone: 50 },
    startNote: '開局 200 食物、200 木材、150 黃金、50 石頭，5 村民、1 斥候、城鎮中心旁 5 隻羊，人口 6/200、不需房屋，沒有預建的蒙古包或敖包（aoe4world 17.0 對局遙測 58/58 場、Fandom、16.1.9737 改版說明）。',
    startWorkers: { villager: 5 },
    extraPop: 1,
    ownedSheep: 5,
    // 目錄 villager-1 的 50 食物是「每名」，37 秒是「每批 2 名」：一次點擊付 100 食物、37 秒出 2 名（每名 18.5 秒）。
    villagerBatch: 2,
    popModel: 'max',
    // 村民不能採石（石頭只來自敖包）。畜欄每名村民約 0.7 食物/秒，先換算成相對農田 0.75 的倍率，等引擎把畜欄當農田時使用（目前目錄沒有 farm，用不到）。
    gather: { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 0.7 / 0.75, wood: 1, gold: 1, stone: 0 },
    // 畜欄取代農田：每座 4 名村民
    farm: { id: 'stockyard', slots: 4 },
    dropoff: { food: ['ger'], wood: ['ger'], gold: ['ger'], stone: [] },
    // 每座敖包每分鐘 60 石頭。上限依時代 1/2/3/4 座，引擎只有單一上限：取黑暗時代的 1 座，避免開局蓋出 2 座（封建後少算）。
    trickles: [
      // 要塞前哨（150 木 50 石、60 秒，Fandom Fortified Outpost 頁）：詔令與驛站貿易都靠它，搜尋決定蓋幾座
      { building: 'fortified-outpost', perMin: {}, max: 6, note: '要塞前哨：搜尋決定蓋幾座（詔令要至少 1 座，驛站貿易每座每分鐘 60 黃金、最多 6 座）。' },

      { building: 'ovoo', perMin: { stone: 60 }, max: 4, maxByAge: [1, 2, 3, 4], note: '上限依時代 1/2/3/4 座（Fandom Ovoo 頁）。原本：要蓋在石礦露頭上；上限黑暗 1、封建 2、城堡 3、帝王 4 座，引擎沒有依時代的上限，取黑暗時代的 1 座。聖物敖包、敖包供奉、敖包大典各 ×1.2 沒有計入。' },
    ],
    // 目錄成本是每名、時間是整批；斥候、拔都汗、薩滿、攻城器、船隻都是 1 名一批（預設）。村民由 villagerBatch 處理。
    batches: {
      trader: { size: 2 },
      spearman: { size: 2 },
      horseman: { size: 2 },
      archer: { size: 2 },
      crossbowman: { size: 2 },
      handcannoneer: { size: 2 },
      'man-at-arms': { size: 2 },
      kharash: { size: 2 },
      keshik: { size: 2 },
      'kipchak-archer': { size: 2 },
      torguud: { size: 2 },
      // 「召喚羅斯貢品」技能一次 4 名；簡化成 350 石頭、30 秒冷卻。
      'rus-tribute': { size: 4, time: 30 },
    },
    // 羅斯貢品在目錄是 0 成本：改成每名 87.5 石頭（4 名 = 350，技能的起始價）。
    costOverride: {
      // 封建升代 110 秒（Fandom Golden Tent、Khan and Torguuds、Building Carts 頁，17.0）；目錄是 105
      'khan-and-torguuds': { time: 110 },
      'building-carts': { time: 110 },
      'rus-tribute': { stone: 87.5 },
    },
    notMilitary: ['trader', 'shaman'],
    // 詔令（Fandom Fortified Outpost 頁）：一次一種；生產速度 +15%、畜欄每名村民每分鐘 10 黃金（要解鎖 800 石）、每次訓練多 1 名哈剌沙（要解鎖 600 石）
    edicts: {
      requires: 'fortified-outpost',
      options: {
        production: { label: '生產速度詔令', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop', 'golden-tent'], time: 1 / 1.15 }] },
        stockyard: { label: '畜欄詔令', requires: 'unlock-stockyard-edict', farmerIncome: { gold: 1 / 6 } },
        kharash: { label: '哈剌沙詔令', requires: 'unlock-kharash-edict', bonusUnit: 'kharash' },
      },
    },
    civTechs: [
      { id: 'unlock-stockyard-edict' },
      { id: 'unlock-kharash-edict' },
    ],
    triggers: [
      // 建築車（Fandom Building Carts 頁）：封建 2 輛、之後城堡、帝王各 1 輛，每輛變成免費軍事建築（15 秒）
      { on: 'building-carts', freeBuildings: 2, freeBuildingsByAge: { 3: 1, 4: 1 } },
      // 莫斯科貢賦：金帳每 10 秒 33 木材（每分 200，Fandom Golden Tent 頁；重裝單位每名 -2/分沒有建模）
      { on: 'muscovy-yasak', every: 10, each: { wood: 33.3 } },
      // 驛站貿易：每座要塞前哨每分鐘 60 黃金，最多 6 座（Fandom Yam Network Trade 頁）
      { on: 'yam-network-trade', buildingIncome: { building: 'fortified-outpost', perMin: { gold: 60 }, max: 6 } },
    ],
    bonuses: [
      { text: '開局 200 食物 / 200 木材 / 150 黃金 / 50 石頭，5 村民 + 1 斥候 + 5 隻羊', modeled: 'yes', source: 'https://aoe4world.com/players/18163938/games/259193346/summary?camelize=true', note: '17.0（12182/12260）58 場對局遙測在 0 秒全部一致；16.1.9737 把木材從 225 降到 200。' },
      { text: '開局人口上限全滿，不需要房屋（蒙古包不加人口）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/goldenhorde.json' },
      { text: '村民一次訓練 2 名：100 食物、37 秒（每名 18.5 秒）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/goldenhorde.json', note: '遙測：每對村民剛好相隔 37 秒完成，0 秒排兩批花掉 200 食物。' },
      { text: '軍隊成批訓練：多數 2 名一批（斥候、拔都汗、薩滿、攻城器、船隻 1 名）；羅斯貢品一次 4 名', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Update_16.1.9737', note: '兵營／馬廄／靶場增援（各 1100 石頭）每批 +1 沒有計入。羅斯貢品實際價格每 30 秒降 10、每座軍事建築再減 5（最多 70）、每次手動召喚 +300，這裡固定 350 石頭 / 30 秒，連續召喚會算得太便宜。目錄把怯薛放在金帳、哈剌沙放在封建時代的靶場（實際是馬廄、黑暗時代兵營），待目錄修正。' },
      { text: '村民不能採石；敖包（150 木材、15 秒）每座每分鐘 60 石頭，礦採完仍持續；上限依時代 1/2/3/4 座', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/goldenhorde.json', note: '固定上限 1 座、不分時代（封建後實際可蓋 2–4 座，石頭會少算）。聖物敖包、敖包供奉、敖包大典各 ×1.2 相乘（72 → 86.4 → 103.68/分）已由遙測確認，但沒有計入；Fandom 的 +30% 是舊數字。' },
      { text: '畜欄取代農田：275 木材，最多 4 名村民，每名約 0.7 食物/秒，自帶投放點、無限食物', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Stockyard', note: '天然食物採完後蓋畜欄，每座 4 名村民，速率用 0.7 食物/秒（gather.farm = 0.7/0.75）。0.7 只出自 Fandom（可信度低），論壇實測 4 人約 150–160 食物/分（0.63–0.67/秒）；建造時間 30 秒（aoe4world）或 20 秒（Fandom）未定。輪牧、過度放牧各 +10%，過度放牧曾被回報無效。' },
      { text: '蒙古包（50 木材）是食物、木材、黃金的投放點，也研究經濟科技；不收石頭', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/goldenhorde.json', note: '15.2.7380 從 75 木材降到 50。' },
      { text: '在金帳升代（金帳 50 黃金、30 秒，只能 1 座），研究不佔城鎮中心；每代兩種選項同價，封建 400 食物 / 200 黃金、110 秒（Fandom 17.0；目錄 105 秒，已改）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/goldenhorde.json', note: '城堡 1200/600、帝王 2400/1200，各 110 秒。封建時間 aoe4world 寫 105 秒、Fandom 寫 110 秒；遙測 52 場中 50 場符合 105、43 場符合 110，採用 105。' },
      { text: '升代選項：可汗與護衛（拔都汗、護衛石頭 -15%）或建築車（2 座免費軍事建築）；莫斯科貢賦（金帳每分鐘 200 木材，每名重裝單位 -3）或聖物敖包（敖包 ×1.2）；石頭大軍（金帳用石頭訓練）或驛站貿易（每座要塞前哨每分鐘 60 黃金，最多 6 座）', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '建築車（封建 2 輛、城堡與帝王各 1 輛免費軍事建築）、莫斯科貢賦（每分鐘 200 木材）、驛站貿易（每座前哨每分鐘 60 黃金，最多 6 座）已計入（Fandom）；可汗與護衛、聖物敖包、石頭大軍只影響軍隊或要聖物，沒有建模。' },
      { text: '詔令與被動收入：生產速度詔令 +15%（要塞前哨範圍內軍事建築）、畜欄詔令（800 石頭解鎖）每名畜欄村民每分鐘 10 黃金、哈剌沙詔令（600 石頭）每批多 1 名哈剌沙、敖包什一稅（帝王 500 石頭）每座敖包每分鐘 +60 食物 +60 木材 +10 黃金', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Golden_Tent', note: '搜尋決定蓋幾座要塞前哨（150 木 50 石）與用哪種詔令（一次一種）：生產速度詔令軍事建築 +15%（假設都在前哨範圍內）、畜欄詔令每名畜欄村民每分鐘 10 黃金（先研究 800 石頭的解鎖）、哈剌沙詔令每訓練一次多 1 名哈剌沙（先研究 600 石頭的解鎖），數字來自 Fandom。敖包上限依時代 1～4 座。敖包什一稅、哈剌沙以外的詔令細節沒有建模。' },
    ],
  }),
  hr: spec('hr', '神聖羅馬帝國', {
    start: { ...STD, gold: 0 },
    startNote: '開局 200 食物、150 木材、0 黃金、0 石頭，6 村民、1 斥候、1 名免費神職人員與 5 隻羊，人口 8/10（官方 Server-Side Patch 14681；到 17.0.12260 都沒改）。',
    // startWorkers 用預設 { villager: 6 }；斥候 + 神職人員各佔 1 人口
    extraPop: 2,
    carry: 14, // Pushcarts +40%：10 × 1.4。手推車 +5 由目錄效果疊在上面（= 19，順序未驗證）；獵物肉由引擎取 max(25, 攜帶量) = 25，沒有 ×1.4
    // 1 名神職人員約每 4 秒施放一次、效果 38 秒 → 約可維持 9–10 名，扣掉走路取 9
    inspire: { villagers: 9, mul: 1.4 },
    // 士瓦本宮當作城鎮中心 +10 人口（引擎的 tcs() 只認 town-center / capital-town-center）；Bursae 每座大學 +30
    popBuildings: { 'palace-of-swabia': 10, university: 30 },
    // Bursae：大學科技 -10%。目錄的大學科技和英格蘭同價，沒有含折扣（concave-lens 是神羅獨有，基準價不明，沒改）
    costOverride: {
      biology: { food: 450, gold: 900 },
      chemistry: { food: 180, gold: 585 },
      'court-architects': { gold: 630 },
      'elite-army-tactics': { food: 450, gold: 900 },
      'incendiary-arrows': { wood: 450, gold: 900 },
      'serpentine-powder': { food: 270, gold: 450 },
      'siege-works': { wood: 270, gold: 540 },
      'silk-bowstrings': { wood: 180, gold: 450 },
    },
    notMilitary: ['prelate', 'trader'],
    // 亞琛禮拜堂：駐紮 1 名神職人員後 7 格內村民全部激勵（+40%）；和在外激勵是同一種效果，引擎每秒選罩到人多的一種
    zones: [
      // 西篤會修道院（Fandom Cistercian Churches 頁）：研究後修道院駐紮神職人員時 5 格內村民激勵
      { building: 'monastery', res: 'all', mul: 1.4, radius: 5, half: 2, garrison: true, requires: 'cistercian-abbeys', max: 2 },
{ building: 'aachen-chapel', res: 'all', mul: 1.4, radius: 7, half: 3, garrison: true }],
    triggers: [
      // 堡伯宮：步兵訓練與兵營科技快 400%（時間 ÷5）；麥恩韋克宮：鐵匠科技快 50%（便宜 50% 沒有建模）
      { on: 'burgrave-palace', prod: [{ at: ['burgrave-palace'], cls: 'infantry', time: 0.2 }, { at: ['burgrave-palace'], research: 0.2 }] },
      { on: 'meinwerk-palace', prod: [{ at: ['meinwerk-palace'], research: 0.5 }] },
    ],
    civTechs: [
      { id: 'cistercian-abbeys', requires: 'monastery' },
    ],
    // 雷格尼茨大教堂（Fandom Regnitz Cathedral 頁）：裡面的聖物收入 ×2；近似：擁有大教堂時所有聖物 ×2
    relicMul: [{ building: 'regnitz-cathedral', mul: 2 }],
    bonuses: [
      { text: '開局 0 黃金，但多 1 名免費神職人員（人口 8/10）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-server-side-patch-14681/', note: '黑暗時代地標的 200 黃金全靠挖礦，所以第一分鐘就要派村民上金礦。' },
      { text: '村民攜帶量 +40%（10 → 14）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/hre.json', note: '14 是由 +40% 推算。手推車 +5 疊在 14 上（= 19；若先加再乘是 21），獵物肉維持全域 25（若也 +40% 應是 35），兩者都沒有來源、需要實測。' },
      { text: '神職人員激勵：村民採集 +40%，持續 38 秒', modeled: 'approx', source: SRC.off, note: '17.0 從 35% 回到 40%；38 秒來自 15.3.8338。神職人員跟著人最多的採集點走，只激勵那一處的村民，最多 9 名（施放間隔約 4 秒 × 38 秒，間隔只有 Fandom 一個來源，中等可信度）；不隨神職人員數量增加。' },
      { text: '亞琛禮拜堂：駐紮 1 名神職人員後，7 格內村民全部激勵，並可投放所有資源', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-15-3-8338/', note: '光環 7 格、激勵 +40%；搜尋決定蓋在哪，引擎每秒比較「駐紮在禮拜堂罩到的人數」和「在外激勵最多 9 人」，取多的一種（兩者不疊加）。投放所有資源沒有建模；半徑只有官方 15.3.8338 說明。' },
      { text: '西篤會修道院：修道院與雷格尼茨可投放所有資源，駐紮神職人員時 5 格內激勵', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/hre.json', note: '搜尋決定研不研（城堡時代，75 木材 200 黃金、45 秒；要先有修道院）與另外蓋幾座修道院、蓋在哪；研究後駐紮神職人員的修道院 5 格內村民激勵 +40%（Fandom Cistercian Churches 頁）。只有一名神職人員：引擎每秒在亞琛禮拜堂、各修道院、在外激勵之間挑罩到最多人的。投放所有資源沒有建模。' },
      { text: '虔誠：被激勵的村民採集 +5%、建造 +25%', modeled: 'na', source: 'https://ageofempires.fandom.com/wiki/Devoutness', note: 'Fandom Devoutness 頁註明 17.0 起採集加成失效；建造 +25% 只對被激勵的村民，引擎的激勵只算採集中的村民，所以不影響規劃。' },
      { text: '士瓦本宮：當作城鎮中心，村民便宜 66%（17 食物）、訓練快 200%（6.67 秒），+10 人口', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Palace_of_Swabia', note: '只計入 +10 人口；目錄在這裡訓練村民仍是 50 食物 20 秒，也不算進城鎮中心數與投放點。' },
      { text: '大學每座 +30 人口、大學科技便宜 10%（16.2.10604 Bursae）', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.2.10604.tsx', note: '人口已計入；8 項大學科技用 costOverride 打九折，神羅獨有的凹透鏡基準價不明、沒有打折。' },
      { text: '堡伯宮步兵訓練與兵營科技快 400%（時間 ÷5）；麥恩韋克宮鐵匠科技便宜 50%、快 50%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/hre.json', note: '堡伯宮的步兵生產與研究時間 ÷5（目錄已把堡伯宮列為長槍兵、重步兵、傭兵的生產建築）；麥恩韋克宮研究時間 ÷2，但便宜 50% 沒有建模。' },
      { text: '聖物可放在前哨、石牆塔、城堡、艾爾茨巴赫宮、碼頭，每個 80 黃金/分；雷格尼茨大教堂讓聖物收入 ×2', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/hre.json', note: '聖物系統已建模（頁面「聖物與聖地」設定地圖上能拿幾個、距離；搜尋決定拿幾個）：城堡時代起修道院、僧侶由引擎補，每個聖物每分鐘 80 黃金（Fandom Relic 頁）；擁有雷格尼茨大教堂時 ×2（近似成所有聖物都放在大教堂，實際最多 3 個）。放在前哨、石牆塔等其他建築只影響防守，不影響收入，不建模。' },
    ],
  }),
  hl: spec('hl', '蘭開斯特', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻自有羊，首都城鎮中心旁另外生成 4 隻羊（共 9 隻），人口 7/10（自有部分：2026-11 AoE4 World 12260 對局摘要 4/4 場一致；城鎮中心的 4 隻是中立羊，摘要不列）。',
    tcSheep: 4,
    gather: { all: 1, sheep: 1.2, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    popBuildings: { manor: 10 },
    // 莊園光環（Fandom Manor 頁：7.5 格、3×3）：範圍內每名村民每分鐘 +3 食物 +2 木材，多座不疊加；莊園收四種資源，搜尋決定蓋在農田區或礦、林線旁
    zones: [{ building: 'manor', res: 'all', mul: 1, radius: 7.5, half: 1.5, perWorker: { food: 3, wood: 2 }, dropoff: 'all' }],
    dropoff: {
      food: ['mill', 'manor'],
      wood: ['lumber-camp', 'manor'],
      gold: ['mining-camp', 'manor'],
      stone: ['mining-camp', 'manor'],
    },
    trickles: [
      { building: 'manor', perMin: { food: 30, wood: 10 }, max: 3, note: '基礎上限 3 座（只見於 Fandom）；精簡土地制度、開放農田制度各 +4（最多 11）未建模。範圍內村民的額外產出、免役稅的黃金另計（未建模）。' },
    ],
    costOverride: {
      // earls-guard-1 是遊戲免費贈送用的假單位（0 花費、0 秒、0 人口，城堡時代前就能從蘭開斯特城堡出）；改成兵營的 90 食物、20 黃金、20.5 秒，至少不會免費瞬間產出
      'earls-guard': { food: 90, gold: 20, time: 20.5 },
    },
    notMilitary: ['trader', 'monk', 'lord-of-lancaster'],
    triggers: [
      { on: 'muster-the-nobles', units: { demilancer: 5 } },
      { on: 'shire-levy', units: { yeoman: 12 } },
      { on: 'exact-militia-program', units: { demilancer: 10, 'earls-guard': 10, yeoman: 10 } },
      { on: 'manor', costMinus: { ids: ['muster-the-nobles', 'shire-levy', 'exact-militia-program'], amount: { food: 25, wood: 25, gold: 25 } } },

      // 國王修道院送 1 名蘭開斯特領主；主堡、白塔、伯克郡宮殿各送 3 名伯爵衛兵
      { on: 'abbey-of-kings', units: { 'lord-of-lancaster': 1 } },
      { on: 'keep', units: { 'earls-guard': 3 } },
      { on: 'the-white-tower', units: { 'earls-guard': 3 } },
      { on: 'berkshire-palace', units: { 'earls-guard': 3 } },

      // 免役稅：每座莊園每分鐘再 +30 黃金
      { on: 'scutage', buildingIncome: { building: 'manor', perMin: { gold: 30 } } },
{ on: 'kings-college', costMul: [{ kind: 'technology', mul: 0.8 }] }],
    civTechs: [
      { id: 'muster-the-nobles' },
      { id: 'shire-levy' },
      { id: 'exact-militia-program' },

      { id: 'scutage' },
    ],
    // 蘭開斯特城堡徵召（Fandom Lancaster Castle 頁）：各時代一次，每座莊園讓花費 -25 食物／木材／黃金
    extraItems: [
      { id: 'muster-the-nobles', name: '召集貴族', age: 2, cost: { food: 250, gold: 250 }, time: 30, producedBy: ['lancaster-castle'] },
      { id: 'shire-levy', name: '郡徵兵', age: 3, cost: { wood: 600, gold: 600 }, time: 45, producedBy: ['lancaster-castle'] },
      { id: 'exact-militia-program', name: '民兵徵召計畫', age: 4, cost: { food: 1250, gold: 1250 }, time: 45, producedBy: ['lancaster-castle'] },
    ],
    // 溫格德宮殿營隊（Fandom Wynguard Palace 頁）：一次給好幾種單位
    bundles: {
      'wynguard-army': { spearman: 2, crossbowman: 2, 'counterweight-trebuchet': 1 },
      'garrison-command': { spearman: 8, 'earls-guard': 1 },
      'earls-retinue': { demilancer: 6, hobelar: 2 },
      'gunpowder-contingent': { ribauldequin: 2, culverin: 1 },
    },
    bonuses: [
      { text: '開局 200 食物、200 木材、100 黃金，6 村民、1 斥候、5 隻自有羊 + 首都城鎮中心旁 4 隻（共 9 隻）', modeled: 'yes', source: 'https://aoe4world.com/games', note: '2026-11 AoE4 World 12260 對局摘要 4/4 場一致：0 秒時 200/200/100/0、6 村民、1 斥候、5 隻自有羊；城鎮中心旁的 4 隻是中立羊，摘要不列在玩家名下。木材 200 也由這批對局確認。' },
      { text: '羊毛產業：採羊 +20%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/lancaster.json', note: '13.0.4343 由 +25% 改為 +20%。引擎和磨坊食物科技 +10% 相乘（1.32）；遊戲應是相加（1.3），沒有來源寫明。' },
      { text: '每座城鎮中心（含首都）旁生成 4 隻羊', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/lancaster/town-center-1.json', note: '首都的 4 隻從開局就算；新城鎮中心完成時再加 4 隻（800 食物）。引擎只有一個羊群，新城鎮中心的羊也當成在首都旁採、投放在城鎮中心。' },
      { text: '莊園：175 木、100 石、45 秒，每座每分鐘 30 食物 + 10 木材、+10 人口、全資源投放點', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/lancaster/manor-2.json', note: '被動產出與人口已計入；搜尋決定蓋在農田區或礦、林線旁，蓋在採集點旁時兼作那裡的投放點（不用另蓋營地）。上限固定 3 座（Fandom），精簡土地制度、開放農田制度各 +4 未建模。' },
      { text: '莊園範圍內每名村民每分鐘再 +3 食物、+2 木材（每名村民只算一座）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Manor_(Age_of_Empires_IV)', note: '莊園光環 7.5 格、3×3（Fandom）：範圍內採集點的村民每分鐘 +3 食物 +2 木材，多座不疊加；莊園蓋在農田區時依可容納的田數折算農田。位置由搜尋決定。食物 3 或 4 有衝突（Fandom 寫 15.1.6970 起 +4），用遊戲說明的 3。' },
      { text: '免役稅（帝王，200 木、500 金）：每座莊園每分鐘再 +30 黃金', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/lancaster/scutage-4.json', note: '帝王時代莊園科技（目錄 200 木、500 金、60 秒）；之後每座莊園每分鐘 +30 黃金。' },
      { text: '國王學院：所有科技便宜 20%，並可研究山地訓練（霍伯拉生產速度 +100%）', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.1.9737-season-13.tsx', note: '所有科技 -20% 已計入（蓋好學院後生效）；山地訓練（霍伯拉生產 +100%）未計入。16.1.9737 由 15% 改為 20%；據 Fandom 不含城堡徵召。' },
      { text: '蘭開斯特城堡徵召：封建 5 名輕騎槍兵、城堡 12 名自耕農、帝王 10+10+10，每座莊園減 50 資源，各限一次', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Lancaster_Castle', note: '三種徵召當成要付錢的一次性選項，搜尋決定用不用（Fandom Lancaster Castle 頁）：召集貴族 250 食物 250 黃金、30 秒 → 5 名輕騎槍兵；郡徵兵（城堡）600 木材 600 黃金、45 秒 → 12 名自耕農；民兵徵召計畫（帝王）1250 食物 1250 黃金、45 秒 → 輕騎槍兵、伯爵衛兵、自耕農各 10。每座莊園 -25 食物／木材／黃金（頁面說明寫三種，更新紀錄只寫食物和黃金）。' },
      { text: '國王修道院完成送 1 名蘭開斯特領主；主堡、白塔、伯克郡宮殿完成各送 3 名伯爵衛兵', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/lancaster.json', note: '蓋好時送出，算進軍隊目標與目標後出兵。' },
      { text: '溫格德宮殿營隊一次產出多名單位（伯爵隨從 6 輕騎槍兵 + 2 霍伯拉等）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/lancaster.json', note: '營隊完成時給裡面的各種單位（Fandom Wynguard Palace 頁：溫格德軍 2 長槍兵 2 弩手 1 配重投石機、守備指揮 8 長槍兵 1 伯爵衛兵、伯爵隨從 6 輕騎槍兵 2 霍伯拉、火藥分隊 2 風琴砲 1 長砲），算進軍隊與目標後出兵。花費用目錄；目錄溫格德軍 55 秒、Fandom 寫 75 秒，用目錄。只有把營隊本身設成目標時才會訓練。' },
    ],
  }),
  ja: spec('ja', '日本', {
    startNote: '標準開局 200 食物、150 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，人口 7/10（Fandom 日本頁與資源頁；17.0 未改）。',
    // 農舍＝房屋＋磨坊，鍛造場＝採礦場＋鐵匠鋪。倉庫（Kura）雖然收四種資源，但它是 400 食物＋200 黃金的地標，
    // 引擎只用這張表挑「要蓋哪種投放點」，所以不放進來（放了也不會讓既有的倉庫縮短走路距離）
    dropoff: { food: ['farmhouse'], wood: ['lumber-camp'], gold: ['forge'], stone: ['forge'] },
    // 倉庫（升封建地標）收四種資源：當成沒有加成的光環，讓搜尋決定蓋在農田區或礦、林線旁；蓋在採集點旁時那個點不用另蓋營地
    zones: [{ building: 'kura-storehouse', res: 'all', mul: 1, radius: 0, half: 2, dropoff: 'all' }],
    byproducts: [
      { from: 'gold', to: 'stone', ratio: 0.2, note: '銀礦開採：投放 ≥5 黃金另得 20% 石頭' },
      { from: 'stone', to: 'gold', ratio: 0.2, note: '銀礦開採：投放 ≥5 石頭另得 20% 黃金' },
    ],
    // 目錄的忍者全部 0 費用是上游資料錯誤；實際 50 食物、50 黃金、20 秒（11.1.1201 起未改，目錄時間 20 秒正確）
    costOverride: {
      shinobi: { food: 50, gold: 50 },
    },
    notMilitary: ['trader', 'shinto-priest', 'buddhist-monk'],
    // 烏城寶物商隊（Fandom Castle of the Crow、Treasure Caravan 頁）：完成 30 秒後、之後每 180 秒一隊，
    // 每隊食物／木材／黃金 120 + 13.33 × 格數（最多 630）、石頭 40 + 4.44 × 格數（最多 210）。商隊速度沒有公開，用一般商人的 1 格/秒
    trade: { caravan: { building: 'castle-of-the-crow', delay: 30, every: 180, speed: 1, base: 120, perTile: 13.33, cap: 630, stoneBase: 40, stonePerTile: 4.44, stoneCap: 210 } },
    triggers: [
      // 浮鳥居：神道祭司每 120 秒帶 1 個依代（最多 4）；近似成每個依代每分鐘 70 當下最缺的資源（放在農舍／伐木場）
      { on: 'floating-gate', rampIncome: { every: 120, max: 4, perMin: {}, flexRates: { food: 70, wood: 70, gold: 50 } } },

      // 倉庫：完成送 1 塊田，之後每 50 秒 1 塊（共 12 塊），送滿改為每 50 秒 38 木材
      { on: 'kura-storehouse', grant: { farms: 1 }, every: 50, each: { farms: 1 }, times: 11, after: { wood: 38 } },

      // 大名宅邸 / 御殿 / 幕府城：農田 +20/40/60%（較高階取代較低階）、各送 1 名村民
      { on: 'daimyo-manor', gather: { farm: 1.2 }, villagers: 1 },
      { on: 'daimyo-palace', gather: { farm: 1.4 }, villagers: 1, replaces: ['daimyo-manor'] },
      { on: 'shogunate-castle', gather: { farm: 1.6 }, villagers: 1, replaces: ['daimyo-manor', 'daimyo-palace'] },
    ],
    civTechs: [
      { id: 'zen' },

      { id: 'daimyo-manor', tc: true },
      { id: 'daimyo-palace', requires: 'daimyo-manor', tc: true },
      { id: 'shogunate-castle', requires: 'daimyo-palace', tc: true },
    ],
    // 平等寺：禪（100 食物、200 木材）後每名僧侶每 60 秒 25 黃金；搜尋決定訓練幾名
    support: [{ unit: 'buddhist-monk', at: ['buddhist-temple', 'temple-of-equality'], max: 6, perMin: { gold: 25 }, requires: 'zen' }],
    bonuses: [
      { text: '標準開局：200 食物、150 木材、100 黃金，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Japanese_(Age_of_Empires_IV)', note: '論壇開局總額與職業開局的資源算術都吻合。' },
      { text: '銀礦開採：投放黃金另得 20% 石頭，投放石頭另得 20% 黃金', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/japanese.json', note: '需一次投放 ≥5，村民攜帶量 10 以上一定成立。是否也在城鎮中心、倉庫投放時觸發沒有來源明說，假設會。' },
      { text: '農舍同時是房屋（+10 人口）和食物投放點；鍛造場是黃金、石頭投放點', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Farmhouse', note: '採礦科技在鍛造場或倉庫都能研究（目錄已補上鍛造場）。' },
      { text: '武士町：兵營便宜 50%（75 木材）；漁村：漁船便宜 25%（56 木材）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-12-2-3327/', note: '目錄已折價；漁船只在水圖有用。' },
      { text: '俵（黑暗，25 木材、50 黃金、30 秒）取代手推車：攜帶量 +3、移動 +7%、採野果 +25%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Tawara', note: '目錄沒有效果，已在目錄修正表補上：攜帶 +3、移動 ×1.07、採野果 ×1.25；搜尋會決定何時研究。' },
      { text: '竹細工（封建）、札差（城堡）：每級攜帶量 +3、移動 +7%、採野果 +25%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Tawara', note: '三級各自疊加（攜帶 +3、移動 ×1.07、野果 ×1.25）；目錄原本把移動寫成 ×0.9，已修正。' },
      { text: '大名宅邸／大名御殿／幕府城（175／600／1200 石頭，城鎮中心研究 20 秒）：附近 10 格農田採集 +20%／+40%／+60%，各送 1 名村民', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Daimyo_Manor', note: '城鎮中心研究 20 秒（送的村民補回這段時間），搜尋決定研不研、哪一步研。城鎮中心 10 格內約放得下 85 塊 2×2 農田（8 成面積可用），所以所有農田都算在範圍內；送村民的時機沒有文件，引擎在研究完成時送。旗本武士上限未計入。' },
      { text: '倉庫（封建地標）：完成時送 1 塊農田，之後每 50 秒 1 塊，最多 12 塊；滿了改為每 50 秒 38 木材；收四種資源', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Kura_Storehouse', note: '送田與送滿後的木材已計入（Fandom 的數字）；搜尋決定倉庫蓋在農田區或礦、林線旁，蓋在採集點旁時兼作那裡的投放點（不用另蓋鍛造場、伐木場）。' },
      { text: '甲賀鄉（封建地標）訓練忍者：50 食物、50 黃金、20 秒，完成時免費排入 1 名', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Shinobi_(Age_of_Empires_IV)', note: '已修正費用；第一名免費忍者未建模。' },
      { text: '浮鳥居：神道祭司每 120 秒帶 1 個依代（最多 4）；放入城鎮中心生產 +30%、軍事建築 +125%、農舍每分 70 食物、伐木場每分 70 木材、鍛造場每分 50 黃金', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-12-2-3327/', note: '完成時立刻生成 1 名帶依代的神道祭司（免費），之後每 120 秒 1 名，最多 4 個依代（Fandom Floating Gate 頁）；每個依代放在當下最缺資源的建築：農舍每 20 秒 23.3 食物、伐木場 23.3 木材（各每分 70）、鍛造場 16.7 黃金（每分 50）。祭司走過去放的時間、放進城鎮中心（生產 +30%）或軍事建築（+125%）沒有建模。' },
      { text: '平等寺：禪（100 食物、200 木材）後每名僧侶每 60 秒產 25 黃金', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/japanese.json', note: '搜尋決定研不研禪（100 食物、200 木材、30 秒）與訓練幾名僧侶（0～6，80 黃金、30 秒），研究後每名每分鐘 25 黃金。' },
      { text: '烏城：每 180 秒從貿易站送出寶物商隊，每趟最多 630 食物／木材／黃金與 210 石頭', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Treasure_Caravan', note: '頁面「貿易」開啟時才模擬（不需要訓練商人）：烏城完成 30 秒後第一隊從貿易站出發，之後每 180 秒一隊；每隊食物、木材、黃金各 120 + 13.33 × 格數（最多 630），石頭 40 + 4.44 × 格數（最多 210）。數字只有 Fandom；寶物商隊的速度沒有公開，用一般商人的 1 格/秒。' },
    ],
  }),
  je: spec('je', '聖女貞德', {
    startNote: '開局 200 食物、150 木材、100 黃金，5 名村民 + 貞德（農民型態，會採集、建造）+ 1 斥候，城鎮中心旁 5 隻羊，人口 7/10（Fandom、aoe4guides 多份建造順序）。',
    // 5 名村民 + 1 名貞德（農民），共 6 名工人；斥候用預設 extraPop 1，合計人口 7
    // 貞德（農民）的採集與攜帶量沒有公開數字，當作普通村民（1.0 倍、攜帶 10，未查證），所以不另寫 workerSpecs
    startWorkers: { villager: 5, 'jeanne-darc-peasant': 1 },
    popBuildings: { dock: 10 },
    trickles: [
      {
        building: 'guild-hall',
        perMin: { gold: 204 },
        max: 1,
        note: '公會廳每 20 秒產出一次、越久越多（1/s 起每分鐘加速，上限 10/s；石頭減半），領取或換資源就重來。這裡用 Fandom「前 5 分鐘 1020」的平均值 204/分，資源選黃金。',
      },
    ],
    // 經濟科技 ×0.65；目錄是未折價的原價，照實乘、不取整（遊戲內取整方式未查證）
    costOverride: {
      'wheelbarrow': { wood: 32.5, gold: 97.5 },
      'survival-techniques': { wood: 16.25, gold: 48.75 },
      'forestry': { food: 16.25, gold: 32.5 },
      'double-broadax': { food: 32.5, gold: 65 },
      'horticulture': { wood: 32.5, gold: 65 },
      'specialized-pick': { wood: 32.5, gold: 65 },
      'professional-scouts': { wood: 97.5, gold: 195 },
      'lumber-preservation': { food: 65, gold: 162.5 },
      'fertilization': { wood: 65, gold: 162.5 },
      'shaft-mining': { wood: 65, gold: 162.5 },
      'crosscut-saw': { food: 162.5, gold: 325 },
      'precision-cross-breeding': { wood: 162.5, gold: 325 },
      'cupellation': { wood: 162.5, gold: 325 },
      'extended-lines': { wood: 48.75, gold: 113.75 },
      'drift-nets': { wood: 97.5, gold: 227.5 },
    },
    notMilitary: ['trader', 'monk'],
    trade: CHAMBER_TRADE,
    triggers: [
      // 祝聖（最多 4 次、每 120 秒回充 1 次）：近似成升 2 級後所有軍事生產建築訓練單位食物 -25%
      { on: 'jeanne-level-2', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop', 'school-of-cavalry'], cost: 0.75, costRes: ['food'] }] },

      // 騎兵學校：騎兵學校與所有馬廄生產快 20%
      { on: 'school-of-cavalry', prod: [{ at: ['stable', 'school-of-cavalry'], time: 1 / 1.2 }] },
    ],
    // 貞德經驗（Fandom Jeanne d'Arc 頁）：每秒被動 0.5、採集時再 +1；500 經驗升 2 級後變戰鬥單位（離開經濟），可以祝聖生產建築：訓練單位食物 -25%
    hero: { worker: 'jeanne-darc-peasant', xpPassive: 0.5, xpWork: 1, levelUp: 500, on: 'jeanne-level-2' },
    bonuses: [
      { text: '開局 5 村民 + 貞德（農民）+ 1 斥候，資源為標準 200/150/100', modeled: 'yes', source: 'https://aoe4guides.com/builds/2Nue7BPFdoM2XEIWpwYm', note: '多位作者的建造順序都寫 5 村民上羊、貞德去蓋房；人口 7/10。' },
      { text: '經濟科技便宜 35%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Professional_Scouts', note: '目錄是原價，這裡逐項乘 0.65（手推車 32.5 木/97.5 金、雙刃斧 32.5 食/65 金），含專業斥候與兩項捕魚科技；遊戲內取整方式未查證。交易公會、紡織是否算經濟科技未確認，維持原價。' },
      { text: '貞德（農民）會採集、建造，建造快 33%，不吃手推車', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Jeanne_d%27Arc_(hero)', note: '當作第 6 名普通村民：採集 1.0 倍、攜帶 10（沒有公開數字，未查證）。建造 +33% 沒計入；模擬裡手推車照樣套在她身上（「不吃手推車」只有 Fandom 單一來源）。她不能訓練，陣亡用黃金在城鎮中心復活（100/250/500/1000 金，冷卻 120 秒）。' },
      { text: '貞德 500 經驗升 2 級後變戰鬥單位，不再採集、建造', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Jeanne_d%27Arc_(hero)', note: '經驗照 Fandom：每秒被動 0.5、採集時再 +1（建造 +2 用採集的數字近似），滿 500 升 2 級後離開經濟（不再採集，仍佔 1 人口）。打野豬、附近敵軍死亡、佔聖地的經驗沒有建模。' },
      { text: '貞德 2 級起：祝聖生產建築，訓練單位食物 -25%（軍械連隊後木、金也 -25%）；附近村民建造 +33%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/jeannedarc.json', note: '祝聖已計入：升 2 級後軍事生產建築訓練單位食物 -25%（Fandom：最多 4 次、每 120 秒回充，近似成全部建築都祝聖過）；軍械連隊後木、金也 -25%，與「建造王國」（附近村民建造 +33%）沒有建模。' },
      { text: '騎兵學校（封建地標）：騎兵學校與所有馬廄生產快 20%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/School_of_Cavalry', note: '騎兵學校與馬廄生產時間 ÷1.2（皇家騎士 35 → 29.2 秒）。' },
      { text: '商會（封建地標）：每研究一項經濟科技立即送 1 名商人', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Chamber_of_Commerce', note: '和法蘭西相同（頁面「貿易」開啟時才模擬）：擁有商會後每完成一項清單上的經濟科技送 1 名商人，研究在前的蓋好時補送，最多 14 名；專業斥候、捕魚科技、商人公會搜尋不研究。商人每趟給當下最缺的食物／木材／黃金；貿易船 +20% 沒有（不模擬水上）。' },
      { text: '公會廳（城堡地標）：被動產出自選資源，越久越快', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Guild_Hall', note: '用固定 204/分黃金（Fandom 前 5 分鐘 1020 的平均）；實際會加速到 10/s，領取就重來。Fandom 自己的每 20 秒規則算出來是 900，數字前後矛盾，未查證。' },
      { text: '碼頭 +10 人口', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-season-nine-update-preview-12-0-1974/' },
      { text: '沒有法蘭西的城鎮中心加速與投放建築半價', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Town_Center_(Age_of_Empires_IV)', note: '目錄村民 20 秒、磨坊／伐木場／採礦場 50 木材，正確。' },
    ],
  }),
  jin: spec('jin', '金朝', {
    startNote: '開局 200 食物、150 木材、100 黃金，3 名鄉騎、0 名普通村民、1 斥候（人口 4/10），只有 2 隻自有羊（其他文明 5 隻），第一座城鎮中心旁另有 2 頭馴鹿（共 800 食物；之後的城鎮中心沒有）（2026-11 AoE4 World 12260 對局摘要 4/4 場一致；馴鹿是中立動物，摘要不列，出自 Fandom 與官方文明頁）。',
    ownedSheep: 2,
    startWorkers: { 'mounted-villager': 3 },
    // extraPop 1（斥候）是預設值。
    // 馴鹿是城鎮中心旁的獵物：獵肉速率 0.825/秒、鄉騎獵肉攜帶 25 + 5 = 30，在羊之前採。
    startHunt: 800,
    worker: 'mounted-villager',
    workerCap: 20,
    fallbackWorker: 'villager',
    // 相對本文明普通村民：採集 ×2.2，農田只有 ×1.9；攜帶 10 + 5 = 15；移動 1.42（目錄）；
    // 建造地標 +75%、其他建築 +100%（防禦建築實際只有 +40%，沒有分開）。
    workerSpecs: { 'mounted-villager': { gather: { all: 2.2, farm: 1.9 / 2.2 }, carry: 15, speed: 1.42, build: { landmark: 1.75, other: 2 } } },
    // 花園只罩一塊 4 格半徑的區域，近似成全部食物 ×1.25。
    // 花塔：花園 4 格內村民採集 +25%（Fandom），可以蓋在農田區或礦、林線旁
    zones: [{ building: 'flower-pagoda', res: 'all', mul: 1.25, radius: 4, half: 0 }],
    trickles: [
      // 草場（Fandom Grassland 頁）：100 木材、45 秒，每座升代地標旁 1 座
      { building: 'grassland', perMin: {}, max: 3, maxByAge: [0, 1, 2, 3], note: '草場：每座升代地標可蓋 1 座（封建 1、城堡 2、帝王 3），搜尋決定蓋不蓋。' },

      { building: 'pagoda-forest', perMin: { wood: 600 }, max: 1, note: '每 30 秒長出 1 座小塔林、最多 15 座，每座每分鐘 40 木材；這裡直接用滿額 600，忽略完工後 7.5 分鐘的爬坡。' },
    ],
    // 目錄裡的騎兵與斥候是「草場馬匹」版本（少 25 資源、0 秒）；一般生產要用原價與正常時間。
    // 使者：引擎從不在城鎮中心訓練非工人單位，只會在龍亭訓練，龍亭價 100 黃金。
    costOverride: {
      horseman: { food: 100, time: 22.5 },
      'mohe-tribesman': { food: 60, time: 17 },
      'iron-pagoda': { food: 140, time: 40 },
      scout: { food: 65, time: 23 },
      emissary: { gold: 100 },
    },
    notMilitary: ['emissary', 'reindeer-trader', 'trader', 'monk'],
    // 朝貢國（Fandom Tributary State、Emissary 頁）：使者站 10 秒建立；第一塊田立刻出現、之後每 30 秒 1 塊，佃農在田出現 30 秒後到，
    // 每分鐘食物依佃農數 110/122/130/133/135/136/137/138；園藝、施肥、精準育種各 +10%。龍亭蓋好送 1 名使者，同時最多 2 名
    trade: {
      tributary: { unit: 'emissary', at: ['dragon-pavilion'], free: 'dragon-pavilion', establish: 10, every: 30, rates: [0, 110, 122, 130, 133, 135, 136, 137, 138], techs: ['horticulture', 'fertilization', 'precision-cross-breeding'], techPct: 0.1, goldMul: 1.15, workerCap: 3, maxActive: 2 },
    },
    // 山殿業力（Fandom Mountain Hall 頁）：開始 100，12.5 格內採集的村民每秒 0.1、鄉騎 0.2；滿 1000 時 60 秒農田 +75%，之後歸零
    karma: { building: 'mountain-hall', radius: 12.5, start: 100, threshold: 1000, duration: 60, rates: { villager: 0.1, 'mounted-villager': 0.2 }, gather: { farm: 1.75 } },
    // 草場產馬（Fandom Grassland 頁）：每座封建 75 秒、城堡 60 秒、帝王 45 秒 1 匹，最多 5 匹；戰馬廄用掉 1 匹立刻訓練騎兵、-25 食物
    horses: { building: 'grassland', every: [0, 75, 60, 45], max: 5, at: ['war-stable'], cls: 'cavalry', discount: { food: 25 } },
    bonuses: [
      { text: '開局 3 名鄉騎、1 斥候、2 隻羊，資源 200 食物 / 150 木材 / 100 黃金', modeled: 'yes', source: 'https://aoe4world.com/games', note: '2026-11 AoE4 World 12260 對局摘要 4/4 場一致：0 秒時 3 名鄉騎、1 斥候、2 隻羊（標準文明是 5 隻），資源 200/150/100/0。aoe4guides 金朝流程也都從 3 名鄉騎開始。' },
      { text: '城鎮中心下有 2 頭馴鹿，共 800 食物', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Reindeer', note: '2 頭由官方文明頁確認；每頭 400 食物只有 Fandom 寫。引擎當作城鎮中心旁的獵物：獵肉速率 0.825/秒、獵肉攜帶量（鄉騎 30）、吃得到狩獵科技，最多 8 人同時採，在羊之前採。' },
      { text: '鄉騎採集 +120%（農田只有 +90%），攜帶 +5', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mounted_Villager', note: '倍率與攜帶量只出自 Fandom；論壇實測 1 名無科技鄉騎每分鐘採 81–85 黃金，與 ×2.2 吻合（引擎算出約每分鐘 80）。獵肉攜帶 25 + 5 = 30。17.0 修正後採金科技也套用到鄉騎，引擎的科技本來就對所有工人生效。' },
      { text: '鄉騎上限 20 名（每個朝貢國 +3），之後只能訓普通村民；鄉騎 65 食物 50 黃金、35 秒', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/jindynasty/mounted-villager-1.json', note: '每座朝貢國 +3 已計入（頁面「貿易」開啟時）。職業選手黃金不夠時會先訓普通村民再換回鄉騎，引擎只在滿上限後才改訓。' },
      { text: '鄉騎移動較快（1.42），建造較快：地標 +75%、一般建築 +100%、防禦建築 +40%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mounted_Villager', note: '移動速度出自目錄；建造倍率只出自 Fandom，Swaggy 3 名鄉騎蓋大牧場約 70 秒，與 +75% 推算的 65 秒吻合。引擎依工人組成取平均（混了普通村民就變慢），防禦建築也用 +100%。沒建模前金朝最快封建算出 4:38，比 23 場頂尖玩家（1850–2500 分）金朝的中位數 4:30 還慢；建模後約 3:31（頂尖最快 3:44）。' },
      { text: '狩獵與伐木專屬科技：靺鞨祖風、狩獵傳統各 +20% 獵肉；役馬木材 +15%、攜帶 +10；集體狩獵在城鎮中心多生 4 頭馴鹿', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Collective_Hunting', note: '靺鞨祖風、狩獵傳統（獵肉各 ×1.2）、役馬（木材 ×1.15）的效果已在目錄修正表補上並列入經濟科技；役馬的攜帶 +10 與集體狩獵的馴鹿沒有計入。' },
      { text: '花塔（黑暗→封建地標）：花園範圍內村民採集 +25%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Flower_Pagoda', note: '花園以放置點為圓心、半徑 4 格，範圍內村民採集 +25%（Fandom Flower Pagoda 頁）；搜尋決定放在農田區或礦、林線、野果旁。花園可以放在地圖任何地方，引擎只放在候選點旁。' },
      { text: '塔林（城堡→帝王地標）：每 30 秒多 1 座小塔林，最多 15 座、共每分鐘 600 木材', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/jindynasty/pagoda-forest-3.json', note: '用滿額 600/分鐘，忽略完工後 7.5 分鐘的爬坡（第一座在 +30 秒才出現，約多算 2400 木材）。' },
      { text: '大牧場、草場產馬：戰馬廄消耗 1 匹馬可立刻訓練騎兵，少 25 資源', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Grassland', note: '搜尋決定蓋幾座草場（100 木材、每座升代地標 1 座）；每座封建 75 秒、城堡 60 秒、帝王 45 秒產 1 匹馬（最多 5 匹），戰馬廄訓練騎兵時用掉 1 匹就立刻出兵、-25 食物（Fandom Grassland 頁）。近似：戰馬廄都在草場範圍內；大牧場產馬、馬給騎兵加生命沒有建模。' },
      { text: '朝貢國（使者佔領中立貿易站）：每座每分鐘 110–138 食物、鄉騎上限 +3、商人黃金 +15%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Tributary_State', note: '頁面「貿易」開啟時才模擬，搜尋決定建立幾座（不超過貿易站數）：龍亭蓋好送 1 名使者，再訓練的在龍亭（100 黃金，同時最多 2 名）；使者走到貿易站站 10 秒建立後消失。第一塊田立刻出現、之後每 30 秒 1 塊，佃農在田出現 30 秒後到，每分鐘食物照 Fandom 表（佃農 1→8 名：110→138），園藝、施肥、精準育種各 +10%。每座鄉騎上限 +3；有朝貢國時商人都在那裡貿易，黃金 ×1.15。食物表只出自 Fandom；貿易站周圍被擋住、田數不滿 8 的情況不建模。' },
      { text: '山殿（封建→城堡地標）：業力滿 1000 時農田 +75%、持續 60 秒', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mountain_Hall', note: '業力已計入（Fandom Mountain Hall 頁）：完成時 100，山殿 12.5 格內採集與帶著資源走回投放點的村民每秒 +0.1、鄉騎 +0.2（空手走過去不算），滿 1000 時 60 秒內農田 +75%，結束後歸零。其他修道院的範圍、單位陣亡 -4 沒有建模。' },
    ],
  }),
  kt: spec('kt', '聖殿騎士團', {
    start: { ...STD, wood: 100 },
    startNote: '開局 200 食物、100 木材（比標準少 50）、100 黃金、0 石頭，6 名村民、1 名斥候、城鎮中心旁 5 隻羊，人口 7/10（Fandom 聖殿騎士團頁；職業建造順序開局用 100 木材剛好蓋房屋＋採礦營佐證）。',
    // 6 村民、1 斥候、5 隻羊、無延遲皆為預設值。
    // 遊戲基礎 0.60 木/秒；比照標準 150 / (150 / 0.75 + 14 秒砍樹) ≈ 0.70 的算法：150 / (150 / 0.6 + 14) ≈ 0.57
    woodAtTree: 0.57,
    woodByAge: [1, 1.2, 1.35, 1.5],
    woodInstant: true,
    byproducts: [{ from: 'wood', to: 'food', ratio: 0.2, note: '伐木量的 20% 另計為食物，按時代加成後的木材計算' }],
    dropoff: { food: ['mill'], wood: [], gold: ['mining-camp'], stone: ['mining-camp'] },
    // 攻城專家：攻城工坊與攻城器械木材 -25%（目錄沿用未打折的原始數字）
    costOverride: {
      'siege-workshop': { wood: 187.5 },
      'battering-ram': { wood: 150 },
      'siege-tower': { wood: 93.75 },
      springald: { wood: 112.5 },
      mangonel: { wood: 300 },
      'counterweight-trebuchet': { wood: 300 },
    },
    notMilitary: ['monk', 'venetian-trader'],
    triggers: [
      // 法蘭西王國：陸軍生產 +15%、黃金 -5%；醫院騎士團：平民移動 +8%（生命不影響規劃）
      { on: 'kingdom-of-france', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], time: 1 / 1.15, cost: 1 }], costMul: [{ kind: 'unit', res: ['gold'], mul: 0.95 }] },
      { on: 'knights-hospitaller', speed: 1.08 },

      // 朝聖者：安全通道後立刻出發、之後每 60 秒 1 名，走到聖地才給黃金：30 + 每格 1.8（最多 130，54 格）。地圖沒有聖地，假設 48 格（約地圖中央）→ 116 黃金、走 64 秒
      { on: 'safe-passage', every: 60, delay: 64, each: { gold: 116 } },
    ],
    civTechs: [
      { id: 'lettre-de-change', requires: 'market' },

      { id: 'safe-passage', tc: true },
    ],
    // 匯票（Fandom Lettre de Change 頁）：市場研究後可貸款：1000 食物 → 2 分鐘每秒 5 黃金、2500 → 3 分鐘每秒 10、4000 → 4 分鐘每秒 15
    loans: {
      requires: 'lettre-de-change',
      options: [
        { food: 1000, perSec: 5, duration: 120 },
        { food: 2500, perSec: 10, duration: 180 },
        { food: 4000, perSec: 15, duration: 240 },
      ],
    },
    bonuses: [
      { text: '開局 200 食物、100 木材、100 黃金（少 50 木材），6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Knights_Templar', note: 'Fandom 與多份建造順序的開局木材、黃金算式一致；沒有官方更新說明直接列出。' },
      { text: '地景保育：伐木採到就自動入庫，不需要也不能蓋伐木場，沒有伐木科技', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/templar.json' },
      { text: '伐木基礎速率 0.60/秒（標準 0.75，15.1 從 0.63 調降）', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-15.1.6970-season-12.tsx', note: '樹上實際速率用 150 / (150 / 0.6 + 14 秒砍樹) ≈ 0.57，與標準 0.70 同一算法；假設砍樹時間與其他文明相同，未證實。' },
      { text: '木材採集逐代提升：封建 +20%，城堡、帝王各再 +15%（17.0 從 20% 調降）', modeled: 'approx', source: SRC.off, note: '只有封建 0.72 有玩家實測。城堡、帝王採加法疊加（×1.35、×1.5）；若是乘法則為 ×1.38、×1.587，未證實。' },
      { text: '伐木時另得 20% 的食物', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/templar.json', note: '按時代加成後的木材量計算（玩家實測封建 0.72 木 → 0.864 總量）。黑暗時代每名伐木村民約 0.11 食物/秒。' },
      { text: '在城鎮中心研究分團升代：封建 400 食物/200 黃金 60 秒，城堡 1200 食物/600 黃金、帝王 2400 食物/1200 黃金各 45 秒，不需要村民蓋地標', modeled: 'yes', source: 'https://data.aoe4world.com/technologies/templar.json', note: '研究期間該城鎮中心不能生產村民。模擬允許任何城鎮中心升代（目錄如此），Fandom 說只在首都，未證實。安全通道（10 秒）與聖所（15 秒）只能在首都城鎮中心研究，同樣暫停村民。' },
      { text: '朝聖者產金：安全通道（50 食物/200 木材）後每 60 秒出發一批，1 人，聖所 +1、每座要塞 +1（上限 10），每人最多 130 黃金', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Pilgrim_(Age_of_Empires_IV)', note: '安全通道（首都城鎮中心研究 10 秒）後立刻出發、之後每 60 秒 1 名（聖所 +1、每座要塞 +1 沒有建模）；到聖地才給黃金：30 + 每格約 1.8，最多 130（54 格），速度 0.75 格/秒（Fandom Pilgrim 頁）。引擎的地圖沒有聖地，假設聖地在 48 格（約地圖中央）→ 每名 116 黃金、出發 64 秒後入帳。' },
      { text: '攻城專家：攻城工坊與攻城器械木材 -25%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/templar.json', note: '以費用修正套用（工坊 187.5、衝車 150、攻城塔 93.75、弩砲 112.5、投石車 300、配重投石機 300 木材）；遊戲內進位方式未證實。' },
      { text: '分團效果：醫院騎士團平民 +8% 移速、+25% 生命；法蘭西王國陸軍生產 +15%、黃金 -5%；熱那亞共和國朝聖者黃金 +20%', modeled: 'approx', source: 'https://data.aoe4world.com/technologies/templar.json', note: '法蘭西王國（陸軍生產 +15%、單位黃金 -5%，村民沒有黃金花費所以不受影響）與醫院騎士團（村民移動 +8%）已計入；熱那亞共和國的朝聖者黃金 +20% 沒有建模。' },
      { text: '匯票：市場可用 1000/2500/4000 食物借貸，分 2/3/4 分鐘換回 600/1800/3600 黃金', modeled: 'approx', source: 'https://data.aoe4world.com/abilities/templar.json', note: '搜尋決定研不研匯票（城堡時代，市場，100 食物 250 黃金、45 秒；要先有市場，引擎會先蓋）；之後缺黃金、食物真的有多（扣掉需求）時借付得起的最大一筆：1000 食物 → 2 分鐘共 600 黃金、2500 → 3 分鐘共 1800、4000 → 4 分鐘共 3600（Fandom Lettre de Change 頁），一次一筆。能不能同時借多筆、有沒有冷卻沒有寫。' },
    ],
  }),
  mac: spec('mac', '馬其頓王朝', {
    start: { ...STD, wood: 200 },
    startOther: { silver: 100 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭另加 100 白銀，6 村民、1 斥候、5 隻羊，人口 7/10（Fandom 馬其頓王朝頁；200 木材有 7 份職業建造順序的木材算術佐證，100 白銀只有 Fandom 單一來源）。',
    // 瓦良格軍營：黑暗時代 50 木材、20 秒、限 1 座，+10 人口，通常取代第一間房屋
    popBuildings: { 'varangian-warcamp': 10 },
    // 大酒莊兼磨坊（食物投放點）與修道院；引擎取清單中第一個可蓋的，所以磨坊仍是預設投放點
    dropoff: {
      food: ['mill', 'grand-winery'],
      wood: ['lumber-camp'],
      gold: ['mining-camp'],
      stone: ['mining-camp'],
    },
    // 方鉛礦開採：投放到採礦場（或非首都城鎮中心）時另得 40% 白銀；首都城鎮中心是否也算沒有來源，故要求先有採礦場
    byproducts: [
      { from: 'gold', to: 'silver', ratio: 0.4, requires: 'mining-camp', note: '方鉛礦開採：採金量的 40% 另計為白銀' },
      { from: 'stone', to: 'silver', ratio: 0.4, requires: 'mining-camp', note: '方鉛礦開採：採石量的 40% 另計為白銀' },
    ],
    // 大酒莊：6.25 格內食物採集 +35%（半徑只有 Fandom）
    zones: [{ building: 'grand-winery', res: 'food', mul: 1.35, radius: 6.25, half: 3, dropoff: ['food'] }],
    // 瓦良格軍營沒有被動收入：借 trickles 讓搜尋決定蓋不蓋（max 1 = 限 1 座），完成後由 popBuildings 給 +10 人口。
    // 第一山丘蓄水池不放進 trickles：引擎會把它當一般經濟建築在封建時代蓋、不升代，還可能和金角塔並存。
    trickles: [
      // 瓦蘭吉兵工廠（100 木材）：範圍內採礦場與城鎮中心每分鐘產出累計投放白銀的 12%
      { building: 'varangian-arsenal', perMin: {}, max: 1, note: '瓦蘭吉兵工廠：搜尋決定蓋不蓋；蓋好後鑄幣。' },

      { building: 'varangian-warcamp', perMin: {}, max: 1, note: '只為了讓搜尋能蓋這座 +10 人口建築（限 1 座），沒有收入' },
    ],
    // 目錄存的是每名 260 白銀、整批 25 秒；帕拉丁學院一次出 3 名（17.0：780 白銀、25 秒、3 人口）
    batches: {
      cataphract: { size: 3 },
    },
    notMilitary: ['trader', 'monk'],
    triggers: [
      // 鑄幣（Fandom Varangian Arsenal 頁）：每分鐘 12%（每 15 秒 3%）的累計投放白銀；近似：兵工廠蓋在主要採礦場旁，全部白銀都算
      { on: 'varangian-arsenal', mint: { res: 'silver', pctPerMin: 0.12 } },

      // 帝國競技場：完成後依序送 3 名冠軍：斥候 45 秒、騎兵再 130 秒、里達里再 205 秒
      { on: 'imperial-hippodrome', every: 9999, delay: 45, times: 1, eachUnits: { 'hippodrome-scout': 1 } },
      { on: 'imperial-hippodrome', every: 9999, delay: 175, times: 1, eachUnits: { 'hippodrome-horseman': 1 } },
      { on: 'imperial-hippodrome', every: 9999, delay: 380, times: 1, eachUnits: { 'hippodrome-riddari': 1 } },

      // 金角塔：每 135 秒免費 3 名弩手
      { on: 'golden-horn-tower', every: 135, eachUnits: { crossbowman: 3 } },

      // 第一山丘蓄水池：開局 4 次恩惠（每次 60 秒內 160 資源，近似成完成時 +640）、之後每 60 秒 1 次，給當下最缺的資源
      { on: 'cistern-of-the-first-hill', grant: { flex: 640 }, every: 60, each: { flex: 160 } },
{ on: 'border-settlements', buildTime: { house: 1 / 6 } }],
    civTechs: [{ id: 'border-settlements', requires: 'house' }],
    bonuses: [
      { text: '邊境聚落（房屋科技，封建）：40 木材、80 黃金，房屋建造快 500%（15 秒 → 2.5 秒）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/House_(Age_of_Empires_IV)', note: '目錄有這項科技（和拜占庭同價）；效果沿用拜占庭的數字，沒有馬其頓專屬來源。' },
      { text: '開局 200 食物、200 木材、100 黃金另加 100 白銀，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Macedonian_Dynasty', note: '200 木材有 7 份職業建造順序佐證（未採木前就花掉 175～250 木材）；100 白銀只有 Fandom 單一來源（低～中信心），且封建前沒有東西能花白銀。' },
      { text: '方鉛礦開採：採金、採石時另得 40% 白銀，在採礦場或非首都城鎮中心投放時入帳', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/macedonian.json', note: '有任一座採礦場後，所有採金、採石都按採集量計入白銀；沒採礦場前在首都城鎮中心投放的不計（是否算未確認）。採礦科技會等比提高白銀，提煉（投放 +15% 黃金）是否也算未確認，假設不算。' },
      { text: '瓦良格軍營（黑暗時代 50 木材、20 秒、限 1 座）+10 人口，兼做免費增援', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Varangian_Warcamp', note: '用 trickles（無收入、max 1）讓搜尋決定何時蓋，popBuildings 計入 +10 人口。它不能付費訓練單位，只在損失 7 倍批次價值後免費增援，增援未建模；目錄卻把它列為阿特蓋爾、瓦良格衛隊、里達里的生產建築，修正前規劃器可能拿它當 50 木材的兵營。' },
      { text: '沒有兵營：瓦良格要塞（200 木材、30 秒，黑暗時代可蓋）訓練阿特蓋爾（70 食物 20 木材）、早期瓦良格衛隊（80 食物 40 黃金）、弓手（40 食物 50 木材）與里達里', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/macedonian.json', note: '費用、時間取自目錄。目錄也把瓦良格軍營列為生產建築，已有軍營、沒有要塞時規劃器會改在軍營出兵；後續全力出兵也不認得要塞（只認兵營、射箭場、馬廄）。' },
      { text: '大酒莊（封建地標）光環內食物採集 +35%（17.0 從 30% 提高），兼磨坊與修道院', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '範圍 6.25 格（半徑與離開後 10 秒殘留只有 Fandom 記載），只算範圍內的食物採集點；搜尋決定蓋在農田區、野果或鹿群旁，蓋在野果、鹿群旁時兼作那裡的磨坊，野果採完後周圍的田也吃光環。兼修道院（聖物給白銀）沒有建模。' },
      { text: '兵工廠鑄幣：影響範圍內的採礦場、城鎮中心每分鐘產出累計投放白銀的 12%；大酒莊每個聖物每分 100 白銀（17.0 從 80 提高）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/macedonian.json', note: '搜尋決定蓋不蓋兵工廠（100 木材）；蓋好後每分鐘產出累計採到白銀的 12%（Fandom Varangian Arsenal 頁：範圍內每座採礦場與城鎮中心各算自己收到的白銀）。近似成兵工廠蓋在主要採礦場旁、全部白銀都算；大酒莊聖物白銀要聖物系統，沒有建模。' },
      { text: '第一山丘蓄水池（城堡地標）：恩惠開局 4 次、每 60 秒回充 1 次（上限 99），用在採礦場、伐木場、磨坊、農田時 60 秒內給 160 資源；用在軍事或科技建築時工作效率 +150%、60 秒', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/macedonian.json', note: '近似：完成時一次給 640（4 次恩惠），之後每 60 秒 160，都給當下最缺的資源；恩惠用在軍事或科技建築（效率 +150%）沒有建模。' },
      { text: '帝國競技場（封建地標，兼馬廄）完成後免費送出 3 名冠軍：斥候 45 秒、騎兵再 130 秒、里達里再 205 秒（17.0）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '完成後 45、175、380 秒各送 1 名冠軍（斥候、騎兵、里達里），算進軍隊目標與目標後出兵。' },
      { text: '金角塔（城堡地標）每 135 秒免費送 3 名弩手（17.0 從 112 秒調慢）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Golden_Horn_Tower', note: '完成 135 秒後起每 135 秒送 3 名弩手，算進軍隊目標與目標後出兵。' },
      { text: '白銀花費：帕拉丁學院精銳鐵甲騎兵一次 3 名 780 白銀、25 秒；外國工程公司大砲 900、回回砲 1000、火箭車 600 白銀；兵工廠六階科技（取代鐵匠鋪、大學）175～4200 白銀', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/macedonian.json', note: '目錄保留白銀花費；鐵甲騎兵以 batches 3 名一批（目錄每名 260 白銀、整批 25 秒）。白銀不足時規劃器換算成要多採的金、石。' },
    ],
  }),
  ma: spec('ma', '馬利', {
    startNote: '標準開局 200 食物、150 木材、100 黃金、0 石頭，6 村民、1 先鋒斥候、5 隻羊，人口 7/10（Fandom 馬利頁「Starting resources」；職業開局 0:00 用 150 木材蓋坑礦，帳對得上；17.0 未改）。',
    housePop: 5,
    noBoar: true,
    trickles: [
      // 36 黃金/分是基礎；每棟在範圍內的房屋或採礦場再 +9（+25%），大礦脈最多 12 棟。引擎沒有「加成建築」欄位，
      // 先假設職業開局那 6 棟房屋都蓋在坑礦旁：36 + 6 × 9 = 90。上限 = 目前時代（1~4 座），引擎沒有依時代上限，取 1 免得黑暗時代蓋兩座。
      { building: 'pit-mine', perMin: { gold: 90 }, max: 1, note: '基礎 36/分 + 假設 6 棟房屋在範圍內（每棟 +9）。不消耗金礦，收入直接入庫。第 2~4 座（封建起每時代 +1）未計入。' },
      // 地標完成後每 15 秒 18.75 黃金；可切換成同速率的石頭（未建模）。收入迴圈會算到當升級地標蓋的那座
      { building: 'mansa-quarry', perMin: { gold: 75 }, max: 1, note: '曼薩採石場完成後 75 黃金/分；切換成石頭沒有建模。' },
      // 每隻牛在牧場裡 25 食物/分，一座 3 隻 = 75。食物科技每項 ×1.10 未計入。
      { building: 'cattle-ranch', perMin: { food: 75 }, max: 6, note: '假設每座牧牛場放滿 3 隻牛（25 食物/分 × 3）；牛的 270 黃金併進牧場花費。最多 6 座 = 18 隻（牛上限 20）。' },
    ],
    // 目錄沒有「牛」這個單位（上游 aoe4world 也沒有），先把 3 隻牛（每隻 90 黃金）併進牧牛場的花費；目錄補上牛之後要拿掉
    costOverride: {
      'cattle-ranch': { wood: 125, gold: 270 },
    },
    // 目錄把商人、伊瑪目標成軍隊
    notMilitary: ['trader', 'imam'],
    // 收費哨站（Fandom Toll Outpost、Saharan Trade Network 頁）：經過 10 格光環抽 8%，光環不重疊才收滿（每 20 格一座），每趟最多 5 次；
    // 撒哈拉貿易網本身也收稅並另給等量食物，其他哨站另給一半食物
    // 漁船投放食物時另得 10% 黃金（aoe4world 馬利文明資料）
    fishBonus: [{ to: 'gold', ratio: 0.1 }],
    trade: { tolls: { building: 'toll-outpost', pct: 0.08, spacing: 20, maxPerLeg: 5, landmark: 'saharan-trade-network', foodPct: 0.5 } },
    // 牛：在磨坊買（90 黃金、15 秒，不佔人口是推測），每隻 500 食物，村民每秒 0.81；放在城鎮中心旁、一隻一人
    herd: { at: 'mill', label: '牛', cost: { gold: 90 }, time: 15, food: 500, raw: 0.81, max: 20 },
    triggers: [
      // 富拉尼大畜欄：範圍內每隻牛每分鐘 +16 食物；近似成每座牧牛場（3 隻牛）+48，假設牧牛場都在 6.5 格內
      { on: 'grand-fulani-corral', buildingIncome: { building: 'cattle-ranch', perMin: { food: 48 } } },
    ],
    // 格里奧巴拉慶典（Fandom Griot Bara 頁）：每次 300 黃金、90 秒、之後冷卻 30 秒；搜尋決定一直開哪一種
    festival: {
      building: 'griot-bara',
      cost: { gold: 300 },
      duration: 90,
      cooldown: 30,
      options: {
        food: { label: '食物慶典', gather: { sheep: 1.5, berry: 1.5, hunt: 1.5, farm: 1.5 } },
        production: { label: '生產慶典', villagerTime: 0.5, prod: [{ time: 0.5 }] },
      },
    },
    bonuses: [
      { text: '標準開局：200 食物、150 木材、100 黃金，6 村民、1 先鋒斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Malians_(Age_of_Empires_IV)', note: 'Fandom 馬利頁與資源頁一致；三套職業開局（0:00 坑礦 150 木材、再砍 175 木材蓋 7 棟房屋）的帳也對得上。' },
      { text: '房屋半價、一半時間、一半人口（25 木材、7 秒、+5）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/malians/house-1.json', note: '目錄已是 25 木材、7 秒。' },
      { text: '坑礦（150 木材、15 秒）：蓋在金礦上不消耗礦脈，基礎 36 黃金/分；範圍內每棟房屋或採礦場 +25%（+9/分），大礦脈最多 12 棟（144/分）、小礦脈 8 棟（108/分）；上限黑暗 1 座、每時代 +1', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/malians/pit-mine-1.json', note: '固定算 90/分（假設 6 棟房屋在範圍內，職業開局蓋 6~7 棟），最多 1 座；坑礦一完成就給 90，但那幾棟房屋要等人口需要才會蓋、木材也晚付（實際是 0:25 起 36/分，約 1:30 房屋蓋完才到 90），早期黃金略多。封建後的第 2~4 座未計入。12／8 棟上限來自 2022 論壇實測（舊基礎 35），每時代上限只有 Fandom。是否受採礦科技影響沒有來源，假設不受。' },
      { text: '曼薩採石場（封建地標）完成後每分鐘 75 黃金，可切換成石頭', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mansa_Quarry', note: '只算黃金；切換石頭未建模。被動收入的蓋法可能在升級前另蓋一座不升級的採石場，遊戲裡不行（見引擎備註）。' },
      { text: '牛（磨坊訓練，90 黃金，500 食物，上限 20）：馬利村民採牛 0.81 食物/秒（盟友 0.66）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Cattle', note: '搜尋決定在磨坊買幾隻（0～20，90 黃金、15 秒），每隻 500 食物放在城鎮中心旁，村民每秒 0.81、一隻一人；訓練時間 15 秒（Fandom，論壇說 20）、不佔人口都是推測。牧牛場裡的牛另外算在牧牛場的被動收入。' },
      { text: '牧牛場（封建，125 木材、15 秒）：可放 3 隻牛，每隻 25 食物/分，食物科技會加成', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/malians/cattle-ranch-2.json', note: '當成「牧場＋3 隻牛」一包：125 木材＋270 黃金，75 食物/分，最多 6 座。牛在磨坊的訓練時間（3 × 15 秒）和「要先有磨坊」都沒算。食物科技每項 ×1.10（12.0.1974 後由 15% 改 10% 推算，Fandom 表仍是舊的 ×1.15）未計入，中等信心。' },
      { text: '富拉尼大畜欄（城堡地標）：6.5 格內每隻牛每分鐘 +16 食物（17.0 從 18 下修），不受食物科技與食物慶典影響', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '近似：每座牧牛場（3 隻牛）每分鐘 +48 食物，假設牧牛場都在 6.5 格內；買來給村民採的牛沒有算進去。' },
      { text: '城鎮中心用黃金代替石頭（400 木材、350 黃金、165 秒）', modeled: 'yes', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.1.9737-season-13.tsx', note: '目錄已是 400 木材／350 黃金、165 秒。' },
      { text: '不能採野豬', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/malians.json', note: '引擎目前對所有文明都不放野豬，所以這個旗標實際上沒有差別。' },
      { text: '格里奧巴拉（帝王地標）慶典：300 黃金、持續 90 秒、冷卻 30 秒；食物慶典採食物 +50%（含牧場），生產慶典所有單位生產 +100%（含村民，商人除外）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Griot_Bara', note: '搜尋決定一直開食物慶典（食物採集 +50%）或生產慶典（所有單位含村民生產 +100%）或不開；每次 300 黃金、持續 90 秒、冷卻 30 秒，付得起就馬上再開（Fandom Griot Bara 頁）。食物慶典對牧牛場牛的 +50% 沒有套上去；攻城慶典不影響規劃。' },
      { text: '法林巴要塞（城堡地標）：免費招募 1 條曼薩兵種，其餘兩條各 100 食物、250 黃金', modeled: 'na', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.1.9737-season-13.tsx', note: '只解鎖或升級兵種（第一條免費、其餘 100 食物 250 黃金，Fandom Farimba Garrison 頁），沒有經濟效果；目錄沒有鎖這些兵種，所以不影響規劃。' },
      { text: '貿易：收費哨站（100 木材）向經過的商人抽 8% 黃金；撒哈拉貿易網另給等量食物；手稿貿易縮短科技研究時間', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Toll_Outpost', note: '頁面「貿易」開啟時才模擬：有商人之後沿路線每 20 格蓋一座收費哨站（10 格光環不重疊才收滿，Fandom），搜尋決定蓋幾座；每趟經過一座抽 8% 黃金、最多 5 次（「每趟」當作單程）。擁有撒哈拉貿易網時假設它在路線上（佔一個位置），在它收的稅另給等量食物，其他哨站另給一半食物（Fandom Saharan Trade Network 頁）。手稿貿易沒有公開公式，未建模。' },
      { text: '漁船投放食物時另得 10% 黃金', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/malians.json', note: '頁面「捕魚」開啟時：漁船採到的食物另給 10% 黃金（fishBonus）。' },
      { text: '城堡時代老兵升級半價、半時間（例如 50 食物＋125 黃金、30 秒）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/malians.json', note: '目錄已是折半的花費和時間。' },
    ],
  }),
  mo: spec('mo', '蒙古', {
    // 開局資源是標準的 200 / 150 / 100 / 0（用預設 start）。
    startNote: '開局 200 食物、150 木材、100 黃金，6 村民、1 可汗（取代斥候，會趕羊）、城鎮中心旁 5 隻羊；城鎮中心和 1 座免費蒙古包開局都是收起的，人口上限一開始就是 200、不需房屋（Fandom、aoe4world）。',
    startWorkers: { villager: 6 },
    // 可汗的人口 aoe4world 寫 0、Fandom 寫 1；收起的蒙古包也佔 1 人口直到展開。上限固定 200，只有到 200 才有差，取 1。
    extraPop: 1,
    ownedSheep: 5,
    // 首都城鎮中心開局是收起的，展開 5 秒（Fandom 可移動建築的預設值）後才能訓練村民；搬到木頭旁的移動時間沒有算。
    // 牧場取代農田：每 112 秒 1 隻羊 ≈ 1.79 食物/秒，近似成每座 2 名村民
    farm: { id: 'pasture', slots: 2 },
    tcStartDelay: 5,
    popModel: 'max',
    // 村民不能採石，石頭只來自敖包與白塔。牧場的羊用採羊速率（0.75），和農田相同，所以 farm 維持 1。
    gather: { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 0 },
    // 開局送的收起蒙古包：當作第一個投放點免費（不付 100 木材）。不用 prebuilt，因為 prebuilt 的建築不會連到任何資源點，
    // 第一座木材／黃金投放點還是要另外付錢，等於多一座假的蒙古包。
    freeDropoffs: 1,
    dropoff: { food: ['ger'], wood: ['ger'], gold: ['ger'], stone: [] },
    // 草原堡壘：在這裡投放黃金 +50%；近似為所有採金村民都投到草原堡壘（實務上會把它收起搬到金礦旁）
    zones: [{ building: 'steppe-redoubt', res: 'gold', mul: 1.5, radius: 2, half: 1 }],
    trickles: [
      {
        building: 'ovoo',
        perMin: { stone: 70 },
        ageMul: [1, 100 / 70, 140 / 70, 170 / 70],
        max: 1,
        note: '要蓋在石礦露頭上、同時只能 1 座；每分鐘 70/100/140/170（黑暗→帝王，16.2.10604），引擎沒有依時代的速率，取黑暗時代 70。露頭採完（小 1200、大 2400）就停，沒有計入。',
      },
      {
        building: 'the-white-stupa',
        perMin: { stone: 240 },
        max: 1,
        note: '城堡時代地標（升帝王），不需要露頭；只有選它升代時才會有。和敖包能否同時產石未查證。',
      },
    ],
    // 雙倍生產（敖包範圍內一格出 2 名，原價一次 + 石頭）是選用模式，不能用固定的 batches 表示，所以不設 batches。
    notMilitary: ['trader', 'shaman'],
    // 絲路：同時有 5/10/15 名商人時，每趟另得黃金 10% 的食物／木材／黃金；銀樹訓練商人黃金 -40%、快 40%（Fandom Trade、The Silver Tree 頁）
    trade: {
      tiers: [
        { n: 5, res: 'food', pct: 0.1 },
        { n: 10, res: 'wood', pct: 0.1 },
        { n: 15, res: 'gold', pct: 0.1 },
      ],
      producerMods: { 'the-silver-tree': { gold: 0.6, time: 1 / 1.4 } },
      // 驛站：前哨 12.5 格內商人移動 +15%（Fandom Outpost 頁）；搜尋決定沿路線蓋幾座
      speedAura: { building: 'outpost', radius: 12.5, mul: 1.15 },
    },
    triggers: [
      // 改良經濟科技：目錄效果只是加強的部分，研究時一併套用一般版的效果（一般版與改良版互斥）
      { on: 'wheelbarrow-improved', alsoApply: ['wheelbarrow'] },
      { on: 'horticulture-improved', alsoApply: ['horticulture'] },
      { on: 'double-broadax-improved', alsoApply: ['double-broadax'] },
      { on: 'specialized-pick-improved', alsoApply: ['specialized-pick'] },
      { on: 'survival-techniques-improved', alsoApply: ['survival-techniques'] },
      { on: 'forestry-improved', alsoApply: ['forestry'] },
    ],
    civTechs: [
      { id: 'wheelbarrow-improved', requires: 'ovoo', excludes: ['wheelbarrow'] },
      { id: 'horticulture-improved', requires: 'ovoo', excludes: ['horticulture'] },
      { id: 'double-broadax-improved', requires: 'ovoo', excludes: ['double-broadax'] },
      { id: 'specialized-pick-improved', requires: 'ovoo', excludes: ['specialized-pick'] },
      { id: 'survival-techniques-improved', requires: 'ovoo', excludes: ['survival-techniques'] },
      { id: 'forestry-improved', requires: 'ovoo', excludes: ['forestry'] },
    ],
    // 敖包範圍內雙倍生產：村民一格出 2 名、多付 120 石頭（假設城鎮中心在敖包範圍內）
    doubleProduce: { requires: 'ovoo', stone: 120 },
    bonuses: [
      { text: '開局 200 食物 / 150 木材 / 100 黃金，6 村民 + 可汗（取代斥候，會趕羊）+ 5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Mongols_(Age_of_Empires_IV)', note: '職業建造順序 0 秒就用開局 150 木材蓋敖包，佐證 150 木材。可汗人口 aoe4world 0、Fandom 1，取 1（只在 200 人口時有差）。' },
      { text: '首都城鎮中心開局是收起的：展開 5 秒後才能訓練村民，但可以直接放在樹林或石礦旁', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Capital_Town_Center', note: 'tcStartDelay 5 秒（Fandom 可移動建築的預設展開時間，首都城鎮中心沒有單獨實測）；搬移時間（0.75 格/秒）和放在木頭旁縮短的走路距離沒有計入。距敵方城鎮中心 20 格內不能展開。' },
      { text: '不需要房屋，開局人口上限 200', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/mongols.json', note: '收起的非地標建築每座佔 1 人口，沒有計入。' },
      { text: '開局送 1 座收起的蒙古包（展開 1 秒）；蒙古包 100 木材，是食物、木材、黃金投放點，也研究經濟科技，不收石頭', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Ger', note: '用 freeDropoffs 1：第一座蒙古包投放點不用木材，但仍照目錄算 20 秒建造（實際是走過去 0.75 格/秒再 1 秒展開）。之後蒙古包可以收起搬到新資源旁，不必重蓋，這點沒有計入。' },
      { text: '村民不能採石；敖包（150 木材、15 秒，只能 1 座，蓋在石礦露頭上）每分鐘 70/100/140/170 石頭（黑暗→帝王）', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.2.10604.tsx', note: '固定每分鐘 70，不隨時代提升；露頭採完就停沒有計入。Fandom 文明頁的 80/100/120/150 是舊數字。' },
      { text: '敖包範圍內雙倍生產：一格出 2 名、時間不變，原價付一次再加石頭（村民 +120、斥候 +65、重步兵一對 +220、騎兵約 +120、可汗獵手 +120）', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-16.1.9737-season-13.tsx', note: '村民的雙倍生產已計入：搜尋決定開不開，開了就在有敖包、石頭夠時每批出 2 名、多付 120 石頭（假設城鎮中心在敖包範圍內）。軍隊的雙倍生產沒有建模。' },
      { text: '改良經濟科技：敖包範圍內的蒙古包可直接研究改良版（加石頭），效果更強（獨輪車 +9 攜帶、園藝 +30%、雙刃斧 +35%、專用鎬 +35%、生存技巧 +25%）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/mongols.json', note: '搜尋決定研一般版或改良版（互斥）；改良版要先有敖包（150 木材，引擎會自動先蓋，假設蓋在蒙古包旁、範圍罩得到），效果 = 一般版 + 目錄的加強部分（獨輪車 +5+4、園藝 ×1.1×1.18、雙刃斧與專用鎬 ×1.15×1.17、生存技巧 ×1.15×1.09），和說明的 +9／+30%／+35%／+25% 吻合。敖包的位置與石頭來源沒有建模。' },
      { text: '牧場取代農田：150 木材，完成時出 1 隻羊（200 食物），之後每 112 秒 1 隻（敖包範圍內間隔縮短 33%，約 75 秒），全部最多 30 隻', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-11-1-1201/', note: '每座牧場約 1.79 食物/秒，不計走路約可養 2.4 名村民（採羊速率 0.75）。近似成每座牧場可容納 2 名村民、用農田速率的無限食物；羊的上限 30 隻與敖包加速沒有計入。aoe4world 說明的 140 秒、遊戲內文字的 120 秒都是舊數字。' },
      { text: '黑暗時代就能蓋馬廄，騎兵訓練快 25%（18 秒）；城鎮中心只要 750 木材', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/mongols.json', note: '目錄已是 18 秒與 750 木材、165 秒。' },
      { text: '草原堡壘（封建地標、升城堡）也是蒙古包，在此投放黃金 +50%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/mongols.json', note: '蓋在金礦旁時，那個金礦的採集 ×1.5（投放 +50% 近似成採集倍率）；搜尋決定蓋在哪個金礦旁。收起搬家沒有建模。' },
      { text: '白塔（城堡地標、升帝王）：每分鐘 240 石頭，不需要露頭，有敖包範圍', modeled: 'approx', source: 'https://github.com/aoe4world/explorer/blob/main/src/data/patches/patch-15.1.6970-season-12.tsx', note: '石頭收入已計入；雙倍生產石頭 -50% 和範圍效果沒有計入。中等可信度。' },
      { text: '劫掠賞金（點燃敵方建築 +25 食物、+25 黃金）、絲路（商人 5/10/15 名時額外 +10%）、驛站移動速度、什一稅聖物收入', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Trade_(Age_of_Empires_IV)', note: '頁面「貿易」開啟時：絲路（同時有 5/10/15 名商人時，每趟另得黃金 10% 的食物／木材／黃金）、銀樹訓練商人黃金 -40%、快 40%（Fandom The Silver Tree 頁，有銀樹時優先在銀樹訓練）、驛站（有商人後沿路線每 25 格蓋一座前哨，12.5 格光環內商人 +15% 速度，搜尋決定蓋幾座，Fandom Outpost 頁）都已計入。劫掠賞金要敵方建築，不適用；什一稅倉照聖物系統的一般效果算。' },
    ],
  }),
  od: spec('od', '龍騎士團', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，5 名鍍金村民、1 斥候、城鎮中心旁 5 隻羊，沒有神職人員，人口 6/10（Fandom、官方 9.1.370 起始木材 150 → 200；到 17.0.12260 都沒改）。',
    worker: 'gilded-villager',
    startWorkers: { 'gilded-villager': 5 },
    // extraPop 用預設 1（只有斥候）；龍騎士團開局沒有神職人員。ownedSheep 用預設 5
    // 目錄 gilded-villager 60 食物、23 秒是每名（每次點擊 1 名，villagerBatch 預設 1）
    carry: 14, // Pushcarts +40%：10 × 1.4。手推車 +5 由目錄效果疊在上面（= 19，順序未驗證）；獵物肉仍被引擎固定為 25
    gather: { all: 1.27, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    // 亞琛禮拜堂：7.5 格內村民採集 +15%，不需駐紮神職人員；與 +27% 相乘
    // 亞琛禮拜堂（龍騎士團）：7.5 格內村民採集 +15%（半徑只有 Fandom）
    zones: [{ building: 'aachen-chapel', res: 'all', mul: 1.15, radius: 7.5, half: 3 }],
    // 士瓦本宮 +10 人口（引擎的 tcs() 只算城鎮中心，不會重複計算）；17.0 修正後大學不再給龍騎士團人口
    popBuildings: { 'palace-of-swabia': 10 },
    // 麥恩韋克宮專屬科技：目錄是折扣前價格，實付 -50%、研究快 50%（時間 ÷1.5）
    costOverride: {
      'golden-cuirass': { food: 75, gold: 125, time: 40 },
      zornhau: { food: 75, gold: 175, time: 40 },
      'bodkin-bolts': { food: 150, gold: 350, time: 60 },
    },
    notMilitary: ['prelate', 'trader'],
    triggers: [
      // 堡伯宮：步兵便宜 35%、快 35%，兵營科技快 35%
      { on: 'burgrave-palace', prod: [{ at: ['burgrave-palace'], cls: 'infantry', time: 0.65, cost: 0.65 }, { at: ['burgrave-palace'], research: 0.65 }] },
    ],
    // 雷格尼茨大教堂（Fandom Regnitz Cathedral 頁）：裡面的聖物收入 ×2；近似：擁有大教堂時所有聖物 ×2
    relicMul: [{ building: 'regnitz-cathedral', mul: 2 }],
    bonuses: [
      { text: '開局 200 木材（比標準多 50）、100 黃金，5 名鍍金村民 + 1 斥候，沒有神職人員（人口 6/10）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-9-1-370/', note: '不像神聖羅馬帝國，黃金沒有 -100。第 4 名村民後人口就滿，第一名新村民要順路蓋房屋。' },
      { text: '鍍金村民採集 +27%（16.2.10604 從 28% 下修），花費 60 食物、訓練 23 秒', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-16-2-10475/', note: '只有鍍金村民一種村民；漁船不吃這個加成。' },
      { text: '鍍金村民攜帶量 +40%（10 → 14）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/orderofthedragon.json', note: '14 由 +40% 推算（中等信心）：Fandom 鍍金村民頁寫 12、獵物肉 30，與其他來源矛盾。獵物肉推算應為 35（沒有來源直接寫），但引擎固定用 25；手推車 +5 的套用順序（19 或 21）沒有來源，目前用 14 + 5 = 19。' },
      { text: '建造與修理快 20%（時間 ×0.8）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Gilded_Villager', note: '目錄建造時間已含（房屋 12 秒、城鎮中心 132 秒、亞琛 152 秒），不要再乘一次。' },
      { text: '亞琛禮拜堂：7.5 格內村民採集 +15%，並可投放所有資源', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/orderofthedragon.json', note: '只算 7.5 格內的採集點，搜尋決定蓋在哪裡；與 +27% 相乘（未驗證是否相加）；7.5 格半徑與離開後持續 30 秒都只有 Fandom 一個來源。投放點效果沒有建模。' },
      { text: '麥恩韋克宮：當作鐵匠鋪，科技便宜 50%、快 50%；專屬科技金色胸甲實付 75 食物 125 黃金', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-season-eleven-update-14-0-4963/', note: '只修正三項專屬科技（金色胸甲、Zornhau、Bodkin Bolts）的價格；Zornhau、Bodkin Bolts 的 ×0.5 與所有時間 ÷1.5 是推算。兩處都能研究的鐵匠科技（含軍事學院）仍用鐵匠鋪價格。' },
      { text: '堡伯宮：當作兵營，步兵便宜 35%、快 35%，兵營科技研究快 35%', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Burgrave_Palace', note: '堡伯宮的步兵生產時間與花費 ×0.65、研究時間 ×0.65（目錄已把堡伯宮列為鍍金步兵的生產建築）。' },
      { text: '士瓦本宮：當作城鎮中心，村民便宜 66%（20 食物）、訓練快 200%（8 秒），+10 人口；地標本身便宜 10%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Palace_of_Swabia', note: '只計入 +10 人口與目錄已折價的 2160 食物 1080 黃金；它會像城鎮中心一樣訓練村民，但仍用 60 食物 23 秒。' },
      { text: '聖物除了修道院，也可放在前哨、石牆塔、城堡、碼頭，每個 80 黃金/分；雷格尼茨大教堂讓聖物收入 ×2', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Relic_(Age_of_Empires_IV)', note: '聖物系統已建模（頁面「聖物與聖地」設定地圖上能拿幾個、距離；搜尋決定拿幾個）：城堡時代起修道院、僧侶由引擎補，每個聖物每分鐘 80 黃金（Fandom Relic 頁）；擁有雷格尼茨大教堂時 ×2（近似成所有聖物都放在大教堂，實際最多 3 個）。放在前哨、石牆塔等其他建築只影響防守，不影響收入，不建模。' },
      { text: '所有鍍金軍事單位 2 倍花費、訓練時間 +20%、2 人口', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/orderofthedragon.json', note: '目錄已正確（17.0 Landsknecht 100 食物 200 黃金、16.1 鍍金重步兵 180 食物 40 黃金 25 秒）。斥候不是鍍金單位，仍是 65 食物、1 人口。' },
    ],
  }),
  ot: spec('ot', '鄂圖曼', {
    start: { food: 200, wood: 200, gold: 100, stone: 50 },
    startNote: '開局 200 食物、200 木材、100 黃金、50 石頭（比標準多 50 木、50 石），6 村民、1 斥候、5 隻羊，人口 7/10，維齊爾經驗與點數 0（Fandom、第三季更新說明、職業開局）。',
    // startWorkers / extraPop / ownedSheep / tcStartDelay / startFood / villagerBatch 都是預設值：6 村民 + 1 斥候、5 隻羊，村民 50 食物 20 秒。
    noBoar: true,
    // dropoff 用預設：雙塔伊斯蘭學院雖兼作磨坊，但它是升代地標，不能當投放點另外蓋；
    // 引擎只取清單中第一個可用的投放點（磨坊），列進去也不會用到，反而可能被當成營地蓋出來。
    trickles: [
      // 穆罕默德皇家軍械庫（Fandom 頁）：免費產出攻城武器，弩砲 75 秒一台
      { building: 'mehmed-imperial-armory', perMin: {}, max: 1, unit: { id: 'springald', every: 75 }, note: '升城堡地標，完成後每 75 秒免費 1 台弩砲（最快的攻城武器；衝車 87 秒、投石機 180 秒…）。' },

      // 軍事學校：免費持續產出，時間 4.75 倍；近似成每座每 71 秒 1 名長槍兵（15 × 4.75）。上限 = 目前時代數
      { building: 'military-school', perMin: {}, max: 4, maxByAge: [1, 2, 3, 4], unit: { id: 'spearman', every: 71 }, note: '軍事學校（150 木 100 石、30 秒）：每座每 71 秒免費 1 名長槍兵；搜尋決定蓋幾座、何時蓋。' },

      { building: 'sultanhani-trade-network', perMin: { gold: 84 }, max: 1, mulOn: [{ on: 'trade-bags', mul: 1.4 }], note: '蘇丹客棧（升封建地標）完工送 3 名駐守商人，每名每分鐘 28 黃金（17.0 從 26 提高）= 84；再訓練的駐守商人用 support（最多再 7 名）；貿易袋 +40%。只能當升代地標蓋，不能和雙塔伊斯蘭學院同時存在。' },
    ],
    notMilitary: ['trader', 'imam'],
    // 蘇丹客棧：再訓練商人駐守（60 木 60 金、30 秒），每名每分鐘 28 黃金，連同送的 3 名最多 10 名（Fandom Sultanhani Trade Network 頁）
    support: [{ unit: 'trader', at: ['sultanhani-trade-network'], max: 7, perMin: { gold: 28 }, requires: 'sultanhani-trade-network', mulOn: [{ on: 'trade-bags', mul: 1.4 }] }],
    trade: { goldMul: [{ on: 'trade-bags', mul: 1.4 }] },
    // 維齊爾：村民 2、升封建 15、城堡 45、帝王 100 經驗；每點門檻 60/100/150/240/320（之後 320），最多 5 點
    vizier: { villager: 2, age: { 2: 15, 3: 45, 4: 100 }, points: [60, 100, 150, 240, 320], max: 5 },
    // 帝國議會：第 1 層的選擇都沒有經濟效果，用一項「任選一項」代表；目錄的安納托利亞丘陵效果寫反（×0.9），整項取代
    extraItems: [
      { id: 'vizier-tier-1', name: '帝國議會第 1 層（任選一項）', age: 1, cost: {}, other: { vizier: 1 }, time: 0, producedBy: [] },
      { id: 'anatolian-hills', name: '安納托利亞丘陵', age: 1, cost: {}, other: { vizier: 1 }, time: 0, producedBy: [] },
      { id: 'extensive-fortifications', name: '廣泛防禦工事', age: 1, cost: {}, other: { vizier: 1 }, time: 0, producedBy: [] },
      { id: 'pax-ottomana', name: '鄂圖曼和平', age: 1, cost: {}, other: { vizier: 1 }, time: 0, producedBy: [] },
      // 貿易袋（議會第 4 層，要任一第 3 層）：商人黃金 +40%、蘇丹客棧 +40%（Fandom Trade Bags 頁）；目錄沒有生產建築
      { id: 'trade-bags', name: '貿易袋', age: 1, cost: {}, other: { vizier: 1 }, time: 0, producedBy: [] },
    ],
    civTechs: [
      { id: 'vizier-tier-1', instant: true },
      { id: 'anatolian-hills', instant: true, requires: 'vizier-tier-1' },
      { id: 'extensive-fortifications', instant: true, requires: 'vizier-tier-1' },
      { id: 'pax-ottomana', instant: true, requires: ['anatolian-hills', 'extensive-fortifications'] },
      { id: 'trade-bags', instant: true, requires: 'pax-ottomana' },
    ],
    triggers: [
      // 鐵匠鋪／大學影響範圍：軍事生產在封建、城堡、帝王 +20/30/40%；近似成蓋好鐵匠鋪後軍事建築都在範圍內
      { on: 'blacksmith', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop'], timeByAge: [1, 1 / 1.2, 1 / 1.3, 1 / 1.4] }] },

      // 雙塔伊斯蘭學院：長出 4 叢野果（每叢 250 是推測）、採集 +50%，就近投放，採完 120 秒長回來
      { on: 'twin-minaret-medrese', site: { id: 'medrese-berries', label: '雙塔伊斯蘭學院野果（4 叢）', kind: 'berry', amount: 1000, units: 4, dist: 9, mul: 1.5, regrow: 120 } },
      // 安納托利亞丘陵：首都送 12 隻羊、採金採石 +15%
      { on: 'anatolian-hills', gather: { gold: 1.15, stone: 1.15 }, grant: { sheep: 12 } },
      // 廣泛防禦工事：城鎮中心與防禦建築 -20%
      { on: 'extensive-fortifications', costMul: [{ ids: ['town-center', 'outpost', 'keep', 'stone-wall', 'stone-wall-gate', 'stone-wall-tower'], mul: 0.8 }] },
      // 鄂圖曼和平：240 秒內村民生產 +75%
      { on: 'pax-ottomana', duration: 240, villagerTime: 1 / 1.75 },
    ],
    bonuses: [
      { text: '開局多 50 木材與 50 石頭（200/200/100/50），6 村民 + 1 斥候', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Ottomans_(Age_of_Empires_IV)', note: '木材由第三季官方說明證實（150→200）；石頭由 Fandom、Steam 玩家與所有職業開局（5 人採 50 石後蓋 100 石的軍事學校）三方一致。' },
      { text: '軍事與科技建築 -30%（17.0 從 40% 改 30%）：兵營、靶場、馬廄、鐵匠鋪、碼頭 105 木，攻城工坊 175、大學 315', modeled: 'yes', source: SRC.off, note: '用目錄價格。軍事學校（150 木 100 石）、市場與地標不打折。' },
      { text: '軍事學校（150 木 100 石、30 秒）：免費持續產出選定單位，時間 4.75 倍；上限 = 目前時代數（黑暗 1、封建 2…），軍事校園 +1', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Military_School', note: '搜尋決定蓋幾座（上限 = 目前時代數，軍事校園 +1 沒有建模）；近似成每座每 71 秒免費 1 名長槍兵（15 秒 × 4.75），算進軍隊目標與目標後出兵。實際可以選弓箭手、西帕希、梅赫特、阿肯吉等。' },
      { text: '鐵匠鋪／大學影響範圍：軍事生產建築在封建、城堡、帝王 +20/30/40% 生產速度', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/ottomans.json', note: '近似成蓋好鐵匠鋪後所有軍事建築都在範圍內，生產時間 ÷1.2/1.3/1.4（封建/城堡/帝王）；伊斯坦堡天文台的加成沒有建模。' },
      { text: '雙塔伊斯蘭學院（升封建地標，400 食 200 金、190 秒）：兼作磨坊，長出 4 叢野果、採集 +50%，採完 120 秒再生', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Twin_Minaret_Medrese', note: '完成後家附近多 4 叢野果（每叢 250 是推測，沒有來源）、採集 +50%、就近投放，採完 120 秒長回來。' },
      { text: '蘇丹客棧（升封建地標，400 食 200 金、190 秒）：送 3 名駐守商人，每名每分鐘 28 黃金，最多 10 名', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Sultanhani_Trade_Network', note: '送的 3 名固定 84 黃金/分；搜尋決定再訓練幾名駐守（0～7，60 木 60 金、30 秒，每名 28/分，佔 1 人口）。貿易袋（議會第 4 層，1 點）讓客棧與商人 +40%，搜尋決定選不選。送的 3 名商人是否佔人口未證實（當作不佔）。' },
      { text: '帝國議會：訓練單位與升級得到維齊爾經驗（村民 2、升封建 15、城堡 45、帝王 100），每點需 60/100/150/240/320 經驗（之後每點 320），最多 5 點（伊斯坦堡皇宮 +4、單位經驗 ×2）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Imperial_Council', note: '經驗與點數已計入（村民 2、升代 15/45/100；每點門檻分開算，未證實）；選擇不需建築、立即生效，下一層要先在上一層選過一項。第 1 層的選擇都沒有經濟效果，用「任選一項」代表；伊斯坦堡皇宮 +4 點、單位經驗表（只有 Fandom）未計入。' },
      { text: '安納托利亞丘陵（議會第 2 層）：首都城鎮中心送 12 隻羊，村民採金、採石 +15%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Anatolian_Hills', note: '已取代目錄的錯誤效果：送 12 隻羊（併入城鎮中心旁的羊）、採金採石 +15%；第 2 層，要先選過第 1 層。' },
      { text: '鄂圖曼和平（議會第 3 層）：240 秒內村民生產 +75%（20 → 11.4 秒）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Pax_Ottomana', note: '目錄沒有，已補上：240 秒內村民 20 → 11.4 秒；第 3 層（要先選過第 2 層）。廣泛防禦工事（第 2 層，城鎮中心與防禦建築 -20%）也一起補上。' },
      { text: '穆罕默德皇家軍械庫（升城堡地標）：免費產出攻城武器，時間較長', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mehmed_Imperial_Armory', note: '近似成完成後每 75 秒免費 1 台弩砲（Fandom 頁的最短時間），算進目標後出兵；在鐵匠鋪範圍內 ÷1.3/1.4 沒有套上去。' },
      { text: '不能採野豬', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/ottomans.json' },
    ],
  }),
  ru: spec('ru', '羅斯', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候，城鎮中心旁 5 隻自有羊，人口 7/10，沒有特殊資源，賞金從 0 起算（Fandom、aoe4analyzer）。',
    // 賞金一階（+10% 食物採集）約在 2:30–3:00 達成，之後整場至少一階，所以直接固定 ×1.1
    gather: { all: 1, sheep: 1.1, berry: 1.1, hunt: 1.1, farm: 1.1, wood: 1, gold: 1, stone: 1 },
    // 賞金：羊、鹿、野豬每 1 食物另得 0.1 黃金
    huntGold: 0.1,
    // 克里姆林宮 20×20 格影響範圍（4×4 建築往外 8 格）內的伐木場投放木材 +20%：等同採集 ×1.2，只算範圍內的伐木點（Fandom Kremlin 頁）
    zones: [{ building: 'kremlin', res: 'wood', mul: 1.2, radius: 8, half: 2 }],
    dropoff: { food: ['hunting-cabin'], wood: ['lumber-camp'], gold: ['mining-camp'], stone: ['mining-camp'] },
    trickles: [
      { building: 'hunting-cabin', perMin: { gold: 16 }, max: 3, note: '每座約 16 黃金/分（Fandom：20–25 棵樹 × 每棵 0.7–0.75），用賞金零階的數字，因為封建前付克里姆林宮黃金時還沒到一階。投放用的小屋也算在內，最多算 3 座（假設，後來蓋在鹿群旁的小屋標到的樹少）。賞金一、二、三階 +10/25/40% 與全部小屋 300（三階 420）/分的上限未建模。' },
      { building: 'high-trade-house', perMin: { gold: 200 }, max: 1, note: '地標，只有升城堡選它時才會蓋；不佔樹、不算進上限；Fandom 實測一般 190–250/分，取 200。每 60 秒生 1 隻鹿未建模。' },
    ],
    // 交易者是經濟單位；戰鬥僧侶是宗教單位（撿聖物、治療、加成），都不拿來自動湊軍隊
    notMilitary: ['trader', 'warrior-monk'],
    triggers: [
      // 克里姆林宮：每 80 秒 1 張券（可累積），每次徵召付 30 食物換 2 名民兵戟兵（Fandom Kremlin 頁）
      { on: 'kremlin', every: 80, eachUnits: { 'militia-halberdier': 2 }, eachCost: { food: 30 } },
      // 三一修道院：戰鬥僧侶 -50%
      { on: 'abbey-of-the-trinity', costMul: [{ ids: ['warrior-monk'], mul: 0.5 }] },

      // 金門：完成時 1 張、之後每 50 秒 1 張交易券；每張可以賣 100 食物／木材／石頭換 150 黃金，或花 100 黃金買 150 食物／木材／石頭（Fandom The Golden Gate 頁）
      { on: 'the-golden-gate', grant: { exchange: 1 }, every: 50, each: { exchange: 1 } },
    ],
    bonuses: [
      { text: '開局 200 食物、200 木材、100 黃金，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Rus', note: 'Fandom 與 aoe4analyzer 一致，沒有官方修正記錄；第 13 季職業開局 0:30 兩座狩獵小屋＋一棟房屋剛好花完 200 木材。' },
      { text: '賞金：村民從羊、鹿、野豬每採 10 食物另得 1 黃金，並累計成賞金', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Patch_11.1.1201', note: '這是現行規則（11.1.1201 起），不是舊版比例；引擎採到就入帳，實際是投放時入帳，只差一趟。擊殺不給黃金。' },
      { text: '賞金門檻 100／400／1000：食物採集 +10／15／20%（16.2.10604 從 5／10／15% 提高）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/rus.json', note: '從開局就固定一階 ×1.1，套在羊、野果、獵物、農田；前 1000 動物食物其實是基礎速率（多算約 100 食物），二階（4000 動物食物）、三階未建模。是否含獵物、漁船資料沒寫明（信心中）。' },
      { text: '狩獵小屋取代磨坊（75 木材、35 秒），是食物投放點，也能訓練斥候', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/rus.json', note: '目錄已列狩獵小屋為斥候的生產建築，第二隻斥候可以不佔城鎮中心。' },
      { text: '狩獵小屋依 5 格內的樹木每 30 秒產金，每棵樹只算給第一座小屋；賞金一／二／三階 +10／25／40%，全部小屋上限 300（三階 420）黃金/分', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Hunting_Cabin', note: '每座固定 16 黃金/分、最多算 3 座，不隨賞金階級增加。每棵 0.7–0.75 黃金/分只有 Fandom 估算（未驗證，官方沒有公式）；15.1.6970 已砍 15%。' },
      { text: '木堡（150 木材、60 秒）與克里姆林宮影響範圍內，伐木場、城鎮中心投放木材 +20%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/rus.json', note: '克里姆林宮 8 格內的伐木點投放 +20%（近似成採集 ×1.2），搜尋決定蓋在哪條林線旁或農田區（城鎮中心旁散樹）；木堡沒有計入。' },
      { text: '克里姆林宮徵召民兵：每 80 秒 1 張券，30 食物換 2 名民兵戟兵，城堡時代起再加 1 名民兵手砲兵（16.1.9737）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Kremlin', note: '每 80 秒 1 張券（完成後要等 80 秒才有第一張，可累積），每次徵召付 30 食物、要有空人口，換 2 名民兵戟兵（Fandom Kremlin 頁）。城堡時代起多 1 名民兵手砲兵，但目錄沒有這個單位，沒有建模。' },
      { text: '金門：完成時 1 張、之後每 50 秒 1 張交易券，100 食物／木材／石頭換 150 黃金，或 100 黃金換 150', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/The_Golden_Gate', note: '完成時 1 張、之後每 50 秒 1 張交易券（Fandom The Golden Gate 頁）；每張立刻用掉：缺黃金時賣 100 真正多出來的食物／木材／石頭換 150 黃金，黃金多時花 100 黃金買 150 當下最缺的資源，都不划算就跳過（實際可以累積交易券）。' },
      { text: '高級貿易所（封建→城堡）：產金是狩獵小屋的 5 倍，不佔樹、不算上限；每 60 秒生 1 隻鹿，也是食物投放點', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/High_Trade_House', note: '選它升城堡後固定 200 黃金/分（Fandom 實測 190–250，單一來源；遊戲說明 +400%，Fandom 寫 4 倍），不隨賞金增加。生鹿與投放點未建模。' },
      { text: '三一修道院：所有修道院的戰鬥僧侶 -50%（20 食物、100 黃金）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/rus.json', note: '蓋好後戰鬥僧侶花費 ×0.5。' },
      { text: '什一稅倉（帝王，500 黃金、60 秒）：修道院每個聖物每分鐘再產 40 食物、40 木材、10 石頭', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/rus.json', note: '已建模：什一稅倉是經濟科技（搜尋決定研不研），研究後修道院裡每個聖物每分鐘再產 40 食物、40 木材、10 石頭（寶塔裡的不算）。聖物數量看頁面「聖物與聖地」設定。' },
      { text: '羅斯漁船：150 木材、46 秒、2 人口，深水 1.42、岸邊 1.2825 食物/秒，滿載直接入庫不用回碼頭', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Lodya_Fishing_Boat', note: '頁面「捕魚」開啟時：羅斯用羅斯漁船，深水魚每秒 1.42、不用回碼頭（目錄的費用、時間、人口）；Fandom 寫黑暗時代就能訓練，引擎照 Fandom（目錄標封建）。岸邊魚、改裝成其他船沒有建模。' },
    ],
  }),
  sco: spec('sco', '蘇格蘭', {
    start: { food: 200, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 200 食物、200 木材、100 黃金、0 石頭，6 村民、1 吉利服斥候、1 頭免費高地牛（0 人口）與 5 隻羊，人口 7/10；沒有預建建築（AoE4 Analyzer；200 木材另有 4 份職業建造順序的 0:00 塔屋算術佐證）。',
    // startWorkers 用預設 { villager: 6 }；吉利服斥候佔 1 人口，高地牛 0 人口、不是工人
    extraPop: 1,
    ownedSheep: 5,
    // 塔屋（175 木材、60 秒）+15 人口，職業開局 0:00 就蓋，取代第一座房屋。思凱塔是否也 +15 沒有來源，先不算。
    popBuildings: { 'tower-house': 15 },
    // 高地牛：每頭吃野果每分鐘 30 食物、0 人口、不需攜帶、不耗野果。上限 9 頭（含開局免費的 1 頭）。
    // 免費那頭掛在首都城鎮中心（開局就存在，搜尋不會另外蓋），其餘 8 頭平均攤到 2 座塔屋，每座 4 頭 = 120 食物/分。
    trickles: [
      { building: 'capital-town-center', perMin: { food: 30 }, max: 1, note: '開局免費的 1 頭高地牛（0 人口、不花錢），0:00 走去野果，從開局就算每分鐘 30 食物（實際約 0:05 起）。Fermtouns and Pastures +20% 沒計入。' },
      { building: 'tower-house', perMin: { food: 120 }, max: 2, note: '近似：每座塔屋 4 頭訓練出的高地牛（4 × 30），最多 2 座，加上免費那頭 = 上限 9。4 頭牛的 300 食物 100 黃金用 costOverride 併進塔屋花費，塔屋完工就滿收入（實際每 25 秒在塔屋多 1 頭、還要走到野果）。高地地標每座 +4 上限、Fermtouns and Pastures +20% 都沒計入。' },
    ],
    costOverride: {
      // 目錄塔屋是 175 木材（正確）；這裡把 4 頭高地牛（各 75 食物 25 黃金）併進塔屋，搭配 trickles 的 120 食物/分（同馬利牧牛場的做法）。
      // 代價：職業 0:00 就蓋的塔屋要等湊滿 300 食物，人口可能要先補一座房屋。目錄或引擎能訓練高地牛之後要拿掉。
      'tower-house': { food: 300, wood: 175, gold: 100 },
      // kirkman-3 是燉魚池送的那 1 名教士，目錄卻當成集結大廳 0 成本、2 秒可訓練的單位；套成 kirkman-2 的 150 黃金、30 秒，避免免費洗教士（kirkman-3 的人口仍是 0）。
      kirkman: { gold: 150, time: 30 },
    },
    // 目錄把教士、商人標成軍隊
    notMilitary: ['kirkman', 'trader'],
    // 集結大廳蓋好給 1 次集結、三湖瞭望台給 3 次（研究集結科技要花 1 次）
    grants: { 'mustering-hall': { muster: 1 }, 'three-loch-lookout': { muster: 3 } },
    triggers: [
      // 艾爾斯修道院（Fandom Abbey of the Isles 頁）：聖物所在的一棟生產與研究速度 +135%；近似：聖物搬到最早蓋好的軍事或科技建築
      { on: 'abbey-of-the-isles', prod: [{ at: ['barracks', 'archery-range', 'stable', 'siege-workshop', 'blacksmith', 'university', 'mustering-hall'], single: true, time: 1 / 2.35, research: 1 / 2.35 }] },

      // 集結（Fandom Mustering Hall 頁）：花 1 次集結次數＋食物，立刻送一批（預設批量）
      { on: 'muster-pikemen', units: { pikeman: 8 } },
      { on: 'muster-cateran', units: { cateran: 8 } },
      { on: 'muster-gallowglass', units: { gallowglass: 7 } },
      { on: 'muster-border-reivers', units: { 'border-reiver': 12 } },
      { on: 'muster-mangonels', units: { mangonel: 2 } },
      { on: 'muster-tacksmen', units: { tacksman: 7 } },
      // 每座低地／高地地標讓同區科技半價
      { on: 'stone-of-destiny', costMul: [{ ids: ['lions-duty', 'stew-ponds', 'we-stand-alone'], mul: 0.5 }] },
      { on: 'snowdoun-gate', costMul: [{ ids: ['lions-duty', 'stew-ponds', 'we-stand-alone'], mul: 0.5 }] },
      { on: 'dhun-eideann', costMul: [{ ids: ['lions-duty', 'stew-ponds', 'we-stand-alone'], mul: 0.5 }] },
      { on: 'abbey-of-the-isles', costMul: [{ ids: ['caterans-trail', 'clan-traditions', 'feuds-aside'], mul: 0.5 }] },
      { on: 'tower-of-skye', costMul: [{ ids: ['caterans-trail', 'clan-traditions', 'feuds-aside'], mul: 0.5 }] },
      { on: 'three-loch-lookout', costMul: [{ ids: ['caterans-trail', 'clan-traditions', 'feuds-aside'], mul: 0.5 }] },

      // 華萊士號召（鐵匠鋪科技）：步兵生產 +50%
      { on: 'wallaces-rally', prod: [{ cls: 'infantry', time: 1 / 1.5 }] },
      // 斯諾當門：免費每 3 名一組產步兵；長槍兵一組 80 秒（Fandom Snowdoun Gate 頁；集結大廳科技每項 +15% 沒有建模）
      { on: 'snowdoun-gate', every: 80, eachUnits: { pikeman: 3 } },

      // 命運之石：之後在家附近完成的建築（含農田）返還 30% 花費為黃金
      { on: 'stone-of-destiny', refund: { res: 'gold', pct: 0.3 } },
{ on: 'fermtouns-and-pastures', gather: { farm: 1.2 } }],
    civTechs: [
      { id: 'muster-pikemen', requires: 'mustering-hall' },
      { id: 'muster-cateran', requires: 'mustering-hall' },
      { id: 'muster-gallowglass', requires: 'mustering-hall' },
      { id: 'muster-border-reivers', requires: 'mustering-hall' },

      { id: 'wallaces-rally' },
{ id: 'fermtouns-and-pastures' }],
    // 教士：在命運之石、修道院訓練（150 黃金、30 秒、1 人口），放下魚池後每分鐘 40 黃金（Fandom Kirkman 頁）；魚池上限 = 1 + 低地地標數（命運之石、斯諾當門、杜恩艾丁各 +1）
    support: [{ unit: 'kirkman', at: ['stone-of-destiny', 'monastery'], max: 4, perMin: { gold: 40 }, maxFrom: { base: 1, per: ['stone-of-destiny', 'snowdoun-gate', 'dhun-eideann'] } }],
    bonuses: [
      { text: '開局 200 食物 / 200 木材 / 100 黃金（木材 +50），6 村民 + 1 斥候 + 5 隻羊，另送 1 頭高地牛（0 人口）', modeled: 'yes', source: 'https://aoe4analyzer.app/guide/scots', note: '資源與人口已計入；免費高地牛當作首都城鎮中心的每分鐘 30 食物，從 0:00 起算。木材 200 有 Niki45nk、Mango、BeastyQT 的 0:00 塔屋（175 木材）算術佐證；食物 200、黃金 100 只有 AoE4 Analyzer 一個來源（未驗證）。' },
      { text: '塔屋取代前哨：175 木材、60 秒、+15 人口，可訓練高地牛與吉利服', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/scots.json', note: '+15 人口已計入。為了扣高地牛的花費，塔屋花費改成 300 食物 175 木材 100 黃金（含 4 頭牛），所以引擎不會像職業開局那樣 0:00 就蓋。塔屋本身的訓練佇列沒有建模；思凱塔也算塔屋，是否 +15 人口沒有來源，未計入。' },
      { text: '高地牛吃野果：每頭每分鐘 30 食物，不需攜帶、不耗野果；75 食物 25 黃金、25 秒、0 人口，上限 9 頭（含免費那頭），每座高地地標 +4', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/scots.json', note: '免費 1 頭 + 每座塔屋 4 頭（花費併進塔屋）、最多 2 座 = 9 頭。塔屋完工就一次滿 4 頭，沒有逐頭 25 秒的訓練；高地地標 +4 上限（13 / 17 / 21）沒計入；牛佔用的野果村民仍可採，可能重複計算。免費牛算在上限內（建造順序 1 + 5 = 6/6）。' },
      { text: 'Fermtouns and Pastures（磨坊，封建，100 木材 250 黃金、45 秒）：農田 +20%、高地牛 +20%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/scots.json', note: '農田 +20% 已計入；高地牛的收入是固定的 trickles，+20% 沒有套上去。Corvinus1 實測每頭 37 食物/分，比 36 多 1，原因不明。' },
      { text: '教士魚池：教士（150 黃金、30 秒、1 人口）放下魚池後每分鐘 40 黃金，附近工人採集 +10%（燉魚池後 +20%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Kirkman', note: '搜尋決定訓練幾名教士（命運之石或修道院，150 黃金、30 秒、1 人口），每名放魚池後每分鐘 40 黃金（Fandom Kirkman 頁）。魚池上限：每座低地地標 +1（Fandom 命運之石、斯諾當門頁），基礎值沒有寫，依職業只有命運之石就放 2 座推為 1。附近村民採集 +10% 的範圍沒有公開，沒有建模；燉魚池沒有建模。' },
      { text: '命運之石（低地封建地標）：8 格內建造的建築返還 30% 建造費為黃金（地標與城牆除外）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Stone_of_Destiny', note: '近似：命運之石完成後，家附近（距城鎮中心 12 格內）完成的非地標建築與農田返還 30% 花費為黃金；遠處的投放點不算。' },
      { text: '艾爾斯修道院（高地封建地標）：聖物所在的一座軍事或科技建築生產與研究速度 +135%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Abbey_of_the_Isles', note: '聖物所在的一棟生產與研究速度 +135%（時間 ÷2.35，Fandom Abbey of the Isles 頁）；近似：聖物一直放在最早蓋好的那一棟軍事或科技建築（實際可以搬，搬動冷卻 2 分鐘）。7 格治療光環不影響規劃。' },
      { text: '集結大廳（封建，50 木材）：一次性集結 8 長槍兵 / 8 卡特蘭 / 9 高地弓兵（600 食物）、7 加洛格拉斯 / 12 邊境掠奪者 / 2 投石車（1350 食物，城堡）、7 塔克斯曼（1350 食物，帝王），各花 1 次集結次數', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mustering_Hall', note: '集結當成要付食物＋1 次集結次數的選項（長槍兵 8 名 600 食物、卡特蘭 8 名 600、加洛格拉斯 7 名 1350、邊境掠奪者 12 名 1350，Fandom Mustering Hall 頁），搜尋決定用哪一種；集結次數已計入（集結大廳 +1、三湖瞭望台 +3）。範圍內軍事建築的層級（多給次數、-20% 花費）、三湖瞭望台的批量加大、高地弓兵（要第 2 層）沒有建模。' },
      { text: '高地 / 低地科技每蓋一座同區地標再半價', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/scots.json', note: '每座低地地標（命運之石、斯諾當門、杜恩艾丁）讓獅子之責、燉魚池、獨自堅守半價，每座高地地標（艾爾斯修道院、斯凱塔、三湖瞭望台）讓卡特蘭之路、氏族傳統、拋開恩怨半價（Fandom Scots 頁）。' },
      { text: '斯諾當門（低地城堡地標）：免費每 3 名一組產步兵，約每分鐘 190 資源；每項集結大廳科技 +15% 速度', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Snowdoun_Gate', note: '每 80 秒免費 3 名長槍兵（Fandom Snowdoun Gate 頁的長槍兵一組時間；可改選重步兵 104 秒、卡特蘭 85 秒、高地弓兵 76 秒）。集結大廳每項科技 +15% 生產速度、敵人進入範圍 +15% 沒有建模；華萊士號召不影響它。' },
      { text: '華萊士號召（鐵匠鋪，封建，100 食物 250 黃金、60 秒）：步兵生產速度 +50%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/scots.json', note: '鐵匠鋪科技（目錄 100 食物、250 黃金、60 秒），搜尋決定研不研；研究後步兵生產時間 ÷1.5。' },
    ],
  }),
  sen: spec('sen', '戰國大名', {
    startNote: '標準開局 200 食物、150 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，人口 7/10；沒有預建祭典、農舍，也沒有開局屋台（Fandom 戰國大名頁與三份職業開局的資源算術；15.1–17.0 未改）。',
    // startWorkers / extraPop / ownedSheep / tcStartDelay / startFood 都是預設值：6 村民 + 1 斥候、5 隻羊。
    // 生存技巧 16.1.9737 起不再免費，所以打獵倍率回到 1（gather 用預設）；目錄的 survival-techniques（農舍、25 木材 75 黃金、打獵 ×1.15）可照常研究。
    // 農舍＝房屋＋磨坊（目錄標 house，+10 人口用 housePop 預設），鍛造場＝採礦場＋鐵匠鋪；祭典（100 木材）是四種資源的投放點兼市場、生產屋台。
    // 黃金把祭典排第一：職業開局 0:00 就把祭典蓋在金礦上。石頭用鍛造場。清酒釀造所（城堡地標）排最後，只在已蓋好時當投放點。
    dropoff: {
      food: ['farmhouse', 'matsuri'],
      wood: ['lumber-camp', 'matsuri'],
      gold: ['matsuri', 'forge', 'sake-brewery'],
      stone: ['forge', 'matsuri', 'sake-brewery'],
    },
    byproducts: [
      { from: 'gold', to: 'stone', ratio: 0.2, note: '銀礦開採：投放 ≥5 黃金另得 20% 石頭' },
      { from: 'stone', to: 'gold', ratio: 0.2, note: '銀礦開採：投放 ≥5 石頭另得 20% 黃金' },
    ],
    // 旅館（升封建經濟地標）完成 +60 人口；目錄 pop 是 0
    popBuildings: { ryokan: 60 },
    // 屋台在目錄是祭典訓練的單位（125 木材、15 秒、0 人口），引擎把它當成村民蓋 15 秒的被動收入點，不檢查祭典。
    // 黑暗時代上限 3，每升一代 +1（max 只能填一個數，用 3）。
    // 每分鐘 = min(60, 10 + 標記的食物來源)：野豬 +40、鹿 +4、羊／野果 +2。職業開局 3 台約 60／35／30，取平均 40。
    trickles: [
      // 北條氏大名宅邸（Fandom Daimyo Estate 頁）：第 1/2/3 座 125/250/500 木材＋石頭；三座後徵兵
      { building: 'hojo-clan-daimyo-estate', perMin: {}, max: 3, note: '大名宅邸（北條氏）：搜尋決定蓋幾座；每蓋好一座下一座貴一倍。' },

      { building: 'yatai', perMin: {}, max: 3, as: 'building', requires: 'matsuri', sources: { base: 10, per: { sheep: 2, berry: 2, deer: 4, boar: 40, farm: 4 }, farmTech: 'yatai-farm-gather', trader: { every: 215, food: 50, step: 0.05, max: 0.3, radius: 10, at: 'matsuri' } }, note: '收入照 Fandom Yatai 頁：每台每分鐘 10 + 10 格內每叢野果／每隻羊 2、每隻鹿 4、野豬 40、農田 4（要研究屋台農田採集）；每台挑一個沒被佔的最好採集點，採完就不算。每產 215 食物派一名商人回祭典 +50 食物、祭典 10 格內採集 +5%（最多 +30%）。屋台是在祭典訓練的單位（125 木材、15 秒、0 人口），引擎近似成村民蓋的建築；原本：每台平均 40 食物／分（基礎 10＋來源加成，上限 60）；每產 215 食物派出的食物商人 +50 食物未計入' },
    ],
    // 目錄把徵兵單位寫成 0 費用、0 秒；這裡用「每座宅邸每 360 秒一包」近似三座共用的 120 秒計時（費用 0 × size 仍是 0）。
    // 種子島、騎馬武士徵兵目錄已是城堡時代（minAge 3）。
    batches: {
    },
    notMilitary: ['trader'],
    triggers: [
      // 每蓋好一座宅邸，下一座花費 ×2（125 → 250 → 500）
      { on: 'hojo-clan-daimyo-estate', costMul: [{ ids: ['hojo-clan-daimyo-estate'], mul: 2 }] },
      // 同氏族 3 座後：立刻 1 點徵兵、之後每 120 秒 1 點，1 點換 3 名長槍兵（Fandom Daimyo Estate 頁）
      { on: 'hojo-clan-daimyo-estate', minCount: 3, every: 120, delay: 0, eachUnits: { 'spearman-levy': 3 } },

      // 清酒釀造所：5 塊無限金蓆，每塊 1 人、每秒 1.35 黃金（不吃採礦科技）
      { on: 'sake-brewery', site: { id: 'sake-mats', label: '清酒釀造所金蓆（5 塊）', kind: 'gold', amount: Infinity, units: 5, dist: 9, rate: 1.35 } },
    ],
    bonuses: [
      { text: '標準開局：200 食物、150 木材、100 黃金，6 村民、1 斥候、5 隻羊，人口 7/10', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Sengoku_Daimyo', note: '三份職業開局的算術吻合：100 起始黃金＋30 採集＝第一次買木材的 130 黃金；起始 150 木材剛好蓋祭典（100）和農舍（50）。沒有預建建築、沒有開局屋台。' },
      { text: '屋台：祭典訓練（125 木材、15 秒、0 人口），每分鐘 10 食物＋標記來源（野豬 +40、鹿／魚 +4、羊／野果 +2），上限 60（屋台農田採集後 80），直接入庫；上限 3 台，每升一代 +1', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Yatai', note: '當成村民蓋 15 秒的被動收入點，每台固定 40 食物／分、最多 3 台，不要求先有祭典。未計：走到定點（0.875 格／秒）與架設的時間、封建後第 4 台以上、農田 +4 科技。40 是依職業開局（野豬 60、鹿 35、羊＋野果 30）估的平均值；標記半徑 aoe4world 寫 2 格、Fandom 寫 10 格，未定。收入直接入庫沒有官方明說。16.1.10056 起基礎 20→10。鹿與野豬位置開局全開，屋台可直接走去。' },
      { text: '屋台食物商人與祭典光環：每產 215 食物（17.0 前 250）派出一名，回祭典 +50 食物、10 格內村民採集 +5%（最多 +30%）、祭典 +250 生命', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '已計入（Fandom Yatai、Matsuri 頁）：每產 215 食物派一名商人回祭典 +50 食物，祭典 10 格內村民採集 +5%／名、最多 +30%；光環以祭典實際蓋的位置算（它是投放點，引擎通常蓋在金礦或林線旁）。商人走路時間、離開範圍保留 15 秒、祭典 +250 生命沒有建模。' },
      { text: '祭典：0:00 就能蓋（100 木材、20 秒），四種資源的投放點兼黑暗時代市場（用 130 黃金買 100 木材）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/sengoku.json', note: '只建模投放點（黃金優先用祭典，所以第二座金礦也會蓋祭典而不是 50 木材的鍛造場）。市場交易沒有建模：職業開局封建前會用黃金買 2～3 次木材來做屋台，模擬只能先採 125 木材，屋台會比實戰晚。' },
      { text: '銀礦開採：投放黃金另得 20% 石頭，投放石頭另得 20% 黃金', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/sengoku.json', note: '需一次投放 ≥5，村民攜帶量 10 以上一定成立；模擬按採集量即時加。清酒釀造所的金蓆黃金是否也觸發，沒有來源。' },
      { text: '農舍取代房屋＋磨坊（50 木材、15 秒、+10 人口、食物投放點）；鍛造場取代採礦場＋鐵匠鋪（50 木材、20 秒）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Farmhouse' },
      { text: '俵／竹細工／札差取代手推車與野果科技：每級攜帶量 +3、移動 +7%、採野果 +25%（需依序研究）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Tawara', note: '目錄原本俵沒有效果、竹細工與札差移動 ×0.9，已修正為每級攜帶 +3、移動 ×1.07、野果 ×1.25；沒有檢查研究順序。' },
      { text: '生存技巧不再免費（16.1.9737 起；25 木材、75 黃金、農舍研究，打獵 +15%）', modeled: 'yes', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: 'aoe4world 文明總覽仍寫「預設已研究」，那是舊資料。' },
      { text: '旅館（升封建經濟地標，400 食物、200 黃金、190 秒）：+60 人口，附近單位非戰鬥時每 6 秒回 4 生命', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Ryokan', note: '只建模人口；省下 6 座農舍（300 木材）。' },
      { text: '清酒釀造所（升城堡經濟地標）：生成 5 塊無限的金蓆，每塊 1 名村民、每秒 1.35 黃金，不吃採礦科技', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Sake_Brewery', note: '完成後在家附近多 5 個金蓆採集位，每人每秒 1.35 黃金、不吃採礦科技、不用走路投放。' },
      { text: '大名宅邸：同氏族第 1／2／3 座 125／250／500 木材＋石頭（一氏族 3 座＋第二氏族 2 座）；三座後每 120 秒 1 點徵兵（劍狩像 60 秒），1 點換 3 長槍／2 薙刀／4 弓足輕／2 種子島／2 槍騎兵／1 騎馬武士', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Daimyo_Estate', note: '用北條氏：搜尋決定蓋幾座（第 1/2/3 座 125/250/500 木材＋石頭），三座後立刻 1 點、之後每 120 秒 1 點徵兵，每點免費 3 名長槍兵（Fandom Daimyo Estate 頁；也可以換 2 薙刀武士、4 弓足輕、2 種子島、2 槍騎兵或 1 騎馬武士）。第二氏族、宅邸科技與大名單位沒有建模。' },
      { text: '漁村：漁船便宜 25%（56 木材）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/sengoku.json', note: '目錄已折價，僅水圖。' },
    ],
  }),
  tug: spec('tug', '圖格魯克', {
    startNote: '開局 200 食物、150 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊，另有 1 頭免費工作象（0 人口），人口 7/10；沒有特殊資源（Fandom 文明頁、aoe4guides 職業選手流程）。',
    // start、startWorkers { villager: 6 }、extraPop 1（斥候）、ownedSheep 5、tcStartDelay 0、startFood 0、orchardBush 250 都是預設值。
    // 開局那頭工作象不佔人口，用 freeDropoffs 表示：第一個投放點免費。
    freeDropoffs: 1,
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.3, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    // 沒有磨坊、伐木場、採礦場：四種資源都投到工作象（或城鎮中心）。
    dropoff: { food: ['worker-elephant'], wood: ['worker-elephant'], gold: ['worker-elephant'], stone: ['worker-elephant'] },
    // 工作象經濟：村民在城鎮中心、工作象投放時 +5%。這兩種是圖格魯克僅有的陸上投放點，所以等於全部村民收入 ×1.05。
    depositBonus: { res: ['food', 'wood', 'gold', 'stone'], mul: 1.05 },
    trickles: [
      { building: 'tughlaqabad-fort', perMin: { food: 72 }, max: 1, note: '巴卡爾總督：要塞旁每座農田或房屋每分鐘 12 食物（一級）；假設圍了 6 座（上限約 12 座），不檢查旁邊真的有房屋或農田。總督選擇與要塞升級不在目錄裡，選巴卡爾就不能選木爾坦。' },
      { building: 'tughlaqabad-fort', perMin: {}, max: 6, note: '圖格魯克要塞（封建，400 石頭、135 秒）：完成後依策略任命總督，搜尋決定蓋幾座。' },
    ],
    notMilitary: ['trader', 'imam', 'healer-elephant'],
    triggers: [
      // 希薩學院：每位在任總督每分鐘 70 食物 + 70 黃金（Fandom Hisar Academy 頁：每 15 秒各 17.5）
      { on: 'hisar-academy', perGovernor: { food: 70, gold: 70 } },

      // 信仰圓頂：伊瑪目 150 → 85 黃金、醫療象 220 → 155 黃金
      { on: 'dome-of-the-faith', costMul: [{ ids: ['imam'], res: ['gold'], mul: 85 / 150 }, { ids: ['healer-elephant'], res: ['gold'], mul: 155 / 220 }] },

      // 工作象經濟科技：各 +5% 採集，投放加成 5% → 10/15/20%，合起來收入 ×1.10、×1.095、×1.091
      { on: 'woven-baskets', gather: { all: 1.1 } },
      { on: 'carrying-frames', gather: { all: 1.095 } },
      { on: 'elephant-harnesses', gather: { all: 1.091 } },
{ on: 'compound-of-the-defender', costMul: [{ kind: 'building', res: ['stone'], mul: 0.75 }] }],
    civTechs: [
      { id: 'shahi-walls', requires: 'tughlaqabad-fort', repeat: 6 },
      { id: 'red-brick-bastions', requires: 'shahi-walls', repeat: 6 },
      { id: 'tughlaqabad-fort-benefactor', requires: ['red-brick-bastions'], repeat: 6 },

      { id: 'woven-baskets' },
      { id: 'carrying-frames', requires: 'woven-baskets' },
      { id: 'elephant-harnesses', requires: 'carrying-frames' },
    ],
    // 目錄缺的工作象科技（數字只有 Fandom）；手推車、林業、求生技巧的效果從英格蘭複製，價格是標準價 ×1.2 推算
    extraItems: [
      // 要塞升級（Fandom 各科技頁）：每座各自升級，總督效果跟著升級
      { id: 'shahi-walls', name: '沙希城牆', age: 2, cost: { stone: 250 }, time: 30, producedBy: ['tughlaqabad-fort'] },
      { id: 'red-brick-bastions', name: '紅磚稜堡', age: 2, cost: { gold: 75, stone: 275 }, time: 60, producedBy: ['tughlaqabad-fort'] },
      { id: 'tughlaqabad-fort-benefactor', name: '要塞恩主', age: 3, cost: { gold: 50, stone: 200 }, time: 60, producedBy: ['tughlaqabad-fort'] },

      { id: 'woven-baskets', name: '編織籃', age: 2, cost: { food: 90, wood: 90, gold: 225 }, time: 5, producedBy: ['worker-elephant'] },
      { id: 'carrying-frames', name: '背架', age: 3, cost: { food: 120, wood: 120, gold: 375 }, time: 5, producedBy: ['worker-elephant'] },
      { id: 'elephant-harnesses', name: '象具', age: 4, cost: { food: 240, wood: 240, gold: 600 }, time: 5, producedBy: ['worker-elephant'] },
      { id: 'wheelbarrow', name: '手推車', age: 1, cost: { wood: 60, gold: 180 }, time: 5, producedBy: ['worker-elephant'], effectsFrom: { civ: 'en', id: 'wheelbarrow' } },
      { id: 'forestry', name: '林業', age: 1, cost: { food: 30, gold: 60 }, time: 5, producedBy: ['worker-elephant'] },
      { id: 'survival-techniques', name: '求生技巧', age: 1, cost: { wood: 30, gold: 90 }, time: 5, producedBy: ['worker-elephant'], effectsFrom: { civ: 'en', id: 'survival-techniques' } },
    ],
    // 總督（Fandom Tughlaqabad Fort 與各總督頁）：每座要塞任命一位（每位只能一座），效果依要塞等級 1～4（第 4 級要防衛者大院）
    governors: {
      fort: 'tughlaqabad-fort',
      upgrades: ['shahi-walls', 'red-brick-bastions', 'tughlaqabad-fort-benefactor'],
      level4Requires: 'compound-of-the-defender',
      options: {
        multan: { label: '木爾坦總督', villagerSpeed: [0.15, 0.3, 0.5, 0.75] },
        uch: { label: '烏奇總督', techCost: [0.15, 0.2, 0.25, 0.35] },
        bhakkar: { label: '巴克爾總督', perBuilding: [12, 20, 28, 28], stonePct4: 0.2, radius: 6 },
      },
    },
    bonuses: [
      { text: '開局標準 200 食物、150 木材、100 黃金，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Tughlaq_Dynasty', note: '職業流程 0:00–0:35 剛好花完 150 木材（2 頭買的工作象 + 1 棟房屋），與 150 木材吻合。' },
      { text: '開局多 1 頭免費工作象（0 人口），直接當野果或金礦的投放點', modeled: 'approx', source: 'https://aoe4guides.com/builds/cQ9LjFfmsY5XCVtfhXQS', note: '用 freeDropoffs 1：第一個工作象投放點免費。官方與 Fandom 都沒寫，只由 6 位 aoe4guides 作者的流程一致推得，中高可信度。' },
      { text: '採野果 +30%、攜帶 +3', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/tughlaq.json', note: '沒有磨坊，野果叢維持 250 食物。' },
      { text: '不能採野豬', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/tughlaq.json' },
      { text: '工作象取代磨坊、伐木場、採礦場：25 食物 50 木材、瞬間出現、不佔城鎮中心佇列、0 人口、最多 20 頭', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Worker_Elephant', note: '目錄有兩個同 id 的工作象（單位與建築），引擎只留下建築版本：村民走到採集點「蓋」0 秒，投放點在村民抵達時就緒，等於假設大象跟村民同時從城鎮中心以 1.125 格/秒走過去；不佔城鎮中心時間。20 頭上限未檢查。15.2.7380 起只能收視野內的羊。' },
      { text: '工作象經濟：村民在城鎮中心、工作象投放的資源 +5%', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/tughlaq.json', note: '用 depositBonus 1.05 套到四種資源（含城鎮中心的羊與農田）；碼頭只算食物，16.2.10604 起漁船不再適用。' },
      { text: '工作象經濟科技：編織籃（封建）、背架（城堡）、象具（帝王），各 +5% 採集，投放加成升到 10/15/20%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Woven_Baskets', note: '目錄沒有這三項，已在 extraItems 補上（花費 90/90/225、120/120/375、240/240/600 食/木/金、5 秒，只有 Fandom）；效果近似成收入 ×1.10／×1.095／×1.091（等於全疊 ×1.155／1.265／1.38），搜尋決定研不研。' },
      { text: '手推車、林業、求生技巧、專業斥候在工作象研究', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Wheelbarrow_(Age_of_Empires_IV)', note: '已在 extraItems 補上手推車（60 木 180 金、5 秒，Fandom）、林業與求生技巧（標準價 ×1.2 推算、5 秒）；效果用英格蘭的同名科技。專業斥候沒有經濟效果，沒有加。' },
      { text: '博學：所有科技貴 20% 但 5 秒完成（砲座、要塞升級除外）', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/tughlaq.json', note: '目錄已是加價後的價格與 5 秒（如紡織 60 食物 120 黃金），不要再乘一次。' },
      { text: '圖格魯克巴德要塞（封建，400 石頭、135 秒）任命總督：巴卡爾讓旁邊的農田與房屋產食物（12/20/28 每分鐘）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Governor_of_Bhakkar', note: '用 trickles 假設一級、圍 6 座，每分鐘 72 食物；要塞當食物投放點、四級另產 20% 石頭都沒建模。數字只有 Fandom 引用遊戲文字。' },
      { text: '其他總督：木爾坦城鎮中心生產 +15/30/50/75%、烏奇科技 -15/20/25/35%、阿傑梅爾每 20 秒免費生 1 名埃米爾戰士', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Governor_of_Multan', note: '要塞（400 石頭、135 秒）由搜尋決定蓋幾座，依序任命木爾坦（城鎮中心生產 +15/30/50/75%）、烏奇（科技 -15/20/25/35%）、巴克爾（6 格內每座農田／房屋每分鐘 12/20/28 食物，第 4 級另給 20% 石頭）；等級靠每座要塞的升級（沙希城牆 250 石、紅磚稜堡 75 金 275 石、要塞恩主 50 金 200 石，第 4 級要防衛者大院），數字都來自 Fandom。巴克爾假設要塞蓋在農田區（範圍內最多約 19 座）。阿傑梅爾（免費埃米爾戰士）、賈洛爾（騎兵生命）、塞赫萬（聖物）、蘇丹宮殿直接任命第 4 級沒有建模。' },
      { text: '希薩學院：每名在任總督每分鐘 +70 食物、+70 黃金', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/tughlaq.json', note: 'trickles 固定算 1 名總督，也不檢查有沒有要塞；實際隨要塞數變動，最多 6 名。' },
      { text: '防衛者大院：建築石頭花費 -25%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Patch_16.2.10604', note: '蓋好後所有建築的石頭 -25%（16.2.10604 從 20% 改成 25%，Fandom 文明頁還寫 20%；要塞 400 → 300 石）；包不包含城鎮中心未經測試。' },
      { text: '信仰圓頂：伊瑪目與醫療象便宜 65 黃金（85 金、150 食 155 金）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/tughlaq.json', note: '近似成蓋好信仰圓頂後所有地方訓練都便宜（實際只有在信仰圓頂訓練才便宜）。' },
    ],
  }),
  vik: spec('vik', '維京', {
    start: { food: 0, wood: 200, gold: 100, stone: 0 },
    startNote: '開局 0 食物、200 木材、100 黃金、0 石頭，6 名村民、1 名斥候、城鎮中心旁 5 隻羊，人口 7/10、村民容量 10（AoE4 Analyzer 維京指南；多份職業建造順序的開局算式佐證）。',
    // 6 村民、1 斥候、5 隻羊、無延遲皆為預設值。
    // 北方遷徙：村民免費自動招募（每座城鎮中心 22 秒，沿用目錄時間），村民容量 = 10 + 10 × 長屋；額外城鎮中心不加村民容量（但仍 +10 人口）。
    // 村民免費自動招募，村民容量 = 10 + 10 × 長屋（與人口分開）
    freeVillagers: { base: 10, perHouse: 10 },
    housePop: 25,
    trickles: [
      { building: 'bee-skeps', perMin: { gold: 50 }, max: 6, as: 'building', note: '蜂箱是長屋附件（科技，不是建築）：每座長屋只能裝一個附件，蜂箱最多 6 座，每座 +50 黃金/分。引擎會當成村民蓋的建築（200 木材、20 秒），不檢查是否有空的長屋。完成 6 個附件的法爾克薩迦後降為 160 木材、沃爾娃祝福 +15%（60 秒）都沒有計入。' },
      { building: 'konungr-hall', perMin: { food: 25 }, max: 1, note: '每 60 秒 10 食物 + 每座長屋 5 食物；以 3 座長屋估成固定 25 食物/分。' },
      { building: 'kongens-d-r-cathedral', perMin: { gold: 100 }, max: 1, note: '每 30 秒每座範圍內長屋 12.5 黃金（= 25 黃金/分/座），範圍慢慢擴大；以 4 座長屋在範圍內估成固定 100 黃金/分。' },
    ],
    // 目錄沿用通用村民 50 食物；維京城鎮中心的生產變體是 0 食物、22 秒。
    costOverride: { villager: { food: 0 } },
    notMilitary: ['trader', 'monk', 'volur'],
    triggers: [
      // 鮑格堡壘：兵營工作快 25%（兵營科技 -15% 與免費升級沒有建模）
      { on: 'baugr-fort', prod: [{ at: ['barracks'], time: 0.8, research: 0.8 }] },

      // 農莊（長屋附件）：長屋旁 2 塊田、比農田快 50%，長屋就是投放點；每研究一次多 2 個位置
      { on: 'farmstead', site: { id: 'farmstead', label: '農莊田', kind: 'berry', amount: Infinity, units: 2, dist: 6, mul: 1.5, farmLike: true } },

      // 邦迪伐木者：每名邦迪每分鐘 +10 木材，上限 250
      { on: 'bondi-forester', unitIncome: { unit: 'bondi', perMin: { wood: 10 }, cap: 250 } },
      // 約弗薩迦：選了之後村民採 2500 獵物食物，完成時村民採集 +10%、攜帶 +5
      { on: 'jofurr-saga-complete', gather: { all: 1.1 }, carry: 5 },
    ],
    civTechs: [
      { id: 'farmstead', repeat: 6 },

      { id: 'bondi-forester' },
      { id: 'jofurr-saga', tc: true },
    ],
    milestones: [{ id: 'jofurr-saga-complete', label: '約弗薩迦完成（採滿 2500 獵物食物）', kind: 'hunt', amount: 2500, after: 'jofurr-saga' }],
    bonuses: [
      { text: '開局 0 食物、200 木材、100 黃金、0 石頭，6 村民、1 斥候、5 隻羊', modeled: 'yes', source: 'https://aoe4analyzer.app/guide/vikings', note: '沒有官方、Fandom 或 aoe4world 數字，需在遊戲 0:00 確認。AoE4 Analyzer 列「村民 6、羊 5、木材 200、黃金 100」且不顯示 0；0 食物是由建造順序推得（Swaggy、MicroMind、Beasty 都要先採 150 食物才出邦迪，Swaggy 在 1:28 前沒人伐木卻在 0:22 與 1:06 共花 200 木材）。' },
      { text: '北方遷徙：每座城鎮中心免費自動招募村民，每名 22 秒', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/vikings.json', note: '用 costOverride 把村民食物改成 0，時間沿用目錄 22 秒；Swaggy 的計時 6@0:00、9@1:06、12@2:12 證實 22 秒。法爾克薩迦的 20 秒沒有計入。' },
      { text: '村民容量 10 + 每座長屋 10，額外城鎮中心不加容量', modeled: 'yes', source: 'https://aoe4guides.com/builds/IaV1n6h50nePBYTFO01X', note: '起始容量 10 由 MicroMind（20 村民、1 長屋時卡住）與 Swaggy（17 村民時「離上限 3」）兩份建造順序佐證。schema 沒有村民容量欄位，所以村民只受人口上限（10 × 城鎮中心 + 25 × 長屋）限制，每座長屋多放了 15 名村民。' },
      { text: '長屋取代房屋：150 木材、30 秒，+25 人口；預設不是投放點', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/vikings.json', note: '首都城鎮中心 +10 人口，所以人口上限 = 10 × 城鎮中心 + 25 × 長屋；長屋另給的 +10 村民容量見上一條。' },
      { text: '蜂箱（長屋附件）：200 木材、20 秒，每座 +50 黃金/分，最多 6 座', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/vikings.json', note: '用被動收入計入，但當成村民蓋的建築，不佔用長屋的附件位（每座長屋只有一個附件位，與農莊、鐵匠鋪、牧場與織布共用）。法爾克薩迦降價與沃爾娃祝福 +15%（只有 Fandom，低可信度）沒有計入。' },
      { text: '農莊（長屋附件）：200 木材、2 秒，長屋旁 2 塊田、採集比農田快 50%，長屋變成食物投放點，最多 6 座', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Farmstead', note: '搜尋決定蓋幾座（1～6，每座 200 木材、2 秒，要有閒著的長屋）；每座給 2 個農田位置，用農田速率 ×1.5、就近投放。1.5 倍只見於 Fandom 與官方文明頁（中等可信度）；磨坊農業科技有沒有套用未證實，引擎有套用。' },
      { text: '鐵匠鋪、牧場與織布（長屋附件，封建）：各 100 木材 100 黃金、20 秒，各限 1 座，免費自動研究三級攻擊／護甲科技', modeled: 'no', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/vikings.json', note: 'Fandom Smithy／Pasture and Loom 頁：各 100 木材 100 黃金、20 秒、各限一座，完成後「慢慢」自動研究維京專屬的攻擊／護甲科技（封建、城堡、帝王各一項），但研究時間沒有公開，所以不建模（不猜）。' },
      { text: '國王大廳（封建經濟地標）：每 60 秒 10 食物 + 每座長屋 5 食物；一次性 800 食物召喚 1 + 長屋數名盾女', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/vikings.json', note: '以 3 座長屋估成固定 25 食物/分；召喚盾女的能力目錄沒有，盾女上限 1 + 長屋數也沒有建模。' },
      { text: '邦迪伐木者（長屋科技，封建，100 食物 250 黃金、30 秒）：每名邦迪 +10 木材/分，上限 250/分', modeled: 'yes', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/vikings.json', note: '長屋科技（目錄 100 食物、250 黃金、30 秒）；研究後每名已訓練的邦迪每分鐘 +10 木材，上限 250。陣亡不扣。' },
      { text: '薩迦：約弗（村民採 2500 野豬／鹿／岸邊魚食物）村民採集 +10%、攜帶 +5；法爾克（6 個長屋附件）招募 22 → 20 秒、附件 -20%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/technologies/vikings.json', note: '約弗已計入：選擇後（城鎮中心、0 秒）村民採 2500 獵物食物（羊、鹿、野豬）完成，之後村民採集 +10%、攜帶 +5。其他薩迦能不能同時選不明，沒有限制；法爾克（6 個長屋附件）未建模。' },
      { text: '邦迪黑暗時代就能在長屋訓練（慢 25%）；鮑格堡壘讓兵營工作快 25%、兵營科技 -15%、免費升級硬化邦迪與狂戰士', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/vikings.json', note: '鮑格堡壘讓兵營生產與研究時間 ×0.8 已計入；邦迪黑暗時代在長屋訓練（目錄已列長屋）、兵營科技 -15%、免費升級硬化邦迪與狂戰士沒有建模。' },
      { text: '聖林與金堂免費自動產生狂戰士；沃爾娃（封建，50 食物 100 黃金、25 秒，城鎮中心）在聖物上建立聖林，最多 3 座', modeled: 'no', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/vikings.json', note: '聖林要沃爾娃在聖物上建立（Fandom Sacred Grove 頁還是預告頁、數字未公開），需要聖物系統，暫不建模。' },
      { text: '帝王地標各 +10 人口上限（210），民族教會（900 黃金）再 +10（220）；國王之門大教堂每 30 秒每座範圍內長屋 12.5 黃金；里克茨尼克城堡完工送 10 名斯科訥弩手', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/buildings/vikings.json', note: '只有什一稅計入：以 4 座長屋在範圍內估成固定 100 黃金/分；Fandom 舊文字是 10 黃金（中等可信度）。人口上限固定 200，210/220 沒有計入；免費弩手沒有建模。' },
    ],
  }),
  zx: spec('zx', '朱熹傳承', {
    start: { food: 150, wood: 200, gold: 50, stone: 0 },
    startNote: '開局 150 食物、200 木材、50 黃金、0 石頭，5 村民、1 名免費監工、1 斥候、城鎮中心旁 5 隻羊，人口 7/10（Fandom 朱熹遺產頁、AoE4 Analyzer；木材由職業流程算帳確認）。',
    startWorkers: { villager: 5 },
    // 監工 + 斥候各佔 1 人口；監工不採集，不算工人
    extraPop: 2,
    landmarkCostMul: 0.85,
    // 村莊 +40 人口（100 木材、15 秒，上限 3 座）；房屋照常 +10。引擎自動補人口只蓋房屋，村莊要用「蓋 N 座村莊」目標才會蓋。
    popBuildings: { village: 40 },
    byproducts: [
      // 稅收：非城鎮中心投放點的投放量 8%，扣掉監工收稅的延遲與城鎮中心投放 → 0.07
      { from: 'all', to: 'gold', ratio: 0.07, note: '稅金 8%，要監工走回城鎮中心或江南塔才入庫；近似成全部採集的 7% 直接變黃金。' },
      // 廬山書院：收稅時另得 20% 的食物（0.07 × 0.2）
      { from: 'all', to: 'food', ratio: 0.014, requires: 'mount-lu-academy', note: '廬山書院：稅金的 20% 另以食物收回，是否為額外收入未證實。' },
    ],
    // 碼頭工作效率 +10%：漁船 30 → 27.3 秒（目錄沒有套用）
    costOverride: { 'fishing-boat': { time: 27.3 } },
    // 監工是經濟單位；江南塔的四種援軍是累積花費後免費生成，不能訓練
    notMilitary: ['imperial-official', 'trader', 'monk', 'provincial-levy', 'city-guard', 'ranged-specialists', 'imperial-retinue'],
    // 朝代：宋（經濟與人口建築木材 -30%、解鎖糧倉）、元（所有單位 -10%，含村民）、明（特色單位傷害，不影響規劃）
    dynasty: [2, 3, 4],
    triggers: [
      // 冥想花園（Fandom Meditation Gardens 頁）：8 格內野果、金礦、石礦每 30 秒存量 +5%（樹 +2.5%），共 12 次；之後每個點一次給剩餘量的 5%
      { on: 'meditation-gardens', bounty: { radius: 8, every: 30, times: 12, pct: 0.05, treePct: 0.025, finalPct: 0.05 } },

      // 江南塔（Fandom Jiangnan Tower 頁）：範圍內軍事建築與軍隊花費第一支 2400、之後每支 +500（最多 8400、12 支）送一支省軍（4 長槍兵 + 3 騎兵）
      { on: 'jiangnan-tower', spendArmy: { first: 2400, step: 500, cap: 8400, max: 12, units: { spearman: 4, horseman: 3 } } },

      { on: 'dynasty-2', costMul: [{ ids: ['house', 'village', 'mill', 'lumber-camp', 'mining-camp', 'farm', 'granary', 'dock'], res: ['wood'], mul: 0.7 }] },
      { on: 'dynasty-3', costMul: [{ kind: 'unit', mul: 0.9 }], replaces: ['dynasty-2'] },
      { on: 'dynasty-4', replaces: ['dynasty-2', 'dynasty-3'] },
    ],
    zones: [{ building: 'granary', res: 'food', mul: 1.1, radius: 7.5, half: 2, max: 3, requires: 'dynasty-2', stack: true, farmOnly: true }],
    // 監工：開局 1 名，督導研究與生產建築快 150%；只能在城鎮中心訓練，城鎮中心要一直出村民，所以不再加訓
    officials: { unit: 'imperial-official', start: 1, at: [], cost: { food: 100, gold: 50 }, time: 20, max: 4, work: 2.5 },
    // 寶塔（Fandom Pagoda 頁）：元朝解鎖，150 木材，最多 3 座，各放 1 個聖物，每分鐘 100 黃金、62 食物、62 木材、25 石頭；不吃什一稅倉
    relicPagoda: { building: 'pagoda', requires: 'dynasty-3', perMin: { gold: 100, food: 62, wood: 62, stone: 25 }, max: 3 },
    bonuses: [
      { text: '開局 150 食物、200 木材、50 黃金，只有 5 村民，另有 1 名免費監工與 1 斥候（人口 7/10）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Zhu_Xi%27s_Legacy', note: '木材 200 由 Beasty S10／S13 流程算帳精確吻合；150 食物與 50 黃金只有 Fandom 與 AoE4 Analyzer（可能同源）加上 Yufka 收稅時間推算，沒有遊戲內畫面確認（中信度）。監工只佔人口，督導與收稅見下兩條。' },
      { text: '監工督導投放建築：每次投放 +20%（不能督導城鎮中心、碼頭、市場、地標，17.0 起也不能督導據點）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/abilities/zhuxi.json', note: '和中國相同的通用規則：沒在督導研究或生產的監工各督導一種有投放建築的資源（照採集人數由多到少），投放 +20%；城鎮中心投放不算。以前近似成「有磨坊後全部食物 +20%」，已改掉。' },
      { text: '稅收：村民投放資源的 8% 存成稅金（漁船 4%），生產單位 +2、研究科技 +24，由監工（攜帶 40）收回城鎮中心或江南塔', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-16-1-9737-and-yue-feis-legacy-dlc-release-preview/', note: '近似成全部採集量的 7% 從 0:00 起直接入庫黃金（職業選手約 2:00 才第一次收稅，約 40 黃金，與此相符）；單位／科技稅、收稅路程與每座建築 20 秒冷卻都沒算，也沒扣監工離開磨坊收稅時少掉的督導。城鎮中心投放不產生稅。實際每分鐘收到多少稅沒有來源，0.07 是估計值。' },
      { text: '監工督導生產／研究建築：工作效率 +150%（地方巡察後 +300%）', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Imperial_Official', note: '開局那名監工的督導已計入：開始研究或生產時有空就督導，時間 ÷2.5（地方巡察後 ×4 沒有建模）。' },
      { text: '監工只能在城鎮中心訓練（100 食物、50 黃金、20 秒），同時最多 4 名（帝國朱印 +2、高級行政 +2）', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/units/zhuxi.json', note: '只用開局那 1 名；在城鎮中心加訓會中斷村民生產（違反硬性規則），所以引擎不加訓。' },
      { text: '唐朝（開局）：地標花費 -15%（封建 340／170、城堡 1020／510、帝王 2040／1020，奇觀不打折）', modeled: 'yes', source: 'https://ageofempires.fandom.com/wiki/Jiangnan_Tower', note: '目錄是未打折的 400／200，靠 landmarkCostMul 0.85。蓋齊兩座一代地標進入宋朝後折扣會消失（Fandom 朝代頁，未實測）；引擎每個時代只蓋一座地標，所以一直是唐朝。' },
      { text: '建造快 100%（防禦建築 +50%），碼頭工作效率 +10%', modeled: 'approx', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/zhuxi.json', note: '目錄建造時間已加速（房屋 7.5 秒、城鎮中心 82.5 秒、地標 95／110／125 秒）。碼頭只把漁船改成 27.3 秒，其他船與碼頭科技沒加速；引擎也不模擬捕魚，只影響目標裡的漁船。' },
      { text: '村莊 +40 人口（100 木材、15 秒，上限 3 座），開局就能蓋', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Village_(Age_of_Empires_IV)', note: '用 popBuildings 計入；引擎自動補人口只蓋房屋，村莊要另外下「蓋村莊」目標，而且不限制 3 座。職業選手 0:00–1:00 蓋第一座村莊取代房屋。' },
      { text: '廬山書院：監工收稅頻率加倍（每座建築冷卻 20 → 10 秒），另把稅金的 20% 以食物收回', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Mount_Lu_Academy', note: '書院完成後全部採集量 ×0.014 另給食物（0.07 × 0.2）；冷卻減半沒算。食物是額外收入還是從黃金換來未證實（中信度）。' },
      { text: '宋朝（兩座一代地標）：經濟與人口建築木材 -30%，解鎖糧倉（範圍內農田 +10%／座，最多 +30%）；元朝：所有單位 -10%，解鎖寶塔；明朝：特色單位傷害 +20%', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-patch-9-2-628/', note: '搜尋決定要不要補蓋同時代的另一座地標；宋朝經濟與人口建築（房屋、村莊、磨坊、伐木場、採礦場、農田、糧倉、碼頭）木材 -30%，元朝所有單位（含村民）-10%，只有最新朝代有效。糧倉同中國的近似。寶塔沒有元朝前置。' },
      { text: '冥想花園：8 格內野果、金礦、石礦每 30 秒存量 +5%（最多 +60%，樹 +30%），330 秒時與採完時各再給 5%', modeled: 'approx', source: 'https://ageofempires.fandom.com/wiki/Meditation_Gardens', note: '已計入（Fandom Meditation Gardens 頁）：完成時與之後每 30 秒，8 格內野果、金礦、石礦存量 +5%（樹 +2.5%），共 12 次；330 秒後每個點一次給剩餘量的 5%。採完時給最大量 5% 的部分沒有建模。地標蓋在城鎮中心旁，通常只罩到散樹與近處野果。' },
      { text: '江南塔：範圍內軍事建築與單位累積花費 2400 起（每支 +500，上限 8400）免費生成一支援軍', modeled: 'approx', source: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/', note: '已計入（Fandom Jiangnan Tower 頁）：軍事建築與軍隊的花費累積到 2400（之後每支 +500、最多 8400、12 支）就免費送一支省軍（4 長槍兵 + 3 騎兵）。近似：所有軍事花費都算在範圍內（實際只有 6×6 範圍內的軍事建築與它們出的兵），其他三種援軍沒有建模。' },
      { text: '火藥大師：黑暗時代免費取得化學', modeled: 'na', source: 'https://raw.githubusercontent.com/aoe4world/data/main/civilizations/zhuxi.json', note: '沒有經濟效果；目錄仍把化學當成要花 200 食物、650 黃金的大學科技。' },
    ],
  }),
}

/** 17.0 對全部文明的改動（顯示用） */
export const GLOBAL_BONUSES: Bonus[] = [
  { text: '城鎮中心建造時間 150 → 165 秒', modeled: 'yes', source: SRC.off },
  { text: '多人建造：時間 = 基礎 × 3 ÷ (人數 + 2)', modeled: 'yes', source: SRC.fandomVillager, note: 'Fandom 公式，官方沒有公開；與職業建造順序的時間吻合。' },
  { text: '交資源往返：有效速率 = 攜帶 ÷ (攜帶 ÷ 速率 + 2 × 距離 ÷ 移動速度)', modeled: 'yes', source: SRC.fandomResource },
  { text: '砍樹：每棵樹先砍倒，樹上有效速率 0.70（伐木技術 0.725）', modeled: 'yes', source: SRC.fandomResource },
  { text: '獵物攜帶量 25', modeled: 'yes', source: SRC.fandomVillager, note: '只有 Fandom 寫，資料庫沒有欄位。' },
]

export function civSpec(abbr: string): CivSpec {
  return SPECS[abbr] ?? spec(abbr, abbr, { bonuses: [{ text: '沒有單獨的規格，使用標準開局', modeled: 'no', source: SRC.old }] })
}

export const CIV_ZH: Record<string, string> = Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, v.zh]))
