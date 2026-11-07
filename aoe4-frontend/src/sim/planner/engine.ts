// 逐秒模擬。村民以「採集點上的人數」聚合，但走路、交資源往返、建造人數、
// 採集點耗盡、人口與房屋、生產佇列都照實算。
//
// 控制器是規則式的，行為由 Policy 參數決定；最佳化在 search.ts 調這些參數。
//
// 硬性規則：所有城鎮中心不中斷村民生產。
//  - 其他花費一律先保留下一批村民的費用（每座城鎮中心一份）。
//  - 依生產速度提前蓋房，人口優先留給村民，軍隊不能佔掉下一名村民的人口。
//  - 城鎮中心不拿來訓練軍隊或研究經濟科技（除非該目標只能在城鎮中心做）。
//  - 例外只有遊戲機制：在城鎮中心研究的升代科技或目標科技、人口 200。
//  - 仍然發生的閒置（例如食物真的不夠）會分原因記錄，並重罰。

import type { CatalogItem, Variation } from '../types.ts'
import { costOf as baseCostOf, isBuildable, isTownCenter, minAge, nameOf, otherOf, variationAt, type AgeOption, type CivData } from './civData.ts'
import { SPECIAL_ZH, type CivSpec, type Gather, type Grant, type Trigger, type Zone } from './civSpec.ts'
import { TC_WOOD_ID, siteDistance } from './mapgen.ts'
import {
  PHASE_SEC,
  RES,
  zero,
  type Bundle,
  type GameMap,
  type GoalResult,
  type HolySettings,
  type PlanEvent,
  type BuildingTrack,
  type PlanResult,
  type Policy,
  type PostArmy,
  type Res,
  type Sample,
  type Site,
  type SiteKind,
  type Step,
  type FishSettings,
  type ReplayScript,
  type TradeSettings,
} from './types.ts'

const SPEED = 1.125
/** 評分：目標達成時每 1 資源的累計收入抵多少秒 */
const ECO_WEIGHT = 0.01
/** 控制器規則的預設參數（policy.ctl 可覆蓋，由搜尋調整）；setup = 選採集點時把走路與蓋投放點的一次性時間攤到多少秒的採集上 */
// look = 分配人力時往後看幾秒的花費（職業對局重跑比對：0 → 180 讓城堡偏差從 +80～+250 秒降到 +50～+70 秒，2026-11-07）
/**
 * 回放：動作在職業開始時間前幾秒就算「快到了」，保證有人採它缺的資源（職業付錢前就在存）。
 * 2026-11-07 用 111 場試 0/10/20/30/45/60 秒：30 秒封建誤差中位數 11 → 6 秒、20 秒內 87 → 104 場，城堡不變
 */
const PEND_LEAD = 30
/**
 * 手上的資源投放了才入帳（見每秒採集）。預設關閉：2026-11-07 回放試過，開啟後開局收入和職業的紀錄對得更準
 * （收入 ×1.05 → ×1.01、1:00 食物多 41 → 17），但升代時間反而差很多（封建 20 秒內 106 → 87 場），
 * 表示模擬還有別處偏慢、剛好被「手上的資源也能花」抵掉，還沒找到。
 */
const IN_HAND = false
/**
 * 回放：職業下一座投放點的花費、下一筆市場交易要付的錢也保證有人採。預設關閉：
 * 搭配 IN_HAND 時修好了個別場次（蘇格蘭封建 +48 → +13、戰國 +55 → 正常），但整體封建 20 秒內只到 89／111；
 * 不開 IN_HAND 時誤差中位數小一點、20 秒內的場次卻從 106 降到 100。等 IN_HAND 的問題找到後再一起打開。
 */
const DROP_GUARD = false
const CTL = { rebalance: 8, move: 0.15, hyst: 3, setup: 120, camp: 6, houseLead: 12, farmLead: 90, look: 180 }
const HUNT_CARRY = 25
const RES_OF: Record<SiteKind | 'farm', Res> = {
  sheep: 'food',
  berry: 'food',
  deer: 'food',
  boar: 'food',
  farm: 'food',
  wood: 'wood',
  gold: 'gold',
  stone: 'stone',
}
const RES_ZH: Record<Res, string> = { food: '食物', wood: '木材', gold: '黃金', stone: '石頭' }

interface SiteSt {
  s: Site
  res: Res
  left: number
  /** 在這裡採的村民手上還沒投放的資源 */
  hand?: number
  /** 固定每人每秒（清酒釀造所金蓆），不算走路與採集科技 */
  fixed?: number
  /** 這個點額外的採集倍率（雙塔伊斯蘭學院野果 +50%） */
  mul?: number
  /** 採完幾秒後長回來；regrowAt = 長回來的時間 */
  regrow?: number
  /** 用農田的採集速率（維京農莊的田） */
  farmLike?: boolean
  /** 指定每人每秒的基本採集速率（馬利的牛 0.81），仍算走路與攜帶 */
  raw?: number
  regrowAt?: number
  /** 0 = 沒有投放點、1 = 蓋造中、2 = 已有 */
  camp: 0 | 1 | 2
  workers: number
  chopped: number
  /** 專業斥候把鹿拖回城鎮中心旁：村民在家採，投放距離同羊 */
  hauled?: boolean
}

interface Walker {
  to: string
  eta: number
  res: Res | null
}

interface Job {
  kind: 'vill' | 'unit' | 'tech'
  item: string
  end: number
  count: number
  step: number
  /** 軍隊：佔用人口與單位時間（估算房屋需求用） */
  pop?: number
  dur?: number
  /** 排入時付的錢（村民出來時記錄用） */
  cost?: Bundle
  /** 有監工督導（時間已縮短） */
  supervised?: boolean
}

interface Bld {
  uid: number
  item: string
  step: number
  role: 'house' | 'camp' | 'farm' | 'step' | 'econ' | 'prod'
  done: boolean
  progress: number
  total: number
  builders: number
  at: number
  angle: number
  siteId?: string
  job: Job | null
  /** 蓋好就是升代（地標） */
  ageTo?: number
  /** 上一個工作的結束時間（連續生產時保留小數秒） */
  lastEnd?: number
  /** 城鎮中心這次閒置已記錄的違規秒數 */
  idleTicks?: number
  placedAt?: number
  doneAt?: number | null
  /** 光環建築的錨點：'home' 或採集點 id */
  anchor?: string
}

export interface SimOptions {
  record: boolean
  /** 超過這個秒數就放棄（剪枝） */
  bound: number
  /** 城鎮中心每閒置 1 秒（非例外）加多少分 */
  idleWeight?: number
  /** 目標達成後全力出兵的目標；沒給或 0/0 表示目標達成就結束 */
  post?: PostArmy
  /** 全力出兵階段超過這個秒數就放棄（剪枝） */
  postBound?: number
  /** 聖物與聖地的設定；沒給就不模擬 */
  holy?: HolySettings
  /** 陸地貿易的設定；沒給或沒有貿易站就不模擬 */
  trade?: TradeSettings
  /** 捕魚的設定；沒給或沒有深水魚就不模擬 */
  fish?: FishSettings
  /** 操作損失：每次手動下指令（放建築派建造者、把村民調到別的點、重新派閒置村民）多花的秒數；新村民走集結點不算 */
  opDelay?: number
  /** 操作損失：實際採集效率（繞路、互相卡位、找下一棵樹），乘在所有採集速率上；1 = 理論值 */
  efficiency?: number
  /** 回放職業對局：照職業出村民、照職業的收入比例分配村民、只在職業蓋了投放點之後蓋營地 */
  script?: ReplayScript
}

/** 撿聖物、佔聖地的宗教單位候選（依序取第一個目錄裡有的） */
const RELIGIOUS = ['monk', 'scholar', 'imam', 'shaman', 'prelate', 'buddhist-monk', 'dervish', 'kirkman', 'warrior-monk']

/**
 * 陸地商人候選（依序取第一個本文明能在城鎮中心以外訓練的）。
 * 收入倍率與數量上限照 Fandom Trade、Venetian Trader 頁：商隊 ×0.38、馴鹿商人 ×0.83；威尼斯商人最多 5 名。
 */
const TRADERS = ['venetian-trader', 'trade-caravan', 'reindeer-trader', 'trader']
const TRADER_FIN: Record<string, number> = { 'trade-caravan': 0.38, 'reindeer-trader': 0.83 }
const TRADER_CAP: Record<string, number> = { 'venetian-trader': 5 }
/** 一般商人最多訓練幾名（搜尋範圍） */
export const MAX_TRADERS = 40
/**
 * 商人每到一端的黃金（Fandom Trade 頁，1v1 地圖、中立貿易站的實測擬合）：(0.008 × 速度 × 距離² + 0.1 × 距離) × 倍率。
 * 速度 1 的一般商人在 88 格的路線約 71 黃金，和 Fandom「沿地圖一邊 69–73」一致。
 */
export const legGold = (dist: number, speed: number, fin = 1) => (0.008 * speed * dist * dist + 0.1 * dist) * fin

/**
 * 漁船（Fandom Fishing Boat、Lodya Fishing Boat 頁，17.0）：深水魚每秒採集、攜帶量；羅斯漁船滿載直接入庫，不用回碼頭。
 * 依序取第一個本文明能訓練的。
 */
const FISHERS: Record<string, { rate: number; carry: number; direct: boolean }> = {
  'lodya-fishing-boat': { rate: 1.42, carry: 40, direct: true },
  'fishing-boat': { rate: 0.75, carry: 40, direct: false },
}
/** 漁船最多訓練幾艘（搜尋範圍） */
export const MAX_BOATS = 30
/** 深水魚：每個 1000 食物，採完後每 10 秒長回 50（Fandom Fishing 頁） */
const DEEP_FISH = 1000
const FISH_REGROW = 5

/** 目標後最多模擬多久 */
const POST_CAP = 15 * 60
// 金朝的馬廄是戰馬廄（war-stable），用來消耗草場的馬
const POST_TYPES = ['barracks', 'archery-range', 'stable', 'war-stable']
const SMITHS = ['blacksmith', 'forge']

const FARM_SITE: Site = { id: 'farm', kind: 'berry', label: '農田', amount: Infinity, units: 0, dist: 5, angle: 0.3, contested: false }

/** 光環建築可以蓋的位置：'home'（城鎮中心旁的農田區）或附近的採集點（每種最近 2 處，不含爭奪資源）；第一個是預設 */
export function zoneAnchors(z: Zone, map: GameMap): string[] {
  const near = (kind: SiteKind, n = 2) =>
    map.sites
      .filter((s) => s.kind === kind && !s.contested && s.id !== TC_WOOD_ID)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n)
      .map((s) => s.id)
  if (z.res === 'gold') return [...near('gold'), 'home']
  if (z.res === 'stone') return [...near('stone'), 'home']
  if (z.res === 'wood') return [...near('wood'), 'home']
  if (z.res === 'food') return ['home', ...near('berry'), ...near('deer', 1)]
  return ['home', ...near('gold', 1), ...near('wood', 1), ...near('berry', 1), ...near('stone', 1)]
}

/** 這個策略要蓋的光環建築位置；沒有指定時用預設（地標 1 座、蓄水池 1 座） */
export function zonePlan(spec: CivSpec, policy: Policy, map: GameMap, building: string): string[] {
  const z = (spec.zones ?? []).find((x) => x.building === building)
  if (!z) return []
  const valid = new Set(['home', ...map.sites.map((s) => s.id)])
  const want = policy.placeAt?.[building] ?? [zoneAnchors(z, map)[0]]
  return want.map((a) => (valid.has(a) ? a : 'home'))
}

export function simulate(data: CivData, map: GameMap, steps: Step[], policy: Policy, opts: SimOptions): PlanResult {
  const spec = data.spec
  const items = data.items
  const name = (id: string) => nameOf(data, id)
  const rec = opts.record
  const opDelay = opts.opDelay ?? 0
  const script = opts.script
  /** 回放：已經開始的步驟 */
  const started = new Set<number>()
  /** 回放：職業在 at 秒前已開始訓練的村民數（出生時間減訓練時間）＋開局村民 */
  const scriptedVills = (at: number) => startVillagers + (script ? script.villagers.filter((x) => x - trainTime() <= at).length : 0)
  /**
   * 回放：每種資源還要採多少才追得上職業 40 秒後的累計收入（職業的紀錄是投放時入帳、一筆一筆的，
   * 所以追累計曲線，不用短時間的收入率；模擬已經超前的資源就不派人）
   */
  const scriptNeed = (ahead = 40): Bundle => {
    const out = zero()
    if (!script) return out
    const ts = script.income.t
    const at = t + ahead
    let i = ts.findIndex((x) => x >= at)
    if (i < 0) i = ts.length - 1
    const f = i > 0 && ts[i] > ts[i - 1] ? Math.min(1, Math.max(0, (at - ts[i - 1]) / (ts[i] - ts[i - 1]))) : 1
    for (const r of RES) {
      const a = i > 0 ? script.income[r][i - 1] : script.income[r][0]
      const pro = a + (script.income[r][i] - a) * f
      out[r] = Math.max(0, pro - incomeAcc[r])
    }
    // 時間已到、還沒開始的動作缺的錢也要補（只追收入曲線時，差幾塊錢就會卡住：職業錢夠了就不再採，模擬少一點就永遠湊不齊）
    // 只看最早一個時間已到、還沒開始的動作（全部加總會把後面好幾批兵的花費都算進來，分配一直來回切換）
    const pend = zero()
    pendAge = false
    for (let k = cur; k < steps.length; k++) {
      const st = steps[k]
      // 已完成的步驟（隱含的生產建築已經有了）不算
      if (started.has(k) || stepDone[k] != null || (st.earliest ?? 0) > t + PEND_LEAD) continue
      const c = stepCost(st)
      // 四種資源已經付得起、卻還沒開始的（等橄欖油、等生產建築、等人口）跳過，看下一個（以前拜占庭等油的傭兵擋住後面的升城堡）
      if (RES.every((r) => c[r] <= bank[r])) continue
      for (const r of RES) pend[r] += c[r]
      pendAge = st.kind === 'age'
      break
    }
    // 職業下一座投放點：營地不是步驟，以前沒人保證它的木材。職業那種資源的收入曲線是平的時候，
    // 模擬差幾塊木材就永遠湊不齊（蘇格蘭一場差 6 木材、2 分鐘蓋不了採礦營地，7 名礦工都走回城鎮中心交）
    // 職業下一筆市場交易要付的錢（戰國開局用 130 黃金買木材）也保證有人採
    if (DROP_GUARD && script.trades) {
      const tr = script.trades[tradeIdx]
      if (tr && tr.t <= t + PEND_LEAD) for (const [r, x] of Object.entries(tr.pay)) pend[r as Res] += x ?? 0
    }
    if (DROP_GUARD && !script.dropoffsMoved) {
      const n = new Map<string, number>()
      for (const d of script.dropoffs) {
        if (d.t > t + PEND_LEAD) break
        n.set(d.id, (n.get(d.id) ?? 0) + 1)
        const it = items.get(d.id)
        if (!it || it.kind === 'unit' || script.untracked?.includes(d.id)) continue
        if ((n.get(d.id) ?? 0) <= blds.filter((b) => b.item === d.id).length + (freeDropUsed < spec.freeDropoffs ? 1 : 0)) continue
        const c = costOf(variationAt(it, age))
        for (const r of RES) pend[r] += c[r]
        break
      }
    }
    for (const r of RES) {
      pendShort[r] = Math.max(0, pend[r] - bank[r])
      out[r] = Math.max(out[r], pendShort[r])
    }
    return out
  }
  /** 回放：下一筆要做的市場交易 */
  let tradeIdx = 0
  /** 回放：時間已到的動作還缺的資源（分配時保證有人採） */
  const pendShort = zero()
  let pendAge = false
  const ctl = { ...CTL, ...policy.ctl }
  const efficiency = opts.efficiency ?? 1
  const events: PlanEvent[] = []
  const samples: Sample[] = []
  const warnings: string[] = []

  // ---------- 狀態 ----------
  let t = 0
  let age = 1
  const bank: Bundle = { ...spec.start }
  /** 特殊資源（橄欖油、白銀、維齊爾點數…） */
  const other: Record<string, number> = { ...spec.startOther } as Record<string, number>
  /** 各種工人的人數（金朝鄉騎 / 村民） */
  const workerCount = new Map<string, number>(Object.entries(spec.startWorkers))
  const startVillagers = [...workerCount.values()].reduce((a, b) => a + b, 0)
  let villagers = startVillagers
  let armyPop = 0
  let armyCount = 0
  const trained = new Map<string, number>()
  const queued = new Map<number, number>()
  const placed = new Map<number, number>()
  const researched = new Set<string>()
  const researching = new Set<string>()
  const ageTimes: Record<number, number> = { 1: 0 }
  const stepDone: (number | null)[] = steps.map(() => null)
  let cur = 0
  let uid = 1
  let lastRebalance = -99
  let incomeAcc = zero()
  let incomeWindow = zero()

  const sites: SiteSt[] = map.sites
    .filter((s) => !(s.kind === 'boar'))
    // 城鎮中心旁的散樹直接投放到城鎮中心，等同已有投放點
    .map((s) => ({ s, res: RES_OF[s.kind], left: s.amount, camp: s.id === TC_WOOD_ID ? 2 : 0, workers: 0, chopped: 0 }))
  const sheep: SiteSt = {
    s: { id: 'sheep', kind: 'sheep', label: '羊', amount: 0, units: 0, dist: 3, angle: 0, contested: false },
    res: 'food',
    // 自有羊 + 首都城鎮中心旁生成的羊（蘭開斯特 4 隻）
    left: 200 * (spec.ownedSheep + spec.tcSheep) + spec.startFood,
    camp: 2,
    workers: 0,
    chopped: 0,
  }
  sites.unshift(sheep)
  // 城鎮中心旁的獵物（金朝馴鹿）：獵肉速率與攜帶量，投放在城鎮中心，不受「打鹿」策略限制
  const startHunt: SiteSt | null = spec.startHunt > 0
    ? { s: { id: 'start-hunt', kind: 'deer', label: '城鎮中心旁獵物', amount: spec.startHunt, units: 8, dist: 3, angle: 0, contested: false }, res: 'food', left: spec.startHunt, camp: 2, workers: 0, chopped: 0 }
    : null
  if (startHunt) sites.unshift(startHunt)
  const farm: SiteSt = { s: FARM_SITE, res: 'food', left: Infinity, camp: 2, workers: 0, chopped: 0 }
  sites.push(farm)
  // 馬利的牛：買來放在城鎮中心旁，村民用 raw 速率採；一隻一人
  const herd: SiteSt | null = spec.herd
    ? { s: { id: 'herd', kind: 'sheep', label: spec.herd.label, amount: 0, units: 0, dist: 3, angle: -0.4, contested: false }, res: 'food', left: 0, camp: 2, workers: 0, chopped: 0, raw: spec.herd.raw }
    : null
  if (herd) sites.splice(1, 0, herd)
  // 岸邊魚（Fandom Shore Fish 頁：每條 600 食物、村民每秒 1.0）：在岸邊（離城鎮中心 fish.dock 格），每條 1 人（未證實），有碼頭就投放到碼頭
  const shoreN = opts.fish && opts.fish.spots >= 0 ? (opts.fish.shore ?? 0) : 0
  const shoreFish: SiteSt | null = shoreN > 0
    ? { s: { id: 'shore-fish', kind: 'sheep', label: `岸邊魚（${shoreN} 條）`, amount: 600 * shoreN, units: shoreN, dist: opts.fish!.dock, angle: 2.2, contested: false }, res: 'food', left: 600 * shoreN, camp: 0, workers: 0, chopped: 0, raw: 1 }
    : null
  if (shoreFish) sites.splice(sites.length - 1, 0, shoreFish)
  /** 有收入的輔助單位：已有與訓練中的人數 */
  const supportN = new Map<string, number>()
  const supportTraining = new Map<string, number>()
  let herdBought = 0
  let herdTraining = 0
  /** 金朝朝貢國：每座建立的時間（工人上限會用到，所以放在前面） */
  const tribs: number[] = []
  const siteById = new Map(sites.map((x) => [x.s.id, x]))
  let farmsBuilt = 0
  /** 農田區的磨坊數（英格蘭磨坊範圍） */
  let farmMills = 0
  /** 農田（含蓋造中）比農田區磨坊罩得到的多 */
  const farmMillShort = () => {
    const fm = spec.farmMill
    if (!fm) return false
    const farms = blds.filter((b) => b.role === 'farm').length
    return farms > 0 && farms > fm.perMill * blds.filter((b) => b.item === fm.building && b.anchor === 'farm').length
  }
  /** 農田（或橄欖園、畜欄、牧場）可容納的村民數 */
  const farmSlots = () => farmsBuilt * spec.farm.slots
  let sheepIdx = 0

  const blds: Bld[] = []
  const addBld = (b: Omit<Bld, 'uid'>) => {
    const x: Bld = { ...b, uid: uid++, placedAt: t, doneAt: b.done ? t : null }
    blds.push(x)
    return x
  }
  addBld({ item: items.has('capital-town-center') ? 'capital-town-center' : 'town-center', step: -1, role: 'prod', done: true, progress: 0, total: 0, builders: 0, at: 0, angle: 0, job: null })
  for (const id of spec.prebuilt) addBld({ item: id, step: -1, role: 'econ', done: true, progress: 0, total: 0, builders: 0, at: 6, angle: 1, job: null })

  const walkers: Walker[] = []
  // 開局村民全部在城鎮中心旁
  const free: { from: string }[] = Array.from({ length: startVillagers }, () => ({ from: 'tc' }))

  // ---------- 修正量 ----------
  const mods = { carry: 0, speed: 1, food: 1, hunt: 1, berry: 1, wood: 1, gold: 1, stone: 1, forestry: 1 }
  /** 捕魚科技（延繩 +15%、攜帶 +10；流網 +10%、攜帶 +20、速度 +10%，Fandom）只套漁船 */
  const fishMods = { rate: 1, carry: 0, speed: 1 }

  const owned = (id: string) => blds.some((b) => b.done && b.item === id)

  // ---------- 條件式修正（spec.triggers）----------
  const itemOfVar = new Map<Variation, CatalogItem>()
  for (const it of items.values()) for (const v of it.variations) itemOfVar.set(v, it)
  const active: { tr: Trigger; until: number; next: number; count: number; start: number; tokens?: number }[] = []
  /** 累計採到的獵物食物（羊、鹿、野豬），與每個里程碑開始計算時的量 */
  let huntDone = 0
  const huntAt = new Map<string, number>()
  /** 目前生效中的採集、建造、村民時間倍率（觸發改變時重算） */
  let tGather: Record<keyof Gather, number> = { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 }
  let tBuild = 1
  let tVillTime = 1
  let tSpeed = 1
  let tCarry = 0
  /** 觸發過的 id（研究完、蓋好、朝代） */
  const fired = new Set<string>()
  const tFarmer = zero()
  const recomputeTriggers = () => {
    tGather = { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 }
    tBuild = 1
    tVillTime = 1
    tSpeed = 1
    tCarry = 0
    for (const r of RES) tFarmer[r] = 0
    for (const { tr } of active) {
      for (const [k, m] of Object.entries(tr.gather ?? {})) tGather[k as keyof Gather] *= m ?? 1
      tBuild *= tr.build ?? 1
      tVillTime *= tr.villagerTime ?? 1
      tSpeed *= tr.speed ?? 1
      tCarry += tr.carry ?? 0
      for (const [k, x] of Object.entries(tr.farmerIncome ?? {})) tFarmer[k as Res] += x ?? 0
    }
  }
  const costMulFor = (it: CatalogItem | undefined, id: string, r: Res) => {
    let m = 1
    // 烏奇總督：科技便宜
    if (spec.governors && (it?.kind === 'technology' || it?.kind === 'upgrade')) m *= 1 - govState().techCost
    for (const { tr } of active) {
      for (const c of tr.costMul ?? []) {
        if (c.res && !c.res.includes(r)) continue
        const hit = c.ids
          ? c.ids.includes(id)
          : c.kind === 'technology'
            ? it?.kind === 'technology' || it?.kind === 'upgrade'
            : c.kind === 'unit'
              ? it?.kind === 'unit'
              : c.kind === 'building' && it?.kind === 'building'
        if (hit) m *= c.mul
      }
    }
    return m
  }
  /** 目錄花費，再套用生效中的花費倍率（新鮮食材、肥沃月彎、知識保存…） */
  const costOf = (v: Variation): Bundle => {
    const c = baseCostOf(v)
    if (!active.length && !spec.governors) return c
    const it = itemOfVar.get(v)
    if (!it) return c
    for (const r of RES) if (c[r] > 0) c[r] *= costMulFor(it, it.id, r)
    // 固定減價（蘭開斯特每座莊園讓城堡徵召便宜）
    for (const { tr } of active) {
      if (!tr.costMinus || !tr.costMinus.ids.includes(it.id)) continue
      for (const [r, x] of Object.entries(tr.costMinus.amount)) c[r as Res] = Math.max(0, c[r as Res] - (x ?? 0))
    }
    return c
  }
  const ageCost = (o: AgeOption): Bundle => {
    const c = { ...o.cost }
    if (!active.length) return c
    const it = items.get(o.id)
    for (const r of RES) if (c[r] > 0) c[r] *= costMulFor(it, o.id, r)
    return c
  }
  /** 建造時間：目錄時間 × 指定建築的倍率（邊境聚落） */
  const buildTimeOf = (id: string, v: Variation) => {
    let m = 1
    for (const { tr } of active) m *= tr.buildTime?.[id] ?? 1
    return v.time * m
  }
  const houses = () => (data.houseId ? blds.filter((b) => b.done && b.item === data.houseId).length : 0)
  const tcs = () => blds.filter((b) => b.done && (b.item === 'town-center' || b.item === 'capital-town-center')).length
  const popExtra = () => {
    let n = 0
    for (const [id, p] of Object.entries(spec.popBuildings)) n += p * blds.filter((b) => b.done && b.item === id).length
    return n
  }
  const popCap = () => (spec.popModel === 'max' ? 200 : Math.min(200, 10 * tcs() + spec.housePop * houses() + popExtra()))
  /** 升級後離開經濟的英雄（貞德）仍佔人口 */
  let heroPop = 0
  const pop = () => villagers + spec.extraPop + armyPop + heroPop
  const vilCap = () => (spec.freeVillagers ? spec.freeVillagers.base + spec.freeVillagers.perHouse * houses() : Infinity)

  const workerItem = (): CatalogItem | undefined => {
    // 回放：第 k 名村民照職業訓練的種類（金朝職業會混著訓普通村民與鄉騎）
    if (script?.workerIds) {
      let n = blds.reduce((a, b) => a + (b.job?.kind === 'vill' ? b.job.count : 0), 0) - startVillagers
      for (const v of workerCount.values()) n += v
      const id = script.workerIds[Math.max(0, Math.min(n, script.workerIds.length - 1))]
      const it = id && (id === spec.worker || id === spec.fallbackWorker) ? items.get(id) : undefined
      if (it) return it
    }
    const inTraining = blds.reduce((n, b) => n + (b.job?.kind === 'vill' && b.job.item === spec.worker ? b.job.count : 0), 0)
    const cap = spec.workerCap + (spec.trade?.tributary?.workerCap ?? 0) * tribs.length
    if (spec.fallbackWorker && (workerCount.get(spec.worker) ?? 0) + inTraining >= cap) return items.get(spec.fallbackWorker)
    return items.get(spec.worker) ?? items.get('villager')
  }

  // 工人組成：各採集類別的平均倍率與平均攜帶量（假設各種工人平均分布在採集點上）
  const GATHER_KEYS: (keyof Gather)[] = ['sheep', 'berry', 'hunt', 'farm', 'wood', 'gold', 'stone']
  let wmul: Record<keyof Gather, number> = { all: 1, sheep: 1, berry: 1, hunt: 1, farm: 1, wood: 1, gold: 1, stone: 1 }
  let baseCarry = spec.carry
  /** 工人平均移動速度相對普通村民的倍率 */
  let wSpeed = 1
  /** 工人平均建造倍率 */
  let wBuild = { landmark: 1, other: 1 }
  const refreshWorkers = () => {
    const total = Math.max(1, villagers)
    const out = { all: 1, sheep: 0, berry: 0, hunt: 0, farm: 0, wood: 0, gold: 0, stone: 0 }
    let carry = 0
    let speed = 0
    const build = { landmark: 0, other: 0 }
    let counted = 0
    for (const [id, n] of workerCount) {
      if (n <= 0) continue
      const ws = spec.workerSpecs[id]
      for (const k of GATHER_KEYS) out[k] += n * (ws?.gather?.all ?? 1) * (ws?.gather?.[k] ?? 1)
      carry += n * (ws?.carry ?? spec.carry)
      speed += n * (ws?.speed ?? SPEED)
      build.landmark += n * (ws?.build?.landmark ?? 1)
      build.other += n * (ws?.build?.other ?? 1)
      counted += n
    }
    // 還沒記到工人種類的（理論上不會有）用普通村民
    const rest = Math.max(0, total - counted)
    const all = Math.max(1, counted + rest)
    for (const k of GATHER_KEYS) out[k] = (out[k] + rest) / all
    wmul = out
    baseCarry = (carry + rest * spec.carry) / all
    wSpeed = (speed + rest * SPEED) / all / SPEED
    // 建造：派最會蓋的那種工人去蓋（金朝職業用鄉騎蓋地標），有 3 名以上就用它的倍率，不取平均
    // （以前取平均，金朝混訓普通村民時大牧場要蓋 101 秒，職業約 70 秒）
    wBuild = { landmark: (build.landmark + rest) / all, other: (build.other + rest) / all }
    for (const [id, n] of workerCount) {
      const b = spec.workerSpecs[id]?.build
      if (!b || n < 3) continue
      wBuild = { landmark: Math.max(wBuild.landmark, b.landmark ?? 1), other: Math.max(wBuild.other, b.other ?? 1) }
    }
  }
  refreshWorkers()
  const carryNow = () => baseCarry + mods.carry + tCarry

  // ---------- 光環（spec.zones）----------
  const zoneBy = new Map((spec.zones ?? []).map((z) => [z.building, z]))
  /** 完成的光環建築：位置（相對城鎮中心）與錨點 */
  const zoneInst: { z: Zone; p: Site; anchor: string }[] = []
  /** 農田佔地 2×2（Fandom Farm 頁） */
  const FARM_AREA = 4
  /** 光環建築的位置：'home' 在城鎮中心與農田之間；採集點則蓋在它靠城鎮中心的一側 */
  const anchorPoint = (anchor: string, half: number) => {
    const x = anchor === 'home' ? null : siteById.get(anchor)
    if (!x) return { dist: 6 + half, angle: FARM_SITE.angle }
    return { dist: Math.max(3 + half, x.s.dist - half - 1.5), angle: x.s.angle }
  }
  /** 採集點本身的範圍：林線長、礦約 4×4、羊在城鎮中心旁 */
  const extentOf = (x: SiteSt) => (x.res === 'wood' ? (x.s.id === TC_WOOD_ID ? 2 : 4) : x === sheep || x === startHunt ? 1 : x.s.kind === 'deer' ? 3 : 2)
  /** 一座光環建築蓋在農田區時，周圍能放幾塊田（8 成面積可用） */
  const farmsIn = (z: Zone) => Math.max(0, Math.floor(((Math.PI * (z.radius + z.half) ** 2 - (2 * z.half) ** 2) * 0.8) / FARM_AREA))
  let zoneVer = 0
  /** 這座光環建築周圍有沒有農田：在農田區，或本身兼磨坊（大酒莊蓋在野果旁，野果採完後在它周圍種田） */
  const farmHost = (i: { z: Zone; anchor: string }) => i.anchor === 'home' || i.z.dropoff === 'all' || !!i.z.dropoff?.includes('food')
  /** 同種光環多座時範圍內的人數（每人只算一次） */
  const coveredUnion = (z: Zone) => {
    const inst = zoneInst.filter((i) => i.z === z)
    if (!inst.length) return 0
    let n = 0
    for (const x of sites) {
      if (x.workers <= 0 || (z.res !== 'all' && z.res !== x.res)) continue
      if (x === farm) n += Math.min(x.workers, inst.filter(farmHost).length * farmsIn(z) * spec.farm.slots)
      else if (inst.some((i) => siteDistance(i.p, x.s) <= z.radius + z.half + extentOf(x))) n += x.workers
    }
    return n
  }
  /** 依等級的光環倍率（蓄水池水位 = 1 + 已完成的渡槽段數，不超過已完成的座數與 levels 長度） */
  const levelOf = (z: Zone) => {
    if (!z.levels) return 1
    const built = blds.filter((b) => b.done && b.item === z.building).length
    const links = z.link ? blds.filter((b) => b.done && b.item === z.link!.building && b.anchor === 'link').length : 0
    return Math.max(1, Math.min(z.levels.length, built, 1 + links))
  }
  const zMul = (z: Zone) => (z.levels ? z.levels[levelOf(z) - 1] : z.mul)
  /** 神職人員是否駐紮在光環建築（亞琛禮拜堂、西篤會修道院），駐紮在哪一座 */
  let garrisoned = false
  let garrisonInst: { z: Zone; p: Site; anchor: string } | null = null
  /** 一座光環建築範圍內正在採集的人數 */
  const coveredBy = (i: { z: Zone; p: Site; anchor: string }) => {
    let n = 0
    for (const x of sites) {
      if (x.workers <= 0 || (i.z.res !== 'all' && i.z.res !== x.res)) continue
      if (x === farm) n += farmHost(i) ? Math.min(x.workers, farmsIn(i.z) * spec.farm.slots) : 0
      else if (siteDistance(i.p, x.s) <= i.z.radius + i.z.half + extentOf(x)) n += x.workers
    }
    return n
  }
  let zoneCacheKey = ''
  const zoneMulCache = new Map<SiteSt, number>()
  /** 範圍內的採集倍率：同一種光環建築多座只算一次，不同種相乘；農田依「範圍內田數 / 全部田數」折算 */
  const zoneMul = (x: SiteSt) => {
    if (!zoneInst.length && !matsuriAura) return 1
    const key = zoneVer + ':' + farmsBuilt
    if (key !== zoneCacheKey) {
      zoneMulCache.clear()
      zoneCacheKey = key
    }
    let m = zoneMulCache.get(x)
    if (m != null) return m
    m = 1
    for (const z of spec.zones ?? []) {
      if (z.to || z.perWorker || (z.res !== 'all' && z.res !== x.res)) continue
      if (z.farmOnly && x !== farm) continue
      const inst = zoneInst.filter((i) => i.z === z && (!z.garrison || i === garrisonInst))
      if (!inst.length || (z.garrison && !garrisoned)) continue
      if (x === farm) {
        const home = inst.filter(farmHost).length
        if (farmsBuilt <= 0 || !home) continue
        // 疊加型（糧倉）：每座各罩 farmsIn 塊田，各自 +(mul-1)；否則同種只算一次
        const zm = zMul(z)
        if (z.stack) m *= 1 + ((zm - 1) * home * Math.min(farmsIn(z), farmsBuilt)) / farmsBuilt
        else m *= 1 + ((zm - 1) * Math.min(home * farmsIn(z), farmsBuilt)) / farmsBuilt
      } else {
        const n = inst.filter((i) => siteDistance(i.p, x.s) <= z.radius + z.half + extentOf(x)).length
        if (n) m *= z.stack ? 1 + (zMul(z) - 1) * n : zMul(z)
      }
    }
    // 祭典光環（戰國屋台商人）：祭典 radius 格內的採集點
    const tdr = spec.trickles.find((tr) => tr.sources?.trader)?.sources?.trader
    if (tdr && matsuriAura > 0 && owned(tdr.at)) {
      const p = buildingPoint(tdr.at)
      if (x === farm ? siteDistance(p, FARM_SITE) <= tdr.radius : siteDistance(p, x.s) <= tdr.radius + 2 + extentOf(x)) m *= 1 + matsuriAura
    }
    zoneMulCache.set(x, m)
    return m
  }

  /** 只加成副產物的光環（大酒莊橄欖油）：這個採集點在範圍內就乘上去 */
  const specialMul = (x: SiteSt, to: string) => {
    let m = 1
    for (const i of zoneInst) {
      if (i.z.to !== to || (i.z.res !== 'all' && i.z.res !== x.res)) continue
      if (x === farm) {
        if (farmHost(i) && farmsBuilt > 0) m *= 1 + ((i.z.mul - 1) * Math.min(farmsIn(i.z), farmsBuilt)) / farmsBuilt
      } else if (siteDistance(i.p, x.s) <= i.z.radius + i.z.half + extentOf(x)) m *= i.z.mul
    }
    return m
  }

  /** 黃金時代目前各項倍率（每秒算一次） */
  let golden = { gather: 1, build: 1, research: 1, prod: 1, trade: 1 }
  const refreshGolden = () => {
    golden = { gather: 1, build: 1, research: 1, prod: 1, trade: 1 }
    if (!spec.goldenAge) return
    // 黃金時代要先有智慧宮；只算家附近的建築（不含農田與遠處的投放點）
    if (items.has('house-of-wisdom') && !owned('house-of-wisdom')) return
    const n = blds.filter((b) => b.done && b.role !== 'farm' && !(b.role === 'camp' && b.at > 12)).length
    const boost = spec.goldenBoost && (researched.has(spec.goldenBoost.on) || owned(spec.goldenBoost.on)) ? spec.goldenBoost.mul : 1
    const up = (m?: number) => 1 + ((m ?? 1) - 1) * boost
    for (const tier of spec.goldenAge) {
      if (n < tier.buildings) continue
      golden.gather *= up(tier.mul)
      golden.build *= up(tier.build)
      golden.research *= up(tier.research)
      golden.prod *= up(tier.prod)
      golden.trade *= up(tier.trade)
    }
  }
  /** 研究或擁有 on 之後的收入倍率（鄂圖曼貿易袋） */
  const mulOnOf = (xs?: { on: string; mul: number }[]) => (xs ?? []).reduce((m, x) => (researched.has(x.on) || owned(x.on) ? m * x.mul : m), 1)
  /** 一般科技的研究時間（升代科技不算：阿尤布黃金時代會不會加快側翼不明） */
  const researchTime = (time: number) => (time / golden.research) * scholarMul()
  /** 監工：開局人數 + 訓練完的；督導中的不能再督導別棟 */
  let officialsN = spec.officials?.start ?? 0
  /** 監工督導中的資源（投放 +20%） */
  const supervisedRes = new Set<Res>()
  /** 這個點的投放建築能被督導：有營地（不是城鎮中心旁的羊、散樹、開局獵物），農田要有磨坊 */
  const supervisable = (x: SiteSt) => x !== sheep && x !== startHunt && x.s.id !== TC_WOOD_ID && (x === farm ? owned('mill') || owned('farmhouse') : x.camp === 2)
  let officialsTraining = 0
  const officialsFree = () => officialsN - blds.reduce((n, b) => n + (b.job?.supervised ? 1 : 0), 0)
  /** 非城鎮中心的建築開始一項工作：有空的監工就督導，時間 ÷ work */
  const supervise = (b: Bld, dur: number) => {
    if (spec.officials && !isTC(b.item) && officialsFree() > 0) return { end: t + dur / spec.officials.work, supervised: true }
    return { end: t + dur, supervised: false }
  }
  /** 德里學者：駐紮 n 名時研究時間的倍率（Fandom 帝王科技實測表擬合） */
  let scholarsN = 0
  let scholarsTraining = 0
  /** 買的學者數（不含地標送的） */
  let scholarsBought = 0
  const scholarMul = () => (spec.scholars ? (14 / 15) * Math.pow(0.87808, scholarsN) + 1 / 15 : 1)

  /** 神職人員激勵：跟著人最多的採集點走，只激勵那裡的村民（最多 villagers 名） */
  let inspireSite: SiteSt | null = null
  const inspireAt = (x: SiteSt) =>
    spec.inspire && x === inspireSite && x.workers > 0 ? 1 + ((spec.inspire.mul - 1) * Math.min(spec.inspire.villagers, x.workers)) / x.workers : 1

  let globalMul = 1
  /** 羅斯賞金目前的階級（打獵得到的賞金黃金累計） */
  const bountyTier = () => {
    let best: { food: number; cabin: number } | undefined
    for (const x of spec.bountyTiers ?? []) if (huntDone * spec.huntGold >= x.at) best = x
    return best
  }

  const rawRate = (x: SiteSt) => {
    const g = spec.gather
    let r: number
    if (x.farmLike) r = 0.75 * g.farm * mods.food * wmul.farm
    else if (x.raw != null) r = x.raw * mods.food * wmul.sheep
    else switch (x.s.kind) {
      case 'sheep':
        r = 0.75 * g.sheep * mods.food * wmul.sheep
        break
      case 'berry':
        if (x === farm) {
          const fm = spec.farmMill
          // 英格蘭：只有農田區磨坊罩到的田有加成（每座 perMill 塊）
          const cover = fm ? (farmsBuilt > 0 ? Math.min(1, (fm.perMill * farmMills) / farmsBuilt) : 0) : owned('mill') || owned('farmhouse') ? 1 : 0
          const farmAge = spec.farmByAge ? 1 + (spec.farmByAge[age - 1] - 1) * cover : 1
          r = 0.75 * g.farm * farmAge * mods.food * wmul.farm
        } else r = 0.69 * g.berry * mods.berry * mods.food * wmul.berry
        break
      case 'deer':
        r = 0.825 * g.hunt * mods.hunt * wmul.hunt
        break
      case 'boar':
        r = 0.9 * g.hunt * mods.hunt * wmul.hunt
        break
      case 'wood':
        r = spec.woodAtTree * mods.forestry * g.wood * (spec.woodByAge?.[age - 1] ?? 1) * mods.wood * wmul.wood
        break
      case 'gold':
        r = 0.75 * g.gold * mods.gold * wmul.gold
        break
      default:
        r = 0.75 * g.stone * mods.stone * wmul.stone
    }
    const tk: keyof Gather = x === farm || x.farmLike ? 'farm' : x.s.kind === 'deer' || x.s.kind === 'boar' ? 'hunt' : x.s.kind
    return r * (x.mul ?? 1) * (x.res === 'food' ? (bountyTier()?.food ?? 1) : 1) * g.all * globalMul * zoneMul(x) * inspireAt(x) * tGather.all * tGather[tk] * efficiency * (supervisedRes.has(x.res) && supervisable(x) ? 1.2 : 1)
  }

  const dropDist = (x: SiteSt) => {
    // 羊（與城鎮中心旁的獵物、拖回來的鹿）緊貼城鎮中心：單程約 1 格（職業回放：2 格時封建中位數晚 20 秒、1 格晚 9 秒）
    // 城鎮中心下的獵物（金朝馴鹿）：被射時會跑開，倒在幾格外，單程約 5 格。1 格時鄉騎每人每分鐘 100 食物，
    // 職業 5 場開局推算約 55～75（扣掉採金的人，採金速率與理論相符）；5 格約 76，金朝收入 ×1.17 → ×1.07（2026-11-07）
    if (x === startHunt) return 5
    if (x === sheep || x.hauled) return 1
    if (x === farm) return 2.5
    if (x.camp === 2) return x.res === 'wood' ? 2 + Math.min(4, x.chopped / 2500) : x.res === 'food' ? 2 : 1.5
    return Math.max(2, x.s.dist - 2)
  }

  /** 這個採集點每名村民一次帶多少 */
  const carryAt = (x: SiteSt) => {
    const hunt = x.s.kind === 'deer' || x.s.kind === 'boar'
    const c = carryNow()
    // 獵肉攜帶量也吃工人種類的攜帶加成（金朝鄉騎 +5 → 30）
    return hunt ? Math.max(HUNT_CARRY + (baseCarry - spec.carry), c) : c + (x.s.kind === 'berry' && x !== farm ? spec.berryCarry : 0)
  }
  const effRate = (x: SiteSt, assumeCamp = false) => {
    if (x.fixed != null) return x.fixed
    const raw = rawRate(x)
    if (x.res === 'wood' && spec.woodInstant) return raw
    const carry = carryAt(x)
    const d = assumeCamp && x.camp !== 2 ? (x.res === 'wood' ? 2 : 1.5) : dropDist(x)
    return carry / (carry / raw + (2 * d) / (SPEED * mods.speed * wSpeed * tSpeed))
  }

  const slots = (x: SiteSt) => {
    if (x.left <= 0) return 0
    // 專業斥候拖回來的鹿：每名斥候約供 8 名村民（來回 40 多秒拖一隻 300 多食物）
    if (x.hauled) return Math.min(x.s.units * 3, scoutsNow() * 8)
    // 羊最多幾人採由搜尋決定（policy.sheepCap）：有野果加成的文明可以少放人在羊、提早蓋磨坊採野果
    if (x === sheep) return Math.min(policy.sheepCap ?? 10, 10, 2 * Math.ceil(x.left / 200))
    if (x === herd) return Math.ceil(x.left / (spec.herd?.food ?? 500))
    if (x === farm) return farmSlots()
    // 散樹每棵一人；林線最多 24 人
    if (x.res === 'wood') return x.s.id === TC_WOOD_ID ? x.s.units : 24
    // 野果：每叢 1.5 人（推測；沒有找到每叢上限的文件，論壇有一片 8 人的回報）
    if (x.farmLike) return x.s.units
    if (x.s.kind === 'berry' && x.fixed == null) return Math.ceil(x.s.units * 1.5)
    return x.s.units
  }

  /** 斥候數：開局 1 名加上訓練的 */
  const scoutsNow = () => 1 + (trained.get('scout') ?? 0)
  /**
   * 專業斥候（Fandom Scout、Deer 頁）：斥候一箭殺鹿、把屍體拖到投放點，村民在城鎮中心旁採鹿（0.825/秒、攜帶 25）。
   * 拖的時候速度 -40%（斥候 1.875 → 1.125 格/秒），每秒掉約 1.35 食物：從 d 格外拖回來，每隻損失 1.35 × d / 1.125。
   * 走在路上的人改到家裡採。
   */
  const haulDeer = () => {
    for (const x of sites) {
      if (x.s.kind !== 'deer' || x === startHunt || x.hauled || x.left <= 0 || x.s.contested) continue
      const lost = Math.min(0.5, (1.35 * x.s.dist) / 1.125 / 350)
      x.left *= 1 - lost
      x.hauled = true
      x.camp = 2
      x.s = { ...x.s, dist: 3 }
    }
  }
  const incoming = (id: string) => walkers.reduce((n, w) => n + (w.to === id ? 1 : 0), 0)
  const room = (x: SiteSt) => slots(x) - x.workers - incoming(x.s.id)

  const point = (from: string): Site | null => {
    if (from === 'tc') return null
    if (from.startsWith('b:')) {
      const b = blds.find((y) => y.uid === Number(from.slice(2)))
      return b ? { ...FARM_SITE, dist: b.at, angle: b.angle } : null
    }
    return siteById.get(from)?.s ?? null
  }
  const walkTime = (from: string, to: string) => siteDistance(point(from), point(to)) / (SPEED * mods.speed * wSpeed * tSpeed) + 1

  const log = (kind: PlanEvent['kind'], text: string, item?: string, cost?: Bundle, prepaid?: boolean) => {
    if (!rec) return
    const paid = cost && RES.some((r) => cost[r] > 0) ? { ...cost } : undefined
    events.push({ t, kind, text, item, pop: pop(), villagers, split: splitNow(), bank: { ...bank }, ...(paid ? { cost: paid } : {}), ...(paid && prepaid ? { prepaid } : {}) })
  }

  const splitNow = (): Bundle => {
    const s = zero()
    for (const x of sites) s[x.res] += x.workers
    for (const w of walkers) if (w.res) s[w.res] += 1
    return s
  }

  // ---------- 投放點 ----------
  const campItem = (res: Res): CatalogItem | null => {
    for (const id of spec.dropoff[res]) {
      const it = items.get(id)
      if (it && minAge(it) <= age) return it
    }
    return null
  }

  const needsCamp = (x: SiteSt) => x !== sheep && x !== farm && x.camp === 0 && x.s.dist > ctl.camp && !(x.res === 'wood' && spec.woodInstant)

  /** 回放：職業蓋的投放點座數夠不夠讓模擬再蓋一座（照投放點建築本身算座數：採礦營地同時收金和石，不能各算一次） */
  const scriptAllowsCamp = (it: CatalogItem, x: SiteSt) => {
    // 開局免費的投放點、本身是單位的投放點（圖格魯克工作象）不在職業的建築紀錄裡，不受限制
    if (!script || it.kind === 'unit' || script.untracked?.includes(it.id) || freeDropUsed < spec.freeDropoffs) return true
    // 知道職業那座營地是給哪種資源用的（採礦營地：金或石），就分開算座數
    const resOf = (b: Bld) => sites.find((y) => y.s.id === b.siteId)?.res
    const proN = script.dropoffs.filter((d) => d.t <= t && d.id === it.id && (!d.res || d.res === x.res)).length
    const simN = blds.filter((b) => b.role === 'camp' && b.item === it.id && (!script.dropoffs.some((d) => d.id === it.id && d.res) || resOf(b) === x.res)).length
    if (proN > simN) return true
    // 職業一座營地同時收兩種資源（懸崖等地圖金礦、石礦相鄰），模擬的乾燥阿拉伯兩個礦分開：
    // 職業已經有這種營地、而且正在採這種資源（前後 30 秒每秒 1 以上）時，這種資源可以有自己的第一座
    // （以前龍騎士團一場職業只蓋 1 座採礦營地，模擬的石頭只能走回城鎮中心交，城鎮中心晚 50 秒）
    if (!script.dropoffs.some((d) => d.t <= t && d.id === it.id)) return false
    if (blds.some((b) => b.role === 'camp' && b.item === it.id && resOf(b) === x.res)) return false
    // 每秒 1 以上（約 2 名村民持續在採；0.5 時戰國開局採一點石頭就多蓋一座 100 木的祭典，封建晚 34 秒）
    const ts = script.income.t
    // 有每分鐘採集量就用它（累計收入含市場買的資源，戰國用黃金買木材時會被誤當成在採木材）
    const pm = script.perMin?.[x.res]
    if (pm) {
      const i = ts.findIndex((y) => y >= t + 30)
      return (pm[i < 0 ? ts.length - 1 : i] ?? 0) / 60 >= 1
    }
    const at = (u: number) => {
      const i = ts.findIndex((y) => y >= u)
      return script.income[x.res][i < 0 ? ts.length - 1 : Math.max(0, i)]
    }
    return (at(t + 30) - at(t - 30)) / 60 >= 1
  }
  /** 有木材就派這名村民去蓋投放點；回傳是否成功 */
  const tryCamp = (x: SiteSt, from: string) => {
    // 回放：職業還沒蓋這種投放點就不蓋營地（例如只去採一趟石頭，走回城鎮中心投放）。
    // 有好幾種投放點時（蘭開斯特：磨坊或莊園），用職業蓋了的那一種；以前只看第一種，職業不蓋磨坊時鹿群一直沒有投放點
    let it = campItem(x.res)
    if (script && it && !scriptAllowsCamp(it, x)) {
      it = null
      for (const id of spec.dropoff[x.res]) {
        const y = items.get(id)
        // 只換成職業真的蓋過的那種（紀錄裡沒有的投放點，例如馬其頓大酒莊，不拿來替代）
        if (y && minAge(y) <= age && script.dropoffs.some((d) => d.id === id) && scriptAllowsCamp(y, x)) {
          it = y
          break
        }
      }
    }
    if (!it) return false
    const v = variationAt(it, age)
    // 開局送的投放點（圖格魯克的工作象）不用錢
    const isFree = freeDropUsed < spec.freeDropoffs
    const cost = isFree ? zero() : costOf(v)
    // 伐木場會讓房屋木材更快湊齊，所以可以動用房屋預留的木材
    if (!affordable(cost, x.res === 'wood')) return false
    if (isFree) freeDropUsed++
    pay(cost)
    x.camp = 1
    if (it.kind === 'unit') {
      // 圖格魯克工作象：城鎮中心訓練後走過去，不用村民
      const b = addBld({ item: it.id, step: -1, role: 'camp', done: false, progress: 0, total: (isFree ? 0 : v.time) + x.s.dist / SPEED, builders: 1, at: x.s.dist, angle: x.s.angle, siteId: x.s.id, job: null })
      b.builders = 0
      autoBuild.push(b)
      log('place', `訓練${name(it.id)}送到${x.s.label}`, it.id, cost)
      return false
    }
    const b = addBld({ item: it.id, step: -1, role: 'camp', done: false, progress: 0, total: v.time, builders: 0, at: x.s.dist, angle: x.s.angle, siteId: x.s.id, job: null })
    walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, x.s.id) + opDelay, res: null })
    log('place', `蓋${name(it.id)}（${x.s.label}）`, it.id, cost)
    return true
  }
  const autoBuild: Bld[] = []
  let freeDropUsed = 0
  /** 地標（升代建築）只會在升代步驟蓋；當被動收入來源時，蓋好才開始算 */
  const isLandmark = (it: CatalogItem) => it.variations.some((v) => v.tags.some((x) => x.startsWith('toAge')))
  /** 文明專屬科技的前置（肥沃月彎要經濟側翼、大名御殿要大名宅邸） */
  const ecoReady = (id: string) => {
    const ct = spec.civTechs.find((c) => c.id === id)
    // 互斥：一般版與改良版只能研究一種
    if (ct?.excludes?.some((x) => researched.has(x) || researching.has(x))) return false
    if (spec.civTechs.some((c) => c.excludes?.includes(id) && (researched.has(c.id) || researching.has(c.id)))) return false
    const req = ct?.requires
    if (!req) return true
    return (Array.isArray(req) ? req : [req]).some((r) => owned(r) || researched.has(r) || fired.has(r))
  }
  /** 被動收入來源要村民另外蓋的才放：地標、城鎮中心（蘇格蘭開局送的牛）、科技（維京蜂箱）都不放 */
  const trickleBuildable = (it: CatalogItem, tr?: { as?: 'building' }) => (it.kind === 'building' || tr?.as === 'building') && !isLandmark(it) && !isTC(it.id)

  // ---------- 資源 ----------
  /** 一般花費：扣掉之後仍要留下村民生產的費用，以及快要蓋的房屋木材 */
  const affordable = (c: Bundle, forHouse = false) => {
    // 回放：職業出村民、蓋房的時間已經照實回放，不另外預留
    const keep = !script && producingVills() ? reserve() : zero()
    if (!forHouse && !script) keep.wood += houseWoodSoon()
    // 只檢查這筆花費會用到的資源：不花木材的東西（地標、村民）不該被房屋預留的木材擋住
    return RES.every((r) => c[r] <= 0 || bank[r] - c[r] >= keep[r] - 1e-9)
  }
  /** 房屋（長屋）快要需要時先保留木材 */
  const houseWoodSoon = () => (data.houseId && houseNeeded(2) ? costOf(variationAt(items.get(data.houseId)!, age)).wood : 0)
  const affordableRaw = (c: Bundle) => RES.every((r) => bank[r] >= c[r] - 1e-9)
  const addRes = (k: string, amt: number) => {
    if ((RES as string[]).includes(k)) bank[k as Res] += amt
    else other[k] = (other[k] ?? 0) + amt
  }
  const pay = (c: Bundle) => {
    for (const r of RES) bank[r] -= c[r]
  }
  /** 特殊資源（橄欖油、白銀…）不預留，夠就能花 */
  const hasOther = (o: Record<string, number> | null, n = 1) => !o || Object.entries(o).every(([k, x]) => (other[k] ?? 0) >= x * n - 1e-9)
  const payOther = (o: Record<string, number> | null, n = 1) => {
    if (o) for (const [k, x] of Object.entries(o)) other[k] = (other[k] ?? 0) - x * n
  }

  // ---------- 選採集點 ----------
  const naturalFood = () => sites.filter((x) => x.res === 'food' && x !== farm && usable(x))
  const usable = (x: SiteSt) => {
    if (x.left <= 0) return false
    if (x.s.contested) return false
    if (x.s.kind === 'deer' && !policy.hunt && x !== startHunt) return false
    return true
  }

  const bestSite = (res: Res): SiteSt | null => {
    let best: SiteSt | null = null
    let bestScore = -1
    for (const x of sites) {
      if (x.res !== res || x === farm || !usable(x) || room(x) <= 0) continue
      // 特殊資源要靠採野果（拜占庭橄欖油）時，野果排在羊前面
      if (preferBerry && x.s.kind === 'berry') {
        const sc = 100 + effRate(x, !!campItem(res))
        if (sc > bestScore) {
          best = x
          bestScore = sc
        }
        continue
      }
      // 羊在城鎮中心旁先採，但最多幾人由搜尋決定（policy.sheepCap），多的人去野果、鹿群。
      // 其他點：投放點蓋好後的速率，扣掉從城鎮中心走過去的時間（每名村民都要走）與還沒有投放點時蓋營地的時間，
      // 攤到約 2 分鐘的採集上。以前只扣每格 0.002，會把村民派去 25 格外的鹿群，而不是 10 格外的野果。
      // 還沒有投放點又付不起時，照「走回城鎮中心投放」的實際速率算（不然會把人派去遠處、一路走回家）
      const camp = campItem(res)
      const fresh = needsCamp(x) && x.workers + incoming(x.s.id) === 0
      const canCamp = !!camp && (!needsCamp(x) || x.camp !== 0 || affordable(costOf(variationAt(camp, age)), res === 'wood'))
      const setup = x.s.dist / (SPEED * mods.speed * wSpeed * tSpeed) + (camp && fresh && canCamp ? variationAt(camp, age).time : 0)
      // 羊優先，但如果已經有投放點的同類點比羊快 8% 以上（例如德里在野果蓋好磨坊），就不再優先
      const sheepFirst = x === sheep && !sites.some((y) => y !== sheep && y !== farm && y.res === 'food' && y.camp === 2 && usable(y) && room(y) > 0 && effRate(y) > effRate(sheep) * 1.08)
      const score = x === startHunt ? 100 : sheepFirst ? 99 : (effRate(x, canCamp) * ctl.setup) / (ctl.setup + setup)
      if (score > bestScore) {
        best = x
        bestScore = score
      }
    }
    if (!best && res !== 'food') {
      for (const x of sites) if (x.res === res && x.left > 0 && room(x) > 0) return x
    }
    if (!best && res === 'food' && room(farm) > 0) return farm
    return best
  }

  const counts = (): Bundle => splitNow()
  /** 正在採 + 10 秒內會走到的人數 */
  const countsNear = (): Bundle => {
    const s = zero()
    for (const x of sites) s[x.res] += x.workers
    for (const w of walkers) if (w.res && w.eta <= t + 10) s[w.res] += 1
    return s
  }

  // ---------- 分配 ----------
  let target: Bundle = { food: 1, wood: 0, gold: 0, stone: 0 }
  /** need() 發現特殊資源要靠野果時設成 true */
  let preferBerry = false

  const sendTo = (from: string, res: Res): boolean => {
    const x = bestSite(res)
    if (x) {
      if (needsCamp(x) && x.workers + incoming(x.s.id) === 0 && tryCamp(x, from)) return true
      walkers.push({ to: x.s.id, eta: t + walkTime(from, x.s.id) + (from === 'tc' ? 0 : opDelay), res })
      return true
    }
    if (res === 'food') {
      // 蓋造中的多人農田（畜欄 4 人、牧場 2 人）還有空位：先去幫忙蓋，完成後直接採
      if (spec.farm.slots > 1) {
        for (const b of blds) {
          if (b.done || b.role !== 'farm') continue
          const tgt = `b:${b.uid}`
          const coming = b.builders + walkers.filter((w) => w.to === tgt).length
          if (coming < spec.farm.slots) {
            walkers.push({ to: tgt, eta: t + walkTime(from, 'farm') + opDelay, res: null })
            return true
          }
        }
      }
      // 沒有天然食物：蓋農田
      const it = items.get(spec.farm.id)
      if (!it) return false
      const cost = costOf(variationAt(it, age))
      if (!affordable(cost)) return false
      pay(cost)
      const b = addBld({ item: spec.farm.id, step: -1, role: 'farm', done: false, progress: 0, total: buildTimeOf(it.id, variationAt(it, age)), builders: 0, at: 5, angle: 0.3 + farmsBuilt * 0.2, job: null })
      walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, 'farm') + opDelay, res: null })
      log('place', `蓋${name(spec.farm.id)}（第 ${farmsBuilt + 1} 座）`, spec.farm.id, cost)
      return true
    }
    return false
  }

  const pickRes = (): Res[] => {
    const c = counts()
    const N = RES.reduce((s2, r) => s2 + c[r], 0) + 1
    // 回放：照職業的分配，不加硬性下限
    const floor = script ? zero() : productionFloor(N)
    const near = countsNear()
    return [...RES].sort((a, b) => {
      const fa = near[a] < floor[a] ? 1 : 0
      const fb = near[b] < floor[b] ? 1 : 0
      if (fa !== fb) return fb - fa
      return target[b] - c[b] - (target[a] - c[a])
    })
  }

  const assignFree = () => {
    while (free.length) {
      const v = free.pop()!
      let ok = false
      for (const r of pickRes()) {
        if (sendTo(v.from, r)) {
          ok = true
          break
        }
      }
      if (!ok) {
        // 真的沒事做：去砍木頭（林線假設用不完）
        const x = sites.find((s) => s.res === 'wood' && s.left > 0)
        if (x) walkers.push({ to: x.s.id, eta: t + walkTime(v.from, x.s.id) + (v.from === 'tc' ? 0 : opDelay), res: 'wood' })
        else idle++
      }
    }
  }
  let idle = 0
  let tcIdle = 0
  // 目標達成後的全力出兵
  const post: PostArmy = opts.post ?? { units: 0, upgrades: 0 }
  let postStart: number | null = null
  let armyAt: number | null = null
  let postUnits = 0
  let postUpgrades = 0
  const postMix: Record<string, number> = {}
  const postTechs: string[] = []
  let villagersAtGoal = 0
  let gatheredAtGoal: Bundle | null = null
  const tcIdleReasons: Record<string, number> = {}

  // ---------- 需求 ----------
  const stepCost = (st: Step): Bundle => {
    const out = zero()
    if (st.kind === 'age') {
      const o = ageOption(st)
      if (o) {
        const c = ageCost(o)
        for (const r of RES) out[r] += c[r]
      }
      return out
    }
    const it = items.get(st.item)
    if (!it) return out
    const c = costOf(variationAt(it, Math.max(age, minAge(it))))
    let n = 1
    if (st.kind === 'build') n = st.count - (placed.get(steps.indexOf(st)) ?? 0)
    if (st.kind === 'army') {
      const v = variationAt(it, Math.max(age, minAge(it)))
      const left = st.count - armyHave(st.item)
      const prods = Math.max(1, policy.steps[steps.indexOf(st)]?.producers ?? 1)
      n = Math.min(left, prods * Math.max(1, Math.ceil(60 / Math.max(5, v.time))))
    }
    if (st.kind === 'villagers') return out
    for (const r of RES) out[r] += c[r] * Math.max(0, n)
    return out
  }

  const ageOption = (st: Step): AgeOption | undefined => (data.ageOptions[st.age!] ?? []).find((o) => o.id === st.item)
  /** 朝代：這個時代還沒蓋的另一座地標 */
  const dynastyNext = (a: number) => (data.ageOptions[a] ?? []).find((o) => o.mode === 'building' && !blds.some((b) => b.item === o.id))

  const villCost = (): Bundle => {
    const it = workerItem()
    if (!it || spec.freeVillagers) return zero()
    const c = costOf(variationAt(it, age))
    for (const r of RES) c[r] *= spec.villagerBatch
    return c
  }
  const trainTime = () => {
    const it = workerItem()
    return ((spec.trainTimeByAge?.[age - 1] ?? (it ? variationAt(it, age).time : 20)) * tVillTime) / golden.prod / (1 + (spec.governors ? govState().villagerSpeed : 0))
  }
  const tcIds = new Set([...items.keys()].filter((id) => isTownCenter(data, id)))
  const isTC = (id: string) => tcIds.has(id)
  /** 會訓練村民的城鎮中心（含兼城鎮中心的地標） */
  const tcList = () => blds.filter((b) => b.done && isTC(b.item))
  const batchSize = spec.villagerBatch
  /** 軍隊每次生產的單位數與整批時間（拜占庭長弓兵 4 隻一批） */
  const unitBatch = (id: string, v: Variation) => {
    const b = spec.batches[id] ?? spec.batches['*']
    return { size: b?.size ?? 1, time: b?.time ?? v.time }
  }
  /** 正在城鎮中心訓練中的村民（已經付錢、佔人口） */
  const training = () => blds.reduce((n, b) => n + (b.job?.kind === 'vill' ? b.job.count : 0), 0)
  /** 已承諾的人口：現有 + 訓練中的村民 */
  const cpop = () => pop() + training()
  /** 還沒排進生產的軍隊目標所需人口（村民不能把它佔掉） */
  const armyReserve = () => {
    let n = 0
    // 同一種兵的目標數量是累計的：每種兵只留「最大目標 − 已排入」的人口
    const short = new Map<string, number>()
    steps.forEach((st, i) => {
      if (st.kind !== 'army' || stepDone[i] != null) return
      // 回放：只留時間已到的兵的人口（職業的兵是陸續出的、也會陣亡；全部預留的話，蘭開斯特 135 名兵會讓村民卡在 32 名）
      if (script && (st.earliest ?? 0) > t) return
      short.set(st.item, Math.max(short.get(st.item) ?? 0, st.count - armyHave(st.item)))
    })
    for (const [id, k] of short) {
      const it = items.get(id)
      const p = it ? variationAt(it, Math.max(age, minAge(it))).pop : 1
      n += Math.max(0, k) * p
    }
    if (post.units > 0) n += Math.max(0, post.units - postQueued)
    return n
  }
  /** 村民最多能用到的人口：200 減掉要留給軍隊目標的 */
  const villagerPopLimit = () => 200 - armyReserve()
  /** 硬性規則：只要人口、村民容量允許就生產 */
  const producingVills = () => villagers + training() < vilCap() && cpop() + batchSize <= villagerPopLimit() && (!script || villagers + training() < scriptedVills(t))

  /** 每座城鎮中心保留下一批村民的費用（有備用工人時取最便宜的組合，保證至少能訓練它） */
  const reserve = (): Bundle => {
    const choices = workerChoices()
    const c = choices.length ? { ...choices[0].cost } : zero()
    for (const w of choices.slice(1)) for (const r of RES) c[r] = Math.min(c[r], w.cost[r])
    const n = tcList().length
    for (const r of RES) c[r] *= n
    return c
  }

  const need = (): Bundle => {
    const n = zero()
    if (postStart != null && postOn()) postNeed(n)
    const st = steps[cur]
    if (st) {
      const c = stepCost(st)
      for (const r of RES) n[r] += c[r]
      // 預先布局：這一步的錢已經存夠了，就把下一步的花費也算進需求，讓人力提早移過去
      const nx = steps[cur + 1]
      if (nx && RES.every((r) => bank[r] >= c[r] - 1e-9)) {
        const c2 = stepCost(nx)
        for (const r of RES) n[r] += c2[r]
      }
      // 往後看：接下來 ctl.look 秒的收入付得起的步驟也算進需求（目標很多、每步很小時，分配才不會每一步都大翻轉、一直有人在走路）
      if (ctl.look > 0) {
        let budget = ctl.look * Math.max(1, villagers) * 0.6 - RES.reduce((s, r) => s + n[r], 0)
        for (let i = cur + 2; i < steps.length && budget > 0; i++) {
          if (steps[i].kind === 'age') break
          const c3 = stepCost(steps[i])
          const tot = RES.reduce((s, r) => s + c3[r], 0)
          if (tot > budget) break
          for (const r of RES) n[r] += c3[r]
          budget -= tot
        }
      }
      // 特殊資源不夠：換算成要多採的來源資源（例如橄欖油來自採野果）。看所有還沒做的步驟，才會提早去採。
      const want: Record<string, number> = {}
      preferBerry = false
      for (let i = cur; i < steps.length; i++) {
        const sx = steps[i]
        if (sx.kind !== 'army' && sx.kind !== 'tech') continue
        const it = items.get(sx.item)
        if (!it) continue
        const v = variationAt(it, Math.max(age, minAge(it)))
        const o = otherOf(v)
        if (!o) continue
        const left = sx.kind === 'army' ? Math.max(0, sx.count - armyHave(sx.item)) : researched.has(sx.item) || researching.has(sx.item) ? 0 : 1
        for (const [key, x] of Object.entries(o)) want[key] = (want[key] ?? 0) + x * left
      }
      for (const [key, x] of Object.entries(want)) {
        const deficit = x - (other[key] ?? 0)
        const bp = spec.byproducts.filter((p) => p.to === key).sort((p, q) => q.ratio - p.ratio)[0]
        if (deficit <= 0 || !bp) continue
        const from: Res[] = bp.from === 'all' ? RES : bp.from === 'hunt' || bp.from === 'berry' || bp.from === 'farm' || bp.from === 'fish' ? ['food'] : [bp.from]
        // 只算接下來約 2 分鐘的量，避免一次把所有人拉去採
        for (const r of from) n[r] += Math.min(deficit, 600) / bp.ratio / from.length
        if (bp.from === 'berry') preferBerry = true
      }
      // 軍隊步驟還缺的生產建築
      if (st.kind === 'army') {
        const p = producerFor(st.item)
        const want = Math.max(1, policy.steps[cur]?.producers ?? 1)
        if (p) {
          const have = blds.filter((b) => b.item === p).length
          const bc = costOf(variationAt(items.get(p)!, age))
          for (const r of RES) n[r] += bc[r] * Math.max(0, want - have)
        }
      }
    }
    for (const [id, at] of Object.entries(policy.ecoAt)) {
      if (at < 0 || at > cur || researched.has(id) || researching.has(id)) continue
      const it = items.get(id)
      if (!it || minAge(it) > age) continue
      if (!ecoReady(id)) {
        // 前置是還沒蓋的建築（村落要塞要主堡、改良科技要敖包）：先把它的花費算進需求
        const req = spec.civTechs.find((x) => x.id === id)?.requires
        const b = (Array.isArray(req) ? req : req ? [req] : []).find((x) => isBuildable(data, x) && !blds.some((y) => y.item === x))
        const bi = b ? items.get(b) : undefined
        if (bi && minAge(bi) <= age) {
          const bc = costOf(variationAt(bi, age))
          for (const r of RES) n[r] += bc[r]
        }
        continue
      }
      const c = costOf(variationAt(it, age))
      for (const r of RES) n[r] += c[r]
    }
    // 朝代要補蓋的地標
    for (const a of spec.dynasty ?? []) {
      if (!policy.dynasty?.[a] || age < a) continue
      const o = dynastyNext(a)
      if (o) {
        const c = ageCost(o)
        for (const r of RES) n[r] += c[r]
      }
    }
    if (spec.herd && (policy.herd ?? 0) > herdBought + herdTraining) for (const [r, x] of Object.entries(spec.herd.cost)) n[r as Res] += x ?? 0
    if (spec.officials && (policy.officials ?? 0) > officialsN - spec.officials.start + officialsTraining) for (const [r, x] of Object.entries(spec.officials.cost)) n[r as Res] += x ?? 0
    for (const su of spec.support ?? []) {
      if (Math.min(su.max, policy.support?.[su.unit] ?? 0) <= (supportN.get(su.unit) ?? 0) + (supportTraining.get(su.unit) ?? 0)) continue
      if (su.requires && !owned(su.requires) && !researched.has(su.requires)) continue
      const it = items.get(su.unit)
      if (it && minAge(it) <= age) {
        const c = costOf(variationAt(it, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 聖物與聖地：修道院類建築、宗教單位
    if (holy && relUnit && relHome && ((policy.relics ?? 0) > relicsHeld || (policy.sites ?? 0) > sitesHeld) && age >= (spec.sanctity ? spec.sanctity.fromAge : 3)) {
      const hb = items.get(relHome)
      if (hb && !hasRelProducer() && minAge(hb) <= age) {
        const c = costOf(variationAt(hb, age))
        for (const r of RES) n[r] += c[r]
      }
      if (monks + monkTraining === 0 && minAge(relUnit) <= age) {
        const c = costOf(variationAt(relUnit, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 捕魚：碼頭、漁船（漁船從黑暗時代就能訓練，Fandom；目錄標封建）
    if (fiUnit && wantBoats() > boats + boatTraining) {
      const hb = fiHome ? items.get(fiHome) : undefined
      const c = !blds.some((b) => fiProducers.includes(b.item)) ? (hb && minAge(hb) <= age ? costOf(variationAt(hb, age)) : null) : costOf(variationAt(fiUnit, age))
      if (c) for (const r of RES) n[r] += c[r]
    }
    // 陸地貿易：市場、商人、收費哨站、使者
    if (trUnit && wantTraders() > paidTraders()) {
      const hb = trHome ? items.get(trHome) : undefined
      if (!blds.some((b) => trProducers.includes(b.item))) {
        if (hb && minAge(hb) <= age) {
          const c = costOf(variationAt(hb, age))
          for (const r of RES) n[r] += c[r]
        }
      } else if (minAge(trUnit) <= age) {
        const c = costOf(variationAt(trUnit, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    if (tsp?.tolls && traderNext.length + traderTraining > 0 && blds.filter((b) => b.item === tsp.tolls!.building).length < wantTolls()) {
      const it = items.get(tsp.tolls.building)
      if (it && minAge(it) <= age) {
        const c = costOf(variationAt(it, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    if (tsp?.speedAura && traderNext.length + traderTraining > 0 && blds.filter((b) => b.item === tsp.speedAura!.building && b.anchor === 'yam').length < wantYams()) {
      const it = items.get(tsp.speedAura.building)
      if (it && minAge(it) <= age) {
        const c = costOf(variationAt(it, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    if (tsp?.tributary && wantTribs() > tribs.length + envoyArrive.length + envoys + envoyTraining) {
      const it = items.get(tsp.tributary.unit)
      if (it && minAge(it) <= age && tsp.tributary.at.some((id) => owned(id))) {
        const c = costOf(variationAt(it, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 還要訓練的學者（與清真寺）
    if (spec.scholars && (policy.scholars ?? 0) > scholarsN + scholarsTraining) {
      const unit = items.get(spec.scholars.unit)
      if (unit && minAge(unit) <= age) {
        const c = costOf(variationAt(unit, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 英格蘭農田區磨坊
    if (spec.farmMill && farmMillShort()) {
      const it = items.get(spec.farmMill.building)
      if (it && minAge(it) <= age) {
        const c = costOf(variationAt(it, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 渡槽（拜占庭）：下一段的花費
    for (const z of spec.zones ?? []) {
      const lk = z.link
      if (!lk || !policy.link || !z.levels) continue
      const done = blds.filter((b) => b.done && b.item === z.building)
      const links = blds.filter((b) => b.item === lk.building && b.anchor === 'link').length
      const it = items.get(lk.building)
      if (!it || links >= Math.min(done.length - 1, z.levels.length - 1)) continue
      const c = costOf(variationAt(it, age))
      for (const r of RES) n[r] += c[r] * lk.minLen
    }
    // 還要蓋的光環建築（蓄水池）
    for (const z of spec.zones ?? []) {
      if (!z.max || (z.requires && !fired.has(z.requires) && !owned(z.requires))) continue
      // 回放：職業蓋的光環建築本來就是目標，不另外多蓋（以前拜占庭開局多蓋 1 座蓄水池，100 石頭）
      if (script && steps.some((st) => st.kind === 'build' && st.item === z.building)) continue
      const it = items.get(z.building)
      if (!it || minAge(it) > age) continue
      if (blds.filter((b) => b.item === z.building).length >= Math.min(z.max, zonePlan(spec, policy, map, z.building).length)) continue
      const c = costOf(variationAt(it, age))
      for (const r of RES) n[r] += c[r]
    }
    for (const tr of spec.trickles) {
      const p = policy.trickle?.[tr.building]
      if (!p || p.count <= 0 || p.at > cur) continue
      const it = items.get(tr.building)
      if (!it || minAge(it) > age || !trickleBuildable(it, tr) || blds.filter((b) => b.item === tr.building).length >= Math.min(tr.max, p.count)) continue
      const c = costOf(variationAt(it, age))
      for (const r of RES) n[r] += c[r]
    }
    if (producingVills()) {
      const c = villCost()
      const k = (45 / trainTime()) * tcs()
      for (const r of RES) n[r] += c[r] * k
    }
    n.wood += houseWoodSoon()
    // 天然食物快吃完：預留農田木材
    const natural = naturalFood().reduce((s, x) => s + x.left, 0)
    const foodWorkers = counts().food
    if (natural < foodWorkers * 0.6 * ctl.farmLead) {
      const it = items.get(spec.farm.id)
      if (it) n.wood += costOf(variationAt(it, age)).wood * Math.min(6, Math.max(1, Math.ceil((foodWorkers - farmSlots()) / spec.farm.slots)))
    }
    return n
  }

  /**
   * 每種資源最少要有幾人採，才能讓所有城鎮中心連續生產村民、房屋準時蓋好。
   * 庫存已經夠付好幾批時不設下限。
   */
  const productionFloor = (N: number): Bundle => {
    const out = zero()
    const rateOf = (r: Res) => {
      const x = bestSite(r) ?? sites.find((y) => y.res === r && y.workers > 0)
      // 投放點還沒蓋（也沒在蓋）時用實際速率：村民要走回城鎮中心交
      return x ? effRate(x, x.camp !== 0) : 0
    }
    if (producingVills()) {
      const c = villCost()
      const k = tcList().length / trainTime()
      for (const r of RES) {
        if (c[r] <= 0) continue
        if (bank[r] >= c[r] * tcList().length * 3) continue
        const eff = rateOf(r)
        if (eff > 0) out[r] = Math.ceil((c[r] * k * 1.15) / eff)
      }
    }
    const houseWood = houseWoodSoon()
    if (houseWood > 0 && bank.wood < houseWood) {
      const eff = rateOf('wood') || 0.5
      // 要在「人口用完 − 蓋房時間」之前湊到木材
      const window = Math.max(8, Math.min(60, houseSlack()))
      out.wood = Math.max(out.wood, Math.min(10, Math.max(2, Math.ceil((houseWood - bank.wood) / (eff * window)))))
    }
    // 下限總和不能超過人數
    let total = RES.reduce((a, r) => a + out[r], 0)
    while (total > N) {
      const r = RES.filter((x) => out[x] > 0).sort((a, b) => out[b] - out[a])[0]
      out[r]--
      total--
    }
    return out
  }

  const rebalance = () => {
    lastRebalance = t
    const c = counts()
    const N = RES.reduce((s, r) => s + c[r], 0) + free.length
    if (N <= 0) return
    const n = need()
    const share = zero()
    let tot = 0
    for (const r of RES) {
      const def = Math.max(0, n[r] - bank[r])
      const x = bestSite(r) ?? sites.find((s) => s.res === r && s.workers > 0)
      const rate = x ? effRate(x, true) : 0
      share[r] = rate > 0 ? def / rate : 0
      tot += share[r]
    }
    const sp = policy.steps[cur]
    // 回放：照「追上職業累計收入還差多少 ÷ 這種資源的採集速率」分配
    if (script) {
      // 每種資源要在 60 秒內追上職業的累計收入：需要「缺口 ÷（每人速率 × 60 秒）」人；人數有剩就照 2 分鐘後的缺口比例分
      const near40 = scriptNeed(60)
      const far = scriptNeed(120)
      const rate = zero()
      for (const r of RES) {
        const x = bestSite(r) ?? sites.find((s) => s.res === r && s.workers > 0)
        rate[r] = x ? effRate(x, true) : 0
      }
      const want = zero()
      for (const r of RES) want[r] = rate[r] > 0 ? near40[r] / (rate[r] * 60) : 0
      const sumW = RES.reduce((a, r) => a + want[r], 0)
      if (sumW >= N) for (const r of RES) share[r] = want[r]
      else {
        const farW = zero()
        for (const r of RES) farW[r] = rate[r] > 0 ? far[r] / rate[r] : 0
        const sumF = RES.reduce((a, r) => a + farW[r], 0)
        for (const r of RES) share[r] = want[r] + (sumF > 0 ? ((N - sumW) * farW[r]) / sumF : 0)
      }
      tot = RES.reduce((a, r) => a + share[r], 0)
    }
    if (tot <= 0) {
      // 沒有缺口：照目前的比例，新村民偏向食物、木材
      for (const r of RES) share[r] = c[r] + (r === 'food' ? 1 : r === 'wood' ? 0.6 : r === 'gold' ? 0.3 : 0)
      tot = RES.reduce((s, r) => s + share[r], 0)
    }
    for (const r of RES) share[r] = share[r] / tot
    const pb = script ? undefined : policy.phaseBias?.[Math.floor(t / PHASE_SEC)]
    for (const r of RES) {
      const b = script ? 0 : (sp?.bias[r] ?? 0) + (pb?.[r] ?? 0)
      share[r] = Math.max(0, share[r] + b * (r === 'stone' && n.stone <= bank.stone ? 0 : 1))
    }
    const sum = RES.reduce((s, r) => s + share[r], 0) || 1
    const raw = RES.map((r) => ({ r, v: (share[r] / sum) * N }))
    const tgt = zero()
    let used = 0
    for (const x of raw) {
      tgt[x.r] = Math.floor(x.v)
      used += tgt[x.r]
    }
    raw.sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))
    for (let i = 0; used < N && i < raw.length; i++, used++) tgt[raw[i].r]++
    // 硬性下限：村民生產與房屋所需的收入一定要有人採（回放時照職業的分配，不加下限）
    const floor = script ? zero() : productionFloor(N)
    for (const r of RES) {
      while (tgt[r] < floor[r]) {
        const donor = RES.filter((x) => x !== r && tgt[x] > floor[x]).sort((a, b) => tgt[b] - floor[b] - (tgt[a] - floor[a]))[0]
        if (!donor) break
        tgt[donor]--
        tgt[r]++
      }
    }
    // 回放：時間已到的動作缺的資源，保證有足夠的人去採（約 30 秒補齊、至少 1 人），從人最多的資源調
    if (script) {
      // 不從村民生產、房屋需要的資源調人（以前城鎮中心缺 300 石頭時把所有人調去採石，阿拔斯 4:00～5:20 沒人採食物、停產村民）
      const pf = productionFloor(N)
      for (const r of RES) {
        if (pendShort[r] <= 0) continue
        const x = bestSite(r)
        const rate = x ? effRate(x, true) : 0
        if (rate <= 0) continue
        // 已經在採的人不調走，直到錢湊齊（照缺口重算人數的話，缺口越小人越少，最後幾十塊要拖很久）
        const want = Math.min(N, Math.max(1, Math.ceil(pendShort[r] / (rate * 30)), pendAge ? c[r] : 0))
        while (tgt[r] < want) {
          const donor = RES.filter((y) => y !== r && tgt[y] > pf[y] && pendShort[y] <= 0).sort((a, b) => tgt[b] - tgt[a])[0]
          if (!donor) break
          tgt[donor]--
          tgt[r]++
        }
      }
    }
    target = tgt
    // 回放：職業蓋了投放點之後，已經有人在採、還沒有營地的點補蓋（第一名村民可能在職業蓋營地之前就去了）
    if (script) for (const x of sites) if (x.workers > 0 && needsCamp(x)) tryCamp(x, x.s.id)
    // 先用新目標分派空閒村民，再看要不要搬人。
    // 以前是先用舊目標分派（開局時舊目標只有「食物 1」），開局第 3 名村民會被排去採木材，
    // 之後又因為搬人的遲滯（差距 < 3 不搬）卡在木材 20 多秒才調回食物。
    if (free.length) assignFree()

    // 搬人：多的搬去少的，每次最多 15%
    // 回放時一樣用一般的搬人限制（試過立刻全數調整，走路的人更多、收入反而略低）
    let moves = Math.max(2, Math.ceil(N * ctl.move))
    const moved: string[] = []
    while (moves > 0) {
      const now = counts()
      // 下限只算已經在採或 10 秒內會到的人；從不把人從低於下限的資源拉走
      const near = countsNear()
      const over = RES.filter((r) => now[r] > tgt[r] && near[r] - 1 >= floor[r]).sort((a, b) => now[b] - tgt[b] - (now[a] - tgt[a]))[0]
      // 低於硬性下限的資源先補，且不受遲滯限制
      const below = RES.filter((r) => near[r] < floor[r]).sort((a, b) => floor[b] - near[b] - (floor[a] - near[a]))[0]
      const under = below ?? RES.filter((r) => now[r] < tgt[r]).sort((a, b) => tgt[b] - now[b] - (tgt[a] - now[a]))[0]
      if (!over || !under) break
      // 遲滯：差距太小就不搬，避免來回走
      if (!below && now[over] - tgt[over] + (tgt[under] - now[under]) < (script ? 2 : ctl.hyst)) break
      const from = sites.filter((x) => x.res === over && x.workers > 0).sort((a, b) => effRate(a) - effRate(b))[0]
      if (!from) break
      from.workers--
      if (!sendTo(from.s.id, under)) {
        from.workers++
        break
      }
      moved.push(`${RES_ZH[over]}→${RES_ZH[under]}`)
      moves--
    }
    // 同一種資源內換到更快的點（例如磨坊蓋好後，羊換去野果）：只換到已有投放點、還有空位、
    // 快 8% 以上、剩下的量夠多人採 60 秒以上的點；每次重算最多換 2 人，避免來回走
    for (const r of RES) {
      for (let k = 0; k < 2; k++) {
        const from = sites.filter((x) => x.res === r && x.workers > 0 && x !== farm).sort((a, b) => effRate(a) - effRate(b))[0]
        if (!from) break
        const to = sites
          .filter((x) => x.res === r && x !== from && x !== farm && usable(x) && room(x) > 0 && x.camp === 2 && effRate(x) > effRate(from) * 1.08)
          .sort((a, b) => effRate(b) - effRate(a))[0]
        if (!to || to.left < effRate(to) * 60 * (to.workers + incoming(to.s.id) + 1)) break
        from.workers--
        walkers.push({ to: to.s.id, eta: t + walkTime(from.s.id, to.s.id) + opDelay, res: r })
        moved.push(`${from.s.label}→${to.s.label}`)
      }
    }
    if (moved.length && rec) {
      const agg = new Map<string, number>()
      for (const m of moved) agg.set(m, (agg.get(m) ?? 0) + 1)
      log('rally', [...agg].map(([k, v]) => `${v} 名 ${k}`).join('，'))
    }
  }

  // ---------- 建造 ----------
  const takeBuilders = (k: number, b: Bld) => {
    const target = `b:${b.uid}`
    let got = 0
    // 每次挑走路最短的人：空閒村民或採集點上的村民（不拆農田）
    while (got < k) {
      let bestFree = -1
      let bestFreeT = Infinity
      free.forEach((v, i) => {
        const w = walkTime(v.from, target)
        if (w < bestFreeT) {
          bestFree = i
          bestFreeT = w
        }
      })
      let bestSite: SiteSt | null = null
      let bestSiteT = Infinity
      for (const x of sites) {
        if (x.workers <= 0 || x === farm) continue
        const w = walkTime(x.s.id, target)
        if (w < bestSiteT) {
          bestSite = x
          bestSiteT = w
        }
      }
      if (bestFree < 0 && !bestSite) break
      if (bestFree >= 0 && bestFreeT <= bestSiteT) {
        free.splice(bestFree, 1)
        walkers.push({ to: target, eta: t + bestFreeT + opDelay, res: null })
      } else {
        bestSite!.workers--
        walkers.push({ to: target, eta: t + bestSiteT + opDelay, res: null })
      }
      got++
    }
    return got
  }

  const place = (item: string, role: Bld['role'], step: number, builders: number, at: number, ageTo?: number, angle?: number) => {
    const it = items.get(item)!
    // 光環建築照策略的錨點擺放（建造者要走過去）
    const z = zoneBy.get(item)
    let anchor: string | undefined
    if (z) {
      const plan = zonePlan(spec, policy, map, item)
      anchor = plan[Math.min(plan.length - 1, blds.filter((b) => b.item === item).length)] ?? 'home'
      const ap = anchorPoint(anchor, z.half)
      at = ap.dist
      angle = ap.angle
    }
    const v = variationAt(it, Math.max(age, minAge(it)))
    let cost = role === 'step' && ageTo ? ageCost(ageOption(steps[step])!) : costOf(v)
    // 建築車（金帳）：軍事生產建築免費、15 秒展開
    const cart = role === 'prod' && cartTokens > 0
    if (cart) {
      cartTokens--
      cost = zero()
    }
    pay(cost)
    if (role === 'prod') addMilSpend(cost)
    const b = addBld({ item, step, role, done: false, progress: 0, total: cart ? 15 : buildTimeOf(item, v), builders: 0, at, angle: angle ?? (uid * 2.39996) % (Math.PI * 2), job: null, ageTo, anchor })
    const got = takeBuilders(builders, b)
    log('place', `蓋${name(item)}（${got} 人）`, item, cost)
    return b
  }

  /** 每秒新增的人口：城鎮中心 + 正在訓練的軍隊 */
  const popRate = () => {
    let r = (tcList().length * batchSize) / trainTime()
    for (const b of blds) {
      if (b.job?.kind === 'unit') r += (b.job.pop ?? 1) / Math.max(1, b.job.dur ?? 20)
      // 全力出兵時，閒著的生產建築下一秒就會出兵，也要算進去
      else if (postStart != null && b.done && !b.job && POST_TYPES.includes(b.item)) r += 1 / 20
    }
    return r
  }
  const houseNeeded = (scale = 1) => {
    if (!data.houseId) return false
    const it = items.get(data.houseId)
    if (!it) return false
    const pending = blds.filter((b) => !b.done && b.item === data.houseId).length
    // 蓋房要的時間：一人建造 + 走路與反應約 12 秒
    const lead = buildTimeOf(it.id, variationAt(it, age)) + ctl.houseLead
    const buffer = Math.ceil(lead * popRate() * scale) + 1 + policy.houseBuffer
    if (spec.freeVillagers) {
      const capV = vilCap() + pending * spec.freeVillagers.perHouse
      // 長屋 150 木材、30 秒：比一般房屋多留 2 名村民的時間來湊木材
      if (villagers + Math.ceil((lead * scale * tcList().length) / trainTime()) + 3 + policy.houseBuffer >= capV) return true
    }
    // 蓋到一半、或時間快到的加人口建築（蘇格蘭塔屋 +15）也算：職業 0:03 蓋塔屋就不另蓋房屋
    let soon = 0
    for (const [id, p] of Object.entries(spec.popBuildings ?? {})) {
      soon += blds.filter((b) => !b.done && b.item === id).length * p
      if (script) steps.forEach((st, i) => {
        if (st.kind === 'build' && st.item === id && !started.has(i) && stepDone[i] == null && (st.earliest ?? 0) <= t + lead) soon += p
      })
    }
    const projected = Math.min(200, popCap() + pending * spec.housePop + soon)
    return projected < 200 && cpop() + buffer >= projected
  }

  /** 距離人口（或維京村民容量）用完還有幾秒，扣掉蓋房時間 */
  const houseSlack = () => {
    const it = data.houseId ? items.get(data.houseId) : null
    if (!it) return Infinity
    const pending = blds.filter((b) => !b.done && b.item === data.houseId).length
    const lead = buildTimeOf(it.id, variationAt(it, age)) + ctl.houseLead
    const rate = Math.max(0.01, popRate())
    const room = spec.freeVillagers
      ? vilCap() + pending * spec.freeVillagers.perHouse - (villagers + training())
      : Math.min(200, popCap() + pending * spec.housePop) - cpop()
    return room / rate - lead
  }

  const producerFor = (unitId: string): string | null => {
    const it = items.get(unitId)
    if (!it) return null
    const v = variationAt(it, 4)
    for (const p of v.producedBy) {
      if (isTC(p)) continue
      const b = items.get(p)
      if (b && b.kind === 'building' && !variationAt(b, 4).tags.some((x) => x.startsWith('toAge')) && blds.some((x) => x.item === p)) return p
    }
    for (const p of v.producedBy) {
      if (isTC(p) || !isBuildable(data, p)) continue
      const b = items.get(p)!
      if (minAge(b) <= age) return p
    }
    return null
  }

  const idleProducers = (ids: string[]) => blds.filter((b) => b.done && !b.job && ids.includes(b.item))

  // ---------- 目標後全力出兵 ----------
  const smithId = () => SMITHS.find((id) => items.has(id) && minAge(items.get(id)!) <= age) ?? null
  const upgradeTarget = () => (SMITHS.some((id) => items.has(id)) ? post.upgrades : 0)
  const postOn = () => post.units > 0 || upgradeTarget() > 0
  const postTypes = () => POST_TYPES.filter((id) => items.has(id) && minAge(items.get(id)!) <= age)
  const unitCache = new Map<string, CatalogItem | null>()
  /** 這個特殊資源有沒有收入來源 */
  const specialSource = (k: string) =>
    spec.byproducts.some((b) => b.to === k) ||
    spec.trickles.some((x) => (x.perMin as Record<string, number>)[k] > 0) ||
    Object.values(spec.grants).some((g) => (g as Record<string, number>)[k] > 0) ||
    ((spec.startOther as Record<string, number>)[k] ?? 0) > 0
  /** 這座生產建築在這個時代最便宜的軍事單位（求「數量多」） */
  const postUnit = (type: string): CatalogItem | null => {
    const key = `${type}@${age}`
    if (unitCache.has(key)) return unitCache.get(key)!
    let best: CatalogItem | null = null
    let bestCost = Infinity
    for (const u of items.values()) {
      if (u.kind !== 'unit' || !u.military || u.id === 'scout' || minAge(u) > age) continue
      const v = variationAt(u, age)
      if (v.pop <= 0 || !v.producedBy.includes(type)) continue
      const o = otherOf(v)
      // 要特殊資源、但這個文明拿不到的單位不選（例如沒有橄欖油收入時的傭兵）
      if (o && !Object.keys(o).every(specialSource)) continue
      const tot = v.food + v.wood + v.gold + v.stone + (o ? Object.values(o).reduce((a, b) => a + b, 0) : 0)
      if (tot < bestCost) {
        best = u
        bestCost = tot
      }
    }
    unitCache.set(key, best)
    return best
  }
  const postWant = (types: string[]) => {
    const want = Math.max(1, policy.postProducers)
    return types.map((_, i) => Math.floor(want / types.length) + (i < want % types.length ? 1 : 0))
  }
  const nextUpgrade = (): CatalogItem | null => {
    const sid = smithId()
    if (!sid) return null
    let best: CatalogItem | null = null
    let bestCost = Infinity
    for (const it of items.values()) {
      if (it.kind !== 'technology' || minAge(it) > age || researched.has(it.id) || researching.has(it.id)) continue
      const v = variationAt(it, age)
      if (!v.producedBy.includes(sid)) continue
      const tot = v.food + v.wood + v.gold + v.stone
      if (tot < bestCost) {
        best = it
        bestCost = tot
      }
    }
    return best
  }
  let postResearching = 0
  let postQueued = 0

  const postNeed = (n: Bundle) => {
    const types = postTypes()
    const want = postWant(types)
    types.forEach((type, i) => {
      const u = postUnit(type)
      const have = blds.filter((b) => b.item === type).length
      if (have < want[i]) {
        const c = costOf(variationAt(items.get(type)!, age))
        for (const r of RES) n[r] += c[r] * (want[i] - have)
      }
      if (!u) return
      const v = variationAt(u, age)
      const k = Math.max(1, have) * (60 / Math.max(5, v.time))
      const c = costOf(v)
      for (const r of RES) n[r] += c[r] * k
    })
    if (postUpgrades + postResearching < upgradeTarget()) {
      const sid = smithId()
      if (sid && !blds.some((b) => b.item === sid)) {
        const c = costOf(variationAt(items.get(sid)!, age))
        for (const r of RES) n[r] += c[r]
      }
      const tech = nextUpgrade()
      if (tech) {
        const c = costOf(variationAt(tech, age))
        for (const r of RES) n[r] += c[r]
      }
    }
  }

  const postAct = () => {
    const types = postTypes()
    const want = postWant(types)
    // 生產建築：步兵、弓兵、騎兵輪流補到目標數量
    types.forEach((type, i) => {
      if (blds.filter((b) => b.item === type).length >= want[i]) return
      const c = costOf(variationAt(items.get(type)!, age))
      if (affordable(c)) place(type, 'prod', -2, 2, 10)
    })
    // 鐵匠舖與升級
    if (postUpgrades + postResearching < upgradeTarget()) {
      const sid = smithId()
      if (sid && !blds.some((b) => b.item === sid)) {
        const c = costOf(variationAt(items.get(sid)!, age))
        if (affordable(c)) place(sid, 'econ', -2, 1, 8)
      }
      const tech = nextUpgrade()
      if (sid && tech) {
        const v = variationAt(tech, age)
        const ps = idleProducers([sid])
        if (ps.length && affordable(costOf(v))) {
          pay(costOf(v))
          ps[0].job = { kind: 'tech', item: tech.id, ...supervise(ps[0], researchTime(v.time) * prodMods(ps[0].item, undefined, ps[0]).research), count: 1, step: -2 }
          researching.add(tech.id)
          postResearching++
          log('research', `研究${name(tech.id)}`, tech.id, costOf(v))
        }
      }
    }
    // 不斷出兵到目標數量（人口先留給村民；還缺升級時先留升級的錢，避免被單位吃光）
    const villRoom = producingVills() ? tcList().length * batchSize : 0
    const sid = smithId()
    const upTech = postUpgrades + postResearching < upgradeTarget() ? nextUpgrade() : null
    // 還沒有鐵匠舖：先留蓋它的錢；鐵匠舖閒著：先留下一項升級的錢
    const keepUp =
      upTech && sid && !blds.some((b) => b.item === sid)
        ? costOf(variationAt(items.get(sid)!, age))
        : upTech && sid && blds.some((b) => b.item === sid && b.done && !b.job)
          ? costOf(variationAt(upTech, age))
          : zero()
    for (const b of idleProducers(types)) {
      if (postQueued >= post.units) break
      const u = postUnit(b.item)
      if (!u) continue
      const v = variationAt(u, age)
      const ub = unitBatch(u.id, v)
      const pm = prodMods(b.item, u, b)
      const c = costOf(v)
      for (const r of RES) c[r] *= ub.size * pm.cost[r]
      const horse = !!spec.horses && horses >= 1 && spec.horses.at.includes(b.item) && v.cls.includes(spec.horses.cls)
      if (horse) for (const [r, x] of Object.entries(spec.horses!.discount)) c[r as Res] = Math.max(0, c[r as Res] - (x ?? 0))
      const withUp = zero()
      for (const r of RES) withUp[r] = c[r] + keepUp[r]
      if (!affordable(withUp) || !hasOther(otherOf(v), ub.size) || cpop() + v.pop * ub.size + villRoom > popCap()) continue
      pay(c)
      addMilSpend(c)
      payOther(otherOf(v), ub.size)
      postQueued += ub.size
      if (horse) horses -= 1
      b.job = { kind: 'unit', item: u.id, ...(horse ? { end: t, supervised: false } : supervise(b, ub.time * pm.time)), count: ub.size, step: -2, pop: v.pop * ub.size, dur: ub.time * pm.time }
      armyPop += v.pop * ub.size
      log('train', `訓練${name(u.id)}`, u.id, c)
    }
  }

  // ---------- 每秒行動 ----------
  const act = () => {
    // 回放：照職業的時間做市場交易（得到的資源也算收入，職業的累計收入裡就有）；付不起就等，60 秒還付不起就放棄這筆
    while (script?.trades && tradeIdx < script.trades.length && script.trades[tradeIdx].t <= t) {
      const tr = script.trades[tradeIdx]
      const c = { ...zero(), ...tr.pay } as Bundle
      if (!RES.every((r) => bank[r] >= c[r])) {
        if (t > tr.t + 60) {
          tradeIdx++
          continue
        }
        break
      }
      pay(c)
      for (const [r, x] of Object.entries(tr.get)) {
        bank[r as Res] += x ?? 0
        incomeAcc[r as Res] += x ?? 0
      }
      log('note', `市場交易（照職業）：${Object.entries(tr.pay).map(([r, x]) => `${x} ${RES_ZH[r as Res]}`).join('、') || '—'} → ${Object.entries(tr.get).map(([r, x]) => `${x} ${RES_ZH[r as Res]}`).join('、')}`)
      tradeIdx++
    }
    // 0. 房屋優先（人口不能卡住村民）
    for (let k = 0; k < 3 && houseNeeded(); k++) {
      const it = items.get(data.houseId!)!
      if (!affordable(costOf(variationAt(it, age)), true)) break
      // 長屋要 30 秒，派 2 人；一般房屋 1 人
      place(data.houseId!, 'house', -1, spec.freeVillagers ? 2 : 1, 6)
    }

    // 1. 目前步驟
    // 一般模式依序推進（前一步開始了才做下一步）；回放模式每個步驟時間到了就各自開始，不互相等待（職業是同時進行的）
    const actStep = (i: number): boolean => {
      const st = steps[i]
      const sp = policy.steps[i]
      // 回放：不早於職業開始的時間
      if (st.earliest != null && t < st.earliest) return false
      let advanced = false
      if (st.kind === 'age') {
        if (age < st.age! - 1) return false
        const o = ageOption(st)
        if (!o) return false
        if (o.mode === 'building') {
          if (affordable(ageCost(o))) {
            // 升代地標一律蓋在城鎮中心旁的農田區（和光環建築的 'home' 同一處，距中心 9 格）；
            // 光環地標在 place() 裡改照策略的錨點。以前是 12 格、方位依編號亂排，可能蓋到所有村民的另一側。
            const home = anchorPoint('home', 3)
            const b = place(o.id, 'step', i, sp.builders, home.dist, st.age, home.angle)
            b.ageTo = st.age
            advanced = true
          }
        } else {
          const ps = idleProducers(o.producers)
          const oc = ageCost(o)
          if (ps.length && affordable(oc) && hasOther(o.other)) {
            pay(oc)
            payOther(o.other)
            ps[0].job = { kind: 'tech', item: o.id, end: t + o.time, count: 1, step: i }
            researching.add(o.id)
            log('research', `研究${o.name}（升代）`, o.id, oc)
            advanced = true
          }
        }
      } else if (st.kind === 'build') {
        const it = items.get(st.item)!
        if (minAge(it) > age) return false
        // 補上的前置生產建築：已經有一座（含蓋造中、營地）就不用再蓋；回放時職業蓋的建築都是明確的目標，前置略過（職業蓋過的投放點例外，例如研究獨輪推車要磨坊）
        if (st.implicit && (blds.some((b) => b.item === st.item) || (script && !script.dropoffs.some((d) => d.id === st.item)))) return true
        const n = placed.get(i) ?? 0
        const cost = costOf(variationAt(it, age))
        if (n < st.count && affordable(cost)) {
          place(
            st.item,
            'step',
            i,
            // 回放照職業的人數（可能超過 4 人）
            st.forward || script ? sp.builders : Math.min(sp.builders, 4),
            st.forward ? map.enemyDist * 0.8 : 10,
            undefined,
            st.forward ? map.enemyAngle + (n - (st.count - 1) / 2) * 0.06 : undefined,
          )
          placed.set(i, n + 1)
        }
        advanced = (placed.get(i) ?? 0) >= st.count
      } else if (st.kind === 'army') {
        const it = items.get(st.item)!
        if (minAge(it) > age) return false
        const p = producerFor(st.item)
        const want = Math.max(1, sp.producers)
        // 回放：職業蓋了哪些建築本來就是目標，不自己補蓋生產建築
        if (!script && p && blds.filter((b) => b.item === p).length < want) {
          const c = costOf(variationAt(items.get(p)!, age))
          if (affordable(c)) place(p, 'prod', i, 1, 10)
        }
        const v = variationAt(it, age)
        const ub = unitBatch(st.item, v)
        const batch = ub.size
        // 留給村民的人口：每座城鎮中心一批（訓練中的村民已經算在 cpop 裡）
        const villRoom = producingVills() ? tcList().length * batchSize : 0
        // 回放：職業在城鎮中心訓練的單位（斥候、自由民）也照做
        for (const b of idleProducers(script ? v.producedBy : nonTC(v.producedBy))) {
          // 數量是累計的：同一種兵在前面目標已排入的、免費送的都算進來
          if (armyHave(st.item) >= st.count) break
          const pm = prodMods(b.item, it, b)
          const c = costOf(v)
          for (const r of RES) c[r] *= batch * pm.cost[r]
          // 金朝：用掉 1 匹馬，立刻出兵、便宜一點
          const horse = !!spec.horses && horses >= 1 && spec.horses.at.includes(b.item) && v.cls.includes(spec.horses.cls)
          if (horse) for (const [r, x] of Object.entries(spec.horses!.discount)) c[r as Res] = Math.max(0, c[r as Res] - (x ?? 0))
          if (!affordable(c) || !hasOther(otherOf(v), batch) || cpop() + v.pop * batch + villRoom > popCap()) break
          // 蒙古敖包範圍內雙倍生產：同一格出 2 倍、時間不變，原價付一次，另付等於這批總價的石頭（例如怯薛 120 食物 80 黃金 + 200 石頭、斥候 65 食物 + 65 石頭；
          // 2026-11 職業花費序列與 16.1.9737 斥候修正吻合）。白塔石頭減半。回放：職業同時訓練一對才用；其他時候照搜尋的 policy.double
          let mult = 1
          const dp = spec.doubleProduce
          if (dp && owned(dp.requires) && !horse) {
            const stone = (c.food + c.wood + c.gold) * (owned('the-white-stupa') ? 0.5 : 1)
            const pair = script
              ? steps.some((y, j) => j > i && y.kind === 'army' && y.item === st.item && Math.abs((y.earliest ?? 0) - (st.earliest ?? 0)) <= 2 && y.count >= armyHave(st.item) + 2 * batch)
              : !!policy.double && st.count - armyHave(st.item) >= 2 * batch
            if (pair && bank.stone >= c.stone + stone && cpop() + 2 * v.pop * batch + villRoom <= popCap()) {
              c.stone += stone
              mult = 2
            }
          }
          pay(c)
          addMilSpend(c)
          payOther(otherOf(v), batch)
          if (horse) horses -= 1
          const n = batch * mult
          b.job = { kind: 'unit', item: st.item, ...(horse ? { end: t, supervised: false } : supervise(b, ub.time * pm.time)), count: n, step: i, pop: v.pop * n, dur: ub.time * pm.time }
          armyPop += v.pop * n
          queued.set(i, (queued.get(i) ?? 0) + n)
          log('train', `訓練${name(st.item)}${mult > 1 ? ` ×${n}（雙倍生產）` : ''}`, st.item, c)
        }
        advanced = armyHave(st.item) >= st.count
      } else if (st.kind === 'tech') {
        const it = items.get(st.item)!
        if (minAge(it) > age) return false
        const v = variationAt(it, age)
        const ps = idleProducers(nonTC(v.producedBy))
        if (ps.length && affordable(costOf(v)) && hasOther(otherOf(v))) {
          pay(costOf(v))
          payOther(otherOf(v))
          ps[0].job = { kind: 'tech', item: st.item, ...supervise(ps[0], researchTime(v.time) * prodMods(ps[0].item, undefined, ps[0]).research), count: 1, step: i }
          researching.add(st.item)
          log('research', `研究${name(st.item)}`, st.item, costOf(v))
          advanced = true
        }
      } else if (st.kind === 'villagers') {
        advanced = villagers >= st.count
      }
      return advanced
    }
    if (script) {
      for (let i = cur; i < steps.length; i++) {
        if (started.has(i)) continue
        if (actStep(i)) {
          started.add(i)
          lastRebalance = -99
        }
      }
      while (cur < steps.length && started.has(cur)) cur++
    } else {
      for (let guard = 0; guard < 4 && cur < steps.length; guard++) {
        if (!actStep(cur)) break
        cur++
        lastRebalance = -99
      }
    }

    // 1b. 回放：照職業蓋田的時間蓋農田（完成時間減建造時間），不等天然食物採完
    if (script?.farms) {
      const fit = items.get(spec.farm.id)
      if (fit) {
        const fv = variationAt(fit, age)
        const due = script.farms.filter((x) => x - buildTimeOf(fit.id, fv) <= t).length
        let have = blds.filter((b) => b.role === 'farm').length
        while (have < due && affordable(costOf(fv))) {
          pay(costOf(fv))
          const b = addBld({ item: spec.farm.id, step: -1, role: 'farm', done: false, progress: 0, total: buildTimeOf(fit.id, fv), builders: 0, at: 5, angle: 0.3 + have * 0.2, job: null })
          takeBuilders(1, b)
          log('place', `蓋${name(spec.farm.id)}（第 ${have + 1} 座，照職業的時間）`, spec.farm.id, costOf(fv))
          have++
        }
      }
    }

    // 2. 目標後全力出兵
    if (postStart != null && postOn()) postAct()

    // 3. 村民另外蓋的光環建築（拜占庭蓄水池）：搜尋決定蓋幾座、各蓋在哪
    for (const z of spec.zones ?? []) {
      if (!z.max || (z.requires && !fired.has(z.requires) && !owned(z.requires))) continue
      const it = items.get(z.building)
      if (!it || minAge(it) > age) continue
      const want = Math.min(z.max, zonePlan(spec, policy, map, z.building).length)
      if (blds.filter((b) => b.item === z.building).length >= want) continue
      if (affordable(costOf(variationAt(it, age)))) place(z.building, 'econ', -1, 1, 6)
    }
    // 3a. 渡槽：搜尋決定連不連；依蓋好的順序把相鄰兩座連起來（每格花費、時間照目錄），水位最多到 levels 的長度
    for (const z of spec.zones ?? []) {
      const lk = z.link
      if (!lk || !policy.link || !z.levels) continue
      const done = blds.filter((b) => b.done && b.item === z.building)
      const links = blds.filter((b) => b.item === lk.building && b.anchor === 'link').length
      if (links >= Math.min(done.length - 1, z.levels.length - 1)) continue
      const it = items.get(lk.building)
      if (!it) continue
      const a = done[links]
      const bb = done[links + 1]
      const pa = { ...FARM_SITE, dist: a.at, angle: a.angle }
      const pb = { ...FARM_SITE, dist: bb.at, angle: bb.angle }
      const len = Math.max(lk.minLen, siteDistance(pa, pb) - 2)
      const v = variationAt(it, age)
      const c = costOf(v)
      for (const r of RES) c[r] *= len
      if (!affordable(c)) continue
      pay(c)
      const nb = addBld({ item: lk.building, step: -1, role: 'econ', done: false, progress: 0, total: buildTimeOf(lk.building, v) * len, builders: 0, at: (a.at + bb.at) / 2, angle: (a.angle + bb.angle) / 2, job: null, anchor: 'link' })
      takeBuilders(1, nb)
      log('place', `蓋${name(lk.building)}（${Math.round(len)} 格，連接第 ${links + 1}、${links + 2} 座${name(z.building)}）`, lk.building, c)
    }

    // 3c. 英格蘭：農田區的磨坊罩不到所有田時，在農田區再蓋一座
    const fmb = spec.farmMill
    if (fmb && farmMillShort()) {
      const it = items.get(fmb.building)
      if (it && minAge(it) <= age && affordable(costOf(variationAt(it, age)))) {
        const b = place(fmb.building, 'econ', -1, 1, 7)
        b.anchor = 'farm'
      }
    }

    // 3b. 被動收入建築：搜尋決定從第幾步開始、蓋幾座
    for (const tr of spec.trickles) {
      const want = Math.min(tr.max, tr.maxByAge?.[age - 1] ?? Infinity, policy.trickle?.[tr.building]?.count ?? 0)
      if (want <= 0 || (policy.trickle[tr.building].at ?? 0) > cur) continue
      const it = items.get(tr.building)
      if (!it || minAge(it) > age || !trickleBuildable(it, tr)) continue
      if (blds.filter((b) => b.item === tr.building).length >= want) continue
      // 前置建築（屋台要祭典）：還沒有就先蓋
      if (tr.requires && !blds.some((b) => b.item === tr.requires)) {
        const ri = items.get(tr.requires)
        if (ri && minAge(ri) <= age && affordable(costOf(variationAt(ri, age)))) place(tr.requires, 'econ', -1, 1, 8)
        continue
      }
      const v = variationAt(it, age)
      if (affordable(costOf(v)) && hasOther(otherOf(v))) {
        payOther(otherOf(v))
        place(tr.building, 'econ', -1, 1, 8)
      }
    }

    // 4. 經濟科技
    for (const [id, at] of Object.entries(policy.ecoAt)) {
      if (at < 0 || at > cur || researched.has(id) || researching.has(id)) continue
      const it = items.get(id)
      if (!it || minAge(it) > age) continue
      if (!ecoReady(id)) {
        // 前置是村民可以蓋、還沒蓋的建築（蒙古改良科技要敖包）：先蓋它
        const req = spec.civTechs.find((c) => c.id === id)?.requires
        const b = (Array.isArray(req) ? req : req ? [req] : []).find((x) => isBuildable(data, x) && !blds.some((y) => y.item === x))
        const bi = b ? items.get(b) : undefined
        if (b && bi && minAge(bi) <= age && affordable(costOf(variationAt(bi, age)))) place(b, 'econ', -1, 1, 8)
        continue
      }
      const v = variationAt(it, age)
      // 不需要建築、立即生效的選擇（鄂圖曼帝國議會）
      if (spec.civTechs.some((c) => c.id === id && c.instant)) {
        if (!affordable(costOf(v)) || !hasOther(otherOf(v))) continue
        pay(costOf(v))
        payOther(otherOf(v))
        researched.add(id)
        applyTech(id)
        fire(id)
        log('research', `選擇${name(id)}`, id, costOf(v))
        continue
      }
      const tcOk = spec.civTechs.some((c) => c.id === id && c.tc)
      const ps = idleProducers(v.producedBy.filter((p) => tcOk || !isTC(p)))
      if (!ps.length || !affordable(costOf(v)) || !hasOther(otherOf(v))) continue
      pay(costOf(v))
      payOther(otherOf(v))
      ps[0].job = { kind: 'tech', item: id, ...supervise(ps[0], researchTime(v.time) * prodMods(ps[0].item, undefined, ps[0]).research), count: 1, step: -1 }
      researching.add(id)
      log('research', `研究${name(id)}`, id, costOf(v))
    }

    // 4b. 朝代：補蓋同時代的另一座地標（搜尋決定要不要）
    for (const a of spec.dynasty ?? []) {
      if (!policy.dynasty?.[a] || age < a) continue
      const o = dynastyNext(a)
      if (o && affordable(ageCost(o))) {
        const home = anchorPoint('home', 3)
        place(o.id, 'econ', -1, 3, home.dist, undefined, home.angle + 0.9)
      }
    }

    // 4c. 德里學者：先蓋清真寺，再訓練到策略要的人數
    // 回放：照職業訓練學者的時間（出生減訓練時間），清真寺照職業的建築目標蓋
    const schDue = script?.scholars ? script.scholars.filter((x) => x - (items.get(spec.scholars?.unit ?? '') ? variationAt(items.get(spec.scholars!.unit)!, age).time : 0) <= t).length : Infinity
    if (spec.scholars && (policy.scholars ?? 0) > scholarsN + scholarsTraining && scholarsBought < schDue) {
      const sc = spec.scholars
      const unit = items.get(sc.unit)
      const mosque = sc.at.find((id) => isBuildable(data, id))
      if (mosque && !blds.some((b) => sc.at.includes(b.item))) {
        // 回放時清真寺是職業的建築目標，不自己多蓋
        const it = script ? undefined : items.get(mosque)
        if (it && minAge(it) <= age && affordable(costOf(variationAt(it, age)))) place(mosque, 'econ', -1, 1, 7)
      } else if (unit && minAge(unit) <= age) {
        const v = variationAt(unit, age)
        for (const b of idleProducers(sc.at)) {
          if ((policy.scholars ?? 0) <= scholarsN + scholarsTraining || scholarsBought >= schDue) break
          const villRoom = producingVills() ? batchSize : 0
          // 依訓練建築不同的價格（德里信仰圓頂 80 黃金）
          const sCost = sc.costAt?.[b.item] ? ({ ...zero(), ...sc.costAt[b.item] } as Bundle) : costOf(v)
          if (!affordable(sCost) || cpop() + v.pop + villRoom > popCap()) continue
          pay(sCost)
          b.job = { kind: 'unit', item: sc.unit, end: t + v.time, count: 1, step: -3, pop: v.pop, dur: v.time }
          armyPop += v.pop
          scholarsTraining++
          scholarsBought++
          log('train', `訓練${name(sc.unit)}（駐紮加速研究）`, sc.unit, sCost)
        }
      }
    }

    // 4d. 馬利：在磨坊買牛給村民採
    if (spec.herd && herd && (policy.herd ?? 0) > herdBought + herdTraining && herdBought + herdTraining < spec.herd.max) {
      const hc = { ...zero(), ...spec.herd.cost } as Bundle
      for (const b of idleProducers([spec.herd.at])) {
        if ((policy.herd ?? 0) <= herdBought + herdTraining || !affordable(hc)) break
        pay(hc)
        b.job = { kind: 'unit', item: 'herd', end: t + spec.herd.time, count: 1, step: -4, dur: spec.herd.time }
        herdTraining++
        log('train', `買${spec.herd.label}`, undefined, hc)
      }
    }
    // 4e. 中國：在帝國學院再訓練監工（城鎮中心不訓練）
    // 回放：照職業訓練監工的時間（出生時間減訓練時間）
    const offDue = script?.officials ? script.officials.filter((x) => x - spec.officials!.time <= t).length : Infinity
    if (spec.officials && (policy.officials ?? 0) > officialsN - spec.officials.start + officialsTraining && officialsN + officialsTraining < spec.officials.max && officialsN - spec.officials.start + officialsTraining < offDue) {
      const oc = { ...zero(), ...spec.officials.cost } as Bundle
      const villRoom = producingVills() ? batchSize : 0
      // 回放：職業也會在城鎮中心訓練監工
      for (const b of idleProducers(script ? [...spec.officials.at, ...tcIds] : spec.officials.at)) {
        if (!affordable(oc) || cpop() + 1 + villRoom > popCap()) break
        pay(oc)
        b.job = { kind: 'unit', item: spec.officials.unit, end: t + spec.officials.time, count: 1, step: -5, pop: 1, dur: spec.officials.time }
        armyPop += 1
        officialsTraining++
        log('train', `訓練${name(spec.officials.unit)}（督導加速）`, spec.officials.unit, oc)
        break
      }
    }

    // 4f. 有收入的輔助單位（教士、僧侶）
    for (const su of spec.support ?? []) {
      const cap = su.maxFrom ? Math.min(su.max, su.maxFrom.base + su.maxFrom.per.filter((id) => owned(id)).length) : su.max
      // 回放：照職業訓練的時間（出生時間減訓練時間）
      const st = script?.support?.[su.unit]
      const it0 = items.get(su.unit)
      const due = st && it0 ? st.filter((x) => x - variationAt(it0, Math.max(age, minAge(it0))).time <= t).length : Infinity
      const want = Math.min(cap, policy.support?.[su.unit] ?? 0, due)
      if (want <= (supportN.get(su.unit) ?? 0) + (supportTraining.get(su.unit) ?? 0)) continue
      if (su.requires && !owned(su.requires) && !researched.has(su.requires)) continue
      const it = items.get(su.unit)
      if (!it || minAge(it) > age) continue
      const v = variationAt(it, age)
      const villRoom = producingVills() ? batchSize : 0
      for (const b of idleProducers(su.at)) {
        if (want <= (supportN.get(su.unit) ?? 0) + (supportTraining.get(su.unit) ?? 0)) break
        if (!affordable(costOf(v)) || cpop() + v.pop + villRoom > popCap()) break
        pay(costOf(v))
        b.job = { kind: 'unit', item: su.unit, end: t + v.time, count: 1, step: -6, pop: v.pop, dur: v.time }
        armyPop += v.pop
        supportTraining.set(su.unit, (supportTraining.get(su.unit) ?? 0) + 1)
        log('train', `訓練${name(su.unit)}（收入）`, su.unit, costOf(v))
      }
    }

    // 4f2. 捕魚：先在岸邊蓋碼頭，再訓練到策略要的漁船數
    if (fiUnit && fish && wantBoats() > boats + boatTraining) {
      if (!blds.some((b) => fiProducers.includes(b.item))) {
        const hb = fiHome ? items.get(fiHome) : undefined
        if (hb && minAge(hb) <= age && affordable(costOf(variationAt(hb, age)))) place(fiHome!, 'econ', -1, 1, fish.dock)
      } else {
        const v = variationAt(fiUnit, age)
        for (const b of idleProducers(fiProducers)) {
          if (wantBoats() <= boats + boatTraining) break
          const villRoom = producingVills() ? batchSize : 0
          if (!affordable(costOf(v)) || cpop() + v.pop + villRoom > popCap()) break
          pay(costOf(v))
          b.job = { kind: 'unit', item: fiUnit.id, end: t + v.time, count: 1, step: -10, pop: v.pop, dur: v.time }
          armyPop += v.pop
          boatTraining++
          log('train', `訓練${name(fiUnit.id)}（捕魚）`, fiUnit.id, costOf(v))
        }
      }
    }

    // 4g. 陸地貿易：先蓋市場，再訓練到策略要的商人數（有折扣的建築優先，例如蒙古銀樹）
    if (trUnit && wantTraders() > paidTraders()) {
      if (!blds.some((b) => trProducers.includes(b.item))) {
        const hb = trHome ? items.get(trHome) : undefined
        if (hb && minAge(hb) <= age && affordable(costOf(variationAt(hb, age)))) place(trHome!, 'econ', -1, 1, 8)
      } else if (minAge(trUnit) <= age) {
        const v = variationAt(trUnit, age)
        const pmOf = (id: string) => tsp?.producerMods?.[id]
        const ps = idleProducers(trProducers).sort((a, b) => (pmOf(b.item) ? 1 : 0) - (pmOf(a.item) ? 1 : 0))
        for (const b of ps) {
          if (wantTraders() <= paidTraders()) break
          const pm = pmOf(b.item)
          const c = { ...costOf(v) }
          if (pm?.gold != null) c.gold *= pm.gold
          const time = v.time * (pm?.time ?? 1)
          const villRoom = producingVills() ? batchSize : 0
          if (!affordable(c) || cpop() + v.pop + villRoom > popCap()) break
          pay(c)
          b.job = { kind: 'unit', item: trUnit.id, end: t + time, count: 1, step: -8, pop: v.pop, dur: time }
          armyPop += v.pop
          traderTraining++
          log('train', `訓練${name(trUnit.id)}（貿易）`, trUnit.id, c)
        }
      }
    }
    // 4h. 馬利：有商人之後沿路線蓋收費哨站（每隔 spacing 格一座，建造者要走過去）
    const tl = tsp?.tolls
    if (tl && trade && traderNext.length + traderTraining > 0) {
      const built = blds.filter((b) => b.item === tl.building).length
      const it = items.get(tl.building)
      if (built < wantTolls() && it && minAge(it) <= age && affordable(costOf(variationAt(it, age)))) place(tl.building, 'econ', -1, 1, Math.min(trade.dist - 5, tl.spacing / 2 + tl.spacing * built))
    }
    // 4h2. 蒙古：有商人之後沿路線蓋驛站前哨（每 2 × 半徑格一座）
    const sa = tsp?.speedAura
    if (sa && trade && traderNext.length + traderTraining > 0) {
      const built = blds.filter((b) => b.item === sa.building && b.anchor === 'yam').length
      const it = items.get(sa.building)
      if (built < wantYams() && it && minAge(it) <= age && affordable(costOf(variationAt(it, age)))) {
        const b = place(sa.building, 'econ', -1, 1, Math.min(trade.dist, sa.radius + 2 * sa.radius * built))
        b.anchor = 'yam'
      }
    }
    // 4i. 金朝：在龍亭訓練使者（同時最多 maxActive 名，含在路上的）
    const tb = tsp?.tributary
    if (tb && wantTribs() > tribs.length + envoyArrive.length + envoys + envoyTraining && envoys + envoyTraining + envoyArrive.length < tb.maxActive) {
      const it = items.get(tb.unit)
      if (it && minAge(it) <= age) {
        const v = variationAt(it, age)
        const villRoom = producingVills() ? batchSize : 0
        for (const b of idleProducers(tb.at)) {
          if (!affordable(costOf(v)) || cpop() + v.pop + villRoom > popCap()) break
          pay(costOf(v))
          b.job = { kind: 'unit', item: tb.unit, end: t + v.time, count: 1, step: -9, pop: v.pop, dur: v.time }
          armyPop += v.pop
          envoyTraining++
          log('train', `訓練${name(tb.unit)}（朝貢國）`, tb.unit, costOf(v))
          break
        }
      }
    }

    // 5. 村民生產：上一名一完成就接著排（保留小數秒）
    if (producingVills() && t >= spec.tcStartDelay) {
      for (const b of idleProducers([...tcIds])) {
        const cp = cpop()
        if (cp + batchSize > popCap() || cp + batchSize > villagerPopLimit() || villagers + training() + batchSize > vilCap()) break
        // 主要工人付不起時改訓普通村民（金朝鄉騎 → 村民），城鎮中心不停
        const choice = workerChoices().find((w) => affordableRaw(w.cost))
        if (!choice) break
        pay(choice.cost)
        // 雙倍生產（蒙古敖包範圍內）：多付石頭，一格出兩倍
        const dp = spec.doubleProduce
        let count = batchSize
        const cost = { ...choice.cost }
        if (dp && policy.double && owned(dp.requires) && bank.stone >= dp.stone && cp + 2 * batchSize <= popCap() && cp + 2 * batchSize <= villagerPopLimit() && villagers + training() + 2 * batchSize <= vilCap()) {
          bank.stone -= dp.stone
          cost.stone += dp.stone
          count = 2 * batchSize
        }
        const start = b.lastEnd != null && b.lastEnd > t - 1 ? b.lastEnd : t
        // 先前有閒置時，補上整數秒沒算到的那一點點
        if (b.idleTicks && b.lastEnd != null) tcIdle += Math.max(0, t - b.lastEnd - b.idleTicks)
        b.idleTicks = 0
        b.job = { kind: 'vill', item: choice.item.id, end: start + choice.time, count, step: -1, cost }
      }
    }
  }

  /** 城鎮中心可訓練的工人，依偏好排序（各自的費用與時間） */
  const workerChoices = () => {
    const out: { item: CatalogItem; cost: Bundle; time: number }[] = []
    const add = (it: CatalogItem | undefined) => {
      if (!it || out.some((o) => o.item.id === it.id)) return
      const v = variationAt(it, age)
      const cost = spec.freeVillagers ? zero() : costOf(v)
      for (const r of RES) cost[r] *= batchSize
      out.push({ item: it, cost, time: ((spec.trainTimeByAge?.[age - 1] ?? v.time) * tVillTime) / golden.prod / (1 + (spec.governors ? govState().villagerSpeed : 0)) })
    }
    add(workerItem())
    if (spec.fallbackWorker) add(items.get(spec.fallbackWorker))
    return out
  }

  /** 軍隊、科技目標優先用非城鎮中心的建築；只有城鎮中心能做時才用它 */
  const nonTC = (ids: string[]) => {
    // 只算已經有、或這個時代就能蓋的非城鎮中心建築；都沒有時才用城鎮中心（遊戲機制例外）
    const others = ids.filter((p) => !isTC(p) && (blds.some((b) => b.item === p) || (isBuildable(data, p) && minAge(items.get(p)!) <= age)))
    return others.length ? others : ids
  }

  /** 城鎮中心沒有工作時記錄原因；人口 200 是遊戲上限，不算違規 */
  const countIdle = () => {
    for (const b of tcList()) {
      if (b.job?.kind === 'vill') continue
      if (b.job) {
        // 城鎮中心在做只能在這裡做的事（例如聖殿騎士團的分團升代）：遊戲機制，照實記錄但不算違規
        const why = b.job.step >= 0 && steps[b.job.step]?.kind === 'age' ? '城鎮中心研究升代（遊戲機制）' : '城鎮中心執行只能在此做的目標'
        tcIdleReasons[why] = (tcIdleReasons[why] ?? 0) + 1
        continue
      }
      let why: string
      let exempt = false
      const cp = cpop()
      if (t < spec.tcStartDelay) {
        why = '城鎮中心展開中（遊戲機制）'
        exempt = true
      } else if (cp + batchSize > 200) {
        why = '人口 200'
        exempt = true
      } else if (cp + batchSize > villagerPopLimit()) {
        why = '人口 200（其餘留給軍隊目標）'
        exempt = true
      } else if (villagers + training() + batchSize > vilCap()) why = '村民容量滿（長屋太晚）'
      else if (cp + batchSize > popCap()) why = '人口滿（房屋太晚）'
      else if (!workerChoices().some((w) => affordableRaw(w.cost))) why = '資源不足'
      else why = '其他'
      tcIdleReasons[why] = (tcIdleReasons[why] ?? 0) + 1
      if (!exempt) {
        tcIdle++
        b.idleTicks = (b.idleTicks ?? 0) + 1
      }
    }
  }

  // ---------- 完成事件 ----------
  /** 只生效一次的觸發（minCount）、建築車、累計採到的特殊資源 */
  const onceDone = new Set<Trigger>()
  let cartTokens = 0
  const specialGathered: Record<string, number> = {}
  /** 圖格魯克總督：每秒算一次各位總督的等級與效果 */
  let govCache: { t: number; count: number; villagerSpeed: number; techCost: number; food: number; stone: number } | null = null
  const govState = () => {
    if (govCache && govCache.t === t) return govCache
    const out = { t, count: 0, villagerSpeed: 0, techCost: 0, food: 0, stone: 0 }
    const gv = spec.governors
    if (gv) {
      const forts = blds.filter((b) => b.done && b.item === gv.fort)
      const used = new Set<string>()
      forts.forEach((_f, i) => {
        const key = policy.governors?.[i]
        const o = key ? gv.options[key] : undefined
        if (!o || used.has(key!)) return
        used.add(key!)
        out.count++
        let lv = 1 + gv.upgrades.filter((u) => (repeatDone.get(u) ?? (researched.has(u) ? 1 : 0)) > i).length
        if (lv >= 4 && gv.level4Requires && !owned(gv.level4Requires)) lv = 3
        const L = Math.min(4, lv) - 1
        out.villagerSpeed += o.villagerSpeed?.[L] ?? 0
        out.techCost += o.techCost?.[L] ?? 0
        if (o.perBuilding) {
          // 要塞旁 radius 格內的農田與房屋（假設要塞蓋在家附近）：能放的數量照 2×2 佔地估
          const cap = Math.floor(((Math.PI * (o.radius ?? 6) ** 2 - 16) * 0.8) / 4)
          const nb = Math.min(cap, farmsBuilt + houses())
          const food = o.perBuilding[L] * nb
          out.food += food
          if (L === 3) out.stone += food * (o.stonePct4 ?? 0)
        }
      })
    }
    govCache = out
    return out
  }
  /** 冥想花園：建築位置與增量進度 */
  const bountyAt: { tr: Trigger; p: Site; next: number; count: number }[] = []
  /** 某建築目前的位置（找最後一座完成的） */
  const buildingPoint = (id: string): Site => {
    const b = [...blds].reverse().find((x) => x.item === id)
    return { ...FARM_SITE, dist: b?.at ?? 6, angle: b?.angle ?? FARM_SITE.angle }
  }
  /** 江南塔：累積的軍事花費與已送的軍隊數 */
  let milSpent = 0
  let spendArmies = 0
  const addMilSpend = (c: Bundle) => {
    milSpent += RES.reduce((a, r) => a + c[r], 0)
    for (const { tr } of active) {
      const sa = tr.spendArmy
      if (!sa || spendArmies >= sa.max) continue
      const need = Math.min(sa.cap, sa.first + sa.step * spendArmies)
      if (milSpent >= need) {
        milSpent -= need
        spendArmies++
        grantUnits(sa.units, tr.on)
      }
    }
  }
  /** 免費送的單位：算進已訓練、人口，目標後出兵階段也算進出兵數 */
  const freeUnits = new Map<string, number>()
  /** 軍隊目標的數量是累計的（「有 N 名」）：同一種兵所有目標已排入的，加上免費送的 */
  const armyHave = (unit: string) => {
    let q = freeUnits.get(unit) ?? 0
    steps.forEach((s, j) => {
      if (s.kind === 'army' && s.item === unit) q += queued.get(j) ?? 0
    })
    return q
  }
  const grantUnits = (u: Record<string, number> | undefined, from: string) => {
    if (!u) return
    for (const [id, n] of Object.entries(u)) {
      if (!n) continue
      const it = items.get(id)
      const pop = it ? variationAt(it, Math.max(age, minAge(it))).pop : 1
      trained.set(id, (trained.get(id) ?? 0) + n)
      freeUnits.set(id, (freeUnits.get(id) ?? 0) + n)
      armyCount += n
      armyPop += pop * n
      if (postStart != null) {
        postUnits += n
        postQueued += n
        postMix[id] = (postMix[id] ?? 0) + n
      }
      log('note', `${name(from)}送 ${n} 名${name(id)}`)
    }
  }
  /** 生產與研究修正（堡伯宮、騎兵學校、華萊士號召…） */
  const prodMods = (at: string, unit?: CatalogItem, bld?: Bld) => {
    let time = 1
    const cost: Bundle = { food: 1, wood: 1, gold: 1, stone: 1 }
    let research = 1
    const cls = unit ? variationAt(unit, Math.max(age, minAge(unit))).cls : []
    for (const { tr } of active) {
      for (const pm of tr.prod ?? []) {
        if (pm.at && !pm.at.includes(at)) continue
        if (pm.needScholar && scholarsN < 1) continue
        // 只套用到最早蓋好的那一棟（艾爾斯修道院的聖物）
        if (pm.single) {
          const first = blds.find((b) => b.done && (!pm.at || pm.at.includes(b.item)))
          if (!bld || first !== bld) continue
        }
        if (unit) {
          if (pm.units && !pm.units.includes(unit.id)) continue
          if (pm.cls && !cls.includes(pm.cls)) continue
          time *= (pm.time ?? 1) * (pm.timeByAge?.[age - 1] ?? 1)
          for (const r of RES) if (!pm.costRes || pm.costRes.includes(r)) cost[r] *= pm.cost ?? 1
        } else if (!pm.units && !pm.cls) research *= pm.research ?? 1
      }
    }
    return { time, cost, research }
  }
  /** 當下最缺的資源（需求減庫存最多） */
  const flexRes = (): Res => {
    const n = need()
    return [...RES].sort((a, b) => n[b] - bank[b] - (n[a] - bank[a]))[0]
  }
  /** 給資源：flex = 當下最缺的資源，farms = 蓋好的農田 */
  const applyGrant = (g: Grant | undefined, from: string) => {
    if (!g) return
    // 兌換：從多出來最多的資源付錢，付不起就整筆不給
    if (g.payFlex) {
      const n = need()
      // 只用真正多出來的（付完仍不低於需求）
      const pay = (['food', 'wood', 'stone'] as Res[]).filter((r) => bank[r] - g.payFlex! >= n[r]).sort((a, b) => bank[b] - n[b] - (bank[a] - n[a]))[0]
      if (!pay) return
      bank[pay] -= g.payFlex
    }
    // 兌換（羅斯金門）：缺黃金時賣多出來的食物／木材／石頭，黃金多時買最缺的
    if (g.exchange) {
      const n = need()
      const want = flexRes()
      if (want === 'gold') {
        const pay = (['food', 'wood', 'stone'] as Res[]).filter((r) => bank[r] - 100 >= n[r]).sort((a, b) => bank[b] - n[b] - (bank[a] - n[a]))[0]
        if (pay) {
          bank[pay] -= 100
          bank.gold += 150
          incomeAcc.gold += 50
        }
      } else if (bank.gold - 100 >= n.gold) {
        bank.gold -= 100
        bank[want] += 150
        incomeAcc[want] += 50
      }
    }
    for (const [k, x] of Object.entries(g)) {
      if (!x || k === 'payFlex' || k === 'exchange') continue
      if (k === 'farms') {
        for (let i = 0; i < x; i++) {
          addBld({ item: spec.farm.id, step: -1, role: 'farm', done: true, progress: 0, total: 0, builders: 0, at: 5, angle: 0.3 + farmsBuilt * 0.2, job: null })
          farmsBuilt++
        }
        log('note', `${name(from)}送 ${x} 塊${name(spec.farm.id)}`)
        continue
      }
      if (k === 'sheep') {
        sheep.left += 200 * x
        log('note', `${name(from)}送 ${x} 隻羊`)
        continue
      }
      const key = k === 'flex' ? flexRes() : k
      addRes(key, x)
      if ((RES as string[]).includes(key)) incomeAcc[key as Res] += x
    }
  }
  /** 新增採集點（投放點就在旁邊） */
  const addSite = (d: NonNullable<Trigger['site']>) => {
    const had = siteById.get(d.id)
    if (had) {
      // 同一種點再給一次（第二座農莊）：多 units 個位置
      had.s = { ...had.s, units: had.s.units + d.units }
      log('note', `${d.label}多 ${d.units} 個位置`)
      return
    }
    const x: SiteSt = {
      s: { id: d.id, kind: d.kind, label: d.label, amount: d.amount, units: d.units, dist: d.dist, angle: FARM_SITE.angle + 0.6, contested: false },
      res: RES_OF[d.kind],
      left: d.amount,
      camp: 2,
      workers: 0,
      chopped: 0,
      fixed: d.rate,
      mul: d.mul,
      regrow: d.regrow,
      farmLike: d.farmLike,
    }
    sites.splice(sites.length - 1, 0, x)
    siteById.set(d.id, x)
    log('note', `新的採集點：${d.label}`)
  }

  /** 研究或蓋好 id：啟動對應的條件式修正 */
  const fire = (id: string) => {
    fired.add(id)
    // 里程碑從這一刻開始累計（約弗薩迦：選了之後才算）
    for (const ms of spec.milestones ?? []) if (ms.after === id) huntAt.set(ms.id, huntDone)
    let changed = false
    for (const tr of spec.triggers) {
      if (tr.on !== id || (tr.fromAge != null && tr.fromAge !== age)) continue
      if (tr.minCount) {
        if (onceDone.has(tr) || blds.filter((b) => b.done && b.item === id).length < tr.minCount) continue
        onceDone.add(tr)
      }
      if (tr.replaces) {
        for (let i = active.length - 1; i >= 0; i--) if (tr.replaces.includes(active[i].tr.on)) active.splice(i, 1)
      }
      active.push({ tr, until: tr.duration != null ? t + tr.duration : Infinity, next: tr.every ? t + (tr.delay ?? tr.every) : Infinity, count: 0, start: t })
      changed = true
      for (const x of tr.alsoApply ?? []) applyTech(x)
      applyGrant(tr.grant, id)
      grantUnits(tr.units, id)
      if (tr.freeBuildings) {
        cartTokens += tr.freeBuildings
        log('note', `${name(id)}：${tr.freeBuildings} 輛建築車（免費軍事建築）`)
      }
      if (tr.actsAsTC) {
        tcIds.add(tr.actsAsTC)
        log('note', `${name(tr.actsAsTC)}可以訓練村民`)
      }
      if (tr.bounty) bountyAt.push({ tr, p: buildingPoint(id), next: t, count: 0 })
      if (tr.freeUpgrades) {
        postUpgrades += tr.freeUpgrades
        log('note', `${name(id)}免費完成 ${tr.freeUpgrades} 項鐵匠升級`)
      }
      if (tr.site) addSite(tr.site)
      if (tr.villagers) {
        villagers += tr.villagers
        workerCount.set(spec.worker, (workerCount.get(spec.worker) ?? 0) + tr.villagers)
        refreshWorkers()
        for (let k = 0; k < tr.villagers; k++) free.push({ from: 'tc' })
        log('note', `${name(id)}送 ${tr.villagers} 名${name(spec.worker)}`)
      }
    }
    if (changed) recomputeTriggers()
  }

  const applyTech = (id: string) => {
    if (id === 'professional-scouts') haulDeer()
    const it = items.get(id)
    if (!it) return
    const v = variationAt(it, age)
    for (const e of v.effects ?? []) {
      if (e.ids && !e.ids.some((x) => x === 'villager' || x === spec.worker || x === spec.fallbackWorker || workerCount.has(x))) continue
      const mul = e.effect === 'multiply'
      switch (e.property) {
        case 'foodGatherRate':
          if (mul) mods.food *= e.value
          break
        case 'huntGatherRate':
          if (mul) mods.hunt *= e.value
          break
        case 'berryGatherRate':
          if (mul) mods.berry *= e.value
          break
        case 'woodGatherRate':
          if (mul) mods.wood *= e.value
          break
        case 'goldGatherRate':
          if (mul) mods.gold *= e.value
          break
        case 'stoneGatherRate':
          if (mul) mods.stone *= e.value
          break
        case 'carryCapacity':
          if (!mul) mods.carry += e.value
          break
        case 'moveSpeed':
          if (mul) mods.speed *= e.value
          break
      }
    }
    if (id === 'shaft-mining' && !(v.effects ?? []).length) {
      mods.gold *= 1.15
      mods.stone *= 1.15
    }
    if (id === 'forestry') mods.forestry = 0.725 / 0.7
    if (id === 'extended-lines') {
      fishMods.rate *= 1.15
      fishMods.carry += 10
    }
    if (id === 'drift-nets') {
      fishMods.rate *= 1.1
      fishMods.carry += 20
      fishMods.speed *= 1.1
    }
  }

  /** 鄂圖曼維齊爾經驗：每達到一個門檻得 1 點 vizier（門檻每點分開算） */
  const repeatDone = new Map<string, number>()
  /** 聖物與聖地：宗教單位、手上的任務、已拿到的數量 */
  const holy = opts.holy
  const relUnit = RELIGIOUS.map((id) => items.get(id)).find((u) => !!u)
  // 訓練宗教單位的建築：城鎮中心不能停村民，所以不算；已經有能訓練的地標（雷格尼茨大教堂、信仰圓頂）就直接用，否則蓋 relHome（修道院類）
  const relProducers = relUnit ? variationAt(relUnit, 4).producedBy.filter((p) => !p.includes('town-center')) : []
  const relHome = relProducers.find((p) => {
    const it = items.get(p)
    return !!it && isBuildable(data, p) && !isLandmark(it)
  })
  const hasRelProducer = () => blds.some((b) => relProducers.includes(b.item))
  let monks = 0
  let monkTraining = 0
  let monkBusyUntil = 0
  let monkTask: 'site' | 'relic' | null = null
  let relicsHeld = 0
  let sitesHeld = 0
  /**
   * 陸地貿易：商人在家裡的市場和中立貿易站之間往返，每到一端給一次收入。
   * 市場當作在城鎮中心旁，路線長度 = 使用者設定的距離。每名商人只記「下一次到達一端的時間」。
   */
  const trade = opts.trade && opts.trade.posts > 0 && opts.trade.dist > 0 ? opts.trade : undefined
  const tsp = trade ? spec.trade : undefined
  const trUnit = trade ? TRADERS.map((id) => items.get(id)).find((u): u is CatalogItem => !!u && variationAt(u, 4).producedBy.some((p) => !isTC(p))) : undefined
  const trProducers = trUnit ? variationAt(trUnit, 4).producedBy.filter((p) => !isTC(p)) : []
  // 沒有能訓練商人的建築時由村民蓋市場（地標不算）
  const trHome = trProducers.find((p) => {
    const it = items.get(p)
    return !!it && isBuildable(data, p) && !isLandmark(it)
  })
  const trSpeed = trUnit ? (variationAt(trUnit, 4).speed ?? 1) : 1
  /** 蒙古驛站：路線上被光環蓋到的長度（每座蓋 2 × 半徑格），商人在裡面移動 ×mul */
  const yamCovered = () => {
    const sa = tsp?.speedAura
    if (!sa || !trade) return 0
    return Math.min(trade.dist, 2 * sa.radius * blds.filter((b) => b.done && b.item === sa.building && b.anchor === 'yam').length)
  }
  const trLeg = () => (trade ? (trade.dist - yamCovered()) / trSpeed + yamCovered() / (trSpeed * (tsp?.speedAura?.mul ?? 1)) : 0)
  const wantYams = () => (tsp?.speedAura && trade ? Math.max(0, Math.min(Math.ceil(trade.dist / (2 * tsp.speedAura.radius)), policy.yams ?? 0)) : 0)
  const trGold = trUnit && trade ? legGold(trade.dist, trSpeed, TRADER_FIN[trUnit.id] ?? 1) : 0
  const trCap = trUnit ? (TRADER_CAP[trUnit.id] ?? MAX_TRADERS) : 0
  const traderNext: number[] = []
  let traderTraining = 0
  let freeTradersGiven = 0
  let tradeLogged = false
  /** 自己訓練的商人（已有 + 訓練中，不含免費送的） */
  const paidTraders = () => traderNext.length - freeTradersGiven + traderTraining
  const wantTraders = () => (trUnit ? Math.min(trCap, policy.traders ?? 0) : 0)
  /** 馬利收費哨站：路線上放得下幾座不重疊的（撒哈拉貿易網佔一個位置），搜尋決定蓋幾座 */
  const wantTolls = () => {
    const tl = tsp?.tolls
    if (!tl || !trade) return 0
    const slots = Math.min(tl.maxPerLeg, Math.floor(trade.dist / tl.spacing)) - (owned(tl.landmark) ? 1 : 0)
    return Math.max(0, Math.min(slots, policy.tolls ?? 0))
  }
  /** 日本寶物商隊：下一隊出發時間、在路上的到達時間 */
  let caravanSpawn: number | null = null
  const caravanArrive: number[] = []
  /** 金朝使者：閒著的、訓練中的、在路上的（到達＋建立完成的時間） */
  let envoys = 0
  let envoyTraining = 0
  let envoyFree = false
  const envoyArrive: number[] = []
  const wantTribs = () => (tsp?.tributary && trade ? Math.min(trade.posts, policy.tributaries ?? 0) : 0)
  /**
   * 捕魚：碼頭當作在岸邊（離城鎮中心 fish.dock 格），漁船平均分到各個深水魚。
   * 一般漁船每趟採滿 40 再回碼頭，實際速率 = 攜帶 ÷（攜帶 ÷ 採集速率 + 來回時間）；羅斯漁船不用回碼頭。
   */
  const fish = opts.fish && opts.fish.spots > 0 ? opts.fish : undefined
  const fiUnit = fish ? Object.keys(FISHERS).map((id) => items.get(id)).find((u): u is CatalogItem => !!u && variationAt(u, 4).producedBy.some((p) => !isTC(p))) : undefined
  const fiProducers = fiUnit ? variationAt(fiUnit, 4).producedBy.filter((p) => !isTC(p)) : []
  const fiHome = fiProducers.find((p) => {
    const it = items.get(p)
    return !!it && isBuildable(data, p) && !isLandmark(it)
  })
  const fiSpec = fiUnit ? FISHERS[fiUnit.id] : undefined
  const fiSpeed = fiUnit ? (variationAt(fiUnit, 4).speed ?? 1.5) : 1.5
  const fiRate = () => {
    if (!fiSpec || !fish) return 0
    const rate = fiSpec.rate * fishMods.rate
    if (fiSpec.direct) return rate
    const carry = fiSpec.carry + fishMods.carry
    return carry / (carry / rate + (2 * fish.dist) / (fiSpeed * fishMods.speed))
  }
  let boats = 0
  let boatTraining = 0
  const fishLeft: number[] = fish ? Array.from({ length: fish.spots }, () => DEEP_FISH) : []
  const fishRegrow: boolean[] = fishLeft.map(() => false)
  const wantBoats = () => (fiUnit && t >= (policy.fishFrom ?? 60) ? Math.min(MAX_BOATS, policy.boats ?? 0) : 0)
  /** 拜占庭金角塔：下一批完成的時間、輪到合約裡第幾種；帕拉丁學校多送單位的累積期望值 */
  let mercNext: number | null = null
  let mercIdx = 0
  let bonusAcc = 0
  /** 金帳詔令、金朝的馬 */
  let edictOn: string | null = null
  let heroXp = 0
  let heroLeft = false
  let horses = 0
  /** 業力、慶典、屋台商人與祭典光環的狀態 */
  let karma: number | null = null
  let karmaUntil = 0
  let festNext = 0
  let yataiFood = 0
  let matsuriAura = 0
  const unitAcc: Record<string, number> = {}
  const stock: Record<string, { acc: number; since: number; nextTick: number }> = {}
  let vizierXp = 0
  let vizierEarned = 0
  const addVizierXp = (n: number) => {
    const vz = spec.vizier
    if (!vz) return
    vizierXp += n
    while (vizierEarned < vz.max) {
      const need = vz.points[Math.min(vizierEarned, vz.points.length - 1)]
      if (vizierXp < need) break
      vizierXp -= need
      vizierEarned++
      addRes('vizier', 1)
      log('note', `得到第 ${vizierEarned} 點維齊爾點數`)
    }
  }

  const reachAge = (a: number, via: string) => {
    if (a <= age) return
    age = a
    ageTimes[a] = t
    if (spec.vizier) addVizierXp(spec.vizier.age[a] ?? 0)
    // 建築車：之後每升一個時代再給
    for (const { tr } of active) {
      const n = tr.freeBuildingsByAge?.[a]
      if (n) {
        cartTokens += n
        log('note', `升代：再 ${n} 輛建築車`)
      }
    }
    log('age', `進入${['', '黑暗', '封建', '城堡', '帝王'][a]}時代（${name(via)}）`, via)
  }

  const finishBld = (b: Bld) => {
    b.done = true
    b.doneAt = t
    b.builders = 0
    // 家附近完成的建築返還一部分花費（蘇格蘭命運之石，地標除外）
    for (const { tr } of active) {
      if (!tr.refund || b.at > 12) continue
      const it = items.get(b.item)
      if (!it || isLandmark(it)) continue
      const c = costOf(variationAt(it, age))
      const amt = RES.reduce((sum, r) => sum + c[r], 0) * tr.refund.pct
      bank[tr.refund.res] += amt
      incomeAcc[tr.refund.res] += amt
    }
    if (b.role === 'farm') {
      farmsBuilt++
      // 田野之石：農田（橄欖園 2×2）也返還石頭
      if (spec.buildRefund) {
        const amt = spec.buildRefund.byId[b.item] ?? spec.buildRefund.other
        bank[spec.buildRefund.res] += amt
        incomeAcc[spec.buildRefund.res] += amt
      }
      return
    }
    if (b.role === 'camp' && b.siteId) {
      const x = siteById.get(b.siteId)
      if (x) {
        x.camp = 2
        if (x.s.kind === 'berry' && spec.orchardBush > 250) x.left += (spec.orchardBush - 250) * x.s.units
      }
    }
    // 第二座以後的城鎮中心：職業會蓋在野果、鹿群、礦旁，同時是那裡的投放點。當作一個還沒有投放點的採集點的投放點
    // （挑現在最多人在採的，同樣多就挑食物、剩比較多的）。以前城鎮中心不當投放點，馬其頓一場職業 10 分鐘前沒蓋磨坊，
    // 模擬的野果、鹿群全都走回首都交，7～10 分鐘收入只有職業的七成
    if (isTC(b.item) && blds.filter((y) => y.done && isTC(y.item)).length > 1) {
      const cand = sites.filter((x) => x.camp !== 2 && x !== sheep && x !== farm && x !== startHunt && !x.hauled && x.fixed == null && x.left > 300 && x.s.kind !== 'sheep')
      cand.sort((a, c) => c.workers - a.workers || (c.res === 'food' ? 1 : 0) - (a.res === 'food' ? 1 : 0) || c.left - a.left)
      const x = cand[0]
      if (x) {
        x.camp = 2
        log('note', `${name(b.item)}當作${x.s.label}的投放點`)
      }
    }
    // 蓋好就給的資源（蘇格蘭集結大廳 1 次集結）
    for (const [k, x] of Object.entries(spec.grants[b.item] ?? {})) addRes(k, x ?? 0)
    // 新城鎮中心旁生成的羊（蘭開斯特 4 隻）：併進唯一的羊群
    if (spec.tcSheep > 0 && (b.item === 'town-center' || b.item === 'capital-town-center')) {
      sheep.left += 200 * spec.tcSheep
      log('note', `${name(b.item)}旁生成 ${spec.tcSheep} 隻羊`)
    }
    // 建築完成返還資源（拜占庭田野之石）
    if (spec.buildRefund) {
      const it = items.get(b.item)
      const r = spec.buildRefund
      const amt = r.byId[b.item] ?? (it && isLandmark(it) ? r.landmark : r.other)
      bank[r.res] += amt
      incomeAcc[r.res] += amt
    }
    fire(b.item)
    // 朝代：同時代的升代地標全部蓋齊
    for (const a of spec.dynasty ?? []) {
      const key = `dynasty-${a}`
      if (fired.has(key)) continue
      const opts = (data.ageOptions[a] ?? []).filter((o) => o.mode === 'building')
      if (opts.length > 1 && opts.every((o) => owned(o.id))) {
        log('note', `兩座地標蓋齊，進入新朝代（${['', '', '宋', '元', '明'][a] ?? a}）`)
        fire(key)
      }
    }
    // 第一座清真寺送學者
    const freeSch = spec.scholars?.free[b.item]
    if (freeSch && blds.filter((x) => x.item === b.item && x.done).length === 1) {
      scholarsN += freeSch
      armyPop += freeSch
      log('note', `${name(b.item)}送 ${freeSch} 名${name(spec.scholars!.unit)}，研究時間 ×${scholarMul().toFixed(2)}`)
    }
    const z = zoneBy.get(b.item)
    if (z) {
      zoneInst.push({ z, p: { ...FARM_SITE, dist: b.at, angle: b.angle }, anchor: b.anchor ?? 'home' })
      zoneVer++
      // 兼作投放點：蓋在採集點旁時，那個點不用另蓋營地
      const x = z.dropoff && b.anchor && b.anchor !== 'home' ? siteById.get(b.anchor) : undefined
      if (x && x.camp !== 2 && (z.dropoff === 'all' || z.dropoff!.includes(x.res))) {
        x.camp = 2
        log('note', `${name(b.item)}兼作 ${x.s.label} 的投放點`)
      }
    }
    if (spec.farmMill && b.item === spec.farmMill.building && b.anchor === 'farm') farmMills++
    // 渡槽完成：水位提升
    if (b.anchor === 'link') {
      zoneVer++
      const lz = (spec.zones ?? []).find((x) => x.link?.building === b.item)
      if (lz) log('note', `${name(lz.building)}水位 ${levelOf(lz)}：範圍內採集 +${Math.round((zMul(lz) - 1) * 100)}%`)
    }
    if (b.ageTo) reachAge(b.ageTo, b.item)
    if (b.role !== 'camp' && b.role !== 'house') log('done', `${name(b.item)}完成`, b.item)
  }

  // 開局組成寫成第一列，避免把「人口」（含斥候等非工人）看成工人數
  if (rec) {
    const workers = [...workerCount].filter(([, n]) => n > 0).map(([id, n]) => `${n} 名${name(id)}`).join('、')
    const res = (RES as string[]).filter((r) => bank[r as Res] > 0).map((r) => `${RES_ZH[r as Res]} ${bank[r as Res]}`)
    for (const [k, v] of Object.entries(other)) if (v > 0) res.push(`${SPECIAL_ZH[k] ?? k} ${v}`)
    const extra = spec.extraPop > 0 ? `，另有 ${spec.extraPop} 名非工人單位（斥候等）佔人口` : ''
    const food = [
      spec.ownedSheep > 0 ? `${spec.ownedSheep} 隻羊` : '',
      spec.tcSheep > 0 ? `城鎮中心旁另生成 ${spec.tcSheep} 隻羊` : '',
      spec.startHunt > 0 ? `城鎮中心旁獵物 ${spec.startHunt} 食物` : '',
    ].filter(Boolean).join('、')
    log('start', `開局：${workers}${extra}；${res.join('、')}${food ? `；${food}` : ''}`)
  }

  // ---------- 主迴圈 ----------
  const maxT = opts.bound
  let sampleNext = 0
  while (postStart != null || t < maxT) {
    // 牧羊
    while (sheepIdx < map.sheepArrivals.length && map.sheepArrivals[sheepIdx] <= t) {
      sheep.left += 200
      sheepIdx++
    }

    // 走路抵達
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i]
      if (w.eta > t) continue
      walkers.splice(i, 1)
      if (w.to.startsWith('b:')) {
        const b = blds.find((y) => y.uid === Number(w.to.slice(2)))
        if (b && !b.done) b.builders++
        else free.push({ from: w.to })
        continue
      }
      const x = siteById.get(w.to)
      if (!x) continue
      if (x === farm ? x.workers < farmSlots() : x.left > 0) x.workers++
      else free.push({ from: w.to })
    }

    // 生產佇列
    for (const b of blds) {
      const j = b.job
      if (!j || j.end > t) continue
      b.job = null
      b.lastEnd = j.end
      if (j.kind === 'vill') {
        if (spec.vizier) addVizierXp(spec.vizier.villager * j.count)
        villagers += j.count
        workerCount.set(j.item, (workerCount.get(j.item) ?? 0) + j.count)
        refreshWorkers()
        for (let k = 0; k < j.count; k++) free.push({ from: 'tc' })
        if (rec) {
          for (let k = 0; k < j.count; k++) {
            const r = pickRes()[0]
            // 每名村民分攤這一批排入時付的錢
            const each = zero()
            if (j.cost) for (const x of RES) each[x] = j.cost[x] / j.count
            log('villager', `第 ${villagers - j.count + k + 1} 名村民 → ${RES_ZH[r]}`, j.item, each, true)
          }
        }
      } else if (j.kind === 'unit' && j.step === -4 && herd && spec.herd) {
        herdTraining--
        herdBought++
        herd.left += spec.herd.food
      } else if (j.kind === 'unit' && j.step === -10) {
        boatTraining--
        boats++
      } else if (j.kind === 'unit' && j.step === -8) {
        // 商人從市場出發，先走到貿易站
        traderTraining--
        traderNext.push(t + trLeg())
      } else if (j.kind === 'unit' && j.step === -9) {
        envoyTraining--
        envoys++
      } else if (j.kind === 'unit' && j.step === -7) {
        monkTraining--
        monks++
      } else if (j.kind === 'unit' && j.step === -6) {
        supportTraining.set(j.item, (supportTraining.get(j.item) ?? 1) - 1)
        supportN.set(j.item, (supportN.get(j.item) ?? 0) + 1)
      } else if (j.kind === 'unit' && j.step === -5) {
        officialsTraining--
        officialsN++
      } else if (j.kind === 'unit' && j.step === -3) {
        scholarsTraining--
        scholarsN += j.count
        log('note', `${name(j.item)}駐紮，研究時間 ×${scholarMul().toFixed(2)}`)
      } else if (j.kind === 'unit' && spec.bundles?.[j.item]) {
        // 營隊（溫格德宮殿）：給裡面的各種單位
        trained.set(j.item, (trained.get(j.item) ?? 0) + j.count)
        const bun = spec.bundles[j.item]
        let total = 0
        for (const [id, n] of Object.entries(bun)) {
          trained.set(id, (trained.get(id) ?? 0) + n * j.count)
          total += n * j.count
          if (j.step === -2) postMix[id] = (postMix[id] ?? 0) + n * j.count
        }
        armyCount += total
        if (j.step === -2) postUnits += total
      } else if (j.kind === 'unit') {
        // 哈剌沙詔令：軍事建築每訓練一次另外送 1 名
        const bu = edictOn ? spec.edicts?.options[edictOn]?.bonusUnit : undefined
        if (bu && (j.step >= 0 || j.step === -2) && !isTC(b.item)) grantUnits({ [bu]: 1 }, b.item)
        trained.set(j.item, (trained.get(j.item) ?? 0) + j.count)
        armyCount += j.count
        if (j.step === -2) {
          postUnits += j.count
          postMix[j.item] = (postMix[j.item] ?? 0) + j.count
        }
        // 帕拉丁學校：每訓練 1 名有 chance 機率多送 1 名，照期望值累積
        const bs = spec.bonusSpawn
        if (bs && bs.units.includes(j.item) && owned(bs.building)) {
          bonusAcc += bs.chance * j.count
          while (bonusAcc >= 1) {
            bonusAcc -= 1
            grantUnits({ [j.item]: 1 }, bs.building)
          }
        }
      } else {
        researching.delete(j.item)
        researched.add(j.item)
        applyTech(j.item)
        fire(j.item)
        // 可重複的科技（維京農莊）：還沒研究到策略要的次數就允許再研究
        const rp = spec.civTechs.find((c) => c.id === j.item && c.repeat)
        if (rp) {
          repeatDone.set(j.item, (repeatDone.get(j.item) ?? 0) + 1)
          if ((repeatDone.get(j.item) ?? 0) < Math.min(rp.repeat!, policy.repeats?.[j.item] ?? 1)) researched.delete(j.item)
        }
        if (j.step === -2) {
          postResearching--
          postUpgrades++
          postTechs.push(j.item)
        }
        const st = j.step >= 0 ? steps[j.step] : null
        if (st?.kind === 'age') reachAge(st.age!, j.item)
        else log('done', `${name(j.item)}研究完成`, j.item)
      }
    }
    // 沒人蓋、也沒人在路上的建築（放下時所有人都在走路）：補派一名建造者
    for (const b of blds) {
      if (b.done || b.builders > 0 || autoBuild.includes(b) || b.role === 'farm') continue
      const tgt = `b:${b.uid}`
      if (walkers.some((w) => w.to === tgt)) continue
      takeBuilders(1, b)
    }
    act()
    countIdle()
    // 該重算分配時先算目標（rebalance 內會分派空閒村民），不然用上次的目標分派
    if (t - lastRebalance >= ctl.rebalance) rebalance()
    if (free.length) assignFree()

    // 採集
    refreshGolden()
    globalMul = golden.gather
    // 監工督導投放建築（+20%）：沒在督導研究或生產的監工，各督導一種有投放建築（不是城鎮中心）的資源，照採集人數由多到少
    supervisedRes.clear()
    if (spec.officials && officialsN > 0) {
      const byRes = zero()
      for (const x of sites) if (x.workers > 0 && supervisable(x)) byRes[x.res] += x.workers
      const order = RES.filter((r) => byRes[r] > 0).sort((a, b) => byRes[b] - byRes[a])
      for (const r of order.slice(0, Math.max(0, officialsFree()))) supervisedRes.add(r)
    }
    if (spec.inspire) {
      inspireSite = null
      for (const x of sites) if (x.workers > 0 && (!inspireSite || x.workers > inspireSite.workers)) inspireSite = x
      // 神職人員駐紮光環建築（亞琛禮拜堂）罩到的人比在外激勵多時就駐紮，在外的激勵停止
      // 只有一名神職人員：在所有能駐紮的建築（亞琛禮拜堂、西篤會修道院）裡挑罩到最多人的
      let g: (typeof zoneInst)[number] | null = null
      let gc = 0
      for (const i of zoneInst) {
        if (!i.z.garrison || (i.z.requires && !fired.has(i.z.requires) && !owned(i.z.requires))) continue
        const c = coveredBy(i)
        if (c > gc) {
          g = i
          gc = c
        }
      }
      const inField = inspireSite ? Math.min(spec.inspire.villagers, inspireSite.workers) : 0
      const target = g && gc > inField ? g : null
      if (target) inspireSite = null
      if (target !== garrisonInst) {
        garrisonInst = target
        garrisoned = !!target
        zoneVer++
      }
    }
    for (const x of sites) {
      // 手上的資源：投放了才入帳（職業的紀錄也是投放時才算）。每名在採的村民平均帶著半趟的量；
      // 人走了先投放（多出來的入帳），人來了先裝滿手上那半趟，才開始入帳。開局第一趟、每次換點都會晚一點入帳
      const handCap = IN_HAND && x.fixed == null && !(x.res === 'wood' && spec.woodInstant) ? (Math.max(0, x.workers) * carryAt(x)) / 2 : 0
      let dep = 0
      if ((x.hand ?? 0) > handCap) {
        dep = (x.hand ?? 0) - handCap
        x.hand = handCap
      }
      if (x.workers <= 0 && dep <= 0) continue
      if (x === farm && x.workers > farmSlots()) x.workers = farmSlots()
      let amt = x.workers > 0 ? effRate(x) * x.workers : 0
      if (amt > x.left) amt = x.left
      x.left -= amt
      if (handCap > 0 && (x.hand ?? 0) < handCap) {
        const fill = Math.min(amt, handCap - (x.hand ?? 0))
        x.hand = (x.hand ?? 0) + fill
        amt -= fill
      }
      amt += dep
      if (x.res === 'wood') x.chopped += amt
      bank[x.res] += amt
      incomeAcc[x.res] += amt
      const isHunt = x.s.kind === 'deer' || x.s.kind === 'boar' || x === sheep
      if (isHunt) huntDone += amt
      for (const bp of spec.byproducts) {
        const hit =
          bp.from === x.res ||
          bp.from === 'all' ||
          (bp.from === 'hunt' && isHunt) ||
          (bp.from === 'berry' && x.s.kind === 'berry' && x !== farm) ||
          (bp.from === 'farm' && x === farm) ||
          (bp.from === 'fish' && x === shoreFish)
        if (!hit) continue
        if (bp.requires && !owned(bp.requires)) continue
        addRes(bp.to, amt * bp.ratio * specialMul(x, bp.to))
        // 副產品也是收入（職業的累計收入 = 花費 + 庫存 − 開局，含副產品）
        if ((RES as string[]).includes(bp.to)) incomeAcc[bp.to as Res] += amt * bp.ratio * specialMul(x, bp.to)
        if (!(RES as string[]).includes(bp.to)) specialGathered[bp.to] = (specialGathered[bp.to] ?? 0) + amt * bp.ratio * specialMul(x, bp.to)
      }
      if (spec.depositBonus && spec.depositBonus.res.includes(x.res)) {
        bank[x.res] += amt * (spec.depositBonus.mul - 1)
        incomeAcc[x.res] += amt * (spec.depositBonus.mul - 1)
      }
      // 羅斯賞金：獵物每 10 食物 1 黃金。以前只進庫存、沒算進收入，回放以為黃金落後職業，派人去挖職業根本沒挖的金礦
      if ((x.s.kind === 'deer' || x.s.kind === 'boar' || x === sheep) && spec.huntGold) {
        bank.gold += amt * spec.huntGold
        incomeAcc.gold += amt * spec.huntGold
      }
      if (x.left <= 0 && x !== farm) {
        for (let k = 0; k < x.workers; k++) free.push({ from: x.s.id })
        x.workers = 0
        if (x.regrow && x.regrowAt == null) x.regrowAt = t + x.regrow
        if (x !== sheep) log('deplete', `${x.s.label}採完`)
      }
    }

    // 農田村民的額外收入（英格蘭圈地）
    if (farm.workers > 0) {
      for (const r of RES) {
        if (!tFarmer[r]) continue
        bank[r] += farm.workers * tFarmer[r]
        incomeAcc[r] += farm.workers * tFarmer[r]
      }
    }
    // 週期效果（日本倉庫送田、聖殿騎士團朝聖者、第一山丘蓄水池恩惠）
    for (const a of active) {
      if (!a.tr.every || t < a.next) continue
      applyGrant(a.tr.times == null || a.count < a.tr.times ? a.tr.each : a.tr.after, a.tr.on)
      if (a.tr.times == null || a.count < a.tr.times) {
        if (a.tr.eachCost) a.tokens = (a.tokens ?? 0) + 1
        else grantUnits(a.tr.eachUnitsByAge?.[age] ?? a.tr.eachUnits, a.tr.on)
      }
      a.count++
      a.next += a.tr.every
    }
    // 存起來的徵召次數（克里姆林宮）：付得起就用
    for (const a of active) {
      if (!a.tokens || !a.tr.eachCost) continue
      const c = { ...zero(), ...a.tr.eachCost } as Bundle
      const u = a.tr.eachUnitsByAge?.[age] ?? a.tr.eachUnits
      const popNeed = Object.entries(u ?? {}).reduce((s, [id, n]) => s + (items.get(id) ? variationAt(items.get(id)!, Math.max(age, minAge(items.get(id)!))).pop : 1) * n, 0)
      while (a.tokens > 0 && affordable(c) && cpop() + popNeed <= popCap()) {
        pay(c)
        a.tokens--
        grantUnits(u, a.tr.on)
      }
    }
    for (const x of sites) {
      if (x.regrowAt != null && t >= x.regrowAt) {
        x.left = x.s.amount
        x.regrowAt = undefined
      }
    }
    // 每項已研究科技的收入（希薩學院）、逐步增加的收入（浮鳥居依代）、每名單位的收入（邦迪伐木者）
    for (const a of active) {
      const tr = a.tr
      const gain: Partial<Record<Res, number>> = {}
      const add = (k: string, perSec: number) => {
        const key = (k === 'flex' ? flexRes() : k) as Res
        gain[key] = (gain[key] ?? 0) + perSec
      }
      if (tr.perTechIncome) for (const [k, x] of Object.entries(tr.perTechIncome)) add(k, ((x ?? 0) * researched.size) / 60)
      if (tr.incomePerMin) for (const [k, x] of Object.entries(tr.incomePerMin)) add(k, (x ?? 0) / 60)
      if (tr.rampIncome) {
        const since = t - a.start
        const n = Math.min(tr.rampIncome.max, 1 + Math.floor(since / tr.rampIncome.every))
        for (const [k, x] of Object.entries(tr.rampIncome.perMin)) add(k, ((x ?? 0) * n) / 60)
        // 依資源不同的收入（浮鳥居依代：農舍食物、伐木場木材 70，鍛造場黃金 50）：放在當下最缺的那種
        const fr = tr.rampIncome.flexRates
        if (fr) {
          const nd = need()
          const r = (Object.keys(fr) as Res[]).sort((p, q) => nd[q] - bank[q] - (nd[p] - bank[p]))[0]
          add(r, ((fr[r] ?? 0) * n) / 60)
        }
      }
      if (tr.unitIncome) {
        const n = trained.get(tr.unitIncome.unit) ?? 0
        for (const [k, x] of Object.entries(tr.unitIncome.perMin)) add(k, Math.min((x ?? 0) * n, tr.unitIncome.cap ?? Infinity) / 60)
      }
      for (const [k, x] of Object.entries(gain)) {
        bank[k as Res] += x ?? 0
        incomeAcc[k as Res] += x ?? 0
      }
    }
    // 里程碑（維京約弗薩迦：採 2500 獵物食物）
    for (const ms of spec.milestones ?? []) {
      if (fired.has(ms.id) || (ms.after && !fired.has(ms.after) && !researched.has(ms.after))) continue
      if (huntDone >= (huntAt.get(ms.id) ?? 0) + ms.amount) {
        log('note', `達成：${ms.label}`)
        fire(ms.id)
      }
    }
    // 囤積（法蘭西公會廳）：每 tick 秒存一筆，搜尋決定多久收一次
    for (const a of active) {
      const sp = a.tr.stockpile
      if (!sp) continue
      const st = (stock[a.tr.on] ??= { acc: 0, since: t, nextTick: t + sp.tick })
      if (t >= st.nextTick) {
        st.acc += Math.min(sp.cap, sp.start + (sp.grow * (t - st.since)) / 60)
        st.nextTick += sp.tick
      }
      if (st.acc > 0 && t - st.since >= (policy.collectEvery ?? 180)) {
        const r = flexRes()
        const amt = r === 'stone' ? st.acc / 2 : st.acc
        bank[r] += amt
        incomeAcc[r] += amt
        log('note', `收取${name(a.tr.on)}囤積：${Math.round(amt)} ${RES_ZH[r]}`)
        stock[a.tr.on] = { acc: 0, since: t, nextTick: t + sp.tick }
      }
    }
    // 聖物與聖地
    if (holy && relUnit && relHome) {
      const wantSites = Math.min(holy.sites, policy.sites ?? 0)
      const wantRelics = Math.min(holy.relics, policy.relics ?? 0)
      const sc = spec.sanctity
      const canSites = age >= 3 || (!!sc && age >= sc.fromAge && researched.has(sc.tech))
      const canRelics = age >= 3
      // 任務完成
      if (monkTask && t >= monkBusyUntil) {
        if (monkTask === 'site') {
          sitesHeld++
          log('note', `佔領聖地（第 ${sitesHeld} 個）`)
        } else {
          relicsHeld++
          log('note', `聖物送回（第 ${relicsHeld} 個）`)
        }
        monkTask = null
      }
      const more = (canSites && sitesHeld + (monkTask === 'site' ? 1 : 0) < wantSites) || (canRelics && relicsHeld + (monkTask === 'relic' ? 1 : 0) < wantRelics)
      if (more) {
        const hb = items.get(relHome)
        if (!hasRelProducer()) {
          if (hb && minAge(hb) <= age && affordable(costOf(variationAt(hb, age)))) place(relHome, 'econ', -1, 1, 8)
        } else if (monks + monkTraining === 0) {
          const v = variationAt(relUnit, Math.max(age, minAge(relUnit)))
          const villRoom = producingVills() ? batchSize : 0
          for (const b of idleProducers(relProducers)) {
            if (minAge(relUnit) > age || !affordable(costOf(v)) || cpop() + v.pop + villRoom > popCap()) break
            pay(costOf(v))
            b.job = { kind: 'unit', item: relUnit.id, end: t + v.time, count: 1, step: -7, pop: v.pop, dur: v.time }
            armyPop += v.pop
            monkTraining++
            log('train', `訓練${name(relUnit.id)}（聖物、聖地）`, relUnit.id, costOf(v))
            break
          }
        } else if (monks > 0 && !monkTask) {
          const spd = variationAt(relUnit, Math.max(age, minAge(relUnit))).speed ?? 1.125
          if (canSites && sitesHeld < wantSites) {
            monkTask = 'site'
            monkBusyUntil = t + holy.siteDist / spd + 30
          } else if (canRelics && relicsHeld < wantRelics) {
            // 走過去、帶著聖物走回來（帶聖物時約 0.8 倍速，Fandom 教士 1.12 → 0.9）
            monkTask = 'relic'
            monkBusyUntil = t + holy.relicDist / spd + holy.relicDist / (spd * 0.8)
          }
        }
      }
      // 寶塔（元朝）：有聖物就蓋，最多 max 座
      const pg = spec.relicPagoda
      if (pg && fired.has(pg.requires) && relicsHeld > blds.filter((b) => b.item === pg.building).length && blds.filter((b) => b.item === pg.building).length < pg.max) {
        const pit = items.get(pg.building)
        if (pit && affordable(costOf(variationAt(pit, age)))) place(pg.building, 'econ', -1, 1, 8)
      }
      // 收入
      if (relicsHeld || sitesHeld) {
        const pagodas = pg && fired.has(pg.requires) ? Math.min(relicsHeld, pg.max, blds.filter((b) => b.done && b.item === pg.building).length) : 0
        const inMon = relicsHeld - pagodas
        let gold = inMon * 80
        for (const rm of spec.relicMul ?? []) if (owned(rm.building)) gold *= rm.mul
        const inc: Bundle = { food: 0, wood: 0, gold, stone: 0 }
        if (researched.has('tithe-barns')) {
          inc.food += 40 * inMon
          inc.wood += 40 * inMon
          inc.stone += 10 * inMon
        }
        if (pg) for (const [k, x] of Object.entries(pg.perMin)) inc[k as Res] += (x ?? 0) * pagodas
        inc.gold += sitesHeld * 100 * (sc && researched.has(sc.tech) ? sc.siteMul : 1)
        for (const r of RES) {
          bank[r] += inc[r] / 60
          incomeAcc[r] += inc[r] / 60
        }
      }
    }
    // 拜占庭金角塔：依序免費產出合約裡可用的傭兵（遊戲是隨機挑，這裡輪流）；人口不夠就等
    const mc = spec.mercenaries
    if (mc) {
      const gb = blds.find((b) => b.done && b.item === mc.building)
      const ct = mc.contracts[policy.contract ?? ''] ?? Object.values(mc.contracts)[0]
      const avail = ct.units.map((u) => ({ u, it: items.get(u.id) })).filter((x) => x.it && minAge(x.it) <= age && (!x.u.requires || researched.has(x.u.requires)))
      if (gb && avail.length) {
        const cur = avail[mercIdx % avail.length]
        const v = variationAt(cur.it!, age)
        const ub = unitBatch(cur.u.id, v)
        mercNext ??= (gb.doneAt ?? t) + ub.time * mc.timeMul
        if (t >= mercNext && cpop() + v.pop * ub.size <= popCap()) {
          grantUnits({ [cur.u.id]: ub.size }, mc.building)
          mercIdx++
          const nx = avail[mercIdx % avail.length]
          mercNext = t + unitBatch(nx.u.id, variationAt(nx.it!, age)).time * mc.timeMul
        }
      }
    }
    // 岸邊魚：有碼頭之後就近投放到碼頭
    if (shoreFish && shoreFish.camp !== 2 && (owned('dock') || owned('harbor'))) shoreFish.camp = 2
    // 捕魚：漁船平均分到各個深水魚；魚採完後每秒長回 5，所以每個魚點最多每秒 5 食物
    if (fish && boats > 0) {
      let food = 0
      for (let i = 0; i < fishLeft.length; i++) {
        const nb = Math.floor(boats / fishLeft.length) + (i < boats % fishLeft.length ? 1 : 0)
        if (fishRegrow[i]) fishLeft[i] = Math.min(DEEP_FISH, fishLeft[i] + FISH_REGROW)
        const g = Math.min(fishLeft[i], nb * fiRate())
        fishLeft[i] -= g
        if (fishLeft[i] <= 1e-9 && !fishRegrow[i]) {
          fishRegrow[i] = true
          log('deplete', `深水魚 ${i + 1} 採完，之後每 10 秒長回 50`)
        }
        food += g
      }
      bank.food += food
      incomeAcc.food += food
      for (const fb of spec.fishBonus ?? []) {
        addRes(fb.to, food * fb.ratio)
        if ((RES as string[]).includes(fb.to)) incomeAcc[fb.to as Res] += food * fb.ratio
      }
    }
    // 陸地貿易
    if (trade) {
      const inc = zero()
      // 免費商人（商會）：擁有後每完成一項清單上的經濟科技送 1 名，研究在前的補送
      const ft = tsp?.freeTraders
      if (ft && trUnit && owned(ft.building)) {
        const due = Math.min(ft.max, ft.techs.filter((id) => researched.has(id)).length)
        while (freeTradersGiven < due) {
          freeTradersGiven++
          traderNext.push(t + trLeg())
          armyPop += 1
          log('note', `${name(ft.building)}送 1 名${name(trUnit.id)}（第 ${freeTradersGiven} 名）`)
        }
      }
      // 商人到達一端
      if (traderNext.length) {
        let k = 0
        for (let i = 0; i < traderNext.length; i++) {
          while (traderNext[i] <= t) {
            traderNext[i] += trLeg()
            k++
          }
        }
        if (k) {
          let gold = trGold * golden.trade * mulOnOf(tsp?.goldMul)
          // 金朝：在朝貢國貿易（有朝貢國時商人都改去那座）
          if (tsp?.tributary && tribs.length) gold *= tsp.tributary.goldMul
          const total = gold * k
          if (tsp?.anyRes) {
            // 法蘭西、貞德：每名商人可選食物／木材／黃金，近似成每趟給當下最缺的那種
            const r = flexRes()
            inc[r === 'stone' ? 'gold' : r] += total
          } else inc.gold += total
          for (const tier of tsp?.tiers ?? []) if (traderNext.length >= tier.n) inc[tier.res] += total * tier.pct
          const tl = tsp?.tolls
          if (tl) {
            const lm = owned(tl.landmark) ? 1 : 0
            const outposts = Math.min(tl.maxPerLeg - lm, blds.filter((b) => b.done && b.item === tl.building).length)
            inc.gold += total * tl.pct * (lm + outposts)
            // 撒哈拉貿易網：在它收的稅另給等量食物，其他哨站另給一半
            if (lm) inc.food += total * tl.pct * (1 + tl.foodPct * outposts)
          }
          if (tsp?.other) addRes(tsp.other.to, total * tsp.other.ratio)
          if (!tradeLogged && rec) {
            tradeLogged = true
            log('note', `第一趟貿易：每名${name(trUnit!.id)}每 ${Math.round(trLeg())} 秒到一端，每趟 ${Math.round(gold)} 黃金（路線 ${trade.dist} 格）`)
          }
        }
      }
      // 日本烏城：完成 delay 秒後第一隊寶物商隊從貿易站出發，之後每 every 秒一隊（不管上一隊到了沒）
      const cv = tsp?.caravan
      if (cv) {
        const cb = blds.find((b) => b.done && b.item === cv.building)
        if (cb) {
          caravanSpawn ??= (cb.doneAt ?? t) + cv.delay
          while (caravanSpawn <= t) {
            caravanArrive.push(caravanSpawn + trade.dist / cv.speed)
            caravanSpawn += cv.every
          }
          while (caravanArrive.length && caravanArrive[0] <= t) {
            caravanArrive.shift()
            const a = Math.min(cv.cap, cv.base + cv.perTile * trade.dist)
            const s = Math.min(cv.stoneCap, cv.stoneBase + cv.stonePerTile * trade.dist)
            inc.food += a
            inc.wood += a
            inc.gold += a
            inc.stone += s
            log('note', `寶物商隊抵達：食物、木材、黃金各 ${Math.round(a)}，石頭 ${Math.round(s)}`)
          }
        }
      }
      // 金朝朝貢國：龍亭蓋好送 1 名使者；使者走到貿易站建立朝貢國後消失（釋出人口）
      const tb = tsp?.tributary
      if (tb) {
        const ev = items.get(tb.unit)
        if (!envoyFree && ev && owned(tb.free)) {
          envoyFree = true
          envoys++
          armyPop += variationAt(ev, 3).pop
          log('note', `${name(tb.free)}送 1 名${name(tb.unit)}`)
        }
        while (envoyArrive.length && envoyArrive[0] <= t) {
          envoyArrive.shift()
          tribs.push(t)
          if (ev) armyPop -= variationAt(ev, 3).pop
          log('note', `建立朝貢國（第 ${tribs.length} 座）：商人黃金 ×${tb.goldMul}、工人上限 +${tb.workerCap}`)
        }
        const spd = ev ? (variationAt(ev, 3).speed ?? SPEED) : SPEED
        while (envoys > 0 && tribs.length + envoyArrive.length < wantTribs()) {
          envoys--
          envoyArrive.push(t + trade.dist / spd + tb.establish)
          envoyArrive.sort((a, b) => a - b)
        }
        if (tribs.length) {
          const mul = 1 + tb.techPct * tb.techs.filter((id) => researched.has(id)).length
          let food = 0
          for (const e of tribs) food += tb.rates[Math.min(tb.rates.length - 1, Math.floor((t - e) / tb.every))]
          inc.food += (food * mul) / 60
        }
      }
      for (const r of RES) {
        bank[r] += inc[r]
        incomeAcc[r] += inc[r]
      }
    }
    // 貸款（聖殿騎士團匯票）：缺黃金、食物真的有多時借一筆
    const ln = spec.loans
    if (ln && researched.has(ln.requires) && !active.some((a) => a.tr.on === 'loan') && flexRes() === 'gold') {
      const nd = need()
      const o = [...ln.options].sort((a, b) => b.food - a.food).find((x) => bank.food - x.food >= nd.food)
      if (o) {
        bank.food -= o.food
        active.push({ tr: { on: 'loan', incomePerMin: { gold: o.perSec * 60 } }, until: t + o.duration, next: Infinity, count: 0, start: t })
        log('research', `朝聖者貸款：付 ${o.food} 食物，${o.duration} 秒內每秒 ${o.perSec} 黃金`, undefined, { food: o.food, wood: 0, gold: 0, stone: 0 })
      }
    }
    // 英雄（聖女貞德）：累積經驗，升級後離開經濟
    const hr = spec.hero
    if (hr && !heroLeft) {
      heroXp += hr.xpPassive + ((workerCount.get(hr.worker) ?? 0) > 0 ? hr.xpWork : 0)
      if (heroXp >= hr.levelUp) {
        heroLeft = true
        workerCount.set(hr.worker, Math.max(0, (workerCount.get(hr.worker) ?? 0) - 1))
        villagers = Math.max(0, villagers - 1)
        heroPop = 1
        // 從採集點拿走一人（挑最慢的點）
        const x = sites.filter((y) => y.workers > 0).sort((a, b) => effRate(a) - effRate(b))[0]
        if (x) x.workers--
        refreshWorkers()
        log('note', `${name(hr.worker)}經驗 ${hr.levelUp}，升 2 級後離開經濟`)
        fire(hr.on)
      }
    }
    // 巴克爾總督：要塞旁農田與房屋產食物（第 4 級另給石頭）
    if (spec.governors) {
      const g = govState()
      bank.food += g.food / 60
      incomeAcc.food += g.food / 60
      bank.stone += g.stone / 60
      incomeAcc.stone += g.stone / 60
    }
    // 詔令（金帳）：有前哨、選項已解鎖時生效（一次一種）
    const ed = spec.edicts
    if (ed && policy.edict && !edictOn) {
      const o = ed.options[policy.edict]
      if (o && owned(ed.requires) && (!o.requires || researched.has(o.requires))) {
        active.push({ tr: { on: 'edict:' + policy.edict, prod: o.prod, farmerIncome: o.farmerIncome }, until: Infinity, next: Infinity, count: 0, start: t })
        recomputeTriggers()
        edictOn = policy.edict
        log('note', `發布${o.label}`)
      }
    }
    // 草場產馬（金朝）
    const hs = spec.horses
    if (hs) {
      const n = blds.filter((b) => b.done && b.item === hs.building).length
      const every = hs.every[age - 1]
      if (n && every) horses = Math.min(n * hs.max, horses + n / every)
    }
    // 輔助單位收入（教士魚池、禪之後的僧侶）
    for (const su of spec.support ?? []) {
      const n = supportN.get(su.unit) ?? 0
      if (!n || (su.requires && !owned(su.requires) && !researched.has(su.requires))) continue
      const m = mulOnOf(su.mulOn)
      for (const [k, x] of Object.entries(su.perMin)) {
        bank[k as Res] += ((x ?? 0) * n * m) / 60
        incomeAcc[k as Res] += ((x ?? 0) * n * m) / 60
      }
    }
    // 免費產兵的建築（鄂圖曼軍事學校）
    for (const tr of spec.trickles) {
      if (!tr.unit) continue
      const n = blds.filter((b) => b.done && b.item === tr.building).length
      if (!n) continue
      unitAcc[tr.building] = (unitAcc[tr.building] ?? 0) + n / tr.unit.every
      if (unitAcc[tr.building] >= 1) {
        const k = Math.floor(unitAcc[tr.building])
        unitAcc[tr.building] -= k
        grantUnits({ [tr.unit.id]: k }, tr.building)
      }
    }
    // 指定建築的額外收入（蘭開斯特免役稅）
    for (const { tr } of active) {
      if (tr.mint) addRes(tr.mint.res, ((specialGathered[tr.mint.res] ?? 0) * tr.mint.pctPerMin) / 60)
      if (tr.perGovernor) {
        const g = govState().count
        for (const [k, x] of Object.entries(tr.perGovernor)) {
          bank[k as Res] += ((x ?? 0) * g) / 60
          incomeAcc[k as Res] += ((x ?? 0) * g) / 60
        }
      }
      const bi = tr.buildingIncome
      if (!bi) continue
      const n = Math.min(bi.max ?? Infinity, blds.filter((b) => b.done && b.item === bi.building).length)
      for (const [k, perMin] of Object.entries(bi.perMin)) {
        const amt = ((perMin ?? 0) * n) / 60
        bank[k as Res] += amt
        incomeAcc[k as Res] += amt
      }
    }
    // 有時效的修正到期（鄂圖曼和平 240 秒）
    if (active.some((a) => a.until <= t)) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i].until <= t) active.splice(i, 1)
      recomputeTriggers()
    }

    // 業力（金朝山殿）
    const km = spec.karma
    if (km && owned(km.building)) {
      if (karma == null) karma = km.start
      if (t >= karmaUntil) {
        const p = buildingPoint(km.building)
        // 範圍內的採集點：採集與帶著資源走回投放點都算（空手走過去不算）
        let rate = 0
        const avg = [...workerCount].reduce((s, [id, n]) => s + n * (km.rates[id] ?? km.rates.villager ?? 0.1), 0) / Math.max(1, villagers)
        for (const x of sites) {
          if (x.workers <= 0) continue
          const inR = x === farm ? siteDistance(p, FARM_SITE) <= km.radius : siteDistance(p, x.s) <= km.radius + extentOf(x)
          if (!inR) continue
          const tg = carryNow() / Math.max(0.01, rawRate(x))
          const tw = dropDist(x) / (SPEED * mods.speed * wSpeed * tSpeed)
          rate += x.workers * avg * ((tg + tw) / (tg + 2 * tw))
        }
        karma += rate
        if (karma >= km.threshold) {
          karmaUntil = t + km.duration
          karma = 0
          active.push({ tr: { on: km.building + ':karma', gather: km.gather }, until: t + km.duration, next: Infinity, count: 0, start: t })
          recomputeTriggers()
          log('note', `業力滿 ${km.threshold}，${km.duration} 秒內農田採集 +${Math.round(((km.gather.farm ?? 1) - 1) * 100)}%`)
        }
      }
    }
    // 慶典（馬利格里奧巴拉）
    const fs = spec.festival
    if (fs && policy.festival && fs.options[policy.festival] && owned(fs.building) && t >= festNext) {
      const c = { ...zero(), ...fs.cost } as Bundle
      if (affordable(c)) {
        pay(c)
        const o = fs.options[policy.festival]
        active.push({ tr: { on: fs.building + ':festival', gather: o.gather, villagerTime: o.villagerTime, prod: o.prod }, until: t + fs.duration, next: Infinity, count: 0, start: t })
        recomputeTriggers()
        festNext = t + fs.duration + fs.cooldown
        log('research', `舉辦${o.label}（${fs.duration} 秒）`, fs.building, c)
      }
    }
    // 冥想花園：範圍內資源存量增加
    for (const bz of bountyAt) {
      if (t < bz.next) continue
      const tr = bz.tr.bounty!
      const inR = sites.filter((x) => x !== farm && x !== sheep && (x.s.kind === 'berry' || x.s.kind === 'gold' || x.s.kind === 'stone' || x.s.kind === 'wood') && siteDistance(bz.p, x.s) <= tr.radius + extentOf(x))
      if (bz.count < tr.times) {
        for (const x of inR) {
          const add = x.s.amount * (x.s.kind === 'wood' ? tr.treePct : tr.pct)
          if (x.left > 0 && Number.isFinite(add)) x.left += add
        }
        bz.count++
        bz.next += tr.every
      } else if (bz.count === tr.times) {
        for (const x of inR) {
          if (x.left <= 0 || !Number.isFinite(x.left)) continue
          bank[x.res] += x.left * tr.finalPct
          incomeAcc[x.res] += x.left * tr.finalPct
        }
        bz.count++
        log('note', `冥想花園：範圍內 ${inR.length} 個採集點各給剩餘量的 ${tr.finalPct * 100}%`)
      }
    }

    // 範圍內每名村民的收入（蘭開斯特莊園光環）：同種多座只算一次
    for (const z of spec.zones ?? []) {
      if (!z.perWorker) continue
      const n = coveredUnion(z)
      if (!n) continue
      for (const [k, perMin] of Object.entries(z.perWorker)) {
        const amt = ((perMin ?? 0) * n) / 60
        bank[k as Res] += amt
        incomeAcc[k as Res] += amt
      }
    }
    // 被動收入建築（莊園、坑礦、屋台…）
    for (const tr of spec.trickles) {
      const n = Math.min(tr.max, blds.filter((b) => b.done && b.item === tr.building).length + (researched.has(tr.building) ? 1 : 0))
      if (!n) continue
      // 家附近的村民另有收入（蘭開斯特莊園光環，近似：莊園蓋在家附近，罩住羊、散樹與農田）
      // 依附近來源的收入（屋台）：每座挑一個還沒被佔的最好採集點
      if (tr.sources) {
        const src = tr.sources
        const contrib = sites
          .filter((x) => x.left > 0 && x.res === 'food' && x !== herd)
          .map((x) => {
            if (x === farm) return src.per.farm && (!src.farmTech || researched.has(src.farmTech)) ? farmsBuilt * src.per.farm : 0
            const kind = x === sheep ? 'sheep' : (x.s.kind as 'berry' | 'deer' | 'boar')
            const each = x === sheep ? 200 : x.s.amount / Math.max(1, x.s.units)
            return Math.ceil(x.left / each) * (src.per[kind] ?? 0)
          })
          .sort((a, b) => b - a)
        let perMin = 0
        for (let k = 0; k < n; k++) perMin += src.base + (contrib[k] ?? 0)
        bank.food += perMin / 60
        incomeAcc.food += perMin / 60
        if (src.trader) {
          yataiFood += perMin / 60
          while (yataiFood >= src.trader.every) {
            yataiFood -= src.trader.every
            bank.food += src.trader.food
            incomeAcc.food += src.trader.food
            if (matsuriAura < src.trader.max - 1e-9) {
              matsuriAura = Math.min(src.trader.max, matsuriAura + src.trader.step)
              zoneVer++
            }
          }
        }
      }
      for (const [k, perMin] of Object.entries(tr.perMin)) {
        const amt = ((perMin ?? 0) * n * (tr.ageMul?.[age - 1] ?? 1) * mulOnOf(tr.mulOn) * (spec.bountyTiers && tr.building === 'hunting-cabin' ? (bountyTier()?.cabin ?? 1) : 1)) / 60
        addRes(k, amt)
        if ((RES as string[]).includes(k)) incomeAcc[k as Res] += amt
      }
    }

    // 建造
    for (const b of blds) {
      if (b.done) continue
      if (autoBuild.includes(b)) {
        b.progress += 1
      } else if (b.builders > 0) b.progress += ((b.builders + 2) / 3) * (b.ageTo != null ? wBuild.landmark : wBuild.other) * tBuild * golden.build
      if (b.progress >= b.total) {
        const n = b.builders
        finishBld(b)
        if (b.role === 'farm') {
          for (let k = 0; k < n; k++) walkers.push({ to: 'farm', eta: t + 1, res: 'food' })
        } else if (b.role === 'camp' && b.siteId) {
          for (let k = 0; k < n; k++) walkers.push({ to: b.siteId, eta: t + 1, res: siteById.get(b.siteId)!.res })
        } else for (let k = 0; k < n; k++) free.push({ from: `b:${b.uid}` })
      }
    }


    // 步驟完成
    let allDone = true
    for (let i = 0; i < steps.length; i++) {
      if (stepDone[i] != null) continue
      const st = steps[i]
      let ok = false
      if (st.kind === 'age') ok = age >= st.age!
      else if (st.kind === 'build') ok = st.implicit && !blds.some((b) => b.step === i) ? (!!script && !script.dropoffs.some((d) => d.id === st.item)) || blds.some((b) => b.item === st.item && b.done) : blds.filter((b) => b.step === i && b.done).length >= st.count
      else if (st.kind === 'army') ok = (trained.get(st.item) ?? 0) >= st.count
      else if (st.kind === 'tech') ok = researched.has(st.item)
      else if (st.kind === 'villagers') ok = villagers >= st.count
      if (ok) {
        stepDone[i] = t
        if (!st.implicit) log('goal', `目標完成：${st.label}`)
      } else allDone = false
    }

    if (rec && t >= sampleNext) {
      sampleNext += 5
      const sp = splitNow()
      const inc = zero()
      for (const r of RES) {
        inc[r] = (incomeAcc[r] - incomeWindow[r]) * 12
        incomeWindow[r] = incomeAcc[r]
      }
      samples.push({
        t,
        bank: { ...bank },
        other: { ...other },
        split: sp,
        building: blds.reduce((n, b) => n + (b.done ? 0 : b.builders), 0) + walkers.filter((w) => w.to.startsWith('b:')).length,
        walking: walkers.length,
        idle,
        villagers,
        pop: pop(),
        popCap: popCap(),
        age,
        army: armyCount,
        income: inc,
        sites: sites.map((x) => ({ id: x.s.id, workers: x.workers, left: x.left, rate: x.workers ? Math.round(effRate(x) * 60) : undefined })),
        gathered: { ...incomeAcc },
        farms: farmsBuilt,
      })
    }
    if (allDone && postStart == null) {
      postStart = t
      villagersAtGoal = villagers
      gatheredAtGoal = { ...incomeAcc }
      if (!postOn()) break
      log('note', `全部目標完成，開始全力出兵（目標：${post.units} 兵${upgradeTarget() ? `、${upgradeTarget()} 項升級` : ''}）`)
    }
    if (postStart != null) {
      if (postUnits >= post.units && postUpgrades >= upgradeTarget()) {
        armyAt = t
        log('goal', `全力出兵完成：${postUnits} 兵、${postUpgrades} 項升級`)
        break
      }
      if (t - postStart >= POST_CAP || (opts.postBound != null && t >= opts.postBound)) break
    }
    t += 1
  }

  const finish = stepDone.every((x) => x != null) ? Math.max(0, ...(stepDone as number[])) : Infinity
  const goals: GoalResult[] = []
  const gi = new Set(steps.map((s) => s.goalIndex))
  for (const g of gi) {
    const idx = steps.map((s, i) => (s.goalIndex === g ? i : -1)).filter((i) => i >= 0)
    const last = idx[idx.length - 1]
    goals.push({ goalIndex: g, label: steps[last].label, t: stepDone[last] })
  }
  const sumGoals = goals.reduce((s, g) => s + (g.t ?? maxT * 2), 0)
  if (!Number.isFinite(finish)) warnings.push(`在 ${Math.round(maxT / 60)} 分鐘內沒有完成全部目標`)
  const on = postOn()
  if (on && Number.isFinite(finish) && armyAt == null && rec) warnings.push(`目標後 ${POST_CAP / 60} 分鐘內沒有達到 ${post.units} 兵、${upgradeTarget()} 項升級`)
  if (post.upgrades > 0 && upgradeTarget() === 0 && rec) warnings.push('這個文明沒有鐵匠舖（或鍛造場），全力出兵階段不計升級')
  // 沒達成時用「上限 + 缺口」估一個很差的時間，讓搜尋仍能比較
  const armyEff =
    armyAt ??
    (postStart != null
      ? Math.max(t, postStart + POST_CAP) + Math.max(0, post.units - postUnits) * 10 + Math.max(0, upgradeTarget() - postUpgrades) * 30
      : Infinity)
  const base = Number.isFinite(finish) ? (on ? armyEff + 0.5 * finish : finish) : maxT * 3
  const buildings: BuildingTrack[] = rec
    ? blds
        .filter((b) => b.role !== 'farm' || b.done)
        .map((b) => {
          const z = zoneBy.get(b.item)
          return { uid: b.uid, item: b.item, role: b.role, at: b.at, angle: b.angle, placed: b.placedAt ?? 0, done: b.doneAt ?? null, ...(z ? { radius: z.radius + z.half, anchor: b.anchor } : {}) }
        })
    : []
  return {
    ok: Number.isFinite(finish),
    finish,
    armyAt: on ? (armyAt ?? Infinity) : null,
    postUnits,
    postUpgrades,
    postMix,
    postTechs,
    villagersAtGoal: postStart != null ? villagersAtGoal : villagers,
    gatheredAtGoal: RES.reduce((a, r) => a + (gatheredAtGoal ?? incomeAcc)[r], 0),
    gatheredByRes: { ...(gatheredAtGoal ?? incomeAcc) },
    buildings,
    // 次要條件：目標達成時的累計收入，每 100 資源抵 1 秒。目標晚 1 秒只多採約 10 資源（抵 0.1 秒），
    // 所以不會為了經濟拖慢目標，只會在目標時間相近時偏向經濟比較強的做法（例如阿尤布早蓋野果磨坊）
    score: base + 0.05 * sumGoals + (opts.idleWeight ?? 60) * tcIdle - ECO_WEIGHT * RES.reduce((a, r) => a + (gatheredAtGoal ?? incomeAcc)[r], 0),
    tcIdle,
    tcIdleReasons,
    goals,
    steps,
    events,
    samples,
    ageTimes,
    villagers,
    warnings,
  }
}
