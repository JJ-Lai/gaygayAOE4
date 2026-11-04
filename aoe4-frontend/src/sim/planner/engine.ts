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
import { costOf, isBuildable, isTownCenter, minAge, nameOf, otherOf, variationAt, type AgeOption, type CivData } from './civData.ts'
import type { Gather } from './civSpec.ts'
import { siteDistance } from './mapgen.ts'
import {
  RES,
  zero,
  type Bundle,
  type GameMap,
  type GoalResult,
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
}

/** 目標後最多模擬多久 */
const POST_CAP = 15 * 60
const POST_TYPES = ['barracks', 'archery-range', 'stable']
const SMITHS = ['blacksmith', 'forge']

const FARM_SITE: Site = { id: 'farm', kind: 'berry', label: '農田', amount: Infinity, units: 0, dist: 5, angle: 0.3, contested: false }

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
    .map((s) => ({ s, res: RES_OF[s.kind], left: s.amount, camp: 0, workers: 0, chopped: 0 }))
  const sheep: SiteSt = {
    s: { id: 'sheep', kind: 'sheep', label: '羊', amount: 0, units: 0, dist: 3, angle: 0, contested: false },
    res: 'food',
    left: 200 * spec.ownedSheep + spec.startFood,
    camp: 2,
    workers: 0,
    chopped: 0,
  }
  sites.unshift(sheep)
  const farm: SiteSt = { s: FARM_SITE, res: 'food', left: Infinity, camp: 2, workers: 0, chopped: 0 }
  sites.push(farm)
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
  const auras: Partial<Record<Res | 'all', number>> = {}

  const owned = (id: string) => blds.some((b) => b.done && b.item === id)
  const houses = () => (data.houseId ? blds.filter((b) => b.done && b.item === data.houseId).length : 0)
  const tcs = () => blds.filter((b) => b.done && (b.item === 'town-center' || b.item === 'capital-town-center')).length
  const popExtra = () => {
    let n = 0
    for (const [id, p] of Object.entries(spec.popBuildings)) n += p * blds.filter((b) => b.done && b.item === id).length
    return n
  }
  const popCap = () => (spec.popModel === 'max' ? 200 : Math.min(200, 10 * tcs() + spec.housePop * houses() + popExtra()))
  const pop = () => villagers + spec.extraPop + armyPop
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
  const refreshWorkers = () => {
    const total = Math.max(1, villagers)
    const out = { all: 1, sheep: 0, berry: 0, hunt: 0, farm: 0, wood: 0, gold: 0, stone: 0 }
    let carry = 0
    let counted = 0
    for (const [id, n] of workerCount) {
      if (n <= 0) continue
      const ws = spec.workerSpecs[id]
      for (const k of GATHER_KEYS) out[k] += n * (ws?.gather?.all ?? 1) * (ws?.gather?.[k] ?? 1)
      carry += n * (ws?.carry ?? spec.carry)
      counted += n
    }
    // 還沒記到工人種類的（理論上不會有）用普通村民
    const rest = Math.max(0, total - counted)
    for (const k of GATHER_KEYS) out[k] = (out[k] + rest) / Math.max(1, counted + rest)
    wmul = out
    baseCarry = (carry + rest * spec.carry) / Math.max(1, counted + rest)
  }
  refreshWorkers()
  const carryNow = () => baseCarry + mods.carry

  const goldenMul = () => {
    if (!spec.goldenAge) return 1
    // 黃金時代要先有智慧宮；只算家附近的建築（不含農田與遠處的投放點）
    if (items.has('house-of-wisdom') && !owned('house-of-wisdom')) return 1
    const n = blds.filter((b) => b.done && b.role !== 'farm' && !(b.role === 'camp' && b.at > 12)).length
    let m = 1
    for (const tier of spec.goldenAge) if (n >= tier.buildings) m = tier.mul
    return m
  }

  const inspireMul = (n: number) => (spec.inspire && n > 0 ? 1 + ((spec.inspire.mul - 1) * Math.min(spec.inspire.villagers, n)) / n : 1)

  let gatherersCache = villagers
  let globalMul = 1

  const rawRate = (x: SiteSt) => {
    const g = spec.gather
    let r: number
    switch (x.s.kind) {
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
    return r * g.all * globalMul * (auras[x.res] ?? 1) * (auras.all ?? 1)
  }

  const dropDist = (x: SiteSt) => {
    if (x === sheep) return 2
    if (x === farm) return 2.5
    if (x.camp === 2) return x.res === 'wood' ? 2 + Math.min(4, x.chopped / 2500) : x.res === 'food' ? 2 : 1.5
    return Math.max(2, x.s.dist - 2)
  }

  const effRate = (x: SiteSt, assumeCamp = false) => {
    const raw = rawRate(x)
    if (x.res === 'wood' && spec.woodInstant) return raw
    const hunt = x.s.kind === 'deer' || x.s.kind === 'boar'
    const c = carryNow()
    const carry = hunt ? Math.max(HUNT_CARRY, c) : c + (x.s.kind === 'berry' && x !== farm ? spec.berryCarry : 0)
    const d = assumeCamp && x.camp !== 2 ? (x.res === 'wood' ? 2 : 1.5) : dropDist(x)
    return carry / (carry / raw + (2 * d) / (SPEED * mods.speed))
  }

  const slots = (x: SiteSt) => {
    if (x.left <= 0) return 0
    if (x === sheep) return Math.min(10, 2 * Math.ceil(x.left / 200))
    if (x === farm) return farmSlots()
    if (x.res === 'wood') return 24
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
  const walkTime = (from: string, to: string) => siteDistance(point(from), point(to)) / (SPEED * mods.speed) + 1

  const log = (kind: PlanEvent['kind'], text: string, item?: string) => {
    if (!rec) return
    events.push({ t, kind, text, item, pop: pop(), villagers, split: splitNow() })
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
      log('place', `訓練${name(it.id)}送到${x.s.label}`, it.id)
      return false
    }
    const b = addBld({ item: it.id, step: -1, role: 'camp', done: false, progress: 0, total: v.time, builders: 0, at: x.s.dist, angle: x.s.angle, siteId: x.s.id, job: null })
    walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, x.s.id), res: null })
    log('place', `蓋${name(it.id)}（${x.s.label}）`, it.id)
    return true
  }
  const autoBuild: Bld[] = []
  let freeDropUsed = 0
  /** 地標（升代建築）只會在升代步驟蓋；當被動收入來源時，蓋好才開始算 */
  const isLandmark = (it: CatalogItem) => it.variations.some((v) => v.tags.some((x) => x.startsWith('toAge')))
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
    if (x.s.kind === 'deer' && !policy.hunt) return false
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
      // 羊在城鎮中心旁，一律先採（試過讓有野果加成的文明先採野果，蓋磨坊與走路的成本反而更慢）
      const score = x === sheep ? 99 : effRate(x, !!campItem(res)) - x.s.dist * 0.002
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
      const b = addBld({ item: spec.farm.id, step: -1, role: 'farm', done: false, progress: 0, total: variationAt(it, age).time, builders: 0, at: 5, angle: 0.3 + farmsBuilt * 0.2, job: null })
      walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, 'farm'), res: null })
      log('place', `蓋${name(spec.farm.id)}（第 ${farmsBuilt + 1} 座）`, spec.farm.id)
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
  const tcIdleReasons: Record<string, number> = {}

  // ---------- 需求 ----------
  const stepCost = (st: Step): Bundle => {
    const out = zero()
    if (st.kind === 'age') {
      const o = ageOption(st)
      if (o) for (const r of RES) out[r] += o.cost[r]
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

  const villCost = (): Bundle => {
    const it = workerItem()
    if (!it || spec.freeVillagers) return zero()
    const c = costOf(variationAt(it, age))
    for (const r of RES) c[r] *= spec.villagerBatch
    return c
  }
  const trainTime = () => {
    const it = workerItem()
    return spec.trainTimeByAge?.[age - 1] ?? (it ? variationAt(it, age).time : 20)
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
    if (sp) for (const r of RES) share[r] = Math.max(0, share[r] + sp.bias[r] * (r === 'stone' && n.stone <= bank.stone ? 0 : 1))
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
    const v = variationAt(it, Math.max(age, minAge(it)))
    const cost = role === 'step' && ageTo ? ageOption(steps[step])!.cost : costOf(v)
    pay(cost)
    const b = addBld({ item, step, role, done: false, progress: 0, total: v.time, builders: 0, at, angle: angle ?? (uid * 2.39996) % (Math.PI * 2), job: null, ageTo })
    const got = takeBuilders(builders, b)
    log('place', `${role === 'house' ? '' : ''}蓋${name(item)}（${got} 人）`, item)
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
    const lead = variationAt(it, age).time + 12
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
    const lead = variationAt(it, age).time + 12
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
          ps[0].job = { kind: 'tech', item: tech.id, end: t + v.time, count: 1, step: -2 }
          researching.add(tech.id)
          postResearching++
          log('research', `研究${name(tech.id)}`, tech.id)
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
      const c = costOf(v)
      for (const r of RES) c[r] *= ub.size
      const withUp = zero()
      for (const r of RES) withUp[r] = c[r] + keepUp[r]
      if (!affordable(withUp) || !hasOther(otherOf(v), ub.size) || cpop() + v.pop * ub.size + villRoom > popCap()) continue
      pay(c)
      payOther(otherOf(v), ub.size)
      postQueued += ub.size
      b.job = { kind: 'unit', item: u.id, end: t + ub.time, count: ub.size, step: -2, pop: v.pop * ub.size, dur: ub.time }
      armyPop += v.pop * ub.size
      log('train', `訓練${name(u.id)}`, u.id)
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
          if (affordable(o.cost)) {
            const b = place(o.id, 'step', cur, sp.builders, 12, st.age)
            b.ageTo = st.age
            advanced = true
          }
        } else {
          const ps = idleProducers(o.producers)
          if (ps.length && affordable(o.cost) && hasOther(o.other)) {
            pay(o.cost)
            payOther(o.other)
            ps[0].job = { kind: 'tech', item: o.id, end: t + o.time, count: 1, step: cur }
            researching.add(o.id)
            log('research', `研究${o.name}（升代）`, o.id)
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
          if (q >= st.count) break
          const c = costOf(v)
          for (const r of RES) c[r] *= batch
          if (!affordable(c) || !hasOther(otherOf(v), batch) || cpop() + v.pop * batch + villRoom > popCap()) break
          pay(c)
          payOther(otherOf(v), batch)
          b.job = { kind: 'unit', item: st.item, end: t + ub.time, count: batch, step: cur, pop: v.pop * batch, dur: ub.time }
          armyPop += v.pop * batch
          queued.set(cur, q + batch)
          log('train', `訓練${name(st.item)}`, st.item)
        }
        advanced = (queued.get(cur) ?? 0) >= st.count
      } else if (st.kind === 'tech') {
        const it = items.get(st.item)!
        if (minAge(it) > age) break
        const v = variationAt(it, age)
        const ps = idleProducers(nonTC(v.producedBy))
        if (ps.length && affordable(costOf(v)) && hasOther(otherOf(v))) {
          pay(costOf(v))
          payOther(otherOf(v))
          ps[0].job = { kind: 'tech', item: st.item, end: t + v.time, count: 1, step: cur }
          researching.add(st.item)
          log('research', `研究${name(st.item)}`, st.item)
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

    // 3. 拜占庭蓄水池
    if (spec.cistern && !blds.some((b) => b.item === spec.cistern!.id)) {
      const it = items.get(spec.cistern.id)
      if (it && affordable(costOf(variationAt(it, age)))) place(spec.cistern.id, 'econ', -1, 1, 6)
    }

    // 3b. 被動收入建築：搜尋決定從第幾步開始、蓋幾座
    for (const tr of spec.trickles) {
      const want = Math.min(tr.max, policy.trickle?.[tr.building]?.count ?? 0)
      if (want <= 0 || (policy.trickle[tr.building].at ?? 0) > cur) continue
      const it = items.get(tr.building)
      if (!it || minAge(it) > age || !trickleBuildable(it, tr)) continue
      if (blds.filter((b) => b.item === tr.building).length >= want) continue
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
      const v = variationAt(it, age)
      const ps = idleProducers(v.producedBy.filter((p) => !isTC(p)))
      if (!ps.length || !affordable(costOf(v)) || !hasOther(otherOf(v))) continue
      pay(costOf(v))
      payOther(otherOf(v))
      ps[0].job = { kind: 'tech', item: id, end: t + v.time, count: 1, step: -1 }
      researching.add(id)
      log('research', `研究${name(id)}`, id)
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
        const start = b.lastEnd != null && b.lastEnd > t - 1 ? b.lastEnd : t
        // 先前有閒置時，補上整數秒沒算到的那一點點
        if (b.idleTicks && b.lastEnd != null) tcIdle += Math.max(0, t - b.lastEnd - b.idleTicks)
        b.idleTicks = 0
        b.job = { kind: 'vill', item: choice.item.id, end: start + choice.time, count: batchSize, step: -1 }
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
      out.push({ item: it, cost, time: spec.trainTimeByAge?.[age - 1] ?? v.time })
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

  const reachAge = (a: number, via: string) => {
    if (a <= age) return
    age = a
    ageTimes[a] = t
    log('age', `進入${['', '黑暗', '封建', '城堡', '帝王'][a]}時代（${name(via)}）`, via)
  }

  const finishBld = (b: Bld) => {
    b.done = true
    b.doneAt = t
    b.builders = 0
    if (b.role === 'farm') {
      farmsBuilt++
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
    for (const a of spec.landmarkAura ?? []) if (a.building === b.item) auras[a.res] = (auras[a.res] ?? 1) * a.mul
    if (spec.cistern && b.item === spec.cistern.id) auras.all = (auras.all ?? 1) * spec.cistern.mul
    if (b.ageTo) reachAge(b.ageTo, b.item)
    if (b.role !== 'camp' && b.role !== 'house') log('done', `${name(b.item)}完成`, b.item)
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
        villagers += j.count
        workerCount.set(j.item, (workerCount.get(j.item) ?? 0) + j.count)
        refreshWorkers()
        for (let k = 0; k < j.count; k++) free.push({ from: 'tc' })
        if (rec) {
          for (let k = 0; k < j.count; k++) {
            const r = pickRes()[0]
            log('villager', `第 ${villagers - j.count + k + 1} 名村民 → ${RES_ZH[r]}`)
          }
        }
      } else if (j.kind === 'unit') {
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
    if (free.length) assignFree()
    if (t - lastRebalance >= 8) rebalance()
    if (free.length) assignFree()

    // 採集
    gatherersCache = sites.reduce((n, x) => n + x.workers, 0)
    globalMul = inspireMul(gatherersCache) * goldenMul()
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
      for (const bp of spec.byproducts) {
        const hit =
          bp.from === x.res ||
          bp.from === 'all' ||
          (bp.from === 'hunt' && isHunt) ||
          (bp.from === 'berry' && x.s.kind === 'berry' && x !== farm) ||
          (bp.from === 'farm' && x === farm)
        if (!hit) continue
        if (bp.requires && !owned(bp.requires)) continue
        addRes(bp.to, amt * bp.ratio)
      }
      if (spec.depositBonus && spec.depositBonus.res.includes(x.res)) bank[x.res] += amt * (spec.depositBonus.mul - 1)
      if ((x.s.kind === 'deer' || x.s.kind === 'boar' || x === sheep) && spec.huntGold) bank.gold += amt * spec.huntGold
      if (x.left <= 0 && x !== farm) {
        for (let k = 0; k < x.workers; k++) free.push({ from: x.s.id })
        x.workers = 0
        if (x !== sheep) log('deplete', `${x.s.label}採完`)
      }
    }

    // 被動收入建築（莊園、坑礦、屋台…）
    for (const tr of spec.trickles) {
      const n = Math.min(tr.max, blds.filter((b) => b.done && b.item === tr.building).length + (researched.has(tr.building) ? 1 : 0))
      if (!n) continue
      for (const [k, perMin] of Object.entries(tr.perMin)) {
        const amt = ((perMin ?? 0) * n) / 60
        addRes(k, amt)
        if ((RES as string[]).includes(k)) incomeAcc[k as Res] += amt
      }
    }

    // 建造
    for (const b of blds) {
      if (b.done) continue
      if (autoBuild.includes(b)) {
        b.progress += 1
      } else if (b.builders > 0) b.progress += (b.builders + 2) / 3
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
        .map((b) => ({ uid: b.uid, item: b.item, role: b.role, at: b.at, angle: b.angle, placed: b.placedAt ?? 0, done: b.doneAt ?? null }))
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
    buildings,
    score: base + 0.05 * sumGoals + (opts.idleWeight ?? 60) * tcIdle,
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
