// 逐秒模擬。村民以「採集點上的人數」聚合，但走路、交資源往返、建造人數、
// 採集點耗盡、人口與房屋、生產佇列都照實算。
//
// 控制器是規則式的，行為由 Policy 參數決定；最佳化在 search.ts 調這些參數。

import type { CatalogItem } from '../types.ts'
import { costOf, minAge, nameOf, variationAt, type AgeOption, type CivData } from './civData.ts'
import { siteDistance } from './mapgen.ts'
import {
  RES,
  zero,
  type Bundle,
  type GameMap,
  type GoalResult,
  type PlanEvent,
  type PlanResult,
  type Policy,
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
}

export interface SimOptions {
  record: boolean
  /** 超過這個秒數就放棄（剪枝） */
  bound: number
  /** 城鎮中心每閒置 1 秒加多少分（職業選手不讓城鎮中心停下來） */
  idleWeight?: number
}

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
  let villagers = spec.villagers
  let mounted = 0
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
    left: 200 * spec.ownedSheep,
    camp: 2,
    workers: 0,
    chopped: 0,
  }
  sites.unshift(sheep)
  const farm: SiteSt = { s: FARM_SITE, res: 'food', left: Infinity, camp: 2, workers: 0, chopped: 0 }
  sites.push(farm)
  const siteById = new Map(sites.map((x) => [x.s.id, x]))
  let farmsBuilt = 0
  let sheepIdx = 0

  const blds: Bld[] = []
  const addBld = (b: Omit<Bld, 'uid'>) => {
    const x = { ...b, uid: uid++ }
    blds.push(x)
    return x
  }
  addBld({ item: 'town-center', step: -1, role: 'prod', done: true, progress: 0, total: 0, builders: 0, at: 0, angle: 0, job: null })
  for (const id of spec.prebuilt) addBld({ item: id, step: -1, role: 'econ', done: true, progress: 0, total: 0, builders: 0, at: 6, angle: 1, job: null })

  const walkers: Walker[] = []
  // 開局村民全部在城鎮中心旁
  const free: { from: string }[] = Array.from({ length: spec.villagers }, () => ({ from: 'tc' }))

  // ---------- 修正量 ----------
  const mods = { carry: spec.carry, speed: 1, food: 1, hunt: 1, berry: 1, wood: 1, gold: 1, stone: 1, forestry: 1 }
  const auras: Partial<Record<Res | 'all', number>> = {}

  const owned = (id: string) => blds.some((b) => b.done && b.item === id)
  const houses = () => (data.houseId ? blds.filter((b) => b.done && b.item === data.houseId).length : 0)
  const tcs = () => blds.filter((b) => b.done && (b.item === 'town-center' || b.item === 'capital-town-center')).length
  const popCap = () => (spec.popModel === 'max' ? 200 : Math.min(200, 10 * tcs() + spec.housePop * houses()))
  const pop = () => villagers + spec.extraPop + armyPop
  const vilCap = () => (spec.freeVillagers ? spec.freeVillagers.base + spec.freeVillagers.perHouse * houses() : Infinity)

  const workerItem = (): CatalogItem | undefined => {
    if (spec.fallbackWorker && mounted >= spec.workerCap) return items.get(spec.fallbackWorker)
    return items.get(spec.worker) ?? items.get('villager')
  }

  const goldenMul = () => {
    if (!spec.goldenAge) return 1
    const n = blds.filter((b) => b.done && b.role !== 'farm').length
    let m = 1
    for (const tier of spec.goldenAge) if (n >= tier.buildings) m = tier.mul
    return m
  }

  const workerMul = () => {
    if (!mounted) return 1
    return (mounted * spec.workerGather + (villagers - mounted)) / Math.max(1, villagers)
  }

  const inspireMul = (n: number) => (spec.inspire && n > 0 ? 1 + ((spec.inspire.mul - 1) * Math.min(spec.inspire.villagers, n)) / n : 1)

  let gatherersCache = villagers
  let globalMul = 1

  const rawRate = (x: SiteSt) => {
    const g = spec.gather
    let r: number
    switch (x.s.kind) {
      case 'sheep':
        r = 0.75 * g.sheep * mods.food
        break
      case 'berry':
        if (x === farm) {
          const farmAge = spec.farmByAge && (owned('mill') || owned('farmhouse')) ? spec.farmByAge[age - 1] : 1
          r = 0.75 * g.farm * farmAge * mods.food
        } else r = 0.69 * g.berry * mods.berry * mods.food
        break
      case 'deer':
        r = 0.825 * g.hunt * mods.hunt
        break
      case 'boar':
        r = 0.9 * g.hunt * mods.hunt
        break
      case 'wood':
        r = spec.woodAtTree * mods.forestry * g.wood * (spec.woodByAge?.[age - 1] ?? 1) * mods.wood
        break
      case 'gold':
        r = 0.75 * g.gold * mods.gold
        break
      default:
        r = 0.75 * g.stone * mods.stone
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
    const carry = hunt ? Math.max(HUNT_CARRY, mods.carry) : mods.carry + (x.s.kind === 'berry' && x !== farm ? spec.berryCarry : 0)
    const d = assumeCamp && x.camp !== 2 ? (x.res === 'wood' ? 2 : 1.5) : dropDist(x)
    return carry / (carry / raw + (2 * d) / (SPEED * mods.speed))
  }

  const slots = (x: SiteSt) => {
    if (x.left <= 0) return 0
    if (x === sheep) return Math.min(10, 2 * Math.ceil(x.left / 200))
    if (x === farm) return farmsBuilt
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
    const cost = costOf(v)
    if (!affordable(cost)) return false
    pay(cost)
    x.camp = 1
    if (it.kind === 'unit') {
      // 圖格魯克工作象：城鎮中心訓練後走過去，不用村民
      const b = addBld({ item: it.id, step: -1, role: 'camp', done: false, progress: 0, total: v.time + x.s.dist / SPEED, builders: 1, at: x.s.dist, angle: x.s.angle, siteId: x.s.id, job: null })
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

  // ---------- 資源 ----------
  const affordable = (c: Bundle) => RES.every((r) => bank[r] >= c[r] - 1e-9)
  const pay = (c: Bundle) => {
    for (const r of RES) bank[r] -= c[r]
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
      // 羊在城鎮中心旁，一律先採
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

  // ---------- 分配 ----------
  let target: Bundle = { food: 1, wood: 0, gold: 0, stone: 0 }

  const sendTo = (from: string, res: Res): boolean => {
    const x = bestSite(res)
    if (x) {
      if (needsCamp(x) && x.workers + incoming(x.s.id) === 0 && tryCamp(x, from)) return true
      walkers.push({ to: x.s.id, eta: t + walkTime(from, x.s.id), res })
      return true
    }
    if (res === 'food') {
      // 沒有天然食物：蓋農田
      const it = items.get('farm')
      if (!it) return false
      const cost = costOf(variationAt(it, age))
      if (!affordable(cost)) return false
      pay(cost)
      const b = addBld({ item: 'farm', step: -1, role: 'farm', done: false, progress: 0, total: variationAt(it, age).time, builders: 0, at: 5, angle: 0.3 + farmsBuilt * 0.2, job: null })
      walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(from, 'farm'), res: null })
      log('place', `蓋農田（第 ${farmsBuilt + 1} 塊）`, 'farm')
      return true
    }
    return false
  }

  const pickRes = (): Res[] => {
    const c = counts()
    return [...RES].sort((a, b) => target[b] - c[b] - (target[a] - c[a]))
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
    const batch = data.abbr === 'gol' ? 2 : 1
    for (const r of RES) c[r] *= batch
    return c
  }
  const trainTime = () => {
    const it = workerItem()
    return spec.trainTimeByAge?.[age - 1] ?? (it ? variationAt(it, age).time : 20)
  }
  const producingVills = () => {
    const sp = policy.steps[cur]
    return villagers < policy.maxVills && !(sp && sp.stopVills) && villagers < vilCap()
  }

  const need = (): Bundle => {
    const n = zero()
    const st = steps[cur]
    if (st) {
      const c = stepCost(st)
      for (const r of RES) n[r] += c[r]
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
    if (producingVills()) {
      const c = villCost()
      const k = (45 / trainTime()) * tcs()
      for (const r of RES) n[r] += c[r] * k
    }
    if (houseNeeded()) {
      const it = data.houseId ? items.get(data.houseId) : null
      if (it) n.wood += costOf(variationAt(it, age)).wood
    }
    // 天然食物快吃完：預留農田木材
    const natural = naturalFood().reduce((s, x) => s + x.left, 0)
    const foodWorkers = counts().food
    if (natural < foodWorkers * 0.6 * 90) {
      const it = items.get('farm')
      if (it) n.wood += costOf(variationAt(it, age)).wood * Math.min(6, Math.max(1, foodWorkers - farmsBuilt))
    }
    return n
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
    target = tgt

    // 搬人：多的搬去少的，每次最多 15%
    let moves = Math.max(2, Math.ceil(N * 0.15))
    const moved: string[] = []
    while (moves > 0) {
      const now = counts()
      const over = RES.filter((r) => now[r] > tgt[r]).sort((a, b) => now[b] - tgt[b] - (now[a] - tgt[a]))[0]
      const under = RES.filter((r) => now[r] < tgt[r]).sort((a, b) => tgt[b] - now[b] - (tgt[a] - now[a]))[0]
      if (!over || !under) break
      // 遲滯：差距太小就不搬，避免來回走
      if (now[over] - tgt[over] + (tgt[under] - now[under]) < 3) break
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
    let got = 0
    // 先拿空閒的，再從離建築最近的採集點拿
    while (got < k && free.length) {
      const v = free.pop()!
      walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(v.from, `b:${b.uid}`), res: null })
      got++
    }
    const pool = sites
      .filter((x) => x.workers > 0)
      .sort((a, c) => siteDistance(a.s, point(`b:${b.uid}`)) - siteDistance(c.s, point(`b:${b.uid}`)))
    for (const x of pool) {
      while (got < k && x.workers > 0 && !(x === farm)) {
        x.workers--
        walkers.push({ to: `b:${b.uid}`, eta: t + walkTime(x.s.id, `b:${b.uid}`), res: null })
        got++
      }
      if (got >= k) break
    }
    return got
  }

  const place = (item: string, role: Bld['role'], step: number, builders: number, at: number, ageTo?: number) => {
    const it = items.get(item)!
    const v = variationAt(it, Math.max(age, minAge(it)))
    const cost = role === 'step' && ageTo ? ageOption(steps[step])!.cost : costOf(v)
    pay(cost)
    const b = addBld({ item, step, role, done: false, progress: 0, total: v.time, builders: 0, at, angle: (uid * 2.39996) % (Math.PI * 2), job: null, ageTo })
    const got = takeBuilders(builders, b)
    log('place', `${role === 'house' ? '' : ''}蓋${name(item)}（${got} 人）`, item)
    return b
  }

  const houseNeeded = () => {
    if (!data.houseId) return false
    const pending = blds.some((b) => !b.done && b.item === data.houseId)
    if (pending) return false
    if (spec.freeVillagers && villagers + 2 >= vilCap() && villagers < policy.maxVills) return true
    return popCap() < 200 && pop() + policy.houseBuffer >= popCap()
  }

  const producerFor = (unitId: string): string | null => {
    const it = items.get(unitId)
    if (!it) return null
    const v = variationAt(it, 4)
    for (const p of v.producedBy) {
      const b = items.get(p)
      if (b && b.kind === 'building' && !variationAt(b, 4).tags.some((x) => x.startsWith('toAge')) && blds.some((x) => x.item === p)) return p
    }
    for (const p of v.producedBy) {
      const b = items.get(p)
      if (b && b.kind === 'building' && !variationAt(b, 4).tags.some((x) => x.startsWith('toAge')) && minAge(b) <= age) return p
    }
    return null
  }

  const idleProducers = (ids: string[]) => blds.filter((b) => b.done && !b.job && ids.includes(b.item))

  // ---------- 每秒行動 ----------
  const act = () => {
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
          if (ps.length && affordable(o.cost)) {
            pay(o.cost)
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
          place(st.item, 'step', cur, st.forward ? sp.builders : Math.min(sp.builders, 4), st.forward ? map.enemyDist * 0.8 : 10)
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
        const batch = data.abbr === 'gol' ? 2 : 1
        for (const b of idleProducers(v.producedBy)) {
          const q = queued.get(cur) ?? 0
          if (q >= st.count) break
          const c = costOf(v)
          for (const r of RES) c[r] *= batch
          if (!affordable(c) || pop() + v.pop * batch > popCap()) break
          pay(c)
          b.job = { kind: 'unit', item: st.item, end: t + v.time, count: batch, step: cur }
          armyPop += v.pop * batch
          queued.set(cur, q + batch)
          log('train', `訓練${name(st.item)}`, st.item)
        }
        advanced = (queued.get(cur) ?? 0) >= st.count
      } else if (st.kind === 'tech') {
        const it = items.get(st.item)!
        if (minAge(it) > age) break
        const v = variationAt(it, age)
        const ps = idleProducers(v.producedBy)
        if (ps.length && affordable(costOf(v))) {
          pay(costOf(v))
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

    // 2. 房屋
    if (houseNeeded()) {
      const it = items.get(data.houseId!)!
      if (affordable(costOf(variationAt(it, age)))) place(data.houseId!, 'house', -1, 1, 6)
    }

    // 3. 拜占庭蓄水池
    if (spec.cistern && !blds.some((b) => b.item === spec.cistern!.id)) {
      const it = items.get(spec.cistern.id)
      if (it && affordable(costOf(variationAt(it, age)))) place(spec.cistern.id, 'econ', -1, 1, 6)
    }

    // 4. 經濟科技
    for (const [id, at] of Object.entries(policy.ecoAt)) {
      if (at < 0 || at > cur || researched.has(id) || researching.has(id)) continue
      const it = items.get(id)
      if (!it || minAge(it) > age) continue
      const v = variationAt(it, age)
      const ps = idleProducers(v.producedBy)
      if (!ps.length || !affordable(costOf(v))) continue
      pay(costOf(v))
      ps[0].job = { kind: 'tech', item: id, end: t + v.time, count: 1, step: -1 }
      researching.add(id)
      log('research', `研究${name(id)}`, id)
    }

    // 5. 村民生產（升代科技在城鎮中心時讓路）
    const st = steps[cur]
    const ao = st?.kind === 'age' ? ageOption(st) : undefined
    const tcBlocked = !!ao && ao.mode === 'tech' && ao.producers.includes('town-center') && age >= st.age! - 1 && bank.food >= ao.cost.food * 0.7
    if (producingVills() && !tcBlocked) {
      const it = workerItem()
      if (it) {
        const c = villCost()
        const batch = data.abbr === 'gol' ? 2 : 1
        for (const b of idleProducers(['town-center', 'capital-town-center'])) {
          if (!affordable(c) || pop() + batch > popCap()) break
          pay(c)
          b.job = { kind: 'vill', item: it.id, end: t + trainTime(), count: batch, step: -1 }
        }
      }
    }
  }

  // ---------- 完成事件 ----------
  const applyTech = (id: string) => {
    const it = items.get(id)
    if (!it) return
    const v = variationAt(it, age)
    for (const e of v.effects ?? []) {
      if (e.ids && !e.ids.some((x) => x === 'villager' || x === spec.worker)) continue
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
    for (const a of spec.landmarkAura ?? []) if (a.building === b.item) auras[a.res] = (auras[a.res] ?? 1) * a.mul
    if (spec.cistern && b.item === spec.cistern.id) auras.all = (auras.all ?? 1) * spec.cistern.mul
    if (b.ageTo) reachAge(b.ageTo, b.item)
    if (b.role !== 'camp' && b.role !== 'house') log('done', `${name(b.item)}完成`, b.item)
  }

  // ---------- 主迴圈 ----------
  const maxT = opts.bound
  let sampleNext = 0
  while (t < maxT) {
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
      if (x === farm ? x.workers < farmsBuilt : x.left > 0) x.workers++
      else free.push({ from: w.to })
    }

    act()
    if (free.length) assignFree()
    if (t - lastRebalance >= 8) rebalance()
    if (free.length) assignFree()

    // 採集
    gatherersCache = sites.reduce((n, x) => n + x.workers, 0)
    globalMul = workerMul() * inspireMul(gatherersCache) * goldenMul()
    for (const x of sites) {
      if (x.workers <= 0) continue
      if (x === farm && x.workers > farmsBuilt) x.workers = farmsBuilt
      let amt = effRate(x) * x.workers
      if (amt > x.left) amt = x.left
      x.left -= amt
      if (x.res === 'wood') x.chopped += amt
      bank[x.res] += amt
      incomeAcc[x.res] += amt
      for (const bp of spec.byproducts) if (bp.from === x.res) bank[bp.to] += amt * bp.ratio
      if ((x.s.kind === 'deer' || x.s.kind === 'boar' || x === sheep) && spec.huntGold) bank.gold += amt * spec.huntGold
      if (x.left <= 0 && x !== farm) {
        for (let k = 0; k < x.workers; k++) free.push({ from: x.s.id })
        x.workers = 0
        if (x !== sheep) log('deplete', `${x.s.label}採完`)
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

    // 生產佇列
    for (const b of blds) {
      const j = b.job
      if (!j || j.end > t) continue
      b.job = null
      if (j.kind === 'vill') {
        villagers += j.count
        if (j.item !== 'villager' && spec.workerGather !== 1) mounted += j.count
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
      } else {
        researching.delete(j.item)
        researched.add(j.item)
        applyTech(j.item)
        const st = j.step >= 0 ? steps[j.step] : null
        if (st?.kind === 'age') reachAge(st.age!, j.item)
        else log('done', `${name(j.item)}研究完成`, j.item)
      }
    }
    // 城鎮中心閒置（目標都完成前）
    if (villagers < 120) for (const b of blds) if (b.done && !b.job && (b.item === 'town-center' || b.item === 'capital-town-center')) tcIdle++

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
      })
    }
    if (allDone) break
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
  return {
    ok: Number.isFinite(finish),
    finish,
    score: (Number.isFinite(finish) ? finish : maxT * 3) + 0.05 * sumGoals + (opts.idleWeight ?? 0.5) * tcIdle,
    tcIdle,
    goals,
    steps,
    events,
    samples,
    ageTimes,
    villagers,
    warnings,
  }
}
