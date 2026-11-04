// 各文明的經濟規格。每一條加成都標出「已計入 / 近似 / 未建模」與來源。
// 費用、時間一律讀目錄（aoe4world 17.0.x 資料），這裡只放目錄沒有的經濟規則。

import type { Bundle, Res } from './types.ts'

export const SRC = {
  off: 'https://www.ageofempires.com/news/age-of-empires-iv-update-17-0/',
  a4w: 'https://github.com/aoe4world/data/tree/main/civilizations',
  fandomVillager: 'https://ageofempires.fandom.com/wiki/Villager_(Age_of_Empires_IV)',
  fandomResource: 'https://ageofempires.fandom.com/wiki/Resource_(Age_of_Empires_IV)',
  fandomArabia: 'https://ageofempires.fandom.com/wiki/Dry_Arabia',
  old: '舊版模擬器的數字，17.0 資料裡查不到',
} as const

export type Modeled = 'yes' | 'approx' | 'no'

export interface Bonus {
  text: string
  modeled: Modeled
  source: string
  note?: string
}

export interface CivSpec {
  abbr: string
  zh: string
  start: Bundle
  startNote: string
  villagers: number
  /** 開局非村民的人口（斥候、神職人員、監工、可汗） */
  extraPop: number
  /** 開局就在城鎮中心旁的羊 */
  ownedSheep: number
  /** 主要工人的目錄 id */
  worker: string
  /** 主要工人的上限（金朝鄉騎 20），之後改訓 fallbackWorker */
  workerCap: number
  fallbackWorker?: string
  /** 工人採集倍率（相對普通村民） */
  workerGather: number
  /** 依時代覆蓋村民訓練時間（法蘭西城鎮中心工作效率） */
  trainTimeByAge?: number[]
  /** 維京：免費自動招募，村民容量 = base + perHouse × 長屋 */
  freeVillagers?: { base: number; perHouse: number }
  popModel: 'houses' | 'max'
  housePop: number
  carry: number
  berryCarry: number
  /** 採集倍率：all 套在全部；其他再乘上去 */
  gather: { all: number; sheep: number; berry: number; hunt: number; farm: number; wood: number; gold: number; stone: number }
  /** 磨坊附近農田依時代的額外倍率（英格蘭） */
  farmByAge?: number[]
  /** 樹上的實際採集速率（含砍樹時間） */
  woodAtTree: number
  woodByAge?: number[]
  /** 木材採到就入庫（聖殿騎士團） */
  woodInstant: boolean
  noBoar: boolean
  /** 有磨坊時每叢野果的存量 */
  orchardBush: number
  byproducts: { from: Res; to: Res; ratio: number }[]
  /** 打獵時另得黃金的比例（羅斯賞金） */
  huntGold: number
  landmarkCostMul: number
  /** 開局已擁有的建築（例如智慧宮） */
  prebuilt: string[]
  /** 投放點偏好順序 */
  dropoff: Record<Res, string[]>
  /** 持續被激勵的村民數與倍率（神聖羅馬神職人員） */
  inspire?: { villagers: number; mul: number }
  /** 指定地標完成後全部食物採集倍率（近似：假設採集點都在光環內） */
  landmarkAura?: { building: string; res: Res | 'all'; mul: number }[]
  /** 黃金時代：範圍內建築數（近似為全部非農田建築）→ 採集倍率 */
  goldenAge?: { buildings: number; mul: number }[]
  /** 蓄水池：花 stone 換採集倍率（拜占庭一級水） */
  cistern?: { id: string; mul: number }
  /** 被動收入建築：id -> 每分鐘各資源 */
  trickles: { building: string; perMin: Partial<Bundle>; max?: number }[]
  bonuses: Bonus[]
}

const STD: Bundle = { food: 200, wood: 150, gold: 100, stone: 0 }
const DROP: Record<Res, string[]> = {
  food: ['mill'],
  wood: ['lumber-camp'],
  gold: ['mining-camp'],
  stone: ['mining-camp'],
}

function spec(abbr: string, zh: string, patch: Partial<CivSpec>): CivSpec {
  return {
    abbr,
    zh,
    start: { ...STD },
    startNote: '標準開局 200 食物、150 木材、100 黃金、6 村民、1 斥候（Fandom）。',
    villagers: 6,
    extraPop: 1,
    ownedSheep: 5,
    worker: 'villager',
    workerCap: 200,
    workerGather: 1,
    popModel: 'houses',
    housePop: 10,
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
    trickles: [],
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
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    prebuilt: ['house-of-wisdom'],
    goldenAge: [{ buildings: 10, mul: 1.15 }],
    bonuses: [
      ...ISLAMIC_BERRY(),
      ORCHARD,
      { text: '在智慧宮研究側翼升代，不需要村民蓋地標', modeled: 'yes', source: SRC.a4w, note: '假設開局已有智慧宮。' },
      { text: '黃金時代一階：範圍內 10 棟建築，採集 +15%', modeled: 'approx', source: SRC.a4w, note: '把所有非農田建築都算在智慧宮範圍內；二、三階未建模。' },
      { text: '貿易、碼頭折扣', modeled: 'no', source: SRC.a4w },
    ],
  }),
  ay: spec('ay', '阿尤布', {
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    prebuilt: ['house-of-wisdom'],
    goldenAge: [{ buildings: 10, mul: 1.1 }],
    bonuses: [
      ...ISLAMIC_BERRY(),
      ORCHARD,
      { text: '在智慧宮研究側翼升代，不需要村民', modeled: 'yes', source: SRC.a4w, note: '假設開局已有智慧宮；各側翼的額外效果未建模，只用目錄的花費和時間。' },
      { text: '黃金時代一階：採集 +10%', modeled: 'approx', source: SRC.old, note: '把所有非農田建築都算在範圍內。' },
    ],
  }),
  by: spec('by', '拜占庭', {
    start: { ...STD, stone: 100 },
    startNote: '開局另有 100 石頭和橄欖油（舊版記錄，17.0 資料未列開局資源）。',
    cistern: { id: 'cistern', mul: 1.1 },
    bonuses: [
      { text: '蓄水池一級水：範圍內採集 +10%', modeled: 'approx', source: SRC.a4w, note: '用開局 100 石頭蓋第一座，假設主要採集點都在範圍內。17.0 把五級水從 26% 改成 24%，更高水位未建模。' },
      { text: '每棟建築返還石頭', modeled: 'no', source: SRC.a4w },
      { text: '橄欖油與傭兵', modeled: 'no', source: SRC.a4w },
    ],
  }),
  ch: spec('ch', '中國', {
    bonuses: [
      { text: '一般建築建造快 100%、防禦快 50%', modeled: 'yes', source: SRC.a4w, note: '目錄的建造時間已經是加速後的數字。' },
      { text: '監工收稅（每投放資源產生黃金稅）', modeled: 'no', source: SRC.a4w },
      { text: '朝代加成（同時代兩座地標）', modeled: 'no', source: SRC.a4w },
    ],
  }),
  de: spec('de', '德里蘇丹國', {
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.25, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    orchardBush: 350,
    bonuses: [
      ...ISLAMIC_BERRY(),
      ORCHARD,
      { text: '所有科技免費但研究很慢', modeled: 'yes', source: SRC.a4w, note: '用目錄的 0 花費與研究時間；學者加速未建模。' },
    ],
  }),
  en: spec('en', '英格蘭', {
    farmByAge: [1.2, 1.25, 1.3, 1.3],
    bonuses: [
      { text: '農田便宜 50%', modeled: 'yes', source: SRC.a4w, note: '目錄農田 37 木材。' },
      { text: '磨坊附近的農田依時代 +20/25/30/30%', modeled: 'approx', source: SRC.a4w, note: '有磨坊後所有農田都算在範圍內。' },
      { text: '營火讓附近打獵 +10%', modeled: 'no', source: SRC.a4w },
    ],
  }),
  fr: spec('fr', '法蘭西', {
    trainTimeByAge: [19, 20 / 1.15, 20 / 1.2, 20 / 1.25],
    bonuses: [
      { text: '城鎮中心工作效率逐代提升（+15/15/20/25%）', modeled: 'approx', source: SRC.a4w, note: '黑暗時代用目錄的 19 秒；之後解讀為各時代相對 20 秒的效率：17.4、16.7、16.0 秒。' },
      { text: '投放建築便宜 50%', modeled: 'yes', source: SRC.a4w, note: '目錄已折價。' },
      { text: '經濟科技便宜 35%', modeled: 'yes', source: SRC.a4w, note: '目錄已折價。' },
    ],
  }),
  gol: spec('gol', '金帳汗國', {
    popModel: 'max',
    dropoff: { food: ['ger'], wood: ['ger'], gold: ['ger'], stone: ['ger'] },
    bonuses: [
      { text: '開局人口上限全滿，不需要房屋', modeled: 'yes', source: SRC.a4w },
      { text: '單位一律成批訓練（村民一次 2 名）', modeled: 'approx', source: SRC.a4w, note: '用目錄的 37 秒當作 2 名村民的時間，費用 2 份。' },
      { text: '在金帳升代（先蓋金帳再研究）', modeled: 'yes', source: SRC.a4w },
      { text: '畜欄、敖包石頭', modeled: 'no', source: SRC.a4w },
    ],
  }),
  hr: spec('hr', '神聖羅馬帝國', {
    start: { ...STD, gold: 0 },
    startNote: '開局 6 村民、1 斥候、1 神職人員，0 黃金（舊版記錄）。',
    extraPop: 2,
    carry: 14,
    inspire: { villagers: 6, mul: 1.4 },
    bonuses: [
      { text: '村民攜帶量 +40%', modeled: 'yes', source: SRC.a4w },
      { text: '神職人員激勵：村民採集 +40%，持續 30 秒（17.0 從 35% 提高）', modeled: 'approx', source: SRC.off, note: '假設 1 名神職人員能讓 6 名村民一直保持激勵；施放間隔沒有公開數字。' },
      { text: '亞琛禮拜堂、大學人口', modeled: 'no', source: SRC.a4w },
    ],
  }),
  hl: spec('hl', '蘭開斯特', {
    ownedSheep: 9,
    gather: { all: 1, sheep: 1.2, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    bonuses: [
      { text: '採羊 +20%', modeled: 'yes', source: SRC.a4w },
      { text: '城鎮中心蓋好時生出 4 隻羊（開局共 9 隻）', modeled: 'yes', source: SRC.a4w },
      { text: '莊園被動產出食物與木材', modeled: 'no', source: SRC.a4w },
    ],
  }),
  ja: spec('ja', '日本', {
    dropoff: { food: ['farmhouse'], wood: ['lumber-camp'], gold: ['forge'], stone: ['forge'] },
    byproducts: [
      { from: 'gold', to: 'stone', ratio: 0.2 },
      { from: 'stone', to: 'gold', ratio: 0.2 },
    ],
    bonuses: [
      { text: '農舍同時是房屋和食物投放點', modeled: 'yes', source: SRC.a4w },
      { text: '鍛造場是黃金、石頭投放點', modeled: 'yes', source: SRC.a4w },
      { text: '投放黃金得到額外石頭，反之亦然', modeled: 'approx', source: SRC.old, note: '比例沿用舊版的 20%，17.0 資料沒有寫數字。' },
      { text: '城鎮中心升級（大名宅邸）提升附近農田採集', modeled: 'no', source: SRC.a4w },
    ],
  }),
  je: spec('je', '聖女貞德', {
    bonuses: [
      { text: '經濟科技便宜 35%', modeled: 'yes', source: SRC.a4w, note: '目錄已折價。' },
      { text: '貞德本人採集與英雄之旅', modeled: 'no', source: SRC.a4w },
    ],
  }),
  jin: spec('jin', '金朝', {
    worker: 'mounted-villager',
    workerCap: 20,
    fallbackWorker: 'villager',
    workerGather: 2.2,
    bonuses: [
      { text: '最多 20 名鄉騎，採集、移動、建造都更快', modeled: 'approx', source: SRC.a4w, note: '鄉騎採集當作普通村民的 2.2 倍（舊版數字，17.0 資料未列）；滿 20 名後改訓普通村民。17.0 修正了鄉騎吃得到採金科技。' },
      { text: '開局 6 名工人', modeled: 'approx', source: SRC.old, note: '實際開局組成在 17.0 資料中查不到，暫用 6 名普通村民。' },
      { text: '朝貢國、草原', modeled: 'no', source: SRC.a4w },
    ],
  }),
  kt: spec('kt', '聖殿騎士團', {
    start: { ...STD, wood: 100 },
    startNote: '開局 100 木材（舊版記錄）。',
    woodAtTree: 0.6,
    woodByAge: [1, 1.2, 1.35, 1.5],
    woodInstant: true,
    dropoff: { food: ['mill'], wood: [], gold: ['mining-camp'], stone: ['mining-camp'] },
    bonuses: [
      { text: '伐木工採到就自動入庫，不需要伐木場', modeled: 'yes', source: SRC.a4w },
      { text: '木材採集逐代提升：封建 +20%，城堡、帝王各再 +15%（17.0 從 20% 調降）', modeled: 'yes', source: SRC.off, note: '基礎速率 0.6 沿用舊版。' },
      { text: '在城鎮中心建立分團升代', modeled: 'yes', source: SRC.a4w, note: '研究期間城鎮中心不能生產村民。' },
      { text: '朝聖者產金', modeled: 'no', source: SRC.a4w },
    ],
  }),
  mac: spec('mac', '馬其頓王朝', {
    landmarkAura: [{ building: 'grand-winery', res: 'food', mul: 1.35 }],
    bonuses: [
      { text: '大酒莊光環內食物採集 +35%（17.0 從 30% 提高）', modeled: 'approx', source: SRC.off, note: '假設食物採集點都在光環內。' },
      { text: '白銀經濟', modeled: 'no', source: SRC.a4w },
    ],
  }),
  ma: spec('ma', '馬利', {
    housePop: 5,
    noBoar: true,
    bonuses: [
      { text: '房屋半價、半人口（+5）', modeled: 'yes', source: SRC.a4w, note: '目錄 25 木材、7 秒。' },
      { text: '不能採野豬', modeled: 'yes', source: SRC.fandomResource },
      { text: '坑礦（不消耗金礦）、牛隻', modeled: 'no', source: SRC.a4w },
    ],
  }),
  mo: spec('mo', '蒙古', {
    popModel: 'max',
    dropoff: { food: ['ger'], wood: ['ger'], gold: ['ger'], stone: ['ger'] },
    bonuses: [
      { text: '開局人口上限全滿，不需要房屋', modeled: 'yes', source: SRC.a4w },
      { text: '蒙古包是全資源投放點', modeled: 'yes', source: SRC.a4w },
      { text: '敖包、石頭雙倍生產', modeled: 'no', source: SRC.a4w },
    ],
  }),
  od: spec('od', '龍騎士團', {
    worker: 'gilded-villager',
    villagers: 5,
    carry: 14,
    gather: { all: 1.27, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    startNote: '開局 5 名鍍金村民（舊版記錄）。',
    bonuses: [
      { text: '鍍金村民採集 +27%、攜帶 +40%', modeled: 'yes', source: SRC.a4w },
      { text: '建造 +20%', modeled: 'yes', source: SRC.a4w, note: '目錄建造時間已經加速。' },
    ],
  }),
  ot: spec('ot', '鄂圖曼', {
    noBoar: true,
    bonuses: [
      { text: '不能採野豬', modeled: 'yes', source: SRC.a4w },
      { text: '軍事與科技建築折扣（17.0 從 40% 改 30%）', modeled: 'yes', source: SRC.off, note: '用目錄價格。' },
      { text: '軍事學校免費產兵', modeled: 'no', source: SRC.a4w },
    ],
  }),
  ru: spec('ru', '羅斯', {
    huntGold: 0.1,
    dropoff: { food: ['hunting-cabin'], wood: ['lumber-camp'], gold: ['mining-camp'], stone: ['mining-camp'] },
    bonuses: [
      { text: '採集動物獲得黃金賞金', modeled: 'approx', source: SRC.a4w, note: '每 10 食物附帶 1 黃金（舊版比例）；賞金門檻的加成未建模。' },
      { text: '狩獵小屋取代磨坊', modeled: 'yes', source: SRC.a4w, note: '樹林產金未建模。' },
    ],
  }),
  sco: spec('sco', '蘇格蘭', {
    bonuses: [
      { text: '塔屋 +15 人口、生產高地牛', modeled: 'no', source: SRC.a4w },
      { text: '高地牛在野果上每分鐘 30 食物', modeled: 'no', source: SRC.a4w },
      { text: '教士魚池產金與採集光環', modeled: 'no', source: SRC.a4w, note: '光環數字在 aoe4world 資料中互相矛盾（10% 與 20%）。' },
    ],
  }),
  sen: spec('sen', '戰國大名', {
    dropoff: { food: ['farmhouse'], wood: ['lumber-camp'], gold: ['forge'], stone: ['forge'] },
    byproducts: [
      { from: 'gold', to: 'stone', ratio: 0.2 },
      { from: 'stone', to: 'gold', ratio: 0.2 },
    ],
    gather: { all: 1, sheep: 1, berry: 1, hunt: 1.15, farm: 1, wood: 1, gold: 1, stone: 1 },
    bonuses: [
      { text: '生存技巧預設已研究（打獵 +15%）', modeled: 'yes', source: SRC.a4w },
      { text: '投放黃金得到額外石頭，反之亦然', modeled: 'approx', source: SRC.old, note: '比例沿用 20%。' },
      { text: '祭典屋台被動採食物（17.0 商人門檻 250→215）', modeled: 'no', source: SRC.off },
    ],
  }),
  tug: spec('tug', '圖格魯克', {
    berryCarry: 3,
    gather: { all: 1, sheep: 1, berry: 1.3, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 },
    noBoar: true,
    dropoff: { food: ['worker-elephant'], wood: ['worker-elephant'], gold: ['worker-elephant'], stone: ['worker-elephant'] },
    bonuses: [
      { text: '採野果 +30%、攜帶 +3', modeled: 'yes', source: SRC.a4w },
      { text: '不能採野豬', modeled: 'yes', source: SRC.a4w },
      { text: '工作象當投放點', modeled: 'yes', source: SRC.a4w, note: '用目錄的工作象花費，當作一般投放建築。' },
      { text: '投放時額外資源', modeled: 'no', source: SRC.a4w, note: '比例沒有公開數字。' },
    ],
  }),
  vik: spec('vik', '維京', {
    freeVillagers: { base: 10, perHouse: 10 },
    housePop: 25,
    bonuses: [
      { text: '城鎮中心免費自動招募村民（22 秒），上限是村民容量', modeled: 'yes', source: SRC.a4w },
      { text: '每座長屋 +10 村民容量、+25 人口', modeled: 'yes', source: SRC.a4w, note: '起始村民容量 10 是假設，資料沒有寫。' },
      { text: '蜂箱、農莊附件、薩迦任務', modeled: 'no', source: SRC.a4w },
    ],
  }),
  zx: spec('zx', '朱熹傳承', {
    landmarkCostMul: 0.85,
    extraPop: 2,
    bonuses: [
      { text: '唐朝：地標花費 -15%', modeled: 'yes', source: SRC.a4w },
      { text: '建造快 100%', modeled: 'yes', source: SRC.a4w, note: '目錄時間已加速。' },
      { text: '監工收稅', modeled: 'no', source: SRC.a4w },
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
