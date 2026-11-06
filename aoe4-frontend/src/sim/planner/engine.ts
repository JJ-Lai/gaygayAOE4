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
} from './types.ts'

const SPEED = 1.125
/** 評分：目標達成時每 1 資源的累計收入抵多少秒 */
const ECO_WEIGHT = 0.01
/** 選採集點時，把走路與蓋投放點的一次性時間攤到多少秒的採集上 */
const SETUP_H = 120
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
}

/** 撿聖物、佔聖地的宗教單位候選（依序取第一個目錄裡有的） */
const RELIGIOUS = ['monk', 'scholar', 'imam', 'shaman', 'prelate', 'buddhist-monk', 'dervish', 'kirkman', 'warrior-monk']

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
  /** 有收入的輔助單位：已有與訓練中的人數 */
  const supportN = new Map<string, number>()
  const supportTraining = new Map<string, number>()
  let herdBought = 0
  let herdTraining = 0
  const siteById = new Map(sites.map((x) => [x.s.id, x]))
  let farmsBuilt = 0
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
    const inTraining = blds.reduce((n, b) => n + (b.job?.kind === 'vill' && b.job.item === spec.worker ? b.job.count : 0), 0)
    if (spec.fallbackWorker && (workerCount.get(spec.worker) ?? 0) + inTraining >= spec.workerCap) return items.get(spec.fallbackWorker)
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
    wBuild = { landmark: (build.landmark + rest) / all, other: (build.other + rest) / all }
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
  /** 神職人員是否駐紮在光環建築（亞琛禮拜堂、西篤會修道院），駐紮在哪一座 */
  let garrisoned = false
  let garrisonInst: { z: Zone; p: Site; anchor: string } | null = null
  /** 一座光環建築範圍內正在採集的人數 */
  const coveredBy = (i: { z: Zone; p: Site; anchor: string }) => {
    let n = 0
    for (const x of sites) {
      if (x.workers <= 0 || (i.z.res !== 'all' && i.z.res !== x.res)) continue
      if (x === farm) n += i.anchor === 'home' ? Math.min(x.workers, farmsIn(i.z) * spec.farm.slots) : 0
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
      if (z.to || (z.res !== 'all' && z.res !== x.res)) continue
      if (z.farmOnly && x !== farm) continue
      const inst = zoneInst.filter((i) => i.z === z && (!z.garrison || i === garrisonInst))
      if (!inst.length || (z.garrison && !garrisoned)) continue
      if (x === farm) {
        const home = inst.filter((i) => i.anchor === 'home').length
        if (farmsBuilt <= 0 || !home) continue
        // 疊加型（糧倉）：每座各罩 farmsIn 塊田，各自 +(mul-1)；否則同種只算一次
        if (z.stack) m *= 1 + ((z.mul - 1) * home * Math.min(farmsIn(z), farmsBuilt)) / farmsBuilt
        else m *= 1 + ((z.mul - 1) * Math.min(home * farmsIn(z), farmsBuilt)) / farmsBuilt
      } else {
        const n = inst.filter((i) => siteDistance(i.p, x.s) <= z.radius + z.half + extentOf(x)).length
        if (n) m *= z.stack ? 1 + (z.mul - 1) * n : z.mul
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
        if (i.anchor === 'home' && farmsBuilt > 0) m *= 1 + ((i.z.mul - 1) * Math.min(farmsIn(i.z), farmsBuilt)) / farmsBuilt
      } else if (siteDistance(i.p, x.s) <= i.z.radius + i.z.half + extentOf(x)) m *= i.z.mul
    }
    return m
  }

  /** 黃金時代目前各項倍率（每秒算一次） */
  let golden = { gather: 1, build: 1, research: 1, prod: 1 }
  const refreshGolden = () => {
    golden = { gather: 1, build: 1, research: 1, prod: 1 }
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
    }
  }
  /** 一般科技的研究時間（升代科技不算：阿尤布黃金時代會不會加快側翼不明） */
  const researchTime = (time: number) => (time / golden.research) * scholarMul()
  /** 監工：開局人數 + 訓練完的；督導中的不能再督導別棟 */
  let officialsN = spec.officials?.start ?? 0
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
  const scholarMul = () => (spec.scholars ? (14 / 15) * Math.pow(0.87808, scholarsN) + 1 / 15 : 1)

  /** 神職人員激勵：跟著人最多的採集點走，只激勵那裡的村民（最多 villagers 名） */
  let inspireSite: SiteSt | null = null
  const inspireAt = (x: SiteSt) =>
    spec.inspire && x === inspireSite && x.workers > 0 ? 1 + ((spec.inspire.mul - 1) * Math.min(spec.inspire.villagers, x.workers)) / x.workers : 1

  let globalMul = 1

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
          const farmAge = spec.farmByAge && (owned('mill') || owned('farmhouse')) ? spec.farmByAge[age - 1] : 1
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
    return r * (x.mul ?? 1) * g.all * globalMul * zoneMul(x) * inspireAt(x) * tGather.all * tGather[tk]
  }

  const dropDist = (x: SiteSt) => {
    if (x === sheep || x === startHunt) return 2
    if (x === farm) return 2.5
    if (x.camp === 2) return x.res === 'wood' ? 2 + Math.min(4, x.chopped / 2500) : x.res === 'food' ? 2 : 1.5
    return Math.max(2, x.s.dist - 2)
  }

  const effRate = (x: SiteSt, assumeCamp = false) => {
    if (x.fixed != null) return x.fixed
    const raw = rawRate(x)
    if (x.res === 'wood' && spec.woodInstant) return raw
    const hunt = x.s.kind === 'deer' || x.s.kind === 'boar'
    const c = carryNow()
    // 獵肉攜帶量也吃工人種類的攜帶加成（金朝鄉騎 +5 → 30）
    const carry = hunt ? Math.max(HUNT_CARRY + (baseCarry - spec.carry), c) : c + (x.s.kind === 'berry' && x !== farm ? spec.berryCarry : 0)
    const d = assumeCamp && x.camp !== 2 ? (x.res === 'wood' ? 2 : 1.5) : dropDist(x)
    return carry / (carry / raw + (2 * d) / (SPEED * mods.speed * wSpeed * tSpeed))
  }

  const slots = (x: SiteSt) => {
    if (x.left <= 0) return 0
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

  const needsCamp = (x: SiteSt) => x !== sheep && x !== farm && x.camp === 0 && x.s.dist > 6 && !(x.res === 'wood' && spec.woodInstant)

  /** 有木材就派這名村民去蓋投放點；回傳是否成功 */
  const tryCamp = (x: SiteSt, from: string) => {
    const it = campItem(x.res)
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
    walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, x.s.id), res: null })
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
    const keep = producingVills() ? reserve() : zero()
    if (!forHouse) keep.wood += houseWoodSoon()
    return RES.every((r) => bank[r] - c[r] >= keep[r] - 1e-9)
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
      const score = x === startHunt ? 100 : sheepFirst ? 99 : (effRate(x, canCamp) * SETUP_H) / (SETUP_H + setup)
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
      walkers.push({ to: x.s.id, eta: t + walkTime(from, x.s.id), res })
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
            walkers.push({ to: tgt, eta: t + walkTime(from, 'farm'), res: null })
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
      walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, 'farm'), res: null })
      log('place', `蓋${name(spec.farm.id)}（第 ${farmsBuilt + 1} 座）`, spec.farm.id, cost)
      return true
    }
    return false
  }

  const pickRes = (): Res[] => {
    const c = counts()
    const N = RES.reduce((s2, r) => s2 + c[r], 0) + 1
    const floor = productionFloor(N)
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
        if (x) walkers.push({ to: x.s.id, eta: t + walkTime(v.from, x.s.id), res: 'wood' })
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
      const left = st.count - (queued.get(steps.indexOf(st)) ?? 0)
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
    steps.forEach((st, i) => {
      if (st.kind !== 'army' || stepDone[i] != null) return
      const it = items.get(st.item)
      const p = it ? variationAt(it, Math.max(age, minAge(it))).pop : 1
      n += Math.max(0, st.count - (queued.get(i) ?? 0)) * p
    })
    if (post.units > 0) n += Math.max(0, post.units - postQueued)
    return n
  }
  /** 村民最多能用到的人口：200 減掉要留給軍隊目標的 */
  const villagerPopLimit = () => 200 - armyReserve()
  /** 硬性規則：只要人口、村民容量允許就生產 */
  const producingVills = () => villagers + training() < vilCap() && cpop() + batchSize <= villagerPopLimit()

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
        const left = sx.kind === 'army' ? Math.max(0, sx.count - (queued.get(i) ?? 0)) : researched.has(sx.item) || researching.has(sx.item) ? 0 : 1
        for (const [key, x] of Object.entries(o)) want[key] = (want[key] ?? 0) + x * left
      }
      for (const [key, x] of Object.entries(want)) {
        const deficit = x - (other[key] ?? 0)
        const bp = spec.byproducts.filter((p) => p.to === key).sort((p, q) => q.ratio - p.ratio)[0]
        if (deficit <= 0 || !bp) continue
        const from: Res[] = bp.from === 'all' ? RES : bp.from === 'hunt' || bp.from === 'berry' || bp.from === 'farm' ? ['food'] : [bp.from]
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
    // 還要訓練的學者（與清真寺）
    if (spec.scholars && (policy.scholars ?? 0) > scholarsN + scholarsTraining) {
      const unit = items.get(spec.scholars.unit)
      if (unit && minAge(unit) <= age) {
        const c = costOf(variationAt(unit, age))
        for (const r of RES) n[r] += c[r]
      }
    }
    // 還要蓋的光環建築（蓄水池）
    for (const z of spec.zones ?? []) {
      if (!z.max || (z.requires && !fired.has(z.requires) && !owned(z.requires))) continue
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
    if (natural < foodWorkers * 0.6 * 90) {
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
    if (tot <= 0) {
      // 沒有缺口：照目前的比例，新村民偏向食物、木材
      for (const r of RES) share[r] = c[r] + (r === 'food' ? 1 : r === 'wood' ? 0.6 : r === 'gold' ? 0.3 : 0)
      tot = RES.reduce((s, r) => s + share[r], 0)
    }
    for (const r of RES) share[r] = share[r] / tot
    const pb = policy.phaseBias?.[Math.floor(t / PHASE_SEC)]
    for (const r of RES) {
      const b = (sp?.bias[r] ?? 0) + (pb?.[r] ?? 0)
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
    // 硬性下限：村民生產與房屋所需的收入一定要有人採
    const floor = productionFloor(N)
    for (const r of RES) {
      while (tgt[r] < floor[r]) {
        const donor = RES.filter((x) => x !== r && tgt[x] > floor[x]).sort((a, b) => tgt[b] - floor[b] - (tgt[a] - floor[a]))[0]
        if (!donor) break
        tgt[donor]--
        tgt[r]++
      }
    }
    target = tgt
    // 先用新目標分派空閒村民，再看要不要搬人。
    // 以前是先用舊目標分派（開局時舊目標只有「食物 1」），開局第 3 名村民會被排去採木材，
    // 之後又因為搬人的遲滯（差距 < 3 不搬）卡在木材 20 多秒才調回食物。
    if (free.length) assignFree()

    // 搬人：多的搬去少的，每次最多 15%
    let moves = Math.max(2, Math.ceil(N * 0.15))
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
      if (!below && now[over] - tgt[over] + (tgt[under] - now[under]) < 3) break
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
        walkers.push({ to: to.s.id, eta: t + walkTime(from.s.id, to.s.id), res: r })
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
        walkers.push({ to: target, eta: t + bestFreeT, res: null })
      } else {
        bestSite!.workers--
        walkers.push({ to: target, eta: t + bestSiteT, res: null })
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
    const lead = buildTimeOf(it.id, variationAt(it, age)) + 12
    const buffer = Math.ceil(lead * popRate() * scale) + 1 + policy.houseBuffer
    if (spec.freeVillagers) {
      const capV = vilCap() + pending * spec.freeVillagers.perHouse
      // 長屋 150 木材、30 秒：比一般房屋多留 2 名村民的時間來湊木材
      if (villagers + Math.ceil((lead * scale * tcList().length) / trainTime()) + 3 + policy.houseBuffer >= capV) return true
    }
    const projected = Math.min(200, popCap() + pending * spec.housePop)
    return projected < 200 && cpop() + buffer >= projected
  }

  /** 距離人口（或維京村民容量）用完還有幾秒，扣掉蓋房時間 */
  const houseSlack = () => {
    const it = data.houseId ? items.get(data.houseId) : null
    if (!it) return Infinity
    const pending = blds.filter((b) => !b.done && b.item === data.houseId).length
    const lead = buildTimeOf(it.id, variationAt(it, age)) + 12
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
    // 0. 房屋優先（人口不能卡住村民）
    for (let k = 0; k < 3 && houseNeeded(); k++) {
      const it = items.get(data.houseId!)!
      if (!affordable(costOf(variationAt(it, age)), true)) break
      // 長屋要 30 秒，派 2 人；一般房屋 1 人
      place(data.houseId!, 'house', -1, spec.freeVillagers ? 2 : 1, 6)
    }

    // 1. 目前步驟
    for (let guard = 0; guard < 4 && cur < steps.length; guard++) {
      const st = steps[cur]
      const sp = policy.steps[cur]
      let advanced = false
      if (st.kind === 'age') {
        if (age < st.age! - 1) break
        const o = ageOption(st)
        if (!o) break
        if (o.mode === 'building') {
          if (affordable(ageCost(o))) {
            // 升代地標一律蓋在城鎮中心旁的農田區（和光環建築的 'home' 同一處，距中心 9 格）；
            // 光環地標在 place() 裡改照策略的錨點。以前是 12 格、方位依編號亂排，可能蓋到所有村民的另一側。
            const home = anchorPoint('home', 3)
            const b = place(o.id, 'step', cur, sp.builders, home.dist, st.age, home.angle)
            b.ageTo = st.age
            advanced = true
          }
        } else {
          const ps = idleProducers(o.producers)
          const oc = ageCost(o)
          if (ps.length && affordable(oc) && hasOther(o.other)) {
            pay(oc)
            payOther(o.other)
            ps[0].job = { kind: 'tech', item: o.id, end: t + o.time, count: 1, step: cur }
            researching.add(o.id)
            log('research', `研究${o.name}（升代）`, o.id, oc)
            advanced = true
          }
        }
      } else if (st.kind === 'build') {
        const it = items.get(st.item)!
        if (minAge(it) > age) break
        const n = placed.get(cur) ?? 0
        const cost = costOf(variationAt(it, age))
        if (n < st.count && affordable(cost)) {
          place(
            st.item,
            'step',
            cur,
            st.forward ? sp.builders : Math.min(sp.builders, 4),
            st.forward ? map.enemyDist * 0.8 : 10,
            undefined,
            st.forward ? map.enemyAngle + (n - (st.count - 1) / 2) * 0.06 : undefined,
          )
          placed.set(cur, n + 1)
        }
        advanced = (placed.get(cur) ?? 0) >= st.count
      } else if (st.kind === 'army') {
        const it = items.get(st.item)!
        if (minAge(it) > age) break
        const p = producerFor(st.item)
        const want = Math.max(1, sp.producers)
        if (p && blds.filter((b) => b.item === p).length < want) {
          const c = costOf(variationAt(items.get(p)!, age))
          if (affordable(c)) place(p, 'prod', cur, 1, 10)
        }
        const v = variationAt(it, age)
        const ub = unitBatch(st.item, v)
        const batch = ub.size
        // 留給村民的人口：每座城鎮中心一批（訓練中的村民已經算在 cpop 裡）
        const villRoom = producingVills() ? tcList().length * batchSize : 0
        for (const b of idleProducers(nonTC(v.producedBy))) {
          const q = queued.get(cur) ?? 0
          // 免費送的單位也算進這個目標
          if (q + (freeUnits.get(st.item) ?? 0) >= st.count) break
          const pm = prodMods(b.item, it, b)
          const c = costOf(v)
          for (const r of RES) c[r] *= batch * pm.cost[r]
          // 金朝：用掉 1 匹馬，立刻出兵、便宜一點
          const horse = !!spec.horses && horses >= 1 && spec.horses.at.includes(b.item) && v.cls.includes(spec.horses.cls)
          if (horse) for (const [r, x] of Object.entries(spec.horses!.discount)) c[r as Res] = Math.max(0, c[r as Res] - (x ?? 0))
          if (!affordable(c) || !hasOther(otherOf(v), batch) || cpop() + v.pop * batch + villRoom > popCap()) break
          pay(c)
          addMilSpend(c)
          payOther(otherOf(v), batch)
          if (horse) horses -= 1
          b.job = { kind: 'unit', item: st.item, ...(horse ? { end: t, supervised: false } : supervise(b, ub.time * pm.time)), count: batch, step: cur, pop: v.pop * batch, dur: ub.time * pm.time }
          armyPop += v.pop * batch
          queued.set(cur, q + batch)
          log('train', `訓練${name(st.item)}`, st.item, c)
        }
        advanced = (queued.get(cur) ?? 0) + (freeUnits.get(st.item) ?? 0) >= st.count
      } else if (st.kind === 'tech') {
        const it = items.get(st.item)!
        if (minAge(it) > age) break
        const v = variationAt(it, age)
        const ps = idleProducers(nonTC(v.producedBy))
        if (ps.length && affordable(costOf(v)) && hasOther(otherOf(v))) {
          pay(costOf(v))
          payOther(otherOf(v))
          ps[0].job = { kind: 'tech', item: st.item, ...supervise(ps[0], researchTime(v.time) * prodMods(ps[0].item, undefined, ps[0]).research), count: 1, step: cur }
          researching.add(st.item)
          log('research', `研究${name(st.item)}`, st.item, costOf(v))
          advanced = true
        }
      } else if (st.kind === 'villagers') {
        advanced = villagers >= st.count
      }
      if (!advanced) break
      cur++
      lastRebalance = -99
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
    if (spec.scholars && (policy.scholars ?? 0) > scholarsN + scholarsTraining) {
      const sc = spec.scholars
      const unit = items.get(sc.unit)
      const mosque = sc.at.find((id) => isBuildable(data, id))
      if (mosque && !blds.some((b) => sc.at.includes(b.item))) {
        const it = items.get(mosque)
        if (it && minAge(it) <= age && affordable(costOf(variationAt(it, age)))) place(mosque, 'econ', -1, 1, 7)
      } else if (unit && minAge(unit) <= age) {
        const v = variationAt(unit, age)
        for (const b of idleProducers(sc.at)) {
          if ((policy.scholars ?? 0) <= scholarsN + scholarsTraining) break
          const villRoom = producingVills() ? batchSize : 0
          // 依訓練建築不同的價格（德里信仰圓頂 80 黃金）
          const sCost = sc.costAt?.[b.item] ? ({ ...zero(), ...sc.costAt[b.item] } as Bundle) : costOf(v)
          if (!affordable(sCost) || cpop() + v.pop + villRoom > popCap()) continue
          pay(sCost)
          b.job = { kind: 'unit', item: sc.unit, end: t + v.time, count: 1, step: -3, pop: v.pop, dur: v.time }
          armyPop += v.pop
          scholarsTraining++
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
    if (spec.officials && (policy.officials ?? 0) > officialsN - spec.officials.start + officialsTraining && officialsN + officialsTraining < spec.officials.max) {
      const oc = { ...zero(), ...spec.officials.cost } as Bundle
      const villRoom = producingVills() ? batchSize : 0
      for (const b of idleProducers(spec.officials.at)) {
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
      const want = Math.min(cap, policy.support?.[su.unit] ?? 0)
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
    if (t - lastRebalance >= 8) rebalance()
    if (free.length) assignFree()

    // 採集
    refreshGolden()
    globalMul = golden.gather
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
      if (x.workers <= 0) continue
      if (x === farm && x.workers > farmSlots()) x.workers = farmSlots()
      let amt = effRate(x) * x.workers
      if (amt > x.left) amt = x.left
      x.left -= amt
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
          (bp.from === 'farm' && x === farm)
        if (!hit) continue
        if (bp.requires && !owned(bp.requires)) continue
        addRes(bp.to, amt * bp.ratio * specialMul(x, bp.to))
        if (!(RES as string[]).includes(bp.to)) specialGathered[bp.to] = (specialGathered[bp.to] ?? 0) + amt * bp.ratio * specialMul(x, bp.to)
      }
      if (spec.depositBonus && spec.depositBonus.res.includes(x.res)) bank[x.res] += amt * (spec.depositBonus.mul - 1)
      if ((x.s.kind === 'deer' || x.s.kind === 'boar' || x === sheep) && spec.huntGold) bank.gold += amt * spec.huntGold
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
      for (const [k, x] of Object.entries(su.perMin)) {
        bank[k as Res] += ((x ?? 0) * n) / 60
        incomeAcc[k as Res] += ((x ?? 0) * n) / 60
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

    // 被動收入建築（莊園、坑礦、屋台…）
    for (const tr of spec.trickles) {
      const n = Math.min(tr.max, blds.filter((b) => b.done && b.item === tr.building).length + (researched.has(tr.building) ? 1 : 0))
      if (!n) continue
      // 家附近的村民另有收入（蘭開斯特莊園光環，近似：莊園蓋在家附近，罩住羊、散樹與農田）
      if (tr.perHomeWorker) {
        const tcWood = siteById.get(TC_WOOD_ID)
        const home = sheep.workers + farm.workers + (tcWood?.workers ?? 0) + (startHunt?.workers ?? 0)
        for (const [k, perMin] of Object.entries(tr.perHomeWorker)) {
          const amt = ((perMin ?? 0) * home) / 60
          bank[k as Res] += amt
          incomeAcc[k as Res] += amt
        }
      }
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
        const amt = ((perMin ?? 0) * n * (tr.ageMul?.[age - 1] ?? 1)) / 60
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
      else if (st.kind === 'build') ok = blds.filter((b) => b.step === i && b.done).length >= st.count
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
        sites: sites.map((x) => ({ id: x.s.id, workers: x.workers, left: x.left })),
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
